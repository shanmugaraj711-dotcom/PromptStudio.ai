import { GoogleGenAI } from "@google/genai";
import { requireUser, adminDb } from "./_firebaseAdmin.js";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.7-flash";
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.6-flash";
const SECOND_FALLBACK_MODEL = process.env.GEMINI_SECOND_FALLBACK_MODEL || "gemini-3.8-flash";
const MODEL_SEQUENCE = [...new Set([MODEL, FALLBACK_MODEL, SECOND_FALLBACK_MODEL])];
const MAX_FILES = 8;
const MAX_FILE_CHARS = 50000;
const MAX_AI_ATTEMPTS = 3;
const GENERATION_TIMEOUT_MS = 24000;
const JOB_LEASE_MS = 60000;
const JOB_TTL_MS = 30 * 60 * 1000;
const RETRY_DELAYS_MS = [1500, 4000];

const send = (res, status, payload) => { res.setHeader("Cache-Control", "no-store"); return res.status(status).json(payload); };
const fail = (message, status, code) => Object.assign(new Error(message), { status, code });

const parseJson = (text, code = "invalid_ai_response") => {
  const raw = String(text || "").trim();
  try { return JSON.parse(raw); } catch {}
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) { try { return JSON.parse(fenced[1]); } catch {} }
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first >= 0 && last > first) { try { return JSON.parse(raw.slice(first, last + 1)); } catch {} }
  throw fail("The Studio AI returned an invalid response.", 502, code);
};

const ARCHITECTURE_SCHEMA = {
  type: "object",
  properties: {
    app: { type: "object", properties: { name: { type: "string" }, purpose: { type: "string" } }, required: ["name", "purpose"], additionalProperties: false },
    pages: { type: "array", items: { type: "object", properties: { id: { type: "string" }, purpose: { type: "string" } }, required: ["id", "purpose"], additionalProperties: false } },
    sections: { type: "array", items: { type: "object", properties: { id: { type: "string" }, purpose: { type: "string" } }, required: ["id", "purpose"], additionalProperties: false } },
    components: { type: "array", items: { type: "string" } },
    responsiveRules: { type: "array", items: { type: "string" } }
  },
  required: ["app", "pages", "sections", "components", "responsiveRules"],
  additionalProperties: false
};

const PROJECT_SCHEMA = { type: "object", properties: { files: { type: "object", additionalProperties: { type: "string" } } }, required: ["files"], additionalProperties: false };
const structuredJsonConfig = (schema) => ({ responseMimeType: "application/json", responseJsonSchema: schema });

