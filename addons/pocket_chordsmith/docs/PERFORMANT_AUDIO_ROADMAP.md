# Performant Godot Audio Roadmap

This note is the current direction for turning Pocket Chordsmith imports into a practical Godot game-audio system without making gameplay render a full music engine from text.

## Current State In 1.2.0

Pocket Chordsmith JSON and `PCS1:` share codes are score data. The addon can import them, compile a lightweight `PCSChartResource`, preserve sound/mix/performance metadata, and preview the result in Godot.

The 1.2.0 addon has three usable audio paths:

- `STEM_SYNC` for prepared stems and loops. This is the preferred shipped-game path.
- `HYBRID` for stems plus short samples, accents, stingers, and event hits.
- `PROCEDURAL_PREVIEW` and sample/native preview for editor auditioning before final assets exist.

The editor `Render Preview Audio` action can bake text-only Chordsmith imports into visible WAV stems. It writes separate role stems for drums, bass, chords, guitar, and melody, plus section stem sets, then creates a generated playback profile. Those stems route through the normal Godot music buses, so users can still adjust volume, pan, tone, and FX in Godot's mixer.

This render path is useful because the expensive work happens before preview playback. It is not yet a production mastering pipeline: it uses the addon preview kit/native preview voices, not the exact browser WebAudio graph or a DAW renderer.

## Design Decision

The runtime conductor should stay lightweight. Its job is to coordinate prepared audio:

- keep chart time in integer ticks;
- play synchronized stem players;
- switch sections or music states on musical boundaries;
- mute or fade layers;
- trigger stingers and sample hits;
- emit gameplay signals;
- expose diagnostics.

The runtime should not parse full JSON per frame, spawn nodes per note, or synthesize dense tonal streams during gameplay. Anything that can take seconds in GDScript belongs in an import/render step with visible progress, not behind the Play Preview button and not during a level.

## Near-Term Work

1. Make rendered preview audio a first-class import artifact.

   The current renderer writes WAV stems and a generated playback profile. Next, the addon should make this feel like an import job: progress bar, cancel/status text, output folder choice, overwrite policy, and clear "generated preview assets" naming.

2. Save section stem sets by default.

   Full-song stems are useful for simple playback. Section stems are the more important game-audio asset because they let the conductor switch exploration/combat/menu states on bar or section boundaries without re-rendering during play.

3. Add OGG export for longer generated assets.

   WAV is simple and safe for editor generation, but OGG should be available for longer section/full-song stems so game projects do not carry oversized preview audio. Short hits and very small generated sounds can remain WAV.

4. Add cache manifests and invalidation.

   Generated audio should record the source chart hash, addon version, playback profile hash, BPM, section keys, role list, render mode, and output format. If any of those change, the editor should show the stems as stale and offer to rebuild.

5. Improve live preview feedback.

   Preview/render work should always update visible status text before expensive steps. Users should see "rendering section 3/8 bass" rather than an unresponsive editor.

