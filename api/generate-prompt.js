import { GoogleGenAI } from "@google/genai";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { createQuotaState, getUtcDateKey } from "../src/constants/quota.js";

const ALLOWED_MODELS = new Set(["chatgpt", "claude", "gemini", "grok"]);
const ALLOWED_CATEGORIES = new Set(["writing", "coding", "image", "marketing", "business"]);
const REQUEST_ID_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;

const PRIMARY_GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const FALLBACK_GEMINI_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.6-flash";
const PRIMARY_GEMINI_TIMEOUT_MS = 8000;
const FALLBACK_GEMINI_TIMEOUT_MS = 7000;

class ApiError extends Error {
  constructor(status, code, message, quota) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.quota = quota;
  }
}

const toErrorPayload = (error) => ({
  code: error.code || "generation_unavailable",
  message: error.message || "Unable to generate a prompt right now.",
  ...(error.quota ? { quota: error.quota } : {}),
});

const sendJson = (response, status, payload) => {
  response.setHeader?.("Cache-Control", "no-store");
  return response.status(status).json(payload);
};

const parseBody = (body) => {
  if (!body) return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      throw new ApiError(400, "invalid_request", "The request body must be valid JSON.");
    }
  }
  return body;
};

const getAdminCredential = () => {
  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (serviceAccountKey) {
    try {
      const parsed = JSON.parse(serviceAccountKey);
      if (parsed.project_id && parsed.client_email && parsed.private_key) {
        return cert({
          projectId: parsed.project_id,
          clientEmail: parsed.client_email,
          privateKey: parsed.private_key.replace(/\\n/g, "\n"),
        });
      }
    } catch {
      throw new ApiError(503, "server_configuration_error", "The Firebase server configuration is invalid.");
    }
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    throw new ApiError(503, "server_configuration_error", "The generation service is not configured yet. Please try again later.");
  }
  return cert({ projectId, clientEmail, privateKey });
};

const getAdminApp = () => {
  if (getApps().length > 0) return getApps()[0];
  return initializeApp({ credential: getAdminCredential() });
};

const getServices = () => {
  const app = getAdminApp();
  return { auth: getAuth(app), db: getFirestore(app) };
};

const getGeminiClient = () => {
  if (!process.env.GEMINI_API_KEY) {
    throw new ApiError(503, "server_configuration_error", "The generation service is not configured yet. Please try again later.");
  }
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
};

const validateInput = ({ idea, aiModel, category, requestId }) => {
  const normalizedIdea = typeof idea === "string" ? idea.trim() : "";
  if (normalizedIdea.length < 3 || normalizedIdea.length > 6000) {
    throw new ApiError(400, "invalid_idea", "Please provide an idea between 3 and 6,000 characters.");
  }
  if (!ALLOWED_MODELS.has(aiModel) || !ALLOWED_CATEGORIES.has(category)) {
    throw new ApiError(400, "invalid_options", "Choose a supported AI model and category.");
  }
  if (typeof requestId !== "string" || !REQUEST_ID_PATTERN.test(requestId)) {
    throw new ApiError(400, "invalid_request", "The generation request ID is invalid.");
  }
  return normalizedIdea;
};

const getUserAndRequestRefs = (db, uid, requestId) => {
  const userRef = db.collection("users").doc(uid);
  return {
    userRef,
    requestRef: userRef.collection("generationRequests").doc(requestId),
    historyRef: userRef.collection("prompts").doc(requestId),
  };
};

const quotaFields = (quota) => ({
  plan: quota.plan,
  promptsToday: quota.promptsToday,
  lastPromptDate: quota.lastPromptDate,
  quotaVersion: quota.quotaVersion,
  updatedAt: FieldValue.serverTimestamp(),
});

const reserveGeneration = async ({ db, uid, requestId, now }) => {
  const { userRef, requestRef } = getUserAndRequestRefs(db, uid, requestId);
  const dateKey = getUtcDateKey(now);
  return db.runTransaction(async (transaction) => {
    const [userSnapshot, requestSnapshot] = await Promise.all([transaction.get(userRef), transaction.get(requestRef)]);
    if (requestSnapshot.exists) {
      const request = requestSnapshot.data();
      if (request.status === "succeeded" && request.prompt && request.quota) {
        return { status: "succeeded", prompt: request.prompt, perspectives: request.perspectives || [], intelligence: request.intelligence || null, historyId: request.historyId, quota: request.quota };
      }
      throw new ApiError(409, "request_in_progress", "This generation request is still being processed. Please wait a moment.");
    }
    const currentQuota = createQuotaState(userSnapshot.exists ? userSnapshot.data() : {}, now);
    if (currentQuota.remaining === 0) throw new ApiError(429, "quota_exhausted", "You have reached today's prompt limit.", currentQuota);
    const reservedQuota = createQuotaState({
      plan: currentQuota.plan,
      promptsToday: currentQuota.promptsToday + 1,
      lastPromptDate: dateKey,
      quotaVersion: currentQuota.quotaVersion + 1,
    }, now);
    transaction.set(userRef, quotaFields(reservedQuota), { merge: true });
    transaction.set(requestRef, { status: "reserved", dateKey, quota: reservedQuota, createdAt: FieldValue.serverTimestamp() });
    return { status: "reserved", quota: reservedQuota };
  });
};

