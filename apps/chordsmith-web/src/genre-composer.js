(function attachPocketChordsmithGenreComposer(global) {
  "use strict";

  // This is intentionally dependency-free so the hosted single-file app can load it
  // before its legacy editor script. It plans musical intent only; the editor owns
  // project mutation, transport, rendering, and export.
  const VERSION = "genre-composer-v1";
  const SECTION_IDS = ["A", "B", "C", "D", "E", "F", "G", "H"];

  const GENRES = {
    metal: {
      label: "Heavy Metal",
      profile: "heavy_metal",
      scale: "minor",
      keys: ["E", "D", "A", "F#", "C"],
      required: ["tight_metal", "metal_pick_bass", "metal_tight"],
      forbiddenLeads: [
        "banjo",
        "cowboy_whistle",
        "mellow_vibes",
        "tape_bell",
        "soft",
      ],
      archetypes: {
        metal_classic_chug: {
          label: "Classic Chug",
          range: [105, 145],
          preferred: [118, 128, 136],
          modalColor: "natural_minor",
          progression: [0, 5, 6, 4],
          contrast: [0, 6, 5, 4],
          motif: [0, 0, 3, 0, 4, 3, 1, 0],
          rhythm: [0, 2, 3, 6, 8, 10, 12, 14],
          guitar: "metal_chug",
          lead: "distorted_lead_guitar",
        },
        metal_thrashing_gallop: {
          label: "Thrash Gallop",
          range: [155, 205],
          preferred: [168, 176, 188],
          modalColor: "phrygian",
          progression: [0, 1, 0, 6],
          contrast: [0, 6, 1, 4],
          motif: [0, 0, 1, 3, 0, 4, 3, 1],
          rhythm: [0, 1, 3, 4, 5, 7, 8, 9, 11, 12, 13, 15],
          guitar: "thrash_gallop",
          lead: "twin_harmony_lead",
        },
        metal_doom_procession: {
          label: "Doom Procession",
          range: [55, 85],
          preferred: [62, 70, 78],
          modalColor: "harmonic_minor",
          progression: [0, 6, 5, 1],
          contrast: [0, 4, 6, 5],
          motif: [0, null, 4, null, 3, null, 1, null],
          rhythm: [0, 4, 8, 12],
          guitar: "doom_slow",
          lead: "distorted_lead_guitar",
        },
        metal_power_anthem: {
          label: "Power Anthem",
          range: [145, 190],
          preferred: [150, 162, 176],
          modalColor: "natural_minor",
          progression: [0, 5, 2, 6],
          contrast: [0, 3, 5, 4],
          motif: [0, 3, 5, 4, 3, 1, 0, 4],
          rhythm: [0, 2, 4, 6, 8, 10, 12, 14],
          guitar: "rock_eighths",
          lead: "twin_harmony_lead",
        },
        metal_boss_blast: {
          label: "Boss Blast",
          range: [190, 228],
          preferred: [196, 212, 220],
          modalColor: "phrygian_dominant",
          progression: [0, 1, 6, 4],
          contrast: [0, 6, 5, 1],
          motif: [0, 1, 0, 4, 3, 1, 6, 0],
          rhythm: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
          guitar: "tremolo_drive",
          lead: "shred_lead_guitar",
        },
        metal_breakdown_gate: {
          label: "Breakdown Gate",
          range: [85, 125],
          preferred: [92, 104, 116],
          modalColor: "phrygian",
          progression: [0, 0, 1, 0],
          contrast: [0, 6, 1, 0],
          motif: [0, null, 0, 1, null, 0, 6, null],
          rhythm: [0, 3, 6, 8, 11, 14],
          guitar: "breakdown_stabs",
          lead: "distorted_lead_guitar",
        },
      },
      forms: [
        [
          { role: "intro", bars: 4, energy: 0.28, lead: "sparse" },
          { role: "verse", bars: 8, energy: 0.62, lead: "none" },
          { role: "chorus", bars: 8, energy: 0.88, lead: "hook" },
          {
            role: "verse",
            bars: 8,
            energy: 0.68,
            lead: "none",
            variation: true,
          },
          { role: "breakdown", bars: 4, energy: 0.48, lead: "none" },
          { role: "solo", bars: 8, energy: 0.82, lead: "solo" },
          {
            role: "chorus",
            bars: 8,
            energy: 0.96,
            lead: "hook",
            variation: true,
          },
          { role: "outro", bars: 4, energy: 0.36, lead: "sparse" },
        ],
        [
          { role: "intro", bars: 4, energy: 0.34, lead: "none" },
          { role: "verse", bars: 8, energy: 0.58, lead: "none" },
          { role: "prechorus", bars: 4, energy: 0.74, lead: "riser" },
          { role: "chorus", bars: 8, energy: 0.92, lead: "hook" },
          { role: "breakdown", bars: 4, energy: 0.45, lead: "none" },
          {
            role: "verse",
            bars: 8,
            energy: 0.7,
            lead: "none",
            variation: true,
          },
          { role: "chorus", bars: 8, energy: 1, lead: "hook", variation: true },
          { role: "outro", bars: 4, energy: 0.4, lead: "sparse" },
        ],
      ],
    },
    lofi: {
      label: "Lofi / Chill",
      profile: "lofi_chill",
      scale: "minor",
      keys: ["A", "D", "E", "C", "F"],
      required: ["warm_sub", "lofi_dusty"],
      forbiddenLeads: ["shred_lead_guitar"],
      archetypes: {
        lofi_study_room: {
          label: "Study Beat",
          range: [68, 84],
          preferred: [72, 76, 80],
          progression: [0, 5, 2, 6],
          contrast: [0, 3, 5, 4],
          motif: [0, 2, 4, null, 2, 0, null, 5],
          rhythm: [0, 3, 6, 10, 14],
          lead: "mellow_vibes",
        },
        lofi_rainy_window: {
          label: "Rainy Boom-bap",
          range: [76, 94],
          preferred: [78, 84, 90],
          progression: [0, 5, 3, 6],
          contrast: [0, 6, 3, 4],
          motif: [0, null, 2, 4, null, 2, 0, null],
          rhythm: [0, 4, 7, 11, 14],
          lead: "tape_bell",
        },
        lofi_sleepy_waltz: {
          label: "Sleepy Waltz",
          range: [62, 86],
          preferred: [66, 72, 78],
          timeSig: 3,
          progression: [0, 5, 3, 4],
          contrast: [0, 3, 5, 0],
          motif: [0, 2, 4, 2, 0, null],
          rhythm: [0, 4, 8],
          lead: "mellow_vibes",
        },
        lofi_koi_pond: {
          label: "Koi Loop",
          range: [68, 82],
          preferred: [70, 74, 78],
          scale: "major",
          progression: [0, 5, 3, 4],
          contrast: [0, 3, 4, 0],
          motif: [0, 2, 4, null, 5, 4, 2, null],
          rhythm: [0, 3, 8, 11],
          lead: "tape_bell",
        },
      },
      forms: [
        [
          { role: "intro", bars: 4, energy: 0.2, lead: "sparse" },
          { role: "verse", bars: 8, energy: 0.55, lead: "motif" },
          { role: "bridge", bars: 4, energy: 0.35, lead: "none" },
          {
            role: "verse",
            bars: 8,
            energy: 0.62,
            lead: "motif",
            variation: true,
          },
          { role: "chorus", bars: 4, energy: 0.7, lead: "hook" },
          { role: "verse", bars: 8, energy: 0.56, lead: "motif" },
          { role: "outro", bars: 4, energy: 0.22, lead: "sparse" },
        ],
      ],
    },
    western: {
      label: "Western",
      profile: "western_frontier",
      scale: "major",
      keys: ["G", "D", "C", "A", "E"],
      required: ["saloon_piano", "western_twang"],
      forbiddenLeads: ["shred_lead_guitar", "distorted_lead_guitar"],
      archetypes: {
        western_frontier_ride: {
          label: "Frontier Ride",
          range: [88, 120],
          preferred: [96, 104, 112],
          progression: [0, 3, 4, 0],
          contrast: [0, 4, 3, 0],
          motif: [0, 2, 4, 5, 4, 2, 0, null],
          rhythm: [0, 4, 8, 12],
          lead: "harmonica",
        },
        western_train_chase: {
          label: "Train Chase",
          range: [110, 150],
          preferred: [116, 124, 136],
          progression: [0, 4, 3, 4],
          contrast: [0, 3, 4, 0],
          motif: [0, 2, 4, 2, 5, 4, 2, 0],
          rhythm: [0, 2, 4, 6, 8, 10, 12, 14],
          lead: "banjo",
        },
        western_cowboy_waltz: {
          label: "Cowboy Waltz",
          range: [76, 112],
          preferred: [82, 88, 96],
          timeSig: 3,
          progression: [0, 3, 4, 0],
          contrast: [0, 4, 3, 0],
          motif: [0, 2, 4, 2, 0, null],
          rhythm: [0, 4, 8],
          lead: "harmonica",
        },
        western_duel: {
          label: "Duel",
          range: [70, 102],
          preferred: [76, 86, 96],
          scale: "minor",
          progression: [0, 6, 5, 4],
          contrast: [0, 4, 1, 0],
          motif: [0, null, 4, 3, null, 1, 0, null],
          rhythm: [0, 4, 8, 12],
          lead: "cowboy_whistle",
        },
      },
      forms: [
        [
          { role: "intro", bars: 4, energy: 0.25, lead: "sparse" },
          { role: "verse", bars: 8, energy: 0.54, lead: "call" },
          { role: "chorus", bars: 8, energy: 0.75, lead: "hook" },
          {
            role: "verse",
            bars: 8,
            energy: 0.58,
            lead: "response",
            variation: true,
          },
          { role: "bridge", bars: 4, energy: 0.48, lead: "none" },
          {
            role: "chorus",
            bars: 8,
            energy: 0.82,
            lead: "hook",
            variation: true,
          },
          { role: "outro", bars: 4, energy: 0.3, lead: "sparse" },
        ],
      ],
    },
    chip: {
      label: "Chiptune",
      profile: "chip_arcade",
      scale: "major",
      keys: ["C", "E", "G", "A", "D"],
      required: ["chip_triangle_bass", "chip_noise_kit"],
      forbiddenLeads: ["banjo", "cowboy_whistle", "shred_lead_guitar"],
      archetypes: {
        chip_arcade_start: {
          label: "Arcade Start",
          range: [108, 132],
          preferred: [116, 124, 128],
          progression: [0, 4, 5, 3],
          contrast: [0, 5, 3, 4],
          motif: [0, 2, 4, 7, 4, 2, 0, 5],
          rhythm: [0, 2, 4, 6, 8, 10, 12, 14],
          lead: "chip_square_lead",
        },
        chip_bug_maze_pulse: {
          label: "Dungeon Pulse",
          range: [112, 142],
          preferred: [124, 130, 138],
          scale: "minor",
          progression: [0, 6, 5, 3],
          contrast: [0, 2, 5, 4],
          motif: [0, 1, 3, 4, 6, 4, 3, 1],
          rhythm: [0, 2, 3, 6, 8, 10, 11, 14],
          lead: "modern_chip_lead",
        },
        chip_neon_boss: {
          label: "Boss",
          range: [132, 164],
          preferred: [142, 150, 158],
          scale: "minor",
          progression: [0, 5, 6, 4],
          contrast: [0, 1, 6, 4],
          motif: [0, 4, 3, 1, 0, 6, 4, 3],
          rhythm: [0, 1, 3, 4, 6, 7, 8, 9, 11, 12, 14, 15],
          lead: "chip_pulse_lead",
        },
        chip_menu_glow: {
          label: "Menu Glow",
          range: [88, 112],
          preferred: [92, 100, 108],
          progression: [0, 4, 3, 4],
          contrast: [0, 3, 4, 0],
          motif: [0, 2, 4, null, 5, 4, 2, null],
          rhythm: [0, 4, 8, 12],
          lead: "chip_bell_stack",
        },
      },
      forms: [
        [
          { role: "intro", bars: 4, energy: 0.32, lead: "motif" },
          { role: "verse", bars: 8, energy: 0.62, lead: "motif" },
          { role: "chorus", bars: 8, energy: 0.86, lead: "hook" },
          { role: "bridge", bars: 4, energy: 0.44, lead: "none" },
          { role: "solo", bars: 8, energy: 0.78, lead: "solo" },
          {
            role: "chorus",
            bars: 8,
            energy: 0.92,
            lead: "hook",
            variation: true,
          },
          { role: "outro", bars: 4, energy: 0.35, lead: "sparse" },
        ],
      ],
    },
    funk: {
      label: "Funk",
      profile: "funk_groove",
      scale: "minor",
      keys: ["E", "A", "D", "G", "C"],
      required: ["funk_muted", "funk_dry_pocket"],
      forbiddenLeads: ["shred_lead_guitar", "cowboy_whistle", "banjo"],
      archetypes: {
        funk_classic_pocket: {
          label: "Classic Pocket",
          range: [88, 112],
          preferred: [92, 98, 104],
          progression: [0, 3, 4, 0],
          contrast: [0, 6, 3, 4],
          motif: [0, null, 4, 2, 0, 5, null, 4],
          rhythm: [0, 3, 6, 8, 10, 14],
          lead: "funk_muted_trumpet",
        },
        funk_slap_party: {
          label: "Slap Party",
          range: [105, 125],
          preferred: [108, 114, 120],
          progression: [0, 6, 3, 4],
          contrast: [0, 3, 4, 0],
          motif: [0, 7, 4, null, 5, 7, 4, 0],
          rhythm: [0, 2, 5, 7, 8, 10, 13, 15],
          lead: "funk_sax_punch",
        },
        funk_clav_stabs: {
          label: "Clav Stabs",
          range: [92, 116],
          preferred: [96, 104, 110],
          progression: [0, 3, 4, 0],
          contrast: [0, 5, 3, 4],
          motif: [0, null, 2, 4, null, 2, 5, 4],
          rhythm: [0, 3, 6, 8, 11, 14],
          lead: "funk_muted_trumpet",
        },
        funk_brass_break: {
          label: "Brass Break",
          range: [105, 125],
          preferred: [108, 116, 122],
          progression: [0, 3, 5, 4],
          contrast: [0, 6, 3, 4],
          motif: [0, 4, 5, 7, 5, 4, 2, 0],
          rhythm: [0, 2, 4, 7, 8, 10, 12, 15],
          lead: "funk_sax_punch",
        },
      },
      forms: [
        [
          { role: "intro", bars: 4, energy: 0.28, lead: "none" },
          { role: "verse", bars: 8, energy: 0.62, lead: "call" },
          { role: "chorus", bars: 8, energy: 0.84, lead: "hook" },
          { role: "bridge", bars: 4, energy: 0.42, lead: "none" },
          {
            role: "verse",
            bars: 8,
            energy: 0.68,
            lead: "response",
            variation: true,
          },
          { role: "solo", bars: 4, energy: 0.78, lead: "solo" },
          {
            role: "chorus",
            bars: 8,
            energy: 0.9,
            lead: "hook",
            variation: true,
          },
          { role: "outro", bars: 4, energy: 0.36, lead: "sparse" },
        ],
      ],
    },
  };

  function hashSeed(value) {
    const text = String(value == null ? 0 : value);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function createRng(seed) {
    let value = hashSeed(seed) || 0x6d2b79f5;
    return function nextRandom() {
      value |= 0;
      value = (value + 0x6d2b79f5) | 0;
      let result = Math.imul(value ^ (value >>> 15), 1 | value);
      result =
        (result + Math.imul(result ^ (result >>> 7), 61 | result)) ^ result;
      return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
  }

  function choose(random, values) {
    return values[
      Math.min(values.length - 1, Math.floor(random() * values.length))
    ];
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function transformedMotif(motif, transform, amount) {
    const shift = amount || 0;
    const source = Array.isArray(motif) ? motif : [];
    if (transform === "truncate")
      return source.slice(0, Math.max(4, source.length - 2));
    if (transform === "extend")
      return source.concat(
        source
          .slice(0, 2)
          .map((note) => (note == null ? null : clamp(note + 2, 0, 13))),
      );
    if (transform === "invert")
      return source.map((note) =>
        note == null ? null : clamp(7 - note, 0, 13),
      );
    if (transform === "octave")
      return source.map((note) =>
        note == null ? null : clamp(note + 7, 0, 13),
      );
    if (transform === "response")
      return source.map((note, index) =>
        note == null ? null : clamp(note + (index % 2 ? -2 : 2), 0, 13),
      );
    return source.map((note) =>
      note == null ? null : clamp(note + shift, 0, 13),
    );
  }

  function scorePhrase(notes, options) {
    const safeNotes = Array.isArray(notes)
      ? notes.filter((note) => Number.isFinite(note))
      : [];
    if (!safeNotes.length) return -100;
    let score = 0;
    let leaps = 0;
    safeNotes.forEach((note, index) => {
      if (note >= 0 && note <= 13) score += 2;
      if (index && Math.abs(note - safeNotes[index - 1]) > 5) {
        leaps += 1;
        score -= 3;
      }
    });
    const last = safeNotes[safeNotes.length - 1];
    if ([0, 2, 4, 5, 7].includes(last % 7)) score += 3;
    if (new Set(safeNotes).size >= Math.min(3, safeNotes.length)) score += 2;
    if (options && options.role === "none") score -= 100;
    return score - leaps;
  }

  function selectMotifCandidate(identity, section, random) {
    const transforms =
      section.lead === "none"
        ? ["transpose"]
        : ["transpose", "response", "invert", "octave", "truncate"];
    const candidates = transforms.map((transform, index) => {
      const notes = transformedMotif(
        identity.motif,
        transform,
        (index + Math.floor(random() * 3)) % 3,
      );
      return { transform, notes, score: scorePhrase(notes, section) };
    });
    return candidates.sort((left, right) => right.score - left.score)[0];
  }

  function progressionForRole(identity, role, index) {
    const base =
      role === "chorus" || role === "bridge" || role === "solo"
        ? identity.contrastProgression
        : identity.primaryProgression;
    const rotation =
      role === "verse" && index > 1
        ? 1
        : role === "outro"
          ? Math.max(0, base.length - 1)
          : 0;
    return base.map(
      (_, degreeIndex) => base[(degreeIndex + rotation) % base.length],
    );
  }

  function makeSequence(sections, gameLoop) {
    const ids = sections.map((section) => section.id);
    if (gameLoop)
      return ids.length > 3
        ? [ids[0], ids[1], ids[1], ids[2], ids[1], ids[3] || ids[0]]
        : ids;
    const verse = sections.find((section) => section.role === "verse");
    const chorus = sections.find((section) => section.role === "chorus");
    const sequence = ids.slice();
    if (verse) sequence.splice(Math.min(2, sequence.length), 0, verse.id);
    if (chorus) sequence.splice(Math.max(1, sequence.length - 1), 0, chorus.id);
    return sequence.slice(0, 16);
  }

  function resolveArchetype(genreId, requestedId, random) {
    const genre = GENRES[genreId];
    if (!genre) throw new Error(`Unsupported genre: ${genreId}`);
    if (requestedId && genre.archetypes[requestedId])
      return [requestedId, genre.archetypes[requestedId]];
    const id = choose(random, Object.keys(genre.archetypes));
    return [id, genre.archetypes[id]];
  }

  function composeSong(options) {
    const input = options || {};
    const genreId = String(input.genre || "metal").toLowerCase();
    const seed = input.seed == null || input.seed === "" ? 1 : input.seed;
    const random = createRng(seed);
    const genre = GENRES[genreId];
    if (!genre) throw new Error(`Unsupported genre: ${genreId}`);
    const [archetypeId, archetype] = resolveArchetype(
      genreId,
      input.archetype || input.presetId,
      random,
    );
    const preferred = archetype.preferred || archetype.range;
    const preferredBpm = choose(random, preferred);
    const bpm = clamp(
      preferredBpm + choose(random, [-2, 0, 0, 2]),
      archetype.range[0],
      archetype.range[1],
    );
    const form = choose(random, genre.forms);
    const identity = {
      version: VERSION,
      seed: String(seed),
      genre: genreId,
      archetype: archetypeId,
      key: input.key || choose(random, genre.keys),
      scale: archetype.scale || genre.scale,
      modalColor:
        archetype.modalColor ||
        ((archetype.scale || genre.scale) === "minor"
          ? "natural_minor"
          : "major"),
      bpm,
      bpmRange: archetype.range.slice(),
      timeSignature: archetype.timeSig || 4,
      primaryProgression: archetype.progression.slice(),
      contrastProgression: archetype.contrast.slice(),
      motif: archetype.motif.slice(),
      rhythmicCell: archetype.rhythm.slice(),
      instrumentation: {
        required: genre.required.slice(),
        lead: archetype.lead,
        forbiddenLeads: genre.forbiddenLeads.slice(),
        guitar: archetype.guitar || null,
      },
      form: form.map((section) => section.role),
      energyCurve: form.map((section) => section.energy),
      mode: input.mode === "game-loop" ? "game-loop" : "song",
    };
    const sections = form
      .slice(0, SECTION_IDS.length)
      .map((formSection, index) => {
        const motif = selectMotifCandidate(identity, formSection, random);
        return {
          id: SECTION_IDS[index],
          role: formSection.role,
          bars: Math.min(4, formSection.bars),
          energy: formSection.energy,
          progressionRole:
            formSection.role === "chorus" || formSection.role === "bridge"
              ? "contrast"
              : "primary",
          progression: progressionForRole(identity, formSection.role, index),
          motifTransform: motif.transform,
          motif: motif.notes,
          rhythmicCell: identity.rhythmicCell.slice(),
          lead: formSection.lead,
          leadInstrument: archetype.lead,
          guitarPattern: archetype.guitar || null,
          variation: !!formSection.variation,
          fill:
            index > 0 &&
            (formSection.role === "chorus" ||
              formSection.role === "bridge" ||
              formSection.role === "solo"),
          density: {
            drums: clamp(Math.round(formSection.energy * 4), 0, 4),
            bass: clamp(Math.round(formSection.energy * 4), 1, 4),
            harmony:
              formSection.role === "breakdown"
                ? 1
                : clamp(Math.round(formSection.energy * 3), 1, 3),
            guitar: archetype.guitar
              ? formSection.role === "bridge"
                ? 1
                : clamp(Math.round(formSection.energy * 4), 1, 4)
              : 0,
            melody:
              formSection.lead === "none"
                ? 0
                : clamp(Math.round(formSection.energy * 3), 1, 3),
            fills:
              formSection.role === "outro"
                ? 1
                : formSection.role === "chorus"
                  ? 2
                  : 0,
          },
        };
      });
    return {
      version: VERSION,
      identity,
      sections,
      sequence: makeSequence(sections, identity.mode === "game-loop"),
    };
  }

  function validatePlan(plan) {
    const errors = [];
    if (
      !plan ||
      !plan.identity ||
      !Array.isArray(plan.sections) ||
      plan.sections.length < 2
    )
      errors.push("plan requires multiple sections");
    const ids = new Set(
      ((plan && plan.sections) || []).map((section) => section.id),
    );
    ((plan && plan.sequence) || []).forEach((id) => {
      if (!ids.has(id))
        errors.push(`sequence references missing section ${id}`);
    });
    ((plan && plan.sections) || []).forEach((section) => {
      if (!SECTION_IDS.includes(section.id))
        errors.push(`invalid section id ${section.id}`);
      if (
        !Number.isInteger(section.bars) ||
        section.bars < 1 ||
        section.bars > 16
      )
        errors.push(`invalid bars for ${section.id}`);
      if (!Array.isArray(section.progression) || !section.progression.length)
        errors.push(`missing progression for ${section.id}`);
      if (
        section.lead === "none" &&
        section.density &&
        section.density.melody !== 0
      )
        errors.push(`lead policy mismatch for ${section.id}`);
    });
    const range = plan && plan.identity && plan.identity.bpmRange;
    if (range && (plan.identity.bpm < range[0] || plan.identity.bpm > range[1]))
      errors.push("bpm outside archetype range");
    return errors;
  }

  function createSeed() {
    if (global.crypto && typeof global.crypto.getRandomValues === "function") {
      const values = new Uint32Array(1);
      global.crypto.getRandomValues(values);
      return values[0];
    }
    return Date.now();
  }

  global.PocketChordsmithGenreComposer = Object.freeze({
    VERSION,
    GENRES,
    SECTION_IDS,
    createSeed,
    createRng,
    composeSong,
    validatePlan,
    scorePhrase,
  });
})(globalThis);
