# Pocket Audio Handoff

Pocket Audio Handoff transfers complete, structurally valid `PCS1:` song codes between a phone, Pocket DAW, and the Pocket Chordsmith Godot addon. Copy, download, and fragment-link paths stay local to the browser. Opening a full-song link never uploads it. Creating a short code is the explicit action that uploads the complete PCS1 payload to the relay service named in the UI.

## Relay security boundary

Production always uses:

```text
https://pocket-audio-handoff.samfa12.workers.dev/api/pocket-audio-handoff
```

Query/hash relay parameters, page globals, and relay metadata cannot override that endpoint on a production origin. A shared URL cannot enable developer mode. For a loopback relay, run `npm run build:dev`; it writes an ignored local-only page with an explicit development marker and a narrow loopback CSP. Do not host that page.

The production page Content Security Policy limits network requests to the official relay and same-origin endpoints, uses a generated SHA-256 hash for its embedded runtime, and contains no localhost or private-network destination. The rendered page identifies the effective relay host before upload. Relay responses must provide an approved URL and a future expiry timestamp before they can be displayed or copied. The repository does not contain the Worker implementation, storage controls, or server-side deletion proof.

## Validation

```text
npm test
```

The security test executes the page script with intercepted `fetch`, covers production query/hash/global override attempts, checks explicit local developer opt-in, asserts the endpoint is rendered, and proves complete songs are posted only after an explicit short-code action to an approved endpoint. The embedded browser runtime is generated from the shared PCS Format codec and is checked for drift before testing. It rejects malformed, unsupported, invalid-UTF-8, and oversized PCS1 payloads (including nested PocketHandoff payloads), bounds relay responses before parsing, and validates relay URLs and expiry metadata.
