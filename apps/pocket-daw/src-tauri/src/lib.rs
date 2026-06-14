use cpal::traits::DeviceTrait;
use tauri::{Emitter, Manager};

mod native_audio;

const SECOND_INSTANCE_DEEP_LINK_EVENT: &str = "pocket-daw-second-instance";
const LOCAL_HANDOFF_EVENT: &str = "pocket-daw-local-handoff";
const LOCAL_HANDOFF_PORT: u16 = 47858;
const MAX_PROJECT_FILE_BYTES: u64 = 25 * 1024 * 1024;
const MAX_MIDI_FILE_BYTES: u64 = 25 * 1024 * 1024;
const MAX_AUDIO_FILE_BYTES: u64 = 250 * 1024 * 1024;
const MAX_NATIVE_CACHE_ASSET_BYTES: u64 = 512 * 1024 * 1024;
const MAX_LOCAL_HANDOFF_BYTES: usize = 5 * 1024 * 1024;

#[derive(Clone, serde::Serialize)]
struct SecondInstanceLaunchPayload {
    argv: Vec<String>,
    cwd: String,
}

#[derive(Clone, serde::Serialize)]
struct LocalHandoffPayload {
    #[serde(rename = "encodedHandoff")]
    encoded_handoff: String,
    #[serde(rename = "receivedAt")]
    received_at: String,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            println!("Pocket DAW received a second-instance launch: {argv:?}");
            let payload = SecondInstanceLaunchPayload { argv, cwd };
            if let Err(err) = app.emit(SECOND_INSTANCE_DEEP_LINK_EVENT, payload) {
                eprintln!("Could not emit Pocket DAW second-instance launch event: {err}");
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_deep_link::init())
        .manage(native_audio::create_native_audio_runtime())
        .setup(|app| {
            #[cfg(desktop)]
            {
                #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
                {
                    use tauri_plugin_deep_link::DeepLinkExt;
                    app.deep_link().register_all()?;
                }
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
                app.handle().plugin(tauri_plugin_process::init())?;
                start_local_handoff_receiver(app.handle().clone());
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            probe_audio_devices,
            native_audio::native_audio_status,
            native_audio::native_audio_start,
            native_audio::native_audio_pause,
            native_audio::native_audio_resume,
            native_audio::native_audio_seek,
            native_audio::native_audio_stop,
            native_audio::native_audio_update_track,
            open_project_file,
            open_audio_media_file,
            read_audio_media_file,
            collect_project_media,
            write_native_cache_asset,
            read_native_cache_asset,
            open_midi_file,
            save_project_file_as,
            write_project_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running Pocket DAW");
}

#[cfg(desktop)]
fn start_local_handoff_receiver(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let listener = match std::net::TcpListener::bind(("127.0.0.1", LOCAL_HANDOFF_PORT)) {
            Ok(listener) => listener,
            Err(err) => {
                eprintln!("Pocket DAW local handoff receiver unavailable: {err}");
                return;
            }
        };
        println!("Pocket DAW local handoff receiver listening on 127.0.0.1:{LOCAL_HANDOFF_PORT}");
        for stream in listener.incoming() {
            let app = app.clone();
            match stream {
                Ok(mut stream) => {
                    std::thread::spawn(move || {
                        if let Err(err) = handle_local_handoff_connection(&mut stream, &app) {
                            eprintln!("Pocket DAW local handoff request failed: {err}");
                        }
                    });
                }
                Err(err) => eprintln!("Pocket DAW local handoff connection failed: {err}"),
            }
        }
    });
}

#[cfg(desktop)]
fn handle_local_handoff_connection(
    stream: &mut std::net::TcpStream,
    app: &tauri::AppHandle,
) -> Result<(), String> {
    let request = read_http_request(stream)?;
    if request.starts_with("OPTIONS ") {
        write_http_response(stream, 204, "No Content", "text/plain", "")?;
        return Ok(());
    }
    if !request.starts_with("POST /pocket-daw/handoff ") {
        write_http_response(stream, 404, "Not Found", "text/plain", "Not found")?;
        return Ok(());
    }
    let encoded_handoff = local_handoff_payload_from_request(&request)?;
    if encoded_handoff.is_empty() {
        write_http_response(
            stream,
            400,
            "Bad Request",
            "text/plain",
            "Missing handoff payload",
        )?;
        return Ok(());
    }
    app.emit(
        LOCAL_HANDOFF_EVENT,
        LocalHandoffPayload {
            encoded_handoff,
            received_at: iso_timestamp(),
        },
    )
    .map_err(|err| format!("Could not emit local handoff: {err}"))?;
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    write_http_response(stream, 200, "OK", "application/json", r#"{"ok":true}"#)?;
    Ok(())
}

#[cfg(desktop)]
fn read_http_request(stream: &mut std::net::TcpStream) -> Result<String, String> {
    use std::io::Read;
    let mut buffer = Vec::new();
    let mut chunk = [0_u8; 8192];
    stream
        .set_read_timeout(Some(std::time::Duration::from_secs(3)))
        .map_err(|err| format!("Could not set read timeout: {err}"))?;
    loop {
        let read = stream
            .read(&mut chunk)
            .map_err(|err| format!("Could not read request: {err}"))?;
        if read == 0 {
            break;
        }
        buffer.extend_from_slice(&chunk[..read]);
        if buffer.len() > MAX_LOCAL_HANDOFF_BYTES {
            return Err("Local handoff payload is too large.".to_string());
        }
        if let Some(header_end) = find_header_end(&buffer) {
            let headers = String::from_utf8_lossy(&buffer[..header_end]).to_string();
            let content_length = content_length(&headers)?;
            let expected = header_end + 4 + content_length;
            if buffer.len() >= expected {
                buffer.truncate(expected);
                break;
            }
        }
    }
    String::from_utf8(buffer).map_err(|_| "Local handoff request was not UTF-8.".to_string())
}

#[cfg(desktop)]
fn http_request_body(request: &str) -> Result<String, String> {
    let Some(index) = request.find("\r\n\r\n") else {
        return Err("Local handoff request is missing headers.".to_string());
    };
    Ok(request[index + 4..].to_string())
}

#[cfg(desktop)]
fn local_handoff_payload_from_request(request: &str) -> Result<String, String> {
    let body = http_request_body(request)?;
    let trimmed = body.trim();
    if trimmed.starts_with("encodedHandoff=") || trimmed.starts_with("handoff=") {
        return Ok(trimmed
            .split('&')
            .find_map(|pair| {
                let (name, value) = pair.split_once('=')?;
                if name == "encodedHandoff" || name == "handoff" {
                    Some(value.trim().to_string())
                } else {
                    None
                }
            })
            .unwrap_or_default());
    }
    Ok(trimmed.to_string())
}

#[cfg(desktop)]
fn find_header_end(buffer: &[u8]) -> Option<usize> {
    buffer.windows(4).position(|window| window == b"\r\n\r\n")
}

#[cfg(desktop)]
fn content_length(headers: &str) -> Result<usize, String> {
    for line in headers.lines() {
        let Some((name, value)) = line.split_once(':') else {
            continue;
        };
        if name.trim().eq_ignore_ascii_case("content-length") {
            let length = value
                .trim()
                .parse::<usize>()
                .map_err(|_| "Invalid Content-Length for local handoff.".to_string())?;
            if length > MAX_LOCAL_HANDOFF_BYTES {
                return Err("Local handoff payload is too large.".to_string());
            }
            return Ok(length);
        }
    }
    Ok(0)
}

#[cfg(desktop)]
fn write_http_response(
    stream: &mut std::net::TcpStream,
    status: u16,
    status_text: &str,
    content_type: &str,
    body: &str,
) -> Result<(), String> {
    use std::io::Write;
    let response = format!(
        "HTTP/1.1 {status} {status_text}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nAccess-Control-Allow-Private-Network: true\r\nConnection: close\r\n\r\n{body}",
        body.as_bytes().len()
    );
    stream
        .write_all(response.as_bytes())
        .map_err(|err| format!("Could not write response: {err}"))
}

#[cfg(desktop)]
fn iso_timestamp() -> String {
    match std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH) {
        Ok(duration) => format!("unix-ms:{}", duration.as_millis()),
        Err(_) => "unix-ms:0".to_string(),
    }
}

#[derive(serde::Serialize)]
struct ProjectFilePayload {
    path: String,
    label: String,
    contents: String,
}

#[derive(serde::Serialize)]
struct ProjectFileSaveResult {
    path: String,
    label: String,
}

#[derive(serde::Serialize)]
struct AudioMediaPayload {
    path: String,
    label: String,
    #[serde(rename = "mimeType")]
    mime_type: Option<String>,
    #[serde(rename = "sizeBytes")]
    size_bytes: u64,
    bytes: Vec<u8>,
}

#[derive(serde::Deserialize)]
struct CollectProjectMediaItem {
    id: String,
    #[serde(rename = "sourceUri")]
    source_uri: String,
    #[serde(rename = "targetRelativePath")]
    target_relative_path: String,
}

#[derive(serde::Serialize)]
struct CollectedProjectMediaItem {
    id: String,
    #[serde(rename = "sourceUri")]
    source_uri: String,
    #[serde(rename = "targetPath")]
    target_path: String,
    #[serde(rename = "targetRelativePath")]
    target_relative_path: String,
    #[serde(rename = "sizeBytes")]
    size_bytes: u64,
}

#[derive(serde::Serialize)]
struct NativeCacheAssetWriteResult {
    #[serde(rename = "assetId")]
    asset_id: String,
    path: String,
    #[serde(rename = "relativePath")]
    relative_path: String,
    #[serde(rename = "sizeBytes")]
    size_bytes: u64,
}

#[derive(serde::Serialize)]
struct NativeCacheAssetReadResult {
    #[serde(rename = "assetId")]
    asset_id: String,
    path: String,
    #[serde(rename = "relativePath")]
    relative_path: String,
    #[serde(rename = "sizeBytes")]
    size_bytes: u64,
    bytes: Vec<u8>,
}

#[derive(serde::Serialize)]
struct MidiFilePayload {
    path: String,
    label: String,
    #[serde(rename = "sizeBytes")]
    size_bytes: u64,
    bytes: Vec<u8>,
}

#[tauri::command]
fn open_project_file() -> Result<Option<ProjectFilePayload>, String> {
    let file = rfd::FileDialog::new()
        .add_filter("Pocket DAW project", &["pocketdaw", "json"])
        .add_filter("JSON", &["json"])
        .pick_file();
    let Some(path) = file else {
        return Ok(None);
    };
    ensure_file_size_at_most(
        &path,
        MAX_PROJECT_FILE_BYTES,
        "Project file is too large for this release. Try a smaller .pocketdaw/JSON file.",
    )?;
    let contents = std::fs::read_to_string(&path)
        .map_err(|err| format!("Could not read project file: {}", err))?;
    Ok(Some(ProjectFilePayload {
        label: file_label(&path),
        path: path.to_string_lossy().to_string(),
        contents,
    }))
}

#[tauri::command]
fn open_audio_media_file() -> Result<Option<AudioMediaPayload>, String> {
    let file = rfd::FileDialog::new()
        .add_filter("Audio", &["wav", "mp3", "ogg", "flac", "aiff", "aif"])
        .pick_file();
    let Some(path) = file else {
        return Ok(None);
    };
    ensure_file_size_at_most(&path, MAX_AUDIO_FILE_BYTES, "Audio file is too large for this release. Try a shorter file or wait for native streaming support.")?;
    let bytes =
        std::fs::read(&path).map_err(|err| format!("Could not read audio file: {}", err))?;
    let size_bytes = bytes.len() as u64;
    Ok(Some(AudioMediaPayload {
        label: file_label(&path),
        path: path.to_string_lossy().to_string(),
        mime_type: audio_mime_type(&path),
        size_bytes,
        bytes,
    }))
}

#[tauri::command]
fn read_audio_media_file(
    path: String,
    project_file_path: Option<String>,
) -> Result<AudioMediaPayload, String> {
    let path_buf = resolve_media_path(&path, project_file_path.as_deref())?;
    ensure_file_size_at_most(&path_buf, MAX_AUDIO_FILE_BYTES, "Audio file is too large for this release. Try a shorter file or wait for native streaming support.")?;
    let bytes =
        std::fs::read(&path_buf).map_err(|err| format!("Could not read audio media: {}", err))?;
    let size_bytes = bytes.len() as u64;
    Ok(AudioMediaPayload {
        label: file_label(&path_buf),
        path: path_buf.to_string_lossy().to_string(),
        mime_type: audio_mime_type(&path_buf),
        size_bytes,
        bytes,
    })
}

#[tauri::command]
fn collect_project_media(
    project_file_path: String,
    items: Vec<CollectProjectMediaItem>,
) -> Result<Vec<CollectedProjectMediaItem>, String> {
    let project_path = std::path::PathBuf::from(project_file_path);
    let project_dir = project_path
        .parent()
        .ok_or_else(|| "Save the project before collecting media.".to_string())?;
    let mut collected = Vec::new();
    for item in items {
        let source = source_uri_to_path(&item.source_uri);
        if !source.is_absolute() {
            return Err(format!(
                "{} is not an absolute media source path.",
                item.source_uri
            ));
        }
        ensure_file_size_at_most(&source, MAX_AUDIO_FILE_BYTES, "Media file is too large to collect in this release. Try a shorter file or keep it external until native streaming support lands.")?;
        let target = resolve_project_relative_path(project_dir, &item.target_relative_path)?;
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|err| format!("Could not create project media folder: {}", err))?;
        }
        let size_bytes = std::fs::copy(&source, &target)
            .map_err(|err| format!("Could not copy {}: {}", item.source_uri, err))?;
        collected.push(CollectedProjectMediaItem {
            id: item.id,
            source_uri: item.source_uri,
            target_path: target.to_string_lossy().to_string(),
            target_relative_path: item.target_relative_path,
            size_bytes,
        });
    }
    Ok(collected)
}

