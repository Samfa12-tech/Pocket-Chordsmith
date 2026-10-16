# Nested-path Chordsmith package correction

The exact v69 ZIP from source66d228d loaded its HTML at a nested path but asked
for `/assets/pocket_chordsmith_v69_core_bridge-9rD7w9DN.js`. That root-relative
Vite URL escapes the uploaded bundle's path. The browser reported404 even though
source browser tests and the separately generated single-file website mirror
worked. The old ZIP is held; those other test scopes do not clear its failure.

Vite now emits relative asset URLs. Packaging also checks script/link URLs in
both actual built HTML entries and requires their referenced local files to
exist inside dist before creating the ZIP. This covers the redirect page's icons
and the application's compiled module. The canonical composition/audio source,
versions, schemas and saved project data are unchanged.

Four checks pass using the decoded replacement Chordsmith ZIP and unchanged
exact DJ ZIP at neutral nested HTTP upload paths, on Chromium desktop and touch
emulation: Campfire import, Core0.3 manifest, no autoplay, explicit Hear/Stop,
source preservation and no failed responses/page errors. An intermediate probe
mounted DJ at its reserved source-checkout URL, intentionally selecting its repo
loader first; that harness condition is distinct from the nested upload result.
Keep all failed old ZIP/probe evidence distinct from replacement results.
No publication is authorized by this fix. The frozen DAW0.6.51 installer and its
66d228d receipt are preserved; this web packaging correction does not rebuild it.
