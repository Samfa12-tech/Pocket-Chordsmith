use cpal::traits::DeviceTrait;
use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::sync::{mpsc, Arc, Mutex};
use std::time::Duration;
use tauri::{Emitter, Manager};

mod native_audio;
mod native_decode;
mod native_recording;
mod project_files;
mod session_import;

const SECOND_INSTANCE_DEEP_LINK_EVENT: &str = "pocket-daw-second-instance";
const LOCAL_HANDOFF_EVENT: &str = "pocket-daw-local-handoff";
const AI_BRIDGE_REQUEST_EVENT: &str = "pocket-daw-ai-request";
const LOCAL_HANDOFF_PORT: u16 = 47858;
// Native WAV/stem/loop/game-pack renders and multi-format DAW-session imports
// can legitimately take several minutes. Keep one bounded request window that
// lets those explicit operations finish without reporting a false bridge failure.
const AI_BRIDGE_RESPONSE_TIMEOUT_MS: u64 = 300000;
const DOWNLOAD_HANDOFF_PREFIX: &str = "pocket-chordsmith-to-pocket-daw-";
const DOWNLOAD_HANDOFF_SUFFIX: &str = ".pcs1.txt";
const MAX_PROJECT_FILE_BYTES: u64 = 25 * 1024 * 1024;
const MAX_MIDI_FILE_BYTES: u64 = 25 * 1024 * 1024;
const MAX_AUDIO_FILE_BYTES: u64 = 250 * 1024 * 1024;
const MAX_NATIVE_CACHE_ASSET_BYTES: u64 = 512 * 1024 * 1024;
const MAX_BINARY_EXPORT_BYTES: u64 = 512 * 1024 * 1024;
const MAX_LOCAL_HANDOFF_BYTES: usize = 5 * 1024 * 1024;
const MAX_AI_BRIDGE_BODY_BYTES: usize = 1024 * 1024;

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

#[derive(Clone)]
struct AiBridgeRuntime {
    inner: Arc<AiBridgeRuntimeInner>,
}

struct AiBridgeRuntimeInner {
    token: String,
    enabled: Mutex<bool>,
    session_path: std::path::PathBuf,
    started_at: String,
    pending: Mutex<HashMap<String, mpsc::Sender<String>>>,
}

#[derive(Clone, serde::Serialize)]
struct AiBridgeSessionPayload {
    app: &'static str,
    url: &'static str,
    #[serde(rename = "statusUrl")]
    status_url: &'static str,
    #[serde(rename = "controlUrl")]
    control_url: &'static str,
    token: String,
    enabled: bool,
    #[serde(rename = "sessionPath")]
    session_path: String,
    #[serde(rename = "processId")]
    process_id: u32,
    #[serde(rename = "startedAt")]
    started_at: String,
}

#[derive(Clone, serde::Serialize)]
struct AiBridgeRequestPayload {
    #[serde(rename = "requestId")]
    request_id: String,
    kind: String,
    body: String,
    #[serde(rename = "receivedAt")]
    received_at: String,
}

fn create_ai_bridge_runtime() -> AiBridgeRuntime {
    let bytes: [u8; 32] = rand::random();
    AiBridgeRuntime {
        inner: Arc::new(AiBridgeRuntimeInner {
            token: hex_token(bytes),
            enabled: Mutex::new(false),
            session_path: ai_bridge_session_path(),
            started_at: iso_timestamp(),
            pending: Mutex::new(HashMap::new()),
        }),
    }
}

impl AiBridgeRuntime {
    fn session(&self) -> AiBridgeSessionPayload {
        AiBridgeSessionPayload {
            app: "Pocket DAW",
            url: "http://127.0.0.1:47858",
            status_url: "http://127.0.0.1:47858/pocket-daw/live/status",
            control_url: "http://127.0.0.1:47858/pocket-daw/live/control",
            token: self.inner.token.clone(),
            enabled: self.is_enabled(),
            session_path: self.inner.session_path.to_string_lossy().to_string(),
            process_id: std::process::id(),
            started_at: self.inner.started_at.clone(),
        }
    }

    fn is_enabled(&self) -> bool {
        self.inner
            .enabled
            .lock()
            .map(|guard| *guard)
            .unwrap_or(false)
    }

    fn set_enabled(&self, enabled: bool) -> Result<AiBridgeSessionPayload, String> {
        {
            let mut guard = self
                .inner
                .enabled
                .lock()
                .map_err(|_| "AI bridge state lock is unavailable.".to_string())?;
            *guard = enabled;
        }
        self.write_session_file()?;
        Ok(self.session())
    }

    fn write_session_file(&self) -> Result<(), String> {
        if let Some(parent) = self.inner.session_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|err| format!("Could not create AI bridge session folder: {err}"))?;
        }
        let json = serde_json::to_string_pretty(&self.session())
            .map_err(|err| format!("Could not serialize AI bridge session: {err}"))?;
        std::fs::write(&self.inner.session_path, json)
            .map_err(|err| format!("Could not write AI bridge session file: {err}"))
    }

    fn token_matches(&self, token: Option<&str>) -> bool {
        token.is_some_and(|value| value == self.inner.token)
    }

    fn register_pending(
        &self,
        request_id: &str,
        sender: mpsc::Sender<String>,
    ) -> Result<(), String> {
        self.inner
            .pending
            .lock()
            .map_err(|_| "AI bridge pending-request lock is unavailable.".to_string())?
            .insert(request_id.to_string(), sender);
        Ok(())
    }

    fn resolve_pending(&self, request_id: &str, response_json: String) -> Result<(), String> {
        let sender = self
            .inner
            .pending
            .lock()
            .map_err(|_| "AI bridge pending-request lock is unavailable.".to_string())?
            .remove(request_id);
        match sender {
            Some(sender) => sender
                .send(response_json)
                .map_err(|_| "AI bridge requester is no longer waiting.".to_string()),
            None => Err(format!("No pending AI bridge request for {request_id}.")),
        }
    }

    fn remove_pending(&self, request_id: &str) {
        if let Ok(mut pending) = self.inner.pending.lock() {
            pending.remove(request_id);
        }
    }
}

fn ai_bridge_session_path() -> std::path::PathBuf {
    if let Some(local_app_data) = std::env::var_os("LOCALAPPDATA") {
        return std::path::PathBuf::from(local_app_data)
            .join("Pocket DAW")
            .join("ai-bridge-session.json");
    }
    std::env::temp_dir()
        .join("Pocket DAW")
        .join("ai-bridge-session.json")
}

