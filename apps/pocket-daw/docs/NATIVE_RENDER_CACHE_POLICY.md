# Pocket DAW Native Render Cache Policy

Pocket DAW's native render cache is a playback/export reliability aid, not a second project source of truth. The project JSON, media pool, timeline clips, generated source refs, MIDI data, routing, drum-lane mix/FX, and native renderer contract decide whether a cached asset is current.

## Reuse

- Reuse native generated-stem assets only when the cache signature/source hash still matches the current project and renderer contract.
- Reuse runtime-audio cache only when the audio clip/media metadata and decoded runtime buffer identity still match.
- Mixer-only live controls such as mute/solo/volume/pan can update native playback without rebuilding generated stems unless the value is baked into the cached stem render path.
- Stopped edits retain one reusable previous generation up to a conservative
  64 MiB of JavaScript numeric-array storage. It is a build input only: stale
  coverage cannot become playable, and project load clears this reuse bank.
- The engine memoizes the complete generated-cache signature for its owned
  project revision and invalidates it on project sync. Unchanged native ticks
  reuse that value; sound-affecting signature fields remain unchanged.

## Rebuild

- Rebuild after source-changing edits: generated section notes, MIDI clip data, audio clip source windows, source refs, BPM/time signature/sample rate, drum lane mix/FX, or renderer contract/recipe changes.
- Timing helpers and transport interpretation are part of the renderer contract. If event timing or sample/bar conversion behavior changes, timing-sensitive cache should be treated as stale.
- During native playback, live composition edits may briefly keep only the filtered still-current part of an older cache while a fresh cache rebuild is pending.
- A successful fresh rebuild must clear `nativeRenderCacheStaleForLiveEdits` and clear `pendingReason`.
- A superseded generated build stops dispatching jobs between awaited stems
  and runtime assets. An already dispatched native render may finish; its
  cancelled generation cannot promote. Continuous edits may defer completion.
- Explicit Stop invalidates bridge residency hints on both sides of its native
  acknowledgment, including uncertain replies. Late preload/start replies from
  an older generation cannot restore those hints. Pause/Resume retain them.

## Fallback

- If no current cache covers playback, native playback can fall back to procedural events for generated material.
- If native cache hydration finds stale source hashes, unsafe paths, failed reads, or partial generated-stem groups, those entries are skipped instead of treated as playable.
- Browser/WebAudio rendering remains a development/test fallback, not the public DAW distribution target.
- Cache windows may advance during native playback, but playhead ownership stays with the transport clock rather than the cache window itself.

## Diagnostics To Watch

- `nativeRenderCacheStaleForLiveEdits`: true only while filtered stale cache is bridging a live edit during native playback.
- `pendingReason`: the edit/build reason waiting for cache rebuild or promotion.
- `buildCount` and `lastBuildReason`: prove a fresh cache build ran for the current project.
- `discardedBuildCount`: proves async builds from stale project signatures were dropped.
- `staleSourceHashCount`, `skippedInvalidPathCount`, and `hydrationFailureCount`: prove persisted cache hydration refused unsafe or stale entries.
