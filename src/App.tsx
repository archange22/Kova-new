import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import type { User } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import {
  ArrowDownRight,
  ArrowRight,
  BookOpen,
  Check,
  Compass,
  ExternalLink,
  Heart,
  LibraryBig,
  LogIn,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { auth, db } from "./lib/firebase";
import { fetchCatalog } from "./lib/catalog";
import type { CatalogItem, CatalogKind, CatalogPage } from "./lib/catalog";

type Profile = {
  username?: string;
  bio?: string;
  photoURL?: string;
  bannerURL?: string;
  email?: string;
};

type LibraryStatus = "to_read" | "reading" | "completed" | "paused" | "dropped";
type LibraryEntry = CatalogItem & { libraryStatus: LibraryStatus };

type Screen = "home" | "explore" | "library";

const kindOptions: Array<{ value: CatalogKind; label: string }> = [
  { value: "all", label: "Tout" },
  { value: "manga", label: "Manga" },
  { value: "manhwa", label: "Manhwa" },
  { value: "comics", label: "BD & comics" },
];

const libraryStatusOptions: Array<{ value: LibraryStatus; label: string }> = [
  { value: "to_read", label: "À lire" },
  { value: "reading", label: "En cours" },
  { value: "completed", label: "Terminé" },
  { value: "paused", label: "En pause" },
  { value: "dropped", label: "Abandonné" },
];

function friendlyError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  const messages: Record<string, string> = {
    "auth/invalid-credential": "Adresse e-mail ou mot de passe incorrect.",
    "auth/email-already-in-use": "Cette adresse e-mail possède déjà un compte.",
    "auth/weak-password": "Choisis un mot de passe d'au moins 6 caractères.",
    "auth/invalid-email": "Cette adresse e-mail n'est pas valide.",
    "auth/too-many-requests": "Trop de tentatives. Réessaie un peu plus tard.",
    "auth/network-request-failed": "Connexion impossible. Vérifie ton réseau.",
    "permission-denied": "Firebase a refusé l'accès. Vérifie les règles Firestore publiées.",
    "unavailable": "Firebase est momentanément indisponible. Réessaie plus tard.",
  };
  return messages[code] ?? "Une erreur est survenue. Vérifie la connexion puis réessaie.";
}

function getLibraryDocId(item: CatalogItem) {
  return item.id.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 140);
}