#[tauri::command]
fn write_native_cache_asset(
    project_file_path: String,
    asset_id: String,
    relative_path: String,
    bytes: Vec<u8>,
) -> Result<NativeCacheAssetWriteResult, String> {
    if bytes.is_empty() {
        return Err("Native cache asset has no bytes to write.".to_string());
    }
    ensure_bytes_at_most(bytes.len() as u64, MAX_NATIVE_CACHE_ASSET_BYTES, "Native cache asset is too large for this release. Try a shorter project or rebuild after native streaming/cache improvements.")?;
    let target = native_cache_asset_path(&project_file_path, &relative_path)?;
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|err| format!("Could not create native cache folder: {}", err))?;
    }
    std::fs::write(&target, &bytes)
        .map_err(|err| format!("Could not write native cache asset: {}", err))?;
    Ok(NativeCacheAssetWriteResult {
        asset_id,
        path: target.to_string_lossy().to_string(),
        relative_path,
        size_bytes: bytes.len() as u64,
    })
}

#[tauri::command]
fn read_native_cache_asset(
    project_file_path: String,
    asset_id: String,
    relative_path: String,
) -> Result<NativeCacheAssetReadResult, String> {
    let target = native_cache_asset_path(&project_file_path, &relative_path)?;
    ensure_file_size_at_most(&target, MAX_NATIVE_CACHE_ASSET_BYTES, "Native cache asset is too large for this release. Rebuild the cache with shorter source material.")?;
    let bytes = std::fs::read(&target)
        .map_err(|err| format!("Could not read native cache asset: {}", err))?;
    let size_bytes = bytes.len() as u64;
    Ok(NativeCacheAssetReadResult {
        asset_id,
        path: target.to_string_lossy().to_string(),
        relative_path,
        size_bytes,
        bytes,
    })
}

