import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  appType: "mpa",
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        pocket_chordsmith_v67_direct_godot_push: resolve(
          __dirname,
          "pocket_chordsmith_v67_direct_godot_push.html",
        ),
        pocket_chordsmith_v68_core_bridge: resolve(
          __dirname,
          "pocket_chordsmith_v68_core_bridge.html",
        ),
      },
    },
  },
});
