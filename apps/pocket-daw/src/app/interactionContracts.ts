export interface TrackSelectionState {
  selectedTrackId: string | null;
  selectedClipId: string | null;
  selectedClipIds?: string[];
}

export function selectTrackHeader<T extends TrackSelectionState>(state: T, trackId: string | null): T {
  return { ...state, selectedTrackId: trackId, selectedClipId: null, selectedClipIds: [] };
}

export interface ExternalUrlDependencies {
  openNative(url: string): Promise<boolean>;
  nativeBridgeAvailable(): boolean;
  openBrowser(url: string): boolean;
  replaceLocation(url: string): void;
}

export type ExternalUrlResult = "native-opened" | "native-failed" | "browser-opened" | "location-fallback";

/** Native desktop links do not fall through to a browser if the bridge exists. */
export async function openExternalUrlWithFallback(url: string, dependencies: ExternalUrlDependencies): Promise<ExternalUrlResult> {
  if (await dependencies.openNative(url)) return "native-opened";
  if (dependencies.nativeBridgeAvailable()) return "native-failed";
  if (url.startsWith("mailto:")) {
    dependencies.replaceLocation(url);
    return "location-fallback";
  }
  if (dependencies.openBrowser(url)) return "browser-opened";
  dependencies.replaceLocation(url);
  return "location-fallback";
}