fn hex_token(bytes: [u8; 32]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
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
        .manage(native_recording::create_native_recording_runtime())
        .manage(create_ai_bridge_runtime())
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
                let ai_bridge = app.state::<AiBridgeRuntime>().inner().clone();
                ai_bridge.write_session_file()?;
                start_local_handoff_receiver(app.handle().clone(), ai_bridge);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            probe_audio_devices,
            native_audio::native_audio_status,
            native_audio::native_audio_render_wav,
            native_audio::native_audio_start,
            native_audio::native_audio_preload_asset,
            native_audio::native_audio_pause,
            native_audio::native_audio_resume,
            native_audio::native_audio_seek,
            native_audio::native_audio_stop,
            native_audio::native_audio_update_track,
            native_recording::native_recording_status,
            native_recording::native_recording_start,
            native_recording::native_recording_start_preview,
            native_recording::native_recording_stop_preview,
            native_recording::native_recording_update_monitor,
            native_recording::native_recording_stop,
            initial_launch_args,
            open_project_file,
            read_project_file,
            discover_project_recovery,
            open_audio_media_file,
            read_audio_media_file,
            collect_project_media,
            write_native_cache_asset,
            read_native_cache_asset,
            prune_native_cache_assets,
            read_download_handoff_file,
            delete_download_handoff_file,
            open_midi_file,
            session_import::open_daw_session_folder,
            session_import::open_daw_session_files,
            session_import::read_daw_session_path,
            open_external_url,
            save_project_file_as,
            write_project_file,
            save_binary_file_as,
            write_binary_file,
            ai_bridge_session,
            ai_bridge_set_enabled,
            ai_bridge_resolve_request
        ])
        .run(tauri::generate_context!())
        .expect("error while running Pocket DAW");
}

#[tauri::command]
fn initial_launch_args() -> SecondInstanceLaunchPayload {
    SecondInstanceLaunchPayload {
        argv: std::env::args().collect(),
        cwd: std::env::current_dir()
            .map(|path| path.to_string_lossy().to_string())
            .unwrap_or_default(),
    }
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    let url = normalized_external_url(&url)?;
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn()
            .map_err(|err| format!("Could not open external URL: {err}"))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|err| format!("Could not open external URL: {err}"))?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|err| format!("Could not open external URL: {err}"))?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err("External URL opening is not supported on this platform.".to_string())
}

fn normalized_external_url(url: &str) -> Result<String, String> {
    let trimmed = url.trim();
    let lower = trimmed.to_ascii_lowercase();
    if lower.starts_with("https://") || lower.starts_with("http://") || lower.starts_with("mailto:")
    {
        return Ok(trimmed.to_string());
    }
    Err("Only http, https and mailto external URLs can be opened.".to_string())
}

#[tauri::command]
fn ai_bridge_session(
    state: tauri::State<'_, AiBridgeRuntime>,
) -> Result<AiBridgeSessionPayload, String> {
    state.write_session_file()?;
    Ok(state.session())
}

#[tauri::command]
fn ai_bridge_set_enabled(
    enabled: bool,
    state: tauri::State<'_, AiBridgeRuntime>,
) -> Result<AiBridgeSessionPayload, String> {
    state.set_enabled(enabled)
}

#[tauri::command]
fn ai_bridge_resolve_request(
    request_id: String,
    response_json: String,
    state: tauri::State<'_, AiBridgeRuntime>,
) -> Result<(), String> {
    state.resolve_pending(&request_id, response_json)
}