6. Add stem playback transition polish.

   Future `STEM_SYNC` work should support overlap/crossfade players for state changes, short pre-roll where needed, and clean transitions between section stem sets.

   Extend editor audition with the [shared hear/compare/keep workflow](../../../docs/public-roadmap.md#next-update-workflow-refinements-hear-compare-keep):
   select a state transition and hear its prepared lead-in, boundary and tail.
   Compare original/proposed transition settings at the same musical position;
   Apply is one undoable editor change and Discard preserves the original.
   Optional listen-for A/B explains an observed gap, overlap or level change,
   with honest not-checked/uncertain status and manual override. Test Stop,
   repeated transitions and stale assets; do not add analysis/render work to
   gameplay frames or treat preview as proof of production two-source parity.

## Next-update instrument slice: Campfire Acoustic

See the [canonical cross-family plan](../../../docs/CAMPFIRE_ACOUSTIC_NEXT_UPDATE_PLAN.md)
for the planned Towtal Chaos guitar addition. Godot work covers preserved
instrument/recipe/performance intent, explicit preview capabilities, matching
prepared stems and section loops, and playback/export validation from both
Chordsmith/Core and native DAW. Keep STEM_SYNC/HYBRID as the production path.
Native preview parity is optional and needs separate licensing, listening and
performance evidence; it must not introduce per-note synthesis on gameplay frames.
Existing import, loading, transition and two-source fidelity priorities remain
unchanged. Implementation and acceptance are pending.

## Runtime Budget Rules

The shipped-game runtime should aim for predictable audio cost:

- one conductor for the active music system;
- one player per active stem layer, not one player per note;
- bounded `AudioStreamPolyphonic` voices for short hits;
- no console spam during playback;
- no native tonal stream generation on an audio scheduling frame;
- no import/render work while the game is active;
- use Godot buses for mix and FX control instead of baking every mix decision into code.

Generated/imported audio should be prepared before the level starts. For games that load music dynamically, do it from a loading screen or background preparation scene and show progress.

## Recommended Shipping Pipeline

For the strongest result today:

1. Author the song in Pocket Chordsmith.
2. Export a Pocket DAW Godot Adaptive Pack when final mix identity matters, or import the Chordsmith JSON/share code directly when the addon preview is enough.
3. In Godot, compile the chart and save the `.tres` resource.
4. Render or import stems before gameplay.
5. Use `STEM_SYNC` or `HYBRID` in the level.
6. Use Godot's mixer buses for user volume, balancing, EQ, compression, reverb, and game-specific FX.

For text-only Chordsmith imports, the addon should continue moving toward this flow:

```text
PCS1 or JSON
-> compile chart
-> visible import/render job
-> per-section role stems
-> generated playback profile
-> runtime conductor plays prepared audio
```

## What Not To Build Yet

Do not make the level runtime a full browser-synth clone. Exact WebAudio parity inside Godot would be expensive to build and maintain, and it would compete with game CPU/audio budgets. The better path is to make import/render preparation strong enough that Godot games receive normal audio assets plus rich chart timing.

Do not depend on the editor preview kit as the final shipped sound identity unless that is a deliberate aesthetic choice. It is small, useful, and now much closer to Chordsmith, but production games should be able to swap in rendered stems or licensed samples.

## Validation Targets

Each performance iteration should keep these checks green:

- addon package excludes `.uid` and `.import` metadata;
- `validate_pocket_chordsmith_runtime.gd` accepts saved charts/profiles;
- `validate_pocket_chordsmith_preview_mix.gd` keeps default buses dry and unmuted;
- `profile_pocket_chordsmith_preview_performance.gd` does not regress Play-button startup;
- `compare:chordsmith-godot-trace` keeps compiled musical events aligned with Chordsmith/Core;
- manual editor smoke shows visible render progress and responsive playback.

The target is not "Godot recreates every browser audio sample live." The target is "Godot receives musical intelligence plus prepared audio assets, then runs a stable, mixable, adaptive music system for games."

## Priority validation track: game performance and two-source fidelity

Owner priority recorded 2026-10-12; coordinate with the
[DAW performance/polish plan](../../../apps/pocket-daw/docs/PERFORMANCE_POLISH_AND_FINISH_ROADMAP.md).
The existing import/render/cache/transition work above remains the implementation
backlog. The gates below establish whether it meets the game experience, rather
than creating a parallel renderer or promising new release dates.

### Architecture and evidence baseline

The supported Godot version in [FAMILY_MANIFEST.json](../../../FAMILY_MANIFEST.json)
is **4.6.3**. Test that target first; any additional version/platform needs its
own named evidence before support is claimed. Existing exact-installed DAW
0.6.50 evidence includes Godot 4.6.3 pack decoding and section-loop duration
checks; see [current release status](../../../apps/pocket-daw/docs/CURRENT_RELEASE_STATUS.md).
That is useful baseline evidence, not a real-game stress or listening-parity pass.

The current [conductor](../runtime/pocket_chordsmith_conductor.gd) coordinates
compiled resources and Godot-native audio; keep `STEM_SYNC`/`HYBRID` as shipping
paths. The editor's procedural/sample-kit renderer is an audition path and can
sound different. Do not solve parity by cloning the browser synth in gameplay.

### Acceptance: sound from both authoring paths

- [ ] Maintain two named fixture routes: (A) the canonical Chordsmith project,
  rendered through its supported Core export path; (B) a DAW project rendered by
  the native DAW Godot Adaptive Pack path, including DAW-local arrangement,
  instruments, recorded/sample audio, routing, FX and automation where supported.
  Compare each Godot result with that route's own canonical render, not a
  simplified score that silently omits DAW edits.
- [ ] Add a small deterministic matrix spanning sound profiles/instruments, FX,
  swing/tuplets/holds/slides, tempo/meter, fractional and full section loops,
  silence/tails and dense stems. Reuse existing family-parity/event fixtures,
  [export workflow](../../../docs/GODOT_PARITY_EXPORT_WORKFLOW.md) and
  [DAW pack smoke](../../../apps/pocket-daw/docs/GAME_PACK_EXPORT_SMOKE_CHECKLIST.md)
  rather than duplicating their contracts.
- [ ] Extend the planned cache/identity manifests with source project hash,
  schema, renderer/profile/instrument/FX identity and versions, source commit,
  asset hashes, gain/normalization, sample rate/channels, codec and loop/tail
  policy. Verify that the imported chart, profile and assets refer to the same
  generation; stale or mismatched output cannot pass by sounding plausible.
- [ ] Capture Godot playback with dry, unity-gain buses first. Check duration,
  event alignment, stem alignment, gain, sample rate, channel mapping and
  loop boundaries, then perform level-matched audible A/B against the canonical
  full mix and individual stems. Check for missing instruments/FX, double
  processing, clipped tails, clicks, gaps and drift.
- [ ] Test repeated section/state transitions, crossfades, seek/restart,
  mute/solo/intensity, ducking, stingers and pause/resume with gameplay load.
  Separate intentional adaptive changes from accidental sound differences.
- [ ] Record comparison method and agreed tolerances. Identity hashes prove
  asset identity, not identical device-output PCM. Account for resampling,
  decoder/codec behavior, bus processing, stochastic synthesis and device
  latency; use deterministic seeds where available. Never claim sample-exact
  live procedural/MIDI equivalence from event counts or editor audition alone.
- [ ] Preserve WAV as the parity reference. Planned Ogg/compressed assets must
  additionally prove decode, encoder delay/padding, loop seam and synchronized
  stem behavior on the actual target; document audible/measurement tolerances.

### Acceptance: predictable cost in a real game

- [ ] Profile a minimal harness and a representative exported game integration
  on named target hardware with Godot/addon/build versions retained. Capture
  cold and warm import/load/start separately from steady-state playback.
- [ ] Measure frame-time spikes, audio dropouts, transition latency, CPU,
  resident/peak memory, audio asset residency and active player/voice counts.
  Exercise dense stem sets, rapid state changes, simultaneous stingers and
  game SFX, repeated level load/unload and a documented long-session run.
- [ ] Establish budgets from those baselines before choosing optimizations;
  retain traces and regression thresholds rather than asserting unmeasured
  "amazing" performance or universal device support.
- [ ] Verify preparation occurs before gameplay or in bounded background/loading
  work, with progress/cancellation where relevant. No full JSON parsing,
  rendering, per-note node creation or unbounded loading on gameplay frames.
- [ ] Verify bounded voices/assets, correct scene teardown, released resources,
  no accumulating players/timers and no memory growth across repeated cycles.
  Test missing/corrupt/stale assets and interrupted loading with actionable
  diagnostics and a safe failure path.
- [ ] Retain a reproducible game scene, automation/headless results, profiler
  captures and listening notes. Run existing runtime validation, dry-bus checks
  and trace parity alongside these new gates; an editor Play test alone is not
  shipping evidence.
