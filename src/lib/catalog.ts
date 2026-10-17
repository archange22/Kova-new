export type CatalogKind = "all" | "manga" | "manhwa";
export type MediaProvider = "mangadex";

export type ReadableChapter = {
  mangaDexChapterId: string;
  title: string;
  pages: number;
  publishedAt?: string;
  language: string;
  scanlationGroup?: string;
  scanlationGroupId?: string;
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
};

export type CatalogPage = {
  items: CatalogItem[];
  nextOffset: number;
  hasMore: boolean;
};

const MANGADEX_API = "/api/mangadex";
const PAGE_SIZE = 18;
const SUPPORTED_LANGUAGES = ["fr", "en"] as const;

type MangaDexRelationship = {
  id: string;
  type: string;
  attributes?: { fileName?: string; name?: string };
};

type MangaDexManga = {
  id: string;
  attributes?: {
    title?: Record<string, string>;
    altTitles?: Array<Record<string, string>>;
    description?: Record<string, string>;
    originalLanguage?: string;
    year?: number | null;
    status?: string;
    contentRating?: string;
  };
  relationships?: MangaDexRelationship[];
};

async function apiJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${MANGADEX_API}${path}`, {
      signal,
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error("Connexion à MangaDex impossible. Vérifie Internet puis réessaie.");
  }
  if (response.status === 429) {
    throw new Error("MangaDex reçoit trop de requêtes pour le moment. Réessaie dans un instant.");
  }
  if (!response.ok) {
    throw new Error(response.status === 404
      ? "Cette page ou ce chapitre n'existe plus sur MangaDex."
      : `MangaDex a répondu avec le code ${response.status}. Réessaie plus tard.`);
  }
  return response.json() as Promise<T>;
}

function localizedValue(values?: Record<string, string>): string {
  if (!values) return "";
  return values.fr || values.en || values["ja-ro"] || values["ko-ro"] || Object.values(values)[0] || "";
}

function mangaTitle(manga: MangaDexManga): string {
  return localizedValue(manga.attributes?.title) || "Manga sans titre";
}

function coverUrl(manga: MangaDexManga): string | undefined {
  const cover = manga.relationships?.find((relationship) => relationship.type === "cover_art")?.attributes?.fileName;
  return cover ? `/api/mangadex-cover/${manga.id}/${cover}.256.jpg` : undefined;
}

function cleanDescription(manga: MangaDexManga): string {
  const description = localizedValue(manga.attributes?.description);
  return description || "Aucun résumé n'est disponible pour le moment.";
}

function toCatalogItem(manga: MangaDexManga): CatalogItem | null {
  const attributes = manga.attributes;
  if (!attributes || !manga.id || attributes.contentRating !== "safe") return null;
  const language = attributes.originalLanguage;
  if (language !== "ja" && language !== "ko") return null;
  const statusMap: Record<string, string> = {
    ongoing: "En cours",
    completed: "Terminé",
    hiatus: "En pause",
    cancelled: "Annulé",
  };
  const alternate = (attributes.altTitles ?? []).map(localizedValue).find(Boolean);
  return {
    id: "mangadex-" + manga.id,
    provider: "mangadex",
    kind: language === "ko" ? "manhwa" : "manga",
    title: mangaTitle(manga),
    alternateTitle: alternate,
    description: cleanDescription(manga),
    cover: coverUrl(manga),
    year: attributes.year ?? undefined,
    status: statusMap[attributes.status ?? ""] ?? attributes.status ?? "Non renseigné",
    ageRating: attributes.contentRating,
    originalLanguage: language,
    sourceUrl: `https://mangadex.org/title/${manga.id}`,
  };
}

