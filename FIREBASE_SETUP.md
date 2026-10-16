# KOVA Firebase setup

Firebase project ID: `kova-2026`

## Client integration added

- `src/lib/firebase.ts` initializes the Firebase web app, Authentication and Cloud Firestore.
- `.env.example` lists the Vite environment variables expected by the client module.

## Finish setup

1. In Firebase Console, open project `kova-2026`.
2. Register a Web App if you have not already done so and copy its web configuration into local `.env.local` (do not commit `.env.local`).
3. Install the Firebase JavaScript SDK in the actual app project: `npm install firebase` (or the equivalent package-manager command).
4. Enable the sign-in methods you want under Authentication.
5. Create a Cloud Firestore database and apply restrictive Security Rules before storing user data.
6. Add the same `VITE_FIREBASE_*` variables to your hosting/build environment.
7. Verify that the app's build tool supports `import.meta.env` (Vite-compatible). This repository was empty when this setup was added, so the existing framework and build could not be verified.

## Important security notes

- Firebase web configuration is intended to be present in client applications; it is not a substitute for security rules.
- Never commit service-account JSON files, Admin SDK credentials, or private keys.
- Do not allow unrestricted public reads/writes in Firestore.
- Store profile fields and image URLs in Firestore. Store actual image files in an appropriate file-storage service rather than large base64 strings in Firestore documents.
- Analytics was not initialized here because it is not required for authentication or Firestore and can be added later if needed.
