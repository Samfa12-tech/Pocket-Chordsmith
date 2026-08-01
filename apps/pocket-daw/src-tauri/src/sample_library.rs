use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::Manager;

const SUPPORTED_SAMPLE_EXTENSIONS: [&str; 6] = ["wav", "mp3", "ogg", "flac", "aiff", "aif"];
const MAX_SAMPLE_FILE_BYTES: u64 = 250 * 1024 * 1024;
const MAX_SAMPLE_LIBRARY_STATE_BYTES: usize = 5 * 1024 * 1024;
const MAX_DISCOVERED_SAMPLE_FILES: usize = 20_000;
const MAX_DISCOVERY_DEPTH: usize = 24;
const SAMPLE_LIBRARY_STATE_FILE: &str = "sample-library-v1.json";
const STARTER_SOUNDS_RESOURCE_FOLDER: &str = "samples/pocket-starter-sounds";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SampleLibraryFilePayload {
    path: String,
    name: String,
    folder_path: String,
    extension: String,
    size_bytes: u64,
    modified_unix_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SampleLibraryDiscoveryPayload {
    root_path: Option<String>,
    root_label: Option<String>,
    files: Vec<SampleLibraryFilePayload>,
    warnings: Vec<String>,
    truncated: bool,
}

#[tauri::command]
pub fn sample_library_select_files() -> Result<Option<SampleLibraryDiscoveryPayload>, String> {
    let selected = rfd::FileDialog::new()
        .add_filter("Audio samples", &SUPPORTED_SAMPLE_EXTENSIONS)
        .pick_files();
    let Some(paths) = selected else {
        return Ok(None);
    };
    let mut discovery = SampleLibraryDiscoveryPayload {
        root_path: None,
        root_label: None,
        files: Vec::new(),
        warnings: Vec::new(),
        truncated: false,
    };
    for path in paths {
        match sample_file_payload(&path) {
            Ok(Some(file)) => discovery.files.push(file),
            Ok(None) => discovery.warnings.push(format!(
                "Skipped unsupported sample: {}",
                display_name(&path)
            )),
            Err(error) => discovery.warnings.push(error),
        }
    }
    discovery.files.sort_by(|left, right| {
        left.path
            .to_ascii_lowercase()
            .cmp(&right.path.to_ascii_lowercase())
    });
    discovery
        .files
        .dedup_by(|left, right| left.path.eq_ignore_ascii_case(&right.path));
    Ok(Some(discovery))
}

#[tauri::command]
pub fn sample_library_select_folder() -> Result<Option<SampleLibraryDiscoveryPayload>, String> {
    let Some(path) = rfd::FileDialog::new().pick_folder() else {
        return Ok(None);
    };
    scan_sample_folder(&path).map(Some)
}

#[tauri::command]
pub fn sample_library_scan_folder(path: String) -> Result<SampleLibraryDiscoveryPayload, String> {
    scan_sample_folder(&PathBuf::from(path))
}

#[tauri::command]
pub fn sample_library_scan_paths(
    paths: Vec<String>,
) -> Result<SampleLibraryDiscoveryPayload, String> {
    if paths.len() == 1 {
        let only = PathBuf::from(&paths[0]);
        if only.is_dir() {
            return scan_sample_folder(&only);
        }
    }
    let mut result = SampleLibraryDiscoveryPayload {
        root_path: None,
        root_label: None,
        files: Vec::new(),
        warnings: Vec::new(),
        truncated: false,
    };
    for raw_path in paths.into_iter().take(512) {
        let path = PathBuf::from(raw_path);
        if path.is_dir() {
            match scan_sample_folder(&path) {
                Ok(mut nested) => {
                    result.files.append(&mut nested.files);
                    result.warnings.append(&mut nested.warnings);
                    result.truncated |= nested.truncated;
                }
                Err(error) => result.warnings.push(error),
            }
        } else {
            match sample_file_payload(&path) {
                Ok(Some(file)) => result.files.push(file),
                Ok(None) => result
                    .warnings
                    .push(format!("Skipped unsupported file: {}", display_name(&path))),
                Err(error) => result.warnings.push(error),
            }
        }
        if result.files.len() >= MAX_DISCOVERED_SAMPLE_FILES {
            result.files.truncate(MAX_DISCOVERED_SAMPLE_FILES);
            result.truncated = true;
            break;
        }
    }
    result.files.sort_by(|left, right| {
        left.path
            .to_ascii_lowercase()
            .cmp(&right.path.to_ascii_lowercase())
    });
    result
        .files
        .dedup_by(|left, right| left.path.eq_ignore_ascii_case(&right.path));
    Ok(result)
}

#[tauri::command]
pub fn sample_library_starter_sounds(
    app: tauri::AppHandle,
) -> Result<SampleLibraryDiscoveryPayload, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| format!("Could not locate Pocket DAW resources: {error}"))?;
    let root = resource_dir.join(STARTER_SOUNDS_RESOURCE_FOLDER);
    if !root.is_dir() {
        return Ok(SampleLibraryDiscoveryPayload {
            root_path: Some(root.to_string_lossy().to_string()),
            root_label: Some("Pocket Starter Sounds".to_string()),
            files: Vec::new(),
            warnings: vec![
                "Pocket Starter Sounds are unavailable in this installation.".to_string(),
            ],
            truncated: false,
        });
    }
    let mut result = scan_sample_folder(&root)?;
    result.root_label = Some("Pocket Starter Sounds".to_string());
    Ok(result)
}

