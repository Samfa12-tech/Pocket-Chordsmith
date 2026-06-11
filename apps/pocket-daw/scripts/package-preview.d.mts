export const RELEASE_DOCS: string[];

export function previewZipName(version: string): string;

export function copyReleaseDocs(root: string, distDir: string, releaseDir: string): void;

export function createPreviewZip(options?: { root?: string; version?: string }): string;
