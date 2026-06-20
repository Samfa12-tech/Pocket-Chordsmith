use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{BufWriter, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, AtomicU32, AtomicU64, AtomicU8, AtomicUsize, Ordering},
    Arc, Condvar, Mutex,
};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

type NativeRecordingState = Mutex<NativeRecordingRuntime>;

const WRITER_RING_SECONDS: usize = 10;
const INPUT_CALLBACK_DRAIN_TIMEOUT_MS: u64 = 2_000;
const NO_FRAME: u64 = u64::MAX;
const MONITOR_BUFFER_SECONDS: usize = 2;
const RECORDING_WARNING_NONE: u8 = 0;
const RECORDING_WARNING_CAPTURE_BUFFER_FULL: u8 = 1;
const RECORDING_WARNING_WRITER_STOPPED: u8 = 2;
const CAPTURE_BUFFER_FULL_WARNING: &str =
    "Native recording capture buffer reached its safety limit; additional input frames are being dropped.";
const CAPTURE_WRITER_STOPPED_WARNING: &str =
    "Native recording writer stopped before the input stream finished; additional input frames are being dropped.";

struct RecordingWriterRuntime {
    handle: JoinHandle<Result<RecordingWriterSummary, String>>,
    queue: Arc<CaptureWriterRing>,
}

struct RecordingWriterSummary {
    sample_count: u64,
    size_bytes: u64,
}

#[derive(Default)]
pub struct NativeRecordingRuntime {
    input_stream: Option<cpal::Stream>,
    monitor_stream: Option<cpal::Stream>,
    writer: Option<RecordingWriterRuntime>,
    shared: Option<Arc<RecordingShared>>,
    started_at: Option<Instant>,
    target_path: Option<PathBuf>,
    target_relative_path: Option<String>,
    file_name: Option<String>,
    track_id: Option<String>,
    recording_session_id: Option<u64>,
    requested_start_bar: Option<f64>,
    requested_start_seconds: Option<f64>,
    requested_sample_rate: u32,
    capture_started_at_unix_ms: Option<u64>,
    input_device_name: Option<String>,
    output_device_name: Option<String>,
    last_error: Option<String>,
}

pub fn create_native_recording_runtime() -> NativeRecordingState {
    Mutex::new(NativeRecordingRuntime::default())
}

#[derive(Clone, Deserialize)]
pub struct NativeRecordingStartPayload {
    #[serde(rename = "projectFilePath")]
    project_file_path: String,
    #[serde(rename = "projectTitle")]
    project_title: String,
    #[serde(rename = "trackId")]
    track_id: String,
    #[serde(rename = "trackName")]
    track_name: String,
    #[serde(rename = "inputDeviceId")]
    input_device_id: Option<String>,
    #[serde(rename = "outputDeviceId")]
    output_device_id: Option<String>,
    #[serde(rename = "monitorEnabled")]
    monitor_enabled: bool,
    #[serde(rename = "monitorVolume")]
    monitor_volume: f64,
    #[serde(rename = "monitorPan")]
    monitor_pan: f64,
    #[serde(rename = "recordingSessionId")]
    recording_session_id: Option<u64>,
    #[serde(rename = "startBar")]
    start_bar: f64,
    #[serde(rename = "requestedStartSeconds")]
    requested_start_seconds: Option<f64>,
    #[serde(rename = "sampleRate")]
    requested_sample_rate: u32,
}

#[derive(Clone, Deserialize)]
pub struct NativeRecordingMonitorPayload {
    #[serde(rename = "outputDeviceId")]
    output_device_id: Option<String>,
    #[serde(rename = "monitorEnabled")]
    monitor_enabled: bool,
    #[serde(rename = "monitorVolume")]
    monitor_volume: f64,
    #[serde(rename = "monitorPan")]
    monitor_pan: f64,
}

#[derive(Clone, Deserialize)]
pub struct NativeRecordingPreviewPayload {
    #[serde(rename = "trackId")]
    track_id: String,
    #[serde(rename = "inputDeviceId")]
    input_device_id: Option<String>,
    #[serde(rename = "outputDeviceId")]
    output_device_id: Option<String>,
    #[serde(rename = "monitorEnabled")]
    monitor_enabled: bool,
    #[serde(rename = "monitorVolume")]
    monitor_volume: f64,
    #[serde(rename = "monitorPan")]
    monitor_pan: f64,
}

#[derive(Clone, Serialize)]
pub struct NativeRecordingStatus {
    backend: String,
    available: bool,
    active: bool,
    monitoring: bool,
    #[serde(rename = "trackId")]
    track_id: Option<String>,
    #[serde(rename = "recordingSessionId")]
    recording_session_id: Option<u64>,
    #[serde(rename = "requestedStartBar")]
    requested_start_bar: Option<f64>,
    #[serde(rename = "requestedStartSeconds")]
    requested_start_seconds: Option<f64>,
    #[serde(rename = "requestedSampleRate")]
    requested_sample_rate: u32,
    #[serde(rename = "captureSampleRate")]
    capture_sample_rate: u32,
    #[serde(rename = "elapsedSeconds")]
    elapsed_seconds: f64,
    #[serde(rename = "sampleRate")]
    sample_rate: u32,
    #[serde(rename = "captureStartedAtUnixMs")]
    capture_started_at_unix_ms: Option<u64>,
    #[serde(rename = "inputDeviceName")]
    input_device_name: Option<String>,
    #[serde(rename = "outputDeviceName")]
    output_device_name: Option<String>,
    peak: f32,
    #[serde(rename = "sampleCount")]
    sample_count: usize,
    #[serde(rename = "monitorBufferedFrameCount")]
    monitor_buffered_frame_count: u64,
    #[serde(rename = "inputFrameCount")]
    input_frame_count: u64,
    #[serde(rename = "capturedFrameCount")]
    captured_frame_count: u64,
    #[serde(rename = "captureStartInputFrame")]
    capture_start_input_frame: Option<u64>,
    #[serde(rename = "firstInputFrame")]
    first_input_frame: Option<u64>,
    #[serde(rename = "droppedInputFrameCount")]
    dropped_input_frame_count: u64,
    #[serde(rename = "monitorUnderrunCount")]
    monitor_underrun_count: u64,
    #[serde(rename = "monitorOverrunCount")]
    monitor_overrun_count: u64,
    #[serde(rename = "lastError")]
    last_error: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct NativeRecordingStopResult {
    #[serde(rename = "trackId")]
    track_id: String,
    #[serde(rename = "recordingSessionId")]
    recording_session_id: Option<u64>,
    #[serde(rename = "requestedStartBar")]
    requested_start_bar: Option<f64>,
    #[serde(rename = "requestedStartSeconds")]
    requested_start_seconds: Option<f64>,
    #[serde(rename = "requestedSampleRate")]
    requested_sample_rate: u32,
    #[serde(rename = "captureSampleRate")]
    capture_sample_rate: u32,
    #[serde(rename = "targetPath")]
    target_path: String,
    #[serde(rename = "targetRelativePath")]
    target_relative_path: String,
    #[serde(rename = "fileName")]
    file_name: String,
    #[serde(rename = "durationSeconds")]
    duration_seconds: f64,
    #[serde(rename = "sampleRate")]
    sample_rate: u32,
    channels: u16,
    #[serde(rename = "sizeBytes")]
    size_bytes: u64,
    peak: f32,
    #[serde(rename = "captureStartedAtUnixMs")]
    capture_started_at_unix_ms: Option<u64>,
    #[serde(rename = "inputFrameCount")]
    input_frame_count: u64,
    #[serde(rename = "capturedFrameCount")]
    captured_frame_count: u64,
    #[serde(rename = "captureStartInputFrame")]
    capture_start_input_frame: Option<u64>,
    #[serde(rename = "firstInputFrame")]
    first_input_frame: Option<u64>,
    #[serde(rename = "droppedInputFrameCount")]
    dropped_input_frame_count: u64,
    #[serde(rename = "monitorBufferedFrameCount")]
    monitor_buffered_frame_count: u64,
    #[serde(rename = "monitorUnderrunCount")]
    monitor_underrun_count: u64,
    #[serde(rename = "monitorOverrunCount")]
    monitor_overrun_count: u64,
}

struct MonitorRing {
    samples: Vec<AtomicU32>,
    capacity: usize,
    read_index: AtomicUsize,
    write_index: AtomicUsize,
}

impl MonitorRing {
    fn new(capacity: usize) -> Self {
        let capacity = capacity.max(1);
        Self {
            samples: (0..capacity)
                .map(|_| AtomicU32::new(0.0f32.to_bits()))
                .collect(),
            capacity,
            read_index: AtomicUsize::new(0),
            write_index: AtomicUsize::new(0),
        }
    }

    fn push(&self, sample: f32) -> bool {
        let write = self.write_index.load(Ordering::Relaxed);
        let read = self.read_index.load(Ordering::Acquire);
        if write.wrapping_sub(read) >= self.capacity {
            return false;
        }
        self.samples[write % self.capacity].store(sample.to_bits(), Ordering::Relaxed);
        self.write_index
            .store(write.wrapping_add(1), Ordering::Release);
        true
    }

    fn pop(&self) -> Option<f32> {
        loop {
            let read = self.read_index.load(Ordering::Acquire);
            let write = self.write_index.load(Ordering::Acquire);
            if read == write {
                return None;
            }
            let sample = f32::from_bits(self.samples[read % self.capacity].load(Ordering::Relaxed));
            if self
                .read_index
                .compare_exchange(
                    read,
                    read.wrapping_add(1),
                    Ordering::AcqRel,
                    Ordering::Acquire,
                )
                .is_ok()
            {
                return Some(sample);
            }
        }
    }

    fn clear(&self) {
        let write = self.write_index.load(Ordering::Acquire);
        self.read_index.store(write, Ordering::Release);
    }

    fn len(&self) -> usize {
        let read = self.read_index.load(Ordering::Acquire);
        let write = self.write_index.load(Ordering::Acquire);
        write.wrapping_sub(read).min(self.capacity)
    }
}

struct MonitorResampler {
    input_sample_rate: u64,
    output_sample_rate: u64,
    source_remainder: u64,
    pending_input_frames: usize,
    current_sample: f32,
    has_sample: bool,
}

impl MonitorResampler {
    fn new(input_sample_rate: u32, output_sample_rate: u32) -> Self {
        Self {
            input_sample_rate: u64::from(input_sample_rate.max(1)),
            output_sample_rate: u64::from(output_sample_rate.max(1)),
            source_remainder: 0,
            pending_input_frames: 0,
            current_sample: 0.0,
            has_sample: false,
        }
    }

    fn reset(&mut self) {
        self.source_remainder = 0;
        self.pending_input_frames = 0;
        self.current_sample = 0.0;
        self.has_sample = false;
    }

    fn next_sample(&mut self, shared: &Arc<RecordingShared>) -> Option<f32> {
        for _ in 0..self.pending_input_frames {
            let Some(sample) = pop_monitor_sample(shared) else {
                self.reset();
                return None;
            };
            self.current_sample = sample;
            self.has_sample = true;
        }
        self.pending_input_frames = 0;

        if !self.has_sample {
            let Some(sample) = pop_monitor_sample(shared) else {
                self.reset();
                return None;
            };
            self.current_sample = sample;
            self.has_sample = true;
        }

        let sample = self.current_sample;
        self.source_remainder = self.source_remainder.saturating_add(self.input_sample_rate);
        let advance = self.source_remainder / self.output_sample_rate;
        if advance > 0 {
            self.source_remainder %= self.output_sample_rate;
            self.pending_input_frames = usize::try_from(advance).unwrap_or(usize::MAX);
        }
        Some(sample)
    }
}

#[derive(Debug, PartialEq)]
enum CaptureWriterPushError {
    Full,
    Closed,
}

enum CaptureWriterRead {
    Sample(f32),
    Closed,
    Cancelled,
}

// SPSC only: the CPAL input callback is the sole producer and the writer thread
// is the sole consumer. Command/status paths must not push to or pop from it.
struct CaptureWriterRing {
    samples: Vec<AtomicU32>,
    capacity: usize,
    read_index: AtomicUsize,
    write_index: AtomicUsize,
    closed: AtomicBool,
    cancelled: AtomicBool,
    wait_lock: Mutex<()>,
    available: Condvar,
}

impl CaptureWriterRing {
    fn new(capacity: usize) -> Self {
        let capacity = capacity.max(1);
        Self {
            samples: (0..capacity)
                .map(|_| AtomicU32::new(0.0f32.to_bits()))
                .collect(),
            capacity,
            read_index: AtomicUsize::new(0),
            write_index: AtomicUsize::new(0),
            closed: AtomicBool::new(true),
            cancelled: AtomicBool::new(false),
            wait_lock: Mutex::new(()),
            available: Condvar::new(),
        }
    }

