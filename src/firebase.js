import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyCPR1h74owsfx5Bv3A3L5vD9sS7KNz1jdI",
  authDomain: "shop-pos-9e8fa.firebaseapp.com",
  projectId: "shop-pos-9e8fa",
  storageBucket: "shop-pos-9e8fa.firebasestorage.app",
  messagingSenderId: "179460671194",
  appId: "1:179460671194:web:2a57297cda685fe911c7e3",
  measurementId: "G-QZ0V6F41Q5"
};

const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export const db = getFirestore(app);
export const auth = getAuth(app);

export default app;
