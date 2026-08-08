use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::ffi::c_void;
use std::path::Path;

const PROTOCOL_VERSION: u32 = 2;
const AUDIO_BLOCK_FRAMES: usize = 128;
const MAX_CONTROL_MESSAGE_BYTES: usize = 1024 * 1024;
const PIPE_PREFIX: &str = r"\\.\pipe\pocket-daw-vst3-";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum HostMode {
    Scanner,
    Session,
}

impl HostMode {
    fn parse(value: &str) -> Option<Self> {
        match value {
            "scanner" => Some(Self::Scanner),
            "session" => Some(Self::Session),
            _ => None,
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Scanner => "scanner",
            Self::Session => "session",
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ControlRequest {
    protocol_version: u32,
    request_id: String,
    mode: String,
    kind: String,
    #[serde(default)]
    payload: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ControlResponse {
    protocol_version: u32,
    request_id: String,
    ok: bool,
    code: &'static str,
    scanner_available: bool,
    audio_hosting_available: bool,
    should_exit: bool,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    descriptors: Vec<ScannedClassDescriptor>,
    #[serde(skip_serializing_if = "Option::is_none")]
    instance: Option<SessionInstanceInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    elapsed_micros: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    deadline_missed: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    disabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    load_error_code: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    state_size: Option<u32>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    parameters: Vec<SessionParameterInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    editor_available: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    editor_open: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    editor_window_handle: Option<u64>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    programs: Vec<SessionProgramInfo>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    parameter_edits: Vec<SessionParameterEdit>,
    #[serde(skip_serializing_if = "Option::is_none")]
    restart_flags: Option<u32>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionInstanceInfo {
    instance_id: String,
    role: &'static str,
    input_channels: u32,
    output_channels: u32,
    event_input_buses: u32,
    latency_samples: u32,
    tail_samples: u32,
    state_limit_bytes: u32,
    shared_memory_bytes: u32,
    editor_available: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionParameterInfo {
    parameter_id: u32,
    title: String,
    short_title: String,
    units: String,
    step_count: i32,
    default_normalized: f64,
    current_normalized: f64,
    flags: u32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionProgramInfo {
    list_id: i32,
    program_index: i32,
    list_name: String,
    program_name: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionParameterEdit {
    parameter_id: u32,
    value: f64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScannedClassDescriptor {
    class_id: String,
    vendor: String,
    name: String,
    version: String,
    category: String,
    supports_instrument_role: bool,
    supports_effect_role: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProbeResponse {
    component: &'static str,
    protocol_version: u32,
    transport: &'static str,
    modes: [&'static str; 2],
    vst3_sdk_linked: bool,
    scanner_available: bool,
    audio_hosting_available: bool,
    audio_block_frames: usize,
    vst3_sdk_tag: &'static str,
    vst3_sdk_commit: &'static str,
}

fn probe_response() -> ProbeResponse {
    ProbeResponse {
        component: "pocket-daw-plugin-host",
        protocol_version: PROTOCOL_VERSION,
        transport: "windowsNamedPipe",
        modes: ["scanner", "session"],
        vst3_sdk_linked: true,
        scanner_available: true,
        audio_hosting_available: true,
        audio_block_frames: AUDIO_BLOCK_FRAMES,
        vst3_sdk_tag: env!("POCKET_DAW_VST3_SDK_TAG"),
        vst3_sdk_commit: env!("POCKET_DAW_VST3_SDK_COMMIT"),
    }
}

fn handle_request(mode: HostMode, request: &ControlRequest) -> ControlResponse {
    let valid_request_id = !request.request_id.is_empty() && request.request_id.len() <= 128;
    if request.protocol_version != PROTOCOL_VERSION {
        return response(request, false, "protocolMismatch", true);
    }
    if !valid_request_id || request.mode != mode.label() {
        return response(request, false, "invalidRequest", true);
    }
    if request.kind == "shutdown" {
        return response(request, true, "shutdown", true);
    }
    if request.kind == "hello" && request.payload.is_null() {
        return response(
            request,
            true,
            if mode == HostMode::Scanner {
                "scannerReady"
            } else {
                "sessionReady"
            },
            false,
        );
    }
    if mode == HostMode::Scanner && request.kind == "scanModule" {
        let module_path = request
            .payload
            .get("modulePath")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let path = Path::new(module_path);
        if !path.is_absolute()
            || !path.exists()
            || !path
                .extension()
                .and_then(|value| value.to_str())
                .is_some_and(|value| value.eq_ignore_ascii_case("vst3"))
        {
            return response(request, false, "invalidRequest", true);
        }
        return match scan_module(path) {
            Ok(descriptors) if !descriptors.is_empty() => {
                response_with_descriptors(request, descriptors)
            }
            Ok(_) => response(request, false, "invalidDescriptor", true),
            Err(ScanError::InvalidDescriptor) => {
                response(request, false, "invalidDescriptor", true)
            }
            Err(ScanError::LoadFailure) => response(request, false, "loadFailure", true),
        };
    }
    response(request, false, "unsupported", mode == HostMode::Scanner)
}

fn response(
    request: &ControlRequest,
    ok: bool,
    code: &'static str,
    should_exit: bool,
) -> ControlResponse {
    ControlResponse {
        protocol_version: PROTOCOL_VERSION,
        request_id: request.request_id.clone(),
        ok,
        code,
        scanner_available: true,
        audio_hosting_available: true,
        should_exit,
        descriptors: Vec::new(),
        instance: None,
        elapsed_micros: None,
        deadline_missed: None,
        disabled: None,
        load_error_code: None,
        state_size: None,
        parameters: Vec::new(),
        editor_available: None,
        editor_open: None,
        editor_window_handle: None,
        programs: Vec::new(),
        parameter_edits: Vec::new(),
        restart_flags: None,
    }
}

fn response_with_descriptors(
    request: &ControlRequest,
    descriptors: Vec<ScannedClassDescriptor>,
) -> ControlResponse {
    ControlResponse {
        descriptors,
        ..response(request, true, "scanComplete", true)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ScanError {
    LoadFailure,
    InvalidDescriptor,
}

#[cfg(windows)]
#[repr(C)]
#[derive(Clone, Copy)]
struct RawDescriptor {
    class_id: [std::ffi::c_char; 33],
    vendor: [std::ffi::c_char; 65],
    name: [std::ffi::c_char; 129],
    version: [std::ffi::c_char; 65],
    category: [std::ffi::c_char; 33],
    sub_categories: [std::ffi::c_char; 129],
    supports_instrument_role: u8,
    supports_effect_role: u8,
    reserved: [u8; 6],
}

#[cfg(windows)]
#[link(name = "pocket_daw_vst3_scanner", kind = "static")]
unsafe extern "C" {
    fn pocket_daw_vst3_scan_module(
        module_path: *const u16,
        output: *mut RawDescriptor,
        capacity: usize,
        output_count: *mut usize,
    ) -> i32;
}

#[cfg(windows)]
fn scan_module(path: &Path) -> Result<Vec<ScannedClassDescriptor>, ScanError> {
    use std::os::windows::ffi::OsStrExt;

    const CAPACITY: usize = 256;
    let wide_path = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let empty: RawDescriptor = unsafe { std::mem::zeroed() };
    let mut output = vec![empty; CAPACITY];
    let mut count = 0_usize;
    let code = unsafe {
        pocket_daw_vst3_scan_module(
            wide_path.as_ptr(),
            output.as_mut_ptr(),
            output.len(),
            &mut count,
        )
    };
    if code != 0 {
        return Err(if matches!(code, 6..=8) {
            ScanError::InvalidDescriptor
        } else {
            ScanError::LoadFailure
        });
    }
    if count > output.len() {
        return Err(ScanError::InvalidDescriptor);
    }
    let mut seen = HashSet::new();
    output
        .into_iter()
        .take(count)
        .map(|raw| descriptor_from_raw(raw, &mut seen))
        .collect()
}

#[cfg(not(windows))]
fn scan_module(_path: &Path) -> Result<Vec<ScannedClassDescriptor>, ScanError> {
    Err(ScanError::LoadFailure)
}

#[cfg(windows)]
fn descriptor_from_raw(
    raw: RawDescriptor,
    seen: &mut HashSet<String>,
) -> Result<ScannedClassDescriptor, ScanError> {
    let class_id = fixed_c_string(&raw.class_id, 32);
    if class_id.len() != 32
        || !class_id.bytes().all(|byte| byte.is_ascii_hexdigit())
        || !seen.insert(class_id.clone())
    {
        return Err(ScanError::InvalidDescriptor);
    }
    let name = fixed_c_string(&raw.name, 128);
    if name.is_empty() {
        return Err(ScanError::InvalidDescriptor);
    }
    let sub_categories = fixed_c_string(&raw.sub_categories, 128);
    let supports_instrument_role = raw.supports_instrument_role == 1;
    let supports_effect_role = raw.supports_effect_role == 1;
    if supports_instrument_role == supports_effect_role {
        return Err(ScanError::InvalidDescriptor);
    }
    Ok(ScannedClassDescriptor {
        class_id,
        vendor: nonempty_or(fixed_c_string(&raw.vendor, 64), "Unknown vendor"),
        name,
        version: nonempty_or(fixed_c_string(&raw.version, 64), "Unknown"),
        category: nonempty_or(
            sub_categories,
            if supports_instrument_role {
                "Instrument"
            } else {
                "Effect"
            },
        ),
        supports_instrument_role,
        supports_effect_role,
    })
}

#[cfg(windows)]
fn fixed_c_string<const N: usize>(bytes: &[std::ffi::c_char; N], max_chars: usize) -> String {
    let raw = bytes
        .iter()
        .map(|value| *value as u8)
        .take_while(|value| *value != 0)
        .collect::<Vec<_>>();
    String::from_utf8_lossy(&raw)
        .chars()
        .filter(|value| !value.is_control())
        .take(max_chars)
        .collect::<String>()
        .trim()
        .to_string()
}

fn nonempty_or(value: String, fallback: &str) -> String {
    if value.is_empty() {
        fallback.to_string()
    } else {
        value
    }
}

#[cfg(windows)]
const SHARED_MEMORY_PREFIX: &str = "Local\\PocketDAWVST3-";

#[cfg(windows)]
#[repr(C)]
#[derive(Clone, Copy, Default)]
struct RawSessionInfo {
    role: u32,
    input_channels: u32,
    output_channels: u32,
    event_input_buses: u32,
    latency_samples: u32,
    tail_samples: u32,
    state_limit_bytes: u32,
    shared_memory_bytes: u32,
}

#[cfg(windows)]
#[repr(C)]
#[derive(Clone, Copy)]
struct RawParameterDescriptor {
    parameter_id: u32,
    title: [std::ffi::c_char; 129],
    short_title: [std::ffi::c_char; 65],
    units: [std::ffi::c_char; 65],
    step_count: i32,
    default_normalized: f64,
    current_normalized: f64,
    flags: u32,
}

#[cfg(windows)]
#[repr(C)]
#[derive(Clone, Copy)]
struct RawProgramDescriptor {
    list_id: i32,
    program_index: i32,
    list_name: [std::ffi::c_char; 129],
    program_name: [std::ffi::c_char; 129],
}

#[cfg(windows)]
#[repr(C)]
#[derive(Clone, Copy, Default)]
struct RawParameterEdit {
    parameter_id: u32,
    value: f64,
}

#[cfg(windows)]
#[link(name = "pocket_daw_vst3_scanner", kind = "static")]
unsafe extern "C" {
    fn pocket_daw_vst3_shared_memory_bytes() -> usize;
    fn pocket_daw_vst3_shared_process_status(shared: *const c_void) -> u32;
    fn pocket_daw_vst3_shared_elapsed_micros(shared: *const c_void) -> u64;
    fn pocket_daw_vst3_shared_state_size(shared: *const c_void) -> u32;
    fn pocket_daw_vst3_session_create(
        module_path: *const u16,
        class_id: *const std::ffi::c_char,
        sample_rate: f64,
        info: *mut RawSessionInfo,
        error: *mut i32,
    ) -> *mut c_void;
    fn pocket_daw_vst3_session_process(
        session: *mut c_void,
        shared: *mut c_void,
        shared_bytes: usize,
        deadline_micros: u32,
    ) -> i32;
    fn pocket_daw_vst3_session_set_processing(session: *mut c_void, enabled: bool) -> i32;
    fn pocket_daw_vst3_session_get_state(
        session: *mut c_void,
        shared: *mut c_void,
        shared_bytes: usize,
    ) -> i32;
    fn pocket_daw_vst3_session_set_state(
        session: *mut c_void,
        shared: *mut c_void,
        shared_bytes: usize,
    ) -> i32;
    fn pocket_daw_vst3_session_destroy(session: *mut c_void);
    fn pocket_daw_vst3_session_query_parameters(
        session: *mut c_void,
        output: *mut RawParameterDescriptor,
        capacity: usize,
        output_count: *mut usize,
    ) -> i32;
    fn pocket_daw_vst3_session_set_parameter(
        session: *mut c_void,
        parameter_id: u32,
        value: f64,
    ) -> i32;
    fn pocket_daw_vst3_session_open_editor(
        session: *mut c_void,
        title: *const u16,
        owner_window_handle: u64,
        window_handle: *mut u64,
    ) -> i32;
    fn pocket_daw_vst3_session_close_editor(session: *mut c_void) -> i32;
    fn pocket_daw_vst3_session_pump_editor(session: *mut c_void) -> i32;
    fn pocket_daw_vst3_session_editor_available(session: *mut c_void) -> bool;
    fn pocket_daw_vst3_session_editor_open(session: *mut c_void) -> bool;
    fn pocket_daw_vst3_session_query_programs(
        session: *mut c_void,
        output: *mut RawProgramDescriptor,
        capacity: usize,
        output_count: *mut usize,
    ) -> i32;
    fn pocket_daw_vst3_session_select_program(
        session: *mut c_void,
        list_id: i32,
        program_index: i32,
    ) -> i32;
    fn pocket_daw_vst3_session_poll_edits(
        session: *mut c_void,
        output: *mut RawParameterEdit,
        capacity: usize,
        output_count: *mut usize,
        restart_flags: *mut u32,
    ) -> i32;
}

#[cfg(windows)]
struct SessionInstance {
    native: *mut c_void,
    mapping: windows_sys::Win32::Foundation::HANDLE,
    view: *mut c_void,
    info: SessionInstanceInfo,
    disabled: bool,
    audio: AudioWorker,
}

#[cfg(windows)]
enum AudioCommand {
    Process(u32),
    Shutdown,
}

#[cfg(windows)]
struct AudioWorker {
    sender: std::sync::mpsc::SyncSender<AudioCommand>,
    result_receiver: std::sync::mpsc::Receiver<(i32, u32, u64)>,
    thread: Option<std::thread::JoinHandle<()>>,
}

#[cfg(windows)]
impl AudioWorker {
    fn spawn(native: *mut c_void, view: *mut c_void, shared_bytes: usize) -> Result<Self, ()> {
        let (sender, receiver) = std::sync::mpsc::sync_channel::<AudioCommand>(1);
        let (result_sender, result_receiver) = std::sync::mpsc::sync_channel(1);
        let (ready_sender, ready_receiver) = std::sync::mpsc::sync_channel(0);
        let native_address = native as usize;
        let view_address = view as usize;
        let thread = std::thread::Builder::new()
            .name("pocket-daw-vst3-audio".to_string())
            .spawn(move || {
                let native = native_address as *mut c_void;
                let view = view_address as *mut c_void;
                let ready = unsafe { pocket_daw_vst3_session_set_processing(native, true) } == 0;
                let _ = ready_sender.send(ready);
                if !ready {
                    return;
                }
                while let Ok(command) = receiver.recv() {
                    match command {
                        AudioCommand::Process(deadline_micros) => {
                            let code = unsafe {
                                pocket_daw_vst3_session_process(
                                    native,
                                    view,
                                    shared_bytes,
                                    deadline_micros,
                                )
                            };
                            let status = unsafe { pocket_daw_vst3_shared_process_status(view) };
                            let elapsed = unsafe { pocket_daw_vst3_shared_elapsed_micros(view) };
                            let _ = result_sender.send((code, status, elapsed));
                        }
                        AudioCommand::Shutdown => break,
                    }
                }
                unsafe {
                    let _ = pocket_daw_vst3_session_set_processing(native, false);
                }
            })
            .map_err(|_| ())?;
        if ready_receiver.recv().ok() != Some(true) {
            let _ = thread.join();
            return Err(());
        }
        Ok(Self {
            sender,
            result_receiver,
            thread: Some(thread),
        })
    }

    fn process(&self, deadline_micros: u32) -> Result<(i32, u32, u64), ()> {
        self.sender
            .send(AudioCommand::Process(deadline_micros))
            .map_err(|_| ())?;
        self.result_receiver.recv().map_err(|_| ())
    }

    fn shutdown(&mut self) {
        let _ = self.sender.send(AudioCommand::Shutdown);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

#[cfg(windows)]
impl Drop for SessionInstance {
    fn drop(&mut self) {
        use windows_sys::Win32::Foundation::CloseHandle;
        use windows_sys::Win32::System::Memory::{UnmapViewOfFile, MEMORY_MAPPED_VIEW_ADDRESS};
        self.audio.shutdown();
        unsafe {
            pocket_daw_vst3_session_destroy(self.native);
            let _ = UnmapViewOfFile(MEMORY_MAPPED_VIEW_ADDRESS { Value: self.view });
            CloseHandle(self.mapping);
        }
    }
}

#[cfg(windows)]
#[derive(Default)]
struct SessionGraph {
    instances: HashMap<String, SessionInstance>,
}

#[cfg(windows)]
impl SessionGraph {
    fn handle(&mut self, request: &ControlRequest) -> ControlResponse {
        if request.protocol_version != PROTOCOL_VERSION
            || request.request_id.is_empty()
            || request.request_id.len() > 128
            || request.mode != "session"
        {
            return response(request, false, "invalidRequest", true);
        }
        match request.kind.as_str() {
            "hello" if request.payload.is_null() => response(request, true, "sessionReady", false),
            "shutdown" => response(request, true, "shutdown", true),
            "loadInstance" => self.load(request),
            "unloadInstance" => self.unload(request),
            "processBlock" => self.process(request),
            "getState" => self.state(request, true),
            "setState" => self.state(request, false),
            "queryStatus" => self.status(request),
            "queryParameters" => self.parameters(request),
            "setParameter" => self.set_parameter(request),
            "openEditor" => self.open_editor(request),
            "closeEditor" => self.close_editor(request),
            "queryPrograms" => self.programs(request),
            "selectProgram" => self.select_program(request),
            "pollParameterEdits" => self.poll_parameter_edits(request),
            _ => response(request, false, "unsupported", false),
        }
    }

    fn load(&mut self, request: &ControlRequest) -> ControlResponse {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::System::Memory::{
            MapViewOfFile, OpenFileMappingW, FILE_MAP_ALL_ACCESS,
        };

        let instance_id = field_string(&request.payload, "instanceId");
        let module_path = field_string(&request.payload, "modulePath");
        let class_id = field_string(&request.payload, "classId");
        let shared_memory_name = field_string(&request.payload, "sharedMemoryName");
        let sample_rate = request
            .payload
            .get("sampleRate")
            .and_then(Value::as_f64)
            .unwrap_or_default();
        if !valid_identifier(instance_id, 128)
            || self.instances.contains_key(instance_id)
            || !valid_class_id(class_id)
            || !shared_memory_name.starts_with(SHARED_MEMORY_PREFIX)
            || !valid_identifier(&shared_memory_name[SHARED_MEMORY_PREFIX.len()..], 120)
            || !(8_000.0..=384_000.0).contains(&sample_rate)
        {
            return response(request, false, "invalidRequest", false);
        }
        let path = Path::new(module_path);
        if !path.is_absolute()
            || !path.exists()
            || !path
                .extension()
                .and_then(|value| value.to_str())
                .is_some_and(|value| value.eq_ignore_ascii_case("vst3"))
        {
            return response(request, false, "invalidRequest", false);
        }
        let wide_path = path
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect::<Vec<_>>();
        let class_c = match std::ffi::CString::new(class_id) {
            Ok(value) => value,
            Err(_) => return response(request, false, "invalidRequest", false),
        };
        let wide_mapping = shared_memory_name
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect::<Vec<_>>();
        let mapping = unsafe { OpenFileMappingW(FILE_MAP_ALL_ACCESS, 0, wide_mapping.as_ptr()) };
        if mapping.is_null() {
            return response(request, false, "sharedMemoryUnavailable", false);
        }
        let shared_bytes = unsafe { pocket_daw_vst3_shared_memory_bytes() };
        let view = unsafe { MapViewOfFile(mapping, FILE_MAP_ALL_ACCESS, 0, 0, shared_bytes) };
        if view.Value.is_null() {
            unsafe { windows_sys::Win32::Foundation::CloseHandle(mapping) };
            return response(request, false, "sharedMemoryUnavailable", false);
        }
        let mut raw_info = RawSessionInfo::default();
        let mut error = 0_i32;
        let native = unsafe {
            pocket_daw_vst3_session_create(
                wide_path.as_ptr(),
                class_c.as_ptr(),
                sample_rate,
                &mut raw_info,
                &mut error,
            )
        };
        if native.is_null() || raw_info.shared_memory_bytes as usize != shared_bytes {
            unsafe {
                if !native.is_null() {
                    pocket_daw_vst3_session_destroy(native);
                }
                let _ = windows_sys::Win32::System::Memory::UnmapViewOfFile(view);
                windows_sys::Win32::Foundation::CloseHandle(mapping);
            }
            return ControlResponse {
                load_error_code: Some(error),
                ..response(request, false, "loadFailure", false)
            };
        }
        let info = SessionInstanceInfo {
            instance_id: instance_id.to_string(),
            role: if raw_info.role == 1 {
                "instrument"
            } else {
                "effect"
            },
            input_channels: raw_info.input_channels,
            output_channels: raw_info.output_channels,
            event_input_buses: raw_info.event_input_buses,
            latency_samples: raw_info.latency_samples,
            tail_samples: raw_info.tail_samples,
            state_limit_bytes: raw_info.state_limit_bytes,
            shared_memory_bytes: raw_info.shared_memory_bytes,
            editor_available: unsafe { pocket_daw_vst3_session_editor_available(native) },
        };
        let audio = match AudioWorker::spawn(native, view.Value, shared_bytes) {
            Ok(worker) => worker,
            Err(_) => {
                unsafe {
                    pocket_daw_vst3_session_destroy(native);
                    let _ = windows_sys::Win32::System::Memory::UnmapViewOfFile(view);
                    windows_sys::Win32::Foundation::CloseHandle(mapping);
                }
                return response(request, false, "audioThreadFailure", false);
            }
        };
        self.instances.insert(
            instance_id.to_string(),
            SessionInstance {
                native,
                mapping,
                view: view.Value,
                info: info.clone(),
                disabled: false,
                audio,
            },
        );
        ControlResponse {
            instance: Some(info),
            ..response(request, true, "instanceLoaded", false)
        }
    }

    fn unload(&mut self, request: &ControlRequest) -> ControlResponse {
        let instance_id = field_string(&request.payload, "instanceId");
        if self.instances.remove(instance_id).is_some() {
            response(request, true, "instanceUnloaded", false)
        } else {
            response(request, false, "instanceMissing", false)
        }
    }

    fn process(&mut self, request: &ControlRequest) -> ControlResponse {
        let instance_id = field_string(&request.payload, "instanceId");
        let deadline_micros = request
            .payload
            .get("deadlineMicros")
            .and_then(Value::as_u64)
            .and_then(|value| u32::try_from(value).ok())
            .unwrap_or_default();
        let Some(instance) = self.instances.get_mut(instance_id) else {
            return response(request, false, "instanceMissing", false);
        };
        if instance.disabled {
            return ControlResponse {
                disabled: Some(true),
                ..response(request, false, "instanceDisabled", false)
            };
        }
        let (code, status, elapsed) = match instance.audio.process(deadline_micros) {
            Ok(result) => result,
            Err(_) => {
                instance.disabled = true;
                return ControlResponse {
                    disabled: Some(true),
                    ..response(request, false, "audioThreadFailure", false)
                };
            }
        };
        let deadline_missed = code == 3 || status == 3;
        if !matches!(code, 0 | 3) {
            instance.disabled = true;
        }
        ControlResponse {
            elapsed_micros: Some(elapsed),
            deadline_missed: Some(deadline_missed),
            disabled: Some(instance.disabled),
            ..response(
                request,
                code == 0,
                if code == 0 {
                    "blockProcessed"
                } else if deadline_missed {
                    "deadlineMissed"
                } else {
                    "processFailure"
                },
                false,
            )
        }
    }

    fn state(&mut self, request: &ControlRequest, get: bool) -> ControlResponse {
        let instance_id = field_string(&request.payload, "instanceId");
        let Some(instance) = self.instances.get_mut(instance_id) else {
            return response(request, false, "instanceMissing", false);
        };
        let code = unsafe {
            if get {
                pocket_daw_vst3_session_get_state(
                    instance.native,
                    instance.view,
                    instance.info.shared_memory_bytes as usize,
                )
            } else {
                pocket_daw_vst3_session_set_state(
                    instance.native,
                    instance.view,
                    instance.info.shared_memory_bytes as usize,
                )
            }
        };
        let state_size = unsafe { shared_state_size(instance.view) };
        ControlResponse {
            state_size: Some(state_size),
            ..response(
                request,
                code == 0,
                if code == 0 {
                    "stateReady"
                } else {
                    "stateFailure"
                },
                false,
            )
        }
    }

    fn status(&self, request: &ControlRequest) -> ControlResponse {
        let instance_id = field_string(&request.payload, "instanceId");
        let Some(instance) = self.instances.get(instance_id) else {
            return response(request, false, "instanceMissing", false);
        };
        ControlResponse {
            instance: Some(instance.info.clone()),
            disabled: Some(instance.disabled),
            ..response(request, true, "instanceStatus", false)
        }
    }

    fn parameters(&self, request: &ControlRequest) -> ControlResponse {
        const CAPACITY: usize = 4096;
        let instance_id = field_string(&request.payload, "instanceId");
        let Some(instance) = self.instances.get(instance_id) else {
            return response(request, false, "instanceMissing", false);
        };
        let empty: RawParameterDescriptor = unsafe { std::mem::zeroed() };
        let mut raw = vec![empty; CAPACITY];
        let mut count = 0;
        let code = unsafe {
            pocket_daw_vst3_session_query_parameters(
                instance.native,
                raw.as_mut_ptr(),
                raw.len(),
                &mut count,
            )
        };
        if code != 0 || count > raw.len() {
            return response(request, false, "parameterQueryFailure", false);
        }
        let parameters = raw
            .into_iter()
            .take(count)
            .map(|value| SessionParameterInfo {
                parameter_id: value.parameter_id,
                title: fixed_c_string(&value.title, 128),
                short_title: fixed_c_string(&value.short_title, 64),
                units: fixed_c_string(&value.units, 64),
                step_count: value.step_count,
                default_normalized: value.default_normalized,
                current_normalized: value.current_normalized,
                flags: value.flags,
            })
            .collect();
        ControlResponse {
            parameters,
            ..response(request, true, "parametersReady", false)
        }
    }

    fn set_parameter(&mut self, request: &ControlRequest) -> ControlResponse {
        let instance_id = field_string(&request.payload, "instanceId");
        let parameter_id = request
            .payload
            .get("parameterId")
            .and_then(Value::as_u64)
            .and_then(|value| u32::try_from(value).ok());
        let value = request.payload.get("value").and_then(Value::as_f64);
        let Some(instance) = self.instances.get_mut(instance_id) else {
            return response(request, false, "instanceMissing", false);
        };
        let (Some(parameter_id), Some(value)) = (parameter_id, value) else {
            return response(request, false, "invalidRequest", false);
        };
        let code =
            unsafe { pocket_daw_vst3_session_set_parameter(instance.native, parameter_id, value) };
        response(
            request,
            code == 0,
            if code == 0 {
                "parameterSet"
            } else {
                "parameterFailure"
            },
            false,
        )
    }

    fn open_editor(&mut self, request: &ControlRequest) -> ControlResponse {
        let instance_id = field_string(&request.payload, "instanceId");
        let title = field_string(&request.payload, "title");
        let owner_window_handle = request
            .payload
            .get("ownerWindowHandle")
            .and_then(Value::as_u64)
            .unwrap_or_default();
        let Some(instance) = self.instances.get_mut(instance_id) else {
            return response(request, false, "instanceMissing", false);
        };
        if title.is_empty() || title.len() > 256 || owner_window_handle == 0 {
            return response(request, false, "invalidRequest", false);
        }
        let wide = title
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect::<Vec<_>>();
        let mut handle = 0;
        let code = unsafe {
            pocket_daw_vst3_session_open_editor(
                instance.native,
                wide.as_ptr(),
                owner_window_handle,
                &mut handle,
            )
        };
        ControlResponse {
            editor_available: Some(code == 0 || instance.info.editor_available),
            editor_open: Some(
                code == 0 && unsafe { pocket_daw_vst3_session_editor_open(instance.native) },
            ),
            editor_window_handle: (code == 0).then_some(handle),
            ..response(
                request,
                code == 0,
                if code == 0 {
                    "editorOpened"
                } else {
                    "editorUnavailable"
                },
                false,
            )
        }
    }

    fn close_editor(&mut self, request: &ControlRequest) -> ControlResponse {
        let instance_id = field_string(&request.payload, "instanceId");
        let Some(instance) = self.instances.get_mut(instance_id) else {
            return response(request, false, "instanceMissing", false);
        };
        let code = unsafe { pocket_daw_vst3_session_close_editor(instance.native) };
        ControlResponse {
            editor_open: Some(false),
            ..response(
                request,
                code == 0,
                if code == 0 {
                    "editorClosed"
                } else {
                    "editorFailure"
                },
                false,
            )
        }
    }

    fn pump_editors(&mut self) {
        for instance in self.instances.values_mut() {
            unsafe {
                let _ = pocket_daw_vst3_session_pump_editor(instance.native);
            }
        }
    }

    fn programs(&self, request: &ControlRequest) -> ControlResponse {
        const CAPACITY: usize = 4096;
        let instance_id = field_string(&request.payload, "instanceId");
        let Some(instance) = self.instances.get(instance_id) else {
            return response(request, false, "instanceMissing", false);
        };
        let empty: RawProgramDescriptor = unsafe { std::mem::zeroed() };
        let mut raw = vec![empty; CAPACITY];
        let mut count = 0;
        let code = unsafe {
            pocket_daw_vst3_session_query_programs(
                instance.native,
                raw.as_mut_ptr(),
                raw.len(),
                &mut count,
            )
        };
        if code != 0 || count > raw.len() {
            return response(request, false, "programQueryFailure", false);
        }
        let programs = raw
            .into_iter()
            .take(count)
            .map(|value| SessionProgramInfo {
                list_id: value.list_id,
                program_index: value.program_index,
                list_name: fixed_c_string(&value.list_name, 128),
                program_name: fixed_c_string(&value.program_name, 128),
            })
            .collect();
        ControlResponse {
            programs,
            ..response(request, true, "programsReady", false)
        }
    }

    fn select_program(&mut self, request: &ControlRequest) -> ControlResponse {
        let instance_id = field_string(&request.payload, "instanceId");
        let list_id = request
            .payload
            .get("listId")
            .and_then(Value::as_i64)
            .and_then(|v| i32::try_from(v).ok());
        let program_index = request
            .payload
            .get("programIndex")
            .and_then(Value::as_i64)
            .and_then(|v| i32::try_from(v).ok());
        let Some(instance) = self.instances.get_mut(instance_id) else {
            return response(request, false, "instanceMissing", false);
        };
        let (Some(list_id), Some(program_index)) = (list_id, program_index) else {
            return response(request, false, "invalidRequest", false);
        };
        let code = unsafe {
            pocket_daw_vst3_session_select_program(instance.native, list_id, program_index)
        };
        response(
            request,
            code == 0,
            if code == 0 {
                "programSelected"
            } else {
                "programFailure"
            },
            false,
        )
    }

    fn poll_parameter_edits(&mut self, request: &ControlRequest) -> ControlResponse {
        const CAPACITY: usize = 1024;
        let instance_id = field_string(&request.payload, "instanceId");
        let Some(instance) = self.instances.get_mut(instance_id) else {
            return response(request, false, "instanceMissing", false);
        };
        let mut raw = vec![RawParameterEdit::default(); CAPACITY];
        let mut count = 0;
        let mut restart_flags = 0;
        let code = unsafe {
            pocket_daw_vst3_session_poll_edits(
                instance.native,
                raw.as_mut_ptr(),
                raw.len(),
                &mut count,
                &mut restart_flags,
            )
        };
        if code != 0 || count > raw.len() {
            return response(request, false, "editPollFailure", false);
        }
        let parameter_edits = raw
            .into_iter()
            .take(count)
            .map(|value| SessionParameterEdit {
                parameter_id: value.parameter_id,
                value: value.value,
            })
            .collect();
        ControlResponse {
            parameter_edits,
            restart_flags: Some(restart_flags),
            editor_open: Some(unsafe { pocket_daw_vst3_session_editor_open(instance.native) }),
            ..response(request, true, "editsReady", false)
        }
    }
}

fn field_string<'a>(payload: &'a Value, name: &str) -> &'a str {
    payload
        .get(name)
        .and_then(Value::as_str)
        .unwrap_or_default()
}

fn valid_identifier(value: &str, max_len: usize) -> bool {
    !value.is_empty()
        && value.len() <= max_len
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

fn valid_class_id(value: &str) -> bool {
    value.len() == 32 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

#[cfg(windows)]
unsafe fn shared_state_size(view: *mut c_void) -> u32 {
    unsafe { pocket_daw_vst3_shared_state_size(view) }
}

fn parse_args(args: impl IntoIterator<Item = String>) -> Result<Action, String> {
    let args = args.into_iter().collect::<Vec<_>>();
    if args.iter().any(|arg| arg == "--probe") {
        return Ok(Action::Probe);
    }
    let mode = argument_value(&args, "--mode")
        .and_then(HostMode::parse)
        .ok_or_else(|| "Expected --mode scanner or --mode session.".to_string())?;
    let pipe_name = argument_value(&args, "--pipe")
        .ok_or_else(|| "Expected a private Pocket DAW --pipe name.".to_string())?;
    validate_pipe_name(pipe_name)?;
    Ok(Action::Serve {
        mode,
        pipe_name: pipe_name.to_string(),
    })
}

fn argument_value<'a>(args: &'a [String], name: &str) -> Option<&'a str> {
    args.windows(2)
        .find(|pair| pair[0] == name)
        .map(|pair| pair[1].as_str())
}

fn validate_pipe_name(pipe_name: &str) -> Result<(), String> {
    let suffix = pipe_name
        .strip_prefix(PIPE_PREFIX)
        .ok_or_else(|| "Named pipe must use the Pocket DAW VST3 prefix.".to_string())?;
    if suffix.is_empty()
        || suffix.len() > 120
        || !suffix
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
    {
        return Err("Named pipe suffix is invalid.".to_string());
    }
    Ok(())
}

enum Action {
    Probe,
    Serve { mode: HostMode, pipe_name: String },
}

fn run() -> Result<(), String> {
    match parse_args(std::env::args().skip(1))? {
        Action::Probe => {
            println!(
                "{}",
                serde_json::to_string(&probe_response())
                    .map_err(|_| "Could not serialize sidecar probe.".to_string())?
            );
            Ok(())
        }
        Action::Serve { mode, pipe_name } => serve_named_pipe(mode, &pipe_name),
    }
}

fn main() {
    if let Err(message) = run() {
        eprintln!("Pocket DAW plug-in host: {message}");
        std::process::exit(2);
    }
}

#[cfg(windows)]
fn serve_named_pipe(mode: HostMode, pipe_name: &str) -> Result<(), String> {
    windows_pipe::serve(mode, pipe_name)
}

#[cfg(not(windows))]
fn serve_named_pipe(_mode: HostMode, _pipe_name: &str) -> Result<(), String> {
    Err("The Pocket DAW plug-in host is Windows-only.".to_string())
}

#[cfg(windows)]
mod windows_pipe {
    use super::*;
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::Foundation::{
        CloseHandle, GetLastError, ERROR_PIPE_CONNECTED, INVALID_HANDLE_VALUE,
    };
    use windows_sys::Win32::Storage::FileSystem::{
        FlushFileBuffers, ReadFile, WriteFile, FILE_FLAG_FIRST_PIPE_INSTANCE, PIPE_ACCESS_DUPLEX,
    };
    use windows_sys::Win32::System::Pipes::{
        ConnectNamedPipe, CreateNamedPipeW, DisconnectNamedPipe, PeekNamedPipe,
        PIPE_READMODE_MESSAGE, PIPE_REJECT_REMOTE_CLIENTS, PIPE_TYPE_MESSAGE, PIPE_WAIT,
    };

    struct PipeHandle(windows_sys::Win32::Foundation::HANDLE);

    impl Drop for PipeHandle {
        fn drop(&mut self) {
            unsafe {
                DisconnectNamedPipe(self.0);
                CloseHandle(self.0);
            }
        }
    }

    pub(super) fn serve(mode: HostMode, pipe_name: &str) -> Result<(), String> {
        let wide_name = pipe_name
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect::<Vec<_>>();
        let handle = unsafe {
            CreateNamedPipeW(
                wide_name.as_ptr(),
                PIPE_ACCESS_DUPLEX | FILE_FLAG_FIRST_PIPE_INSTANCE,
                PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS,
                1,
                64 * 1024,
                64 * 1024,
                0,
                null(),
            )
        };
        if handle == INVALID_HANDLE_VALUE {
            return Err("Could not create the private named pipe.".to_string());
        }
        let handle = PipeHandle(handle);
        let connected = unsafe { ConnectNamedPipe(handle.0, null_mut()) };
        if connected == 0 && unsafe { GetLastError() } != ERROR_PIPE_CONNECTED {
            return Err("Could not accept the named-pipe client.".to_string());
        }

        let mut session_graph = SessionGraph::default();
        loop {
            let bytes = if mode == HostMode::Session {
                read_message_with_editor_pump(handle.0, &mut session_graph)?
            } else {
                read_message(handle.0)?
            };
            let request: ControlRequest = serde_json::from_slice(&bytes)
                .map_err(|_| "Named-pipe request was not valid JSON.".to_string())?;
            let response = if mode == HostMode::Session {
                session_graph.handle(&request)
            } else {
                handle_request(mode, &request)
            };
            let should_exit = response.should_exit;
            let encoded = serde_json::to_vec(&response)
                .map_err(|_| "Could not serialize named-pipe response.".to_string())?;
            write_message(handle.0, &encoded)?;
            if should_exit {
                break;
            }
        }
        unsafe {
            FlushFileBuffers(handle.0);
        }
        Ok(())
    }

    fn read_message(handle: windows_sys::Win32::Foundation::HANDLE) -> Result<Vec<u8>, String> {
        let mut length_bytes = [0_u8; 4];
        read_exact(handle, &mut length_bytes)?;
        let length = u32::from_le_bytes(length_bytes) as usize;
        if length == 0 || length > MAX_CONTROL_MESSAGE_BYTES {
            return Err("Named-pipe request size is invalid.".to_string());
        }
        let mut bytes = vec![0_u8; length];
        read_exact(handle, &mut bytes)?;
        Ok(bytes)
    }

    fn read_message_with_editor_pump(
        handle: windows_sys::Win32::Foundation::HANDLE,
        graph: &mut SessionGraph,
    ) -> Result<Vec<u8>, String> {
        loop {
            let mut available = 0_u32;
            let ok = unsafe {
                PeekNamedPipe(
                    handle,
                    null_mut(),
                    0,
                    null_mut(),
                    &mut available,
                    null_mut(),
                )
            };
            if ok == 0 {
                return Err("Named-pipe client disconnected while waiting.".to_string());
            }
            if available >= 4 {
                break;
            }
            graph.pump_editors();
            std::thread::sleep(std::time::Duration::from_millis(8));
        }
        read_message(handle)
    }

    fn write_message(
        handle: windows_sys::Win32::Foundation::HANDLE,
        bytes: &[u8],
    ) -> Result<(), String> {
        if bytes.is_empty() || bytes.len() > MAX_CONTROL_MESSAGE_BYTES {
            return Err("Named-pipe response size is invalid.".to_string());
        }
        write_all(handle, &(bytes.len() as u32).to_le_bytes())?;
        write_all(handle, bytes)
    }

    fn read_exact(
        handle: windows_sys::Win32::Foundation::HANDLE,
        bytes: &mut [u8],
    ) -> Result<(), String> {
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
                return Err("Named-pipe client disconnected while reading.".to_string());
            }
            offset += read as usize;
        }
        Ok(())
    }

    fn write_all(
        handle: windows_sys::Win32::Foundation::HANDLE,
        bytes: &[u8],
    ) -> Result<(), String> {
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
                return Err("Named-pipe client disconnected while writing.".to_string());
            }
            offset += written as usize;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(mode: &str, kind: &str) -> ControlRequest {
        ControlRequest {
            protocol_version: PROTOCOL_VERSION,
            request_id: "request-1".to_string(),
            mode: mode.to_string(),
            kind: kind.to_string(),
            payload: Value::Null,
        }
    }

    #[test]
    fn probe_is_truthful_about_scanner_and_session_sdk_linkage() {
        let probe = probe_response();
        assert_eq!(probe.protocol_version, 2);
        assert!(probe.vst3_sdk_linked);
        assert!(probe.scanner_available);
        assert!(probe.audio_hosting_available);
        assert_eq!(probe.audio_block_frames, 128);
        assert_eq!(probe.vst3_sdk_tag, "v3.8.0_build_66");
    }

    #[test]
    fn scanner_validates_paths_and_static_dispatch_defers_session_operations() {
        let mut scan = request("scanner", "scanModule");
        scan.payload = serde_json::json!({ "modulePath": "relative/unsafe.vst3" });
        let scan_response = handle_request(HostMode::Scanner, &scan);
        assert!(!scan_response.ok);
        assert_eq!(scan_response.code, "invalidRequest");
        assert!(scan_response.should_exit);

        let load = request("session", "loadInstance");
        let load_response = handle_request(HostMode::Session, &load);
        assert!(!load_response.ok);
        assert_eq!(load_response.code, "unsupported");
        assert!(!load_response.should_exit);
    }

    #[cfg(windows)]
    #[test]
    fn pinned_sdk_scans_the_deterministic_x64_fixture() {
        let fixture = Path::new(env!("POCKET_DAW_VST3_SCANNER_FIXTURE"));
        assert!(
            fixture.is_dir(),
            "fixture bundle should be generated outside source"
        );
        let descriptors = scan_module(fixture).expect("scan fixture");
        assert_eq!(descriptors.len(), 2);
        assert_eq!(descriptors[0].class_id, "504441575343414E4649585455524531");
        assert_eq!(descriptors[0].vendor, "Pocket DAW Tests");
        assert_eq!(descriptors[0].name, "Pocket DAW Fixture Instrument");
        assert_eq!(descriptors[0].version, "2.0.0");
        assert_eq!(descriptors[0].category, "Instrument|Synth");
        assert!(descriptors[0].supports_instrument_role);
        assert!(!descriptors[0].supports_effect_role);
        assert_eq!(descriptors[1].class_id, "504441575343414E4649585455524533");
        assert_eq!(descriptors[1].name, "Pocket DAW Fixture Effect");
        assert!(!descriptors[1].supports_instrument_role);
        assert!(descriptors[1].supports_effect_role);
    }

    #[test]
    fn protocol_and_pipe_names_are_strictly_validated() {
        let mut wrong_protocol = request("session", "hello");
        wrong_protocol.protocol_version = 3;
        assert_eq!(
            handle_request(HostMode::Session, &wrong_protocol).code,
            "protocolMismatch"
        );
        assert!(validate_pipe_name(r"\\.\pipe\pocket-daw-vst3-session-123").is_ok());
        assert!(validate_pipe_name(r"\\.\pipe\other-app").is_err());
        assert!(validate_pipe_name(r"\\.\pipe\pocket-daw-vst3-..\escape").is_err());
    }

    #[test]
    fn parse_args_requires_an_explicit_mode_and_private_pipe() {
        assert!(matches!(
            parse_args(vec!["--probe".to_string()]).unwrap(),
            Action::Probe
        ));
        assert!(parse_args(vec!["--mode".to_string(), "scanner".to_string()]).is_err());
    }
}
