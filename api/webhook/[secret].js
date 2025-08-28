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

// 📷 Fotoğraf gönderici (hata yakalama ile)
async function sendPhoto(chatId, photoUrl, caption = "") {
  const res = await fetch(`${TG_API}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, photo: photoUrl, caption }),
  });
  const data = await res.json();
  if (!data.ok) {
    console.error("sendPhoto error:", data);
    await sendMessage(chatId, "🚨 Harita gönderilemedi. URL: " + photoUrl);
  }
}

async function readAllPositions(db, uid) {
  const snap = await db.collection("users").doc(uid).collection("positions_uploads").get();
  let merged = [];
  snap.forEach((doc) => {
    const data = doc.data() || {};
    if (Array.isArray(data.positions)) merged = merged.concat(data.positions);
  });
  return merged;
}

// 🔎 SADECE SON 24 SAAT FİLTRESİ
function filterLast24h(positions) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return positions
    .map((p) => ({ ...p, __d: parseTs(p.timestamp) }))
    .filter((p) => p.__d && p.__d >= cutoff && p.__d <= now)
    .sort((a, b) => a.__d - b.__d)
    .map(({ __d, ...rest }) => rest);
}

// 🌍 QuickChart harita URL (örnekleme + parseFloat)
function buildQuickChartMapURL(points, {
  width = 800, height = 500, stroke = 'ff0000', weight = 4,
} = {}) {
  if (!points || !points.length) return null;

  const maxPts = 100;
  const step = Math.ceil(points.length / maxPts);
  const sampled = points.filter((_, i) => i % step === 0);

  const path = sampled
    .map(p => `${parseFloat(p.latitude)},${parseFloat(p.longitude)}`)
    .join('|');

  const markers = [sampled[0], sampled[sampled.length - 1]]
    .map(p => `${parseFloat(p.latitude)},${parseFloat(p.longitude)}`)
    .join('|');

  const avgLat = sampled.reduce((s, p) => s + parseFloat(p.latitude), 0) / sampled.length;
  const avgLng = sampled.reduce((s, p) => s + parseFloat(p.longitude), 0) / sampled.length;

  const u = new URL('https://quickchart.io/map');
  u.searchParams.set('width', width);
  u.searchParams.set('height', height);
  u.searchParams.set('center', `${avgLat},${avgLng}`);
  u.searchParams.set('zoom', 10);
  u.searchParams.set('path', `color:0x${stroke}|weight:${weight}|${path}`);
  u.searchParams.set('markers', markers);
  return u.toString();
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
      await sendMessage(
        chatId,
        "🤖 Dijital Hafızam Bot\n\n📍 Komutlar:\n• /last <uid> (son 24 saat)\n• /all <uid> (özet)\n• /ping"
      );
      return res.status(200).end();
    }

    if (/^\/ping$/i.test(text)) {
      await sendMessage(chatId, "🏓 Pong!");
      return res.status(200).end();
    }

    // /last <uid>
    const mLast = text.match(/^\/last\s+(\S+)$/i);
    if (mLast) {
      const uid = mLast[1];
      const all = await readAllPositions(db, uid);
      const data = filterLast24h(all);

      if (!data.length) {
        await sendMessage(chatId, "⚠️ Son 24 saatte kayıt bulunamadı.");
        return res.status(200).end();
      }

      // 🌍 QuickChart haritası gönder
      const mapUrl = buildQuickChartMapURL(data);
      if (mapUrl) {
        await sendPhoto(chatId, mapUrl, `📍 Son 24 saatlik rota (${data.length} nokta)`);
      }

      // Eski liste gönderimi
      const lines = data.map(formatPoint);
      let chunk = "";
      for (const line of lines) {
        if ((chunk + line + "\n\n").length > 3800) {
          await sendMessage(chatId, chunk);
          chunk = "";
        }
        chunk += line + "\n\n";
      }
      if (chunk.trim()) await sendMessage(chatId, chunk);
      return res.status(200).end();
    }

    // /all <uid>
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
    console.error("Handler error:", e);
    await sendMessage(chatId, "🚨 Sunucu hatası: " + e.message);
  }
  return res.status(200).end();
}

export const config = { api: { bodyParser: true } };
