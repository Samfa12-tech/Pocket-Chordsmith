# Pocket Audio integration candidate — 17 October 2026 AEDT

This branch starts from main `4f156e2c9857b40f7c79b3d6761d77c6683545d2`.
It is an independent review candidate, not a merged source or public DAW release.
DAW source is now 0.6.57; no installer or installed acceptance exists for it. The accepted0.6.56 transport/hint work remains, with a separate Library readiness-focus correction after its preparations were held before packaging.
The0.6.55 preparation was stopped after independent review found an ordinary
Play-after-Stop race and unbounded hint history. See
[the corrected ownership and metadata policy](../apps/pocket-daw/docs/ORDINARY_TRANSPORT_STOP_OWNERSHIP_2026-10-17.md).

## Included and held scope

| Scope | Source | State |
| --- | --- | --- |
| DAW and shared Core implementation | `fa3817230973e18717f374cfb6e968c78f257f59`, plus the bounded Stop/cache and diagnostic changes below | Review candidate |
| Chordsmith and DJ | Byte-identical product paths to published `a31ffae545e0d50b5024dd1be746b834d6f7bed3` | v70 / v1i already published; no re-upload here |
| Core | 0.3.0, private workspace package; same published browser implementation | No npm publication |
| Godot addon | Every `addons/pocket_chordsmith/` byte remains at main / 1.2.0 | 1.3.0 work stays on held PR127; no addon upload |
| DAW releases | Public 0.6.50; frozen 0.6.52, 0.6.53 and 0.6.54 candidates preserved | No artifact replacement, merge or publication |

The Godot CI runner exercises all original main/1.2.0 contract, trust,
accessibility and package tests, with the existing fail-closed process-log guard
retained. It uses `--import`, which waits for the asset scan to complete. The
eight added 1.3.0 tests stay with their excluded implementation; they are not
conditionally skipped or counted as passes here. Representative-game timing,
physical listening and Store/Library acceptance remain open on the held addon.
The addon-dependent new runtime-budget tool is also held; its exact source is
preserved on the existing branches and in local review evidence.

Historical family ledgers describe the original combined branches. This scope
table and FAMILY_MANIFEST describe this integration; historical 1.3.0 references
do not mean those addon changes were included or released.

## Reproduced Play delay and bounded correction

On the exact installed 0.6.54 candidate, two raw HTTP Play requests took
4,417.08 and 3,718.24 ms. Socket connection/write completed in about 1 ms.
Concurrent supported status reads showed playback inactive through most of the
wait; after startup they returned in about 7–15 ms. The existing cache stayed
full with build count eight, so no new stem rendering explains these two runs.
Explicit Stop had cleared native residency while 13,634,004 WAV bytes remained
cached in JavaScript. The source consequently preloads those bytes again before
each new Play. This is a reproducible unnecessary transfer; the exact allocation
of all installed milliseconds is not proven by cached status snapshots.

A separate source-native diagnostic used three 4,608,044-byte silent float WAVs.
In an unoptimized debug build, per-asset Rust JSON parsing took 698–839 ms and
WAV decoding 36–50 ms. Native graph construction took about 2 ms. WASAPI stream
creation took 678–829 ms, with first native consumed frames observed 67–137 ms
after start returned. These controls distinguish costs, but their debug/silent
measurements are not an installed release speedup, audible onset or physical
device latency claim.

Ordinary button/menu and bridge Stop now explicitly retain the existing bounded
native decoded cache. Playback/recording cancellation and stream teardown still
happen. Every other Stop defaults to clearing the cache, including project
replacement, comparison/audition teardown and recording cleanup. The unchanged
512 MiB native cache limit, LRU eviction, revision identity and full-byte eviction
retry remain enforced. JavaScript first invalidates old acknowledgments and
restores only previously proven hints after the exact retaining Stop succeeds
with nonzero native cache bytes. Empty, legacy, lost or superseded acknowledgments
keep the conservative full-byte path.

Bounded diagnostic snapshots expose preparation, preload bytes/time, start
invoke time, and native device/graph/stream/worker stage times. These observations
never drive the audio clock. Stop still tears down the stream; stream recreation
cost remains visible rather than being silently described as solved.

Integration also fixes the reproduced DAW parity-test failure: the test now reads
Chordsmith's canonical source manifest rather than opening the removed v69 file.

## Capture and remaining installed gates

The semantic native-capture fingerprint remains
`e9da9acb8d6235a4f26f74f1c3601289d77c4125299cb345bb0fbf82956c8bce`.
The public 0.6.50 baseline is
`e4ec7e55c375f6d43a7683bca61b3a4a60a96f73f9df9c09d745b21066aff770`.
The compatible direct 0.6.53 recording passes its unchanged acoustic and
same-run MIDI/export validators. Its whole attestation cannot pass because Sam
confirmed a real Undo viewport defect and other native checks were incomplete.
The current baseline verifier requires both that prior whole pass and the direct
capture proof. Manual-fresh mode also requires the exact current installer.
Neither route can truthfully relabel the old recording as a current take.

No thresholds or verifier rules changed. Under the existing contract, one fresh
deliberate ten-second audible capture, connected MIDI and retained exports are
required on the final reviewed replacement installer. Request readiness only
when that candidate is installed and ready; doing it now on superseded 0.6.54
would waste another microphone action. No microphone action occurred in this
slice. Current native JSON picker/import/Cancel/menu and updater UI checks also
remain pending; bridge and browser fixtures do not establish those manual facts.

Before any release: independently review the immutable integration diff, require
CI/source checks, prepare the exact final commit once, preserve current user
work before replacement, verify the installed speedup and all candidate gates,
then run evidence-only verification. Tag/main/installer identity must agree.
The 0.6.54 receipt cannot be inherited by this different full commit.

Reef Sweep, dependency PRs71–75, accounts, credentials, security settings,
licences and spending are unchanged.

## Executed 0.6.55 source validation (retained historical snapshot)

- Manifest-owned DAW suite: 1,278 tests in 108 files passed. The earlier direct
  Vitest invocation incorrectly included a Node test file and exposed the stale
  v69 parity path; both original failures remain in local evidence.
- Core: 213 tests passed. Shared sound surfaces and Godot sound metadata are
  current. Chordsmith/DJ product paths and Core implementation paths match the
  exact published a31ffae source; addon paths match main.
- Rust: 224 passed, six explicitly ignored; all-targets Clippy passed with
  warnings denied. The opt-in silent native startup diagnostic passed separately.
- Browser UI: 61 cases passed in the first complete production-bundle run.
  The remaining five-minute worker case measured a 208.3 ms main-thread gap
  against the unchanged 150 ms limit during compilation. Its trace is retained.
  One isolated rerun after compilation passed at 101.4 ms, 612 heartbeat ticks
  and 6.22 seconds of analysis. The worker SHA256 is identical to 0.6.54.
  This is consistent with host contention, not proof of a particular cause;
  it is not reported as a clean single-run 62-case pass.
- Original main/1.2.0 Godot CI scope passed, including its 130-entry addon-only
  package. The excluded 1.3.0 runtime gates remain unpassed here.
- Root script tests: 26 passed. Repository organization, generated governance,
  synchronized versions/release status, TypeScript and production UI build passed.

Safe installed follow-up on the retained 0.6.54 fixture proved unsupported
JSON-path Open is rejected before I/O without changing project/tracks. The
official updater manifest returned HTTP 200, public version 0.6.50 and a Windows
signature. Neither result is substituted for native picker or updater UI use.
