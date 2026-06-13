import { describe, expect, it } from "vitest";
import { migratePocketDawProject } from "../src/compatibility/migrations";
import { buildPocketDawProjectFile, parsePocketDawProjectFile } from "../src/daw/dawProject";
import {
  addMediaPoolItem,
  createCollectMediaPlan,
  createMediaPoolItem,
  findMediaPoolItem,
  markMediaPoolItemExternal,
  markMediaPoolItemCollected,
  markMediaPoolItemMissing,
  markMediaPoolItemRelinked,
  mediaPoolStatus,
  removeUnusedMediaPoolItem,
  renderCacheItemsForMedia,
  updateMediaPoolItem,
  updateMediaPoolItemMetadata
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
      targetRelativePath: "project-media/Lead Vocal.wav",
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
    expect(found.metadata).toMatchObject({ mediaRefKind: "external", external: true, missing: false, unresolved: false });
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
    const project = addMediaPoolItem(addMediaPoolItem(createDemoProject(), external), browserOnly);

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
      reloadable: false
    });
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
    project = addMediaPoolItem(addMediaPoolItem(addMediaPoolItem(project, external), browserOnly), missing);

    const plan = createCollectMediaPlan(project);

    expect(plan.targetFolder).toBe("project-media");
    expect(plan.copy).toHaveLength(1);
    expect(plan.copy[0]).toMatchObject({ id: external.id, targetRelativePath: "project-media/Lead Vocal.wav" });
    expect(plan.blocked.map((item) => item.id)).toEqual(expect.arrayContaining([browserOnly.id, missing.id]));
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
