// ---------------------------------------------------------------------------
// Budgeting Dashboard — shared auth helpers
// ---------------------------------------------------------------------------
// Thin wrapper around Firebase Auth used by both budget.html (the dashboard)
// and utilities.html (to reveal the dashboard tile only for the owner).
//
// The gate here is UI-only: it decides what to *show*. Actual data privacy must
// come from Firestore security rules scoped to OWNER_UID once you store data.
// ---------------------------------------------------------------------------

import { FIREBASE_CONFIG, OWNER_UID, IS_CONFIGURED } from "./budget-config.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2";

let _authPromise = null;

// Lazily import + init Firebase Auth only when it's actually needed and the
// config has been filled in. Returns { auth, GoogleAuthProvider, ... } or null.
async function getAuthModule() {
  if (!IS_CONFIGURED) return null;
  if (_authPromise) return _authPromise;

  _authPromise = (async () => {
    const { initializeApp } = await import(`${SDK}/firebase-app.js`);
    const authMod = await import(`${SDK}/firebase-auth.js`);
    const app = initializeApp(FIREBASE_CONFIG);
    const auth = authMod.getAuth(app);
    await authMod.setPersistence(auth, authMod.browserLocalPersistence);
    return { auth, ...authMod };
  })();

  return _authPromise;
}

// Subscribe to owner auth state. The callback receives:
//   { configured, user, isOwner }
// and fires immediately with the current state, then on every change.
export async function watchOwner(callback) {
  if (!IS_CONFIGURED) {
    callback({ configured: false, user: null, isOwner: false });
    return () => {};
  }
  const mod = await getAuthModule();
  return mod.onAuthStateChanged(mod.auth, (user) => {
    if (user) {
      console.info(`Signed in as ${user.email} — UID: ${user.uid}`);
    }
    callback({
      configured: true,
      user: user || null,
      isOwner: !!user && user.uid === OWNER_UID,
    });
  });
}

export async function signInWithGoogle() {
  const mod = await getAuthModule();
  if (!mod) throw new Error("Firebase is not configured yet.");
  const provider = new mod.GoogleAuthProvider();
  return mod.signInWithPopup(mod.auth, provider);
}

export async function signOutUser() {
  const mod = await getAuthModule();
  if (!mod) return;
  return mod.signOut(mod.auth);
}

export { IS_CONFIGURED, OWNER_UID };
