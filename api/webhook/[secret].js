// /api/webhook/[secret].js
import admin from "firebase-admin";

// --- ENV ---
const BOT_TOKEN = process.env.BOT_TOKEN;
const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

let fbInited = false;
function getFirestore() {
  if (fbInited) return admin.firestore();
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey: FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
  fbInited = true;
  return admin.firestore();
}

// Yardımcılar
function parseTs(v) {
  const d = new Date(v);
  return isNaN(d) ? null : d;
}
function formatPoint(p, i) {
  const d = parseTs(p.timestamp);
  const tr = d ? d.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" }) : "Invalid";
  const lat = parseFloat(p.latitude).toFixed(6);
  const lng = parseFloat(p.longitude).toFixed(6);
  return `${i + 1}. 🕒 ${tr}\n   📌 (${lat}, ${lng})\n   🌍 https://maps.google.com/?q=${lat},${lng}`;
}
async function sendMessage(chatId, text, options = {}) {
  await fetch(`${TG_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, ...options }),
  });
}
async function readAllPositions(db, uid) {
  const snap = await db.collection("users").doc(uid).collection("positions_uploads").get();
  let merged = [];
  snap.forEach(doc => {
    const data = doc.data() || {};
    if (Array.isArray(data.positions)) merged = merged.concat(data.positions);
  });
  return merged;
}

// Main handler
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const urlSecret = req.query.secret;
  const headerSecret = req.headers["x-telegram-bot-api-secret-token"];
  if (!urlSecret || headerSecret !== urlSecret) return res.status(403).end();

  const update = req.body || {};
  const msg = update.message;
  const chatId = msg?.chat?.id;
  const text = msg?.text?.trim();
  if (!chatId || !text) return res.status(200).end();

  const db = getFirestore();

  try {
    if (/^\/start$/i.test(text)) {
      await sendMessage(chatId, "🤖 Dijital Hafızam Bot\n\n📍 Komutlar:\n• /last <uid>\n• /lastemail <email>\n• /all <uid>\n• /ping");
      return res.status(200).end();
    }
    if (/^\/ping$/i.test(text)) {
      await sendMessage(chatId, "🏓 Pong!");
      return res.status(200).end();
    }
    const mLast = text.match(/^\/last\s+(\S+)$/i);
    if (mLast) {
      const uid = mLast[1];
      const data = await readAllPositions(db, uid);
      if (!data.length) {
        await sendMessage(chatId, "⚠️ Son 24 saatte kayıt bulunamadı.");
        return res.status(200).end();
      }
      const lines = data.slice(-10).map(formatPoint);
      await sendMessage(chatId, lines.join("\n\n"));
      return res.status(200).end();
    }
    const mAll = text.match(/^\/all\s+(\S+)$/i);
    if (mAll) {
      const uid = mAll[1];
      const data = await readAllPositions(db, uid);
      if (!data.length) {
        await sendMessage(chatId, "⚠️ Hiç kayıt bulunamadı.");
        return res.status(200).end();
      }
      const lines = data.slice(-10).map(formatPoint);
      await sendMessage(chatId, lines.join("\n\n"));
      return res.status(200).end();
    }
  } catch (e) {
    await sendMessage(chatId, "🚨 Sunucu hatası: " + e.message);
  }
  return res.status(200).end();
}

export const config = { api: { bodyParser: true } };
