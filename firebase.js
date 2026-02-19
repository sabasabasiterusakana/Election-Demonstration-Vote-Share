const firebaseConfig = {
  apiKey: "AIzaSyBZXbwY3J3BB_g6BD6TVmIWCwkCHSz5QOI",
  authDomain: "election-vote-share.firebaseapp.com",
  projectId: "election-vote-share",
  storageBucket: "election-vote-share.firebasestorage.app",
  messagingSenderId: "118552235781",
  appId: "1:118552235781:web:3a2a3f0c5f74bc12dbb16c"
};

const ADMIN_PASSCODE = "admin1234";

import { initializeApp }  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore }   from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth }        from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

export { db, auth, ADMIN_PASSCODE };