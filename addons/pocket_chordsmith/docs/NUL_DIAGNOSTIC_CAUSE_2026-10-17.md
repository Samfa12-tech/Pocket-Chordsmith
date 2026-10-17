# Unexpected-NUL diagnostic cause and correction

Frozen PR143 head `2fb2f49df3659402d9290b6c6ed98dd2498ee700` and its successful
hosted Godot job are not diagnostic-free. The review counted206 Unexpected-NUL
messages in job117279523937, run38993078036. That hosted job checks the PR merge
ref `a8ebba0dc53ca6f3e662de342c254f76738aa802`, not a direct checkout of the source head;
the artifact must retain its exact merge-ref provenance.

The messages are emitted during ordinary successful pack-path checks, not only
expected negative fixtures or corrupt WAV/package decoding. Both
`pcs_chart_build_tools.gd` and `pcs_game_pack_manifest.gd` called
`path.find(String.chr(0))`. An isolated official Godot4.6.3 process with no addon
loaded executes one `String.chr(0)`, emits exactly one Unexpected-NUL diagnostic,
and returns a one-character String whose codepoint is65533 (U+FFFD). Thus each
ordinary path reaching that expression creates a diagnostic; the guard actually
searches for the replacement character.

The follow-up replaces only that construction with the direct `"\uFFFD"` literal,
preserving the observed existing rejection set. Traversal, absolute paths, schemes,
empty components and replacement-character paths still reject; legitimate Unicode
paths still accept. ZIP directory trailing-slash behavior remains different from
manifest asset-path behavior. No path allowance, trust policy, credentials, device
setting, audio clock or package content policy is changed.

The merge has parents `63c89d4687e7e8aea26287297ed83badcef6bc63` and the exact
PR143 head above. Its existing artifact is not relabelled as a direct-head build.

`pcs_pack_path_diagnostic_test.gd` passes31 positive/negative policy checks.
All16 source-only Godot stages pass with zero Unexpected-NUL messages after the
correction. Other ordinary bus-routing warnings remain separately visible; this
is a specific NUL-diagnostic correction, not a claim of universally silent logs.
The original frozen head, warning-bearing logs and package job remain retained.
Successful process exit and zero SCRIPT ERROR markers in that old job are not a
claim of zero diagnostics. This correction does not attribute the older steady
frame stalls: path validation is setup work, and the historical gaps remain open.
