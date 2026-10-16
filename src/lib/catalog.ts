export type CatalogKind = "all" | "manga" | "manhwa" | "comics";
export type MediaProvider = "kova" | "mangadex";

export type ReadableChapter = {
  title: string;
  pages: string[];
  imagePages?: string[];
  mangaDexChapterId?: string;
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
  rating?: number;
  ageRating?: string;
  subtype?: string;
  sourceUrl: string;
  chapters?: ReadableChapter[];
};

export type CatalogPage = {
  items: CatalogItem[];
  nextOffset: number;
  hasMore: boolean;
};

const MANGADEX_API = "https://api.mangadex.org";
const PAGE_SIZE = 18;

/**
 * MangaDex does not provide a reliable rights/license field for every work.
 * Only manga IDs explicitly approved by the site owner for in-site reading
 * are fetched and displayed. Configure VITE_MANGADEX_ALLOWED_MANGA_IDS with
 * comma-separated MangaDex IDs after confirming publication/embedding rights.
 */
const approvedMangaDexIds = (import.meta.env.VITE_MANGADEX_ALLOWED_MANGA_IDS ?? "")
  .split(",")
  .map((id: string) => id.trim())
  .filter(Boolean);

const ORIGINALS: CatalogItem[] = [
  {
    id: "kova-la-page-zero",
    provider: "kova",
    kind: "manga",
    title: "KOVA : La Page Zéro",
    alternateTitle: "Un récit original KOVA",
    description: "Dans une ville où les souvenirs s'affichent comme des pages, Nao découvre un livre qui n'aurait jamais dû exister. Premier épisode original, lisible directement dans KOVA.",
    year: 2026,
    status: "En cours",
    subtype: "original",
    sourceUrl: "#lecture",
    chapters: [{
      title: "Chapitre 1 · Le livre sans titre",
      pages: [
        "La pluie dessinait des lignes argentées sur les vitres de Néo-Kyoto. Nao rentrait tard, son sac trempé et son téléphone presque déchargé.",
        "Au fond d'une ruelle, une lumière violette clignotait sous la porte d'une boutique oubliée. Sur la vitrine, une phrase était écrite à la main : « Les histoires perdues cherchent encore leurs lecteurs. »",
        "La boutique était vide. Au centre d'une table reposait un livre noir, sans titre, sans auteur, sans poussière. Quand Nao posa la main dessus, toutes les lumières de la rue s'éteignirent.",
        "Une page blanche se remplit lentement d'une phrase : « Nao, si tu lis ceci, c'est que la première porte est déjà ouverte. » Derrière lui, une serrure apparut dans le mur.",
        "Nao recula d'un pas. La serrure brillait de la même lumière violette que le livre. Il inspira, tourna la clé qui venait d'apparaître dans sa paume et entendit, de l'autre côté, quelqu'un murmurer son nom.",
        "Fin du chapitre 1. La suite arrivera lorsqu'un nouveau chapitre original sera publié par KOVA."
      ],
    }],
  },
];

function localizedTitle(manga: any): string {
  const title = manga.attributes?.title ?? {};
  return title.fr || title.en || Object.values(title)[0] as string || "Manga sans titre";
}

function coverUrl(manga: any): string | undefined {
  const cover = manga.relationships?.find((relationship: any) => relationship.type === "cover_art")?.attributes?.fileName;
  return cover ? `https://uploads.mangadex.org/covers/${manga.id}/${cover}.256.jpg` : undefined;
}

