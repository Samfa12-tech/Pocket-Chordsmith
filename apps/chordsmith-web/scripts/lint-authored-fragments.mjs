import { resolve } from "node:path";
import { ESLint } from "eslint";

const repoRoot = resolve(import.meta.dirname, "../../..");
const correctnessRules = {
  eqeqeq: "error",
  "no-constant-binary-expression": "error",
  "no-redeclare": "error",
  "no-undef": "error",
  "no-unreachable": "error",
  "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
};
const eslint = new ESLint({
  cwd: repoRoot,
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ["packages/pocket-audio-core/src/export/chordsmith-wav-worker.js"],
      languageOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        globals: { self: "readonly" },
      },
      rules: correctnessRules,
    },
    {
      files: ["apps/chordsmith-web/src/transport/scheduler-recovery.js"],
      languageOptions: {
        ecmaVersion: "latest",
        sourceType: "script",
        globals: {},
      },
      rules: correctnessRules,
    },
    {
      files: ["apps/chordsmith-web/src/audio/wav-worker-lifecycle.js"],
      languageOptions: {
        ecmaVersion: "latest",
        sourceType: "script",
        globals: { Blob: "readonly", DOMException: "readonly", URL: "readonly" },
      },
      rules: correctnessRules,
    },
  ],
});

const files = [
  "packages/pocket-audio-core/src/export/chordsmith-wav-worker.js",
  "apps/chordsmith-web/src/transport/scheduler-recovery.js",
  "apps/chordsmith-web/src/audio/wav-worker-lifecycle.js",
].map(path => resolve(repoRoot, path));
const results = await eslint.lintFiles(files);
const formatter = await eslint.loadFormatter("stylish");
const output = formatter.format(results);
if (output) process.stdout.write(output);
if (results.some(result => result.errorCount > 0)) process.exitCode = 1;
