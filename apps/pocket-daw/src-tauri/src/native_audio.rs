use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

type NativeAudioState = Mutex<NativeAudioRuntime>;
const CHORDSMITH_SIDECHAIN_ATTACK_SECONDS: f64 = 0.012;
const CHORDSMITH_SIDECHAIN_RELEASE_SECONDS: f64 = 0.22;
const CHORDSMITH_SIDECHAIN_DEPTH: f64 = 0.72;
const CHORDSMITH_SIDECHAIN_FLOOR: f64 = 0.18;
const CHORDSMITH_LOFI_TEXTURE_HISS_ATTACK_SECONDS: f64 = 0.018;
const CHORDSMITH_LOFI_TEXTURE_HISS_RELEASE_SECONDS: f64 = 0.2;
const CHORDSMITH_LOFI_TEXTURE_HISS_GAIN: f32 = 0.0055;
const CHORDSMITH_LOFI_TEXTURE_CRACKLE_THRESHOLD: f32 = 0.7;
const CHORDSMITH_LOFI_TEXTURE_CRACKLE_GAIN: f32 = 0.018;
const CHORDSMITH_LOFI_TEXTURE_CRACKLE_DECAY_SECONDS: f64 = 0.024;
const CHORDSMITH_LOFI_TEXTURE_CRACKLE_STOP_SECONDS: f64 = 0.028;

#[derive(Default)]
pub struct NativeAudioRuntime {
    stream: Option<cpal::Stream>,
    shared: Option<Arc<Mutex<PlaybackShared>>>,
    asset_cache: HashMap<String, DecodedAudioAsset>,
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
    #[serde(rename = "loop", default)]
    loop_region: Option<NativeLoopPayload>,
    #[serde(default)]
    metronome: Option<NativeMetronomePayload>,
    #[serde(default)]
    sidechain: Option<NativeSidechainPayload>,
    tracks: Vec<NativeTrackControl>,
    events: Vec<NativeRenderedEvent>,
    #[serde(rename = "fxChains", default)]
    fx_chains: Vec<NativeFxChainPayload>,
    #[serde(default)]
    assets: Vec<NativeAudioAssetPayload>,
    #[serde(default)]
    regions: Vec<NativeAudioRegion>,
}

#[derive(Clone, Deserialize)]
pub struct NativeLoopPayload {
    enabled: bool,
    #[serde(rename = "startSeconds")]
    start_seconds: f64,
    #[serde(rename = "endSeconds")]
    end_seconds: f64,
}

#[derive(Clone, Deserialize)]
pub struct NativeMetronomePayload {
    enabled: bool,
    #[serde(rename = "beatSeconds")]
    beat_seconds: f64,
    #[serde(rename = "timeSig")]
    time_sig: u32,
    volume: f64,
}

#[derive(Clone, Deserialize)]
pub struct NativeSidechainPayload {
    enabled: bool,
    amount: f64,
    #[serde(rename = "targetTrackId")]
    target_track_id: String,
    #[serde(rename = "triggerKind")]
    trigger_kind: String,
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
    #[serde(rename = "slideMidi")]
    slide_midi: Option<f64>,
    #[serde(rename = "slideOffset")]
    slide_offset: Option<f64>,
    #[serde(rename = "midiNotes", default)]
    midi_notes: Vec<f64>,
    velocity: f64,
    step: Option<f64>,
    pan: Option<f64>,
    instrument: Option<String>,
    #[serde(rename = "drumKit")]
    drum_kit: Option<String>,
    #[serde(rename = "bassTone")]
    bass_tone: Option<String>,
    #[serde(rename = "audioProfile")]
    audio_profile: Option<String>,
    #[serde(rename = "lofiPreset")]
    lofi_preset: Option<String>,
    #[serde(rename = "lofiTexture")]
    lofi_texture: Option<NativeLofiTexture>,
    #[serde(rename = "chipPreset")]
    chip_preset: Option<String>,
    #[serde(rename = "chipTexture")]
    #[allow(dead_code)]
    chip_texture: Option<Value>,
    accent: Option<bool>,
    articulation: Option<String>,
    direction: Option<String>,
    #[serde(rename = "drumLane")]
    drum_lane: Option<String>,
}

#[derive(Clone, Deserialize)]
pub struct NativeLofiTexture {
    #[serde(default)]
    enabled: bool,
    #[serde(rename = "vinylCrackle", default)]
    vinyl_crackle: f64,
    #[serde(rename = "tapeHiss", default)]
    tape_hiss: f64,
    #[serde(default)]
    warmth: f64,
    #[serde(rename = "lowPassAge", default)]
    low_pass_age: f64,
    #[serde(rename = "bitCrush", default)]
    bit_crush: f64,
}

#[derive(Clone, Deserialize)]
pub struct NativeTrackControl {
    id: String,
    #[serde(rename = "fxChainId")]
    fx_chain_id: Option<String>,
    #[serde(rename = "isReturn", default)]
    is_return: bool,
    #[serde(default)]
    sends: Vec<NativeTrackSend>,
    volume: f64,
    pan: f64,
    mute: bool,
    solo: bool,
}

#[derive(Clone, Deserialize)]
pub struct NativeTrackSend {
    #[serde(rename = "returnTrackId")]
    return_track_id: String,
    level: f64,
}

#[derive(Clone, Deserialize)]
pub struct NativeFxChainPayload {
    id: String,
    #[serde(rename = "ownerTrackId")]
    owner_track_id: Option<String>,
    #[serde(default)]
    metadata: HashMap<String, Value>,
    #[serde(default)]
    slots: Vec<NativeFxSlotPayload>,
}