    fn reset_for_recording(&self) {
        self.read_index.store(0, Ordering::Release);
        self.write_index.store(0, Ordering::Release);
        self.cancelled.store(false, Ordering::Release);
        self.closed.store(false, Ordering::Release);
        self.available.notify_all();
    }

    fn push(&self, sample: f32) -> Result<(), CaptureWriterPushError> {
        if self.cancelled.load(Ordering::Acquire) || self.closed.load(Ordering::Acquire) {
            return Err(CaptureWriterPushError::Closed);
        }
        let write = self.write_index.load(Ordering::Relaxed);
        let read = self.read_index.load(Ordering::Acquire);
        if write.wrapping_sub(read) >= self.capacity {
            return Err(CaptureWriterPushError::Full);
        }
        self.samples[write % self.capacity].store(sample.to_bits(), Ordering::Relaxed);
        self.write_index
            .store(write.wrapping_add(1), Ordering::Release);
        Ok(())
    }

    fn notify_available(&self) {
        self.available.notify_one();
    }

    fn pop(&self) -> Option<f32> {
        loop {
            let read = self.read_index.load(Ordering::Acquire);
            let write = self.write_index.load(Ordering::Acquire);
            if read == write {
                return None;
            }
            let sample = f32::from_bits(self.samples[read % self.capacity].load(Ordering::Relaxed));
            if self
                .read_index
                .compare_exchange(
                    read,
                    read.wrapping_add(1),
                    Ordering::AcqRel,
                    Ordering::Acquire,
                )
                .is_ok()
            {
                return Some(sample);
            }
        }
    }

    fn pop_or_wait(&self) -> CaptureWriterRead {
        loop {
            if self.cancelled.load(Ordering::Acquire) {
                return CaptureWriterRead::Cancelled;
            }
            if let Some(sample) = self.pop() {
                return CaptureWriterRead::Sample(sample);
            }
            if self.closed.load(Ordering::Acquire) {
                return CaptureWriterRead::Closed;
            }
            let Ok(guard) = self.wait_lock.lock() else {
                return CaptureWriterRead::Cancelled;
            };
            if self.cancelled.load(Ordering::Acquire)
                || self.closed.load(Ordering::Acquire)
                || self.len() > 0
            {
                drop(guard);
                continue;
            }
            let _ = self.available.wait_timeout(guard, Duration::from_millis(2));
        }
    }

    fn close(&self) {
        self.closed.store(true, Ordering::Release);
        self.available.notify_all();
    }

    fn cancel(&self) {
        self.cancelled.store(true, Ordering::Release);
        self.closed.store(true, Ordering::Release);
        self.available.notify_all();
    }

    fn len(&self) -> usize {
        let read = self.read_index.load(Ordering::Acquire);
        let write = self.write_index.load(Ordering::Acquire);
        write.wrapping_sub(read).min(self.capacity)
    }
}

struct RecordingShared {
    writer_ring: Arc<CaptureWriterRing>,
    monitor_ring: MonitorRing,
    sample_rate: u32,
    monitor_enabled: AtomicBool,
    monitor_gain_bits: AtomicU32,
    monitor_pan_bits: AtomicU32,
    capture_enabled: AtomicBool,
    peak_bits: AtomicU32,
    input_frame_count: AtomicU64,
    captured_frame_count: AtomicU64,
    capture_start_input_frame: AtomicU64,
    first_input_frame: AtomicU64,
    active_input_callback_count: AtomicUsize,
    dropped_input_frame_count: AtomicU64,
    monitor_underrun_count: AtomicU64,
    monitor_overrun_count: AtomicU64,
    warning_code: AtomicU8,
    last_error: Mutex<Option<String>>,
}

impl RecordingShared {
    fn new(
        sample_rate: u32,
        monitor_enabled: bool,
        monitor_volume: f64,
        monitor_pan: f64,
        capture_enabled: bool,
    ) -> Self {
        Self::new_with_writer_capacity(
            sample_rate,
            monitor_enabled,
            monitor_volume,
            monitor_pan,
            capture_enabled,
            sample_rate as usize * WRITER_RING_SECONDS,
        )
    }

    fn new_with_writer_capacity(
        sample_rate: u32,
        monitor_enabled: bool,
        monitor_volume: f64,
        monitor_pan: f64,
        capture_enabled: bool,
        writer_sample_capacity: usize,
    ) -> Self {
        Self {
            writer_ring: Arc::new(CaptureWriterRing::new(writer_sample_capacity)),
            monitor_ring: MonitorRing::new(sample_rate as usize * MONITOR_BUFFER_SECONDS),
            sample_rate,
            monitor_enabled: AtomicBool::new(monitor_enabled),
            monitor_gain_bits: AtomicU32::new(clamp_monitor_gain(monitor_volume).to_bits()),
            monitor_pan_bits: AtomicU32::new(clamp_monitor_pan(monitor_pan).to_bits()),
            capture_enabled: AtomicBool::new(capture_enabled),
            peak_bits: AtomicU32::new(0.0f32.to_bits()),
            input_frame_count: AtomicU64::new(0),
            captured_frame_count: AtomicU64::new(0),
            capture_start_input_frame: AtomicU64::new(if capture_enabled { 0 } else { NO_FRAME }),
            first_input_frame: AtomicU64::new(NO_FRAME),
            active_input_callback_count: AtomicUsize::new(0),
            dropped_input_frame_count: AtomicU64::new(0),
            monitor_underrun_count: AtomicU64::new(0),
            monitor_overrun_count: AtomicU64::new(0),
            warning_code: AtomicU8::new(RECORDING_WARNING_NONE),
            last_error: Mutex::new(None),
        }
    }

    fn monitor_gain(&self) -> f32 {
        f32::from_bits(self.monitor_gain_bits.load(Ordering::Relaxed))
    }

    fn monitor_pan(&self) -> f32 {
        f32::from_bits(self.monitor_pan_bits.load(Ordering::Relaxed))
    }

    fn peak(&self) -> f32 {
        f32::from_bits(self.peak_bits.load(Ordering::Relaxed))
    }

    fn update_peak(&self, block_peak: f32) {
        let mut current_bits = self.peak_bits.load(Ordering::Relaxed);
        loop {
            let current_peak = f32::from_bits(current_bits);
            let next_peak = block_peak.max(current_peak * 0.82);
            let next_bits = next_peak.to_bits();
            match self.peak_bits.compare_exchange_weak(
                current_bits,
                next_bits,
                Ordering::Relaxed,
                Ordering::Relaxed,
            ) {
                Ok(_) => break,
                Err(value) => current_bits = value,
            }
        }
    }

    fn set_monitor_settings(&self, enabled: bool, volume: f64, pan: f64) {
        self.monitor_gain_bits
            .store(clamp_monitor_gain(volume).to_bits(), Ordering::Relaxed);
        self.monitor_pan_bits
            .store(clamp_monitor_pan(pan).to_bits(), Ordering::Relaxed);
        self.monitor_enabled.store(enabled, Ordering::Release);
        if !enabled {
            self.monitor_ring.clear();
        }
    }

    fn set_capture_enabled(&self, enabled: bool) {
        self.capture_enabled.store(enabled, Ordering::Release);
    }

    fn set_last_error(&self, message: String) {
        if let Ok(mut last_error) = self.last_error.lock() {
            *last_error = Some(message);
        }
    }

    fn clear_last_error(&self) {
        if let Ok(mut last_error) = self.last_error.lock() {
            *last_error = None;
        }
        self.warning_code
            .store(RECORDING_WARNING_NONE, Ordering::Release);
    }

    fn set_warning_if_none(&self, warning: u8) {
        let _ = self.warning_code.compare_exchange(
            RECORDING_WARNING_NONE,
            warning,
            Ordering::AcqRel,
            Ordering::Relaxed,
        );
    }

    fn last_error_message(&self) -> Option<String> {
        if let Ok(last_error) = self.last_error.lock() {
            if last_error.is_some() {
                return last_error.clone();
            }
        }
        match self.warning_code.load(Ordering::Acquire) {
            RECORDING_WARNING_CAPTURE_BUFFER_FULL => Some(CAPTURE_BUFFER_FULL_WARNING.to_string()),
            RECORDING_WARNING_WRITER_STOPPED => Some(CAPTURE_WRITER_STOPPED_WARNING.to_string()),
            _ => None,
        }
    }
}

fn clamp_monitor_gain(volume: f64) -> f32 {
    volume.clamp(0.0, 1.2) as f32
}

fn clamp_monitor_pan(pan: f64) -> f32 {
    pan.clamp(-1.0, 1.0) as f32
}

fn frame_option(value: u64) -> Option<u64> {
    if value == NO_FRAME {
        None
    } else {
        Some(value)
    }
}

fn finite_nonnegative(value: f64) -> Option<f64> {
    if value.is_finite() && value >= 0.0 {
        Some(value)
    } else {
        None
    }
}

fn finite_nonnegative_option(value: Option<f64>) -> Option<f64> {
    value.and_then(finite_nonnegative)
}

struct InputCallbackGuard<'a> {
    shared: &'a RecordingShared,
}

impl<'a> InputCallbackGuard<'a> {
    fn new(shared: &'a RecordingShared) -> Self {
        shared
            .active_input_callback_count
            .fetch_add(1, Ordering::AcqRel);
        Self { shared }
    }
}

impl Drop for InputCallbackGuard<'_> {
    fn drop(&mut self) {
        self.shared
            .active_input_callback_count
            .fetch_sub(1, Ordering::AcqRel);
    }
}

#[tauri::command]
pub fn native_recording_status(
    state: tauri::State<'_, NativeRecordingState>,
) -> NativeRecordingStatus {
    match state.lock() {
        Ok(runtime) => runtime_status(&runtime),
        Err(_) => NativeRecordingStatus {
            backend: "native-cpal".to_string(),
            available: true,
            active: false,
            monitoring: false,
            track_id: None,
            recording_session_id: None,
            requested_start_bar: None,
            requested_start_seconds: None,
            requested_sample_rate: 0,
            capture_sample_rate: 0,
            elapsed_seconds: 0.0,
            sample_rate: 0,
            capture_started_at_unix_ms: None,
            input_device_name: None,
            output_device_name: None,
            peak: 0.0,
            sample_count: 0,
            monitor_buffered_frame_count: 0,
            input_frame_count: 0,
            captured_frame_count: 0,
            capture_start_input_frame: None,
            first_input_frame: None,
            dropped_input_frame_count: 0,
            monitor_underrun_count: 0,
            monitor_overrun_count: 0,
            last_error: Some("Native recording state is unavailable.".to_string()),
        },
    }
}