#[tauri::command]
pub fn sample_library_load_state(app: tauri::AppHandle) -> Result<Option<Value>, String> {
    let path = sample_library_state_path(&app)?;
    let bytes = match std::fs::read(&path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("Could not read the local sample library: {error}")),
    };
    if bytes.len() > MAX_SAMPLE_LIBRARY_STATE_BYTES {
        return Err("The local sample-library index is too large to load safely.".to_string());
    }
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|error| format!("The local sample-library index is invalid: {error}"))
}

#[tauri::command]
pub fn sample_library_save_state(app: tauri::AppHandle, state: Value) -> Result<(), String> {
    if !state.is_object() {
        return Err("The local sample-library index must be a JSON object.".to_string());
    }
    let bytes = serde_json::to_vec(&state)
        .map_err(|error| format!("Could not encode the local sample-library index: {error}"))?;
    if bytes.len() > MAX_SAMPLE_LIBRARY_STATE_BYTES {
        return Err("The local sample-library index is too large to save safely.".to_string());
    }
    let path = sample_library_state_path(&app)?;
    let parent = path
        .parent()
        .ok_or_else(|| "The sample-library app-data path has no parent folder.".to_string())?;
    std::fs::create_dir_all(parent)
        .map_err(|error| format!("Could not create the sample-library app-data folder: {error}"))?;
    let temporary = path.with_extension("json.tmp");
    std::fs::write(&temporary, bytes)
        .map_err(|error| format!("Could not write the local sample-library index: {error}"))?;
    replace_file(&temporary, &path)
}

fn sample_library_state_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|folder| folder.join(SAMPLE_LIBRARY_STATE_FILE))
        .map_err(|error| format!("Could not locate Pocket DAW app data: {error}"))
}

fn replace_file(temporary: &Path, target: &Path) -> Result<(), String> {
    if !target.exists() {
        return std::fs::rename(temporary, target).map_err(|error| {
            format!("Could not finish saving the local sample-library index: {error}")
        });
    }
    let backup = target.with_extension("json.previous");
    if backup.exists() {
        std::fs::remove_file(&backup).map_err(|error| {
            format!("Could not replace the previous sample-library backup: {error}")
        })?;
    }
    std::fs::rename(target, &backup)
        .map_err(|error| format!("Could not stage the previous sample-library index: {error}"))?;
    if let Err(error) = std::fs::rename(temporary, target) {
        let _ = std::fs::rename(&backup, target);
        return Err(format!(
            "Could not finish saving the local sample-library index: {error}"
        ));
    }
    let _ = std::fs::remove_file(backup);
    Ok(())
}

