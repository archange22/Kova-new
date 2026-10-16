import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

/**
 * Configuration publique de l'application Web Firebase KOVA.
 * Les variables VITE_* permettent de remplacer ces valeurs au besoin.
 * La configuration client n'est pas une autorisation d'accès : les règles Firestore
 * et les fournisseurs de connexion restent les vraies barrières de sécurité.
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBxjVISUpPsX1V5VXCBT_fsdzg6IQN1JQs",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "kova-2026.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "kova-2026",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "kova-2026.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "784929153116",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:784929153116:web:043e2d76d42654e7fd8699",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-XWD49G9KMP",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
