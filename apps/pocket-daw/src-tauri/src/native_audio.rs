use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

type NativeAudioState = Mutex<NativeAudioRuntime>;

#[derive(Default)]
pub struct NativeAudioRuntime {
    stream: Option<cpal::Stream>,
    shared: Option<Arc<Mutex<PlaybackShared>>>,
    generation: u64,
    last_error: Option<String>,
    device_name: Option<String>,
    host_name: Option<String>,
}

pub fn create_native_audio_runtime() -> NativeAudioState {
    Mutex::new(NativeAudioRuntime::default())
}

#[derive(Clone, Deserialize)]
pub struct NativeAudioStartPayload {
    #[serde(rename = "projectTitle")]
    project_title: Option<String>,
    #[serde(rename = "startSeconds")]
    start_seconds: f64,
    #[serde(rename = "outputDeviceId")]
    output_device_id: Option<String>,
    tracks: Vec<NativeTrackControl>,
    events: Vec<NativeRenderedEvent>,
    #[serde(default)]
    assets: Vec<NativeAudioAssetPayload>,
    #[serde(default)]
    regions: Vec<NativeAudioRegion>,
}

#[derive(Clone, Deserialize)]
pub struct NativeRenderedEvent {
    id: String,
    kind: String,
    #[serde(rename = "trackId")]
    track_id: String,
    time: f64,
    duration: f64,
    midi: Option<f64>,
    #[serde(rename = "midiNotes", default)]
    midi_notes: Vec<f64>,
    velocity: f64,
    pan: Option<f64>,
    accent: Option<bool>,
    articulation: Option<String>,
}

#[derive(Clone, Deserialize)]
pub struct NativeTrackControl {
    id: String,
    volume: f64,
    pan: f64,
    mute: bool,
    solo: bool,
}

#[derive(Clone, Deserialize)]
pub struct NativeAudioAssetPayload {
    id: String,
    name: String,
    #[serde(rename = "sampleRate")]
    sample_rate: u32,
    channels: u16,
    #[serde(rename = "durationSeconds")]
    duration_seconds: f64,
    bytes: Vec<u8>,
}

#[derive(Clone, Deserialize)]
pub struct NativeAudioRegion {
    id: String,
    #[serde(rename = "assetId")]
    asset_id: String,
    #[serde(rename = "trackId")]
    track_id: String,
    #[serde(rename = "startTime")]
    start_time: f64,
    #[serde(rename = "sourceOffset")]
    source_offset: f64,
    duration: f64,
    gain: f64,
    pan: f64,
}

#[derive(Clone, Deserialize)]
pub struct NativeTrackControlPatch {
    #[serde(rename = "trackId")]
    track_id: String,
    volume: Option<f64>,
    pan: Option<f64>,
    mute: Option<bool>,
    solo: Option<bool>,
}

#[derive(Clone, Serialize)]
pub struct NativeAudioStatus {
    backend: String,
    available: bool,
    active: bool,
    playing: bool,
    #[serde(rename = "positionSeconds")]
    position_seconds: f64,
    #[serde(rename = "eventCount")]
    event_count: usize,
    #[serde(rename = "sampleRate")]
    sample_rate: u32,
    channels: u16,
    #[serde(rename = "renderedFrameCount")]
    rendered_frame_count: u64,
    #[serde(rename = "startedGeneration")]
    started_generation: u64,
    #[serde(rename = "projectTitle")]
    project_title: Option<String>,
    #[serde(rename = "deviceName")]
    device_name: Option<String>,
    #[serde(rename = "hostName")]
    host_name: Option<String>,
    #[serde(rename = "lastError")]
    last_error: Option<String>,
    #[serde(rename = "assetCount")]
    asset_count: usize,
    #[serde(rename = "assetRegionCount")]
    asset_region_count: usize,
    #[serde(rename = "proceduralEventCount")]
    procedural_event_count: usize,
}

#[derive(Clone)]
struct PlaybackShared {
    project_title: Option<String>,
    events: Vec<NativeRenderedEvent>,
    assets: HashMap<String, DecodedAudioAsset>,
    regions: Vec<NativeAudioRegion>,
    tracks: HashMap<String, NativeTrackControl>,
    has_solo: bool,
    position_seconds: f64,
    sample_rate: u32,
    channels: u16,
    playing: bool,
    rendered_frame_count: u64,
    scan_start_index: usize,
    generation: u64,
}

#[derive(Clone, Debug)]
struct DecodedAudioAsset {
    sample_rate: u32,
    channels: u16,
    samples: Vec<f32>,
    frame_count: usize,
}

