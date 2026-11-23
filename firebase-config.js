import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getFirestore,
    doc,
    setDoc,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDfcsDQIJeUXVMMe0k32YelDKv5krbO1M0",
    authDomain: "componentes-45e77.firebaseapp.com",
    projectId: "componentes-45e77",
    storageBucket: "componentes-45e77.firebasestorage.app",
    messagingSenderId: "540395896737",
    appId: "1:540395896737:web:6ebc5f5de08854751a55e0"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const STATE_DOC_REF = doc(db, "macs_sistema", "estado_global_v1");

export { db, STATE_DOC_REF, setDoc, onSnapshot };
