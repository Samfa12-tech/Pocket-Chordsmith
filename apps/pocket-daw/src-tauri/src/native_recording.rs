use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

type NativeRecordingState = Mutex<NativeRecordingRuntime>;

#[derive(Default)]
pub struct NativeRecordingRuntime {
    input_stream: Option<cpal::Stream>,
    monitor_stream: Option<cpal::Stream>,
    shared: Option<Arc<Mutex<RecordingShared>>>,
    started_at: Option<Instant>,
    target_path: Option<PathBuf>,
    target_relative_path: Option<String>,
    file_name: Option<String>,
    track_id: Option<String>,
    input_device_name: Option<String>,
    output_device_name: Option<String>,
    last_error: Option<String>,
}

pub fn create_native_recording_runtime() -> NativeRecordingState {
    Mutex::new(NativeRecordingRuntime::default())
}

#[derive(Clone, Deserialize)]
pub struct NativeRecordingStartPayload {
    #[serde(rename = "projectFilePath")]
    project_file_path: String,
    #[serde(rename = "projectTitle")]
    project_title: String,
    #[serde(rename = "trackId")]
    track_id: String,
    #[serde(rename = "trackName")]
    track_name: String,
    #[serde(rename = "inputDeviceId")]
    input_device_id: Option<String>,
    #[serde(rename = "outputDeviceId")]
    output_device_id: Option<String>,
    #[serde(rename = "monitorEnabled")]
    monitor_enabled: bool,
    #[serde(rename = "monitorVolume")]
    monitor_volume: f64,
    #[serde(rename = "monitorPan")]
    monitor_pan: f64,
    #[serde(rename = "startBar")]
    _start_bar: f64,
    #[serde(rename = "sampleRate")]
    _sample_rate: u32,
}

