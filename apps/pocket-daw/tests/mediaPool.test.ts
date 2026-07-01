import { describe, expect, it } from "vitest";
import { migratePocketDawProject } from "../src/compatibility/migrations";
import { buildPocketDawProjectFile, parsePocketDawProjectFile } from "../src/daw/dawProject";
import {
  addMediaPoolItem,
  createCollectMediaPlan,
  createAudioMediaAnalysisSummary,
  createMediaPortabilitySummary,
  createMediaPoolItem,
  createPortableMediaProject,
  createRenderCacheSummary,
  findMediaPoolItem,
  linkFreezeRenderCacheItem,
  markMediaPoolItemExternal,
  markMediaPoolItemCollected,
  markMediaPoolItemMissing,
  markMediaPoolItemRelinked,
  mediaPoolReloadCandidates,
  mediaPoolReloadPath,
  mediaPoolStatus,
  normalizeProjectRelativeMediaPath,
  removeUnusedMediaPoolItem,
  renderCacheItemsForMedia,
  updateMediaPoolItem,
  updateMediaPoolItemMetadata,
  verifyMediaPortability,
  verifySharedMediaPortability
} from "../src/daw/mediaPool";
import { createDemoProject } from "../src/demo/demoProject";

describe("media pool helpers", () => {
  it("creates, updates and finds media pool items while preserving metadata", () => {
    let project = createDemoProject();
    const item = createMediaPoolItem({
      kind: "audio",
      name: "Lead Vocal.wav",
      uri: "file:///sessions/Lead Vocal.wav",
      durationSeconds: 92.4,
      sampleRate: 48000,
      channels: 1,
      metadata: { userNote: "keeper" }
    });

    project = addMediaPoolItem(project, item);
    project = updateMediaPoolItemMetadata(project, item.id, { analysed: true });
    project = updateMediaPoolItem(project, item.id, { channels: 2, metadata: { peakDb: -3 } });
    const found = findMediaPoolItem(project, item.id);

    expect(found).toMatchObject({ name: "Lead Vocal.wav", channels: 2, sampleRate: 48000 });
    expect(found?.metadata).toMatchObject({ userNote: "keeper", analysed: true, peakDb: -3 });
    expect(mediaPoolStatus(found!).label).toBe("External unloaded");
    expect(mediaPoolStatus(found!)).toMatchObject({ external: true, runtimeAvailable: false, reloadable: true });
  });

  it("labels project-relative media as project media", () => {
    const item = createMediaPoolItem({
      kind: "audio",
      name: "Collected Loop.wav",
      uri: "project-media/Collected Loop.wav",
      metadata: { mediaRefKind: "project", projectRelativePath: "project-media/Collected Loop.wav" }
    });

    expect(mediaPoolStatus(item)).toMatchObject({ label: "Project media", external: false, reloadable: true });
  });

  it("marks collected and relinked media as durable native media", () => {
    let project = createDemoProject();
    const item = createMediaPoolItem({
      kind: "audio",
      name: "Lead Vocal.wav",
      uri: "C:\\Sessions\\Lead Vocal.wav",
      metadata: { external: true, userNote: "keeper" }
    });
    project = addMediaPoolItem(project, item);
    project = markMediaPoolItemCollected(project, {
      id: item.id,
      sourceUri: "C:\\Sessions\\Lead Vocal.wav",
      targetPath: "C:\\Songs\\project-media\\Lead Vocal.wav",
      targetRelativePath: ".\\project-media\\Lead Vocal.wav",
      sizeBytes: 2048
    });

    let found = findMediaPoolItem(project, item.id)!;
    expect(found.uri).toBe("project-media/Lead Vocal.wav");
    expect(found.metadata).toMatchObject({
      userNote: "keeper",
      mediaRefKind: "project",
      projectRelativePath: "project-media/Lead Vocal.wav",
      originalUri: "C:\\Sessions\\Lead Vocal.wav",
      external: false,
      runtimeOnly: false,
      missing: false,
      unresolved: false
    });
    expect(mediaPoolStatus(found)).toMatchObject({ label: "Project media", relinkable: true, reloadable: true });

    project = markMediaPoolItemRelinked(project, item.id, { uri: "D:\\Audio\\Lead Vocal.wav", sizeBytes: 4096, mimeType: "audio/wav" });
    found = findMediaPoolItem(project, item.id)!;
    expect(found).toMatchObject({ uri: "D:\\Audio\\Lead Vocal.wav", sizeBytes: 4096, mimeType: "audio/wav" });
    expect(found.metadata).toMatchObject({
      mediaRefKind: "external",
      external: true,
      missing: false,
      unresolved: false,
      analysisInvalidated: true,
      waveformNeedsRefresh: true
    });
  });

  it("normalizes project-relative media paths and rejects traversal or absolute paths", () => {
    expect(normalizeProjectRelativeMediaPath(".\\project-media\\Recordings\\.\\take.wav")).toBe("project-media/Recordings/take.wav");
    expect(normalizeProjectRelativeMediaPath("project://media/Recordings/take.wav")).toBe("project-media/Recordings/take.wav");
    expect(normalizeProjectRelativeMediaPath("project-cache\\native-audio\\imports\\decoded.wav")).toBe("project-cache/native-audio/imports/decoded.wav");
    expect(normalizeProjectRelativeMediaPath("project-media/../escape.wav")).toBe("");
    expect(normalizeProjectRelativeMediaPath("C:\\Sessions\\take.wav")).toBe("");
    expect(normalizeProjectRelativeMediaPath("file:///Sessions/take.wav")).toBe("");
    expect(normalizeProjectRelativeMediaPath("audio/take.wav")).toBe("");
  });

  it("falls back to a safe collected media target when native collection returns an unsafe relative path", () => {
    let project = createDemoProject();
    const item = createMediaPoolItem({
      kind: "audio",
      name: "Unsafe Take.wav",
      uri: "C:\\Sessions\\Unsafe Take.wav",
      metadata: { external: true }
    });
    project = addMediaPoolItem(project, item);

    const collected = markMediaPoolItemCollected(project, {
      id: item.id,
      sourceUri: "C:\\Sessions\\Unsafe Take.wav",
      targetPath: "C:\\Songs\\outside\\Unsafe Take.wav",
      targetRelativePath: "..\\outside\\Unsafe Take.wav",
      sizeBytes: 4096
    });
    const found = findMediaPoolItem(collected, item.id)!;

    expect(found.uri).toBe("project-media/Unsafe Take.wav");
    expect(found.metadata?.projectRelativePath).toBe("project-media/Unsafe Take.wav");
    expect(mediaPoolReloadCandidates(found)[0]).toMatchObject({ path: "project-media/Unsafe Take.wav", projectRelative: true });
  });

  it("clears stale source-derived metadata when relinking media", () => {
    let project = createDemoProject();
    const item = createMediaPoolItem({
      kind: "audio",
      name: "Old FLAC.flac",
      uri: "C:\\Old\\Old FLAC.flac",
      metadata: {
        external: true,
        userNote: "keep this",
        waveformPeaks: [0.1, 0.8],
        sourceEncoding: "flac",
        decodedMimeType: "audio/wav",
        nativeDecoded: true,
        nativeDecoder: "symphonia-0.6",
        nativeDecodedCacheRelativePath: "project-cache/native-audio/imports/old.wav",
        nativeDecodedCachePath: "C:\\Song\\project-cache\\native-audio\\imports\\old.wav",
        nativeDecodedCacheKind: "symphonia-import-wav",
        nativeDecodedCacheError: "old cache write failed",
        lastReloadSourceKind: "decoded-cache",
        restoredFromNativeDecodedCache: true,
        audioTransientMarkersSeconds: [0.25, 1.5],
        audioTransientThreshold: 0.5,
        audioTransientPeakCount: 16,
        audioTransientMaxPeak: 0.92,
        audioTransientUpdatedAt: "2026-01-01T00:00:00.000Z"
      }
    });
    project = addMediaPoolItem(project, item);

    const relinked = markMediaPoolItemRelinked(project, item.id, {
      uri: "D:\\New\\New Take.wav",
      name: "New Take.wav",
      sizeBytes: 8192,
      mimeType: "audio/wav"
    });
    const found = findMediaPoolItem(relinked, item.id)!;

    expect(found).toMatchObject({
      name: "New Take.wav",
      uri: "D:\\New\\New Take.wav",
      sizeBytes: 8192,
      mimeType: "audio/wav"
    });
    expect(found.metadata).toMatchObject({
      userNote: "keep this",
      mediaRefKind: "external",
      originalUri: "D:\\New\\New Take.wav",
      external: true,
      runtimeOnly: false,
      missing: false,
      unresolved: false,
      analysisInvalidated: true,
      waveformNeedsRefresh: true
    });
    expect(found.metadata?.waveformPeaks).toBeUndefined();
    expect(found.metadata?.sourceEncoding).toBeUndefined();
    expect(found.metadata?.decodedMimeType).toBeUndefined();
    expect(found.metadata?.nativeDecoded).toBeUndefined();
    expect(found.metadata?.nativeDecoder).toBeUndefined();
    expect(found.metadata?.nativeDecodedCacheRelativePath).toBeUndefined();
    expect(found.metadata?.nativeDecodedCachePath).toBeUndefined();
    expect(found.metadata?.nativeDecodedCacheKind).toBeUndefined();
    expect(found.metadata?.nativeDecodedCacheError).toBeUndefined();
    expect(found.metadata?.lastReloadSourceKind).toBeUndefined();
    expect(found.metadata?.restoredFromNativeDecodedCache).toBeUndefined();
    expect(found.metadata?.audioTransientMarkersSeconds).toBeUndefined();
    expect(found.metadata?.audioTransientThreshold).toBeUndefined();
    expect(found.metadata?.audioTransientPeakCount).toBeUndefined();
    expect(found.metadata?.audioTransientMaxPeak).toBeUndefined();
    expect(found.metadata?.audioTransientUpdatedAt).toBeUndefined();
    expect(mediaPoolReloadCandidates(found).map((candidate) => candidate.path)).toEqual(["D:\\New\\New Take.wav"]);
  });

  it("marks media missing and unresolved without dropping existing metadata", () => {
    let project = createDemoProject();
    const item = createMediaPoolItem({ kind: "audio", name: "Missing.wav", metadata: { original: "yes" } });
    project = addMediaPoolItem(project, item);
    project = markMediaPoolItemExternal(project, item.id);
    project = markMediaPoolItemMissing(project, item.id, true, "Drive unplugged");

    const found = findMediaPoolItem(project, item.id)!;
    expect(found.metadata).toMatchObject({ original: "yes", external: true, missing: true, unresolved: true, missingReason: "Drive unplugged" });
    expect(mediaPoolStatus(found)).toMatchObject({ missing: true, unresolved: true, label: "Missing" });
  });

  it("distinguishes runtime buffers, runtime-only browser imports and external unloaded media", () => {
    const external = createMediaPoolItem({ kind: "audio", name: "External.wav", uri: "file:///sessions/External.wav" });
    const browserOnly = createMediaPoolItem({ kind: "audio", name: "Browser.wav", metadata: { runtimeOnly: true } }, [external]);
    const nativeDecoded = createMediaPoolItem({
      kind: "audio",
      name: "Decoded FLAC.wav",
      uri: "C:\\Sessions\\Decoded.flac",
      metadata: {
        mediaRefKind: "external",
        external: true,
        runtimeOnly: false,
        sourceEncoding: "flac",
        decodedMimeType: "audio/wav",
        nativeDecoder: "symphonia-0.6",
        nativeDecoded: true
      }
    }, [external, browserOnly]);
    const project = addMediaPoolItem(addMediaPoolItem(addMediaPoolItem(createDemoProject(), external), browserOnly), nativeDecoded);

    expect(mediaPoolStatus(findMediaPoolItem(project, external.id)!)).toMatchObject({
      label: "External unloaded",
      runtimeAvailable: false,
      runtimeOnly: false,
      reloadable: true
    });
    expect(mediaPoolStatus(findMediaPoolItem(project, external.id)!, true)).toMatchObject({
      label: "Available in runtime",
      runtimeAvailable: true,
      reloadable: true
    });
    expect(mediaPoolStatus(findMediaPoolItem(project, browserOnly.id)!)).toMatchObject({
      label: "Browser runtime-only",
      runtimeOnly: true,
      reloadable: false,
      relinkable: true
    });
    expect(mediaPoolStatus(findMediaPoolItem(project, nativeDecoded.id)!)).toMatchObject({
      label: "External unloaded",
      external: true,
      runtimeOnly: false,
      cacheReloadable: false,
      reloadable: true
    });
  });

  it("selects native reload paths only for external or collected project media", () => {
    const external = createMediaPoolItem({ kind: "audio", name: "External.wav", uri: "C:\\Sessions\\External.wav" });
    const browserOnly = createMediaPoolItem({ kind: "audio", name: "Browser.wav", metadata: { runtimeOnly: true } }, [external]);
    const missing = createMediaPoolItem({ kind: "audio", name: "Missing.wav", uri: "C:\\Sessions\\Missing.wav", metadata: { missing: true, unresolved: true } }, [external, browserOnly]);
    const collected = createMediaPoolItem({
      kind: "audio",
      name: "Collected.wav",
      uri: "C:\\Sessions\\Collected.wav",
      metadata: {
        mediaRefKind: "project",
        projectRelativePath: "project-media/Collected.wav",
        nativePath: "C:\\Songs\\project-media\\Collected.wav",
        external: false
      }
    }, [external, browserOnly, missing]);

    expect(mediaPoolStatus(external)).toMatchObject({ reloadable: true, relinkable: true, label: "External unloaded" });
    expect(mediaPoolReloadPath(external)).toBe("C:\\Sessions\\External.wav");
    expect(mediaPoolStatus(collected)).toMatchObject({ reloadable: true, relinkable: true, label: "Project media" });
    expect(mediaPoolReloadPath(collected)).toBe("project-media/Collected.wav");
    expect(mediaPoolStatus(missing)).toMatchObject({ reloadable: false, relinkable: true, label: "Missing" });
    expect(mediaPoolReloadPath(missing)).toBeNull();
    expect(mediaPoolStatus(browserOnly)).toMatchObject({ reloadable: false, relinkable: true, label: "Browser runtime-only" });
    expect(mediaPoolReloadPath(browserOnly)).toBeNull();
  });

  it("uses decoded native cache as a project-relative reload fallback", () => {
    const cached = createMediaPoolItem({
      kind: "audio",
      name: "Imported FLAC.flac",
      uri: "D:\\Audio\\Imported FLAC.flac",
      metadata: {
        mediaRefKind: "external",
        external: true,
        nativeDecoded: true,
        nativeDecodedCacheRelativePath: "project-cache/native-audio/imports/media-001-imported-flac.wav"
      }
    });

    expect(mediaPoolStatus(cached)).toMatchObject({ reloadable: true, cacheReloadable: true });
    expect(mediaPoolReloadCandidates(cached)).toEqual([
      {
        path: "D:\\Audio\\Imported FLAC.flac",
        kind: "source",
        label: "original source",
        projectRelative: false
      },
      {
        path: "project-cache/native-audio/imports/media-001-imported-flac.wav",
        kind: "decoded-cache",
        label: "decoded native cache",
        projectRelative: true
      }
    ]);
    expect(mediaPoolReloadPath(cached)).toBe("D:\\Audio\\Imported FLAC.flac");
  });

  it("keeps missing native-decoded media reloadable from decoded cache", () => {
    const cachedMissing = createMediaPoolItem({
      kind: "audio",
      name: "Missing FLAC.flac",
      uri: "D:\\Lost\\Missing FLAC.flac",
      metadata: {
        external: true,
        missing: true,
        unresolved: true,
        nativeDecodedCacheRelativePath: "project-cache/native-audio/imports/media-002-missing-flac.wav"
      }
    });

    expect(mediaPoolStatus(cachedMissing)).toMatchObject({
      label: "Missing",
      missing: true,
      unresolved: true,
      cacheReloadable: true,
      reloadable: true,
      relinkable: true
    });
    expect(mediaPoolReloadCandidates(cachedMissing)).toEqual([{
      path: "project-cache/native-audio/imports/media-002-missing-flac.wav",
      kind: "decoded-cache",
      label: "decoded native cache",
      projectRelative: true
    }]);
    expect(mediaPoolReloadPath(cachedMissing)).toBe("project-cache/native-audio/imports/media-002-missing-flac.wav");
  });

  it("rejects unsafe project-relative source and decoded-cache reload candidates", () => {
    const unsafe = createMediaPoolItem({
      kind: "audio",
      name: "Unsafe Project Media.wav",
      uri: "project-media/../Unsafe Project Media.wav",
      metadata: {
        mediaRefKind: "project",
        projectRelativePath: "project-media/../Unsafe Project Media.wav",
        nativeDecodedCacheRelativePath: "project-cache/../decoded.wav"
      }
    });

    expect(mediaPoolStatus(unsafe)).toMatchObject({ reloadable: false });
    expect(mediaPoolReloadCandidates(unsafe)).toEqual([]);
    expect(mediaPoolReloadPath(unsafe)).toBeNull();
  });

  it("removes unused media but keeps media referenced by clips or render cache", () => {
    const base = createDemoProject();
    const unused = createMediaPoolItem({ kind: "midi", name: "Scratch.mid" });
    const used = createMediaPoolItem({ kind: "render", name: "Stem.wav" }, [unused]);
    let project = addMediaPoolItem(addMediaPoolItem(base, unused), used);
    project.renderCache.push({ id: "render_001", mediaPoolItemId: used.id, createdAt: "2026-06-09T00:00:00.000Z", invalidated: false });

    const blocked = removeUnusedMediaPoolItem(project, used.id);
    const removed = removeUnusedMediaPoolItem(project, unused.id);

    expect(blocked.removed).toBe(false);
    expect(blocked.reason).toContain("render cache");
    expect(removed.removed).toBe(true);
    expect(findMediaPoolItem(removed.project, unused.id)).toBeNull();
  });

  it("reports render cache entries linked to media pool items", () => {
    const item = createMediaPoolItem({ kind: "render", name: "Full Mix.wav" });
    const project = addMediaPoolItem(createDemoProject(), item);
    project.renderCache.push(
      { id: "cache_a", mediaPoolItemId: item.id, createdAt: "2026-06-09T00:00:00.000Z", invalidated: false },
      { id: "cache_b", createdAt: "2026-06-09T00:01:00.000Z", invalidated: false }
    );

    expect(renderCacheItemsForMedia(project, item.id).map((cache) => cache.id)).toEqual(["cache_a"]);
  });

  it("links freeze render cache entries to frozen media and source clips", () => {
    let project = createDemoProject();
    const source = project.timeline.clips[0];
    const item = createMediaPoolItem({
      kind: "audio",
      name: "Frozen Intro.wav",
      uri: "project-cache/native-audio/freezes/intro.wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 2,
      sizeBytes: 123456,
      metadata: { mediaRefKind: "external", projectRelativePath: "project-cache/native-audio/freezes/intro.wav" }
    });
    project = addMediaPoolItem(project, item);

    const linked = linkFreezeRenderCacheItem(project, {
      sourceClipId: source.id,
      mediaPoolItemId: item.id,
      createdAt: "2026-06-29T00:00:00.000Z",
      metadata: { storageMode: "native", renderAction: "freeze-selected-clip" }
    });

    expect(renderCacheItemsForMedia(linked, item.id)).toEqual([expect.objectContaining({
      id: expect.stringContaining("freeze_"),
      sourceClipId: source.id,
      mediaPoolItemId: item.id,
      profileId: "freeze-selected-clip-wav",
      createdAt: "2026-06-29T00:00:00.000Z",
      invalidated: false,
      metadata: expect.objectContaining({
        cacheKind: "freeze-render",
        sourceClipName: source.name,
        sourceTrackId: source.trackId,
        renderedMediaName: "Frozen Intro.wav",
        renderedDurationSeconds: 8,
        renderedSampleRate: 48000,
        renderedChannels: 2,
        renderedSizeBytes: 123456,
        storageMode: "native",
        renderAction: "freeze-selected-clip"
      })
    })]);
    expect(linkFreezeRenderCacheItem(linked, {
      sourceClipId: source.id,
      mediaPoolItemId: item.id,
      createdAt: "2026-06-29T00:01:00.000Z"
    }).renderCache.filter((cache) => cache.mediaPoolItemId === item.id)).toHaveLength(1);
  });

  it("summarizes render cache health across freeze, native and invalidated entries", () => {
    const item = createMediaPoolItem({ kind: "audio", name: "Frozen Intro.wav" });
    const project = addMediaPoolItem(createDemoProject(), item);
    project.renderCache.push(
      { id: "freeze_1", sourceClipId: project.timeline.clips[0].id, mediaPoolItemId: item.id, createdAt: "2026-06-29T00:00:00.000Z", invalidated: false, metadata: { cacheKind: "freeze-render" } },
      { id: "native_stem_1", createdAt: "2026-06-29T00:02:00.000Z", invalidated: false, metadata: { cacheKind: "native-generated-stem" } },
      { id: "runtime_1", mediaPoolItemId: item.id, createdAt: "2026-06-29T00:01:00.000Z", invalidated: true, metadata: { cacheKind: "native-runtime-audio" } },
      { id: "unknown_1", createdAt: "2026-06-29T00:03:00.000Z", invalidated: false }
    );

    expect(createRenderCacheSummary(project)).toEqual({
      totalCount: 4,
      activeCount: 3,
      invalidatedCount: 1,
      linkedMediaCount: 2,
      unlinkedCount: 2,
      freezeRenderCount: 1,
      nativeGeneratedStemCount: 1,
      nativeRuntimeAudioCount: 1,
      latestCreatedAt: "2026-06-29T00:03:00.000Z",
      byKind: {
        "freeze-render": 1,
        "native-generated-stem": 1,
        "native-runtime-audio": 1,
        unknown: 1
      }
    });
  });

  it("summarizes audio media waveform analysis readiness for clip editing", () => {
    let project = createDemoProject();
    const ready = createMediaPoolItem({
      kind: "audio",
      name: "Ready.wav",
      metadata: { waveformPeaks: [0.1, 0.8, 1.25, -0.2, "bad"] }
    });
    const missing = createMediaPoolItem({
      kind: "audio",
      name: "Missing waveform.wav",
      metadata: { waveformPeaks: [], waveformNeedsRefresh: true }
    }, [ready]);
    const decoded = createMediaPoolItem({
      kind: "audio",
      name: "Decoded FLAC.wav",
      metadata: {
        waveformPeaks: [0.2, 0.4],
        nativeDecodedCacheRelativePath: "project-cache/native-audio/imports/decoded.wav",
        audioTransientMarkersSeconds: [0.5, 1.25, "bad"]
      }
    }, [ready, missing]);
    project = addMediaPoolItem(addMediaPoolItem(addMediaPoolItem(project, ready), missing), decoded);
    project.timeline.clips.push(
      {
        id: "audio_ready",
        type: "audio",
        trackId: "drums",
        mediaPoolItemId: ready.id,
        startBar: 1,
        barLength: 1,
        name: "Ready clip",
        muted: false,
        color: "#7dd3ff",
        linked: true,
        transforms: { transpose: 0, octave: 0, gain: 1, stemMutes: {} }
      },
      {
        id: "audio_missing",
        type: "audio",
        trackId: "drums",
        mediaPoolItemId: missing.id,
        startBar: 2,
        barLength: 1,
        name: "Missing waveform clip",
        muted: false,
        color: "#7dd3ff",
        linked: true,
        transforms: { transpose: 0, octave: 0, gain: 1, stemMutes: {} }
      }
    );

    expect(createAudioMediaAnalysisSummary(project)).toEqual({
      audioMediaCount: 3,
      audioClipCount: 2,
      waveformReadyCount: 2,
      waveformMissingCount: 1,
      waveformPeakPointCount: 5,
      maxPeak: 1,
      normalizeReadyClipCount: 1,
      clipsMissingWaveformCount: 1,
      staleAnalysisCount: 1,
      decodedCacheCount: 1,
      transientReadyCount: 1,
      transientMarkerCount: 2
    });
  });

  it("preserves media pool and render cache entries through project roundtrip", () => {
    const item = createMediaPoolItem({ kind: "audio", name: "Room Loop.wav", metadata: { unknownFuture: { keep: true } } });
    const project = addMediaPoolItem(createDemoProject(), item);
    project.renderCache.push({ id: "render_room", mediaPoolItemId: item.id, createdAt: "2026-06-09T00:00:00.000Z", invalidated: false });
    const parsed = parsePocketDawProjectFile(buildPocketDawProjectFile(project));

    expect(parsed.mediaPool).toEqual(project.mediaPool);
    expect(parsed.renderCache).toEqual(project.renderCache);
  });

  it("creates a deterministic collect-media plan with copy and blocked buckets", () => {
    let project = createDemoProject();
    const external = createMediaPoolItem({ kind: "audio", name: "Lead Vocal.wav", uri: "C:\\Sessions\\Lead Vocal.wav" });
    const browserOnly = createMediaPoolItem({ kind: "audio", name: "Browser Take.wav", metadata: { runtimeOnly: true } }, [external]);
    const missing = createMediaPoolItem({ kind: "audio", name: "Missing.wav", uri: "file:///lost/Missing.wav", metadata: { missing: true, unresolved: true } }, [external, browserOnly]);
    const collected = createMediaPoolItem({
      kind: "audio",
      name: "Collected.wav",
      uri: "project-media/Collected.wav",
      metadata: { mediaRefKind: "project", projectRelativePath: "project-media/Collected.wav" }
    }, [external, browserOnly, missing]);
    project = addMediaPoolItem(addMediaPoolItem(addMediaPoolItem(addMediaPoolItem(project, external), browserOnly), missing), collected);

    const plan = createCollectMediaPlan(project);

    expect(plan.targetFolder).toBe("project-media");
    expect(plan.copy).toHaveLength(1);
    expect(plan.copy[0]).toMatchObject({ id: external.id, targetRelativePath: "project-media/Lead Vocal.wav" });
    expect(plan.blocked.map((item) => item.id)).toEqual(expect.arrayContaining([browserOnly.id, missing.id]));
    expect(plan.alreadyProject).toContainEqual(expect.objectContaining({ id: collected.id, targetRelativePath: "project-media/Collected.wav" }));
    expect(plan.blocked.find((item) => item.id === browserOnly.id)?.reason).toContain("Relink");
    expect(plan.blocked.find((item) => item.id === missing.id)?.reason).toContain("Relink");
  });

  it("summarizes media portability without exposing source paths", () => {
    let project = createDemoProject();
    const external = createMediaPoolItem({ kind: "audio", name: "Lead Vocal.wav", uri: "C:\\Sessions\\Lead Vocal.wav" });
    const browserOnly = createMediaPoolItem({ kind: "audio", name: "Browser Take.wav", metadata: { runtimeOnly: true } }, [external]);
    const missing = createMediaPoolItem({ kind: "audio", name: "Missing.wav", uri: "file:///lost/Missing.wav", metadata: { missing: true, unresolved: true } }, [external, browserOnly]);
    const collected = createMediaPoolItem({
      kind: "audio",
      name: "Collected.wav",
      uri: "project-media/Collected.wav",
      metadata: { mediaRefKind: "project", projectRelativePath: "project-media/Collected.wav" }
    }, [external, browserOnly, missing]);
    project = addMediaPoolItem(addMediaPoolItem(addMediaPoolItem(addMediaPoolItem(project, external), browserOnly), missing), collected);

    const summary = createMediaPortabilitySummary(project);

    expect(summary).toEqual({
      totalMediaCount: 4,
      audioMediaCount: 4,
      portableCount: 1,
      alreadyProjectCount: 1,
      copyableExternalCount: 1,
      cacheOnlyCount: 0,
      blockedCount: 2,
      runtimeOnlyCount: 1,
      missingOrUnresolvedCount: 1,
      needsCollectionOrRelinkCount: 3,
      embeddedSourceProjectPortable: false
    });
    expect(JSON.stringify(summary)).not.toContain("C:\\");
    expect(JSON.stringify(summary)).not.toContain("file://");
  });

  it("verifies action-level media portability with cache-only recovery state", () => {
    let project = createDemoProject();
    const external = createMediaPoolItem({ kind: "audio", name: "Lead Vocal.wav", uri: "C:\\Sessions\\Lead Vocal.wav" });
    const cachedMissing = createMediaPoolItem({
      kind: "audio",
      name: "Recovered Take.wav",
      uri: "file:///lost/Recovered Take.wav",
      metadata: {
        missing: true,
        unresolved: true,
        nativeDecodedCacheRelativePath: "project-cache/native-audio/imports/recovered.wav",
        nativeDecodedCachePath: "C:\\Songs\\project-cache\\native-audio\\imports\\recovered.wav",
        lastReloadSourcePath: "C:\\Sessions\\Recovered Take.wav"
      }
    }, [external]);
    const collected = createMediaPoolItem({
      kind: "audio",
      name: "Collected.wav",
      uri: "project-media/Collected.wav",
      metadata: {
        mediaRefKind: "project",
        projectRelativePath: "project-media/Collected.wav",
        originalUri: "C:\\Sessions\\Collected.wav",
        nativePath: "C:\\Songs\\project-media\\Collected.wav"
      }
    }, [external, cachedMissing]);
    project = addMediaPoolItem(addMediaPoolItem(addMediaPoolItem(project, external), cachedMissing), collected);

    const verification = verifyMediaPortability(project);

    expect(verification).toMatchObject({
      totalMediaCount: 3,
      portableCount: 1,
      copyableExternalCount: 1,
      cacheOnlyCount: 1,
      missingOrUnresolvedCount: 1,
      needsCollectionOrRelinkCount: 2,
      embeddedSourceProjectPortable: false
    });
    expect(verification.items.find((item) => item.id === cachedMissing.id)).toMatchObject({
      state: "cache-only",
      action: "reload-cache",
      hasDecodedCache: true
    });
    expect(JSON.stringify(verification)).not.toContain("C:\\");
    expect(JSON.stringify(verification)).not.toContain("file://");

    const portableProject = createPortableMediaProject(project);
    const shared = verifySharedMediaPortability(portableProject);
    expect(shared).toMatchObject({
      localReferenceFieldCount: 1,
      localReferenceItemCount: 1,
      portableForSharing: false
    });
    expect(shared.affectedFieldKeys).toEqual(["uri"]);
    expect(JSON.stringify(portableProject.mediaPool.find((item) => item.id === collected.id))).not.toContain("C:\\");
    expect(JSON.stringify(portableProject.mediaPool.find((item) => item.id === collected.id))).not.toContain("originalUri");
  });

  it("initializes media pool and render cache when migrating older projects", () => {
    const oldProject = createDemoProject() as unknown as Record<string, unknown>;
    delete oldProject.mediaPool;
    delete oldProject.renderCache;

    const migrated = migratePocketDawProject(oldProject);

    expect(migrated.mediaPool).toEqual([]);
    expect(migrated.renderCache).toEqual([]);
  });
});
