# Selection audition source checkpoint

`Hear this bit` auditions the current mix over the explicit edit range, or the
span of selected clips when there is no range. The timeline and inspector show
the bar range and lead-in/tail. Defaults are 0.5 seconds before and 1 second after;
lead-in supports 0–2 seconds and tail supports 0–8 seconds. The complete preview
is limited to 120 seconds. Starting at the song origin clamps the actual lead-in.
Changing selection or settings never starts playback automatically.

The native renderer owns the end frame and applies a final 10 ms monitor fade.
Completion follows the consumed output clock, rather than producer render-ahead
or a UI timer. The saved loop is unchanged and bypassed only for the preview.
The WAV worker removes monitor bounds: the same export remains byte-identical.
Native Windows playback is required; unsupported browser playback reports this
without silently falling back to a different audio path.

Stop remains available during preparation. Source, selection, settings and manual
transport changes invalidate pending work. Hydration checks ownership before
promoting decoded media or repaired metadata. Transport revisions also fix two
reproduced races: a late native start reactivating playback after Stop, and an old
Stop reply resetting the position of a newer request. Recording blocks audition.
Project JSON, original media, selection and saved mix remain unchanged.

## Validation and limits

Full DAW source1197, Windows contract284, Rust204 (3 ignored), Clippy with warnings
denied, browser31, TypeScript/production build, scope manifest107 and repository,
security and governance gates pass. Four native tests cover frame termination at
44.1/48 kHz, unchanged prefix PCM, consumed-clock status, invalid/legacy bounds
and WAV export byte separation. Browser tests cover visible settings/focus,
capability failure, Stop during pending start and selection supersession. Native
IPC in those browser tests is explicitly mocked for control sequencing.

After the final range-label adjustment, the production build and five focused
browser checks pass. `selection-audition-context.png` was visually inspected at
1280x720 with the inspector open. Logs are retained under local validation as
`native-audition-*.log`, including failed race reproductions before fixes.

These checks do not establish installed WebView2/device output, physical scaling
or human listening. Capture plumbing fingerprint remains
`e4ec7e55c375f6d43a7683bca61b3a4a60a96f73f9df9c09d745b21066aff770`;
the microphone check is scoped omitted, never passed. Shared output changes still
require final device acceptance. No installer was built or published here.
The existing native Stop clears decoded residency; no warm allocation or device
latency claim follows. Same-position A/B, Apply/Discard/Undo and finishing/loudness
comparison are subsequent work, not features completed by this slice.

## Review correction: native cached-asset retry ownership

Review identified a production bridge path missed by the single-promise engine
fixtures: a metadata-only native start could report an evicted asset after Stop,
then retry with bytes and restart actual native playback despite the engine
discarding the stale reply. A newer start could be overwritten the same way.

The bridge now owns a transport request revision, separate from cache residency.
It checks ownership after API setup, before the initial invocation and retry,
and after each reply. Superseded starts cannot retry or promote residency. Stop,
Pause, Resume and Seek invalidate pending starts and skip their own invocation
when delayed API setup has already been superseded by a newer request.

Four new retry/setup cases fail against the old bridge; eight command-order
regressions cover Stop/newer-start and delayed transport dispatch. All94 bridge,
engine and audition tests pass. Before/after logs are
`audition-bridge-retry-{before,after}.log`. These are native-command control tests,
not new device/listening evidence. Native Rust, capture code and audio payloads
are unchanged by the correction; earlier native frame/export evidence retains
its stated scope. Exact corrected-head hosted checks and source review follow.
