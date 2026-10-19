export type AnimeCatalogItem = {
  id: number;
  title: string;
  titleEnglish: string | null;
  synopsis: string;
  image: string | null;
  year: number | null;
  episodes: number | null;
  score: number | null;
  status: string;
  genres: string[];
};

type JikanAnime = {
  mal_id: number;
  title?: string | null;
  title_english?: string | null;
  synopsis?: string | null;
  year?: number | null;
  aired?: { from?: string | null; prop?: { from?: { year?: number | null } } };
  episodes?: number | null;
  score?: number | null;
  status?: string | null;
  images?: { jpg?: { large_image_url?: string; image_url?: string } };
  genres?: { name?: string }[];
};

type JikanResponse = {
  data?: JikanAnime[];
  pagination?: { has_next_page?: boolean };
};

export type AnimeCatalogPage = {
  items: AnimeCatalogItem[];
  page: number;
  hasNextPage: boolean;
};

const API = "https://api.jikan.moe/v4";
const PAGE_SIZE = 18;
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { expiresAt: number; value: AnimeCatalogPage }>();

function cleanText(value: string | null | undefined, maxLength = 1_800) {
  return (value ?? "")
    .replace(/\\[Written by MAL Rewrite\\]/g, "")
    .replace(/<[^>]*>/g, "")
    .trim()
    .slice(0, maxLength);
}

function normalizeAnime(item: JikanAnime): AnimeCatalogItem {
  const image = item.images?.jpg?.large_image_url ?? item.images?.jpg?.image_url ?? null;
  const year = item.year ?? item.aired?.prop?.from?.year ?? null;
  return {
    id: item.mal_id,
    title: cleanText(item.title, 180) || "Anime sans titre",
    titleEnglish: cleanText(item.title_english, 180) || null,
    synopsis: cleanText(item.synopsis),
    image,
    year,
    episodes: typeof item.episodes === "number" ? item.episodes : null,
    score: typeof item.score === "number" ? item.score : null,
    status: cleanText(item.status, 80) || "Statut inconnu",
    genres: (item.genres ?? []).map((genre) => cleanText(genre.name, 60)).filter(Boolean).slice(0, 6),
  };
}

/**
 * Search Jikan's public anime catalogue. This is metadata only: KOVA does not
 * fetch or host episode video streams through this API.
 */
export async function fetchAnimeCatalog(
  query = "",
  page = 1,
  signal?: AbortSignal,
): Promise<AnimeCatalogPage> {
  const normalizedQuery = query.trim().slice(0, 100);
  const safePage = Math.max(1, Math.min(100, Math.floor(page) || 1));
  const cacheKey = normalizedQuery.toLocaleLowerCase() + ":" + safePage;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const url = new URL(`${API}/anime`);
  url.searchParams.set("page", String(safePage));
  url.searchParams.set("limit", String(PAGE_SIZE));
  url.searchParams.set("sfw", "true");
  url.searchParams.set("order_by", normalizedQuery ? "title" : "score");
  url.searchParams.set("sort", normalizedQuery ? "asc" : "desc");
  if (normalizedQuery) url.searchParams.set("q", normalizedQuery);

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("L’API Anime reçoit trop de demandes pour le moment. Attends quelques secondes puis réessaie.");
    }
    if (response.status >= 500) {
      throw new Error("Le catalogue Anime est temporairement indisponible. Réessaie dans un instant.");
    }
    throw new Error(`Impossible de charger le catalogue Anime (HTTP ${response.status}).`);
  }

  const json = (await response.json()) as JikanResponse;
  const result: AnimeCatalogPage = {
    items: (json.data ?? []).map(normalizeAnime),
    page: safePage,
    hasNextPage: Boolean(json.pagination?.has_next_page),
  };

  if (!signal?.aborted) {
    cache.set(cacheKey, { value: result, expiresAt: Date.now() + CACHE_TTL_MS });
  }
  return result;
}
