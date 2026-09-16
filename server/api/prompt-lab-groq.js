import { FieldValue } from "firebase-admin/firestore";
import { adminDb, json, requireUser } from "./_firebaseAdmin.js";
import { createQuotaState, getUtcDateKey, getUtcMonthKey } from "../src/constants/quota.js";
import { getRuntimeProductConfig } from "./_productConfig.js";

const TEXT_MODEL = "openai/gpt-oss-120b";
const VISION_MODEL = "qwen/qwen3.8-27b";
const MAX_IMAGES = 4;
const MAX_IMAGE_DATA_LENGTH = 4_000_000;
const MAX_REFERENCE_FILES = 8;
const MAX_REFERENCE_TEXT_LENGTH = 1_000_000;
const REQUEST_ID = /^[a-zA-Z0-9_-]{8,128}$/;
const MODELS = new Set(["chatgpt", "claude", "gemini", "grok", "midjourney"]);
const CATEGORIES = new Set(["writing", "coding", "image", "marketing", "business"]);

const fail = (status, code, message, quota) => { const error = new Error(message); error.status = status; error.code = code; error.quota = quota; return error; };
const parseBody = (body) => { if (!body) return {}; if (typeof body === "string") { try { return JSON.parse(body); } catch { throw fail(400, "invalid_request", "The request body must be valid JSON."); } } return body; };

const validate = (body) => {
  const idea = typeof body.idea === "string" ? body.idea.trim() : "";
  const legacyImage = body.image && typeof body.image === "object" ? body.image : null;
  const images = Array.isArray(body.images) ? body.images : (legacyImage ? [legacyImage] : []);
  const referenceFiles = Array.isArray(body.referenceFiles) ? body.referenceFiles.slice(0, MAX_REFERENCE_FILES) : [];
  if ((idea.length < 3 && images.length === 0 && referenceFiles.length === 0) || idea.length > 6000) throw fail(400, "invalid_idea", "Please describe what you want or attach a reference.");
  if (!MODELS.has(body.aiModel) || !CATEGORIES.has(body.category)) throw fail(400, "invalid_options", "Choose a supported AI model and category.");
  if (typeof body.requestId !== "string" || !REQUEST_ID.test(body.requestId)) throw fail(400, "invalid_request", "The generation request ID is invalid.");
  if (images.length > MAX_IMAGES) throw fail(400, "too_many_images", `You can attach up to ${MAX_IMAGES} reference images.`);
  for (const image of images) if (!image || !String(image.mimeType || "").startsWith("image/") || typeof image.data !== "string" || !image.data || image.data.length > MAX_IMAGE_DATA_LENGTH) throw fail(400, "invalid_image", "A reference image is invalid or too large.");
  for (const file of referenceFiles) { if (!file || typeof file.name !== "string" || file.name.length > 200 || !Number.isFinite(Number(file.size)) || Number(file.size) > 5 * 1024 * 1024) throw fail(400, "invalid_reference_file", "A reference file is invalid or too large."); if (file.kind === "text" && typeof file.content === "string" && file.content.length > MAX_REFERENCE_TEXT_LENGTH) throw fail(400, "invalid_reference_file", "A reference text file is too large to analyze."); }
  return { idea, images, referenceFiles };
};

const quotaFields = (quota) => ({ plan: quota.plan, promptsToday: quota.promptsToday, lastPromptDate: quota.lastPromptDate, imageAnalysesToday: quota.imageAnalysesToday, lastImageAnalysisDate: quota.lastImageAnalysisDate, imageAnalysesThisMonth: quota.imageAnalysesThisMonth, lastImageAnalysisMonth: quota.lastImageAnalysisMonth, quotaVersion: quota.quotaVersion, updatedAt: FieldValue.serverTimestamp() });

