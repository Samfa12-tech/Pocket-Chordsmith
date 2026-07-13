export const PCS_PREFIX = "PCS1:";
export const PCS_SCHEMA_VERSION = 16;
export const PCS_FORMAT_STATUS = "0.1.0-scaffold";

export const PCS_FORMAT_SCOPE = Object.freeze({
  owns: Object.freeze([
    "PCS1 prefix metadata",
    "schema-16 projectVersion metadata",
    "schemaVersion compatibility alias metadata",
    "parse/validate result shape",
    "required schema-16 section field names",
    "compatibility fixture metadata",
  ]),
  doesNotOwn: Object.freeze([
    "Pocket Chordsmith editor UI defaults",
    "full app runtime normalization",
    "Pocket DJ performance session state",
    "Pocket DAW .pocketdaw schema",
    "Godot chart resources",
    "audio rendering or scheduling behavior",
  ]),
});

export const PCS_FIXTURE_ROLES = Object.freeze({
  "schema16-valid.json": "minimal-valid-schema16-preserves-unknown-fields",
  "schema16-invalid.json": "invalid-schema16-error-contract",
  "schema16-trace-smoke.json": "playable-sequence-and-section-summary-smoke",
});

export const REQUIRED_SECTION_FIELDS = [
  "progression",
  "grid",
  "melodyTracks",
  "melodyInstruments",
  "bassNotes",
];

export const OPTIONAL_SECTION_SUMMARY_FIELDS = ["melodyHold"];

export const REQUIRED_SECTION_SUFFIXES = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
];

export function parsePcsProject(input) {
  try {
    const text = String(input || "").trim();
    if (!text)
      return {
        ok: false,
        error: { code: "empty-input", message: "PCS input is empty." },
      };
    const jsonText = text.startsWith(PCS_PREFIX)
      ? decodePcs1Payload(text.slice(PCS_PREFIX.length))
      : text;
    const project = JSON.parse(jsonText);
    const validation = validateSchema16Project(project);
    if (!validation.ok)
      return {
        ok: false,
        error: {
          code: "invalid-schema-16",
          message: validation.errors[0],
          errors: validation.errors,
        },
      };
    return { ok: true, project, warnings: validation.warnings };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "parse-failed",
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export function validateSchema16Project(project) {
  const errors = [];
  const warnings = [];
  if (!project || typeof project !== "object" || Array.isArray(project)) {
    return {
      ok: false,
      errors: ["PCS project must be a JSON object."],
      warnings,
    };
  }
  const version = schema16ProjectVersion(project);
  if (version !== PCS_SCHEMA_VERSION)
    errors.push(`projectVersion must be ${PCS_SCHEMA_VERSION}.`);
  if (!Number.isFinite(Number(project.bpm)))
    errors.push("bpm must be numeric.");
  if (
    typeof (project.songSequence ?? project.sectionSequence) !== "string" &&
    !Array.isArray(project.songSequence ?? project.sectionSequence)
  )
    errors.push("songSequence must be a string or array.");
  const hasSectionsObject = isPlainObject(project.sections);
  if (!isPlainObject(project.sectionBars) && !hasSectionsObject)
    errors.push("sectionBars or sections must be an object.");
  const sectionIds = schema16ProjectSectionIds(project);
  if (!sectionIds.length)
    errors.push("At least one schema-16 section is required.");
  for (const suffix of sectionIds) {
    for (const field of REQUIRED_SECTION_FIELDS) {
      if (!hasSchema16SectionField(project, suffix, field))
        errors.push(`Missing schema-16 field ${field}${suffix}.`);
    }
    if (
      isPlainObject(project.sectionBars) &&
      !(suffix in project.sectionBars)
    )
      warnings.push(`sectionBars is missing ${suffix}.`);
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function schema16SongSequence(project) {
  const raw = project?.songSequence ?? project?.sectionSequence;
  const sections = Array.isArray(raw)
    ? raw
    : String(raw || "")
        .split(/[\s,>+-]+/)
        .filter(Boolean);
  return sections.map(normalizeSectionId).filter(Boolean);
}

export function schema16SectionSummary(project, sectionId = "A") {
  const suffix = normalizeSectionId(sectionId || "A");
  if (!suffix) {
    return {
      ok: false,
      error: {
        code: "invalid-section",
        message: `Unknown section ${sectionId}.`,
      },
    };
  }
  const validation = validateSchema16Project(project);
  if (!validation.ok) {
    return {
      ok: false,
      error: {
        code: "invalid-schema-16",
        message: validation.errors[0],
        errors: validation.errors,
      },
    };
  }
  return {
    ok: true,
    section: suffix,
    bars: Number(
      sectionField(project, suffix, "bars") ?? project.sectionBars?.[suffix] ?? 0,
    ),
    progression: sectionField(project, suffix, "progression"),
    drumGrid: sectionField(project, suffix, "grid"),
    melodyTracks: sectionField(project, suffix, "melodyTracks"),
    melodyInstruments: sectionField(project, suffix, "melodyInstruments"),
    melodyHold: sectionField(project, suffix, "melodyHold"),
    bassNotes: sectionField(project, suffix, "bassNotes"),
  };
}

export function schema16ProjectVersion(project) {
  return Number(project?.projectVersion ?? project?.schemaVersion);
}

export function schema16ProjectSectionIds(project) {
  const ids = new Set();
  for (const section of schema16SongSequence(project)) ids.add(section);
  if (isPlainObject(project?.sectionBars)) {
    for (const section of Object.keys(project.sectionBars)) {
      const normalized = normalizeSectionId(section);
      if (normalized) ids.add(normalized);
    }
  }
  if (isPlainObject(project?.sections)) {
    for (const section of Object.keys(project.sections)) {
      const normalized = normalizeSectionId(section);
      if (normalized) ids.add(normalized);
    }
  }
  for (const suffix of REQUIRED_SECTION_SUFFIXES) {
    if (
      REQUIRED_SECTION_FIELDS.some(
        (field) => `${field}${suffix}` in (project || {}),
      )
    )
      ids.add(suffix);
  }
  return [...ids];
}

function hasSchema16SectionField(project, suffix, field) {
  return sectionField(project, suffix, field) !== undefined;
}

function sectionField(project, suffix, field) {
  const section = project?.sections?.[suffix] ?? project?.sections?.[suffix.toLowerCase()];
  if (isPlainObject(section) && field in section) return section[field];
  return project?.[`${field}${suffix}`];
}

function normalizeSectionId(section) {
  const normalized = String(section || "")
    .trim()
    .toUpperCase();
  return REQUIRED_SECTION_SUFFIXES.includes(normalized) ? normalized : "";
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function decodePcs1Payload(payload) {
  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}
