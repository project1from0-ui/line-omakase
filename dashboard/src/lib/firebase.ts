// Import the functions you need from the SDKs you need
import { initializeApp, getApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBLsLsad48wgebLs8MMVpV0Vrye03LtYTM",
  authDomain: "line-omakase.firebaseapp.com",
  projectId: "line-omakase",
  storageBucket: "line-omakase.firebasestorage.app",
  messagingSenderId: "130425912352",
  appId: "1:130425912352:web:1d2a91422475889c585045",
  measurementId: "G-J9X0TMKVGJ"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

export { db };