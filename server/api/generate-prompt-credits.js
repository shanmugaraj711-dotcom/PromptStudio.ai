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
const MAX_IMAGES = 4;
const MAX_REFERENCE_FILES = 8;
const MAX_REFERENCE_TEXT_LENGTH = 1_000_000;
const PRIMARY_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.6-flash";
const CODING_PRIMARY_MODEL = "gemini-3.7-flash";
const CODING_FALLBACK_MODEL = "gemini-3.6-flash";

class ApiError extends Error { constructor(status, code, message, quota) { super(message); this.status = status; this.code = code; this.quota = quota; } }
const parseBody = (body) => { if (!body) return {}; if (typeof body === "string") { try { return JSON.parse(body); } catch { throw new ApiError(400, "invalid_request", "The request body must be valid JSON."); } } return body; };
const validate = (body) => {
  const idea = typeof body.idea === "string" ? body.idea.trim() : "";
  const legacyImage = body.image && typeof body.image === "object" ? body.image : null;
  const images = Array.isArray(body.images) ? body.images : (legacyImage ? [legacyImage] : []);
  const referenceFiles = Array.isArray(body.referenceFiles) ? body.referenceFiles.slice(0, MAX_REFERENCE_FILES) : [];
  if ((idea.length < 3 && images.length === 0 && referenceFiles.length === 0) || idea.length > 6000) throw new ApiError(400, "invalid_idea", "Please describe what you want or attach a reference.");
  if (!MODELS.has(body.aiModel) || !CATEGORIES.has(body.category)) throw new ApiError(400, "invalid_options", "Choose a supported AI model and category.");
  if (typeof body.requestId !== "string" || !REQUEST_ID.test(body.requestId)) throw new ApiError(400, "invalid_request", "The generation request ID is invalid.");
  if (images.length > MAX_IMAGES) throw new ApiError(400, "too_many_images", `You can attach up to ${MAX_IMAGES} reference images.`);
  for (const image of images) if (!image || image.mimeType !== "image/jpeg" || typeof image.data !== "string" || !image.data || image.data.length > MAX_IMAGE_DATA_LENGTH) throw new ApiError(400, "invalid_image", "A reference image is invalid or too large.");
  for (const file of referenceFiles) {
    if (!file || typeof file.name !== "string" || file.name.length > 200 || !Number.isFinite(Number(file.size)) || Number(file.size) > 5 * 1024 * 1024) throw new ApiError(400, "invalid_reference_file", "A reference file is invalid or too large.");
    if (file.kind === "text" && typeof file.content === "string" && file.content.length > MAX_REFERENCE_TEXT_LENGTH) throw new ApiError(400, "invalid_reference_file", "A reference text file is too large to analyze.");
  }
  return { idea, images, referenceFiles };
};
const quotaFields = (quota) => ({ plan: quota.plan, promptsToday: quota.promptsToday, lastPromptDate: quota.lastPromptDate, imageAnalysesToday: quota.imageAnalysesToday, lastImageAnalysisDate: quota.lastImageAnalysisDate, imageAnalysesThisMonth: quota.imageAnalysesThisMonth, lastImageAnalysisMonth: quota.lastImageAnalysisMonth, quotaVersion: quota.quotaVersion, updatedAt: FieldValue.serverTimestamp() });