#[tauri::command]
fn open_midi_file() -> Result<Option<MidiFilePayload>, String> {
    let file = rfd::FileDialog::new()
        .add_filter("MIDI", &["mid", "midi"])
        .pick_file();
    let Some(path) = file else {
        return Ok(None);
    };
    ensure_file_size_at_most(
        &path,
        MAX_MIDI_FILE_BYTES,
        "MIDI file is too large for this release. Try a smaller MIDI file.",
    )?;
    let bytes = std::fs::read(&path).map_err(|err| format!("Could not read MIDI file: {}", err))?;
    let size_bytes = bytes.len() as u64;
    Ok(Some(MidiFilePayload {
        label: file_label(&path),
        path: path.to_string_lossy().to_string(),
        size_bytes,
        bytes,
    }))
}

#[tauri::command]
fn save_project_file_as(
    default_name: String,
    contents: String,
) -> Result<Option<ProjectFileSaveResult>, String> {
    let file = rfd::FileDialog::new()
        .add_filter("Pocket DAW project", &["pocketdaw"])
        .set_file_name(default_name)
        .save_file();
    let Some(path) = file else {
        return Ok(None);
    };
    std::fs::write(&path, contents)
        .map_err(|err| format!("Could not save project file: {}", err))?;
    Ok(Some(ProjectFileSaveResult {
        label: file_label(&path),
        path: path.to_string_lossy().to_string(),
    }))
}