const normalizeFiles = (files) => {
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

const deterministicValidate = (files) => {
  const normalized = normalizeFiles(files);
  const paths = Object.keys(normalized);
  const appPath = ["/App.js", "/App.jsx", "/src/App.js", "/src/App.jsx"].find((p) => normalized[p]?.trim());
  if (!appPath) throw fail("Studio preview is missing its React App entry.", 422, "validation_failed");
  const source = Object.values(normalized).join("\n");
  if (!/\bReact\b|\breact\b/.test(source)) throw fail("Studio preview does not contain a React application.", 422, "validation_failed");
  if (/\b(?:fetch|XMLHttpRequest|WebSocket|eval|Function)\s*\(/.test(source) || /document\.cookie|localStorage|sessionStorage/.test(source)) throw fail("Studio preview contains a prohibited browser or network operation.", 422, "validation_failed");
  const imports = source.match(/import\s+(?:[^;\n]+\s+from\s+)?["']([^"']+)["']/g) || [];
  for (const line of imports) {
    const specifier = /["']([^"']+)["']/.exec(line)?.[1] || "";
    if (specifier.startsWith(".") || ["react", "react-dom", "react-dom/client"].includes(specifier)) continue;
    throw fail(`Studio preview uses an unsupported dependency: ${specifier}.`, 422, "validation_failed");
  }
  if (!paths.some((p) => /(?:^|\/)(?:styles|App)\.css$/i.test(p))) throw fail("Studio preview is missing its stylesheet.", 422, "validation_failed");
  return { valid: true, appPath, fileCount: paths.length, checkedAt: Date.now() };
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
const publicGenerationError = (error) => isTransient(error) ? "Studio AI is busy right now. We are retrying automatically…" : (String(error?.message || "").trim() || "Studio could not generate the preview.");

const generateWithTimeout = async (model, contents, schema, maxOutputTokens) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);
  try {
    return await getClient().models.generateContent({ model, contents, config: { ...structuredJsonConfig(schema), maxOutputTokens, thinkingConfig: { thinkingLevel: "low" }, abortSignal: controller.signal } });
  } finally { clearTimeout(timer); }
};

const runModelFailover = async ({ contents, schema, maxOutputTokens, parse }) => {
  let lastError;
  for (const model of MODEL_SEQUENCE) {
    const startedAt = Date.now();
    try {
      const result = await generateWithTimeout(model, contents, schema, maxOutputTokens);
      const value = parse(result.text);
      console.info("Studio AI stage completed", { model, durationMs: Date.now() - startedAt });
      return { value, model };
    } catch (error) {
      lastError = error;
      console.warn("Studio AI model failed", { model, durationMs: Date.now() - startedAt, transient: isTransient(error), error: safeErrorDetails(error) });
      if (!isTransient(error)) throw error;
    }
  }
  throw lastError || fail("Studio AI could not generate the requested stage.", 502, "studio_ai_failed");
};

const generateArchitecture = async (prompt) => {
  const contents = `You are PromptStudio Studio's architecture planner. Convert the user's generated app brief into a compact implementation blueprint. Do not write source code. Return only JSON matching the schema. Define the app purpose, pages, sections, reusable components and responsive rules. Keep it small enough for an in-browser React preview.\n\nUSER'S GENERATED PROMPT:\n${String(prompt || "").slice(0, 12000)}`;
  const { value, model } = await runModelFailover({ contents, schema: ARCHITECTURE_SCHEMA, maxOutputTokens: 1600, parse: (text) => parseJson(text, "invalid_architecture") });
  return { architecture: value, model };
};

const generateImplementation = async (prompt, architecture) => {
  const contents = `You are PromptStudio Studio's implementation generator. Turn the approved architecture into a small, polished, runnable React app for an in-browser preview. Return only JSON matching the schema. Create EXACTLY TWO FILES: /App.js and /styles.css. Do not create index.js, package files, or extra files. Use React and plain CSS only. Imports may be only react. Do NOT import lucide-react or any other third-party package. No network calls, secrets, backend, or external assets. Put all UI in App.js and all styling in styles.css. Make it visually polished, responsive, interactive, and mobile-friendly.\n\nUSER'S GENERATED PROMPT:\n${String(prompt || "").slice(0, 12000)}\n\nAPPROVED ARCHITECTURE:\n${JSON.stringify(architecture)}`;
  const { value, model } = await runModelFailover({ contents, schema: PROJECT_SCHEMA, maxOutputTokens: 3600, parse: (text) => normalizeFiles(parseJson(text).files) });
  return { files: value, model };
};

const currentStage = (data) => {
  if (data.status === "queued" || data.stage === "architecture") return "architecture";
  if (data.status === "building" || data.stage === "implementation") return "implementation";
  if (data.status === "validating" || data.stage === "validation") return "validation";
  return data.stage || "architecture";
};

const publicJob = (data) => ({ jobId: data.jobId, status: data.status, stage: currentStage(data), attempt: Number(data.attempt || 0), message: data.message || null, retryAt: data.nextAttemptAt || null, files: data.status === "ready" ? data.files : null, error: data.status === "failed" ? data.error : null, artifacts: { architecture: data.architecture || null, validation: data.validation || null } });

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
    if (data.processing === true && Number(data.processingAt || 0) > now - JOB_LEASE_MS) return { claimed: false, busy: true, data };
    if (Number(data.nextAttemptAt || 0) > now) return { claimed: false, retrying: true, data };
    if (Number(data.createdAt || now) < now - JOB_TTL_MS) {
      const error = "This Studio job expired. Please start again.";
      tx.update(ref, { status: "failed", processing: false, error, updatedAt: now });
      return { claimed: false, data: { ...data, status: "failed", processing: false, error } };
    }
    const stage = currentStage(data);
    const attempt = Number(data.attempt || 0) + 1;
    tx.update(ref, { processing: true, processingAt: now, attempt, stage, nextAttemptAt: null, updatedAt: now });
    return { claimed: true, data: { ...data, processing: true, processingAt: now, attempt, stage, nextAttemptAt: null } };
  });
};