async function fetchApprovedMangaDex(signal?: AbortSignal): Promise<CatalogItem[]> {
  if (!approvedMangaDexIds.length) return [];
  const results = await Promise.all(approvedMangaDexIds.map(async (id: string) => {
    const response = await fetch(`${MANGADEX_API}/manga/${encodeURIComponent(id)}?includes[]=cover_art`, { signal });
    if (!response.ok) return null;
    const json = await response.json();
    const manga = json.data;
    if (!manga?.id || ["pornographic", "erotica", "suggestive"].includes(manga.attributes?.contentRating)) return null;

    const chaptersResponse = await fetch(
      `${MANGADEX_API}/manga/${encodeURIComponent(id)}/feed?translatedLanguage[]=en&translatedLanguage[]=fr&order[chapter]=asc&limit=100&includes[]=scanlation_group`,
      { signal },
    );
    if (!chaptersResponse.ok) return null;
    const chaptersJson = await chaptersResponse.json();
    const seen = new Set<string>();
    const chapters: ReadableChapter[] = (chaptersJson.data ?? [])
      .filter((chapter: any) => chapter.attributes?.externalUrl == null && chapter.attributes?.pages > 0)
      .filter((chapter: any) => {
        const key = chapter.attributes?.chapter ?? chapter.id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 30)\n      .map((chapter: any) => ({
        title: [chapter.attributes?.chapter ? `Chapitre ${chapter.attributes.chapter}` : "Chapitre spécial", chapter.attributes?.title].filter(Boolean).join(" · "),
        pages: [],
        mangaDexChapterId: chapter.id,
      }));

    // No chapter means no readable listing. Only owner-approved IDs are queried.
    if (!chapters.length) return null;
    const attrs = manga.attributes;
    const year = attrs.year ? Number(attrs.year) : undefined;
    return {
      id: `mangadex-${manga.id}`,
      provider: "mangadex" as const,
      kind: "manga" as const,
      title: localizedTitle(manga),
      alternateTitle: attrs.altTitles?.map((value: Record<string, string>) => value.fr || value.en || Object.values(value)[0]).find(Boolean),
      description: attrs.description?.fr || attrs.description?.en || "Description non disponible.",
      cover: coverUrl(manga),
      year,
      status: attrs.status === "completed" ? "Terminé" : attrs.status === "ongoing" ? "En cours" : attrs.status,
      ageRating: attrs.contentRating,
      sourceUrl: `https://mangadex.org/title/${manga.id}`,
      chapters,
    } satisfies CatalogItem;
  }));
  return results.filter((item): item is CatalogItem => item !== null);
}

export async function fetchMangaDexChapterPages(chapterId: string, signal?: AbortSignal): Promise<string[]> {
  if (!approvedMangaDexIds.length) throw new Error("Aucun titre MangaDex n'a été autorisé pour la lecture intégrée.");
  const response = await fetch(`${MANGADEX_API}/at-home/server/${encodeURIComponent(chapterId)}`, { signal });
  if (!response.ok) throw new Error("Les pages de ce chapitre MangaDex sont indisponibles.");
  const data = await response.json();
  const hash = data.chapter?.hash;
  const pages: string[] = data.chapter?.data ?? [];
  if (!data.baseUrl || !hash || !pages.length) throw new Error("MangaDex n'a renvoyé aucune page pour ce chapitre.");
  return pages.map((page) => `${data.baseUrl}/data/${hash}/${page}`);
}

export async function fetchCatalog(
  kind: CatalogKind,
  query: string,
  offset = 0,
  signal?: AbortSignal,
): Promise<CatalogPage> {
  if (signal?.aborted) throw new DOMException("Request aborted", "AbortError");
  const mangaDexItems = await fetchApprovedMangaDex(signal);
  const allItems = [...ORIGINALS, ...mangaDexItems];
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = allItems.filter((item) => {
    const matchesKind = kind === "all" || item.kind === kind;
    const searchable = [item.title, item.alternateTitle, item.description].filter(Boolean).join(" ").toLocaleLowerCase();
    return matchesKind && (!normalizedQuery || searchable.includes(normalizedQuery));
  });
  const items = filtered.slice(offset, offset + PAGE_SIZE);
  const nextOffset = offset + items.length;
  return { items, nextOffset, hasMore: nextOffset < filtered.length };
}
