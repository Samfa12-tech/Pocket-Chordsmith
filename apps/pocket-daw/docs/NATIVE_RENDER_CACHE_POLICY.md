# Pocket DAW Native Render Cache Policy

Pocket DAW's native render cache is a playback/export reliability aid, not a second project source of truth. The project JSON, media pool, timeline clips, generated source refs, MIDI data, routing, drum-lane mix/FX, and native renderer contract decide whether a cached asset is current.

## Reuse

- Reuse native generated-stem assets only when the cache signature/source hash still matches the current project and renderer contract.
- Reuse runtime-audio cache only when the audio clip/media metadata and decoded runtime buffer identity still match.
- Mixer-only live controls such as mute/solo/volume/pan can update native playback without rebuilding generated stems unless the value is baked into the cached stem render path.

## Rebuild

- Rebuild after source-changing edits: generated section notes, MIDI clip data, audio clip source windows, source refs, BPM/time signature/sample rate, drum lane mix/FX, or renderer contract/recipe changes.
- During native playback, live composition edits may briefly keep only the filtered still-current part of an older cache while a fresh cache rebuild is pending.
- A successful fresh rebuild must clear `nativeRenderCacheStaleForLiveEdits` and clear `pendingReason`.

## Fallback

- If no current cache covers playback, native playback can fall back to procedural events for generated material.
- If native cache hydration finds stale source hashes, unsafe paths, failed reads, or partial generated-stem groups, those entries are skipped instead of treated as playable.
- Browser/WebAudio rendering remains a development/test fallback, not the public DAW distribution target.

## Diagnostics To Watch

- `nativeRenderCacheStaleForLiveEdits`: true only while filtered stale cache is bridging a live edit during native playback.
- `pendingReason`: the edit/build reason waiting for cache rebuild or promotion.
- `buildCount` and `lastBuildReason`: prove a fresh cache build ran for the current project.
- `discardedBuildCount`: proves async builds from stale project signatures were dropped.
- `staleSourceHashCount`, `skippedInvalidPathCount`, and `hydrationFailureCount`: prove persisted cache hydration refused unsafe or stale entries.