const scheduleRetry = async (ref, data, error) => {
  const delay = RETRY_DELAYS_MS[Math.min(Number(data.attempt || 1) - 1, RETRY_DELAYS_MS.length - 1)];
  const nextAttemptAt = Date.now() + delay + Math.floor(Math.random() * 400);
  console.warn("Studio job retry scheduled", { stage: data.stage, attempt: data.attempt, nextAttemptAt, error: safeErrorDetails(error) });
  const message = "Studio AI is busy right now. Retrying automatically…";
  await ref.update({ processing: false, message, nextAttemptAt, updatedAt: Date.now(), lastError: safeErrorDetails(error) });
  return { ...data, processing: false, message, nextAttemptAt };
};

const processJob = async (uid, jobId) => {
  const claim = await claimJob(uid, jobId);
  if (!claim.claimed) return { ...claim.data, busy: Boolean(claim.busy), retrying: Boolean(claim.retrying) };
  const { data } = claim;
  const ref = adminDb().collection("studioJobs").doc(jobId);
  try {
    if (data.stage === "architecture") {
      const { architecture, model } = await generateArchitecture(data.prompt);
      await ref.update({ stage: "implementation", status: "building", processing: false, attempt: 0, architecture, architectureModel: model, message: "Architecture complete. Building the interface now.", nextAttemptAt: null, updatedAt: Date.now() });
      return { ...data, stage: "implementation", status: "building", processing: false, attempt: 0, architecture, architectureModel: model, message: "Architecture complete. Building the interface now." };
    }
    if (data.stage === "implementation") {
      const { files, model } = await generateImplementation(data.prompt, data.architecture);
      await ref.update({ stage: "validation", status: "validating", processing: false, attempt: 0, files, implementationModel: model, message: "Interface generated. Validating the preview now.", nextAttemptAt: null, updatedAt: Date.now() });
      return { ...data, stage: "validation", status: "validating", processing: false, attempt: 0, files, implementationModel: model, message: "Interface generated. Validating the preview now." };
    }
    if (data.stage === "validation") {
      const validation = deterministicValidate(data.files);
      await ref.update({ stage: "ready", status: "ready", processing: false, validation, message: "Preview ready.", nextAttemptAt: null, updatedAt: Date.now() });
      return { ...data, stage: "ready", status: "ready", processing: false, validation, message: "Preview ready." };
    }
    throw fail("Studio job reached an invalid stage.", 500, "invalid_job_stage");
  } catch (error) {
    const aiStage = data.stage === "architecture" || data.stage === "implementation";
    if (aiStage && isTransient(error) && Number(data.attempt || 0) < MAX_AI_ATTEMPTS) return scheduleRetry(ref, data, error);
    console.error("Studio job failed", { stage: data.stage, attempt: data.attempt, error: safeErrorDetails(error) });
    const message = data.stage === "validation" ? "Studio preview failed deterministic validation." : publicGenerationError(error);
    await ref.update({ status: "failed", processing: false, error: message, nextAttemptAt: null, updatedAt: Date.now(), lastError: safeErrorDetails(error) });
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
      const data = { uid, prompt: prompt.slice(0, 12000), status: "queued", stage: "architecture", attempt: 0, processing: false, createdAt: now, updatedAt: now, message: "Preparing the architecture job." };
      await adminDb().collection("studioJobs").doc(jobId).set(data);
      return send(res, 201, publicJob({ jobId, ...data }));
    }
    if (body.action === "process") {
      const jobId = String(body.jobId || "");
      if (!jobId) return send(res, 400, { code: "invalid_job", message: "A Studio job id is required." });
      const result = await processJob(uid, jobId);
      return send(res, result.busy || result.retrying ? 202 : 200, publicJob({ jobId, ...result }));
    }
    return send(res, 400, { code: "invalid_action", message: "Studio job action must be create or process." });
  } catch (error) {
    console.error("Studio job API failed", { code: error?.code || "unknown", message: error?.message || "unknown" });
    return send(res, error?.status || 500, { code: error?.code || "studio_job_failed", message: error?.message || "Studio job could not complete." });
  }
}