#[tauri::command]
pub fn native_recording_start(
    payload: NativeRecordingStartPayload,
    state: tauri::State<'_, NativeRecordingState>,
) -> Result<NativeRecordingStatus, String> {
    let mut runtime = state
        .lock()
        .map_err(|_| "Native recording state is unavailable.".to_string())?;
    if let Some(message) = recording_start_blocker(&runtime) {
        return Err(message.to_string());
    }
    if runtime.input_stream.is_some() {
        if runtime.track_id.as_deref() == Some(payload.track_id.as_str())
            && runtime.shared.is_some()
        {
            return promote_preview_to_recording(&mut runtime, payload);
        }
        clear_runtime_streams(&mut runtime);
    }
    if payload.project_file_path.trim().is_empty() {
        return Err("Save the .pocketdaw project before recording so audio can be stored under project-media/recordings.".to_string());
    }

    let host = preferred_host();
    let input = select_input_device(&host, payload.input_device_id.as_deref())
        .ok_or_else(|| "No input device is available for live recording. Refresh Audio Settings and choose an input.".to_string())?;
    let input_device_name = device_name(&input).unwrap_or_else(|_| "Input device".to_string());
    let config = input
        .default_input_config()
        .map_err(|err| format!("Could not use the selected input device for recording: {err}"))?;
    let sample_rate = config.sample_rate();
    let input_channels = config.channels().max(1) as usize;
    let stream_config: cpal::StreamConfig = config.clone().into();
    let (target_path, target_relative_path, file_name) = recording_output_path(
        &payload.project_file_path,
        &payload.project_title,
        &payload.track_name,
    )?;
    let shared = Arc::new(RecordingShared::new(
        sample_rate,
        payload.monitor_enabled,
        payload.monitor_volume,
        payload.monitor_pan,
        false,
    ));
    let err_shared = Arc::clone(&shared);
    let error_callback = move |err| {
        err_shared.set_monitor_settings(false, 0.0, 0.0);
        err_shared.set_last_error(format!("Pocket DAW recording stream error: {err}"));
        eprintln!("Pocket DAW recording stream error: {err}");
    };
    let input_stream = match config.sample_format() {
        cpal::SampleFormat::F32 => {
            let shared = Arc::clone(&shared);
            input.build_input_stream(
                &stream_config,
                move |data: &[f32], _| capture_f32(data, input_channels, &shared),
                error_callback,
                None,
            )
        }
        cpal::SampleFormat::I16 => {
            let shared = Arc::clone(&shared);
            input.build_input_stream(
                &stream_config,
                move |data: &[i16], _| capture_i16(data, input_channels, &shared),
                error_callback,
                None,
            )
        }
        cpal::SampleFormat::U16 => {
            let shared = Arc::clone(&shared);
            input.build_input_stream(
                &stream_config,
                move |data: &[u16], _| capture_u16(data, input_channels, &shared),
                error_callback,
                None,
            )
        }
        other => {
            return Err(format!(
                "Input device uses unsupported sample format {other:?}; Pocket DAW recording alpha supports f32/i16/u16 PCM input."
            ));
        }
    }
    .map_err(|err| format!("Could not start the input recording stream: {err}"))?;

    let mut output_device_name = None;
    let monitor_stream = if payload.monitor_enabled {
        let output =
            select_output_device(&host, payload.output_device_id.as_deref()).ok_or_else(|| {
                "Input monitor was enabled, but no output device is available.".to_string()
            })?;
        output_device_name =
            Some(device_name(&output).unwrap_or_else(|_| "Output device".to_string()));
        Some(build_monitor_stream(&output, Arc::clone(&shared))?)
    } else {
        None
    };

    let writer =
        start_recording_writer(&target_path, sample_rate, Arc::clone(&shared.writer_ring))?;
    enable_capture_on_shared(
        &shared,
        payload.monitor_enabled,
        payload.monitor_volume,
        payload.monitor_pan,
    );

    if let Err(err) = input_stream.play() {
        shared.set_capture_enabled(false);
        cancel_recording_writer(writer);
        return Err(format!("Could not start recording input stream: {err}"));
    }
    if let Some(stream) = monitor_stream.as_ref() {
        if let Err(err) = stream.play() {
            shared.set_capture_enabled(false);
            drop(input_stream);
            let _ = wait_for_input_callbacks_to_finish(
                &shared,
                Duration::from_millis(INPUT_CALLBACK_DRAIN_TIMEOUT_MS),
            );
            cancel_recording_writer(writer);
            return Err(format!("Could not start input monitoring stream: {err}"));
        }
    }

    runtime.input_stream = Some(input_stream);
    runtime.monitor_stream = monitor_stream;
    runtime.writer = Some(writer);
    runtime.shared = Some(shared);
    runtime.started_at = Some(Instant::now());
    runtime.target_path = Some(target_path);
    runtime.target_relative_path = Some(target_relative_path);
    runtime.file_name = Some(file_name);
    runtime.track_id = Some(payload.track_id);
    runtime.recording_session_id = payload.recording_session_id;
    runtime.requested_start_bar = finite_nonnegative(payload.start_bar);
    runtime.requested_start_seconds = finite_nonnegative_option(payload.requested_start_seconds);
    runtime.requested_sample_rate = payload.requested_sample_rate;
    runtime.capture_started_at_unix_ms = unix_now_ms();
    runtime.input_device_name = Some(input_device_name);
    runtime.output_device_name = output_device_name;
    runtime.last_error = None;
    Ok(runtime_status(&runtime))
}

fn recording_start_blocker(runtime: &NativeRecordingRuntime) -> Option<&'static str> {
    if runtime.target_path.is_some() {
        return Some("A recording is already active. Stop it before starting another take.");
    }
    None
}

fn promote_preview_to_recording(
    runtime: &mut NativeRecordingRuntime,
    payload: NativeRecordingStartPayload,
) -> Result<NativeRecordingStatus, String> {
    if payload.project_file_path.trim().is_empty() {
        return Err("Save the .pocketdaw project before recording so audio can be stored under project-media/recordings.".to_string());
    }
    let shared = runtime
        .shared
        .as_ref()
        .cloned()
        .ok_or_else(|| "Armed input preview is unavailable for recording.".to_string())?;
    let (target_path, target_relative_path, file_name) = recording_output_path(
        &payload.project_file_path,
        &payload.project_title,
        &payload.track_name,
    )?;

    let mut prepared_monitor_stream = None;
    let mut prepared_output_device_name = None;
    if payload.monitor_enabled && runtime.monitor_stream.is_none() {
        let host = preferred_host();
        let output =
            select_output_device(&host, payload.output_device_id.as_deref()).ok_or_else(|| {
                "Input monitor was enabled, but no output device is available.".to_string()
            })?;
        let output_device_name =
            device_name(&output).unwrap_or_else(|_| "Output device".to_string());
        let monitor_stream = build_monitor_stream(&output, Arc::clone(&shared))?;
        monitor_stream
            .play()
            .map_err(|err| format!("Could not start input monitoring stream: {err}"))?;
        prepared_monitor_stream = Some(monitor_stream);
        prepared_output_device_name = Some(output_device_name);
    }

    let sample_rate = shared_sample_rate(&shared)?;
    let writer =
        start_recording_writer(&target_path, sample_rate, Arc::clone(&shared.writer_ring))?;

    enable_capture_on_shared(
        &shared,
        payload.monitor_enabled,
        payload.monitor_volume,
        payload.monitor_pan,
    );

    if let Some(monitor_stream) = prepared_monitor_stream {
        runtime.monitor_stream = Some(monitor_stream);
        runtime.output_device_name = prepared_output_device_name;
    } else if !payload.monitor_enabled {
        runtime.monitor_stream.take();
        runtime.output_device_name = None;
    }

    runtime.started_at = Some(Instant::now());
    runtime.writer = Some(writer);
    runtime.target_path = Some(target_path);
    runtime.target_relative_path = Some(target_relative_path);
    runtime.file_name = Some(file_name);
    runtime.track_id = Some(payload.track_id);
    runtime.recording_session_id = payload.recording_session_id;
    runtime.requested_start_bar = finite_nonnegative(payload.start_bar);
    runtime.requested_start_seconds = finite_nonnegative_option(payload.requested_start_seconds);
    runtime.requested_sample_rate = payload.requested_sample_rate;
    runtime.capture_started_at_unix_ms = unix_now_ms();
    runtime.last_error = None;
    Ok(runtime_status(runtime))
}

#[tauri::command]
pub fn native_recording_start_preview(
    payload: NativeRecordingPreviewPayload,
    state: tauri::State<'_, NativeRecordingState>,
) -> Result<NativeRecordingStatus, String> {
    let mut runtime = state
        .lock()
        .map_err(|_| "Native recording state is unavailable.".to_string())?;
    if runtime.target_path.is_some() {
        return Err(
            "A recording is active. Stop it before changing armed input monitoring.".to_string(),
        );
    }
    clear_runtime_streams(&mut runtime);

    let host = preferred_host();
    let input = select_input_device(&host, payload.input_device_id.as_deref())
        .ok_or_else(|| "No input device is available for armed input metering. Refresh Audio Settings and choose an input.".to_string())?;
    let input_device_name = device_name(&input).unwrap_or_else(|_| "Input device".to_string());
    let config = input.default_input_config().map_err(|err| {
        format!("Could not use the selected input device for armed input metering: {err}")
    })?;
    let sample_rate = config.sample_rate();
    let input_channels = config.channels().max(1) as usize;
    let stream_config: cpal::StreamConfig = config.clone().into();
    let shared = Arc::new(RecordingShared::new(
        sample_rate,
        payload.monitor_enabled,
        payload.monitor_volume,
        payload.monitor_pan,
        false,
    ));
    let err_shared = Arc::clone(&shared);
    let error_callback = move |err| {
        err_shared.set_monitor_settings(false, 0.0, 0.0);
        err_shared.set_last_error(format!(
            "Pocket DAW armed input preview stream error: {err}"
        ));
        eprintln!("Pocket DAW armed input preview stream error: {err}");
    };
    let input_stream = match config.sample_format() {
        cpal::SampleFormat::F32 => {
            let shared = Arc::clone(&shared);
            input.build_input_stream(
                &stream_config,
                move |data: &[f32], _| capture_f32(data, input_channels, &shared),
                error_callback,
                None,
            )
        }
        cpal::SampleFormat::I16 => {
            let shared = Arc::clone(&shared);
            input.build_input_stream(
                &stream_config,
                move |data: &[i16], _| capture_i16(data, input_channels, &shared),
                error_callback,
                None,
            )
        }
        cpal::SampleFormat::U16 => {
            let shared = Arc::clone(&shared);
            input.build_input_stream(
                &stream_config,
                move |data: &[u16], _| capture_u16(data, input_channels, &shared),
                error_callback,
                None,
            )
        }
        other => {
            return Err(format!(
                "Input device uses unsupported sample format {other:?}; Pocket DAW input metering supports f32/i16/u16 PCM input."
            ));
        }
    }
    .map_err(|err| format!("Could not start the armed input metering stream: {err}"))?;

    let mut output_device_name = None;
    let monitor_stream = if payload.monitor_enabled {
        let output =
            select_output_device(&host, payload.output_device_id.as_deref()).ok_or_else(|| {
                "Input monitor was enabled, but no output device is available.".to_string()
            })?;
        output_device_name =
            Some(device_name(&output).unwrap_or_else(|_| "Output device".to_string()));
        Some(build_monitor_stream(&output, Arc::clone(&shared))?)
    } else {
        None
    };

    input_stream
        .play()
        .map_err(|err| format!("Could not start armed input metering stream: {err}"))?;
    if let Some(stream) = monitor_stream.as_ref() {
        stream
            .play()
            .map_err(|err| format!("Could not start input monitoring stream: {err}"))?;
    }

    runtime.input_stream = Some(input_stream);
    runtime.monitor_stream = monitor_stream;
    runtime.shared = Some(shared);
    runtime.started_at = None;
    runtime.target_path = None;
    runtime.target_relative_path = None;
    runtime.file_name = None;
    runtime.track_id = Some(payload.track_id);
    runtime.recording_session_id = None;
    runtime.requested_start_bar = None;
    runtime.requested_start_seconds = None;
    runtime.requested_sample_rate = 0;
    runtime.capture_started_at_unix_ms = None;
    runtime.input_device_name = Some(input_device_name);
    runtime.output_device_name = output_device_name;
    runtime.last_error = None;
    Ok(runtime_status(&runtime))
}