fn scan_sample_folder(path: &Path) -> Result<SampleLibraryDiscoveryPayload, String> {
    let root = path
        .canonicalize()
        .map_err(|error| format!("Could not open sample folder {}: {error}", path.display()))?;
    if !root.is_dir() {
        return Err(format!(
            "Sample-library path is not a folder: {}",
            root.display()
        ));
    }
    let mut result = SampleLibraryDiscoveryPayload {
        root_path: Some(root.to_string_lossy().to_string()),
        root_label: Some(display_name(&root)),
        files: Vec::new(),
        warnings: Vec::new(),
        truncated: false,
    };
    let mut pending = vec![(root, 0usize)];
    while let Some((folder, depth)) = pending.pop() {
        if result.files.len() >= MAX_DISCOVERED_SAMPLE_FILES {
            result.truncated = true;
            break;
        }
        let children = match std::fs::read_dir(&folder) {
            Ok(children) => children,
            Err(error) => {
                result
                    .warnings
                    .push(format!("Could not scan {}: {error}", folder.display()));
                continue;
            }
        };
        for child in children {
            let child = match child {
                Ok(child) => child,
                Err(error) => {
                    result
                        .warnings
                        .push(format!("Could not read a sample-folder entry: {error}"));
                    continue;
                }
            };
            let file_type = match child.file_type() {
                Ok(file_type) => file_type,
                Err(error) => {
                    result.warnings.push(format!(
                        "Could not inspect {}: {error}",
                        child.path().display()
                    ));
                    continue;
                }
            };
            if file_type.is_symlink() {
                continue;
            }
            if file_type.is_dir() {
                if depth < MAX_DISCOVERY_DEPTH {
                    pending.push((child.path(), depth + 1));
                } else {
                    result.warnings.push(format!(
                        "Skipped deeply nested sample folder: {}",
                        child.path().display()
                    ));
                }
                continue;
            }
            if !file_type.is_file() || !is_supported_sample_path(&child.path()) {
                continue;
            }
            match sample_file_payload(&child.path()) {
                Ok(Some(file)) => result.files.push(file),
                Ok(None) => {}
                Err(error) => result.warnings.push(error),
            }
            if result.files.len() >= MAX_DISCOVERED_SAMPLE_FILES {
                result.truncated = true;
                break;
            }
        }
    }
    result.files.sort_by(|left, right| {
        left.path
            .to_ascii_lowercase()
            .cmp(&right.path.to_ascii_lowercase())
    });
    Ok(result)
}

fn sample_file_payload(path: &Path) -> Result<Option<SampleLibraryFilePayload>, String> {
    let Some(extension) = supported_sample_extension(path) else {
        return Ok(None);
    };
    let metadata = std::fs::metadata(path)
        .map_err(|error| format!("Could not inspect sample {}: {error}", path.display()))?;
    if metadata.len() > MAX_SAMPLE_FILE_BYTES {
        return Err(format!(
            "Skipped sample larger than 250 MiB: {}",
            display_name(path)
        ));
    }
    let modified_unix_ms = metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .and_then(|duration| u64::try_from(duration.as_millis()).ok());
    Ok(Some(SampleLibraryFilePayload {
        path: path.to_string_lossy().to_string(),
        name: display_name(path),
        folder_path: path
            .parent()
            .map(|parent| parent.to_string_lossy().to_string())
            .unwrap_or_default(),
        extension: extension.to_string(),
        size_bytes: metadata.len(),
        modified_unix_ms,
    }))
}

fn is_supported_sample_path(path: &Path) -> bool {
    supported_sample_extension(path).is_some()
}

