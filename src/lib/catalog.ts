export type CatalogKind = "all" | "manga" | "manhwa";
export type MediaProvider = "local";

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

/**
 * Local UI fixtures. External manga/catalog APIs are intentionally disabled
 * while KOVA's layout, navigation and account/support systems are developed.
 * These are fictional sample entries, not real publication metadata.
 */
const DEMO_CATALOG: CatalogItem[] = [
  { id: "demo-001", provider: "local", kind: "manga", title: "Éclipse des Lames", description: "Un apprenti cartographe découvre une cité qui n'apparaît que sous la lumière des lunes. Exemple fictif pour tester les fiches et la navigation.", year: 2026, status: "En cours", ageRating: "safe", originalLanguage: "ja", sourceUrl: "", chapters: [] },
  { id: "demo-002", provider: "local", kind: "manhwa", title: "Le Royaume de Verre", description: "Dans un royaume suspendu, une jeune mécanicienne cherche l'origine d'un ancien signal. Exemple fictif pour la maquette KOVA.", year: 2026, status: "En cours", ageRating: "safe", originalLanguage: "ko", sourceUrl: "", chapters: [] },
  { id: "demo-003", provider: "local", kind: "manga", title: "Les Chroniques du Renard Bleu", description: "Une équipe d'explorateurs suit les traces d'un esprit gardien. Contenu de démonstration.", year: 2025, status: "Terminé", ageRating: "safe", originalLanguage: "ja", sourceUrl: "", chapters: [] },
  { id: "demo-004", provider: "local", kind: "manhwa", title: "Niveau Zéro", description: "Une apprentie stratège doit reconstruire sa guilde dans une ville-labyrinthe. Contenu de démonstration.", year: 2026, status: "En cours", ageRating: "safe", originalLanguage: "ko", sourceUrl: "", chapters: [] },
  { id: "demo-005", provider: "local", kind: "manga", title: "L'Atelier des Étoiles", description: "Deux amis réparent des machines célestes dans un atelier au bord du monde. Contenu de démonstration.", year: 2025, status: "En pause", ageRating: "safe", originalLanguage: "ja", sourceUrl: "", chapters: [] },
  { id: "demo-006", provider: "local", kind: "manhwa", title: "La Dernière Porte", description: "Une porte oubliée relie les quartiers d'une mégapole à des dimensions inconnues. Contenu de démonstration.", year: 2026, status: "En cours", ageRating: "safe", originalLanguage: "ko", sourceUrl: "", chapters: [] },
  { id: "demo-007", provider: "local", kind: "manga", title: "Club des Mondes Perdus", description: "Un club scolaire collectionne des cartes menant à des lieux impossibles. Contenu de démonstration.", year: 2024, status: "Terminé", ageRating: "safe", originalLanguage: "ja", sourceUrl: "", chapters: [] },
  { id: "demo-008", provider: "local", kind: "manhwa", title: "Cœur de Néon", description: "Une coursière traverse une cité lumineuse pour retrouver un message disparu. Contenu de démonstration.", year: 2025, status: "En cours", ageRating: "safe", originalLanguage: "ko", sourceUrl: "", chapters: [] },
  { id: "demo-009", provider: "local", kind: "manga", title: "Le Jardin des Gardiens", description: "Des apprentis protègent un jardin où poussent des souvenirs. Contenu de démonstration.", year: 2025, status: "En cours", ageRating: "safe", originalLanguage: "ja", sourceUrl: "", chapters: [] },
  { id: "demo-010", provider: "local", kind: "manhwa", title: "Aube Synthétique", description: "Une pilote et un robot archiviste cherchent une nouvelle source d'énergie. Contenu de démonstration.", year: 2026, status: "En cours", ageRating: "safe", originalLanguage: "ko", sourceUrl: "", chapters: [] },
  { id: "demo-011", provider: "local", kind: "manga", title: "Le Train des Brumes", description: "Chaque arrêt d'un train nocturne ouvre sur un fragment de mémoire. Contenu de démonstration.", year: 2024, status: "Terminé", ageRating: "safe", originalLanguage: "ja", sourceUrl: "", chapters: [] },
  { id: "demo-012", provider: "local", kind: "manhwa", title: "La Guilde des Inventeurs", description: "De jeunes inventeurs participent à un concours qui pourrait changer leur ville. Contenu de démonstration.", year: 2025, status: "En cours", ageRating: "safe", originalLanguage: "ko", sourceUrl: "", chapters: [] },
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
  const filtered = DEMO_CATALOG.filter((item) => {
    const matchesKind = kind === "all" || item.kind === kind;
    const matchesQuery = !normalizedQuery || item.title.toLocaleLowerCase().includes(normalizedQuery)
      || item.description.toLocaleLowerCase().includes(normalizedQuery);
    return matchesKind && matchesQuery;
  });
  const items = filtered.slice(Math.max(0, offset), Math.max(0, offset) + PAGE_SIZE);
  const nextOffset = Math.max(0, offset) + items.length;
  return { items, nextOffset, hasMore: nextOffset < filtered.length };
}

/** Chapter network access is disabled in UI-development mode. */
export async function fetchMangaDexChapters(
  _mangaId: string,
  offset = 0,
  signal?: AbortSignal,
): Promise<ReadableChapterPage> {
  if (signal?.aborted) throw new DOMException("Request aborted", "AbortError");
  return { chapters: [], nextOffset: offset, total: 0, hasMore: false };
}

/** No remote image host is called while external content APIs are disabled. */
export async function fetchMangaDexChapterPages(
  _chapterId: string,
  _quality: "data" | "data-saver" = "data-saver",
  signal?: AbortSignal,
): Promise<string[]> {
  if (signal?.aborted) throw new DOMException("Request aborted", "AbortError");
  return [];
}
