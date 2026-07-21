import { describe, expect, it } from "vitest";
import { sanitizePocketChordsmithProject } from "../src/compatibility/pcsSanitizer";
import { createDawProjectFromChordsmithProject } from "../src/compatibility/pcsToDaw";
import { PCS17_FORMAT_FEATURES } from "../src/compatibility/pcsCapabilities";
import { renderTimelineEvents, type RenderedEvent } from "../src/audio/eventRenderer";
import { normalizeRenderedEventForPocketAudioCore } from "../src/audio/pocketAudioCoreAdapter";
import { nativeRenderCacheSignature } from "../src/audio/nativeRenderCache";
import { buildPocketDawProjectFile, parsePocketDawProjectFile } from "../src/daw/dawProject";
import { migratePocketDawProject } from "../src/compatibility/migrations";

function funkSchema17() {
  return {
    projectVersion: 17,
    title: "Schema 17 Funk",
    bpm: 104,
    resolution: 4,
    ppq: 480,
    sectionBars: { A: 1 },
    songSequence: ["A"],
    formatFeatures: [...PCS17_FORMAT_FEATURES, "future-expression-v9"],
    soundProfile: {
      id: "funk_groove",
      preset: "funk_classic_pocket",
      recipeVersion: 3,
      parameters: { pocket: 0.78, ghostNotes: 0.42, futureKnob: 0.91 }
    },
    sections: {
      A: {
        tracks: {
          bass: {
            events: [
              {
                step: 0,
                duration: 1,
                note: 36,
                velocity: 112,
                articulation: "slap",
                sound: "funk_slap_pop",
                role: "anchor",
                expression: { brightness: 0.73, futureExpression: { curve: "z" } },
                technique: { funk: { hand: "thumb", pocketOffset: 0.08 }, futureStyle: { keep: true } },
                futureEventField: "preserve"
              },
              { tick: 240, duration: 240, note: 43, velocity: 72, articulation: "pop", sound: "funk_slap_pop", expression: {}, technique: { funk: { hand: "finger" } } }
            ]
          },
          drums: {
            events: [
              { step: 0, duration: 1, velocity: 118, articulation: "accent", sound: "kick", role: "the-one", expression: {}, technique: {} },
              { step: 2, duration: 0.5, velocity: 44, articulation: "ghost", sound: "snare", role: "ghost", expression: {}, technique: { funk: { ghostDepth: 0.75 } } },
              { step: 3, duration: 1, velocity: 88, articulation: "accent", sound: "china", role: "fill", expression: {}, technique: {} }
            ]
          }
        },
        futureSectionField: { keep: true }
      }
    },
    futureTopLevel: { keep: [1, 2, 3] }
  };
}

