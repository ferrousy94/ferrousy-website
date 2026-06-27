// ---------------------------------------------------------------------------
// Budgeting Dashboard — Cloud Functions
// ---------------------------------------------------------------------------
// parseStatement : owner uploads a PDF statement (base64) -> archived to GCS,
//                  parsed by Gemini (via Vertex AI), written to Firestore.
// deleteStatement: removes a statement, its transactions, and the archived PDF.
//
// All callables are locked to OWNER_UID. Gemini runs server-side via Vertex AI
// using the function's service account — no API key anywhere.
// ---------------------------------------------------------------------------

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const { GoogleGenAI, Type } = require("@google/genai");

admin.initializeApp();
const db = admin.firestore();

const OWNER_UID = "qYHwglRT1fO9X6FRkSGgcoDS1nj1";
const PROJECT = "danielanania-website";
const VERTEX_LOCATION = "us-central1"; // Gemini model availability on Vertex
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const ARCHIVE_BUCKET = "danielanania-website-statements";
const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

setGlobalOptions({
  region: "northamerica-northeast1",
  timeoutSeconds: 300,
  memory: "512MiB",
  maxInstances: 5,
});

// ---- helpers ---------------------------------------------------------------
function requireOwner(request) {
  const uid = request.auth && request.auth.uid;
  if (!uid || uid !== OWNER_UID) {
    throw new HttpsError("permission-denied", "Not authorized.");
  }
  return uid;
}

// Coerce Gemini's value to a finite number or null (strips $ and commas if the
// model ever returns a string).
function num(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function str(v, max = 500) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

// ---- Gemini extraction schema ---------------------------------------------
const STATEMENT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    institution: { type: Type.STRING },
    accountName: { type: Type.STRING },
    accountType: { type: Type.STRING }, // credit_card | chequing | savings | other
    accountNumberMask: { type: Type.STRING },
    currency: { type: Type.STRING }, // ISO 4217, e.g. CAD / USD
    periodStart: { type: Type.STRING }, // YYYY-MM-DD
    periodEnd: { type: Type.STRING },
    statementDate: { type: Type.STRING },
    dueDate: { type: Type.STRING },
    previousBalance: { type: Type.NUMBER },
    newBalance: { type: Type.NUMBER },
    payments: { type: Type.NUMBER },
    purchases: { type: Type.NUMBER },
    fees: { type: Type.NUMBER },
    interest: { type: Type.NUMBER },
    minimumDue: { type: Type.NUMBER },
    creditLimit: { type: Type.NUMBER },
    availableCredit: { type: Type.NUMBER },
    transactions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          date: { type: Type.STRING }, // transaction date, YYYY-MM-DD
          postingDate: { type: Type.STRING },
          description: { type: Type.STRING }, // cleaned merchant name
          rawDescription: { type: Type.STRING }, // original text from statement
          location: { type: Type.STRING },
          amount: { type: Type.NUMBER }, // + = money out, - = money in
          currency: { type: Type.STRING },
          category: { type: Type.STRING },
          type: { type: Type.STRING }, // purchase|payment|fee|interest|credit|refund|transfer
        },
        required: ["date", "description", "amount", "type", "category"],
      },
    },
  },
  required: ["institution", "accountType", "currency", "transactions"],
};

const CATEGORIES = [
  "Groceries", "Dining", "Transport", "Travel", "Shopping", "Entertainment",
  "Utilities", "Insurance", "Health", "Housing", "Subscriptions", "Fees",
  "Interest", "Transfer", "Payment", "Income", "Other",
];

const PROMPT = [
  "You are a precise bank and credit-card statement parser. You are given a PDF",
  "statement. Extract the account summary and EVERY individual transaction line.",
  "",
  "Rules:",
  "- Dates: output ISO 'YYYY-MM-DD'. Statements often show only month+day; infer",
  "  the year from the statement period (watch for periods that span a year",
  "  boundary, e.g. Dec->Jan).",
  "- amount: a number with NO currency symbol or commas. SIGN CONVENTION:",
  "  POSITIVE = money leaving the account (purchases, fees, interest, cash",
  "  advances, withdrawals, debits). NEGATIVE = money coming in (payments",
  "  received, refunds, credits, deposits).",
  "- type: one of purchase, payment, fee, interest, credit, refund, transfer.",
  "- description: a clean, human merchant name (e.g. 'PRESTO FARE/RTK..' ->",
  "  'Presto', 'ETSY CANADA LIMITED' -> 'Etsy'). Put the original text in",
  "  rawDescription.",
  "- location: city or 'City, Region' if shown, else omit.",
  "- accountType: credit_card, chequing, savings, or other.",
  "- currency: ISO code (CAD, USD, ...).",
  `- category: choose the single best fit from: ${CATEGORIES.join(", ")}.`,
  "  Use 'Payment' for statement payments and 'Interest'/'Fees' for those lines.",
  "- Do NOT invent transactions. If a numeric field is not present, omit it.",
  "- Include the opening/closing balances and totals in the summary fields.",
].join("\n");

