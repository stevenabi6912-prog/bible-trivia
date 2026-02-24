// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAWup4eYIUD6aYnMrYwFUmgnUZXsVyKWys",
  authDomain: "faithkidstrivia.firebaseapp.com",
  projectId: "faithkidstrivia",
  storageBucket: "faithkidstrivia.firebasestorage.app",
  messagingSenderId: "295258301478",
  appId: "1:295258301478:web:cb507f3a9fa2e87a0ff2e7",
  measurementId: "G-FND4TP0S2P"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