#[derive(Clone, Serialize)]
pub struct NativeRecordingStatus {
    backend: String,
    available: bool,
    active: bool,
    monitoring: bool,
    #[serde(rename = "trackId")]
    track_id: Option<String>,
    #[serde(rename = "elapsedSeconds")]
    elapsed_seconds: f64,
    #[serde(rename = "sampleRate")]
    sample_rate: u32,
    #[serde(rename = "inputDeviceName")]
    input_device_name: Option<String>,
    #[serde(rename = "outputDeviceName")]
    output_device_name: Option<String>,
    peak: f32,
    #[serde(rename = "sampleCount")]
    sample_count: usize,
    #[serde(rename = "lastError")]
    last_error: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct NativeRecordingStopResult {
    #[serde(rename = "trackId")]
    track_id: String,
    #[serde(rename = "targetPath")]
    target_path: String,
    #[serde(rename = "targetRelativePath")]
    target_relative_path: String,
    #[serde(rename = "fileName")]
    file_name: String,
    #[serde(rename = "durationSeconds")]
    duration_seconds: f64,
    #[serde(rename = "sampleRate")]
    sample_rate: u32,
    channels: u16,
    #[serde(rename = "sizeBytes")]
    size_bytes: u64,
    peak: f32,
}

struct RecordingShared {
    samples: Vec<f32>,
    monitor_samples: VecDeque<f32>,
    sample_rate: u32,
    monitor_enabled: bool,
    monitor_gain: f32,
    monitor_pan: f32,
    peak: f32,
}

#[tauri::command]
pub fn native_recording_status(
    state: tauri::State<'_, NativeRecordingState>,
) -> NativeRecordingStatus {
    match state.lock() {
        Ok(runtime) => runtime_status(&runtime),
        Err(_) => NativeRecordingStatus {
            backend: "native-cpal".to_string(),
            available: true,
            active: false,
            monitoring: false,
            track_id: None,
            elapsed_seconds: 0.0,
            sample_rate: 0,
            input_device_name: None,
            output_device_name: None,
            peak: 0.0,
            sample_count: 0,
            last_error: Some("Native recording state is unavailable.".to_string()),
        },
    }
}

#[tauri::command]
pub fn native_recording_start(
    payload: NativeRecordingStartPayload,
    state: tauri::State<'_, NativeRecordingState>,
) -> Result<NativeRecordingStatus, String> {
    let mut runtime = state
        .lock()
        .map_err(|_| "Native recording state is unavailable.".to_string())?;
    if runtime.input_stream.is_some() {
        return Err("A recording is already active. Stop it before starting another take.".to_string());
    }
    if payload.project_file_path.trim().is_empty() {
        return Err("Save the .pocketdaw project before recording so audio can be stored under project-media/recordings.".to_string());
    }

    let host = preferred_host();
    let input = select_input_device(&host, payload.input_device_id.as_deref())
        .ok_or_else(|| "No input device is available for live recording. Refresh Audio Settings and choose an input.".to_string())?;
    let input_device_name = device_name(&input).unwrap_or_else(|_| "Input device".to_string());
    let config = input
        .default_input_config()
        .map_err(|err| format!("Could not use the selected input device for recording: {err}"))?;
    let sample_rate = config.sample_rate();
    let input_channels = config.channels().max(1) as usize;
    let stream_config: cpal::StreamConfig = config.clone().into();
    let (target_path, target_relative_path, file_name) =
        recording_output_path(&payload.project_file_path, &payload.project_title, &payload.track_name)?;
    let shared = Arc::new(Mutex::new(RecordingShared {
        samples: Vec::new(),
        monitor_samples: VecDeque::with_capacity(sample_rate as usize),
        sample_rate,
        monitor_enabled: payload.monitor_enabled,
        monitor_gain: payload.monitor_volume.clamp(0.0, 1.2) as f32,
        monitor_pan: payload.monitor_pan.clamp(-1.0, 1.0) as f32,
        peak: 0.0,
    }));
    let err_shared = Arc::clone(&shared);
    let error_callback = move |err| {
        if let Ok(mut shared) = err_shared.lock() {
            shared.monitor_enabled = false;
        }
        eprintln!("Pocket DAW recording stream error: {err}");
    };
    let input_stream = match config.sample_format() {
        cpal::SampleFormat::F32 => {
            let shared = Arc::clone(&shared);
            input.build_input_stream(
                &stream_config,
                move |data: &[f32], _| capture_f32(data, input_channels, &shared),
                error_callback,
                None,
            )
        }
        cpal::SampleFormat::I16 => {
            let shared = Arc::clone(&shared);
            input.build_input_stream(
                &stream_config,
                move |data: &[i16], _| capture_i16(data, input_channels, &shared),
                error_callback,
                None,
            )
        }
        cpal::SampleFormat::U16 => {
            let shared = Arc::clone(&shared);
            input.build_input_stream(
                &stream_config,
                move |data: &[u16], _| capture_u16(data, input_channels, &shared),
                error_callback,
                None,
            )
        }
        other => {
            return Err(format!(
                "Input device uses unsupported sample format {other:?}; Pocket DAW recording alpha supports f32/i16/u16 PCM input."
            ));
        }
    }
    .map_err(|err| format!("Could not start the input recording stream: {err}"))?;

    let mut output_device_name = None;
    let monitor_stream = if payload.monitor_enabled {
        let output = select_output_device(&host, payload.output_device_id.as_deref())
            .ok_or_else(|| "Input monitor was enabled, but no output device is available.".to_string())?;
        output_device_name = Some(device_name(&output).unwrap_or_else(|_| "Output device".to_string()));
        Some(build_monitor_stream(&output, Arc::clone(&shared))?)
    } else {
        None
    };

    input_stream
        .play()
        .map_err(|err| format!("Could not start recording input stream: {err}"))?;
    if let Some(stream) = monitor_stream.as_ref() {
        stream
            .play()
            .map_err(|err| format!("Could not start input monitoring stream: {err}"))?;
    }

    runtime.input_stream = Some(input_stream);
    runtime.monitor_stream = monitor_stream;
    runtime.shared = Some(shared);
    runtime.started_at = Some(Instant::now());
    runtime.target_path = Some(target_path);
    runtime.target_relative_path = Some(target_relative_path);
    runtime.file_name = Some(file_name);
    runtime.track_id = Some(payload.track_id);
    runtime.input_device_name = Some(input_device_name);
    runtime.output_device_name = output_device_name;
    runtime.last_error = None;
    Ok(runtime_status(&runtime))
}

#[tauri::command]
pub fn native_recording_stop(
    state: tauri::State<'_, NativeRecordingState>,
) -> Result<NativeRecordingStopResult, String> {
    let mut runtime = state
        .lock()
        .map_err(|_| "Native recording state is unavailable.".to_string())?;
    let Some(shared) = runtime.shared.take() else {
        return Err("No active recording to stop.".to_string());
    };
    runtime.input_stream.take();
    runtime.monitor_stream.take();
    let target_path = runtime
        .target_path
        .take()
        .ok_or_else(|| "Recording target path was not prepared.".to_string())?;
    let target_relative_path = runtime
        .target_relative_path
        .take()
        .ok_or_else(|| "Recording target relative path was not prepared.".to_string())?;
    let file_name = runtime
        .file_name
        .take()
        .ok_or_else(|| "Recording file name was not prepared.".to_string())?;
    let track_id = runtime
        .track_id
        .take()
        .ok_or_else(|| "Recording track id was not prepared.".to_string())?;
    let (samples, sample_rate, peak) = {
        let shared = shared
            .lock()
            .map_err(|_| "Could not finalize recorded audio because the native buffer is unavailable.".to_string())?;
        (shared.samples.clone(), shared.sample_rate, shared.peak)
    };
    let duration_seconds = if sample_rate > 0 {
        samples.len() as f64 / sample_rate as f64
    } else {
        0.0
    };
    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("Could not create project-media/recordings folder: {err}"))?;
    }
    let bytes = pcm16_mono_wav(sample_rate, &samples);
    fs::write(&target_path, &bytes)
        .map_err(|err| format!("Could not write recorded WAV file: {err}"))?;
    let size_bytes = fs::metadata(&target_path)
        .map(|metadata| metadata.len())
        .unwrap_or(bytes.len() as u64);
    runtime.started_at = None;
    runtime.input_device_name = None;
    runtime.output_device_name = None;
    runtime.last_error = None;
    Ok(NativeRecordingStopResult {
        track_id,
        target_path: target_path.to_string_lossy().to_string(),
        target_relative_path,
        file_name,
        duration_seconds,
        sample_rate,
        channels: 1,
        size_bytes,
        peak,
    })
}

