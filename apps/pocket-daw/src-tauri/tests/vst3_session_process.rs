#![cfg(windows)]

use serde_json::Value;
use std::ffi::c_void;
use std::mem::size_of;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::ptr::{null, null_mut};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use windows_sys::Win32::Foundation::{CloseHandle, HANDLE, INVALID_HANDLE_VALUE};
use windows_sys::Win32::Storage::FileSystem::{
    CreateFileW, ReadFile, WriteFile, FILE_ATTRIBUTE_NORMAL, FILE_GENERIC_READ, FILE_GENERIC_WRITE,
    OPEN_EXISTING,
};
use windows_sys::Win32::System::Memory::{
    CreateFileMappingW, MapViewOfFile, UnmapViewOfFile, FILE_MAP_ALL_ACCESS,
    MEMORY_MAPPED_VIEW_ADDRESS, PAGE_READWRITE,
};
use windows_sys::Win32::System::Pipes::WaitNamedPipeW;
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DestroyWindow, DispatchMessageW, GetWindow, PeekMessageW, TranslateMessage,
    GW_OWNER, MSG, PM_REMOVE, WS_OVERLAPPEDWINDOW,
};

const SHARED_BYTES: usize = 33_566_848;
const INPUT_OFFSET: usize = 128;
const OUTPUT_OFFSET: usize = INPUT_OFFSET + 2 * 128 * 4;
const EVENT_OFFSET: usize = OUTPUT_OFFSET + 2 * 128 * 4;
const PARAMETER_OFFSET: usize = EVENT_OFFSET + 256 * size_of::<SharedEvent>();
const STATE_OFFSET: usize = PARAMETER_OFFSET + 256 * size_of::<SharedParameter>();