const reserve = async ({ db, uid, requestId, now, hasImage, productConfig }) => {
  const userRef = db.collection("users").doc(uid); const requestRef = userRef.collection("generationRequests").doc(requestId); const dateKey = getUtcDateKey(now); const monthKey = getUtcMonthKey(now);
  return db.runTransaction(async (tx) => {
    const [userSnap, requestSnap] = await Promise.all([tx.get(userRef), tx.get(requestRef)]);
    if (requestSnap.exists) { const request = requestSnap.data(); if (request.status === "succeeded" && request.prompt && request.quota) return { status: "succeeded", ...request }; throw new ApiError(409, "request_in_progress", "This generation request is still being processed. Please wait a moment."); }
    const user = userSnap.exists ? userSnap.data() : {}; const quota = createQuotaState(user, now, productConfig); const imageFreeAvailable = !hasImage || quota.imageLimit === null || quota.imageRemaining > 0; const usesFreePrompt = quota.remaining > 0 && imageFreeAvailable; const creditCost = hasImage ? productConfig.creditCosts.referenceImageAnalysis : productConfig.creditCosts.standardGeneration; const credits = Math.max(Number(user.credits || 0), 0);
    if (!usesFreePrompt && credits < creditCost) throw new ApiError(402, "credits_required", `You need ${creditCost} credits for this generation.`, quota);
    const nextState = { plan: quota.plan, promptsToday: usesFreePrompt ? quota.promptsToday + 1 : quota.promptsToday, lastPromptDate: usesFreePrompt ? dateKey : quota.lastPromptDate, imageAnalysesToday: quota.imageAnalysesToday, lastImageAnalysisDate: quota.lastImageAnalysisDate, imageAnalysesThisMonth: quota.imageAnalysesThisMonth, lastImageAnalysisMonth: quota.lastImageAnalysisMonth, quotaVersion: quota.quotaVersion + 1 };
    if (hasImage && usesFreePrompt) { if (quota.dailyImageLimit !== null) { nextState.imageAnalysesToday = quota.imageAnalysesToday + 1; nextState.lastImageAnalysisDate = dateKey; } else { nextState.imageAnalysesThisMonth = quota.imageAnalysesThisMonth + 1; nextState.lastImageAnalysisMonth = monthKey; } }
    const reservedQuota = createQuotaState(nextState, now, productConfig); const creditDeducted = usesFreePrompt ? 0 : creditCost;
    tx.set(userRef, { ...quotaFields(reservedQuota), credits: credits - creditDeducted }, { merge: true }); tx.set(requestRef, { status: "reserved", dateKey, monthKey, usesFreePrompt, creditCost: creditDeducted, hasImage, quota: reservedQuota, createdAt: FieldValue.serverTimestamp() });
    return { status: "reserved", quota: reservedQuota, creditsRemaining: credits - creditDeducted, creditCost: creditDeducted };
  });
};

const rollback = async ({ db, uid, requestId, now, failureCode, productConfig }) => {
  const userRef = db.collection("users").doc(uid); const requestRef = userRef.collection("generationRequests").doc(requestId); const dateKey = getUtcDateKey(now); const monthKey = getUtcMonthKey(now);
  return db.runTransaction(async (tx) => {
    const [requestSnap, userSnap] = await Promise.all([tx.get(requestRef), tx.get(userRef)]); if (!requestSnap.exists || requestSnap.data().status !== "reserved") return createQuotaState(userSnap.exists ? userSnap.data() : {}, now, productConfig);
    const reservation = requestSnap.data(); const user = userSnap.exists ? userSnap.data() : {}; const quota = createQuotaState(user, now, productConfig);
    const restored = { plan: quota.plan, promptsToday: reservation.usesFreePrompt && reservation.dateKey === dateKey && quota.lastPromptDate === dateKey ? Math.max(quota.promptsToday - 1, 0) : quota.promptsToday, lastPromptDate: quota.lastPromptDate, imageAnalysesToday: quota.imageAnalysesToday, lastImageAnalysisDate: quota.lastImageAnalysisDate, imageAnalysesThisMonth: quota.imageAnalysesThisMonth, lastImageAnalysisMonth: quota.lastImageAnalysisMonth, quotaVersion: quota.quotaVersion + 1 };
    if (reservation.hasImage && reservation.usesFreePrompt) { if (quota.dailyImageLimit !== null && reservation.dateKey === dateKey) restored.imageAnalysesToday = Math.max(quota.imageAnalysesToday - 1, 0); if (quota.monthlyImageLimit !== null && reservation.monthKey === monthKey) restored.imageAnalysesThisMonth = Math.max(quota.imageAnalysesThisMonth - 1, 0); }
    const restoredQuota = createQuotaState(restored, now, productConfig); const restoredCredits = Math.max(Number(user.credits || 0), 0) + Math.max(Number(reservation.creditCost || 0), 0);
    tx.set(userRef, { ...quotaFields(restoredQuota), credits: restoredCredits }, { merge: true }); tx.update(requestRef, { status: "rolled_back", failureCode, quota: restoredQuota, creditsRemaining: restoredCredits, completedAt: FieldValue.serverTimestamp() }); return restoredQuota;
  });
};