fn runtime_status(runtime: &NativeRecordingRuntime) -> NativeRecordingStatus {
    let elapsed_seconds = runtime
        .started_at
        .map(|started| started.elapsed().as_secs_f64())
        .unwrap_or(0.0);
    let (monitoring, sample_rate, peak, sample_count) = runtime
        .shared
        .as_ref()
        .and_then(|shared| shared.lock().ok().map(|shared| (shared.monitor_enabled, shared.sample_rate, shared.peak, shared.samples.len())))
        .unwrap_or((false, 0, 0.0, 0));
    NativeRecordingStatus {
        backend: "native-cpal".to_string(),
        available: true,
        active: runtime.input_stream.is_some(),
        monitoring,
        track_id: runtime.track_id.clone(),
        elapsed_seconds,
        sample_rate,
        input_device_name: runtime.input_device_name.clone(),
        output_device_name: runtime.output_device_name.clone(),
        peak,
        sample_count,
        last_error: runtime.last_error.clone(),
    }
}

fn capture_f32(data: &[f32], channels: usize, shared: &Arc<Mutex<RecordingShared>>) {
    capture_samples(data.chunks(channels).map(|frame| *frame.first().unwrap_or(&0.0)), shared);
}

fn capture_i16(data: &[i16], channels: usize, shared: &Arc<Mutex<RecordingShared>>) {
    capture_samples(
        data.chunks(channels)
            .map(|frame| *frame.first().unwrap_or(&0) as f32 / i16::MAX as f32),
        shared,
    );
}