#[tauri::command]
pub fn native_recording_stop_preview(
    state: tauri::State<'_, NativeRecordingState>,
) -> Result<NativeRecordingStatus, String> {
    let mut runtime = state
        .lock()
        .map_err(|_| "Native recording state is unavailable.".to_string())?;
    if runtime.target_path.is_none() {
        clear_runtime_streams(&mut runtime);
    }
    Ok(runtime_status(&runtime))
}

#[tauri::command]
pub fn native_recording_stop(
    state: tauri::State<'_, NativeRecordingState>,
) -> Result<NativeRecordingStopResult, String> {
    let mut runtime = state
        .lock()
        .map_err(|_| "Native recording state is unavailable.".to_string())?;
    stop_recording_runtime(&mut runtime)
}

fn stop_recording_runtime(
    runtime: &mut NativeRecordingRuntime,
) -> Result<NativeRecordingStopResult, String> {
    stop_recording_runtime_with_callback_drain_timeout(
        runtime,
        Duration::from_millis(INPUT_CALLBACK_DRAIN_TIMEOUT_MS),
    )
}

fn stop_recording_runtime_with_callback_drain_timeout(
    runtime: &mut NativeRecordingRuntime,
    callback_drain_timeout: Duration,
) -> Result<NativeRecordingStopResult, String> {
    let Some(shared) = runtime.shared.as_ref().cloned() else {
        return Err("No active recording to stop.".to_string());
    };
    let target_path = runtime
        .target_path
        .clone()
        .ok_or_else(|| "Recording target path was not prepared.".to_string())?;
    let target_relative_path = runtime
        .target_relative_path
        .clone()
        .ok_or_else(|| "Recording target relative path was not prepared.".to_string())?;
    let file_name = runtime
        .file_name
        .clone()
        .ok_or_else(|| "Recording file name was not prepared.".to_string())?;
    let track_id = runtime
        .track_id
        .clone()
        .ok_or_else(|| "Recording track id was not prepared.".to_string())?;
    let recording_session_id = runtime.recording_session_id;
    let requested_start_bar = runtime.requested_start_bar;
    let requested_start_seconds = runtime.requested_start_seconds;
    let requested_sample_rate = runtime.requested_sample_rate;
    let capture_started_at_unix_ms = runtime.capture_started_at_unix_ms;
    let Some(writer) = runtime.writer.take() else {
        let err = "Recording writer was not prepared.".to_string();
        shared.set_capture_enabled(false);
        runtime.input_stream.take();
        runtime.monitor_stream.take();
        let _ = wait_for_input_callbacks_to_finish(&shared, callback_drain_timeout);
        shared.writer_ring.cancel();
        reset_recording_runtime_after_stop(runtime, Some(err.clone()));
        return Err(err);
    };
    shared.set_capture_enabled(false);
    runtime.input_stream.take();
    runtime.monitor_stream.take();
    if let Err(err) = wait_for_input_callbacks_to_finish(&shared, callback_drain_timeout) {
        cancel_recording_writer(writer);
        reset_recording_runtime_after_stop(runtime, Some(err.clone()));
        return Err(err);
    }
    let (
        sample_rate,
        peak,
        input_frame_count,
        _captured_frame_count,
        capture_start_input_frame,
        first_input_frame,
        dropped_input_frame_count,
        monitor_buffered_frame_count,
        monitor_underrun_count,
        monitor_overrun_count,
    ) = {
        writer.queue.close();
        (
            shared.sample_rate,
            shared.peak(),
            shared.input_frame_count.load(Ordering::Acquire),
            shared.captured_frame_count.load(Ordering::Acquire),
            frame_option(shared.capture_start_input_frame.load(Ordering::Acquire)),
            frame_option(shared.first_input_frame.load(Ordering::Acquire)),
            shared.dropped_input_frame_count.load(Ordering::Acquire),
            shared.monitor_ring.len() as u64,
            shared.monitor_underrun_count.load(Ordering::Acquire),
            shared.monitor_overrun_count.load(Ordering::Acquire),
        )
    };
    let writer_summary = match finalize_recording_writer(writer) {
        Ok(summary) => summary,
        Err(err) => {
            reset_recording_runtime_after_stop(runtime, Some(err.clone()));
            return Err(err);
        }
    };
    let captured_frame_count = writer_summary.sample_count;
    let duration_seconds = if sample_rate > 0 {
        captured_frame_count as f64 / sample_rate as f64
    } else {
        0.0
    };
    let size_bytes = writer_summary.size_bytes;
    reset_recording_runtime_after_stop(runtime, None);
    Ok(NativeRecordingStopResult {
        track_id,
        recording_session_id,
        requested_start_bar,
        requested_start_seconds,
        requested_sample_rate,
        capture_sample_rate: sample_rate,
        target_path: target_path.to_string_lossy().to_string(),
        target_relative_path,
        file_name,
        duration_seconds,
        sample_rate,
        channels: 1,
        size_bytes,
        peak,
        capture_started_at_unix_ms,
        input_frame_count,
        captured_frame_count,
        capture_start_input_frame,
        first_input_frame,
        dropped_input_frame_count,
        monitor_buffered_frame_count,
        monitor_underrun_count,
        monitor_overrun_count,
    })
}

#[tauri::command]
pub fn native_recording_update_monitor(
    payload: NativeRecordingMonitorPayload,
    state: tauri::State<'_, NativeRecordingState>,
) -> Result<NativeRecordingStatus, String> {
    let mut runtime = state
        .lock()
        .map_err(|_| "Native recording state is unavailable.".to_string())?;
    let shared = runtime.shared.as_ref().cloned().ok_or_else(|| {
        "No active recording or armed input preview is available for input monitoring.".to_string()
    })?;

    if !payload.monitor_enabled {
        apply_monitor_settings(&shared, false, payload.monitor_volume, payload.monitor_pan);
        runtime.monitor_stream.take();
        runtime.output_device_name = None;
        return Ok(runtime_status(&runtime));
    }

    let host = preferred_host();
    let output =
        select_output_device(&host, payload.output_device_id.as_deref()).ok_or_else(|| {
            "Input monitor was enabled, but no output device is available.".to_string()
        })?;
    let output_device_name = device_name(&output).unwrap_or_else(|_| "Output device".to_string());
    let monitor_stream = build_monitor_stream(&output, Arc::clone(&shared))?;
    let old_monitor_stream = runtime.monitor_stream.take();
    apply_monitor_settings(&shared, false, payload.monitor_volume, payload.monitor_pan);
    runtime.output_device_name = None;
    drop(old_monitor_stream);
    if let Err(err) = monitor_stream.play() {
        let message = format!("Could not start input monitoring stream: {err}");
        runtime.last_error = Some(message.clone());
        return Err(message);
    }
    apply_monitor_settings(&shared, true, payload.monitor_volume, payload.monitor_pan);
    runtime.monitor_stream = Some(monitor_stream);
    runtime.output_device_name = Some(output_device_name);
    runtime.last_error = None;
    Ok(runtime_status(&runtime))
}

fn reset_recording_runtime_after_stop(
    runtime: &mut NativeRecordingRuntime,
    last_error: Option<String>,
) {
    runtime.started_at = None;
    runtime.shared.take();
    runtime.target_path = None;
    runtime.target_relative_path = None;
    runtime.file_name = None;
    runtime.track_id = None;
    runtime.recording_session_id = None;
    runtime.requested_start_bar = None;
    runtime.requested_start_seconds = None;
    runtime.requested_sample_rate = 0;
    runtime.capture_started_at_unix_ms = None;
    runtime.input_device_name = None;
    runtime.output_device_name = None;
    runtime.last_error = last_error;
}

fn runtime_status(runtime: &NativeRecordingRuntime) -> NativeRecordingStatus {
    let recording_active = runtime.target_path.is_some();
    let elapsed_seconds = if recording_active {
        runtime
            .started_at
            .map(|started| started.elapsed().as_secs_f64())
            .unwrap_or(0.0)
    } else {
        0.0
    };
    let (
        monitoring,
        sample_rate,
        peak,
        sample_count,
        monitor_buffered_frame_count,
        input_frame_count,
        captured_frame_count,
        capture_start_input_frame,
        first_input_frame,
        dropped_input_frame_count,
        monitor_underrun_count,
        monitor_overrun_count,
        shared_last_error,
    ) = runtime
        .shared
        .as_ref()
        .map(|shared| {
            let captured_frame_count = shared.captured_frame_count.load(Ordering::Acquire);
            (
                shared.monitor_enabled.load(Ordering::Acquire),
                shared.sample_rate,
                shared.peak(),
                usize::try_from(captured_frame_count).unwrap_or(usize::MAX),
                shared.monitor_ring.len() as u64,
                shared.input_frame_count.load(Ordering::Acquire),
                captured_frame_count,
                frame_option(shared.capture_start_input_frame.load(Ordering::Acquire)),
                frame_option(shared.first_input_frame.load(Ordering::Acquire)),
                shared.dropped_input_frame_count.load(Ordering::Acquire),
                shared.monitor_underrun_count.load(Ordering::Acquire),
                shared.monitor_overrun_count.load(Ordering::Acquire),
                shared.last_error_message(),
            )
        })
        .unwrap_or((false, 0, 0.0, 0, 0, 0, 0, None, None, 0, 0, 0, None));
    NativeRecordingStatus {
        backend: "native-cpal".to_string(),
        available: true,
        active: recording_active,
        monitoring,
        track_id: runtime.track_id.clone(),
        recording_session_id: runtime.recording_session_id,
        requested_start_bar: runtime.requested_start_bar,
        requested_start_seconds: runtime.requested_start_seconds,
        requested_sample_rate: runtime.requested_sample_rate,
        capture_sample_rate: sample_rate,
        elapsed_seconds,
        sample_rate,
        capture_started_at_unix_ms: runtime.capture_started_at_unix_ms,
        input_device_name: runtime.input_device_name.clone(),
        output_device_name: runtime.output_device_name.clone(),
        peak,
        sample_count,
        monitor_buffered_frame_count,
        input_frame_count,
        captured_frame_count,
        capture_start_input_frame,
        first_input_frame,
        dropped_input_frame_count,
        monitor_underrun_count,
        monitor_overrun_count,
        last_error: runtime.last_error.clone().or(shared_last_error),
    }
}

fn clear_runtime_streams(runtime: &mut NativeRecordingRuntime) {
    if let Some(shared) = runtime.shared.as_ref() {
        shared.set_capture_enabled(false);
    }
    runtime.input_stream.take();
    runtime.monitor_stream.take();
    if let Some(shared) = runtime.shared.as_ref() {
        if let Err(err) = wait_for_input_callbacks_to_finish(
            shared,
            Duration::from_millis(INPUT_CALLBACK_DRAIN_TIMEOUT_MS),
        ) {
            shared.set_last_error(err);
        }
        shared.writer_ring.cancel();
    }
    if let Some(writer) = runtime.writer.take() {
        cancel_recording_writer(writer);
    }
    runtime.shared.take();
    runtime.started_at = None;
    runtime.target_path = None;
    runtime.target_relative_path = None;
    runtime.file_name = None;
    runtime.track_id = None;
    runtime.recording_session_id = None;
    runtime.requested_start_bar = None;
    runtime.requested_start_seconds = None;
    runtime.requested_sample_rate = 0;
    runtime.capture_started_at_unix_ms = None;
    runtime.input_device_name = None;
    runtime.output_device_name = None;
}

fn apply_monitor_settings(shared: &Arc<RecordingShared>, enabled: bool, volume: f64, pan: f64) {
    shared.set_monitor_settings(enabled, volume, pan);
}

