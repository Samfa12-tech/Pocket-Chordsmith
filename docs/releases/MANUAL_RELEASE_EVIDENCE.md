# Pocket Audio Manual Release Evidence

Updated: 2026-08-08

This file records audit requirements that cannot be truthfully completed by repository automation alone. A pending row is a release-evidence boundary, not a claim that the check passed. Do not replace a pending row with `pass` without recording the exact build/artifact, device or assistive technology, reviewer, date, and result.

## Automated evidence completed in this audit pass

- Fixed-seed Lofi, Chip, Metal, Western, and Funk WAVs have bounded duration, peak, RMS, DC offset, clipping, non-finite sample, channel, encoded sample-rate, and silent-window checks.
- Those five seeds now prove exact live-versus-Core/WAV structural event correspondence, including chord rhythms, tuplets, expanded drums, bass, guitar, and melody.
- Chordsmith parser/UI/transport smoke passes in Firefox and WebKit as well as the every-change Chromium desktop and Pixel-emulation suite.
- Oversized WAV export is rejected before `OfflineAudioContext` allocation in desktop and constrained mobile emulation.
- Godot headless accessibility validation reports 16 named, described, keyboard-focusable toolbar actions.

## Required human/device evidence

| Audit area | Required environment and procedure | Status |
| --- | --- | --- |
| F-014 listening | For each fixed seed, listen to Section A and Play Song, then its exported WAV, on neutral headphones, a phone speaker, and desktop speakers. Record audible defects and live/WAV differences. | Pending human listening |
| F-014 genre recognition | Present the five fixed-seed renders without genre labels to at least one reviewer and record the guessed genre plus confidence. | Pending human review |
| F-015 mobile memory | On one supported Android browser and one supported iOS browser, verify typical export succeeds and an intentionally oversized export shows the recovery message without a tab reload/crash. | Pending physical devices |
| F-018 interruption/output | On Android and iOS, exercise background/foreground, audio interruption, wired/speaker output, and Bluetooth output where available. Record browser/OS/device and whether transport resumes without a note burst. | Pending physical devices |
| F-018 recording latency | Record Chordsmith input-to-grid latency on at least one Android and one iOS device; retain the measured offset and audio route. | Pending physical devices |
| F-024 screen readers | Run the core Chordsmith, DJ, Handoff, installed DAW, and Godot addon flows with NVDA on Windows and VoiceOver on an Apple platform. Record spoken control name, role, state, errors, and status announcements. | Pending assistive technology |
| F-024 display modes | Test Windows global High Contrast plus 200% and 400% OS scaling in the installed DAW; test browser reflow/motion at equivalent platform settings. Capture screenshots and blockers. | Pending OS-level manual checks |
| F-011 Asset Library | Publish through the dedicated addon-only Asset Library-compatible branch/tag, download that exact artifact, record SHA-256, enable it in a clean Godot project, and run interactive plus headless smoke. | Pending external publication authority |
| F-019 repository settings | Enable and verify GitHub secret scanning and push protection for the remote repository. | Pending repository-admin setting |

## Pocket DAW release boundary

The current public `0.6.44` tag is explicitly classified in `apps/pocket-daw/release-status.json` as source-only with no replacement installer. The exact `0.6.43` installed smoke remains the binary evidence. The release-candidate truth verifier now fails whenever a newer published version outruns installed-smoke evidence unless a complete, version-matched `source-only-no-installer` or `reduced-hotfix-gate` exception is recorded. The next installer publication still requires the full exact-artifact procedure in `apps/pocket-daw/docs/RELEASE_TESTING_FAST_PATH.md`.

## Evidence record template

Copy one record per environment. Do not reuse an earlier build's result.

```text
Audit finding:
Product/build shown in the UI:
Source commit:
Artifact filename and SHA-256:
Tester and date:
Device/model:
OS and version:
Browser/assistive technology/audio route:
Procedure completed:
Expected result:
Observed result:
Pass / fail / blocked:
Screenshot, recording or log path:
Follow-up issue:
```

For F-014, record separate rows for `audio-review-lofi-v1`,
`audio-review-chip-v1`, `audio-review-metal-v1`,
`audio-review-western-v1` and `audio-review-funk-v1`. Compare Section A live
playback, Play Song, and the WAV from that exact build. For the blind review,
hide the genre label and retain the reviewer's guess and confidence before
revealing the expected genre.
