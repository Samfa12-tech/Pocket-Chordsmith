# Changelog

## Unreleased

- Consolidated the Pocket Audio family into a public monorepo layout.
- Preserved the Godot addon at `addons/pocket_chordsmith/`.
- Added app folders for Pocket Chordsmith web, Pocket DJ, and Pocket DAW.
- Added scaffold space for `packages/pcs-format/` and retained the shared Pocket Audio Core package.

## 1.1.6

Direct browser-to-Godot push support.

Changed:

- Added the local Godot editor push receiver for Pocket Chordsmith browser handoffs.
- Preserved clipboard/manual paste fallback behavior for environments that block local HTTP.

## 1.1.5

Pocket Chordsmith v64 western sound compatibility update.

Changed:

- Importer schema now preserves v64 western sound IDs from web exports: `saloon_piano`, `banjo`, `harmonica`, `cowboy_whistle`, and `western_twang`.
- Importer schema now preserves v64 western guitar pattern presets: `boom_chick`, `train_chop`, and `western_waltz`.
- The bundled web-kit playback profile maps new western chord and melody IDs to safe preview samples, so v64 charts compile and audition without custom sample packs.
- Generated web-kit playback profiles now include the v63 and v64 chord/melody sample keys.

## 1.1.4

Runtime sample-preview stability update.

Changed:

- Sample preview now drops hits that are more than 120 ticks late instead of playing old notes as catch-up bursts.
- Runtime diagnostics now report `sample_play_skipped_late_total`.
- The bundled web-kit profile and generated web-kit profiles use the tighter late-hit threshold.
- Playback profile warnings now flag pitched-event debug logging, compressed/imported WAV preview loading, and missing `Music_Guitar` buses.

Docs:

- Sample preview docs now call out diagnostic logging as a temporary-only option and list the generated guitar web-kit samples.

## Older Addon Releases

Older Godot addon release notes remain in `addons/pocket_chordsmith/CHANGELOG.md`.
