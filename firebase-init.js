// =============================================================
// ASTROCORE — firebase-init.js
// Extracted from app.html. Kept as its own ES module file (import
// statements require type="module"; merging with the plain-script
// app.js would change how top-level declarations attach to window
// and could break onclick="..." handlers throughout the page).
// =============================================================


import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, updateProfile, updatePassword, updateEmail }
    from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDoc, getDocFromServer, setDoc, updateDoc, deleteDoc, collection, getDocs }
    from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAUXVcxZj-ATNnZpAuvjv17PVv-9skGUGE",
    authDomain: "astra-50147.firebaseapp.com",
    projectId: "astra-50147",
    storageBucket: "astra-50147.firebasestorage.app",
    messagingSenderId: "407790127495",
    appId: "1:407790127495:web:835d849f6b1338f8e1eb22"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// Prefer durable offline + multi-tab caching, but never let an IndexedDB/cache
// problem prevent the entire app from starting.
let db;
try {
    db = initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    });
} catch(e) {
    console.warn('Persistent Firestore cache unavailable; using normal Firestore:', e);
    try { db = getFirestore(app); }
    catch(e2) { console.error('Firestore initialization failed:', e2); db = null; }
}

window._fbAuth = auth;
window._fbDb = db;
window._fbFns = { doc, getDoc, getDocFromServer, setDoc, updateDoc, deleteDoc, collection, getDocs };
window._fbAuthFns = { signOut, updateProfile, updatePassword, updateEmail };

const uid = sessionStorage.getItem('astraea2_uid');
window._fbUid = uid;

async function waitForApp(maxMs = 15000) {
    const started = Date.now();
    while(Date.now() - started < maxMs) {
        if(window.obApplyFromFirestore && window.bootSystem && window.userContext) return true;
        await new Promise(r => setTimeout(r, 25));
    }
    return !!(window.obApplyFromFirestore && window.bootSystem);
}

onAuthStateChanged(auth, async (user) => {
    if(user) {
        await waitForApp();
        window._fbUid = user.uid;
        window._fbUser = user;
        if(window.userContext) {
            window.userContext.uid = user.uid;
            window.userContext.username = (user.displayName && user.displayName.trim())
                ? user.displayName.trim()
                : sessionStorage.getItem('astraea2_name') || (user.email ? user.email.split('@')[0] : 'Operative');
            window.userContext.email = user.email || '';
            window.userContext.avatarUrl = user.photoURL || sessionStorage.getItem('astraea2_photo') ||
                `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(window.userContext.username)}&backgroundColor=transparent`;
            window.userContext.isGuest = false;
            sessionStorage.removeItem('astraea2_name');
            sessionStorage.removeItem('astraea2_photo');
        }
        window.setupProfileUI && window.setupProfileUI();

        if(!window._hasBooted) {
            // Expose fns for onboarding to use later (obLaunch needs these)
            window._fbFns = { doc, getDoc, getDocFromServer, setDoc, updateDoc, deleteDoc, collection, getDocs };

            let onboardingDone = false;
            try {
                onboardingDone = await window.obApplyFromFirestore(user.uid, db, window._fbFns);
            } catch(e) {
                console.warn('onboarding check failed:', e);
                onboardingDone = undefined; // treat as error
            }

            if(onboardingDone === true) {
                // ✅ Returning user who completed onboarding — boot straight in
                if(window._loadedChaptersFromFS && window.ch_db) {
                    const fsCh = window._loadedChaptersFromFS;
                    Object.keys(fsCh).forEach(sub => {
                        if(!window.ch_db[sub]) window.ch_db[sub] = {};
                        Object.keys(fsCh[sub]).forEach(chap => {
                            if(!window.ch_db[sub][chap]) window.ch_db[sub][chap] = fsCh[sub][chap];
                        });
                    });
                }
                window._hasBooted = true;
                window.bootSystem();

            } else if(onboardingDone === null) {
                // 🆕 Brand new user — no Firestore doc at all → show onboarding
                window.obShow();

            } else if(onboardingDone === false) {
                // ⚠️ Has Firestore doc but no onboardingComplete flag
                // → Could be an existing JEE user (pre-onboarding feature) — boot them directly
                // Seed default JEE subjects if ch_SUBJECTS is empty
                if(!Object.keys(window.ch_SUBJECTS||{}).length) {
                    window.ch_SUBJECTS = {
                        physics:   { label:'Physics',   color:'#38bdf8', chapters:[] },
                        chemistry: { label:'Chemistry', color:'#f472b6', chapters:[] },
                        maths:     { label:'Maths',     color:'#a855f7', chapters:[] }
                    };
                    window.ch_activeSub = 'physics';
                }
                window._hasBooted = true;
                window.bootSystem();

            } else {
                // Firestore error fallback — show onboarding to be safe
                console.warn('Showing onboarding as fallback due to Firestore error');
                window.obShow();
            }
        }
    } else {
        // Not logged in — redirect to login page
        sessionStorage.removeItem('astraea2_uid');
        window.location.href = 'index.html';
    }
});