#[repr(C)]
struct Header {
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
#[derive(Clone, Copy)]
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
#[derive(Clone, Copy)]
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

struct OwnerWindow {
    handle: windows_sys::Win32::Foundation::HWND,
    stop: std::sync::mpsc::Sender<()>,
    thread: Option<std::thread::JoinHandle<()>>,
}

impl OwnerWindow {
    fn new() -> Self {
        let (handle_sender, handle_receiver) = std::sync::mpsc::sync_channel(0);
        let (stop, stop_receiver) = std::sync::mpsc::channel();
        let thread = std::thread::spawn(move || {
            let class = "STATIC"
                .encode_utf16()
                .chain(std::iter::once(0))
                .collect::<Vec<_>>();
            let title = "Pocket DAW Test Owner"
                .encode_utf16()
                .chain(std::iter::once(0))
                .collect::<Vec<_>>();
            let window = unsafe {
                CreateWindowExW(
                    0,
                    class.as_ptr(),
                    title.as_ptr(),
                    WS_OVERLAPPEDWINDOW,
                    0,
                    0,
                    320,
                    200,
                    null_mut(),
                    null_mut(),
                    null_mut(),
                    null(),
                )
            };
            handle_sender.send(window as usize).unwrap();
            while stop_receiver.try_recv().is_err() {
                let mut message: MSG = unsafe { std::mem::zeroed() };
                while unsafe { PeekMessageW(&mut message, null_mut(), 0, 0, PM_REMOVE) } != 0 {
                    unsafe {
                        TranslateMessage(&message);
                        DispatchMessageW(&message);
                    }
                }
                thread::sleep(Duration::from_millis(4));
            }
            unsafe {
                DestroyWindow(window);
            }
        });
        let handle = handle_receiver.recv().unwrap() as windows_sys::Win32::Foundation::HWND;
        assert!(!handle.is_null());
        Self {
            handle,
            stop,
            thread: Some(thread),
        }
    }
}

impl Drop for OwnerWindow {
    fn drop(&mut self) {
        let _ = self.stop.send(());
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

impl Mapping {
    fn new(suffix: &str) -> Self {
        let name = format!("Local\\PocketDAWVST3-{suffix}");
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
        assert!(!handle.is_null(), "create shared mapping");
        let mapped = unsafe { MapViewOfFile(handle, FILE_MAP_ALL_ACCESS, 0, 0, SHARED_BYTES) };
        assert!(!mapped.Value.is_null(), "map shared memory");
        unsafe { std::ptr::write_bytes(mapped.Value, 0, SHARED_BYTES) };
        Self {
            handle,
            view: mapped.Value.cast(),
            name,
        }
    }

    unsafe fn header(&mut self) -> &mut Header {
        unsafe { &mut *self.view.cast::<Header>() }
    }

    unsafe fn initialize(&mut self, input_channels: u32, output_channels: u32) {
        let header = unsafe { self.header() };
        *header = Header {
            magic: 0x50445633,
            version: 1,
            total_bytes: SHARED_BYTES as u32,
            max_frames: 128,
            frame_count: 128,
            input_channels,
            output_channels,
            event_count: 0,
            parameter_count: 0,
            state_size: 0,
            transport_flags: 1 | 4,
            process_status: u32::MAX,
            project_time_samples: 4_800,
            continuous_time_samples: 9_600,
            sample_rate: 48_000.0,
            project_ppq: 12.5,
            bar_position_ppq: 12.0,
            loop_start_ppq: 8.0,
            loop_end_ppq: 16.0,
            tempo: 123.0,
            numerator: 7,
            denominator: 8,
            elapsed_micros: 0,
        };
    }

    unsafe fn output(&self, channel: usize, frame: usize) -> f32 {
        unsafe {
            std::ptr::read_unaligned(
                self.view
                    .add(OUTPUT_OFFSET + (channel * 128 + frame) * 4)
                    .cast::<f32>(),
            )
        }
    }

    unsafe fn input(&mut self, channel: usize, frame: usize, value: f32) {
        unsafe {
            std::ptr::write_unaligned(
                self.view
                    .add(INPUT_OFFSET + (channel * 128 + frame) * 4)
                    .cast::<f32>(),
                value,
            )
        }
    }

    unsafe fn event(&mut self, index: usize, event: SharedEvent) {
        unsafe {
            std::ptr::write_unaligned(
                self.view
                    .add(EVENT_OFFSET + index * size_of::<SharedEvent>())
                    .cast::<SharedEvent>(),
                event,
            )
        }
    }

    unsafe fn parameter(&mut self, index: usize, parameter: SharedParameter) {
        unsafe {
            std::ptr::write_unaligned(
                self.view
                    .add(PARAMETER_OFFSET + index * size_of::<SharedParameter>())
                    .cast::<SharedParameter>(),
                parameter,
            )
        }
    }
}

impl Drop for Mapping {
    fn drop(&mut self) {
        unsafe {
            let _ = UnmapViewOfFile(MEMORY_MAPPED_VIEW_ADDRESS {
                Value: self.view.cast::<c_void>(),
            });
            CloseHandle(self.handle);
        }
    }
}

#[test]
fn persistent_session_graph_processes_two_fixture_instances_and_recovers_cleanly() {
    assert_eq!(size_of::<Header>(), 128);
    assert_eq!(size_of::<SharedEvent>(), 24);
    assert_eq!(size_of::<SharedParameter>(), 16);
    assert_eq!(STATE_OFFSET + 32 * 1024 * 1024, SHARED_BYTES);
    let owner_window = OwnerWindow::new();

    let sidecar = test_sidecar_path();
    let fixture = test_fixture_path();
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let pipe_name = format!(r"\\.\pipe\pocket-daw-vst3-session-{nonce}");
    let mut instrument_mapping = Mapping::new(&format!("instrument-{nonce}"));
    let mut effect_mapping = Mapping::new(&format!("effect-{nonce}"));
    let mut child = Command::new(&sidecar)
        .args(["--mode", "session", "--pipe", &pipe_name])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn session host");
    let wide_pipe = pipe_name
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let deadline = Instant::now() + Duration::from_secs(5);
    while unsafe { WaitNamedPipeW(wide_pipe.as_ptr(), 200) } == 0 {
        assert!(
            Instant::now() < deadline,
            "session pipe should become available"
        );
        thread::sleep(Duration::from_millis(10));
    }
    let pipe = unsafe {
        CreateFileW(
            wide_pipe.as_ptr(),
            FILE_GENERIC_READ | FILE_GENERIC_WRITE,
            0,
            null(),
            OPEN_EXISTING,
            FILE_ATTRIBUTE_NORMAL,
            null_mut(),
        )
    };
    assert_ne!(pipe, INVALID_HANDLE_VALUE);

    assert_eq!(send(pipe, "hello", Value::Null)["code"], "sessionReady");
    let instrument = send(
        pipe,
        "loadInstance",
        serde_json::json!({
            "instanceId":"instrument", "modulePath":fixture,
            "classId":"504441575343414E4649585455524531", "sampleRate":48000.0,
            "sharedMemoryName":instrument_mapping.name
        }),
    );
    assert_eq!(instrument["code"], "instanceLoaded");
    assert_eq!(instrument["instance"]["role"], "instrument");
    assert_eq!(instrument["instance"]["sharedMemoryBytes"], SHARED_BYTES);
    let effect = send(
        pipe,
        "loadInstance",
        serde_json::json!({
            "instanceId":"effect", "modulePath":fixture,
            "classId":"504441575343414E4649585455524533", "sampleRate":48000.0,
            "sharedMemoryName":effect_mapping.name
        }),
    );
    assert_eq!(effect["code"], "instanceLoaded");
    assert_eq!(effect["instance"]["role"], "effect");
    assert_eq!(effect["instance"]["inputChannels"], 1);
    assert_eq!(effect["instance"]["outputChannels"], 1);
    assert_eq!(effect["instance"]["latencySamples"], 7);
    assert_eq!(effect["instance"]["tailSamples"], 64);
    assert_eq!(instrument["instance"]["editorAvailable"], true);
    let parameters = send(
        pipe,
        "queryParameters",
        serde_json::json!({"instanceId":"instrument"}),
    );
    assert_eq!(parameters["code"], "parametersReady");
    let parameter_list = parameters["parameters"].as_array().unwrap();
    assert_eq!(parameter_list.len(), 2);
    assert_eq!(
        parameter_list
            .iter()
            .find(|item| item["parameterId"] == 100)
            .unwrap()["title"],
        "Gain"
    );
    assert_eq!(
        parameter_list
            .iter()
            .find(|item| item["parameterId"] == 101)
            .unwrap()["stepCount"],
        1
    );
    let programs = send(
        pipe,
        "queryPrograms",
        serde_json::json!({"instanceId":"instrument"}),
    );
    assert_eq!(programs["code"], "programsReady");
    assert_eq!(programs["programs"].as_array().unwrap().len(), 2);
    assert_eq!(programs["programs"][0]["programName"], "Soft");
    assert_eq!(programs["programs"][1]["programName"], "Loud");

    unsafe {
        instrument_mapping.initialize(0, 2);
        instrument_mapping.header().event_count = 2;
        instrument_mapping.header().parameter_count = 1;
        instrument_mapping.event(
            0,
            SharedEvent {
                kind: 0,
                sample_offset: 32,
                note_id: 7,
                channel: 0,
                pitch: 60,
                value: 0.5,
                tuning: 0.0,
            },
        );
        instrument_mapping.event(
            1,
            SharedEvent {
                kind: 1,
                sample_offset: 96,
                note_id: 7,
                channel: 0,
                pitch: 60,
                value: 0.0,
                tuning: 0.0,
            },
        );
        instrument_mapping.parameter(
            0,
            SharedParameter {
                parameter_id: 100,
                sample_offset: 64,
                value: 1.0,
            },
        );
    }
    let processed = send(
        pipe,
        "processBlock",
        serde_json::json!({"instanceId":"instrument","deadlineMicros":1_000_000}),
    );
    assert_eq!(processed["code"], "blockProcessed");
    unsafe {
        assert_eq!(instrument_mapping.output(0, 31), 0.0);
        assert!((instrument_mapping.output(0, 32) - 0.25).abs() < 0.0001);
        assert!((instrument_mapping.output(0, 64) - 0.5).abs() < 0.0001);
        assert_eq!(instrument_mapping.output(0, 96), 0.0);
    }

    unsafe {
        effect_mapping.initialize(1, 1);
        effect_mapping.header().parameter_count = 1;
        effect_mapping.parameter(
            0,
            SharedParameter {
                parameter_id: 100,
                sample_offset: 0,
                value: 1.0,
            },
        );
        effect_mapping.input(0, 0, 1.0);
    }
    assert_eq!(
        send(
            pipe,
            "processBlock",
            serde_json::json!({"instanceId":"effect","deadlineMicros":1_000_000})
        )["code"],
        "blockProcessed"
    );
    unsafe {
        assert_eq!(effect_mapping.output(0, 0), 0.0);
        assert_eq!(effect_mapping.output(0, 7), 1.0);
    }
    let state = send(
        pipe,
        "getState",
        serde_json::json!({"instanceId":"instrument"}),
    );
    assert_eq!(state["code"], "stateReady");
    assert!(state["stateSize"].as_u64().unwrap() >= 64);
    unsafe {
        let state_base = instrument_mapping.view.add(STATE_OFFSET);
        assert_eq!(
            std::ptr::read_unaligned(state_base.cast::<u32>()),
            0x50444658
        );
        assert_eq!(
            std::ptr::read_unaligned(state_base.add(16).cast::<f64>()),
            123.0
        );
        assert_eq!(
            std::ptr::read_unaligned(state_base.add(24).cast::<f64>()),
            12.5
        );
        assert_eq!(
            std::ptr::read_unaligned(state_base.add(32).cast::<f64>()),
            8.0
        );
        assert_eq!(
            std::ptr::read_unaligned(state_base.add(40).cast::<f64>()),
            16.0
        );
        assert_eq!(
            std::ptr::read_unaligned(state_base.add(48).cast::<i64>()),
            4_800
        );
        let flags = std::ptr::read_unaligned(state_base.add(56).cast::<u32>());
        assert_ne!(flags & (1 << 1), 0, "playing context");
        assert_ne!(flags & (1 << 2), 0, "loop context");
        assert_eq!(
            std::ptr::read_unaligned(state_base.add(60).cast::<i32>()),
            7
        );
        assert_eq!(
            std::ptr::read_unaligned(state_base.add(64).cast::<i32>()),
            8
        );
        let expected_event_ppq = 12.5 + (96.0 / 48_000.0) * (123.0 / 60.0);
        assert!(
            (std::ptr::read_unaligned(state_base.add(72).cast::<f64>()) - expected_event_ppq).abs()
                < 0.000001
        );
        let gain = instrument_mapping.view.add(STATE_OFFSET + 8).cast::<f64>();
        std::ptr::write_unaligned(gain, 0.2);
    }
    assert_eq!(
        send(
            pipe,
            "setState",
            serde_json::json!({"instanceId":"instrument"})
        )["code"],
        "stateReady"
    );

    unsafe {
        instrument_mapping.initialize(0, 2);
        instrument_mapping.header().event_count = 1;
        instrument_mapping.event(
            0,
            SharedEvent {
                kind: 0,
                sample_offset: 0,
                note_id: 8,
                channel: 0,
                pitch: 60,
                value: 1.0,
                tuning: 0.0,
            },
        );
    }
    assert_eq!(
        send(
            pipe,
            "processBlock",
            serde_json::json!({"instanceId":"instrument","deadlineMicros":1_000_000})
        )["code"],
        "blockProcessed"
    );
    unsafe {
        assert!((instrument_mapping.output(0, 0) - 0.2).abs() < 0.0001);
    }

    let editor = send(
        pipe,
        "openEditor",
        serde_json::json!({"instanceId":"instrument","title":"Pocket DAW Fixture Editor","ownerWindowHandle":owner_window.handle as u64}),
    );
    assert_eq!(editor["code"], "editorOpened");
    assert!(editor["editorWindowHandle"].as_u64().unwrap() != 0);
    let editor_handle =
        editor["editorWindowHandle"].as_u64().unwrap() as windows_sys::Win32::Foundation::HWND;
    assert_eq!(
        unsafe { GetWindow(editor_handle, GW_OWNER) },
        owner_window.handle
    );
    let edits = send(
        pipe,
        "pollParameterEdits",
        serde_json::json!({"instanceId":"instrument"}),
    );
    assert_eq!(edits["code"], "editsReady");
    assert_eq!(edits["editorOpen"], true);
    assert!(edits["parameterEdits"]
        .as_array()
        .unwrap()
        .iter()
        .any(|edit| edit["parameterId"] == 100 && edit["value"] == 0.625));
    unsafe {
        instrument_mapping.initialize(0, 2);
        instrument_mapping.header().event_count = 1;
        instrument_mapping.event(
            0,
            SharedEvent {
                kind: 0,
                sample_offset: 0,
                note_id: 9,
                channel: 0,
                pitch: 60,
                value: 1.0,
                tuning: 0.0,
            },
        );
    }
    assert_eq!(
        send(
            pipe,
            "processBlock",
            serde_json::json!({"instanceId":"instrument","deadlineMicros":1_000_000})
        )["code"],
        "blockProcessed"
    );
    unsafe {
        assert!((instrument_mapping.output(0, 0) - 0.625).abs() < 0.0001);
    }

    // A render-boundary reset snapshots opaque component/controller state before
    // unloading. Recreate the instance from that snapshot and prove the editor
    // change remains audible, rather than testing parameter metadata alone.
    let captured = send(
        pipe,
        "getState",
        serde_json::json!({"instanceId":"instrument"}),
    );
    assert_eq!(captured["code"], "stateReady");
    let captured_size = captured["stateSize"].as_u64().unwrap() as usize;
    let captured_state = unsafe {
        std::slice::from_raw_parts(instrument_mapping.view.add(STATE_OFFSET), captured_size)
            .to_vec()
    };
    assert_eq!(
        send(
            pipe,
            "closeEditor",
            serde_json::json!({"instanceId":"instrument"})
        )["code"],
        "editorClosed"
    );
    let closed_editor = send(
        pipe,
        "pollParameterEdits",
        serde_json::json!({"instanceId":"instrument"}),
    );
    assert_eq!(closed_editor["editorOpen"], false);
    assert_eq!(
        send(
            pipe,
            "unloadInstance",
            serde_json::json!({"instanceId":"instrument"})
        )["code"],
        "instanceUnloaded"
    );
    assert_eq!(
        send(
            pipe,
            "loadInstance",
            serde_json::json!({
                "instanceId":"instrument", "modulePath":fixture,
                "classId":"504441575343414E4649585455524531", "sampleRate":48000.0,
                "sharedMemoryName":instrument_mapping.name
            })
        )["code"],
        "instanceLoaded"
    );
    unsafe {
        instrument_mapping.initialize(0, 2);
        std::ptr::copy_nonoverlapping(
            captured_state.as_ptr(),
            instrument_mapping.view.add(STATE_OFFSET),
            captured_state.len(),
        );
        instrument_mapping.header().state_size = captured_state.len() as u32;
    }
    assert_eq!(
        send(
            pipe,
            "setState",
            serde_json::json!({"instanceId":"instrument"})
        )["code"],
        "stateReady"
    );
    unsafe {
        instrument_mapping.initialize(0, 2);
        instrument_mapping.header().event_count = 1;
        instrument_mapping.event(
            0,
            SharedEvent {
                kind: 0,
                sample_offset: 0,
                note_id: 91,
                channel: 0,
                pitch: 60,
                value: 1.0,
                tuning: 0.0,
            },
        );
    }
    assert_eq!(
        send(
            pipe,
            "processBlock",
            serde_json::json!({"instanceId":"instrument","deadlineMicros":1_000_000})
        )["code"],
        "blockProcessed"
    );
    unsafe {
        assert!((instrument_mapping.output(0, 0) - 0.625).abs() < 0.0001);
    }

    assert_eq!(
        send(
            pipe,
            "setParameter",
            serde_json::json!({"instanceId":"instrument","parameterId":100,"value":0.3})
        )["code"],
        "parameterSet"
    );
    unsafe {
        instrument_mapping.initialize(0, 2);
        instrument_mapping.header().event_count = 1;
        instrument_mapping.event(
            0,
            SharedEvent {
                kind: 0,
                sample_offset: 0,
                note_id: 10,
                channel: 0,
                pitch: 60,
                value: 1.0,
                tuning: 0.0,
            },
        );
    }
    assert_eq!(
        send(
            pipe,
            "processBlock",
            serde_json::json!({"instanceId":"instrument","deadlineMicros":1_000_000})
        )["code"],
        "blockProcessed"
    );
    unsafe {
        assert!((instrument_mapping.output(0, 0) - 0.3).abs() < 0.0001);
    }

    assert_eq!(
        send(
            pipe,
            "selectProgram",
            serde_json::json!({"instanceId":"instrument","listId":1,"programIndex":1})
        )["code"],
        "programSelected"
    );
    unsafe {
        instrument_mapping.initialize(0, 2);
        instrument_mapping.header().event_count = 1;
        instrument_mapping.event(
            0,
            SharedEvent {
                kind: 0,
                sample_offset: 0,
                note_id: 11,
                channel: 0,
                pitch: 60,
                value: 1.0,
                tuning: 0.0,
            },
        );
    }
    assert_eq!(
        send(
            pipe,
            "processBlock",
            serde_json::json!({"instanceId":"instrument","deadlineMicros":1_000_000})
        )["code"],
        "blockProcessed"
    );
    unsafe {
        assert!((instrument_mapping.output(0, 0) - 0.75).abs() < 0.0001);
    }
    unsafe {
        instrument_mapping.initialize(0, 2);
        instrument_mapping.header().event_count = 1;
        instrument_mapping.event(
            0,
            SharedEvent {
                kind: 0,
                sample_offset: 0,
                note_id: 12,
                channel: 0,
                pitch: 60,
                value: 1.0,
                tuning: 0.0,
            },
        );
    }
    let missed = send(
        pipe,
        "processBlock",
        serde_json::json!({"instanceId":"instrument","deadlineMicros":0}),
    );
    assert_eq!(missed["code"], "deadlineMissed");
    assert_eq!(missed["deadlineMissed"], true);
    unsafe {
        assert_eq!(instrument_mapping.output(0, 0), 0.0);
    }

    assert_eq!(
        send(
            pipe,
            "unloadInstance",
            serde_json::json!({"instanceId":"instrument"})
        )["code"],
        "instanceUnloaded"
    );
    assert_eq!(
        send(
            pipe,
            "unloadInstance",
            serde_json::json!({"instanceId":"effect"})
        )["code"],
        "instanceUnloaded"
    );
    assert_eq!(send(pipe, "shutdown", Value::Null)["code"], "shutdown");
    unsafe { CloseHandle(pipe) };
    assert!(child.wait().expect("wait session host").success());
}

#[test]
#[ignore = "requires separately downloaded, unbundled official compatibility plug-ins"]
fn real_compat_scans_hosts_and_processes_js80p_and_surge_xt() {
    let sidecar = test_sidecar_path();
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/vst3-compat/plugins");
    let js80p = root.join("js80p-4.0.2/js80p-4_0_2-windows-x86_64-sse2-vst3_single/js80p.vst3");
    let surge = root.join("surge-xt-1.3.4/Surge XT.vst3");
    let surge_effects = root.join("surge-xt-1.3.4/Surge XT Effects.vst3");
    for module in [&js80p, &surge, &surge_effects] {
        assert!(
            module.exists(),
            "missing real compatibility module: {}",
            module.display()
        );
    }

    let js80p_descriptor = scan_single_class(&sidecar, &js80p, "instrument");
    let surge_descriptor = scan_single_class(&sidecar, &surge, "instrument");
    let effect_descriptor = scan_single_class(&sidecar, &surge_effects, "effect");
    assert_eq!(
        js80p_descriptor["classId"],
        "00565354414D4A386A73383070000000"
    );
    assert_eq!(
        surge_descriptor["classId"],
        "ABCDEF019182FAEB566D624153675854"
    );
    assert_eq!(
        effect_descriptor["classId"],
        "ABCDEF019182FAEB566D624153465854"
    );

    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let pipe_name = format!(r"\\.\pipe\pocket-daw-vst3-real-session-{nonce}");
    let mut js80p_mapping = Mapping::new(&format!("real-js80p-{nonce}"));
    let mut surge_mapping = Mapping::new(&format!("real-surge-{nonce}"));
    let mut effect_mapping = Mapping::new(&format!("real-surge-fx-{nonce}"));
    let mut child = Command::new(&sidecar)
        .args(["--mode", "session", "--pipe", &pipe_name])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn real compatibility session host");
    let pipe = connect_pipe(&pipe_name, Duration::from_secs(5));
    assert_eq!(send(pipe, "hello", Value::Null)["code"], "sessionReady");

    let js80p_loaded = load_real_instance(pipe, "js80p", &js80p, &js80p_descriptor, &js80p_mapping);
    let surge_loaded = load_real_instance(pipe, "surge", &surge, &surge_descriptor, &surge_mapping);
    let effect_loaded = load_real_instance(
        pipe,
        "surge-effects",
        &surge_effects,
        &effect_descriptor,
        &effect_mapping,
    );
    assert_real_bus_contract(&js80p_loaded, true);
    assert_real_bus_contract(&surge_loaded, true);
    assert_real_bus_contract(&effect_loaded, false);

    let js80p_parameters = assert_parameter_and_state_roundtrip(pipe, "js80p", &mut js80p_mapping);
    let surge_parameters = assert_parameter_and_state_roundtrip(pipe, "surge", &mut surge_mapping);
    let effect_parameters =
        assert_parameter_and_state_roundtrip(pipe, "surge-effects", &mut effect_mapping);

    // JS80P intentionally opens with its documented Blank patch. A real host
    // must select one of the supplied audible factory programs before an audio
    // assertion can distinguish correct note processing from the silent blank.
    let js80p_program = select_first_audible_factory_program(pipe, "js80p");
    let js80p_peak = render_real_instrument(pipe, "js80p", &mut js80p_mapping, 61);
    let surge_peak = render_real_instrument(pipe, "surge", &mut surge_mapping, 64);
    assert!(
        js80p_peak > 0.000001,
        "JS80P factory program {js80p_program:?} should produce audible output after note warmup"
    );
    assert!(
        surge_peak > 0.000001,
        "Surge XT should produce audible output after note warmup"
    );
    let (effect_peak, effect_difference) =
        render_real_effect(pipe, "surge-effects", &mut effect_mapping);
    assert!(
        effect_peak > 0.000001,
        "Surge XT Effects output should remain audible"
    );
    assert!(
        effect_difference > 0.0001,
        "Surge XT Effects should change deterministic dry input"
    );

    for instance_id in ["js80p", "surge", "surge-effects"] {
        assert_eq!(
            send(
                pipe,
                "unloadInstance",
                serde_json::json!({"instanceId":instance_id})
            )["code"],
            "instanceUnloaded"
        );
    }
    assert_eq!(send(pipe, "shutdown", Value::Null)["code"], "shutdown");
    unsafe { CloseHandle(pipe) };
    let deadline = Instant::now() + Duration::from_secs(5);
    let exit = loop {
        if let Some(status) = child.try_wait().expect("poll real session host") {
            break status;
        }
        assert!(
            Instant::now() < deadline,
            "real compatibility host became orphaned after shutdown"
        );
        thread::sleep(Duration::from_millis(10));
    };
    assert!(
        exit.success(),
        "real compatibility host should exit cleanly"
    );
    eprintln!(
        "REAL_VST3_SESSION_EVIDENCE={}",
        serde_json::json!({
            "classes":[js80p_descriptor,surge_descriptor,effect_descriptor],
            "parameters":{"js80p":js80p_parameters,"surgeXt":surge_parameters,"surgeXtEffects":effect_parameters},
            "selectedPrograms":{"js80p":js80p_program},
            "audioPeaks":{"js80p":js80p_peak,"surgeXt":surge_peak,"surgeXtEffects":effect_peak},
            "effectAbsoluteDifference":effect_difference,"cleanShutdown":true
        })
    );
}

fn select_first_audible_factory_program(pipe: HANDLE, instance_id: &str) -> String {
    let response = send(
        pipe,
        "queryPrograms",
        serde_json::json!({"instanceId":instance_id}),
    );
    assert_eq!(response["code"], "programsReady");
    let programs = response["programs"].as_array().expect("factory programs");
    let program = programs
        .iter()
        .find(|program| {
            !program["programName"]
                .as_str()
                .unwrap_or_default()
                .eq_ignore_ascii_case("blank")
        })
        .or_else(|| programs.first())
        .expect("an audible JS80P factory program");
    let selected = send(
        pipe,
        "selectProgram",
        serde_json::json!({
            "instanceId":instance_id,
            "listId":program["listId"],
            "programIndex":program["programIndex"]
        }),
    );
    assert_eq!(selected["code"], "programSelected");
    program["programName"]
        .as_str()
        .unwrap_or("unnamed")
        .to_string()
}

fn scan_single_class(sidecar: &Path, module: &Path, role: &str) -> Value {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let pipe_name = format!(r"\\.\pipe\pocket-daw-vst3-real-scan-{nonce}");
    let mut child = Command::new(sidecar)
        .args(["--mode", "scanner", "--pipe", &pipe_name])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("spawn real scanner");
    let pipe = connect_pipe(&pipe_name, Duration::from_secs(22));
    let response = send_mode(
        pipe,
        "scanner",
        "scanModule",
        serde_json::json!({"modulePath":module.to_string_lossy()}),
    );
    unsafe { CloseHandle(pipe) };
    assert!(child.wait().expect("wait real scanner").success());
    assert_eq!(
        response["code"],
        "scanComplete",
        "scan {}",
        module.display()
    );
    let key = if role == "instrument" {
        "supportsInstrumentRole"
    } else {
        "supportsEffectRole"
    };
    response["descriptors"]
        .as_array()
        .expect("real descriptor list")
        .iter()
        .find(|item| item[key] == true)
        .cloned()
        .unwrap_or_else(|| panic!("no {role} class in {}", module.display()))
}

fn test_sidecar_path() -> PathBuf {
    std::env::var_os("POCKET_DAW_TEST_PLUGIN_HOST_EXE")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_BIN_EXE_pocket-daw-plugin-host")))
}

fn test_fixture_path() -> PathBuf {
    std::env::var_os("POCKET_DAW_TEST_VST3_FIXTURE")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(env!("POCKET_DAW_VST3_SCANNER_FIXTURE")))
}

fn connect_pipe(pipe_name: &str, timeout: Duration) -> HANDLE {
    let wide = pipe_name
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let deadline = Instant::now() + timeout;
    while unsafe { WaitNamedPipeW(wide.as_ptr(), 200) } == 0 {
        assert!(Instant::now() < deadline, "pipe should become available");
        thread::sleep(Duration::from_millis(10));
    }
    let pipe = unsafe {
        CreateFileW(
            wide.as_ptr(),
            FILE_GENERIC_READ | FILE_GENERIC_WRITE,
            0,
            null(),
            OPEN_EXISTING,
            FILE_ATTRIBUTE_NORMAL,
            null_mut(),
        )
    };
    assert_ne!(pipe, INVALID_HANDLE_VALUE, "connect sidecar pipe");
    pipe
}

fn load_real_instance(
    pipe: HANDLE,
    instance_id: &str,
    module: &Path,
    descriptor: &Value,
    mapping: &Mapping,
) -> Value {
    let response = send(
        pipe,
        "loadInstance",
        serde_json::json!({"instanceId":instance_id,"modulePath":module.to_string_lossy(),
        "classId":descriptor["classId"],"sampleRate":48000.0,"sharedMemoryName":mapping.name}),
    );
    assert_eq!(
        response["code"], "instanceLoaded",
        "load {instance_id}: {response}"
    );
    response
}

fn assert_real_bus_contract(response: &Value, instrument: bool) {
    let instance = &response["instance"];
    assert_eq!(
        instance["role"],
        if instrument { "instrument" } else { "effect" }
    );
    assert!(instance["outputChannels"]
        .as_u64()
        .is_some_and(|value| (1..=2).contains(&value)));
    if instrument {
        assert_eq!(instance["inputChannels"], 0);
        assert!(instance["eventInputBuses"].as_u64().unwrap_or(0) >= 1);
    } else {
        assert!(instance["inputChannels"]
            .as_u64()
            .is_some_and(|value| (1..=2).contains(&value)));
    }
}

fn assert_parameter_and_state_roundtrip(
    pipe: HANDLE,
    instance_id: &str,
    mapping: &mut Mapping,
) -> usize {
    let parameters = send(
        pipe,
        "queryParameters",
        serde_json::json!({"instanceId":instance_id}),
    );
    assert_eq!(parameters["code"], "parametersReady");
    let list = parameters["parameters"]
        .as_array()
        .expect("real parameter list");
    assert!(!list.is_empty());
    if let Some(parameter) = list
        .iter()
        .find(|item| item["flags"].as_u64().unwrap_or(0) & 2 == 0)
    {
        let set = send(
            pipe,
            "setParameter",
            serde_json::json!({"instanceId":instance_id,"parameterId":parameter["parameterId"],"value":parameter["currentNormalized"]}),
        );
        assert_eq!(set["code"], "parameterSet");
    }
    let state = send(
        pipe,
        "getState",
        serde_json::json!({"instanceId":instance_id}),
    );
    assert_eq!(state["code"], "stateReady");
    let size = state["stateSize"].as_u64().unwrap_or(0) as usize;
    assert!(size > 0 && size <= 32 * 1024 * 1024);
    unsafe {
        assert_eq!(mapping.header().state_size as usize, size);
    }
    assert_eq!(
        send(
            pipe,
            "setState",
            serde_json::json!({"instanceId":instance_id})
        )["code"],
        "stateReady"
    );
    list.len()
}

fn render_real_instrument(
    pipe: HANDLE,
    instance_id: &str,
    mapping: &mut Mapping,
    pitch: i16,
) -> f32 {
    let mut peak = 0.0f32;
    for block in 0usize..192 {
        unsafe {
            mapping.initialize(0, 2);
            mapping.header().project_time_samples = (block * 128) as i64;
            mapping.header().continuous_time_samples = (block * 128) as i64;
            // Give the pending factory-program change one block before the
            // first note; program and note ordering at the same offset is not
            // defined by the VST3 interface.
            if block == 1 {
                mapping.header().event_count = 1;
                mapping.event(
                    0,
                    SharedEvent {
                        kind: 0,
                        sample_offset: 0,
                        note_id: pitch as i32,
                        channel: 0,
                        pitch,
                        value: 0.8,
                        tuning: 0.0,
                    },
                );
            }
        }
        let response = send(
            pipe,
            "processBlock",
            serde_json::json!({"instanceId":instance_id,"deadlineMicros":1_000_000}),
        );
        assert_eq!(response["code"], "blockProcessed");
        assert_ne!(response["deadlineMissed"], true);
        assert_ne!(response["disabled"], true);
        unsafe {
            for channel in 0..2 {
                for frame in 0..128 {
                    let value = mapping.output(channel, frame);
                    assert!(value.is_finite());
                    peak = peak.max(value.abs());
                }
            }
        }
        if peak > 0.000001 {
            break;
        }
    }
    peak
}

fn render_real_effect(pipe: HANDLE, instance_id: &str, mapping: &mut Mapping) -> (f32, f64) {
    let mut peak = 0.0f32;
    let mut difference = 0.0f64;
    for block in 0usize..32 {
        unsafe {
            mapping.initialize(2, 2);
            mapping.header().project_time_samples = (block * 128) as i64;
            mapping.header().continuous_time_samples = (block * 128) as i64;
            for frame in 0..128 {
                let dry = ((block * 128 + frame) as f32 * 0.03125).sin() * 0.2;
                mapping.input(0, frame, dry);
                mapping.input(1, frame, -dry);
            }
        }
        let response = send(
            pipe,
            "processBlock",
            serde_json::json!({"instanceId":instance_id,"deadlineMicros":1_000_000}),
        );
        assert_eq!(response["code"], "blockProcessed");
        assert_ne!(response["deadlineMissed"], true);
        assert_ne!(response["disabled"], true);
        unsafe {
            for frame in 0..128 {
                let dry = ((block * 128 + frame) as f32 * 0.03125).sin() * 0.2;
                let left = mapping.output(0, frame);
                let right = mapping.output(1, frame);
                assert!(left.is_finite() && right.is_finite());
                peak = peak.max(left.abs()).max(right.abs());
                difference += f64::from((left - dry).abs() + (right + dry).abs());
            }
        }
    }
    (peak, difference)
}

fn send(pipe: HANDLE, kind: &str, payload: Value) -> Value {
    send_mode(pipe, "session", kind, payload)
}

fn send_mode(pipe: HANDLE, mode: &str, kind: &str, payload: Value) -> Value {
    eprintln!("vst3 session test -> {kind}");
    let body = serde_json::to_vec(&serde_json::json!({
        "protocolVersion":2, "requestId":format!("{kind}-request"),
        "mode":mode, "kind":kind, "payload":payload
    }))
    .unwrap();
    write_all(pipe, &(body.len() as u32).to_le_bytes());
    write_all(pipe, &body);
    let mut length = [0u8; 4];
    read_exact(pipe, &mut length);
    let mut response = vec![0u8; u32::from_le_bytes(length) as usize];
    assert!(response.len() < 1024 * 1024);
    read_exact(pipe, &mut response);
    let value = serde_json::from_slice(&response).expect("valid response");
    eprintln!("vst3 session test <- {kind}");
    value
}

fn read_exact(handle: HANDLE, bytes: &mut [u8]) {
    let mut offset = 0;
    while offset < bytes.len() {
        let mut read = 0;
        let ok = unsafe {
            ReadFile(
                handle,
                bytes[offset..].as_mut_ptr(),
                (bytes.len() - offset) as u32,
                &mut read,
                null_mut(),
            )
        };
        assert_ne!(ok, 0);
        assert_ne!(read, 0);
        offset += read as usize;
    }
}

fn write_all(handle: HANDLE, bytes: &[u8]) {
    let mut offset = 0;
    while offset < bytes.len() {
        let mut written = 0;
        let ok = unsafe {
            WriteFile(
                handle,
                bytes[offset..].as_ptr(),
                (bytes.len() - offset) as u32,
                &mut written,
                null_mut(),
            )
        };
        assert_ne!(ok, 0);
        assert_ne!(written, 0);
        offset += written as usize;
    }
}
