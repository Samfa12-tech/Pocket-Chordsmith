# ASIO And Low-Latency Backend Spike

This records the `TASK-32` research decision for Pocket DAW. It is not an implementation claim. The installed app should keep the current CPAL/WASAPI path as the default while ASIO remains an opt-in experiment.

## Current Native Audio Shape

- `src-tauri/Cargo.toml` depends on `cpal = "0.17"` with default features only.
- `cargo tree -e features -i cpal` currently shows `cpal v0.17.3` through `cpal feature "default"` only.
- `src-tauri/src/native_audio.rs` prefers a `Wasapi` host for native playback and falls back to CPAL's default host.
- `src-tauri/src/native_recording.rs` uses the same WASAPI-preferred host selection for live input, monitoring, and recording.
- `src-tauri/src/lib.rs` device probing reports one host at a time and currently emits the note: WASAPI is the target; ASIO is reserved for a later pass.
- `src/daw/schema.ts` already has `AudioDeviceSettings.host`, device IDs, sample rate, buffer size, input/output channel counts, and probed device capabilities, but the native bridge does not yet let the user choose a CPAL host.

## Source Check

The local `cpal` crate documentation says Windows supports WASAPI by default, with ASIO as an optional backend. `cargo info cpal` reports these relevant features for the current dependency family:

```text
features:
  asio                  = [dep:asio-sys, dep:num-traits]
  audio_thread_priority = [dep:audio_thread_priority]
```

The downloaded `asio-sys` README describes the ASIO backend as Windows-only bindings for the Steinberg ASIO SDK, used by CPAL's ASIO backend. It also lists build prerequisites: LLVM/Clang for bindgen, ASIO SDK handling through download or `CPAL_ASIO_DIR`, and careful handling of unsafe driver callbacks.

Reference URLs:

- `https://docs.rs/cpal`
- `https://github.com/RustAudio/cpal`
- `https://crates.io/crates/cpal`
- `https://docs.rs/asio-sys`
- `https://crates.io/crates/asio-sys`
- `https://www.steinberg.net/developers/`

## Decision

Do not enable `cpal/asio` in the normal Pocket DAW dependency graph yet.

ASIO should be treated as an experimental backend build after the current WASAPI/native path has:

1. explicit host selection in the app model and native bridge;
2. device probe output that can enumerate more than one CPAL host;
3. backend-specific diagnostics in playback, recording, and exported smoke evidence;
4. a manual test matrix on real hardware or ASIO4ALL;
5. clear release wording that ASIO is experimental until the artifact and device evidence prove otherwise.

## Why Not Flip The Feature Now

- The current code always searches for `Wasapi` first, so adding the feature alone would not make ASIO selectable.
- Device IDs are derived from the currently selected host and device names. Mixing hosts without explicit host IDs would make saved `inputDeviceId` / `outputDeviceId` values ambiguous.
- ASIO build setup can require LLVM/Clang and Steinberg SDK handling. That would make ordinary installer builds more fragile if bundled into the default path.
- ASIO runtime behavior depends heavily on installed drivers and hardware. It needs installed-app smoke, not just `cargo test`.
- Recording is still a one-track mono alpha. ASIO should not be used to imply pro multitrack readiness before the grouped recording model exists.

## Proposed Implementation Path

### Phase 1 - Host-Aware Device Model

- Add a native probe result that returns one entry per available CPAL host, not just the WASAPI-preferred host.
- Preserve the current `AudioDeviceInfo.host` field and make device IDs host-stable, for example `wasapi:output:<name>` and `asio:output:<driver>`.
- Keep `AudioDeviceSettings.host` authoritative when selecting input/output devices.
- Add tests for saved WASAPI device IDs surviving even when ASIO devices are present.

### Phase 2 - Build-Gated ASIO Experiment

- Add a separate Cargo feature or package profile for ASIO experiments, not the normal release build.
- Document required local environment variables, especially `LIBCLANG_PATH` and optional `CPAL_ASIO_DIR`.
- Add a CI guard that proves the default build does not accidentally require ASIO prerequisites.
- Record `cargo tree -e features` output for both default and ASIO experiment builds.

### Phase 3 - Runtime Backend Selection

- Teach playback and recording bridges to select `cpal::HostId::Asio` only when the user has chosen an ASIO host/device.
- Keep WASAPI fallback explicit and visible; do not silently switch a user from ASIO to WASAPI when the user selected ASIO.
- Surface backend, host, device, sample rate, channel count, buffer size, callback timings, stream errors, and fallback state in diagnostics.
- Keep the WebAudio fallback browser/dev only.

### Phase 4 - Low-Latency Validation

- Run installed-app playback smoke on WASAPI before every ASIO comparison.
- Run ASIO playback with generated events, native cache regions, loop playback, metronome, mixer changes, and rapid live composition edits.
- Run recording smoke only after the stereo/multitrack design prerequisites are implemented.
- Capture callback timing evidence, underrun/overrun counters, device names, selected host, sample rate, buffer size, and exact artifact hash.

## Verification Targets

- Default `cargo tree -e features -i cpal` still shows only CPAL default features.
- Default `cargo test --manifest-path src-tauri/Cargo.toml` passes without ASIO SDK or LLVM setup.
- A future ASIO experiment build can run behind an explicit command or feature and record its dependency tree separately.
- Device probing can list/select hosts without corrupting saved WASAPI device settings.
- Diagnostics clearly distinguish `native-cpal-wasapi`, `native-cpal-asio`, fallback, and unavailable states.

## Release Boundary

Until the ASIO experiment has a separate build gate and installed-app evidence, release notes should continue to say: no ASIO support yet. Low-latency work in the current app means hardening the existing native CPAL/WASAPI callback path, cache path, and diagnostics.