#[tauri::command]
pub fn native_audio_status(state: tauri::State<'_, NativeAudioState>) -> NativeAudioStatus {
    match state.lock() {
        Ok(runtime) => runtime.status(),
        Err(_) => NativeAudioStatus::unavailable(Some("Native audio runtime lock was poisoned.".to_string())),
    }
}

#[tauri::command]
pub fn native_audio_start(
    payload: NativeAudioStartPayload,
    state: tauri::State<'_, NativeAudioState>,
) -> Result<NativeAudioStatus, String> {
    let mut runtime = state
        .lock()
        .map_err(|_| "Native audio runtime lock was poisoned.".to_string())?;
    runtime.start(payload)
}

#[tauri::command]
pub fn native_audio_pause(state: tauri::State<'_, NativeAudioState>) -> Result<NativeAudioStatus, String> {
    let runtime = state
        .lock()
        .map_err(|_| "Native audio runtime lock was poisoned.".to_string())?;
    if let Some(shared) = &runtime.shared {
        if let Ok(mut playback) = shared.lock() {
            playback.playing = false;
        }
    }
    Ok(runtime.status())
}

#[tauri::command]
pub fn native_audio_seek(seconds: f64, state: tauri::State<'_, NativeAudioState>) -> Result<NativeAudioStatus, String> {
    let runtime = state
        .lock()
        .map_err(|_| "Native audio runtime lock was poisoned.".to_string())?;
    if let Some(shared) = &runtime.shared {
        if let Ok(mut playback) = shared.lock() {
            playback.position_seconds = seconds.max(0.0);
            playback.scan_start_index = find_scan_start(&playback.events, playback.position_seconds);
        }
    }
    Ok(runtime.status())
}

#[tauri::command]
pub fn native_audio_stop(state: tauri::State<'_, NativeAudioState>) -> Result<NativeAudioStatus, String> {
    let mut runtime = state
        .lock()
        .map_err(|_| "Native audio runtime lock was poisoned.".to_string())?;
    runtime.stop();
    Ok(runtime.status())
}

#[tauri::command]
pub fn native_audio_update_track(
    patch: NativeTrackControlPatch,
    state: tauri::State<'_, NativeAudioState>,
) -> Result<NativeAudioStatus, String> {
    let runtime = state
        .lock()
        .map_err(|_| "Native audio runtime lock was poisoned.".to_string())?;
    if let Some(shared) = &runtime.shared {
        if let Ok(mut playback) = shared.lock() {
            if let Some(track) = playback.tracks.get_mut(&patch.track_id) {
                if let Some(volume) = patch.volume {
                    track.volume = volume.clamp(0.0, 1.2);
                }
                if let Some(pan) = patch.pan {
                    track.pan = pan.clamp(-1.0, 1.0);
                }
                if let Some(mute) = patch.mute {
                    track.mute = mute;
                }
                if let Some(solo) = patch.solo {
                    track.solo = solo;
                }
                playback.has_solo = playback.tracks.values().any(|item| item.solo);
            }
        }
    }
    Ok(runtime.status())
}

