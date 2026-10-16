import { FormEvent, useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  User,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import {
  BookOpen, Compass, Heart, History, LibraryBig, LogIn, LogOut,
  Menu, Search, Settings, ShieldCheck, Sparkles, UserRound, X,
} from "lucide-react";
import { auth, db } from "./lib/firebase";

type Profile = { username?: string; bio?: string; photoURL?: string };

const sections = [
  { title: "Reprendre la lecture", subtitle: "Retrouvez votre dernier chapitre.", icon: History },
  { title: "Votre bibliothèque", subtitle: "Organisez vos séries en un seul endroit.", icon: LibraryBig },
  { title: "Favoris", subtitle: "Gardez vos prochaines lectures sous la main.", icon: Heart },
];

function friendlyError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  const messages: Record<string, string> = {
    "auth/invalid-credential": "Adresse e-mail ou mot de passe incorrect.",
    "auth/email-already-in-use": "Cette adresse e-mail possède déjà un compte.",
    "auth/weak-password": "Choisissez un mot de passe d'au moins 6 caractères.",
    "auth/invalid-email": "Cette adresse e-mail n'est pas valide.",
    "auth/too-many-requests": "Trop de tentatives. Réessayez un peu plus tard.",
    "auth/network-request-failed": "Connexion impossible. Vérifiez votre réseau.",
  };
  return messages[code] ?? "Une erreur est survenue. Vérifiez la configuration Firebase et réessayez.";
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile>({});
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => onAuthStateChanged(auth, async (currentUser) => {
    setUser(currentUser);
    if (currentUser) {
      try {
        const snapshot = await getDoc(doc(db, "users", currentUser.uid));
        setProfile(snapshot.exists() ? snapshot.data() as Profile : {});
      } catch {
        setProfile({});
      }
    } else {
      setProfile({});
    }
    setLoading(false);
  }), []);

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setBusy(true);
    try {
      if (authMode === "signup") {
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        const chosenName = username.trim() || email.split("@")[0];
        await updateProfile(credential.user, { displayName: chosenName });
        await setDoc(doc(db, "users", credential.user.uid), {
          uid: credential.user.uid,
          username: chosenName,
          email: credential.user.email,
          bio: "",
          photoURL: "",
          bannerURL: "",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setProfile({ username: chosenName });
        setNotice("Compte créé. Bienvenue dans KOVA !");
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        setNotice("Connexion réussie.");
      }
    } catch (error) {
      setNotice(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    await signOut(auth);
    setNotice("Vous êtes déconnecté.");
    setMenuOpen(false);
  }

  const displayName = profile.username || user?.displayName || user?.email?.split("@")[0] || "Lecteur";

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="icon-button mobile-menu" aria-label="Ouvrir le menu" onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
        <a className="brand" href="#" aria-label="KOVA accueil"><span className="brand-mark">K</span><span>KOVA</span></a>
        <nav className={menuOpen ? "nav-links nav-open" : "nav-links"}>
          <a className="active" href="#accueil" onClick={() => setMenuOpen(false)}><Compass size={17} /> Accueil</a>
          <a href="#explorer" onClick={() => setMenuOpen(false)}><Search size={17} /> Explorer</a>
          <a href="#bibliotheque" onClick={() => setMenuOpen(false)}><BookOpen size={17} /> Bibliothèque</a>
        </nav>
        <div className="top-actions">
          <button className="icon-button search-button" aria-label="Rechercher" onClick={() => document.getElementById("explorer")?.scrollIntoView({ behavior: "smooth" })}><Search size={19} /></button>
          {user ? (
            <button className="profile-chip" onClick={() => document.getElementById("profil")?.scrollIntoView({ behavior: "smooth" })}>
              <span className="avatar">{displayName.slice(0, 1).toUpperCase()}</span><span className="profile-name">{displayName}</span>
            </button>
          ) : <a className="login-link" href="#compte"><LogIn size={17} /> Connexion</a>}
        </div>
      </header>

      {menuOpen && <button className="menu-backdrop" aria-label="Fermer le menu" onClick={() => setMenuOpen(false)} />}

      <main id="accueil">
        <section className="hero">
          <div className="hero-glow" />
          <div className="hero-content">
            <span className="eyebrow"><Sparkles size={14} /> TON UNIVERS, TON RYTHME</span>
            <h1>La prochaine page<br />de votre <span>aventure.</span></h1>
            <p>Mangas, manhwas et BD réunis dans un espace pensé pour les passionnés. Votre bibliothèque commence ici.</p>
            <a className="primary-button" href="#explorer"><Compass size={18} /> Explorer KOVA</a>
            <div className="hero-tags"><span>MANGA</span><span>MANHWA</span><span>BD & COMICS</span><span>ANIME PLUS TARD</span></div>
          </div>
          <div className="hero-art" aria-hidden="true"><div className="orb orb-one" /><div className="orb orb-two" /><div className="art-letter">K</div><div className="art-ring" /></div>
        </section>

        <section className="section-block" id="explorer">
          <div className="section-heading"><div><span className="section-kicker">LE PORTAIL</span><h2>Explorez votre univers</h2></div><span className="soon-pill">Catalogue à connecter</span></div>
          <div className="category-grid">
            <article className="category-card manga-card"><span className="category-symbol">漫</span><div><h3>Mangas</h3><p>Les histoires qui vous happent.</p></div><span className="category-arrow">↗</span></article>
            <article className="category-card manhwa-card"><span className="category-symbol">화</span><div><h3>Manhwas</h3><p>Vos aventures en couleur.</p></div><span className="category-arrow">↗</span></article>
            <article className="category-card comics-card"><span className="category-symbol">BD</span><div><h3>BD & Comics</h3><p>Des mondes à chaque page.</p></div><span className="category-arrow">↗</span></article>
          </div>
        </section>

        <section className="section-block" id="bibliotheque">
          <div className="section-heading"><div><span className="section-kicker">VOTRE ESPACE</span><h2>Tout reprend ici</h2></div></div>
          <div className="feature-grid">{sections.map(({ title, subtitle, icon: Icon }) => <article className="feature-card" key={title}><span className="feature-icon"><Icon size={20} /></span><h3>{title}</h3><p>{subtitle}</p><span className="feature-note">Disponible après connexion</span></article>)}</div>
        </section>

        <section className="account-section" id="compte">
          <div className="account-copy"><span className="section-kicker">VOTRE COMPTE KOVA</span><h2>Un espace à votre image.</h2><p>Créez votre compte pour préparer votre profil et votre bibliothèque personnelle.</p><ul><li><ShieldCheck size={17} /> Connexion sécurisée par Firebase Auth</li><li><UserRound size={17} /> Profil personnel enregistré dans Firestore</li><li><Heart size={17} /> Favoris et historique, prochaine étape</li></ul></div>
          <div className="auth-card">
            {loading ? <div className="loading-state">Chargement de votre session…</div> : user ? (
              <div className="signed-in" id="profil">
                <div className="large-avatar">{displayName.slice(0, 1).toUpperCase()}</div><span className="section-kicker">CONNECTÉ À KOVA</span><h3>Bienvenue, {displayName}</h3><p>{user.email}</p>
                <div className="profile-preview"><span>Photo de profil</span><strong>{profile.photoURL ? "Photo configurée" : "À ajouter"}</strong><span>Bannière</span><strong>{profile.bannerURL ? "Bannière configurée" : "À ajouter"}</strong></div>
                <button className="secondary-button full-button" onClick={handleSignOut}><LogOut size={17} /> Se déconnecter</button>
                <p className="small-note">Le compte fonctionne. L’édition complète du profil arrive dans une prochaine étape.</p>
              </div>
            ) : (
              <>
                <div className="auth-tabs"><button className={authMode === "signup" ? "selected" : ""} onClick={() => { setAuthMode("signup"); setNotice(""); }}>Créer un compte</button><button className={authMode === "login" ? "selected" : ""} onClick={() => { setAuthMode("login"); setNotice(""); }}>Connexion</button></div>
                <form onSubmit={handleAuth}>
                  {authMode === "signup" && <label>Pseudonyme<input autoComplete="nickname" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Ton pseudo KOVA" maxLength={30} /></label>}
                  <label>Adresse e-mail<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="toi@exemple.com" /></label>
                  <label>Mot de passe<input type="password" autoComplete={authMode === "signup" ? "new-password" : "current-password"} minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="6 caractères minimum" /></label>
                  <button className="primary-button full-button" type="submit" disabled={busy}>{busy ? "Patientez…" : authMode === "signup" ? "Créer mon compte" : "Me connecter"} <span>↗</span></button>
                </form>
                {notice && <p className="notice" role="status">{notice}</p>}
                <p className="small-note">En continuant, vous acceptez de respecter les règles de la communauté KOVA.</p>
              </>
            )}
            {user && notice && <p className="notice" role="status">{notice}</p>}
          </div>
        </section>
      </main>

      <footer><a className="brand footer-brand" href="#accueil"><span className="brand-mark">K</span><span>KOVA</span></a><span>Manga · Manhwa · BD · Anime plus tard</span><span>© {new Date().getFullYear()} KOVA</span></footer>
      <button className="settings-fab" aria-label="Réglages bientôt disponibles" title="Réglages bientôt disponibles"><Settings size={19} /></button>
    </div>
  );
}
