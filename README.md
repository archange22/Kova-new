# KOVA

KOVA est une interface responsive en français pour découvrir des mangas, manhwas, bandes dessinées et comics, puis garder une bibliothèque personnelle.

## Fonctionnalités actuelles

- Catalogue manga/manhwa via Kitsu.
- Catalogue BD/comics via Open Library.
- Recherche et filtres par type.
- Fiches avec couverture, résumé, statut et lien vers la source de la fiche.
- Authentification e-mail/mot de passe avec Firebase.
- Profil : pseudonyme, bio, URL de photo et URL de bannière.
- Bibliothèque privée synchronisée dans Firestore avec les états À lire, En cours, Terminé, En pause et Abandonné.
- Règles Firestore limitant chaque profil et bibliothèque à son propriétaire.
- Interface responsive mobile/ordinateur, avec thème sombre violet.
- Action GitHub qui exécute le build de production.

## Technologies

- React + TypeScript + Vite
- Firebase Authentication
- Cloud Firestore
- Kitsu API
- Open Library Search/Covers API

## Développement local

```sh
npm install
npm run dev
```

## Contrôle de production

```sh
npm run build
npm run preview
```

## Firebase Hosting

Le fichier `firebase.json` cible le dossier `dist`. Après connexion à Firebase CLI, publie le site et les règles avec :

```sh
firebase deploy --project kova-2026 --only hosting,firestore:rules
```

Avant de publier, active le fournisseur e-mail/mot de passe dans Firebase Authentication et publie les règles Firestore. Consulte [FIREBASE_SETUP.md](./FIREBASE_SETUP.md).

## Important : catalogue et droits d'auteur

Le catalogue affiche des métadonnées fournies par des services tiers. Il n'est pas un dépôt de chapitres. Pour une lecture intégrée, KOVA doit utiliser des œuvres originales, des œuvres du domaine public après vérification des droits ou des contenus diffusés avec permission du détenteur des droits. Les liens vers les plateformes officielles sont des liens sortants, pas une garantie que chaque série y soit disponible.

## Limites connues

- La disponibilité des résultats et des couvertures dépend des APIs externes et de la connexion du navigateur.
- Les réglages ne sont pas encore un système complet de contrôle parental; le filtre des catégories adultes reste appliqué dans les résultats Kitsu.
- La bannière et la photo sont des URLs externes, pas des fichiers envoyés dans Firebase Storage.
- Le build automatique est préparé dans GitHub Actions. Attends la fin de l'exécution pour confirmer son succès.
