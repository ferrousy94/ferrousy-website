// ---------------------------------------------------------------------------
// Budgeting Dashboard — page logic
// ---------------------------------------------------------------------------
// Auth state switching + statement upload (-> parseStatement Cloud Function)
// + rendering of the owner's statements/transactions from Firestore.
// ---------------------------------------------------------------------------

import {
  watchOwner,
  signInWithGoogle,
  signOutUser,
  getDb,
  callFunction,
  OWNER_UID,
} from "./budget-auth.js";

const STATES = ["loading", "setup", "signin", "denied", "dashboard"];

let statements = [];
let transactions = [];
let dataLoaded = false;

// --- View switching ---------------------------------------------------------
function showState(name) {
  for (const s of STATES) {
    const el = document.getElementById(`state-${s}`);
    if (el) el.hidden = s !== name;
  }
}

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

watchOwner(({ configured, user, isOwner }) => {
  if (!configured) return showState("setup");
  if (!user) return showState("signin");
  if (!isOwner) return showDenied(user);

  const emailEl = document.getElementById("user-email");
  if (emailEl) emailEl.textContent = user.email || "";
  showState("dashboard");
  if (!dataLoaded) {
    dataLoaded = true;
    loadData();
  }
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
document.getElementById("btn-signout")?.addEventListener("click", () => signOutUser());
document.getElementById("btn-signout-denied")?.addEventListener("click", () => signOutUser());

// --- Formatting helpers -----------------------------------------------------
function moneyFmt(currency = "CAD") {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency });
}
function fmtMoney(n, currency = "CAD") {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return moneyFmt(currency).format(n);
}
function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}
function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}
function primaryCurrency() {
  return statements.find((s) => s.currency)?.currency || transactions.find((t) => t.currency)?.currency || "CAD";
}

// --- Data load --------------------------------------------------------------
async function loadData() {
  try {
    const { db, collection, query, orderBy, getDocs, limit } = await getDb();
    const [stmtSnap, txSnap] = await Promise.all([
      getDocs(query(collection(db, "statements"), orderBy("uploadedAt", "desc"))),
      getDocs(query(collection(db, "transactions"), orderBy("date", "desc"), limit(1000))),
    ]);
    statements = stmtSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    transactions = txSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  } catch (err) {
    console.error("Failed to load data:", err);
  }
}

// --- Render -----------------------------------------------------------------
function render() {
  renderKpis();
  renderCategories();
  renderStatements();
  renderTransactions();
}

function renderKpis() {
  const cur = primaryCurrency();
  const spend = transactions.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0);
  const credits = transactions.filter((t) => t.amount < 0).reduce((a, t) => a + Math.abs(t.amount), 0);
  const balance = statements.find((s) => typeof s.newBalance === "number")?.newBalance;

  document.getElementById("kpi-balance").textContent = balance == null ? "—" : fmtMoney(balance, cur);
  document.getElementById("kpi-spend").textContent = transactions.length ? fmtMoney(spend, cur) : "—";
  document.getElementById("kpi-credits").textContent = transactions.length ? fmtMoney(credits, cur) : "—";
  document.getElementById("kpi-count").textContent = transactions.length || "—";
  document.getElementById("kpi-count-sub").textContent =
    `across ${statements.length} statement${statements.length === 1 ? "" : "s"}`;
}

function renderCategories() {
  const el = document.getElementById("categories");
  const cur = primaryCurrency();
  const totals = {};
  for (const t of transactions) {
    if (t.amount > 0) totals[t.category || "Other"] = (totals[t.category || "Other"] || 0) + t.amount;
  }
  const rows = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  if (!rows.length) {
    el.innerHTML = `<div class="empty-state"><p>No spending to categorize yet.</p></div>`;
    return;
  }
  const max = rows[0][1];
  el.innerHTML = `<div class="cat-list">${rows
    .map(([name, amt]) => `
      <div class="cat-row">
        <div class="cat-row-top">
          <span class="cat-name">${escapeHtml(name)}</span>
          <span class="cat-amt">${fmtMoney(amt, cur)}</span>
        </div>
        <div class="cat-bar"><div class="cat-bar-fill" style="width:${Math.max(4, (amt / max) * 100)}%"></div></div>
      </div>`)
    .join("")}</div>`;
}

