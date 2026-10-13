# Campfire Acoustic: next Pocket Audio update plan

Status: planned, implementation and listening/performance acceptance pending.
Added 2026-10-13. **Campfire Acoustic** is a working display name; proposed
instrument ID `campfire_acoustic` is subject to contract review before implementation.
This is the canonical plan for the requested next-update guitar addition across
Core, Chordsmith, DJ, native DAW and Godot. It does not assign a release date,
bump versions, or claim that any surface already supports the sound.

## Priority and boundaries

Keep the existing [performance, polish and finishing priorities](../apps/pocket-daw/docs/PERFORMANCE_POLISH_AND_FINISH_ROADMAP.md)
and [13-finding audit ledger](../apps/pocket-daw/docs/PERFORMANCE_POLISH_AND_FINISH_ROADMAP.md#audit-follow-through-2026-10-12)
intact. Plan this as a bounded shared-instrument slice alongside that next-update
work, after reconciling the baseline and addressing blocking cache/timing issues.
Do not use the feature to defer responsiveness, UI reliability, game-pack fidelity,
updater, recording or media-portability commitments.

This change records the design only. Implementation, source vendoring, audio
generation, builds, packaging and publication have not started under this plan.
A later implementation should follow the [sound-profile contract](SOUND_PROFILE_EVOLUTION_ARCHITECTURE.md),
[sound parity matrix](POCKET_AUDIO_SOUND_PARITY_MATRIX.md) and existing component
release gates. Preserve the native Windows DAW boundary and native sample-clock
authority. No new external library, remote asset service or network dependency
is needed by this proposal.

## Verified reference and provenance gate

Reference game: [Towtal Chaos](https://samfa12.itch.io/towtal-chaos).
The inspected [public embedded build](https://html-classic.itch.zone/html/19728457/index.html?v=1791866164)
identified itself as Alpha 0.3.2. Its `pluck` and `musicBeat` functions matched
the inspected earlier owner-provided game source byte-for-byte. These findings
are source inspection, not a recorded cross-engine listening comparison.

The reference guitar is procedural plucked-string audio:

- A 1.5-second mono PCM note buffer, cached by MIDI pitch.
- Seeded noise excitation using `rng(midi * 311)`, followed by an integer-period
  averaging recurrence: `(data[i - period] + data[i - period + 1]) * 0.496`.
- Approximately 27 ms between strings, a D / G / Bm / A progression at 76 BPM,
  quiet sine bass and noise percussion.
- Note gain feeds music gain, then a shared master compressor with -14 dB
  threshold and 5:1 ratio. No guitar reverb, delay or distortion was found.
- No audio files were used by this inspected guitar path. Source notes describe
  original camp guitar, but no explicit reuse licence was detected.

Before copying source into any component, confirm provenance and permission for
the exact implementation, record its source/build hash and retain any required
notices. Check the repository's mixed [licensing boundaries](../LICENSES.md),
especially before placing implementation in the MIT Godot addon. A public
playable page is not a reuse licence. No game source or audio assets are vendored
by this documentation change.

Preserve the original reference first. Integer-period rounding affects tuning,
and the recurrence's decay changes with pitch/sample rate. Specify whether the
initial recipe deliberately preserves those characteristics or offers a corrected
variant; never silently retune an approved reference. The shared compressor's
response depends on the full mix, so a dry isolated guitar comparison and a
full-mix comparison are separate checks.

## Shared instrument and performance contract

Core owns the versioned recipe and deterministic note generation. Define the
supported MIDI range, seed algorithm, excitation, period/rounding, decay,
buffer duration, velocity law, release/tail policy, gain and sample-rate behavior.
Use identical numerical conventions where feasible; document tolerances where
native or browser DSP differs.

Start with one faithful Towtal reference preset. Add gentle strum or fingerpick
presets only after the reference is accepted; their controls must change audible
output. Keep performance patterns separate from timbre and mix settings.

Additive project data should preserve instrument ID, preset ID, recipe version,
seed/variation, note duration/velocity and explicit note arrays or single-note
events. Preserve actual major/minor voicings, string order, up/down strum timing,
picking and note overlaps. Do not route acoustic chords through the existing
root–fifth–octave power-chord generator. Capture the reference's exact voicings
as a fixture during implementation rather than inferring them from chord labels.

Keep old songs and existing guitar IDs unchanged. Preserve unknown new fields on
older/unsupported surfaces and report audible fallback explicitly. Keep `PCS1:`
and current supported schema migrations; do not invent a breaking envelope or
schema bump merely for this instrument. Version any later tuning/decay change,
and include recipe identity in render/cache invalidation.

## Required work across all five surfaces

| Surface | Planned responsibility |
| --- | --- |
| Pocket Audio Core | Canonical recipe/registry, deterministic PCM renderer, live scheduling adapter, WAV/stem output, performance event support and capability reports. Reuse the same generator wherever possible. |
| Pocket Chordsmith | Expose the instrument/preset, full chord voicings and strum/picking controls within existing workflows; preserve JSON/share/save/MIDI intent. Wire live playback, Core-first WAV export and legacy offline fallback consistently. |
| Pocket DJ | Preserve the new identity/performance on import and handoff; update its actual audible live renderer and export paths where supported. Verify deck mute/solo, loops, section queues, build/drop and FX. Mirrored Core metadata alone is insufficient. |
| Pocket DAW | Implement the recipe in the native live/offline render path and native render-cache contract, with matching UI/import/export and generated sound-registry surfaces. WebAudio preview is not installed-product evidence. |
| Godot addon | Preserve instrument/recipe/performance metadata, report preview capability and support matching prepared audio in packs, section loops and playback profiles. Production parity uses rendered stems with STEM_SYNC/HYBRID. |

Chordsmith currently has separate Core-first export and legacy fallback engines;
both must support the new recipe or return an explicit supported-path decision.
Do not allow a pleasant live voice to export as the old sawtooth guitar. DJ is
also a distinct audible implementation today. Native DAW generation/cache must
not be replaced with a browser engine.

Use a bounded note-buffer cache keyed by all sound-affecting inputs, including
sample rate, recipe/version, pitch, excitation/seed and timbral settings. Render
cache signatures additionally cover performance timing, mix, effects and tail
policy. Unchanged warm playback should reuse valid assets; edits, preset changes,
sample-rate changes, project switches and superseded jobs must not promote stale
audio. Prepare off the real-time callback; measure cold generation and warm reuse.

For Godot, render source-engine assets before gameplay and include source,
recipe/render version, sample rate, channels, frame count, hashes, loop points,
gain and baked-processing metadata. Follow the
[existing two-source fidelity track](../addons/pocket_chordsmith/docs/PERFORMANT_AUDIO_ROADMAP.md#priority-validation-track-game-performance-and-two-source-fidelity).
Native/prepared preview synthesis is optional, separately scoped work with its own
parity and performance evidence. Do not generate dense plucks on gameplay frames
or silently label a fallback preview as the same sound.

## Acceptance and delivery order

1. **Freeze reference and contract.** Resolve provenance, capture source hash and
   exact notes, and retain dry plucks plus the 76 BPM reference arrangement.
   Record compressor/gain settings and distinguish reference reproduction from
   deliberate new presets.
2. **Prove Core and authoring/export.** Add deterministic fixtures at supported
   rates (including 44.1 and 48 kHz), low/mid/high pitches, major/minor chords,
   strums, picking, accents, overlaps, mute/stop, tails and silence. Validate
   finite samples, peak safety, tuning/decay, duration and click-free boundaries.
   Compare same-seed repeat renders and perform loudness-matched listening A/B.
3. **Close the app boundary.** Test import/save/reopen/share/handoff and old-song
   regression across Chordsmith, DJ and native DAW. Compare live captures, Core
   WAV, legacy fallback WAV and native exports for timing, gain, tone and tails.
   Record exact app/backend versions and declared tolerances; event parity alone
   cannot pass sound acceptance.
4. **Validate rendered game delivery.** Test Chordsmith/Core and native DAW export
   routes separately in Godot 4.6.3, then any additional claimed targets. Verify
   decoded assets and captured playback, section-local origins, A/B/repeated
   sections, seeks, loops, transitions, SFX load and teardown. Retain the canonical
   full mix: independently compressed stems do not generally sum to the output
   of a shared nonlinear master compressor. Define adaptive gain/shared-FX
   semantics and avoid double compression or normalization.
5. **Measure cost and release readiness.** Compare cold/warm prepare, repeated
   Play–Stop–Play, dense chords, rapid edits/cancellation and cache eviction.
   Capture audio gaps/underruns, UI long tasks, CPU, memory/cache bytes and
   real-game transition spikes on named hardware. Set budgets from baseline
   evidence, preserve the audit's cache and export-memory constraints, and prove
   bounded residency. Run applicable family-parity/source/native/Godot gates,
   installed Windows smoke and manual listening before claiming completion.

Track completion here with implementation PRs, fixture hashes, test results,
listening notes, backend/build identity and remaining limitations. All five
surfaces begin **planned / implementation pending / acceptance pending**.
No installer or public release should be inferred from this plan or its merge.
