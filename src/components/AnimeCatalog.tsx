import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { CalendarDays, Clapperboard, Play, Search, Star } from "lucide-react";
import { fetchAnimeCatalog, type AnimeCatalogItem, type AnimeCatalogPage } from "../lib/anime";

export default function AnimeCatalog() {
  const [query, setQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<AnimeCatalogPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearchTerm(query.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError("");

    fetchAnimeCatalog(searchTerm, page, controller.signal)
      .then((data) => {
        if (active) setResult(data);
      })
      .catch((cause: unknown) => {
        if (!active || (cause instanceof DOMException && cause.name === "AbortError")) return;
        setError(cause instanceof Error ? cause.message : "Le catalogue Anime est indisponible.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [searchTerm, page, retryKey]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearchTerm(query.trim());
    setPage(1);
    setRetryKey((value) => value + 1);
  }

  return (
    <section className="page-section anime-page" aria-labelledby="anime-page-title">
      <div className="anime-hero">
        <div className="anime-hero-copy">
          <span className="section-kicker"><Clapperboard size={14} /> LE COIN ANIME</span>
          <h1 id="anime-page-title">Une nouvelle histoire <span>à l’écran.</span></h1>
          <p>Explore les fiches, les résumés, les saisons et les notes d’anime. Le catalogue utilise l’API publique Jikan et filtre les résultats en mode adapté.</p>
          <form className="anime-search" onSubmit={submitSearch} role="search">
            <Search size={19} aria-hidden="true" />
            <input
              aria-label="Rechercher un anime"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher un titre, une saga…"
            />
            <button type="submit">Rechercher</button>
          </form>
          <div className="anime-meta-line"><span><Play size={13} /> FICHES ANIME</span><span><Star size={13} /> NOTES ET GENRES</span><span>API JIKAN</span></div>
        </div>
        <div className="anime-hero-art" aria-hidden="true">
          <span className="anime-orbit anime-orbit-one" />
          <span className="anime-orbit anime-orbit-two" />
          <span className="anime-hero-symbol"><Play size={40} fill="currentColor" /></span>
          <span className="anime-hero-label">KOVA / ANIME</span>
        </div>
      </div>

      <div className="anime-catalog-heading">
        <div>
          <span className="section-kicker">{searchTerm ? "RÉSULTATS DE RECHERCHE" : "À DÉCOUVRIR"}</span>
          <h2>{searchTerm ? `Résultats pour « ${searchTerm} »` : "Les anime les mieux notés"}</h2>
        </div>
        <span className="anime-provider-pill">DONNÉES PUBLIQUES</span>
      </div>

      {loading && (
        <div className="anime-state" role="status"><span className="anime-spinner" />Chargement des anime…</div>
      )}

      {!loading && error && (
        <div className="anime-state anime-error" role="alert">
          <strong>Le catalogue ne répond pas</strong>
          <p>{error}</p>
          <button type="button" className="secondary-button" onClick={() => setRetryKey((value) => value + 1)}>Réessayer</button>
        </div>
      )}

      {!loading && !error && result && result.items.length > 0 && (
        <>
          <div className="anime-grid">
            {result.items.map((item) => <AnimeCard key={item.id} item={item} />)}
          </div>
          <div className="anime-pagination">
            <button type="button" className="secondary-button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1 || loading}>Précédent</button>
            <span>Page {result.page}</span>
            <button type="button" className="primary-button" onClick={() => setPage((value) => value + 1)} disabled={!result.hasNextPage || loading}>Suivant <span aria-hidden="true">→</span></button>
          </div>
        </>
      )}

      {!loading && !error && result?.items.length === 0 && (
        <div className="anime-state"><strong>Aucun anime trouvé</strong><p>Essaie un titre plus court ou vérifie l’orthographe.</p></div>
      )}

      <p className="anime-footnote">Les fiches, images et notes sont fournies par Jikan / MyAnimeList. Cette première étape est consacrée au catalogue et aux métadonnées, pas à la diffusion des épisodes.</p>
    </section>
  );
}

function AnimeCard({ item }: { item: AnimeCatalogItem }) {
  return (
    <article className="anime-card">
      <div className="anime-card-art">
        {item.image ? <img src={item.image} alt={`Affiche de ${item.title}`} loading="lazy" decoding="async" /> : <span className="anime-image-fallback"><Clapperboard size={28} /></span>}
        {item.score !== null && <span className="anime-score"><Star size={13} fill="currentColor" /> {item.score.toFixed(1)}</span>}
      </div>
      <div className="anime-card-copy">
        <h3 title={item.title}>{item.title}</h3>
        {item.titleEnglish && item.titleEnglish !== item.title && <p className="anime-english-title">{item.titleEnglish}</p>}
        <div className="anime-card-meta">
          {item.year && <span><CalendarDays size={13} /> {item.year}</span>}
          <span>{item.episodes ? `${item.episodes} épisodes` : "Épisodes non précisés"}</span>
        </div>
        <p className="anime-synopsis">{item.synopsis || "Aucun résumé n’est disponible pour le moment."}</p>
        {item.genres.length > 0 && <div className="anime-genres">{item.genres.slice(0, 3).map((genre) => <span key={genre}>{genre}</span>)}</div>}
        <span className="anime-status">{item.status}</span>
      </div>
    </article>
  );
}
