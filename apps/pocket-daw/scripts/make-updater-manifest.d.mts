export interface MakeUpdaterManifestOptions {
  artifact: string;
  signature: string;
  url: string;
  notes: string;
  version?: string;
  pubDate?: string;
  platform?: string;
  out?: string;
  sums?: string;
}

export interface MakeUpdaterManifestResult {
  manifest: {
    version: string;
    notes: string;
    pub_date: string;
    platforms: Record<string, { signature: string; url: string }>;
  };
  out: string;
  sums: string;
}

export function makeUpdaterManifest(options: MakeUpdaterManifestOptions): MakeUpdaterManifestResult;
