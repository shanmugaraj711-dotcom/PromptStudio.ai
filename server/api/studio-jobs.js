import { GoogleGenAI } from "@google/genai";
import { requireUser, adminDb } from "./_firebaseAdmin.js";
import { LANDING_PAGE_SPEC_SCHEMA, renderStudioSpec, validateStudioSpec } from "../studio/templateRenderer.js";
import { PRODUCT_MENU_SPEC_SCHEMA, renderProductMenuSpec, validateProductMenuSpec } from "../studio/productMenuRenderer.js";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.7-flash";
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.6-flash";
const SECOND_FALLBACK_MODEL = process.env.GEMINI_SECOND_FALLBACK_MODEL || "gemini-3.8-flash";
const MODEL_SEQUENCE = [...new Set([MODEL, FALLBACK_MODEL, SECOND_FALLBACK_MODEL])];
const MAX_AI_ATTEMPTS = 3;
const GENERATION_TIMEOUT_MS = 18000;
const JOB_LEASE_MS = 60000;
const JOB_TTL_MS = 30 * 60 * 1000;
const RETRY_DELAYS_MS = [1500, 4000];
const MAX_PROMPT_CHARS = 12000;
const MAX_FILE_CHARS = 50000;

const send = (res, status, payload) => { res.setHeader("Cache-Control", "no-store"); return res.status(status).json(payload); };
const fail = (message, status = 422, code = "invalid_spec") => Object.assign(new Error(message), { status, code });
const parseJson = (text, code = "invalid_ai_response") => {
  const raw = String(text || "").trim();
  try { return JSON.parse(raw); } catch {}
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) { try { return JSON.parse(fenced[1]); } catch {} }
  const first = raw.indexOf("{"); const last = raw.lastIndexOf("}");
  if (first >= 0 && last > first) { try { return JSON.parse(raw.slice(first, last + 1)); } catch {} }
  throw fail("The Studio AI returned an invalid structured specification.", 502, code);
};
const getClient = () => {
  if (!process.env.GEMINI_API_KEY) throw fail("Studio AI is not configured yet.", 503, "server_configuration_error");
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
};
const isTransient = (error) => {
  const status = Number(error?.status || error?.statusCode || error?.httpStatus || 0);
  const message = String(error?.message || "").toLowerCase();
  return [408, 429, 500, 502, 503, 504].includes(status) || /high demand|temporar|unavailable|overload|timeout|aborted|deadline/.test(message);
};
const safeErrorDetails = (error) => ({ code: error?.code || null, status: Number(error?.status || error?.statusCode || error?.httpStatus || 0) || null, message: String(error?.message || "unknown").slice(0, 240) });
const publicGenerationError = (error) => isTransient(error) ? "Studio AI is busy right now. Retrying automatically…" : (String(error?.message || "").trim() || "Studio could not generate the preview.");
const validateSpec = (raw) => raw?.layout === "product-menu-showcase" ? validateProductMenuSpec(raw) : validateStudioSpec(raw);
const renderSpec = (spec) => spec.layout === "product-menu-showcase" ? renderProductMenuSpec(spec) : renderStudioSpec(spec);
const rendererName = (spec) => spec.layout === "product-menu-showcase" ? "product-menu-showcase-v1" : "landing-page-v1";

const STUDIO_SPEC_SCHEMA = {
  type: "object",
  properties: {
    version: { type: "string", enum: ["1.0"] },
    layout: { type: "string", enum: ["landing-page", "product-menu-showcase"] },
    theme: { type: "object", properties: {
      primaryColor: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" }, secondaryColor: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" }, accentColor: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" }, backgroundColor: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" }, surfaceColor: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" }, textColor: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" }, mutedTextColor: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" }, radius: { type: "string", enum: ["md", "lg", "xl"] }, mood: { type: "string", enum: ["warm", "modern", "minimal", "bold"] }
    }, required: ["primaryColor", "secondaryColor", "accentColor", "backgroundColor", "surfaceColor", "textColor", "mutedTextColor", "radius", "mood"], additionalProperties: false },
    sections: { type: "array", minItems: 3, maxItems: 3, items: { type: "object", properties: { id: { type: "string" }, type: { type: "string" }, variant: { type: "string" } }, required: ["id", "type", "variant"], additionalProperties: false } },
    components: { type: "array", minItems: 5, maxItems: 6, items: { type: "string" } },
    content: { type: "object", additionalProperties: true },
    responsive: { type: "object", additionalProperties: true }
  },
  required: ["version", "layout", "theme", "sections", "components", "content", "responsive"],
  additionalProperties: false
};

