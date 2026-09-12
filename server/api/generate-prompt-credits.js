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
const VALID_GEMINI_MODELS = new Set(["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"]);
const configuredModel = String(process.env.GEMINI_MODEL || "").trim();
const configuredFallbackModel = String(process.env.GEMINI_FALLBACK_MODEL || "").trim();
const PRIMARY_MODEL = VALID_GEMINI_MODELS.has(configuredModel) ? configuredModel : "gemini-3.8-flash";
const FALLBACK_MODEL = VALID_GEMINI_MODELS.has(configuredFallbackModel) && configuredFallbackModel !== PRIMARY_MODEL ? configuredFallbackModel : "gemini-2.5-flash";
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
  for (const image of images) if (!image || !String(image.mimeType || "").startsWith("image/") || typeof image.data !== "string" || !image.data || image.data.length > MAX_IMAGE_DATA_LENGTH) throw new ApiError(400, "invalid_image", "A reference image is invalid or too large.");
  for (const file of referenceFiles) { if (!file || typeof file.name !== "string" || file.name.length > 200 || !Number.isFinite(Number(file.size)) || Number(file.size) > 5 * 1024 * 1024) throw new ApiError(400, "invalid_reference_file", "A reference file is invalid or too large."); if (file.kind === "text" && typeof file.content === "string" && file.content.length > MAX_REFERENCE_TEXT_LENGTH) throw new ApiError(400, "invalid_reference_file", "A reference text file is too large to analyze."); }
  return { idea, images, referenceFiles };
};
const quotaFields = (quota) => ({ plan: quota.plan, promptsToday: quota.promptsToday, lastPromptDate: quota.lastPromptDate, imageAnalysesToday: quota.imageAnalysesToday, lastImageAnalysisDate: quota.lastImageAnalysisDate, imageAnalysesThisMonth: quota.imageAnalysesThisMonth, lastImageAnalysisMonth: quota.lastImageAnalysisMonth, quotaVersion: quota.quotaVersion, updatedAt: FieldValue.serverTimestamp() });

const reserve = async ({ db, uid, requestId, now, hasImage, operation = "standard", productConfig }) => {
  const userRef = db.collection("users").doc(uid); const requestRef = userRef.collection("generationRequests").doc(requestId); const dateKey = getUtcDateKey(now); const monthKey = getUtcMonthKey(now);
  return db.runTransaction(async (tx) => {
    const [userSnap, requestSnap] = await Promise.all([tx.get(userRef), tx.get(requestRef)]);
    if (requestSnap.exists) { const request = requestSnap.data(); if (request.status === "succeeded" && request.prompt && request.quota) return { status: "succeeded", ...request }; throw new ApiError(409, "request_in_progress", "This generation request is still being processed. Please wait a moment."); }
    const user = userSnap.exists ? userSnap.data() : {};
    const quota = createQuotaState(user, now, productConfig);
    const isReferenceCoding = operation === "referenceCoding";
    const imageFreeAvailable = !hasImage || quota.imageLimit === null || quota.imageRemaining > 0;
    const usesFreePrompt = !isReferenceCoding && quota.remaining > 0 && imageFreeAvailable;
    const creditCost = isReferenceCoding ? productConfig.creditCosts.referenceCoding.creditCost : hasImage ? productConfig.creditCosts.referenceImageAnalysis : productConfig.creditCosts.standardGeneration;
    const credits = Math.max(Number(user.credits || 0), 0);
    if (!usesFreePrompt && credits < creditCost) throw new ApiError(402, "credits_required", `You need ${creditCost} credits for this generation.`, quota);
    const nextState = { plan: quota.plan, promptsToday: usesFreePrompt ? quota.promptsToday + 1 : quota.promptsToday, lastPromptDate: usesFreePrompt ? dateKey : quota.lastPromptDate, imageAnalysesToday: quota.imageAnalysesToday, lastImageAnalysisDate: quota.lastImageAnalysisDate, imageAnalysesThisMonth: quota.imageAnalysesThisMonth, lastImageAnalysisMonth: quota.lastImageAnalysisMonth, quotaVersion: quota.quotaVersion + 1 };
    if (hasImage && usesFreePrompt) { if (quota.dailyImageLimit !== null) { nextState.imageAnalysesToday = quota.imageAnalysesToday + 1; nextState.lastImageAnalysisDate = dateKey; } else { nextState.imageAnalysesThisMonth = quota.imageAnalysesThisMonth + 1; nextState.lastImageAnalysisMonth = monthKey; } }
    const reservedQuota = createQuotaState(nextState, now, productConfig); const creditDeducted = usesFreePrompt ? 0 : creditCost;
    tx.set(userRef, { ...quotaFields(reservedQuota), credits: credits - creditDeducted }, { merge: true }); tx.set(requestRef, { status: "reserved", operation, dateKey, monthKey, usesFreePrompt, creditCost: creditDeducted, hasImage, refundStatus: "not_required", quota: reservedQuota, createdAt: FieldValue.serverTimestamp() });
    return { status: "reserved", quota: reservedQuota, creditsRemaining: credits - creditDeducted, creditCost: creditDeducted };
  });
};

