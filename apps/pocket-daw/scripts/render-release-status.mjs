import { writeReleaseStatusMarkdown } from "./release-status-lib.mjs";

try {
  const { outputPath } = writeReleaseStatusMarkdown();
  console.log(`Wrote ${outputPath}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
