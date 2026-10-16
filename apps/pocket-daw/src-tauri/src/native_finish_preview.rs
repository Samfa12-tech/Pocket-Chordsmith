//! Owned, bounded preview files. Audio DSP uses the existing native renderer;
//! binary IPC goes only to the analysis worker, never JSON sample arrays.
use crate::native_audio::{
    render_finish_preview_on_worker, NativeAudioRenderedWav, NativeAudioStartPayload,
    NativeAudioState,
};
use serde::Serialize;
use std::collections::HashMap;
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

const MAX_PREVIEW_BYTES: u64 = 128 * 1024 * 1024;
static NEXT_PREVIEW: AtomicU64 = AtomicU64::new(0);

struct PreviewJob {
    path: PathBuf,
    cancelled: Arc<AtomicBool>,
    running: bool,
    ready: bool,
}

#[derive(Default)]
pub(crate) struct FinishPreviewState(Mutex<HashMap<String, PreviewJob>>);

impl Drop for FinishPreviewState {
    fn drop(&mut self) {
        if let Ok(jobs) = self.0.get_mut() {
            for job in jobs.values() {
                job.cancelled.store(true, Ordering::Relaxed);
                if job.ready {
                    let _ = std::fs::remove_file(&job.path);
                }
            }
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FinishPreviewFile {
    source_path: String,
    sample_rate: u32,
    channels: u16,
    duration_seconds: f64,
    size_bytes: usize,
}

#[tauri::command]
pub(crate) fn native_finish_preview_begin(
    app: tauri::AppHandle,
    state: tauri::State<'_, FinishPreviewState>,
) -> Result<String, String> {
    let mut jobs = state
        .0
        .lock()
        .map_err(|_| "Finish preview registry lock failed.")?;
    if jobs.len() >= 2 {
        return Err("Discard the current comparison before preparing another.".into());
    }
    let directory = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("finish-previews");
    std::fs::create_dir_all(&directory)
        .map_err(|e| format!("Could not create preview cache: {e}"))?;
    remove_abandoned_previews(&directory, &jobs)?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let id = format!(
        "{stamp:x}-{:x}",
        NEXT_PREVIEW.fetch_add(1, Ordering::Relaxed)
    );
    jobs.insert(
        id.clone(),
        PreviewJob {
            path: directory.join(format!("{id}.wav")),
            cancelled: Arc::new(AtomicBool::new(false)),
            running: false,
            ready: false,
        },
    );
    Ok(id)
}

fn remove_abandoned_previews(
    directory: &std::path::Path,
    jobs: &HashMap<String, PreviewJob>,
) -> Result<(), String> {
    for entry in
        std::fs::read_dir(directory).map_err(|e| format!("Could not inspect preview cache: {e}"))?
    {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if jobs.values().any(|job| job.path == path)
            || !entry.file_type().map_err(|e| e.to_string())?.is_file()
        {
            continue;
        }
        let name = entry.file_name();
        let Some((stamp, counter)) = name
            .to_str()
            .and_then(|name| name.strip_suffix(".wav"))
            .and_then(|name| name.split_once('-'))
        else {
            continue;
        };
        if (16..=32).contains(&stamp.len())
            && (1..=16).contains(&counter.len())
            && stamp
                .bytes()
                .chain(counter.bytes())
                .all(|byte| byte.is_ascii_hexdigit())
        {
            std::fs::remove_file(path)
                .map_err(|e| format!("Could not remove abandoned Finish preview: {e}"))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn native_finish_preview_prepare(
    id: String,
    payload: NativeAudioStartPayload,
    duration_seconds: f64,
    app: tauri::AppHandle,
) -> Result<FinishPreviewFile, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<FinishPreviewState>();
        let (path, cancelled) = {
            let mut jobs = state
                .0
                .lock()
                .map_err(|_| "Finish preview registry lock failed.")?;
            let job = jobs
                .get_mut(&id)
                .ok_or("Finish preparation cancelled or missing.")?;
            if job.running || job.ready {
                return Err("Finish preview request was already used.".into());
            }
            validate_preview_budget(duration_seconds, payload.sample_rate)?;
            job.running = true;
            (job.path.clone(), job.cancelled.clone())
        };
        let result = (|| {
            let audio = app.state::<NativeAudioState>();
            let rendered = render_finish_preview_on_worker(
                payload,
                duration_seconds,
                audio.inner(),
                &cancelled,
            )?;
            persist_preview(&path, rendered, &cancelled)
        })();
        let mut jobs = state
            .0
            .lock()
            .map_err(|_| "Finish preview registry lock failed.")?;
        if result.is_err() || cancelled.load(Ordering::Relaxed) {
            jobs.remove(&id);
            if result.is_ok() {
                let _ = std::fs::remove_file(&path);
            }
            return result.and(Err("Finish preparation cancelled.".into()));
        }
        let job = jobs.get_mut(&id).ok_or("Finish preparation cancelled.")?;
        job.running = false;
        job.ready = true;
        result
    })
    .await
    .map_err(|e| format!("Finish preparation worker failed: {e}"))?
}

fn persist_preview(
    path: &std::path::Path,
    rendered: NativeAudioRenderedWav,
    cancelled: &AtomicBool,
) -> Result<FinishPreviewFile, String> {
    if cancelled.load(Ordering::Relaxed) {
        return Err("Finish preparation cancelled.".into());
    }
    if rendered.size_bytes as u64 > MAX_PREVIEW_BYTES {
        return Err("Finish preview exceeds the 128 MiB file limit.".into());
    }
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|e| format!("Could not create preview file: {e}"))?;
    if let Err(error) = file.write_all(&rendered.bytes) {
        drop(file);
        let _ = std::fs::remove_file(path);
        return Err(format!("Could not write preview file: {error}"));
    }
    Ok(FinishPreviewFile {
        source_path: path.to_string_lossy().into(),
        sample_rate: rendered.sample_rate,
        channels: rendered.channels,
        duration_seconds: rendered.duration_seconds,
        size_bytes: rendered.size_bytes,
    })
}

fn validate_preview_budget(duration: f64, rate: u32) -> Result<(), String> {
    if !duration.is_finite()
        || duration <= 0.0
        || duration > 600.0
        || !(8_000..=192_000).contains(&rate)
        || (duration * rate as f64).ceil() * 8.0 + 44.0 > MAX_PREVIEW_BYTES as f64
    {
        return Err("Choose an earlier/shorter passage or a lower project sample rate: preview history is bounded to 600 seconds and 128 MiB per version.".into());
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn native_finish_preview_read(
    id: String,
    app: tauri::AppHandle,
) -> Result<tauri::ipc::Response, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<FinishPreviewState>();
        let (path, cancelled) = {
            let jobs = state
                .0
                .lock()
                .map_err(|_| "Finish preview registry lock failed.")?;
            let job = jobs
                .get(&id)
                .filter(|job| job.ready && !job.cancelled.load(Ordering::Relaxed))
                .ok_or("Finish preview is not ready.")?;
            (job.path.clone(), job.cancelled.clone())
        };
        if std::fs::metadata(&path).map_err(|e| e.to_string())?.len() > MAX_PREVIEW_BYTES {
            return Err("Finish preview file is too large.".into());
        }
        let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
        if cancelled.load(Ordering::Relaxed) {
            return Err("Finish preparation cancelled.".into());
        }
        Ok(tauri::ipc::Response::new(bytes))
    })
    .await
    .map_err(|e| format!("Finish preview read worker failed: {e}"))?
}

#[tauri::command]
pub(crate) fn native_finish_preview_discard(
    id: String,
    state: tauri::State<'_, FinishPreviewState>,
) -> Result<(), String> {
    let mut jobs = state
        .0
        .lock()
        .map_err(|_| "Finish preview registry lock failed.")?;
    if let Some(job) = jobs.get(&id) {
        job.cancelled.store(true, Ordering::Relaxed);
        if !job.running {
            let path = job.path.clone();
            let ready = job.ready;
            jobs.remove(&id);
            if !ready {
                return Ok(());
            }
            match std::fs::remove_file(path) {
                Ok(()) => (),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => (),
                Err(error) => return Err(format!("Could not remove Finish preview: {error}")),
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preview_budget_rejects_invalid_and_oversized_history_before_render() {
        for (duration, rate) in [
            (f64::NAN, 48000),
            (0.0, 48000),
            (601.0, 8000),
            (120.0, 192000),
            (10.0, 0),
        ] {
            assert!(validate_preview_budget(duration, rate).is_err());
        }
        assert!(validate_preview_budget(300.0, 48000).is_ok());
        assert!(validate_preview_budget(120.0, 96000).is_ok());
    }

    #[test]
    fn preview_persistence_preserves_binary_and_never_overwrites_an_existing_file() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("pocket-finish-owned-{stamp}"));
        std::fs::create_dir(&directory).unwrap();
        let path = directory.join("owned.wav");
        let rendered = || NativeAudioRenderedWav {
            sample_rate: 48000,
            channels: 2,
            duration_seconds: 1.0,
            size_bytes: 4,
            bytes: vec![0, 127, 128, 255],
        };
        let cancelled = AtomicBool::new(true);
        assert!(persist_preview(&path, rendered(), &cancelled).is_err());
        assert!(!path.exists());
        cancelled.store(false, Ordering::Relaxed);
        let file = persist_preview(&path, rendered(), &cancelled).unwrap();
        assert_eq!(file.size_bytes, 4);
        assert_eq!(std::fs::read(&path).unwrap(), vec![0, 127, 128, 255]);
        assert!(persist_preview(&path, rendered(), &cancelled).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), vec![0, 127, 128, 255]);
        let state = FinishPreviewState(Mutex::new(HashMap::from([(
            "owned".into(),
            PreviewJob {
                path: path.clone(),
                cancelled: Arc::new(AtomicBool::new(false)),
                running: false,
                ready: true,
            },
        )])));
        drop(state);
        assert!(!path.exists());
        std::fs::remove_dir(directory).unwrap();
    }

    #[test]
    fn cache_cleanup_removes_only_abandoned_preview_files_and_keeps_active_or_unrelated_entries() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("pocket-finish-cleanup-{stamp}"));
        std::fs::create_dir(&directory).unwrap();
        let old = directory.join("deadbeef12345678-0.wav");
        let active = directory.join("deadbeef12345678-1.wav");
        let unrelated = directory.join("user-reference.wav");
        for path in [&old, &active, &unrelated] {
            std::fs::write(path, [1, 2, 3]).unwrap();
        }
        let jobs = HashMap::from([(
            "active".into(),
            PreviewJob {
                path: active.clone(),
                cancelled: Arc::new(AtomicBool::new(false)),
                running: true,
                ready: false,
            },
        )]);
        remove_abandoned_previews(&directory, &jobs).unwrap();
        assert!(!old.exists());
        assert!(active.exists());
        assert!(unrelated.exists());
        std::fs::remove_file(active).unwrap();
        std::fs::remove_file(unrelated).unwrap();
        std::fs::remove_dir(directory).unwrap();
    }
}
