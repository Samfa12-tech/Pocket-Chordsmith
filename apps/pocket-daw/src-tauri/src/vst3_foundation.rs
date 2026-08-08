use flate2::read::GzDecoder;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
#[cfg(windows)]
use std::sync::atomic::{AtomicU64, Ordering};
#[cfg(windows)]
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use crate::native_audio_blocks::NATIVE_AUDIO_BLOCK_FRAMES;

const SETTINGS_FILE_NAME: &str = "vst3-beta-settings.json";
const REGISTRY_FILE_NAME: &str = "vst3-registry-cache.json";
const QUARANTINE_FILE_NAME: &str = "vst3-quarantine.json";
const CONSENT_VERSION: u32 = 1;
const MAX_DISCOVERED_MODULES: usize = 10_000;
const MAX_USER_SCAN_ROOTS: usize = 64;
const PLUGIN_HOST_PROTOCOL_VERSION: u32 = 2;
const PLUGIN_HOST_PROBE_TIMEOUT: Duration = Duration::from_secs(2);
const PLUGIN_SCAN_TIMEOUT: Duration = Duration::from_secs(20);
const MAX_CONTROL_MESSAGE_BYTES: usize = 1024 * 1024;
pub(crate) const MAX_PLUGIN_STATE_BYTES: usize = 32 * 1024 * 1024;

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Vst3BetaSettings {
    pub enabled: bool,
    pub consent_version: Option<u32>,
    #[serde(default)]
    pub user_scan_roots: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HostedPluginIdentity {
    pub format: String,
    pub class_id: String,
    pub vendor: String,
    pub name: String,
    pub version: String,
    pub category: String,
    pub module_filename: String,
    pub binary_fingerprint: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Vst3PluginDescriptor {
    pub identity: HostedPluginIdentity,
    pub module_source_key: String,
    pub supports_instrument_role: bool,
    pub supports_effect_role: bool,
    pub audio_input_bus_count: u32,
    pub audio_output_bus_count: u32,
    pub event_input_bus_count: u32,
    pub reported_latency_samples: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CachedModule {
    source_path: String,
    source_key: String,
    module_filename: String,
    binary_fingerprint: String,
    location_scope: String,
    #[serde(default)]
    descriptors: Vec<Vst3PluginDescriptor>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RegistryCache {
    #[serde(default)]
    modules: Vec<CachedModule>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct QuarantineEntry {
    source_key: String,
    #[serde(default)]
    binary_fingerprint: String,
    reason: QuarantineReason,
    failure_count: u32,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum QuarantineReason {
    Crash,
    Timeout,
    InvalidDescriptor,
    UnsupportedArchitecture,
    LoadFailure,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Vst3ModuleCandidate {
    pub source_key: String,
    pub module_filename: String,
    pub binary_fingerprint: String,
    pub location_scope: String,
    pub descriptor_status: String,
    pub quarantined: bool,
    pub descriptors: Vec<Vst3PluginDescriptor>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Vst3BetaStatus {
    pub enabled: bool,
    pub consent_version: Option<u32>,
    pub current_consent_version: u32,
    pub scanner_available: bool,
    pub audio_hosting_available: bool,
    pub vendor_editor_available: bool,
    pub generic_editor_available: bool,
    pub sidecar_available: bool,
    pub sidecar_protocol_version: Option<u32>,
    pub vst3_sdk_linked: bool,
    pub audio_block_frames: usize,
    pub official_scan_root_count: usize,
    pub user_scan_root_count: usize,
    pub cached_module_count: usize,
    pub verified_descriptor_count: usize,
    pub quarantined_module_count: usize,
    pub state_limit_bytes: usize,
    pub boundary: &'static str,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PluginHostProbe {
    component: String,
    protocol_version: u32,
    transport: String,
    vst3_sdk_linked: bool,
    scanner_available: bool,
    audio_hosting_available: bool,
    audio_block_frames: usize,
    vst3_sdk_tag: String,
    vst3_sdk_commit: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SidecarClassDescriptor {
    class_id: String,
    vendor: String,
    name: String,
    version: String,
    category: String,
    supports_instrument_role: bool,
    supports_effect_role: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SidecarScanResponse {
    protocol_version: u32,
    request_id: String,
    ok: bool,
    code: String,
    scanner_available: bool,
    audio_hosting_available: bool,
    #[serde(default)]
    descriptors: Vec<SidecarClassDescriptor>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ScannerFailure {
    Crash,
    Timeout,
    InvalidDescriptor,
    UnsupportedArchitecture,
    LoadFailure,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PluginStateValidation {
    pub valid: bool,
    pub compressed_bytes: usize,
    pub uncompressed_bytes: usize,
    pub checksum_sha256: String,
}

#[tauri::command]
pub(crate) fn vst3_beta_status() -> Result<Vst3BetaStatus, String> {
    let settings = load_json::<Vst3BetaSettings>(&settings_path()).unwrap_or_default();
    let registry = load_json::<RegistryCache>(&registry_path()).unwrap_or_default();
    let quarantine = load_quarantine();
    let probe = probe_plugin_host();
    let scanner_available = probe
        .as_ref()
        .is_some_and(|value| value.vst3_sdk_linked && value.scanner_available);
    let audio_hosting_available = probe
        .as_ref()
        .is_some_and(|value| value.vst3_sdk_linked && value.audio_hosting_available);
    Ok(Vst3BetaStatus {
        enabled: settings.enabled,
        consent_version: settings.consent_version,
        current_consent_version: CONSENT_VERSION,
        scanner_available,
        audio_hosting_available,
        vendor_editor_available: audio_hosting_available,
        generic_editor_available: audio_hosting_available,
        sidecar_available: probe.is_some(),
        sidecar_protocol_version: probe.as_ref().map(|value| value.protocol_version),
        vst3_sdk_linked: probe
            .as_ref()
            .is_some_and(|value| value.vst3_sdk_linked),
        audio_block_frames: probe
            .as_ref()
            .map(|value| value.audio_block_frames)
            .unwrap_or(NATIVE_AUDIO_BLOCK_FRAMES),
        official_scan_root_count: official_windows_vst3_scan_roots().len(),
        user_scan_root_count: settings.user_scan_roots.len(),
        cached_module_count: registry.modules.len(),
        verified_descriptor_count: registry
            .modules
            .iter()
            .map(|module| module.descriptors.len())
            .sum(),
        quarantined_module_count: quarantine.len(),
        state_limit_bytes: MAX_PLUGIN_STATE_BYTES,
        boundary: "The crash-isolated x64 VST3 scanner and session host are available. Unsupported buses and missing or quarantined binaries fail closed without exposing private install paths.",
    })
}

#[tauri::command]
pub(crate) fn vst3_beta_set_enabled(enabled: bool) -> Result<Vst3BetaStatus, String> {
    let mut settings = load_json::<Vst3BetaSettings>(&settings_path()).unwrap_or_default();
    settings.enabled = enabled;
    settings.consent_version = enabled.then_some(CONSENT_VERSION);
    save_json(&settings_path(), &settings)?;
    vst3_beta_status()
}

#[tauri::command]
pub(crate) fn vst3_beta_get_user_scan_roots() -> Vec<String> {
    load_json::<Vst3BetaSettings>(&settings_path())
        .unwrap_or_default()
        .user_scan_roots
}

#[tauri::command]
pub(crate) fn vst3_beta_set_user_scan_roots(roots: Vec<String>) -> Result<Vec<String>, String> {
    let mut settings = load_json::<Vst3BetaSettings>(&settings_path()).unwrap_or_default();
    settings.user_scan_roots = normalize_user_roots(roots)?;
    save_json(&settings_path(), &settings)?;
    Ok(settings.user_scan_roots)
}

#[tauri::command]
pub(crate) fn vst3_beta_select_user_scan_folder() -> Result<Option<Vec<String>>, String> {
    let Some(selected) = rfd::FileDialog::new()
        .set_title("Add a VST3 plug-in folder")
        .pick_folder()
    else {
        return Ok(None);
    };
    if !selected.is_dir() {
        return Err("The selected VST3 scan folder is not available.".to_string());
    }
    let canonical = selected
        .canonicalize()
        .map_err(|_| "The selected VST3 scan folder could not be resolved.".to_string())?;
    if canonical.parent().is_none() {
        return Err("Choose a specific plug-in folder instead of an entire drive.".to_string());
    }
    let mut settings = load_json::<Vst3BetaSettings>(&settings_path()).unwrap_or_default();
    settings
        .user_scan_roots
        .push(canonical.to_string_lossy().to_string());
    settings.user_scan_roots = normalize_user_roots(settings.user_scan_roots)?;
    save_json(&settings_path(), &settings)?;
    Ok(Some(settings.user_scan_roots))
}

#[tauri::command]
pub(crate) async fn vst3_beta_discover_modules() -> Result<Vec<Vst3ModuleCandidate>, String> {
    tauri::async_runtime::spawn_blocking(discover_modules)
        .await
        .map_err(|_| "VST3 discovery worker stopped unexpectedly.".to_string())?
}

fn discover_modules() -> Result<Vec<Vst3ModuleCandidate>, String> {
    let settings = load_json::<Vst3BetaSettings>(&settings_path()).unwrap_or_default();
    if !settings.enabled || settings.consent_version != Some(CONSENT_VERSION) {
        return Err("Enable the VST3 beta before discovering installed modules.".to_string());
    }

    let prior = load_json::<RegistryCache>(&registry_path()).unwrap_or_default();
    let prior_descriptors: BTreeMap<String, (String, Vec<Vst3PluginDescriptor>)> = prior
        .modules
        .into_iter()
        .map(|module| {
            (
                module.source_key,
                (module.binary_fingerprint, module.descriptors),
            )
        })
        .collect();
    let mut modules = Vec::new();
    for root in official_windows_vst3_scan_roots() {
        discover_root(&root, "official", &prior_descriptors, &mut modules)?;
    }
    for root in settings.user_scan_roots {
        discover_root(
            Path::new(&root),
            "userAdded",
            &prior_descriptors,
            &mut modules,
        )?;
    }
    modules.sort_by(|left, right| {
        left.module_filename
            .to_lowercase()
            .cmp(&right.module_filename.to_lowercase())
            .then(left.source_key.cmp(&right.source_key))
    });
    modules.dedup_by(|left, right| left.source_key == right.source_key);
    scan_changed_modules(&mut modules)?;
    save_json(
        &registry_path(),
        &RegistryCache {
            modules: modules.clone(),
        },
    )?;
    Ok(to_public_candidates(modules))
}

#[tauri::command]
pub(crate) fn vst3_beta_list_registry() -> Vec<Vst3ModuleCandidate> {
    let registry = load_json::<RegistryCache>(&registry_path()).unwrap_or_default();
    to_public_candidates(registry.modules)
}

#[allow(dead_code)]
pub(crate) fn resolve_hosted_module(identity: &HostedPluginIdentity) -> Result<PathBuf, String> {
    resolve_hosted_module_and_source(identity).map(|(path, _)| path)
}

pub(crate) fn resolve_hosted_module_and_source(
    identity: &HostedPluginIdentity,
) -> Result<(PathBuf, String), String> {
    let settings = load_json::<Vst3BetaSettings>(&settings_path()).unwrap_or_default();
    let registry = load_json::<RegistryCache>(&registry_path()).unwrap_or_default();
    let quarantine = load_quarantine();
    resolve_hosted_module_from(identity, &settings, &registry, &quarantine)
}

pub(crate) fn resolve_hosted_role(identity: &HostedPluginIdentity) -> Result<&'static str, String> {
    let registry = load_json::<RegistryCache>(&registry_path()).unwrap_or_default();
    let descriptor = registry
        .modules
        .iter()
        .flat_map(|module| module.descriptors.iter())
        .find(|descriptor| {
            descriptor
                .identity
                .class_id
                .eq_ignore_ascii_case(&identity.class_id)
                && descriptor
                    .identity
                    .binary_fingerprint
                    .eq_ignore_ascii_case(&identity.binary_fingerprint)
        })
        .ok_or_else(|| {
            "The hosted plug-in class is not verified in the private registry.".to_string()
        })?;
    match (
        descriptor.supports_instrument_role,
        descriptor.supports_effect_role,
    ) {
        (true, false) => Ok("instrument"),
        (false, true) => Ok("effect"),
        _ => Err("The hosted plug-in role is ambiguous or unsupported.".to_string()),
    }
}

fn resolve_hosted_module_from(
    identity: &HostedPluginIdentity,
    settings: &Vst3BetaSettings,
    registry: &RegistryCache,
    quarantine: &BTreeMap<String, QuarantineEntry>,
) -> Result<(PathBuf, String), String> {
    if !settings.enabled || settings.consent_version != Some(CONSENT_VERSION) {
        return Err("Enable the VST3 beta before loading hosted plug-ins.".to_string());
    }
    if identity.format != "vst3"
        || identity.class_id.len() != 32
        || identity.binary_fingerprint.len() != 64
        || identity.module_filename.is_empty()
    {
        return Err("Hosted plug-in identity is invalid.".to_string());
    }
    let mut matches = registry.modules.iter().filter(|module| {
        module
            .module_filename
            .eq_ignore_ascii_case(&identity.module_filename)
            && module
                .binary_fingerprint
                .eq_ignore_ascii_case(&identity.binary_fingerprint)
            && module.descriptors.iter().any(|descriptor| {
                descriptor
                    .identity
                    .class_id
                    .eq_ignore_ascii_case(&identity.class_id)
                    && descriptor
                        .identity
                        .binary_fingerprint
                        .eq_ignore_ascii_case(&identity.binary_fingerprint)
            })
    });
    let module = matches.next().ok_or_else(|| {
        "The exact hosted plug-in binary is not installed in the private registry.".to_string()
    })?;
    if matches.next().is_some() {
        return Err(
            "The hosted plug-in identity resolves ambiguously; rescan before loading.".to_string(),
        );
    }
    if quarantine.get(&module.source_key).is_some_and(|entry| {
        entry
            .binary_fingerprint
            .eq_ignore_ascii_case(&module.binary_fingerprint)
    }) {
        return Err("The hosted plug-in binary is quarantined.".to_string());
    }
    let path = PathBuf::from(&module.source_path);
    let binary = module_binary_path(&path)
        .ok_or_else(|| "The hosted plug-in binary is missing.".to_string())?;
    let fingerprint = sha256_file(&binary)
        .map_err(|_| "The hosted plug-in binary could not be verified.".to_string())?;
    if !fingerprint.eq_ignore_ascii_case(&identity.binary_fingerprint) {
        return Err("The hosted plug-in binary changed; rescan before loading.".to_string());
    }
    Ok((path, module.source_key.clone()))
}

#[tauri::command]
pub(crate) fn vst3_beta_quarantine_module(
    source_key: String,
    reason: QuarantineReason,
) -> Result<(), String> {
    validate_source_key(&source_key)?;
    let binary_fingerprint = load_json::<RegistryCache>(&registry_path())
        .unwrap_or_default()
        .modules
        .into_iter()
        .find(|module| module.source_key == source_key)
        .map(|module| module.binary_fingerprint)
        .ok_or_else(|| "VST3 module is not present in the local registry.".to_string())?;
    let mut quarantine = load_quarantine();
    let next_count = quarantine
        .get(&source_key)
        .filter(|entry| entry.binary_fingerprint == binary_fingerprint)
        .map(|entry| entry.failure_count.saturating_add(1))
        .unwrap_or(1);
    quarantine.insert(
        source_key.clone(),
        QuarantineEntry {
            source_key,
            binary_fingerprint,
            reason,
            failure_count: next_count,
        },
    );
    save_json(&quarantine_path(), &quarantine)
}

#[tauri::command]
pub(crate) fn vst3_beta_clear_quarantine(source_key: String) -> Result<(), String> {
    validate_source_key(&source_key)?;
    let mut quarantine = load_quarantine();
    quarantine.remove(&source_key);
    save_json(&quarantine_path(), &quarantine)
}

#[tauri::command]
pub(crate) fn vst3_validate_state_snapshot(
    compressed_state: Vec<u8>,
    checksum_sha256: String,
) -> Result<PluginStateValidation, String> {
    validate_state_snapshot(&compressed_state, &checksum_sha256)
}

fn validate_state_snapshot(
    compressed_state: &[u8],
    checksum_sha256: &str,
) -> Result<PluginStateValidation, String> {
    if compressed_state.len() > MAX_PLUGIN_STATE_BYTES {
        return Err("Plug-in state exceeds the 32 MiB per-instance limit.".to_string());
    }
    let actual_checksum = sha256_bytes(compressed_state);
    if !checksum_sha256.eq_ignore_ascii_case(&actual_checksum) {
        return Err("Plug-in state checksum does not match the compressed payload.".to_string());
    }
    let mut decoder = GzDecoder::new(compressed_state);
    let mut decoded = Vec::new();
    decoder
        .by_ref()
        .take((MAX_PLUGIN_STATE_BYTES + 1) as u64)
        .read_to_end(&mut decoded)
        .map_err(|_| "Plug-in state is not valid gzip-compressed data.".to_string())?;
    if decoded.len() > MAX_PLUGIN_STATE_BYTES {
        return Err(
            "Decompressed plug-in state exceeds the 32 MiB per-instance limit.".to_string(),
        );
    }
    Ok(PluginStateValidation {
        valid: true,
        compressed_bytes: compressed_state.len(),
        uncompressed_bytes: decoded.len(),
        checksum_sha256: actual_checksum,
    })
}

fn official_windows_vst3_scan_roots() -> Vec<PathBuf> {
    official_windows_vst3_scan_roots_from(
        std::env::var_os("ProgramFiles").map(PathBuf::from),
        std::env::var_os("LOCALAPPDATA").map(PathBuf::from),
    )
}

fn official_windows_vst3_scan_roots_from(
    program_files: Option<PathBuf>,
    local_app_data: Option<PathBuf>,
) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(root) = local_app_data {
        roots.push(root.join("Programs").join("Common").join("VST3"));
    }
    if let Some(root) = program_files {
        roots.push(root.join("Common Files").join("VST3"));
    }
    roots
}

fn normalize_user_roots(roots: Vec<String>) -> Result<Vec<String>, String> {
    let mut seen = HashSet::new();
    let mut normalized = Vec::new();
    for raw in roots {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            continue;
        }
        let path = PathBuf::from(trimmed);
        if !path.is_absolute() {
            return Err("VST3 scan folders must be absolute paths.".to_string());
        }
        let rendered = path
            .to_string_lossy()
            .trim_end_matches(['\\', '/'])
            .to_string();
        let key = rendered.to_lowercase();
        if seen.insert(key) {
            normalized.push(rendered);
            if normalized.len() > MAX_USER_SCAN_ROOTS {
                return Err(format!(
                    "Pocket DAW supports up to {MAX_USER_SCAN_ROOTS} user-added VST3 folders."
                ));
            }
        }
    }
    Ok(normalized)
}

fn discover_root(
    root: &Path,
    scope: &str,
    prior_descriptors: &BTreeMap<String, (String, Vec<Vst3PluginDescriptor>)>,
    modules: &mut Vec<CachedModule>,
) -> Result<(), String> {
    if !root.is_dir() {
        return Ok(());
    }
    let canonical_root = match root.canonicalize() {
        Ok(path) => path,
        Err(_) => return Ok(()),
    };
    let mut pending = vec![canonical_root.clone()];
    let mut visited_folders = HashSet::new();
    while let Some(folder) = pending.pop() {
        let canonical_folder = match folder.canonicalize() {
            Ok(path) => path,
            Err(_) => continue,
        };
        if !canonical_folder.starts_with(&canonical_root) {
            continue;
        }
        if !visited_folders.insert(canonical_folder) {
            continue;
        }
        let entries = match fs::read_dir(&folder) {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            if modules.len() >= MAX_DISCOVERED_MODULES {
                return Err("VST3 discovery stopped after 10,000 modules.".to_string());
            }
            let file_type = match entry.file_type() {
                Ok(file_type) => file_type,
                Err(_) => continue,
            };
            // A user-selected scan root is the complete authority boundary. Do not
            // follow symlinks or junction-like entries into unrelated personal data.
            if file_type.is_symlink() {
                continue;
            }
            let path = entry.path();
            let is_vst3 = path
                .extension()
                .and_then(|value| value.to_str())
                .is_some_and(|value| value.eq_ignore_ascii_case("vst3"));
            if is_vst3 {
                let canonical_module = match path.canonicalize() {
                    Ok(path) if path.starts_with(&canonical_root) => path,
                    _ => continue,
                };
                if let Some(module) = inspect_module(&canonical_module, scope, prior_descriptors) {
                    modules.push(module);
                }
            } else if file_type.is_dir() {
                pending.push(path);
            }
        }
    }
    Ok(())
}

fn inspect_module(
    path: &Path,
    scope: &str,
    prior_descriptors: &BTreeMap<String, (String, Vec<Vst3PluginDescriptor>)>,
) -> Option<CachedModule> {
    let source_path = path.to_string_lossy().to_string();
    let source_key = sha256_bytes(source_path.to_lowercase().as_bytes());
    let binary_path = module_binary_path(path)?;
    let binary_fingerprint = sha256_file(&binary_path).ok()?;
    Some(CachedModule {
        module_filename: path.file_name()?.to_string_lossy().to_string(),
        descriptors: prior_descriptors
            .get(&source_key)
            .filter(|(prior_fingerprint, _)| prior_fingerprint == &binary_fingerprint)
            .map(|(_, descriptors)| descriptors.clone())
            .unwrap_or_default(),
        source_path,
        source_key,
        binary_fingerprint,
        location_scope: scope.to_string(),
    })
}

fn module_binary_path(path: &Path) -> Option<PathBuf> {
    let metadata = fs::symlink_metadata(path).ok()?;
    if metadata.file_type().is_symlink() {
        return None;
    }
    if metadata.is_file() {
        return path.canonicalize().ok();
    }
    let canonical_bundle = path.canonicalize().ok()?;
    let binary_folder = canonical_bundle.join("Contents").join("x86_64-win");
    fs::read_dir(binary_folder)
        .ok()?
        .flatten()
        .filter_map(|entry| {
            let file_type = entry.file_type().ok()?;
            if file_type.is_symlink() || !file_type.is_file() {
                return None;
            }
            entry.path().canonicalize().ok()
        })
        .find(|candidate| {
            candidate.starts_with(&canonical_bundle)
                && candidate
                    .extension()
                    .and_then(|value| value.to_str())
                    .is_some_and(|value| value.eq_ignore_ascii_case("vst3"))
        })
}

fn scan_changed_modules(modules: &mut [CachedModule]) -> Result<(), String> {
    let Some(probe) = probe_plugin_host() else {
        return Ok(());
    };
    if !probe.vst3_sdk_linked || !probe.scanner_available {
        return Ok(());
    }
    let Some(sidecar) = plugin_host_executable_path().filter(|path| path.is_file()) else {
        return Ok(());
    };
    let mut quarantine = load_quarantine();
    for module in modules
        .iter_mut()
        .filter(|module| module.descriptors.is_empty())
    {
        if quarantine
            .get(&module.source_key)
            .is_some_and(|entry| entry.binary_fingerprint == module.binary_fingerprint)
        {
            continue;
        }
        let binary = module_binary_path(Path::new(&module.source_path));
        let result = match binary.as_deref().and_then(pe_machine) {
            Some(0x8664) => scan_module_out_of_process(&sidecar, module),
            Some(_) => Err(ScannerFailure::UnsupportedArchitecture),
            None => Err(ScannerFailure::LoadFailure),
        };
        match result {
            Ok(descriptors) => {
                module.descriptors = descriptors;
                quarantine.remove(&module.source_key);
            }
            Err(failure) => record_scan_failure(&mut quarantine, module, failure),
        }
    }
    save_json(&quarantine_path(), &quarantine)
}

fn pe_machine(path: &Path) -> Option<u16> {
    let mut file = fs::File::open(path).ok()?;
    let mut dos_header = [0_u8; 64];
    file.read_exact(&mut dos_header).ok()?;
    if &dos_header[..2] != b"MZ" {
        return None;
    }
    let offset = u32::from_le_bytes(dos_header[0x3c..0x40].try_into().ok()?) as u64;
    use std::io::{Seek, SeekFrom};
    file.seek(SeekFrom::Start(offset)).ok()?;
    let mut pe_header = [0_u8; 6];
    file.read_exact(&mut pe_header).ok()?;
    if &pe_header[..4] != b"PE\0\0" {
        return None;
    }
    Some(u16::from_le_bytes([pe_header[4], pe_header[5]]))
}

fn record_scan_failure(
    quarantine: &mut BTreeMap<String, QuarantineEntry>,
    module: &CachedModule,
    failure: ScannerFailure,
) {
    let failure_count = quarantine
        .get(&module.source_key)
        .filter(|entry| entry.binary_fingerprint == module.binary_fingerprint)
        .map(|entry| entry.failure_count.saturating_add(1))
        .unwrap_or(1);
    let reason = match failure {
        ScannerFailure::Crash => QuarantineReason::Crash,
        ScannerFailure::Timeout => QuarantineReason::Timeout,
        ScannerFailure::InvalidDescriptor => QuarantineReason::InvalidDescriptor,
        ScannerFailure::UnsupportedArchitecture => QuarantineReason::UnsupportedArchitecture,
        ScannerFailure::LoadFailure => QuarantineReason::LoadFailure,
    };
    quarantine.insert(
        module.source_key.clone(),
        QuarantineEntry {
            source_key: module.source_key.clone(),
            binary_fingerprint: module.binary_fingerprint.clone(),
            reason,
            failure_count,
        },
    );
}

fn verified_descriptors(
    module: &CachedModule,
    descriptors: Vec<SidecarClassDescriptor>,
) -> Result<Vec<Vst3PluginDescriptor>, ScannerFailure> {
    if descriptors.is_empty() || descriptors.len() > 256 {
        return Err(ScannerFailure::InvalidDescriptor);
    }
    let mut class_ids = HashSet::new();
    descriptors
        .into_iter()
        .map(|descriptor| {
            if descriptor.class_id.len() != 32
                || !descriptor
                    .class_id
                    .bytes()
                    .all(|byte| byte.is_ascii_hexdigit())
                || !class_ids.insert(descriptor.class_id.to_uppercase())
                || descriptor.name.is_empty()
                || descriptor.name.len() > 128
                || descriptor.vendor.len() > 64
                || descriptor.version.len() > 64
                || descriptor.category.len() > 128
                || descriptor.supports_instrument_role == descriptor.supports_effect_role
                || [
                    &descriptor.name,
                    &descriptor.vendor,
                    &descriptor.version,
                    &descriptor.category,
                ]
                .iter()
                .any(|value| value.chars().any(char::is_control))
            {
                return Err(ScannerFailure::InvalidDescriptor);
            }
            Ok(Vst3PluginDescriptor {
                identity: HostedPluginIdentity {
                    format: "vst3".to_string(),
                    class_id: descriptor.class_id.to_uppercase(),
                    vendor: descriptor.vendor,
                    name: descriptor.name,
                    version: descriptor.version,
                    category: descriptor.category,
                    module_filename: module.module_filename.clone(),
                    binary_fingerprint: module.binary_fingerprint.clone(),
                },
                module_source_key: module.source_key.clone(),
                supports_instrument_role: descriptor.supports_instrument_role,
                supports_effect_role: descriptor.supports_effect_role,
                // Scanner descriptors remain load-free; authoritative topology and latency
                // are populated when the session host instantiates the component.
                audio_input_bus_count: 0,
                audio_output_bus_count: 0,
                event_input_bus_count: 0,
                reported_latency_samples: 0,
            })
        })
        .collect()
}

#[cfg(windows)]
fn scan_module_out_of_process(
    sidecar: &Path,
    module: &CachedModule,
) -> Result<Vec<Vst3PluginDescriptor>, ScannerFailure> {
    scanner_pipe::scan(sidecar, module)
}

#[cfg(not(windows))]
fn scan_module_out_of_process(
    _sidecar: &Path,
    _module: &CachedModule,
) -> Result<Vec<Vst3PluginDescriptor>, ScannerFailure> {
    Err(ScannerFailure::LoadFailure)
}

#[cfg(windows)]
mod scanner_pipe {
    use super::*;
    use std::ptr::null_mut;
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::Storage::FileSystem::{
        CreateFileW, ReadFile, WriteFile, FILE_GENERIC_READ, FILE_GENERIC_WRITE, OPEN_EXISTING,
    };
    use windows_sys::Win32::System::Pipes::WaitNamedPipeW;

    static PIPE_COUNTER: AtomicU64 = AtomicU64::new(1);

    struct ClientHandle(windows_sys::Win32::Foundation::HANDLE);

    impl Drop for ClientHandle {
        fn drop(&mut self) {
            unsafe { CloseHandle(self.0) };
        }
    }

    struct WatchdogState {
        child: Option<std::process::Child>,
        finished: bool,
        timed_out: bool,
    }

    pub(super) fn scan(
        sidecar: &Path,
        module: &CachedModule,
    ) -> Result<Vec<Vst3PluginDescriptor>, ScannerFailure> {
        let nonce = rand::random::<[u8; 16]>()
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        let request_id = format!(
            "scan-{}-{}-{nonce}",
            std::process::id(),
            PIPE_COUNTER.fetch_add(1, Ordering::Relaxed)
        );
        let pipe_name = format!(r"\\.\pipe\pocket-daw-vst3-{request_id}");
        let child = Command::new(sidecar)
            .args(["--mode", "scanner", "--pipe", &pipe_name])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|_| ScannerFailure::LoadFailure)?;
        let state = Arc::new((
            Mutex::new(WatchdogState {
                child: Some(child),
                finished: false,
                timed_out: false,
            }),
            Condvar::new(),
        ));
        let watchdog_state = Arc::clone(&state);
        thread::spawn(move || {
            let (lock, wake) = &*watchdog_state;
            let guard = lock.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
            let (mut guard, _) = wake
                .wait_timeout_while(guard, PLUGIN_SCAN_TIMEOUT, |state| !state.finished)
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if !guard.finished {
                guard.timed_out = true;
                if let Some(child) = guard.child.as_mut() {
                    let _ = child.kill();
                }
            }
        });

        let io_result = connect_and_scan(&pipe_name, module, &request_id);
        let (lock, wake) = &*state;
        let mut guard = lock.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        guard.finished = true;
        let timed_out = guard.timed_out;
        if io_result.is_err() {
            if let Some(child) = guard.child.as_mut() {
                let _ = child.kill();
            }
        }
        let status = guard.child.as_mut().and_then(|child| child.wait().ok());
        guard.child = None;
        wake.notify_all();
        drop(guard);
        if timed_out {
            return Err(ScannerFailure::Timeout);
        }
        if !status.is_some_and(|status| status.success()) {
            return Err(ScannerFailure::Crash);
        }
        let response = io_result?;
        if response.protocol_version != PLUGIN_HOST_PROTOCOL_VERSION
            || response.request_id != request_id
            || !response.scanner_available
            || !response.audio_hosting_available
        {
            return Err(ScannerFailure::InvalidDescriptor);
        }
        if !response.ok {
            return Err(match response.code.as_str() {
                "invalidDescriptor" => ScannerFailure::InvalidDescriptor,
                "loadFailure" => ScannerFailure::LoadFailure,
                _ => ScannerFailure::InvalidDescriptor,
            });
        }
        if response.code != "scanComplete" {
            return Err(ScannerFailure::InvalidDescriptor);
        }
        verified_descriptors(module, response.descriptors)
    }

    fn connect_and_scan(
        pipe_name: &str,
        module: &CachedModule,
        request_id: &str,
    ) -> Result<SidecarScanResponse, ScannerFailure> {
        let wide_name = pipe_name
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect::<Vec<_>>();
        let connect_deadline = Instant::now() + Duration::from_secs(5);
        while unsafe { WaitNamedPipeW(wide_name.as_ptr(), 200) } == 0 {
            if Instant::now() >= connect_deadline {
                return Err(ScannerFailure::Crash);
            }
            thread::sleep(Duration::from_millis(10));
        }
        let handle = unsafe {
            CreateFileW(
                wide_name.as_ptr(),
                FILE_GENERIC_READ | FILE_GENERIC_WRITE,
                0,
                null_mut(),
                OPEN_EXISTING,
                0,
                null_mut(),
            )
        };
        if handle == INVALID_HANDLE_VALUE {
            return Err(ScannerFailure::Crash);
        }
        let handle = ClientHandle(handle);
        let request = serde_json::to_vec(&serde_json::json!({
            "protocolVersion": PLUGIN_HOST_PROTOCOL_VERSION,
            "requestId": request_id,
            "mode": "scanner",
            "kind": "scanModule",
            "payload": { "modulePath": module.source_path }
        }))
        .map_err(|_| ScannerFailure::InvalidDescriptor)?;
        write_message(handle.0, &request)?;
        let response = read_message(handle.0)?;
        serde_json::from_slice(&response).map_err(|_| ScannerFailure::InvalidDescriptor)
    }

    fn read_message(
        handle: windows_sys::Win32::Foundation::HANDLE,
    ) -> Result<Vec<u8>, ScannerFailure> {
        let mut length_bytes = [0_u8; 4];
        read_exact(handle, &mut length_bytes)?;
        let length = u32::from_le_bytes(length_bytes) as usize;
        if length == 0 || length > MAX_CONTROL_MESSAGE_BYTES {
            return Err(ScannerFailure::InvalidDescriptor);
        }
        let mut bytes = vec![0_u8; length];
        read_exact(handle, &mut bytes)?;
        Ok(bytes)
    }

    fn write_message(
        handle: windows_sys::Win32::Foundation::HANDLE,
        bytes: &[u8],
    ) -> Result<(), ScannerFailure> {
        if bytes.is_empty() || bytes.len() > MAX_CONTROL_MESSAGE_BYTES {
            return Err(ScannerFailure::InvalidDescriptor);
        }
        write_all(handle, &(bytes.len() as u32).to_le_bytes())?;
        write_all(handle, bytes)
    }

    fn read_exact(
        handle: windows_sys::Win32::Foundation::HANDLE,
        bytes: &mut [u8],
    ) -> Result<(), ScannerFailure> {
        let mut offset = 0;
        while offset < bytes.len() {
            let mut read = 0_u32;
            let ok = unsafe {
                ReadFile(
                    handle,
                    bytes[offset..].as_mut_ptr(),
                    (bytes.len() - offset) as u32,
                    &mut read,
                    null_mut(),
                )
            };
            if ok == 0 || read == 0 {
                return Err(ScannerFailure::Crash);
            }
            offset += read as usize;
        }
        Ok(())
    }

    fn write_all(
        handle: windows_sys::Win32::Foundation::HANDLE,
        bytes: &[u8],
    ) -> Result<(), ScannerFailure> {
        let mut offset = 0;
        while offset < bytes.len() {
            let mut written = 0_u32;
            let ok = unsafe {
                WriteFile(
                    handle,
                    bytes[offset..].as_ptr(),
                    (bytes.len() - offset) as u32,
                    &mut written,
                    null_mut(),
                )
            };
            if ok == 0 || written == 0 {
                return Err(ScannerFailure::Crash);
            }
            offset += written as usize;
        }
        Ok(())
    }
}

fn to_public_candidates(modules: Vec<CachedModule>) -> Vec<Vst3ModuleCandidate> {
    let quarantine = load_quarantine();
    modules
        .into_iter()
        .map(|module| Vst3ModuleCandidate {
            quarantined: quarantine
                .get(&module.source_key)
                .is_some_and(|entry| entry.binary_fingerprint == module.binary_fingerprint),
            descriptor_status: if module.descriptors.is_empty() {
                "needsIsolatedScanner".to_string()
            } else {
                "verifiedByIsolatedScanner".to_string()
            },
            source_key: module.source_key,
            module_filename: module.module_filename,
            binary_fingerprint: module.binary_fingerprint,
            location_scope: module.location_scope,
            descriptors: module.descriptors,
        })
        .collect()
}

fn validate_source_key(source_key: &str) -> Result<(), String> {
    if source_key.len() == 64 && source_key.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        Ok(())
    } else {
        Err("Invalid VST3 module source key.".to_string())
    }
}

fn load_quarantine() -> BTreeMap<String, QuarantineEntry> {
    load_json(&quarantine_path()).unwrap_or_default()
}

fn app_data_dir() -> PathBuf {
    if let Some(local_app_data) = std::env::var_os("LOCALAPPDATA") {
        return PathBuf::from(local_app_data).join("Pocket DAW");
    }
    std::env::temp_dir().join("Pocket DAW")
}

fn settings_path() -> PathBuf {
    app_data_dir().join(SETTINGS_FILE_NAME)
}

fn registry_path() -> PathBuf {
    app_data_dir().join(REGISTRY_FILE_NAME)
}

fn quarantine_path() -> PathBuf {
    app_data_dir().join(QUARANTINE_FILE_NAME)
}

fn load_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Option<T> {
    let bytes = fs::read(path).ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn save_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "VST3 settings path has no parent folder.".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|_| "Could not create the private VST3 settings folder.".to_string())?;
    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|_| "Could not serialize VST3 settings.".to_string())?;
    let temporary = path.with_extension("json.tmp");
    {
        let mut file = fs::File::create(&temporary)
            .map_err(|_| "Could not create a temporary VST3 settings file.".to_string())?;
        file.write_all(&bytes)
            .map_err(|_| "Could not write VST3 settings.".to_string())?;
        file.sync_all()
            .map_err(|_| "Could not finish writing VST3 settings.".to_string())?;
    }
    if path.exists() {
        fs::copy(&temporary, path)
            .map_err(|_| "Could not replace the prior VST3 settings file.".to_string())?;
        fs::remove_file(temporary)
            .map_err(|_| "Could not remove the temporary VST3 settings file.".to_string())?;
        Ok(())
    } else {
        fs::rename(temporary, path)
            .map_err(|_| "Could not activate the new VST3 settings file.".to_string())
    }
}

fn sha256_file(path: &Path) -> std::io::Result<String> {
    let mut file = fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn sha256_bytes(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn probe_plugin_host() -> Option<PluginHostProbe> {
    let executable = plugin_host_executable_path()?;
    probe_plugin_host_at(&executable)
}

pub(crate) fn plugin_host_executable_path() -> Option<PathBuf> {
    let current_executable = std::env::current_exe().ok()?;
    let folder = current_executable.parent()?;
    #[cfg(windows)]
    let filename = "pocket-daw-plugin-host.exe";
    #[cfg(not(windows))]
    let filename = "pocket-daw-plugin-host";
    Some(folder.join(filename))
}

fn probe_plugin_host_at(executable: &Path) -> Option<PluginHostProbe> {
    if !executable.is_file() {
        return None;
    }
    let mut child = Command::new(executable)
        .arg("--probe")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                if !status.success() {
                    return None;
                }
                break;
            }
            Ok(None) if started.elapsed() < PLUGIN_HOST_PROBE_TIMEOUT => {
                thread::sleep(Duration::from_millis(10));
            }
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    }
    let output = child.wait_with_output().ok()?;
    parse_plugin_host_probe(&output.stdout)
}

fn parse_plugin_host_probe(bytes: &[u8]) -> Option<PluginHostProbe> {
    let probe: PluginHostProbe = serde_json::from_slice(bytes).ok()?;
    if probe.component != "pocket-daw-plugin-host"
        || probe.protocol_version != PLUGIN_HOST_PROTOCOL_VERSION
        || probe.transport != "windowsNamedPipe"
        || probe.audio_block_frames != NATIVE_AUDIO_BLOCK_FRAMES
        || !probe.vst3_sdk_linked
        || !probe.scanner_available
        || !probe.audio_hosting_available
        || probe.vst3_sdk_tag != "v3.8.0_build_66"
        || probe.vst3_sdk_commit != "9fad9770f2ae8542ab1a548a68c1ad1ac690abe0"
    {
        return None;
    }
    Some(probe)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn official_windows_paths_match_the_vst3_spec_locations() {
        let roots = official_windows_vst3_scan_roots_from(
            Some(PathBuf::from(r"C:\Program Files")),
            Some(PathBuf::from(r"C:\Users\Sam\AppData\Local")),
        );
        assert_eq!(
            roots,
            vec![
                PathBuf::from(r"C:\Users\Sam\AppData\Local\Programs\Common\VST3"),
                PathBuf::from(r"C:\Program Files\Common Files\VST3"),
            ]
        );
    }

    #[test]
    fn user_roots_require_absolute_paths_and_are_deduplicated() {
        let roots = normalize_user_roots(vec![
            r"D:\Audio\VST3\".to_string(),
            r"d:\audio\vst3".to_string(),
            " ".to_string(),
        ])
        .unwrap();
        assert_eq!(roots, vec![r"D:\Audio\VST3"]);
        assert!(normalize_user_roots(vec!["plugins".to_string()]).is_err());
    }

    #[test]
    fn public_candidate_does_not_serialize_an_absolute_path() {
        let module = CachedModule {
            source_path: r"C:\Secret\Synth.vst3".to_string(),
            source_key: "a".repeat(64),
            module_filename: "Synth.vst3".to_string(),
            binary_fingerprint: "b".repeat(64),
            location_scope: "userAdded".to_string(),
            descriptors: Vec::new(),
        };
        let json = serde_json::to_string(&Vst3ModuleCandidate {
            source_key: module.source_key,
            module_filename: module.module_filename,
            binary_fingerprint: module.binary_fingerprint,
            location_scope: module.location_scope,
            descriptor_status: "needsIsolatedScanner".to_string(),
            quarantined: false,
            descriptors: module.descriptors,
        })
        .unwrap();
        assert!(!json.contains("Secret"));
        assert!(!json.contains("sourcePath"));
    }

    #[test]
    fn state_validation_checks_checksum_compression_and_limit() {
        use flate2::{write::GzEncoder, Compression};

        let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(b"opaque vendor state").unwrap();
        let compressed = encoder.finish().unwrap();
        assert_eq!(&compressed[..2], &[0x1f, 0x8b]);
        let checksum = sha256_bytes(&compressed);
        let validation = validate_state_snapshot(&compressed, &checksum).unwrap();
        assert!(validation.valid);
        assert_eq!(validation.uncompressed_bytes, 19);
        assert!(validate_state_snapshot(&compressed, &"0".repeat(64)).is_err());
        assert!(validate_state_snapshot(b"not-gzip", &sha256_bytes(b"not-gzip")).is_err());
        assert!(validate_state_snapshot(&vec![0; MAX_PLUGIN_STATE_BYTES + 1], "unused").is_err());
    }

    #[test]
    fn hosted_identity_contract_never_contains_a_path_field() {
        let identity = HostedPluginIdentity {
            format: "vst3".to_string(),
            class_id: "00112233445566778899aabbccddeeff".to_string(),
            vendor: "Vendor".to_string(),
            name: "Synth".to_string(),
            version: "1.0.0".to_string(),
            category: "instrument".to_string(),
            module_filename: "Synth.vst3".to_string(),
            binary_fingerprint: "f".repeat(64),
        };
        let json = serde_json::to_string(&identity).unwrap();
        assert!(!json.to_lowercase().contains("path"));
        assert!(json.contains("moduleFilename"));
        assert!(json.contains("binaryFingerprint"));
    }

    #[test]
    fn private_resolver_requires_one_verified_unquarantined_exact_binary() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let module_path = std::env::temp_dir().join(format!(
            "pocket-daw-resolver-{}-{unique}.vst3",
            std::process::id()
        ));
        fs::write(&module_path, b"deterministic resolver fixture").unwrap();
        let fingerprint = sha256_file(&module_path).unwrap();
        let identity = HostedPluginIdentity {
            format: "vst3".to_string(),
            class_id: "00112233445566778899aabbccddeeff".to_string(),
            vendor: "Fixture Vendor".to_string(),
            name: "Fixture".to_string(),
            version: "1.0".to_string(),
            category: "Fx".to_string(),
            module_filename: module_path
                .file_name()
                .unwrap()
                .to_string_lossy()
                .to_string(),
            binary_fingerprint: fingerprint.clone(),
        };
        let source_key = "a".repeat(64);
        let cached = CachedModule {
            source_path: module_path.to_string_lossy().to_string(),
            source_key: source_key.clone(),
            module_filename: identity.module_filename.clone(),
            binary_fingerprint: fingerprint.clone(),
            location_scope: "userAdded".to_string(),
            descriptors: vec![Vst3PluginDescriptor {
                identity: identity.clone(),
                module_source_key: source_key.clone(),
                supports_instrument_role: false,
                supports_effect_role: true,
                audio_input_bus_count: 1,
                audio_output_bus_count: 1,
                event_input_bus_count: 0,
                reported_latency_samples: 0,
            }],
        };
        let settings = Vst3BetaSettings {
            enabled: true,
            consent_version: Some(CONSENT_VERSION),
            user_scan_roots: Vec::new(),
        };
        let registry = RegistryCache {
            modules: vec![cached.clone()],
        };
        let none = BTreeMap::new();
        assert_eq!(
            resolve_hosted_module_from(&identity, &settings, &registry, &none).unwrap(),
            (module_path.clone(), "a".repeat(64))
        );

        let ambiguous = RegistryCache {
            modules: vec![cached.clone(), cached.clone()],
        };
        assert!(
            resolve_hosted_module_from(&identity, &settings, &ambiguous, &none)
                .unwrap_err()
                .contains("ambiguously")
        );
        let mut quarantine = BTreeMap::new();
        quarantine.insert(
            source_key.clone(),
            QuarantineEntry {
                source_key,
                binary_fingerprint: fingerprint,
                reason: QuarantineReason::Crash,
                failure_count: 1,
            },
        );
        assert!(
            resolve_hosted_module_from(&identity, &settings, &registry, &quarantine)
                .unwrap_err()
                .contains("quarantined")
        );

        fs::write(&module_path, b"changed resolver fixture").unwrap();
        assert!(
            resolve_hosted_module_from(&identity, &settings, &registry, &none)
                .unwrap_err()
                .contains("changed")
        );
        fs::remove_file(module_path).unwrap();
    }

    #[test]
    fn changed_binary_fingerprint_invalidates_prior_descriptors() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "pocket-daw-vst3-fingerprint-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&root).unwrap();
        let module_path = root.join("UpdatedSynth.vst3");
        fs::write(&module_path, b"new binary").unwrap();
        let source_key = sha256_bytes(module_path.to_string_lossy().to_lowercase().as_bytes());
        let descriptor = Vst3PluginDescriptor {
            identity: HostedPluginIdentity {
                format: "vst3".to_string(),
                class_id: "00112233445566778899aabbccddeeff".to_string(),
                vendor: "Vendor".to_string(),
                name: "Updated Synth".to_string(),
                version: "1.0.0".to_string(),
                category: "instrument".to_string(),
                module_filename: "UpdatedSynth.vst3".to_string(),
                binary_fingerprint: "old".to_string(),
            },
            module_source_key: source_key.clone(),
            supports_instrument_role: true,
            supports_effect_role: false,
            audio_input_bus_count: 0,
            audio_output_bus_count: 1,
            event_input_bus_count: 1,
            reported_latency_samples: 0,
        };
        let mut prior = BTreeMap::new();
        prior.insert(
            source_key,
            ("old fingerprint".to_string(), vec![descriptor]),
        );
        let inspected = inspect_module(&module_path, "userAdded", &prior).unwrap();
        assert!(inspected.descriptors.is_empty());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn sidecar_probe_requires_the_exact_scanner_only_sdk_protocol() {
        let valid = br#"{
            "component":"pocket-daw-plugin-host",
            "protocolVersion":2,
            "transport":"windowsNamedPipe",
            "vst3SdkLinked":true,
            "scannerAvailable":true,
            "audioHostingAvailable":true,
            "audioBlockFrames":128,
            "vst3SdkTag":"v3.8.0_build_66",
            "vst3SdkCommit":"9fad9770f2ae8542ab1a548a68c1ad1ac690abe0"
        }"#;
        let probe = parse_plugin_host_probe(valid).unwrap();
        assert!(probe.vst3_sdk_linked);
        assert!(probe.scanner_available);
        assert!(parse_plugin_host_probe(
            &String::from_utf8_lossy(valid)
                .replace("\"protocolVersion\":2", "\"protocolVersion\":3")
                .into_bytes()
        )
        .is_none());
        assert!(parse_plugin_host_probe(
            &String::from_utf8_lossy(valid)
                .replace(
                    "\"audioHostingAvailable\":true",
                    "\"audioHostingAvailable\":false"
                )
                .into_bytes()
        )
        .is_none());
    }

    #[test]
    fn verified_scanner_descriptors_add_identity_without_publishing_source_paths() {
        let module = CachedModule {
            source_path: r"C:\Private\Fixture.vst3".to_string(),
            source_key: "a".repeat(64),
            module_filename: "Fixture.vst3".to_string(),
            binary_fingerprint: "b".repeat(64),
            location_scope: "userAdded".to_string(),
            descriptors: Vec::new(),
        };
        let verified = verified_descriptors(
            &module,
            vec![SidecarClassDescriptor {
                class_id: "504441575343414E4649585455524531".to_string(),
                vendor: "Pocket DAW Tests".to_string(),
                name: "Fixture".to_string(),
                version: "1.2.3".to_string(),
                category: "Instrument|Synth".to_string(),
                supports_instrument_role: true,
                supports_effect_role: false,
            }],
        )
        .unwrap();
        assert_eq!(verified.len(), 1);
        assert_eq!(verified[0].identity.module_filename, "Fixture.vst3");
        assert_eq!(verified[0].module_source_key, "a".repeat(64));
        assert!(!serde_json::to_string(&verified)
            .unwrap()
            .contains("Private"));
    }
}
