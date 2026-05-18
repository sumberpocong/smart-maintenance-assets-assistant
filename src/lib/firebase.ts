import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider, Auth } from "firebase/auth";

// These variables should be set in your .env or .env.local file
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

let app;
let auth: Auth | null = null;
let googleProvider: GoogleAuthProvider | null = null;

const isConfigValid = !!(firebaseConfig.apiKey && firebaseConfig.projectId);

if (isConfigValid) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    auth = getAuth(app);
    googleProvider = new GoogleAuthProvider();
  } catch (error) {
    console.error("Firebase initialization failed:", error);
  }
} else {
  console.warn("Firebase configuration is missing or incomplete. Auth features will be disabled.");
}

export { auth, googleProvider };