impl NativeAudioRuntime {
    fn start(&mut self, payload: NativeAudioStartPayload) -> Result<NativeAudioStatus, String> {
        self.stop();
        self.generation = self.generation.saturating_add(1);

        let host_id = cpal::available_hosts()
            .into_iter()
            .find(|id| format!("{:?}", id).eq_ignore_ascii_case("Wasapi"))
            .unwrap_or(cpal::default_host().id());
        let host = cpal::host_from_id(host_id).unwrap_or_else(|_| cpal::default_host());
        let host_name = format!("{:?}", host.id()).to_lowercase();
        let device = output_device_for_id(&host, &host_name, payload.output_device_id.as_deref())
            .or_else(|| host.default_output_device())
            .ok_or_else(|| "No native output audio device is available.".to_string())?;
        let device_name = device_name(&device).unwrap_or_else(|_| "Default native output".to_string());
        let supported_config = device
            .default_output_config()
            .map_err(|err| format!("Could not read default output config: {}", err))?;
        let sample_format = supported_config.sample_format();
        let config = supported_config.config();
        let channels = config.channels.max(1);
        let sample_rate = config.sample_rate;
        let mut events = payload.events;
        events.sort_by(|a, b| a.time.partial_cmp(&b.time).unwrap_or(std::cmp::Ordering::Equal));
        let mut regions = payload.regions;
        regions.sort_by(|a, b| a.start_time.partial_cmp(&b.start_time).unwrap_or(std::cmp::Ordering::Equal));
        for region in &regions {
            validate_region(region)?;
        }
        let mut assets = HashMap::new();
        for asset in payload.assets {
            let decoded = decode_payload_asset(&asset)?;
            assets.insert(asset.id.clone(), decoded);
        }
        let tracks = payload
            .tracks
            .into_iter()
            .map(|track| (track.id.clone(), track))
            .collect::<HashMap<_, _>>();
        let shared = Arc::new(Mutex::new(PlaybackShared {
            project_title: payload.project_title,
            events,
            assets,
            regions,
            has_solo: tracks.values().any(|track| track.solo),
            tracks,
            position_seconds: payload.start_seconds.max(0.0),
            sample_rate,
            channels,
            playing: true,
            rendered_frame_count: 0,
            scan_start_index: 0,
            generation: self.generation,
        }));
        if let Ok(mut playback) = shared.lock() {
            playback.scan_start_index = find_scan_start(&playback.events, playback.position_seconds);
        }

        let err_shared = Arc::clone(&shared);
        let err_fn = move |err| {
            if let Ok(mut playback) = err_shared.lock() {
                playback.playing = false;
            }
            eprintln!("Pocket DAW native audio stream error: {}", err);
        };

        let stream = match sample_format {
            cpal::SampleFormat::F32 => {
                let callback_shared = Arc::clone(&shared);
                device.build_output_stream(
                    &config,
                    move |data: &mut [f32], _| write_output(data, &callback_shared),
                    err_fn,
                    None,
                )
            }
            cpal::SampleFormat::I16 => {
                let callback_shared = Arc::clone(&shared);
                device.build_output_stream(
                    &config,
                    move |data: &mut [i16], _| write_output_i16(data, &callback_shared),
                    err_fn,
                    None,
                )
            }
            cpal::SampleFormat::U16 => {
                let callback_shared = Arc::clone(&shared);
                device.build_output_stream(
                    &config,
                    move |data: &mut [u16], _| write_output_u16(data, &callback_shared),
                    err_fn,
                    None,
                )
            }
            other => return Err(format!("Unsupported native output sample format: {:?}", other)),
        }
        .map_err(|err| format!("Could not build native output stream: {}", err))?;

        stream
            .play()
            .map_err(|err| format!("Could not start native output stream: {}", err))?;
        self.stream = Some(stream);
        self.shared = Some(shared);
        self.device_name = Some(device_name);
        self.host_name = Some(host_name);
        self.last_error = None;
        Ok(self.status())
    }

    fn stop(&mut self) {
        if let Some(shared) = &self.shared {
            if let Ok(mut playback) = shared.lock() {
                playback.playing = false;
            }
        }
        self.stream = None;
        self.shared = None;
    }

    fn status(&self) -> NativeAudioStatus {
        if let Some(shared) = &self.shared {
            if let Ok(playback) = shared.lock() {
                return NativeAudioStatus {
                    backend: "native-cpal".to_string(),
                    available: true,
                    active: true,
                    playing: playback.playing,
                    position_seconds: playback.position_seconds,
                    event_count: playback.events.len(),
                    sample_rate: playback.sample_rate,
                    channels: playback.channels,
                    rendered_frame_count: playback.rendered_frame_count,
                    started_generation: playback.generation,
                    project_title: playback.project_title.clone(),
                    device_name: self.device_name.clone(),
                    host_name: self.host_name.clone(),
                    last_error: self.last_error.clone(),
                    asset_count: playback.assets.len(),
                    asset_region_count: playback.regions.len(),
                    procedural_event_count: playback.events.len(),
                };
            }
        }
        NativeAudioStatus {
            backend: "native-cpal".to_string(),
            available: true,
            active: false,
            playing: false,
            position_seconds: 0.0,
            event_count: 0,
            sample_rate: 0,
            channels: 0,
            rendered_frame_count: 0,
            started_generation: self.generation,
            project_title: None,
            device_name: self.device_name.clone(),
            host_name: self.host_name.clone(),
            last_error: self.last_error.clone(),
            asset_count: 0,
            asset_region_count: 0,
            procedural_event_count: 0,
        }
    }
}

impl NativeAudioStatus {
    fn unavailable(last_error: Option<String>) -> Self {
        Self {
            backend: "native-cpal".to_string(),
            available: false,
            active: false,
            playing: false,
            position_seconds: 0.0,
            event_count: 0,
            sample_rate: 0,
            channels: 0,
            rendered_frame_count: 0,
            started_generation: 0,
            project_title: None,
            device_name: None,
            host_name: None,
            last_error,
            asset_count: 0,
            asset_region_count: 0,
            procedural_event_count: 0,
        }
    }
}