fn enable_capture_on_shared(
    shared: &Arc<RecordingShared>,
    monitor_enabled: bool,
    monitor_volume: f64,
    monitor_pan: f64,
) {
    enable_capture_on_shared_with_before_enable(
        shared,
        monitor_enabled,
        monitor_volume,
        monitor_pan,
        || {},
    );
}

fn enable_capture_on_shared_with_before_enable<F>(
    shared: &Arc<RecordingShared>,
    monitor_enabled: bool,
    monitor_volume: f64,
    monitor_pan: f64,
    before_enable: F,
) where
    F: FnOnce(),
{
    shared.set_capture_enabled(false);
    shared.monitor_ring.clear();
    shared.set_monitor_settings(monitor_enabled, monitor_volume, monitor_pan);
    shared.peak_bits.store(0.0f32.to_bits(), Ordering::Release);
    shared.captured_frame_count.store(0, Ordering::Release);
    shared.first_input_frame.store(NO_FRAME, Ordering::Release);
    shared.dropped_input_frame_count.store(0, Ordering::Release);
    shared.monitor_underrun_count.store(0, Ordering::Release);
    shared.monitor_overrun_count.store(0, Ordering::Release);
    shared.clear_last_error();
    before_enable();
    let input_frame_count = shared.input_frame_count.load(Ordering::Acquire);
    shared
        .capture_start_input_frame
        .store(input_frame_count, Ordering::Release);
    shared.set_capture_enabled(true);
}

fn capture_f32(data: &[f32], channels: usize, shared: &Arc<RecordingShared>) {
    capture_samples(
        data.chunks(channels)
            .map(|frame| *frame.first().unwrap_or(&0.0)),
        shared,
    );
}

fn capture_i16(data: &[i16], channels: usize, shared: &Arc<RecordingShared>) {
    capture_samples(
        data.chunks(channels)
            .map(|frame| *frame.first().unwrap_or(&0) as f32 / i16::MAX as f32),
        shared,
    );
}

fn capture_u16(data: &[u16], channels: usize, shared: &Arc<RecordingShared>) {
    capture_samples(
        data.chunks(channels).map(|frame| {
            (*frame.first().unwrap_or(&(u16::MAX / 2)) as f32 / u16::MAX as f32) * 2.0 - 1.0
        }),
        shared,
    );
}

fn capture_samples<I>(samples: I, shared: &Arc<RecordingShared>)
where
    I: Iterator<Item = f32>,
{
    let _callback_guard = InputCallbackGuard::new(shared);
    let mut block_peak = 0.0f32;
    let mut captured_frame_count = 0u64;
    let mut dropped_frame_count = 0u64;
    let mut first_captured_input_frame = None;
    let mut warning_code = None;
    let mut wrote_to_writer_ring = false;
    for sample in samples {
        let input_frame = shared.input_frame_count.fetch_add(1, Ordering::AcqRel);
        let mono = sample.clamp(-1.0, 1.0);
        block_peak = block_peak.max(mono.abs());
        if shared.capture_enabled.load(Ordering::Acquire) {
            let _ = shared.capture_start_input_frame.compare_exchange(
                NO_FRAME,
                input_frame,
                Ordering::AcqRel,
                Ordering::Relaxed,
            );
            match shared.writer_ring.push(mono) {
                Ok(()) => {
                    if first_captured_input_frame.is_none() {
                        first_captured_input_frame = Some(input_frame);
                    }
                    wrote_to_writer_ring = true;
                    captured_frame_count = captured_frame_count.saturating_add(1);
                }
                Err(CaptureWriterPushError::Full) => {
                    dropped_frame_count = dropped_frame_count.saturating_add(1);
                    warning_code = Some(RECORDING_WARNING_CAPTURE_BUFFER_FULL);
                }
                Err(CaptureWriterPushError::Closed) => {
                    dropped_frame_count = dropped_frame_count.saturating_add(1);
                    warning_code = Some(RECORDING_WARNING_WRITER_STOPPED);
                }
            }
        }
        if shared.monitor_enabled.load(Ordering::Acquire) && !shared.monitor_ring.push(mono) {
            shared.monitor_overrun_count.fetch_add(1, Ordering::AcqRel);
        }
    }
    if wrote_to_writer_ring {
        shared.writer_ring.notify_available();
    }
    shared.update_peak(block_peak);
    if let Some(first_captured_input_frame) = first_captured_input_frame {
        let _ = shared.first_input_frame.compare_exchange(
            NO_FRAME,
            first_captured_input_frame,
            Ordering::AcqRel,
            Ordering::Relaxed,
        );
        shared
            .captured_frame_count
            .fetch_add(captured_frame_count, Ordering::AcqRel);
    }
    if dropped_frame_count > 0 {
        shared
            .dropped_input_frame_count
            .fetch_add(dropped_frame_count, Ordering::AcqRel);
        if let Some(warning_code) = warning_code {
            shared.set_warning_if_none(warning_code);
        }
    }
}

fn wait_for_input_callbacks_to_finish(
    shared: &RecordingShared,
    timeout: Duration,
) -> Result<(), String> {
    let started_at = Instant::now();
    loop {
        if shared.active_input_callback_count.load(Ordering::Acquire) == 0 {
            return Ok(());
        }
        if started_at.elapsed() >= timeout {
            let active_count = shared.active_input_callback_count.load(Ordering::Acquire);
            return Err(format!(
                "Timed out waiting for native recording input callback to finish; {active_count} callback(s) still active."
            ));
        }
        thread::sleep(Duration::from_millis(1));
    }
}

fn shared_sample_rate(shared: &Arc<RecordingShared>) -> Result<u32, String> {
    Ok(shared.sample_rate)
}

fn cancel_recording_writer(writer: RecordingWriterRuntime) {
    writer.queue.cancel();
    let _ = finalize_recording_writer(writer);
}

fn build_monitor_stream(
    output: &cpal::Device,
    shared: Arc<RecordingShared>,
) -> Result<cpal::Stream, String> {
    let config = output
        .default_output_config()
        .map_err(|err| format!("Could not use the selected output device for monitoring: {err}"))?;
    let channels = config.channels().max(1) as usize;
    let output_sample_rate = config.sample_rate();
    let stream_config: cpal::StreamConfig = config.clone().into();
    let err_shared = Arc::clone(&shared);
    let err_callback = move |err| {
        err_shared.set_monitor_settings(false, 0.0, 0.0);
        err_shared.set_last_error(format!("Pocket DAW input monitor stream error: {err}"));
        eprintln!("Pocket DAW input monitor stream error: {err}");
    };
    match config.sample_format() {
        cpal::SampleFormat::F32 => {
            let mut resampler = MonitorResampler::new(shared.sample_rate, output_sample_rate);
            output.build_output_stream(
                &stream_config,
                move |data: &mut [f32], _| {
                    write_monitor_f32(data, channels, &shared, &mut resampler)
                },
                err_callback,
                None,
            )
        }
        cpal::SampleFormat::I16 => {
            let mut resampler = MonitorResampler::new(shared.sample_rate, output_sample_rate);
            output.build_output_stream(
                &stream_config,
                move |data: &mut [i16], _| {
                    write_monitor_i16(data, channels, &shared, &mut resampler)
                },
                err_callback,
                None,
            )
        }
        cpal::SampleFormat::U16 => {
            let mut resampler = MonitorResampler::new(shared.sample_rate, output_sample_rate);
            output.build_output_stream(
                &stream_config,
                move |data: &mut [u16], _| {
                    write_monitor_u16(data, channels, &shared, &mut resampler)
                },
                err_callback,
                None,
            )
        }
        other => {
            return Err(format!(
                "Output device uses unsupported sample format {other:?}; input monitoring supports f32/i16/u16 PCM output."
            ));
        }
    }
    .map_err(|err| format!("Could not create input monitoring stream: {err}"))
}

fn write_monitor_f32(
    data: &mut [f32],
    channels: usize,
    shared: &Arc<RecordingShared>,
    resampler: &mut MonitorResampler,
) {
    for frame in data.chunks_mut(channels) {
        let (left, right) = next_monitor_resampled_frame(shared, resampler);
        write_frame_f32(frame, left, right);
    }
}

fn write_monitor_i16(
    data: &mut [i16],
    channels: usize,
    shared: &Arc<RecordingShared>,
    resampler: &mut MonitorResampler,
) {
    for frame in data.chunks_mut(channels) {
        let (left, right) = next_monitor_resampled_frame(shared, resampler);
        write_frame_i16(frame, left, right);
    }
}

fn write_monitor_u16(
    data: &mut [u16],
    channels: usize,
    shared: &Arc<RecordingShared>,
    resampler: &mut MonitorResampler,
) {
    for frame in data.chunks_mut(channels) {
        let (left, right) = next_monitor_resampled_frame(shared, resampler);
        write_frame_u16(frame, left, right);
    }
}

fn next_monitor_resampled_frame(
    shared: &Arc<RecordingShared>,
    resampler: &mut MonitorResampler,
) -> (f32, f32) {
    if !shared.monitor_enabled.load(Ordering::Acquire) {
        resampler.reset();
        return (0.0, 0.0);
    }
    let sample = resampler.next_sample(shared).unwrap_or(0.0) * shared.monitor_gain();
    let (left, right) = pan_gains(shared.monitor_pan());
    (sample * left, sample * right)
}

fn pop_monitor_sample(shared: &Arc<RecordingShared>) -> Option<f32> {
    match shared.monitor_ring.pop() {
        Some(sample) => Some(sample),
        None => {
            shared.monitor_underrun_count.fetch_add(1, Ordering::AcqRel);
            None
        }
    }
}

fn write_frame_f32(frame: &mut [f32], left: f32, right: f32) {
    if let Some(sample) = frame.get_mut(0) {
        *sample = left.clamp(-1.0, 1.0);
    }
    if frame.len() > 1 {
        frame[1] = right.clamp(-1.0, 1.0);
    }
    for sample in frame.iter_mut().skip(2) {
        *sample = ((left + right) * 0.5).clamp(-1.0, 1.0);
    }
}

fn write_frame_i16(frame: &mut [i16], left: f32, right: f32) {
    if let Some(sample) = frame.get_mut(0) {
        *sample = f32_to_i16(left);
    }
    if frame.len() > 1 {
        frame[1] = f32_to_i16(right);
    }
    for sample in frame.iter_mut().skip(2) {
        *sample = f32_to_i16((left + right) * 0.5);
    }
}

fn write_frame_u16(frame: &mut [u16], left: f32, right: f32) {
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

fn pan_gains(pan: f32) -> (f32, f32) {
    let left = if pan > 0.0 { 1.0 - pan } else { 1.0 };
    let right = if pan < 0.0 { 1.0 + pan } else { 1.0 };
    (left, right)
}

fn f32_to_i16(value: f32) -> i16 {
    (value.clamp(-1.0, 1.0) * i16::MAX as f32) as i16
}

fn f32_to_u16(value: f32) -> u16 {
    (((value.clamp(-1.0, 1.0) * 0.5 + 0.5) * u16::MAX as f32).round() as i32)
        .clamp(0, u16::MAX as i32) as u16
}

fn preferred_host() -> cpal::Host {
    let host_id = cpal::available_hosts()
        .into_iter()
        .find(|id| format!("{:?}", id).eq_ignore_ascii_case("Wasapi"))
        .unwrap_or(cpal::default_host().id());
    cpal::host_from_id(host_id).unwrap_or_else(|_| cpal::default_host())
}

fn select_input_device(host: &cpal::Host, requested_id: Option<&str>) -> Option<cpal::Device> {
    if let Some(requested) = requested_id.filter(|value| !value.trim().is_empty()) {
        if let Ok(devices) = host.input_devices() {
            for (index, device) in devices.enumerate() {
                let name = device_name(&device).unwrap_or_else(|_| format!("Input {}", index + 1));
                if device_id(host, "input", &name) == requested {
                    return Some(device);
                }
            }
        }
    }
    host.default_input_device()
}

fn select_output_device(host: &cpal::Host, requested_id: Option<&str>) -> Option<cpal::Device> {
    if let Some(requested) = requested_id.filter(|value| !value.trim().is_empty()) {
        if let Ok(devices) = host.output_devices() {
            for (index, device) in devices.enumerate() {
                let name = device_name(&device).unwrap_or_else(|_| format!("Output {}", index + 1));
                if device_id(host, "output", &name) == requested {
                    return Some(device);
                }
            }
        }
    }
    host.default_output_device()
}

fn device_id(host: &cpal::Host, kind: &str, name: &str) -> String {
    format!(
        "{}:{}:{}",
        format!("{:?}", host.id()).to_lowercase(),
        kind,
        sanitize_id(name)
    )
}

fn device_name(device: &cpal::Device) -> Result<String, cpal::DeviceNameError> {
    device
        .description()
        .map(|description| description.name().to_string())
}

fn unix_now_ms() -> Option<u64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|value| value.as_millis().min(u64::MAX as u128) as u64)
}