describe("Pocket DAW sound-profile evolution", () => {
  it("preserves schema-17 profile/rich intent, renders the supported subset, and reports explicit fallbacks", () => {
    const source = funkSchema17();
    const sanitized = sanitizePocketChordsmithProject(source);
    const project = createDawProjectFromChordsmithProject(sanitized);
    const events = renderTimelineEvents(project);
    const report = project.unknownFields?.pcsCompatibility as unknown as { entries: Array<Record<string, unknown>>; lossCount: number };

    expect(sanitized.projectVersion).toBe(17);
    expect(sanitized.formatFeatures).toEqual([...PCS17_FORMAT_FEATURES, "future-expression-v9"]);
    expect(sanitized.soundProfile).toEqual({
      id: "funk_groove",
      preset: "funk_classic_pocket",
      recipeVersion: 3,
      parameters: { pocket: 0.78, ghostNotes: 0.42, futureKnob: 0.91 }
    });
    expect(sanitized.sections.A.richEvents.bass[0].raw).toMatchObject({
      futureEventField: "preserve",
      expression: { futureExpression: { curve: "z" } },
      technique: { futureStyle: { keep: true } }
    });
    expect(events.some((event) => event.kind === "bass" && event.articulation === "slap" && event.sound === "funk_slap_pop" && event.performanceRole === "anchor")).toBe(true);
    expect(events.find((event) => event.kind === "bass" && event.articulation === "slap")?.midi).toBe(36);
    expect(events.some((event) => event.kind === "snare" && event.articulation === "ghost" && event.technique?.funk)).toBe(true);
    expect(events.some((event) => event.kind === "crash" && event.sound === "china")).toBe(true);
    expect(report.lossCount).toBeGreaterThan(0);
    expect(report.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ feature: "drum-lane:china", action: "fallback", fallback: "crash" }),
      expect.objectContaining({ feature: "sound:funk_slap_pop", action: "approximated", fallback: "soft_upright" })
    ]));

    const reopened = migratePocketDawProject(parsePocketDawProjectFile(buildPocketDawProjectFile(project)));
    expect(reopened.sourceRefs[0].original).toMatchObject({
      futureTopLevel: { keep: [1, 2, 3] },
      sections: { A: { futureSectionField: { keep: true } } }
    });
    expect(reopened.sourceRefs[0].normalized).toMatchObject({ soundProfile: { id: "funk_groove", recipeVersion: 3 } });
    const reopenedNormalized = reopened.sourceRefs[0].normalized as Record<string, any>;
    expect(reopenedNormalized.sections.A.richEvents.bass[0]).toMatchObject({ articulation: "slap" });
  });

  it("keeps schema 16 readable and canonicalizes the legacy chip alias only at the first-class profile boundary", () => {
    const sanitized = sanitizePocketChordsmithProject({ projectVersion: 16, audioProfile: "chip_tune", chipPreset: "chip_arcade_start" });
    expect(sanitized.projectVersion).toBe(16);
    expect(sanitized.soundProfile.id).toBe("chip_arcade");
    expect(sanitized.audioProfile).toBe("chip_arcade");
    expect(sanitized.sections.A.active).toBe(true);
  });

  it("defers marked compact mirrors but renders unmarked authored rich tracks", () => {
    const renderBass = (compatibility?: Record<string, unknown>) => {
      const source = funkSchema17() as Record<string, any>;
      source.soundProfile = { id: "standard", preset: "standard_chordsmith", recipeVersion: 1, parameters: {} };
      source.audioProfile = "standard";
      source.bassMode = "manual";
      source.bassNotesA = [0];
      source.sections.A.tracks.bass = {
        ...(compatibility ? { compatibility } : {}),
        events: [{ step: 0, duration: 1, ...(compatibility ? {} : { durationTicks: 240 }), note: compatibility ? 99 : 61, velocity: 100, articulation: "finger" }]
      };
      return renderTimelineEvents(createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject(source)))
        .filter((event) => event.kind === "bass");
    };

    expect(renderBass({ compactMirror: true }).some((event) => event.midi === 99)).toBe(false);
    const authored = renderBass();
    expect(authored.map((event) => event.midi)).toEqual([61]);
    expect(authored[0].duration).toBeCloseTo((240 / 480) * (60 / 104), 5);
  });

  it("includes profile recipes, parameters, articulations, and technique fields in native cache signatures", () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject(funkSchema17()));
    const baseline = nativeRenderCacheSignature(project);
    const parameterEdit = structuredClone(project);
    const parameterNormalized = parameterEdit.sourceRefs[0].normalized as Record<string, any>;
    parameterNormalized.soundProfile.parameters.pocket = 0.21;
    expect(nativeRenderCacheSignature(parameterEdit)).not.toBe(baseline);

    const techniqueEdit = structuredClone(project);
    const techniqueNormalized = techniqueEdit.sourceRefs[0].normalized as Record<string, any>;
    techniqueNormalized.sections.A.richEvents.bass[0].articulation = "mute";
    techniqueNormalized.sections.A.richEvents.bass[0].technique.funk.hand = "finger";
    expect(nativeRenderCacheSignature(techniqueEdit)).not.toBe(baseline);
  });

  it("keeps Metal profile and texture fields in the Pocket Audio adapter", () => {
    const event = {
      id: "metal-event",
      clipId: "clip",
      trackId: "guitar",
      role: "guitar",
      kind: "guitar",
      bar: 1,
      step: 0,
      time: 0,
      duration: 0.2,
      velocity: 0.8,
      midiNotes: [40, 47, 52],
      instrument: "tight_metal",
      articulation: "palm_mute",
      metalPreset: "metal_tight_riff",
      metalTexture: { enabled: true, drive: 0.81, palmMute: 0.9, pickAttack: 0.75 },
      soundProfile: { id: "heavy_metal", preset: "metal_tight_riff", recipeVersion: 2, parameters: { drive: 0.81 } },
      technique: { metal: { pickDirection: "down", dualTakeSeed: 42 } }
    } as RenderedEvent;

    expect(normalizeRenderedEventForPocketAudioCore(event)).toMatchObject({
      metalPreset: "metal_tight_riff",
      metalTexture: { drive: 0.81, palmMute: 0.9, pickAttack: 0.75 },
      soundProfile: { id: "heavy_metal", recipeVersion: 2 },
      technique: { metal: { dualTakeSeed: 42 } }
    });
  });

  it("makes imported Funk pocket, ghost-note, and stab parameters change DAW event timing and dynamics", () => {
    const render = (parameters: Record<string, number>) => {
      const source = funkSchema17() as Record<string, any>;
      source.soundProfile.parameters = {
        pocket: 0.72,
        ghostNotes: 0.42,
        slapAmount: 0.68,
        popBrightness: 0.62,
        muteDepth: 0.74,
        stabTightness: 0.76,
        ...parameters
      };
      source.sections.A.tracks.bass.events[0].step = 1;
      delete source.sections.A.tracks.bass.events[0].tick;
      delete source.sections.A.tracks.bass.events[0].technique.funk.pocketOffset;
      source.sections.A.tracks.chords = {
        events: [{ step: 3, duration: 2, notes: [52, 59, 64], velocity: 90, articulation: "staccato", sound: "funk_clav_stab", expression: {}, technique: {} }]
      };
      return renderTimelineEvents(createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject(source)));
    };

    const pocketLow = render({ pocket: 0.1 }).find((event) => event.kind === "bass" && event.articulation === "slap")!;
    const pocketHigh = render({ pocket: 0.9 }).find((event) => event.kind === "bass" && event.articulation === "slap")!;
    expect(pocketHigh.time).not.toBe(pocketLow.time);

    const ghostLow = render({ ghostNotes: 0.1 }).find((event) => event.kind === "snare" && event.articulation === "ghost")!;
    const ghostHigh = render({ ghostNotes: 0.9 }).find((event) => event.kind === "snare" && event.articulation === "ghost")!;
    expect(ghostHigh.velocity).toBeGreaterThan(ghostLow.velocity);

    const stabLoose = render({ stabTightness: 0.1 }).find((event) => event.kind === "chord")!;
    const stabTight = render({ stabTightness: 0.9 }).find((event) => event.kind === "chord")!;
    expect(stabTight.duration).toBeLessThan(stabLoose.duration);
  });
});