async function parseWithGemini(pdfBuffer) {
  const ai = new GoogleGenAI({
    vertexai: true,
    project: PROJECT,
    location: VERTEX_LOCATION,
  });
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: "application/pdf", data: pdfBuffer.toString("base64") } },
          { text: PROMPT },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: STATEMENT_SCHEMA,
      temperature: 0,
    },
  });
  return JSON.parse(response.text);
}

// ---- parseStatement --------------------------------------------------------
exports.parseStatement = onCall(async (request) => {
  const uid = requireOwner(request);
  const { fileName, contentType, dataBase64 } = request.data || {};

  if (!dataBase64) throw new HttpsError("invalid-argument", "Missing file data.");
  if (contentType && contentType !== "application/pdf") {
    throw new HttpsError("invalid-argument", "Only PDF statements are supported right now.");
  }
  const pdfBuffer = Buffer.from(dataBase64, "base64");
  if (pdfBuffer.length === 0) throw new HttpsError("invalid-argument", "Empty file.");
  if (pdfBuffer.length > MAX_BYTES) {
    throw new HttpsError("invalid-argument", "File too large (max 15 MB).");
  }

  // 1. Reserve a statement id and archive the original PDF.
  const stmtRef = db.collection("statements").doc();
  const statementId = stmtRef.id;
  const storagePath = `${uid}/${statementId}.pdf`;
  await admin
    .storage()
    .bucket(ARCHIVE_BUCKET)
    .file(storagePath)
    .save(pdfBuffer, { contentType: "application/pdf", resumable: false });

  await stmtRef.set({
    ownerUid: uid,
    fileName: str(fileName) || "statement.pdf",
    storageBucket: ARCHIVE_BUCKET,
    storagePath,
    status: "parsing",
    uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // 2. Parse with Gemini.
  let parsed;
  try {
    parsed = await parseWithGemini(pdfBuffer);
  } catch (err) {
    console.error("Gemini parse failed:", err);
    await stmtRef.update({ status: "error", error: String((err && err.message) || err).slice(0, 500) });
    throw new HttpsError("internal", "Could not parse this statement. See the dashboard for details.");
  }

  const transactions = Array.isArray(parsed.transactions) ? parsed.transactions : [];

  // 3. Write the summary + each transaction (batched).
  const batch = db.batch();
  batch.update(stmtRef, {
    status: "parsed",
    parsedAt: admin.firestore.FieldValue.serverTimestamp(),
    institution: str(parsed.institution),
    accountName: str(parsed.accountName),
    accountType: str(parsed.accountType) || "other",
    accountNumberMask: str(parsed.accountNumberMask),
    currency: str(parsed.currency) || "CAD",
    periodStart: str(parsed.periodStart, 10),
    periodEnd: str(parsed.periodEnd, 10),
    statementDate: str(parsed.statementDate, 10),
    dueDate: str(parsed.dueDate, 10),
    previousBalance: num(parsed.previousBalance),
    newBalance: num(parsed.newBalance),
    payments: num(parsed.payments),
    purchases: num(parsed.purchases),
    fees: num(parsed.fees),
    interest: num(parsed.interest),
    minimumDue: num(parsed.minimumDue),
    creditLimit: num(parsed.creditLimit),
    availableCredit: num(parsed.availableCredit),
    transactionCount: transactions.length,
  });

  const currency = str(parsed.currency) || "CAD";
  for (const t of transactions) {
    const txRef = db.collection("transactions").doc();
    batch.set(txRef, {
      ownerUid: uid,
      statementId,
      date: str(t.date, 10),
      postingDate: str(t.postingDate, 10),
      description: str(t.description, 300) || "(unknown)",
      rawDescription: str(t.rawDescription, 300),
      location: str(t.location, 120),
      amount: num(t.amount),
      currency: str(t.currency) || currency,
      category: str(t.category, 40) || "Other",
      type: str(t.type, 20) || "purchase",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();

  return { statementId, transactionCount: transactions.length };
});

// ---- deleteStatement -------------------------------------------------------
exports.deleteStatement = onCall(async (request) => {
  const uid = requireOwner(request);
  const { statementId } = request.data || {};
  if (!statementId) throw new HttpsError("invalid-argument", "Missing statementId.");

  const stmtRef = db.collection("statements").doc(statementId);
  const snap = await stmtRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "Statement not found.");
  if (snap.get("ownerUid") !== uid) throw new HttpsError("permission-denied", "Not your statement.");

  // Delete the archived PDF (best-effort).
  const storagePath = snap.get("storagePath");
  if (storagePath) {
    try {
      await admin.storage().bucket(snap.get("storageBucket") || ARCHIVE_BUCKET).file(storagePath).delete();
    } catch (err) {
      console.warn("Archive delete failed (continuing):", err && err.message);
    }
  }

  // Delete the statement's transactions in chunks.
  let deleted = 0;
  while (true) {
    const q = await db.collection("transactions").where("statementId", "==", statementId).limit(400).get();
    if (q.empty) break;
    const batch = db.batch();
    q.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += q.size;
    if (q.size < 400) break;
  }

  await stmtRef.delete();
  return { deleted };
});