#[tauri::command]
fn write_project_file(path: String, contents: String) -> Result<ProjectFileSaveResult, String> {
    let path_buf = std::path::PathBuf::from(path);
    std::fs::write(&path_buf, contents)
        .map_err(|err| format!("Could not save project file: {}", err))?;
    Ok(ProjectFileSaveResult {
        label: file_label(&path_buf),
        path: path_buf.to_string_lossy().to_string(),
    })
}

#[derive(serde::Serialize)]
struct AudioProbeResult {
    host: String,
    devices: Vec<AudioDeviceInfo>,
    #[serde(rename = "defaultInputId")]
    default_input_id: Option<String>,
    #[serde(rename = "defaultOutputId")]
    default_output_id: Option<String>,
    notes: Vec<String>,
}

#[derive(serde::Serialize)]
struct AudioDeviceInfo {
    id: String,
    name: String,
    host: String,
    kind: String,
    #[serde(rename = "isDefaultInput")]
    is_default_input: bool,
    #[serde(rename = "isDefaultOutput")]
    is_default_output: bool,
    #[serde(rename = "supportedSampleRates")]
    supported_sample_rates: Vec<u32>,
    #[serde(rename = "supportedBufferSizes")]
    supported_buffer_sizes: Vec<u32>,
    #[serde(rename = "supportedChannels")]
    supported_channels: Vec<u16>,
}

