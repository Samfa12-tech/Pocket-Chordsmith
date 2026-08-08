# Pocket Audio Handoff

Pocket Audio Handoff transfers complete `PCS1:` song codes between a phone, Pocket DAW, and the Pocket Chordsmith Godot addon. Copy, download, and fragment-link paths stay local to the browser. Creating a short code uploads the complete PCS1 payload to the relay service named in the UI.

## Relay security boundary

Production always uses:

```text
https://pocket-audio-handoff.samfa12.workers.dev/api/pocket-audio-handoff
```

Query/hash relay parameters, page globals, and relay metadata cannot override that endpoint on a production origin. A loopback/private development page may use a loopback/private relay override only after code hosting the page explicitly sets `window.POCKET_AUDIO_HANDOFF_DEV_MODE = true` before the app script runs (or supplies `<meta name="pocket-audio-handoff-dev-mode" content="enabled">`). A shared URL cannot enable developer mode.

The page Content Security Policy limits network requests to the official relay, same-origin endpoints, and loopback development endpoints. The rendered page identifies the effective relay host before upload. Relay responses remain authoritative for the precise expiry timestamp; the repository does not contain the Worker implementation, storage controls, or server-side deletion proof.

## Validation

```text
npm test
```

The security test executes the page script with intercepted `fetch`, covers production query/hash/global override attempts, checks explicit local developer opt-in, asserts the endpoint is rendered, and proves a complete PCS1 payload is posted only to an approved endpoint. File input is capped at 4 MiB before `file.text()`.
