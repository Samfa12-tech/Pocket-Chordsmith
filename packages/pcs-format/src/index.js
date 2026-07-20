/**
 * PCS1 interchange format helpers. This package owns format intent only;
 * sound recipes and renderer-specific parameters belong to renderers.
 */
export const PCS_PREFIX = "PCS1:";
export const PCS_LEGACY_SCHEMA_VERSION = 16;
export const PCS_SCHEMA_VERSION = 17;
export const PCS_SUPPORTED_SCHEMA_VERSIONS = Object.freeze([
  PCS_LEGACY_SCHEMA_VERSION,
  PCS_SCHEMA_VERSION,
]);
export const PCS_FORMAT_STATUS = "0.2.0-schema17";

export const PCS_PROFILE_IDS = Object.freeze([
  "standard",
  "lofi_chill",
  "chip_arcade",
  "western_frontier",
  "heavy_metal",
  "funk_groove",
]);
export const PCS_SOUND_PROFILE_IDS = PCS_PROFILE_IDS;

export const PCS_SOUND_PROFILES = Object.freeze({
  standard: Object.freeze({ id: "standard", recipeVersion: 1 }),
  lofi_chill: Object.freeze({ id: "lofi_chill", recipeVersion: 1 }),
  chip_arcade: Object.freeze({ id: "chip_arcade", recipeVersion: 1 }),
  western_frontier: Object.freeze({ id: "western_frontier", recipeVersion: 1 }),
  heavy_metal: Object.freeze({ id: "heavy_metal", recipeVersion: 1 }),
  funk_groove: Object.freeze({ id: "funk_groove", recipeVersion: 1 }),
});

export const PCS_ARTICULATIONS = Object.freeze([
  "finger", "slap", "pop", "mute", "ghost", "hammer", "pull", "slide",
  "hold", "staccato", "legato", "bend", "vibrato", "tremolo", "open",
  "chug", "scratch", "palm_mute", "accent", "flam", "drag", "roll",
  "choke", "note", "strum_up", "strum_down",
]);

export const PCS_DRUM_LANES = Object.freeze([
  "kick", "snare", "rim", "clap", "hat_closed", "hat_open", "ride",
  "crash", "china", "tom_high", "tom_mid", "tom_low", "percussion",
  "hat", "open_hat", "perc", "cowbell",
]);

export const PCS_FORMAT_FEATURES = Object.freeze([
  "sound-profile-v1", "rich-events-v1", "articulations-v1", "expanded-drums-v1",
  "capability-report-v1", "rich-events", "sound-profile", "style-profile",
  "articulations", "expression", "namespaced-technique", "expanded-drum-lanes",
]);

export const PCS_CAPABILITY_DEFINITIONS = Object.freeze({
  formatFeatures: PCS_FORMAT_FEATURES,
  soundProfiles: PCS_SOUND_PROFILE_IDS,
  articulations: PCS_ARTICULATIONS,
  drumLanes: PCS_DRUM_LANES,
  techniqueNamespace: "<profile-or-vendor>:<technique>",
  technique: "namespace:name string or record<namespace, JSON-value>",
});

export const PCS_RICH_EVENT_FIELDS = Object.freeze({
  requiredOneOf: Object.freeze(["tick", "step"]),
  timing: Object.freeze(["tick", "step", "duration"]),
  pitch: Object.freeze(["note", "notes"]),
  expressive: Object.freeze([
    "velocity", "articulation", "sound", "role", "expression", "technique",
  ]),
  unknownFields: "preserved",
});

export const PCS_SCHEMA17_TYPES = Object.freeze({
  soundProfile: Object.freeze({
    required: Object.freeze(["id", "preset", "parameters", "recipeVersion"]),
    id: PCS_PROFILE_IDS,
    parameters: "plain-object musical intent only",
  }),
  event: PCS_RICH_EVENT_FIELDS,
  section: Object.freeze({ tracks: "record<role, {events: RichEvent[]}>" }),
});