function renderStatements() {
  const el = document.getElementById("statements");
  if (!statements.length) {
    el.innerHTML = `<div class="empty-state"><p>No statements yet. Each uploaded PDF appears here.</p></div>`;
    return;
  }
  el.innerHTML = statements
    .map((s) => {
      const cur = s.currency || "CAD";
      const title = s.accountName || s.institution || "Statement";
      const period = s.periodStart && s.periodEnd ? `${fmtDate(s.periodStart)} – ${fmtDate(s.periodEnd)}` : "";
      const badge = s.status === "parsing"
        ? `<span class="stmt-badge parsing">parsing…</span>`
        : s.status === "error"
        ? `<span class="stmt-badge error">error</span>`
        : "";
      return `
        <div class="stmt-card" data-id="${s.id}">
          <div class="stmt-main">
            <div class="stmt-title">${escapeHtml(title)} ${badge}</div>
            <div class="stmt-meta">
              ${s.accountNumberMask ? escapeHtml(s.accountNumberMask) + " · " : ""}${period}
              ${typeof s.transactionCount === "number" ? " · " + s.transactionCount + " txns" : ""}
            </div>
          </div>
          <div class="stmt-right">
            ${typeof s.newBalance === "number" ? `<span class="stmt-bal">${fmtMoney(s.newBalance, cur)}</span>` : ""}
            <button class="stmt-del" title="Delete statement" data-del="${s.id}">✕</button>
          </div>
        </div>`;
    })
    .join("");

  el.querySelectorAll("[data-del]").forEach((btn) =>
    btn.addEventListener("click", () => deleteStatement(btn.getAttribute("data-del")))
  );
}

function renderTransactions() {
  const el = document.getElementById("transactions");
  if (!transactions.length) {
    el.innerHTML = `<div class="empty-state"><p>No transactions yet. They'll appear here once statements are parsed.</p></div>`;
    return;
  }
  const cur = primaryCurrency();
  const shown = transactions.slice(0, 80);
  el.innerHTML = `
    <div class="tx-table">
      ${shown
        .map((t) => {
          const out = t.amount > 0;
          return `
          <div class="tx-row">
            <span class="tx-date">${escapeHtml(fmtDate(t.date))}</span>
            <span class="tx-desc">
              <span class="tx-name">${escapeHtml(t.description || "(unknown)")}</span>
              ${t.location ? `<span class="tx-loc">${escapeHtml(t.location)}</span>` : ""}
            </span>
            <span class="tx-cat"><span class="chip">${escapeHtml(t.category || "Other")}</span></span>
            <span class="tx-amt ${out ? "out" : "in"}">${out ? "" : "+"}${fmtMoney(Math.abs(t.amount), t.currency || cur)}</span>
          </div>`;
        })
        .join("")}
    </div>
    ${transactions.length > shown.length ? `<p class="tx-more">Showing ${shown.length} of ${transactions.length} transactions.</p>` : ""}`;
}

// --- Delete -----------------------------------------------------------------
async function deleteStatement(id) {
  const s = statements.find((x) => x.id === id);
  const label = s?.accountName || s?.institution || "this statement";
  if (!confirm(`Delete ${label} and all its transactions? This can't be undone.`)) return;
  try {
    await callFunction("deleteStatement", { statementId: id });
    await loadData();
  } catch (err) {
    console.error("Delete failed:", err);
    alert("Could not delete the statement. See console for details.");
  }
}

// --- Upload -----------------------------------------------------------------
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const uploadList = document.getElementById("upload-list");

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function addUploadItem(file) {
  const li = document.createElement("li");
  li.className = "upload-item";
  li.innerHTML = `
    <span class="upload-item-name">📄 ${escapeHtml(file.name)}</span>
    <span class="upload-item-meta"><span class="mini-spinner"></span> Parsing with AI…</span>`;
  uploadList.appendChild(li);
  return li;
}
function setUploadItem(li, state, msg) {
  const meta = li.querySelector(".upload-item-meta");
  meta.className = `upload-item-meta ${state}`;
  meta.textContent = msg;
}

async function handleFiles(files) {
  for (const file of files) {
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const li = addUploadItem(file);
    if (!isPdf) {
      setUploadItem(li, "error", "Only PDF statements are supported.");
      continue;
    }
    try {
      const dataBase64 = await fileToBase64(file);
      const res = await callFunction("parseStatement", {
        fileName: file.name,
        contentType: "application/pdf",
        dataBase64,
      });
      setUploadItem(li, "done", `✓ Added ${res.transactionCount} transaction${res.transactionCount === 1 ? "" : "s"}`);
      await loadData();
    } catch (err) {
      console.error("Parse failed:", err);
      setUploadItem(li, "error", err?.message || "Failed to parse statement.");
    }
  }
}

if (dropzone && fileInput) {
  fileInput.addEventListener("change", (e) => {
    handleFiles(e.target.files);
    fileInput.value = "";
  });
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
  dropzone.addEventListener("drop", (e) => handleFiles(e.dataTransfer?.files));
}
