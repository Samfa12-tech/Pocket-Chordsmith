use std::path::{Path, PathBuf};

use serde_json::Value;
use sha2::{Digest, Sha256};

const VST3_SDK_TAG: &str = "v3.8.0_build_66";
const VST3_SDK_COMMIT: &str = "9fad9770f2ae8542ab1a548a68c1ad1ac690abe0";

fn main() {
    tauri_build::build();
    println!("cargo:rerun-if-changed=plugin-host-native/vst3_scanner_shim.cpp");
    println!("cargo:rerun-if-changed=plugin-host-native/vst3_session_host.cpp");
    println!("cargo:rerun-if-changed=plugin-host-native/vst3_scanner_fixture.cpp");
    println!("cargo:rerun-if-changed=third_party/vst3sdk/SOURCE_LOCK.json");
    println!("cargo:rerun-if-changed=third_party/vst3sdk");
    println!("cargo:rustc-env=POCKET_DAW_VST3_SDK_TAG={VST3_SDK_TAG}");
    println!("cargo:rustc-env=POCKET_DAW_VST3_SDK_COMMIT={VST3_SDK_COMMIT}");

    let target = std::env::var("TARGET").unwrap_or_default();
    if !target.contains("windows-msvc") {
        println!("cargo:rustc-env=POCKET_DAW_VST3_SDK_LINKED=false");
        return;
    }

    let manifest_dir = PathBuf::from(std::env::var_os("CARGO_MANIFEST_DIR").expect("manifest dir"));
    let sdk_root = manifest_dir.join("third_party").join("vst3sdk");
    verify_vst3_sdk_lock(&sdk_root);

    let mut shim = cc::Build::new();
    shim.cpp(true)
        .include(&sdk_root)
        .file(manifest_dir.join("plugin-host-native/vst3_scanner_shim.cpp"))
        .file(manifest_dir.join("plugin-host-native/vst3_session_host.cpp"))
        .flag_if_supported("/std:c++17")
        .flag_if_supported("/EHsc")
        .warnings(true)
        .compile("pocket_daw_vst3_scanner");

    if std::env::var("PROFILE").as_deref() != Ok("release") {
        let out_dir = PathBuf::from(std::env::var_os("OUT_DIR").expect("Cargo OUT_DIR"));
        let fixture = build_scanner_fixture(&manifest_dir, &sdk_root, &out_dir);
        println!(
            "cargo:rustc-env=POCKET_DAW_VST3_SCANNER_FIXTURE={}",
            fixture.display()
        );
    }
    println!("cargo:rustc-env=POCKET_DAW_VST3_SDK_LINKED=true");
}

fn verify_vst3_sdk_lock(sdk_root: &Path) {
    let lock_path = sdk_root.join("SOURCE_LOCK.json");
    let lock: Value = serde_json::from_slice(
        &std::fs::read(&lock_path).expect("read pinned VST3 SDK source lock"),
    )
    .expect("parse pinned VST3 SDK source lock");
    assert_eq!(
        lock.get("tag").and_then(Value::as_str),
        Some(VST3_SDK_TAG),
        "Pinned VST3 SDK tag does not match the build attestation"
    );
    assert_eq!(
        lock.get("commit").and_then(Value::as_str),
        Some(VST3_SDK_COMMIT),
        "Pinned VST3 SDK commit does not match the build attestation"
    );
    let expected = lock
        .get("vendoredTreeSha256")
        .and_then(Value::as_str)
        .expect("VST3 SDK source lock is missing vendoredTreeSha256");
    let subsets = lock
        .get("vendoredSubset")
        .and_then(Value::as_array)
        .expect("VST3 SDK source lock is missing vendoredSubset");
    let mut files = Vec::new();
    for subset in subsets {
        let relative = subset
            .as_str()
            .expect("VST3 SDK vendoredSubset entries must be strings");
        collect_vendored_files(sdk_root, &sdk_root.join(relative), &mut files);
    }
    files.sort();
    files.dedup();
    let mut hasher = Sha256::new();
    for relative in files {
        let normalized = relative.to_string_lossy().replace('\\', "/");
        hasher.update(normalized.as_bytes());
        hasher.update([0]);
        // The checked VST3 subset is textual C/C++ source. Canonical LF keeps
        // the upstream source lock identical in Windows and LF worktrees;
        // executable sidecar output is still verified by its raw SHA-256.
        let bytes =
            std::fs::read(sdk_root.join(&relative)).expect("read pinned VST3 SDK source file");
        hasher.update(canonical_vst3_source_bytes(&bytes));
        hasher.update([0]);
    }
    let actual = format!("{:x}", hasher.finalize());
    assert_eq!(
        actual, expected,
        "Vendored VST3 SDK contents do not match SOURCE_LOCK.json"
    );
}

fn canonical_vst3_source_bytes(bytes: &[u8]) -> Vec<u8> {
    let mut canonical = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'\r' && bytes.get(index + 1) == Some(&b'\n') {
            canonical.push(b'\n');
            index += 2;
        } else {
            canonical.push(bytes[index]);
            index += 1;
        }
    }
    canonical
}

fn collect_vendored_files(root: &Path, path: &Path, files: &mut Vec<PathBuf>) {
    let metadata = std::fs::symlink_metadata(path).expect("inspect pinned VST3 SDK path");
    assert!(
        !metadata.file_type().is_symlink(),
        "VST3 SDK source lock cannot include symlinks"
    );
    if metadata.is_file() {
        files.push(
            path.strip_prefix(root)
                .expect("VST3 SDK file is inside root")
                .to_path_buf(),
        );
        return;
    }
    assert!(
        metadata.is_dir(),
        "VST3 SDK source lock entries must be files or directories"
    );
    for entry in std::fs::read_dir(path).expect("read pinned VST3 SDK directory") {
        collect_vendored_files(
            root,
            &entry.expect("read VST3 SDK directory entry").path(),
            files,
        );
    }
}

fn build_scanner_fixture(manifest_dir: &Path, sdk_root: &Path, out_dir: &Path) -> PathBuf {
    let bundle = out_dir
        .join("pocket-daw-scanner-fixture.vst3")
        .join("Contents")
        .join("x86_64-win");
    std::fs::create_dir_all(&bundle).expect("create scanner fixture bundle");
    let binary = bundle.join("pocket-daw-scanner-fixture.vst3");
    let object = out_dir.join("pocket-daw-scanner-fixture.obj");
    let import_library = out_dir.join("pocket-daw-scanner-fixture.lib");
    let source = manifest_dir.join("plugin-host-native/vst3_scanner_fixture.cpp");
    let tool = cc::Build::new().cpp(true).get_compiler();
    assert!(
        tool.is_like_msvc(),
        "Pocket DAW's VST3 scanner fixture requires MSVC"
    );
    let status = tool
        .to_command()
        .arg("/nologo")
        .arg("/std:c++17")
        .arg("/EHsc")
        .arg("/MD")
        .arg("/LD")
        .arg(format!("/I{}", sdk_root.display()))
        .arg(format!("/Fo{}", object.display()))
        .arg(format!("/Fe{}", binary.display()))
        .arg(&source)
        .arg("/link")
        .arg("/DEFAULTLIB:user32.lib")
        .arg(format!("/IMPLIB:{}", import_library.display()))
        .status()
        .expect("launch MSVC for VST3 scanner fixture");
    assert!(
        status.success() && binary.is_file(),
        "Could not build deterministic VST3 scanner fixture"
    );
    bundle
        .parent()
        .and_then(Path::parent)
        .expect("fixture root")
        .to_path_buf()
}