function validHttpUrl(value: string) {
  if (!value.trim()) return "";
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function MediaCard({
  item,
  saved,
  onOpen,
  onSave,
}: {
  item: CatalogItem;
  saved: boolean;
  onOpen: () => void;
  onSave: () => void;
}) {
  const [coverFailed, setCoverFailed] = useState(false);
  return (
    <article className="media-card">
      <button className="media-open" onClick={onOpen} aria-label={`Ouvrir la fiche de ${item.title}`}>
        <span className="cover-wrap">
          {item.cover && !coverFailed ? (
            <img
              className="media-cover"
              src={item.cover}
              alt={`Couverture de ${item.title}`}
              loading="lazy"
              onError={() => setCoverFailed(true)}
            />
          ) : (
            <span className="cover-placeholder"><BookOpen size={28} /><span>KOVA</span></span>
          )}
          <span className="cover-gradient" />
          <span className="media-kind">{item.kind === "comics" ? "BD / COMICS" : item.kind.toUpperCase()}</span>
        </span>
        <span className="media-card-copy">
          <strong className="media-title">{item.title}</strong>
          <span className="media-meta">{item.year ?? "Année inconnue"}{item.status ? ` · ${item.status === "finished" ? "Terminé" : item.status === "current" ? "En cours" : item.status}` : ""}</span>
          <span className="media-source">{"Original KOVA · lecture intégrée"}</span>
        </span>
      </button>
      <button
        className={saved ? "save-chip is-saved" : "save-chip"}
        onClick={onSave}
        aria-label={saved ? "Déjà dans la bibliothèque" : "Ajouter à la bibliothèque"}
        title={saved ? "Dans votre bibliothèque" : "Ajouter à votre bibliothèque"}
      >
        {saved ? <Check size={16} /> : <Heart size={16} />}
      </button>
    </article>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile>({});
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [screen, setScreen] = useState<Screen>("home");
  const [selectedKind, setSelectedKind] = useState<CatalogKind>("all");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);\n  const [readerOpen, setReaderOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signup" | "login">("signup");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profileDraft, setProfileDraft] = useState({ username: "", bio: "", photoURL: "", bannerURL: "" });
  const [profileBusy, setProfileBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let alive = true;
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!alive) return;
      setLoadingAuth(true);
      setUser(currentUser);
      setNotice("");
      if (!currentUser) {
        setProfile({});
        setLibrary([]);
        setLoadingAuth(false);
        return;
      }

      try {
        const profileRef = doc(db, "users", currentUser.uid);
        const snapshot = await getDoc(profileRef);
        let loadedProfile: Profile;
        if (snapshot.exists()) {
          loadedProfile = snapshot.data() as Profile;
        } else {
          loadedProfile = {
            username: currentUser.displayName || currentUser.email?.split("@")[0] || "Lecteur",
            email: currentUser.email || "",
            bio: "",
            photoURL: currentUser.photoURL || "",
            bannerURL: "",
          };
          await setDoc(profileRef, {
            uid: currentUser.uid,
            ...loadedProfile,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        if (!alive) return;
        setProfile(loadedProfile);

        const librarySnapshot = await getDocs(collection(db, "users", currentUser.uid, "library"));
        const entries = librarySnapshot.docs.map((entry) => entry.data() as LibraryEntry);
        if (alive) setLibrary(entries.sort((a, b) => a.title.localeCompare(b.title)));
      } catch (error) {
        if (alive) {
          setProfile({});
          setLibrary([]);
          setNotice(friendlyError(error));
        }
      } finally {
        if (alive) setLoadingAuth(false);
      }
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    const timeout = window.setTimeout(async () => {
      setCatalogLoading(true);
      setCatalogError("");
      try {
        const page: CatalogPage = await fetchCatalog(selectedKind, query, 0, controller.signal);
        if (!alive) return;
        setItems(page.items);
        setOffset(page.nextOffset);
        setHasMore(page.hasMore);
      } catch (error) {
        if (!alive || (error instanceof DOMException && error.name === "AbortError")) return;
        setItems([]);
        setHasMore(false);
        setCatalogError(error instanceof Error ? error.message : "Le catalogue est indisponible.");
      } finally {
        if (alive) setCatalogLoading(false);
      }
    }, query.trim() ? 300 : 0);

    return () => {
      alive = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [selectedKind, query, refreshIndex]);

  function goTo(nextScreen: Screen) {
    setScreen(nextScreen);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function chooseKind(kind: CatalogKind) {
    setSelectedKind(kind);
    setScreen("explore");
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setBusy(true);
    try {
      if (authMode === "signup") {
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        const chosenName = username.trim() || email.trim().split("@")[0];
        await updateProfile(credential.user, { displayName: chosenName });
        const newProfile = { username: chosenName, email: credential.user.email || email.trim(), bio: "", photoURL: "", bannerURL: "" };
        await setDoc(doc(db, "users", credential.user.uid), {
          uid: credential.user.uid,
          ...newProfile,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setProfile(newProfile);
        setNotice("Compte créé. Bienvenue dans KOVA !");
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        setNotice("Connexion réussie.");
      }
      setPassword("");
      setAuthOpen(false);
    } catch (error) {
      setNotice(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    try {
      await signOut(auth);
      setProfileOpen(false);
      setNotice("Vous êtes déconnecté.");
    } catch (error) {
      setNotice(friendlyError(error));
    }
  }

  async function saveToLibrary(item: CatalogItem) {
    if (!user) {
      setAuthMode("signup");
      setAuthOpen(true);
      setNotice("Connecte-toi pour synchroniser ta bibliothèque.");
      return;
    }
    const docId = getLibraryDocId(item);
    const existing = library.find((entry) => getLibraryDocId(entry) === docId);
    const status = existing?.libraryStatus ?? "to_read";
    const saved: LibraryEntry = { ...item, libraryStatus: status };
    try {
      const safeEntry = Object.fromEntries(Object.entries(saved).filter(([, value]) => value !== undefined));
      await setDoc(doc(db, "users", user.uid, "library", docId), {
        ...safeEntry,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setLibrary((current) => [saved, ...current.filter((entry) => getLibraryDocId(entry) !== docId)]);
      setNotice(existing ? "Cette série est déjà dans ta bibliothèque." : "Ajouté à ta bibliothèque !");
    } catch (error) {
      setNotice(friendlyError(error));
    }
  }

  async function changeLibraryStatus(entry: LibraryEntry, libraryStatus: LibraryStatus) {
    if (!user) return;
    try {
      await updateDoc(doc(db, "users", user.uid, "library", getLibraryDocId(entry)), {
        libraryStatus,
        updatedAt: serverTimestamp(),
      });
      setLibrary((current) => current.map((item) => item.id === entry.id ? { ...item, libraryStatus } : item));
    } catch (error) {
      setNotice(friendlyError(error));
    }
  }

  async function removeFromLibrary(entry: LibraryEntry) {
    if (!user) return;
    try {
      await deleteDoc(doc(db, "users", user.uid, "library", getLibraryDocId(entry)));
      setLibrary((current) => current.filter((item) => item.id !== entry.id));
      setNotice("Série retirée de ta bibliothèque.");
    } catch (error) {
      setNotice(friendlyError(error));
    }
  }

  function openProfile() {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    setProfileDraft({
      username: profile.username || user.displayName || "",
      bio: profile.bio || "",
      photoURL: profile.photoURL || user.photoURL || "",
      bannerURL: profile.bannerURL || "",
    });
    setProfileOpen(true);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const photoURL = validHttpUrl(profileDraft.photoURL);
    const bannerURL = validHttpUrl(profileDraft.bannerURL);
    if ((profileDraft.photoURL && !photoURL) || (profileDraft.bannerURL && !bannerURL)) {
      setNotice("Les photos doivent utiliser une adresse HTTP ou HTTPS valide.");
      return;
    }

    setProfileBusy(true);
    try {
      const nextProfile: Profile = {
        username: profileDraft.username.trim() || user.email?.split("@")[0] || "Lecteur",
        bio: profileDraft.bio.trim().slice(0, 180),
        photoURL,
        bannerURL,
        email: user.email || "",
      };
      await updateProfile(user, { displayName: nextProfile.username, photoURL: photoURL || null });
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        ...nextProfile,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setProfile(nextProfile);
      setProfileOpen(false);
      setNotice("Profil enregistré !");
    } catch (error) {
      setNotice(friendlyError(error));
    } finally {
      setProfileBusy(false);
    }
  }

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchCatalog(selectedKind, query, offset);
      setItems((current) => {
        const ids = new Set(current.map((item) => item.id));
        return [...current, ...page.items.filter((item) => !ids.has(item.id))];
      });
      setOffset(page.nextOffset);
      setHasMore(page.hasMore);
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : "Impossible de charger la suite.");
    } finally {
      setLoadingMore(false);
    }
  }

  const displayName = profile.username || user?.displayName || user?.email?.split("@")[0] || "Lecteur";
  const savedIds = new Set(library.map((entry) => entry.id));
  const recentItems = items.slice(0, 8);
  const heroItems = items.slice(0, 3);

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="mobile-menu icon-button" aria-label="Ouvrir le menu" onClick={() => setMenuOpen((open) => !open)}>
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <button className="brand" onClick={() => goTo("home")} aria-label="KOVA accueil">
          <span className="brand-mark">K</span><span>KOVA</span><span className="brand-dot">.</span>
        </button>
        <nav className={menuOpen ? "nav-links nav-open" : "nav-links"}>
          <button className={screen === "home" ? "nav-link active" : "nav-link"} onClick={() => goTo("home")}><Compass size={16} /> Accueil</button>
          <button className={screen === "explore" ? "nav-link active" : "nav-link"} onClick={() => goTo("explore")}><Search size={16} /> Explorer</button>
          <button className={screen === "library" ? "nav-link active" : "nav-link"} onClick={() => goTo("library")}><LibraryBig size={16} /> Bibliothèque</button>
        </nav>
        <div className="top-actions">
          <button className="icon-button search-button" aria-label="Lancer une recherche" onClick={() => { goTo("explore"); document.getElementById("catalog-search")?.focus(); }}><Search size={19} /></button>
          {user ? (
            <button className="profile-chip" onClick={openProfile}>
              {profile.photoURL ? <img className="avatar" src={profile.photoURL} alt="" /> : <span className="avatar">{displayName.slice(0, 1).toUpperCase()}</span>}
              <span className="profile-name">{displayName}</span>
            </button>
          ) : <button className="login-link" onClick={() => { setAuthMode("signup"); setAuthOpen(true); }}><LogIn size={16} /> Connexion</button>}
          <button className="icon-button settings-button" aria-label="Ouvrir les réglages" onClick={() => setSettingsOpen(true)}><Settings size={18} /></button>
        </div>
      </header>

      {menuOpen && <button className="menu-backdrop" aria-label="Fermer le menu" onClick={() => setMenuOpen(false)} />}

      <main>
        {screen === "home" && (
          <>
            <section className="hero" id="accueil">
              <div className="hero-copy">
                <span className="eyebrow"><Sparkles size={14} /> TON UNIVERS, TON RYTHME</span>
                <h1>Chaque page ouvre<br />un <span>nouveau monde.</span></h1>
                <p>Découvre mangas, manhwas et BD, puis garde toutes tes lectures au même endroit.</p>
                <div className="hero-actions">
                  <button className="primary-button" onClick={() => goTo("explore")}><Compass size={17} /> Explorer le catalogue <ArrowRight size={17} /></button>
                  <button className="quiet-button" onClick={() => goTo("library")}><LibraryBig size={17} /> Ma bibliothèque</button>
                </div>
                <form className="hero-search" onSubmit={(event) => { event.preventDefault(); goTo("explore"); }}>
                  <Search size={18} aria-hidden="true" />
                  <input
                    aria-label="Rechercher un manga, manhwa ou une BD"
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Un titre en tête ? Recherche ici…"
                  />
                  <button type="submit" aria-label="Rechercher"><ArrowRight size={18} /></button>
                </form>
                <div className="hero-tags"><span>MANGA</span><span>MANHWA</span><span>BD & COMICS</span></div>
                <div className="hero-trust"><ShieldCheck size={15} /> Catalogue informatif, liens vers les sources</div>
              </div>
              <div className="hero-art" aria-label="Aperçu du catalogue KOVA">
                <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
                <div className="art-center"><span>K</span><small>READ YOUR NEXT WORLD</small></div>
                {heroItems.map((item, index) => (
                  <button className={`floating-cover floating-cover-${index + 1}`} key={item.id} onClick={() => setSelectedItem(item)} aria-label={`Découvrir ${item.title}`}>
                    {item.cover ? <img src={item.cover} alt="" /> : <span><BookOpen size={24} /></span>}
                  </button>
                ))}
                <span className="art-orbit-label">MANGA · MANHWA · BD</span>
              </div>
            </section>

            <section className="quick-explore page-section">
              <div className="section-heading">
                <div><span className="section-kicker">TROUVE TON PROCHAIN UNIVERS</span><h2>Tu lis quoi aujourd’hui ?</h2></div>
                <button className="text-link" onClick={() => goTo("explore")}>Tout explorer <ArrowRight size={16} /></button>
              </div>
              <div className="category-grid">
                <button className="category-card manga-card" onClick={() => chooseKind("manga")}><span className="category-symbol">漫</span><span className="category-copy"><strong>Mangas</strong><small>Histoires venues du Japon</small></span><ArrowDownRight className="category-arrow" size={22} /></button>
                <button className="category-card manhwa-card" onClick={() => chooseKind("manhwa")}><span className="category-symbol">화</span><span className="category-copy"><strong>Manhwas</strong><small>Épisodes coréens en couleur</small></span><ArrowDownRight className="category-arrow" size={22} /></button>
                <button className="category-card comics-card" onClick={() => chooseKind("comics")}><span className="category-symbol">BD</span><span className="category-copy"><strong>BD & comics</strong><small>Albums et romans graphiques</small></span><ArrowDownRight className="category-arrow" size={22} /></button>
              </div>
            </section>

            <section className="page-section featured-section">
              <div className="section-heading">
                <div><span className="section-kicker">À DÉCOUVRIR</span><h2>Le catalogue du moment</h2></div>
                <button className="text-link" onClick={() => goTo("explore")}>Voir le catalogue <ArrowRight size={16} /></button>
              </div>
              {catalogLoading ? <LoadingState text="On prépare les découvertes…" /> : catalogError ? <ErrorState message={catalogError} onRetry={() => setRefreshIndex((value) => value + 1)} /> : (
                <div className="media-grid">
                  {recentItems.slice(0, 8).map((item) => <MediaCard key={item.id} item={item} saved={savedIds.has(item.id)} onOpen={() => setSelectedItem(item)} onSave={() => void saveToLibrary(item)} />)}
                </div>
              )}
              {!catalogLoading && !catalogError && items.length === 0 && <EmptyState title="Catalogue vide pour l’instant" text="Change le filtre ou lance une recherche pour trouver un titre." />}
            </section>
          </>
        )}

        {screen === "explore" && (
          <section className="page-section explore-page">
            <div className="explore-heading">
              <span className="section-kicker">LE GRAND CATALOGUE</span>
              <h1>Ton prochain coup de cœur<br /><span>est peut-être ici.</span></h1>
              <p>Recherche des fiches de manga, manhwa et BD réunies dans une seule interface.</p>
            </div>
            <div className="catalog-toolbar">
              <label className="search-field" htmlFor="catalog-search"><Search size={19} /><input id="catalog-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Titre, univers, mot-clé…" /><kbd>⌕</kbd></label>
              <div className="filter-tabs" role="group" aria-label="Filtrer le catalogue">
                {kindOptions.map((option) => <button key={option.value} className={selectedKind === option.value ? "filter-tab selected" : "filter-tab"} onClick={() => setSelectedKind(option.value)}>{option.label}</button>)}
              </div>
            </div>
            <div className="catalog-results-heading">
              <div><h2>{selectedKind === "all" ? "Tout le catalogue" : kindOptions.find((option) => option.value === selectedKind)?.label}</h2><span className="muted-caption">{query ? `Résultats pour « ${query} »` : "Une sélection alimentée par des catalogues publics"}</span></div>
              <span className="catalog-provider">{selectedKind === "comics" ? "SOURCE · OPEN LIBRARY" : "SOURCE · KITSU"}</span>
            </div>
            {catalogLoading ? <LoadingState text="Recherche dans le catalogue…" /> : catalogError ? <ErrorState message={catalogError} onRetry={() => setRefreshIndex((value) => value + 1)} /> : (
              <>
                {items.length > 0 ? <div className="media-grid">{items.map((item) => <MediaCard key={item.id} item={item} saved={savedIds.has(item.id)} onOpen={() => setSelectedItem(item)} onSave={() => void saveToLibrary(item)} />)}</div> : <EmptyState title="Aucun résultat trouvé" text="Essaie un autre titre ou une autre catégorie." />}
                {hasMore && <div className="load-more-wrap"><button className="secondary-button" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? "Chargement…" : "Afficher plus de titres"} <ArrowRight size={16} /></button></div>}
              </>
            )}
            <p className="catalog-note"><ShieldCheck size={16} /> Les fiches et couvertures sont fournies par leurs catalogues respectifs. KOVA ne republie pas les chapitres de séries protégées.</p>
          </section>
        )}

        {screen === "library" && (
          <section className="page-section library-page">
            <div className="section-heading library-heading">
              <div><span className="section-kicker">TON ESPACE PERSONNEL</span><h1>Ma bibliothèque<span className="purple-period">.</span></h1><p>Un endroit pour suivre tes lectures, sans perdre le fil.</p></div>
              {user && <span className="library-count">{library.length} {library.length > 1 ? "séries" : "série"}</span>}
            </div>
            {!user ? (
              <div className="empty-panel"><span className="empty-icon"><LibraryBig size={26} /></span><h2>Ta bibliothèque t’attend</h2><p>Connecte-toi pour synchroniser tes favoris et suivre l’avancement de tes lectures.</p><button className="primary-button" onClick={() => setAuthOpen(true)}><LogIn size={17} /> Se connecter</button></div>
            ) : library.length === 0 ? (
              <div className="empty-panel"><span className="empty-icon"><Heart size={26} /></span><h2>La première page est à toi</h2><p>Ajoute une fiche avec le cœur pour commencer ta bibliothèque.</p><button className="primary-button" onClick={() => goTo("explore")}><Compass size={17} /> Explorer les titres</button></div>
            ) : (
              <div className="library-grid">
                {library.map((entry) => (
                  <article className="library-card" key={entry.id}>
                    <button className="library-card-open" onClick={() => setSelectedItem(entry)}>
                      {entry.cover ? <img src={entry.cover} alt="" loading="lazy" /> : <span className="cover-placeholder"><BookOpen size={26} /></span>}
                      <span className="library-card-main"><strong>{entry.title}</strong><small>{entry.kind === "comics" ? "BD & comics" : entry.kind === "manhwa" ? "Manhwa" : "Manga"}</small></span>
                    </button>
                    <label className="status-select-label">État de lecture
                      <select value={entry.libraryStatus} onChange={(event) => void changeLibraryStatus(entry, event.target.value as LibraryStatus)}>
                        {libraryStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                    <div className="library-card-actions"><button className="small-outline" onClick={() => setSelectedItem(entry)}>Détails</button><button className="remove-link" onClick={() => void removeFromLibrary(entry)}>Retirer</button></div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        <section className="source-section page-section">
          <div className="source-copy"><span className="section-kicker">LECTURE ET CRÉATEURS</span><h2>Découvrir. Soutenir.<br /><span>Lire au bon endroit.</span></h2><p>KOVA réunit les fiches et ta bibliothèque. Pour les chapitres, retrouve les œuvres sur les services qui ont le droit de les publier, ou suis les prochaines œuvres originales de KOVA.</p></div>
          <div className="official-links">
            <a href="https://mangaplus.shueisha.co.jp/" target="_blank" rel="noreferrer"><span className="official-icon">M+</span><span><strong>MANGA Plus</strong><small>Publications officielles de Shueisha</small></span><ExternalLink size={16} /></a>
            <a href="https://www.webtoons.com/" target="_blank" rel="noreferrer"><span className="official-icon">W</span><span><strong>WEBTOON</strong><small>Webcomics et créations d’artistes</small></span><ExternalLink size={16} /></a>
            <a href="https://globalcomix.com/" target="_blank" rel="noreferrer"><span className="official-icon">GC</span><span><strong>GlobalComix</strong><small>Comics et romans graphiques</small></span><ExternalLink size={16} /></a>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <button className="brand footer-brand" onClick={() => goTo("home")}><span className="brand-mark">K</span><span>KOVA</span><span className="brand-dot">.</span></button>
        <span>Manga · Manhwa · BD & comics</span>
        <div className="footer-links"><a href="#accueil">Accueil</a><a href="#accueil">Lectures originales KOVA</a></div>
        <span>© {new Date().getFullYear()} KOVA</span>
      </footer>

      {notice && <div className="notice-toast" role="status"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Fermer le message"><X size={16} /></button></div>}

      {authOpen && (
        <Modal title={authMode === "signup" ? "Rejoins KOVA" : "Content de te revoir"} subtitle="Ton espace de lecture, sauvegardé entre tes sessions." onClose={() => setAuthOpen(false)}>
          <div className="auth-tabs"><button className={authMode === "signup" ? "selected" : ""} onClick={() => { setAuthMode("signup"); setNotice(""); }}>Créer un compte</button><button className={authMode === "login" ? "selected" : ""} onClick={() => { setAuthMode("login"); setNotice(""); }}>Connexion</button></div>
          <form className="form-stack" onSubmit={handleAuth}>
            {authMode === "signup" && <label>Pseudonyme<input autoComplete="nickname" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Ton pseudo KOVA" maxLength={30} /></label>}
            <label>Adresse e-mail<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="toi@exemple.com" /></label>
            <label>Mot de passe<input type="password" autoComplete={authMode === "signup" ? "new-password" : "current-password"} minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="6 caractères minimum" /></label>
            <button className="primary-button full-button" type="submit" disabled={busy}>{busy ? "Patiente…" : authMode === "signup" ? "Créer mon compte" : "Me connecter"} <ArrowRight size={17} /></button>
          </form>
          <p className="modal-footnote"><ShieldCheck size={14} /> Authentification gérée par Firebase. Ton mot de passe n’est pas stocké dans ton profil KOVA.</p>
        </Modal>
      )}

      {profileOpen && user && (
        <Modal title="Mon profil KOVA" subtitle="Personnalise ton espace. Les images restent hébergées à leur URL." onClose={() => setProfileOpen(false)}>
          <form className="form-stack" onSubmit={saveProfile}>
            <label>Pseudonyme<input value={profileDraft.username} onChange={(event) => setProfileDraft((draft) => ({ ...draft, username: event.target.value }))} maxLength={30} placeholder="Ton pseudo" /></label>
            <label>À propos<textarea value={profileDraft.bio} onChange={(event) => setProfileDraft((draft) => ({ ...draft, bio: event.target.value }))} maxLength={180} rows={3} placeholder="Quelques mots sur tes lectures…" /></label>
            <label>URL de la photo de profil<input value={profileDraft.photoURL} onChange={(event) => setProfileDraft((draft) => ({ ...draft, photoURL: event.target.value }))} type="url" placeholder="https://…" /></label>
            <label>URL de la bannière<input value={profileDraft.bannerURL} onChange={(event) => setProfileDraft((draft) => ({ ...draft, bannerURL: event.target.value }))} type="url" placeholder="https://…" /></label>
            <div className="profile-preview">
              {profileDraft.bannerURL && <img className="banner-preview" src={profileDraft.bannerURL} alt="Aperçu de la bannière" onError={(event) => { event.currentTarget.style.display = "none"; }} />}
              <div className="profile-preview-row">{profileDraft.photoURL ? <img className="avatar avatar-large" src={profileDraft.photoURL} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <span className="avatar avatar-large">{(profileDraft.username || displayName).slice(0, 1).toUpperCase()}</span>}<span><strong>{profileDraft.username || displayName}</strong><small>{user.email}</small></span></div>
            </div>
            <button className="primary-button full-button" type="submit" disabled={profileBusy}>{profileBusy ? "Enregistrement…" : "Enregistrer le profil"} <Check size={17} /></button>
          </form>
          <button className="logout-row" onClick={() => void handleSignOut()}><LogOut size={17} /> Se déconnecter</button>
        </Modal>
      )}

      {settingsOpen && (
        <Modal title="Réglages KOVA" subtitle="Les réglages utiles pour garder une expérience simple et sûre." onClose={() => setSettingsOpen(false)}>
          <div className="settings-list">
            <div className="setting-row"><span className="setting-icon"><ShieldCheck size={18} /></span><span><strong>Filtre de contenu adulte</strong><small>Les classifications adultes connues sont écartées des résultats.</small></span><span className="setting-state">ACTIF</span></div>
            <div className="setting-row"><span className="setting-icon"><LibraryBig size={18} /></span><span><strong>Bibliothèque synchronisée</strong><small>{user ? "Enregistrée dans ton compte Firebase." : "Connecte-toi pour retrouver tes séries."}</small></span><span className="setting-state">{user ? "EN LIGNE" : "HORS SESSION"}</span></div>
            <div className="setting-row"><span className="setting-icon"><UserRound size={18} /></span><span><strong>Données de profil</strong><small>Les champs restent privés selon les règles Firestore du compte.</small></span><span className="setting-state">PRIVÉ</span></div>
          </div>
          <p className="modal-footnote">La lecture intégrée sera réservée aux œuvres originales de KOVA ou aux chapitres pour lesquels une autorisation a été obtenue.</p>
        </Modal>
      )}

      {selectedItem && (
        <Modal title={selectedItem.title} subtitle={`${selectedItem.kind === "comics" ? "BD & comics" : selectedItem.kind === "manhwa" ? "Manhwa" : "Manga"} · ${selectedItem.year ?? "Année inconnue"} · Original KOVA`} onClose={() => { setSelectedItem(null); setReaderOpen(false); }} wide>
          <div className="detail-layout">
            <div className="detail-cover">
              {selectedItem.cover ? <img src={selectedItem.cover} alt={`Couverture de ${selectedItem.title}`} /> : <span className="cover-placeholder"><BookOpen size={32} /><span>KOVA</span></span>}
            </div>
            <div className="detail-copy">
              {selectedItem.alternateTitle && <p className="alternate-title">{selectedItem.alternateTitle}</p>}
              <p>{selectedItem.description || "Aucun résumé disponible pour cette fiche."}</p>
              <div className="detail-facts"><span><small>Statut</small><strong>{selectedItem.status || "Non renseigné"}</strong></span><span><small>Note catalogue</small><strong>{selectedItem.rating ? `${selectedItem.rating.toFixed(1)} / 5` : "Non renseignée"}</strong></span></div>
              <button className="primary-button full-button" onClick={() => void saveToLibrary(selectedItem)}>{savedIds.has(selectedItem.id) ? <Check size={17} /> : <Heart size={17} />}{savedIds.has(selectedItem.id) ? "Dans ma bibliothèque" : "Ajouter à ma bibliothèque"}</button>
              <a className="secondary-button full-button" href={selectedItem.sourceUrl} target="_blank" rel="noreferrer">Ouvrir la fiche source <ExternalLink size={16} /></a>
              <p className="modal-footnote">Cette fiche est issue d’un catalogue externe. Les chapitres ne sont pas hébergés par KOVA. Vérifie les services officiels disponibles dans ta région pour lire l’œuvre.</p>
            </div>
          </div>
        </Modal>
      )}
      {loadingAuth && <div className="session-indicator">Vérification de la session…</div>}
    </div>
  );
}

function LoadingState({ text }: { text: string }) {
  return <div className="loading-panel"><span className="loading-orb" /><p>{text}</p></div>;
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="empty-panel error-panel"><span className="empty-icon"><Search size={25} /></span><h2>La source ne répond pas</h2><p>{message} Vérifie ta connexion Internet puis réessaie.</p><button className="secondary-button" onClick={onRetry}>Réessayer <ArrowRight size={16} /></button></div>;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="empty-panel compact-empty"><span className="empty-icon"><BookOpen size={24} /></span><h2>{title}</h2><p>{text}</p></div>;
}

function Modal({
  title,
  subtitle,
  onClose,
  wide = false,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={wide ? "modal-card modal-wide" : "modal-card"} role="dialog" aria-modal="true" aria-label={title}>
        <button className="modal-close icon-button" onClick={onClose} aria-label="Fermer"><X size={19} /></button>
        <span className="section-kicker">KOVA / TON ESPACE</span>
        <h2 className="modal-title">{title}</h2>
        <p className="modal-subtitle">{subtitle}</p>
        {children}
      </section>
    </div>
  );
}
