# Pocket Audio candidate and public release truth

These are source candidates for review, not public releases. Versions are
independent product domains; PCS source schemas16/17 and DAW project schema3
have not changed. Existing song/sound IDs, PCS1 and legacy JSON remain supported.

| Product | Source candidate | Verified public baseline | Publication gate |
| --- | --- | --- | --- |
| Chordsmith | v69, Core0.3.0; package1.0.0 is administrative | itch pocket-audio-core v68, build2006257, source b7aeaa5bb744905c80bdd475095945896ee3eb95 | Reviewed web ZIP, itch and existing website mirror |
| DJ | v1h, Core0.3.0; package1.0.0 is administrative | itch html v1g, build1867913 | Reviewed web ZIP, itch and existing mirror |
| Core | 0.3.0, private=true | Previous repository version0.2.0; no npm release | Repository/workspace only |
| DAW | 0.6.51, unused candidate version | GitHub0.6.50, ec3f783b24abdd85d46229c2893ea953e96248cd | One frozen exact installer and current installed/retained evidence, then parent review |
| Godot | 1.3.0, tested engine4.6.3 | itch godot-addon, official Store and Library5174 show1.2.0 | Addon-only ZIP and full40-character addon-only source commit, reviewed target metadata |

Fresh butler reads confirm the named Chordsmith/DJ channels. The DAW itch
windows-installer channel remains the unchanged0.6.40 bootstrapper (build1783130);
its version is not the latest DAW application version and it needs no repush.
GitHub release pocket-daw-v0.6.50 targets the exact recorded ec3f783b commit.
Public/deployed commit fields remain unchanged in the family manifest.

The public [Store](https://store.godotengine.org/asset/samfa12/pocket-chordsmith/)
and [Library5174](https://godotengine.org/asset-library/asset/5174) still advertise
the older1.2.0/4.4 release. The new candidate's declared support is the actually
tested4.6.3 scope; proposed listing metadata must stop presenting4.4 as tested.
Inspect the existing publisher/dashboard identity before any upload. The current
candidate ZIP does not include caches, build output, uid/import/godot metadata
or monorepo-only files. Headless import is not audio-parity acceptance.

The Core version bump changes runtime identity metadata, not legacy musical IDs.
All213 Core checks pass with the existing golden song/audio fixtures unchanged;
their older metadata remains useful compatibility input. Browser source entry
names, hosting redirects, build/packaging paths, tests and generated family views
now point to v69/v1h. The governance check compares actual Core package/declared
bridge versions rather than a second hardcoded0.2.0 literal.

## Dependency snapshot

Five fresh lockfile-only npm audits on16October report zero advisories. No
dependency installation or upgrade was performed. The earlier source-map-js
correction remains1.2.2 in the relevant locks.

GitHub Dependabot21 remains open for glib0.18.5,
[RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html).
The advisory affects VariantStrIter in0.15 through versions below0.20.
Locked offline cargo-tree queries find no glib in x86_64-pc-windows-msvc, but
show it through the Linux GTK/Tauri graph for x86_64-unknown-linux-gnu. This is
Windows target-graph applicability evidence, not a claim that the lockfile is
patched or every binary is certified. No alert was dismissed, no arbitrary
dependency PR merged, and Linux remediation remains separate from this Windows
candidate.

## Installed and remaining acceptance

The retained direct0.6.50 fresh-audible baseline passes current attestation and
strict audible/MIDI/export-summary validation. Its installer hash is
150e006b74b0d2675f361305c3b582b2ca41b82335f5451e0c39835c7dd4ad98; its semantic
capture fingerprint matches current source. This permits baseline reuse if the
final fingerprint still matches. It does not pass the new installer: current
PCM duration/file integrity, connected loopMIDI, real WAV/MIDI outputs, installed
media/plugin/target smokes and exact receipt verification remain required.

No public uploads or new installer are recorded by this source checkpoint.
Final preparation follows the one-pass DAW fast path only after source is frozen.
Keep cold/rendered Godot budget failures, representative game/long-session/
working-set and human-listening limits explicit. Retain the independent isolated
ObjectDB warning: the 1.3.0 source-version gate reproduced it and failed. A pure
Godot 4.6.3 threaded-loader reproduction also fails, while its synchronous control
is clean; one-frame deferral still fails. This narrows the investigation without
proving every addon warning has that cause. See the detailed
[runtime evidence](../addons/pocket_chordsmith/docs/RUNTIME_AUDIO_ACCEPTANCE_2026-10-16.md).
Godot publication remains held. Deferred contribution/share compression/deep
ASIO/multitrack stay backlog.

Any website mirror must start from fresh website main and preserve editorial
commit b2469ac41f721074868b89d1fbab9ccfea56e34f. Reef Sweep and owner/concurrent work
remain untouched. Source, tested bytes, installed acceptance and publication
must continue to be recorded separately in the implementation ledger.
