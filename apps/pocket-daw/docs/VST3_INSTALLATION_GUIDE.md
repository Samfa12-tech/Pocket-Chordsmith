# Install a VST3 plug-in in Pocket DAW

Pocket DAW 0.6.46 supports Windows x64 VST3 instruments and effects as an
opt-in beta and passed exact installed host smoke. The current 0.6.47 source is
release-process-only and has no separate public installer. Use the updater or
the exact 0.6.46 installer for the public plug-in host.

## 1. Download the plug-in from its developer

Use the vendor's official website or official release page. Choose the
Windows **64-bit VST3** format during installation. Do not install VST2, a
32-bit build, or an unofficial repack: Pocket DAW does not support or
redistribute those formats.

The normal Windows VST3 locations scanned by Pocket DAW are:

```text
%ProgramFiles%\Common Files\VST3
%LOCALAPPDATA%\Programs\Common\VST3
```

Leave the vendor installer pointed at one of those locations when possible.
Pocket DAW does not scan personal drives automatically.

## 2. Enable the beta once

1. Open Pocket DAW's **Library** rail destination.
2. Select the **Plug-ins** tab.
3. Read the one-time native-code warning and choose **Enable VST3 Beta**.

The beta runs plug-ins in a separate crash-isolated Windows helper. Scanning
and processing do not run vendor code inside the audio callback. A plug-in can
still access files and devices with the normal permissions of your Windows
user, so only install software you trust.

## 3. Add a custom plug-in folder (only if needed)

If the vendor used a different install folder:

1. In **Library → Plug-ins**, choose **Add Folder…**.
2. Select the folder that contains the `.vst3` bundle.
3. Choose **Discover Modules**.

The selected folder is stored in Pocket DAW's private local app settings. It is
not written into `.pocketdaw` projects, diagnostics or analytics.

## 4. Scan and insert it

1. Choose **Discover Modules** and wait for the isolated scan to finish.
2. Search the verified plug-in list by vendor or name, and filter by
   **Instruments** or **Effects**.
3. For an instrument, choose **New instrument track**.
4. For an effect, select a normal audio/MIDI track, then choose **Add effect**.

Pocket DAW only offers descriptors that completed the isolated scanner. The
first load may take a moment while the persistent session helper starts.

## 5. Edit and save it

Use the vendor editor when available, or open **Generic controls** and search
the plug-in's parameters. Parameter edits can be automated with stable
parameter IDs. Pocket DAW also preserves factory programs, Pocket presets,
reported latency, effect tails and compressed plug-in state (up to 32 MiB per
instance) in the project.

The project stores the plug-in identity, class ID, vendor/name/version,
category, module filename and binary fingerprint, but never an absolute local
path. The plug-in itself remains installed outside the project.

## If a plug-in is missing or fails

- **No result:** confirm that the vendor installed a Windows x64 `.vst3`, add
  its folder explicitly, then choose **Discover Modules** again.
- **Quarantined module:** the scanner timed out, crashed, or returned invalid
  data. Fix or update the vendor install, then use **Retry** or rescan. Pocket
  DAW keeps the DAW running.
- **Missing plug-in placeholder:** the project keeps its identity, state,
  automation and chain position. Reinstall the exact plug-in, rescan, choose a
  verified replacement intentionally, bypass it, or use **Freeze selected
  clip** for portability.
- **Host failure:** use **Retry host** first. **Safe Reload** restarts the
  helper while preserving the previous valid project snapshot. Effects fall
  back to dry audio for a missed block; instruments are silenced for that
  block rather than blocking the audio callback.

## Safety and portability notes

Pocket DAW never downloads plug-ins, bundles third-party binaries, or endorses
the products in its help links. The [Joe Hagen free plug-in guide](https://www.joehagenmusic.com/post/a-comprehensive-guide-to-high-quality-free-plugins-that-you-ll-actually-use)
is provided for discovery only; always verify the current download on the
developer's official site.

For a project that must open on another machine, keep the vendor installer and
exact plug-in version, or **Freeze selected clip** / render the part. A saved
VST3 identity without the matching installed binary reopens as a recoverable
placeholder, not as a silently substituted plug-in.

## Current format boundary

Supported now: Windows x64 VST3 instruments and mono/stereo effects, one event
input for instruments, native-clock notes/automation/tempo/meter/transport/
loop context, latency compensation, tails, state round-trips and editors.

Deferred: VST2, 32-bit bridging, CLAP, AU/AAX/LV2, multi-bus/surround,
sidechain inputs, MIDI output, MPE and `.vstpreset` interchange.
