# KOVA : configuration Firebase et Cloudflare

Projet Firebase : `kova-2026`.

## Architecture

- **Cloudflare Pages** héberge le site React/Vite généré dans `dist`.
- Firebase Authentication gère les comptes.
- Cloud Firestore stocke les profils et bibliothèques personnelles.
- Kitsu et Open Library fournissent des métadonnées de catalogue.

## Configurer Cloudflare Pages

Dans le tableau de bord Cloudflare, ouvre Workers & Pages et crée ou sélectionne un projet **Pages** lié au dépôt GitHub `archange22/Kova-new`.

Valeurs à utiliser :

- Production branch : `main`
- Build command : `npm run build`
- Build output directory : `dist`
- Node.js : version 22 conseillée

Le fichier `wrangler.toml` déclare le répertoire de sortie Pages. Le fichier `public/_redirects` redirige les routes de l'application vers `index.html` pour le fonctionnement de l'application React. Le fichier `public/_headers` ajoute des en-têtes de sécurité et un cache pour les ressources compilées.

Les valeurs `VITE_FIREBASE_*` peuvent être ajoutées dans les paramètres de build Cloudflare. La configuration Web Firebase existe déjà comme valeur par défaut dans `src/lib/firebase.ts`. Ne place jamais de clé de compte de service Firebase dans les variables `VITE_*`.

## Configurer Firebase Authentication et Firestore

1. Ouvre le projet `kova-2026` dans Firebase Console.
2. Dans Authentication, active le fournisseur **Adresse e-mail / mot de passe**.
3. Ajoute le domaine de production Cloudflare Pages aux domaines autorisés dans Authentication.
4. Crée ou vérifie la base Cloud Firestore.
5. Publie le contenu de `firestore.rules` dans Firestore > Règles. Les règles dans GitHub ne sont pas publiées automatiquement.

Tu peux publier uniquement les règles avec Firebase CLI :

```sh
firebase deploy --project kova-2026 --only firestore:rules
```

Firebase Hosting n'est pas utilisé pour servir le site.

## Vérifier le build

```sh
npm install
npm run build
```

GitHub Actions exécute aussi `npm install` et `npm run build` sur Node.js 22 lors des pushes vers `main` et des pull requests.

## Sécurité et stockage

- La configuration Firebase pour application Web est visible dans le navigateur. Ce n'est pas un mot de passe serveur : les règles Firestore et les restrictions de domaines restent essentielles.
- Ne publie jamais de clé privée, de compte de service ou de fichier JSON Admin SDK.
- Les règles Firestore isolent les profils et bibliothèques par identifiant de compte.
- Les URLs de photo et de bannière sont enregistrées dans Firestore; les images restent hébergées à l'adresse donnée.
- N'enregistre jamais les mots de passe dans Firestore.

## Catalogue et droits d'auteur

KOVA affiche les métadonnées des catalogues publics et propose des liens vers les plateformes officielles. Il ne republie pas les chapitres d'œuvres protégées. Le futur lecteur intégré doit être limité aux œuvres originales, au domaine public vérifié ou aux contenus diffusés avec autorisation.
