#![cfg(windows)]

use serde_json::Value;
use std::process::{Command, Stdio};
use std::ptr::null_mut;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
use windows_sys::Win32::Storage::FileSystem::{
    CreateFileW, ReadFile, WriteFile, FILE_GENERIC_READ, FILE_GENERIC_WRITE, OPEN_EXISTING,
};
use windows_sys::Win32::System::Pipes::WaitNamedPipeW;

#[test]
fn scanner_process_returns_fixture_descriptors_over_the_bounded_pipe_protocol() {
    let sidecar = env!("CARGO_BIN_EXE_pocket-daw-plugin-host");
    let fixture = env!("POCKET_DAW_VST3_SCANNER_FIXTURE");
    let suffix = format!("integration-{}", std::process::id());
    let pipe_name = format!(r"\\.\pipe\pocket-daw-vst3-{suffix}");
    let mut child = Command::new(sidecar)
        .args(["--mode", "scanner", "--pipe", &pipe_name])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("spawn scanner sidecar");

    let wide_name = pipe_name
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let deadline = Instant::now() + Duration::from_secs(5);
    while unsafe { WaitNamedPipeW(wide_name.as_ptr(), 200) } == 0 {
        assert!(
            Instant::now() < deadline,
            "scanner pipe should become available"
        );
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
    assert_ne!(handle, INVALID_HANDLE_VALUE, "connect scanner pipe");
    let request = serde_json::to_vec(&serde_json::json!({
        "protocolVersion": 2,
        "requestId": "fixture-process-test",
        "mode": "scanner",
        "kind": "scanModule",
        "payload": { "modulePath": fixture }
    }))
    .unwrap();
    write_all(handle, &(request.len() as u32).to_le_bytes());
    write_all(handle, &request);
    let mut length = [0_u8; 4];
    read_exact(handle, &mut length);
    let mut response = vec![0_u8; u32::from_le_bytes(length) as usize];
    assert!(response.len() < 1024 * 1024);
    read_exact(handle, &mut response);
    unsafe { CloseHandle(handle) };

    let response: Value = serde_json::from_slice(&response).expect("valid scanner response");
    assert_eq!(response["ok"], true);
    assert_eq!(response["code"], "scanComplete");
    assert_eq!(response["scannerAvailable"], true);
    assert_eq!(response["audioHostingAvailable"], true);
    assert_eq!(response["descriptors"].as_array().unwrap().len(), 2);
    assert_eq!(
        response["descriptors"][0]["classId"],
        "504441575343414E4649585455524531"
    );
    assert_eq!(
        response["descriptors"][0]["name"],
        "Pocket DAW Fixture Instrument"
    );
    assert_eq!(response["descriptors"][0]["supportsInstrumentRole"], true);
    assert!(child.wait().expect("wait scanner").success());
}

#[test]
#[ignore = "requires separately downloaded, unbundled official compatibility plug-ins"]
fn scanner_process_reports_real_js80p_and_surge_xt_classes() {
    let sidecar = env!("CARGO_BIN_EXE_pocket-daw-plugin-host");
    let root =
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/vst3-compat/plugins");
    let modules = [
        root.join("js80p-4.0.2/js80p-4_0_2-windows-x86_64-sse2-vst3_single/js80p.vst3"),
        root.join("surge-xt-1.3.4/Surge XT.vst3"),
        root.join("surge-xt-1.3.4/Surge XT Effects.vst3"),
    ];
    let mut evidence = Vec::new();
    for module in modules {
        assert!(
            module.exists(),
            "missing real compatibility module: {}",
            module.display()
        );
        let response = scan_module(sidecar, &module);
        assert_eq!(
            response["ok"],
            true,
            "scan failed for {}: {response}",
            module.display()
        );
        let descriptors = response["descriptors"].as_array().expect("descriptor list");
        assert!(
            !descriptors.is_empty(),
            "no classes for {}",
            module.display()
        );
        evidence.push(serde_json::json!({
            "moduleFilename": module.file_name().and_then(|value| value.to_str()).unwrap_or("unknown"),
            "descriptors": descriptors,
        }));
    }
    assert!(evidence
        .iter()
        .flat_map(|module| module["descriptors"].as_array().unwrap())
        .any(|descriptor| descriptor["supportsInstrumentRole"] == true));
    assert!(evidence
        .iter()
        .flat_map(|module| module["descriptors"].as_array().unwrap())
        .any(|descriptor| descriptor["supportsEffectRole"] == true));
    eprintln!(
        "REAL_VST3_SCAN_EVIDENCE={}",
        serde_json::to_string(&evidence).unwrap()
    );
}

fn scan_module(sidecar: &str, module: &std::path::Path) -> Value {
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
        .expect("spawn real scanner sidecar");
    let wide_name = pipe_name
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let deadline = Instant::now() + Duration::from_secs(22);
    while unsafe { WaitNamedPipeW(wide_name.as_ptr(), 200) } == 0 {
        assert!(
            Instant::now() < deadline,
            "real scanner pipe should become available"
        );
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
    assert_ne!(handle, INVALID_HANDLE_VALUE, "connect real scanner pipe");
    let request = serde_json::to_vec(&serde_json::json!({
        "protocolVersion":2,"requestId":"real-compat-scan","mode":"scanner","kind":"scanModule",
        "payload":{"modulePath":module.to_string_lossy()}
    }))
    .unwrap();
    write_all(handle, &(request.len() as u32).to_le_bytes());
    write_all(handle, &request);
    let mut length = [0u8; 4];
    read_exact(handle, &mut length);
    let mut bytes = vec![0u8; u32::from_le_bytes(length) as usize];
    assert!(bytes.len() < 1024 * 1024);
    read_exact(handle, &mut bytes);
    unsafe { CloseHandle(handle) };
    assert!(child.wait().expect("wait real scanner").success());
    serde_json::from_slice(&bytes).expect("valid real scan response")
}

fn read_exact(handle: windows_sys::Win32::Foundation::HANDLE, bytes: &mut [u8]) {
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
        assert_ne!(ok, 0);
        assert_ne!(read, 0);
        offset += read as usize;
    }
}

fn write_all(handle: windows_sys::Win32::Foundation::HANDLE, bytes: &[u8]) {
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
        assert_ne!(ok, 0);
        assert_ne!(written, 0);
        offset += written as usize;
    }
}
