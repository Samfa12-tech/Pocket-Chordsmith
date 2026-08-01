# VST3 Hosting Beta

## Current source boundary

Pocket DAW now contains a crash-isolated Windows x64 VST3 host for instruments
and effects. The feature remains a one-click beta and is disabled until the user
accepts the explanation in the Plug-ins tab. This document describes source
capability; public availability is recorded separately in
`CURRENT_RELEASE_STATUS.md` only after exact-installer smoke and publication.

The native CPAL callback and sample clock remain authoritative. Pocket DAW
renders a bounded 128-frame graph off the callback, exchanges audio and events
with one persistent helper through bounded shared memory, and uses an
authenticated local named pipe for control. Vendor code, pipe I/O, locks, and
allocations never run in the audio callback.

Implemented in this source candidate:

- one short-lived scanner process per changed module, x64 PE validation, a
  20-second watchdog, fingerprint-aware caching, and crash/hang quarantine;
- official per-user and global Windows VST3 locations plus explicit
  user-added folders; no drive-wide or automatic personal-folder scan;
- instruments with one event input and mono/stereo main output, and effects
  with mono/stereo main input and output; auxiliary, sidechain, surround, MIDI
  output, MPE, VST2, and 32-bit bridging remain unsupported;
- sample-positioned MIDI and parameter changes, tempo, meter, transport, loop,
  sample position, and PPQ context from the native project clock;
- reported latency, automatic track delay compensation, and effect tails in
  the shared native live/offline renderer;
- state round-trips, factory programs, Pocket DAW preset snapshots, and a 32
  MiB compressed/decompressed state limit with checksum validation and
  previous-valid-snapshot retention;
- owned native vendor-editor windows with DPI/focus/resize handling, plus a
  searchable generic parameter editor that always remains available;
- dry bypass for an effect and silence for an instrument when a block misses
  its deadline, without blocking the callback;
- helper-failure isolation, offender quarantine, Retry and Safe Reload, and
  missing-plug-in placeholders that preserve identity, state, automation, and
  chain position;
- project identities containing the VST3 class ID, vendor/name/version/category,
  module filename, and binary fingerprint, but never an absolute local path;
- protocol version 2 and gzip-compressed opaque state.

Local registry data necessarily records source paths so the native scanner can
load installed modules. Those paths stay in private app data under
`%LOCALAPPDATA%\Pocket DAW`; projects, normal diagnostics, and analytics do not
contain them.

## Release acceptance gate

The beta may be published only when all of the following pass against one exact
installer hash:

1. Deterministic instrument/effect tests cover scan, audio, note and parameter
   timing, state, programs, latency, tails, transport/loop/seek, editors,
   deadline fallback, helper failure, and live/offline parity.
2. Compatibility tests host two unbundled free VST3 products obtained from
   official vendor releases, with exact versions and SHA-256 hashes recorded.
3. The installed candidate proves the packaged sidecar, project save/reopen,
   missing placeholders, Freeze/render, and native export without rebuilding
   the tested installer.
4. Packaging verifies the pinned SDK license notice and refuses to advertise
   scanner or audio-hosting capability when the exact sidecar probe disagrees.

Pocket DAW never downloads, bundles, mirrors, or endorses third-party plug-ins.
Help may link to Joe Hagen's guide for discovery, but directs users to the
developer's current official site and explains that compatibility varies.

## SDK pin and third-party notices

- Official `steinbergmedia/vst3sdk` tag `v3.8.0_build_66`, commit
  `9fad9770f2ae8542ab1a548a68c1ad1ac690abe0`.
- `third_party/vst3sdk/SOURCE_LOCK.json` records the root and submodule commits
  plus the vendored license hash.
- The offline-reproducible ABI-only subset contains the required
  `pluginterfaces` headers and MIT license; VSTGUI, examples, wrappers,
  tutorials, and validators are not vendored.
- The complete Steinberg VST 3 SDK MIT notice is installed as
  `THIRD_PARTY_NOTICES.txt` and is a release-verification requirement.

References:

- [Steinberg VST 3 license](https://steinbergmedia.github.io/vst3_dev_portal/pages/VST%2B3%2BLicensing/VST3%2BLicense.html)
- [Steinberg VST 3 plug-in locations](https://steinbergmedia.github.io/vst3_dev_portal/pages/Technical%2BDocumentation/Locations%2BFormat/Plugin%2BLocations.html)
- [Steinberg VST licensing FAQ](https://steinbergmedia.github.io/vst3_dev_portal/pages/FAQ/Licensing.html)
- [Joe Hagen's free plug-in guide](https://www.joehagenmusic.com/post/a-comprehensive-guide-to-high-quality-free-plugins-that-you-ll-actually-use)
