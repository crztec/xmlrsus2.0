import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyC8WDUMDC7kepz1CO15sDGm7NdYYUaP7kQ",
  authDomain: "xmlrsus.firebaseapp.com",
  projectId: "xmlrsus",
  storageBucket: "xmlrsus.appspot.com",
  messagingSenderId: "1060256648695",
  appId: "1:1060256648695:web:867699e38ec6b2f4f51e01"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
