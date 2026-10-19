export type CatalogKind = "all" | "manga" | "manhwa";
export type MediaProvider = "mangadex" | "local";

export type ReadableChapter = {
  mangaDexChapterId: string;
  title: string;
  pages: number;
  volume?: string;
  publishedAt?: string;
  language: string;
  scanlationGroup?: string;
  scanlationGroupId?: string;
};

export type ReadableChapterPage = {
  chapters: ReadableChapter[];
  nextOffset: number;
  total: number;
  hasMore: boolean;
};

export type ReadableChapterPages = {
  pages: string[];
  chapterTitle: string;
};

export type CatalogItem = {
  id: string;
  provider: MediaProvider;
  kind: Exclude<CatalogKind, "all">;
  title: string;
  alternateTitle?: string;
  description: string;
  cover?: string;
  year?: number;
  status?: string;
  ageRating?: string;
  originalLanguage?: string;
  sourceUrl: string;
  chapters?: ReadableChapter[];
  anilistId?: number;
  anilistUrl?: string;
  anilistTitle?: string;
  anilistScore?: number;
  anilistGenres?: string[];
};

export type CatalogPage = {
  items: CatalogItem[];
  nextOffset: number;
  hasMore: boolean;
};

const API = "https://api.mangadex.org";
const PAGE_SIZE = 18;
const COVER_BASE = "https://uploads.mangadex.org/covers";
const SAFE_RATINGS = ["safe", "suggestive"];

type MdRelationship = { id: string; type: string; attributes?: Record<string, unknown> };
type MdManga = {
  id: string;
  attributes: {
    title?: Record<string, string>;
    altTitles?: Array<Record<string, string>>;
    description?: Record<string, string>;
    year?: number;
    status?: string;
    contentRating?: string;
    originalLanguage?: string;
    lastChapter?: string | null;
  };
  relationships?: MdRelationship[];
};
type MdListResponse<T> = { data: T[]; total: number };
type MdChapter = {
  id: string;
  attributes: {
    title?: string | null;
    chapter?: string | null;
    volume?: string | null;
    pages?: number;
    translatedLanguage?: string;
    publishAt?: string;
    readableAt?: string;
  };
  relationships?: MdRelationship[];
};

async function mdFetch<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    if (response.status === 429) throw new Error("MangaDex reçoit trop de demandes. Attends quelques secondes puis réessaie.");
    if (response.status >= 500) throw new Error("MangaDex est momentanément indisponible. Réessaie plus tard.");
    throw new Error(`MangaDex a répondu avec le code ${response.status}.`);
  }
  return response.json() as Promise<T>;
}

function localizedText(value?: Record<string, string>, fallback = "") {
  if (!value) return fallback;
  return value.fr || value.en || Object.values(value)[0] || fallback;
}

function coverUrl(manga: MdManga) {
  const cover = manga.relationships?.find((relationship) => relationship.type === "cover_art");
  const filename = cover?.attributes?.fileName;
  return typeof filename === "string" && filename
    ? `${COVER_BASE}/${manga.id}/${encodeURIComponent(filename)}.256.jpg`
    : undefined;
}

function mapManga(manga: MdManga): CatalogItem | null {
  const attributes = manga.attributes;
  const language = attributes.originalLanguage || "";
  // MangaDex's original-language metadata is the most reliable public signal for this split.
  if (language !== "ja" && language !== "ko" && language !== "zh" && language !== "zh-hk") return null;
  const title = localizedText(attributes.title, "Titre sans nom");
  const alternate = attributes.altTitles?.map((entry) => localizedText(entry)).find((value) => value && value !== title);
  const description = localizedText(attributes.description, "Aucune description disponible pour le moment.");
  return {
    id: manga.id,
    provider: "mangadex",
    kind: language === "ko" ? "manhwa" : "manga",
    title,
    alternateTitle: alternate,
    description,
    cover: coverUrl(manga),
    year: attributes.year,
    status: attributes.status || undefined,
    ageRating: attributes.contentRating || "safe",
    originalLanguage: language,
    sourceUrl: `https://mangadex.org/title/${manga.id}`,
  };
}

