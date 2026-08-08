export default [
  {
    files: ["tests/**/*.mjs", "scripts/**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { Buffer: "readonly", console: "readonly", process: "readonly", URL: "readonly" },
    },
    rules: {
      "no-redeclare": "error",
      "no-undef": "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
];
