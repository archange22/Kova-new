# KOVA

KOVA est une interface mobile et ordinateur, en français, consacrée aux **mangas japonais et manhwas coréens**. Le catalogue provient directement de l'API publique MangaDex, et les chapitres disponibles en français ou en anglais s'ouvrent dans un lecteur intégré.

## Fonctionnalités

- Recherche directe dans le catalogue MangaDex.
- Fiches avec couverture, résumé, année et statut.
- Catalogues Manga/Manhwa via MangaDex et Anime via l’API publique Jikan (recherche, fiches, résumés, notes et pagination).
- Liste des chapitres disponibles en français ou en anglais.
- Page de lecture dédiée avec navigation chapitre précédent/suivant.
- Lecteur avec préréglages Éco, Standard et Super (Super priorise le chargement ; la résolution dépend toujours de MangaDex).
- Crédit de MangaDex et du groupe de traduction affiché dans les fiches et le lecteur.
- Authentification e-mail/mot de passe avec Firebase.
- Profil : pseudonyme, bio, URL de photo et URL de bannière.
- Bibliothèque privée Firestore avec les états À lire, En cours, Terminé, En pause et Abandonné.
- GitHub Actions vérifie le build après chaque push.

## Technologies

- React + TypeScript + Vite
- API publique MangaDex et MangaDex@Home pour les pages des chapitres
- API Jikan v4 pour le catalogue et les métadonnées Anime (sans diffusion vidéo)
- Firebase Authentication + Cloud Firestore pour les comptes et la bibliothèque
- Cloudflare Workers Static Assets pour l'hébergement statique sur `workers.dev`

## Développement local

```sh
npm install
npm run dev
```

Build de production :

```sh
npm run build
```

## Configuration Cloudflare Workers

KOVA est déployé comme **Worker avec des fichiers statiques** (pas comme un projet Cloudflare Pages). Le build Vite génère le dossier `dist`, que Wrangler publie comme assets du Worker. Cette configuration conserve le déploiement sur le sous-domaine `workers.dev`.

Dans Cloudflare, ouvre **Workers & Pages → KOVA → Settings → Builds** et utilise :

- Branche de production : `main`
- Commande de build : `npm run build`
- Commande de déploiement : `npx wrangler deploy`
- Nom du Worker : `kova` (il doit correspondre à `name` dans `wrangler.toml`)

Le fichier `wrangler.toml` indique le dossier `./dist` et active le fallback SPA afin que les routes React renvoient `index.html`. Le fichier Pages historique `public/_redirects` est exclu des assets publiés via `.assetsignore`.

## Firebase pour les comptes et la bibliothèque

Firebase sert à Auth et Firestore, **pas à héberger le site**.

1. Active Adresse e-mail / mot de passe dans Firebase Authentication.
2. Ajoute le domaine de production Cloudflare (par exemple le sous-domaine `workers.dev`) aux domaines autorisés.
3. Publie les règles Firestore mises à jour depuis la console Firebase ou avec Firebase CLI :

```sh
firebase deploy --project kova-2026 --only firestore:rules
```

Le fichier `firebase.json` ne configure plus Firebase Hosting. Consulte [FIREBASE_SETUP.md](./FIREBASE_SETUP.md).

## Utilisation du catalogue Anime

Le catalogue Anime utilise Jikan v4 pour rechercher des fiches, résumés, images, genres, année et notes. Les requêtes sont limitées côté interface et les réponses réussies sont mises en cache brièvement pour éviter les appels inutiles. Cette étape ne fournit pas de flux vidéo d’épisodes : une future intégration de lecture devra utiliser des sources autorisées et être traitée séparément.

## Utilisation de l'API MangaDex

KOVA interroge directement `https://api.mangadex.org` pour rechercher les séries et obtenir la liste de chapitres. Le lecteur utilise ensuite les URL temporaires renvoyées par MangaDex@Home; les images ne sont pas copiées dans le dépôt KOVA.

Les classifications autres que **Safe** sont exclues. Les chapitres proposés sont filtrés sur le français et l'anglais, les liens de lecture externes et les chapitres sans pages étant ignorés.

MangaDex demande aux projets utilisant son API de créditer MangaDex et les groupes de traduction, de respecter les demandes de retrait, et de ne pas proposer de publicités ou de services payants. Voir la [politique officielle d'utilisation de l'API MangaDex](https://gitlab.com/mangadex-pub/mangadex-api-docs/-/blob/main/index.md). La présence d'un titre dans son catalogue n'est pas, à elle seule, une garantie que chaque traduction dispose de tous les droits de publication. Le projet doit respecter la politique de MangaDex et les retraits demandés par les groupes.

## Limites

- Les résultats, les couvertures et les pages dépendent de l'API MangaDex, de ses limites de requêtes et de ta connexion Internet.
- KOVA ne garantit pas que chaque titre ait des chapitres traduits.
- Le filtre Safe s'appuie sur les classifications déclarées par MangaDex, qui ne remplacent pas la supervision parentale.
- Photo de profil et bannière sont des URLs externes, pas des fichiers téléversés dans Firebase Storage.
- Le build GitHub réussi ne prouve pas, à lui seul, que Cloudflare a terminé le déploiement.

Cloudflare Workers construit avec `npm run build`, puis `npx wrangler deploy` publie le dossier `dist` grâce à la configuration `[assets]` de `wrangler.toml`. Les routes SPA utilisent `not_found_handling = "single-page-application"`.
