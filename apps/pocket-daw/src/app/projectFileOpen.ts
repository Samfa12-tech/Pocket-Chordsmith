import type { NativeProjectOpenResult, OpenProjectFileResult } from "../native/fileBridge";
import { parseAnyImportText } from "../compatibility/pcsParser";

export function projectFileUsesFamilyImport(file: OpenProjectFileResult): boolean {
  return !file.file.label.toLowerCase().endsWith(".pocketdaw") && parseAnyImportText(file.contents).kind !== "pocketdaw";
}

export function projectOpenRecordingBusy(audioStatus: string, midiStatus: string): boolean {
  return ["preparing", "count-in", "recording", "stopping"].includes(audioStatus) || midiStatus === "recording";
}

interface ProjectOpenOptions {
  select(): Promise<NativeProjectOpenResult>;
  isCurrent(): boolean;
  openNative(project: OpenProjectFileResult, isCurrent: () => boolean): Promise<void>;
  openBrowser(): void;
  report(message: string): void;
}

/** One picker per window; a pending result must not replace a newer project/edit. */
export class ProjectFileOpen {
  private pending = false;

  async open(options: ProjectOpenOptions): Promise<void> {
    if (this.pending) return;
    this.pending = true;
    try {
      const result = await options.select();
      if (result.mode === "cancelled") return;
      if (!options.isCurrent()) {
        options.report("Open cancelled because the project changed or recording started while the picker was open. Choose the file again when ready.");
        return;
      }
      if (result.mode === "unavailable") options.openBrowser();
      else await options.openNative(result.project, options.isCurrent);
    } catch (error) {
      if (options.isCurrent()) options.report(error instanceof Error ? `Native open failed: ${error.message}` : "Native open failed. Try opening the file again.");
    } finally {
      this.pending = false;
    }
  }
}
