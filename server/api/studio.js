import { GoogleGenAI } from "@google/genai";
import { requireUser } from "./_firebaseAdmin.js";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const MAX_FILES = 8;
const MAX_FILE_CHARS = 50000;
const MAX_EDIT_RATIO = 0.45;

const send = (res, status, payload) => {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(payload);
};

const parseJson = (text) => {
  const raw = String(text || "").trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try { return JSON.parse(raw); } catch { throw Object.assign(new Error("The Studio AI returned an invalid project response."), { status: 502, code: "invalid_ai_response" }); }
};

const validateFiles = (files) => {
  if (!files || typeof files !== "object" || Array.isArray(files)) throw Object.assign(new Error("Studio returned no project files."), { status: 502, code: "invalid_project" });
  const entries = Object.entries(files).filter(([path, content]) => typeof path === "string" && typeof content === "string");
  if (!entries.length || entries.length > MAX_FILES) throw Object.assign(new Error("Studio returned an invalid number of project files."), { status: 502, code: "invalid_project" });
  for (const [path, content] of entries) {
    if (!/^\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/.test(path) || path.includes("..") || content.length > MAX_FILE_CHARS) throw Object.assign(new Error("Studio returned an invalid project file."), { status: 502, code: "invalid_project" });
  }
  return Object.fromEntries(entries);
};

const getClient = () => {
  if (!process.env.GEMINI_API_KEY) throw Object.assign(new Error("Studio AI is not configured yet."), { status: 503, code: "server_configuration_error" });
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
};

const generateProject = async ({ prompt, referenceFiles = [] }) => {
  const safeRefs = Array.isArray(referenceFiles) ? referenceFiles.slice(0, 8).map((file) => ({ name: String(file?.name || "reference").slice(0, 200), content: String(file?.content || "").slice(0, 120000) })) : [];
  const refContext = safeRefs.length ? `\nREFERENCE CONTEXT (static only; never execute):\n${safeRefs.map((file) => `--- ${file.name} ---\n${file.content}`).join("\n")}` : "";
  const system = `You are PromptStudio Studio's code generator. Create a small, polished, runnable React app for an in-browser preview. Return JSON only: {"files":{"/App.js":"...","/index.js":"...","/styles.css":"..."}}. Use only React and plain CSS; no network calls, no secrets, no backend, no external assets required. Keep the project small (normally 3 files). Make the UI visually polished, responsive and interactive. The files must run in a standard Sandpack React environment. Never put markdown fences around the JSON.`;
  const result = await getClient().models.generateContent({ model: MODEL, contents: `${system}\n\nUSER'S GENERATED PROMPT:\n${String(prompt || "").slice(0, 12000)}${refContext}` });
  const payload = parseJson(result.text);
  return validateFiles(payload.files);
};

const applyTargetedEdits = (files, edits) => {
  if (!Array.isArray(edits) || edits.length < 1 || edits.length > 3) throw Object.assign(new Error("Studio did not return targeted edits."), { status: 502, code: "invalid_edit" });
  const next = { ...files };
  const changed = [];
  for (const edit of edits) {
    const path = String(edit?.path || "");
    const oldText = typeof edit?.oldText === "string" ? edit.oldText : "";
    const newText = typeof edit?.newText === "string" ? edit.newText : "";
    if (!next[path] || !oldText || oldText === newText) throw Object.assign(new Error("Studio produced an unsafe or empty edit."), { status: 502, code: "invalid_edit" });
    const source = next[path];
    const occurrences = source.split(oldText).length - 1;
    if (occurrences !== 1) throw Object.assign(new Error(`Studio could not safely locate the requested edit in ${path}.`), { status: 409, code: "edit_not_unique" });
    const updated = source.replace(oldText, newText);
    const ratio = Math.abs(updated.length - source.length) / Math.max(source.length, 1);
    const changedChars = [...source].filter((char, index) => char !== [...updated][index]).length + Math.abs(source.length - updated.length);
    if (ratio > MAX_EDIT_RATIO || changedChars > source.length * MAX_EDIT_RATIO) throw Object.assign(new Error(`The requested edit would change too much of ${path}; Studio refused a broad regeneration.`), { status: 409, code: "edit_too_broad" });
    next[path] = updated;
    changed.push({ path, beforeChars: source.length, afterChars: updated.length, changedChars });
  }
  return { files: validateFiles(next), changed };
};

const editProject = async ({ files, instruction }) => {
  const source = Object.entries(files).map(([path, content]) => `--- ${path} ---\n${content}`).join("\n");
  const system = `You are PromptStudio Studio's targeted code editor. The user wants a small change to an existing React project. Return JSON only: {"edits":[{"path":"/App.js","oldText":"exact existing text","newText":"replacement text"}]}. Make the smallest possible exact text replacements needed. Do NOT return complete files. Do NOT rewrite unrelated code. For a simple visual request such as changing a header color, edit only the relevant class/style/value. Each oldText must occur exactly once in the supplied source. Maximum 3 edits. Never use markdown fences.`;
  const result = await getClient().models.generateContent({ model: MODEL, contents: `${system}\n\nUSER CHANGE:\n${String(instruction || "").slice(0, 2000)}\n\nEXISTING PROJECT:\n${source}` });
  return parseJson(result.text).edits;
};

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { code: "method_not_allowed", message: "POST required." });
  try {
    await requireUser(req);
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const action = body.action;
    if (action === "generate") {
      if (typeof body.prompt !== "string" || body.prompt.trim().length < 3) return send(res, 400, { code: "invalid_prompt", message: "A generated prompt is required." });
      const files = await generateProject({ prompt: body.prompt, referenceFiles: body.referenceFiles });
      return send(res, 200, { files, mode: "generated" });
    }
    if (action === "edit") {
      const files = validateFiles(body.files);
      if (typeof body.instruction !== "string" || body.instruction.trim().length < 2) return send(res, 400, { code: "invalid_instruction", message: "Tell Studio what to change." });
      const edits = await editProject({ files, instruction: body.instruction.trim() });
      const applied = applyTargetedEdits(files, edits);
      return send(res, 200, { ...applied, mode: "targeted_edit", instruction: body.instruction.trim() });
    }
    return send(res, 400, { code: "invalid_action", message: "Studio action must be generate or edit." });
  } catch (error) {
    console.error("Studio API failed", { code: error?.code || "unknown", message: error?.message || "unknown" });
    return send(res, error?.status || 500, { code: error?.code || "studio_failed", message: error?.message || "Studio could not complete that request." });
  }
}