export const PCS_FORMAT_SCOPE = Object.freeze({
  owns: Object.freeze([
    "PCS1 prefix metadata", "schema-16 and schema-17 compatibility metadata",
    "parse/validate result shape", "rich event normalization", "sound profile intent",
    "capability negotiation", "legacy projection loss reports",
  ]),
  doesNotOwn: Object.freeze([
    "Pocket Chordsmith editor UI defaults", "full app runtime normalization",
    "Pocket DJ performance session state", "Pocket DAW .pocketdaw schema",
    "Godot chart resources", "audio rendering, scheduling, or sound recipes",
  ]),
});

export const PCS_FIXTURE_ROLES = Object.freeze({
  "schema16-valid.json": "minimal-valid-schema16-preserves-unknown-fields",
  "schema16-invalid.json": "invalid-schema16-error-contract",
  "schema16-trace-smoke.json": "playable-sequence-and-section-summary-smoke",
  "schema17-funk-rich-events.json": "schema17-rich-events-profiles-and-capabilities",
  "schema17-invalid.json": "invalid-schema17-rich-event-contract",
});

export const REQUIRED_SECTION_FIELDS = [
  "progression", "grid", "melodyTracks", "melodyInstruments", "bassNotes",
];
export const OPTIONAL_SECTION_SUMMARY_FIELDS = ["melodyHold"];
export const REQUIRED_SECTION_SUFFIXES = ["A", "B", "C", "D", "E", "F", "G", "H"];

/** Parse raw JSON or a PCS1 payload without dropping unfamiliar fields. */
export function parsePcsProject(input) {
  try {
    const text = String(input || "").trim();
    if (!text) return parseError("empty-input", "PCS input is empty.");
    const jsonText = text.startsWith(PCS_PREFIX)
      ? decodePcs1Payload(text.slice(PCS_PREFIX.length))
      : text;
    const project = JSON.parse(jsonText);
    const validation = validatePcsProject(project);
    if (!validation.ok) {
      const version = schemaProjectVersion(project);
      return parseError(
        version === PCS_LEGACY_SCHEMA_VERSION ? "invalid-schema-16" : version === PCS_SCHEMA_VERSION ? "invalid-schema-17" : "unsupported-schema",
        validation.errors[0], validation.errors,
      );
    }
    return { ok: true, project, schemaVersion: validation.schemaVersion, warnings: validation.warnings };
  } catch (error) {
    return parseError("parse-failed", error instanceof Error ? error.message : String(error));
  }
}

/** Encode a project as the existing PCS1 base64url envelope (or raw JSON). */
export function encodePcsProject(project, options = {}) {
  const validation = options.validate === false ? { ok: true } : validatePcsProject(project);
  if (!validation.ok) {
    const error = new Error(validation.errors[0] || "Invalid PCS project.");
    error.code = "invalid-pcs-project";
    error.errors = validation.errors;
    throw error;
  }
  const json = JSON.stringify(project);
  return options.prefix === false ? json : `${PCS_PREFIX}${Buffer.from(json, "utf8").toString("base64url")}`;
}

export function validatePcsProject(project) {
  const version = schemaProjectVersion(project);
  if (version === PCS_LEGACY_SCHEMA_VERSION) return withSchema(validateSchema16Project(project), version);
  if (version === PCS_SCHEMA_VERSION) return withSchema(validateSchema17Project(project), version);
  return { ok: false, schemaVersion: version, errors: ["projectVersion must be 16 or 17."], warnings: [] };
}

