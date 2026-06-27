// ---------------------------------------------------------------------------
// Budgeting Dashboard — shared Firebase helpers
// ---------------------------------------------------------------------------
// Single Firebase app instance shared by auth, Firestore, and callable
// functions. Used by budget.html (dashboard) and utilities.html (tile reveal).
//
// The auth gate here is UI-only. Real data privacy comes from the Firestore
// security rules (owner-only reads) and the Cloud Functions (owner-only writes).
// ---------------------------------------------------------------------------

import { FIREBASE_CONFIG, OWNER_UID, IS_CONFIGURED } from "./budget-config.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2";
const FUNCTIONS_REGION = "northamerica-northeast1";

let _app = null;
let _authMod = null;

async function getApp() {
  if (_app) return _app;
  const { initializeApp } = await import(`${SDK}/firebase-app.js`);
  _app = initializeApp(FIREBASE_CONFIG);
  return _app;
}

async function getAuthMod() {
  if (_authMod) return _authMod;
  const app = await getApp();
  const authMod = await import(`${SDK}/firebase-auth.js`);
  const auth = authMod.getAuth(app);
  await authMod.setPersistence(auth, authMod.browserLocalPersistence);
  _authMod = { auth, ...authMod };
  return _authMod;
}

// Subscribe to owner auth state: { configured, user, isOwner }.
export async function watchOwner(callback) {
  if (!IS_CONFIGURED) {
    callback({ configured: false, user: null, isOwner: false });
    return () => {};
  }
  const mod = await getAuthMod();
  return mod.onAuthStateChanged(mod.auth, (user) => {
    if (user) console.info(`Signed in as ${user.email} — UID: ${user.uid}`);
    callback({
      configured: true,
      user: user || null,
      isOwner: !!user && user.uid === OWNER_UID,
    });
  });
}

export async function signInWithGoogle() {
  const mod = await getAuthMod();
  const provider = new mod.GoogleAuthProvider();
  return mod.signInWithPopup(mod.auth, provider);
}

export async function signOutUser() {
  const mod = await getAuthMod();
  return mod.signOut(mod.auth);
}

// Firestore module + a ready db handle, e.g.:
//   const { db, collection, query, orderBy, getDocs } = await getDb();
export async function getDb() {
  const app = await getApp();
  const fs = await import(`${SDK}/firebase-firestore.js`);
  return { ...fs, db: fs.getFirestore(app) };
}

// Invoke a callable Cloud Function and return its .data payload.
export async function callFunction(name, data, { timeout = 300000 } = {}) {
  const app = await getApp();
  const fns = await import(`${SDK}/firebase-functions.js`);
  const functions = fns.getFunctions(app, FUNCTIONS_REGION);
  const callable = fns.httpsCallable(functions, name, { timeout });
  const res = await callable(data);
  return res.data;
}

export { IS_CONFIGURED, OWNER_UID };
