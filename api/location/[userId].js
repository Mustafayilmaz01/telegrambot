// api/location/[userId].js
import admin from "firebase-admin";

// --- Webhook'takiyle TAMAMEN AYNI Firebase kodu ---
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

// Bot kodundaki aynı helper'lar
function parseTs(v) {
  const d = new Date(v);
  return isNaN(d) ? null : d;
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

function filterLast24h(positions) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return positions
    .map((p) => ({ ...p, __d: parseTs(p.timestamp) }))
    .filter((p) => p.__d && p.__d >= cutoff && p.__d <= now)
    .sort((a, b) => b.__d - a.__d)
    .map(({ __d, ...rest }) => rest);
}

function getTimeAgo(timestamp) {
  const now = new Date();
  const turkishNow = new Date(now.getTime() + (3 * 60 * 60 * 1000));
  const locationTime = new Date(timestamp);
  const diff = turkishNow.getTime() - locationTime.getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days} gün önce`;
  if (hours > 0) return `${hours} saat önce`;
  if (minutes <= 0) return `Az önce`;
  return `${minutes} dakika önce`;
}

export default async function handler(req, res) {
  const { userId } = req.query;
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method === 'GET') {
    try {
      if (!userId || userId.length < 3) {
        return res.status(400).json({
          success: false,
          message: 'Geçersiz kullanıcı ID'
        });
      }
      
      const db = getFirestore();
      const allPositions = await readAllPositions(db, userId);
      
      if (!allPositions.length) {
        return res.status(404).json({
          success: false,
          message: 'Bu kullanıcı için hiç kayıt bulunamadı'
        });
      }
      
      const last24h = filterLast24h(allPositions);
      
      if (!last24h.length) {
        return res.status(404).json({
          success: false,
          message: 'Son 24 saatte kayıt bulunamadı'
        });
      }
      
      const formattedLocations = last24h.map((position, index) => {
        const utcTime = new Date(position.timestamp);
        const turkishTime = new Date(utcTime.getTime() + (3 * 60 * 60 * 1000));
        const turkishTimestamp = turkishTime.toISOString();
        
        return {
          id: `${userId}_${index}`,
          timestamp: turkishTimestamp,
          latitude: parseFloat(position.latitude),
          longitude: parseFloat(position.longitude),
          address: position.address || `${parseFloat(position.latitude).toFixed(4)}, ${parseFloat(position.longitude).toFixed(4)}`,
          timeAgo: getTimeAgo(turkishTimestamp),
          googleMapsUrl: `https://maps.google.com/?q=${position.latitude},${position.longitude}`
        };
      });
      
      return res.status(200).json({
        success: true,
        userId: userId,
        count: formattedLocations.length,
        locations: formattedLocations,
        lastLocation: formattedLocations[0],
        timeRange: '24h'
      });
      
    } catch (error) {
      console.error('API Error:', error);
      return res.status(500).json({
        success: false,
        message: 'Sunucu hatası',
        error: error.message
      });
    }
  }
  
  return res.status(405).json({ message: 'Method not allowed' });
}