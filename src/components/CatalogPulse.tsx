import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, CalendarDays, Clock3, Flame, RefreshCw, Sparkles } from "lucide-react";
import { fetchCatalog } from "../lib/catalog";
import "./CatalogPulse.css";
import type { CatalogItem } from "../lib/catalog";

type MangaDexRelation = {
  id: string;
  type: string;
  attributes?: { fileName?: string; name?: string };
};

type MangaDexRelease = {
  id: string;
  attributes?: {
    chapter?: string | null;
    title?: string | null;
    publishAt?: string;
    translatedLanguage?: string;
    externalUrl?: string | null;
    pages?: number;
    isUnavailable?: boolean;
  };
  relationships?: MangaDexRelation[];
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
  relationships?: MangaDexRelation[];
};

export type ChapterUpdate = {
  id: string;
  title: string;
  publishAt: string;
  language: string;
  scanlationGroup?: string;
  manga: CatalogItem;
};

async function getJson<T>(path: string, signal: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api/mangadex" + path, {
      signal,
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error("Connexion à MangaDex impossible. Vérifie Internet puis réessaie.");
  }
  if (response.status === 429) throw new Error("MangaDex reçoit trop de requêtes. Réessaie dans un instant.");
  if (!response.ok) throw new Error("MangaDex a répondu avec le code " + response.status + ".");
  return response.json() as Promise<T>;
}

function localized(values?: Record<string, string>): string {
  if (!values) return "";
  return values.fr || values.en || values["ja-ro"] || values["ko-ro"] || Object.values(values)[0] || "";
}

function mapManga(manga: MangaDexManga): CatalogItem | null {
  const a = manga.attributes;
  if (!a || a.contentRating !== "safe" || !manga.id) return null;
  if (a.originalLanguage !== "ja" && a.originalLanguage !== "ko") return null;
  const coverFile = manga.relationships?.find((r) => r.type === "cover_art")?.attributes?.fileName;
  const status: Record<string, string> = {
    ongoing: "En cours",
    completed: "Terminé",
    hiatus: "En pause",
    cancelled: "Annulé",
  };
  return {
    id: "mangadex-" + manga.id,
    provider: "mangadex",
    kind: a.originalLanguage === "ko" ? "manhwa" : "manga",
    title: localized(a.title) || "Manga sans titre",
    alternateTitle: (a.altTitles ?? []).map(localized).find(Boolean),
    description: localized(a.description) || "Aucun résumé n'est disponible pour le moment.",
    cover: coverFile ? "/api/mangadex-cover/" + manga.id + "/" + coverFile + ".256.jpg" : undefined,
    year: a.year ?? undefined,
    status: status[a.status ?? ""] ?? a.status ?? "Non renseigné",
    ageRating: a.contentRating,
    originalLanguage: a.originalLanguage,
    sourceUrl: "https://mangadex.org/title/" + manga.id,
  };
}

function chapterText(chapter: MangaDexRelease): string {
  const number = chapter.attributes?.chapter;
  const title = chapter.attributes?.title?.trim();
  return [number ? "Chapitre " + number : "Chapitre spécial", title].filter(Boolean).join(" · ");
}

