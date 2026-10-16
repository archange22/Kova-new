# KOVA : configuration Firebase

Projet Firebase : `kova-2026`

## Ce qui est intégré

- Firebase Authentication : création de compte, connexion et déconnexion par e-mail.
- Cloud Firestore : profil privé et bibliothèque personnelle dans `users/{uid}` et `users/{uid}/library/{itemId}`.
- La configuration publique de l'application Web est définie dans `src/lib/firebase.ts`. Les variables `VITE_FIREBASE_*` peuvent la remplacer en déploiement.
- `firestore.rules` protège les profils et limite les données de bibliothèque au propriétaire du compte.
- `firebase.json` prépare Firebase Hosting pour le dossier généré `dist` et déclare le fichier de règles Firestore.

## À vérifier dans Firebase Console

1. Ouvre le projet `kova-2026`.
2. Dans Authentication, active le fournisseur **Adresse e-mail / mot de passe**.
3. Crée ou vérifie la base Cloud Firestore.
4. Ouvre Firestore > Règles et publie le contenu de `firestore.rules`. Les règles du dépôt ne sont pas publiées automatiquement par GitHub.
5. Dans les paramètres de l'application Web Firebase, restreins la clé API aux domaines utilisés par KOVA et aux API nécessaires.
6. Vérifie que les domaines d'hébergement KOVA figurent dans Authentication > Paramètres > Domaines autorisés.

## Compiler et tester

À la racine du dépôt, dans Termux ou un environnement Node.js compatible :

```sh
npm install
npm run build
npm run preview -- --host 0.0.0.0
```

Le contrôle GitHub Actions lance `npm install` et `npm run build` à chaque push sur `main` et à chaque pull request vers `main`.

## Publier sur Firebase Hosting

Après avoir installé et connecté Firebase CLI à ton compte :

```sh
firebase deploy --project kova-2026 --only hosting,firestore:rules
```

Le déploiement nécessite une autorisation Firebase valide. Aucun déploiement n'est déclenché automatiquement par cette étape de préparation.

## Sécurité et stockage

- La clé Firebase pour application Web est une configuration cliente visible dans le navigateur, pas un mot de passe serveur. Elle doit néanmoins être limitée par domaine et utilisée avec des règles de sécurité.
- Ne publie jamais de clé de compte de service, de clé privée ou de fichier JSON Admin SDK.
- Les règles Firestore protègent les données; cacher une clé dans le code client ne remplace pas les règles.
- Les URLs de photo et de bannière sont enregistrées dans Firestore. Les fichiers eux-mêmes restent hébergés à l'adresse donnée, pour éviter de stocker de grandes chaînes base64.
- Ne stocke jamais les mots de passe dans Firestore.

## Catalogue et droits de lecture

- Kitsu fournit des fiches de manga/manhwa; Open Library fournit des fiches bibliographiques pour les BD et comics.
- KOVA ne télécharge ni ne republie les chapitres des œuvres listées.
- Les liens vers MANGA Plus, WEBTOON et GlobalComix ouvrent leurs sites officiels. La disponibilité d'une série dépend de la plateforme et de la région.
- Le lecteur intégré devra se limiter aux œuvres originales de KOVA, au domaine public vérifié ou aux contenus pour lesquels une autorisation écrite de diffusion a été obtenue.