fn capture_u16(data: &[u16], channels: usize, shared: &Arc<Mutex<RecordingShared>>) {
    capture_samples(
        data.chunks(channels)
            .map(|frame| (*frame.first().unwrap_or(&(u16::MAX / 2)) as f32 / u16::MAX as f32) * 2.0 - 1.0),
        shared,
    );
}

fn capture_samples<I>(samples: I, shared: &Arc<Mutex<RecordingShared>>)
where
    I: Iterator<Item = f32>,
{
    if let Ok(mut shared) = shared.lock() {
        let mut monitor_pushes = 0usize;
        for sample in samples {
            let mono = sample.clamp(-1.0, 1.0);
            shared.peak = shared.peak.max(mono.abs());
            shared.samples.push(mono);
            if shared.monitor_enabled && monitor_pushes < 8192 {
                shared.monitor_samples.push_back(mono);
                monitor_pushes += 1;
            }
        }
        let max_monitor = shared.sample_rate as usize * 2;
        while shared.monitor_samples.len() > max_monitor {
            shared.monitor_samples.pop_front();
        }
    }
}

fn build_monitor_stream(
    output: &cpal::Device,
    shared: Arc<Mutex<RecordingShared>>,
) -> Result<cpal::Stream, String> {
    let config = output
        .default_output_config()
        .map_err(|err| format!("Could not use the selected output device for monitoring: {err}"))?;
    let channels = config.channels().max(1) as usize;
    let stream_config: cpal::StreamConfig = config.clone().into();
    let err_callback = |err| eprintln!("Pocket DAW input monitor stream error: {err}");
    match config.sample_format() {
        cpal::SampleFormat::F32 => output.build_output_stream(
            &stream_config,
            move |data: &mut [f32], _| write_monitor_f32(data, channels, &shared),
            err_callback,
            None,
        ),
        cpal::SampleFormat::I16 => output.build_output_stream(
            &stream_config,
            move |data: &mut [i16], _| write_monitor_i16(data, channels, &shared),
            err_callback,
            None,
        ),
        cpal::SampleFormat::U16 => output.build_output_stream(
            &stream_config,
            move |data: &mut [u16], _| write_monitor_u16(data, channels, &shared),
            err_callback,
            None,
        ),
        other => {
            return Err(format!(
                "Output device uses unsupported sample format {other:?}; input monitoring supports f32/i16/u16 PCM output."
            ));
        }
    }
    .map_err(|err| format!("Could not create input monitoring stream: {err}"))
}

fn write_monitor_f32(data: &mut [f32], channels: usize, shared: &Arc<Mutex<RecordingShared>>) {
    for frame in data.chunks_mut(channels) {
        let (left, right) = next_monitor_frame(shared);
        write_frame_f32(frame, left, right);
    }
}

fn write_monitor_i16(data: &mut [i16], channels: usize, shared: &Arc<Mutex<RecordingShared>>) {
    for frame in data.chunks_mut(channels) {
        let (left, right) = next_monitor_frame(shared);
        write_frame_i16(frame, left, right);
    }
}

fn write_monitor_u16(data: &mut [u16], channels: usize, shared: &Arc<Mutex<RecordingShared>>) {
    for frame in data.chunks_mut(channels) {
        let (left, right) = next_monitor_frame(shared);
        write_frame_u16(frame, left, right);
    }
}

fn next_monitor_frame(shared: &Arc<Mutex<RecordingShared>>) -> (f32, f32) {
    let Ok(mut shared) = shared.lock() else {
        return (0.0, 0.0);
    };
    if !shared.monitor_enabled {
        return (0.0, 0.0);
    }
    let sample = shared.monitor_samples.pop_front().unwrap_or(0.0) * shared.monitor_gain;
    let (left, right) = pan_gains(shared.monitor_pan);
    (sample * left, sample * right)
}

fn write_frame_f32(frame: &mut [f32], left: f32, right: f32) {
    if let Some(sample) = frame.get_mut(0) {
        *sample = left.clamp(-1.0, 1.0);
    }
    if frame.len() > 1 {
        frame[1] = right.clamp(-1.0, 1.0);
    }
    for sample in frame.iter_mut().skip(2) {
        *sample = ((left + right) * 0.5).clamp(-1.0, 1.0);
    }
}

