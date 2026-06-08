# Codex Workspace Memory

Use this file first when a new Codex session opens in this workspace.

## Workspace Shape

This folder contains three active projects:

- `web-app/` - Pocket Chordsmith browser app.
- `godot-addon/` - separate nested Git repo for the Godot addon.
- `pocket_dj/` - Pocket DJ prototype and planning workspace.

The root repo tracks the workspace organisation, browser app, and Pocket DJ files. The `godot-addon/` folder has its own `.git` history and should stay ignored by the root repo.

## Current Baselines

- Browser app baseline: `web-app/pocket_chordsmith_v67_direct_godot_push.html`
- Browser app memory: `web-app/POCKET_CHORDSMITH_CODEX_CONTEXT.md`
- Pocket DJ plan: `pocket_dj/pocket_dj_v1_planning_doc.md`
- Current major feature family: "Push to" additions.

## Local Tooling Memory

Do not rely on plain `node` in this PowerShell environment. It resolves to the Codex app package under `C:\Program Files\WindowsApps\...`, which can fail with `Access is denied`.

Use the bundled user-cache Node instead:

```powershell
& 'C:\Users\sam_s\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --version
```

For Pocket Chordsmith single-file HTML syntax checks, do not run `node --check web-app\*.html` directly. Extract and parse the inline script:

```powershell
node -e "const fs=require('fs'); const vm=require('vm'); const html=fs.readFileSync('web-app/pocket_chordsmith_v67_direct_godot_push.html','utf8'); const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(s=>s.trim()); console.log('inline scripts:', scripts.length); scripts.forEach((code,i)=>new vm.Script(code,{filename:'inline-script-'+(i+1)+'.js'})); console.log('syntax ok');"
```

Known-good result from this workspace:

```text
inline scripts: 1
syntax ok
```

## Git Memory

- Root repo currently has staged organisation/doc/prototype changes.
- Root repo currently has no remote configured.
- `godot-addon/` remote is `https://github.com/Samfa12-tech/Pocket-Chordsmith.git`.
- Local `godot-addon/` is clean but ahead of `origin/main` by one commit at `v1.1.5`.
- Ignored local-only items include `archive/`, `releases/`, `marketing-assets/`, `godot-addon/`, zips, audio/MIDI exports, and keystore/certificate files.
