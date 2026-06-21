import { describe, expect, it } from "vitest";
import { createDemoProject } from "../src/demo/demoProject";
import { validateProjectInvariants } from "../src/daw/projectInvariants";

describe("project invariant validation", () => {
  it("accepts the demo project without blocking errors", () => {
    const report = validateProjectInvariants(createDemoProject());

    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
  });

  it("reports duplicate ids and dangling audio references", () => {
    const project = createDemoProject();
    project.timeline.markers.push({ ...project.timeline.markers[0] });
    project.timeline.clips.push({
      ...project.timeline.clips[0],
      id: "bad_audio",
      type: "audio",
      trackId: "missing-track",
      mediaPoolItemId: "missing-media",
      metadata: { durationSeconds: -1, sourceOffsetSeconds: Number.NaN }
    });

    const report = validateProjectInvariants(project);
    const codes = report.errors.map((issue) => issue.code);

    expect(report.ok).toBe(false);
    expect(codes).toEqual(expect.arrayContaining(["duplicate-id", "missing-clip-track", "missing-clip-media", "invalid-audio-clip-metadata"]));
  });

  it("warns when schema-valid control clip types are present", () => {
    const project = createDemoProject();
    project.timeline.clips.push({
      ...project.timeline.clips[0],
      id: "marker_clip",
      type: "marker"
    });

    const report = validateProjectInvariants(project);

    expect(report.warnings.map((issue) => issue.code)).toContain("control-only-clip-type");
  });
});