const isTransientFirestoreError = (error) => { const code = String(error?.code || "").toLowerCase(); const message = String(error?.message || "").toLowerCase(); return code.includes("deadline") || code.includes("aborted") || code.includes("unavailable") || code.includes("resource-exhausted") || message.includes("deadline exceeded") || message.includes("unavailable") || message.includes("aborted") || message.includes("resource exhausted"); };
const rollbackOnce = async ({ db, uid, requestId, now, failureCode, productConfig }) => {
  const userRef = db.collection("users").doc(uid); const requestRef = userRef.collection("generationRequests").doc(requestId); const dateKey = getUtcDateKey(now); const monthKey = getUtcMonthKey(now);
  return db.runTransaction(async (tx) => {
    const [requestSnap, userSnap] = await Promise.all([tx.get(requestRef), tx.get(userRef)]); const user = userSnap.exists ? userSnap.data() : {}; const currentQuota = createQuotaState(user, now, productConfig);
    if (!requestSnap.exists) return { quota: currentQuota, refundStatus: "not_required", creditsRemaining: Math.max(Number(user.credits || 0), 0) };
    const request = requestSnap.data(); if (request.status === "rolled_back") return { quota: request.quota || currentQuota, refundStatus: "confirmed", creditsRemaining: Math.max(Number(request.creditsRemaining ?? user.credits ?? 0), 0) }; if (request.status !== "reserved") return { quota: currentQuota, refundStatus: "not_required", creditsRemaining: Math.max(Number(user.credits || 0), 0) };
    const sameDay = request.usesFreePrompt && request.dateKey === dateKey && currentQuota.lastPromptDate === dateKey;
    const restored = { plan: currentQuota.plan, promptsToday: sameDay ? Math.max(currentQuota.promptsToday - 1, 0) : currentQuota.promptsToday, lastPromptDate: currentQuota.lastPromptDate, imageAnalysesToday: currentQuota.imageAnalysesToday, lastImageAnalysisDate: currentQuota.lastImageAnalysisDate, imageAnalysesThisMonth: currentQuota.imageAnalysesThisMonth, lastImageAnalysisMonth: currentQuota.lastImageAnalysisMonth, quotaVersion: currentQuota.quotaVersion + 1 };
    if (request.hasImage && request.usesFreePrompt) { if (currentQuota.dailyImageLimit !== null && request.dateKey === dateKey) restored.imageAnalysesToday = Math.max(currentQuota.imageAnalysesToday - 1, 0); if (currentQuota.monthlyImageLimit !== null && request.monthKey === monthKey) restored.imageAnalysesThisMonth = Math.max(currentQuota.imageAnalysesThisMonth - 1, 0); }
    const restoredQuota = createQuotaState(restored, now, productConfig); const restoredCredits = Math.max(Number(user.credits || 0), 0) + Math.max(Number(request.creditCost || 0), 0);
    tx.set(userRef, { ...quotaFields(restoredQuota), credits: restoredCredits }, { merge: true }); tx.update(requestRef, { status: "rolled_back", failureCode, refundStatus: "confirmed", quota: restoredQuota, creditsRemaining: restoredCredits, completedAt: FieldValue.serverTimestamp() }); return { quota: restoredQuota, refundStatus: "confirmed", creditsRemaining: restoredCredits };
  });
};
const rollback = async ({ db, uid, requestId, failureCode, productConfig }) => { const delays = [0, 150, 400]; let lastError; for (const delay of delays) { if (delay) await new Promise((resolve) => setTimeout(resolve, delay)); try { return await rollbackOnce({ db, uid, requestId, now: new Date(), failureCode, productConfig }); } catch (error) { lastError = error; if (!isTransientFirestoreError(error)) throw error; console.warn("Generation rollback attempt failed", { requestId, code: error?.code || "unknown" }); } } console.error("Generation rollback could not be confirmed", { requestId, code: lastError?.code || "unknown" }); return { quota: null, refundStatus: "pending", creditsRemaining: null }; };