const codingInstruction = `You are PromptStudio's Reference Coding intelligence engine. The user is giving you an existing product/reference and an intention. Produce a professional, ready-to-paste coding or UX implementation prompt for the selected AI. Do not generate an image prompt. Analyze screenshots as visual evidence and supplied text/files as product context. Infer only what is supported by the references; clearly label uncertainty. Understand the user's intention first: recreate, improve UX, modernize, add functionality, fix a flow, or transform an existing product.\n\nFor coding references, structure your reasoning around: 1) product purpose and user goal, 2) information architecture and screen hierarchy, 3) visible components and layout, 4) interaction/state clues, 5) responsive behavior, 6) UX friction and accessibility opportunities, 7) visual language, 8) implementation requirements and constraints. When an existing application file is supplied, treat it as static reference metadata only; never claim to have executed or behaviorally inspected it unless evidence is supplied.\n\nThe final prompt must tell a coding AI what to build or change, preserve important existing behavior, define acceptance criteria, responsive/accessibility requirements, and avoid unnecessary rewrites. Make it usable in Cursor, Claude Code, Lovable, Replit, ChatGPT or another coding agent. Create exactly three useful perspectives: Faithful Recreation, UX Improvement, and Production Implementation. Return valid JSON only: {"prompt":"...","perspectives":[{"id":"...","label":"...","prompt":"..."}],"intent":"...","outputType":"coding","assumptions":["..."],"missing":["..."],"recommendations":["..."]}.`;

const imageInstruction = `You are PromptStudio's reference-aware prompt architect. Analyze attached reference images as source evidence and turn what is visibly present into a high-quality, ready-to-paste prompt for the selected target AI. Do not blindly describe the image or invent hidden facts. For every reference image, perform structured visual decomposition: subject and identity, composition and geometry, camera and light, style and materials, color palette, typography and graphics, and distinctive details. If text is legible, reproduce it; if uncertain, describe placement/style without inventing wording. Then create exactly three useful perspectives: Faithful Recreation, Professional Production, and Creative Variation. Return valid JSON only: {"prompt":"...","perspectives":[{"id":"...","label":"...","prompt":"..."}],"intent":"...","outputType":"...","assumptions":["..."],"missing":["..."],"recommendations":["..."]}.`;

