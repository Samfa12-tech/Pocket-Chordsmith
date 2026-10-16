# Passage comparison and playable examples

Source candidates Chordsmith v70 and DJ v1i add the requested original/proposed,
Apply/Discard/Undo interaction and playable listening examples. They are separate
from the frozen v69/v1h packages. Both keep Core 0.3.0 and existing source schemas,
song IDs, PCS1, handoffs and save formats. Public deployment metadata is unchanged.

## Supported edits

Chordsmith compares its existing whole-song chord performance setting: together,
up/down strum, or rising/falling roll. Select a chord bar, enable Chords, choose a
proposal and Prepare. A/B each replay the same visible selected-passage start,
lead-in and tail through the existing live scheduler. The transient audition
context supplies the sound setting; project data and exported/saved source retain
the original. Apply commits the setting through existing Undo. The panel's Undo
is available only for its own still-current applied proposal. This does not add
arbitrary note editing or a new guitar recipe/comparison engine.

DJ compares the existing bass stem volume on the selected passage. Its actual
mixer reads a transient audition override; saved source, FX, queues and sequence
settings stay unchanged until Apply. The scoped one-step Undo restores only that
fader and refuses a changed bass setting or replacement session. It preserves
other edits. Active build/drop/fill combinations retain the explicit ordinary
Play fallback instead of pretending the finite preview includes that performance.

These web controls replay A/B from the same musical start, rather than switching
two running renders mid-phrase. They deliberately do not claim loudness matching:
DJ is comparing a balance adjustment, and Chordsmith's cue identifies articulation.
There is no automatic audio-quality verdict.

## Playable listening examples

Examples are optional buttons on the same compact panel. Chordsmith plays
together versus rising notes on the selected passage; DJ plays original versus
half-level bass on the selected passage. A plain-language cue identifies what
to listen for. They use the existing scheduler, voices and mixer, not a second
synth or an unrelated demonstration file. No selection, disclosure, proposal or
Prepare action autoplays. An example plays only after its explicit Hear button.

Example sessions disable Apply and the panel's Undo. Stop cancels preparation,
releases owned audio, and rejects late readiness. Examples never replace project
or saved-session data. A source, selection, range or proposal change invalidates
old previews. Chordsmith refuses comparisons with grid recording armed; external
controls keep their normal action after cancellation. Existing voice/FX release
can ring briefly after Stop; physical silence is not guaranteed by UI state.

Panels are siblings of the existing audition disclosure, preserving its context
and selector contract. Buttons have at least 44px height and wrap at narrow
widths. Native buttons/selects retain keyboard behavior and live status text.

The Chordsmith source budget is unchanged. Three existing showcase tuplet
matrices use one data row per line, saving 8,154 bytes; the complete parsed
showcase object was checked deeply equal before/after. No notes or recipes changed.

Validation and retained failures are recorded in the local review checkpoint.
Browser-bus PCM establishes generated audio and release within its test scope;
it is not physical-phone, speaker, Safari/iOS or human-listening acceptance.
Both full suites and review must pass before publication. Existing Godot clock,
frame and production-game holds remain independent and open.

## Candidate validation checkpoint

Chromium desktop/touch: Chordsmith 187 passed, five existing phone genre-metric
skips; DJ 108 passed. Firefox: eight new Chordsmith and seven new DJ comparison
checks passed. Existing Firefox/WebKit baseline checks passed (eight/six).
Windows WebKit has no live WebAudio in this harness; this is no Safari or iOS
audio claim. Core 213 tests, Chordsmith unit/composer checks, DJ scheduler checks,
lint/types/format, unchanged size budgets and family governance checks passed.

A warmed AudioContext plus an intentionally delayed first UI update reproduced
Chordsmith starting at step four instead of zero on desktop and touch. The
audition now anchors its audio start after UI work and schedules the initial
lookahead before yielding. The strengthened regression passed after the fix;
ordinary full-song/section playback is unchanged. Earlier failed regressions and
fixture corrections remain in the local evidence, not counted as passes.

The first single-file verification failed because a repository-root build gave
embedded worker source-path comments a different spelling. The canonical app
`npm run build:single-file` followed by `npm run verify:single-file` passed.
Main script and both decompressed embedded payloads had identical JavaScript
token types and values before/after canonical normalization. Exact packaged ZIP
validation and independent review are separate release gates.
