import { GoogleGenAI } from "@google/genai";
import { requireUser, adminDb } from "./_firebaseAdmin.js";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.7-flash";
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.5-flash-lite";
const SECOND_FALLBACK_MODEL = process.env.GEMINI_SECOND_FALLBACK_MODEL || "gemini-3.6-flash";
const MAX_FILES = 8;
const MAX_FILE_CHARS = 50000;
const MAX_ATTEMPTS = 3;
const GENERATION_TIMEOUT_MS = 12000;
const JOB_TTL_MS = 30 * 60 * 1000;

const send = (res, status, payload) => {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(payload);
};
const fail = (message, status, code) => Object.assign(new Error(message), { status, code });
const parseJson = (text) => {
  try { return JSON.parse(String(text || "").trim()); }
  catch { throw fail("The Studio AI returned an invalid project response.", 502, "invalid_ai_response"); }
};

const STUDIO_PROJECT_SCHEMA = {
  type: "object",
  properties: {
    files: { type: "object", additionalProperties: { type: "string" } }
  },
  required: ["files"],
  additionalProperties: false
};

const structuredJsonConfig = (schema) => ({ responseMimeType: "application/json", responseJsonSchema: schema });

const validateFiles = (files) => {
  if (!files || typeof files !== "object" || Array.isArray(files)) throw fail("Studio returned no project files.", 502, "invalid_project");
  const normalized = {};
  for (const [rawPath, content] of Object.entries(files)) {
    if (typeof rawPath !== "string" || typeof content !== "string") continue;
    const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
    if (!/^\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/.test(path) || path.includes("..") || path.includes("\\") || content.length > MAX_FILE_CHARS) throw fail("Studio returned an invalid project file.", 502, "invalid_project");
    normalized[path] = content;
  }
  const entries = Object.entries(normalized);
  if (!entries.length || entries.length > MAX_FILES) throw fail("Studio returned an invalid number of project files.", 502, "invalid_project");
  return Object.fromEntries(entries);
};

const getClient = () => {
  if (!process.env.GEMINI_API_KEY) throw fail("Studio AI is not configured yet.", 503, "server_configuration_error");
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
};

const isTransient = (error) => {
  const status = Number(error?.status || error?.statusCode || 0);
  const message = String(error?.message || "").toLowerCase();
  return [408, 429, 500, 502, 503, 504].includes(status) || /high demand|temporar|unavailable|overload|timeout|aborted|deadline/.test(message);
};

const generationModelForAttempt = (attempt) => [MODEL, FALLBACK_MODEL, SECOND_FALLBACK_MODEL][Math.max(0, Math.min(attempt, 3) - 1)];

const classifyGenerationError = (error) => {
  const status = Number(error?.status || error?.statusCode || 0);
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  if (code === "invalid_ai_response" || message.includes("invalid project response")) return "invalid_ai_response";
  if (code === "invalid_project" || message.includes("invalid project")) return "invalid_project";
  if (status === 429 || code.includes("rate") || message.includes("rate limit") || message.includes("too many requests")) return "rate_limited";
  if (status === 408 || status === 504 || message.includes("timeout") || message.includes("aborted") || message.includes("deadline")) return "timeout";
  if (status === 503 || message.includes("high demand")) return "high_demand";
  if (status === 500 || status === 502 || message.includes("temporar") || message.includes("unavailable") || message.includes("overload")) return "provider_unavailable";
  return "unknown";
};

const publicGenerationError = (error) => {
  const message = String(error?.message || "").trim();
  try {
    const parsed = JSON.parse(message);
    if (parsed?.error?.message || parsed?.error?.code || parsed?.error?.status) return "Studio AI is busy right now. Please try again in a moment.";
  } catch {
    // Keep Studio's own structured error messages; only hide provider-shaped JSON.
  }
  if (isTransient(error)) return "Studio AI is busy right now. Please try again in a moment.";
  return message || "Studio could not generate the preview.";
};

const generateWithTimeout = async (model, contents) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);
  try {
    return await getClient().models.generateContent({
      model,
      contents,
      config: { ...structuredJsonConfig(STUDIO_PROJECT_SCHEMA), maxOutputTokens: 3200, thinkingConfig: { thinkingLevel: "low" }, abortSignal: controller.signal }
    });
  } finally {
    clearTimeout(timer);
  }
};

const generateProjectAttempt = async (prompt, attempt) => {
  const model = generationModelForAttempt(attempt);
  const system = "You are PromptStudio Studio's code generator. Create a small, polished, runnable React app for an in-browser preview. Return only JSON matching the schema. Use React and plain CSS only. You may import only react or react-dom. Do NOT import lucide-react or any other third-party package. No network calls, secrets, backend, or external assets. Keep the project small, normally 3 files. Make it visually polished, responsive and interactive. It must run in a standard Sandpack React environment. Return only essential files.";
  const contents = `${system}\n\nUSER'S GENERATED PROMPT:\n${String(prompt || "").slice(0, 12000)}`;
  const result = await generateWithTimeout(model, contents);
  const payload = parseJson(result.text);
  return validateFiles(payload.files);
};