/** Existing schema-16 validator retained for current consumers. */
export function validateSchema16Project(project) {
  const errors = [];
  const warnings = [];
  if (!isPlainObject(project)) return { ok: false, errors: ["PCS project must be a JSON object."], warnings };
  if (schemaProjectVersion(project) !== PCS_LEGACY_SCHEMA_VERSION) errors.push("projectVersion must be 16.");
  validateProjectBase(project, errors);
  const hasSectionsObject = isPlainObject(project.sections);
  if (!isPlainObject(project.sectionBars) && !hasSectionsObject) errors.push("sectionBars or sections must be an object.");
  const sectionIds = schema16ProjectSectionIds(project);
  if (!sectionIds.length) errors.push("At least one schema-16 section is required.");
  for (const suffix of sectionIds) {
    for (const field of REQUIRED_SECTION_FIELDS) {
      if (!hasSchema16SectionField(project, suffix, field)) errors.push(`Missing schema-16 field ${field}${suffix}.`);
    }
    if (isPlainObject(project.sectionBars) && !(suffix in project.sectionBars)) warnings.push(`sectionBars is missing ${suffix}.`);
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function validateSchema17Project(project) {
  const errors = [];
  const warnings = [];
  if (!isPlainObject(project)) return { ok: false, errors: ["PCS project must be a JSON object."], warnings };
  if (schemaProjectVersion(project) !== PCS_SCHEMA_VERSION) errors.push("projectVersion must be 17.");
  validateProjectBase(project, errors);
  if (!Array.isArray(project.formatFeatures)) errors.push("formatFeatures must be an array.");
  else for (const feature of project.formatFeatures) {
    if (typeof feature !== "string" || !feature) errors.push("formatFeatures entries must be non-empty strings.");
    else if (!PCS_FORMAT_FEATURES.includes(feature)) warnings.push(`Unknown format feature ${feature} is preserved.`);
  }
  validateSoundProfile(project.soundProfile, errors, warnings);
  if (!isPlainObject(project.sections)) errors.push("sections must be an object.");
  else {
    const ids = schema17ProjectSectionIds(project);
    if (!ids.length) errors.push("At least one schema-17 section is required.");
    for (const id of ids) validateSchema17Section(project.sections[id], `sections.${id}`, errors, warnings);
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function normalizeRichEvent(input, options = {}) {
  const errors = [];
  const warnings = [];
  if (!isPlainObject(input)) return { ok: false, errors: ["Rich event must be an object."], warnings };
  const event = { ...input };
  const hasTick = event.tick !== undefined;
  const hasStep = event.step !== undefined;
  if (!hasTick && !hasStep) errors.push("Rich event requires tick or step.");
  for (const field of ["tick", "step"]) {
    if (event[field] !== undefined && (!Number.isFinite(Number(event[field])) || Number(event[field]) < 0)) errors.push(`${field} must be a non-negative number.`);
    else if (event[field] !== undefined) event[field] = Number(event[field]);
  }
  if (event.duration === undefined) {
    event.duration = 1;
    warnings.push("Rich event duration defaulted to 1.");
  } else if (!Number.isFinite(Number(event.duration)) || Number(event.duration) <= 0) errors.push("duration must be a positive number.");
  else event.duration = Number(event.duration);
  if (event.note !== undefined && event.notes !== undefined) errors.push("Rich event may use note or notes, not both.");
  if (event.note !== undefined && !isMidiNote(event.note)) errors.push("note must be a MIDI note number.");
  if (event.notes !== undefined && (!Array.isArray(event.notes) || !event.notes.length || event.notes.some((note) => !isMidiNote(note)))) errors.push("notes must be a non-empty MIDI note array.");
  if (event.note === undefined && event.notes === undefined && typeof event.sound !== "string") errors.push("Rich event requires note, notes, or sound.");
  if (event.velocity === undefined) event.velocity = 100;
  else if (!Number.isFinite(Number(event.velocity)) || Number(event.velocity) < 0 || Number(event.velocity) > 127) errors.push("velocity must be between 0 and 127.");
  else event.velocity = Number(event.velocity);
  if (event.articulation === undefined) event.articulation = "note";
  else if (typeof event.articulation !== "string" || !event.articulation) errors.push("articulation must be a non-empty string.");
  else if (!PCS_ARTICULATIONS.includes(event.articulation)) warnings.push(`Unknown articulation ${event.articulation} is preserved.`);
  for (const field of ["sound", "role"]) if (event[field] !== undefined && (typeof event[field] !== "string" || !event[field])) errors.push(`${field} must be a non-empty string.`);
  if (event.expression !== undefined && !isPlainObject(event.expression)) errors.push("expression must be an object.");
  if (event.technique !== undefined && !isValidTechnique(event.technique)) errors.push("technique must be namespace:name or a namespaced object.");
  if (options.role && event.role === undefined) event.role = options.role;
  return { ok: errors.length === 0, event, errors, warnings };
}

/** Deterministically lifts compact schema-16 fields into schema 17 sections/tracks. */
export function migrateSchema16To17(project) {
  const validation = validateSchema16Project(project);
  if (!validation.ok) return { ok: false, error: { code: "invalid-schema-16", message: validation.errors[0], errors: validation.errors } };
  const migrated = deepClone(project);
  const sectionIds = schema16ProjectSectionIds(project);
  const sections = isPlainObject(migrated.sections) ? migrated.sections : {};
  for (const id of sectionIds) {
    const source = isPlainObject(sections[id]) ? sections[id] : {};
    const grid = sectionField(project, id, "grid") || {};
    const melodyTracks = sectionField(project, id, "melodyTracks") || [];
    const instruments = sectionField(project, id, "melodyInstruments") || [];
    const bassNotes = sectionField(project, id, "bassNotes") || [];
    const bassArticulation = sectionField(project, id, "bassArticulation") || [];
    const drumLanes = isPlainObject(source.drumLanes) ? source.drumLanes : compactDrumLanes(grid);
    sections[id] = {
      ...source,
      bars: source.bars ?? project.sectionBars?.[id],
      progression: source.progression ?? sectionField(project, id, "progression"),
      grid: source.grid ?? grid,
      melodyTracks: source.melodyTracks ?? melodyTracks,
      melodyInstruments: source.melodyInstruments ?? instruments,
      bassNotes: source.bassNotes ?? bassNotes,
      drumLanes,
      tracks: isPlainObject(source.tracks) ? source.tracks : compactTracks(melodyTracks, instruments, bassNotes, bassArticulation),
    };
  }
  migrated.sections = sections;
  migrated.projectVersion = PCS_SCHEMA_VERSION;
  delete migrated.schemaVersion;
  migrated.soundProfile = normalizeSoundProfile(project.soundProfile || legacySoundProfile(project));
  migrated.formatFeatures = uniqueStrings([
    ...(Array.isArray(project.formatFeatures) ? project.formatFeatures : []),
    "rich-events-v1", "sound-profile-v1", "articulations-v1", "expanded-drums-v1",
  ]);
  return { ok: true, project: migrated, warnings: validation.warnings, migration: { from: 16, to: 17, deterministic: true } };
}

/** Stable migration entry point: schema 16 is lifted, schema 17 is cloned. */
export function migratePcsProject(project) {
  const version = schemaProjectVersion(project);
  if (version === PCS_LEGACY_SCHEMA_VERSION) return migrateSchema16To17(project);
  if (version === PCS_SCHEMA_VERSION) {
    const validation = validateSchema17Project(project);
    return validation.ok
      ? { ok: true, project: deepClone(project), warnings: validation.warnings, migration: { from: 17, to: 17, deterministic: true } }
      : { ok: false, error: { code: "invalid-schema-17", message: validation.errors[0], errors: validation.errors } };
  }
  return { ok: false, error: { code: "unsupported-schema", message: "projectVersion must be 16 or 17." } };
}

export const projectToSchema17 = migratePcsProject;

/** Project schema-17 musical intent to compact schema-16 fields and list each semantic loss. */
export function projectToSchema16(project) {
  const validation = validatePcsProject(project);
  if (!validation.ok) return { ok: false, error: { code: "invalid-pcs-project", message: validation.errors[0], errors: validation.errors } };
  if (schemaProjectVersion(project) === PCS_LEGACY_SCHEMA_VERSION) {
    return { ok: true, project: deepClone(project), lossReport: emptyLossReport(), warnings: validation.warnings };
  }
  const legacy = deepClone(project);
  const losses = [];
  legacy.projectVersion = PCS_LEGACY_SCHEMA_VERSION;
  delete legacy.schemaVersion;
  legacy.sectionBars = isPlainObject(legacy.sectionBars) ? legacy.sectionBars : {};
  for (const id of schema17ProjectSectionIds(project)) {
    const section = project.sections[id];
    legacy.sectionBars[id] = Number(section.bars || 0);
    legacy[`progression${id}`] = deepClone(section.progression || []);
    legacy[`grid${id}`] = compactGrid(section.drumLanes, losses, `sections.${id}.drumLanes`) || deepClone(section.grid || {});
    const projected = projectSectionTracks(section.tracks, losses, `sections.${id}.tracks`);
    legacy[`melodyTracks${id}`] = projected.melodyTracks;
    legacy[`melodyInstruments${id}`] = projected.melodyInstruments;
    legacy[`bassNotes${id}`] = projected.bassNotes;
    if (projected.bassArticulation.some(Boolean)) legacy[`bassArticulation${id}`] = projected.bassArticulation;
  }
  if (project.soundProfile) {
    legacy.audioProfile = project.soundProfile.id;
    addLoss(losses, "sound-profile", "soundProfile", "Schema 16 only carries the profile id as audioProfile; preset, parameters, and recipeVersion require schema 17.");
  }
  for (const feature of project.formatFeatures || []) if (feature !== "sound-profile") addLoss(losses, "format-feature", "formatFeatures", `Schema 16 does not advertise ${feature}.`);
  const lossReport = makeLossReport(losses, { sourceSchemaVersion: 17, richSourceRetained: true });
  legacy.compatibility = {
    ...(isPlainObject(legacy.compatibility) ? legacy.compatibility : {}),
    sourceSchemaVersion: 17,
    richSource: deepClone(project),
    lossReport,
  };
  const legacyValidation = validateSchema16Project(legacy);
  if (!legacyValidation.ok) {
    return { ok: false, error: { code: "legacy-projection-invalid", message: legacyValidation.errors[0], errors: legacyValidation.errors } };
  }
  return { ok: true, project: legacy, lossReport, warnings: [...validation.warnings, ...legacyValidation.warnings] };
}

export const projectToLegacySchema16 = projectToSchema16;

/** Compare a project's declared/inferred requirements with a target capability set. */
export function negotiatePcsCapabilities(project, target = {}) {
  const validation = validatePcsProject(project);
  if (!validation.ok) return { ok: false, error: { code: "invalid-pcs-project", message: validation.errors[0], errors: validation.errors } };
  const available = normalizeCapabilities(target);
  const required = inferCapabilities(project);
  const unsupported = [];
  for (const feature of required.formatFeatures) if (!available.formatFeatures.has(feature)) unsupported.push(capabilityLoss("formatFeature", feature));
  for (const id of required.soundProfiles) if (!available.soundProfiles.has(id)) unsupported.push(capabilityLoss("soundProfile", id));
  for (const art of required.articulations) if (!available.articulations.has(art)) unsupported.push(capabilityLoss("articulation", art));
  for (const lane of required.drumLanes) if (!available.drumLanes.has(lane)) unsupported.push(capabilityLoss("drumLane", lane));
  for (const technique of required.techniques) if (!available.techniques.has(technique) && !available.techniqueNamespaces.has(technique.split(":")[0])) unsupported.push(capabilityLoss("technique", technique));
  for (const namespace of required.techniqueNamespaces) if (!available.techniqueNamespaces.has(namespace) && !available.techniques.has(namespace) && !available.techniques.has(`${namespace}:*`)) unsupported.push(capabilityLoss("techniqueNamespace", namespace));
  return { ok: unsupported.length === 0, required: serializeCapabilities(required), supported: unsupported.length === 0 ? serializeCapabilities(required) : undefined, unsupported, lossReport: makeLossReport(unsupported) };
}

export function schema16SongSequence(project) {
  const raw = project?.songSequence ?? project?.sectionSequence;
  const sections = Array.isArray(raw) ? raw : String(raw || "").split(/[\s,>+-]+/).filter(Boolean);
  return sections.map(normalizeSectionId).filter(Boolean);
}

export function schema16SectionSummary(project, sectionId = "A") {
  const suffix = normalizeSectionId(sectionId || "A");
  if (!suffix) return { ok: false, error: { code: "invalid-section", message: `Unknown section ${sectionId}.` } };
  const validation = validateSchema16Project(project);
  if (!validation.ok) return { ok: false, error: { code: "invalid-schema-16", message: validation.errors[0], errors: validation.errors } };
  return {
    ok: true, section: suffix,
    bars: Number(sectionField(project, suffix, "bars") ?? project.sectionBars?.[suffix] ?? 0),
    progression: sectionField(project, suffix, "progression"), drumGrid: sectionField(project, suffix, "grid"),
    melodyTracks: sectionField(project, suffix, "melodyTracks"), melodyInstruments: sectionField(project, suffix, "melodyInstruments"),
    melodyHold: sectionField(project, suffix, "melodyHold"), bassNotes: sectionField(project, suffix, "bassNotes"),
  };
}

export function schema16ProjectVersion(project) { return schemaProjectVersion(project); }
export function schema16ProjectSectionIds(project) {
  const ids = new Set(schema16SongSequence(project));
  for (const key of Object.keys(project?.sectionBars || {})) if (normalizeSectionId(key)) ids.add(normalizeSectionId(key));
  for (const key of Object.keys(project?.sections || {})) if (normalizeSectionId(key)) ids.add(normalizeSectionId(key));
  for (const suffix of REQUIRED_SECTION_SUFFIXES) if (REQUIRED_SECTION_FIELDS.some((field) => `${field}${suffix}` in (project || {}))) ids.add(suffix);
  return [...ids];
}

export function schema17ProjectSectionIds(project) {
  return Object.keys(project?.sections || {}).filter((id) => normalizeSectionId(id));
}

function validateProjectBase(project, errors) {
  if (!Number.isFinite(Number(project.bpm))) errors.push("bpm must be numeric.");
  const sequence = project.songSequence ?? project.sectionSequence;
  if (typeof sequence !== "string" && !Array.isArray(sequence)) errors.push("songSequence must be a string or array.");
}

function validateSoundProfile(profile, errors, warnings) {
  if (!isPlainObject(profile)) return errors.push("soundProfile must be an object.");
  for (const field of ["id", "preset", "parameters", "recipeVersion"]) if (!(field in profile)) errors.push(`soundProfile.${field} is required.`);
  if (typeof profile.id !== "string" || !profile.id) errors.push("soundProfile.id must be a non-empty string.");
  else if (!PCS_SOUND_PROFILE_IDS.includes(profile.id)) warnings.push(`Unknown sound profile ${profile.id} is preserved.`);
  if (typeof profile.preset !== "string" || !profile.preset) errors.push("soundProfile.preset must be a non-empty string.");
  if (!isPlainObject(profile.parameters)) errors.push("soundProfile.parameters must be an object.");
  if (!Number.isInteger(Number(profile.recipeVersion)) || Number(profile.recipeVersion) < 1) errors.push("soundProfile.recipeVersion must be a positive integer.");
}

function validateSchema17Section(section, path, errors, warnings) {
  if (!isPlainObject(section)) return errors.push(`${path} must be an object.`);
  if (!Number.isFinite(Number(section.bars)) || Number(section.bars) <= 0) errors.push(`${path}.bars must be positive.`);
  if (section.tracks !== undefined) {
    if (!isPlainObject(section.tracks)) errors.push(`${path}.tracks must be an object.`);
    else for (const [role, track] of Object.entries(section.tracks)) validateTrack(track, `${path}.tracks.${role}`, role, errors, warnings);
  }
  if (section.drumLanes !== undefined) {
    if (!isPlainObject(section.drumLanes)) errors.push(`${path}.drumLanes must be an object.`);
    else for (const [lane, events] of Object.entries(section.drumLanes)) {
      if (!PCS_DRUM_LANES.includes(lane)) warnings.push(`Unknown drum lane ${lane} is preserved.`);
      validateEvents(events, `${path}.drumLanes.${lane}`, "drums", errors, warnings);
    }
  }
}

function validateTrack(track, path, role, errors, warnings) {
  if (!isPlainObject(track) || !Array.isArray(track.events)) return errors.push(`${path}.events must be an array.`);
  validateEvents(track.events, `${path}.events`, role, errors, warnings);
}

function validateEvents(events, path, role, errors, warnings) {
  if (!Array.isArray(events)) return errors.push(`${path} must be an array.`);
  events.forEach((event, index) => {
    const result = normalizeRichEvent(event, { role });
    errors.push(...result.errors.map((message) => `${path}[${index}]: ${message}`));
    warnings.push(...result.warnings.map((message) => `${path}[${index}]: ${message}`));
  });
}

function compactDrumLanes(grid) {
  const lanes = {};
  for (const [lane, steps] of Object.entries(grid || {})) {
    if (!Array.isArray(steps)) continue;
    lanes[lane] = steps.flatMap((value, step) => value ? [{ step, duration: 1, velocity: compactVelocity(value), sound: lane, role: "drums" }] : []);
  }
  return lanes;
}

function compactTracks(melodyTracks, instruments, bassNotes, bassArticulation) {
  const tracks = {};
  melodyTracks.forEach((notes, index) => {
    tracks[`melody_${index + 1}`] = { events: (Array.isArray(notes) ? notes : []).flatMap((note, step) => note === null || note === undefined ? [] : [{ step, duration: 1, note, velocity: 100, articulation: "note", sound: instruments[index], role: "melody" }]) };
  });
  tracks.bass = { events: (Array.isArray(bassNotes) ? bassNotes : []).flatMap((note, step) => note === null || note === undefined ? [] : [{ step, duration: 1, note, velocity: 100, articulation: bassArticulation[step] || "note", role: "bass" }]) };
  return tracks;
}

function compactGrid(drumLanes, losses, path) {
  if (!isPlainObject(drumLanes)) return null;
  const grid = {};
  for (const [lane, events] of Object.entries(drumLanes)) {
    if (!PCS_DRUM_LANES.includes(lane) || !["kick", "snare", "hat", "hat_closed"].includes(lane)) addLoss(losses, "drum-lane", `${path}.${lane}`, `Schema 16 grid has no semantic lane for ${lane}.`);
    if (!Array.isArray(events)) continue;
    for (const event of events) {
      const normalized = normalizeRichEvent(event, { role: "drums" });
      if (!normalized.ok) continue;
      const { step, tick, duration, velocity, articulation, expression, technique } = normalized.event;
      if (!Number.isInteger(step) || tick !== undefined || duration !== 1 || articulation !== "note" || expression || technique) addLoss(losses, "drum-expression", `${path}.${lane}`, "Rich drum timing or expression cannot be represented by schema 16 grid cells.");
      if (Number.isInteger(step) && step >= 0) {
        grid[lane] ||= [];
        grid[lane][step] = velocity > 0 ? 1 : 0;
      }
    }
  }
  return grid;
}

function projectSectionTracks(tracks, losses, path) {
  const melodyTracks = [];
  const melodyInstruments = [];
  let bassNotes = [];
  let bassArticulation = [];
  for (const [name, track] of Object.entries(tracks || {})) {
    if (!Array.isArray(track?.events)) continue;
    const role = track.role || (name === "bass" ? "bass" : name.startsWith("melody") ? "melody" : name);
    const notes = [];
    for (const input of track.events) {
      const result = normalizeRichEvent(input, { role });
      if (!result.ok) continue;
      const event = result.event;
      if (!Number.isInteger(event.step) || event.tick !== undefined || event.duration !== 1 || event.notes || event.expression || event.technique || !["note", "hold", "slide", "slap", "pop", "mute", "hammer", "pull"].includes(event.articulation)) addLoss(losses, "rich-event", `${path}.${name}`, "Schema 16 cannot fully represent this rich event.");
      if (Number.isInteger(event.step) && event.note !== undefined) notes[event.step] = event.note;
    }
    if (role === "bass") {
      bassNotes = notes;
      bassArticulation = track.events.map((event) => event?.articulation || "note");
    } else if (role === "melody" || name.startsWith("melody")) {
      melodyTracks.push(notes);
      melodyInstruments.push(track.sound || track.events.find((event) => event?.sound)?.sound || "lead");
    } else if (track.events.length) addLoss(losses, "track-role", `${path}.${name}`, `Schema 16 has no ${role} rich track.`);
  }
  return { melodyTracks, melodyInstruments, bassNotes, bassArticulation };
}

function inferCapabilities(project) {
  const required = { formatFeatures: new Set(project.formatFeatures || []), soundProfiles: new Set(), articulations: new Set(), drumLanes: new Set(), techniques: new Set(), techniqueNamespaces: new Set() };
  if (project.soundProfile?.id) required.soundProfiles.add(project.soundProfile.id);
  forEachRichEvent(project, (event, lane) => {
    if (event.articulation) required.articulations.add(event.articulation);
    collectTechniqueCapabilities(event.technique, required);
    if (lane) required.drumLanes.add(lane);
  });
  return required;
}

function forEachRichEvent(project, callback) {
  for (const section of Object.values(project.sections || {})) {
    for (const track of Object.values(section?.tracks || {})) for (const event of track?.events || []) callback(event);
    for (const [lane, events] of Object.entries(section?.drumLanes || {})) for (const event of events || []) callback(event, lane);
  }
}

function normalizeCapabilities(target) {
  const features = target.formatFeatures ?? target.features ?? PCS_FORMAT_FEATURES;
  return {
    formatFeatures: new Set(features), soundProfiles: new Set(target.soundProfiles ?? PCS_SOUND_PROFILE_IDS),
    articulations: new Set(target.articulations ?? PCS_ARTICULATIONS), drumLanes: new Set(target.drumLanes ?? PCS_DRUM_LANES),
    techniques: new Set(target.techniques ?? []), techniqueNamespaces: new Set(target.techniqueNamespaces ?? []),
  };
}

function serializeCapabilities(value) { return Object.fromEntries(Object.entries(value).map(([key, entries]) => [key, [...entries].sort()])); }
function capabilityLoss(kind, value) { return { code: "unsupported-capability", kind, value, feature: `${kind}:${value}`, action: "fallback", message: `Target does not support ${kind} ${value}.` }; }
function emptyLossReport() { return { schemaVersion: 16, lossy: false, richSourceRetained: false, losses: [] }; }
function makeLossReport(losses, details = {}) { return { schemaVersion: 16, lossy: losses.length > 0, ...details, losses }; }
function addLoss(losses, code, path, message) { if (!losses.some((loss) => loss.code === code && loss.path === path && loss.message === message)) losses.push({ code, path, feature: code, action: "dropped", message }); }
function parseError(code, message, errors) { return { ok: false, error: { code, message, ...(errors ? { errors } : {}) } }; }
function withSchema(result, schemaVersion) { return { ...result, schemaVersion }; }
function schemaProjectVersion(project) { return Number(project?.projectVersion ?? project?.schemaVersion); }
function hasSchema16SectionField(project, suffix, field) { return sectionField(project, suffix, field) !== undefined; }
function sectionField(project, suffix, field) { const section = project?.sections?.[suffix] ?? project?.sections?.[suffix.toLowerCase()]; return isPlainObject(section) && field in section ? section[field] : project?.[`${field}${suffix}`]; }
function normalizeSectionId(section) { const normalized = String(section || "").trim().toUpperCase(); return REQUIRED_SECTION_SUFFIXES.includes(normalized) ? normalized : ""; }
function normalizeSoundProfile(profile) { return { id: profile.id, preset: profile.preset || `${profile.id}_default`, parameters: isPlainObject(profile.parameters) ? deepClone(profile.parameters) : {}, recipeVersion: Number(profile.recipeVersion) || 1, ...Object.fromEntries(Object.entries(profile).filter(([key]) => !["id", "preset", "parameters", "recipeVersion"].includes(key))) }; }
function legacySoundProfile(project) { const aliases = { chip_tune: "chip_arcade", western: "western_frontier" }; const id = aliases[project.audioProfile] || project.audioProfile || "standard"; return { id, preset: project.preset || project[`${id}Preset`] || `${id}_default`, parameters: {}, recipeVersion: 1 }; }
function compactVelocity(value) { return typeof value === "number" && value > 1 ? Math.min(127, value) : 100; }
function uniqueStrings(values) { return [...new Set(values.filter((value) => typeof value === "string" && value))]; }
function isMidiNote(value) { return Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 127; }
function isValidTechnique(value) {
  if (typeof value === "string") return /^[a-z][a-z0-9_-]*:[a-z][a-z0-9_.-]*$/i.test(value);
  return isPlainObject(value) && Object.keys(value).length > 0 && Object.keys(value).every((namespace) => /^[a-z][a-z0-9_-]*$/i.test(namespace));
}
function collectTechniqueCapabilities(technique, required) {
  if (typeof technique === "string") required.techniques.add(technique);
  else if (isPlainObject(technique)) for (const namespace of Object.keys(technique)) required.techniqueNamespaces.add(namespace);
}
function isPlainObject(value) { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
function deepClone(value) { return JSON.parse(JSON.stringify(value)); }
function decodePcs1Payload(payload) { const normalized = payload.replace(/-/g, "+").replace(/_/g, "/"); const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="); return Buffer.from(padded, "base64").toString("utf8"); }
