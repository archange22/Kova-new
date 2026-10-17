import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  sendPasswordResetEmail,
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
  query as firestoreQuery,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  ArrowDownRight,
  ArrowRight,
  BookOpen,
  Check,
  Compass,
  Copyright,
  FileText,
  LockKeyhole,
  Scale,
  Eye,
  EyeOff,
  Heart,
  LibraryBig,
  LifeBuoy,
  LogIn,
  LogOut,
  Menu,
  MessageSquareText,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRound,
  UserPlus,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { auth, db } from "./lib/firebase";
import { fetchCatalog, fetchDemoChapters, fetchDemoChapterPages } from "./lib/catalog";
import type { CatalogItem, CatalogKind, CatalogPage } from "./lib/catalog";
import CatalogPulse from "./components/CatalogPulse";

type Profile = {
  username?: string;
  bio?: string;
  photoURL?: string;
  bannerURL?: string;
  email?: string;
  role?: "user" | "admin";
};

type LibraryStatus = "to_read" | "reading" | "completed" | "paused" | "dropped";
type LibraryEntry = CatalogItem & { libraryStatus: LibraryStatus };

type SupportStatus = "open" | "in_progress" | "resolved" | "closed";
type SupportCategory = "bug" | "account" | "reading" | "catalog" | "suggestion" | "other";
type SupportMessage = {
  id: string;
  authorUid: string;
  authorName: string;
  authorRole: "user" | "support";
  body: string;
  createdAt?: { toMillis?: () => number };
};
type SupportTicket = {
  id: string;
  uid: string;
  username: string;
  email: string;
  subject: string;
  category: SupportCategory;
  status: SupportStatus;
  lastMessagePreview: string;
  createdAt?: { toMillis?: () => number };
  updatedAt?: { toMillis?: () => number };
};

const SUPPORT_ADMIN_UIDS = new Set([
  "fL5Gz1lTOUY11JRu14KHKcDD95q1",
  "TIat7e3WQyXIk9HyLdjPxsfZ6R92",
  "B23E8GVKHIUnzgdK5YScoiZzsnG3",
]);

function isSupportAdmin(uid?: string | null) {
  return Boolean(uid && SUPPORT_ADMIN_UIDS.has(uid));
}

function getRoleForUid(uid: string): "user" | "admin" {
  return uid === "fL5Gz1lTOUY11JRu14KHKcDD95q1" ? "admin" : "user";
}

function timestampMillis(value?: { toMillis?: () => number } | null) {
  return value && typeof value.toMillis === "function" ? value.toMillis() : 0;
}

function supportStatusLabel(status: SupportStatus) {
  const labels: Record<SupportStatus, string> = {
    open: "Ouvert",
    in_progress: "En cours",
    resolved: "Résolu",
    closed: "Fermé",
  };
  return labels[status];
}

function supportCategoryLabel(category: SupportCategory) {
  const labels: Record<SupportCategory, string> = {
    bug: "Bug / problème technique",
    account: "Compte et profil",
    reading: "Lecteur / chapitres",
    catalog: "Catalogue",
    suggestion: "Suggestion",
    other: "Autre demande",
  };
  return labels[category];
}

type Screen = "home" | "explore" | "library" | "reader";

const reservedRoutes = new Set(["connexion", "bibliotheque", "explorer", "chapitre", "support"]);

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function getInitialSearch() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  const candidate = parts[0] === "manga" ? parts[1] : parts[0];
  return candidate && !reservedRoutes.has(candidate) && parts[0] !== "connexion"
    ? decodeURIComponent(candidate).replace(/-/g, " ")
    : "";
}

const kindOptions: Array<{ value: CatalogKind; label: string }> = [
  { value: "all", label: "Tout" },
  { value: "manga", label: "Manga" },
  { value: "manhwa", label: "Manhwa" },
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
    "auth/operation-not-allowed": "Cette méthode de connexion n'est pas activée dans Firebase Authentication.",
    "auth/unauthorized-domain": "Ce domaine n'est pas autorisé dans Firebase Authentication. Ajoute le domaine de KOVA dans les domaines autorisés.",
    "auth/popup-blocked": "Le navigateur a bloqué la fenêtre Google. Autorise les fenêtres contextuelles puis réessaie.",
    "auth/popup-closed-by-user": "La connexion Google a été annulée avant la fin.",
    "auth/cancelled-popup-request": "Une autre fenêtre de connexion est déjà ouverte. Réessaie.",
    "auth/account-exists-with-different-credential": "Un compte existe déjà avec cet e-mail. Connecte-toi d'abord avec ta méthode habituelle.",
    "permission-denied": "Firebase a refusé l'accès. Vérifie les règles Firestore publiées.",
    "unavailable": "Firebase est momentanément indisponible. Réessaie plus tard.",
  };
  return messages[code] ?? "Une erreur est survenue. Vérifie la connexion puis réessaie.";
}

function getLibraryDocId(item: CatalogItem) {
  return item.id.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 140);
}

function removeUndefinedDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(removeUndefinedDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, nested]) => nested !== undefined)
        .map(([key, nested]) => [key, removeUndefinedDeep(nested)]),
    );
  }
  return value;
}

