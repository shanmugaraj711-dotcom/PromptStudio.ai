import { GoogleGenAI } from "@google/genai";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, json, requireUser } from "./_firebaseAdmin.js";
import { enforceGenerationRateLimit } from "./_generationRateLimit.js";
import { createQuotaState, getUtcDateKey, getUtcMonthKey } from "../src/constants/quota.js";
import { getRuntimeProductConfig } from "./_productConfig.js";

const MODELS = new Set(["chatgpt", "claude", "gemini", "grok", "midjourney"]);
const CATEGORIES = new Set(["writing", "coding", "image", "marketing", "business"]);
const REQUEST_ID = /^[a-zA-Z0-9_-]{8,128}$/;
const MAX_IMAGE_DATA_LENGTH = 4_000_000;
const PRIMARY_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.6-flash";

class ApiError extends Error { constructor(status, code, message, quota) { super(message); this.status = status; this.code = code; this.quota = quota; } }
const parseBody = (body) => { if (!body) return {}; if (typeof body === "string") { try { return JSON.parse(body); } catch { throw new ApiError(400, "invalid_request", "The request body must be valid JSON."); } } return body; };
const validate = (body) => {
  const idea = typeof body.idea === "string" ? body.idea.trim() : "";
  const image = body.image && typeof body.image === "object" ? body.image : null;
  if ((idea.length < 3 && !image) || idea.length > 6000) throw new ApiError(400, "invalid_idea", "Please describe your idea or attach a reference image.");
  if (!MODELS.has(body.aiModel) || !CATEGORIES.has(body.category)) throw new ApiError(400, "invalid_options", "Choose a supported AI model and category.");
  if (typeof body.requestId !== "string" || !REQUEST_ID.test(body.requestId)) throw new ApiError(400, "invalid_request", "The generation request ID is invalid.");
  if (image && (image.mimeType !== "image/jpeg" || typeof image.data !== "string" || !image.data || image.data.length > MAX_IMAGE_DATA_LENGTH)) throw new ApiError(400, "invalid_image", "The reference image is invalid or too large.");
  return { idea, image };
};
const quotaFields = (quota) => ({ plan: quota.plan, promptsToday: quota.promptsToday, lastPromptDate: quota.lastPromptDate, imageAnalysesToday: quota.imageAnalysesToday, lastImageAnalysisDate: quota.lastImageAnalysisDate, imageAnalysesThisMonth: quota.imageAnalysesThisMonth, lastImageAnalysisMonth: quota.lastImageAnalysisMonth, quotaVersion: quota.quotaVersion, updatedAt: FieldValue.serverTimestamp() });

const reserve = async ({ db, uid, requestId, now, hasImage, productConfig }) => {
  const userRef = db.collection("users").doc(uid);
  const requestRef = userRef.collection("generationRequests").doc(requestId);
  const dateKey = getUtcDateKey(now); const monthKey = getUtcMonthKey(now);
  return db.runTransaction(async (tx) => {
    const [userSnap, requestSnap] = await Promise.all([tx.get(userRef), tx.get(requestRef)]);
    if (requestSnap.exists) { const request = requestSnap.data(); if (request.status === "succeeded" && request.prompt && request.quota) return { status: "succeeded", ...request }; throw new ApiError(409, "request_in_progress", "This generation request is still being processed. Please wait a moment."); }
    const user = userSnap.exists ? userSnap.data() : {};
    const quota = createQuotaState(user, now, productConfig);
    const imageFreeAvailable = !hasImage || quota.imageLimit === null || quota.imageRemaining > 0;
    const usesFreePrompt = quota.remaining > 0 && imageFreeAvailable;
    const creditCost = hasImage ? productConfig.creditCosts.referenceImageAnalysis : productConfig.creditCosts.standardGeneration;
    const credits = Math.max(Number(user.credits || 0), 0);
    if (!usesFreePrompt && credits < creditCost) throw new ApiError(402, "credits_required", `You need ${creditCost} credits for this generation.`, quota);
    const nextState = { plan: quota.plan, promptsToday: usesFreePrompt ? quota.promptsToday + 1 : quota.promptsToday, lastPromptDate: usesFreePrompt ? dateKey : quota.lastPromptDate, imageAnalysesToday: quota.imageAnalysesToday, lastImageAnalysisDate: quota.lastImageAnalysisDate, imageAnalysesThisMonth: quota.imageAnalysesThisMonth, lastImageAnalysisMonth: quota.lastImageAnalysisMonth, quotaVersion: quota.quotaVersion + 1 };
    if (hasImage && usesFreePrompt) { if (quota.dailyImageLimit !== null) { nextState.imageAnalysesToday = quota.imageAnalysesToday + 1; nextState.lastImageAnalysisDate = dateKey; } else { nextState.imageAnalysesThisMonth = quota.imageAnalysesThisMonth + 1; nextState.lastImageAnalysisMonth = monthKey; } }
    const reservedQuota = createQuotaState(nextState, now, productConfig);
    const creditDeducted = usesFreePrompt ? 0 : creditCost;
    tx.set(userRef, { ...quotaFields(reservedQuota), credits: credits - creditDeducted }, { merge: true });
    tx.set(requestRef, { status: "reserved", dateKey, monthKey, usesFreePrompt, creditCost: creditDeducted, hasImage, quota: reservedQuota, createdAt: FieldValue.serverTimestamp() });
    return { status: "reserved", quota: reservedQuota, creditsRemaining: credits - creditDeducted, creditCost: creditDeducted };
  });
};