const PROMPT_LAB_INSTRUCTION = `You are PromptStudio Prompt Lab, an expert prompt architect and intent interpreter. Your job is to transform an imperfect user idea into a precise, useful, ready-to-paste prompt for the selected target AI. Do not merely rewrite the user's sentence. First infer the user's real objective, then design the prompt around that objective.

INTELLIGENCE LOOP: silently analyze (1) desired outcome, (2) audience/user, (3) task type, (4) constraints, (5) context and reference evidence, (6) required inputs, (7) desired output format, (8) quality bar, and (9) failure/edge cases. Preserve explicit facts and constraints. Never invent credentials, APIs, data, research, capabilities, or requirements. If a missing detail materially changes the result, make a minimal assumption and report it.

PRECISION: Separate facts, assumptions, and recommendations. Resolve ambiguity conservatively. Remove filler and generic AI language. Use concrete verbs, measurable constraints, explicit deliverables, and acceptance criteria where useful. Match the prompt to the target AI's actual job: writing, coding, image generation, marketing, or business analysis. For coding, specify architecture, files/components, behavior, states, accessibility, responsiveness, testing, and minimal-change rules. For image work, specify subject, composition, camera/view, lighting, materials, style, typography and negative constraints only when relevant. For marketing, define audience, positioning, offer, channel, tone, CTA and measurable goal. For business work, define decision, inputs, assumptions, options, trade-offs, risks and recommendation format. For writing, define audience, purpose, voice, structure, evidence boundaries and revision criteria.

CONTEXT USE: Treat the user's brief as the primary source of truth. Use reference files/images as evidence. If a live/current fact is required but not supplied, do not fabricate it; state that fresh verification is required. Do not claim to have inspected or executed an attached application. Keep the final prompt directly usable in ChatGPT, Claude, Gemini, Grok, Cursor, Lovable, Replit or another relevant tool.

OUTPUT: Return exactly three perspectives: Precision Build, Expert Strategy, and Creative Alternative. Each perspective must materially differ in approach while preserving the same core intent. The main prompt should be the strongest default. Return valid JSON only: {"prompt":"...","perspectives":[{"id":"precision-build","label":"Precision Build","prompt":"..."},{"id":"expert-strategy","label":"Expert Strategy","prompt":"..."},{"id":"creative-alternative","label":"Creative Alternative","prompt":"..."}],"intent":"...","outputType":"...","assumptions":["..."],"missing":["..."],"recommendations":["..."]}.`;

const CODING_INSTRUCTION = `You are PromptStudio's Reference Coding intelligence engine. Convert the user's intent and supplied visual/file evidence into a production-ready coding prompt. Preserve exact requirements, existing behavior, named entities and constraints. Analyze product purpose, information architecture, visible UI, interaction states, responsive behavior, accessibility, implementation constraints and acceptance criteria. Infer only what evidence supports; clearly separate assumptions. Never claim to have executed or behaviorally inspected supplied source files. Avoid unnecessary rewrites. Return valid JSON with exactly three perspectives: Faithful Recreation, UX Improvement, Production Implementation, plus intent, outputType, assumptions, missing and recommendations.`;
const IMAGE_INSTRUCTION = `You are PromptStudio's reference-aware visual prompt architect. Convert visible evidence and the user's intent into a high-quality prompt for the selected AI. Analyze subject, composition, geometry, camera/view, lighting, materials, color, typography and distinctive details. Never invent hidden facts. If text is uncertain, describe placement/style rather than fabricate wording. Return valid JSON with exactly three perspectives: Faithful Recreation, Professional Production, Creative Variation, plus intent, outputType, assumptions, missing and recommendations.`;

