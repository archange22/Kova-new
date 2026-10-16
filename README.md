# KOVA

KOVA est une interface responsive en français pour découvrir des mangas, manhwas, bandes dessinées et comics, puis organiser une bibliothèque personnelle.

## Fonctionnalités

- Accueil avec accès rapide aux catégories et recherche directe.
- Catalogue manga/manhwa via Kitsu et BD/comics via Open Library.
- Fiches avec couverture, résumé, statut et lien vers la source.
- Authentification e-mail/mot de passe avec Firebase.
- Profil : pseudonyme, bio, URL de photo et URL de bannière.
- Bibliothèque privée synchronisée dans Firestore avec les états À lire, En cours, Terminé, En pause et Abandonné.
- Règles Firestore limitant chaque profil et bibliothèque à son propriétaire.
- Interface mobile/ordinateur, thème sombre violet.
- GitHub Actions vérifie automatiquement le build de production.

## Technologies

- React + TypeScript + Vite
- Firebase Authentication + Cloud Firestore
- Kitsu API + Open Library Search/Covers API
- Cloudflare Pages pour l'hébergement statique

## Développement local

```sh
npm install
npm run dev
```

## Configuration Cloudflare Pages

Le projet est configuré pour **Cloudflare Pages**, pas Firebase Hosting :

- Framework : Vite
- Branche de production : `main`
- Commande de build : `npm run build`
- Répertoire de sortie : `dist`
- Version Node conseillée : 22
- Fichier Wrangler : `wrangler.toml`
- Fallback SPA : `public/_redirects`

Dans Cloudflare : Workers & Pages > créer/ouvrir le projet Pages > connecter le dépôt `archange22/Kova-new` > saisir les paramètres ci-dessus. Pour les variables d'environnement de build, configure si nécessaire les variables `VITE_FIREBASE_*` dans Settings > Variables and Secrets. Les valeurs client Firebase sont déjà configurées comme valeurs par défaut dans `src/lib/firebase.ts`, mais les domaines autorisés doivent quand même être configurés dans Firebase Authentication.

Après chaque push sur `main`, Cloudflare Pages peut reconstruire et publier le site si l'intégration Git est activée. Le workflow GitHub Actions contrôle séparément le build. Le build réussi ne prouve pas à lui seul que le site a été déployé.

## Firebase pour les comptes et la bibliothèque

Firebase reste utilisé pour Auth et Firestore, **pas pour héberger le site**.

1. Dans Firebase Authentication, active Adresse e-mail / mot de passe.
2. Dans les paramètres d'Authentication, ajoute le domaine Cloudflare Pages de production aux domaines autorisés.
3. Publie les règles Firestore du fichier `firestore.rules` depuis la console Firebase, ou avec Firebase CLI :

```sh
firebase deploy --project kova-2026 --only firestore:rules
```

Le fichier `firebase.json` ne configure plus Firebase Hosting. Consulte [FIREBASE_SETUP.md](./FIREBASE_SETUP.md).

## Droits de lecture

Le catalogue affiche des métadonnées fournies par des services tiers. Il ne télécharge ni ne republie les chapitres. Un futur lecteur intégré doit se limiter aux œuvres originales, au domaine public vérifié ou aux œuvres dont KOVA possède une autorisation de diffusion.

## Limites actuelles

- La disponibilité des résultats et des couvertures dépend des APIs externes et de la connexion.
- Le filtre adulte repose sur les classifications connues et ne constitue pas un contrôle parental complet.
- La photo et la bannière sont des URLs externes, pas des fichiers téléversés dans Firebase Storage.
- Les chapitres ne sont pas encore lus directement dans KOVA.