#[tauri::command]
fn probe_audio_devices() -> AudioProbeResult {
    use cpal::traits::HostTrait;

    let mut notes = vec![
        "Native CPAL probe. WASAPI is the v0.1.3 target; ASIO is reserved for a later pass."
            .to_string(),
    ];
    let host_id = cpal::available_hosts()
        .into_iter()
        .find(|id| format!("{:?}", id).eq_ignore_ascii_case("Wasapi"))
        .unwrap_or(cpal::default_host().id());
    let host = cpal::host_from_id(host_id).unwrap_or_else(|_| cpal::default_host());
    let host_name = format!("{:?}", host.id()).to_lowercase();
    let default_input_name = host
        .default_input_device()
        .and_then(|device| device_name(&device).ok());
    let default_output_name = host
        .default_output_device()
        .and_then(|device| device_name(&device).ok());
    let mut devices = Vec::new();

    if let Ok(inputs) = host.input_devices() {
        for (index, device) in inputs.enumerate() {
            let name = device_name(&device).unwrap_or_else(|_| format!("Input {}", index + 1));
            let id = format!("{}:input:{}", host_name, sanitize_id(&name));
            let (rates, buffers, channels) = input_caps(&device);
            devices.push(AudioDeviceInfo {
                id: id.clone(),
                name: name.clone(),
                host: host_name.clone(),
                kind: "input".to_string(),
                is_default_input: default_input_name.as_ref() == Some(&name),
                is_default_output: false,
                supported_sample_rates: rates,
                supported_buffer_sizes: buffers,
                supported_channels: channels,
            });
        }
    } else {
        notes.push("Could not enumerate native input devices.".to_string());
    }

    if let Ok(outputs) = host.output_devices() {
        for (index, device) in outputs.enumerate() {
            let name = device_name(&device).unwrap_or_else(|_| format!("Output {}", index + 1));
            let id = format!("{}:output:{}", host_name, sanitize_id(&name));
            let (rates, buffers, channels) = output_caps(&device);
            devices.push(AudioDeviceInfo {
                id: id.clone(),
                name: name.clone(),
                host: host_name.clone(),
                kind: "output".to_string(),
                is_default_input: false,
                is_default_output: default_output_name.as_ref() == Some(&name),
                supported_sample_rates: rates,
                supported_buffer_sizes: buffers,
                supported_channels: channels,
            });
        }
    } else {
        notes.push("Could not enumerate native output devices.".to_string());
    }

    let default_input_id = devices
        .iter()
        .find(|device| device.is_default_input)
        .map(|device| device.id.clone());
    let default_output_id = devices
        .iter()
        .find(|device| device.is_default_output)
        .map(|device| device.id.clone());
    AudioProbeResult {
        host: host_name,
        devices,
        default_input_id,
        default_output_id,
        notes,
    }
}

