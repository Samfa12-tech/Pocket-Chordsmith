# Current Pocket Audio releases —17 October2026

| Component | Published/current baseline | Delivery and support |
| --- | --- | --- |
| Chordsmith |v70; Core0.3.0; schema17/legacy16| Existing itch pocket-audio-core channel and samfa12.com mirror; source a31ffae545e0d50b5024dd1be746b834d6f7bed3. |
| Pocket DJ |v1i; Core0.3.0; session schema1| Existing itch html channel and website mirror; same a31ffae source. |
| Core |0.3.0| Workspace/repository package only; no npm publication. |
| Pocket DAW |Public/tested0.6.59; source-only0.6.60; project schema3| Native Windows setup/MSI, GitHub updater and full-installer itch ZIP. Exact tested source63c89d4687e7e8aea26287297ed83badcef6bc63; later documentation is separate. |
| Godot addon |1.3.0| Metadata4.6; validated4.6.3 Windows/WASAPI. GitHub/itch published; Store/Library approval is separate. |

## Downloads and source

- https://samfa12.itch.io/pocket-chordsmith
- https://samfa12.itch.io/pocket-dj
- https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/tag/pocket-daw-v0.6.59
- https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/tag/godot-addon-v1.3.0
- https://samfa12.com/pocket-audio/

Godot addon-only source/download commit:
`116a9e4b24b24af87277e465f6dd423c20ff6e7a`, branch `godot-addon-1.3.0`,
folder `addons/pocket_chordsmith`. Its159files match the verified release ZIP
(SHA-256 `8318f5a6d59619b8d995d53c1a9fbfa10e554ce4d8f31bddae8faa1204355509`).
Monorepo release source: `9e47f2c75f1488643d63420802f1fbaf95629b83`.
The addon declares version1.3.0, with no enforced engine-minimum field. The lowest
possible API version is not established; historical4.4.1 compilation is not full
final-release runtime compatibility evidence.

## Retained limits and historical records

Historical Godot intermittent stalls were not reproduced; cause unknown. Seven
whole-run frame overruns and Dummy timing failures remain documented. Import and
prepare before gameplay; no universal hitch-free claim. The owner accepted the
verified Windows/WASAPI scope after both Core/native listening checks.

DAW0.6.59 uses current exact-installer evidence plus an eligible direct0.6.57
fresh-audible baseline. No fresh0.6.59 microphone-listening pass or universal Stop
latency is claimed. See the component publication/status documents.

`PROJECT_MEMORY.md`, dated audits and failed-candidate ledgers remain historical
snapshots. The current status and this page supersede their release-status wording
without rewriting past failures. Future product packaging requires a new version
and receipt; this documentation reconciliation does not rebuild published artifacts.
