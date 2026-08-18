import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./_firebaseAdmin.js";

const WINDOW_MS = 60_000;
const USER_LIMIT = 8;
const IP_LIMIT = 20;

const normalizeIp = (req) => {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || String(req.socket?.remoteAddress || "unknown").slice(0, 100);
};

export const enforceGenerationRateLimit = async (req, uid) => {
  const now = Date.now();
  const windowKey = Math.floor(now / WINDOW_MS);
  const ip = normalizeIp(req);
  const db = adminDb();
  const userRef = db.collection("rateLimits").doc(`user_${uid}`);
  const ipRef = db.collection("rateLimits").doc(`ip_${Buffer.from(ip).toString("base64url").slice(0, 120)}`);
  return db.runTransaction(async (tx) => {
    const [userSnap, ipSnap] = await Promise.all([tx.get(userRef), tx.get(ipRef)]);
    const user = userSnap.exists && userSnap.data().windowKey === windowKey ? Number(userSnap.data().count || 0) : 0;
    const address = ipSnap.exists && ipSnap.data().windowKey === windowKey ? Number(ipSnap.data().count || 0) : 0;
    if (user >= USER_LIMIT || address >= IP_LIMIT) {
      const error = new Error("Too many generation requests. Please wait a minute and try again.");
      error.status = 429;
      error.code = "generation_rate_limited";
      throw error;
    }
    tx.set(userRef, { windowKey, count: user + 1, updatedAt: FieldValue.serverTimestamp() });
    tx.set(ipRef, { windowKey, count: address + 1, updatedAt: FieldValue.serverTimestamp() });
    return { userRemaining: USER_LIMIT - user - 1, ipRemaining: IP_LIMIT - address - 1 };
  });
};