fn write_output(data: &mut [f32], shared: &Arc<Mutex<PlaybackShared>>) {
    if let Ok(mut playback) = shared.lock() {
        let channels = playback.channels as usize;
        for frame in data.chunks_mut(channels) {
            let (left, right) = render_next_frame(&mut playback);
            write_frame(frame, left, right);
        }
    } else {
        data.fill(0.0);
    }
}

fn write_output_i16(data: &mut [i16], shared: &Arc<Mutex<PlaybackShared>>) {
    if let Ok(mut playback) = shared.lock() {
        let channels = playback.channels as usize;
        for frame in data.chunks_mut(channels) {
            let (left, right) = render_next_frame(&mut playback);
            if let Some(sample) = frame.get_mut(0) {
                *sample = (left.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
            }
            if frame.len() > 1 {
                frame[1] = (right.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
            }
            for sample in frame.iter_mut().skip(2) {
                *sample = (((left + right) * 0.5).clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
            }
        }
    } else {
        data.fill(0);
    }
}

fn write_output_u16(data: &mut [u16], shared: &Arc<Mutex<PlaybackShared>>) {
    if let Ok(mut playback) = shared.lock() {
        let channels = playback.channels as usize;
        for frame in data.chunks_mut(channels) {
            let (left, right) = render_next_frame(&mut playback);
            if let Some(sample) = frame.get_mut(0) {
                *sample = f32_to_u16(left);
            }
            if frame.len() > 1 {
                frame[1] = f32_to_u16(right);
            }
            for sample in frame.iter_mut().skip(2) {
                *sample = f32_to_u16((left + right) * 0.5);
            }
        }
    } else {
        data.fill(u16::MAX / 2);
    }
}

fn write_frame(frame: &mut [f32], left: f32, right: f32) {
    if let Some(sample) = frame.get_mut(0) {
        *sample = left;
    }
    if frame.len() > 1 {
        frame[1] = right;
    }
    for sample in frame.iter_mut().skip(2) {
        *sample = (left + right) * 0.5;
    }
}

fn f32_to_u16(value: f32) -> u16 {
    (((value.clamp(-1.0, 1.0) * 0.5 + 0.5) * u16::MAX as f32).round() as i32).clamp(0, u16::MAX as i32) as u16
}

fn render_next_frame(playback: &mut PlaybackShared) -> (f32, f32) {
    if !playback.playing {
        return (0.0, 0.0);
    }

    let t = playback.position_seconds;
    while playback.scan_start_index < playback.events.len()
        && event_release_end(&playback.events[playback.scan_start_index]) < t
    {
        playback.scan_start_index += 1;
    }

    let mut left = 0.0_f32;
    let mut right = 0.0_f32;
    let mut active_count = 0usize;

    for region in playback.regions.iter() {
        if region.start_time > t {
            break;
        }
        if region.start_time + region.duration < t {
            continue;
        }
        let Some(track) = playback.tracks.get(&region.track_id) else {
            continue;
        };
        let track_gain = track_gain(track, playback.has_solo);
        if track_gain <= 0.0001 {
            continue;
        }
        let Some(asset) = playback.assets.get(&region.asset_id) else {
            continue;
        };
        let Some((asset_left, asset_right)) = render_region_sample(region, asset, t) else {
            continue;
        };
        active_count += 1;
        if active_count > 96 {
            break;
        }
        let pan = (track.pan + region.pan).clamp(-1.0, 1.0) as f32;
        let (pan_left, pan_right) = pan_gains(pan);
        let gain = (track_gain * region.gain.clamp(0.0, 1.4)) as f32;
        left += asset_left * gain * pan_left;
        right += asset_right * gain * pan_right;
    }

    for event in playback.events.iter().skip(playback.scan_start_index) {
        if event.time > t {
            break;
        }
        if event_release_end(event) < t {
            continue;
        }
        let Some(track) = playback.tracks.get(&event.track_id) else {
            continue;
        };
        let track_gain = track_gain(track, playback.has_solo);
        if track_gain <= 0.0001 {
            continue;
        }
        let sample = render_event_sample(event, t) * track_gain as f32;
        if sample.abs() <= 0.000001 {
            continue;
        }
        active_count += 1;
        if active_count > 96 {
            break;
        }
        let pan = (track.pan + event.pan.unwrap_or(0.0)).clamp(-1.0, 1.0) as f32;
        let (pan_left, pan_right) = pan_gains(pan);
        left += sample * pan_left;
        right += sample * pan_right;
    }

    playback.position_seconds += 1.0 / playback.sample_rate.max(1) as f64;
    playback.rendered_frame_count = playback.rendered_frame_count.saturating_add(1);
    (soft_limit(left * 0.72), soft_limit(right * 0.72))
}

fn render_region_sample(region: &NativeAudioRegion, asset: &DecodedAudioAsset, t: f64) -> Option<(f32, f32)> {
    let local = t - region.start_time;
    if local < 0.0 || local > region.duration {
        return None;
    }
    let source_seconds = region.source_offset.max(0.0) + local;
    let frame = (source_seconds * asset.sample_rate.max(1) as f64).floor() as usize;
    if frame >= asset.frame_count {
        return None;
    }
    let channels = asset.channels.max(1) as usize;
    let index = frame.checked_mul(channels)?;
    let left = *asset.samples.get(index)?;
    let right = if channels > 1 {
        *asset.samples.get(index + 1).unwrap_or(&left)
    } else {
        left
    };
    Some((left, right))
}

fn decode_payload_asset(asset: &NativeAudioAssetPayload) -> Result<DecodedAudioAsset, String> {
    if asset.id.trim().is_empty() {
        return Err("Native cached WAV asset is missing an id.".to_string());
    }
    if !asset.duration_seconds.is_finite() || asset.duration_seconds < 0.0 {
        return Err(format!("Native cached WAV asset {} has invalid duration metadata.", asset.name));
    }
    let decoded = decode_pcm16_wav(&asset.bytes)
        .map_err(|err| format!("Could not decode native cached WAV asset {}: {}", asset.name, err))?;
    if asset.sample_rate != 0 && asset.sample_rate != decoded.sample_rate {
        return Err(format!(
            "Native cached WAV asset {} sample-rate metadata {} does not match decoded rate {}.",
            asset.name, asset.sample_rate, decoded.sample_rate
        ));
    }
    if asset.channels != 0 && asset.channels != decoded.channels {
        return Err(format!(
            "Native cached WAV asset {} channel metadata {} does not match decoded channels {}.",
            asset.name, asset.channels, decoded.channels
        ));
    }
    Ok(decoded)
}

fn validate_region(region: &NativeAudioRegion) -> Result<(), String> {
    if region.id.trim().is_empty() {
        return Err("Native cached WAV region is missing an id.".to_string());
    }
    if region.asset_id.trim().is_empty() {
        return Err(format!("Native cached WAV region {} is missing an asset id.", region.id));
    }
    if region.track_id.trim().is_empty() {
        return Err(format!("Native cached WAV region {} is missing a track id.", region.id));
    }
    if !region.start_time.is_finite()
        || !region.source_offset.is_finite()
        || !region.duration.is_finite()
        || !region.gain.is_finite()
        || !region.pan.is_finite()
    {
        return Err(format!("Native cached WAV region {} contains non-finite timing or mix data.", region.id));
    }
    if region.duration <= 0.0 {
        return Err(format!("Native cached WAV region {} must have a positive duration.", region.id));
    }
    Ok(())
}

fn decode_pcm16_wav(bytes: &[u8]) -> Result<DecodedAudioAsset, String> {
    if bytes.len() < 44 {
        return Err("file is too small to be a PCM WAV".to_string());
    }
    if bytes.get(0..4) != Some(b"RIFF") || bytes.get(8..12) != Some(b"WAVE") {
        return Err("missing RIFF/WAVE header".to_string());
    }

    let mut cursor = 12usize;
    let mut channels = 0u16;
    let mut sample_rate = 0u32;
    let mut bits_per_sample = 0u16;
    let mut format = 0u16;
    let mut data_start = 0usize;
    let mut data_len = 0usize;

    while cursor + 8 <= bytes.len() {
        let id = &bytes[cursor..cursor + 4];
        let len = read_u32_le(bytes, cursor + 4)? as usize;
        let chunk_start = cursor + 8;
        let chunk_end = chunk_start.saturating_add(len);
        if chunk_end > bytes.len() {
            return Err("chunk length exceeds file size".to_string());
        }
        if id == b"fmt " {
            if len < 16 {
                return Err("fmt chunk is too short".to_string());
            }
            format = read_u16_le(bytes, chunk_start)?;
            channels = read_u16_le(bytes, chunk_start + 2)?;
            sample_rate = read_u32_le(bytes, chunk_start + 4)?;
            bits_per_sample = read_u16_le(bytes, chunk_start + 14)?;
        } else if id == b"data" {
            data_start = chunk_start;
            data_len = len;
        }
        cursor = chunk_end + (len % 2);
    }

    if format != 1 || bits_per_sample != 16 {
        return Err("only 16-bit PCM WAV assets are supported".to_string());
    }
    if channels == 0 || channels > 2 {
        return Err("only mono or stereo WAV assets are supported".to_string());
    }
    if sample_rate == 0 || data_len == 0 {
        return Err("missing sample rate or data chunk".to_string());
    }

    let sample_count = data_len / 2;
    let mut samples = Vec::with_capacity(sample_count);
    for index in 0..sample_count {
        let offset = data_start + index * 2;
        let raw = i16::from_le_bytes([bytes[offset], bytes[offset + 1]]);
        samples.push(raw as f32 / i16::MAX as f32);
    }
    let frame_count = samples.len() / channels as usize;
    Ok(DecodedAudioAsset {
        sample_rate,
        channels,
        samples,
        frame_count,
    })
}

fn read_u16_le(bytes: &[u8], offset: usize) -> Result<u16, String> {
    let slice = bytes.get(offset..offset + 2).ok_or_else(|| "unexpected end of file".to_string())?;
    Ok(u16::from_le_bytes([slice[0], slice[1]]))
}

fn read_u32_le(bytes: &[u8], offset: usize) -> Result<u32, String> {
    let slice = bytes.get(offset..offset + 4).ok_or_else(|| "unexpected end of file".to_string())?;
    Ok(u32::from_le_bytes([slice[0], slice[1], slice[2], slice[3]]))
}

fn render_event_sample(event: &NativeRenderedEvent, t: f64) -> f32 {
    let local = t - event.time;
    if local < 0.0 {
        return 0.0;
    }
    let velocity = event.velocity.clamp(0.0, 1.4) as f32;
    let accent = event.accent.unwrap_or(false);
    match event.kind.as_str() {
        "kick" => {
            if local > 0.22 {
                return 0.0;
            }
            let sweep = (local / 0.16).clamp(0.0, 1.0);
            let freq = 155.0 * (45.0_f64 / 155.0_f64).powf(sweep);
            let env = (-local * 20.0).exp() as f32;
            (phase(freq as f32, local) * env * velocity * 1.05).clamp(-1.0, 1.0)
        }
        "snare" => {
            if local > 0.16 {
                return 0.0;
            }
            let env = (-local * 22.0).exp() as f32;
            noise(event, local, 0) * env * velocity * 0.64
        }
        "hat" => {
            let end = if accent { 0.18 } else { 0.07 };
            if local > end {
                return 0.0;
            }
            let env = (-local * if accent { 18.0 } else { 44.0 }).exp() as f32;
            (noise(event, local, 13) - noise(event, local, 31) * 0.45) * env * velocity * 0.28
        }
        "bass" => {
            let midi = event.midi.unwrap_or(36.0);
            let dur = event.duration.max(0.08);
            if local > dur + 0.18 {
                return 0.0;
            }
            let env = note_envelope(local, dur, 0.006, 0.08, 0.55, 0.18);
            let freq = midi_to_freq(midi) as f32;
            (saw(freq, local) * 0.62 + phase(freq * 0.5, local) * 0.38) * env * velocity * 0.48
        }
        "melody" | "midi" => {
            let midi = event.midi.unwrap_or(72.0);
            render_notes(&[midi], event, local, velocity, 0.24)
        }
        "chord" => render_notes(&event.midi_notes, event, local, velocity, 0.18),
        "guitar" => {
            let gain = if event.articulation.as_deref() == Some("chug") { 0.25 } else { 0.21 };
            render_notes(&event.midi_notes, event, local, velocity, gain)
        }
        _ => 0.0,
    }
}

fn render_notes(notes: &[f64], event: &NativeRenderedEvent, local: f64, velocity: f32, gain: f32) -> f32 {
    let dur = event.duration.max(0.05);
    if local > dur + 0.22 {
        return 0.0;
    }
    let env = note_envelope(local, dur, 0.008, 0.07, 0.62, 0.22);
    let source_notes = if notes.is_empty() { &[60.0][..] } else { notes };
    let mut sample = 0.0_f32;
    let scale = (source_notes.len() as f32).sqrt().max(1.0);
    for (index, midi) in source_notes.iter().take(6).enumerate() {
        let offset = index as f64 * 0.006;
        if local < offset {
            continue;
        }
        let freq = midi_to_freq(*midi) as f32;
        sample += (triangle(freq, local - offset) * 0.68 + phase(freq * 2.0, local - offset) * 0.12) / scale;
    }
    sample * env * velocity * gain
}

fn event_release_end(event: &NativeRenderedEvent) -> f64 {
    let base = match event.kind.as_str() {
        "kick" => 0.22,
        "snare" => 0.16,
        "hat" => 0.18,
        _ => event.duration.max(0.05) + 0.25,
    };
    event.time + base
}

fn find_scan_start(events: &[NativeRenderedEvent], seconds: f64) -> usize {
    events
        .iter()
        .position(|event| event_release_end(event) >= seconds)
        .unwrap_or(events.len())
}

fn track_gain(track: &NativeTrackControl, has_solo: bool) -> f64 {
    if track.mute || (has_solo && !track.solo) {
        return 0.0;
    }
    track.volume.clamp(0.0, 1.2)
}

fn pan_gains(pan: f32) -> (f32, f32) {
    let angle = (pan + 1.0) * std::f32::consts::FRAC_PI_4;
    (angle.cos(), angle.sin())
}

fn soft_limit(value: f32) -> f32 {
    value.tanh()
}

fn phase(freq: f32, seconds: f64) -> f32 {
    (std::f64::consts::TAU * freq as f64 * seconds).sin() as f32
}

fn saw(freq: f32, seconds: f64) -> f32 {
    let cycle = (freq as f64 * seconds).fract() as f32;
    cycle * 2.0 - 1.0
}

fn triangle(freq: f32, seconds: f64) -> f32 {
    let cycle = (freq as f64 * seconds).fract() as f32;
    4.0 * (cycle - 0.5).abs() - 1.0
}

fn note_envelope(local: f64, dur: f64, attack: f64, decay: f64, sustain: f32, release: f64) -> f32 {
    if local < attack {
        return (local / attack.max(0.0001)) as f32;
    }
    if local < attack + decay {
        let k = ((local - attack) / decay.max(0.0001)) as f32;
        return 1.0 + (sustain - 1.0) * k;
    }
    if local <= dur {
        return sustain;
    }
    if local <= dur + release {
        let k = ((local - dur) / release.max(0.0001)) as f32;
        return sustain * (1.0 - k).max(0.0);
    }
    0.0
}

fn midi_to_freq(midi: f64) -> f64 {
    440.0 * 2.0_f64.powf((midi - 69.0) / 12.0)
}

fn noise(event: &NativeRenderedEvent, local: f64, salt: u64) -> f32 {
    let sample = (local * 48_000.0) as u64;
    let mut hash = sample
        ^ salt.wrapping_mul(0x9E37_79B9_7F4A_7C15)
        ^ (event.step_seed() as u64).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    hash ^= hash >> 30;
    hash = hash.wrapping_mul(0xBF58_476D_1CE4_E5B9);
    hash ^= hash >> 27;
    hash = hash.wrapping_mul(0x94D0_49BB_1331_11EB);
    hash ^= hash >> 31;
    ((hash & 0xffff) as f32 / 32768.0) - 1.0
}

trait EventSeed {
    fn step_seed(&self) -> u32;
}

impl EventSeed for NativeRenderedEvent {
    fn step_seed(&self) -> u32 {
        let mut hash = 2166136261_u32;
        for byte in self.id.as_bytes() {
            hash ^= *byte as u32;
            hash = hash.wrapping_mul(16777619);
        }
        hash
    }
}

fn output_device_for_id(host: &cpal::Host, host_name: &str, id: Option<&str>) -> Option<cpal::Device> {
    let target = id?;
    let devices = host.output_devices().ok()?;
    for device in devices {
        let name = device_name(&device).ok()?;
        let device_id = format!("{}:output:{}", host_name, sanitize_id(&name));
        if device_id == target {
            return Some(device);
        }
    }
    None
}

fn device_name(device: &cpal::Device) -> Result<String, cpal::DeviceNameError> {
    device.description().map(|description| description.name().to_string())
}

fn sanitize_id(name: &str) -> String {
    name.chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch.to_ascii_lowercase() } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_pcm16_stereo_wav_assets() {
        let bytes = pcm16_wav(48_000, 2, &[16_384, -16_384, 8_192, -8_192]);

        let decoded = decode_pcm16_wav(&bytes).expect("wav should decode");

        assert_eq!(decoded.sample_rate, 48_000);
        assert_eq!(decoded.channels, 2);
        assert_eq!(decoded.frame_count, 2);
        assert!((decoded.samples[0] - 0.5).abs() < 0.001);
        assert!((decoded.samples[1] + 0.5).abs() < 0.001);
    }

    #[test]
    fn validates_cached_asset_metadata_before_playback() {
        let asset = NativeAudioAssetPayload {
            id: "asset".to_string(),
            name: "Stem.wav".to_string(),
            sample_rate: 44_100,
            channels: 2,
            duration_seconds: 0.5,
            bytes: pcm16_wav(48_000, 2, &[0, 0]),
        };

        let error = decode_payload_asset(&asset).expect_err("metadata mismatch should fail");

        assert!(error.contains("sample-rate metadata"));
    }

    #[test]
    fn renders_region_samples_with_source_offsets() {
        let asset = DecodedAudioAsset {
            sample_rate: 4,
            channels: 2,
            samples: vec![0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
            frame_count: 3,
        };
        let region = test_region("region", "asset", "bass", 0.0, 0.25, 0.5, 1.0, 0.0);

        let sample = render_region_sample(&region, &asset, 0.0).expect("region should sample");

        assert!((sample.0 - 0.3).abs() < 0.0001);
        assert!((sample.1 - 0.4).abs() < 0.0001);
    }

    #[test]
    fn mixes_cached_regions_with_pan_volume_and_position_updates() {
        let mut playback = playback_with_region(test_track("bass", 0.5, -1.0, false, false));

        let (left, right) = render_next_frame(&mut playback);

        assert!(left > 0.3 && left < 0.4);
        assert!(right.abs() < 0.0001);
        assert!((playback.position_seconds - 0.25).abs() < 0.0001);
        assert_eq!(playback.rendered_frame_count, 1);
    }

    #[test]
    fn mute_and_solo_rules_silence_cached_regions() {
        let mut muted = playback_with_region(test_track("bass", 1.0, 0.0, true, false));
        assert_eq!(render_next_frame(&mut muted), (0.0, 0.0));

        let mut unsoloed = playback_with_region(test_track("bass", 1.0, 0.0, false, false));
        unsoloed.has_solo = true;
        assert_eq!(render_next_frame(&mut unsoloed), (0.0, 0.0));
    }

    #[test]
    fn rejects_invalid_cached_regions() {
        let region = test_region("", "asset", "bass", 0.0, 0.0, 0.5, 1.0, 0.0);

        let error = validate_region(&region).expect_err("missing id should fail");

        assert!(error.contains("missing an id"));
    }

    fn playback_with_region(track: NativeTrackControl) -> PlaybackShared {
        let asset = DecodedAudioAsset {
            sample_rate: 4,
            channels: 2,
            samples: vec![1.0, 1.0, 1.0, 1.0],
            frame_count: 2,
        };
        PlaybackShared {
            project_title: Some("Test".to_string()),
            events: Vec::new(),
            assets: HashMap::from([("asset".to_string(), asset)]),
            regions: vec![test_region("region", "asset", "bass", 0.0, 0.0, 0.5, 1.0, 0.0)],
            tracks: HashMap::from([("bass".to_string(), track)]),
            has_solo: false,
            position_seconds: 0.0,
            sample_rate: 4,
            channels: 2,
            playing: true,
            rendered_frame_count: 0,
            scan_start_index: 0,
            generation: 1,
        }
    }

    fn test_track(id: &str, volume: f64, pan: f64, mute: bool, solo: bool) -> NativeTrackControl {
        NativeTrackControl {
            id: id.to_string(),
            volume,
            pan,
            mute,
            solo,
        }
    }

    fn test_region(
        id: &str,
        asset_id: &str,
        track_id: &str,
        start_time: f64,
        source_offset: f64,
        duration: f64,
        gain: f64,
        pan: f64,
    ) -> NativeAudioRegion {
        NativeAudioRegion {
            id: id.to_string(),
            asset_id: asset_id.to_string(),
            track_id: track_id.to_string(),
            start_time,
            source_offset,
            duration,
            gain,
            pan,
        }
    }

    fn pcm16_wav(sample_rate: u32, channels: u16, samples: &[i16]) -> Vec<u8> {
        let data_len = (samples.len() * 2) as u32;
        let byte_rate = sample_rate * channels as u32 * 2;
        let block_align = channels * 2;
        let mut bytes = Vec::new();
        bytes.extend_from_slice(b"RIFF");
        bytes.extend_from_slice(&(36 + data_len).to_le_bytes());
        bytes.extend_from_slice(b"WAVE");
        bytes.extend_from_slice(b"fmt ");
        bytes.extend_from_slice(&16_u32.to_le_bytes());
        bytes.extend_from_slice(&1_u16.to_le_bytes());
        bytes.extend_from_slice(&channels.to_le_bytes());
        bytes.extend_from_slice(&sample_rate.to_le_bytes());
        bytes.extend_from_slice(&byte_rate.to_le_bytes());
        bytes.extend_from_slice(&block_align.to_le_bytes());
        bytes.extend_from_slice(&16_u16.to_le_bytes());
        bytes.extend_from_slice(b"data");
        bytes.extend_from_slice(&data_len.to_le_bytes());
        for sample in samples {
            bytes.extend_from_slice(&sample.to_le_bytes());
        }
        bytes
    }
}