/** Search MangaDex directly. Only safe-rated Japanese manga and Korean manhwa are shown. */
export async function fetchCatalog(
  kind: CatalogKind,
  query: string,
  offset = 0,
  signal?: AbortSignal,
): Promise<CatalogPage> {
  if (signal?.aborted) throw new DOMException("Request aborted", "AbortError");
  const params = new URLSearchParams();
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String(Math.max(0, offset)));
  params.set("includes[]", "cover_art");
  params.set("contentRating[]", "safe");
  for (const language of SUPPORTED_LANGUAGES) params.append("availableTranslatedLanguage[]", language);

  if (kind === "manga") {
    params.append("originalLanguage[]", "ja");
  } else if (kind === "manhwa") {
    params.append("originalLanguage[]", "ko");
  } else {
    params.append("originalLanguage[]", "ja");
    params.append("originalLanguage[]", "ko");
  }

  const searchTerm = query.trim();
  if (searchTerm) {
    params.set("title", searchTerm);
    params.set("order[relevance]", "desc");
  } else {
    params.set("order[followedCount]", "desc");
  }

  const response = await apiJson<{ data?: MangaDexManga[]; total?: number }>(
    `/manga?${params.toString()}`,
    signal,
  );
  const items = (response.data ?? []).map(toCatalogItem).filter((item): item is CatalogItem => item !== null);
  const nextOffset = offset + (response.data?.length ?? 0);
  return {
    items,
    nextOffset,
    hasMore: nextOffset < (response.total ?? nextOffset),
  };
}

/** Retrieve readable French/English chapters for the selected series. */
export async function fetchMangaDexChapters(
  mangaId: string,
  signal?: AbortSignal,
): Promise<ReadableChapter[]> {
  const rawMangaId = mangaId.startsWith("mangadex-") ? mangaId.slice(9) : mangaId;
  if (!/^[0-9a-f-]{36}$/i.test(rawMangaId)) {
    throw new Error("Identifiant MangaDex invalide.");
  }
  const params = new URLSearchParams();
  params.set("limit", "100");
  params.set("order[chapter]", "asc");
  params.set("includeExternalUrl", "0");
  params.set("includes[]", "scanlation_group");
  for (const language of SUPPORTED_LANGUAGES) params.append("translatedLanguage[]", language);

  const response = await apiJson<{
    data?: Array<{
      id: string;
      attributes?: {
        chapter?: string | null;
        volume?: string | null;
        title?: string | null;
        pages?: number;
        externalUrl?: string | null;
        publishAt?: string;
        translatedLanguage?: string;
        isUnavailable?: boolean;
      };
      relationships?: MangaDexRelationship[];
    }>;
  }>(`/manga/${rawMangaId}/feed?${params.toString()}`, signal);

  const seen = new Set<string>();
  return (response.data ?? [])
    .filter((chapter) => {
      const attributes = chapter.attributes;
      return Boolean(
        attributes &&
        attributes.externalUrl == null &&
        (attributes.pages ?? 0) > 0 &&
        !attributes.isUnavailable &&
        SUPPORTED_LANGUAGES.includes(attributes.translatedLanguage as typeof SUPPORTED_LANGUAGES[number]),
      );
    })
    .filter((chapter) => {
      const attributes = chapter.attributes!;
      const key = `${attributes.volume ?? ""}:${attributes.chapter ?? chapter.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((chapter) => {
      const attributes = chapter.attributes!;
      const group = chapter.relationships?.find((relationship) => relationship.type === "scanlation_group");
      const label = attributes.chapter ? `Chapitre ${attributes.chapter}` : "Chapitre spécial";
      return {
        mangaDexChapterId: chapter.id,
        title: [label, attributes.title].filter(Boolean).join(" · "),
        pages: attributes.pages ?? 0,
        publishedAt: attributes.publishAt,
        language: attributes.translatedLanguage ?? "en",
        scanlationGroup: group?.attributes?.name,
        scanlationGroupId: group?.id,
      };
    });
}

/** Load chapter images from MangaDex@Home, using compressed images by default for mobile data savings. */
export async function fetchMangaDexChapterPages(
  chapterId: string,
  quality: "data" | "data-saver" = "data-saver",
  signal?: AbortSignal,
): Promise<string[]> {
  if (!/^[0-9a-f-]{36}$/i.test(chapterId)) {
    throw new Error("Identifiant de chapitre MangaDex invalide.");
  }
  const response = await apiJson<{
    baseUrl?: string;
    chapter?: { hash?: string; data?: string[]; dataSaver?: string[] };
  }>(`/at-home/server/${chapterId}`, signal);
  const hash = response.chapter?.hash;
  const pages = quality === "data" ? response.chapter?.data : response.chapter?.dataSaver;
  if (!response.baseUrl || !hash || !pages?.length) {
    throw new Error("MangaDex n'a renvoyé aucune page pour ce chapitre.");
  }
  const folder = quality === "data" ? "data" : "data-saver";
  return pages.map((page) => `/api/mangadex-image?url=${encodeURIComponent(`${response.baseUrl}/${folder}/${hash}/${page}`)}`);
}
