use serde::Serialize;
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, Serialize)]
pub struct ProjectFileTransactionResult {
    pub path: String,
    #[serde(rename = "backupPath")]
    pub backup_path: Option<String>,
    #[serde(rename = "bytesWritten")]
    pub bytes_written: u64,
    #[serde(rename = "recoveryWarnings")]
    pub recovery_warnings: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct ProjectRecoveryCandidate {
    pub path: String,
    #[serde(rename = "sizeBytes")]
    pub size_bytes: u64,
    #[serde(rename = "modifiedUnixMs")]
    pub modified_unix_ms: Option<u128>,
    pub valid: bool,
    pub note: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct ProjectRecoveryState {
    pub current: Option<ProjectRecoveryCandidate>,
    pub temp: Option<ProjectRecoveryCandidate>,
    pub backup: Option<ProjectRecoveryCandidate>,
}

pub fn save_project_transaction(
    path: &Path,
    contents: &str,
    max_bytes: u64,
) -> Result<ProjectFileTransactionResult, String> {
    save_project_transaction_with_failure(path, contents, max_bytes, FailurePoint::None)
}

pub fn discover_project_recovery(path: &Path) -> ProjectRecoveryState {
    ProjectRecoveryState {
        current: recovery_candidate(path),
        temp: recovery_candidate(&temp_path(path)),
        backup: recovery_candidate(&backup_path(path)),
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum FailurePoint {
    None,
    AfterTempReadback,
    AfterBackup,
}

fn save_project_transaction_with_failure(
    path: &Path,
    contents: &str,
    max_bytes: u64,
    failure: FailurePoint,
) -> Result<ProjectFileTransactionResult, String> {
    let bytes = contents.as_bytes();
    if bytes.len() as u64 > max_bytes {
        return Err(format!(
            "Project file is too large for this release. Limit: {} MB. Selected: {} MB.",
            bytes_to_mb(max_bytes),
            bytes_to_mb(bytes.len() as u64)
        ));
    }
    validate_project_marker(contents)?;
    let parent = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .ok_or_else(|| "Project file must have a parent folder.".to_string())?;
    if !parent.exists() {
        return Err("Project file parent folder does not exist.".to_string());
    }

    let temp = temp_path(path);
    let backup = backup_path(path);
    let mut warnings = Vec::new();
    if temp.exists() {
        fs::remove_file(&temp)
            .map_err(|err| format!("Could not clean stale project temp file: {err}"))?;
    }

    write_synced_temp(&temp, bytes)?;
    let readback = fs::read_to_string(&temp)
        .map_err(|err| format!("Could not read back temporary project file: {err}"))?;
    if readback != contents {
        return Err(
            "Temporary project file read-back did not match serialized contents.".to_string(),
        );
    }
    validate_project_marker(&readback)?;
    fail_if(failure, FailurePoint::AfterTempReadback)?;

    if path.exists() {
        match fs::copy(path, &backup) {
            Ok(_) => {}
            Err(err) => return Err(format!("Could not preserve previous project backup: {err}")),
        }
        sync_file_best_effort(&backup, &mut warnings);
    }
    fail_if(failure, FailurePoint::AfterBackup)?;

    if path.exists() {
        fs::remove_file(path).map_err(|err| {
            format!("Could not remove previous project file before replacement: {err}")
        })?;
    }
    fs::rename(&temp, path)
        .map_err(|err| format!("Could not replace project file with temporary save: {err}"))?;
    sync_file_best_effort(path, &mut warnings);
    sync_parent_best_effort(parent, &mut warnings);
    if temp.exists() {
        fs::remove_file(&temp)
            .map_err(|err| format!("Could not clean temporary project file after save: {err}"))?;
    }

    Ok(ProjectFileTransactionResult {
        path: path.to_string_lossy().to_string(),
        backup_path: path
            .exists()
            .then_some(backup)
            .filter(|backup| backup.exists())
            .map(|backup| backup.to_string_lossy().to_string()),
        bytes_written: bytes.len() as u64,
        recovery_warnings: warnings,
    })
}

fn write_synced_temp(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|err| format!("Could not create temporary project file: {err}"))?;
    file.write_all(bytes)
        .map_err(|err| format!("Could not write temporary project file: {err}"))?;
    file.flush()
        .map_err(|err| format!("Could not flush temporary project file: {err}"))?;
    file.sync_all()
        .map_err(|err| format!("Could not sync temporary project file: {err}"))?;
    Ok(())
}

fn validate_project_marker(contents: &str) -> Result<(), String> {
    let value: serde_json::Value = serde_json::from_str(contents)
        .map_err(|err| format!("Project file contents are not valid JSON: {err}"))?;
    if !value.is_object() {
        return Err("Project file JSON must be an object.".to_string());
    }
    if value.get("app").and_then(|item| item.as_str()) != Some("PocketDAW") {
        return Err("Project file JSON is missing app marker PocketDAW.".to_string());
    }
    Ok(())
}

fn recovery_candidate(path: &Path) -> Option<ProjectRecoveryCandidate> {
    let metadata = fs::metadata(path).ok()?;
    let valid = fs::read_to_string(path)
        .ok()
        .and_then(|contents| validate_project_marker(&contents).ok())
        .is_some();
    Some(ProjectRecoveryCandidate {
        path: path.to_string_lossy().to_string(),
        size_bytes: metadata.len(),
        modified_unix_ms: metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|duration| duration.as_millis()),
        valid,
        note: if valid {
            "valid Pocket DAW project candidate".to_string()
        } else {
            "not a valid Pocket DAW project candidate".to_string()
        },
    })
}

fn temp_path(path: &Path) -> PathBuf {
    sibling_with_extra_extension(path, "tmp")
}

fn backup_path(path: &Path) -> PathBuf {
    sibling_with_extra_extension(path, "bak")
}

fn sibling_with_extra_extension(path: &Path, extension: &str) -> PathBuf {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(format!(".{extension}"));
    path.with_file_name(name)
}

fn sync_file_best_effort(path: &Path, warnings: &mut Vec<String>) {
    match File::open(path).and_then(|file| file.sync_all()) {
        Ok(_) => {}
        Err(err) => warnings.push(format!("Could not sync {}: {err}", path.to_string_lossy())),
    }
}

fn sync_parent_best_effort(path: &Path, warnings: &mut Vec<String>) {
    match File::open(path).and_then(|file| file.sync_all()) {
        Ok(_) => {}
        Err(err) => warnings.push(format!(
            "Could not sync parent folder {}: {err}",
            path.to_string_lossy()
        )),
    }
}

fn bytes_to_mb(bytes: u64) -> u64 {
    bytes.div_ceil(1024 * 1024)
}

fn fail_if(actual: FailurePoint, expected: FailurePoint) -> Result<(), String> {
    if actual == expected {
        Err(format!("simulated failure at {expected:?}"))
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_save_writes_project_without_backup() {
        let dir = test_dir("first-save");
        let target = dir.join("song.pocketdaw");

        let result = save_project_transaction(&target, &project_json("First"), 1024)
            .expect("save should succeed");

        assert_eq!(
            fs::read_to_string(&target).expect("target"),
            project_json("First")
        );
        assert!(result.backup_path.is_none());
        assert!(!temp_path(&target).exists());
    }

    #[test]
    fn overwrite_preserves_one_bounded_backup() {
        let dir = test_dir("overwrite");
        let target = dir.join("song.pocketdaw");
        save_project_transaction(&target, project_json("Old").as_str(), 1024).expect("old save");

        let result = save_project_transaction(&target, project_json("New").as_str(), 1024)
            .expect("new save");

        assert_eq!(
            fs::read_to_string(&target).expect("target"),
            project_json("New")
        );
        assert_eq!(
            fs::read_to_string(backup_path(&target)).expect("backup"),
            project_json("Old")
        );
        assert!(result.backup_path.is_some());
    }

    #[test]
    fn unicode_path_round_trips() {
        let dir = test_dir("unicode");
        let target = dir.join("song-ユニコード.pocketdaw");

        save_project_transaction(&target, project_json("Unicode").as_str(), 1024)
            .expect("unicode save");

        assert_eq!(
            fs::read_to_string(target).expect("target"),
            project_json("Unicode")
        );
    }

    #[test]
    fn invalid_parent_fails() {
        let dir = test_dir("missing-parent");
        let target = dir.join("missing").join("song.pocketdaw");

        let error = save_project_transaction(&target, project_json("Bad").as_str(), 1024)
            .expect_err("missing parent");

        assert!(error.contains("parent folder"));
    }

    #[test]
    fn simulated_failure_before_backup_leaves_existing_project_parseable() {
        let dir = test_dir("fail-before-backup");
        let target = dir.join("song.pocketdaw");
        save_project_transaction(&target, project_json("Old").as_str(), 1024).expect("old save");

        let error = save_project_transaction_with_failure(
            &target,
            project_json("New").as_str(),
            1024,
            FailurePoint::AfterTempReadback,
        )
        .expect_err("simulated failure");

        assert!(error.contains("simulated failure"));
        assert_eq!(
            fs::read_to_string(&target).expect("target"),
            project_json("Old")
        );
        assert!(temp_path(&target).exists());
    }

    #[test]
    fn simulated_failure_after_backup_leaves_existing_project_and_backup_parseable() {
        let dir = test_dir("fail-after-backup");
        let target = dir.join("song.pocketdaw");
        save_project_transaction(&target, project_json("Old").as_str(), 1024).expect("old save");

        save_project_transaction_with_failure(
            &target,
            project_json("New").as_str(),
            1024,
            FailurePoint::AfterBackup,
        )
        .expect_err("simulated failure");

        assert_eq!(
            fs::read_to_string(&target).expect("target"),
            project_json("Old")
        );
        assert_eq!(
            fs::read_to_string(backup_path(&target)).expect("backup"),
            project_json("Old")
        );
        assert!(
            discover_project_recovery(&target)
                .backup
                .expect("backup")
                .valid
        );
    }

    #[test]
    fn partial_temp_is_reported_invalid_for_recovery() {
        let dir = test_dir("partial-temp");
        let target = dir.join("song.pocketdaw");
        fs::write(temp_path(&target), "{\"app\":\"PocketDAW\"").expect("partial temp");

        let state = discover_project_recovery(&target);

        assert!(!state.temp.expect("temp").valid);
    }

    #[test]
    fn valid_temp_and_backup_are_recovery_candidates() {
        let dir = test_dir("recovery");
        let target = dir.join("song.pocketdaw");
        fs::write(temp_path(&target), project_json("Temp")).expect("temp");
        fs::write(backup_path(&target), project_json("Backup")).expect("backup");

        let state = discover_project_recovery(&target);

        assert!(state.temp.expect("temp").valid);
        assert!(state.backup.expect("backup").valid);
    }

    fn project_json(title: &str) -> String {
        format!(r#"{{"app":"PocketDAW","project":{{"title":"{title}"}}}}"#)
    }

    fn test_dir(name: &str) -> PathBuf {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("time")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("pocket-daw-project-files-{name}-{stamp}"));
        fs::create_dir_all(&dir).expect("test dir");
        dir
    }
}