fn input_caps(device: &cpal::Device) -> (Vec<u32>, Vec<u32>, Vec<u16>) {
    match device.supported_input_configs() {
        Ok(configs) => collect_caps(configs),
        Err(_) => (Vec::new(), Vec::new(), Vec::new()),
    }
}

fn output_caps(device: &cpal::Device) -> (Vec<u32>, Vec<u32>, Vec<u16>) {
    match device.supported_output_configs() {
        Ok(configs) => collect_caps_output(configs),
        Err(_) => (Vec::new(), Vec::new(), Vec::new()),
    }
}

fn device_name(device: &cpal::Device) -> Result<String, cpal::DeviceNameError> {
    device
        .description()
        .map(|description| description.name().to_string())
}

fn collect_caps(configs: cpal::SupportedInputConfigs) -> (Vec<u32>, Vec<u32>, Vec<u16>) {
    let mut rates = Vec::new();
    let mut buffers = Vec::new();
    let mut channels = Vec::new();
    for config in configs {
        push_unique(&mut rates, config.min_sample_rate());
        push_unique(&mut rates, config.max_sample_rate());
        push_unique(&mut channels, config.channels());
        match config.buffer_size() {
            cpal::SupportedBufferSize::Range { min, max } => {
                push_unique(&mut buffers, *min);
                push_unique(&mut buffers, *max);
            }
            cpal::SupportedBufferSize::Unknown => {}
        }
    }
    rates.sort_unstable();
    buffers.sort_unstable();
    channels.sort_unstable();
    (rates, buffers, channels)
}

fn collect_caps_output(configs: cpal::SupportedOutputConfigs) -> (Vec<u32>, Vec<u32>, Vec<u16>) {
    let mut rates = Vec::new();
    let mut buffers = Vec::new();
    let mut channels = Vec::new();
    for config in configs {
        push_unique(&mut rates, config.min_sample_rate());
        push_unique(&mut rates, config.max_sample_rate());
        push_unique(&mut channels, config.channels());
        match config.buffer_size() {
            cpal::SupportedBufferSize::Range { min, max } => {
                push_unique(&mut buffers, *min);
                push_unique(&mut buffers, *max);
            }
            cpal::SupportedBufferSize::Unknown => {}
        }
    }
    rates.sort_unstable();
    buffers.sort_unstable();
    channels.sort_unstable();
    (rates, buffers, channels)
}

fn push_unique<T: PartialEq>(values: &mut Vec<T>, value: T) {
    if !values.contains(&value) {
        values.push(value);
    }
}

