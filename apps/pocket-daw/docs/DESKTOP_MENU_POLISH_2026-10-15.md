# Desktop command menu source checkpoint

Pocket DAW remains the existing native Tauri workbench. Its menu, transport,
timeline/inspector and lower docks retain their composition and command order.
This slice makes transient commands reachable; it does not reskin the studio or
change project, audio, recording or cache scheduling.

## Confirmed behavior and correction

At 800x600 with the native titlebar offset, the last Edit command ended at y651,
outside the viewport. Escape left the old focus/hover menu visible. Both failures
are retained in `local-artifacts/scratch/validation/desktop-menus-static-before.log`.

Menus now have explicit disclosure state and viewport-bounded scroll regions.
Click or Enter/Space opens a root; hovering switches an already-open menu.
Arrow keys navigate commands/roots; Home/End select first/last; letters find
commands without triggering timeline shortcuts. Escape restores the visible
root, Tab leaves the menu, outside clicks dismiss it, and dialog commands return
focus to the root. Background shell refreshes retain open state, focus and scroll.
The existing action dispatcher owns command execution; no audio/project mutations
are introduced by opening or navigating menus.

## Window truth and evidence limits

`src-tauri/tauri.conf.json` specifies a 1100x720 native minimum and 1440x920 initial
window. The existing 800x600 browser fixture is a narrower stress case, not a
claim about the configured native minimum. Tests exercise all three geometries.
Browser DPR1.25/DPR1.5 and touch-capable pointer emulation are browser checks;
they do not prove Windows display scaling, physical touch or installed WebView2.
Actual installed resize/maximize/restore/scaling, dense sessions and all other
popover/dialog edges remain release acceptance work.

The production UI was built with `npm run build`. Optional
`POCKET_DAW_UI_STATIC_DIR=<absolute dist path>` lets existing Playwright tests
fulfil build assets directly instead of starting Vite, for socket-restricted
environments. It changes test transport only. Normal CI keeps its Vite path.
Rebuild after source edits before using this option; it does not validate build
freshness itself. No browser security flags or host settings were changed.

Validated source: full DAW gate1187, UI/shortcut subset98, TypeScript/production
build and105-artifact scope manifest pass. Menu checks pass at normal density
and all12 DPR1.25/DPR1.5-touch cases, including timed startup status refresh.
Full browser suite and retained logs/screenshots are recorded in the family
ledger. Initial test-transport socket denial, unmapped new test, obsolete hover
expectation and test geometry/locator failures remain in diagnostic logs; they
are not passed runs. Visibility and bounds are read atomically across refreshes.

Evidence: `desktop-menus-{static-before,full-source-final,all-final,dpr-final}.log`
under local validation artifacts; `edit-menu-constrained.png` is retained in
Playwright results and has been visually inspected. No installer, physical
device, listening or publication claim follows from these browser checks.