const publicJob = (data) => ({
  jobId: data.jobId,
  status: data.status,
  stage: data.stage,
  attempt: data.attempt || 0,
  message: data.message || null,
  files: data.status === "ready" ? data.files : null,
  error: data.status === "failed" ? data.error : null
});

const getJob = async (uid, jobId) => {
  const snap = await adminDb().collection("studioJobs").doc(jobId).get();
  if (!snap.exists || snap.data()?.uid !== uid) throw fail("Studio job not found.", 404, "job_not_found");
  return { ref: snap.ref, data: snap.data() };
};

const claimJob = async (uid, jobId) => {
  const db = adminDb();
  const ref = db.collection("studioJobs").doc(jobId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.uid !== uid) throw fail("Studio job not found.", 404, "job_not_found");
    const data = snap.data();
    if (data.status === "ready" || data.status === "failed") return { claimed: false, data };
    const now = Date.now();
    if (data.processing === true && Number(data.processingAt || 0) > now - 45000) return { claimed: false, busy: true, data };
    if (Number(data.createdAt || now) < now - JOB_TTL_MS) {
      tx.update(ref, { status: "failed", processing: false, error: "This Studio job expired. Please start again.", updatedAt: now });
      return { claimed: false, data: { ...data, status: "failed", error: "This Studio job expired. Please start again." } };
    }
    const attempt = Number(data.attempt || 0) + 1;
    tx.update(ref, { processing: true, processingAt: now, attempt, updatedAt: now, status: data.status === "queued" ? "building" : data.status, stage: data.status === "queued" ? "layout" : data.stage });
    return { claimed: true, data: { ...data, processing: true, processingAt: now, attempt, status: data.status === "queued" ? "building" : data.status, stage: data.status === "queued" ? "layout" : data.stage, attempt } };
  });
};

const processJob = async (uid, jobId) => {
  const claim = await claimJob(uid, jobId);
  if (!claim.claimed) return { ...claim.data, busy: Boolean(claim.busy) };
  const { data } = claim;
  const ref = adminDb().collection("studioJobs").doc(jobId);
  const model = generationModelForAttempt(data.attempt);
  try {
    if (data.status === "validating") {
      const files = validateFiles(data.files);
      await ref.update({ status: "ready", stage: "ready", processing: false, message: "Preview ready.", files, updatedAt: Date.now() });
      return { ...data, status: "ready", stage: "ready", processing: false, files, message: "Preview ready." };
    }
    const files = await generateProjectAttempt(data.prompt, data.attempt);
    await ref.update({ status: "validating", stage: "validation", processing: false, message: "Preview generated. Validating it now.", files, updatedAt: Date.now() });
    return { ...data, status: "validating", stage: "validation", processing: false, files, message: "Preview generated. Validating it now." };
  } catch (error) {
    const reason = classifyGenerationError(error);
    const retryable = isTransient(error) && data.attempt < MAX_ATTEMPTS;
    if (retryable) {
      console.warn("Studio generation retry", { attempt: data.attempt, model, reason });
      const retryMessage = "Studio is busy right now. Retrying automatically…";
      await ref.update({ status: "building", stage: "layout", processing: false, message: retryMessage, lastError: error?.code || "generation_retry", updatedAt: Date.now() });
      return { ...data, status: "building", stage: "layout", processing: false, message: retryMessage };
    }
    console.error("Studio generation failed", { attempt: data.attempt, model, reason });
    const message = publicGenerationError(error);
    await ref.update({ status: "failed", processing: false, error: message, updatedAt: Date.now() });
    return { ...data, status: "failed", processing: false, error: message };
  }
};

export default async function handler(req, res) {
  try {
    const user = await requireUser(req);
    const uid = user.uid;
    if (req.method === "GET") {
      const jobId = String(req.query?.jobId || "");
      if (!jobId) return send(res, 400, { code: "invalid_job", message: "A Studio job id is required." });
      const job = await getJob(uid, jobId);
      return send(res, 200, publicJob({ jobId, ...job.data }));
    }
    if (req.method !== "POST") return send(res, 405, { code: "method_not_allowed", message: "GET or POST required." });
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (body.action === "create") {
      const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
      if (prompt.length < 3) return send(res, 400, { code: "invalid_prompt", message: "A generated prompt is required." });
      const jobId = globalThis.crypto?.randomUUID?.() || `studio-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const now = Date.now();
      const data = { uid, prompt: prompt.slice(0, 12000), status: "queued", stage: "planning", attempt: 0, processing: false, createdAt: now, updatedAt: now, message: "Structure planned. Preparing the build." };
      await adminDb().collection("studioJobs").doc(jobId).set(data);
      return send(res, 201, publicJob({ jobId, ...data }));
    }
    if (body.action === "process") {
      const jobId = String(body.jobId || "");
      if (!jobId) return send(res, 400, { code: "invalid_job", message: "A Studio job id is required." });
      const result = await processJob(uid, jobId);
      return send(res, result.busy ? 202 : 200, publicJob({ jobId, ...result }));
    }
    return send(res, 400, { code: "invalid_action", message: "Studio job action must be create or process." });
  } catch (error) {
    console.error("Studio job API failed", { code: error?.code || "unknown", message: error?.message || "unknown" });
    return send(res, error?.status || 500, { code: error?.code || "studio_job_failed", message: error?.message || "Studio job could not complete." });
  }
}