fn sanitize_id(name: &str) -> String {
    name.chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

fn file_label(path: &std::path::Path) -> String {
    path.file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("Pocket DAW project")
        .to_string()
}

fn audio_mime_type(path: &std::path::Path) -> Option<String> {
    let ext = path
        .extension()
        .and_then(|value| value.to_str())?
        .to_ascii_lowercase();
    match ext.as_str() {
        "wav" => Some("audio/wav".to_string()),
        "mp3" => Some("audio/mpeg".to_string()),
        "ogg" => Some("audio/ogg".to_string()),
        "flac" => Some("audio/flac".to_string()),
        "aiff" | "aif" => Some("audio/aiff".to_string()),
        _ => None,
    }
}

fn resolve_media_path(
    path: &str,
    project_file_path: Option<&str>,
) -> Result<std::path::PathBuf, String> {
    let normalized = if let Some(rest) = path.strip_prefix("project://media/") {
        format!("project-media/{}", rest)
    } else {
        path.to_string()
    };
    let path_buf = source_uri_to_path(&normalized);
    if path_buf.is_absolute() {
        return Ok(path_buf);
    }
    let project_file_path = project_file_path
        .ok_or_else(|| "Project-relative media needs a saved project path.".to_string())?;
    let project_path = std::path::PathBuf::from(project_file_path);
    let project_dir = project_path
        .parent()
        .ok_or_else(|| "Project-relative media needs a saved project folder.".to_string())?;
    resolve_project_relative_path(project_dir, &normalized)
}

fn source_uri_to_path(uri: &str) -> std::path::PathBuf {
    if let Some(rest) = uri.strip_prefix("file:///") {
        return std::path::PathBuf::from(rest.replace('/', std::path::MAIN_SEPARATOR_STR));
    }
    if let Some(rest) = uri.strip_prefix("file://") {
        return std::path::PathBuf::from(rest.replace('/', std::path::MAIN_SEPARATOR_STR));
    }
    std::path::PathBuf::from(uri)
}

fn resolve_project_relative_path(
    project_dir: &std::path::Path,
    relative: &str,
) -> Result<std::path::PathBuf, String> {
    let relative_path = std::path::Path::new(relative);
    if relative_path.is_absolute() {
        return Err("Project media target must be relative.".to_string());
    }
    for component in relative_path.components() {
        match component {
            std::path::Component::Normal(_) => {}
            std::path::Component::CurDir => {}
            _ => return Err("Project media target cannot escape the project folder.".to_string()),
        }
    }
    Ok(project_dir.join(relative_path))
}

fn native_cache_asset_path(
    project_file_path: &str,
    relative_path: &str,
) -> Result<std::path::PathBuf, String> {
    validate_native_cache_relative_path(relative_path)?;
    let project_path = std::path::PathBuf::from(project_file_path);
    let project_dir = project_path
        .parent()
        .ok_or_else(|| "Native cache needs a saved project folder.".to_string())?;
    resolve_project_relative_path(project_dir, relative_path)
}

fn validate_native_cache_relative_path(relative_path: &str) -> Result<(), String> {
    let normalized = relative_path.replace('\\', "/");
    if !normalized.starts_with("project-cache/native-audio/") {
        return Err("Native cache assets must live under project-cache/native-audio.".to_string());
    }
    if !normalized.to_ascii_lowercase().ends_with(".wav") {
        return Err("Native cache assets must be WAV files.".to_string());
    }
    Ok(())
}

fn ensure_file_size_at_most(
    path: &std::path::Path,
    max_bytes: u64,
    message: &str,
) -> Result<u64, String> {
    let size = std::fs::metadata(path)
        .map_err(|err| format!("Could not inspect file size: {}", err))?
        .len();
    ensure_bytes_at_most(size, max_bytes, message)?;
    Ok(size)
}

fn ensure_bytes_at_most(size: u64, max_bytes: u64, message: &str) -> Result<(), String> {
    if size > max_bytes {
        return Err(format!(
            "{} Limit: {} MB. Selected: {} MB.",
            message,
            bytes_to_mb(max_bytes),
            bytes_to_mb(size)
        ));
    }
    Ok(())
}

fn bytes_to_mb(bytes: u64) -> u64 {
    (bytes + (1024 * 1024 - 1)) / (1024 * 1024)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_cache_paths_stay_under_project_cache() {
        let path = native_cache_asset_path(
            r"C:\Songs\Song.pocketdaw",
            "project-cache/native-audio/native-cache-a.wav",
        )
        .expect("cache path should resolve");

        assert!(path.to_string_lossy().contains("project-cache"));
        assert!(path.to_string_lossy().contains("native-audio"));
    }

    #[test]
    fn native_cache_paths_reject_escape_or_wrong_folder() {
        assert!(native_cache_asset_path(r"C:\Songs\Song.pocketdaw", "../asset.wav").is_err());
        assert!(
            native_cache_asset_path(r"C:\Songs\Song.pocketdaw", "project-media/asset.wav").is_err()
        );
        assert!(native_cache_asset_path(
            r"C:\Songs\Song.pocketdaw",
            "project-cache/native-audio/asset.mp3"
        )
        .is_err());
    }

    #[test]
    fn size_limit_helper_rejects_oversized_payloads() {
        assert!(ensure_bytes_at_most(10, 10, "Too large").is_ok());
        let error =
            ensure_bytes_at_most(11, 10, "Too large").expect_err("oversized payload should fail");
        assert!(error.contains("Too large"));
        assert!(error.contains("Limit"));
    }

    #[test]
    fn local_handoff_payload_accepts_raw_and_form_bodies() {
        let raw_request = "POST /pocket-daw/handoff HTTP/1.1\r\nContent-Length: 7\r\n\r\nabc-123";
        let form_request = "POST /pocket-daw/handoff HTTP/1.1\r\nContent-Length: 25\r\n\r\nencodedHandoff=abc-123&x=1";

        assert_eq!(
            local_handoff_payload_from_request(raw_request).expect("raw body should parse"),
            "abc-123"
        );
        assert_eq!(
            local_handoff_payload_from_request(form_request).expect("form body should parse"),
            "abc-123"
        );
    }
}