/** Live MangaDex catalogue with server-side search, filters and pagination. */
export async function fetchCatalog(
  kind: CatalogKind,
  query: string,
  offset = 0,
  signal?: AbortSignal,
): Promise<CatalogPage> {
  const params = new URLSearchParams();
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String(Math.max(0, offset)));
  params.set("includes[]", "cover_art");
  params.set("contentRating[]", SAFE_RATINGS[0]);
  params.append("contentRating[]", SAFE_RATINGS[1]);
  params.set("order[relevance]", "desc");
  params.set("order[followedCount]", "desc");
  params.set("hasAvailableChapters", "true");
  if (query.trim()) params.set("title", query.trim().slice(0, 100));
  if (kind === "manga") {
    params.append("originalLanguage[]", "ja");
    params.append("originalLanguage[]", "zh");
    params.append("originalLanguage[]", "zh-hk");
  } else if (kind === "manhwa") {
    params.append("originalLanguage[]", "ko");
  } else {
    params.append("originalLanguage[]", "ja");
    params.append("originalLanguage[]", "ko");
    params.append("originalLanguage[]", "zh");
    params.append("originalLanguage[]", "zh-hk");
  }
  const response = await mdFetch<MdListResponse<MdManga>>(`/manga?${params.toString()}`, signal);
  const items = response.data.map(mapManga).filter((item): item is CatalogItem => item !== null);
  return {
    items,
    nextOffset: Math.max(0, offset) + response.data.length,
    hasMore: Math.max(0, offset) + response.data.length < response.total,
  };
}

/** Fetch real MangaDex chapters. Prefer French releases, then English if French is unavailable. */
export async function fetchChapters(
  mangaId: string,
  offset = 0,
  signal?: AbortSignal,
): Promise<ReadableChapterPage> {
  if (!mangaId || mangaId.startsWith("demo-")) {
    return { chapters: [], nextOffset: offset, total: 0, hasMore: false };
  }
  const params = new URLSearchParams();
  params.set("limit", "100");
  params.set("offset", String(Math.max(0, offset)));
  params.set("order[chapter]", "asc");
  params.set("order[volume]", "asc");
  params.set("includes[]", "scanlation_group");
  params.append("translatedLanguage[]", "fr");
  const path = `/manga/${encodeURIComponent(mangaId)}/feed?${params.toString()}`;
  let response = await mdFetch<MdListResponse<MdChapter>>(path, signal);
  let language = "fr";
  if (response.total === 0 && offset === 0) {
    params.delete("translatedLanguage[]");
    params.append("translatedLanguage[]", "en");
    response = await mdFetch<MdListResponse<MdChapter>>(`/manga/${encodeURIComponent(mangaId)}/feed?${params.toString()}`, signal);
    language = "en";
  }
  const chapters = response.data.map((chapter) => {
    const group = chapter.relationships?.find((relationship) => relationship.type === "scanlation_group");
    const number = chapter.attributes.chapter;
    const title = chapter.attributes.title?.trim();
    return {
      mangaDexChapterId: chapter.id,
      title: [number ? `Chapitre ${number}` : "", title].filter(Boolean).join(" : ") || "Chapitre sans titre",
      pages: chapter.attributes.pages || 0,
      volume: chapter.attributes.volume || undefined,
      publishedAt: chapter.attributes.publishAt || chapter.attributes.readableAt || undefined,
      language: chapter.attributes.translatedLanguage || language,
      scanlationGroup: typeof group?.attributes?.name === "string" ? group.attributes.name : undefined,
      scanlationGroupId: group?.id,
    } satisfies ReadableChapter;
  });
  const nextOffset = Math.max(0, offset) + response.data.length;
  return { chapters, nextOffset, total: response.total, hasMore: nextOffset < response.total };
}

/** Get the real MangaDex reader page URLs using its at-home endpoint. */
export async function fetchChapterPages(
  chapterId: string,
  quality: "data" | "data-saver" = "data-saver",
  signal?: AbortSignal,
): Promise<string[]> {
  if (!chapterId || chapterId.startsWith("demo-")) return [];
  const response = await mdFetch<{
    baseUrl: string;
    chapter: { hash: string; data: string[]; dataSaver: string[] };
  }>(`/at-home/server/${encodeURIComponent(chapterId)}`, signal);
  const filenames = quality === "data" ? response.chapter.data : response.chapter.dataSaver;
  return filenames.map((filename) =>
    `${response.baseUrl}/${quality === "data" ? "data" : "data-saver"}/${response.chapter.hash}/${encodeURIComponent(filename)}`,
  );
}