fn recording_output_path(
    project_file_path: &str,
    project_title: &str,
    track_name: &str,
) -> Result<(PathBuf, String, String), String> {
    let project_path = PathBuf::from(project_file_path);
    if !project_path.is_absolute() {
        return Err("Project file path must be absolute before recording.".to_string());
    }
    let project_dir = project_path
        .parent()
        .ok_or_else(|| "Project file must be saved in a folder before recording.".to_string())?;
    let recordings_dir = project_dir.join("project-media").join("recordings");
    ensure_child_path(project_dir, &recordings_dir)?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis())
        .unwrap_or(0);
    let title = sanitize_file_stem(project_title);
    let track = sanitize_file_stem(track_name);
    let file_name = format!("{title}-{track}-{stamp}.wav");
    let target_path = recordings_dir.join(&file_name);
    ensure_child_path(&recordings_dir, &target_path)?;
    let relative = format!("project-media/recordings/{file_name}");
    Ok((target_path, relative, file_name))
}

fn ensure_child_path(parent: &Path, child: &Path) -> Result<(), String> {
    let parent_components: Vec<_> = parent.components().collect();
    let child_components: Vec<_> = child.components().collect();
    if child_components.len() < parent_components.len() {
        return Err("Recording target path is outside the saved project folder.".to_string());
    }
    if child_components
        .iter()
        .zip(parent_components.iter())
        .all(|(child, parent)| child == parent)
    {
        Ok(())
    } else {
        Err("Recording target path is outside the saved project folder.".to_string())
    }
}

fn sanitize_file_stem(value: &str) -> String {
    let safe = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    safe.chars()
        .take(36)
        .collect::<String>()
        .trim_matches('-')
        .to_string()
        .if_empty("take")
}

trait IfEmpty {
    fn if_empty(self, fallback: &str) -> String;
}

impl IfEmpty for String {
    fn if_empty(self, fallback: &str) -> String {
        if self.is_empty() {
            fallback.to_string()
        } else {
            self
        }
    }
}

fn sanitize_id(value: &str) -> String {
    value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

fn start_recording_writer(
    target_path: &Path,
    sample_rate: u32,
    queue: Arc<CaptureWriterRing>,
) -> Result<RecordingWriterRuntime, String> {
    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("Could not create project-media/recordings folder: {err}"))?;
    }
    let part_path = recording_part_path(target_path);
    match fs::remove_file(&part_path) {
        Ok(()) => {}
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {}
        Err(err) => return Err(format!("Could not clear stale recording part file: {err}")),
    }
    let mut file = File::create(&part_path)
        .map_err(|err| format!("Could not create recording part file: {err}"))?;
    write_wav_header(&mut file, sample_rate, 0)
        .map_err(|err| format!("Could not prepare recording WAV header: {err}"))?;

    let target_path = target_path.to_path_buf();
    queue.reset_for_recording();
    let writer_queue = Arc::clone(&queue);
    let handle = thread::spawn(move || {
        run_recording_writer(file, writer_queue, sample_rate, part_path, target_path)
    });
    Ok(RecordingWriterRuntime { handle, queue })
}

fn finalize_recording_writer(
    writer: RecordingWriterRuntime,
) -> Result<RecordingWriterSummary, String> {
    writer
        .handle
        .join()
        .map_err(|_| "Recording writer thread panicked.".to_string())?
}

fn run_recording_writer(
    file: File,
    queue: Arc<CaptureWriterRing>,
    sample_rate: u32,
    part_path: PathBuf,
    target_path: PathBuf,
) -> Result<RecordingWriterSummary, String> {
    let mut file = BufWriter::with_capacity(64 * 1024, file);
    let mut sample_count = 0u64;
    loop {
        match queue.pop_or_wait() {
            CaptureWriterRead::Sample(sample) => {
                if let Err(err) = file.write_all(&f32_to_i16(sample).to_le_bytes()) {
                    queue.close();
                    return Err(format!("Could not stream recorded WAV samples: {err}"));
                }
                sample_count = sample_count.saturating_add(1);
            }
            CaptureWriterRead::Closed => break,
            CaptureWriterRead::Cancelled => {
                drop(file);
                let _ = fs::remove_file(&part_path);
                return Err("Recording writer cancelled.".to_string());
            }
        }
    }

    patch_wav_header(&mut file, sample_rate, sample_count)
        .map_err(|err| format!("Could not finalize recorded WAV header: {err}"))?;
    file.flush()
        .map_err(|err| format!("Could not flush recorded WAV file: {err}"))?;
    file.get_ref()
        .sync_all()
        .map_err(|err| format!("Could not sync recorded WAV file: {err}"))?;
    drop(file);
    fs::rename(&part_path, &target_path)
        .map_err(|err| format!("Could not finalize recorded WAV file: {err}"))?;
    let size_bytes = fs::metadata(&target_path)
        .map(|metadata| metadata.len())
        .unwrap_or(44u64.saturating_add(sample_count.saturating_mul(2)));
    Ok(RecordingWriterSummary {
        sample_count,
        size_bytes,
    })
}

fn recording_part_path(target_path: &Path) -> PathBuf {
    let mut file_name = target_path
        .file_name()
        .map(|value| value.to_os_string())
        .unwrap_or_else(|| "take.wav".into());
    file_name.push(".part");
    target_path.with_file_name(file_name)
}

fn write_wav_header<W: Write>(
    writer: &mut W,
    sample_rate: u32,
    sample_count: u64,
) -> std::io::Result<()> {
    let sample_rate = sample_rate.max(1);
    let data_len = wav_data_len(sample_count);
    let riff_len = 36u32.saturating_add(data_len);
    writer.write_all(b"RIFF")?;
    writer.write_all(&riff_len.to_le_bytes())?;
    writer.write_all(b"WAVE")?;
    writer.write_all(b"fmt ")?;
    writer.write_all(&16u32.to_le_bytes())?;
    writer.write_all(&1u16.to_le_bytes())?;
    writer.write_all(&1u16.to_le_bytes())?;
    writer.write_all(&sample_rate.to_le_bytes())?;
    writer.write_all(&(sample_rate * 2).to_le_bytes())?;
    writer.write_all(&2u16.to_le_bytes())?;
    writer.write_all(&16u16.to_le_bytes())?;
    writer.write_all(b"data")?;
    writer.write_all(&data_len.to_le_bytes())?;
    Ok(())
}

fn patch_wav_header<W: Seek + Write>(
    file: &mut W,
    sample_rate: u32,
    sample_count: u64,
) -> std::io::Result<()> {
    let data_len = wav_data_len(sample_count);
    let riff_len = 36u32.saturating_add(data_len);
    file.seek(SeekFrom::Start(4))?;
    file.write_all(&riff_len.to_le_bytes())?;
    file.seek(SeekFrom::Start(24))?;
    let sample_rate = sample_rate.max(1);
    file.write_all(&sample_rate.to_le_bytes())?;
    file.seek(SeekFrom::Start(28))?;
    file.write_all(&(sample_rate * 2).to_le_bytes())?;
    file.seek(SeekFrom::Start(40))?;
    file.write_all(&data_len.to_le_bytes())?;
    file.seek(SeekFrom::End(0))?;
    Ok(())
}

fn wav_data_len(sample_count: u64) -> u32 {
    sample_count.saturating_mul(2).min(u32::MAX as u64) as u32
}