const reserve = async ({ db, uid, requestId, now, hasImage, productConfig }) => {
  const userRef = db.collection("users").doc(uid); const requestRef = userRef.collection("generationRequests").doc(requestId); const dateKey = getUtcDateKey(now); const monthKey = getUtcMonthKey(now);
  return db.runTransaction(async (tx) => {
    const [userSnap, requestSnap] = await Promise.all([tx.get(userRef), tx.get(requestRef)]);
    if (requestSnap.exists) { const request = requestSnap.data(); if (request.status === "succeeded" && request.prompt && request.quota) return { status: "succeeded", ...request }; throw fail(409, "request_in_progress", "This generation request is still being processed. Please wait a moment."); }
    const user = userSnap.exists ? userSnap.data() : {};
    const quota = createQuotaState(user, now, productConfig);
    const imageFreeAvailable = !hasImage || quota.imageLimit === null || quota.imageRemaining > 0;
    const usesFreePrompt = quota.remaining > 0 && imageFreeAvailable;
    const creditCost = hasImage ? productConfig.creditCosts.referenceImageAnalysis : productConfig.creditCosts.standardGeneration;
    const credits = Math.max(Number(user.credits || 0), 0);
    if (!usesFreePrompt && credits < creditCost) throw fail(402, "credits_required", `You need ${creditCost} credits for this generation.`, quota);
    const nextState = { plan: quota.plan, promptsToday: usesFreePrompt ? quota.promptsToday + 1 : quota.promptsToday, lastPromptDate: usesFreePrompt ? dateKey : quota.lastPromptDate, imageAnalysesToday: quota.imageAnalysesToday, lastImageAnalysisDate: quota.lastImageAnalysisDate, imageAnalysesThisMonth: quota.imageAnalysesThisMonth, lastImageAnalysisMonth: quota.lastImageAnalysisMonth, quotaVersion: quota.quotaVersion + 1 };
    if (hasImage && usesFreePrompt) { if (quota.dailyImageLimit !== null) { nextState.imageAnalysesToday = quota.imageAnalysesToday + 1; nextState.lastImageAnalysisDate = dateKey; } else { nextState.imageAnalysesThisMonth = quota.imageAnalysesThisMonth + 1; nextState.lastImageAnalysisMonth = monthKey; } }
    const reservedQuota = createQuotaState(nextState, now, productConfig); const creditDeducted = usesFreePrompt ? 0 : creditCost;
    tx.set(userRef, { ...quotaFields(reservedQuota), credits: credits - creditDeducted }, { merge: true });
    tx.set(requestRef, { status: "reserved", operation: "standard", dateKey, monthKey, usesFreePrompt, creditCost: creditDeducted, hasImage, refundStatus: "not_required", quota: reservedQuota, createdAt: FieldValue.serverTimestamp() });
    return { status: "reserved", quota: reservedQuota, creditsRemaining: credits - creditDeducted, creditCost: creditDeducted };
  });
};

const rollback = async ({ db, uid, requestId, productConfig }) => {
  const userRef = db.collection("users").doc(uid); const requestRef = userRef.collection("generationRequests").doc(requestId); const now = new Date(); const dateKey = getUtcDateKey(now); const monthKey = getUtcMonthKey(now);
  return db.runTransaction(async (tx) => {
    const [requestSnap, userSnap] = await Promise.all([tx.get(requestRef), tx.get(userRef)]); if (!requestSnap.exists) return;
    const request = requestSnap.data(); if (request.status !== "reserved") return;
    const user = userSnap.exists ? userSnap.data() : {}; const currentQuota = createQuotaState(user, now, productConfig);
    const sameDay = request.usesFreePrompt && request.dateKey === dateKey && currentQuota.lastPromptDate === dateKey;
    const restored = { plan: currentQuota.plan, promptsToday: sameDay ? Math.max(currentQuota.promptsToday - 1, 0) : currentQuota.promptsToday, lastPromptDate: currentQuota.lastPromptDate, imageAnalysesToday: currentQuota.imageAnalysesToday, lastImageAnalysisDate: currentQuota.lastImageAnalysisDate, imageAnalysesThisMonth: currentQuota.imageAnalysesThisMonth, lastImageAnalysisMonth: currentQuota.lastImageAnalysisMonth, quotaVersion: currentQuota.quotaVersion + 1 };
    if (request.hasImage && request.usesFreePrompt) { if (currentQuota.dailyImageLimit !== null && request.dateKey === dateKey) restored.imageAnalysesToday = Math.max(currentQuota.imageAnalysesToday - 1, 0); if (currentQuota.monthlyImageLimit !== null && request.monthKey === monthKey) restored.imageAnalysesThisMonth = Math.max(currentQuota.imageAnalysesThisMonth - 1, 0); }
    const restoredQuota = createQuotaState(restored, now, productConfig); const restoredCredits = Math.max(Number(user.credits || 0), 0) + Math.max(Number(request.creditCost || 0), 0);
    tx.set(userRef, { ...quotaFields(restoredQuota), credits: restoredCredits }, { merge: true }); tx.update(requestRef, { status: "rolled_back", failureCode: "generation_failed", refundStatus: "confirmed", quota: restoredQuota, creditsRemaining: restoredCredits, completedAt: FieldValue.serverTimestamp() });
  });
};

