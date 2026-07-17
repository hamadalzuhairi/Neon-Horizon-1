import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInAnonymously, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, doc, setDoc, getDoc, collection, query, orderBy, limit, getDocs, serverTimestamp, writeBatch, runTransaction } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let app, auth, db;
let currentUsername = "Guest";

export async function initFirebase() {
    try {
        const resp = await fetch('./firebase-applet-config.json');
        const config = await resp.json();
        app = initializeApp(config);
        db = getFirestore(app, config.firestoreDatabaseId);
        auth = getAuth(app);

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    const userDoc = await getDoc(doc(db, 'users', user.uid));
                    if (userDoc.exists()) {
                        currentUsername = userDoc.data().username;
                    } else {
                        // Fallback
                        currentUsername = user.isAnonymous ? "Guest" : (user.email ? user.email.split('@')[0] : "Pilot");
                    }
                } catch (e) {
                    console.error("Error fetching user data", e);
                }
                
                const displayEl = document.getElementById('player-username-display');
                if (displayEl) displayEl.innerText = currentUsername;

                // Hide auth screen, show intro if not already dismissed
                document.getElementById('auth-screen').style.display = 'none';
                
                const introScreen = document.getElementById('intro-screen');
                if (!introScreen.classList.contains('fade-out')) {
                    introScreen.style.display = 'flex';
                    introScreen.classList.remove('fade-out');
                }
            } else {
                document.getElementById('auth-screen').style.display = 'flex';
                document.getElementById('intro-screen').style.display = 'none';
            }
        });
    } catch(err) {
        console.error("Failed to init Firebase", err);
        // Fail open to game if firebase fails to load
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('intro-screen').style.display = 'flex';
    }
}

export async function register(username, password) {
    if (!username || !password) throw new Error("Username and password required");
    const email = username + "@neonhorizon.app";
    
    // Check if username exists
    const usernameRef = doc(db, 'usernames', username);
    const usernameSnap = await getDoc(usernameRef);
    if (usernameSnap.exists()) {
        throw new Error("Username already taken!");
    }

    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const user = cred.user;

    try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'users', user.uid), {
            uid: user.uid,
            username: username,
            createdAt: serverTimestamp()
        });
        batch.set(usernameRef, { uid: user.uid });
        await batch.commit();
    } catch (e) {
        console.error("Failed to save user data", e);
        throw new Error("Failed to save user data: " + e.message);
    }
}

export async function login(username, password) {
    if (!username || !password) throw new Error("Username and password required");
    const email = username + "@neonhorizon.app";
    await signInWithEmailAndPassword(auth, email, password);
}

export async function playAsGuest() {
    const cred = await signInAnonymously(auth);
    const user = cred.user;
    
    // Check if we already created a doc for this anonymous session
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (!userDoc.exists()) {
        const counterRef = doc(db, 'counters', 'guests');
        let guestNumber = 1;
        try {
            await runTransaction(db, async (transaction) => {
                const counterDoc = await transaction.get(counterRef);
                if (!counterDoc.exists()) {
                    transaction.set(counterRef, { count: 1 });
                    guestNumber = 1;
                } else {
                    guestNumber = counterDoc.data().count + 1;
                    transaction.update(counterRef, { count: guestNumber });
                }
            });
        } catch (e) {
            console.error("Transaction failed", e);
            guestNumber = Math.floor(Math.random() * 100000);
        }
        
        const guestUsername = "Guest" + guestNumber;
        const batch = writeBatch(db);
        batch.set(doc(db, 'users', user.uid), {
            uid: user.uid,
            username: guestUsername,
            createdAt: serverTimestamp()
        });
        batch.set(doc(db, 'usernames', guestUsername), { uid: user.uid });
        await batch.commit();
        currentUsername = guestUsername;
        
        const displayEl = document.getElementById('player-username-display');
        if (displayEl) displayEl.innerText = currentUsername;
    }
}

export async function submitScore(score) {
    if (!auth || !auth.currentUser || score <= 0) return;
    try {
        const scoreRef = doc(db, 'leaderboard', auth.currentUser.uid);
        const snap = await getDoc(scoreRef);
        if (snap.exists()) {
            if (score > snap.data().score) {
                await setDoc(scoreRef, {
                    uid: auth.currentUser.uid,
                    username: currentUsername,
                    score: score,
                    timestamp: serverTimestamp()
                });
            }
        } else {
            await setDoc(scoreRef, {
                uid: auth.currentUser.uid,
                username: currentUsername,
                score: score,
                timestamp: serverTimestamp()
            });
        }
    } catch (e) {
        console.error("Error submitting score", e);
    }
}

export async function getLeaderboard() {
    if (!db) return [];
    try {
        const q = query(collection(db, 'leaderboard'), orderBy('score', 'desc'), limit(10));
        const snap = await getDocs(q);
        const results = [];
        snap.forEach(doc => results.push(doc.data()));
        return results;
    } catch (e) {
        console.error("Error fetching leaderboard", e);
        return [];
    }
}

export async function signOutUser() {
    if (auth) await signOut(auth);
}

// Bind to window so main script can use
window.FirebaseHelper = {
    initFirebase, register, login, playAsGuest, submitScore, getLeaderboard, signOutUser
};
