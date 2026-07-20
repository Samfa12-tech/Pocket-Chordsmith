# PCS Format

First shared Pocket Chordsmith / Pocket Audio format contract slice.

This package owns the stable `PCS1:` envelope for schema 16 and schema 17.
Schema 16 remains readable through the existing compact-field helpers. Schema
17 adds profile intent, feature declarations, sparse expressive events,
expanded drum lanes, capability negotiation, deterministic migration, and a
schema-16 projection with a structured loss report. Unknown root, profile,
section, track, and event fields are retained verbatim by the format helpers.

Use `validatePcsProject`, `migratePcsProject`/`projectToSchema17`,
`projectToSchema16`, `encodePcsProject`, and `negotiatePcsCapabilities` for new
interchange work. `validateSchema16Project`, `schema16SongSequence`, and
`schema16SectionSummary` remain stable for existing consumers. The format owns
musical intent, never renderer implementation: parameters identify performer
intent, while actual synthesis, samples, and other renderer details live in
sound recipes outside this package.

Schema 17 accepts the stable common articulation vocabulary (including Funk,
Western, Metal, and drum techniques) and canonical drum lanes such as
`hat_closed`, `hat_open`, `china`, and `percussion`; legacy `hat`, `open_hat`,
and `perc` remain readable aliases. Event `technique` accepts either the older
`namespace:name` string or an opaque namespaced object such as
`{ "funk": { "hand": "thumb" } }`. Those objects, including nested unknown
fields, are preserved and their top-level namespaces participate in capability
negotiation. A schema-17-to-16 projection is always marked lossy when rich
intent is present and keeps a `compatibility.richSource` snapshot alongside its
structured loss report.

## Format evolution direction

Schema 16 is a compatibility baseline, not the expressive ceiling for Pocket
Audio. Schema 17 now carries the versioned rich-event model and feature
declarations so styles such as chiptune, western, funk, and metal can preserve
performance intent instead of being flattened into compact grid fields.

The intended policy is:

- keep `PCS1:` readable for the existing family envelope;
- use sparse events, articulations, expression, namespaced techniques, and
  capability metadata in schema 17;
- preserve unknown fields at the PCS boundary;
- retain schema-16 compact fields as a lossless projection only when the source
  uses the legacy-safe subset;
- make any lossy projection explicit through compatibility warnings or a loss
  report;
- keep format parsing/migration/projection rules here, while Pocket Audio Core
  remains the runtime/rendering owner and apps keep their platform boundaries.

The Funk design and rich-event shape are documented in
`docs/FUNK_SOUND_PACK_SPEC.md`; this package implements the shared format
boundary, not any renderer or app UI.

The exported `PCS_FORMAT_SCOPE` and `PCS_FIXTURE_ROLES` constants are metadata
guardrails for this package. `fixtures/index.json` records both schema-16 and
schema-17 fixtures without making this package the canonical owner of app
runtime behavior.

## Future Compression Direction

Long-term planning should include a smart share-code/JSON compression format for
shorter Pocket Audio transfer codes, URLs, QR payloads, and mobile handoffs.
This should be treated as a family-level format project, not a quick encoder
swap: it would affect Pocket Chordsmith, Pocket DJ, Pocket DAW, the Godot addon,
Pocket Audio Core, hosted handoff pages, fixtures, migrations, and every import
fallback that currently accepts `PCS1:` or raw JSON. Any future compressed format
must keep old `PCS1:` codes readable, define clear version/prefix behavior, and
ship only after compatibility tests prove round-trips across the app family.

License/status: WIP private package, `UNLICENSED`, and `private: true`.
See the repository root `LICENSES.md` before reusing or redistributing package
code.

Do not move app-specific editor, DJ, DAW, or Godot runtime behavior here until the shared boundary is proven.