const generate = async ({ client, idea, aiModel, category, images, referenceFiles, referenceCoding = false }) => {
  const fileContext = referenceFiles.length ? `\n\nREFERENCE FILES (static context; do not execute):\n${referenceFiles.map((file) => `- ${file.name} | ${file.detectedType || 'unknown'} | ${file.kind}${file.note ? ` | ${file.note}` : ''}${file.content ? `\n${file.content}` : ''}`).join('\n')}` : '';
  const text = `You are the intelligence engine inside PromptStudio.\n\nTARGET AI: ${aiModel}\nCATEGORY: ${category}\nUSER REQUEST:\n${idea || "Use the supplied references as the primary source of truth."}${fileContext}`;
  const contents = images.length ? [{ text }, ...images.map((image) => ({ inlineData: { mimeType: image.mimeType, data: image.data } }))] : text;
  const isCoding = category === "coding";
  const config = {
    systemInstruction: isCoding ? codingInstruction : imageInstruction,
    responseMimeType: "application/json",
    maxOutputTokens: 3200,
    ...(isCoding ? { thinkingConfig: { thinkingLevel: "medium" } } : {}),
  };
  const primaryModel = referenceCoding || isCoding ? CODING_PRIMARY_MODEL : PRIMARY_MODEL;
  const fallbackModel = referenceCoding || isCoding ? CODING_FALLBACK_MODEL : FALLBACK_MODEL;
  const call = async (model, timeoutMs) => { const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), timeoutMs); try { return await client.models.generateContent({ model, contents, config: { ...config, abortSignal: controller.signal } }); } finally { clearTimeout(timeout); } };
  let lastError;
  for (const [model, timeoutMs] of [[primaryModel, isCoding ? 30000 : 15000], [fallbackModel, isCoding ? 25000 : 12000]]) {
    try { const response = await call(model, timeoutMs); const parsed = JSON.parse(response.text?.trim() || "{}"); const perspectives = Array.isArray(parsed.perspectives) ? parsed.perspectives.filter((x) => x?.label && x?.prompt).slice(0, 3) : []; if (!parsed.prompt || perspectives.length < 3) throw new Error("incomplete_response"); return { prompt: String(parsed.prompt).trim(), perspectives, intelligence: { intent: parsed.intent || "", outputType: parsed.outputType || category, assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions.slice(0, 5) : [], missing: Array.isArray(parsed.missing) ? parsed.missing.slice(0, 5) : [], recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.slice(0, 5) : [] } }; }
    catch (error) { lastError = error; console.warn("Prompt generation model attempt failed", { model, reason: error?.name || "unknown" }); }
  }
  throw lastError || new Error("generation_failed");
};

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { code: "method_not_allowed", message: "Use POST to generate a prompt." });
  try {
    const body = parseBody(req.body); const input = validate(body); const decoded = await requireUser(req); await enforceGenerationRateLimit(req, decoded.uid); if (!process.env.GEMINI_API_KEY) throw new ApiError(503, "server_configuration_error", "The generation service is not configured yet. Please try again later.");
    const db = adminDb(); const productConfig = await getRuntimeProductConfig(db); const reservation = await reserve({ db, uid: decoded.uid, requestId: body.requestId, now: new Date(), hasImage: input.images.length > 0, productConfig });
    if (reservation.status === "succeeded") return json(res, 200, reservation);
    let result; try { result = await generate({ client: new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }), idea: input.idea, aiModel: body.aiModel, category: body.category, images: input.images, referenceFiles: input.referenceFiles, referenceCoding: body.referenceCoding === true }); }
    catch { const quota = await rollback({ db, uid: decoded.uid, requestId: body.requestId, now: new Date(), failureCode: "generation_failed", productConfig }); return json(res, 502, { code: "generation_failed", message: "The AI service could not generate a prompt. Your quota and credits were restored.", quota }); }
    const userRef = db.collection("users").doc(decoded.uid); const requestRef = userRef.collection("generationRequests").doc(body.requestId); const historyRef = userRef.collection("prompts").doc(body.requestId);
    const saved = await db.runTransaction(async (tx) => { const requestSnap = await tx.get(requestRef); if (!requestSnap.exists || requestSnap.data().status !== "reserved") throw new ApiError(409, "request_not_active", "The generation request is no longer active."); const request = requestSnap.data(); tx.set(historyRef, { prompt: result.prompt, perspectives: result.perspectives, intelligence: result.intelligence, aiModel: body.aiModel, category: body.category, hasReferenceImage: input.images.length > 0, referenceImageCount: input.images.length, referenceFileCount: input.referenceFiles.length, referenceFileNames: input.referenceFiles.map((file) => file.name).slice(0, 8), createdAt: FieldValue.serverTimestamp() }); tx.update(requestRef, { status: "succeeded", prompt: result.prompt, perspectives: result.perspectives, intelligence: result.intelligence, historyId: historyRef.id, completedAt: FieldValue.serverTimestamp() }); return { prompt: result.prompt, perspectives: result.perspectives, intelligence: result.intelligence, historyId: historyRef.id, quota: request.quota, creditsRemaining: reservation.creditsRemaining, creditCost: reservation.creditCost || 0 }; });
    return json(res, 200, saved);
  } catch (error) { console.error("Creator credit generation failed", { code: error?.code || "unknown" }); return json(res, error.status || 500, { code: error.code || "generation_unavailable", message: error.message || "Unable to generate a prompt right now.", ...(error.quota ? { quota: error.quota } : {}) }); }
}
