export type CatalogKind = "all" | "manga" | "manhwa" | "comics";
export type MediaProvider = "kova";

export type ReadableChapter = {
  title: string;
  pages: string[];
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
  chapters: ReadableChapter[];
};

export type CatalogPage = {
  items: CatalogItem[];
  nextOffset: number;
  hasMore: boolean;
};

/**
 * KOVA only lists works whose chapters are available in the built-in reader.
 * This pilot is original text written for KOVA. Add future works here only
 * after confirming that KOVA owns or has permission to publish every page.
 */
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
    chapters: [
      {
        title: "Chapitre 1 · Le livre sans titre",
        pages: [
          "La pluie dessinait des lignes argentées sur les vitres de Néo-Kyoto. Nao rentrait tard, son sac trempé et son téléphone presque déchargé.",
          "Au fond d'une ruelle, une lumière violette clignotait sous la porte d'une boutique oubliée. Sur la vitrine, une phrase était écrite à la main : « Les histoires perdues cherchent encore leurs lecteurs. »",
          "La boutique était vide. Au centre d'une table reposait un livre noir, sans titre, sans auteur, sans poussière. Quand Nao posa la main dessus, toutes les lumières de la rue s'éteignirent.",
          "Une page blanche se remplit lentement d'une phrase : « Nao, si tu lis ceci, c'est que la première porte est déjà ouverte. » Derrière lui, une serrure apparut dans le mur.",
          "Nao recula d'un pas. La serrure brillait de la même lumière violette que le livre. Il inspira, tourna la clé qui venait d'apparaître dans sa paume et entendit, de l'autre côté, quelqu'un murmurer son nom.",
          "Fin du chapitre 1. La suite arrivera lorsqu'un nouveau chapitre original sera publié par KOVA."
        ],
      },
    ],
  },
];

const PAGE_SIZE = 18;

export async function fetchCatalog(
  kind: CatalogKind,
  query: string,
  offset = 0,
  signal?: AbortSignal,
): Promise<CatalogPage> {
  if (signal?.aborted) throw new DOMException("Request aborted", "AbortError");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = ORIGINALS.filter((item) => {
    const matchesKind = kind === "all" || item.kind === kind;
    const searchable = [item.title, item.alternateTitle, item.description].filter(Boolean).join(" ").toLocaleLowerCase();
    return matchesKind && (!normalizedQuery || searchable.includes(normalizedQuery));
  });
  const items = filtered.slice(offset, offset + PAGE_SIZE);
  const nextOffset = offset + items.length;
  return {
    items,
    nextOffset,
    hasMore: nextOffset < filtered.length,
  };
}