/** Fetch real chapter publication records from MangaDex, then join them to safe manga metadata. */
export async function fetchChapterUpdates(
  mode: "recent" | "scheduled",
  signal: AbortSignal,
): Promise<ChapterUpdate[]> {
  const params = new URLSearchParams();
  params.set("limit", "100");
  params.set("includeExternalUrl", "0");
  params.set("includeFuturePublishAt", mode === "scheduled" ? "1" : "0");
  params.set("order[publishAt]", mode === "scheduled" ? "asc" : "desc");
  params.append("translatedLanguage[]", "fr");
  params.append("translatedLanguage[]", "en");
  params.append("includes[]", "manga");
  params.append("includes[]", "scanlation_group");

  const response = await getJson<{ data?: MangaDexRelease[] }>(
    "/chapter?" + params.toString(),
    signal,
  );
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const horizon = now + 30 * 24 * 60 * 60 * 1000;

  const chapters = (response.data ?? []).filter((chapter) => {
    const a = chapter.attributes;
    if (!a || !a.publishAt || a.externalUrl || a.isUnavailable || (a.pages ?? 0) < 1) return false;
    if (a.translatedLanguage !== "fr" && a.translatedLanguage !== "en") return false;
    const time = Date.parse(a.publishAt);
    if (!Number.isFinite(time)) return false;
    return mode === "recent" ? time <= now && time >= weekAgo : time > now && time <= horizon;
  });

  const mangaIds = [...new Set(chapters.flatMap((chapter) => {
    const relation = chapter.relationships?.find((r) => r.type === "manga");
    return relation ? [relation.id] : [];
  }))];
  if (!mangaIds.length) return [];

  const mangaParams = new URLSearchParams();
  mangaParams.set("limit", String(Math.min(100, mangaIds.length)));
  mangaParams.append("contentRating[]", "safe");
  mangaParams.append("originalLanguage[]", "ja");
  mangaParams.append("originalLanguage[]", "ko");
  mangaParams.append("includes[]", "cover_art");
  mangaIds.slice(0, 100).forEach((id) => mangaParams.append("ids[]", id));

  const mangaResponse = await getJson<{ data?: MangaDexManga[] }>(
    "/manga?" + mangaParams.toString(),
    signal,
  );
  const mangaById = new Map<string, CatalogItem>();
  for (const record of mangaResponse.data ?? []) {
    const item = mapManga(record);
    if (item) mangaById.set(record.id, item);
  }

  return chapters.flatMap((chapter) => {
    const mangaId = chapter.relationships?.find((r) => r.type === "manga")?.id;
    const manga = mangaId ? mangaById.get(mangaId) : undefined;
    if (!manga) return [];
    const group = chapter.relationships?.find((r) => r.type === "scanlation_group")?.attributes?.name;
    return [{
      id: chapter.id,
      title: chapterText(chapter),
      publishAt: chapter.attributes!.publishAt!,
      language: chapter.attributes!.translatedLanguage ?? "en",
      scanlationGroup: group,
      manga,
    }];
  }).sort((a, b) => mode === "scheduled"
    ? Date.parse(a.publishAt) - Date.parse(b.publishAt)
    : Date.parse(b.publishAt) - Date.parse(a.publishAt));
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDay(value: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(value));
}

function Cover({ item }: { item: CatalogItem }) {
  const [failed, setFailed] = useState(false);
  if (!item.cover || failed) {
    return <span className="cover-placeholder"><BookOpen size={23} /><span>KOVA</span></span>;
  }
  return <img className="media-cover" src={item.cover} alt={"Couverture de " + item.title} loading="lazy" onError={() => setFailed(true)} />;
}

function MiniCard({
  item, saved, onOpen, onSave,
}: {
  item: CatalogItem;
  saved: boolean;
  onOpen: (item: CatalogItem) => void;
  onSave: (item: CatalogItem) => void;
}) {
  return (
    <article className="media-card">
      <button className="media-open" onClick={() => onOpen(item)} aria-label={"Ouvrir la fiche de " + item.title}>
        <span className="cover-wrap"><Cover item={item} /><span className="cover-gradient" /><span className="media-kind">{item.kind.toUpperCase()}</span></span>
        <span className="media-card-copy">
          <strong className="media-title">{item.title}</strong>
          <span className="media-meta">{item.year ?? "Année inconnue"}{item.status ? " · " + item.status : ""}</span>
          <span className="media-source">Classement public MangaDex</span>
        </span>
      </button>
      <button className={saved ? "save-chip is-saved" : "save-chip"} onClick={() => onSave(item)} aria-label={saved ? "Déjà dans la bibliothèque" : "Ajouter à la bibliothèque"} title={saved ? "Dans la bibliothèque" : "Ajouter à la bibliothèque"}>
        {saved ? "✓" : "♡"}
      </button>
    </article>
  );
}