fn write_frame_i16(frame: &mut [i16], left: f32, right: f32) {
    if let Some(sample) = frame.get_mut(0) {
        *sample = f32_to_i16(left);
    }
    if frame.len() > 1 {
        frame[1] = f32_to_i16(right);
    }
    for sample in frame.iter_mut().skip(2) {
        *sample = f32_to_i16((left + right) * 0.5);
    }
}

fn write_frame_u16(frame: &mut [u16], left: f32, right: f32) {
    if let Some(sample) = frame.get_mut(0) {
        *sample = f32_to_u16(left);
    }
    if frame.len() > 1 {
        frame[1] = f32_to_u16(right);
    }
    for sample in frame.iter_mut().skip(2) {
        *sample = f32_to_u16((left + right) * 0.5);
    }
}

fn pan_gains(pan: f32) -> (f32, f32) {
    let left = if pan > 0.0 { 1.0 - pan } else { 1.0 };
    let right = if pan < 0.0 { 1.0 + pan } else { 1.0 };
    (left, right)
}

fn f32_to_i16(value: f32) -> i16 {
    (value.clamp(-1.0, 1.0) * i16::MAX as f32) as i16
}

fn f32_to_u16(value: f32) -> u16 {
    (((value.clamp(-1.0, 1.0) * 0.5 + 0.5) * u16::MAX as f32).round() as i32)
        .clamp(0, u16::MAX as i32) as u16
}

fn preferred_host() -> cpal::Host {
    let host_id = cpal::available_hosts()
        .into_iter()
        .find(|id| format!("{:?}", id).eq_ignore_ascii_case("Wasapi"))
        .unwrap_or(cpal::default_host().id());
    cpal::host_from_id(host_id).unwrap_or_else(|_| cpal::default_host())
}

fn select_input_device(host: &cpal::Host, requested_id: Option<&str>) -> Option<cpal::Device> {
    if let Some(requested) = requested_id.filter(|value| !value.trim().is_empty()) {
        if let Ok(devices) = host.input_devices() {
            for (index, device) in devices.enumerate() {
                let name = device_name(&device).unwrap_or_else(|_| format!("Input {}", index + 1));
                if device_id(host, "input", &name) == requested {
                    return Some(device);
                }
            }
        }
    }
    host.default_input_device()
}

fn select_output_device(host: &cpal::Host, requested_id: Option<&str>) -> Option<cpal::Device> {
    if let Some(requested) = requested_id.filter(|value| !value.trim().is_empty()) {
        if let Ok(devices) = host.output_devices() {
            for (index, device) in devices.enumerate() {
                let name = device_name(&device).unwrap_or_else(|_| format!("Output {}", index + 1));
                if device_id(host, "output", &name) == requested {
                    return Some(device);
                }
            }
        }
    }
    host.default_output_device()
}

fn device_id(host: &cpal::Host, kind: &str, name: &str) -> String {
    format!(
        "{}:{}:{}",
        format!("{:?}", host.id()).to_lowercase(),
        kind,
        sanitize_id(name)
    )
}

fn device_name(device: &cpal::Device) -> Result<String, cpal::DeviceNameError> {
    device
        .description()
        .map(|description| description.name().to_string())
}

fn recording_output_path(
    project_file_path: &str,
    project_title: &str,
    track_name: &str,
) -> Result<(PathBuf, String, String), String> {
    let project_path = PathBuf::from(project_file_path);
    if !project_path.is_absolute() {
        return Err("Project file path must be absolute before recording.".to_string());
    }
    let project_dir = project_path
        .parent()
        .ok_or_else(|| "Project file must be saved in a folder before recording.".to_string())?;
    let recordings_dir = project_dir.join("project-media").join("recordings");
    ensure_child_path(project_dir, &recordings_dir)?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis())
        .unwrap_or(0);
    let title = sanitize_file_stem(project_title);
    let track = sanitize_file_stem(track_name);
    let file_name = format!("{title}-{track}-{stamp}.wav");
    let target_path = recordings_dir.join(&file_name);
    ensure_child_path(&recordings_dir, &target_path)?;
    let relative = format!("project-media/recordings/{file_name}");
    Ok((target_path, relative, file_name))
}

