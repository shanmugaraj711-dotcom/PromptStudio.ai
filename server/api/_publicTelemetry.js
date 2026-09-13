import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./_firebaseAdmin.js";

const COLLECTION = "publicOptimizerDailyStats";
const REGISTERS = 4096;

const dayKey = (date = new Date()) => date.toISOString().slice(0, 10);
const docRef = (db, day = dayKey()) => db.collection(COLLECTION).doc(day);

const hashFor = (ip, day) => createHash("sha256")
  .update(`${process.env.PUBLIC_OPTIMIZER_RATE_LIMIT_SALT || process.env.GEMINI_API_KEY || "promptstudio"}:${day}:${ip}`)
  .digest();

const decode = (value) => {
  if (!value) return new Uint8Array(REGISTERS);
  try {
    const bytes = Buffer.from(String(value), "base64");
    if (bytes.length !== REGISTERS) return new Uint8Array(REGISTERS);
    return new Uint8Array(bytes);
  } catch {
    return new Uint8Array(REGISTERS);
  }
};

const encode = (registers) => Buffer.from(registers).toString("base64");

const rank = (hash) => {
  let value = BigInt(0);
  for (let i = 3; i < 10; i += 1) value = (value << BigInt(8)) | BigInt(hash[i]);
  const bits = BigInt(56);
  if (value === BigInt(0)) return Number(bits) + 1;
  let width = BigInt(0);
  let cursor = value;
  while (cursor > BigInt(0)) { width += BigInt(1); cursor >>= BigInt(1); }
  return Number(bits - width + BigInt(1));
};

const updateSketch = (encoded, ip, day) => {
  const registers = decode(encoded);
  const hash = hashFor(ip, day);
  const index = ((hash[0] << 8) | hash[1]) % REGISTERS;
  registers[index] = Math.max(registers[index], Math.min(63, rank(hash)));
  return encode(registers);
};

const estimate = (encoded) => {
  const registers = decode(encoded);
  const m = REGISTERS;
  let sum = 0;
  let zeros = 0;
  for (const value of registers) { sum += 2 ** (-value); if (value === 0) zeros += 1; }
  const alpha = 0.7213 / (1 + 1.079 / m);
  let estimateValue = alpha * m * m / sum;
  if (estimateValue <= 2.5 * m && zeros > 0) estimateValue = m * Math.log(m / zeros);
  return Math.max(0, Math.round(estimateValue));
};

export const recordVisitorAttempt = async ({ ip, day = dayKey() }) => {
  const db = adminDb();
  const ref = docRef(db, day);
  const hash = hashFor(ip, day);
  const visitorSketch = updateSketch(null, ip, day);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? snap.data() || {} : {};
    const nextSketch = updateSketch(current.visitorSketch, ip, day);
    tx.set(ref, {
      day,
      visitorSketch: nextSketch,
      visitors: estimate(nextSketch),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  });
  return { day, hash: hash.toString("hex"), visitorSketch };
};

export const recordSuccessfulOptimization = async ({ ip, day = dayKey(), limitReached = false }) => {
  const db = adminDb();
  const ref = docRef(db, day);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? snap.data() || {} : {};
    const update = {
      day,
      optimizations: Number(current.optimizations || 0) + 1,
      updatedAt: FieldValue.serverTimestamp(),
      lastSuccessAt: FieldValue.serverTimestamp()
    };
    if (limitReached) {
      const nextSketch = updateSketch(current.hitLimitSketch, ip, day);
      update.hitLimitSketch = nextSketch;
      update.hitLimitCount = estimate(nextSketch);
    }
    tx.set(ref, update, { merge: true });
  });
};

export const recordPublicError = async ({ code, day = dayKey() }) => {
  try {
    const db = adminDb();
    await docRef(db, day).set({
      day,
      lastErrorAt: FieldValue.serverTimestamp(),
      lastErrorCode: String(code || "unknown").slice(0, 80),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  } catch {
    // Telemetry must never break the public optimizer response.
  }
};

export const readDailyStats = async (day = dayKey()) => {
  const snap = await docRef(adminDb(), day).get();
  const data = snap.exists ? snap.data() || {} : {};
  return {
    day,
    visitors: Number(data.visitors || (data.visitorSketch ? estimate(data.visitorSketch) : 0)),
    optimizations: Number(data.optimizations || 0),
    hitLimitCount: Number(data.hitLimitCount || (data.hitLimitSketch ? estimate(data.hitLimitSketch) : 0)),
    lastSuccessAt: data.lastSuccessAt?.toDate?.()?.toISOString?.() || data.lastSuccessAt || null,
    lastErrorAt: data.lastErrorAt?.toDate?.()?.toISOString?.() || data.lastErrorAt || null,
    lastErrorCode: data.lastErrorCode || null
  };
};
