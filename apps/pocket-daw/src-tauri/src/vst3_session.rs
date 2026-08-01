use crate::vst3_foundation::{
    plugin_host_executable_path, resolve_hosted_module_and_source, resolve_hosted_role,
    vst3_beta_quarantine_module, HostedPluginIdentity, QuarantineReason, MAX_PLUGIN_STATE_BYTES,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, HashMap};
use std::sync::{Arc, Mutex, OnceLock};

pub(crate) const VST3_BLOCK_FRAMES: usize = 128;
pub(crate) const MAX_HOSTED_LATENCY_SAMPLES: u32 = 262_144;
pub(crate) const MAX_HOSTED_TAIL_SAMPLES: u32 = 5_760_000;
const PROTOCOL_VERSION: u32 = 2;
const SHARED_BYTES: usize = 33_566_848;
const INPUT_OFFSET: usize = 128;
const OUTPUT_OFFSET: usize = INPUT_OFFSET + 2 * VST3_BLOCK_FRAMES * 4;
const EVENT_OFFSET: usize = OUTPUT_OFFSET + 2 * VST3_BLOCK_FRAMES * 4;
const SHARED_EVENT_BYTES: usize = 24;
const SHARED_PARAMETER_BYTES: usize = 16;
const PARAMETER_OFFSET: usize = EVENT_OFFSET + 256 * SHARED_EVENT_BYTES;
const STATE_OFFSET: usize = PARAMETER_OFFSET + 256 * SHARED_PARAMETER_BYTES;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HostedStatePayload {
    pub encoding: String,
    pub data: String,
    pub checksum: String,
    pub size_bytes: usize,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HostedAutomationPoint {
    pub time_seconds: f64,
    pub value: f64,
    pub curve: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HostedParameterAutomation {
    pub parameter_id: String,
    #[serde(default)]
    pub points: Vec<HostedAutomationPoint>,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HostedInstancePayload {
    pub instance_id: String,
    pub role: String,
    pub track_id: String,
    #[serde(default)]
    pub chain_id: Option<String>,
    pub enabled: bool,
    pub identity: HostedPluginIdentity,
    #[serde(default)]
    pub state: Option<HostedStatePayload>,
    #[serde(default)]
    pub parameters: BTreeMap<String, f64>,
    #[serde(default)]
    pub automation: Vec<HostedParameterAutomation>,
}

#[derive(Clone, Copy, Debug, Default)]
pub(crate) struct HostedNoteEvent {
    pub note_on: bool,
    pub sample_offset: u32,
    pub note_id: i32,
    pub channel: i16,
    pub pitch: i16,
    pub value: f32,
    pub tuning: f32,
}

#[derive(Clone, Copy, Debug, Default)]
pub(crate) struct HostedParameterPoint {
    pub parameter_id: u32,
    pub sample_offset: u32,
    pub value: f64,
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct HostedProcessContext {
    pub project_time_samples: i64,
    pub continuous_time_samples: i64,
    pub project_ppq: f64,
    pub bar_position_ppq: f64,
    pub loop_start_ppq: f64,
    pub loop_end_ppq: f64,
    pub tempo: f64,
    pub numerator: i32,
    pub denominator: i32,
    pub playing: bool,
    pub recording: bool,
    pub looping: bool,
}

#[derive(Clone, Debug)]
pub(crate) struct HostedProcessResult {
    pub output: [[f32; VST3_BLOCK_FRAMES]; 2],
    pub deadline_missed: bool,
    pub disabled: bool,
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct HostedInstanceRuntimeInfo {
    pub instrument: bool,
    pub input_channels: u32,
    pub output_channels: u32,
    pub latency_samples: u32,
    pub tail_samples: u32,
    pub editor_available: bool,
}

fn bounded_hosted_timing(latency: u64, tail: u64) -> (u32, u32) {
    (
        latency.min(MAX_HOSTED_LATENCY_SAMPLES as u64) as u32,
        tail.min(MAX_HOSTED_TAIL_SAMPLES as u64) as u32,
    )
}

#[cfg(windows)]
mod windows {
    use super::*;
    use base64::Engine;
    use flate2::{read::GzDecoder, write::GzEncoder, Compression};
    use serde_json::Value;
    use sha2::{Digest, Sha256};
    use std::io::{Read, Write};
    use std::process::{Child, Command, Stdio};
    use std::ptr::{null, null_mut};
    use std::time::{Duration, Instant};
    use windows_sys::Win32::Foundation::{
        CloseHandle, GetLastError, ERROR_ALREADY_EXISTS, HANDLE, INVALID_HANDLE_VALUE,
    };
    use windows_sys::Win32::Storage::FileSystem::{
        CreateFileW, ReadFile, WriteFile, FILE_GENERIC_READ, FILE_GENERIC_WRITE, OPEN_EXISTING,
    };
    use windows_sys::Win32::System::Memory::{
        CreateFileMappingW, MapViewOfFile, UnmapViewOfFile, FILE_MAP_ALL_ACCESS,
        MEMORY_MAPPED_VIEW_ADDRESS, PAGE_READWRITE,
    };
    use windows_sys::Win32::System::Pipes::{PeekNamedPipe, WaitNamedPipeW};

    #[repr(C)]
    struct SharedHeader {
        magic: u32,
        version: u32,
        total_bytes: u32,
        max_frames: u32,
        frame_count: u32,
        input_channels: u32,
        output_channels: u32,
        event_count: u32,
        parameter_count: u32,
        state_size: u32,
        transport_flags: u32,
        process_status: u32,
        project_time_samples: i64,
        continuous_time_samples: i64,
        sample_rate: f64,
        project_ppq: f64,
        bar_position_ppq: f64,
        loop_start_ppq: f64,
        loop_end_ppq: f64,
        tempo: f64,
        numerator: i32,
        denominator: i32,
        elapsed_micros: u64,
    }

    #[repr(C)]
    struct SharedEvent {
        kind: u32,
        sample_offset: u32,
        note_id: i32,
        channel: i16,
        pitch: i16,
        value: f32,
        tuning: f32,
    }

    #[repr(C)]
    struct SharedParameter {
        parameter_id: u32,
        sample_offset: u32,
        value: f64,
    }

    struct Mapping {
        handle: HANDLE,
        view: *mut u8,
        name: String,
    }

    unsafe impl Send for Mapping {}

    impl Mapping {
        fn create(name: String) -> Result<Self, String> {
            let wide = name
                .encode_utf16()
                .chain(std::iter::once(0))
                .collect::<Vec<_>>();
            let handle = unsafe {
                CreateFileMappingW(
                    INVALID_HANDLE_VALUE,
                    null(),
                    PAGE_READWRITE,
                    (SHARED_BYTES as u64 >> 32) as u32,
                    SHARED_BYTES as u32,
                    wide.as_ptr(),
                )
            };
            if handle.is_null() {
                return Err("Could not create bounded VST3 shared memory.".to_string());
            }
            if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
                unsafe { CloseHandle(handle) };
                return Err("Could not reserve private VST3 shared memory.".to_string());
            }
            let mapped = unsafe { MapViewOfFile(handle, FILE_MAP_ALL_ACCESS, 0, 0, SHARED_BYTES) };
            if mapped.Value.is_null() {
                unsafe { CloseHandle(handle) };
                return Err("Could not map bounded VST3 shared memory.".to_string());
            }
            unsafe { std::ptr::write_bytes(mapped.Value, 0, SHARED_BYTES) };
            Ok(Self {
                handle,
                view: mapped.Value.cast(),
                name,
            })
        }

        unsafe fn header(&mut self) -> &mut SharedHeader {
            unsafe { &mut *self.view.cast() }
        }
        unsafe fn write_audio(&mut self, input: &[[f32; VST3_BLOCK_FRAMES]; 2]) {
            unsafe {
                std::ptr::copy_nonoverlapping(
                    input.as_ptr().cast::<u8>(),
                    self.view.add(INPUT_OFFSET),
                    2 * VST3_BLOCK_FRAMES * 4,
                );
            }
        }
        unsafe fn read_audio(&self) -> [[f32; VST3_BLOCK_FRAMES]; 2] {
            let mut output = [[0.0; VST3_BLOCK_FRAMES]; 2];
            unsafe {
                std::ptr::copy_nonoverlapping(
                    self.view.add(OUTPUT_OFFSET),
                    output.as_mut_ptr().cast::<u8>(),
                    2 * VST3_BLOCK_FRAMES * 4,
                );
            }
            output
        }
        unsafe fn write_event(&mut self, index: usize, event: HostedNoteEvent) {
            let raw = SharedEvent {
                kind: if event.note_on { 0 } else { 1 },
                sample_offset: event.sample_offset,
                note_id: event.note_id,
                channel: event.channel,
                pitch: event.pitch,
                value: event.value,
                tuning: event.tuning,
            };
            unsafe {
                std::ptr::write_unaligned(
                    self.view
                        .add(EVENT_OFFSET + index * std::mem::size_of::<SharedEvent>())
                        .cast(),
                    raw,
                );
            }
        }
        unsafe fn write_parameter(&mut self, index: usize, point: HostedParameterPoint) {
            let raw = SharedParameter {
                parameter_id: point.parameter_id,
                sample_offset: point.sample_offset,
                value: point.value,
            };
            unsafe {
                std::ptr::write_unaligned(
                    self.view
                        .add(PARAMETER_OFFSET + index * std::mem::size_of::<SharedParameter>())
                        .cast(),
                    raw,
                );
            }
        }
        unsafe fn write_state(&mut self, bytes: &[u8]) -> Result<(), String> {
            if bytes.len() > MAX_PLUGIN_STATE_BYTES {
                return Err("Hosted plug-in state exceeds its limit.".to_string());
            }
            unsafe {
                std::ptr::copy_nonoverlapping(
                    bytes.as_ptr(),
                    self.view.add(STATE_OFFSET),
                    bytes.len(),
                );
                self.header().state_size = bytes.len() as u32;
            }
            Ok(())
        }
        unsafe fn read_state(&mut self) -> Result<Vec<u8>, String> {
            let size = unsafe { self.header().state_size as usize };
            if size > MAX_PLUGIN_STATE_BYTES {
                return Err("Hosted plug-in state exceeds its limit.".to_string());
            }
            let mut bytes = vec![0u8; size];
            unsafe {
                std::ptr::copy_nonoverlapping(self.view.add(STATE_OFFSET), bytes.as_mut_ptr(), size)
            };
            Ok(bytes)
        }
    }

    impl Drop for Mapping {
        fn drop(&mut self) {
            unsafe {
                let _ = UnmapViewOfFile(MEMORY_MAPPED_VIEW_ADDRESS {
                    Value: self.view.cast(),
                });
                CloseHandle(self.handle);
            }
        }
    }

    struct Instance {
        mapping: Mapping,
        info: HostedInstanceRuntimeInfo,
        source_key: String,
        disabled: bool,
    }

    pub(crate) struct Vst3SessionManager {
        child: Child,
        pipe: HANDLE,
        instances: HashMap<String, Instance>,
        sample_rate: f64,
        request_counter: u64,
        session_token: String,
        last_active_source_key: Option<String>,
        failed: bool,
    }

    unsafe impl Send for Vst3SessionManager {}

    impl Vst3SessionManager {
        pub(crate) fn start(
            payloads: &[HostedInstancePayload],
            sample_rate: u32,
        ) -> Result<Option<Self>, String> {
            let enabled = payloads
                .iter()
                .filter(|item| item.enabled)
                .collect::<Vec<_>>();
            if enabled.is_empty() {
                return Ok(None);
            }
            let sidecar = plugin_host_executable_path()
                .filter(|path| path.is_file())
                .ok_or_else(|| "The VST3 session host is unavailable.".to_string())?;
            let session_token = rand::random::<[u8; 16]>()
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect::<String>();
            let pipe_name = format!(
                r"\\.\pipe\pocket-daw-vst3-session-{}-{session_token}",
                std::process::id(),
            );
            let child = Command::new(sidecar)
                .args(["--mode", "session", "--pipe", &pipe_name])
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .map_err(|_| "Could not start the VST3 session host.".to_string())?;
            let mut launch = LaunchGuard(Some(child));
            let wide = pipe_name
                .encode_utf16()
                .chain(std::iter::once(0))
                .collect::<Vec<_>>();
            let deadline = Instant::now() + Duration::from_secs(5);
            while unsafe { WaitNamedPipeW(wide.as_ptr(), 200) } == 0 {
                if Instant::now() >= deadline {
                    return Err("The VST3 session host did not become ready.".to_string());
                }
                std::thread::sleep(Duration::from_millis(10));
            }
            let pipe = unsafe {
                CreateFileW(
                    wide.as_ptr(),
                    FILE_GENERIC_READ | FILE_GENERIC_WRITE,
                    0,
                    null(),
                    OPEN_EXISTING,
                    0,
                    null_mut(),
                )
            };
            if pipe == INVALID_HANDLE_VALUE {
                return Err("Could not connect to the VST3 session host.".to_string());
            }
            let child = launch.0.take().expect("launch guard owns child");
            let mut manager = Self {
                child,
                pipe,
                instances: HashMap::new(),
                sample_rate: sample_rate as f64,
                request_counter: 1,
                session_token,
                last_active_source_key: None,
                failed: false,
            };
            manager.send("hello", Value::Null)?;
            for payload in enabled {
                manager.load(payload)?;
            }
            Ok(Some(manager))
        }

        pub(crate) fn load(&mut self, payload: &HostedInstancePayload) -> Result<(), String> {
            if self.instances.contains_key(&payload.instance_id) {
                return Err("Hosted plug-in instance IDs must be unique.".to_string());
            }
            let (module, source_key) = resolve_hosted_module_and_source(&payload.identity)?;
            let mapping_name = format!(
                "Local\\PocketDAWVST3-{}-{}-{}",
                std::process::id(),
                self.session_token,
                self.request_counter
            );
            let mut mapping = Mapping::create(mapping_name.clone())?;
            let response=self.send("loadInstance",serde_json::json!({"instanceId":payload.instance_id,
                "modulePath":module,"classId":payload.identity.class_id,"sampleRate":self.sample_rate,
                "sharedMemoryName":mapping_name}))?;
            if response["ok"] != true {
                return Err("The VST3 session host rejected an instance.".to_string());
            }
            let role = response["instance"]["role"].as_str().unwrap_or_default();
            if role != payload.role {
                return Err("Hosted plug-in role does not match its verified class.".to_string());
            }
            let (latency_samples, tail_samples) = bounded_hosted_timing(
                response["instance"]["latencySamples"].as_u64().unwrap_or(0),
                response["instance"]["tailSamples"].as_u64().unwrap_or(0),
            );
            let info = HostedInstanceRuntimeInfo {
                instrument: role == "instrument",
                input_channels: response["instance"]["inputChannels"].as_u64().unwrap_or(0) as u32,
                output_channels: response["instance"]["outputChannels"].as_u64().unwrap_or(0)
                    as u32,
                latency_samples,
                tail_samples,
                editor_available: response["instance"]["editorAvailable"]
                    .as_bool()
                    .unwrap_or(false),
            };
            if let Some(state) = payload.state.as_ref() {
                let bytes = decode_state(state)?;
                unsafe {
                    mapping.write_state(&bytes)?;
                }
                let response = self.send(
                    "setState",
                    serde_json::json!({"instanceId":payload.instance_id}),
                )?;
                if response["ok"] != true {
                    return Err("The VST3 state snapshot was rejected; the prior snapshot remains unchanged.".to_string());
                }
            }
            for (id, value) in &payload.parameters {
                let parameter_id = id
                    .parse::<u32>()
                    .map_err(|_| "Hosted parameter ID is invalid.".to_string())?;
                if !(0.0..=1.0).contains(value) {
                    return Err("Hosted parameter value is invalid.".to_string());
                }
                let response=self.send("setParameter",serde_json::json!({"instanceId":payload.instance_id,"parameterId":parameter_id,"value":value}))?;
                if response["ok"] != true {
                    return Err("The VST3 parameter snapshot was rejected.".to_string());
                }
            }
            self.instances.insert(
                payload.instance_id.clone(),
                Instance {
                    mapping,
                    info,
                    source_key,
                    disabled: false,
                },
            );
            Ok(())
        }

        pub(crate) fn unload(&mut self, id: &str) -> Result<(), String> {
            if !self.instances.contains_key(id) {
                return Ok(());
            }
            let response = self.send("unloadInstance", serde_json::json!({"instanceId":id}))?;
            if response["ok"] != true {
                return Err("The VST3 instance could not be unloaded.".to_string());
            }
            self.instances.remove(id);
            Ok(())
        }

        pub(crate) fn get_state(&mut self, id: &str) -> Result<HostedStatePayload, String> {
            let response = self.send("getState", serde_json::json!({"instanceId":id}))?;
            if response["ok"] != true {
                return Err("The VST3 state snapshot was rejected.".to_string());
            }
            let raw = unsafe {
                self.instances
                    .get_mut(id)
                    .ok_or_else(|| "The VST3 instance is missing.".to_string())?
                    .mapping
                    .read_state()?
            };
            let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
            encoder
                .write_all(&raw)
                .map_err(|_| "The VST3 state snapshot could not be compressed.".to_string())?;
            let compressed = encoder
                .finish()
                .map_err(|_| "The VST3 state snapshot could not be compressed.".to_string())?;
            if compressed.len() > MAX_PLUGIN_STATE_BYTES {
                return Err("The VST3 state snapshot exceeds its limit.".to_string());
            }
            Ok(HostedStatePayload {
                encoding: "gzip-base64".to_string(),
                data: base64::engine::general_purpose::STANDARD.encode(&compressed),
                checksum: format!("{:x}", Sha256::digest(&compressed)),
                size_bytes: compressed.len(),
            })
        }

        pub(crate) fn set_state(
            &mut self,
            id: &str,
            state: &HostedStatePayload,
        ) -> Result<(), String> {
            let raw = decode_state(state)?;
            unsafe {
                self.instances
                    .get_mut(id)
                    .ok_or_else(|| "The VST3 instance is missing.".to_string())?
                    .mapping
                    .write_state(&raw)?
            };
            let response = self.send("setState", serde_json::json!({"instanceId":id}))?;
            if response["ok"] == true {
                Ok(())
            } else {
                Err(
                    "The VST3 state snapshot was rejected; the prior snapshot remains unchanged."
                        .to_string(),
                )
            }
        }

        pub(crate) fn info(&self, id: &str) -> Option<HostedInstanceRuntimeInfo> {
            self.instances.get(id).map(|value| value.info)
        }

        pub(crate) fn process(
            &mut self,
            id: &str,
            input: &[[f32; VST3_BLOCK_FRAMES]; 2],
            frames: usize,
            events: &[HostedNoteEvent],
            parameters: &[HostedParameterPoint],
            context: HostedProcessContext,
            deadline_micros: u32,
        ) -> HostedProcessResult {
            let mut fallback = HostedProcessResult {
                output: [[0.0; VST3_BLOCK_FRAMES]; 2],
                deadline_missed: false,
                disabled: true,
            };
            if self.failed {
                return fallback;
            }
            let Some(instance) = self.instances.get_mut(id) else {
                return fallback;
            };
            if instance.disabled {
                return fallback;
            }
            self.last_active_source_key = Some(instance.source_key.clone());
            let frame_count = frames.min(VST3_BLOCK_FRAMES);
            let event_count = events.len().min(256);
            let parameter_count = parameters.len().min(256);
            unsafe {
                instance.mapping.write_audio(input);
                let header = instance.mapping.header();
                *header = SharedHeader {
                    magic: 0x50445633,
                    version: 1,
                    total_bytes: SHARED_BYTES as u32,
                    max_frames: VST3_BLOCK_FRAMES as u32,
                    frame_count: frame_count as u32,
                    input_channels: instance.info.input_channels,
                    output_channels: instance.info.output_channels,
                    event_count: event_count as u32,
                    parameter_count: parameter_count as u32,
                    state_size: 0,
                    transport_flags: (context.playing as u32)
                        | ((context.recording as u32) << 1)
                        | ((context.looping as u32) << 2),
                    process_status: u32::MAX,
                    project_time_samples: context.project_time_samples,
                    continuous_time_samples: context.continuous_time_samples,
                    sample_rate: self.sample_rate,
                    project_ppq: context.project_ppq,
                    bar_position_ppq: context.bar_position_ppq,
                    loop_start_ppq: context.loop_start_ppq,
                    loop_end_ppq: context.loop_end_ppq,
                    tempo: context.tempo,
                    numerator: context.numerator,
                    denominator: context.denominator,
                    elapsed_micros: 0,
                };
                for (index, event) in events.iter().take(event_count).copied().enumerate() {
                    instance.mapping.write_event(index, event)
                }
                for (index, point) in parameters.iter().take(parameter_count).copied().enumerate() {
                    instance.mapping.write_parameter(index, point)
                }
            }
            let response = match self.send_with_timeout(
                "processBlock",
                serde_json::json!({"instanceId":id,"deadlineMicros":deadline_micros}),
                Duration::from_micros(deadline_micros as u64)
                    .saturating_add(Duration::from_millis(100)),
            ) {
                Ok(value) => value,
                Err(_) => {
                    self.failed = true;
                    for value in self.instances.values_mut() {
                        value.disabled = true;
                    }
                    if let Some(source_key) = self.last_active_source_key.clone() {
                        let _ = vst3_beta_quarantine_module(source_key, QuarantineReason::Crash);
                    }
                    return fallback;
                }
            };
            let Some(instance) = self.instances.get_mut(id) else {
                return fallback;
            };
            let missed = response["deadlineMissed"].as_bool().unwrap_or(false);
            let disabled = response["disabled"].as_bool().unwrap_or(false)
                || response["ok"] != true && !missed;
            if disabled {
                instance.disabled = true
            }
            fallback.deadline_missed = missed;
            fallback.disabled = disabled;
            if response["ok"] == true && !missed && !disabled {
                fallback.output = unsafe { instance.mapping.read_audio() };
                fallback.disabled = false
            }
            fallback
        }

        pub(crate) fn last_active_source_key(&self) -> Option<&str> {
            self.last_active_source_key.as_deref()
        }

        pub(crate) fn control(&mut self, kind: &str, payload: Value) -> Result<Value, String> {
            self.send(kind, payload)
        }

        fn send(&mut self, kind: &str, payload: Value) -> Result<Value, String> {
            self.send_with_timeout(kind, payload, Duration::from_secs(5))
        }

        fn send_with_timeout(
            &mut self,
            kind: &str,
            payload: Value,
            timeout: Duration,
        ) -> Result<Value, String> {
            if self.failed {
                return Err("The VST3 session host is unavailable.".to_string());
            }
            let request_id = format!("session-{}", self.request_counter);
            self.request_counter = self.request_counter.saturating_add(1);
            let bytes = serde_json::to_vec(&serde_json::json!({"protocolVersion":PROTOCOL_VERSION,
                "requestId":request_id,"mode":"session","kind":kind,"payload":payload}))
            .map_err(|_| "Could not encode the VST3 control request.".to_string())?;
            write_message(self.pipe, &bytes)?;
            let response = match read_message(self.pipe, timeout) {
                Ok(value) => value,
                Err(error) => {
                    self.failed = true;
                    let _ = self.child.kill();
                    let _ = self.child.wait();
                    return Err(error);
                }
            };
            let value: Value = serde_json::from_slice(&response)
                .map_err(|_| "The VST3 session host returned invalid data.".to_string())?;
            if value["protocolVersion"] != PROTOCOL_VERSION || value["requestId"] != request_id {
                return Err("The VST3 session host protocol did not match.".to_string());
            }
            Ok(value)
        }
    }

    impl Drop for Vst3SessionManager {
        fn drop(&mut self) {
            let _ = self.send("shutdown", Value::Null);
            unsafe { CloseHandle(self.pipe) };
            if self.child.try_wait().ok().flatten().is_none() {
                let _ = self.child.kill();
                let _ = self.child.wait();
            }
        }
    }

    struct LaunchGuard(Option<Child>);
    impl Drop for LaunchGuard {
        fn drop(&mut self) {
            if let Some(child) = self.0.as_mut() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }

    fn decode_state(state: &HostedStatePayload) -> Result<Vec<u8>, String> {
        if state.encoding != "gzip-base64" || state.size_bytes > MAX_PLUGIN_STATE_BYTES {
            return Err("Hosted state metadata is invalid.".to_string());
        }
        let compressed = base64::engine::general_purpose::STANDARD
            .decode(&state.data)
            .map_err(|_| "Hosted state is not valid base64.".to_string())?;
        if compressed.len() != state.size_bytes {
            return Err("Hosted state size does not match.".to_string());
        }
        let checksum = format!("{:x}", Sha256::digest(&compressed));
        if !checksum.eq_ignore_ascii_case(&state.checksum) {
            return Err("Hosted state checksum does not match.".to_string());
        }
        let mut decoder = GzDecoder::new(compressed.as_slice());
        let mut decoded = Vec::new();
        decoder
            .by_ref()
            .take((MAX_PLUGIN_STATE_BYTES + 1) as u64)
            .read_to_end(&mut decoded)
            .map_err(|_| "Hosted state gzip is invalid.".to_string())?;
        if decoded.len() > MAX_PLUGIN_STATE_BYTES {
            return Err("Hosted state expands beyond its limit.".to_string());
        }
        Ok(decoded)
    }

    fn read_message(handle: HANDLE, timeout: Duration) -> Result<Vec<u8>, String> {
        wait_for_pipe_bytes(handle, 4, timeout)?;
        let mut length = [0u8; 4];
        read_exact(handle, &mut length)?;
        let length = u32::from_le_bytes(length) as usize;
        if length == 0 || length > 1024 * 1024 {
            return Err("VST3 control response is oversized.".to_string());
        }
        wait_for_pipe_bytes(handle, length, timeout)?;
        let mut bytes = vec![0u8; length];
        read_exact(handle, &mut bytes)?;
        Ok(bytes)
    }
    fn wait_for_pipe_bytes(
        handle: HANDLE,
        required: usize,
        timeout: Duration,
    ) -> Result<(), String> {
        let deadline = Instant::now() + timeout;
        loop {
            let mut available = 0;
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
                return Err("The VST3 session host disconnected.".to_string());
            }
            if available as usize >= required {
                return Ok(());
            }
            if Instant::now() >= deadline {
                return Err("The VST3 session host timed out.".to_string());
            }
            std::thread::sleep(Duration::from_millis(1));
        }
    }
    fn write_message(handle: HANDLE, bytes: &[u8]) -> Result<(), String> {
        if bytes.is_empty() || bytes.len() > 1024 * 1024 {
            return Err("VST3 control request is oversized.".to_string());
        }
        write_all(handle, &(bytes.len() as u32).to_le_bytes())?;
        write_all(handle, bytes)
    }
    fn read_exact(handle: HANDLE, bytes: &mut [u8]) -> Result<(), String> {
        let mut offset = 0;
        while offset < bytes.len() {
            let mut count = 0;
            let ok = unsafe {
                ReadFile(
                    handle,
                    bytes[offset..].as_mut_ptr(),
                    (bytes.len() - offset) as u32,
                    &mut count,
                    null_mut(),
                )
            };
            if ok == 0 || count == 0 {
                return Err("The VST3 session host disconnected.".to_string());
            }
            offset += count as usize;
        }
        Ok(())
    }
    fn write_all(handle: HANDLE, bytes: &[u8]) -> Result<(), String> {
        let mut offset = 0;
        while offset < bytes.len() {
            let mut count = 0;
            let ok = unsafe {
                WriteFile(
                    handle,
                    bytes[offset..].as_ptr(),
                    (bytes.len() - offset) as u32,
                    &mut count,
                    null_mut(),
                )
            };
            if ok == 0 || count == 0 {
                return Err("The VST3 session host disconnected.".to_string());
            }
            offset += count as usize;
        }
        Ok(())
    }

    pub(crate) use Vst3SessionManager as Manager;
}

#[cfg(windows)]
pub(crate) use windows::Manager as Vst3SessionManager;

#[cfg(not(windows))]
pub(crate) struct Vst3SessionManager;

#[cfg(not(windows))]
impl Vst3SessionManager {
    pub(crate) fn start(_: &[HostedInstancePayload], _: u32) -> Result<Option<Self>, String> {
        Ok(None)
    }
    pub(crate) fn process(
        &mut self,
        _: &str,
        _: &[[f32; VST3_BLOCK_FRAMES]; 2],
        _: usize,
        _: &[HostedNoteEvent],
        _: &[HostedParameterPoint],
        _: HostedProcessContext,
        _: u32,
    ) -> HostedProcessResult {
        HostedProcessResult {
            output: [[0.0; VST3_BLOCK_FRAMES]; 2],
            deadline_missed: false,
            disabled: true,
        }
    }
    pub(crate) fn info(&self, _: &str) -> Option<HostedInstanceRuntimeInfo> {
        None
    }
    pub(crate) fn control(&mut self, _: &str, _: Value) -> Result<Value, String> {
        Err("VST3 hosting is only available on Windows.".to_string())
    }
    pub(crate) fn load(&mut self, _: &HostedInstancePayload) -> Result<(), String> {
        Err("VST3 hosting is only available on Windows.".to_string())
    }
    pub(crate) fn unload(&mut self, _: &str) -> Result<(), String> {
        Ok(())
    }
    pub(crate) fn get_state(&mut self, _: &str) -> Result<HostedStatePayload, String> {
        Err("VST3 hosting is only available on Windows.".to_string())
    }
    pub(crate) fn set_state(&mut self, _: &str, _: &HostedStatePayload) -> Result<(), String> {
        Err("VST3 hosting is only available on Windows.".to_string())
    }
}

struct GraphProcessRequest {
    instance_id: String,
    input: Box<[[f32; VST3_BLOCK_FRAMES]; 2]>,
    frames: usize,
    events: Vec<HostedNoteEvent>,
    parameters: Vec<HostedParameterPoint>,
    context: HostedProcessContext,
    deadline_micros: u32,
}

enum GraphCommand {
    Process(
        GraphProcessRequest,
        std::sync::mpsc::SyncSender<HostedProcessResult>,
    ),
    Info(
        String,
        std::sync::mpsc::SyncSender<Option<HostedInstanceRuntimeInfo>>,
    ),
    Control(
        String,
        Value,
        std::sync::mpsc::SyncSender<Result<Value, String>>,
    ),
    Load(
        HostedInstancePayload,
        std::sync::mpsc::SyncSender<Result<(), String>>,
    ),
    Unload(String, std::sync::mpsc::SyncSender<Result<(), String>>),
    GetState(
        String,
        std::sync::mpsc::SyncSender<Result<HostedStatePayload, String>>,
    ),
    SetState(
        String,
        HostedStatePayload,
        std::sync::mpsc::SyncSender<Result<(), String>>,
    ),
    Reset(
        Vec<HostedInstancePayload>,
        std::sync::mpsc::SyncSender<Result<GraphResetResult, String>>,
    ),
    Shutdown,
}

struct GraphResetResult {
    payloads: Vec<HostedInstancePayload>,
    parameter_edits: HashMap<String, BTreeMap<String, f64>>,
    state_snapshots: HashMap<String, HostedStatePayload>,
}

struct GraphInner {
    sender: std::sync::mpsc::SyncSender<GraphCommand>,
    worker: Mutex<Option<std::thread::JoinHandle<()>>>,
    sample_rate: u32,
    instance_ids: Mutex<Vec<String>>,
    payloads: Mutex<HashMap<String, HostedInstancePayload>>,
    pending_parameter_edits: Mutex<HashMap<String, BTreeMap<String, f64>>>,
    pending_state_snapshots: Mutex<HashMap<String, HostedStatePayload>>,
}

impl Drop for GraphInner {
    fn drop(&mut self) {
        let _ = self.sender.send(GraphCommand::Shutdown);
        if let Ok(worker) = self.worker.get_mut() {
            if let Some(worker) = worker.take() {
                let _ = worker.join();
            }
        }
    }
}

#[derive(Clone)]
pub(crate) struct Vst3GraphService {
    inner: Arc<GraphInner>,
}

static ACTIVE_GRAPH: OnceLock<Mutex<Option<Arc<GraphInner>>>> = OnceLock::new();

impl Vst3GraphService {
    pub(crate) fn start(
        payloads: &[HostedInstancePayload],
        sample_rate: u32,
    ) -> Result<Option<Self>, String> {
        let mut instance_ids = payloads
            .iter()
            .filter(|payload| payload.enabled)
            .map(|payload| payload.instance_id.clone())
            .collect::<Vec<_>>();
        instance_ids.sort();
        if instance_ids.is_empty() {
            return Ok(None);
        }
        let active_slot = ACTIVE_GRAPH.get_or_init(|| Mutex::new(None));
        let mut active = active_slot
            .lock()
            .map_err(|_| "The VST3 graph service lock was poisoned.".to_string())?;
        if let Some(inner) = active.as_ref().cloned() {
            if inner.sample_rate != sample_rate {
                *active = None;
            } else {
                let service = Self { inner };
                // Reused graphs must begin from the project's last persisted state rather than
                // inheriting notes, tails, or automation cursors from the previous render.
                // The reset also captures vendor-editor edits before recreating each instance.
                service.reset_off_callback()?;
                let desired = payloads
                    .iter()
                    .filter(|payload| payload.enabled)
                    .map(|payload| (payload.instance_id.clone(), payload.clone()))
                    .collect::<HashMap<_, _>>();
                let current = service
                    .inner
                    .payloads
                    .lock()
                    .map_err(|_| "The VST3 graph payload list was poisoned.".to_string())?
                    .clone();
                let (unload, load) = graph_reconciliation(&current, &desired);
                for instance_id in unload {
                    service.unload(&instance_id)?;
                }
                for payload in load {
                    service.load(payload)?;
                }
                return Ok(Some(service));
            }
        }

        let payloads = payloads.to_vec();
        let worker_payloads = payloads.clone();
        let (sender, receiver) = std::sync::mpsc::sync_channel::<GraphCommand>(64);
        let (ready_sender, ready_receiver) = std::sync::mpsc::sync_channel(1);
        let worker = std::thread::Builder::new()
            .name("pocket-daw-vst3-graph".to_string())
            .spawn(move || {
                let manager = Vst3SessionManager::start(&worker_payloads, sample_rate);
                let mut manager = match manager {
                    Ok(Some(manager)) => {
                        let _ = ready_sender.send(Ok(()));
                        manager
                    }
                    Ok(None) => {
                        let _ =
                            ready_sender.send(Err("No hosted instances were enabled.".to_string()));
                        return;
                    }
                    Err(error) => {
                        let _ = ready_sender.send(Err(error));
                        return;
                    }
                };
                while let Ok(command) = receiver.recv() {
                    match command {
                        GraphCommand::Process(request, reply) => {
                            let result = manager.process(
                                &request.instance_id,
                                &request.input,
                                request.frames,
                                &request.events,
                                &request.parameters,
                                request.context,
                                request.deadline_micros,
                            );
                            let _ = reply.send(result);
                        }
                        GraphCommand::Info(instance_id, reply) => {
                            let _ = reply.send(manager.info(&instance_id));
                        }
                        GraphCommand::Control(kind, payload, reply) => {
                            let _ = reply.send(manager.control(&kind, payload));
                        }
                        GraphCommand::Load(payload, reply) => {
                            let _ = reply.send(manager.load(&payload));
                        }
                        GraphCommand::Unload(instance_id, reply) => {
                            let _ = reply.send(manager.unload(&instance_id));
                        }
                        GraphCommand::GetState(instance_id, reply) => {
                            let _ = reply.send(manager.get_state(&instance_id));
                        }
                        GraphCommand::SetState(instance_id, state, reply) => {
                            let _ = reply.send(manager.set_state(&instance_id, &state));
                        }
                        GraphCommand::Reset(mut payloads, reply) => {
                            let result = (|| {
                                let mut captured = HashMap::new();
                                let mut states = HashMap::new();
                                for payload in &mut payloads {
                                    if let Ok(response) = manager.control(
                                        "pollParameterEdits",
                                        serde_json::json!({"instanceId":payload.instance_id}),
                                    ) {
                                        let mut edits = BTreeMap::new();
                                        for edit in response["parameterEdits"]
                                            .as_array()
                                            .cloned()
                                            .unwrap_or_default()
                                        {
                                            if let (Some(id), Some(value)) = (
                                                edit["parameterId"].as_u64(),
                                                edit["value"].as_f64(),
                                            ) {
                                                payload.parameters.insert(id.to_string(), value);
                                                edits.insert(id.to_string(), value);
                                            }
                                        }
                                        if !edits.is_empty() {
                                            captured.insert(payload.instance_id.clone(), edits);
                                        }
                                    }
                                    // get_state validates the sidecar response, compressed size and checksum.
                                    // On any failure retain the previous valid snapshot in the payload.
                                    if let Ok(snapshot) = manager.get_state(&payload.instance_id) {
                                        payload.state = Some(snapshot.clone());
                                        states.insert(payload.instance_id.clone(), snapshot);
                                    }
                                    manager.unload(&payload.instance_id)?;
                                    manager.load(payload)?;
                                }
                                Ok(GraphResetResult {
                                    payloads,
                                    parameter_edits: captured,
                                    state_snapshots: states,
                                })
                            })();
                            let _ = reply.send(result);
                        }
                        GraphCommand::Shutdown => break,
                    }
                }
            })
            .map_err(|_| "Could not start the VST3 graph service.".to_string())?;
        ready_receiver
            .recv()
            .map_err(|_| "The VST3 graph service stopped during startup.".to_string())??;
        let inner = Arc::new(GraphInner {
            sender,
            worker: Mutex::new(Some(worker)),
            sample_rate,
            instance_ids: Mutex::new(instance_ids),
            payloads: Mutex::new(
                payloads
                    .into_iter()
                    .map(|payload| (payload.instance_id.clone(), payload))
                    .collect(),
            ),
            pending_parameter_edits: Mutex::new(HashMap::new()),
            pending_state_snapshots: Mutex::new(HashMap::new()),
        });
        *active = Some(Arc::clone(&inner));
        Ok(Some(Self { inner }))
    }

    pub(crate) fn process_off_callback(
        &self,
        instance_id: &str,
        input: &[[f32; VST3_BLOCK_FRAMES]; 2],
        frames: usize,
        events: &[HostedNoteEvent],
        parameters: &[HostedParameterPoint],
        context: HostedProcessContext,
        deadline_micros: u32,
    ) -> HostedProcessResult {
        if AUDIO_CALLBACK_SCOPE.with(|active| active.get()) {
            return HostedProcessResult {
                output: [[0.0; VST3_BLOCK_FRAMES]; 2],
                deadline_missed: true,
                disabled: true,
            };
        }
        let (reply_sender, reply_receiver) = std::sync::mpsc::sync_channel(1);
        let request = GraphProcessRequest {
            instance_id: instance_id.to_string(),
            input: Box::new(*input),
            frames,
            events: events.to_vec(),
            parameters: parameters.to_vec(),
            context,
            deadline_micros,
        };
        if self
            .inner
            .sender
            .send(GraphCommand::Process(request, reply_sender))
            .is_err()
        {
            return HostedProcessResult {
                output: [[0.0; VST3_BLOCK_FRAMES]; 2],
                deadline_missed: false,
                disabled: true,
            };
        }
        reply_receiver
            .recv_timeout(
                std::time::Duration::from_micros(deadline_micros as u64)
                    .saturating_add(std::time::Duration::from_millis(250)),
            )
            .unwrap_or(HostedProcessResult {
                output: [[0.0; VST3_BLOCK_FRAMES]; 2],
                deadline_missed: false,
                disabled: true,
            })
    }

    pub(crate) fn info(&self, instance_id: &str) -> Option<HostedInstanceRuntimeInfo> {
        let (reply_sender, reply_receiver) = std::sync::mpsc::sync_channel(1);
        self.inner
            .sender
            .send(GraphCommand::Info(instance_id.to_string(), reply_sender))
            .ok()?;
        reply_receiver
            .recv_timeout(std::time::Duration::from_secs(6))
            .ok()
            .flatten()
    }

    fn control(&self, kind: &str, payload: Value) -> Result<Value, String> {
        let (reply_sender, reply_receiver) = std::sync::mpsc::sync_channel(1);
        self.inner
            .sender
            .send(GraphCommand::Control(
                kind.to_string(),
                payload,
                reply_sender,
            ))
            .map_err(|_| "The VST3 graph service is unavailable.".to_string())?;
        reply_receiver
            .recv_timeout(std::time::Duration::from_secs(6))
            .map_err(|_| "The VST3 graph service stopped.".to_string())?
    }

    fn load(&self, payload: HostedInstancePayload) -> Result<(), String> {
        let (reply_sender, reply_receiver) = std::sync::mpsc::sync_channel(1);
        self.inner
            .sender
            .send(GraphCommand::Load(payload.clone(), reply_sender))
            .map_err(|_| "The VST3 graph service is unavailable.".to_string())?;
        reply_receiver
            .recv_timeout(std::time::Duration::from_secs(6))
            .map_err(|_| "The VST3 graph service timed out.".to_string())??;
        self.inner
            .instance_ids
            .lock()
            .map_err(|_| "The VST3 graph instance list was poisoned.".to_string())?
            .push(payload.instance_id.clone());
        self.inner
            .payloads
            .lock()
            .map_err(|_| "The VST3 graph payload list was poisoned.".to_string())?
            .insert(payload.instance_id.clone(), payload);
        Ok(())
    }

    fn unload(&self, instance_id: &str) -> Result<(), String> {
        let (reply_sender, reply_receiver) = std::sync::mpsc::sync_channel(1);
        self.inner
            .sender
            .send(GraphCommand::Unload(instance_id.to_string(), reply_sender))
            .map_err(|_| "The VST3 graph service is unavailable.".to_string())?;
        reply_receiver
            .recv_timeout(std::time::Duration::from_secs(6))
            .map_err(|_| "The VST3 graph service timed out.".to_string())??;
        self.inner
            .instance_ids
            .lock()
            .map_err(|_| "The VST3 graph instance list was poisoned.".to_string())?
            .retain(|id| id != instance_id);
        self.inner
            .payloads
            .lock()
            .map_err(|_| "The VST3 graph payload list was poisoned.".to_string())?
            .remove(instance_id);
        Ok(())
    }

    fn get_state(&self, instance_id: &str) -> Result<HostedStatePayload, String> {
        let (reply_sender, reply_receiver) = std::sync::mpsc::sync_channel(1);
        self.inner
            .sender
            .send(GraphCommand::GetState(
                instance_id.to_string(),
                reply_sender,
            ))
            .map_err(|_| "The VST3 graph service is unavailable.".to_string())?;
        reply_receiver
            .recv_timeout(std::time::Duration::from_secs(6))
            .map_err(|_| "The VST3 graph service timed out.".to_string())?
    }

    fn set_state(&self, instance_id: &str, state: HostedStatePayload) -> Result<(), String> {
        let (reply_sender, reply_receiver) = std::sync::mpsc::sync_channel(1);
        self.inner
            .sender
            .send(GraphCommand::SetState(
                instance_id.to_string(),
                state,
                reply_sender,
            ))
            .map_err(|_| "The VST3 graph service is unavailable.".to_string())?;
        reply_receiver
            .recv_timeout(std::time::Duration::from_secs(6))
            .map_err(|_| "The VST3 graph service timed out.".to_string())?
    }

    pub(crate) fn reset_off_callback(&self) -> Result<(), String> {
        if AUDIO_CALLBACK_SCOPE.with(|active| active.get()) {
            return Err("VST3 reset cannot run on the audio callback.".to_string());
        }
        let (reply_sender, reply_receiver) = std::sync::mpsc::sync_channel(1);
        let payloads = self
            .inner
            .payloads
            .lock()
            .map_err(|_| "The VST3 graph payload list was poisoned.".to_string())?
            .values()
            .cloned()
            .collect();
        self.inner
            .sender
            .send(GraphCommand::Reset(payloads, reply_sender))
            .map_err(|_| "The VST3 graph service is unavailable.".to_string())?;
        let result = reply_receiver
            .recv_timeout(std::time::Duration::from_secs(6))
            .map_err(|_| "The VST3 graph service timed out.".to_string())??;
        *self
            .inner
            .payloads
            .lock()
            .map_err(|_| "The VST3 graph payload list was poisoned.".to_string())? = result
            .payloads
            .into_iter()
            .map(|payload| (payload.instance_id.clone(), payload))
            .collect();
        let mut pending = self
            .inner
            .pending_parameter_edits
            .lock()
            .map_err(|_| "The VST3 edit queue was poisoned.".to_string())?;
        for (instance_id, edits) in result.parameter_edits {
            pending.entry(instance_id).or_default().extend(edits);
        }
        drop(pending);
        self.inner
            .pending_state_snapshots
            .lock()
            .map_err(|_| "The VST3 state queue was poisoned.".to_string())?
            .extend(result.state_snapshots);
        Ok(())
    }
}

fn graph_reconciliation(
    current: &HashMap<String, HostedInstancePayload>,
    desired: &HashMap<String, HostedInstancePayload>,
) -> (Vec<String>, Vec<HostedInstancePayload>) {
    let mut unload = current
        .iter()
        .filter(|(id, payload)| desired.get(*id) != Some(*payload))
        .map(|(id, _)| id.clone())
        .collect::<Vec<_>>();
    let mut load = desired
        .iter()
        .filter(|(id, payload)| current.get(*id) != Some(*payload))
        .map(|(_, payload)| payload.clone())
        .collect::<Vec<_>>();
    unload.sort();
    load.sort_by(|left, right| left.instance_id.cmp(&right.instance_id));
    (unload, load)
}

thread_local! {
    static AUDIO_CALLBACK_SCOPE: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
}

pub(crate) fn with_audio_callback_scope<R>(callback: impl FnOnce() -> R) -> R {
    AUDIO_CALLBACK_SCOPE.with(|active| {
        let prior = active.replace(true);
        let result = callback();
        active.set(prior);
        result
    })
}

fn active_graph() -> Result<Vst3GraphService, String> {
    let active = ACTIVE_GRAPH
        .get_or_init(|| Mutex::new(None))
        .lock()
        .map_err(|_| "The VST3 graph service lock was poisoned.".to_string())?
        .clone()
        .ok_or_else(|| "No VST3 graph is active.".to_string())?;
    Ok(Vst3GraphService { inner: active })
}

#[tauri::command]
pub(crate) fn vst3_session_query_parameters(instance_id: String) -> Result<Value, String> {
    active_graph()?.control(
        "queryParameters",
        serde_json::json!({"instanceId":instance_id}),
    )
}

#[tauri::command]
pub(crate) fn vst3_session_set_parameter(
    instance_id: String,
    stable_parameter_id: String,
    value: f64,
) -> Result<bool, String> {
    let parameter_id = stable_parameter_id
        .parse::<u32>()
        .map_err(|_| "The VST3 stable parameter ID is invalid.".to_string())?;
    let graph = active_graph()?;
    let response = graph.control(
        "setParameter",
        serde_json::json!({"instanceId":instance_id,"parameterId":parameter_id,"value":value}),
    )?;
    let accepted = response["ok"] == true;
    if accepted {
        if let Some(payload) = graph
            .inner
            .payloads
            .lock()
            .map_err(|_| "The VST3 graph payload list was poisoned.".to_string())?
            .get_mut(&instance_id)
        {
            payload
                .parameters
                .insert(stable_parameter_id, value.clamp(0.0, 1.0));
        }
    }
    Ok(accepted)
}

#[tauri::command]
pub(crate) fn vst3_session_query_programs(instance_id: String) -> Result<Value, String> {
    active_graph()?.control(
        "queryPrograms",
        serde_json::json!({"instanceId":instance_id}),
    )
}

#[tauri::command]
pub(crate) fn vst3_session_select_program(
    instance_id: String,
    program_id: String,
) -> Result<Value, String> {
    let (list_id, program_index) = program_id
        .split_once(':')
        .ok_or_else(|| "The VST3 program ID is invalid.".to_string())?;
    let list_id = list_id
        .parse::<i32>()
        .map_err(|_| "The VST3 program ID is invalid.".to_string())?;
    let program_index = program_index
        .parse::<i32>()
        .map_err(|_| "The VST3 program ID is invalid.".to_string())?;
    let graph = active_graph()?;
    let response = graph.control(
        "selectProgram",
        serde_json::json!({"instanceId":instance_id,"listId":list_id,"programIndex":program_index}),
    )?;
    if response["ok"] != true {
        return Err("The VST3 program could not be selected.".to_string());
    }
    vst3_instance_status(&graph, &instance_id)
}

#[tauri::command]
pub(crate) fn vst3_session_open_editor(
    instance_id: String,
    owner_window_handle: u64,
    title: String,
) -> Result<Value, String> {
    active_graph()?.control("openEditor", serde_json::json!({"instanceId":instance_id,"ownerWindowHandle":owner_window_handle,"title":title}))
}

#[tauri::command]
pub(crate) fn vst3_session_close_editor(instance_id: String) -> Result<Value, String> {
    active_graph()?.control("closeEditor", serde_json::json!({"instanceId":instance_id}))
}

#[tauri::command]
pub(crate) fn vst3_session_poll_parameter_edits(instance_id: String) -> Result<Value, String> {
    let graph = active_graph()?;
    let mut response = graph.control(
        "pollParameterEdits",
        serde_json::json!({"instanceId":instance_id}),
    )?;
    let captured = graph
        .inner
        .pending_parameter_edits
        .lock()
        .map_err(|_| "The VST3 edit queue was poisoned.".to_string())?
        .remove(&instance_id)
        .unwrap_or_default();
    if let Some(edits) = response
        .get_mut("parameterEdits")
        .and_then(Value::as_array_mut)
    {
        for (parameter_id, value) in captured {
            if let Ok(parameter_id) = parameter_id.parse::<u32>() {
                edits.push(serde_json::json!({"parameterId":parameter_id,"value":value}));
            }
        }
    }
    if let Some(snapshot) = graph
        .inner
        .pending_state_snapshots
        .lock()
        .map_err(|_| "The VST3 state queue was poisoned.".to_string())?
        .remove(&instance_id)
    {
        response["stateSnapshot"] = serde_json::to_value(snapshot)
            .map_err(|_| "The VST3 state snapshot could not be returned.".to_string())?;
    }
    Ok(response)
}

fn vst3_instance_status(graph: &Vst3GraphService, instance_id: &str) -> Result<Value, String> {
    let info = graph
        .info(instance_id)
        .ok_or_else(|| "The VST3 instance is missing.".to_string())?;
    let parameters = graph.control(
        "queryParameters",
        serde_json::json!({"instanceId":instance_id}),
    )?;
    let programs = graph.control(
        "queryPrograms",
        serde_json::json!({"instanceId":instance_id}),
    )?;
    let descriptors=parameters["parameters"].as_array().cloned().unwrap_or_default().into_iter().map(|item|serde_json::json!({
        "stableId":item["parameterId"].as_u64().unwrap_or(0).to_string(),
        "name":item["title"].as_str().unwrap_or("Parameter"),"shortLabel":item["shortTitle"],"unit":item["units"],
        "min":0.0,"max":1.0,"defaultValue":item["defaultNormalized"].as_f64().unwrap_or(0.0),
        "stepCount":item["stepCount"].as_i64().unwrap_or(0),
        "automatable":item["flags"].as_u64().unwrap_or(0)&1!=0,
        "readOnly":item["flags"].as_u64().unwrap_or(0)&2!=0
    })).collect::<Vec<_>>();
    let factory_programs=programs["programs"].as_array().cloned().unwrap_or_default().into_iter().map(|item|serde_json::json!({
        "id":format!("{}:{}",item["listId"].as_i64().unwrap_or(0),item["programIndex"].as_i64().unwrap_or(0)),
        "name":item["programName"].as_str().unwrap_or("Program")
    })).collect::<Vec<_>>();
    Ok(
        serde_json::json!({"instanceId":instance_id,"phase":"ready","disabled":false,
        "latencySamples":info.latency_samples,"tailSamples":info.tail_samples,
        "parameterDescriptors":descriptors,"factoryPrograms":factory_programs,
        "vendorEditorAvailable":info.editor_available,"genericEditorAvailable":true}),
    )
}

#[tauri::command]
pub(crate) fn vst3_session_load_instance(
    instance_id: String,
    role: String,
    identity: HostedPluginIdentity,
) -> Result<Value, String> {
    if role != "instrument" && role != "effect" {
        return Err("The VST3 instance role is invalid.".to_string());
    }
    if resolve_hosted_role(&identity)? != role {
        return Err("The VST3 instance role does not match its verified class.".to_string());
    }
    let payload = HostedInstancePayload {
        instance_id: instance_id.clone(),
        role: role.to_string(),
        track_id: "ui-preview".to_string(),
        chain_id: None,
        enabled: true,
        identity,
        state: None,
        parameters: BTreeMap::new(),
        automation: Vec::new(),
    };
    let graph = if let Ok(graph) = active_graph() {
        graph
    } else {
        Vst3GraphService::start(&[payload.clone()], 48_000)?
            .ok_or_else(|| "The VST3 graph could not be started.".to_string())?
    };
    if !graph
        .inner
        .instance_ids
        .lock()
        .map(|ids| ids.contains(&instance_id))
        .unwrap_or(false)
    {
        graph.load(payload)?;
    }
    vst3_instance_status(&graph, &instance_id)
}

#[tauri::command]
pub(crate) fn vst3_session_query_status(instance_id: String) -> Result<Value, String> {
    vst3_instance_status(&active_graph()?, &instance_id)
}

#[tauri::command]
pub(crate) fn vst3_session_unload_instance(instance_id: String) -> Result<(), String> {
    let graph = active_graph()?;
    graph.unload(&instance_id)?;
    let empty = graph
        .inner
        .instance_ids
        .lock()
        .map(|ids| ids.is_empty())
        .unwrap_or(false);
    if empty {
        if let Ok(mut active) = ACTIVE_GRAPH.get_or_init(|| Mutex::new(None)).lock() {
            *active = None;
        }
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn vst3_session_retry_instance(instance_id: String) -> Result<Value, String> {
    let graph = active_graph()?;
    let payloads = graph
        .inner
        .payloads
        .lock()
        .map_err(|_| "The VST3 graph payload list was poisoned.".to_string())?
        .values()
        .cloned()
        .collect::<Vec<_>>();
    let sample_rate = graph.inner.sample_rate;
    drop(graph);
    if let Ok(mut active) = ACTIVE_GRAPH.get_or_init(|| Mutex::new(None)).lock() {
        *active = None;
    }
    let graph = Vst3GraphService::start(&payloads, sample_rate)?
        .ok_or_else(|| "The VST3 graph could not be restarted.".to_string())?;
    vst3_instance_status(&graph, &instance_id)
}

#[tauri::command]
pub(crate) fn vst3_session_get_state(instance_id: String) -> Result<HostedStatePayload, String> {
    active_graph()?.get_state(&instance_id)
}

#[tauri::command]
pub(crate) fn vst3_session_set_state(
    instance_id: String,
    snapshot: HostedStatePayload,
) -> Result<bool, String> {
    let graph = active_graph()?;
    graph.set_state(&instance_id, snapshot.clone())?;
    if let Some(payload) = graph
        .inner
        .payloads
        .lock()
        .map_err(|_| "The VST3 graph payload list was poisoned.".to_string())?
        .get_mut(&instance_id)
    {
        payload.state = Some(snapshot);
    }
    Ok(true)
}

#[tauri::command]
pub(crate) fn vst3_session_open_vendor_editor(
    instance_id: String,
    window: tauri::Window,
) -> Result<Value, String> {
    #[cfg(windows)]
    let owner_window_handle = window
        .hwnd()
        .map_err(|_| "Pocket DAW could not identify its editor owner window.".to_string())?
        .0 as u64;
    #[cfg(not(windows))]
    let owner_window_handle = 0u64;
    let response=active_graph()?.control("openEditor",serde_json::json!({"instanceId":instance_id,"ownerWindowHandle":owner_window_handle,"title":"Pocket DAW Plug-in"}))?;
    Ok(
        serde_json::json!({"opened":response["ok"]==true,"code":if response["ok"]==true{"opened"}else{"unavailable"}}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shared_layout_is_bounded_and_stable() {
        assert_eq!(SHARED_EVENT_BYTES, 24);
        assert_eq!(SHARED_PARAMETER_BYTES, 16);
        assert_eq!(STATE_OFFSET + MAX_PLUGIN_STATE_BYTES, SHARED_BYTES);
    }
    #[test]
    fn hostile_plugin_timing_is_bounded_before_it_reaches_native_audio() {
        assert_eq!(
            bounded_hosted_timing(u64::MAX, u64::MAX),
            (MAX_HOSTED_LATENCY_SAMPLES, MAX_HOSTED_TAIL_SAMPLES)
        );
    }
    #[test]
    fn automation_payload_is_path_free() {
        let value = serde_json::json!({"instanceId":"x","role":"effect","trackId":"t","enabled":true,
            "identity":{"format":"vst3","classId":"0".repeat(32),"vendor":"v","name":"n","version":"1","category":"Fx",
            "moduleFilename":"x.vst3","binaryFingerprint":"0".repeat(64)},"parameters":{},"automation":[]});
        let text = value.to_string();
        assert!(!text.contains("modulePath"));
    }
    #[test]
    fn callback_scope_is_detectable_by_blocking_graph_guards() {
        assert!(!AUDIO_CALLBACK_SCOPE.with(|active| active.get()));
        with_audio_callback_scope(|| assert!(AUDIO_CALLBACK_SCOPE.with(|active| active.get())));
        assert!(!AUDIO_CALLBACK_SCOPE.with(|active| active.get()));
    }
    #[test]
    fn graph_reconciliation_reloads_changed_identity_state_and_removes_obsolete_instances() {
        let make = |id: &str, fingerprint: &str| HostedInstancePayload {
            instance_id: id.to_string(),
            role: "effect".to_string(),
            track_id: "t".to_string(),
            chain_id: Some("c".to_string()),
            enabled: true,
            identity: HostedPluginIdentity {
                format: "vst3".to_string(),
                class_id: "0".repeat(32),
                vendor: "v".to_string(),
                name: "n".to_string(),
                version: "1".to_string(),
                category: "Fx".to_string(),
                module_filename: "x.vst3".to_string(),
                binary_fingerprint: fingerprint.repeat(64),
            },
            state: None,
            parameters: BTreeMap::new(),
            automation: Vec::new(),
        };
        let current = HashMap::from([
            ("same".to_string(), make("same", "a")),
            ("old".to_string(), make("old", "a")),
        ]);
        let desired = HashMap::from([
            ("same".to_string(), make("same", "b")),
            ("new".to_string(), make("new", "a")),
        ]);
        let (unload, load) = graph_reconciliation(&current, &desired);
        assert_eq!(unload, vec!["old".to_string(), "same".to_string()]);
        assert_eq!(
            load.into_iter()
                .map(|payload| payload.instance_id)
                .collect::<Vec<_>>(),
            vec!["new".to_string(), "same".to_string()]
        );
    }
}