const generate = async ({ client, idea, aiModel, category, images, referenceFiles, referenceCoding = false }) => {
  const fileContext = referenceFiles.length ? `\n\nREFERENCE FILES (static context; never execute):\n${referenceFiles.map((file) => `- ${file.name} | ${file.detectedType || "unknown"} | ${file.kind}${file.note ? ` | ${file.note}` : ""}${file.content ? `\n${file.content}` : ""}`).join("\n")}` : "";
  const text = `TARGET AI: ${aiModel}\nCATEGORY: ${category}\nUSER REQUEST:\n${idea || "Use the supplied references as the primary source of truth."}${fileContext}`;
  const contents = images.length ? [{ text }, ...images.map((image) => ({ inlineData: { mimeType: image.mimeType, data: image.data } }))] : text;
  const isCoding = referenceCoding || category === "coding";
  const systemInstruction = isCoding ? CODING_INSTRUCTION : category === "image" ? IMAGE_INSTRUCTION : PROMPT_LAB_INSTRUCTION;
  const config = { systemInstruction, responseMimeType: "application/json", maxOutputTokens: 3600, ...(isCoding ? { thinkingConfig: { thinkingLevel: "medium" } } : { thinkingConfig: { thinkingLevel: "high" } }) };
  const primaryModel = isCoding ? CODING_PRIMARY_MODEL : PRIMARY_MODEL; const fallbackModel = isCoding ? CODING_FALLBACK_MODEL : FALLBACK_MODEL;
  const call = async (model, timeoutMs) => { const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), timeoutMs); try { return await client.models.generateContent({ model, contents, config: { ...config, abortSignal: controller.signal } }); } finally { clearTimeout(timeout); } };
  const transient = (error) => { const status = Number(error?.status || error?.statusCode || 0); const message = String(error?.message || "").toLowerCase(); const code = String(error?.code || "").toLowerCase(); return [408,429,500,502,503,504].includes(status) || code.includes("resource_exhausted") || code.includes("unavailable") || code.includes("internal") || message.includes("temporar") || message.includes("overload") || message.includes("timeout") || message.includes("aborted") || message.includes("deadline") || message.includes("incomplete_response") || message.includes("json"); };
  let lastError; const attempts = [[primaryModel, isCoding ? 14000 : 16000], [fallbackModel, isCoding ? 9000 : 10000]];
  for (const [model, timeoutMs] of attempts) { try { const response = await call(model, timeoutMs); const raw = String(response.text || "").trim(); const parsed = JSON.parse(raw || "{}"); const perspectives = Array.isArray(parsed.perspectives) ? parsed.perspectives.filter((item) => item?.label && item?.prompt).slice(0,3) : []; if (!parsed.prompt || perspectives.length < 3) { const error = new Error("incomplete_response"); error.code = "incomplete_response"; throw error; } return { prompt: String(parsed.prompt).trim(), perspectives, intelligence: { intent: parsed.intent || "", outputType: parsed.outputType || category, assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions.slice(0,5) : [], missing: Array.isArray(parsed.missing) ? parsed.missing.slice(0,5) : [], recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.slice(0,5) : [] } }; } catch (error) { lastError = error; console.warn("Prompt generation model attempt failed", { model, reason: error?.name || error?.code || "unknown", status: error?.status || error?.statusCode || null }); if (!transient(error)) throw error; } }
  throw lastError || new Error("generation_failed");
};

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { code: "method_not_allowed", message: "Use POST to generate a prompt." });
  try {
    const body = parseBody(req.body); const input = validate(body); const decoded = await requireUser(req); await enforceGenerationRateLimit(req, decoded.uid); if (!process.env.GEMINI_API_KEY) throw new ApiError(503, "server_configuration_error", "The generation service is not configured yet. Please try again later.");
    const db = adminDb(); const productConfig = await getRuntimeProductConfig(db); const reservation = await reserve({ db, uid: decoded.uid, requestId: body.requestId, now: new Date(), hasImage: input.images.length > 0, operation: body.referenceCoding === true ? "referenceCoding" : input.images.length > 0 ? "image" : "standard", productConfig });
    if (reservation.status === "succeeded") return json(res, 200, reservation);
    let result;
    try { result = await generate({ client: new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }), idea: input.idea, aiModel: body.aiModel, category: body.category, images: input.images, referenceFiles: input.referenceFiles, referenceCoding: body.referenceCoding === true }); }
    catch (error) { console.error("Gemini generation failed", { code: error?.code || "unknown", status: error?.status || error?.statusCode || null, name: error?.name || "unknown", message: String(error?.message || "").slice(0,300) }); const quota = await rollback({ db, uid: decoded.uid, requestId: body.requestId, failureCode: "generation_failed", productConfig }); return json(res, 502, { code: "generation_failed", message: "The AI service could not generate a prompt. Your quota and credits were restored.", quota }); }
    const userRef = db.collection("users").doc(decoded.uid); const requestRef = userRef.collection("generationRequests").doc(body.requestId); const historyRef = userRef.collection("prompts").doc(body.requestId);
    try {
      const saved = await db.runTransaction(async (tx) => { const requestSnap = await tx.get(requestRef); if (!requestSnap.exists || requestSnap.data().status !== "reserved") throw new ApiError(409, "request_not_active", "The generation request is no longer active."); const request = requestSnap.data(); tx.set(historyRef, { prompt: result.prompt, perspectives: result.perspectives, intelligence: result.intelligence, aiModel: body.aiModel, category: body.category, hasReferenceImage: input.images.length > 0, referenceImageCount: input.images.length, referenceFileCount: input.referenceFiles.length, referenceFileNames: input.referenceFiles.map((file) => file.name).slice(0,8), createdAt: FieldValue.serverTimestamp() }); tx.update(requestRef, { status: "succeeded", prompt: result.prompt, perspectives: result.perspectives, intelligence: result.intelligence, historyId: historyRef.id, refundStatus: "not_required", completedAt: FieldValue.serverTimestamp() }); return { prompt: result.prompt, perspectives: result.perspectives, intelligence: result.intelligence, historyId: historyRef.id, quota: request.quota, creditsRemaining: Math.max(Number(request.creditsRemaining ?? reservation.creditsRemaining ?? 0),0), creditCost: request.creditCost || 0 }; });
      return json(res, 200, saved);
    } catch (error) { console.error("Generation result save failed", { requestId: body.requestId, code: error?.code || "unknown" }); let refund; try { refund = await rollback({ db, uid: decoded.uid, requestId: body.requestId, failureCode: "result_save_failed", productConfig }); } catch { refund = { quota: null, refundStatus: "pending", creditsRemaining: null }; } const refundConfirmed = refund.refundStatus === "confirmed"; return json(res, 500, { code: "result_save_failed", message: refundConfirmed ? "The generated result could not be saved. Your quota and credits were restored." : "The generated result could not be saved. Your refund is being recovered safely; please retry this request in a moment.", refundStatus: refund.refundStatus, ...(refund.quota ? { quota: refund.quota } : {}), ...(refund.creditsRemaining !== null ? { creditsRemaining: refund.creditsRemaining } : {}) }); }
  } catch (error) { console.error("Creator credit generation failed", { code: error?.code || "unknown", status: error?.status || error?.statusCode || null, name: error?.name || "unknown", message: String(error?.message || "").slice(0,300) }); return json(res, error.status || 500, { code: error.code || "generation_unavailable", message: error.message || "Unable to generate a prompt right now.", ...(error.quota ? { quota: error.quota } : {}) }); }
}