const rollbackReservation = async ({ db, uid, requestId, now, failureCode }) => {
  const { userRef, requestRef } = getUserAndRequestRefs(db, uid, requestId);
  const currentDateKey = getUtcDateKey(now);
  return db.runTransaction(async (transaction) => {
    const [requestSnapshot, userSnapshot] = await Promise.all([transaction.get(requestRef), transaction.get(userRef)]);
    const currentQuota = createQuotaState(userSnapshot.exists ? userSnapshot.data() : {}, now);
    if (!requestSnapshot.exists || requestSnapshot.data().status !== "reserved") return currentQuota;
    const reservation = requestSnapshot.data();
    const belongsToCurrentQuotaDay = reservation.dateKey === currentDateKey && currentQuota.lastPromptDate === reservation.dateKey;
    const restoredQuota = belongsToCurrentQuotaDay
      ? createQuotaState({ plan: currentQuota.plan, promptsToday: Math.max(currentQuota.promptsToday - 1, 0), lastPromptDate: currentQuota.lastPromptDate, quotaVersion: currentQuota.quotaVersion + 1 }, now)
      : currentQuota;
    if (belongsToCurrentQuotaDay) transaction.set(userRef, quotaFields(restoredQuota), { merge: true });
    transaction.update(requestRef, { status: "rolled_back", failureCode, quota: restoredQuota, completedAt: FieldValue.serverTimestamp() });
    return restoredQuota;
  });
};

const saveSuccessfulGeneration = async ({ db, uid, requestId, result, aiModel, category }) => {
  const { requestRef, historyRef } = getUserAndRequestRefs(db, uid, requestId);
  return db.runTransaction(async (transaction) => {
    const requestSnapshot = await transaction.get(requestRef);
    if (!requestSnapshot.exists) throw new ApiError(409, "request_missing", "The generation request has expired.");
    const request = requestSnapshot.data();
    if (request.status === "succeeded" && request.prompt && request.quota) {
      return { prompt: request.prompt, perspectives: request.perspectives || [], intelligence: request.intelligence || null, historyId: request.historyId, quota: request.quota };
    }
    if (request.status !== "reserved") throw new ApiError(409, "request_not_active", "The generation request is no longer active.");
    transaction.set(historyRef, {
      prompt: result.prompt,
      perspectives: result.perspectives,
      intelligence: result.intelligence,
      aiModel,
      category,
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.update(requestRef, {
      status: "succeeded",
      prompt: result.prompt,
      perspectives: result.perspectives,
      intelligence: result.intelligence,
      historyId: historyRef.id,
      completedAt: FieldValue.serverTimestamp(),
    });
    return { prompt: result.prompt, perspectives: result.perspectives, intelligence: result.intelligence, historyId: historyRef.id, quota: request.quota };
  });
};

const isTransientGeminiError = (error) => {
  const status = Number(error?.status || error?.code || 0);
  return status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504 || /high demand|unavailable|temporar|overload|timeout|abort/i.test(error?.message || "");
};

const generateWithTimeout = async ({ client, model, contents, config, timeoutMs }) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await client.models.generateContent({ model, contents, config: { ...config, abortSignal: controller.signal } });
  } finally {
    clearTimeout(timeout);
  }
};

const normalizeIntelligence = (value, category) => {
  const intelligence = value && typeof value === "object" ? value : {};
  const perspectives = Array.isArray(intelligence.perspectives) ? intelligence.perspectives : [];
  const safePerspectives = perspectives
    .filter((item) => item && typeof item.label === "string" && typeof item.prompt === "string")
    .slice(0, 3)
    .map((item, index) => ({ id: item.id || `perspective-${index + 1}`, label: item.label.trim().slice(0, 60), prompt: item.prompt.trim().slice(0, 12000) }))
    .filter((item) => item.prompt.length >= 20);

  return {
    prompt: typeof intelligence.prompt === "string" ? intelligence.prompt.trim().slice(0, 12000) : "",
    perspectives: safePerspectives,
    intelligence: {
      intent: typeof intelligence.intent === "string" ? intelligence.intent.trim().slice(0, 240) : "",
      outputType: typeof intelligence.outputType === "string" ? intelligence.outputType.trim().slice(0, 120) : category,
      assumptions: Array.isArray(intelligence.assumptions) ? intelligence.assumptions.filter((x) => typeof x === "string").slice(0, 5) : [],
      missing: Array.isArray(intelligence.missing) ? intelligence.missing.filter((x) => typeof x === "string").slice(0, 5) : [],
      recommendations: Array.isArray(intelligence.recommendations) ? intelligence.recommendations.filter((x) => typeof x === "string").slice(0, 5) : [],
    },
  };
};

