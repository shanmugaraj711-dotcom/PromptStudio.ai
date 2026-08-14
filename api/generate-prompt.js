import { GoogleGenAI } from "@google/genai";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { createQuotaState, getUtcDateKey } from "../src/constants/quota.js";

const ALLOWED_MODELS = new Set(["chatgpt", "claude", "gemini", "grok"]);
const ALLOWED_CATEGORIES = new Set([
  "writing",
  "coding",
  "image",
  "marketing",
  "business",
]);
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

const getAdminApp = () => {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new ApiError(
      503,
      "server_configuration_error",
      "The generation service is not configured yet. Please try again later."
    );
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    projectId,
  });
};

const getServices = () => {
  const app = getAdminApp();
  return {
    auth: getAuth(app),
    db: getFirestore(app),
  };
};

const getGeminiClient = () => {
  if (!process.env.GEMINI_API_KEY) {
    throw new ApiError(
      503,
      "server_configuration_error",
      "The generation service is not configured yet. Please try again later."
    );
  }

  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
};

const validateInput = ({ idea, aiModel, category, requestId }) => {
  const normalizedIdea = typeof idea === "string" ? idea.trim() : "";

  if (normalizedIdea.length < 3 || normalizedIdea.length > 6000) {
    throw new ApiError(
      400,
      "invalid_idea",
      "Please provide an idea between 3 and 6,000 characters."
    );
  }

  if (!ALLOWED_MODELS.has(aiModel) || !ALLOWED_CATEGORIES.has(category)) {
    throw new ApiError(
      400,
      "invalid_options",
      "Choose a supported AI model and category."
    );
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
    const [userSnapshot, requestSnapshot] = await Promise.all([
      transaction.get(userRef),
      transaction.get(requestRef),
    ]);

    if (requestSnapshot.exists) {
      const request = requestSnapshot.data();
      if (request.status === "succeeded" && request.prompt && request.quota) {
        return {
          status: "succeeded",
          prompt: request.prompt,
          historyId: request.historyId,
          quota: request.quota,
        };
      }

      throw new ApiError(
        409,
        "request_in_progress",
        "This generation request is still being processed. Please wait a moment."
      );
    }

    const currentQuota = createQuotaState(userSnapshot.exists ? userSnapshot.data() : {}, now);
    if (currentQuota.remaining === 0) {
      throw new ApiError(
        429,
        "quota_exhausted",
        "You have reached today's prompt limit.",
        currentQuota
      );
    }

    const reservedQuota = createQuotaState(
      {
        plan: currentQuota.plan,
        promptsToday: currentQuota.promptsToday + 1,
        lastPromptDate: dateKey,
        quotaVersion: currentQuota.quotaVersion + 1,
      },
      now
    );

    transaction.set(userRef, quotaFields(reservedQuota), { merge: true });
    transaction.set(requestRef, {
      status: "reserved",
      dateKey,
      quota: reservedQuota,
      createdAt: FieldValue.serverTimestamp(),
    });

    return { status: "reserved", quota: reservedQuota };
  });
};

const rollbackReservation = async ({ db, uid, requestId, now, failureCode }) => {
  const { userRef, requestRef } = getUserAndRequestRefs(db, uid, requestId);
  const currentDateKey = getUtcDateKey(now);

  return db.runTransaction(async (transaction) => {
    const [requestSnapshot, userSnapshot] = await Promise.all([
      transaction.get(requestRef),
      transaction.get(userRef),
    ]);

    const currentQuota = createQuotaState(userSnapshot.exists ? userSnapshot.data() : {}, now);
    if (!requestSnapshot.exists || requestSnapshot.data().status !== "reserved") {
      return currentQuota;
    }

    const reservation = requestSnapshot.data();
    const belongsToCurrentQuotaDay =
      reservation.dateKey === currentDateKey &&
      currentQuota.lastPromptDate === reservation.dateKey;
    const restoredQuota = belongsToCurrentQuotaDay
      ? createQuotaState(
          {
            plan: currentQuota.plan,
            promptsToday: Math.max(currentQuota.promptsToday - 1, 0),
            lastPromptDate: currentQuota.lastPromptDate,
            quotaVersion: currentQuota.quotaVersion + 1,
          },
          now
        )
      : currentQuota;

    if (belongsToCurrentQuotaDay) {
      transaction.set(userRef, quotaFields(restoredQuota), { merge: true });
    }

    transaction.update(requestRef, {
      status: "rolled_back",
      failureCode,
      quota: restoredQuota,
      completedAt: FieldValue.serverTimestamp(),
    });

    return restoredQuota;
  });
};