const rollback = async ({ db, uid, requestId, now, failureCode, productConfig }) => {
  const userRef = db.collection("users").doc(uid); const requestRef = userRef.collection("generationRequests").doc(requestId); const dateKey = getUtcDateKey(now); const monthKey = getUtcMonthKey(now);
  return db.runTransaction(async (tx) => {
    const [requestSnap, userSnap] = await Promise.all([tx.get(requestRef), tx.get(userRef)]);
    if (!requestSnap.exists || requestSnap.data().status !== "reserved") return createQuotaState(userSnap.exists ? userSnap.data() : {}, now, productConfig);
    const reservation = requestSnap.data(); const user = userSnap.exists ? userSnap.data() : {}; const quota = createQuotaState(user, now, productConfig);
    const restored = { plan: quota.plan, promptsToday: reservation.usesFreePrompt && reservation.dateKey === dateKey && quota.lastPromptDate === dateKey ? Math.max(quota.promptsToday - 1, 0) : quota.promptsToday, lastPromptDate: quota.lastPromptDate, imageAnalysesToday: quota.imageAnalysesToday, lastImageAnalysisDate: quota.lastImageAnalysisDate, imageAnalysesThisMonth: quota.imageAnalysesThisMonth, lastImageAnalysisMonth: quota.lastImageAnalysisMonth, quotaVersion: quota.quotaVersion + 1 };
    if (reservation.hasImage && reservation.usesFreePrompt) { if (quota.dailyImageLimit !== null && reservation.dateKey === dateKey) restored.imageAnalysesToday = Math.max(quota.imageAnalysesToday - 1, 0); if (quota.monthlyImageLimit !== null && reservation.monthKey === monthKey) restored.imageAnalysesThisMonth = Math.max(quota.imageAnalysesThisMonth - 1, 0); }
    const restoredQuota = createQuotaState(restored, now, productConfig); const restoredCredits = Math.max(Number(user.credits || 0), 0) + Math.max(Number(reservation.creditCost || 0), 0);
    tx.set(userRef, { ...quotaFields(restoredQuota), credits: restoredCredits }, { merge: true }); tx.update(requestRef, { status: "rolled_back", failureCode, quota: restoredQuota, creditsRemaining: restoredCredits, completedAt: FieldValue.serverTimestamp() }); return restoredQuota;
  });
};

