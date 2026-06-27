// ---------------------------------------------------------------------------
// Budgeting Dashboard — Firebase configuration
// ---------------------------------------------------------------------------
// Firebase project: danielanania-website (dedicated to this site, separate from
// the public "whatpeoplepaid" project). The values below are the WEB app config
// and are NOT secret — they're meant to ship in client-side code.
//
// Data privacy for actual statement data comes later from Firestore security
// rules scoped to OWNER_UID, NOT from this file. This file only drives the
// UI-level login gate.
// ---------------------------------------------------------------------------

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyByxqLtTO4Ynb4B15w_58bBQ1ZjMPUnS2c",
  authDomain: "danielanania-website.firebaseapp.com",
  projectId: "danielanania-website",
  storageBucket: "danielanania-website.firebasestorage.app",
  messagingSenderId: "807560745546",
  appId: "1:807560745546:web:6ab5017a948d8a2f308cb3",
  measurementId: "G-ZG2TXNHNY3",
};

// Your Firebase Auth UID — only this user can see the dashboard + the utilities
// tile. (d5anania@gmail.com, Google sign-in.)
export const OWNER_UID = "qYHwglRT1fO9X6FRkSGgcoDS1nj1";

// True once Firebase is wired up (real apiKey). Sign-in is offered from here;
// the owner check additionally requires OWNER_UID to be set.
export const IS_CONFIGURED = !FIREBASE_CONFIG.apiKey.startsWith("YOUR_");
