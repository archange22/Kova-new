import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, CalendarDays, RefreshCw, Sparkles } from "lucide-react";
import { fetchCatalog } from "../lib/catalog";
import "./CatalogPulse.css";
import type { CatalogItem } from "../lib/catalog";

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
        <span className="cover-wrap">
          {item.cover ? <img className="media-cover" src={item.cover} alt="" loading="lazy" decoding="async" /> : <span className="cover-placeholder"><BookOpen size={23} /><span>KOVA</span></span>}
          <span className="cover-gradient" />
          <span className="media-kind">{item.kind.toUpperCase()}</span>
        </span>
        <span className="media-card-copy">
          <strong className="media-title">{item.title}</strong>
          <span className="media-meta">{item.year ?? "Année inconnue"} · {item.status ?? "Démo"}</span>
          <span className="media-source">MangaDex · catalogue public</span>
        </span>
      </button>
      <button className={saved ? "save-chip is-saved" : "save-chip"} onClick={() => onSave(item)} aria-label={saved ? "Déjà dans la bibliothèque" : "Ajouter à la bibliothèque"}>
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
  const [manga, setManga] = useState<CatalogItem[]>([]);
  const [manhwa, setManhwa] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setLoading(true);
    void Promise.all([
      fetchCatalog("manga", "", 0, controller.signal),
      fetchCatalog("manhwa", "", 0, controller.signal),
    ]).then(([mangaPage, manhwaPage]) => {
      if (!alive) return;
      setManga(mangaPage.items.slice(0, 6));
      setManhwa(manhwaPage.items.slice(0, 6));
    }).catch(() => {
      if (!alive) return;
      setManga([]);
      setManhwa([]);
    }).finally(() => {
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [refresh]);

  return (
    <section className="page-section catalog-pulse" aria-label="Sélection de mangas et manhwas MangaDex">
      <div className="section-heading pulse-main-heading">
        <div>
          <span className="section-kicker"><Sparkles size={13} /> DÉCOUVERTES MANGADEX</span>
          <h2>Explore les univers KOVA<span className="purple-period">.</span></h2>
          <p>Des fiches issues du catalogue MangaDex, regroupées pour découvrir des mangas et des manhwas.</p>
        </div>
        <button className="text-link" onClick={() => setRefresh((value) => value + 1)} disabled={loading}><RefreshCw size={15} /> Réinitialiser</button>
      </div>

      <div className="pulse-rank-grid">
        <section className="pulse-panel">
          <div className="pulse-panel-heading"><div><span className="section-kicker">CATALOGUE PUBLIC</span><h3>Mangas</h3></div><span className="pulse-live-dot">MANGADEX</span></div>
          {loading ? <div className="pulse-empty">Chargement du catalogue MangaDex…</div> : <div className="media-grid pulse-media-grid">{manga.map((item) => <MiniCard key={item.id} item={item} saved={savedIds.has(item.id)} onOpen={onOpen} onSave={onSave} />)}</div>}
        </section>
        <section className="pulse-panel">
          <div className="pulse-panel-heading"><div><span className="section-kicker">CATALOGUE PUBLIC</span><h3>Manhwas</h3></div><span className="pulse-live-dot">MANGADEX</span></div>
          {loading ? <div className="pulse-empty">Chargement du catalogue MangaDex…</div> : <div className="media-grid pulse-media-grid">{manhwa.map((item) => <MiniCard key={item.id} item={item} saved={savedIds.has(item.id)} onOpen={onOpen} onSave={onSave} />)}</div>}
        </section>
      </div>

      <section className="pulse-panel pulse-wide">
        <div className="pulse-panel-heading"><div><span className="section-kicker"><CalendarDays size={13} /> À VENIR</span><h3>Calendrier de démonstration</h3><p>Le calendrier reste une interface préparatoire : les dates de sorties ne sont pas encore connectées à une source.</p></div><span className="pulse-count">MODE UI</span></div>
        <div className="pulse-empty"><CalendarDays size={22} /><strong>Aucune date réelle chargée.</strong><span>Les dates de sorties ne sont pas encore chargées. Le catalogue MangaDex, lui, est déjà connecté.</span><ArrowRight size={16} /></div>
      </section>
      <p className="catalog-note"><BookOpen size={15} /> Les fiches proviennent de MangaDex. Firebase gère les comptes, la bibliothèque et le support.</p>
    </section>
  );
}
