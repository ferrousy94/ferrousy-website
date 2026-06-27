// ---------------------------------------------------------------------------
// Budgeting Dashboard — page logic
// ---------------------------------------------------------------------------
// Drives budget.html: swaps between the loading / setup / sign-in / denied /
// dashboard "states" based on auth, and wires up the (stub) statement upload.
//
// This is intentionally a framework: the dashboard renders empty states and the
// upload only lists files. Plug real parsing + Firestore reads in where marked
// "TODO" below.
// ---------------------------------------------------------------------------

import { watchOwner, signInWithGoogle, signOutUser, OWNER_UID } from "./budget-auth.js";

const STATES = ["loading", "setup", "signin", "denied", "dashboard"];

function showState(name) {
  for (const s of STATES) {
    const el = document.getElementById(`state-${s}`);
    if (el) el.hidden = s !== name;
  }
}

// Signed in but not the owner. If OWNER_UID hasn't been set yet (first-run
// bootstrap), show a friendly "finishing setup" message with the UID instead
// of a scary access-denied screen.
function showDenied(user) {
  const firstRun = OWNER_UID === "";
  document.getElementById("denied-icon").textContent = firstRun ? "✅" : "⛔";
  document.getElementById("denied-title").textContent = firstRun
    ? "Signed in — finishing setup"
    : "Access denied";
  document.getElementById("denied-msg").textContent = firstRun
    ? "Your account is registered. The owner lock is being applied — reload in a moment."
    : "This account isn't authorized to view this dashboard.";
  const uidEl = document.getElementById("denied-uid");
  if (firstRun) {
    uidEl.textContent = `Your UID: ${user.uid}`;
    uidEl.hidden = false;
  } else {
    uidEl.hidden = true;
  }
  showState("denied");
}

// --- Auth-driven view switching ---------------------------------------------
watchOwner(({ configured, user, isOwner }) => {
  if (!configured) return showState("setup");
  if (!user) return showState("signin");
  if (!isOwner) return showDenied(user);

  const emailEl = document.getElementById("user-email");
  if (emailEl) emailEl.textContent = user.email || "";
  showState("dashboard");
  // TODO: load this owner's accounts/transactions from Firestore and render.
  renderDashboard();
});

// --- Buttons ----------------------------------------------------------------
document.getElementById("btn-signin")?.addEventListener("click", async () => {
  try {
    await signInWithGoogle();
  } catch (err) {
    console.error("Sign-in failed:", err);
    alert("Sign-in failed. Check the console for details.");
  }
});

document
  .getElementById("btn-signout")
  ?.addEventListener("click", () => signOutUser());
document
  .getElementById("btn-signout-denied")
  ?.addEventListener("click", () => signOutUser());

// --- Statement upload (stub) ------------------------------------------------
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const uploadList = document.getElementById("upload-list");
const uploadNote = document.getElementById("upload-note");

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function handleFiles(files) {
  if (!files || !files.length) return;
  for (const file of files) {
    const li = document.createElement("li");
    li.className = "upload-item";
    li.innerHTML = `
      <span class="upload-item-name">📄 ${file.name}</span>
      <span class="upload-item-meta">${formatBytes(file.size)} · queued</span>
    `;
    uploadList.appendChild(li);
    // TODO: hand `file` to a parser (Cloud Function / client-side CSV parser),
    // then write the resulting transactions to Firestore under this owner.
  }
  if (uploadNote) uploadNote.hidden = false;
}

if (dropzone && fileInput) {
  fileInput.addEventListener("change", (e) => handleFiles(e.target.files));

  ["dragenter", "dragover"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    })
  );
  ["dragleave", "drop"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
    })
  );
  dropzone.addEventListener("drop", (e) =>
    handleFiles(e.dataTransfer?.files)
  );
}

// --- Dashboard render (placeholder) -----------------------------------------
// Replace with real aggregates once transactions are stored.
function renderDashboard() {
  // KPIs stay as "—" until there's data. Hook real numbers in here, e.g.:
  //   document.getElementById("kpi-balance").textContent = fmt(total);
}