const saveSuccessfulGeneration = async ({
  db,
  uid,
  requestId,
  prompt,
  aiModel,
  category,
}) => {
  const { requestRef, historyRef } = getUserAndRequestRefs(db, uid, requestId);

  return db.runTransaction(async (transaction) => {
    const requestSnapshot = await transaction.get(requestRef);
    if (!requestSnapshot.exists) {
      throw new ApiError(409, "request_missing", "The generation request has expired.");
    }

    const request = requestSnapshot.data();
    if (request.status === "succeeded" && request.prompt && request.quota) {
      return {
        prompt: request.prompt,
        historyId: request.historyId,
        quota: request.quota,
      };
    }

    if (request.status !== "reserved") {
      throw new ApiError(409, "request_not_active", "The generation request is no longer active.");
    }

    transaction.set(historyRef, {
      prompt,
      aiModel,
      category,
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.update(requestRef, {
      status: "succeeded",
      prompt,
      historyId: historyRef.id,
      completedAt: FieldValue.serverTimestamp(),
    });

    return { prompt, historyId: historyRef.id, quota: request.quota };
  });
};

const isTransientGeminiError = (error) => {
  const status = Number(error?.status || error?.code || 0);
  return (
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    /high demand|unavailable|temporar|overload|timeout/i.test(error?.message || "")
  );
};

const generateWithTimeout = async ({ client, model, contents, config, timeoutMs }) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await client.models.generateContent({
      model,
      contents,
      config: {
        ...config,
        abortSignal: controller.signal,
      },
    });
  } finally {
    clearTimeout(timeout);
  }
};

const createOptimizedPrompt = async ({ client, idea, aiModel, category }) => {
  const contents = `Create a polished, ready-to-paste prompt for ${aiModel}.\n\nCategory: ${category}\nUser idea: ${idea}`;
  const config = {
    systemInstruction:
      "You are PromptStudio AI. Return only the final, detailed prompt. Structure it with clear sections such as role, objective, context, requirements, output format, and quality checks. Do not add commentary or markdown code fences.",
    maxOutputTokens: 1200,
  };

  try {
    const response = await generateWithTimeout({
      client,
      model: PRIMARY_GEMINI_MODEL,
      contents,
      config,
      timeoutMs: PRIMARY_GEMINI_TIMEOUT_MS,
    });
    const prompt = response.text?.trim();
    if (prompt) return prompt;
  } catch (error) {
    if (!isTransientGeminiError(error)) throw error;
    console.warn("Primary Gemini generation unavailable; trying fallback model", {
      model: PRIMARY_GEMINI_MODEL,
      code: error?.code || error?.status || "unknown",
    });
  }

  try {
    const response = await generateWithTimeout({
      client,
      model: FALLBACK_GEMINI_MODEL,
      contents,
      config,
      timeoutMs: FALLBACK_GEMINI_TIMEOUT_MS,
    });
    const prompt = response.text?.trim();
    if (prompt) return prompt;
  } catch (error) {
    console.warn("Fallback Gemini generation unavailable", {
      model: FALLBACK_GEMINI_MODEL,
      code: error?.code || error?.status || "unknown",
    });
    throw error;
  }

  throw new Error("Gemini returned an empty response.");
};

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return sendJson(response, 405, {
      code: "method_not_allowed",
      message: "Use POST to generate a prompt.",
    });
  }

  try {
    const body = parseBody(request.body);
    const idea = validateInput(body);
    const authorization = request.headers?.authorization || request.headers?.Authorization;
    const idToken = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : "";

    if (!idToken) {
      throw new ApiError(401, "unauthenticated", "Please sign in to generate a prompt.");
    }

    const services = getServices();
    const client = getGeminiClient();
    const decodedToken = await services.auth.verifyIdToken(idToken);
    const now = new Date();
    const reservation = await reserveGeneration({
      db: services.db,
      uid: decodedToken.uid,
      requestId: body.requestId,
      now,
    });

    if (reservation.status === "succeeded") {
      return sendJson(response, 200, reservation);
    }

    let prompt;
    try {
      prompt = await createOptimizedPrompt({
        client,
        idea,
        aiModel: body.aiModel,
        category: body.category,
      });
    } catch (error) {
      const quota = await rollbackReservation({
        db: services.db,
        uid: decodedToken.uid,
        requestId: body.requestId,
        now: new Date(),
        failureCode: "gemini_failed",
      });
      console.error("Gemini generation failed", { code: error?.code || "unknown" });
      throw new ApiError(
        502,
        "generation_failed",
        "The AI service could not generate a prompt. Your quota was restored.",
        quota
      );
    }

    try {
      const result = await saveSuccessfulGeneration({
        db: services.db,
        uid: decodedToken.uid,
        requestId: body.requestId,
        prompt,
        aiModel: body.aiModel,
        category: body.category,
      });
      return sendJson(response, 200, result);
    } catch (error) {
      const quota = await rollbackReservation({
        db: services.db,
        uid: decodedToken.uid,
        requestId: body.requestId,
        now: new Date(),
        failureCode: "history_write_failed",
      });
      console.error("Prompt history save failed", { code: error?.code || "unknown" });
      throw new ApiError(
        500,
        "history_save_failed",
        "We could not save this prompt. Your quota was restored.",
        quota
      );
    }
  } catch (error) {
    if (!(error instanceof ApiError)) {
      console.error("Prompt generation endpoint failed", { code: error?.code || "unknown" });
    }
    const status = error instanceof ApiError ? error.status : 500;
    return sendJson(response, status, toErrorPayload(error));
  }
}
