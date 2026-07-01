import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["tests/e2e/**", "node_modules/**", "dist/**", "src-tauri/target/**"],
    maxWorkers: 4,
    testTimeout: 30000
  },
  server: {
    host: "127.0.0.1",
    port: 5177,
    watch: {
      ignored: ["**/src-tauri/target/**"]
    }
  },
  preview: {
    host: "127.0.0.1",
    port: 4177
  }
});