#[cfg(test)]
fn pcm16_mono_wav(sample_rate: u32, samples: &[f32]) -> Vec<u8> {
    let sample_rate = sample_rate.max(1);
    let data_len = samples.len() as u32 * 2;
    let riff_len = 36u32.saturating_add(data_len);
    let mut bytes = Vec::with_capacity(44 + samples.len() * 2);
    bytes.extend_from_slice(b"RIFF");
    bytes.extend_from_slice(&riff_len.to_le_bytes());
    bytes.extend_from_slice(b"WAVE");
    bytes.extend_from_slice(b"fmt ");
    bytes.extend_from_slice(&16u32.to_le_bytes());
    bytes.extend_from_slice(&1u16.to_le_bytes());
    bytes.extend_from_slice(&1u16.to_le_bytes());
    bytes.extend_from_slice(&sample_rate.to_le_bytes());
    bytes.extend_from_slice(&(sample_rate * 2).to_le_bytes());
    bytes.extend_from_slice(&2u16.to_le_bytes());
    bytes.extend_from_slice(&16u16.to_le_bytes());
    bytes.extend_from_slice(b"data");
    bytes.extend_from_slice(&data_len.to_le_bytes());
    for sample in samples {
        bytes.extend_from_slice(&f32_to_i16(*sample).to_le_bytes());
    }
    bytes
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_shared(capture_enabled: bool, sample_rate: u32) -> Arc<RecordingShared> {
        test_shared_with_writer_capacity(
            sample_rate,
            capture_enabled,
            sample_rate as usize * WRITER_RING_SECONDS,
        )
    }

    fn test_shared_with_writer_capacity(
        sample_rate: u32,
        capture_enabled: bool,
        writer_sample_capacity: usize,
    ) -> Arc<RecordingShared> {
        Arc::new(RecordingShared::new_with_writer_capacity(
            sample_rate,
            true,
            1.0,
            0.0,
            capture_enabled,
            writer_sample_capacity,
        ))
    }

    fn attach_test_writer(shared: &Arc<RecordingShared>) -> Arc<CaptureWriterRing> {
        shared.writer_ring.reset_for_recording();
        Arc::clone(&shared.writer_ring)
    }

    fn load_count(counter: &AtomicU64) -> u64 {
        counter.load(Ordering::Acquire)
    }

    fn load_frame(frame: &AtomicU64) -> Option<u64> {
        frame_option(frame.load(Ordering::Acquire))
    }

    fn drain_writer_ring(queue: &CaptureWriterRing) -> Vec<f32> {
        let mut samples = Vec::new();
        while let Some(sample) = queue.pop() {
            samples.push(sample);
        }
        samples
    }

    #[test]
    fn writes_pcm16_mono_wav_header_and_samples() {
        let bytes = pcm16_mono_wav(48_000, &[0.0, 1.0, -1.0]);
        assert_eq!(&bytes[0..4], b"RIFF");
        assert_eq!(&bytes[8..12], b"WAVE");
        assert_eq!(u16::from_le_bytes([bytes[22], bytes[23]]), 1);
        assert_eq!(
            u32::from_le_bytes([bytes[24], bytes[25], bytes[26], bytes[27]]),
            48_000
        );
        assert_eq!(u16::from_le_bytes([bytes[34], bytes[35]]), 16);
        assert_eq!(
            u32::from_le_bytes([bytes[40], bytes[41], bytes[42], bytes[43]]),
            6
        );
    }

    #[test]
    fn recording_writer_streams_ring_to_part_then_final_wav() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock after epoch")
            .as_nanos();
        let target_dir = std::env::temp_dir().join(format!(
            "pocket-daw-recording-writer-{}-{stamp}",
            std::process::id()
        ));
        let target_path = target_dir.join("take.wav");

        let queue = Arc::new(CaptureWriterRing::new(4));
        let writer =
            start_recording_writer(&target_path, 48_000, Arc::clone(&queue)).expect("writer");
        assert!(queue.push(0.0).is_ok());
        assert!(queue.push(1.0).is_ok());
        queue.close();

        let summary = finalize_recording_writer(writer).expect("writer summary");

        assert_eq!(summary.sample_count, 2);
        assert_eq!(summary.size_bytes, 48);
        assert!(target_path.exists());
        assert!(!recording_part_path(&target_path).exists());
        let bytes = fs::read(&target_path).expect("recorded wav");
        assert_eq!(&bytes[0..4], b"RIFF");
        assert_eq!(
            u32::from_le_bytes([bytes[40], bytes[41], bytes[42], bytes[43]]),
            4
        );

        let _ = fs::remove_dir_all(&target_dir);
    }

    #[test]
    fn creates_recording_path_under_project_media_recordings() {
        let (path, relative, file_name) =
            recording_output_path(r"C:\Songs\Example.pocketdaw", "My Song", "Live Vocals")
                .expect("path should be valid");
        let normalized = path.to_string_lossy().replace('\\', "/");
        assert!(normalized.contains("/project-media/recordings/"));
        assert!(file_name.ends_with(".wav"));
        assert!(relative.starts_with("project-media/recordings/"));
    }

    #[test]
    fn rejects_projectless_recording_path() {
        assert!(recording_output_path("Song.pocketdaw", "Song", "Track").is_err());
    }

    #[test]
    fn monitor_settings_clamp_and_clear_buffer_when_disabled() {
        let shared = test_shared(true, 48_000);
        assert!(shared.monitor_ring.push(0.25));
        assert!(shared.monitor_ring.push(-0.25));

        apply_monitor_settings(&shared, true, 2.0, -2.0);
        assert!(shared.monitor_enabled.load(Ordering::Acquire));
        assert_eq!(shared.monitor_gain(), 1.2);
        assert_eq!(shared.monitor_pan(), -1.0);
        assert_eq!(shared.monitor_ring.len(), 2);

        apply_monitor_settings(&shared, false, 0.8, 0.4);
        assert!(!shared.monitor_enabled.load(Ordering::Acquire));
        assert_eq!(shared.monitor_gain(), 0.8);
        assert_eq!(shared.monitor_pan(), 0.4);
        assert_eq!(shared.monitor_ring.len(), 0);
    }

    #[test]
    fn input_preview_updates_peak_without_storing_recorded_samples() {
        let shared = test_shared(false, 48_000);

        capture_samples([0.0, 0.75, -0.5].into_iter(), &shared);

        assert_eq!(shared.writer_ring.len(), 0);
        assert_eq!(shared.monitor_ring.len(), 3);
        assert_eq!(shared.peak(), 0.75);
    }

    #[test]
    fn capture_records_native_frame_anchors_and_counts() {
        let shared = test_shared(true, 48_000);
        shared.writer_ring.reset_for_recording();

        capture_samples([0.0, 0.25, -0.5].into_iter(), &shared);

        assert_eq!(
            drain_writer_ring(&shared.writer_ring),
            vec![0.0, 0.25, -0.5]
        );
        assert_eq!(load_count(&shared.input_frame_count), 3);
        assert_eq!(load_count(&shared.captured_frame_count), 3);
        assert_eq!(load_frame(&shared.capture_start_input_frame), Some(0));
        assert_eq!(load_frame(&shared.first_input_frame), Some(0));
        assert_eq!(load_count(&shared.dropped_input_frame_count), 0);
    }

    #[test]
    fn bounded_capture_storage_drops_new_frames_when_full() {
        let shared = test_shared_with_writer_capacity(48_000, true, 2);
        let queue = attach_test_writer(&shared);

        capture_samples([0.0, 0.25].into_iter(), &shared);
        capture_samples([-0.5, 0.75].into_iter(), &shared);

        assert_eq!(drain_writer_ring(&queue), vec![0.0, 0.25]);
        assert_eq!(load_count(&shared.input_frame_count), 4);
        assert_eq!(load_count(&shared.captured_frame_count), 2);
        assert_eq!(load_count(&shared.dropped_input_frame_count), 2);
        assert_eq!(load_frame(&shared.capture_start_input_frame), Some(0));
        assert_eq!(load_frame(&shared.first_input_frame), Some(0));
        assert_eq!(
            shared.last_error_message().as_deref(),
            Some("Native recording capture buffer reached its safety limit; additional input frames are being dropped.")
        );
    }

    #[test]
    fn status_reports_bounded_capture_drop_count_and_warning() {
        let shared = test_shared_with_writer_capacity(48_000, true, 1);
        let queue = attach_test_writer(&shared);
        capture_samples([0.25].into_iter(), &shared);
        capture_samples([0.5].into_iter(), &shared);
        let runtime = NativeRecordingRuntime {
            shared: Some(shared),
            started_at: Some(Instant::now()),
            target_path: Some(PathBuf::from(r"C:\Songs\project-media\recordings\take.wav")),
            track_id: Some("live-vocals".to_string()),
            ..NativeRecordingRuntime::default()
        };

        let status = runtime_status(&runtime);

        assert_eq!(status.sample_count, 1);
        assert_eq!(status.captured_frame_count, 1);
        assert_eq!(status.dropped_input_frame_count, 1);
        assert_eq!(drain_writer_ring(&queue), vec![0.25]);
        assert_eq!(
            status.last_error.as_deref(),
            Some("Native recording capture buffer reached its safety limit; additional input frames are being dropped.")
        );
    }

    #[test]
    fn preview_frames_do_not_set_first_input_frame_until_capture_is_enabled() {
        let shared = test_shared(false, 48_000);

        capture_samples([0.1, 0.2].into_iter(), &shared);
        assert_eq!(shared.writer_ring.len(), 0);
        assert_eq!(load_count(&shared.input_frame_count), 2);
        assert_eq!(load_count(&shared.captured_frame_count), 0);
        assert_eq!(load_frame(&shared.capture_start_input_frame), None);
        assert_eq!(load_frame(&shared.first_input_frame), None);

        let queue = {
            let queue = attach_test_writer(&shared);
            shared.dropped_input_frame_count.store(4, Ordering::Release);
            shared.set_last_error("old warning".to_string());
            enable_capture_on_shared(&shared, true, 1.0, 0.0);
            assert_eq!(load_frame(&shared.capture_start_input_frame), Some(2));
            assert_eq!(load_frame(&shared.first_input_frame), None);
            assert_eq!(load_count(&shared.dropped_input_frame_count), 0);
            assert_eq!(shared.last_error_message(), None);
            assert_eq!(shared.writer_ring.len(), 0);
            queue
        };

        capture_samples([0.5].into_iter(), &shared);

        assert_eq!(drain_writer_ring(&queue), vec![0.5]);
        assert_eq!(load_count(&shared.input_frame_count), 3);
        assert_eq!(load_count(&shared.captured_frame_count), 1);
        assert_eq!(load_frame(&shared.first_input_frame), Some(2));
    }

    #[test]
    fn capture_enable_ignores_input_until_reset_is_complete() {
        let shared = test_shared(false, 48_000);
        let queue = attach_test_writer(&shared);
        shared.captured_frame_count.store(9, Ordering::Release);
        shared
            .capture_start_input_frame
            .store(77, Ordering::Release);
        shared.first_input_frame.store(88, Ordering::Release);
        shared.dropped_input_frame_count.store(5, Ordering::Release);
        shared.set_last_error("old warning".to_string());

        enable_capture_on_shared_with_before_enable(&shared, true, 1.0, 0.0, || {
            capture_samples([0.75].into_iter(), &shared)
        });

        assert_eq!(load_count(&shared.input_frame_count), 1);
        assert_eq!(load_count(&shared.captured_frame_count), 0);
        assert_eq!(load_count(&shared.dropped_input_frame_count), 0);
        assert_eq!(load_frame(&shared.first_input_frame), None);
        assert_eq!(load_frame(&shared.capture_start_input_frame), Some(1));
        assert_eq!(shared.last_error_message(), None);
        assert_eq!(drain_writer_ring(&queue), Vec::<f32>::new());

        capture_samples([0.5].into_iter(), &shared);

        assert_eq!(drain_writer_ring(&queue), vec![0.5]);
        assert_eq!(load_count(&shared.captured_frame_count), 1);
        assert_eq!(load_frame(&shared.first_input_frame), Some(1));
    }

    #[test]
    fn monitor_counters_track_overrun_and_underrun() {
        let shared = test_shared(false, 4);

        capture_samples(std::iter::repeat_n(0.5, 10), &shared);

        assert_eq!(shared.monitor_ring.len(), 8);
        assert_eq!(load_count(&shared.monitor_overrun_count), 2);
        assert_eq!(load_count(&shared.monitor_underrun_count), 0);

        let mut resampler = MonitorResampler::new(4, 4);
        for _ in 0..8 {
            let (left, right) = next_monitor_resampled_frame(&shared, &mut resampler);
            assert!(left > 0.0 || right > 0.0);
        }
        let silent = next_monitor_resampled_frame(&shared, &mut resampler);
        assert_eq!(silent, (0.0, 0.0));

        assert_eq!(load_count(&shared.monitor_underrun_count), 1);
    }

    #[test]
    fn monitor_resampler_holds_input_when_output_rate_is_higher() {
        let shared = test_shared(false, 4);
        capture_samples([0.5].into_iter(), &shared);
        let mut resampler = MonitorResampler::new(4, 8);

        let first = next_monitor_resampled_frame(&shared, &mut resampler);
        let second = next_monitor_resampled_frame(&shared, &mut resampler);

        assert_eq!(first, (0.5, 0.5));
        assert_eq!(second, (0.5, 0.5));
        assert_eq!(load_count(&shared.monitor_underrun_count), 0);
    }

    #[test]
    fn monitor_resampler_preserves_same_rate_passthrough() {
        let shared = test_shared(false, 4);
        capture_samples([0.25, 0.5].into_iter(), &shared);
        let mut resampler = MonitorResampler::new(4, 4);

        let first = next_monitor_resampled_frame(&shared, &mut resampler);
        let second = next_monitor_resampled_frame(&shared, &mut resampler);

        assert_eq!(first, (0.25, 0.25));
        assert_eq!(second, (0.5, 0.5));
        assert_eq!(load_count(&shared.monitor_underrun_count), 0);
    }

    #[test]
    fn monitor_resampler_skips_intermediate_input_when_output_rate_is_lower() {
        let shared = test_shared(false, 8);
        capture_samples([0.25, 0.5, 0.75].into_iter(), &shared);
        let mut resampler = MonitorResampler::new(8, 4);

        let first = next_monitor_resampled_frame(&shared, &mut resampler);
        let second = next_monitor_resampled_frame(&shared, &mut resampler);

        assert_eq!(first, (0.25, 0.25));
        assert_eq!(second, (0.75, 0.75));
        assert_eq!(load_count(&shared.monitor_underrun_count), 0);
    }

    #[test]
    fn monitor_resampler_paces_44100_input_to_48000_output_without_early_underrun() {
        let shared = test_shared(false, 44_100);
        capture_samples((0..441).map(|index| index as f32 / 1000.0), &shared);
        let mut resampler = MonitorResampler::new(44_100, 48_000);

        for output_frame in 0..480 {
            let frame = next_monitor_resampled_frame(&shared, &mut resampler);
            let expected = ((output_frame * 441) / 480) as f32 / 1000.0;
            assert_eq!(frame, (expected, expected));
        }

        assert_eq!(load_count(&shared.monitor_underrun_count), 0);
    }

    #[test]
    fn monitor_ring_is_bounded_spsc_and_drops_newest_samples() {
        let ring = MonitorRing::new(2);

        assert!(ring.push(0.25));
        assert!(ring.push(0.5));
        assert!(!ring.push(0.75));
        assert_eq!(ring.len(), 2);
        assert_eq!(ring.pop(), Some(0.25));
        assert_eq!(ring.pop(), Some(0.5));
        assert_eq!(ring.pop(), None);
    }

    #[test]
    fn monitor_output_does_not_wait_on_recording_control_mutex() {
        let shared = test_shared(false, 4);
        capture_samples([0.5].into_iter(), &shared);
        let control_guard = shared.last_error.lock().expect("recording error mutex");
        let shared_for_output = Arc::clone(&shared);
        let (sender, receiver) = std::sync::mpsc::channel();
        let handle = thread::spawn(move || {
            let mut resampler = MonitorResampler::new(4, 4);
            sender
                .send(next_monitor_resampled_frame(
                    &shared_for_output,
                    &mut resampler,
                ))
                .expect("send monitor frame");
        });

        let frame = receiver.recv_timeout(std::time::Duration::from_millis(100));

        drop(control_guard);
        handle.join().expect("monitor output thread");
        assert!(
            frame.is_ok(),
            "monitor output waited on recording control mutex"
        );
        let (left, right) = frame.expect("monitor frame");
        assert!(left > 0.0 || right > 0.0);
    }

    #[test]
    fn runtime_status_reports_native_frame_counters_and_buffer_depth() {
        let shared = test_shared(true, 48_000);
        let _queue = attach_test_writer(&shared);
        capture_samples([0.25, -0.75].into_iter(), &shared);
        let runtime = NativeRecordingRuntime {
            shared: Some(shared),
            started_at: Some(Instant::now()),
            target_path: Some(PathBuf::from(r"C:\Songs\project-media\recordings\take.wav")),
            track_id: Some("live-vocals".to_string()),
            recording_session_id: Some(42),
            requested_start_bar: Some(2.5),
            requested_start_seconds: Some(6.0),
            requested_sample_rate: 44_100,
            capture_started_at_unix_ms: Some(123456),
            ..NativeRecordingRuntime::default()
        };

        let status = runtime_status(&runtime);

        assert!(status.active);
        assert_eq!(status.recording_session_id, Some(42));
        assert_eq!(status.requested_start_bar, Some(2.5));
        assert_eq!(status.requested_start_seconds, Some(6.0));
        assert_eq!(status.requested_sample_rate, 44_100);
        assert_eq!(status.capture_sample_rate, 48_000);
        assert_eq!(status.capture_started_at_unix_ms, Some(123456));
        assert_eq!(status.input_frame_count, 2);
        assert_eq!(status.captured_frame_count, 2);
        assert_eq!(status.sample_count, 2);
        assert_eq!(status.capture_start_input_frame, Some(0));
        assert_eq!(status.first_input_frame, Some(0));
        assert_eq!(status.monitor_buffered_frame_count, 2);
    }

    #[test]
    fn stop_without_writer_clears_runtime_for_retry() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock after epoch")
            .as_nanos();
        let target_dir = std::env::temp_dir().join(format!(
            "pocket-daw-recording-stop-fails-{}-{stamp}",
            std::process::id()
        ));
        fs::create_dir_all(&target_dir).expect("test target directory");

        let shared = test_shared(true, 48_000);
        let _queue = attach_test_writer(&shared);
        capture_samples([0.25].into_iter(), &shared);
        let mut runtime = NativeRecordingRuntime {
            shared: Some(shared),
            started_at: Some(Instant::now()),
            target_path: Some(target_dir.clone()),
            target_relative_path: Some("project-media/recordings/take.wav".to_string()),
            file_name: Some("take.wav".to_string()),
            track_id: Some("live-vocals".to_string()),
            capture_started_at_unix_ms: Some(123456),
            input_device_name: Some("Input".to_string()),
            output_device_name: Some("Output".to_string()),
            ..NativeRecordingRuntime::default()
        };

        let result = stop_recording_runtime(&mut runtime);

        assert!(matches!(
            result,
            Err(ref err) if err.contains("Recording writer was not prepared")
        ));
        assert!(runtime.target_path.is_none());
        assert!(runtime.target_relative_path.is_none());
        assert!(runtime.file_name.is_none());
        assert!(runtime.track_id.is_none());
        assert!(runtime.capture_started_at_unix_ms.is_none());
        assert!(runtime.shared.is_none());
        assert!(runtime.writer.is_none());
        assert!(runtime.started_at.is_none());
        assert!(runtime.last_error.is_some());
        assert_eq!(recording_start_blocker(&runtime), None);

        let _ = fs::remove_dir_all(&target_dir);
    }

    #[test]
    fn stop_timeout_cancels_writer_and_clears_runtime_for_retry() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock after epoch")
            .as_nanos();
        let target_dir = std::env::temp_dir().join(format!(
            "pocket-daw-recording-stop-timeout-{}-{stamp}",
            std::process::id()
        ));
        let target_path = target_dir.join("take.wav");

        let shared = test_shared(true, 48_000);
        let writer = start_recording_writer(&target_path, 48_000, Arc::clone(&shared.writer_ring))
            .expect("recording writer");
        shared
            .active_input_callback_count
            .store(1, Ordering::Release);
        let mut runtime = NativeRecordingRuntime {
            shared: Some(shared),
            writer: Some(writer),
            started_at: Some(Instant::now()),
            target_path: Some(target_path.clone()),
            target_relative_path: Some("project-media/recordings/take.wav".to_string()),
            file_name: Some("take.wav".to_string()),
            track_id: Some("live-vocals".to_string()),
            capture_started_at_unix_ms: Some(123456),
            input_device_name: Some("Input".to_string()),
            output_device_name: Some("Output".to_string()),
            ..NativeRecordingRuntime::default()
        };

        let result = stop_recording_runtime_with_callback_drain_timeout(
            &mut runtime,
            Duration::from_millis(1),
        );

        assert!(matches!(
            result,
            Err(ref err)
                if err.contains("Timed out waiting for native recording input callback")
        ));
        assert!(runtime.target_path.is_none());
        assert!(runtime.shared.is_none());
        assert!(runtime.writer.is_none());
        assert!(runtime.started_at.is_none());
        assert!(runtime.last_error.is_some());
        assert_eq!(recording_start_blocker(&runtime), None);
        assert!(!recording_part_path(&target_path).exists());

        let _ = fs::remove_dir_all(&target_dir);
    }

    #[test]
    fn stop_finalize_failure_clears_active_runtime_for_retry() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock after epoch")
            .as_nanos();
        let target_dir = std::env::temp_dir().join(format!(
            "pocket-daw-recording-finalize-fails-{}-{stamp}",
            std::process::id()
        ));
        let target_path = target_dir.join("take.wav");
        fs::create_dir_all(&target_path).expect("directory blocking final wav rename");

        let shared = test_shared(true, 48_000);
        let writer = start_recording_writer(&target_path, 48_000, Arc::clone(&shared.writer_ring))
            .expect("recording writer");
        capture_samples([0.0, 0.25].into_iter(), &shared);
        let mut runtime = NativeRecordingRuntime {
            shared: Some(shared),
            writer: Some(writer),
            started_at: Some(Instant::now()),
            target_path: Some(target_path.clone()),
            target_relative_path: Some("project-media/recordings/take.wav".to_string()),
            file_name: Some("take.wav".to_string()),
            track_id: Some("live-vocals".to_string()),
            capture_started_at_unix_ms: Some(123456),
            input_device_name: Some("Input".to_string()),
            output_device_name: Some("Output".to_string()),
            ..NativeRecordingRuntime::default()
        };

        let result = stop_recording_runtime(&mut runtime);

        assert!(matches!(
            result,
            Err(ref err) if err.contains("Could not finalize recorded WAV file")
        ));
        assert!(runtime.target_path.is_none());
        assert!(runtime.shared.is_none());
        assert!(runtime.writer.is_none());
        assert!(runtime.started_at.is_none());
        assert!(runtime.last_error.is_some());
        assert_eq!(recording_start_blocker(&runtime), None);

        let _ = fs::remove_dir_all(&target_dir);
    }

    #[test]
    fn cancel_recording_writer_wakes_writer_when_ring_is_empty() {
        let queue = Arc::new(CaptureWriterRing::new(1));
        queue.reset_for_recording();
        let saw_cancel = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let saw_cancel_in_writer = Arc::clone(&saw_cancel);
        let queue_for_writer = Arc::clone(&queue);
        let writer = RecordingWriterRuntime {
            handle: thread::spawn(move || {
                if matches!(queue_for_writer.pop_or_wait(), CaptureWriterRead::Cancelled) {
                    saw_cancel_in_writer.store(true, std::sync::atomic::Ordering::SeqCst);
                    return Err("Recording writer cancelled.".to_string());
                }
                Ok(RecordingWriterSummary {
                    sample_count: 1,
                    size_bytes: 46,
                })
            }),
            queue,
        };

        cancel_recording_writer(writer);

        assert!(saw_cancel.load(std::sync::atomic::Ordering::SeqCst));
    }

    #[test]
    fn stop_result_reports_writer_summary_and_drop_count() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock after epoch")
            .as_nanos();
        let target_dir = std::env::temp_dir().join(format!(
            "pocket-daw-recording-stop-overflow-{}-{stamp}",
            std::process::id()
        ));
        let target_path = target_dir.join("take.wav");

        let shared = test_shared(true, 48_000);
        let writer = start_recording_writer(&target_path, 48_000, Arc::clone(&shared.writer_ring))
            .expect("recording writer");
        capture_samples([0.0, 0.25].into_iter(), &shared);
        shared.dropped_input_frame_count.store(2, Ordering::Release);

        let mut runtime = NativeRecordingRuntime {
            shared: Some(shared),
            writer: Some(writer),
            started_at: Some(Instant::now()),
            target_path: Some(target_path.clone()),
            target_relative_path: Some("project-media/recordings/take.wav".to_string()),
            file_name: Some("take.wav".to_string()),
            track_id: Some("live-vocals".to_string()),
            recording_session_id: Some(77),
            requested_start_bar: Some(7.75),
            requested_start_seconds: Some(13.5),
            requested_sample_rate: 44_100,
            capture_started_at_unix_ms: Some(123456),
            ..NativeRecordingRuntime::default()
        };

        let result = stop_recording_runtime(&mut runtime).expect("recording stop result");

        assert_eq!(result.recording_session_id, Some(77));
        assert_eq!(result.requested_start_bar, Some(7.75));
        assert_eq!(result.requested_start_seconds, Some(13.5));
        assert_eq!(result.requested_sample_rate, 44_100);
        assert_eq!(result.capture_sample_rate, 48_000);
        assert_eq!(result.dropped_input_frame_count, 2);
        assert_eq!(result.captured_frame_count, 2);
        assert_eq!(result.duration_seconds, 2.0 / 48_000.0);
        assert_eq!(result.size_bytes, 48);
        assert_eq!(fs::metadata(&target_path).expect("recorded WAV").len(), 48);

        let _ = fs::remove_dir_all(&target_dir);
    }

    #[test]
    fn start_guard_blocks_preserved_failed_finalize_state() {
        let runtime = NativeRecordingRuntime {
            shared: Some(test_shared(true, 48_000)),
            target_path: Some(PathBuf::from(r"C:\Songs\project-media\recordings\take.wav")),
            target_relative_path: Some("project-media/recordings/take.wav".to_string()),
            file_name: Some("take.wav".to_string()),
            track_id: Some("live-vocals".to_string()),
            ..NativeRecordingRuntime::default()
        };

        assert_eq!(
            recording_start_blocker(&runtime),
            Some("A recording is already active. Stop it before starting another take.")
        );
    }
}
