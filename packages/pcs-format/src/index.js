export const PCS_PREFIX = "PCS1:";
export const PCS_SCHEMA_VERSION = 16;

export const REQUIRED_SECTION_FIELDS = [
  "progression",
  "grid",
  "melodyTracks",
  "melodyInstruments",
  "melodyHold",
  "bassNotes"
];

export const REQUIRED_SECTION_SUFFIXES = ["A", "B", "C", "D", "E", "F", "G", "H"];

export function parsePcsProject(input) {
  try {
    const text = String(input || "").trim();
    if (!text) return { ok: false, error: { code: "empty-input", message: "PCS input is empty." } };
    const jsonText = text.startsWith(PCS_PREFIX) ? decodePcs1Payload(text.slice(PCS_PREFIX.length)) : text;
    const project = JSON.parse(jsonText);
    const validation = validateSchema16Project(project);
    if (!validation.ok) return { ok: false, error: { code: "invalid-schema-16", message: validation.errors[0], errors: validation.errors } };
    return { ok: true, project, warnings: validation.warnings };
  } catch (error) {
    return { ok: false, error: { code: "parse-failed", message: error instanceof Error ? error.message : String(error) } };
  }
}

export function validateSchema16Project(project) {
  const errors = [];
  const warnings = [];
  if (!project || typeof project !== "object" || Array.isArray(project)) {
    return { ok: false, errors: ["PCS project must be a JSON object."], warnings };
  }
  if (project.schemaVersion !== PCS_SCHEMA_VERSION) errors.push(`schemaVersion must be ${PCS_SCHEMA_VERSION}.`);
  if (!Number.isFinite(Number(project.bpm))) errors.push("bpm must be numeric.");
  if (typeof project.songSequence !== "string" && !Array.isArray(project.songSequence)) errors.push("songSequence must be a string or array.");
  if (!project.sectionBars || typeof project.sectionBars !== "object" || Array.isArray(project.sectionBars)) errors.push("sectionBars must be an object.");
  for (const suffix of REQUIRED_SECTION_SUFFIXES) {
    for (const field of REQUIRED_SECTION_FIELDS) {
      const key = `${field}${suffix}`;
      if (!(key in project)) errors.push(`Missing schema-16 field ${key}.`);
    }
    if (project.sectionBars && typeof project.sectionBars === "object" && !(suffix in project.sectionBars)) warnings.push(`sectionBars is missing ${suffix}.`);
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function schema16SongSequence(project) {
  const raw = project?.songSequence;
  const sections = Array.isArray(raw)
    ? raw
    : String(raw || "")
      .split(/[\s,>+-]+/)
      .filter(Boolean);
  return sections
    .map((section) => String(section).trim().toUpperCase())
    .filter((section) => REQUIRED_SECTION_SUFFIXES.includes(section));
}

export function schema16SectionSummary(project, sectionId = "A") {
  const suffix = String(sectionId || "A").trim().toUpperCase();
  if (!REQUIRED_SECTION_SUFFIXES.includes(suffix)) {
    return { ok: false, error: { code: "invalid-section", message: `Unknown section ${sectionId}.` } };
  }
  const validation = validateSchema16Project(project);
  if (!validation.ok) {
    return { ok: false, error: { code: "invalid-schema-16", message: validation.errors[0], errors: validation.errors } };
  }
  return {
    ok: true,
    section: suffix,
    bars: Number(project.sectionBars?.[suffix] || 0),
    progression: project[`progression${suffix}`],
    drumGrid: project[`grid${suffix}`],
    melodyTracks: project[`melodyTracks${suffix}`],
    melodyInstruments: project[`melodyInstruments${suffix}`],
    melodyHold: project[`melodyHold${suffix}`],
    bassNotes: project[`bassNotes${suffix}`]
  };
}

function decodePcs1Payload(payload) {
  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}