async function imageFileToDataUrl(file: File, maxBytes = 180 * 1024, maxDimension = 1400): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choisis un fichier image.");
  if (file.size > 12 * 1024 * 1024) throw new Error("Image trop lourde. Choisis une image de moins de 12 Mo.");
  const source = await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Impossible de lire cette image.")); };
    image.src = url;
  });
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, maxDimension / Math.max(source.width, source.height));
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Traitement d’image indisponible sur cet appareil.");
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  let quality = 0.82;
  let output = canvas.toDataURL("image/jpeg", quality);
  while (output.length * 0.75 > maxBytes && quality > 0.35) {
    quality -= 0.1;
    output = canvas.toDataURL("image/jpeg", quality);
  }
  if (output.length * 0.75 > maxBytes) throw new Error("Cette image reste trop lourde. Choisis une image plus simple.");
  return output;
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
          <span className="media-kind">{item.kind.toUpperCase()}</span>
        </span>
        <span className="media-card-copy">
          <strong className="media-title">{item.title}</strong>
          <span className="media-meta">{item.year ?? "Année inconnue"}{item.status ? ` · ${item.status === "finished" ? "Terminé" : item.status === "current" ? "En cours" : item.status}` : ""}</span>
          <span className="media-source">{item.anilistId ? "Catalogue de démonstration" : "Catalogue local"}</span>
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
  const catalogRequestId = useRef(0);
  const chapterListRequestId = useRef(0);
  const readerPagesRequestId = useRef(0);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile>({});
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [screen, setScreen] = useState<Screen>(() => window.location.pathname === "/bibliotheque" ? "library" : window.location.pathname === "/explorer" ? "explore" : "home");
  const [routePath, setRoutePath] = useState(() => window.location.pathname);
  const appliedRouteRef = useRef("");
  const [readerReturnScreen, setReaderReturnScreen] = useState<Exclude<Screen, "reader">>("explore");
  const [selectedKind, setSelectedKind] = useState<CatalogKind>("all");
  const [query, setQuery] = useState(getInitialSearch);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const [readerOpen, setReaderOpen] = useState(false);
  const [readerLoading, setReaderLoading] = useState(false);
  const [readerError, setReaderError] = useState("");
  const [readerChapterPages, setReaderChapterPages] = useState<string[]>([]);
  const [readerChapterId, setReaderChapterId] = useState("");
  const [readerChapterTitle, setReaderChapterTitle] = useState("");
  const [readerQuality, setReaderQuality] = useState<"data" | "data-saver">("data-saver");
  const [chapterListLoading, setChapterListLoading] = useState(false);
  const [chapterListError, setChapterListError] = useState("");
  const [chapterPageOffset, setChapterPageOffset] = useState(0);
  const [chapterPageHasMore, setChapterPageHasMore] = useState(false);
  const [chapterPageLoading, setChapterPageLoading] = useState(false);
  const [chapterVisibleCount, setChapterVisibleCount] = useState(30);
  const [menuOpen, setMenuOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [publicProfile, setPublicProfile] = useState<(Profile & { uid: string }) | null>(null);
  const [publicProfileLoading, setPublicProfileLoading] = useState(false);
  const [publicProfileFollowing, setPublicProfileFollowing] = useState(false);
  const [publicProfileFollowers, setPublicProfileFollowers] = useState(0);
  const [publicProfileFollowingCount, setPublicProfileFollowingCount] = useState(0);
  const [followBusy, setFollowBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);
  const [legalSection, setLegalSection] = useState<"terms" | "privacy" | "copyright" | "community" | "safety">("terms");
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportBusy, setSupportBusy] = useState(false);
  const [supportError, setSupportError] = useState("");
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [supportTicketId, setSupportTicketId] = useState("");
  const [supportMessages, setSupportMessages] = useState<SupportMessage[]>([]);
  const [supportSubject, setSupportSubject] = useState("");
  const [supportCategory, setSupportCategory] = useState<SupportCategory>("bug");
  const [supportFirstMessage, setSupportFirstMessage] = useState("");
  const [supportReply, setSupportReply] = useState("");
  const [supportStatusBusy, setSupportStatusBusy] = useState(false);
  const [authMode, setAuthMode] = useState<"signup" | "login">("signup");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profileDraft, setProfileDraft] = useState({ username: "", bio: "", photoURL: "", bannerURL: "" });
  const [profileBusy, setProfileBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
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
        setSupportTickets([]);
        setSupportTicketId("");
        setSupportMessages([]);
        setSupportOpen(false);
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
            role: getRoleForUid(currentUser.uid),
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
        // Publish only profile-safe fields in a separate document; never expose the private users document.
        const publicRef = doc(db, "publicProfiles", currentUser.uid);
        const publicSnapshot = await getDoc(publicRef);
        if (!publicSnapshot.exists()) {
          await setDoc(publicRef, {
            uid: currentUser.uid,
            username: loadedProfile.username || currentUser.displayName || "Lecteur KOVA",
            bio: loadedProfile.bio || "",
            photoURL: loadedProfile.photoURL || currentUser.photoURL || "",
            bannerURL: loadedProfile.bannerURL || "",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        const librarySnapshot = await getDocs(collection(db, "users", currentUser.uid, "library"));
        const entries = librarySnapshot.docs
          .map((entry) => entry.data() as LibraryEntry)
          .filter((entry) => entry.kind === "manga" || entry.kind === "manhwa");
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
    catalogRequestId.current += 1;
    const controller = new AbortController();
    let alive = true;
    setLoadingMore(false);
    const timeout = window.setTimeout(async () => {
      setCatalogLoading(true);
      setCatalogError("");
      try {
        const page: CatalogPage = await fetchCatalog(selectedKind, query, 0, controller.signal);
        const enrichedItems = await page.items;
        if (!alive) return;
        setItems(enrichedItems);
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

  function navigatePath(path: string, replace = false) {
    if (window.location.pathname !== path) {
      if (replace) window.history.replaceState(null, "", path);
      else window.history.pushState(null, "", path);
    }
    setRoutePath(path);
  }

  function goTo(nextScreen: Screen) {
    setScreen(nextScreen);
    if (nextScreen !== "reader") {
      setSelectedItem(null);
      setReaderOpen(false);
    }
    const paths: Record<Screen, string> = {
      home: "/", explore: "/explorer", library: "/bibliotheque",
      reader: selectedItem ? "/" + slugify(selectedItem.title) + "/chapitre/" + encodeURIComponent(readerChapterId) : "/",
    };
    navigatePath(paths[nextScreen]);
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
        const newProfile = {
          username: chosenName,
          email: credential.user.email || email.trim(),
          bio: "",
          photoURL: "",
          bannerURL: "",
          role: getRoleForUid(credential.user.uid),
        };
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
      setPasswordVisible(false);
      setAuthOpen(false);
      if (routePath === "/connexion") navigatePath("/", true);
    } catch (error) {
      setNotice(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleAuth() {
    setNotice("");
    setGoogleBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(auth, provider);
      const googleUser = result.user;
      const profileRef = doc(db, "users", googleUser.uid);
      const profileSnapshot = await getDoc(profileRef);

      if (profileSnapshot.exists()) {
        setProfile(profileSnapshot.data() as Profile);
      } else {
        const chosenName = googleUser.displayName?.trim()
          || googleUser.email?.split("@")[0]
          || "Lecteur";
        const newProfile = {
          username: chosenName,
          email: googleUser.email || "",
          bio: "",
          photoURL: googleUser.photoURL || "",
          bannerURL: "",
          role: getRoleForUid(googleUser.uid),
        };
        await setDoc(profileRef, {
          uid: googleUser.uid,
          ...newProfile,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setProfile(newProfile);
      }

      setPassword("");
      setPasswordVisible(false);
      setAuthOpen(false);
      setNotice("Connexion Google réussie. Bienvenue dans KOVA !");
      if (routePath === "/connexion") navigatePath("/", true);
    } catch (error) {
      setNotice(friendlyError(error));
    } finally {
      setGoogleBusy(false);
    }
  }

  async function handlePasswordReset() {
    const targetEmail = email.trim();
    if (!targetEmail) {
      setNotice("Saisis d’abord ton adresse e-mail pour recevoir le lien de réinitialisation.");
      return;
    }
    setResetBusy(true);
    setNotice("");
    try {
      await sendPasswordResetEmail(auth, targetEmail);
      setNotice("Si un compte correspond à cette adresse, un e-mail de réinitialisation va arriver. Vérifie aussi les courriers indésirables.");
    } catch (error) {
      setNotice(friendlyError(error));
    } finally {
      setResetBusy(false);
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
      const safeEntry = removeUndefinedDeep(saved) as Record<string, unknown>;
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

  async function handleImageFile(kind: "photoURL" | "bannerURL", file?: File) {
    if (!file) return;
    setNotice("");
    try {
      const isAvatar = kind === "photoURL";
      const dataUrl = await imageFileToDataUrl(file, isAvatar ? 105 * 1024 : 230 * 1024, isAvatar ? 640 : 1600);
      setProfileDraft((draft) => ({ ...draft, [kind]: dataUrl }));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Impossible de traiter cette image.");
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const normalizeImage = (value: string) => {
      if (!value.trim()) return "";
      if (/^data:image\/(jpeg|png|webp);base64,/i.test(value)) return value;
      return validHttpUrl(value);
    };
    const photoURL = normalizeImage(profileDraft.photoURL);
    const bannerURL = normalizeImage(profileDraft.bannerURL);
    if ((profileDraft.photoURL && !photoURL) || (profileDraft.bannerURL && !bannerURL)) {
      setNotice("Utilise une URL HTTP(S) valide ou sélectionne une image depuis ton appareil.");
      return;
    }
    if ((photoURL.startsWith("data:") && photoURL.length > 250000) ||
        (bannerURL.startsWith("data:") && bannerURL.length > 250000) ||
        (photoURL.startsWith("data:") && bannerURL.startsWith("data:") && photoURL.length + bannerURL.length > 430000)) {
      setNotice("Les images sont trop volumineuses pour le profil. Réduis leur taille puis réessaie.");
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
      // Firebase Auth accepts ordinary photo URLs, not embedded data URLs.
      await updateProfile(user, {
        displayName: nextProfile.username,
        photoURL: photoURL && !photoURL.startsWith("data:") ? photoURL : null,
      });
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        ...nextProfile,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      await setDoc(doc(db, "publicProfiles", user.uid), {
        uid: user.uid,
        username: nextProfile.username,
        bio: nextProfile.bio,
        photoURL: nextProfile.photoURL,
        bannerURL: nextProfile.bannerURL,
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

  async function togglePublicProfileFollow() {
    if (!user) {
      setAuthMode("login");
      setAuthOpen(true);
      setNotice("Connecte-toi pour suivre des lecteurs KOVA.");
      return;
    }
    if (!publicProfile || publicProfile.uid === user.uid || followBusy) return;
    setFollowBusy(true);
    const followRef = doc(db, "follows", user.uid + "_" + publicProfile.uid);
    try {
      if (publicProfileFollowing) {
        await deleteDoc(followRef);
        setPublicProfileFollowing(false);
        setPublicProfileFollowers((count) => Math.max(0, count - 1));
        setNotice("Tu ne suis plus ce lecteur.");
      } else {
        await setDoc(followRef, {
          followerUid: user.uid,
          followingUid: publicProfile.uid,
          createdAt: serverTimestamp(),
        });
        setPublicProfileFollowing(true);
        setPublicProfileFollowers((count) => count + 1);
        setNotice("Lecteur ajouté à tes abonnements !");
      }
    } catch (error) {
      setNotice(friendlyError(error));
    } finally {
      setFollowBusy(false);
    }
  }

  async function openTitle(item: CatalogItem) {
    navigatePath("/" + slugify(item.title));
    const requestId = ++chapterListRequestId.current;
    readerPagesRequestId.current += 1;
    setSelectedItem(item);
    setReaderOpen(false);
    setChapterListError("");
    setChapterListLoading(!item.chapters?.length);
    setChapterPageOffset(0);
    setChapterPageHasMore(false);
    setChapterPageLoading(false);
    setChapterVisibleCount(30);
    setReaderError("");
    setReaderChapterPages([]);
    setReaderChapterId("");
    setReaderChapterTitle("");

    if (item.chapters?.length) {
      setChapterListLoading(false);
      return;
    }

    try {
      const page = await fetchDemoChapters(item.id);
      if (requestId !== chapterListRequestId.current) return;
      setSelectedItem((current) => current?.id === item.id ? { ...current, chapters: page.chapters } : current);
      setChapterPageOffset(page.nextOffset);
      setChapterPageHasMore(page.hasMore);
      if (page.chapters.length === 0 && !page.hasMore) {
        setChapterListError("Aucun chapitre de démonstration n’est disponible pour ce titre pour le moment. Les sources de contenu sont volontairement désactivées pendant l’amélioration de KOVA.");
      }
    } catch (error) {
      if (requestId !== chapterListRequestId.current) return;
      setChapterListError(error instanceof Error ? error.message : "Impossible de charger les chapitres de démonstration. Réessaie dans un instant.");
    } finally {
      if (requestId === chapterListRequestId.current) setChapterListLoading(false);
    }
  }

  async function loadMoreChapters() {
    if (!selectedItem || chapterPageLoading || !chapterPageHasMore) return;
    const item = selectedItem;
    const requestId = ++chapterListRequestId.current;
    const existing = item.chapters ?? [];
    const existingKeys = new Set(existing.map((chapter) => {
      const number = chapter.title.match(/^Chapitre ([^ ·]+)/)?.[1];
      return (chapter.volume ?? "") + ":" + (number ?? chapter.mangaDexChapterId);
    }));
    setChapterPageLoading(true);
    setChapterListError("");
    try {
      const page = await fetchDemoChapters(item.id, chapterPageOffset);
      if (requestId !== chapterListRequestId.current) return;
      const additions = page.chapters.filter((chapter) => {
        const number = chapter.title.match(/^Chapitre ([^ ·]+)/)?.[1];
        const key = (chapter.volume ?? "") + ":" + (number ?? chapter.mangaDexChapterId);
        if (existingKeys.has(key)) return false;
        existingKeys.add(key);
        return true;
      });
      const merged = [...existing, ...additions];
      setSelectedItem((current) => current?.id === item.id ? { ...current, chapters: merged } : current);
      setChapterPageOffset(page.nextOffset);
      setChapterPageHasMore(page.hasMore);
      setChapterVisibleCount((current) => Math.min(merged.length, current + 30));
      if (merged.length === 0 && !page.hasMore) {
        setChapterListError("Aucun chapitre de démonstration n’est disponible pour ce titre pour le moment. Les sources de contenu sont volontairement désactivées pendant l’amélioration de KOVA.");
      }
    } catch (error) {
      if (requestId !== chapterListRequestId.current) return;
      setChapterListError(error instanceof Error ? error.message : "Impossible de charger les chapitres suivants.");
    } finally {
      if (requestId === chapterListRequestId.current) setChapterPageLoading(false);
    }
  }

  async function openDemoChapter(chapterId: string, chapterTitle: string) {
    const requestId = ++readerPagesRequestId.current;
    setReaderLoading(true);
    setReaderError("");
    setReaderChapterPages([]);
    setReaderChapterId(chapterId);
    setReaderChapterTitle(chapterTitle);
    if (screen !== "reader") setReaderReturnScreen(screen);
    setScreen("reader");
    if (selectedItem) navigatePath("/" + slugify(selectedItem.title) + "/chapitre/" + encodeURIComponent(chapterId));
    else navigatePath("/chapitre/" + encodeURIComponent(chapterId));
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
    try {
      const pages = await fetchDemoChapterPages(chapterId, readerQuality);
      if (requestId !== readerPagesRequestId.current) return;
      setReaderChapterPages(pages);
    } catch (error) {
      if (requestId !== readerPagesRequestId.current) return;
      setReaderError(error instanceof Error ? error.message : "Impossible de charger ce chapitre.");
    } finally {
      if (requestId === readerPagesRequestId.current) setReaderLoading(false);
    }
  }

  async function switchReaderQuality(nextQuality: "data" | "data-saver") {
    setReaderQuality(nextQuality);
    if (!readerChapterId) return;
    const chapterId = readerChapterId;
    const requestId = ++readerPagesRequestId.current;
    setReaderLoading(true);
    setReaderError("");
    try {
      const pages = await fetchDemoChapterPages(chapterId, nextQuality);
      if (requestId !== readerPagesRequestId.current) return;
      setReaderChapterPages(pages);
    } catch (error) {
      if (requestId !== readerPagesRequestId.current) return;
      setReaderError(error instanceof Error ? error.message : "Impossible de changer la qualité des pages.");
    } finally {
      if (requestId === readerPagesRequestId.current) setReaderLoading(false);
    }
  }

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    const requestId = catalogRequestId.current;
    setLoadingMore(true);
    try {
      const page = await fetchCatalog(selectedKind, query, offset);
      const enrichedItems = await page.items;
      if (requestId !== catalogRequestId.current) return;
      setItems((current) => {
        const ids = new Set(current.map((item) => item.id));
        return [...current, ...enrichedItems.filter((item) => !ids.has(item.id))];
      });
      setOffset(page.nextOffset);
      setHasMore(page.hasMore);
    } catch (error) {
      if (requestId !== catalogRequestId.current) return;
      setCatalogError(error instanceof Error ? error.message : "Impossible de charger la suite.");
    } finally {
      if (requestId === catalogRequestId.current) setLoadingMore(false);
    }
  }

  async function loadSupportMessages(ticketId: string) {
    if (!user) return;
    try {
      const snapshot = await getDocs(collection(db, "supportTickets", ticketId, "messages"));
      const messages = snapshot.docs
        .map((entry) => ({ id: entry.id, ...entry.data() }) as SupportMessage)
        .sort((a, b) => timestampMillis(a.createdAt) - timestampMillis(b.createdAt));
      setSupportMessages(messages);
    } catch (error) {
      setSupportError(friendlyError(error));
      setSupportMessages([]);
    }
  }

  async function loadSupportTickets(preferredTicketId?: string) {
    if (!user) return;
    setSupportLoading(true);
    setSupportError("");
    try {
      const ticketCollection = collection(db, "supportTickets");
      const snapshot = isSupportAdmin(user.uid)
        ? await getDocs(ticketCollection)
        : await getDocs(firestoreQuery(ticketCollection, where("uid", "==", user.uid)));
      const tickets = snapshot.docs
        .map((entry) => ({ id: entry.id, ...entry.data() }) as SupportTicket)
        .sort((a, b) => timestampMillis(b.updatedAt) - timestampMillis(a.updatedAt));
      setSupportTickets(tickets);
      const nextTicketId = preferredTicketId || supportTicketId;
      if (nextTicketId && tickets.some((ticket) => ticket.id === nextTicketId)) {
        setSupportTicketId(nextTicketId);
        await loadSupportMessages(nextTicketId);
      } else {
        setSupportTicketId("");
        setSupportMessages([]);
      }
    } catch (error) {
      setSupportError(friendlyError(error));
    } finally {
      setSupportLoading(false);
    }
  }

  function openSupport() {
    setMenuOpen(false);
    navigatePath("/support");
    setSupportOpen(Boolean(user));
    setSupportError("");
    if (!user) {
      setAuthMode("login");
      setAuthOpen(true);
      setNotice("Connecte-toi pour créer un ticket et suivre les réponses du support.");
      return;
    }
    setAuthOpen(false);
    void loadSupportTickets();
  }

  async function createSupportTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) {
      setAuthOpen(true);
      setAuthMode("login");
      return;
    }
    const subject = supportSubject.trim();
    const body = supportFirstMessage.trim();
    if (subject.length < 5 || body.length < 10) {
      setSupportError("Ajoute un sujet (5 caractères minimum) et décris le problème en au moins 10 caractères.");
      return;
    }
    setSupportBusy(true);
    setSupportError("");
    try {
      const ticketRef = doc(collection(db, "supportTickets"));
      const messageRef = doc(collection(db, "supportTickets", ticketRef.id, "messages"));
      const batch = writeBatch(db);
      batch.set(ticketRef, {
        uid: user.uid,
        username: displayName.slice(0, 60),
        email: (user.email || "").slice(0, 254),
        subject: subject.slice(0, 120),
        category: supportCategory,
        status: "open",
        lastMessagePreview: body.slice(0, 180),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastMessageAt: serverTimestamp(),
      });
      batch.set(messageRef, {
        authorUid: user.uid,
        authorName: displayName.slice(0, 60),
        authorRole: isSupportAdmin(user.uid) ? "support" : "user",
        body: body.slice(0, 4000),
        createdAt: serverTimestamp(),
      });
      await batch.commit();
      setSupportSubject("");
      setSupportCategory("bug");
      setSupportFirstMessage("");
      setSupportTicketId(ticketRef.id);
      setNotice("Ticket créé. Tu peux suivre ici les prochaines réponses.");
      await loadSupportTickets(ticketRef.id);
    } catch (error) {
      setSupportError(friendlyError(error));
    } finally {
      setSupportBusy(false);
    }
  }

  async function sendSupportReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !supportTicketId) return;
    const body = supportReply.trim();
    if (body.length < 2) {
      setSupportError("Écris un message avant de l’envoyer.");
      return;
    }
    const ticket = supportTickets.find((entry) => entry.id === supportTicketId);
    if (!ticket) return;
    setSupportBusy(true);
    setSupportError("");
    try {
      const messageRef = doc(collection(db, "supportTickets", supportTicketId, "messages"));
      await setDoc(messageRef, {
        authorUid: user.uid,
        authorName: isSupportAdmin(user.uid) ? "Support KOVA" : displayName.slice(0, 60),
        authorRole: isSupportAdmin(user.uid) ? "support" : "user",
        body: body.slice(0, 4000),
        createdAt: serverTimestamp(),
      });
      const nextStatus: SupportStatus = isSupportAdmin(user.uid)
        ? ticket.status === "open" ? "in_progress" : ticket.status
        : ticket.status === "resolved" || ticket.status === "closed" ? "open" : ticket.status;
      await updateDoc(doc(db, "supportTickets", supportTicketId), {
        lastMessagePreview: body.slice(0, 180),
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        status: nextStatus,
      });
      setSupportReply("");
      await loadSupportTickets(supportTicketId);
    } catch (error) {
      setSupportError(friendlyError(error));
      await loadSupportMessages(supportTicketId);
    } finally {
      setSupportBusy(false);
    }
  }

  async function changeSupportStatus(status: SupportStatus) {
    if (!user || !supportTicketId) return;
    setSupportStatusBusy(true);
    setSupportError("");
    try {
      await updateDoc(doc(db, "supportTickets", supportTicketId), {
        status,
        updatedAt: serverTimestamp(),
      });
      await loadSupportTickets(supportTicketId);
    } catch (error) {
      setSupportError(friendlyError(error));
    } finally {
      setSupportStatusBusy(false);
    }
  }

  useEffect(() => {
    const onPopState = () => setRoutePath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const path = (routePath.length > 1 && routePath.endsWith("/") ? routePath.slice(0, -1) : routePath) || "/";
    if (path === "/connexion") {
      if (appliedRouteRef.current !== path) {
        setAuthMode("login");
        setAuthOpen(true);
        setScreen("home");
        appliedRouteRef.current = path;
      }
      return;
    }
    if (path.startsWith("/profil/")) {
      const profileUid = decodeURIComponent(path.slice("/profil/".length));
      setScreen("home");
      setAuthOpen(false);
      setSupportOpen(false);
      if (profileUid) {
        setPublicProfileLoading(true);
        setPublicProfile({ uid: profileUid, username: "Chargement…", bio: "", photoURL: "", bannerURL: "" });
        setPublicProfileFollowing(false);
        void (async () => {
          try {
            const [profileSnapshot, followersSnapshot, followingSnapshot] = await Promise.all([
              getDoc(doc(db, "publicProfiles", profileUid)),
              getDocs(firestoreQuery(collection(db, "follows"), where("followingUid", "==", profileUid))),
              getDocs(firestoreQuery(collection(db, "follows"), where("followerUid", "==", profileUid))),
            ]);
            if (profileSnapshot.exists()) setPublicProfile({ uid: profileUid, ...(profileSnapshot.data() as Profile) });
            else setPublicProfile({ uid: profileUid, username: "Lecteur KOVA", bio: "", photoURL: "", bannerURL: "" });
            setPublicProfileFollowers(followersSnapshot.size);
            setPublicProfileFollowingCount(followingSnapshot.size);
            if (user && user.uid !== profileUid) {
              const followSnapshot = await getDoc(doc(db, "follows", user.uid + "_" + profileUid));
              setPublicProfileFollowing(followSnapshot.exists());
            } else setPublicProfileFollowing(false);
          } catch (error) {
            setNotice(friendlyError(error));
            setPublicProfile(null);
          } finally {
            setPublicProfileLoading(false);
          }
        })();
      }
      appliedRouteRef.current = path;
      return;
    }
    if (path === "/support") {
      setScreen("home");
      if (!user) {
        setSupportOpen(false);
        setAuthMode("login");
        setAuthOpen(true);
      } else if (appliedRouteRef.current !== path || !supportOpen) {
        setAuthOpen(false);
        setSupportOpen(true);
        void loadSupportTickets();
      }
      appliedRouteRef.current = path;
      return;
    }
    if (path === "/") {
      appliedRouteRef.current = path;
      setAuthOpen(false);
      setSupportOpen(false);
      return;
    }
    if (path === "/bibliotheque" || path === "/explorer") {
      setScreen(path === "/bibliotheque" ? "library" : "explore");
      setAuthOpen(false);
      setSupportOpen(false);
      appliedRouteRef.current = path;
      return;
    }
    const parts = path.split("/").filter(Boolean);
    const chapterRoute = parts.length >= 3 && parts[1] === "chapitre";
    const titleSlug = parts[0] === "manga" ? parts[1] : parts[0];
    if (!titleSlug || reservedRoutes.has(titleSlug)) return;
    const item = items.find((entry) => slugify(entry.title) === decodeURIComponent(titleSlug));
    if (!item) return;
    const routeKey = path;
    if (appliedRouteRef.current === routeKey) return;
    appliedRouteRef.current = routeKey;
    setAuthOpen(false);
    if (chapterRoute) {
      void openTitle(item);
      const chapterId = decodeURIComponent(parts[2]);
      void openDemoChapter(chapterId, "Chapitre");
      navigatePath(routeKey, true);
    } else {
      void openTitle(item);
      setScreen("explore");
    }
  }, [routePath, items, user, supportOpen]);

  const displayName = profile.username || user?.displayName || user?.email?.split("@")[0] || "Lecteur";
  const savedIds = new Set(library.map((entry) => entry.id));
  const recentItems = items.slice(0, 8);
  const heroItems = items.slice(0, 3);
  const readerChapters = selectedItem?.chapters ?? [];
  const readerChapterIndex = readerChapters.findIndex((chapter) => chapter.mangaDexChapterId === readerChapterId);
  const currentReaderChapter = readerChapterIndex >= 0 ? readerChapters[readerChapterIndex] : undefined;

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="mobile-menu icon-button" aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"} aria-expanded={menuOpen} aria-controls="primary-navigation" onClick={() => setMenuOpen((open) => !open)}>
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <button className="brand" onClick={() => goTo("home")} aria-label="KOVA accueil">
          <span className="brand-mark">K</span><span>KOVA</span><span className="brand-dot">.</span>
        </button>
        <nav id="primary-navigation" aria-label="Navigation principale" className={menuOpen ? "nav-links nav-open" : "nav-links"}>
          <button className={screen === "home" ? "nav-link active" : "nav-link"} onClick={() => { setMenuOpen(false); goTo("home"); }}><Compass size={16} /> Accueil</button>
          <button className={screen === "explore" ? "nav-link active" : "nav-link"} onClick={() => { setMenuOpen(false); goTo("explore"); }}><Search size={16} /> Explorer</button>
          <button className={screen === "library" ? "nav-link active" : "nav-link"} onClick={() => { setMenuOpen(false); goTo("library"); }}><LibraryBig size={16} /> Bibliothèque</button>
          <button className={supportOpen ? "nav-link active" : "nav-link"} onClick={() => { setMenuOpen(false); openSupport(); }}><LifeBuoy size={16} /> Support / tickets</button>
        </nav>
        <div className="top-actions">
          <button className="icon-button search-button" aria-label="Lancer une recherche" onClick={() => { goTo("explore"); document.getElementById("catalog-search")?.focus(); }}><Search size={19} /></button>
          {user ? (
            <button className="profile-chip" onClick={openProfile}>
              {profile.photoURL ? <img className="avatar" src={profile.photoURL} alt="" /> : <span className="avatar">{displayName.slice(0, 1).toUpperCase()}</span>}
              <span className="profile-name">{displayName}</span>
            </button>
          ) : <button className="login-link" onClick={() => { setAuthMode("login"); setAuthOpen(true); navigatePath("/connexion"); }}><LogIn size={16} /> Connexion</button>}
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
                <p>Explore les mangas japonais et les manhwas coréens du catalogue local, puis lis les chapitres directement ici.</p>
                <div className="hero-actions">
                  <button className="primary-button" onClick={() => goTo("explore")}><Compass size={17} /> Explorer le catalogue <ArrowRight size={17} /></button>
                  <button className="quiet-button" onClick={() => goTo("library")}><LibraryBig size={17} /> Ma bibliothèque</button>
                </div>
                <form className="hero-search" onSubmit={(event) => { event.preventDefault(); goTo("explore"); }}>
                  <Search size={18} aria-hidden="true" />
                  <input
                    aria-label="Rechercher un manga ou un manhwa"
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Un titre en tête ? Recherche ici…"
                  />
                  <button type="submit" aria-label="Rechercher"><ArrowRight size={18} /></button>
                </form>
                <div className="hero-tags"><span>MANGA JAPONAIS</span><span>MANHWA CORÉEN</span><span>LECTEUR EN DÉMO</span></div>
                <div className="hero-trust"><ShieldCheck size={15} /> MODE DÉMONSTRATION · SANS API</div>
              </div>
              <div className="hero-art" aria-label="Aperçu du catalogue KOVA">
                <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
                <div className="art-center"><span>K</span><small>READ YOUR NEXT WORLD</small></div>
                {heroItems.map((item, index) => (
                  <button className={`floating-cover floating-cover-${index + 1}`} key={item.id} onClick={() => void openTitle(item)} aria-label={`Découvrir ${item.title}`}>
                    {item.cover ? <img src={item.cover} alt="" /> : <span><BookOpen size={24} /></span>}
                  </button>
                ))}
                <span className="art-orbit-label">MANGA · MANHWA</span>
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
              </div>
            </section>

            <section className="page-section featured-section">
              <div className="section-heading">
                <div><span className="section-kicker">À DÉCOUVRIR</span><h2>Le catalogue du moment</h2></div>
                <button className="text-link" onClick={() => goTo("explore")}>Voir le catalogue <ArrowRight size={16} /></button>
              </div>
              {catalogLoading ? <LoadingState text="On prépare les découvertes…" /> : catalogError ? <ErrorState message={catalogError} onRetry={() => setRefreshIndex((value) => value + 1)} /> : (
                <div className="media-grid">
                  {recentItems.slice(0, 8).map((item) => <MediaCard key={item.id} item={item} saved={savedIds.has(item.id)} onOpen={() => void openTitle(item)} onSave={() => void saveToLibrary(item)} />)}
                </div>
              )}
              {!catalogLoading && !catalogError && items.length === 0 && <EmptyState title="Catalogue vide pour l’instant" text="Change le filtre ou lance une recherche pour trouver un titre." />}
            </section>

            <CatalogPulse
              savedIds={savedIds}
              onOpen={(item) => void openTitle(item)}
              onSave={(item) => void saveToLibrary(item)}
            />
          </>
        )}

        {screen === "explore" && (
          <section className="page-section explore-page">
            <div className="explore-heading">
              <span className="section-kicker">LE GRAND CATALOGUE</span>
              <h1>Ton prochain coup de cœur<br /><span>est peut-être ici.</span></h1>
              <p>Teste la recherche, les filtres et les fiches du catalogue local. Les pages externes ne sont pas chargées.</p>
            </div>
            <div className="catalog-toolbar">
              <label className="search-field" htmlFor="catalog-search"><Search size={19} /><input id="catalog-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Titre, univers, mot-clé…" /><kbd>⌕</kbd></label>
              <div className="filter-tabs" role="group" aria-label="Filtrer le catalogue">
                {kindOptions.map((option) => <button key={option.value} className={selectedKind === option.value ? "filter-tab selected" : "filter-tab"} onClick={() => setSelectedKind(option.value)}>{option.label}</button>)}
              </div>
            </div>
            <div className="catalog-results-heading">
              <div><h2>{selectedKind === "all" ? "Tout le catalogue" : kindOptions.find((option) => option.value === selectedKind)?.label}</h2><span className="muted-caption">{query ? `Résultats pour « ${query} »` : "Une sélection alimentée par des catalogues publics"}</span></div>
              <span className="catalog-provider">SOURCE · DONNÉES LOCALES</span>
            </div>
            {catalogLoading ? <LoadingState text="Recherche dans le catalogue…" /> : catalogError ? <ErrorState message={catalogError} onRetry={() => setRefreshIndex((value) => value + 1)} /> : (
              <>
                {items.length > 0 ? <div className="media-grid">{items.map((item) => <MediaCard key={item.id} item={item} saved={savedIds.has(item.id)} onOpen={() => void openTitle(item)} onSave={() => void saveToLibrary(item)} />)}</div> : <EmptyState title="Aucun résultat trouvé" text="Essaie un autre titre ou une autre catégorie." />}
                {hasMore && <div className="load-more-wrap"><button className="secondary-button" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? "Chargement…" : "Afficher plus de titres"} <ArrowRight size={16} /></button></div>}
              </>
            )}
            <p className="catalog-note"><ShieldCheck size={16} /> Les données affichées sont fictives et servent à tester la recherche, les fiches, la navigation et la bibliothèque.</p>
          </section>
        )}

        {screen === "library" && (
          <section className="page-section library-page">
            <div className="section-heading library-heading">
              <div><span className="section-kicker">TON ESPACE PERSONNEL</span><h1>Ma bibliothèque<span className="purple-period">.</span></h1><p>Un endroit pour suivre tes lectures, sans perdre le fil.</p></div>
              {user && <span className="library-count">{library.length} {library.length > 1 ? "séries" : "série"}</span>}
            </div>
            {user && (
              <div className="anilist-sync-panel">
                <div>
                  <span className="section-kicker">MODE DÉVELOPPEMENT</span>
                  <h2>Catalogue local de démonstration</h2>
                  <p>Les APIs de catalogue et de métadonnées sont désactivées. Les titres fictifs servent à tester l’interface, la navigation et la bibliothèque. La connexion Firebase reste active.</p>
                </div>
              </div>
            )}
            {!user ? (
              <div className="empty-panel"><span className="empty-icon"><LibraryBig size={26} /></span><h2>Ta bibliothèque t’attend</h2><p>Connecte-toi pour synchroniser tes favoris et suivre l’avancement de tes lectures.</p><button className="primary-button" onClick={() => setAuthOpen(true)}><LogIn size={17} /> Se connecter</button></div>
            ) : library.length === 0 ? (
              <div className="empty-panel"><span className="empty-icon"><Heart size={26} /></span><h2>La première page est à toi</h2><p>Ajoute une fiche avec le cœur pour commencer ta bibliothèque.</p><button className="primary-button" onClick={() => goTo("explore")}><Compass size={17} /> Explorer les titres</button></div>
            ) : (
              <div className="library-grid">
                {library.map((entry) => (
                  <article className="library-card" key={entry.id}>
                    <button className="library-card-open" onClick={() => void openTitle(entry)}>
                      {entry.cover ? <img src={entry.cover} alt="" loading="lazy" /> : <span className="cover-placeholder"><BookOpen size={26} /></span>}
                      <span className="library-card-main"><strong>{entry.title}</strong><small>{entry.kind === "manhwa" ? "Manhwa" : "Manga"}</small></span>
                    </button>
                    <label className="status-select-label">État de lecture
                      <select value={entry.libraryStatus} onChange={(event) => void changeLibraryStatus(entry, event.target.value as LibraryStatus)}>
                        {libraryStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                    <div className="library-card-actions"><button className="small-outline" onClick={() => void openTitle(entry)}>Détails</button><button className="remove-link" onClick={() => void removeFromLibrary(entry)}>Retirer</button></div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {screen === "reader" && (
          <section className="full-reader-page" aria-label="Lecteur manga catalogue local">
            <div className="reader-page-toolbar">
              <button className="secondary-button" onClick={() => { setScreen(readerReturnScreen); setReaderOpen(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}><ArrowRight className="reader-back-icon" size={16} /> Retour à la fiche</button>
              <div className="reader-page-title"><strong>{selectedItem?.title ?? "Lecture catalogue local"}</strong><span>{readerChapterTitle}</span></div>
              {readerChapterId && <span className="reader-in-site-label"><ShieldCheck size={15} /> Lecture intégrée dans KOVA</span>}
            </div>
            <div className="reader-page-controls">
              <button className="secondary-button" onClick={() => void switchReaderQuality(readerQuality === "data-saver" ? "data" : "data-saver")} disabled={readerLoading}>
                {readerQuality === "data-saver" ? "Mode Éco actif · Passer en HQ" : "HQ actif · Passer en Éco"}
              </button>
              <span>{readerQuality === "data-saver" ? "Images compressées pour économiser les données mobiles." : "Images d'origine, plus gourmandes en données."}</span>
              {readerChapterPages.length > 0 && <span>{readerChapterPages.length} pages</span>}
            </div>
            {readerError && <div className="reader-error"><p>{readerError}</p><button className="secondary-button" onClick={() => void openDemoChapter(readerChapterId, readerChapterTitle)}>Réessayer</button></div>}
            {readerLoading && <LoadingState text="KOVA prépare les pages de démonstration…" />}
            {!readerLoading && readerChapterPages.length > 0 && (
              <div className="mangadex-pages full-reader-pages">
                {readerChapterPages.map((pageUrl, pageIndex) => <img key={pageUrl} src={pageUrl} alt={"Page " + (pageIndex + 1) + " · " + readerChapterTitle} loading={pageIndex < 2 ? "eager" : "lazy"} />)}
              </div>
            )}
            {!readerLoading && !readerError && readerChapterPages.length === 0 && <EmptyState title="Aucune page chargée" text="Le lecteur est prêt côté interface, mais les pages de contenu restent désactivées dans cette version de démonstration." />}
            <div className="reader-bottom-navigation">
              <button className="secondary-button" disabled={readerChapterIndex <= 0 || readerLoading} onClick={() => { const chapter = readerChapters[readerChapterIndex - 1]; if (chapter) void openDemoChapter(chapter.mangaDexChapterId, chapter.title); }}>← Chapitre précédent</button>
              <span>{currentReaderChapter?.scanlationGroup ? "Traduction : " + currentReaderChapter.scanlationGroup : "Mode démonstration"}</span>
              <button className="secondary-button" disabled={readerChapterIndex < 0 || readerChapterIndex >= readerChapters.length - 1 || readerLoading} onClick={() => { const chapter = readerChapters[readerChapterIndex + 1]; if (chapter) void openDemoChapter(chapter.mangaDexChapterId, chapter.title); }}>Chapitre suivant →</button>
            </div>
            <p className="reader-credit">Mode développement : aucune page ou source de lecture externe n’est chargée.</p>
          </section>
        )}

        {screen !== "reader" && (
          <section className="source-section page-section">
            <div className="source-copy"><span className="section-kicker">SOURCE UNIQUE</span><h2>Manga et manhwa.<br /><span>Interface en mode local.</span></h2><p>KOVA affiche des données fictives locales pour tester le catalogue et la navigation. Les chapitres et pages en ligne sont désactivés pendant cette phase.</p></div>
            <div className="official-links"><div className="official-reading-note"><span className="official-icon">M</span><span><strong>Catalogue local</strong><small>Catalogue et pages affichés dans KOVA, sans quitter le site</small></span><ShieldCheck size={16} /></div></div>
          </section>
        )}

      </main>

      {screen !== "reader" && <footer className="site-footer">
        <button className="brand footer-brand" onClick={() => goTo("home")}><span className="brand-mark">K</span><span>KOVA</span><span className="brand-dot">.</span></button>
        <span>Manga · Manhwa</span>
        <div className="footer-links"><button type="button" onClick={() => goTo("home")}>Accueil</button><button type="button" onClick={() => goTo("explore")}>Explorer</button><button type="button" onClick={() => goTo("library")}>Ma bibliothèque</button></div>
        <div className="footer-legal-links"><button type="button" onClick={() => { setLegalSection("terms"); setLegalOpen(true); }}><FileText size={13} /> Conditions d’utilisation</button><button type="button" onClick={() => { setLegalSection("privacy"); setLegalOpen(true); }}><LockKeyhole size={13} /> Confidentialité</button><button type="button" onClick={() => { setLegalSection("copyright"); setLegalOpen(true); }}><Copyright size={13} /> Copyright</button><button type="button" onClick={() => { setLegalSection("community"); setLegalOpen(true); }}><Scale size={13} /> Règles de la communauté</button><button type="button" onClick={() => { setLegalSection("safety"); setLegalOpen(true); }}><ShieldCheck size={13} /> Sécurité et signalements</button></div>
        <span>© {new Date().getFullYear()} KOVA · Tous droits réservés</span>
      </footer>}

      {notice && <div className="notice-toast" role="status"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Fermer le message"><X size={16} /></button></div>}

      {authOpen && (
        <Modal title={authMode === "signup" ? "Rejoins KOVA" : "Content de te revoir"} subtitle="Un compte, toute ta bibliothèque manga et manhwa, synchronisée entre tes sessions." onClose={() => { setAuthOpen(false); navigatePath(routePath === "/connexion" || routePath === "/support" ? "/" : routePath, true); }}>
          <div className="auth-methods">
            <button className="google-auth-button" type="button" onClick={() => void handleGoogleAuth()} disabled={busy || googleBusy}>
              <svg className="google-auth-mark" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h6.44a5.5 5.5 0 0 1-2.39 3.61v2.95h3.87c2.27-2.09 3.57-5.16 3.57-8.59z" />
                <path fill="#34A853" d="M12 24c3.24 0 5.96-1.08 7.95-2.93l-3.87-2.95c-1.08.72-2.46 1.15-4.08 1.15-3.14 0-5.8-2.12-6.75-4.97H1.25v3.04C3.23 21.15 7.27 24 12 24z" />
                <path fill="#FBBC05" d="M5.25 14.3a7.2 7.2 0 0 1 0-4.6V6.66H1.25a12 12 0 0 0 0 10.68z" />
                <path fill="#EA4335" d="M12 4.75c1.77 0 3.36.61 4.61 1.82l3.44-3.44C17.95 1.19 15.24 0 12 0 7.27 0 3.23 2.85 1.25 6.66l4 3.04c.95-2.85 3.61-4.95 6.75-4.95z" />
              </svg>
              <span>{googleBusy ? "Connexion avec Google…" : "Continuer avec Google"}</span>
            </button>
            <div className="auth-divider"><span>OU AVEC TON E-MAIL</span></div>
          </div>
          <div className="auth-tabs" role="tablist" aria-label="Méthode de compte">
            <button type="button" role="tab" aria-selected={authMode === "signup"} className={authMode === "signup" ? "selected" : ""} onClick={() => { setAuthMode("signup"); setPasswordVisible(false); setNotice(""); }}>Créer un compte</button>
            <button type="button" role="tab" aria-selected={authMode === "login"} className={authMode === "login" ? "selected" : ""} onClick={() => { setAuthMode("login"); setPasswordVisible(false); setNotice(""); }}>Connexion</button>
          </div>
          <form className="form-stack" onSubmit={handleAuth}>
            {authMode === "signup" && <label>Pseudonyme<input autoComplete="nickname" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Ton pseudo KOVA" maxLength={30} /></label>}
            <label>Adresse e-mail<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="toi@exemple.com" /></label>
            <label>Mot de passe
              <span className="auth-password-wrap">
                <input type={passwordVisible ? "text" : "password"} autoComplete={authMode === "signup" ? "new-password" : "current-password"} minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="6 caractères minimum" />
                <button className="password-visibility" type="button" onClick={() => setPasswordVisible((visible) => !visible)} aria-label={passwordVisible ? "Masquer le mot de passe" : "Afficher le mot de passe"} title={passwordVisible ? "Masquer le mot de passe" : "Afficher le mot de passe"} disabled={busy || googleBusy}>
                  {passwordVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </span>
            </label>
            <button className="primary-button full-button" type="submit" disabled={busy || googleBusy}>{busy ? "Patiente…" : authMode === "signup" ? "Créer mon compte" : "Me connecter"} <ArrowRight size={17} /></button>
            {authMode === "login" && (
              <button className="auth-reset-link" type="button" onClick={() => void handlePasswordReset()} disabled={resetBusy || busy || googleBusy}>
                {resetBusy ? "Envoi du lien…" : "Mot de passe oublié ?"}
              </button>
            )}
          </form>
          <p className="modal-footnote"><ShieldCheck size={14} /> Connexion sécurisée par Firebase. Ton mot de passe n’est pas enregistré dans ton profil KOVA.</p>
        </Modal>
      )}

      {publicProfile && routePath.startsWith("/profil/") && (
        <Modal title="Profil KOVA" subtitle="Un espace personnel, unique à chaque lecteur." onClose={() => { setPublicProfile(null); navigatePath("/", true); }} wide>
          {publicProfileLoading ? <LoadingState text="Chargement du profil…" /> : (
            <section className="premium-profile">
              <div className="premium-profile-cover">
                {publicProfile.bannerURL ? <img src={publicProfile.bannerURL} alt="Bannière du profil" /> : <div className="premium-profile-cover-art"><span>KOVA</span><Sparkles size={30} /></div>}
                <div className="premium-profile-cover-shade" />
              </div>
              <div className="premium-profile-main">
                <div className="premium-profile-avatar">{publicProfile.photoURL ? <img src={publicProfile.photoURL} alt="" /> : <span>{(publicProfile.username || "K").slice(0, 1).toUpperCase()}</span>}</div>
                <div className="premium-profile-identity"><span className="premium-profile-kicker"><Sparkles size={13} /> KOVA MEMBER</span><h3>{publicProfile.username || "Lecteur KOVA"}</h3>
                  {publicProfile.uid === "fL5Gz1lTOUY11JRu14KHKcDD95q1" && <span className="premium-owner-badge"><ShieldCheck size={13} /> OWNER</span>}
                </div>
                {user?.uid === publicProfile.uid ? <button className="secondary-button" onClick={() => { setPublicProfile(null); openProfile(); }}>Modifier le profil</button> : <button className={publicProfileFollowing ? "secondary-button profile-follow-button is-following" : "primary-button profile-follow-button"} onClick={() => void togglePublicProfileFollow()} disabled={followBusy}>{publicProfileFollowing ? <UserCheck size={16} /> : <UserPlus size={16} />}{followBusy ? "Patiente…" : publicProfileFollowing ? "Abonné" : user ? "Suivre" : "Connecte-toi pour suivre"}</button>}
              </div>
              <div className="premium-profile-body">
                <div className="premium-profile-section"><span className="section-kicker">À PROPOS</span><p>{publicProfile.bio?.trim() || "Ce lecteur préfère laisser son profil mystérieux."}</p></div>
                <div className="premium-profile-stats community-profile-stats"><div><Users size={17} /><strong>{publicProfileFollowers}</strong><span>Abonnés</span></div><div><UserCheck size={17} /><strong>{publicProfileFollowingCount}</strong><span>Abonnements</span></div><div><ShieldCheck size={17} /><strong>Membre</strong><span>Communauté KOVA</span></div></div>
                <div className="premium-profile-link"><span>URL du profil</span><code>{window.location.origin}/profil/{publicProfile.uid}</code><button className="small-outline" onClick={() => { void navigator.clipboard?.writeText(window.location.origin + "/profil/" + publicProfile.uid); setNotice("Lien du profil copié."); }}>Copier le lien</button></div>
              </div>
            </section>
          )}
        </Modal>
      )}
      {profileOpen && user && (
        <Modal title="Personnaliser mon profil" subtitle="Un profil premium, gratuit, avec ta bannière, ton avatar et ta signature." onClose={() => setProfileOpen(false)} wide>
          <form className="form-stack premium-profile-editor" onSubmit={saveProfile}>
            <div className="profile-editor-hero">
              <div className="profile-editor-hero-copy"><span className="section-kicker">TON IDENTITÉ KOVA</span><h3>Fais de ton profil ton univers.</h3><p>Choisis une bannière, un avatar et quelques mots qui te ressemblent.</p></div>
              <span className="profile-free-pill"><Sparkles size={13} /> PREMIUM · GRATUIT</span>
            </div>
            <section className="profile-image-panel">
              <div className="premium-profile-cover editor-cover">
                {profileDraft.bannerURL ? <img src={profileDraft.bannerURL} alt="Aperçu de la bannière" /> : <div className="premium-profile-cover-art"><span>KOVA</span><Sparkles size={30} /></div>}
                <div className="premium-profile-cover-shade" /><span className="premium-cover-label">APERÇU DE LA BANNIÈRE</span>
              </div>
              <div className="profile-image-controls">
                <div className="profile-image-description"><strong>Ta bannière</strong><small>Format large conseillé · paysage</small></div>
                <label className="profile-upload-button"><span><Sparkles size={15} /> Choisir une image</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { void handleImageFile("bannerURL", event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>
                {profileDraft.bannerURL && <button className="profile-clear-button" type="button" onClick={() => setProfileDraft((draft) => ({ ...draft, bannerURL: "" }))}>Retirer</button>}
              </div>
              <div className="profile-avatar-row">
                <div className="premium-profile-editor-avatar">
                  {profileDraft.photoURL ? <img src={profileDraft.photoURL} alt="Aperçu de la photo" /> : <span>{(profileDraft.username || displayName).slice(0, 1).toUpperCase()}</span>}
                  <div><strong>{profileDraft.username || displayName}</strong><small>Photo de profil · visible sur KOVA</small></div>
                </div>
                <label className="profile-upload-button profile-avatar-upload"><span><UserRound size={15} /> Changer l’avatar</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { void handleImageFile("photoURL", event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>
                {profileDraft.photoURL && <button className="profile-clear-button" type="button" onClick={() => setProfileDraft((draft) => ({ ...draft, photoURL: "" }))}>Retirer</button>}
              </div>
            </section>
            <div className="profile-form-section"><span className="section-kicker">LES DÉTAILS</span><h3>Présente-toi</h3>
              <label>Pseudonyme<input value={profileDraft.username} onChange={(event) => setProfileDraft((draft) => ({ ...draft, username: event.target.value }))} maxLength={30} placeholder="Ton pseudo" /><small className="profile-field-hint">{profileDraft.username.length}/30 caractères</small></label>
              <label>À propos<textarea value={profileDraft.bio} onChange={(event) => setProfileDraft((draft) => ({ ...draft, bio: event.target.value }))} maxLength={180} rows={3} placeholder="Tes mangas favoris, tes genres préférés, ton univers…" /><small className="profile-field-hint">{profileDraft.bio.length}/180 caractères</small></label>
            </div>
            <details className="profile-url-options"><summary>Options avancées · utiliser une URL d’image</summary>
              <p>Tu peux aussi coller un lien direct vers une image publique en HTTPS.</p>
              <label>URL de la photo de profil<input value={profileDraft.photoURL.startsWith("data:") ? "" : profileDraft.photoURL} onChange={(event) => setProfileDraft((draft) => ({ ...draft, photoURL: event.target.value }))} type="url" placeholder="https://…" /></label>
              <label>URL de la bannière<input value={profileDraft.bannerURL.startsWith("data:") ? "" : profileDraft.bannerURL} onChange={(event) => setProfileDraft((draft) => ({ ...draft, bannerURL: event.target.value }))} type="url" placeholder="https://…" /></label>
            </details>
            <p className="modal-footnote profile-image-note"><ShieldCheck size={15} /> Les images sont redimensionnées et compressées sur ton appareil avant l’enregistrement. Aucun abonnement ni Firebase Storage requis.</p>
            <button className="primary-button full-button" type="submit" disabled={profileBusy}>{profileBusy ? "Enregistrement…" : "Enregistrer mon profil"} <Check size={17} /></button>
            <button className="secondary-button full-button" type="button" onClick={() => { setProfileOpen(false); navigatePath("/profil/" + user.uid); }}>Voir mon profil public <ArrowRight size={16} /></button>
          </form>
          <button className="logout-row" onClick={() => void handleSignOut()}><LogOut size={17} /> Se déconnecter</button>
        </Modal>
      )}
      {supportOpen && user && (
        <Modal title={isSupportAdmin(user.uid) ? "Centre de support KOVA" : "Support & tickets"} subtitle={isSupportAdmin(user.uid) ? "Lis les demandes, réponds aux lecteurs et mets à jour leur statut." : "Une question ou un problème ? Crée un ticket et garde toutes les réponses au même endroit."} onClose={() => { setSupportOpen(false); setSupportTicketId(""); setSupportMessages([]); navigatePath("/", true); }} wide>
          <div className="support-intro">
            <span className="support-intro-icon"><LifeBuoy size={23} /></span>
            <div><strong>{isSupportAdmin(user.uid) ? "Boîte de réception du support" : "On est là pour t’aider"}</strong><p>{isSupportAdmin(user.uid) ? "Les tickets sont triés du plus récemment mis à jour au plus ancien." : "Décris le souci avec assez de détails. Ne partage jamais ton mot de passe."}</p></div>
            <span className="support-security"><ShieldCheck size={15} /> Privé</span>
          </div>
          {supportError && <div className="support-error" role="alert">{supportError}<button onClick={() => setSupportError("")} aria-label="Fermer l’erreur"><X size={14} /></button></div>}
          <div className="support-layout">
            <aside className="support-ticket-sidebar">
              <button className="primary-button support-new-ticket" onClick={() => { setSupportTicketId(""); setSupportMessages([]); setSupportError(""); }}><MessageSquareText size={17} /> Nouveau ticket</button>
              <div className="support-list-heading"><span>{isSupportAdmin(user.uid) ? "Demandes reçues" : "Mes demandes"}</span><small>{supportTickets.length}</small></div>
              {supportLoading ? <div className="support-list-empty">Chargement des tickets…</div> : supportTickets.length === 0 ? <div className="support-list-empty">Aucun ticket pour l’instant.<br />Besoin d’aide ? Crée la première demande.</div> : (
                <div className="support-ticket-list">
                  {supportTickets.map((ticket) => (
                    <button key={ticket.id} className={supportTicketId === ticket.id ? "support-ticket-item selected" : "support-ticket-item"} onClick={() => { setSupportTicketId(ticket.id); setSupportMessages([]); setSupportError(""); void loadSupportMessages(ticket.id); }}>
                      <span className="support-ticket-topline"><strong>{ticket.subject}</strong><span className={"support-status status-" + ticket.status}>{supportStatusLabel(ticket.status)}</span></span>
                      <span className="support-ticket-preview">{ticket.lastMessagePreview || "Pas encore de message"}</span>
                      <span className="support-ticket-meta">{isSupportAdmin(user.uid) ? ticket.username || ticket.email : supportCategoryLabel(ticket.category)} · {new Date(timestampMillis(ticket.updatedAt) || timestampMillis(ticket.createdAt) || Date.now()).toLocaleDateString("fr-FR")}</span>
                    </button>
                  ))}
                </div>
              )}
            </aside>
            <section className="support-conversation">
              {!supportTicketId ? (
                <form className="form-stack support-compose" onSubmit={createSupportTicket}>
                  <span className="section-kicker">NOUVELLE DEMANDE</span>
                  <h3>Comment peut-on t’aider ?</h3>
                  <p>Choisis le sujet, explique ce qui se passe et l’équipe pourra te répondre ici.</p>
                  <label>Catégorie
                    <select value={supportCategory} onChange={(event) => setSupportCategory(event.target.value as SupportCategory)}>
                      <option value="bug">Bug / problème technique</option><option value="account">Compte et profil</option><option value="reading">Lecteur / chapitres</option><option value="catalog">Catalogue</option><option value="suggestion">Suggestion</option><option value="other">Autre demande</option>
                    </select>
                  </label>
                  <label>Sujet<input required minLength={5} maxLength={120} value={supportSubject} onChange={(event) => setSupportSubject(event.target.value)} placeholder="Ex. : les pages du chapitre ne chargent pas" /></label>
                  <label>Explique le problème<textarea required minLength={10} maxLength={4000} rows={5} value={supportFirstMessage} onChange={(event) => setSupportFirstMessage(event.target.value)} placeholder="Ce que tu essayais de faire, ce qui s’est passé et le navigateur utilisé…" /></label>
                  <div className="support-compose-foot"><span>{supportFirstMessage.length}/4000 caractères</span><button className="primary-button" type="submit" disabled={supportBusy}>{supportBusy ? "Création…" : "Créer le ticket"} <Send size={16} /></button></div>
                  <small className="modal-footnote">N’inclus aucun mot de passe, code de connexion ou donnée privée inutile.</small>
                </form>
              ) : (
                (() => {
                  const ticket = supportTickets.find((entry) => entry.id === supportTicketId);
                  if (!ticket) return <div className="support-list-empty">Cette demande n’est plus disponible. Actualise la liste ou crée un nouveau ticket.</div>;
                  return (
                    <div className="support-thread">
                      <div className="support-thread-heading">
                        <div><span className="section-kicker">{supportCategoryLabel(ticket.category)}</span><h3>{ticket.subject}</h3><p>{isSupportAdmin(user.uid) ? "Créé par " + (ticket.username || ticket.email) : "Demande envoyée à l’équipe KOVA"}</p></div>
                        <span className={"support-status status-" + ticket.status}>{supportStatusLabel(ticket.status)}</span>
                      </div>
                      {isSupportAdmin(user.uid) ? (
                        <div className="support-status-controls">
                          <label>Statut
                            <select value={ticket.status} disabled={supportStatusBusy} onChange={(event) => void changeSupportStatus(event.target.value as SupportStatus)}>
                              <option value="open">Ouvert</option><option value="in_progress">En cours</option><option value="resolved">Résolu</option><option value="closed">Fermé</option>
                            </select>
                          </label>
                        </div>
                      ) : ticket.status !== "resolved" && ticket.status !== "closed" ? (
                        <div className="support-status-controls"><button className="small-outline" onClick={() => void changeSupportStatus("resolved")} disabled={supportStatusBusy}>Marquer comme résolu</button></div>
                      ) : (
                        <div className="support-resolved-note"><ShieldCheck size={15} /> {ticket.status === "resolved" ? "Cette demande est marquée comme résolue. Réponds pour la rouvrir." : "Cette demande est fermée. Un nouveau message la rouvrira."}</div>
                      )}
                      <div className="support-messages" aria-live="polite">
                        {supportMessages.length === 0 ? <div className="support-list-empty">Chargement ou aucun message disponible…</div> : supportMessages.map((message) => (
                          <article key={message.id} className={"support-message " + (message.authorRole === "support" ? "from-support" : "from-user")}>
                            <div className="support-message-head"><strong>{message.authorRole === "support" ? "Support KOVA" : message.authorName || "Lecteur"}</strong><time>{new Date(timestampMillis(message.createdAt) || Date.now()).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</time></div>
                            <p>{message.body}</p>
                          </article>
                        ))}
                      </div>
                      <form className="support-reply-form" onSubmit={sendSupportReply}>
                        <label htmlFor="support-reply">Ta réponse</label>
                        <textarea id="support-reply" value={supportReply} onChange={(event) => setSupportReply(event.target.value)} maxLength={4000} rows={3} placeholder="Écris une réponse claire et respectueuse…" required />
                        <div className="support-compose-foot"><span>{supportReply.length}/4000 caractères</span><button className="primary-button" type="submit" disabled={supportBusy}>{supportBusy ? "Envoi…" : isSupportAdmin(user.uid) ? "Répondre au lecteur" : "Envoyer la réponse"} <Send size={16} /></button></div>
                      </form>
                    </div>
                  );
                })()
              )}
            </section>
          </div>
        </Modal>
      )}
      {legalOpen && (
        <Modal title="Centre juridique KOVA" subtitle="Les règles essentielles, présentées clairement et accessibles à tout moment." onClose={() => setLegalOpen(false)} wide>
          <div className="legal-hero"><span className="legal-hero-icon"><Scale size={25} /></span><div><span className="section-kicker">KOVA · INFORMATIONS OFFICIELLES</span><h3>Un espace de lecture respectueux.</h3><p>Lis les règles avant d’utiliser les fonctionnalités de KOVA. Cette page est une base informative à adapter aux lois applicables avant un lancement public.</p></div></div>
          <div className="legal-tabs" role="tablist" aria-label="Documents juridiques">
            <button role="tab" aria-selected={legalSection === "terms"} className={legalSection === "terms" ? "selected" : ""} onClick={() => setLegalSection("terms")}><FileText size={15} /> Conditions</button>
            <button role="tab" aria-selected={legalSection === "privacy"} className={legalSection === "privacy" ? "selected" : ""} onClick={() => setLegalSection("privacy")}><LockKeyhole size={15} /> Confidentialité</button>
            <button role="tab" aria-selected={legalSection === "copyright"} className={legalSection === "copyright" ? "selected" : ""} onClick={() => setLegalSection("copyright")}><Copyright size={15} /> Copyright</button>
            <button role="tab" aria-selected={legalSection === "community"} className={legalSection === "community" ? "selected" : ""} onClick={() => setLegalSection("community")}><Scale size={15} /> Communauté</button>
            <button role="tab" aria-selected={legalSection === "safety"} className={legalSection === "safety" ? "selected" : ""} onClick={() => setLegalSection("safety")}><ShieldCheck size={15} /> Sécurité</button>
          </div>
          <article className="legal-document" role="tabpanel">
            {legalSection === "terms" && <>
              <span className="legal-version">DOCUMENT 01 · CONDITIONS D’UTILISATION</span><h3>Bienvenue sur KOVA</h3><p>En accédant à KOVA, tu acceptes d’utiliser le service de manière légale, honnête et respectueuse. Si tu n’acceptes pas ces règles, n’utilise pas les fonctions concernées.</p>
              <h4>1. Compte et accès</h4><p>Tu es responsable de la sécurité de ton compte et des actions effectuées depuis celui-ci. Fournis des informations exactes, garde tes identifiants secrets et signale toute activité inhabituelle. Ne tente pas d’accéder au compte ou aux données d’une autre personne.</p>
              <h4>2. Utilisation autorisée</h4><p>Tu peux utiliser les outils de catalogue, de bibliothèque et de profil selon leur disponibilité. Il est interdit de perturber le service, contourner ses protections, automatiser des abus, diffuser des logiciels malveillants ou utiliser KOVA pour enfreindre la loi.</p>
              <h4>3. Disponibilité et évolutions</h4><p>KOVA peut être modifié, interrompu ou corrigé pour des raisons techniques, de sécurité ou de droits. Certaines fonctions et données de démonstration peuvent être incomplètes et ne constituent pas une promesse de disponibilité permanente.</p>
              <h4>4. Contenu et responsabilité</h4><p>Tu conserves les droits sur les contenus que tu crées, sous réserve des droits de tiers. Tu ne dois publier que des éléments que tu as le droit d’utiliser. KOVA ne revendique pas la propriété des œuvres de leurs auteurs.</p>
              <h4>5. Suspension et contact</h4><p>Les abus, atteintes aux droits ou risques de sécurité peuvent entraîner la limitation d’une fonction ou d’un compte, avec examen raisonnable du signalement. Pour une demande, utilise le centre Support / tickets de l’application.</p>
            </>}
            {legalSection === "privacy" && <>
              <span className="legal-version">DOCUMENT 02 · CONFIDENTIALITÉ</span><h3>Ta vie privée compte.</h3><p>KOVA doit collecter uniquement les informations nécessaires au fonctionnement des fonctions que tu utilises. Cette section décrit les pratiques prévues par l’application et doit être vérifiée par rapport à la configuration réelle avant publication.</p>
              <h4>Données pouvant être traitées</h4><p>Selon les fonctions activées : identifiant de compte Firebase, adresse e-mail pour l’authentification, pseudonyme, biographie, avatar, bannière, bibliothèque et demandes envoyées au support. Les données de connexion sont gérées par le fournisseur d’authentification.</p>
              <h4>Utilisation et visibilité</h4><p>Les informations servent à connecter ton compte, enregistrer tes préférences, afficher les éléments de profil prévus et répondre aux tickets. N’ajoute pas d’informations sensibles dans ta biographie ou tes messages. Un profil public ne doit jamais afficher ton adresse e-mail ou des informations privées.</p>
              <h4>Stockage et prestataires</h4><p>KOVA utilise Firebase pour certaines fonctions de compte et de données. Les règles d’accès et la configuration du projet déterminent qui peut lire ou modifier les données. Les images de profil peuvent être compressées dans le navigateur avant leur enregistrement.</p>
              <h4>Contrôle de tes données</h4><p>Tu peux modifier les informations de profil disponibles. Pour demander l’accès, la correction ou la suppression de données associées à ton compte, contacte l’équipe via le support. Certaines traces peuvent être conservées lorsque la loi ou la sécurité l’exige.</p>
              <h4>Important avant publication</h4><p>Le responsable du service doit compléter les coordonnées, les durées de conservation, les éventuels transferts internationaux et la procédure de suppression, puis vérifier la conformité aux lois applicables, notamment celles concernant les mineurs.</p>
            </>}
            {legalSection === "copyright" && <>
              <span className="legal-version">DOCUMENT 03 · DROITS D’AUTEUR</span><h3>Respecter les créateurs.</h3><p>Les mangas, manhwas, bandes dessinées, illustrations, couvertures, logos et textes peuvent être protégés par le droit d’auteur ou d’autres droits de propriété intellectuelle.</p>
              <h4>Propriété des œuvres</h4><p>Sauf indication explicite contraire, les droits restent à leurs auteurs, artistes, éditeurs ou titulaires respectifs. La présence d’une fiche ou d’une référence dans KOVA ne signifie pas que KOVA possède l’œuvre ni qu’une autorisation de reproduction a été accordée.</p>
              <h4>Contenu autorisé</h4><p>Les utilisateurs doivent publier uniquement leurs propres créations, les contenus sous licence compatible ou les éléments pour lesquels ils disposent d’une autorisation. Ne téléverse pas de chapitres complets, scans, traductions ou illustrations protégés sans permission.</p>
              <h4>Demande de retrait</h4><p>Un titulaire de droits ou son représentant peut contacter l’équipe via Support / tickets. Indique l’œuvre concernée, l’emplacement exact, les coordonnées professionnelles de contact, le droit revendiqué et une déclaration de bonne foi. Ne transmets que les informations nécessaires au traitement.</p>
              <h4>Traitement</h4><p>KOVA examinera la demande, pourra demander des précisions, limiter l’accès au contenu contesté et contacter la personne concernée lorsque cela est approprié. Les fausses déclarations délibérées peuvent avoir des conséquences juridiques.</p>
              <p className="legal-callout">Contact droits d’auteur : <strong>archangekouaho@gmail.com</strong>. Ce canal de contact ne remplace pas une procédure légale officielle si la loi applicable en exige une.</p>
            </>}
            {legalSection === "community" && <>
              <span className="legal-version">DOCUMENT 04 · CHARTE DE COMMUNAUTÉ</span><h3>La passion, sans le harcèlement.</h3><p>KOVA est un espace pour découvrir des histoires et organiser ses lectures. La communauté doit rester accueillante, même lorsque les avis diffèrent.</p>
              <h4>À faire</h4><ul><li>Respecter les autres lecteurs et leurs goûts.</li><li>Utiliser un pseudonyme et une image que tu as le droit d’utiliser.</li><li>Marquer clairement les spoilers lorsque les fonctions le permettent.</li><li>Signaler calmement les bugs, abus ou contenus problématiques.</li></ul>
              <h4>Interdit</h4><ul><li>Menaces, harcèlement, insultes ciblées ou discrimination.</li><li>Usurpation d’identité, divulgation d’informations personnelles ou doxxing.</li><li>Spam, arnaques, liens malveillants ou publicité abusive.</li><li>Contenu sexuel impliquant des mineurs, exploitation ou contenus illégaux.</li><li>Publication répétée de contenus protégés sans autorisation.</li></ul>
              <h4>Mesures possibles</h4><p>Selon la gravité et la répétition, l’équipe peut retirer un contenu, restreindre une fonction ou suspendre un compte. Les signalements sont examinés avec prudence et les décisions peuvent être contestées via le support.</p>
            </>}
            {legalSection === "safety" && <>
              <span className="legal-version">DOCUMENT 05 · SÉCURITÉ ET SIGNALEMENTS</span><h3>Protège ton compte et les autres.</h3><p>Ne partage jamais ton mot de passe, un code de vérification, une adresse personnelle ou des informations financières dans ton profil ou un ticket.</p>
              <h4>Signaler un problème</h4><p>Ouvre Support / tickets et choisis la catégorie la plus proche : compte, lecteur, catalogue, bug ou autre. Explique les étapes pour reproduire le problème, sans inclure de secret ou de donnée personnelle inutile.</p>
              <h4>Contenu dangereux ou illicite</h4><p>Signale les menaces, l’usurpation d’identité, les atteintes aux droits et tout contenu qui semble illégal. Ne partage pas davantage le contenu concerné pour le signaler. En cas de danger immédiat, contacte les services compétents de ton pays.</p>
              <h4>Protection des jeunes</h4><p>Respecte les limites d’âge et les règles locales. Les filtres automatiques ne détectent pas nécessairement tout contenu inadapté. Ne sollicite pas et ne diffuse pas de contenu sexuel impliquant des mineurs.</p>
              <h4>Bonnes pratiques</h4><p>Utilise un mot de passe unique, déconnecte-toi sur un appareil partagé et méfie-toi des liens inconnus. L’équipe KOVA ne te demandera jamais ton mot de passe.</p>
            </>}
          </article>
          <p className="legal-disclaimer"><ShieldCheck size={15} /> Modèle informatif à personnaliser et à faire vérifier avant un lancement public. Il ne constitue pas un avis juridique et ne garantit pas à lui seul la conformité légale.</p>
        </Modal>
      )}
      {settingsOpen && (
        <Modal title="Réglages KOVA" subtitle="Les réglages utiles pour garder une expérience simple et sûre." onClose={() => setSettingsOpen(false)}>
          <div className="settings-list">
            <div className="setting-row"><span className="setting-icon"><ShieldCheck size={18} /></span><span><strong>Filtre de contenu adulte</strong><small>Les classifications adultes connues sont écartées des résultats.</small></span><span className="setting-state">ACTIF</span></div>
            <div className="setting-row"><span className="setting-icon"><LibraryBig size={18} /></span><span><strong>Bibliothèque synchronisée</strong><small>{user ? "Enregistrée dans ton compte Firebase." : "Connecte-toi pour retrouver tes séries."}</small></span><span className="setting-state">{user ? "EN LIGNE" : "HORS SESSION"}</span></div>
            <div className="setting-row"><span className="setting-icon"><UserRound size={18} /></span><span><strong>Données de profil</strong><small>Les champs restent privés selon les règles Firestore du compte.</small></span><span className="setting-state">PRIVÉ</span></div>
          </div>
          <p className="modal-footnote">Les données de cette maquette sont fictives. Les intégrations de contenu externe sont désactivées pendant le travail sur l’interface.</p>
        </Modal>
      )}

      {selectedItem && screen !== "reader" && !supportOpen && (
        <Modal title={selectedItem.title} subtitle={`${selectedItem.kind === "manhwa" ? "Manhwa" : "Manga"} · ${selectedItem.year ?? "Année inconnue"} · catalogue local`} onClose={() => { setSelectedItem(null); setReaderOpen(false); setReaderChapterPages([]); setReaderChapterId(""); setReaderError(""); navigatePath("/explorer"); }} wide>
          <div className="detail-layout">
            <div className="detail-cover">
              {selectedItem.cover ? <img src={selectedItem.cover} alt={`Couverture de ${selectedItem.title}`} /> : <span className="cover-placeholder"><BookOpen size={32} /><span>KOVA</span></span>}
            </div>
            <div className="detail-copy">
              
              
              {selectedItem.alternateTitle && <p className="alternate-title">{selectedItem.alternateTitle}</p>}
              <p>{selectedItem.description || "Aucun résumé disponible pour cette fiche."}</p>
              <div className="detail-facts"><span><small>Statut</small><strong>{selectedItem.status || "Non renseigné"}</strong></span><span><small>Langue</small><strong>{selectedItem.originalLanguage === "ko" ? "Coréen" : "Japonais"}</strong></span></div>
              <button className="primary-button full-button" onClick={() => void saveToLibrary(selectedItem)}>{savedIds.has(selectedItem.id) ? <Check size={17} /> : <Heart size={17} />}{savedIds.has(selectedItem.id) ? "Dans ma bibliothèque" : "Ajouter à ma bibliothèque"}</button>
              {chapterListLoading ? (
                <LoadingState text="Recherche des chapitres dans catalogue local…" />
              ) : chapterListError ? (
                <p className="reader-error">{chapterListError}</p>
              ) : (selectedItem.chapters?.length || chapterPageHasMore) ? (
                <>
                  <button className="secondary-button full-button" onClick={() => setReaderOpen((open) => !open)}><BookOpen size={17} /> {readerOpen ? "Masquer les chapitres" : "Voir les chapitres"} <ArrowRight size={16} /></button>
                  <p className="modal-footnote">Aucune page ni source de lecture externe n’est chargée en mode démonstration.</p>
                </>
              ) : <p className="modal-footnote">Aucun chapitre lisible n'a été trouvé pour ce titre dans catalogue local.</p>}
            </div>
          </div>
          {readerOpen && (selectedItem.chapters?.length || chapterPageHasMore) ? (
            <section className="kova-reader" aria-label="Chapitres catalogue local">
              <div className="mangadex-reader">
                <div className="reader-chapter-heading"><span className="section-kicker">CHAPITRES DE DÉMONSTRATION</span><h3>Choisis un chapitre</h3><p>Cette fiche de démonstration ne contient pas de chapitre réel pendant cette phase.</p></div>
                <div className="mangadex-chapter-list">
                  {(selectedItem.chapters ?? []).slice(0, chapterVisibleCount).map((chapter) => (
                    <div className="mangadex-chapter-row" key={chapter.mangaDexChapterId}>
                      <span>{chapter.title}{chapter.scanlationGroup && <small className="chapter-attribution">Traduction : {chapter.scanlationGroup}</small>}</span>
                      <button className="secondary-button" onClick={() => void openDemoChapter(chapter.mangaDexChapterId, chapter.title)} disabled={readerLoading && readerChapterId === chapter.mangaDexChapterId}>
                        {readerLoading && readerChapterId === chapter.mangaDexChapterId ? "Chargement…" : "Lire"}
                      </button>
                    </div>
                  ))}
                </div>
                <p className="modal-footnote" aria-live="polite">
                  {Math.min(chapterVisibleCount, selectedItem.chapters?.length ?? 0)} chapitre(s) affiché(s) sur {selectedItem.chapters?.length ?? 0} chargé(s).
                </p>
                {(chapterVisibleCount < (selectedItem.chapters?.length ?? 0)) ? (
                  <button className="secondary-button full-button" onClick={() => setChapterVisibleCount((current) => current + 30)}>
                    Afficher 30 chapitres de plus
                  </button>
                ) : chapterPageHasMore ? (
                  <button className="secondary-button full-button" onClick={() => void loadMoreChapters()} disabled={chapterPageLoading}>
                    {chapterPageLoading ? "Chargement des chapitres…" : "Charger les chapitres suivants"}
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}
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
