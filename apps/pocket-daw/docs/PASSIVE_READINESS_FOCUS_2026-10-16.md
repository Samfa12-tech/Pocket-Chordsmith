# Passive readiness and async-import CI correction

PR113's exact hosted CI38838189597 failed one DJ test (93 passed) and one DAW
test (53 passed/two long-worker skips). Neither was dismissed as a timing flake.
Both exact error classes were reproduced with controlled prerequisites.

The DJ custom-role test read `session.deck` immediately after clicking Import.
`handleImport` first awaits Core loading, and a Playwright click does not mean
that prerequisite has completed. Explicitly holding that loader reproduces the
same null-session TypeError on desktop and phone. The test now proves it is
waiting with session still null, releases the real loader, waits for the visible
deck, then retains all original role/precedence/prepared-voicing/source/restore
assertions. Other immediate Campfire import checks also wait for the visible
deck. No DJ product behavior, readiness threshold or audio engine changed.

In DAW, closing File correctly returned focus, but subsequent passive readiness
renders replaced the trigger and left focus on the body. Controlled updater
begin, updater completion and startup-discovery completion each reproduce it.
The hosted trace's trigger is the Pocket rail button after importing `{}`; the
regressions also cover that real import/trigger change.

`renderReadinessUpdate` now remembers the active control's ID or action and match
index before rendering. It restores the corresponding visible, enabled control
only if focus fell to the body. An intentionally focused dialog/control keeps
priority; hidden, disabled or inert controls cannot receive the fallback. Existing
File/Export DOM deferral, explicit updater refresh, dialog return, menu behavior,
status and updater scheduling remain in use. No capture/playback code changed.

Executed locally on the corrected source:

- Full DJ desktop/phone:94 passed, zero skips; six scheduler checks pass.
- Full DAW browser:59 passed, zero skips, including original strict accessibility
  checks and the three new readiness controls. The final expanded import/rail
  regression rerun passes all three; source behavior did not change afterwards.
- Changed-source deterministic scope:423 checks pass in33 suites; the remaining
  14 browser-parity checks initially could not find the installed browser because
  that invocation omitted its configured path. With that path supplied, that
  one suite passes14/14. This is437 checks across those runs, not a green initial
  checker invocation. TypeScript/Vite build and root26 tooling checks pass.
- Before-fix controls: DJ two null-session failures; DAW three focus failures.
  Their raw JSON/traces and exact hosted artifacts are retained under ignored
  local-artifacts/scratch/validation/pr113-ci-diagnosis and the shared validation
  logs. No assertion timeout, focus assertion or expected musical result was relaxed.

These are source/browser controls. Installed WebView2/scaling, current-installer
PCM/MIDI/exports, physical output and listening remain separate acceptance gates.
