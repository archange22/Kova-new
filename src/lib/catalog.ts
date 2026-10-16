export type CatalogKind = "all" | "manga" | "manhwa" | "comics";
export type MediaProvider = "kitsu" | "openlibrary";

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
};

export type CatalogPage = {
  items: CatalogItem[];
  nextOffset: number;
  hasMore: boolean;
};

const PAGE_SIZE = 18;
const KITSU_API = "https://kitsu.io/api/edge";
const OPEN_LIBRARY_API = "https://openlibrary.org";

type KitsuAttributes = {
  titles?: Record<string, string | null | undefined>;
  canonicalTitle?: string | null;
  slug?: string | null;
  synopsis?: string | null;
  posterImage?: { tiny?: string; small?: string; medium?: string; large?: string } | null;
  startDate?: string | null;
  status?: string | null;
  averageRating?: string | null;
  ageRating?: string | null;
  subtype?: string | null;
  chapterCount?: number | null;
  volumeCount?: number | null;
};

type KitsuPayload = {
  data?: Array<{ id: string; attributes?: KitsuAttributes }>;
  meta?: { count?: number };
};

type OpenLibraryDoc = {
  key?: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  subject?: string[];
};

type OpenLibraryPayload = {
  docs?: OpenLibraryDoc[];
  numFound?: number;
};

function cleanDescription(value?: string | null) {
  return (value ?? "Aucun résumé disponible pour le moment.")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mapKitsuTitle(id: string, attributes: KitsuAttributes): CatalogItem | null {
  const subtype = (attributes.subtype ?? "manga").toLowerCase();
  if (!["manga", "manhwa", "manhua", "oel", "doujin"].includes(subtype)) return null;

  const type: CatalogItem["kind"] =
    subtype === "manhwa" || subtype === "manhua" ? "manhwa" : "manga";
  const titles = attributes.titles ?? {};
  const title =
    attributes.canonicalTitle ||
    titles.en ||
    titles.en_jp ||
    Object.values(titles).find((candidate): candidate is string => Boolean(candidate)) ||
    "Titre sans nom";
  const alternateTitle = Object.values(titles).find(
    (candidate): candidate is string => Boolean(candidate && candidate !== title),
  );
  const safeRating = attributes.averageRating ? Number(attributes.averageRating) / 20 : undefined;

  return {
    id: `kitsu-${id}`,
    provider: "kitsu",
    kind: type,
    title,
    alternateTitle,
    description: cleanDescription(attributes.synopsis),
    cover:
      attributes.posterImage?.large ||
      attributes.posterImage?.medium ||
      attributes.posterImage?.small ||
      attributes.posterImage?.tiny ||
      undefined,
    year: attributes.startDate ? Number(attributes.startDate.slice(0, 4)) || undefined : undefined,
    status: attributes.status ?? undefined,
    rating: safeRating && Number.isFinite(safeRating) ? safeRating : undefined,
    ageRating: attributes.ageRating ?? undefined,
    subtype,
    sourceUrl: `https://kitsu.io/manga/${encodeURIComponent(attributes.slug || id)}`,
  };
}

async function fetchKitsuPage(
  kind: Exclude<CatalogKind, "comics">,
  query: string,
  offset: number,
  signal?: AbortSignal,
): Promise<CatalogPage> {
  const params = new URLSearchParams({
    sort: "popularityRank",
    "page[limit]": String(PAGE_SIZE),
    "page[offset]": String(offset),
  });
  if (query.trim()) params.set("filter[text]", query.trim());
  if (kind === "manga" || kind === "manhwa") {
    params.set("filter[subtype]", kind === "manga" ? "manga" : "manhwa");
  }

  const response = await fetch(`${KITSU_API}/manga?${params.toString()}`, {
    signal,
    headers: { Accept: "application/vnd.api+json" },
  });
  if (!response.ok) {
    throw new Error(
      response.status === 429
        ? "Le catalogue reçoit trop de demandes. Attends un instant puis réessaie."
        : "Le catalogue manga ne répond pas pour le moment.",
    );
  }

  const payload = (await response.json()) as KitsuPayload;
  const raw = payload.data ?? [];
  const items = raw
    .map((entry) => mapKitsuTitle(entry.id, entry.attributes ?? {}))
    .filter((entry): entry is CatalogItem => entry !== null)
    .filter((entry) => entry.ageRating !== "R" && entry.ageRating !== "R18");

  const total = payload.meta?.count;
  return {
    items,
    nextOffset: offset + raw.length,
    hasMore: typeof total === "number" ? offset + raw.length < total : raw.length === PAGE_SIZE,
  };
}

async function fetchComicsPage(
  query: string,
  offset: number,
  signal?: AbortSignal,
): Promise<CatalogPage> {
  const params = new URLSearchParams({
    subject: "Comics",
    limit: String(PAGE_SIZE),
    offset: String(offset),
    fields: "key,title,author_name,first_publish_year,cover_i,subject",
  });
  if (query.trim()) params.set("q", query.trim());

  const response = await fetch(`${OPEN_LIBRARY_API}/search.json?${params.toString()}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("Le catalogue BD ne répond pas pour le moment.");
  }

  const payload = (await response.json()) as OpenLibraryPayload;
  const docs = payload.docs ?? [];
  const items = docs
    .filter((doc): doc is OpenLibraryDoc & { key: string; title: string } => Boolean(doc.key && doc.title))
    .map((doc): CatalogItem => ({
      id: `openlibrary-${doc.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`,
      provider: "openlibrary",
      kind: "comics",
      title: doc.title,
      alternateTitle: doc.author_name?.slice(0, 2).join(", "),
      description: doc.subject?.slice(0, 4).join(" · ") || "Fiche bibliographique issue d’Open Library.",
      cover: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : undefined,
      year: doc.first_publish_year,
      sourceUrl: `${OPEN_LIBRARY_API}${doc.key}`,
    }));

  return {
    items,
    nextOffset: offset + docs.length,
    hasMore: typeof payload.numFound === "number" ? offset + docs.length < payload.numFound : docs.length === PAGE_SIZE,
  };
}

export function fetchCatalog(
  kind: CatalogKind,
  query: string,
  offset = 0,
  signal?: AbortSignal,
): Promise<CatalogPage> {
  if (kind === "comics") return fetchComicsPage(query, offset, signal);
  return fetchKitsuPage(kind, query, offset, signal);
}