const generateWithTimeout = async (model, contents) => {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);
  try { return await getClient().models.generateContent({ model, contents, config: { responseMimeType: "application/json", responseJsonSchema: STUDIO_SPEC_SCHEMA, maxOutputTokens: 2200, thinkingConfig: { thinkingLevel: "low" }, abortSignal: controller.signal } }); }
  finally { clearTimeout(timer); }
};

const PRODUCT_MENU_FILLERS = [
  { name: "Signature Favorite", description: "A standout choice from the collection.", tag: "Featured" },
  { name: "House Special", description: "A popular option selected with care.", tag: "Popular" },
  { name: "Classic Choice", description: "A dependable favourite for any occasion.", tag: "Classic" },
  { name: "Customer Pick", description: "A well-loved choice worth trying.", tag: "Favourite" }
];

const normalizeProductMenuSpec = (raw) => {
  if (!raw || raw.layout !== "product-menu-showcase") return raw;
  const content = raw.content && typeof raw.content === "object" ? raw.content : {};
  const catalog = content.catalog && typeof content.catalog === "object" ? content.catalog : {};
  const categories = Array.isArray(catalog.categories) ? catalog.categories.filter(Boolean).slice(0, 6) : [];
  const items = Array.isArray(catalog.items) ? [...catalog.items].slice(0, 8) : [];
  const originalItemCount = items.length;
  const fallbackCategory = categories[0] || "Featured";
  let fillerIndex = 0;
  while (items.length < 4) {
    const filler = PRODUCT_MENU_FILLERS[fillerIndex % PRODUCT_MENU_FILLERS.length];
    const category = categories.length ? categories[items.length % categories.length] : fallbackCategory;
    items.push({ ...filler, price: "Ask us", category });
    fillerIndex += 1;
  }
  const normalizedCategories = categories.length ? categories : [fallbackCategory];
  const normalized = {
    ...raw,
    version: "1.0",
    layout: "product-menu-showcase",
    sections: [
      { id: "hero", type: "hero", variant: "spotlight" },
      { id: "catalog", type: "catalog", variant: "grid" },
      { id: "cart", type: "cart", variant: "drawer" }
    ],
    components: ["navbar", "hero", "category-filter", "product-card", "cart-panel", "footer"],
    content: { ...content, catalog: { ...catalog, categories: normalizedCategories, items } },
    responsive: { breakpoint: "768px", hero: "stack", productColumns: { desktop: 3, mobile: 1 }, navigation: "collapse" }
  };
  console.info("Studio product menu spec normalized", { originalItemCount, normalizedItemCount: items.length, sectionsCanonicalized: true, responsiveCanonicalized: true });
  return normalized;
};

const generateSpec = async (prompt) => {
  const contents = `You are PromptStudio Studio's structured design intelligence. Convert the user's generated app brief into ONE compact Studio Spec. Never write React, JSX, CSS, HTML or source code. Return only JSON matching the supplied schema.\n\nSUPPORTED V0 LAYOUTS:\n1) landing-page: exactly hero, menu, booking sections; components navbar, hero, menu-card, booking-form, footer; responsive breakpoint 768px, hero stacks, menu 3 columns desktop/1 mobile, navigation collapses.\n2) product-menu-showcase: exactly hero, catalog, cart sections; components navbar, hero, category-filter, product-card, cart-panel, footer; responsive breakpoint 768px, hero stacks, product grid 3 columns desktop/1 mobile, navigation collapses. Use this layout when the brief is primarily a product catalogue, shop, menu showcase or browse-and-add experience. For this layout ALWAYS provide 4 to 8 useful catalog items, even when the source brief mentions fewer.\nPreserve useful brand, copy, items, prices, calls to action and visual direction. Choose a coherent palette and mood. Do not invent unsupported capabilities.\n\nUSER'S GENERATED PROMPT:\n${String(prompt || "").slice(0, MAX_PROMPT_CHARS)}`;
  let lastError;
  for (const model of MODEL_SEQUENCE) {
    const startedAt = Date.now();
    try {
      const result = await generateWithTimeout(model, contents);
      const raw = parseJson(result.text, "invalid_spec_response");
      const normalized = normalizeProductMenuSpec(raw);
      const spec = validateSpec(normalized);
      console.info("Studio spec stage completed", { model, layout: spec.layout, durationMs: Date.now() - startedAt });
      return { spec, model };
    } catch (error) {
      lastError = error;
      console.warn("Studio spec model failed", { model, durationMs: Date.now() - startedAt, transient: isTransient(error), error: safeErrorDetails(error) });
      if (!isTransient(error)) throw error;
    }
  }
  throw lastError || fail("Studio AI could not produce a structured specification.", 502, "studio_ai_failed");
};