const createOptimizedPrompt = async ({ client, idea, aiModel, category }) => {
  const contents = `You are the intelligence engine inside PromptStudio. Transform the user's rough request into a professional, ready-to-paste AI prompt.\n\nTARGET AI: ${aiModel}\nCATEGORY: ${category}\nUSER REQUEST:\n${idea}`;
  const config = {
    systemInstruction: `You are an expert prompt architect, intent analyst, and multimodal workflow designer. Your job is to improve the user's intent without inventing personal facts, visual facts, business facts, or requirements that were not supplied. Distinguish facts from reasonable recommendations and missing information. If the request is vague, make the best useful prompt possible while using neutral placeholders only where they materially matter.\n\nReturn valid JSON only with this exact shape:\n{"prompt":"...","perspectives":[{"id":"...","label":"...","prompt":"..."}],"intent":"...","outputType":"...","assumptions":["..."],"missing":["..."],"recommendations":["..."]}\n\nThe main prompt must be ready to paste and should contain only information useful to the requested task. Include role, objective, context, constraints, output format, and quality criteria when relevant; do not mechanically include every section when it does not help.\n\nCreate exactly three genuinely different perspectives. For example, image tasks may use Faithful / Professional / Creative; coding may use Robust / Minimal / Production; marketing may use Conversion / Brand / Growth. Choose labels appropriate to the user's actual intent. Each perspective must remain faithful to known facts.\n\nFor missing information, list only details that would meaningfully improve the result. Do not turn missing details into invented facts. Keep recommendations short and actionable.`,
    responseMimeType: "application/json",
    maxOutputTokens: 2200,
  };

  let response;
  try {
    response = await generateWithTimeout({ client, model: PRIMARY_GEMINI_MODEL, contents, config, timeoutMs: PRIMARY_GEMINI_TIMEOUT_MS });
  } catch (error) {
    if (!isTransientGeminiError(error)) throw error;
    console.warn("Primary Gemini generation unavailable; trying fallback model", { model: PRIMARY_GEMINI_MODEL, code: error?.code || error?.status || "unknown" });
    response = await generateWithTimeout({ client, model: FALLBACK_GEMINI_MODEL, contents, config, timeoutMs: FALLBACK_GEMINI_TIMEOUT_MS });
  }

  const raw = response.text?.trim();
  if (!raw) throw new Error("Gemini returned an empty response.");

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Gemini returned an invalid intelligence response.");
  }

  const result = normalizeIntelligence(parsed, category);
  if (!result.prompt || result.perspectives.length < 3) throw new Error("Gemini returned an incomplete intelligence response.");
  return result;
};

export default async function handler(request, response) {
  if (request.method !== "POST") return sendJson(response, 405, { code: "method_not_allowed", message: "Use POST to generate a prompt." });
  try {
    const body = parseBody(request.body);
    const idea = validateInput(body);
    const authorization = request.headers?.authorization || request.headers?.Authorization;
    const idToken = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
    if (!idToken) throw new ApiError(401, "unauthenticated", "Please sign in to generate a prompt.");
    const services = getServices();
    const client = getGeminiClient();
    const decodedToken = await services.auth.verifyIdToken(idToken);
    const now = new Date();
    const reservation = await reserveGeneration({ db: services.db, uid: decodedToken.uid, requestId: body.requestId, now });
    if (reservation.status === "succeeded") return sendJson(response, 200, reservation);

    let result;
    try {
      result = await createOptimizedPrompt({ client, idea, aiModel: body.aiModel, category: body.category });
    } catch (error) {
      const quota = await rollbackReservation({ db: services.db, uid: decodedToken.uid, requestId: body.requestId, now: new Date(), failureCode: "gemini_failed" });
      console.error("Gemini generation failed", { code: error?.code || "unknown" });
      throw new ApiError(502, "generation_failed", "The AI service could not generate a prompt. Your quota was restored.", quota);
    }

    try {
      const saved = await saveSuccessfulGeneration({ db: services.db, uid: decodedToken.uid, requestId: body.requestId, result, aiModel: body.aiModel, category: body.category });
      return sendJson(response, 200, saved);
    } catch (error) {
      const quota = await rollbackReservation({ db: services.db, uid: decodedToken.uid, requestId: body.requestId, now: new Date(), failureCode: "history_write_failed" });
      console.error("Prompt history save failed", { code: error?.code || "unknown" });
      throw new ApiError(500, "history_save_failed", "We could not save this prompt. Your quota was restored.", quota);
    }
  } catch (error) {
    if (!(error instanceof ApiError)) console.error("Prompt generation endpoint failed", { code: error?.code || "unknown" });
    const status = error instanceof ApiError ? error.status : 500;
    return sendJson(response, status, toErrorPayload(error));
  }
}
