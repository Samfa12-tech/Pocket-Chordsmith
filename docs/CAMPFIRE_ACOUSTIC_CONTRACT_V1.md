# Campfire Acoustic recipe 1

Source-stage contract and fixtures, 15 October 2026. The Core functions below
are implemented, including the Core offline event path. App instrument selectors,
the existing live engine, native DAW, DJ and Godot integration remain separate
work. This is not
a claim that Campfire has shipped in all five products.

## Provenance and reference

The [Towtal Chaos page](https://samfa12.itch.io/towtal-chaos) identifies Samfa12
as its developer. The public embedded build inspected on 15 October was
`https://html-classic.itch.zone/html/19728457/index.html?v=1791866164`, SHA-256
`319940c4d35818117ed9ec070d64030315579798000b0f779c6246d6a76857ea`.
No reuse licence was found in that inspected build. No licence grant is
inferred, no game source is vendored, and no component licence changed.

The new Pocket Audio module is an original implementation of the documented
DSP behavior. Independently captured reference PCM hashes, not reference code
or game assets, live in
`packages/pocket-audio-core/tests/fixtures/campfire-reference-hashes.json`.
The local inspection harness and downloaded reference stay outside git.

## Frozen dry-note contract

- Instrument identity: `campfire_acoustic`, recipe version `1`.
- Integer MIDI pitches 36–96; integer sample rates 8,000–192,000 Hz. Unsupported
  values fail explicitly. Rates 44,100 and 48,000 have reference hash evidence;
  the wider declared numerical range is not a physical-device support claim.
- Frequency is equal-tempered A4 = 440 Hz. Delay is the nearest integer number
  of samples. Preserve this reference tuning/decay characteristic; any corrected
  fractional-delay variant needs a different recipe identity.
- Mono Float32 note length is `floor(sampleRate × 1.5)` samples. Each stored
  excitation/recurrence sample rounds to Float32.
- Default unsigned 32-bit seed is `midi × 311`. The LCG uses multiplier 1664525,
  increment 1013904223, modulo 2^32. Excitation is centered noise spanning 0.45.
  Delayed neighboring samples feed back with pair gain 0.496.
- `reference-cut` retains the reference's 1.5-second hard end. It is not
  described as universally click-free, particularly at low pitches.
  `fade-5ms` is an explicit optional ending variant with a different cache key;
  it never silently alters the reference preset.
- Dry buffers contain no velocity, mixer gain, master compression, EQ, reverb,
  delay, distortion, limiting, normalization or dither. Per-note reference gain
  is 0.36; picked-note gain is 0.15. Velocity multiplies gain linearly, including
  exact silence at zero. Host mixing/mastering is a separate contract.

Default note-cache identity contains instrument, recipe version, sample rate,
pitch, seed and tail policy. Excitation/damping/duration changes require a recipe
version change. Gain/timing are applied after that dry-note cache and belong in
any event/full-render cache key. The default LRU holds at most 64 entries and
16 MiB of retained Float32 PCM. Oversized notes are rendered but not retained.
Returned buffers are copies, so caller mutation cannot poison future playback.
The budget covers retained note PCM, not caller copies or prepared AudioBuffers.

## Voicing and performance

The inspected 76 BPM reference uses these ordered string pitches:

| Chord | MIDI notes |
| --- | --- |
| D | 50, 57, 62, 66 |
| G | 55, 59, 62, 67 |
| Bm | 47, 54, 59, 62 |
| A | 45, 57, 61, 64 |

Each chord lasts eight beats. Down-strums occur on every fourth beat with
27 ms between successive strings. Odd beats pick the third or fourth voice
one octave above its chord position, following the reference's three-beat
selection cycle. `campfireAcousticReferenceEvents()` emits this dry guitar
performance only; it does not impersonate the reference's bass/percussion.

`campfireAcousticVoicing()` retains those exact reference voicings and complete
major/minor thirds for all other roots. Mid/high registers transpose by one/two
octaves. Explicit `midiNotes` keep caller ordering; `direction: "up"` reverses
the string order. Single-note events support picking and overlaps. Events carry
optional `technique.campfire.seed`, `recipeVersion`, `tailPolicy` and
`strumSeconds`. Other unknown project fields are not rewritten by these APIs.

The shared reference master compressor (-14 dB threshold, 5:1 ratio) responds
to the whole mix. These dry-note matches do not establish full-mix identity,
master gain, DAW FX, reconstructed-stem gain or cross-engine live parity.

## Implemented Core APIs

`renderCampfireAcousticNote()` returns deterministic mono PCM.
`CampfireAcousticNoteCache` provides bounded, mutation-safe reuse.
`renderCampfireAcousticEvent()` combines ordered notes with explicit gain,
strum timing and natural tails. It does not read a wall clock or start audio.
Core offline events tagged `instrument: "campfire_acoustic"` use this PCM with
the existing stem render gain and panning. Ordinary renders retain complete
pluck/strum tails; explicit zero-tail loop exports retain their exact duration.
Rich schema-17 JSON/PCS1 notes, direction and technique survive that route,
including unknown source fields.

`prepareCampfireAcousticPlayback(context, event, options)` prepares one reusable
AudioBuffer before scheduling. Preparation never starts audio. `start(when)`
uses AudioContext time; the caller owns musical position and destination routing.
`stopAll()` and per-voice `stop()` cancel scheduled voices and apply an explicit
5 ms stop release by default. There is no timer-driven musical scheduling.
Natural completion disconnects nodes.

`prepareCampfireAcousticNoteBank()` prepares deduplicated note identities before
transport starts, with a default 16 MiB PCM budget (configurable up to 64 MiB).
An oversized set fails before allocating audio buffers. It yields between cold
batches so AbortSignal cancellation can stop preparation. Scheduling only
creates voices from prepared buffers; it cannot synthesize a missing identity.
`PocketAudio.play()` uses that bank for all reachable sections, including
unsequenced adaptive sections. It commits the transport clock after preparation.
Stop, Pause, newer Play, project load and dispose cancel pending work and voices;
natural song completion retains tails. Section changes cancel old lookahead
while retaining already sounding tails. Gain/pan follow the Core offline dry
stem recipe. This extends Core's existing transport, not the browser legacy
fallback or native DAW renderer. Core's existing Play restart semantics remain;
this change does not add a seek/resume-position API.

## Executed acceptance and next integration

- 10 dry-note Float32 little-endian SHA-256 fixtures match the inspected
  reference at 44.1/48 kHz and MIDI 36/50/69/84/96.
- 26 deterministic tests cover those hashes, every major/minor root, exact
  voicings, up/down onset order, 27 ms strum, picking, tails, silence, seed/rate/
  recipe/tail identity, LRU eviction and mutation isolation, invalid inputs,
  offline gain/tails/exact-loop behavior, JSON/PCS1 intent, preparation memory,
  cancellation, concurrent Play, project replacement and adaptive sections.
- Chromium OfflineAudioContext reproduces all 10 PCM hashes at the requested
  sample position; preparation does not autoplay, and a cancelled future voice
  remains silent. Live/offline up/down strums at both rates differ by at most
  1.87e-9 per sample (float summation order). A real browser rendered tail test
  preserves the first voice and cancels obsolete future lookahead, with correct
  hard-left channel routing. This is DSP evidence, not physical-device listening.
- Core's full 177-test suite passes. No old ID, default, schema, JSON/PCS1
  migration or existing sound registry was changed by this foundation.
- The required family-parity gate passes: generated surface freshness, surface
  drift, Chordsmith browser event trace, Core render/game-pack fixtures and the
  DAW regression scope (1,170 passing tests across 100 files).

Next: connect legacy tone selectors, Chordsmith's live and fallback export,
the native DAW and DJ audible paths. Add
explicit unsupported-path reporting before exposing selectors. Keep source
intent, native cache/registry recipe identity and both rendered Godot routes in
agreement. Capture level-matched listening and host full-mix comparisons before
claiming a completed instrument release. Follow the canonical
[family plan](CAMPFIRE_ACOUSTIC_NEXT_UPDATE_PLAN.md).