fn supported_sample_extension(path: &Path) -> Option<&str> {
    let extension = path.extension()?.to_str()?;
    SUPPORTED_SAMPLE_EXTENSIONS
        .iter()
        .copied()
        .find(|supported| extension.eq_ignore_ascii_case(supported))
}

fn display_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().to_string())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| path.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn supported_sample_extensions_are_case_insensitive() {
        assert_eq!(
            supported_sample_extension(Path::new("Kick.WAV")),
            Some("wav")
        );
        assert_eq!(
            supported_sample_extension(Path::new("Pad.aiff")),
            Some("aiff")
        );
        assert_eq!(supported_sample_extension(Path::new("notes.txt")), None);
    }

    #[test]
    fn folder_scan_is_recursive_filtered_and_sorted() {
        let root = temporary_test_folder("scan");
        let nested = root.join("Drums");
        std::fs::create_dir_all(&nested).expect("nested test folder");
        std::fs::write(nested.join("Snare.WAV"), [1, 2, 3]).expect("wav fixture");
        std::fs::write(root.join("Bass.flac"), [4, 5]).expect("flac fixture");
        std::fs::write(root.join("Readme.txt"), [6]).expect("text fixture");

        let result = scan_sample_folder(&root).expect("folder discovery");
        assert_eq!(result.files.len(), 2);
        assert_eq!(result.files[0].name, "Bass.flac");
        assert_eq!(result.files[1].name, "Snare.WAV");
        assert!(result.warnings.is_empty());
        assert!(!result.truncated);

        std::fs::remove_dir_all(root).expect("remove test folder");
    }

    #[test]
    fn oversized_samples_are_reported_without_blocking_other_files() {
        let root = temporary_test_folder("oversized");
        std::fs::create_dir_all(&root).expect("test folder");
        std::fs::write(root.join("Good.wav"), [1]).expect("good fixture");
        let oversized = std::fs::File::create(root.join("Huge.wav")).expect("oversized fixture");
        oversized
            .set_len(MAX_SAMPLE_FILE_BYTES + 1)
            .expect("sparse oversized file");

        let result = scan_sample_folder(&root).expect("folder discovery");
        assert_eq!(result.files.len(), 1);
        assert_eq!(result.warnings.len(), 1);
        assert!(result.warnings[0].contains("250 MiB"));

        std::fs::remove_dir_all(root).expect("remove test folder");
    }

    #[test]
    fn explorer_drop_paths_accept_files_and_single_folders() {
        let root = temporary_test_folder("drop-paths");
        std::fs::create_dir_all(&root).expect("test folder");
        let kick = root.join("Kick.wav");
        std::fs::write(&kick, [1, 2, 3]).expect("sample fixture");

        let file_result =
            sample_library_scan_paths(vec![kick.to_string_lossy().to_string()]).expect("file drop");
        assert_eq!(file_result.files.len(), 1);
        assert!(file_result.root_path.is_none());

        let folder_result = sample_library_scan_paths(vec![root.to_string_lossy().to_string()])
            .expect("folder drop");
        assert_eq!(folder_result.files.len(), 1);
        assert!(folder_result.root_path.is_some());

        std::fs::remove_dir_all(root).expect("remove test folder");
    }

    #[test]
    fn state_file_replacement_keeps_the_latest_valid_bytes() {
        let root = temporary_test_folder("state");
        std::fs::create_dir_all(&root).expect("test folder");
        let target = root.join(SAMPLE_LIBRARY_STATE_FILE);
        std::fs::write(&target, b"old").expect("old state");
        let temporary = target.with_extension("json.tmp");
        std::fs::write(&temporary, b"new").expect("new state");

        replace_file(&temporary, &target).expect("replace state");
        assert_eq!(std::fs::read(&target).expect("read state"), b"new");
        assert!(!temporary.exists());

        std::fs::remove_dir_all(root).expect("remove test folder");
    }

    fn temporary_test_folder(label: &str) -> PathBuf {
        let stamp = std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock after epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("pocket-daw-sample-library-{label}-{stamp}"))
    }
}