fn ensure_child_path(parent: &Path, child: &Path) -> Result<(), String> {
    let parent_components: Vec<_> = parent.components().collect();
    let child_components: Vec<_> = child.components().collect();
    if child_components.len() < parent_components.len() {
        return Err("Recording target path is outside the saved project folder.".to_string());
    }
    if child_components
        .iter()
        .zip(parent_components.iter())
        .all(|(child, parent)| child == parent)
    {
        Ok(())
    } else {
        Err("Recording target path is outside the saved project folder.".to_string())
    }
}

fn sanitize_file_stem(value: &str) -> String {
    let safe = value
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch.to_ascii_lowercase() } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    safe.chars().take(36).collect::<String>().trim_matches('-').to_string()
        .if_empty("take")
}

trait IfEmpty {
    fn if_empty(self, fallback: &str) -> String;
}

impl IfEmpty for String {
    fn if_empty(self, fallback: &str) -> String {
        if self.is_empty() {
            fallback.to_string()
        } else {
            self
        }
    }
}

fn sanitize_id(value: &str) -> String {
    value
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch.to_ascii_lowercase() } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

fn pcm16_mono_wav(sample_rate: u32, samples: &[f32]) -> Vec<u8> {
    let sample_rate = sample_rate.max(1);
    let data_len = samples.len() as u32 * 2;
    let riff_len = 36u32.saturating_add(data_len);
    let mut bytes = Vec::with_capacity(44 + samples.len() * 2);
    bytes.extend_from_slice(b"RIFF");
    bytes.extend_from_slice(&riff_len.to_le_bytes());
    bytes.extend_from_slice(b"WAVE");
    bytes.extend_from_slice(b"fmt ");
    bytes.extend_from_slice(&16u32.to_le_bytes());
    bytes.extend_from_slice(&1u16.to_le_bytes());
    bytes.extend_from_slice(&1u16.to_le_bytes());
    bytes.extend_from_slice(&sample_rate.to_le_bytes());
    bytes.extend_from_slice(&(sample_rate * 2).to_le_bytes());
    bytes.extend_from_slice(&2u16.to_le_bytes());
    bytes.extend_from_slice(&16u16.to_le_bytes());
    bytes.extend_from_slice(b"data");
    bytes.extend_from_slice(&data_len.to_le_bytes());
    for sample in samples {
        bytes.extend_from_slice(&f32_to_i16(*sample).to_le_bytes());
    }
    bytes
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_pcm16_mono_wav_header_and_samples() {
        let bytes = pcm16_mono_wav(48_000, &[0.0, 1.0, -1.0]);
        assert_eq!(&bytes[0..4], b"RIFF");
        assert_eq!(&bytes[8..12], b"WAVE");
        assert_eq!(u16::from_le_bytes([bytes[22], bytes[23]]), 1);
        assert_eq!(u32::from_le_bytes([bytes[24], bytes[25], bytes[26], bytes[27]]), 48_000);
        assert_eq!(u16::from_le_bytes([bytes[34], bytes[35]]), 16);
        assert_eq!(u32::from_le_bytes([bytes[40], bytes[41], bytes[42], bytes[43]]), 6);
    }

    #[test]
    fn creates_recording_path_under_project_media_recordings() {
        let (path, relative, file_name) = recording_output_path(
            r"C:\Songs\Example.pocketdaw",
            "My Song",
            "Live Vocals",
        )
        .expect("path should be valid");
        let normalized = path.to_string_lossy().replace('\\', "/");
        assert!(normalized.contains("/project-media/recordings/"));
        assert!(file_name.ends_with(".wav"));
        assert!(relative.starts_with("project-media/recordings/"));
    }

    #[test]
    fn rejects_projectless_recording_path() {
        assert!(recording_output_path("Song.pocketdaw", "Song", "Track").is_err());
    }
}
