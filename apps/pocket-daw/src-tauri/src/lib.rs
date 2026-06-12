use cpal::traits::DeviceTrait;

mod native_audio;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(native_audio::create_native_audio_runtime())
        .invoke_handler(tauri::generate_handler![
            probe_audio_devices,
            native_audio::native_audio_status,
            native_audio::native_audio_start,
            native_audio::native_audio_pause,
            native_audio::native_audio_seek,
            native_audio::native_audio_stop,
            native_audio::native_audio_update_track,
            open_project_file,
            open_audio_media_file,
            open_midi_file,
            save_project_file_as,
            write_project_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running Pocket DAW");
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
    let contents = std::fs::read_to_string(&path).map_err(|err| format!("Could not read project file: {}", err))?;
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
    let bytes = std::fs::read(&path).map_err(|err| format!("Could not read audio file: {}", err))?;
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
fn open_midi_file() -> Result<Option<MidiFilePayload>, String> {
    let file = rfd::FileDialog::new()
        .add_filter("MIDI", &["mid", "midi"])
        .pick_file();
    let Some(path) = file else {
        return Ok(None);
    };
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
fn save_project_file_as(default_name: String, contents: String) -> Result<Option<ProjectFileSaveResult>, String> {
    let file = rfd::FileDialog::new()
        .add_filter("Pocket DAW project", &["pocketdaw"])
        .set_file_name(default_name)
        .save_file();
    let Some(path) = file else {
        return Ok(None);
    };
    std::fs::write(&path, contents).map_err(|err| format!("Could not save project file: {}", err))?;
    Ok(Some(ProjectFileSaveResult {
        label: file_label(&path),
        path: path.to_string_lossy().to_string(),
    }))
}

#[tauri::command]
fn write_project_file(path: String, contents: String) -> Result<ProjectFileSaveResult, String> {
    let path_buf = std::path::PathBuf::from(path);
    std::fs::write(&path_buf, contents).map_err(|err| format!("Could not save project file: {}", err))?;
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

    let mut notes = vec!["Native CPAL probe. WASAPI is the v0.1.3 target; ASIO is reserved for a later pass.".to_string()];
    let host_id = cpal::available_hosts()
        .into_iter()
        .find(|id| format!("{:?}", id).eq_ignore_ascii_case("Wasapi"))
        .unwrap_or(cpal::default_host().id());
    let host = cpal::host_from_id(host_id).unwrap_or_else(|_| cpal::default_host());
    let host_name = format!("{:?}", host.id()).to_lowercase();
    let default_input_name = host.default_input_device().and_then(|device| device_name(&device).ok());
    let default_output_name = host.default_output_device().and_then(|device| device_name(&device).ok());
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

    let default_input_id = devices.iter().find(|device| device.is_default_input).map(|device| device.id.clone());
    let default_output_id = devices.iter().find(|device| device.is_default_output).map(|device| device.id.clone());
    AudioProbeResult { host: host_name, devices, default_input_id, default_output_id, notes }
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
    device.description().map(|description| description.name().to_string())
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
        .map(|ch| if ch.is_ascii_alphanumeric() { ch.to_ascii_lowercase() } else { '-' })
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
    let ext = path.extension().and_then(|value| value.to_str())?.to_ascii_lowercase();
    match ext.as_str() {
        "wav" => Some("audio/wav".to_string()),
        "mp3" => Some("audio/mpeg".to_string()),
        "ogg" => Some("audio/ogg".to_string()),
        "flac" => Some("audio/flac".to_string()),
        "aiff" | "aif" => Some("audio/aiff".to_string()),
        _ => None,
    }
}