#[derive(Clone, Deserialize)]
pub struct NativeFxSlotPayload {
    #[allow(dead_code)]
    id: String,
    #[serde(rename = "type")]
    slot_type: String,
    enabled: bool,
    #[serde(default)]
    parameters: HashMap<String, Value>,
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
    #[serde(default)]
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
    #[serde(rename = "fadeIn", default)]
    fade_in: f64,
    #[serde(rename = "fadeOut", default)]
    fade_out: f64,
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

struct PlaybackShared {
    project_title: Option<String>,
    events: Vec<NativeRenderedEvent>,
    assets: HashMap<String, DecodedAudioAsset>,
    regions: Vec<NativeAudioRegion>,
    tracks: HashMap<String, NativeTrackControl>,
    fx: NativeFxRuntime,
    loop_region: Option<NativeLoopPayload>,
    metronome: Option<NativeMetronomePayload>,
    sidechain: Option<NativeSidechainPayload>,
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

#[derive(Default)]
struct NativeFxRuntime {
    track_chains: HashMap<String, NativeFxChainState>,
    drum_lane_chains: HashMap<String, NativeFxChainState>,
    master_chain: Option<NativeFxChainState>,
}

struct NativeFxChainState {
    slots: Vec<NativeFxSlotState>,
}

struct NativeFxSlotState {
    filters: Vec<BiquadFilter>,
    processor: NativeFxProcessor,
}

enum NativeFxProcessor {
    None,
    UtilityGain {
        gain: f32,
    },
    NoiseGate {
        threshold: f32,
        reduction: f32,
    },
    Dynamics {
        threshold: f32,
        ratio: f32,
    },
    Saturation {
        drive: f32,
        mix: f32,
    },
    Bitcrusher {
        steps: f32,
        mix: f32,
    },
    Delay {
        buffer_l: Vec<f32>,
        buffer_r: Vec<f32>,
        index: usize,
        feedback: f32,
        mix: f32,
        ping_pong: bool,
    },
    Reverb {
        buffer_l: Vec<f32>,
        buffer_r: Vec<f32>,
        index: usize,
        feedback: f32,
        mix: f32,
    },
    ModDelay {
        buffer_l: Vec<f32>,
        buffer_r: Vec<f32>,
        index: usize,
        base_samples: usize,
        depth_samples: usize,
        rate: f32,
        phase: f32,
        sample_rate: f32,
        mix: f32,
        invert_wet: bool,
    },
    TremoloAutopan {
        rate: f32,
        depth: f32,
        phase: f32,
        sample_rate: f32,
    },
}

#[derive(Clone, Debug)]
struct BiquadFilter {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
    z1_l: f32,
    z2_l: f32,
    z1_r: f32,
    z2_r: f32,
}

#[tauri::command]
pub fn native_audio_status(state: tauri::State<'_, NativeAudioState>) -> NativeAudioStatus {
    match state.lock() {
        Ok(runtime) => runtime.status(),
        Err(_) => NativeAudioStatus::unavailable(Some(
            "Native audio runtime lock was poisoned.".to_string(),
        )),
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
pub fn native_audio_pause(
    state: tauri::State<'_, NativeAudioState>,
) -> Result<NativeAudioStatus, String> {
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
pub fn native_audio_resume(
    state: tauri::State<'_, NativeAudioState>,
) -> Result<NativeAudioStatus, String> {
    let runtime = state
        .lock()
        .map_err(|_| "Native audio runtime lock was poisoned.".to_string())?;
    if let Some(shared) = &runtime.shared {
        if let Ok(mut playback) = shared.lock() {
            playback.playing = true;
            apply_loop_wrap(&mut playback);
            playback.scan_start_index =
                find_scan_start(&playback.events, playback.position_seconds);
        }
    }
    Ok(runtime.status())
}

#[tauri::command]
pub fn native_audio_seek(
    seconds: f64,
    state: tauri::State<'_, NativeAudioState>,
) -> Result<NativeAudioStatus, String> {
    let runtime = state
        .lock()
        .map_err(|_| "Native audio runtime lock was poisoned.".to_string())?;
    if let Some(shared) = &runtime.shared {
        if let Ok(mut playback) = shared.lock() {
            playback.position_seconds = seconds.max(0.0);
            apply_loop_wrap(&mut playback);
            playback.scan_start_index =
                find_scan_start(&playback.events, playback.position_seconds);
        }
    }
    Ok(runtime.status())
}

#[tauri::command]
pub fn native_audio_stop(
    state: tauri::State<'_, NativeAudioState>,
) -> Result<NativeAudioStatus, String> {
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
        let device_name =
            device_name(&device).unwrap_or_else(|_| "Default native output".to_string());
        let supported_config = device
            .default_output_config()
            .map_err(|err| format!("Could not read default output config: {}", err))?;
        let sample_format = supported_config.sample_format();
        let config = supported_config.config();
        let channels = config.channels.max(1);
        let sample_rate = config.sample_rate;
        let mut events = payload.events;
        events.sort_by(|a, b| {
            a.time
                .partial_cmp(&b.time)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        let mut regions = payload.regions;
        regions.sort_by(|a, b| {
            a.start_time
                .partial_cmp(&b.start_time)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        for region in &regions {
            validate_region(region)?;
        }
        let mut assets = HashMap::new();
        for asset in payload.assets {
            let decoded = self.decode_or_reuse_asset(&asset)?;
            assets.insert(asset.id.clone(), decoded);
        }
        let tracks = payload
            .tracks
            .into_iter()
            .map(|track| (track.id.clone(), track))
            .collect::<HashMap<_, _>>();
        let fx = build_native_fx_runtime(payload.fx_chains, &tracks, sample_rate as f32);
        let shared = Arc::new(Mutex::new(PlaybackShared {
            project_title: payload.project_title,
            events,
            assets,
            regions,
            has_solo: tracks.values().any(|track| track.solo),
            tracks,
            fx,
            loop_region: sanitize_loop_region(payload.loop_region),
            metronome: sanitize_metronome(payload.metronome),
            sidechain: payload.sidechain,
            position_seconds: payload.start_seconds.max(0.0),
            sample_rate,
            channels,
            playing: true,
            rendered_frame_count: 0,
            scan_start_index: 0,
            generation: self.generation,
        }));
        if let Ok(mut playback) = shared.lock() {
            apply_loop_wrap(&mut playback);
            playback.scan_start_index =
                find_scan_start(&playback.events, playback.position_seconds);
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
            other => {
                return Err(format!(
                    "Unsupported native output sample format: {:?}",
                    other
                ))
            }
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

    fn decode_or_reuse_asset(
        &mut self,
        asset: &NativeAudioAssetPayload,
    ) -> Result<DecodedAudioAsset, String> {
        if asset.bytes.is_empty() {
            let Some(decoded) = self.asset_cache.get(&asset.id) else {
                return Err(format!(
                    "Native cached asset {} was requested without bytes before it was decoded.",
                    asset.id
                ));
            };
            validate_asset_metadata(asset, decoded)?;
            return Ok(decoded.clone());
        }

        let decoded = decode_payload_asset(asset)?;
        self.asset_cache.insert(asset.id.clone(), decoded.clone());
        Ok(decoded)
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
    (((value.clamp(-1.0, 1.0) * 0.5 + 0.5) * u16::MAX as f32).round() as i32)
        .clamp(0, u16::MAX as i32) as u16
}

fn add_track_mix(
    track_mixes: &mut HashMap<String, (f32, f32)>,
    track_id: &str,
    left: f32,
    right: f32,
) {
    let entry = track_mixes
        .entry(track_id.to_string())
        .or_insert((0.0, 0.0));
    entry.0 += left;
    entry.1 += right;
}

fn render_next_frame(playback: &mut PlaybackShared) -> (f32, f32) {
    if !playback.playing {
        return (0.0, 0.0);
    }

    apply_loop_wrap(playback);
    let t = playback.position_seconds;
    while playback.scan_start_index < playback.events.len()
        && event_release_end(&playback.events[playback.scan_start_index]) < t
    {
        playback.scan_start_index += 1;
    }

    let mut track_mixes: HashMap<String, (f32, f32)> = HashMap::new();
    let mut active_count = 0usize;

    for region in playback.regions.clone() {
        if region.start_time > t {
            break;
        }
        if region.start_time + region.duration < t {
            continue;
        }
        let Some(track) = playback.tracks.get(&region.track_id).cloned() else {
            continue;
        };
        let track_gain = track_gain(&track, playback.has_solo);
        if track_gain <= 0.0001 {
            continue;
        }
        let Some(asset) = playback.assets.get(&region.asset_id) else {
            continue;
        };
        let Some((asset_left, asset_right)) = render_region_sample(&region, asset, t) else {
            continue;
        };
        active_count += 1;
        if active_count > 96 {
            break;
        }
        let pan = (track.pan + region.pan).clamp(-1.0, 1.0) as f32;
        let (pan_left, pan_right) = pan_gains(pan);
        let gain = (track_gain * region.gain.clamp(0.0, 1.4)) as f32;
        add_track_mix(
            &mut track_mixes,
            &region.track_id,
            asset_left * gain * pan_left,
            asset_right * gain * pan_right,
        );
    }

    for event in playback
        .events
        .iter()
        .skip(playback.scan_start_index)
        .cloned()
    {
        if event.time > t {
            break;
        }
        if event_release_end(&event) < t {
            continue;
        }
        let Some(track) = playback.tracks.get(&event.track_id).cloned() else {
            continue;
        };
        let track_gain = track_gain(&track, playback.has_solo);
        if track_gain <= 0.0001 {
            continue;
        }
        let sample = render_event_sample(&event, t) * track_gain as f32;
        if sample.abs() <= 0.000001 {
            continue;
        }
        active_count += 1;
        if active_count > 96 {
            break;
        }
        let pan = (track.pan + event.pan.unwrap_or(0.0)).clamp(-1.0, 1.0) as f32;
        let (pan_left, pan_right) = pan_gains(pan);
        let mut lane_left = sample * pan_left;
        let mut lane_right = sample * pan_right;
        if let Some(lane) = &event.drum_lane {
            if let Some(chain) = playback.fx.drum_lane_chains.get_mut(lane) {
                (lane_left, lane_right) = chain.process(lane_left, lane_right);
            }
        }
        add_track_mix(&mut track_mixes, &event.track_id, lane_left, lane_right);
    }

    let mut left = 0.0_f32;
    let mut right = 0.0_f32;
    let mut return_mixes: HashMap<String, (f32, f32)> = HashMap::new();
    for (track_id, (mut track_left, mut track_right)) in track_mixes {
        let is_return = playback
            .tracks
            .get(&track_id)
            .map(|track| track.is_return)
            .unwrap_or(false);
        if is_return {
            add_track_mix(&mut return_mixes, &track_id, track_left, track_right);
            continue;
        }
        if let Some(chain) = playback.fx.track_chains.get_mut(&track_id) {
            (track_left, track_right) = chain.process(track_left, track_right);
        }
        let sidechain_gain = sidechain_gain(playback, &track_id, t);
        track_left *= sidechain_gain;
        track_right *= sidechain_gain;
        route_track_sends(
            playback,
            &track_id,
            track_left,
            track_right,
            &mut return_mixes,
        );
        left += track_left;
        right += track_right;
    }
    for (track_id, (mut track_left, mut track_right)) in return_mixes {
        if let Some(chain) = playback.fx.track_chains.get_mut(&track_id) {
            (track_left, track_right) = chain.process(track_left, track_right);
        }
        let sidechain_gain = sidechain_gain(playback, &track_id, t);
        track_left *= sidechain_gain;
        track_right *= sidechain_gain;
        left += track_left;
        right += track_right;
    }
    let metronome = render_metronome_sample(playback, t);
    left += metronome;
    right += metronome;
    if let Some(chain) = &mut playback.fx.master_chain {
        (left, right) = chain.process(left, right);
    }
    let master = master_gain(playback);
    playback.position_seconds += 1.0 / playback.sample_rate.max(1) as f64;
    apply_loop_wrap(playback);
    playback.rendered_frame_count = playback.rendered_frame_count.saturating_add(1);
    (
        soft_limit(left * 0.72 * master),
        soft_limit(right * 0.72 * master),
    )
}

fn sanitize_loop_region(loop_region: Option<NativeLoopPayload>) -> Option<NativeLoopPayload> {
    let region = loop_region?;
    if !region.enabled {
        return None;
    }
    let start = region.start_seconds.max(0.0);
    let end = region.end_seconds.max(0.0);
    if !start.is_finite() || !end.is_finite() || end <= start {
        return None;
    }
    Some(NativeLoopPayload {
        enabled: true,
        start_seconds: start,
        end_seconds: end,
    })
}

fn sanitize_metronome(metronome: Option<NativeMetronomePayload>) -> Option<NativeMetronomePayload> {
    let metro = metronome?;
    if !metro.enabled || !metro.beat_seconds.is_finite() || metro.beat_seconds <= 0.0 {
        return None;
    }
    Some(NativeMetronomePayload {
        enabled: true,
        beat_seconds: metro.beat_seconds.clamp(0.05, 4.0),
        time_sig: metro.time_sig.clamp(1, 16),
        volume: metro.volume.clamp(0.0, 1.0),
    })
}

fn render_metronome_sample(playback: &PlaybackShared, t: f64) -> f32 {
    let Some(metronome) = playback.metronome.as_ref() else {
        return 0.0;
    };
    if !metronome.enabled || metronome.volume <= 0.0001 {
        return 0.0;
    }
    let beat_seconds = metronome.beat_seconds.max(0.001);
    let beat_index = (t / beat_seconds).floor().max(0.0) as u64;
    let beat_time = beat_index as f64 * beat_seconds;
    let local = t - beat_time;
    if !(0.0..=0.055).contains(&local) {
        return 0.0;
    }
    let accented = beat_index.is_multiple_of(metronome.time_sig.max(1) as u64);
    let freq = if accented { 1760.0 } else { 1120.0 };
    let env = (-local * if accented { 95.0 } else { 115.0 }).exp() as f32;
    let gain = metronome.volume as f32 * if accented { 0.34 } else { 0.24 };
    phase(freq, local) * env * gain
}

fn apply_loop_wrap(playback: &mut PlaybackShared) {
    let Some(loop_region) = playback.loop_region.as_ref() else {
        return;
    };
    if !loop_region.enabled || loop_region.end_seconds <= loop_region.start_seconds {
        return;
    }
    if playback.position_seconds < loop_region.end_seconds {
        return;
    }
    let length = loop_region.end_seconds - loop_region.start_seconds;
    if length <= 0.0 || !length.is_finite() {
        return;
    }
    let overflow = (playback.position_seconds - loop_region.end_seconds).rem_euclid(length);
    playback.position_seconds = loop_region.start_seconds + overflow;
    playback.scan_start_index = find_scan_start(&playback.events, playback.position_seconds);
}

fn route_track_sends(
    playback: &PlaybackShared,
    track_id: &str,
    left: f32,
    right: f32,
    return_mixes: &mut HashMap<String, (f32, f32)>,
) {
    let Some(track) = playback.tracks.get(track_id) else {
        return;
    };
    for send in &track.sends {
        if send.return_track_id == track_id {
            continue;
        }
        let Some(return_track) = playback.tracks.get(&send.return_track_id) else {
            continue;
        };
        if !return_track.is_return {
            continue;
        }
        let return_gain = track_gain(return_track, playback.has_solo);
        if return_gain <= 0.0001 {
            continue;
        }
        let level = send.level.clamp(0.0, 1.0) as f32;
        if level <= 0.0001 {
            continue;
        }
        let gain = level * return_gain as f32;
        add_track_mix(
            return_mixes,
            &send.return_track_id,
            left * gain,
            right * gain,
        );
    }
}

fn sidechain_gain(playback: &PlaybackShared, track_id: &str, t: f64) -> f32 {
    let Some(sidechain) = playback.sidechain.as_ref() else {
        return 1.0;
    };
    if !sidechain.enabled || sidechain.target_track_id != track_id {
        return 1.0;
    }
    let amount = sidechain.amount.clamp(0.0, 1.0);
    if amount <= 0.0001 {
        return 1.0;
    }
    let mut gain = 1.0_f64;
    for event in playback.events.iter().rev() {
        if event.time > t {
            continue;
        }
        if t - event.time > CHORDSMITH_SIDECHAIN_RELEASE_SECONDS {
            break;
        }
        if event.kind != sidechain.trigger_kind {
            continue;
        }
        let Some(trigger_track) = playback.tracks.get(&event.track_id) else {
            continue;
        };
        if track_gain(trigger_track, playback.has_solo) <= 0.0001 {
            continue;
        }
        gain = gain.min(chordsmith_sidechain_gain_at(amount, t - event.time));
    }
    gain as f32
}

fn chordsmith_sidechain_gain_at(amount: f64, elapsed: f64) -> f64 {
    if !(0.0..=CHORDSMITH_SIDECHAIN_RELEASE_SECONDS).contains(&elapsed) {
        return 1.0;
    }
    let duck =
        (1.0 - amount.clamp(0.0, 1.0) * CHORDSMITH_SIDECHAIN_DEPTH).max(CHORDSMITH_SIDECHAIN_FLOOR);
    if elapsed <= CHORDSMITH_SIDECHAIN_ATTACK_SECONDS {
        return 1.0 + (duck - 1.0) * (elapsed / CHORDSMITH_SIDECHAIN_ATTACK_SECONDS);
    }
    let release_progress = ((elapsed - CHORDSMITH_SIDECHAIN_ATTACK_SECONDS)
        / (CHORDSMITH_SIDECHAIN_RELEASE_SECONDS - CHORDSMITH_SIDECHAIN_ATTACK_SECONDS))
        .clamp(0.0, 1.0);
    duck * (1.0 / duck).powf(release_progress)
}

fn build_native_fx_runtime(
    chains: Vec<NativeFxChainPayload>,
    tracks: &HashMap<String, NativeTrackControl>,
    sample_rate: f32,
) -> NativeFxRuntime {
    let mut runtime = NativeFxRuntime::default();
    let mut chain_states = chains
        .into_iter()
        .map(|chain| {
            let state = NativeFxChainState::from_payload(&chain, sample_rate);
            (chain, state)
        })
        .collect::<Vec<_>>();

    for (chain, state) in chain_states.drain(..) {
        if state.slots.is_empty() {
            continue;
        }
        if chain.owner_track_id.as_deref() == Some("master") {
            runtime.master_chain = Some(state);
            continue;
        }
        if let Some(Value::String(lane_id)) = chain.metadata.get("drumLaneId") {
            runtime.drum_lane_chains.insert(lane_id.clone(), state);
            continue;
        }
        if let Some(owner) = chain.owner_track_id {
            runtime.track_chains.insert(owner, state);
            continue;
        }
        for (track_id, track) in tracks {
            if track.fx_chain_id.as_deref() == Some(chain.id.as_str()) {
                runtime.track_chains.insert(track_id.clone(), state);
                break;
            }
        }
    }

    runtime
}

impl NativeFxChainState {
    fn from_payload(chain: &NativeFxChainPayload, sample_rate: f32) -> Self {
        Self {
            slots: chain
                .slots
                .iter()
                .filter(|slot| slot.enabled)
                .filter_map(|slot| NativeFxSlotState::from_payload(slot, sample_rate))
                .collect(),
        }
    }

    fn process(&mut self, mut left: f32, mut right: f32) -> (f32, f32) {
        for slot in &mut self.slots {
            (left, right) = slot.process(left, right);
        }
        (left, right)
    }
}

impl NativeFxSlotState {
    fn from_payload(slot: &NativeFxSlotPayload, sample_rate: f32) -> Option<Self> {
        let filters = filters_for_slot(slot, sample_rate);
        let processor = processor_for_slot(slot, sample_rate);
        if filters.is_empty() && matches!(processor, NativeFxProcessor::None) {
            None
        } else {
            Some(Self { filters, processor })
        }
    }

    fn process(&mut self, mut left: f32, mut right: f32) -> (f32, f32) {
        for filter in &mut self.filters {
            (left, right) = filter.process(left, right);
        }
        self.processor.process(left, right)
    }
}

impl NativeFxProcessor {
    fn process(&mut self, left: f32, right: f32) -> (f32, f32) {
        match self {
            NativeFxProcessor::None => (left, right),
            NativeFxProcessor::UtilityGain { gain } => (left * *gain, right * *gain),
            NativeFxProcessor::NoiseGate {
                threshold,
                reduction,
            } => (
                gate_sample(left, *threshold, *reduction),
                gate_sample(right, *threshold, *reduction),
            ),
            NativeFxProcessor::Dynamics { threshold, ratio } => (
                dynamics_sample(left, *threshold, *ratio),
                dynamics_sample(right, *threshold, *ratio),
            ),
            NativeFxProcessor::Saturation { drive, mix } => (
                wet_dry_sample(left, saturate_sample(left, *drive), *mix),
                wet_dry_sample(right, saturate_sample(right, *drive), *mix),
            ),
            NativeFxProcessor::Bitcrusher { steps, mix } => (
                wet_dry_sample(left, bitcrush_sample(left, *steps), *mix),
                wet_dry_sample(right, bitcrush_sample(right, *steps), *mix),
            ),
            NativeFxProcessor::Delay {
                buffer_l,
                buffer_r,
                index,
                feedback,
                mix,
                ping_pong,
            } => process_delay(
                left, right, buffer_l, buffer_r, index, *feedback, *mix, *ping_pong,
            ),
            NativeFxProcessor::Reverb {
                buffer_l,
                buffer_r,
                index,
                feedback,
                mix,
            } => process_reverb(left, right, buffer_l, buffer_r, index, *feedback, *mix),
            NativeFxProcessor::ModDelay {
                buffer_l,
                buffer_r,
                index,
                base_samples,
                depth_samples,
                rate,
                phase,
                sample_rate,
                mix,
                invert_wet,
            } => process_mod_delay(
                left,
                right,
                buffer_l,
                buffer_r,
                index,
                *base_samples,
                *depth_samples,
                *rate,
                phase,
                *sample_rate,
                *mix,
                *invert_wet,
            ),
            NativeFxProcessor::TremoloAutopan {
                rate,
                depth,
                phase,
                sample_rate,
            } => process_tremolo(left, right, *rate, *depth, phase, *sample_rate),
        }
    }
}

fn filters_for_slot(slot: &NativeFxSlotPayload, sample_rate: f32) -> Vec<BiquadFilter> {
    match slot.slot_type.as_str() {
        "high-pass" => vec![BiquadFilter::highpass(
            sample_rate,
            param(&slot.parameters, "frequency", 80.0).clamp(20.0, 20_000.0),
            param(&slot.parameters, "q", 0.7).clamp(0.1, 8.0),
        )],
        "low-pass" => vec![BiquadFilter::lowpass(
            sample_rate,
            param(&slot.parameters, "frequency", 12_000.0).clamp(20.0, 20_000.0),
            param(&slot.parameters, "q", 0.7).clamp(0.1, 8.0),
        )],
        "three-band-eq" => vec![
            BiquadFilter::shelf(
                sample_rate,
                "lowshelf",
                180.0,
                param(&slot.parameters, "lowGain", 0.0).clamp(-18.0, 18.0),
            ),
            BiquadFilter::peaking(
                sample_rate,
                param(&slot.parameters, "midFrequency", 1200.0).clamp(80.0, 12_000.0),
                1.0,
                param(&slot.parameters, "midGain", 0.0).clamp(-18.0, 18.0),
            ),
            BiquadFilter::shelf(
                sample_rate,
                "highshelf",
                5200.0,
                param(&slot.parameters, "highGain", 0.0).clamp(-18.0, 18.0),
            ),
        ],
        "parametric-eq" => parametric_eq_filters(&slot.parameters, sample_rate),
        _ => Vec::new(),
    }
}

fn processor_for_slot(slot: &NativeFxSlotPayload, sample_rate: f32) -> NativeFxProcessor {
    match slot.slot_type.as_str() {
        "utility-gain" => NativeFxProcessor::UtilityGain {
            gain: param(&slot.parameters, "gain", 1.0).clamp(0.0, 4.0),
        },
        "noise-gate" => NativeFxProcessor::NoiseGate {
            threshold: db_to_amp(param(&slot.parameters, "threshold", -48.0).clamp(-96.0, 0.0)),
            reduction: param(&slot.parameters, "reduction", 0.18).clamp(0.0, 1.0),
        },
        "compressor" => NativeFxProcessor::Dynamics {
            threshold: db_to_amp(param(&slot.parameters, "threshold", -20.0).clamp(-80.0, 0.0)),
            ratio: param(&slot.parameters, "ratio", 3.0).clamp(1.0, 40.0),
        },
        "limiter" => NativeFxProcessor::Dynamics {
            threshold: db_to_amp(param(&slot.parameters, "threshold", -4.0).clamp(-40.0, 0.0)),
            ratio: param(&slot.parameters, "ratio", 18.0).clamp(1.0, 80.0),
        },
        "saturation" => NativeFxProcessor::Saturation {
            drive: param(&slot.parameters, "drive", 1.8).clamp(0.1, 12.0),
            mix: param(&slot.parameters, "mix", 0.65).clamp(0.0, 1.0),
        },
        "bitcrusher" => {
            let bits = param(&slot.parameters, "bits", 8.0)
                .round()
                .clamp(2.0, 16.0);
            NativeFxProcessor::Bitcrusher {
                steps: 2.0_f32.powf(bits),
                mix: param(&slot.parameters, "mix", 0.45).clamp(0.0, 1.0),
            }
        }
        "delay" | "ping-pong-delay" => {
            let delay_seconds = param(
                &slot.parameters,
                "time",
                if slot.slot_type == "ping-pong-delay" {
                    0.28
                } else {
                    0.22
                },
            )
            .clamp(0.01, 2.0);
            let delay_samples = ((delay_seconds * sample_rate).round() as usize).max(1);
            NativeFxProcessor::Delay {
                buffer_l: vec![0.0; delay_samples],
                buffer_r: vec![0.0; delay_samples],
                index: 0,
                feedback: param(&slot.parameters, "feedback", 0.3).clamp(0.0, 0.82),
                mix: param(&slot.parameters, "mix", 0.3).clamp(0.0, 1.0),
                ping_pong: slot.slot_type == "ping-pong-delay",
            }
        }
        "reverb" => {
            let decay = param(&slot.parameters, "decay", 1.8).clamp(0.2, 6.0);
            let delay_samples = ((0.071 * sample_rate).round() as usize).max(1);
            NativeFxProcessor::Reverb {
                buffer_l: vec![0.0; delay_samples],
                buffer_r: vec![
                    0.0;
                    delay_samples + ((0.011 * sample_rate).round() as usize).max(1)
                ],
                index: 0,
                feedback: (0.38 + decay * 0.08).clamp(0.4, 0.86),
                mix: param(&slot.parameters, "mix", 0.24).clamp(0.0, 1.0),
            }
        }
        "chorus" | "phaser" => {
            let base_seconds = if slot.slot_type == "chorus" {
                0.018
            } else {
                0.006
            };
            let max_depth_seconds = if slot.slot_type == "chorus" {
                param(&slot.parameters, "depth", 0.012).clamp(0.001, 0.05)
            } else {
                (param(&slot.parameters, "depth", 650.0) / 100000.0).clamp(0.001, 0.03)
            };
            let max_samples =
                (((base_seconds + max_depth_seconds) * sample_rate).ceil() as usize + 2).max(4);
            NativeFxProcessor::ModDelay {
                buffer_l: vec![0.0; max_samples],
                buffer_r: vec![0.0; max_samples],
                index: 0,
                base_samples: (base_seconds * sample_rate).round() as usize,
                depth_samples: (max_depth_seconds * sample_rate).round() as usize,
                rate: param(
                    &slot.parameters,
                    "rate",
                    if slot.slot_type == "chorus" {
                        0.8
                    } else {
                        0.45
                    },
                )
                .clamp(0.01, 20.0),
                phase: 0.0,
                sample_rate,
                mix: param(&slot.parameters, "mix", 0.34).clamp(0.0, 1.0),
                invert_wet: slot.slot_type == "phaser",
            }
        }
        "tremolo-autopan" => NativeFxProcessor::TremoloAutopan {
            rate: param(&slot.parameters, "rate", 4.0).clamp(0.01, 30.0),
            depth: param(&slot.parameters, "depth", 0.38).clamp(0.0, 0.9),
            phase: 0.0,
            sample_rate,
        },
        _ => NativeFxProcessor::None,
    }
}

fn gate_sample(sample: f32, threshold: f32, reduction: f32) -> f32 {
    if sample.abs() < threshold {
        sample * reduction
    } else {
        sample
    }
}

fn dynamics_sample(sample: f32, threshold: f32, ratio: f32) -> f32 {
    let sign = sample.signum();
    let amp = sample.abs();
    if amp <= threshold || threshold <= 0.0 {
        sample
    } else {
        sign * (threshold + (amp - threshold) / ratio.max(1.0))
    }
}

fn saturate_sample(sample: f32, drive: f32) -> f32 {
    (sample * drive.max(0.1)).tanh()
}

fn bitcrush_sample(sample: f32, steps: f32) -> f32 {
    (sample * steps).round() / steps.max(2.0)
}

fn wet_dry_sample(dry: f32, wet: f32, mix: f32) -> f32 {
    let safe_mix = mix.clamp(0.0, 1.0);
    dry * (1.0 - safe_mix) + wet * safe_mix
}

fn db_to_amp(db: f32) -> f32 {
    10.0_f32.powf(db / 20.0)
}

#[allow(clippy::too_many_arguments)]
fn process_delay(
    left: f32,
    right: f32,
    buffer_l: &mut [f32],
    buffer_r: &mut [f32],
    index: &mut usize,
    feedback: f32,
    mix: f32,
    ping_pong: bool,
) -> (f32, f32) {
    if buffer_l.is_empty() || buffer_r.is_empty() {
        return (left, right);
    }
    let i_l = *index % buffer_l.len();
    let i_r = *index % buffer_r.len();
    let wet_l = buffer_l[i_l];
    let wet_r = buffer_r[i_r];
    if ping_pong {
        buffer_l[i_l] = left + wet_r * feedback;
        buffer_r[i_r] = right + wet_l * feedback;
    } else {
        buffer_l[i_l] = left + wet_l * feedback;
        buffer_r[i_r] = right + wet_r * feedback;
    }
    *index = index.saturating_add(1);
    (
        wet_dry_sample(left, wet_l, mix),
        wet_dry_sample(right, wet_r, mix),
    )
}

fn process_reverb(
    left: f32,
    right: f32,
    buffer_l: &mut [f32],
    buffer_r: &mut [f32],
    index: &mut usize,
    feedback: f32,
    mix: f32,
) -> (f32, f32) {
    if buffer_l.is_empty() || buffer_r.is_empty() {
        return (left, right);
    }
    let i_l = *index % buffer_l.len();
    let i_r = *index % buffer_r.len();
    let wet_l = buffer_l[i_l];
    let wet_r = buffer_r[i_r];
    let cross = (wet_l + wet_r) * 0.22;
    buffer_l[i_l] = left + (wet_l * 0.78 + cross) * feedback;
    buffer_r[i_r] = right + (wet_r * 0.78 + cross) * feedback;
    *index = index.saturating_add(1);
    (
        wet_dry_sample(left, wet_l, mix),
        wet_dry_sample(right, wet_r, mix),
    )
}

#[allow(clippy::too_many_arguments)]
fn process_mod_delay(
    left: f32,
    right: f32,
    buffer_l: &mut [f32],
    buffer_r: &mut [f32],
    index: &mut usize,
    base_samples: usize,
    depth_samples: usize,
    rate: f32,
    phase: &mut f32,
    sample_rate: f32,
    mix: f32,
    invert_wet: bool,
) -> (f32, f32) {
    if buffer_l.is_empty() || buffer_r.is_empty() {
        return (left, right);
    }
    let i = *index % buffer_l.len();
    buffer_l[i] = left;
    buffer_r[i] = right;
    let lfo = phase.sin() * 0.5 + 0.5;
    let delay = (base_samples + (depth_samples as f32 * lfo).round() as usize)
        .min(buffer_l.len().saturating_sub(1));
    let read = (i + buffer_l.len() - delay) % buffer_l.len();
    let mut wet_l = buffer_l[read];
    let mut wet_r = buffer_r[read];
    if invert_wet {
        wet_l = -wet_l;
        wet_r = -wet_r;
    }
    *index = index.saturating_add(1);
    *phase = (*phase + std::f32::consts::TAU * rate / sample_rate.max(1.0)) % std::f32::consts::TAU;
    (
        wet_dry_sample(left, wet_l, mix),
        wet_dry_sample(right, wet_r, mix),
    )
}

fn process_tremolo(
    left: f32,
    right: f32,
    rate: f32,
    depth: f32,
    phase: &mut f32,
    sample_rate: f32,
) -> (f32, f32) {
    let lfo = phase.sin() * 0.5 + 0.5;
    let gain = 1.0 - depth * lfo;
    *phase = (*phase + std::f32::consts::TAU * rate / sample_rate.max(1.0)) % std::f32::consts::TAU;
    (left * gain, right * gain)
}

fn param(params: &HashMap<String, Value>, key: &str, fallback: f32) -> f32 {
    params
        .get(key)
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite())
        .map(|value| value as f32)
        .unwrap_or(fallback)
}

fn bool_param(params: &HashMap<String, Value>, key: &str, fallback: bool) -> bool {
    params.get(key).and_then(Value::as_bool).unwrap_or(fallback)
}

impl BiquadFilter {
    fn highpass(sample_rate: f32, freq: f32, q: f32) -> Self {
        let (_omega, sin, cos) = biquad_angles(sample_rate, freq);
        let alpha = sin / (2.0 * q.max(0.001));
        Self::normalized(
            (1.0 + cos) * 0.5,
            -(1.0 + cos),
            (1.0 + cos) * 0.5,
            1.0 + alpha,
            -2.0 * cos,
            1.0 - alpha,
        )
    }

    fn lowpass(sample_rate: f32, freq: f32, q: f32) -> Self {
        let (_omega, sin, cos) = biquad_angles(sample_rate, freq);
        let alpha = sin / (2.0 * q.max(0.001));
        Self::normalized(
            (1.0 - cos) * 0.5,
            1.0 - cos,
            (1.0 - cos) * 0.5,
            1.0 + alpha,
            -2.0 * cos,
            1.0 - alpha,
        )
    }

    fn peaking(sample_rate: f32, freq: f32, q: f32, gain_db: f32) -> Self {
        if gain_db.abs() < 0.001 {
            return Self::identity();
        }
        let (_omega, sin, cos) = biquad_angles(sample_rate, freq);
        let a = 10.0_f32.powf(gain_db / 40.0);
        let alpha = sin / (2.0 * q.max(0.001));
        Self::normalized(
            1.0 + alpha * a,
            -2.0 * cos,
            1.0 - alpha * a,
            1.0 + alpha / a,
            -2.0 * cos,
            1.0 - alpha / a,
        )
    }

    fn shelf(sample_rate: f32, shelf_type: &str, freq: f32, gain_db: f32) -> Self {
        if gain_db.abs() < 0.001 {
            return Self::identity();
        }
        let (_omega, sin, cos) = biquad_angles(sample_rate, freq);
        let a = 10.0_f32.powf(gain_db / 40.0);
        let sqrt_a = a.sqrt();
        let alpha = sin * std::f32::consts::FRAC_1_SQRT_2;
        let beta = 2.0 * sqrt_a * alpha;
        if shelf_type == "highshelf" {
            Self::normalized(
                a * ((a + 1.0) + (a - 1.0) * cos + beta),
                -2.0 * a * ((a - 1.0) + (a + 1.0) * cos),
                a * ((a + 1.0) + (a - 1.0) * cos - beta),
                (a + 1.0) - (a - 1.0) * cos + beta,
                2.0 * ((a - 1.0) - (a + 1.0) * cos),
                (a + 1.0) - (a - 1.0) * cos - beta,
            )
        } else {
            Self::normalized(
                a * ((a + 1.0) - (a - 1.0) * cos + beta),
                2.0 * a * ((a - 1.0) - (a + 1.0) * cos),
                a * ((a + 1.0) - (a - 1.0) * cos - beta),
                (a + 1.0) + (a - 1.0) * cos + beta,
                -2.0 * ((a - 1.0) + (a + 1.0) * cos),
                (a + 1.0) + (a - 1.0) * cos - beta,
            )
        }
    }

    fn identity() -> Self {
        Self::normalized(1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
    }

    fn normalized(b0: f32, b1: f32, b2: f32, a0: f32, a1: f32, a2: f32) -> Self {
        let safe_a0 = if a0.abs() < 0.000001 { 1.0 } else { a0 };
        Self {
            b0: b0 / safe_a0,
            b1: b1 / safe_a0,
            b2: b2 / safe_a0,
            a1: a1 / safe_a0,
            a2: a2 / safe_a0,
            z1_l: 0.0,
            z2_l: 0.0,
            z1_r: 0.0,
            z2_r: 0.0,
        }
    }

    fn process(&mut self, left: f32, right: f32) -> (f32, f32) {
        let out_l = left * self.b0 + self.z1_l;
        self.z1_l = left * self.b1 + self.z2_l - self.a1 * out_l;
        self.z2_l = left * self.b2 - self.a2 * out_l;
        let out_r = right * self.b0 + self.z1_r;
        self.z1_r = right * self.b1 + self.z2_r - self.a1 * out_r;
        self.z2_r = right * self.b2 - self.a2 * out_r;
        (out_l, out_r)
    }
}

fn biquad_angles(sample_rate: f32, freq: f32) -> (f32, f32, f32) {
    let nyquist = (sample_rate * 0.5).max(100.0);
    let safe_freq = freq.clamp(10.0, nyquist - 1.0);
    let omega = 2.0 * std::f32::consts::PI * safe_freq / sample_rate.max(1.0);
    (omega, omega.sin(), omega.cos())
}

fn render_region_sample(
    region: &NativeAudioRegion,
    asset: &DecodedAudioAsset,
    t: f64,
) -> Option<(f32, f32)> {
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
    let envelope = region_envelope_gain(region, local);
    Some((left * envelope, right * envelope))
}

fn region_envelope_gain(region: &NativeAudioRegion, local: f64) -> f32 {
    let duration = region.duration.max(0.0);
    let mut fade_in = region.fade_in.max(0.0).min(duration);
    let mut fade_out = region.fade_out.max(0.0).min(duration);
    let total = fade_in + fade_out;
    if duration > 0.0 && total > duration {
        let scale = duration / total;
        fade_in *= scale;
        fade_out *= scale;
    }
    let mut multiplier = 1.0_f64;
    if fade_in > 0.0 && local < fade_in {
        multiplier = multiplier.min((local / fade_in).clamp(0.0, 1.0));
    }
    if fade_out > 0.0 {
        let fade_out_start = duration - fade_out;
        if local > fade_out_start {
            multiplier = multiplier.min(((duration - local) / fade_out).clamp(0.0, 1.0));
        }
    }
    multiplier as f32
}

fn decode_payload_asset(asset: &NativeAudioAssetPayload) -> Result<DecodedAudioAsset, String> {
    if asset.id.trim().is_empty() {
        return Err("Native cached WAV asset is missing an id.".to_string());
    }
    if !asset.duration_seconds.is_finite() || asset.duration_seconds < 0.0 {
        return Err(format!(
            "Native cached WAV asset {} has invalid duration metadata.",
            asset.name
        ));
    }
    let decoded = decode_pcm16_wav(&asset.bytes).map_err(|err| {
        format!(
            "Could not decode native cached WAV asset {}: {}",
            asset.name, err
        )
    })?;
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

fn validate_asset_metadata(
    asset: &NativeAudioAssetPayload,
    decoded: &DecodedAudioAsset,
) -> Result<(), String> {
    if asset.id.trim().is_empty() {
        return Err("Native cached WAV asset is missing an id.".to_string());
    }
    if !asset.duration_seconds.is_finite() || asset.duration_seconds < 0.0 {
        return Err(format!(
            "Native cached WAV asset {} has invalid duration metadata.",
            asset.name
        ));
    }
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
    Ok(())
}

fn validate_region(region: &NativeAudioRegion) -> Result<(), String> {
    if region.id.trim().is_empty() {
        return Err("Native cached WAV region is missing an id.".to_string());
    }
    if region.asset_id.trim().is_empty() {
        return Err(format!(
            "Native cached WAV region {} is missing an asset id.",
            region.id
        ));
    }
    if region.track_id.trim().is_empty() {
        return Err(format!(
            "Native cached WAV region {} is missing a track id.",
            region.id
        ));
    }
    if !region.start_time.is_finite()
        || !region.source_offset.is_finite()
        || !region.duration.is_finite()
        || !region.gain.is_finite()
        || !region.pan.is_finite()
    {
        return Err(format!(
            "Native cached WAV region {} contains non-finite timing or mix data.",
            region.id
        ));
    }
    if region.duration <= 0.0 {
        return Err(format!(
            "Native cached WAV region {} must have a positive duration.",
            region.id
        ));
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
    let slice = bytes
        .get(offset..offset + 2)
        .ok_or_else(|| "unexpected end of file".to_string())?;
    Ok(u16::from_le_bytes([slice[0], slice[1]]))
}

fn read_u32_le(bytes: &[u8], offset: usize) -> Result<u32, String> {
    let slice = bytes
        .get(offset..offset + 4)
        .ok_or_else(|| "unexpected end of file".to_string())?;
    Ok(u32::from_le_bytes([slice[0], slice[1], slice[2], slice[3]]))
}

#[derive(Clone, Copy)]
struct NativeDrumKitConfig {
    kick: NativeKickConfig,
    snare: NativeSnareConfig,
    hat: NativeHatConfig,
}

#[derive(Clone, Copy)]
struct NativeKickConfig {
    start_freq: f64,
    end_freq: f64,
    sweep_seconds: f64,
    filter_freq: Option<f64>,
    gain_floor: f32,
    gain_scale: f32,
    length: f64,
    ramp_seconds: f64,
}

#[derive(Clone, Copy)]
struct NativeSnareConfig {
    noise_seconds: f64,
    highpass: f64,
    lowpass: Option<f64>,
    gain_floor: f32,
    gain_scale: f32,
    length: f64,
    ramp_seconds: f64,
    body_freq: Option<f64>,
    body_gain: f32,
    body_length: f64,
    body_ramp_seconds: f64,
}

#[derive(Clone, Copy)]
struct NativeHatConfig {
    closed_length: f64,
    open_length: f64,
    highpass_closed: f64,
    highpass_open: f64,
    lowpass: Option<f64>,
    gain_floor_closed: f32,
    gain_floor_open: f32,
    gain_scale_closed: f32,
    gain_scale_open: f32,
    ramp_seconds_closed: f64,
    ramp_seconds_open: f64,
}

fn drum_exp_ramp(local: f64, ramp_seconds: f64) -> f32 {
    if ramp_seconds <= 0.0 {
        return 0.001;
    }
    let progress = (local / ramp_seconds).clamp(0.0, 1.0);
    0.001_f64.powf(progress) as f32
}

#[derive(Clone, Copy)]
struct NativeBassToneConfig {
    main_wave: &'static str,
    sub_wave: &'static str,
    main_peak: f32,
    sub_peak: f32,
    cutoff: f32,
    sub_cutoff: f32,
    attack: f64,
}

include!("generated_sound_recipes.rs");

fn native_wave_sample(wave: &str, freq: f32, local: f64) -> f32 {
    match wave {
        "sine" => phase(freq, local),
        "triangle" => triangle(freq, local),
        "square" => square(freq, local),
        "sawtooth" => saw(freq, local),
        _ => saw(freq, local),
    }
}

fn native_wave_sample_ramped(
    wave: &str,
    start_freq: f32,
    target_freq: f32,
    ramp_end: f64,
    local: f64,
) -> f32 {
    let cycles = ramped_cycles(start_freq as f64, target_freq as f64, ramp_end, local);
    match wave {
        "sine" => (std::f64::consts::TAU * cycles).sin() as f32,
        "triangle" => {
            let cycle = cycles.fract() as f32;
            4.0 * (cycle - 0.5).abs() - 1.0
        }
        "square" => {
            if (std::f64::consts::TAU * cycles).sin() >= 0.0 {
                1.0
            } else {
                -1.0
            }
        }
        "sawtooth" => cycles.fract() as f32 * 2.0 - 1.0,
        _ => cycles.fract() as f32 * 2.0 - 1.0,
    }
}

fn ramped_cycles(start_freq: f64, target_freq: f64, ramp_end: f64, local: f64) -> f64 {
    if local <= 0.0 {
        return 0.0;
    }
    let ramp_end = ramp_end.max(0.0001);
    if (start_freq - target_freq).abs() < f64::EPSILON {
        return start_freq * local;
    }
    if local <= ramp_end {
        start_freq * local + (target_freq - start_freq) * local * local / (2.0 * ramp_end)
    } else {
        ((start_freq + target_freq) * 0.5 * ramp_end) + target_freq * (local - ramp_end)
    }
}

fn lowpass_tone_factor(freq: f32, cutoff: f32) -> f32 {
    (cutoff / (freq * 2.0).max(1.0)).clamp(0.18, 1.0)
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
            let kit = lofi_drum_kit(event);
            let cfg = native_drum_kit_config(kit).kick;
            if local > cfg.length {
                return 0.0;
            }
            let sweep = (local / cfg.sweep_seconds).clamp(0.0, 1.0);
            let freq = cfg.start_freq * (cfg.end_freq / cfg.start_freq).powf(sweep);
            let env = drum_exp_ramp(local, cfg.ramp_seconds);
            let filter_softening = cfg
                .filter_freq
                .map(|freq| (freq / 170.0).clamp(0.78, 1.05) as f32)
                .unwrap_or(1.0);
            let amp = cfg.gain_floor.max(velocity * cfg.gain_scale) * filter_softening;
            (phase(freq as f32, local) * env * amp).clamp(-1.0, 1.0)
        }
        "snare" => {
            let kit = lofi_drum_kit(event);
            let cfg = native_drum_kit_config(kit).snare;
            if local > cfg.length {
                return 0.0;
            }
            let env = drum_exp_ramp(local, cfg.ramp_seconds);
            let filter_tone = ((cfg.highpass / 1700.0).clamp(0.42, 1.0)
                * cfg
                    .lowpass
                    .map(|freq| (freq / 2800.0).clamp(0.72, 1.0))
                    .unwrap_or(1.0)) as f32;
            let noise_sample = noise(event, local.min(cfg.noise_seconds), 0);
            let noise_part =
                noise_sample * env * cfg.gain_floor.max(velocity * cfg.gain_scale) * filter_tone;
            let body_part = if let Some(body_freq) = cfg.body_freq {
                if local <= cfg.body_length {
                    triangle(body_freq as f32, local)
                        * drum_exp_ramp(local, cfg.body_ramp_seconds)
                        * cfg.body_gain
                } else {
                    0.0
                }
            } else {
                0.0
            };
            noise_part + body_part
        }
        "clap" => {
            if local > 0.12 {
                return 0.0;
            }
            let burst = if local < 0.018 {
                1.0
            } else if local < 0.038 {
                0.82
            } else {
                0.58
            };
            let env = (-local * 24.0).exp() as f32;
            noise(event, local, 7) * env * velocity * 0.48 * burst
        }
        "hat" => {
            let kit = lofi_drum_kit(event);
            let cfg = native_drum_kit_config(kit).hat;
            let length = if accent {
                cfg.open_length
            } else {
                cfg.closed_length
            };
            if local > length {
                return 0.0;
            }
            let ramp = if accent {
                cfg.ramp_seconds_open
            } else {
                cfg.ramp_seconds_closed
            };
            let tone = ((if accent {
                cfg.highpass_open
            } else {
                cfg.highpass_closed
            }) / 5600.0)
                .clamp(0.45, 1.25)
                * cfg
                    .lowpass
                    .map(|freq| (freq / 6200.0).clamp(0.76, 1.0))
                    .unwrap_or(1.0);
            let amp = if accent {
                cfg.gain_floor_open.max(velocity * cfg.gain_scale_open)
            } else {
                cfg.gain_floor_closed.max(velocity * cfg.gain_scale_closed)
            };
            (noise(event, local, 13) - noise(event, local, 31) * 0.45)
                * drum_exp_ramp(local, ramp)
                * amp
                * tone as f32
        }
        "openhat" => {
            let kit = lofi_drum_kit(event);
            let cfg = native_drum_kit_config(kit).hat;
            if local > cfg.open_length {
                return 0.0;
            }
            let tone = (cfg.highpass_open / 5600.0).clamp(0.45, 1.25)
                * cfg
                    .lowpass
                    .map(|freq| (freq / 6200.0).clamp(0.76, 1.0))
                    .unwrap_or(1.0);
            let amp = cfg.gain_floor_open.max(velocity * cfg.gain_scale_open);
            (noise(event, local, 17) - noise(event, local, 37) * 0.4)
                * drum_exp_ramp(local, cfg.ramp_seconds_open)
                * amp
                * tone as f32
        }
        "tomlow" | "tommid" | "tomhi" => {
            if local > 0.31 {
                return 0.0;
            }
            let base = match event.kind.as_str() {
                "tomlow" => 118.0,
                "tommid" => 158.0,
                _ => 218.0,
            };
            let sweep = (local / 0.22).clamp(0.0, 1.0);
            let freq = base * (0.58_f64).powf(sweep);
            let env = (-local * 11.0).exp() as f32;
            phase(freq as f32, local) * env * velocity * 0.58
        }
        "crash" | "ride" => {
            let end = if event.kind == "crash" { 0.9 } else { 0.42 };
            if local > end {
                return 0.0;
            }
            let env = (-local * if event.kind == "crash" { 3.6 } else { 7.0 }).exp() as f32;
            (noise(event, local, 19) - noise(event, local, 41) * 0.35)
                * env
                * velocity
                * if event.kind == "crash" { 0.18 } else { 0.12 }
        }
        "texture" => render_lofi_texture(event, local),
        "bass" => {
            let midi = event.midi.unwrap_or(36.0);
            let dur = event.duration.max(0.08);
            if local > dur + 0.18 {
                return 0.0;
            }
            let cfg = native_bass_tone_config(event.bass_tone.as_deref());
            let main_env = note_envelope(local, dur, cfg.attack, 0.08, 0.55, 0.18);
            let sub_dur = (dur * 0.65).clamp(0.02, 0.12);
            let sub_env = note_envelope(local, sub_dur, 0.006, 0.08, 0.45, 0.14);
            let freq = midi_to_freq(midi) as f32;
            let slide = event
                .slide_midi
                .zip(event.slide_offset)
                .map(|(target_midi, offset)| {
                    let ramp_end = (offset.max(0.02) + 0.09).min((dur + 0.19).max(0.0001));
                    (midi_to_freq(target_midi) as f32, ramp_end)
                });
            let main_sample = if let Some((target_freq, ramp_end)) = slide {
                native_wave_sample_ramped(cfg.main_wave, freq, target_freq, ramp_end, local)
            } else {
                native_wave_sample(cfg.main_wave, freq, local)
            };
            let sub_sample = if let Some((target_freq, ramp_end)) = slide {
                native_wave_sample_ramped(
                    cfg.sub_wave,
                    freq * 0.5,
                    target_freq * 0.5,
                    ramp_end,
                    local,
                )
            } else {
                native_wave_sample(cfg.sub_wave, freq * 0.5, local)
            };
            let main_layer =
                main_sample * main_env * cfg.main_peak * lowpass_tone_factor(freq, cfg.cutoff);
            let sub_layer = sub_sample
                * sub_env
                * cfg.sub_peak
                * lowpass_tone_factor(freq * 0.5, cfg.sub_cutoff);
            (main_layer + sub_layer) * velocity
        }
        "melody" | "midi" => {
            let midi = event.midi.unwrap_or(72.0);
            render_lead_note(midi, event, local, velocity)
        }
        "chord" => render_chord_notes(&event.midi_notes, event, local, velocity),
        "guitar" => render_guitar_notes(&event.midi_notes, event, local, velocity),
        _ => 0.0,
    }
}

fn lofi_drum_kit(event: &NativeRenderedEvent) -> &str {
    generated_native_resolve_drum_kit(
        event.drum_kit.as_deref(),
        event.audio_profile.as_deref(),
        event
            .chip_preset
            .as_deref()
            .or(event.lofi_preset.as_deref()),
    )
}

fn render_lofi_texture(event: &NativeRenderedEvent, local: f64) -> f32 {
    if local > event.duration.clamp(0.08, 0.24) {
        return 0.0;
    }
    let profile_on = event.audio_profile.as_deref() == Some("lofi_chill")
        || event
            .lofi_preset
            .as_deref()
            .unwrap_or("")
            .starts_with("lofi_");
    if !profile_on {
        return 0.0;
    }
    let Some(texture) = event.lofi_texture.as_ref() else {
        return 0.0;
    };
    if !texture.enabled {
        return 0.0;
    }
    let hiss_amount = texture.tape_hiss.clamp(0.0, 1.0) as f32;
    let crackle_amount = texture.vinyl_crackle.clamp(0.0, 1.0) as f32;
    let warmth_gain = 0.9 + texture.warmth.clamp(0.0, 1.0) as f32 * 0.12;
    let age_gain = 1.0 - texture.low_pass_age.clamp(0.0, 1.0) as f32 * 0.08;
    let crush_steps = 28.0 - texture.bit_crush.clamp(0.0, 1.0) as f32 * 18.0;
    let hiss_env = if local < CHORDSMITH_LOFI_TEXTURE_HISS_ATTACK_SECONDS {
        (local / CHORDSMITH_LOFI_TEXTURE_HISS_ATTACK_SECONDS) as f32
    } else {
        let release = ((local - CHORDSMITH_LOFI_TEXTURE_HISS_ATTACK_SECONDS)
            / CHORDSMITH_LOFI_TEXTURE_HISS_RELEASE_SECONDS)
            .clamp(0.0, 1.0);
        (1.0 - release) as f32
    };
    let sample_index = (local * 48_000.0).max(0.0).floor() as u64;
    let hiss = stable_noise_sample(sample_index, 91)
        * hiss_env
        * CHORDSMITH_LOFI_TEXTURE_HISS_GAIN
        * hiss_amount;
    let crackle = if chordsmith_step_seed(event, 43)
        < crackle_amount * CHORDSMITH_LOFI_TEXTURE_CRACKLE_THRESHOLD
        && local < CHORDSMITH_LOFI_TEXTURE_CRACKLE_STOP_SECONDS
    {
        stable_noise_sample(sample_index, 93)
            * (-local / CHORDSMITH_LOFI_TEXTURE_CRACKLE_DECAY_SECONDS).exp() as f32
            * CHORDSMITH_LOFI_TEXTURE_CRACKLE_GAIN
            * crackle_amount
    } else {
        0.0
    };
    let textured = (hiss + crackle) * warmth_gain * age_gain;
    if texture.bit_crush > 0.01 {
        (textured * crush_steps).round() / crush_steps
    } else {
        textured
    }
}

#[derive(Clone, Copy)]
struct NativeChordConfig {
    root_wave: &'static str,
    wave: &'static str,
    peak: f32,
    filter: &'static str,
    freq: f32,
    filter_q: f32,
    filter_sweep: Option<f32>,
    attack: f64,
    decay: f64,
    sustain: f32,
    release: f64,
    dur_mul: f64,
    spread_mul: f64,
    shimmer: bool,
    max_live_dur: f64,
    layers: &'static [NativeChordLayerConfig],
}

#[derive(Clone, Copy)]
struct NativeChordLayerConfig {
    wave: &'static str,
    freq_mul: f32,
    detune: f32,
    level: f32,
}

fn native_chord_config(instrument: Option<&str>) -> NativeChordConfig {
    generated_native_chord_config(instrument)
}

fn render_chord_notes(
    notes: &[f64],
    event: &NativeRenderedEvent,
    local: f64,
    velocity: f32,
) -> f32 {
    let cfg = native_chord_config(event.instrument.as_deref());
    let dur = (event.duration.max(0.08) * cfg.dur_mul)
        .min(cfg.max_live_dur)
        .max(0.04);
    if local > dur + cfg.release + 0.05 {
        return 0.0;
    }
    let source_notes = if notes.is_empty() { &[60.0][..] } else { notes };
    let play_mode = event.articulation.as_deref().unwrap_or("block");
    let scale = (source_notes.len() as f32).sqrt().max(1.0);
    let mut sample = 0.0_f32;
    for (index, midi) in source_notes.iter().take(6).enumerate() {
        let offset = if play_mode == "block" {
            index as f64 * 0.01 * cfg.spread_mul
        } else {
            index as f64
                * if play_mode.starts_with("strum") {
                    0.045
                } else {
                    0.12
                }
                * cfg.spread_mul
        };
        if local < offset {
            continue;
        }
        let note_local = local - offset;
        let note_dur = if play_mode == "block" || play_mode.starts_with("strum") {
            dur
        } else {
            dur.clamp(0.04, 0.25)
        };
        let base_wave = if index == 0 { cfg.root_wave } else { cfg.wave };
        sample += render_chord_voice(*midi, note_local, note_dur, base_wave, &cfg) / scale;
        if cfg.shimmer && index > 0 {
            sample += render_chord_shimmer(
                *midi + 12.0,
                note_local + 0.014,
                note_dur.min(0.12),
                cfg.peak * 0.08,
            ) / scale;
        }
    }
    sample * velocity
}

fn render_chord_voice(
    midi: f64,
    local: f64,
    dur: f64,
    default_wave: &str,
    cfg: &NativeChordConfig,
) -> f32 {
    if local < 0.0 || local > dur + cfg.release + 0.03 {
        return 0.0;
    }
    let base_freq = midi_to_freq(midi) as f32;
    let env = note_envelope(local, dur, cfg.attack, cfg.decay, cfg.sustain, cfg.release);
    let filter_target = cfg.filter_sweep.unwrap_or(cfg.freq);
    let filter_freq = if cfg.filter_sweep.is_some() {
        let sweep = (local / (dur * 0.5).clamp(0.04, 0.22)).clamp(0.0, 1.0) as f32;
        cfg.freq + (filter_target - cfg.freq) * sweep
    } else {
        cfg.freq
    };
    let mut sample = 0.0_f32;
    let layers = if cfg.layers.is_empty() {
        &[][..]
    } else {
        cfg.layers
    };
    for layer in layers {
        let detune_ratio = 2.0_f32.powf(layer.detune / 1200.0);
        let wave = if layer.wave.is_empty() {
            default_wave
        } else {
            layer.wave
        };
        let freq = base_freq * layer.freq_mul * detune_ratio;
        sample += native_wave_sample(wave, freq, local) * layer.level;
    }
    sample
        * env
        * cfg.peak
        * native_filter_factor_with_q(cfg.filter, base_freq, filter_freq, cfg.filter_q)
}

fn render_chord_shimmer(midi: f64, local: f64, dur: f64, peak: f32) -> f32 {
    if local < 0.0 || local > dur + 0.38 {
        return 0.0;
    }
    let freq = midi_to_freq(midi) as f32;
    native_wave_sample("sine", freq, local)
        * note_envelope(local, dur, 0.002, 0.12, 0.06, 0.35)
        * peak
        * lowpass_tone_factor(freq, 5200.0)
}

#[derive(Clone, Copy)]
struct NativeLeadConfig {
    wave: &'static str,
    peak: f32,
    filter: &'static str,
    freq: f32,
    dur_mul: f64,
    extras: &'static [NativeLeadExtraConfig],
}

#[derive(Clone, Copy)]
struct NativeLeadExtraConfig {
    freq_mul: f32,
    slide_freq_mul: Option<f32>,
    midi_offset: f64,
    wave: &'static str,
    peak: f32,
    peak_scale: f32,
    filter: &'static str,
    freq: f32,
    offset: f64,
    dur_mul: f64,
    max_dur: Option<f64>,
}

fn native_lead_config(instrument: Option<&str>) -> NativeLeadConfig {
    generated_native_lead_config(instrument)
}

fn render_lead_note(midi: f64, event: &NativeRenderedEvent, local: f64, velocity: f32) -> f32 {
    let cfg = native_lead_config(event.instrument.as_deref());
    let dur = (event.duration.max(0.05) * cfg.dur_mul).max(0.035);
    if local > dur + 0.22 {
        return 0.0;
    }
    let slide = event
        .slide_midi
        .zip(event.slide_offset)
        .map(|(target_midi, offset)| {
            let ramp_end = (offset.max(0.02) * cfg.dur_mul + 0.08).min((dur + 0.19).max(0.0001));
            (target_midi, ramp_end)
        });
    let mut sample = render_lead_voice(
        midi, 1.0, local, dur, cfg.wave, cfg.peak, cfg.filter, cfg.freq, slide,
    );
    for extra in cfg.extras {
        if local < extra.offset {
            continue;
        }
        let extra_local = local - extra.offset;
        let extra_dur = extra
            .max_dur
            .unwrap_or(f64::INFINITY)
            .min(event.duration.max(0.05) * extra.dur_mul)
            .max(0.025);
        let slide_extra = slide.is_some();
        let extra_midi = if slide_extra {
            midi
        } else {
            midi + extra.midi_offset
        };
        let extra_freq_mul = if slide_extra {
            extra.slide_freq_mul.unwrap_or(extra.freq_mul)
        } else {
            extra.freq_mul
        };
        let extra_peak = if slide_extra {
            cfg.peak * extra.peak_scale
        } else {
            extra.peak
        };
        sample += render_lead_voice(
            extra_midi,
            extra_freq_mul,
            extra_local,
            extra_dur,
            extra.wave,
            extra_peak,
            extra.filter,
            extra.freq,
            slide.map(|(target_midi, ramp_end)| {
                let extra_ramp_end = (ramp_end - extra.offset).max(0.0001);
                (target_midi, extra_ramp_end)
            }),
        );
    }
    sample * velocity
}

#[allow(clippy::too_many_arguments)]
fn render_lead_voice(
    midi: f64,
    freq_mul: f32,
    local: f64,
    dur: f64,
    wave: &str,
    peak: f32,
    filter: &str,
    filter_freq: f32,
    slide: Option<(f64, f64)>,
) -> f32 {
    if local < 0.0 || local > dur + 0.2 {
        return 0.0;
    }
    let freq = midi_to_freq(midi) as f32 * freq_mul;
    let sample = if let Some((target_midi, ramp_end)) = slide {
        native_wave_sample_ramped(
            wave,
            freq,
            midi_to_freq(target_midi) as f32 * freq_mul,
            ramp_end,
            local,
        )
    } else {
        native_wave_sample(wave, freq, local)
    };
    let filter_factor = native_filter_factor(filter, freq, filter_freq);
    sample * note_envelope(local, dur, 0.01, 0.06, 0.7, dur.max(0.08)) * peak * filter_factor
}

fn native_filter_factor(filter: &str, freq: f32, cutoff: f32) -> f32 {
    match filter {
        "lowpass" => lowpass_tone_factor(freq, cutoff),
        "highpass" => (freq / cutoff.max(1.0)).clamp(0.18, 1.0),
        "bandpass" => {
            let high = (freq / cutoff.max(1.0)).clamp(0.2, 1.0);
            let low = (cutoff / freq.max(1.0)).clamp(0.2, 1.0);
            (high * low).sqrt()
        }
        _ => 1.0,
    }
}

fn native_filter_factor_with_q(filter: &str, freq: f32, cutoff: f32, q: f32) -> f32 {
    let base = native_filter_factor(filter, freq, cutoff);
    let q_tone = (0.92 + q.clamp(0.3, 1.8) * 0.06).clamp(0.85, 1.05);
    base * q_tone
}

#[derive(Clone, Copy)]
struct NativeGuitarToneConfig {
    drive: f32,
    input: f32,
    peak: f32,
    lowpass: f32,
    highpass: f32,
    body: f32,
    mid: f32,
    spread: f64,
    sustain: f64,
    mute: f64,
    scratch: f64,
}

fn render_guitar_notes(
    notes: &[f64],
    event: &NativeRenderedEvent,
    local: f64,
    velocity: f32,
) -> f32 {
    let cfg = guitar_tone_config(event.instrument.as_deref());
    let articulation = event.articulation.as_deref().unwrap_or("open");
    let is_chug = articulation == "chug";
    let is_accent = articulation == "accent";
    let is_scratch = articulation == "scratch";
    let play_dur = if is_chug {
        event.duration.min(cfg.mute).max(0.025)
    } else if is_scratch {
        cfg.scratch.max(0.02)
    } else {
        (event.duration * cfg.sustain).max(0.12)
    };
    if local > play_dur + if is_chug { 0.05 } else { 0.2 } {
        return 0.0;
    }
    if is_scratch {
        let env = note_envelope(local, play_dur, 0.004, 0.035, 0.18, 0.04);
        return noise(event, local, 91) * env * velocity * cfg.peak * 1.35;
    }

    let mut ordered_notes = Vec::new();
    let source_notes = if notes.is_empty() {
        &[40.0][..]
    } else if event.direction.as_deref() == Some("up") {
        ordered_notes.extend(notes.iter().rev().copied());
        ordered_notes.as_slice()
    } else {
        notes
    };
    let scale = (source_notes.len() as f32).sqrt().max(1.0);
    let mut sample = 0.0_f32;
    for (index, midi) in source_notes.iter().take(6).enumerate() {
        let offset = index as f64 * if is_chug { 0.003 } else { cfg.spread };
        if local < offset {
            continue;
        }
        let note_local = local - offset;
        let freq = midi_to_freq(*midi) as f32;
        let env = note_envelope(
            note_local,
            play_dur,
            if is_chug { 0.002 } else { 0.006 },
            (play_dur * if is_chug { 0.45 } else { 0.35 }).max(0.025),
            if is_chug { 0.1 } else { 0.52 },
            if is_chug { 0.035 } else { 0.18 },
        );
        let highpass_factor = (freq / cfg.highpass.max(1.0)).clamp(0.18, 1.0);
        let lowpass_factor = (cfg.lowpass / (freq * 2.0).max(1.0)).clamp(0.18, 1.0);
        let body_boost = 1.0 + cfg.body * if freq < 260.0 { 0.04 } else { 0.018 };
        let mid_boost = 1.0
            + cfg.mid
                * if (420.0..1800.0).contains(&freq) {
                    0.045
                } else {
                    0.012
                };
        let osc = saw(freq, note_local) * 0.72
            + if event.instrument.as_deref() == Some("clean") {
                triangle(freq * 1.003, note_local) * 0.26
            } else {
                phase(freq * 1.003, note_local).signum() * 0.22
            };
        let driven = (osc * cfg.drive * cfg.input * if is_accent { 1.12 } else { 1.0 }).tanh();
        sample += driven * env * highpass_factor * lowpass_factor * body_boost * mid_boost / scale;
    }
    sample * velocity * cfg.peak * if is_accent { 1.28 } else { 1.0 }
}

fn guitar_tone_config(tone: Option<&str>) -> NativeGuitarToneConfig {
    generated_guitar_tone_config(tone)
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

fn master_gain(playback: &PlaybackShared) -> f32 {
    playback
        .tracks
        .get("master")
        .map(|track| {
            if track.mute {
                0.0
            } else {
                track.volume.clamp(0.0, 1.2) as f32
            }
        })
        .unwrap_or(1.0)
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

fn square(freq: f32, seconds: f64) -> f32 {
    if phase(freq, seconds) >= 0.0 {
        1.0
    } else {
        -1.0
    }
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

fn chordsmith_step_seed(event: &NativeRenderedEvent, seed: u64) -> f32 {
    let step = event.step.unwrap_or(0.0);
    let x = (step * 12.9898 + seed as f64 * 78.233).sin() * 43758.5453;
    (x - x.floor()) as f32
}

fn stable_noise_sample(index: u64, seed: u64) -> f32 {
    let x = (((index + 1) as f64) * 12.9898 + ((seed + 1) as f64) * 78.233).sin() * 43758.5453;
    ((x - x.floor()) * 2.0 - 1.0) as f32
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

fn output_device_for_id(
    host: &cpal::Host,
    host_name: &str,
    id: Option<&str>,
) -> Option<cpal::Device> {
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
    device
        .description()
        .map(|description| description.name().to_string())
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
    fn reuses_decoded_assets_when_later_payloads_omit_bytes() {
        let mut runtime = NativeAudioRuntime::default();
        let full_asset = NativeAudioAssetPayload {
            id: "asset".to_string(),
            name: "Stem.wav".to_string(),
            sample_rate: 48_000,
            channels: 2,
            duration_seconds: 0.5,
            bytes: pcm16_wav(48_000, 2, &[16_384, -16_384]),
        };
        let metadata_only = NativeAudioAssetPayload {
            bytes: Vec::new(),
            ..full_asset.clone()
        };

        let first = runtime
            .decode_or_reuse_asset(&full_asset)
            .expect("full asset should decode");
        let second = runtime
            .decode_or_reuse_asset(&metadata_only)
            .expect("metadata-only asset should reuse decoded cache");

        assert_eq!(first.frame_count, second.frame_count);
        assert_eq!(first.samples, second.samples);
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
    fn renders_region_samples_with_linear_fades() {
        let asset = DecodedAudioAsset {
            sample_rate: 4,
            channels: 1,
            samples: vec![1.0, 1.0, 1.0, 1.0],
            frame_count: 4,
        };
        let mut region = test_region("region", "asset", "bass", 0.0, 0.0, 1.0, 1.0, 0.0);
        region.fade_in = 0.5;
        region.fade_out = 0.25;

        let start = render_region_sample(&region, &asset, 0.0).expect("start sample");
        let middle = render_region_sample(&region, &asset, 0.5).expect("middle sample");
        let near_end = render_region_sample(&region, &asset, 0.875).expect("fade out sample");

        assert!(start.0.abs() < 0.0001);
        assert!((middle.0 - 1.0).abs() < 0.0001);
        assert!(near_end.0 > 0.4 && near_end.0 < 0.6);
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
    fn master_volume_controls_cached_region_output() {
        let mut full_volume = playback_with_region(test_track("bass", 1.0, 0.0, false, false));
        let (full_left, full_right) = render_next_frame(&mut full_volume);

        let mut quiet = playback_with_region(test_track("bass", 1.0, 0.0, false, false));
        quiet.tracks.insert(
            "master".to_string(),
            test_track("master", 0.25, 0.0, false, false),
        );

        let (quiet_left, quiet_right) = render_next_frame(&mut quiet);

        assert!(quiet_left > 0.0);
        assert!(quiet_right > 0.0);
        assert!(quiet_left < full_left * 0.35);
        assert!(quiet_right < full_right * 0.35);
    }

    #[test]
    fn native_return_send_adds_processed_return_output() {
        let mut dry = playback_with_region(test_track("bass", 1.0, 0.0, false, false));
        let dry_energy = render_energy(&mut dry, 1);

        let mut bass = test_track("bass", 1.0, 0.0, false, false);
        bass.sends.push(NativeTrackSend {
            return_track_id: "fx-return".to_string(),
            level: 0.5,
        });
        let mut sent = playback_with_region(bass);
        let mut fx_return = test_track("fx-return", 1.0, 0.0, false, false);
        fx_return.is_return = true;
        sent.tracks.insert("fx-return".to_string(), fx_return);
        sent.fx.track_chains.insert(
            "fx-return".to_string(),
            NativeFxChainState {
                slots: vec![NativeFxSlotState::from_payload(
                    &test_fx_slot("utility-gain", [("gain", 0.5)]),
                    4.0,
                )
                .expect("return gain should build")],
            },
        );

        let sent_energy = render_energy(&mut sent, 1);

        assert!(
            sent_energy > dry_energy * 1.1,
            "expected return send to add processed output: dry={dry_energy}, sent={sent_energy}"
        );
    }

    #[test]
    fn native_track_eq_chain_changes_rendered_output() {
        let mut dry = playback_with_region(test_track("bass", 1.0, 0.0, false, false));
        dry.sample_rate = 48_000;
        let dry_energy = render_energy(&mut dry, 256);

        let mut eq = playback_with_region(test_track("bass", 1.0, 0.0, false, false));
        eq.sample_rate = 48_000;
        eq.fx.track_chains.insert(
            "bass".to_string(),
            NativeFxChainState::from_payload(&test_parametric_eq_chain("bass", 12.0), 48_000.0),
        );
        let eq_energy = render_energy(&mut eq, 256);

        assert!(eq_energy > dry_energy * 1.05);
    }

    #[test]
    fn native_static_fx_processors_shape_samples() {
        let gain = NativeFxSlotState::from_payload(
            &test_fx_slot("utility-gain", [("gain", 0.5)]),
            48_000.0,
        )
        .expect("gain should build");
        assert_processed_left(gain, 0.8, 0.4);

        let gate = NativeFxSlotState::from_payload(
            &NativeFxSlotPayload {
                id: "slot_gate".to_string(),
                slot_type: "noise-gate".to_string(),
                enabled: true,
                parameters: HashMap::from([
                    ("threshold".to_string(), Value::from(-6.0)),
                    ("reduction".to_string(), Value::from(0.25)),
                ]),
            },
            48_000.0,
        )
        .expect("gate should build");
        assert_processed_left(gate, 0.2, 0.05);

        let limiter = NativeFxSlotState::from_payload(
            &test_fx_slot("limiter", [("threshold", -12.0), ("ratio", 20.0)]),
            48_000.0,
        )
        .expect("limiter should build");
        let limited = process_left(limiter, 1.0);
        assert!(limited < 0.32);

        let saturation = NativeFxSlotState::from_payload(
            &test_fx_slot("saturation", [("drive", 4.0), ("mix", 1.0)]),
            48_000.0,
        )
        .expect("saturation should build");
        let saturated = process_left(saturation, 0.8);
        assert!(saturated > 0.95 && saturated < 1.0);

        let crusher = NativeFxSlotState::from_payload(
            &test_fx_slot("bitcrusher", [("bits", 2.0), ("mix", 1.0)]),
            48_000.0,
        )
        .expect("crusher should build");
        assert_processed_left(crusher, 0.26, 0.25);
    }

    #[test]
    fn native_time_fx_processors_create_tail_and_modulation() {
        let delay = NativeFxSlotState::from_payload(
            &test_fx_slot("delay", [("time", 0.01), ("feedback", 0.0), ("mix", 1.0)]),
            100.0,
        )
        .expect("delay should build");
        assert_eventual_tail(delay, 8, 0.9, 1.0);

        let ping = NativeFxSlotState::from_payload(
            &test_fx_slot(
                "ping-pong-delay",
                [("time", 0.01), ("feedback", 0.0), ("mix", 1.0)],
            ),
            100.0,
        )
        .expect("ping pong delay should build");
        assert_eventual_tail(ping, 8, 0.9, 1.0);

        let reverb = NativeFxSlotState::from_payload(
            &test_fx_slot("reverb", [("decay", 1.8), ("mix", 1.0)]),
            100.0,
        )
        .expect("reverb should build");
        assert_eventual_tail(reverb, 16, 0.9, 1.0);

        let chorus = NativeFxSlotState::from_payload(
            &test_fx_slot("chorus", [("rate", 1.0), ("depth", 0.01), ("mix", 1.0)]),
            100.0,
        )
        .expect("chorus should build");
        assert_eventual_tail(chorus, 8, 0.9, 1.0);

        let phaser = NativeFxSlotState::from_payload(
            &test_fx_slot("phaser", [("rate", 1.0), ("depth", 1000.0), ("mix", 1.0)]),
            100.0,
        )
        .expect("phaser should build");
        assert_eventual_tail(phaser, 8, 0.9, -1.0);

        let mut tremolo = NativeFxSlotState::from_payload(
            &test_fx_slot("tremolo-autopan", [("rate", 25.0), ("depth", 0.5)]),
            100.0,
        )
        .expect("tremolo should build");
        let first = tremolo.process(1.0, 1.0).0;
        let second = tremolo.process(1.0, 1.0).0;
        assert!(first > second);
    }

    #[test]
    fn generated_classic_bass_uses_chordsmith_layer_balance() {
        let event = test_generated_event("bass", "bass", 0.0, 0.25, 0.34);
        let local = 0.01;
        let sample = render_event_sample(&event, local);
        let freq = midi_to_freq(36.0) as f32;
        let dur = 0.25;
        let saw_env = note_envelope(local, dur, 0.006, 0.08, 0.55, 0.18);
        let sub_env = note_envelope(
            local,
            (dur * 0.65_f64).clamp(0.02, 0.12),
            0.006,
            0.08,
            0.45,
            0.14,
        );
        let old_quiet_balance = (saw(freq, local) * saw_env * 0.72
            + phase(freq * 0.5, local) * sub_env * 0.28)
            * 0.34
            * 0.22;

        assert!(sample.abs() > old_quiet_balance.abs() * 1.2);
    }

    #[test]
    fn native_square_wave_recipes_do_not_fall_back_to_sawtooth() {
        let square_sample = native_wave_sample("square", 110.0, 0.001);
        let saw_sample = native_wave_sample("sawtooth", 110.0, 0.001);

        assert_eq!(square_sample, 1.0);
        assert!((square_sample - saw_sample).abs() > 1.0);
    }

    #[test]
    fn generated_bass_slide_uses_rendered_event_target_pitch() {
        let mut plain = test_generated_event("bass_plain", "bass", 0.0, 0.5, 0.8);
        plain.midi = Some(36.0);
        plain.bass_tone = Some("warm_sub".to_string());
        let mut sliding = plain.clone();
        sliding.id = "bass_slide".to_string();
        sliding.slide_midi = Some(43.0);
        sliding.slide_offset = Some(0.08);

        let diff: f32 = [0.05, 0.11, 0.16, 0.22]
            .iter()
            .map(|time| {
                (render_event_sample(&plain, *time) - render_event_sample(&sliding, *time)).abs()
            })
            .sum();

        assert!(
            diff > 0.03,
            "expected bass slide to alter native samples, got diff {diff}"
        );
    }

    #[test]
    fn generated_melody_slide_uses_rendered_event_target_pitch() {
        let mut plain = test_generated_event("melody_plain", "melody", 0.0, 0.45, 0.8);
        plain.midi = Some(72.0);
        plain.instrument = Some("soft".to_string());
        let mut sliding = plain.clone();
        sliding.id = "melody_slide".to_string();
        sliding.slide_midi = Some(76.0);
        sliding.slide_offset = Some(0.1);

        let diff: f32 = [0.06, 0.13, 0.19, 0.27]
            .iter()
            .map(|time| {
                (render_event_sample(&plain, *time) - render_event_sample(&sliding, *time)).abs()
            })
            .sum();

        assert!(
            diff > 0.01,
            "expected melody slide to alter native samples, got diff {diff}"
        );
    }

    #[test]
    fn generated_lead_extra_recipes_preserve_slide_parameters() {
        let cfg = native_lead_config(Some("tape_bell"));
        let extra = cfg.extras.first().expect("tape bell has an extra layer");

        assert!((extra.slide_freq_mul.unwrap_or_default() - 1.994).abs() < 0.001);
        assert!((extra.peak_scale - 0.16).abs() < 0.001);
    }

    #[test]
    fn generated_warm_sub_bass_remains_audible_on_low_c() {
        let mut event = test_generated_event("warm_sub_low_c", "bass", 0.0, 0.34, 0.34);
        event.bass_tone = Some("warm_sub".to_string());
        event.audio_profile = Some("lofi_chill".to_string());
        event.lofi_preset = Some("lofi_menu_warmth".to_string());
        event.midi = Some(36.0);

        let energy = render_event_sample_energy(&event, &[0.026, 0.04, 0.055, 0.08, 0.12]);

        assert!(
            energy > 0.25,
            "expected low C warm_sub bass to produce audible native energy, got {energy}"
        );
    }

    #[test]
    fn generated_guitar_tone_changes_native_output() {
        let clean = test_guitar_event("clean", "accent");
        let metal = test_guitar_event("metal", "accent");
        let clean_energy = render_event_sample_energy(&clean, &[0.008, 0.016, 0.029, 0.044, 0.071]);
        let metal_energy = render_event_sample_energy(&metal, &[0.008, 0.016, 0.029, 0.044, 0.071]);

        assert!(
            (clean_energy - metal_energy).abs() > 0.01,
            "expected guitar tones to shape native output differently: clean={clean_energy}, metal={metal_energy}"
        );
    }

    #[test]
    fn generated_guitar_direction_changes_native_strum_order() {
        let down = test_guitar_event("clean", "open");
        let mut up = down.clone();
        up.direction = Some("up".to_string());
        let down_energy = render_event_sample_energy(&down, &[0.01, 0.027, 0.044, 0.061]);
        let up_energy = render_event_sample_energy(&up, &[0.01, 0.027, 0.044, 0.061]);

        assert!(
            (down_energy - up_energy).abs() > 0.001,
            "expected guitar direction to alter native strum order: down={down_energy}, up={up_energy}"
        );
    }

    #[test]
    fn lofi_texture_uses_imported_chordsmith_texture_amounts() {
        let mut silent = test_generated_event("texture_silent", "texture", 0.0, 0.22, 1.0);
        silent.track_id = "drums".to_string();
        silent.audio_profile = Some("lofi_chill".to_string());
        silent.lofi_preset = Some("lofi_study_room".to_string());
        silent.step = Some(8.0);

        let mut textured = silent.clone();
        textured.id = "texture_imported".to_string();
        textured.lofi_texture = Some(NativeLofiTexture {
            enabled: true,
            vinyl_crackle: 0.08,
            tape_hiss: 0.6,
            warmth: 0.18,
            low_pass_age: 0.24,
            bit_crush: 0.01,
        });

        let silent_energy = render_event_sample_energy(&silent, &[0.018, 0.024, 0.052, 0.12]);
        let textured_energy = render_event_sample_energy(&textured, &[0.018, 0.024, 0.052, 0.12]);

        assert_eq!(silent_energy, 0.0);
        assert!(
            textured_energy > 0.0005,
            "expected imported lofi texture amounts to add native texture energy: {textured_energy}"
        );
    }

    #[test]
    fn native_sidechain_ducks_chords_after_kick_triggers() {
        let mut chord = test_chord_event();
        chord.time = 0.018;

        let mut dry = playback_with_events(vec![test_kick_trigger_event(), chord.clone()]);
        let dry_energy = render_energy(&mut dry, 80);

        let mut pumped = playback_with_events(vec![test_kick_trigger_event(), chord]);
        pumped.sidechain = Some(NativeSidechainPayload {
            enabled: true,
            amount: 0.5,
            target_track_id: "chords".to_string(),
            trigger_kind: "kick".to_string(),
        });
        let pumped_energy = render_energy(&mut pumped, 80);

        assert!(
            pumped_energy < dry_energy * 0.9,
            "expected sidechain to reduce chord energy: dry={dry_energy}, pumped={pumped_energy}"
        );
    }

    #[test]
    fn native_loop_wraps_on_the_audio_frame_boundary() {
        let mut event = test_generated_event("loop_bass", "bass", 0.0, 0.08, 1.0);
        event.midi = Some(36.0);
        let mut playback = playback_with_events(vec![event]);
        playback.sample_rate = 4;
        playback.position_seconds = 0.49;
        playback.loop_region = Some(NativeLoopPayload {
            enabled: true,
            start_seconds: 0.0,
            end_seconds: 0.5,
        });

        let _ = render_next_frame(&mut playback);

        assert!(
            playback.position_seconds < 0.251,
            "expected playback to wrap to loop start plus one sample, got {}",
            playback.position_seconds
        );
        assert_eq!(playback.scan_start_index, 0);
    }

    #[test]
    fn native_start_payload_reads_loop_field_from_frontend() {
        let payload: NativeAudioStartPayload = serde_json::from_value(serde_json::json!({
            "projectTitle": "Loop Test",
            "startSeconds": 0.0,
            "outputDeviceId": null,
            "loop": {
                "enabled": true,
                "startSeconds": 1.0,
                "endSeconds": 3.0
            },
            "tracks": [],
            "events": [],
            "fxChains": [],
            "assets": [],
            "regions": []
        }))
        .expect("payload should deserialize with frontend loop field");

        let loop_region = payload.loop_region.expect("loop payload should be present");
        assert!(loop_region.enabled);
        assert_eq!(loop_region.start_seconds, 1.0);
        assert_eq!(loop_region.end_seconds, 3.0);
    }

    #[test]
    fn native_start_payload_reads_metronome_field_from_frontend() {
        let payload: NativeAudioStartPayload = serde_json::from_value(serde_json::json!({
            "projectTitle": "Metro Test",
            "startSeconds": 0.0,
            "outputDeviceId": null,
            "metronome": {
                "enabled": true,
                "beatSeconds": 0.5,
                "timeSig": 4,
                "volume": 0.6
            },
            "tracks": [],
            "events": [],
            "fxChains": [],
            "assets": [],
            "regions": []
        }))
        .expect("payload should deserialize with frontend metronome field");

        let metronome =
            sanitize_metronome(payload.metronome).expect("metronome payload should be present");
        assert!(metronome.enabled);
        assert_eq!(metronome.beat_seconds, 0.5);
        assert_eq!(metronome.time_sig, 4);
        assert_eq!(metronome.volume, 0.6);
    }

    #[test]
    fn native_metronome_renders_from_playback_clock() {
        let mut playback = playback_with_events(Vec::new());
        playback.metronome = Some(NativeMetronomePayload {
            enabled: true,
            beat_seconds: 0.25,
            time_sig: 4,
            volume: 0.8,
        });

        let energy = render_energy(&mut playback, 80);

        assert!(energy > 0.0001, "expected native metronome click energy");
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
            regions: vec![test_region(
                "region", "asset", "bass", 0.0, 0.0, 0.5, 1.0, 0.0,
            )],
            tracks: HashMap::from([("bass".to_string(), track)]),
            has_solo: false,
            position_seconds: 0.0,
            sample_rate: 4,
            channels: 2,
            playing: true,
            rendered_frame_count: 0,
            scan_start_index: 0,
            generation: 1,
            fx: NativeFxRuntime::default(),
            loop_region: None,
            metronome: None,
            sidechain: None,
        }
    }

    fn playback_with_events(events: Vec<NativeRenderedEvent>) -> PlaybackShared {
        PlaybackShared {
            project_title: Some("Test".to_string()),
            events,
            assets: HashMap::new(),
            regions: Vec::new(),
            tracks: HashMap::from([
                (
                    "drums".to_string(),
                    test_track("drums", 1.0, 0.0, false, false),
                ),
                (
                    "chords".to_string(),
                    test_track("chords", 1.0, 0.0, false, false),
                ),
            ]),
            has_solo: false,
            position_seconds: 0.0,
            sample_rate: 1000,
            channels: 2,
            playing: true,
            rendered_frame_count: 0,
            scan_start_index: 0,
            generation: 1,
            fx: NativeFxRuntime::default(),
            loop_region: None,
            metronome: None,
            sidechain: None,
        }
    }

    fn test_track(id: &str, volume: f64, pan: f64, mute: bool, solo: bool) -> NativeTrackControl {
        NativeTrackControl {
            id: id.to_string(),
            fx_chain_id: Some(format!("fx_{id}")),
            is_return: false,
            sends: Vec::new(),
            volume,
            pan,
            mute,
            solo,
        }
    }

    fn test_parametric_eq_chain(owner_track_id: &str, low_shelf_gain: f64) -> NativeFxChainPayload {
        NativeFxChainPayload {
            id: format!("fx_{owner_track_id}"),
            owner_track_id: Some(owner_track_id.to_string()),
            metadata: HashMap::new(),
            slots: vec![NativeFxSlotPayload {
                id: "slot_eq".to_string(),
                slot_type: "parametric-eq".to_string(),
                enabled: true,
                parameters: HashMap::from([
                    ("hpEnabled".to_string(), Value::Bool(false)),
                    ("lowShelfEnabled".to_string(), Value::Bool(true)),
                    ("lowShelfFrequency".to_string(), Value::from(120.0)),
                    ("lowShelfGain".to_string(), Value::from(low_shelf_gain)),
                    ("lowMidEnabled".to_string(), Value::Bool(false)),
                    ("highMidEnabled".to_string(), Value::Bool(false)),
                    ("highShelfEnabled".to_string(), Value::Bool(false)),
                    ("lpEnabled".to_string(), Value::Bool(false)),
                ]),
            }],
        }
    }

    fn test_fx_slot<const N: usize>(
        slot_type: &str,
        params: [(&str, f64); N],
    ) -> NativeFxSlotPayload {
        NativeFxSlotPayload {
            id: format!("slot_{slot_type}"),
            slot_type: slot_type.to_string(),
            enabled: true,
            parameters: params
                .into_iter()
                .map(|(key, value)| (key.to_string(), Value::from(value)))
                .collect(),
        }
    }

    fn process_left(mut slot: NativeFxSlotState, sample: f32) -> f32 {
        slot.process(sample, sample).0
    }

    fn assert_processed_left(slot: NativeFxSlotState, input: f32, expected: f32) {
        let actual = process_left(slot, input);
        assert!(
            (actual - expected).abs() < 0.0001,
            "expected {actual} to be close to {expected}"
        );
    }

    fn assert_eventual_tail(
        mut slot: NativeFxSlotState,
        max_frames: usize,
        min_abs: f32,
        sign: f32,
    ) {
        let (first_left, _) = slot.process(1.0, 1.0);
        assert!(first_left.abs() < 0.0001);
        for _ in 0..max_frames {
            let (tail_left, _) = slot.process(0.0, 0.0);
            if tail_left.abs() >= min_abs && tail_left.signum() == sign.signum() {
                return;
            }
        }
        panic!("expected tail with abs >= {min_abs} and sign {sign}");
    }

    fn render_energy(playback: &mut PlaybackShared, frames: usize) -> f32 {
        let mut energy = 0.0;
        for _ in 0..frames {
            let (left, right) = render_next_frame(playback);
            energy += left.abs() + right.abs();
        }
        energy
    }

    fn render_event_sample_energy(event: &NativeRenderedEvent, times: &[f64]) -> f32 {
        times
            .iter()
            .map(|time| render_event_sample(event, *time).abs())
            .sum()
    }

    #[allow(clippy::too_many_arguments)]
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
            fade_in: 0.0,
            fade_out: 0.0,
        }
    }

    fn test_generated_event(
        id: &str,
        kind: &str,
        time: f64,
        duration: f64,
        velocity: f64,
    ) -> NativeRenderedEvent {
        NativeRenderedEvent {
            id: id.to_string(),
            kind: kind.to_string(),
            track_id: "bass".to_string(),
            time,
            duration,
            midi: Some(36.0),
            slide_midi: None,
            slide_offset: None,
            midi_notes: Vec::new(),
            velocity,
            step: Some(0.0),
            pan: None,
            instrument: None,
            drum_kit: None,
            bass_tone: None,
            audio_profile: None,
            lofi_preset: None,
            lofi_texture: None,
            chip_preset: None,
            chip_texture: None,
            accent: None,
            articulation: None,
            direction: None,
            drum_lane: None,
        }
    }

    fn test_guitar_event(tone: &str, articulation: &str) -> NativeRenderedEvent {
        NativeRenderedEvent {
            id: format!("guitar_{tone}_{articulation}"),
            kind: "guitar".to_string(),
            track_id: "guitar".to_string(),
            time: 0.0,
            duration: 0.32,
            midi: None,
            slide_midi: None,
            slide_offset: None,
            midi_notes: vec![40.0, 47.0, 52.0],
            velocity: 1.0,
            step: Some(0.0),
            pan: None,
            instrument: Some(tone.to_string()),
            drum_kit: None,
            bass_tone: None,
            audio_profile: None,
            lofi_preset: None,
            lofi_texture: None,
            chip_preset: None,
            chip_texture: None,
            accent: None,
            articulation: Some(articulation.to_string()),
            direction: None,
            drum_lane: None,
        }
    }

    fn test_kick_trigger_event() -> NativeRenderedEvent {
        NativeRenderedEvent {
            id: "kick_trigger".to_string(),
            kind: "kick".to_string(),
            track_id: "drums".to_string(),
            time: 0.0,
            duration: 0.1,
            midi: None,
            slide_midi: None,
            slide_offset: None,
            midi_notes: Vec::new(),
            velocity: 0.0,
            step: Some(0.0),
            pan: None,
            instrument: None,
            drum_kit: None,
            bass_tone: None,
            audio_profile: None,
            lofi_preset: None,
            lofi_texture: None,
            chip_preset: None,
            chip_texture: None,
            accent: None,
            articulation: None,
            direction: None,
            drum_lane: Some("kick".to_string()),
        }
    }

    fn test_chord_event() -> NativeRenderedEvent {
        NativeRenderedEvent {
            id: "chord_sidechain_target".to_string(),
            kind: "chord".to_string(),
            track_id: "chords".to_string(),
            time: 0.0,
            duration: 0.4,
            midi: None,
            slide_midi: None,
            slide_offset: None,
            midi_notes: vec![48.0, 55.0, 64.0],
            velocity: 1.0,
            step: Some(0.0),
            pan: None,
            instrument: Some("warm_pad".to_string()),
            drum_kit: None,
            bass_tone: None,
            audio_profile: None,
            lofi_preset: None,
            lofi_texture: None,
            chip_preset: None,
            chip_texture: None,
            accent: None,
            articulation: None,
            direction: None,
            drum_lane: None,
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
