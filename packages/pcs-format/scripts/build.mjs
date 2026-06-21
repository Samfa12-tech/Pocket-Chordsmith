import { mkdirSync, copyFileSync } from "node:fs";

mkdirSync("dist", { recursive: true });
copyFileSync("src/index.js", "dist/index.js");
console.log("Built pcs-format dist/index.js");