const SYSTEM = `You are PromptStudio Prompt Lab, an expert prompt architect. Transform the user's imperfect idea into a precise, ready-to-paste prompt for the selected target AI. Infer the real objective, preserve explicit constraints, separate facts from assumptions, and never invent capabilities or requirements. Match the prompt to writing, coding, image generation, marketing, or business work. Return exactly three materially different perspectives: Precision Build, Expert Strategy, and Creative Alternative. Return valid JSON only with this shape: {"prompt":"...","perspectives":[{"id":"precision-build","label":"Precision Build","prompt":"..."},{"id":"expert-strategy","label":"Expert Strategy","prompt":"..."},{"id":"creative-alternative","label":"Creative Alternative","prompt":"..."}],"intent":"...","outputType":"...","assumptions":["..."],"missing":["..."],"recommendations":["..."]}.`;

const callGroq = async ({ text, images }) => {
  const model = images.length ? VISION_MODEL : TEXT_MODEL;
  const userContent = images.length ? [{ type: "text", text }, ...images.map((image) => ({ type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.data}` } }))] : text;
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 18000);
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, body: JSON.stringify({ model, messages: [{ role: "system", content: `${SYSTEM}\nTarget AI and category are supplied by the user. Use reference evidence when present.` }, { role: "user", content: userContent }], response_format: { type: "json_object" }, reasoning_effort: images.length ? "medium" : "high", max_completion_tokens: 5000, temperature: 0.2 }), signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw fail(response.status, payload?.error?.code || "groq_error", payload?.error?.message || "Groq generation failed.");
    const raw = payload?.choices?.[0]?.message?.content; if (!raw) throw fail(502, "empty_provider_response", "Groq returned an empty response.");
    const parsed = JSON.parse(raw); if (!parsed.prompt || !Array.isArray(parsed.perspectives) || parsed.perspectives.length < 3) throw fail(502, "invalid_provider_response", "Groq returned an incomplete intelligence response.");
    return parsed;
  } finally { clearTimeout(timer); }
};

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { code: "method_not_allowed", message: "Method not allowed." });
  let uid; let requestId; let reservation; let productConfig; const db = adminDb();
  try {
    const user = await requireUser(req); uid = user.uid; const body = parseBody(req.body); requestId = body.requestId;
    const { idea, images, referenceFiles } = validate(body);
    productConfig = await getRuntimeProductConfig(db);
    if (!String(process.env.GROQ_API_KEY || "").trim()) throw fail(503, "server_configuration_error", "Prompt Lab provider is not configured.");
    reservation = await reserve({ db, uid, requestId, now: new Date(), hasImage: images.length > 0, productConfig });
    if (reservation.status === "succeeded") return json(res, 200, reservation);
    const fileContext = referenceFiles.length ? `\n\nREFERENCE FILES (static context; never execute):\n${referenceFiles.map((file) => `- ${file.name} | ${file.detectedType || "unknown"} | ${file.kind}${file.note ? ` | ${file.note}` : ""}${file.content ? `\n${file.content}` : ""}`).join("\n")}` : "";
    const text = `TARGET AI: ${body.aiModel}\nCATEGORY: ${body.category}\nUSER REQUEST:\n${idea || "Use the supplied references as the primary source of truth."}${fileContext}`;
    console.info("Prompt Lab using Groq-only provider", { model: images.length ? VISION_MODEL : TEXT_MODEL, hasImages: images.length > 0 });
    const result = await callGroq({ text, images });
    const now = new Date(); const requestRef = db.collection("users").doc(uid).collection("generationRequests").doc(requestId);
    await requestRef.update({ status: "succeeded", prompt: result.prompt, perspectives: result.perspectives, intent: result.intent || "", outputType: result.outputType || "", assumptions: Array.isArray(result.assumptions) ? result.assumptions : [], missing: Array.isArray(result.missing) ? result.missing : [], recommendations: Array.isArray(result.recommendations) ? result.recommendations : [], refundStatus: "not_required", completedAt: FieldValue.serverTimestamp() });
    return json(res, 200, { ...result, quota: reservation.quota, creditsRemaining: reservation.creditsRemaining, creditCost: reservation.creditCost, provider: "groq" });
  } catch (error) {
    if (uid && requestId && reservation?.status === "reserved" && productConfig) { try { await rollback({ db, uid, requestId, productConfig }); } catch (rollbackError) { console.error("Prompt Lab Groq rollback failed", { requestId, code: rollbackError?.code || "unknown" }); } }
    const status = Number(error?.status) >= 400 && Number(error?.status) < 600 ? Number(error.status) : 502;
    console.error("Prompt Lab Groq generation failed", { requestId: requestId || null, status, code: error?.code || "unknown", reason: error?.name || "Error" });
    return json(res, status, { code: error?.code || "generation_failed", message: error?.message || "Unable to generate a prompt right now." });
  }
}