export default function CatalogPulse({
  savedIds, onOpen, onSave,
}: {
  savedIds: Set<string>;
  onOpen: (item: CatalogItem) => void;
  onSave: (item: CatalogItem) => void;
}) {
  const [popularManga, setPopularManga] = useState<CatalogItem[]>([]);
  const [popularManhwa, setPopularManhwa] = useState<CatalogItem[]>([]);
  const [recent, setRecent] = useState<ChapterUpdate[]>([]);
  const [scheduled, setScheduled] = useState<ChapterUpdate[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    setLoading(true);
    setErrors({});
    void Promise.allSettled([
      fetchCatalog("manga", "", 0, controller.signal),
      fetchCatalog("manhwa", "", 0, controller.signal),
      fetchChapterUpdates("recent", controller.signal),
      fetchChapterUpdates("scheduled", controller.signal),
    ]).then((results) => {
      if (!alive) return;
      const nextErrors: Record<string, string> = {};
      if (results[0].status === "fulfilled") setPopularManga(results[0].value.items.slice(0, 6));
      else nextErrors.manga = results[0].reason instanceof Error ? results[0].reason.message : "Classement Manga indisponible.";
      if (results[1].status === "fulfilled") setPopularManhwa(results[1].value.items.slice(0, 6));
      else nextErrors.manhwa = results[1].reason instanceof Error ? results[1].reason.message : "Classement Manhwa indisponible.";
      if (results[2].status === "fulfilled") setRecent(results[2].value.slice(0, 12));
      else nextErrors.recent = results[2].reason instanceof Error ? results[2].reason.message : "Les nouveaux chapitres sont indisponibles.";
      if (results[3].status === "fulfilled") setScheduled(results[3].value.slice(0, 20));
      else nextErrors.scheduled = results[3].reason instanceof Error ? results[3].reason.message : "Le calendrier est indisponible.";
      setErrors(nextErrors);
    }).finally(() => {
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [refresh]);

  const releaseGroups = new Map<string, ChapterUpdate[]>();
  recent.forEach((release) => {
    const key = new Date(release.publishAt).toISOString().slice(0, 10);
    releaseGroups.set(key, [...(releaseGroups.get(key) ?? []), release]);
  });

  return (
    <section className="page-section catalog-pulse" aria-label="Classements et calendrier MangaDex">
      <div className="section-heading pulse-main-heading">
        <div><span className="section-kicker"><Sparkles size={13} /> DONNÉES EN DIRECT</span><h2>Le catalogue bouge<span className="purple-period">.</span></h2><p>Classements, chapitres publiés et dates annoncées, depuis MangaDex.</p></div>
        <button className="text-link" onClick={() => setRefresh((v) => v + 1)} disabled={loading}><RefreshCw size={15} /> Actualiser</button>
      </div>

      <div className="pulse-disclaimer">
        <Flame size={16} />
        <span>MangaDex expose le nombre d’abonnés, mais pas un compteur public de lectures par semaine. Les deux classements ci-dessous utilisent donc le classement public des séries les plus suivies, sans inventer de vues hebdomadaires.</span>
      </div>

      <div className="pulse-rank-grid">
        <section className="pulse-panel">
          <div className="pulse-panel-heading"><div><span className="section-kicker">CLASSEMENT MANGADEX</span><h3>Mangas les plus suivis</h3></div><span className="pulse-live-dot">EN DIRECT</span></div>
          {loading && popularManga.length === 0 ? <div className="pulse-empty">Chargement du classement réel…</div> : errors.manga ? <div className="pulse-empty">{errors.manga}</div> : <div className="media-grid pulse-media-grid">{popularManga.map((item) => <MiniCard key={item.id} item={item} saved={savedIds.has(item.id)} onOpen={onOpen} onSave={onSave} />)}</div>}
        </section>
        <section className="pulse-panel">
          <div className="pulse-panel-heading"><div><span className="section-kicker">CLASSEMENT MANGADEX</span><h3>Manhwas les plus suivis</h3></div><span className="pulse-live-dot">EN DIRECT</span></div>
          {loading && popularManhwa.length === 0 ? <div className="pulse-empty">Chargement du classement réel…</div> : errors.manhwa ? <div className="pulse-empty">{errors.manhwa}</div> : <div className="media-grid pulse-media-grid">{popularManhwa.map((item) => <MiniCard key={item.id} item={item} saved={savedIds.has(item.id)} onOpen={onOpen} onSave={onSave} />)}</div>}
        </section>
      </div>

      <section className="pulse-panel pulse-wide">
        <div className="pulse-panel-heading"><div><span className="section-kicker"><Clock3 size={13} /> 7 DERNIERS JOURS</span><h3>Nouveaux chapitres</h3><p>Chapitres réellement publiés dans les sept derniers jours en français ou en anglais.</p></div><span className="pulse-count">{recent.length} affichés</span></div>
        {loading && recent.length === 0 ? <div className="pulse-empty">Recherche des chapitres récents…</div> : errors.recent ? <div className="pulse-empty">{errors.recent}</div> : recent.length === 0 ? <div className="pulse-empty">Aucun nouveau chapitre correspondant n’a été trouvé sur MangaDex cette semaine.</div> : <div className="release-list">{recent.map((release) => <button key={release.id} className="release-row" onClick={() => onOpen(release.manga)}><span className="release-cover"><Cover item={release.manga} /></span><span className="release-copy"><strong>{release.manga.title}</strong><span>{release.title}</span><small>{release.scanlationGroup ? "Traduction : " + release.scanlationGroup + " · " : ""}{release.language.toUpperCase()}</small></span><span className="release-date">{formatDateTime(release.publishAt)}</span><ArrowRight className="release-arrow" size={16} /></button>)}</div>}
      </section>

      <section className="pulse-panel pulse-wide">
        <div className="pulse-panel-heading"><div><span className="section-kicker"><CalendarDays size={13} /> CALENDRIER RÉEL</span><h3>Prochaines sorties annoncées</h3><p>Dates futures déjà déclarées dans MangaDex, jusqu’aux 30 prochains jours.</p></div><span className="pulse-count">{scheduled.length} dates</span></div>
        {loading && scheduled.length === 0 ? <div className="pulse-empty">Vérification des dates annoncées…</div> : errors.scheduled ? <div className="pulse-empty">{errors.scheduled}</div> : scheduled.length === 0 ? <div className="pulse-empty"><CalendarDays size={22} /><strong>Aucune date future confirmée par MangaDex pour le moment.</strong><span>Les dates n’apparaissent ici que lorsqu’une publication future est réellement renseignée par la source. KOVA n’invente pas les jours de sortie.</span></div> : <div className="calendar-list">{[...new Set(scheduled.map((entry) => new Date(entry.publishAt).toISOString().slice(0, 10)))].map((day) => <div className="calendar-day" key={day}><h4>{formatDay(day + "T12:00:00")}</h4>{scheduled.filter((entry) => new Date(entry.publishAt).toISOString().slice(0, 10) === day).map((release) => <button key={release.id} className="calendar-event" onClick={() => onOpen(release.manga)}><span className="calendar-time">{new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(release.publishAt))}</span><span className="calendar-event-copy"><strong>{release.manga.title}</strong><small>{release.title}{release.scanlationGroup ? " · " + release.scanlationGroup : ""}</small></span><ArrowRight size={15} /></button>)}</div>)}</div>}
      </section>

      {Object.keys(errors).length > 0 && <p className="catalog-note"><RefreshCw size={14} /> Certaines données n’ont pas répondu. Utilise « Actualiser » pour refaire la requête. Les sections disponibles restent affichées.</p>}
      <p className="catalog-note"><BookOpen size={15} /> Source : MangaDex API. Les groupes de traduction sont crédités ; les dates affichées viennent de l’API et ne garantissent pas qu’un chapitre soit lisible dans toutes les régions.</p>
    </section>
  );
}