const normalizeRenderedFiles = (files) => {
  if (!files || typeof files !== "object" || Array.isArray(files)) throw fail("Studio renderer returned no project files.", 500, "renderer_failed");
  const normalized = {};
  for (const path of ["/App.js", "/styles.css"]) {
    if (typeof files[path] !== "string" || !files[path].trim() || files[path].length > MAX_FILE_CHARS) throw fail(`Studio renderer did not produce ${path}.`, 500, "renderer_failed");
    normalized[path] = files[path];
  }
  return normalized;
};
const deterministicValidate = (files, renderer) => {
  const normalized = normalizeRenderedFiles(files); const app = normalized["/App.js"]; const css = normalized["/styles.css"];
  if (!/from\s+["']react["']/.test(app) || !/export\s+default\s+function\s+App/.test(app)) throw fail("Studio preview failed its React artifact check.", 422, "validation_failed");
  if (!/\.site-shell\b/.test(css) || !/@media\s*\(max-width:\s*768px\)/.test(css)) throw fail("Studio preview failed its responsive stylesheet check.", 422, "validation_failed");
  if (/\b(?:fetch|XMLHttpRequest|WebSocket|eval|Function)\s*\(/.test(app) || /document\.cookie|localStorage|sessionStorage/.test(app)) throw fail("Studio preview contains a prohibited browser or network operation.", 422, "validation_failed");
  const imports = app.match(/import\s+(?:[^;\n]+\s+from\s+)?["']([^"']+)["']/g) || [];
  for (const line of imports) { const specifier = /["']([^"']+)["']/.exec(line)?.[1] || ""; if (specifier !== "react") throw fail(`Studio preview uses an unsupported dependency: ${specifier}.`, 422, "validation_failed"); }
  if (renderer === "product-menu-showcase-v1" && !/product-grid|product-card/.test(app)) throw fail("Studio product template failed its artifact marker check.", 422, "validation_failed");
  return { valid: true, fileCount: 2, appPath: "/App.js", renderer, checkedAt: Date.now() };
};

const currentStage = (data) => { if (data.status === "queued" || data.stage === "spec") return "spec"; if (data.stage === "render" || data.status === "rendering") return "render"; if (data.stage === "validation" || data.status === "validating") return "validation"; return data.stage || "spec"; };
const publicJob = (data) => ({ jobId: data.jobId, status: data.status, stage: currentStage(data), attempt: Number(data.attempt || 0), message: data.message || null, retryAt: data.nextAttemptAt || null, files: data.status === "ready" ? data.files : null, error: data.status === "failed" ? data.error : null, artifacts: { spec: data.spec || null, validation: data.validation || null } });
const getJob = async (uid, jobId) => { const snap = await adminDb().collection("studioJobs").doc(jobId).get(); if (!snap.exists || snap.data()?.uid !== uid) throw fail("Studio job not found.", 404, "job_not_found"); return { ref: snap.ref, data: snap.data() }; };
const claimJob = async (uid, jobId) => {
  const db = adminDb(); const ref = db.collection("studioJobs").doc(jobId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref); if (!snap.exists || snap.data()?.uid !== uid) throw fail("Studio job not found.", 404, "job_not_found");
    const data = snap.data(); if (data.status === "ready" || data.status === "failed") return { claimed: false, data };
    const now = Date.now();
    if (data.processing === true && Number(data.processingAt || 0) > now - JOB_LEASE_MS) return { claimed: false, busy: true, data };
    if (Number(data.nextAttemptAt || 0) > now) return { claimed: false, retrying: true, data };
    if (Number(data.createdAt || now) < now - JOB_TTL_MS) { const error = "This Studio job expired. Please start again."; tx.update(ref, { status: "failed", processing: false, error, updatedAt: now }); return { claimed: false, data: { ...data, status: "failed", processing: false, error } }; }
    const stage = currentStage(data); const attempt = Number(data.attempt || 0) + 1;
    tx.update(ref, { processing: true, processingAt: now, attempt, stage, nextAttemptAt: null, updatedAt: now });
    return { claimed: true, data: { ...data, processing: true, processingAt: now, attempt, stage, nextAttemptAt: null } };
  });
};
const scheduleRetry = async (ref, data, error) => { const delay = RETRY_DELAYS_MS[Math.min(Number(data.attempt || 1) - 1, RETRY_DELAYS_MS.length - 1)]; const nextAttemptAt = Date.now() + delay + Math.floor(Math.random() * 400); const message = "Studio AI is busy right now. Retrying automatically…"; console.warn("Studio spec retry scheduled", { attempt: data.attempt, nextAttemptAt, error: safeErrorDetails(error) }); await ref.update({ processing: false, message, nextAttemptAt, updatedAt: Date.now(), lastError: safeErrorDetails(error) }); return { ...data, processing: false, message, nextAttemptAt }; };

const processJob = async (uid, jobId) => {
  const claim = await claimJob(uid, jobId); if (!claim.claimed) return { ...claim.data, busy: Boolean(claim.busy), retrying: Boolean(claim.retrying) };
  const { data } = claim; const ref = adminDb().collection("studioJobs").doc(jobId);
  try {
    if (data.stage === "spec") {
      const { spec, model } = await generateSpec(data.prompt);
      await ref.update({ stage: "render", status: "rendering", processing: false, attempt: 0, spec, specModel: model, message: `Studio Spec ready (${spec.layout}). Rendering the interface from PromptStudio templates.`, nextAttemptAt: null, updatedAt: Date.now() });
      return { ...data, stage: "render", status: "rendering", processing: false, attempt: 0, spec, specModel: model, message: `Studio Spec ready (${spec.layout}). Rendering the interface from PromptStudio templates.` };
    }
    if (data.stage === "render") {
      const spec = validateSpec(data.spec); const renderer = rendererName(spec); const files = normalizeRenderedFiles(renderSpec(spec));
      await ref.update({ stage: "validation", status: "validating", processing: false, attempt: 0, files, renderer, message: "Template render complete. Validating the preview now.", nextAttemptAt: null, updatedAt: Date.now() });
      return { ...data, stage: "validation", status: "validating", processing: false, attempt: 0, files, renderer, message: "Template render complete. Validating the preview now." };
    }
    if (data.stage === "validation") {
      const validation = deterministicValidate(data.files, data.renderer || "landing-page-v1");
      await ref.update({ stage: "ready", status: "ready", processing: false, attempt: 0, validation, message: "Preview ready.", nextAttemptAt: null, updatedAt: Date.now() });
      return { ...data, stage: "ready", status: "ready", processing: false, attempt: 0, validation, message: "Preview ready." };
    }
    throw fail("Studio job reached an invalid stage.", 500, "invalid_job_stage");
  } catch (error) {
    if (data.stage === "spec" && isTransient(error) && Number(data.attempt || 0) < MAX_AI_ATTEMPTS) return scheduleRetry(ref, data, error);
    console.error("Studio job failed", { stage: data.stage, attempt: data.attempt, error: safeErrorDetails(error) });
    const message = data.stage === "validation" ? "Studio preview failed deterministic validation." : publicGenerationError(error);
    await ref.update({ status: "failed", processing: false, error: message, nextAttemptAt: null, updatedAt: Date.now(), lastError: safeErrorDetails(error) });
    return { ...data, status: "failed", processing: false, error: message };
  }
};

export default async function handler(req, res) {
  try {
    const user = await requireUser(req); const uid = user.uid;
    if (req.method === "GET") { const jobId = String(req.query?.jobId || ""); if (!jobId) return send(res, 400, { code: "invalid_job", message: "A Studio job id is required." }); const job = await getJob(uid, jobId); return send(res, 200, publicJob({ jobId, ...job.data })); }
    if (req.method !== "POST") return send(res, 405, { code: "method_not_allowed", message: "GET or POST required." });
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (body.action === "create") { const prompt = typeof body.prompt === "string" ? body.prompt.trim() : ""; if (prompt.length < 3) return send(res, 400, { code: "invalid_prompt", message: "A generated prompt is required." }); const jobId = globalThis.crypto?.randomUUID?.() || `studio-${Date.now()}-${Math.random().toString(36).slice(2)}`; const now = Date.now(); const data = { uid, prompt: prompt.slice(0, MAX_PROMPT_CHARS), status: "queued", stage: "spec", attempt: 0, processing: false, createdAt: now, updatedAt: now, message: "Preparing the structured Studio Spec." }; await adminDb().collection("studioJobs").doc(jobId).set(data); return send(res, 201, publicJob({ jobId, ...data })); }
    if (body.action === "process") { const jobId = String(body.jobId || ""); if (!jobId) return send(res, 400, { code: "invalid_job", message: "A Studio job id is required." }); const result = await processJob(uid, jobId); return send(res, result.busy || result.retrying ? 202 : 200, publicJob({ jobId, ...result })); }
    return send(res, 400, { code: "invalid_action", message: "Studio job action must be create or process." });
  } catch (error) { console.error("Studio job API failed", { code: error?.code || "unknown", message: error?.message || "unknown" }); return send(res, error?.status || 500, { code: error?.code || "studio_job_failed", message: error?.message || "Studio job could not complete." }); }
}