const generate = async ({ client, idea, aiModel, category, image }) => {
  const text = `You are the intelligence engine inside PromptStudio. Transform the user's request into a professional, ready-to-paste AI prompt.\n\nTARGET AI: ${aiModel}\nCATEGORY: ${category}\nUSER REQUEST:\n${idea || "No text was supplied; use the reference image as the primary source of truth."}`;
  const contents = image ? [{ text }, { inlineData: { mimeType: image.mimeType, data: image.data } }] : text;
  const config = { systemInstruction: `You are PromptStudio's reference-aware prompt architect. Analyze attached reference images as source evidence and turn what is visibly present into a high-quality, ready-to-paste prompt for the selected target AI. Do not blindly describe the image or invent hidden facts.\n\nFor every reference image, perform a structured visual decomposition before writing the final prompt:\n1) SUBJECT AND IDENTITY: describe the main subject, pose, expression, body orientation, hair, clothing, accessories and other visible identity-defining details. Preserve recognizable visual traits without claiming a person's real identity.\n2) COMPOSITION AND GEOMETRY: capture orientation, framing, crop, camera angle, subject placement, foreground/midground/background, negative space, symmetry/asymmetry, major shapes and important spatial relationships. Preserve distinctive placement such as a large sun/circle behind the subject.\n3) CAMERA AND LIGHT: infer only visible evidence such as close-up/medium/full shot, apparent lens perspective, depth of field, focus, lighting direction, softness, contrast, highlights, shadows and atmosphere. Mark uncertain technical details as approximate rather than factual.\n4) STYLE AND MATERIAL LANGUAGE: identify the visible rendering/photographic/illustrative style, line quality, brush or ink treatment, texture, grain, realism level, edge quality, materials and finish. Separate visual style from subject content.\n5) COLOR PALETTE: capture dominant colors, accent colors, contrast and relationships between subject and background. Preserve distinctive combinations such as warm cream, orange and black when present.\n6) TYPOGRAPHY AND GRAPHICS: explicitly inspect visible text, scripts, logos-like graphic elements, symbols, stickers, borders, stamps, calligraphy and decorative marks. If text is legible, reproduce it in the prompt as visible text; if uncertain, describe its placement/style without inventing wording. Mention approximate position, scale and orientation.\n7) DISTINCTIVE DETAILS: identify the few elements that make this reference recognizable and prioritize them in the final prompt. Avoid wasting prompt space on generic adjectives.\n\nThen write the final prompt so another image model could recreate the same visual language and composition while following the user's requested goal. For reference-driven image tasks, prioritize composition preservation and distinctive visual anchors over generic adjectives. If the user gives no text, treat the reference as the primary source of truth. If the user gives text, combine it with the reference rather than ignoring either.\n\nCreate exactly three genuinely useful perspectives. For reference images prefer: Faithful Recreation (closest visual reconstruction), Professional Production (cleaner production-ready interpretation that preserves the reference structure), and Creative Variation (same core composition/style with controlled creative freedom). Make each perspective materially different, not three rewrites of the same prompt.\n\nReturn valid JSON only: {"prompt":"...","perspectives":[{"id":"...","label":"...","prompt":"..."}],"intent":"...","outputType":"...","assumptions":["..."],"missing":["..."],"recommendations":["..."]}. Keep assumptions limited to genuinely uncertain visual inferences. Keep missing limited to information that would materially affect the result. Recommendations should be practical prompt/imaging improvements, not generic advice.`, responseMimeType: "application/json", maxOutputTokens: 2600 };
  const call = async (model, timeoutMs) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try { return await client.models.generateContent({ model, contents, config: { ...config, abortSignal: controller.signal } }); }
    finally { clearTimeout(timeout); }
  };
  let lastError;
  for (const [model, timeoutMs] of [[PRIMARY_MODEL, 12000], [FALLBACK_MODEL, 10000]]) {
    try {
      const response = await call(model, timeoutMs);
      const parsed = JSON.parse(response.text?.trim() || "{}");
      const perspectives = Array.isArray(parsed.perspectives) ? parsed.perspectives.filter((x) => x?.label && x?.prompt).slice(0, 3) : [];
      if (!parsed.prompt || perspectives.length < 3) throw new Error("incomplete_response");
      return { prompt: String(parsed.prompt).trim(), perspectives, intelligence: { intent: parsed.intent || "", outputType: parsed.outputType || category, assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions.slice(0, 5) : [], missing: Array.isArray(parsed.missing) ? parsed.missing.slice(0, 5) : [], recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.slice(0, 5) : [] } };
    } catch (error) {
      lastError = error;
      console.warn("Prompt generation model attempt failed", { model, reason: error?.name || "unknown" });
    }
  }
  throw lastError || new Error("generation_failed");
};

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { code: "method_not_allowed", message: "Use POST to generate a prompt." });
  try {
    const body = parseBody(req.body); const input = validate(body); const decoded = await requireUser(req);
    await enforceGenerationRateLimit(req, decoded.uid);
    if (!process.env.GEMINI_API_KEY) throw new ApiError(503, "server_configuration_error", "The generation service is not configured yet. Please try again later.");
    const db = adminDb(); const productConfig = await getRuntimeProductConfig(db);
    const reservation = await reserve({ db, uid: decoded.uid, requestId: body.requestId, now: new Date(), hasImage: Boolean(input.image), productConfig });
    if (reservation.status === "succeeded") return json(res, 200, reservation);
    let result;
    try { result = await generate({ client: new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }), idea: input.idea, aiModel: body.aiModel, category: body.category, image: input.image }); }
    catch { const quota = await rollback({ db, uid: decoded.uid, requestId: body.requestId, now: new Date(), failureCode: "generation_failed", productConfig }); return json(res, 502, { code: "generation_failed", message: "The AI service could not generate a prompt. Your quota and credits were restored.", quota }); }
    const userRef = db.collection("users").doc(decoded.uid); const requestRef = userRef.collection("generationRequests").doc(body.requestId); const historyRef = userRef.collection("prompts").doc(body.requestId);
    const saved = await db.runTransaction(async (tx) => { const requestSnap = await tx.get(requestRef); if (!requestSnap.exists || requestSnap.data().status !== "reserved") throw new ApiError(409, "request_not_active", "The generation request is no longer active."); const request = requestSnap.data(); tx.set(historyRef, { prompt: result.prompt, perspectives: result.perspectives, intelligence: result.intelligence, aiModel: body.aiModel, category: body.category, hasReferenceImage: Boolean(input.image), referenceImageName: input.image?.name || null, createdAt: FieldValue.serverTimestamp() }); tx.update(requestRef, { status: "succeeded", prompt: result.prompt, perspectives: result.perspectives, intelligence: result.intelligence, historyId: historyRef.id, completedAt: FieldValue.serverTimestamp() }); return { prompt: result.prompt, perspectives: result.perspectives, intelligence: result.intelligence, historyId: historyRef.id, quota: request.quota, creditsRemaining: reservation.creditsRemaining, creditCost: reservation.creditCost || 0 }; });
    return json(res, 200, saved);
  } catch (error) { console.error("Creator credit generation failed", { code: error?.code || "unknown" }); return json(res, error.status || 500, { code: error.code || "generation_unavailable", message: error.message || "Unable to generate a prompt right now.", ...(error.quota ? { quota: error.quota } : {}) }); }
}
