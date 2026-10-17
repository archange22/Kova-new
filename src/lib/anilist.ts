import type { CatalogItem } from "./catalog";

/**
 * AniList integration is intentionally disabled while KOVA focuses on its
 * interface, navigation and core account/support systems.
 */
export async function enrichWithAniList(items: CatalogItem[], signal?: AbortSignal): Promise<CatalogItem[]> {
  if (signal?.aborted) throw new DOMException("Request aborted", "AbortError");
  return items;
}

export type AniListUserEntry = {
  mediaId: number;
  status: "CURRENT" | "COMPLETED" | "PAUSED" | "DROPPED" | "PLANNING" | "REPEATING";
  progress: number;
  media: {
    id: number;
    siteUrl?: string;
    title?: { romaji?: string | null; english?: string | null; native?: string | null };
  };
};

export async function fetchAniListUserEntries(_token: string): Promise<{ name: string; entries: AniListUserEntry[] }> {
  return { name: "", entries: [] };
}

export async function saveAniListEntryStatus(
  _token: string,
  _mediaId: number,
  _status: "CURRENT" | "COMPLETED" | "PAUSED" | "DROPPED" | "PLANNING",
): Promise<void> {
  // Intentionally no-op while the AniList API is disabled.
}