#[cfg(desktop)]
fn start_local_handoff_receiver(app: tauri::AppHandle, ai_bridge: AiBridgeRuntime) {
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
            let ai_bridge = ai_bridge.clone();
            match stream {
                Ok(mut stream) => {
                    std::thread::spawn(move || {
                        if let Err(err) =
                            handle_local_handoff_connection(&mut stream, &app, &ai_bridge)
                        {
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
    ai_bridge: &AiBridgeRuntime,
) -> Result<(), String> {
    let request = read_http_request(stream)?;
    if !local_bridge_request_headers_are_trusted(&request) {
        write_json_response(
            stream,
            403,
            "Forbidden",
            r#"{"ok":false,"code":"untrusted_local_bridge_request","message":"Pocket DAW local bridge only accepts loopback hosts and trusted local origins."}"#,
        )?;
        return Ok(());
    }
    if request.starts_with("OPTIONS ") {
        write_http_response(stream, 204, "No Content", "text/plain", "")?;
        return Ok(());
    }
    if request_path_matches(&request, "GET", "/pocket-daw/live/status") {
        return handle_ai_bridge_http_request(
            stream,
            app,
            ai_bridge,
            &request,
            "status",
            "{}".to_string(),
        );
    }
    if request_path_matches(&request, "POST", "/pocket-daw/live/control") {
        let body = http_request_body(&request)?;
        if body.len() > MAX_AI_BRIDGE_BODY_BYTES {
            write_json_response(
                stream,
                413,
                "Payload Too Large",
                r#"{"ok":false,"code":"payload_too_large","message":"AI bridge request body is too large."}"#,
            )?;
            return Ok(());
        }
        return handle_ai_bridge_http_request(stream, app, ai_bridge, &request, "control", body);
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
fn handle_ai_bridge_http_request(
    stream: &mut std::net::TcpStream,
    app: &tauri::AppHandle,
    ai_bridge: &AiBridgeRuntime,
    request: &str,
    kind: &str,
    body: String,
) -> Result<(), String> {
    if !ai_bridge.token_matches(authorization_bearer_token(request).as_deref()) {
        write_json_response(
            stream,
            401,
            "Unauthorized",
            r#"{"ok":false,"available":true,"enabled":false,"code":"unauthorized","message":"Pocket DAW live bridge requires a valid bearer token."}"#,
        )?;
        return Ok(());
    }
    if !ai_bridge.is_enabled() {
        write_json_response(
            stream,
            403,
            "Forbidden",
            r#"{"ok":false,"available":true,"enabled":false,"code":"bridge_disabled","message":"Pocket DAW live bridge is disabled in the app."}"#,
        )?;
        return Ok(());
    }
    match dispatch_ai_bridge_request(app, ai_bridge, kind, body) {
        Ok(response) => write_json_response(stream, 200, "OK", &response)?,
        Err(err) => {
            let body = serde_json::json!({
                "ok": false,
                "available": true,
                "enabled": true,
                "code": "bridge_error",
                "message": err
            })
            .to_string();
            write_json_response(stream, 502, "Bad Gateway", &body)?;
        }
    }
    Ok(())
}

#[cfg(desktop)]
fn dispatch_ai_bridge_request(
    app: &tauri::AppHandle,
    ai_bridge: &AiBridgeRuntime,
    kind: &str,
    body: String,
) -> Result<String, String> {
    let request_id = format!("ai-{}-{}", std::process::id(), next_ai_bridge_request_id());
    let (sender, receiver) = mpsc::channel();
    ai_bridge.register_pending(&request_id, sender)?;
    let payload = AiBridgeRequestPayload {
        request_id: request_id.clone(),
        kind: kind.to_string(),
        body,
        received_at: iso_timestamp(),
    };
    if let Err(err) = app.emit(AI_BRIDGE_REQUEST_EVENT, payload) {
        ai_bridge.remove_pending(&request_id);
        return Err(format!("Could not emit AI bridge request: {err}"));
    }
    match receiver.recv_timeout(Duration::from_millis(AI_BRIDGE_RESPONSE_TIMEOUT_MS)) {
        Ok(response) => Ok(response),
        Err(mpsc::RecvTimeoutError::Timeout) => {
            ai_bridge.remove_pending(&request_id);
            Err("Pocket DAW live bridge request timed out.".to_string())
        }
        Err(mpsc::RecvTimeoutError::Disconnected) => {
            ai_bridge.remove_pending(&request_id);
            Err("Pocket DAW live bridge response channel closed.".to_string())
        }
    }
}

#[cfg(desktop)]
fn next_ai_bridge_request_id() -> u64 {
    use std::sync::atomic::{AtomicU64, Ordering};
    static NEXT_ID: AtomicU64 = AtomicU64::new(1);
    NEXT_ID.fetch_add(1, Ordering::Relaxed)
}

#[cfg(desktop)]
fn request_path_matches(request: &str, method: &str, path: &str) -> bool {
    let Some(first_line) = request.lines().next() else {
        return false;
    };
    let mut parts = first_line.split_whitespace();
    matches!(
        (parts.next(), parts.next()),
        (Some(found_method), Some(found_path)) if found_method == method && found_path == path
    )
}

#[cfg(desktop)]
fn authorization_bearer_token(request: &str) -> Option<String> {
    for line in request.lines() {
        let Some((name, value)) = line.split_once(':') else {
            continue;
        };
        if name.trim().eq_ignore_ascii_case("authorization") {
            let value = value.trim();
            return value
                .strip_prefix("Bearer ")
                .map(|token| token.trim().to_string())
                .filter(|token| !token.is_empty());
        }
    }
    None
}

#[cfg(desktop)]
fn request_header_value(request: &str, header_name: &str) -> Option<String> {
    for line in request.lines().skip(1) {
        if line.is_empty() {
            break;
        }
        let Some((name, value)) = line.split_once(':') else {
            continue;
        };
        if name.trim().eq_ignore_ascii_case(header_name) {
            return Some(value.trim().to_string());
        }
    }
    None
}

#[cfg(desktop)]
fn local_bridge_request_headers_are_trusted(request: &str) -> bool {
    local_bridge_host_is_loopback(request_header_value(request, "Host").as_deref())
        && local_bridge_origin_is_trusted(request_header_value(request, "Origin").as_deref())
}

#[cfg(desktop)]
fn local_bridge_host_is_loopback(host: Option<&str>) -> bool {
    let Some(host) = host.map(str::trim).filter(|value| !value.is_empty()) else {
        return false;
    };
    let host_without_port = host
        .strip_prefix('[')
        .and_then(|value| value.split_once(']').map(|(inside, _)| inside))
        .unwrap_or_else(|| host.split_once(':').map(|(name, _)| name).unwrap_or(host));
    matches!(
        host_without_port.to_ascii_lowercase().as_str(),
        "127.0.0.1" | "localhost" | "::1"
    )
}

#[cfg(desktop)]
fn local_bridge_origin_is_trusted(origin: Option<&str>) -> bool {
    let Some(origin) = origin.map(str::trim).filter(|value| !value.is_empty()) else {
        return true;
    };
    if origin == "null" {
        return true;
    }
    let lower = origin.to_ascii_lowercase();
    lower == "tauri://localhost"
        || lower.starts_with("http://127.0.0.1:")
        || lower.starts_with("https://127.0.0.1:")
        || lower.starts_with("http://localhost:")
        || lower.starts_with("https://localhost:")
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
        "HTTP/1.1 {status} {status_text}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type, Authorization\r\nAccess-Control-Allow-Private-Network: true\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    stream
        .write_all(response.as_bytes())
        .map_err(|err| format!("Could not write response: {err}"))
}

#[cfg(desktop)]
fn write_json_response(
    stream: &mut std::net::TcpStream,
    status: u16,
    status_text: &str,
    body: &str,
) -> Result<(), String> {
    write_http_response(stream, status, status_text, "application/json", body)
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
struct DownloadHandoffFilePayload {
    #[serde(rename = "fileName")]
    file_name: String,
    path: String,
    contents: String,
}

#[derive(serde::Serialize)]
struct ProjectFileSaveResult {
    path: String,
    label: String,
    #[serde(rename = "backupPath")]
    backup_path: Option<String>,
    #[serde(rename = "bytesWritten")]
    bytes_written: u64,
    #[serde(rename = "recoveryWarnings")]
    recovery_warnings: Vec<String>,
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
    #[serde(rename = "sourceMimeType")]
    source_mime_type: Option<String>,
    #[serde(rename = "sourceSizeBytes")]
    source_size_bytes: u64,
    #[serde(rename = "sourceEncoding")]
    source_encoding: String,
    #[serde(rename = "decodedMimeType")]
    decoded_mime_type: Option<String>,
    #[serde(rename = "decodedSizeBytes")]
    decoded_size_bytes: u64,
    #[serde(rename = "sampleRate")]
    sample_rate: u32,
    channels: u16,
    #[serde(rename = "durationSeconds")]
    duration_seconds: f64,
    #[serde(rename = "frameCount")]
    frame_count: usize,
    decoder: String,
    #[serde(rename = "nativeDecodeError")]
    native_decode_error: Option<String>,
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
struct NativeCachePruneResult {
    #[serde(rename = "deletedCount")]
    deleted_count: usize,
    #[serde(rename = "deletedByteCount")]
    deleted_byte_count: u64,
    #[serde(rename = "skippedCount")]
    skipped_count: usize,
    errors: Vec<String>,
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
    read_project_file_payload(path).map(Some)
}

#[tauri::command]
fn read_project_file(path: String) -> Result<ProjectFilePayload, String> {
    read_project_file_payload(std::path::PathBuf::from(path))
}

fn read_project_file_payload(path: std::path::PathBuf) -> Result<ProjectFilePayload, String> {
    ensure_file_size_at_most(
        &path,
        MAX_PROJECT_FILE_BYTES,
        "Project file is too large for this release. Try a smaller .pocketdaw/JSON file.",
    )?;
    let contents = std::fs::read_to_string(&path)
        .map_err(|err| format!("Could not read project file: {}", err))?;
    Ok(ProjectFilePayload {
        label: file_label(&path),
        path: path.to_string_lossy().to_string(),
        contents,
    })
}

#[tauri::command]
fn read_download_handoff_file(file_name: String) -> Result<DownloadHandoffFilePayload, String> {
    let safe_name = validate_download_handoff_file_name(&file_name)?;
    let downloads = downloads_dir().ok_or_else(|| {
        "Could not find the Downloads folder for the Pocket Chordsmith handoff.".to_string()
    })?;
    let path = downloads.join(&safe_name);
    for _ in 0..24 {
        if path.exists() {
            ensure_file_size_at_most(
                &path,
                MAX_PROJECT_FILE_BYTES,
                "Pocket Chordsmith handoff file is too large for this release.",
            )?;
            let contents = std::fs::read_to_string(&path)
                .map_err(|err| format!("Could not read Pocket Chordsmith handoff file: {}", err))?;
            if !contents.trim().is_empty() {
                return Ok(DownloadHandoffFilePayload {
                    file_name: safe_name,
                    path: path.to_string_lossy().to_string(),
                    contents,
                });
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(250));
    }
    Err(format!(
        "Could not find {} in Downloads. Use the paste/import fallback if the browser asked where to save the file.",
        safe_name
    ))
}

#[tauri::command]
fn delete_download_handoff_file(file_name: String) -> Result<bool, String> {
    let safe_name = validate_download_handoff_file_name(&file_name)?;
    let downloads = downloads_dir().ok_or_else(|| {
        "Could not find the Downloads folder for the Pocket Chordsmith handoff.".to_string()
    })?;
    delete_download_handoff_file_from_dir(&downloads, &safe_name)
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
    read_audio_media_payload(path).map(Some)
}

#[tauri::command]
fn read_audio_media_file(
    path: String,
    project_file_path: Option<String>,
) -> Result<AudioMediaPayload, String> {
    let path_buf = resolve_media_path(&path, project_file_path.as_deref())?;
    ensure_file_size_at_most(&path_buf, MAX_AUDIO_FILE_BYTES, "Audio file is too large for this release. Try a shorter file or wait for native streaming support.")?;
    read_audio_media_payload(path_buf)
}

fn read_audio_media_payload(path_buf: std::path::PathBuf) -> Result<AudioMediaPayload, String> {
    let source_bytes =
        std::fs::read(&path_buf).map_err(|err| format!("Could not read audio media: {}", err))?;
    let source_size_bytes = source_bytes.len() as u64;
    ensure_bytes_at_most(source_size_bytes, MAX_AUDIO_FILE_BYTES, "Audio file is too large for this release. Try a shorter file or wait for native streaming support.")?;
    let source_mime_type = audio_mime_type(&path_buf);
    let decoded =
        native_decode::decode_audio_to_wav(&source_bytes, audio_extension(&path_buf).as_deref());
    let (
        bytes,
        mime_type,
        decoded_mime_type,
        decoded_size_bytes,
        sample_rate,
        channels,
        duration_seconds,
        frame_count,
        source_encoding,
        decoder,
        native_decode_error,
    ) = match decoded {
        Ok(decoded) => {
            ensure_bytes_at_most(decoded.wav_bytes.len() as u64, MAX_NATIVE_CACHE_ASSET_BYTES, "Decoded audio is too large for this release. Try a shorter file or wait for native streaming support.")?;
            let decoded_size_bytes = decoded.wav_bytes.len() as u64;
            (
                decoded.wav_bytes,
                Some("audio/wav".to_string()),
                Some("audio/wav".to_string()),
                decoded_size_bytes,
                decoded.sample_rate,
                decoded.channels,
                decoded.duration_seconds,
                decoded.frame_count,
                decoded.format,
                native_decode::SYMPHONIA_DECODER_LABEL.to_string(),
                None,
            )
        }
        Err(err) => (
            source_bytes,
            source_mime_type.clone(),
            None,
            0,
            0,
            0,
            0.0,
            0,
            audio_extension(&path_buf).unwrap_or_else(|| "unknown".to_string()),
            "browser-decode-fallback".to_string(),
            Some(err),
        ),
    };
    Ok(AudioMediaPayload {
        label: file_label(&path_buf),
        path: path_buf.to_string_lossy().to_string(),
        mime_type,
        size_bytes: bytes.len() as u64,
        bytes,
        source_mime_type,
        source_size_bytes,
        source_encoding,
        decoded_mime_type,
        decoded_size_bytes,
        sample_rate,
        channels,
        duration_seconds,
        frame_count,
        decoder,
        native_decode_error,
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
    let mut prepared = Vec::new();
    for item in items {
        let source = source_uri_to_path(&item.source_uri);
        if !source.is_absolute() {
            return Err(format!(
                "{} is not an absolute media source path.",
                item.source_uri
            ));
        }
        ensure_file_size_at_most(&source, MAX_AUDIO_FILE_BYTES, "Media file is too large to collect in this release. Try a shorter file or keep it external until native streaming support lands.")?;
        let target_relative_path =
            normalize_project_media_relative_path(&item.target_relative_path)?;
        if !target_relative_path.starts_with("project-media/") {
            return Err("Collected media targets must stay under project-media/.".to_string());
        }
        let target = resolve_project_relative_path(project_dir, &target_relative_path)?;
        if target == project_path {
            return Err("Collected media cannot overwrite the Pocket DAW project file.".to_string());
        }
        let target_already_matches = if target.exists() {
            if !files_have_equal_bytes(&source, &target)? {
                return Err(format!(
                    "Collect target already exists with different content and will not be overwritten: {}",
                    target_relative_path
                ));
            }
            true
        } else {
            false
        };
        prepared.push((item, source, target_relative_path, target, target_already_matches));
    }

    let mut collected = Vec::new();
    let mut copied_targets: Vec<std::path::PathBuf> = Vec::new();
    for (item, source, target_relative_path, target, target_already_matches) in prepared {
        if target_already_matches {
            collected.push(CollectedProjectMediaItem {
                id: item.id,
                source_uri: item.source_uri,
                target_path: target.to_string_lossy().to_string(),
                target_relative_path,
                size_bytes: std::fs::metadata(&target)
                    .map_err(|err| format!("Could not inspect existing collect target: {}", err))?
                    .len(),
            });
            continue;
        }
        if let Some(parent) = target.parent() {
            if let Err(err) = std::fs::create_dir_all(parent) {
                for copied in &copied_targets {
                    let _ = std::fs::remove_file(copied);
                }
                return Err(format!("Could not create project media folder: {}", err));
            }
        }
        let size_bytes = match std::fs::copy(&source, &target) {
            Ok(size_bytes) => size_bytes,
            Err(err) => {
                let _ = std::fs::remove_file(&target);
                for copied in &copied_targets {
                    let _ = std::fs::remove_file(copied);
                }
                return Err(format!("Could not copy {}: {}", item.source_uri, err));
            }
        };
        copied_targets.push(target.clone());
        collected.push(CollectedProjectMediaItem {
            id: item.id,
            source_uri: item.source_uri,
            target_path: target.to_string_lossy().to_string(),
            target_relative_path,
            size_bytes,
        });
    }
    Ok(collected)
}

fn files_have_equal_bytes(left: &std::path::Path, right: &std::path::Path) -> Result<bool, String> {
    let left_metadata = std::fs::metadata(left)
        .map_err(|err| format!("Could not inspect collect source: {}", err))?;
    let right_metadata = std::fs::metadata(right)
        .map_err(|err| format!("Could not inspect existing collect target: {}", err))?;
    if !left_metadata.is_file() || !right_metadata.is_file() || left_metadata.len() != right_metadata.len() {
        return Ok(false);
    }
    let mut left_file = std::fs::File::open(left)
        .map_err(|err| format!("Could not read collect source: {}", err))?;
    let mut right_file = std::fs::File::open(right)
        .map_err(|err| format!("Could not read existing collect target: {}", err))?;
    let mut left_buffer = [0_u8; 64 * 1024];
    let mut right_buffer = [0_u8; 64 * 1024];
    loop {
        let left_read = left_file
            .read(&mut left_buffer)
            .map_err(|err| format!("Could not read collect source: {}", err))?;
        let right_read = right_file
            .read(&mut right_buffer)
            .map_err(|err| format!("Could not read existing collect target: {}", err))?;
        if left_read != right_read || left_buffer[..left_read] != right_buffer[..right_read] {
            return Ok(false);
        }
        if left_read == 0 {
            return Ok(true);
        }
    }
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
    let relative_path = normalize_native_cache_relative_path(&relative_path);
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
    let relative_path = normalize_native_cache_relative_path(&relative_path);
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
fn prune_native_cache_assets(
    project_file_path: String,
    keep_relative_paths: Vec<String>,
) -> Result<NativeCachePruneResult, String> {
    let mut keep = HashSet::new();
    let mut prune_dirs = HashSet::new();
    let project_path = std::path::PathBuf::from(&project_file_path);
    let project_dir = project_path
        .parent()
        .ok_or_else(|| "Native cache needs a saved project folder.".to_string())?
        .to_path_buf();
    for relative_path in keep_relative_paths {
        validate_native_cache_relative_path(&relative_path)?;
        let normalized = normalize_native_cache_relative_path(&relative_path);
        let target = native_cache_asset_path(&project_file_path, &normalized)?;
        if let Some(parent) = target.parent() {
            prune_dirs.insert(parent.to_path_buf());
        }
        keep.insert(normalized);
    }

    if prune_dirs.is_empty() {
        return Ok(NativeCachePruneResult {
            deleted_count: 0,
            deleted_byte_count: 0,
            skipped_count: 0,
            errors: Vec::new(),
        });
    }

    let mut deleted_count = 0;
    let mut deleted_byte_count = 0;
    let mut skipped_count = 0;
    let mut errors = Vec::new();
    for cache_dir in prune_dirs {
        if !cache_dir.exists() {
            continue;
        }
        let entries = std::fs::read_dir(&cache_dir)
            .map_err(|err| format!("Could not inspect native cache folder: {}", err))?;

        for entry in entries {
            let entry = match entry {
                Ok(entry) => entry,
                Err(err) => {
                    errors.push(format!("Could not inspect native cache entry: {}", err));
                    continue;
                }
            };
            let path = entry.path();
            let Ok(file_type) = entry.file_type() else {
                skipped_count += 1;
                continue;
            };
            if !file_type.is_file()
                || path
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .map(|ext| !ext.eq_ignore_ascii_case("wav"))
                    .unwrap_or(true)
            {
                skipped_count += 1;
                continue;
            }
            let Some(relative_path) = project_relative_path(&project_dir, &path) else {
                skipped_count += 1;
                continue;
            };
            if keep.contains(&relative_path) {
                skipped_count += 1;
                continue;
            }
            let size = std::fs::metadata(&path)
                .map(|metadata| metadata.len())
                .unwrap_or(0);
            match std::fs::remove_file(&path) {
                Ok(()) => {
                    deleted_count += 1;
                    deleted_byte_count += size;
                }
                Err(err) => errors.push(format!(
                    "Could not delete stale native cache asset {}: {}",
                    path.to_string_lossy(),
                    err
                )),
            }
        }
    }

    Ok(NativeCachePruneResult {
        deleted_count,
        deleted_byte_count,
        skipped_count,
        errors,
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
    let saved = project_files::save_project_transaction(&path, &contents, MAX_PROJECT_FILE_BYTES)
        .map_err(|err| format!("Could not save project file: {}", err))?;
    Ok(Some(ProjectFileSaveResult {
        label: file_label(&path),
        path: path.to_string_lossy().to_string(),
        backup_path: saved.backup_path,
        bytes_written: saved.bytes_written,
        recovery_warnings: saved.recovery_warnings,
    }))
}

#[tauri::command]
fn write_project_file(path: String, contents: String) -> Result<ProjectFileSaveResult, String> {
    let path_buf = std::path::PathBuf::from(path);
    let saved =
        project_files::save_project_transaction(&path_buf, &contents, MAX_PROJECT_FILE_BYTES)
            .map_err(|err| format!("Could not save project file: {}", err))?;
    Ok(ProjectFileSaveResult {
        label: file_label(&path_buf),
        path: path_buf.to_string_lossy().to_string(),
        backup_path: saved.backup_path,
        bytes_written: saved.bytes_written,
        recovery_warnings: saved.recovery_warnings,
    })
}

#[derive(serde::Serialize)]
struct BinaryFileSaveResult {
    label: String,
    path: String,
    #[serde(rename = "bytesWritten")]
    bytes_written: u64,
}

#[tauri::command]
fn save_binary_file_as(
    default_name: String,
    bytes: Vec<u8>,
) -> Result<Option<BinaryFileSaveResult>, String> {
    ensure_bytes_at_most(
        bytes.len() as u64,
        MAX_BINARY_EXPORT_BYTES,
        "Export file is too large for this release.",
    )?;
    ensure_zip_payload(&bytes)?;
    let default_name = safe_binary_export_name(&default_name);
    let file = rfd::FileDialog::new()
        .add_filter("ZIP archive", &["zip"])
        .set_file_name(default_name)
        .save_file();
    let Some(path) = file else {
        return Ok(None);
    };
    let path = ensure_extension(path, "zip");
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|err| format!("Could not create export folder: {err}"))?;
    }
    std::fs::write(&path, &bytes).map_err(|err| format!("Could not save export file: {err}"))?;
    Ok(Some(BinaryFileSaveResult {
        label: file_label(&path),
        path: path.to_string_lossy().to_string(),
        bytes_written: bytes.len() as u64,
    }))
}

#[tauri::command]
fn write_binary_file(
    path: String,
    bytes: Vec<u8>,
    kind: String,
) -> Result<BinaryFileSaveResult, String> {
    ensure_bytes_at_most(
        bytes.len() as u64,
        MAX_BINARY_EXPORT_BYTES,
        "Export file is too large for this release.",
    )?;
    let ext = match kind.as_str() {
        "wav" => {
            ensure_wav_payload(&bytes)?;
            "wav"
        }
        "midi" => {
            ensure_midi_payload(&bytes)?;
            "mid"
        }
        "zip" => {
            ensure_zip_payload(&bytes)?;
            "zip"
        }
        _ => return Err("Unsupported binary export kind.".to_string()),
    };
    let path = ensure_extension(std::path::PathBuf::from(path), ext);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|err| format!("Could not create export folder: {err}"))?;
    }
    std::fs::write(&path, &bytes).map_err(|err| format!("Could not save export file: {err}"))?;
    Ok(BinaryFileSaveResult {
        label: file_label(&path),
        path: path.to_string_lossy().to_string(),
        bytes_written: bytes.len() as u64,
    })
}

#[tauri::command]
fn discover_project_recovery(path: String) -> Result<project_files::ProjectRecoveryState, String> {
    Ok(project_files::discover_project_recovery(
        &std::path::PathBuf::from(path),
    ))
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

fn safe_binary_export_name(default_name: &str) -> String {
    let file_name = std::path::Path::new(default_name)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("pocket-daw-export.zip");
    let cleaned = file_name
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.' | ' ') {
                ch
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches([' ', '.', '-'])
        .to_string();
    let with_fallback = if cleaned.is_empty() {
        "pocket-daw-export.zip".to_string()
    } else {
        cleaned
    };
    if with_fallback.to_ascii_lowercase().ends_with(".zip") {
        with_fallback
    } else {
        format!("{with_fallback}.zip")
    }
}

fn ensure_extension(path: std::path::PathBuf, ext: &str) -> std::path::PathBuf {
    if path
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case(ext))
    {
        return path;
    }
    let mut next = path;
    next.set_extension(ext);
    next
}

fn audio_mime_type(path: &std::path::Path) -> Option<String> {
    let ext = audio_extension(path)?;
    match ext.as_str() {
        "wav" => Some("audio/wav".to_string()),
        "mp3" => Some("audio/mpeg".to_string()),
        "ogg" => Some("audio/ogg".to_string()),
        "flac" => Some("audio/flac".to_string()),
        "aiff" | "aif" => Some("audio/aiff".to_string()),
        _ => None,
    }
}

fn audio_extension(path: &std::path::Path) -> Option<String> {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| value.trim_start_matches('.').to_ascii_lowercase())
        .filter(|value| !value.is_empty())
}

fn downloads_dir() -> Option<std::path::PathBuf> {
    let home = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME"))?;
    Some(std::path::PathBuf::from(home).join("Downloads"))
}

fn validate_download_handoff_file_name(file_name: &str) -> Result<String, String> {
    let trimmed = file_name.trim();
    if trimmed.is_empty()
        || trimmed.contains('/')
        || trimmed.contains('\\')
        || trimmed.contains("..")
        || !trimmed.starts_with(DOWNLOAD_HANDOFF_PREFIX)
        || !trimmed.ends_with(DOWNLOAD_HANDOFF_SUFFIX)
    {
        return Err(
            "Pocket Chordsmith handoff file name was not a valid Downloads handoff file."
                .to_string(),
        );
    }
    if !trimmed
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.'))
    {
        return Err(
            "Pocket Chordsmith handoff file name contained unsupported characters.".to_string(),
        );
    }
    Ok(trimmed.to_string())
}

fn delete_download_handoff_file_from_dir(
    downloads: &std::path::Path,
    file_name: &str,
) -> Result<bool, String> {
    let safe_name = validate_download_handoff_file_name(file_name)?;
    let path = downloads.join(&safe_name);
    if !path.exists() {
        return Ok(false);
    }
    std::fs::remove_file(&path)
        .map(|_| true)
        .map_err(|err| format!("Could not delete Pocket Chordsmith handoff file: {}", err))
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

fn normalize_project_media_relative_path(relative: &str) -> Result<String, String> {
    let normalized = relative.replace('\\', "/");
    let mut parts = Vec::new();
    for part in normalized.split('/') {
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." {
            return Err("Project media target cannot escape the project folder.".to_string());
        }
        parts.push(part);
    }
    if parts.is_empty() {
        return Err("Project media target must include a file name.".to_string());
    }
    Ok(parts.join("/"))
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
    let normalized = normalize_native_cache_relative_path(relative_path);
    if !normalized.starts_with("project-cache/native-audio/") {
        return Err("Native cache assets must live under project-cache/native-audio.".to_string());
    }
    if !normalized.to_ascii_lowercase().ends_with(".wav") {
        return Err("Native cache assets must be WAV files.".to_string());
    }
    if normalized
        .split('/')
        .any(|part| part.is_empty() || part == "." || part == "..")
    {
        return Err(
            "Native cache asset paths cannot contain empty or traversal segments.".to_string(),
        );
    }
    Ok(())
}

fn normalize_native_cache_relative_path(relative_path: &str) -> String {
    relative_path.replace('\\', "/")
}

fn project_relative_path(project_dir: &std::path::Path, path: &std::path::Path) -> Option<String> {
    let relative = path.strip_prefix(project_dir).ok()?;
    Some(
        relative
            .components()
            .map(|component| component.as_os_str().to_string_lossy().to_string())
            .collect::<Vec<_>>()
            .join("/"),
    )
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

fn ensure_zip_payload(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() >= 4
        && bytes[0] == b'P'
        && bytes[1] == b'K'
        && matches!(
            (bytes[2], bytes[3]),
            (0x03, 0x04) | (0x05, 0x06) | (0x07, 0x08)
        )
    {
        return Ok(());
    }
    Err("Export file must be a ZIP archive.".to_string())
}

fn ensure_wav_payload(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WAVE" {
        return Ok(());
    }
    Err("Export file must be a WAV audio file.".to_string())
}

fn ensure_midi_payload(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() >= 14 && &bytes[0..4] == b"MThd" {
        return Ok(());
    }
    Err("Export file must be a Standard MIDI file.".to_string())
}

fn bytes_to_mb(bytes: u64) -> u64 {
    bytes.div_ceil(1024 * 1024)
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
    fn external_urls_are_limited_to_expected_schemes() {
        assert_eq!(
            normalized_external_url(" https://samfa12.com ").expect("https URLs should be allowed"),
            "https://samfa12.com"
        );
        assert!(normalized_external_url("mailto:test@example.com").is_ok());
        assert!(normalized_external_url("javascript:alert(1)").is_err());
        assert!(normalized_external_url("file:///C:/secret.txt").is_err());
    }

    #[test]
    fn media_paths_resolve_project_media_aliases_under_saved_project() {
        let project_path = r"C:\Songs\Song.pocketdaw";
        let project_media = resolve_media_path("project-media/Loop.wav", Some(project_path))
            .expect("project media should resolve");
        let project_uri = resolve_media_path("project://media/Loop.wav", Some(project_path))
            .expect("project media uri should resolve");

        assert!(project_media.to_string_lossy().contains("project-media"));
        assert!(project_media.to_string_lossy().ends_with("Loop.wav"));
        assert_eq!(project_media, project_uri);
    }

    #[test]
    fn media_paths_reject_project_relative_reload_without_saved_project() {
        assert!(resolve_media_path("project-media/Loop.wav", None).is_err());
        assert!(resolve_media_path("project://media/Loop.wav", None).is_err());
    }

    #[test]
    fn collect_project_media_copies_absolute_sources_and_rejects_traversal_targets() {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system clock after epoch")
            .as_nanos();
        let root = std::env::temp_dir().join(format!("pocket-daw-collect-media-{stamp}"));
        let source_dir = root.join("source");
        let project_dir = root.join("project");
        std::fs::create_dir_all(&source_dir).expect("source dir");
        std::fs::create_dir_all(&project_dir).expect("project dir");
        let source = source_dir.join("Loop.wav");
        std::fs::write(&source, [1, 2, 3, 4]).expect("source media");
        let project = project_dir.join("Song.pocketdaw");
        std::fs::write(&project, "{}").expect("project file");

        let copied = collect_project_media(
            project.to_string_lossy().to_string(),
            vec![CollectProjectMediaItem {
                id: "media_001".to_string(),
                source_uri: source.to_string_lossy().to_string(),
                target_relative_path: r".\project-media\Loop.wav".to_string(),
            }],
        )
        .expect("collect should copy media");

        assert_eq!(copied.len(), 1);
        assert_eq!(copied[0].target_relative_path, "project-media/Loop.wav");
        assert_eq!(copied[0].size_bytes, 4);
        assert!(project_dir.join("project-media").join("Loop.wav").exists());

        let idempotent = collect_project_media(
            project.to_string_lossy().to_string(),
            vec![CollectProjectMediaItem {
                id: "media_retry".to_string(),
                source_uri: source.to_string_lossy().to_string(),
                target_relative_path: "project-media/Loop.wav".to_string(),
            }],
        )
        .expect("an identical collect retry should be idempotent");
        assert_eq!(idempotent[0].size_bytes, 4);

        let conflicting_source = source_dir.join("Conflicting.wav");
        std::fs::write(&conflicting_source, [9, 9, 9, 9]).expect("conflicting source media");
        let overwrite = match collect_project_media(
            project.to_string_lossy().to_string(),
            vec![CollectProjectMediaItem {
                id: "media_overwrite".to_string(),
                source_uri: conflicting_source.to_string_lossy().to_string(),
                target_relative_path: "project-media/Loop.wav".to_string(),
            }],
        ) {
            Ok(_) => panic!("collect should never overwrite an existing target"),
            Err(error) => error,
        };
        assert!(overwrite.contains("will not be overwritten"));

        let wrong_folder = match collect_project_media(
            project.to_string_lossy().to_string(),
            vec![CollectProjectMediaItem {
                id: "media_wrong_folder".to_string(),
                source_uri: source.to_string_lossy().to_string(),
                target_relative_path: "project-cache/Loop.wav".to_string(),
            }],
        ) {
            Ok(_) => panic!("collect should require project-media targets"),
            Err(error) => error,
        };
        assert!(wrong_folder.contains("project-media"));

        let blocked = match collect_project_media(
            project.to_string_lossy().to_string(),
            vec![CollectProjectMediaItem {
                id: "media_002".to_string(),
                source_uri: source.to_string_lossy().to_string(),
                target_relative_path: "../escape.wav".to_string(),
            }],
        ) {
            Ok(_) => panic!("collect should reject traversal targets"),
            Err(error) => error,
        };
        assert!(blocked.contains("cannot escape"));

        let second_source = source_dir.join("Second.wav");
        std::fs::write(&second_source, [5, 6, 7, 8]).expect("second source media");
        let missing_source = source_dir.join("Missing.wav");
        let partial = collect_project_media(
            project.to_string_lossy().to_string(),
            vec![
                CollectProjectMediaItem {
                    id: "media_partial_a".to_string(),
                    source_uri: second_source.to_string_lossy().to_string(),
                    target_relative_path: "project-media/Second.wav".to_string(),
                },
                CollectProjectMediaItem {
                    id: "media_partial_b".to_string(),
                    source_uri: missing_source.to_string_lossy().to_string(),
                    target_relative_path: "project-media/Missing.wav".to_string(),
                },
            ],
        );
        assert!(partial.is_err());
        assert!(!project_dir.join("project-media").join("Second.wav").exists());

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn prune_native_cache_assets_deletes_only_unreferenced_direct_wavs() {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system clock after epoch")
            .as_nanos();
        let project_dir =
            std::env::temp_dir().join(format!("pocket-daw-native-cache-prune-{stamp}"));
        let cache_dir = project_dir.join("project-cache").join("native-audio");
        std::fs::create_dir_all(&cache_dir).expect("cache dir");
        let keep_path = cache_dir.join("native-cache-keep.wav");
        let stale_path = cache_dir.join("native-cache-stale.wav");
        let note_path = cache_dir.join("notes.txt");
        let nested_dir = cache_dir.join("nested");
        let nested_wav = nested_dir.join("nested.wav");
        std::fs::write(&keep_path, [1, 2, 3]).expect("keep wav");
        std::fs::write(&stale_path, [4, 5, 6, 7]).expect("stale wav");
        std::fs::write(&note_path, "not cache audio").expect("non wav");
        std::fs::create_dir_all(&nested_dir).expect("nested dir");
        std::fs::write(&nested_wav, [8, 9]).expect("nested wav");
        let project_path = project_dir.join("Song.pocketdaw");
        std::fs::write(&project_path, "{}").expect("project file");

        let result = prune_native_cache_assets(
            project_path.to_string_lossy().to_string(),
            vec!["project-cache/native-audio/native-cache-keep.wav".to_string()],
        )
        .expect("prune succeeds");

        assert_eq!(result.deleted_count, 1);
        assert_eq!(result.deleted_byte_count, 4);
        assert!(result.errors.is_empty());
        assert!(keep_path.exists());
        assert!(!stale_path.exists());
        assert!(note_path.exists());
        assert!(nested_wav.exists());
        let _ = std::fs::remove_dir_all(&project_dir);
    }

    #[test]
    fn prune_native_cache_assets_stays_inside_named_project_namespace() {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system clock after epoch")
            .as_nanos();
        let project_dir =
            std::env::temp_dir().join(format!("pocket-daw-native-cache-ns-prune-{stamp}"));
        let song_a_dir = project_dir
            .join("project-cache")
            .join("native-audio")
            .join("song-a-1111");
        let song_b_dir = project_dir
            .join("project-cache")
            .join("native-audio")
            .join("song-b-2222");
        std::fs::create_dir_all(&song_a_dir).expect("song a cache dir");
        std::fs::create_dir_all(&song_b_dir).expect("song b cache dir");
        let keep_a = song_a_dir.join("native-cache-keep.wav");
        let stale_a = song_a_dir.join("native-cache-stale.wav");
        let keep_b = song_b_dir.join("native-cache-keep.wav");
        let stale_b = song_b_dir.join("native-cache-stale.wav");
        std::fs::write(&keep_a, [1, 2, 3]).expect("keep a wav");
        std::fs::write(&stale_a, [4, 5]).expect("stale a wav");
        std::fs::write(&keep_b, [6, 7, 8]).expect("keep b wav");
        std::fs::write(&stale_b, [9, 10]).expect("stale b wav");
        let project_path = project_dir.join("Song-A.pocketdaw");
        std::fs::write(&project_path, "{}").expect("project file");

        let result = prune_native_cache_assets(
            project_path.to_string_lossy().to_string(),
            vec!["project-cache/native-audio/song-a-1111/native-cache-keep.wav".to_string()],
        )
        .expect("prune succeeds");

        assert_eq!(result.deleted_count, 1);
        assert!(keep_a.exists());
        assert!(!stale_a.exists());
        assert!(keep_b.exists());
        assert!(stale_b.exists());
        let _ = std::fs::remove_dir_all(&project_dir);
    }

    #[test]
    fn prune_native_cache_assets_rejects_unsafe_keep_paths() {
        assert!(prune_native_cache_assets(
            r"C:\Songs\Song.pocketdaw".to_string(),
            vec!["project-cache/native-audio/../keep.wav".to_string()]
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
    fn binary_export_payloads_must_be_zip_archives() {
        assert!(ensure_zip_payload(&[b'P', b'K', 0x03, 0x04, 0]).is_ok());
        assert!(ensure_zip_payload(&[b'P', b'K', 0x05, 0x06, 0]).is_ok());

        let error = ensure_zip_payload(b"not a zip").expect_err("plain bytes should be rejected");
        assert!(error.contains("ZIP archive"));
        assert!(ensure_zip_payload(&[]).is_err());
    }

    #[test]
    fn direct_export_payloads_must_match_declared_kind() {
        assert!(ensure_wav_payload(b"RIFF\x24\x00\x00\x00WAVEfmt ").is_ok());
        assert!(ensure_midi_payload(b"MThd\x00\x00\x00\x06\x00\x01\x00\x01\x01\xe0").is_ok());

        assert!(ensure_wav_payload(b"MThd\x00\x00\x00\x06\x00\x01\x00\x01\x01\xe0").is_err());
        assert!(ensure_midi_payload(b"RIFF\x24\x00\x00\x00WAVEfmt ").is_err());
    }

    #[test]
    fn binary_export_names_are_sanitized_and_zip_suffixed() {
        assert_eq!(safe_binary_export_name("My Pack.zip"), "My Pack.zip");
        assert_eq!(safe_binary_export_name(r"..\bad/name"), "name.zip");
        assert_eq!(safe_binary_export_name("bad:name"), "bad-name.zip");
        assert_eq!(safe_binary_export_name(""), "pocket-daw-export.zip");
    }

    #[test]
    fn binary_export_paths_keep_or_add_zip_extension() {
        assert!(
            ensure_extension(std::path::PathBuf::from("Pack.zip"), "zip")
                .to_string_lossy()
                .ends_with("Pack.zip")
        );
        assert!(ensure_extension(std::path::PathBuf::from("Pack"), "zip")
            .to_string_lossy()
            .ends_with("Pack.zip"));
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

    #[test]
    fn live_bridge_request_path_matching_is_exact() {
        let status_request = "GET /pocket-daw/live/status HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n";
        let handoff_request = "POST /pocket-daw/handoff HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n";

        assert!(request_path_matches(
            status_request,
            "GET",
            "/pocket-daw/live/status"
        ));
        assert!(!request_path_matches(
            handoff_request,
            "GET",
            "/pocket-daw/live/status"
        ));
    }

    #[test]
    fn live_bridge_authorization_parses_bearer_token() {
        let request = "POST /pocket-daw/live/control HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer abc123\r\nContent-Length: 2\r\n\r\n{}";

        assert_eq!(
            authorization_bearer_token(request).as_deref(),
            Some("abc123")
        );
        assert_eq!(
            authorization_bearer_token(
                "GET /pocket-daw/live/status HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n"
            ),
            None
        );
    }

    #[test]
    fn local_bridge_headers_require_loopback_host_and_trusted_origin() {
        let trusted_dev = "POST /pocket-daw/handoff HTTP/1.1\r\nHost: 127.0.0.1:47858\r\nOrigin: http://localhost:5173\r\nContent-Length: 7\r\n\r\nabc-123";
        let trusted_file = "POST /pocket-daw/handoff HTTP/1.1\r\nHost: localhost:47858\r\nOrigin: null\r\nContent-Length: 7\r\n\r\nabc-123";
        let trusted_tauri = "GET /pocket-daw/live/status HTTP/1.1\r\nHost: [::1]:47858\r\nOrigin: tauri://localhost\r\n\r\n";
        let untrusted_host = "POST /pocket-daw/handoff HTTP/1.1\r\nHost: example.com\r\nOrigin: http://localhost:5173\r\nContent-Length: 7\r\n\r\nabc-123";
        let untrusted_origin = "POST /pocket-daw/handoff HTTP/1.1\r\nHost: 127.0.0.1:47858\r\nOrigin: https://example.com\r\nContent-Length: 7\r\n\r\nabc-123";

        assert!(local_bridge_request_headers_are_trusted(trusted_dev));
        assert!(local_bridge_request_headers_are_trusted(trusted_file));
        assert!(local_bridge_request_headers_are_trusted(trusted_tauri));
        assert!(!local_bridge_request_headers_are_trusted(untrusted_host));
        assert!(!local_bridge_request_headers_are_trusted(untrusted_origin));
        assert!(!local_bridge_request_headers_are_trusted(
            "POST /pocket-daw/handoff HTTP/1.1\r\nContent-Length: 7\r\n\r\nabc-123"
        ));
    }

    #[test]
    fn download_handoff_file_names_are_constrained() {
        assert!(validate_download_handoff_file_name(
            "pocket-chordsmith-to-pocket-daw-test-123.pcs1.txt"
        )
        .is_ok());
        assert!(validate_download_handoff_file_name(
            "../pocket-chordsmith-to-pocket-daw-test.pcs1.txt"
        )
        .is_err());
        assert!(
            validate_download_handoff_file_name("pocket-chordsmith-to-pocket-daw-test.json")
                .is_err()
        );
        assert!(validate_download_handoff_file_name("other-file.pcs1.txt").is_err());
    }

    #[test]
    fn delete_download_handoff_file_removes_only_valid_handoffs() {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let downloads = std::env::temp_dir().join(format!("pocket-daw-download-cleanup-{stamp}"));
        std::fs::create_dir_all(&downloads).expect("test downloads dir");
        let file_name = "pocket-chordsmith-to-pocket-daw-test-123.pcs1.txt";
        let file_path = downloads.join(file_name);
        std::fs::write(&file_path, "PCS1:test").expect("handoff file");

        assert!(delete_download_handoff_file_from_dir(&downloads, file_name)
            .expect("valid handoff deletion should succeed"));
        assert!(!file_path.exists());
        assert!(
            !delete_download_handoff_file_from_dir(&downloads, file_name)
                .expect("missing valid handoff should be harmless")
        );
        assert!(delete_download_handoff_file_from_dir(&downloads, "../bad.pcs1.txt").is_err());

        let _ = std::fs::remove_dir_all(&downloads);
    }
}
