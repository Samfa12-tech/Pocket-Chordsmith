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

## Independent-review corrections

The reviewed v70/v1i source remains preserved at
`87cc32ce81c050b9613fc9c84b4cb98a5ba639c9`. New regressions reproduced three
ownership failures: late preparation could announce the wrong/stopped side in
both apps; a same-chord no-op history entry consumed Chordsmith's panel Undo;
and normal Stop semantics changed an idle selected B/C section back to stale A.

Playback announcements now require the specific returned audition context to
remain active and playing. Stop sets an explicit comparison status. Comparison
transitions use Chordsmith's existing preserving audition-stop semantics. The
Undo record validates its Apply history prefix and current source; it removes
only trailing identical-source no-op snapshots before undoing that Apply.
Unrelated later history/source changes disable this scoped Undo without editing
or erasing them. Existing ordinary editor Undo remains available.

Desktop/touch regressions include delayed B versus A, completion/rejection after
Stop, same-chord no-op and unrelated edits, and stopped B/C source/range/first
scheduled-section preservation. Earlier failed runs and fixture corrections
remain separate local evidence. These fixes require new candidate packages and
independent re-review; the prior ZIPs do not inherit their acceptance.

Corrected local suites passed Chordsmith 174 desktop/touch checks with the
established two-worker configuration and DJ 112 checks. Focused ownership tests
passed 24/18 desktop/touch and 12/9 Firefox. Existing cross-browser baseline
checks passed 8/6. A preceding default-parallel local Chordsmith run passed 172
but failed two held-bass checks at their unchanged 800 ms nonzero-PCM deadline;
the complete bounded repeat passed all 174. That failed run remains retained;
no threshold was relaxed or product cause inferred from the repeat alone.

Original-head hosted counts remain distinct: CI38888034223 had Chordsmith 166
desktop/touch E2E, five desktop genre-audio and eight baseline cross-browser;
DJ 108 E2E and six baseline; Core 213, all 13 jobs and both CodeQL languages
green. New-head hosted acceptance must be checked separately.
