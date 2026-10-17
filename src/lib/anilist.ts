import type { CatalogItem } from "./catalog";

type AniListMedia = {
  id: number;
  siteUrl?: string;
  averageScore?: number | null;
  genres?: string[];
  title?: { romaji?: string | null; english?: string | null; native?: string | null };
};

function normalize(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function matches(item: CatalogItem, media: AniListMedia): boolean {
  const expected = new Set([
    item.title, item.alternateTitle, item.anilistTitle,
  ].filter((value): value is string => Boolean(value)).map(normalize));
  const actual = [media.title?.romaji, media.title?.english, media.title?.native]
    .filter((value): value is string => Boolean(value)).map(normalize);
  if (actual.some((title) => expected.has(title))) return true;

  const source = normalize(item.title);
  return actual.some((title) => {
    const left = new Set(source.split(" ").filter((word) => word.length > 2));
    const right = new Set(title.split(" ").filter((word) => word.length > 2));
    if (!left.size || !right.size) return false;
    const intersection = [...left].filter((word) => right.has(word)).length;
    return intersection / Math.max(left.size, right.size) >= 0.8;
  });
}

/** Enrich MangaDex titles with matching public AniList metadata; MangaDex IDs remain canonical for reading. */
export async function enrichWithAniList(items: CatalogItem[], signal?: AbortSignal): Promise<CatalogItem[]> {
  if (!items.length) return items;
  const aliases = items.map((item, index) =>
    "m" + index + ": Media(search: " + JSON.stringify(item.title) + ", type: MANGA, format_in: [MANGA, ONE_SHOT]) { id siteUrl averageScore genres title { romaji english native } }"
  );
  const query = "query KovaMangaMetadata { " + aliases.join("\n") + " }";
  try {
    const response = await fetch("/api/anilist", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query }),
      signal,
    });
    if (!response.ok) return items;
    const payload = await response.json() as { data?: Record<string, AniListMedia | null> };
    return items.map((item, index) => {
      const media = payload.data?.["m" + index];
      if (!media || !matches(item, media)) return item;
      return {
        ...item,
        anilistId: media.id,
        anilistUrl: media.siteUrl || "https://anilist.co/manga/" + media.id,
        anilistTitle: media.title?.english || media.title?.romaji || media.title?.native || undefined,
        anilistScore: media.averageScore ?? undefined,
        anilistGenres: media.genres?.slice(0, 5),
      };
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return items;
  }
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

async function userGraphQL<T>(token: string, query: string): Promise<T> {
  const response = await fetch("/api/anilist", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify({ query }),
  });
  const payload = await response.json() as { data?: T; errors?: Array<{ message?: string }> };
  if (!response.ok || payload.errors?.length || !payload.data) {
    throw new Error(payload.errors?.[0]?.message || "AniList n'a pas répondu correctement.");
  }
  return payload.data;
}

export async function fetchAniListUserEntries(token: string): Promise<{ name: string; entries: AniListUserEntry[] }> {
  const viewer = await userGraphQL<{ Viewer: { id: number; name: string } }>(
    token,
    "query { Viewer { id name } }"
  );
  const result = await userGraphQL<{
    MediaListCollection: { lists: Array<{ entries: AniListUserEntry[] }> };
  }>(
    token,
    "query { MediaListCollection(userId: " + viewer.Viewer.id + ", type: MANGA) { lists { entries { mediaId status progress media { id siteUrl title { romaji english native } } } } } }"
  );
  return {
    name: viewer.Viewer.name,
    entries: result.MediaListCollection.lists.flatMap((list) => list.entries),
  };
}

export async function saveAniListEntryStatus(
  token: string,
  mediaId: number,
  status: "CURRENT" | "COMPLETED" | "PAUSED" | "DROPPED" | "PLANNING",
): Promise<void> {
  await userGraphQL<{ SaveMediaListEntry: { id: number } }>(
    token,
    "mutation { SaveMediaListEntry(mediaId: " + mediaId + ", status: " + status + ") { id } }"
  );
}
