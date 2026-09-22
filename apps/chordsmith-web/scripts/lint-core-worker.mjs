import { resolve } from "node:path";
import { ESLint } from "eslint";

const repoRoot = resolve(import.meta.dirname, "../../..");
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
      rules: {
        "no-redeclare": "error",
        "no-undef": "error",
        "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      },
    },
  ],
});

const results = await eslint.lintFiles([
  resolve(repoRoot, "packages/pocket-audio-core/src/export/chordsmith-wav-worker.js"),
]);
const formatter = await eslint.loadFormatter("stylish");
const output = formatter.format(results);
if (output) process.stdout.write(output);
if (results.some(result => result.errorCount > 0)) process.exitCode = 1;
