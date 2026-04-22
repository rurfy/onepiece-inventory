import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBN0w8KAANf3ZBbdg8gnhSARidAeP0f2p0",
  authDomain: "one-piece-card-database.firebaseapp.com",
  projectId: "one-piece-card-database",
  storageBucket: "one-piece-card-database.firebasestorage.app",
  messagingSenderId: "325621015091",
  appId: "1:325621015091:web:110ab7c237c6a4ddb2f946",
  measurementId: "G-7G5Q9P7GEW",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export const auth = getAuth(app);
