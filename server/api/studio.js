import { GoogleGenAI } from "@google/genai";
import { requireUser } from "./_firebaseAdmin.js";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const MAX_FILES = 8;
const MAX_FILE_CHARS = 50000;
const MAX_EDIT_RATIO = 0.45;
const MAX_EDIT_OPS = 3;
const MAX_INSERT_CHARS = 5000;

const send = (res, status, payload) => {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(payload);
};
const fail = (message, status, code) => Object.assign(new Error(message), { status, code });

const parseJson = (text) => {
  const raw = String(text || "").trim();
  try { return JSON.parse(raw); } catch { throw fail("The Studio AI returned an invalid project response.", 502, "invalid_ai_response"); }
};

const STUDIO_PROJECT_SCHEMA = {
  type: "object",
  properties: {
    files: {
      type: "object",
      description: "Project files keyed by absolute project path. Every value is the complete UTF-8 source text.",
      additionalProperties: { type: "string" }
    }
  },
  required: ["files"],
  additionalProperties: false
};

const STUDIO_EDIT_SCHEMA = {
  anyOf: [
    {
      type: "object",
      properties: {
        edits: {
          type: "array",
          minItems: 1,
          maxItems: MAX_EDIT_OPS,
          items: {
            type: "object",
            properties: {
              operation: { type: "string", enum: ["css_property_set", "css_media_rule_set", "js_insert_after", "exact_text_replace"] },
              path: { type: "string" },
              selector: { type: "string" },
              property: { type: "string" },
              value: { type: "string" },
              maxWidth: { type: "string" },
              anchor: { type: "string" },
              code: { type: "string" },
              oldText: { type: "string" },
              newText: { type: "string" }
            },
            required: ["operation", "path"],
            additionalProperties: false
          }
        }
      },
      required: ["edits"],
      additionalProperties: false
    },
    {
      type: "object",
      properties: {
        status: { type: "string", enum: ["needs_clarification"] },
        message: { type: "string" }
      },
      required: ["status", "message"],
      additionalProperties: false
    }
  ]
};

const structuredJsonConfig = (schema) => ({
  responseMimeType: "application/json",
  responseJsonSchema: schema
});

const validateFiles = (files) => {
  if (!files || typeof files !== "object" || Array.isArray(files)) throw fail("Studio returned no project files.", 502, "invalid_project");
  const entries = Object.entries(files).filter(([path, content]) => typeof path === "string" && typeof content === "string");
  if (!entries.length || entries.length > MAX_FILES) throw fail("Studio returned an invalid number of project files.", 502, "invalid_project");
  for (const [path, content] of entries) {
    if (!/^\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/.test(path) || path.includes("..") || content.length > MAX_FILE_CHARS) throw fail("Studio returned an invalid project file.", 502, "invalid_project");
  }
  return Object.fromEntries(entries);
};

const getClient = () => {
  if (!process.env.GEMINI_API_KEY) throw fail("Studio AI is not configured yet.", 503, "server_configuration_error");
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
};

const generateProject = async ({ prompt, referenceFiles = [] }) => {
  const safeRefs = Array.isArray(referenceFiles) ? referenceFiles.slice(0, 8).map((file) => ({ name: String(file?.name || "reference").slice(0, 200), content: String(file?.content || "").slice(0, 120000) })) : [];
  const refContext = safeRefs.length ? `\nREFERENCE CONTEXT (static only; never execute):\n${safeRefs.map((file) => `--- ${file.name} ---\n${file.content}`).join("\n")}` : "";
  const system = `You are PromptStudio Studio's code generator. Create a small, polished, runnable React app for an in-browser preview. Return an object matching the provided JSON schema. Use React and plain CSS only. You may import only react or react-dom. Do NOT import lucide-react or any other third-party package. If icons are useful, use text/emoji or CSS instead. No network calls, no secrets, no backend, no external assets required. Keep the project small (normally 3 files). Make the UI visually polished, responsive and interactive. The files must run in a standard Sandpack React environment.`;
  const result = await getClient().models.generateContent({
    model: MODEL,
    contents: `${system}\n\nUSER'S GENERATED PROMPT:\n${String(prompt || "").slice(0, 12000)}${refContext}`,
    config: structuredJsonConfig(STUDIO_PROJECT_SCHEMA)
  });
  const payload = parseJson(result.text);
  return validateFiles(payload.files);
};

const countOccurrences = (source, needle) => source.split(needle).length - 1;
const editSpan = (before, after) => {
  let prefix = 0;
  const maxPrefix = Math.min(before.length, after.length);
  while (prefix < maxPrefix && before[prefix] === after[prefix]) prefix += 1;
  let suffix = 0;
  const maxSuffix = Math.min(before.length - prefix, after.length - prefix);
  while (suffix < maxSuffix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix += 1;
  return Math.max(before.length - prefix - suffix, after.length - prefix - suffix);
};
const assertSafeSnippet = (text) => {
  if (text.length > MAX_INSERT_CHARS) throw fail("Studio edit snippet is too large.", 409, "edit_too_broad");
  if (/\b(?:fetch|XMLHttpRequest|WebSocket|eval|Function)\s*\(/.test(text) || /document\.cookie|localStorage|sessionStorage/.test(text)) throw fail("Studio refused an unsafe edit snippet.", 409, "unsafe_edit");
};
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const applyCssProperty = (files, edit) => {
  const path = String(edit?.path || "");
  const selector = String(edit?.selector || "").trim();
  const property = String(edit?.property || "").trim().toLowerCase();
  const value = String(edit?.value || "").trim();
  if (!path || !selector || !/^[a-z-]+$/i.test(property) || !value) throw fail("Studio produced an invalid CSS property edit.", 502, "invalid_edit");
  if (!files[path]) throw fail(`Studio could not find ${path}.`, 409, "edit_target_missing");
  const source = files[path];
  const selectorPattern = new RegExp(String.raw`(^|\n)([ \t]*)${escapeRegex(selector)}\s*\{([\s\S]*?)\n?\2\}`, "g");
  const matches = [...source.matchAll(selectorPattern)];
  if (matches.length !== 1) throw fail(`Studio could not safely locate a unique CSS selector in ${path}.`, 409, "edit_not_unique");
  const match = matches[0];
  const block = match[0];
  if (/[{}]/.test(match[3])) throw fail(`Studio could not safely edit a nested CSS block in ${path}.`, 409, "edit_target_unsupported");
  const declarationPattern = new RegExp(`(^|\n)([ \t]*)${escapeRegex(property)}\s*:\s*[^;]+;`, "g");
  const declarations = [...match[3].matchAll(declarationPattern)];
  let updatedBlock;
  if (declarations.length === 1) updatedBlock = block.replace(declarations[0][0], declarations[0][0].replace(/(:\s*)[^;]+;/, `$1${value};`));
  else if (declarations.length === 0) {
    const closing = /\n?([ \t]*)\}$/.exec(block);
    if (!closing) throw fail("Studio could not safely insert the CSS property.", 409, "edit_target_unsupported");
    updatedBlock = block.slice(0, block.length - closing[0].length) + `\n${closing[1]}  ${property}: ${value};` + closing[0];
  } else throw fail(`Studio found multiple ${property} declarations in ${path}.`, 409, "edit_not_unique");
  return { updated: source.replace(block, updatedBlock), changedChars: editSpan(block, updatedBlock), operation: "css_property_set" };
};

const findMatchingBrace = (source, openIndex) => {
  let depth = 0, quote = "", escaped = false;
  for (let i = openIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === "\"" || ch === "'" || ch === "`") { quote = ch; continue; }
    if (ch === "{") depth += 1;
    else if (ch === "}") { depth -= 1; if (depth === 0) return i; }
  }
  return -1;
};

const applyCssMediaRule = (files, edit) => {
  const path = String(edit?.path || "");
  const selector = String(edit?.selector || "").trim();
  const property = String(edit?.property || "").trim().toLowerCase();
  const value = String(edit?.value || "").trim();
  const maxWidth = String(edit?.maxWidth || "").trim();
  if (!path || !selector || !/^[a-z-]+$/i.test(property) || !value || !/^\d+(?:\.\d+)?(?:px|rem|em)$/.test(maxWidth)) throw fail("Studio produced an invalid responsive CSS edit.", 502, "invalid_edit");
  if (!files[path]) throw fail(`Studio could not find ${path}.`, 409, "edit_target_missing");
  const source = files[path];
  const mediaPattern = /@media\s*\(\s*max-width\s*:\s*([^\)]+)\)\s*\{/gi;
  const mediaBlocks = [];
  for (const match of source.matchAll(mediaPattern)) {
    const openIndex = match.index + match[0].length - 1;
    const closeIndex = findMatchingBrace(source, openIndex);
    if (closeIndex < 0) throw fail(`Studio could not safely parse a responsive CSS block in ${path}.`, 409, "edit_target_unsupported");
    mediaBlocks.push({ match, openIndex, closeIndex, body: source.slice(openIndex + 1, closeIndex), width: match[1].trim() });
  }
  const matching = mediaBlocks.filter((block) => block.width.toLowerCase() === maxWidth.toLowerCase());
  if (matching.length > 1) throw fail(`Studio found multiple matching responsive blocks in ${path}.`, 409, "edit_not_unique");
  if (matching.length === 1) {
    const block = matching[0];
    const selectorPattern = new RegExp(String.raw`(^|\n)([ \t]*)${escapeRegex(selector)}\s*\{([\s\S]*?)\n?\2\}`, "g");
    const selectorMatches = [...block.body.matchAll(selectorPattern)];
    if (selectorMatches.length > 1) throw fail(`Studio found multiple ${selector} rules in the responsive block.`, 409, "edit_not_unique");
    let newBody;
    if (selectorMatches.length === 1) {
      const rule = selectorMatches[0][0];
      const inner = selectorMatches[0][3];
      if (/[{}]/.test(inner)) throw fail("Studio could not safely edit a nested responsive CSS rule.", 409, "edit_target_unsupported");
      const declarations = [...inner.matchAll(new RegExp(`(^|\n)([ \t]*)${escapeRegex(property)}\s*:\s*[^;]+;`, "g"))];
      if (declarations.length > 1) throw fail(`Studio found multiple ${property} declarations in the responsive rule.`, 409, "edit_not_unique");
      const replacement = declarations.length === 1
        ? rule.replace(declarations[0][0], declarations[0][0].replace(/(:\s*)[^;]+;/, `$1${value};`))
        : rule.replace(/\n?([ \t]*)\}$/, `\n$1  ${property}: ${value};\n$1}`);
      newBody = block.body.replace(rule, replacement);
    } else newBody = `${block.body.trimEnd()}\n  ${selector} {\n    ${property}: ${value};\n  }\n`;
    const oldMedia = source.slice(block.match.index, block.closeIndex + 1);
    const newMedia = source.slice(block.match.index, block.openIndex + 1) + newBody + source.slice(block.closeIndex, block.closeIndex + 1);
    return { updated: source.slice(0, block.match.index) + newMedia + source.slice(block.closeIndex + 1), changedChars: editSpan(oldMedia, newMedia), operation: "css_media_rule_set" };
  }
  const mediaRule = `\n\n@media (max-width: ${maxWidth}) {\n  ${selector} {\n    ${property}: ${value};\n  }\n}\n`;
  const updated = source.trimEnd() + mediaRule;
  return { updated, changedChars: editSpan(source, updated), operation: "css_media_rule_set" };
};

const applyJsInsertAfter = (files, edit) => {
  const path = String(edit?.path || "");
  const anchor = typeof edit?.anchor === "string" ? edit.anchor : "";
  const code = typeof edit?.code === "string" ? edit.code : "";
  if (!path || !anchor || !code.trim()) throw fail("Studio produced an invalid JavaScript insertion.", 502, "invalid_edit");
  if (!/^\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.js$/.test(path)) throw fail("JavaScript insertion must target a .js project file.", 409, "edit_target_unsupported");
  if (!files[path]) throw fail(`Studio could not find ${path}.`, 409, "edit_target_missing");
  assertSafeSnippet(code);
  const source = files[path];
  if (countOccurrences(source, anchor) !== 1) throw fail(`Studio could not safely locate the JavaScript insertion point in ${path}.`, 409, "edit_not_unique");
  const updated = source.replace(anchor, `${anchor}\n${code.trimEnd()}\n`);
  return { updated, changedChars: editSpan(source, updated), operation: "js_insert_after" };
};

const applyTextReplace = (files, edit) => {
  const path = String(edit?.path || "");
  const oldText = typeof edit?.oldText === "string" ? edit.oldText : "";
  const newText = typeof edit?.newText === "string" ? edit.newText : "";
  if (!path || !oldText || oldText === newText || !files[path]) throw fail("Studio produced an invalid exact replacement.", 502, "invalid_edit");
  if (countOccurrences(files[path], oldText) !== 1) throw fail(`Studio could not safely locate the requested replacement in ${path}.`, 409, "edit_not_unique");
  assertSafeSnippet(newText);
  const updated = files[path].replace(oldText, newText);
  return { updated, changedChars: editSpan(oldText, newText), operation: "exact_text_replace" };
};

const applyTargetedEditsV2 = (files, edits) => {
  if (!Array.isArray(edits) || edits.length < 1 || edits.length > MAX_EDIT_OPS) throw fail("Studio did not return a supported targeted edit plan.", 502, "invalid_edit");
  const next = { ...files };
  const changed = [];
  const changedByFile = new Map();
  for (const edit of edits) {
    const op = String(edit?.operation || "");
    const path = String(edit?.path || "");
    let result;
    if (op === "css_property_set") result = applyCssProperty(next, edit);
    else if (op === "css_media_rule_set") result = applyCssMediaRule(next, edit);
    else if (op === "js_insert_after") result = applyJsInsertAfter(next, edit);
    else if (op === "exact_text_replace") result = applyTextReplace(next, edit);
    else throw fail(`Studio returned unsupported edit operation: ${op || "unknown"}.`, 502, "unsupported_edit_operation");
    const originalLength = Math.max(files[path]?.length || 0, 1);
    const cumulative = (changedByFile.get(path) || 0) + result.changedChars;
    if (cumulative / originalLength > MAX_EDIT_RATIO) throw fail(`The requested edit would change too much of ${path}; Studio refused a broad regeneration.`, 409, "edit_too_broad");
    changedByFile.set(path, cumulative);
    next[path] = result.updated;
    changed.push({ path, operation: result.operation, beforeChars: sourceLength(files, path), afterChars: result.updated.length, changedChars: result.changedChars });
  }
  return { files: validateFiles(next), changed };
};

const sourceLength = (files, path) => files[path]?.length || 0;

const inferResponsiveSingleColumnEdit = (files) => {
  const candidates = [];
  for (const [path, source] of Object.entries(files)) {
    if (!path.toLowerCase().endsWith(".css")) continue;
    const rulePattern = /(^|\n)[ \t]*([^@{}][^{}]*)\{([^{}]*)\}/g;
    for (const match of source.matchAll(rulePattern)) {
      const selector = match[2].trim();
      const body = match[3];
      if (!selector) continue;
      const isGrid = /display\s*:\s*grid\s*;/i.test(body) || /grid-template-columns\s*:/i.test(body);
      const isFlex = /display\s*:\s*flex\s*;/i.test(body) || /flex-wrap\s*:/i.test(body);
      if (!isGrid && !isFlex) continue;
      const selectorText = selector.toLowerCase();
      let score = 0;
      if (/\bmenu\b|menu[-_]/i.test(selectorText)) score += 100;
      if (/\bgrid\b/i.test(selectorText)) score += 40;
      if (/\bcard\b|cards|\bitem\b/i.test(selectorText)) score += 30;
      if (/grid-template-columns\s*:/i.test(body)) score += 20;
      if (/display\s*:\s*grid\s*;/i.test(body)) score += 10;
      if (/flex-wrap\s*:/i.test(body)) score += 20;
      if (/display\s*:\s*flex\s*;/i.test(body)) score += 10;
      candidates.push({ path, selector, score, property: isGrid ? "grid-template-columns" : "flex-direction", value: isGrid ? "1fr" : "column" });
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const second = candidates[1];
  if (best.score < 100) return null;
  if (second && second.score === best.score) return null;
  return { edits: [{ operation: "css_media_rule_set", path: best.path, selector: best.selector, property: best.property, value: best.value, maxWidth: "768px" }] };
};

const editProject = async ({ files, instruction }) => {
  const source = Object.entries(files).map(([path, content]) => `--- ${path} ---\n${content}`).join("\n");
  const system = `You are PromptStudio Studio's narrow targeted code editor. Return an object matching the provided JSON schema. Supported operations are exactly:\n1) css_property_set — set one CSS declaration in one unique selector block; use for color, spacing, width, display, grid/flex and similar layout changes.\n2) css_media_rule_set — add or update one small responsive @media (max-width: ...) rule for one existing selector. Use for bounded mobile/tablet CSS changes such as one-column grids. Do not use it for DOM/JSX reordering.\n3) js_insert_after — insert a small snippet immediately after one exact existing anchor.\n4) exact_text_replace — use only for simple text/value changes.\nUse at most 3 operations total. Operations may target the same file. Every anchor/replacement must be unique against the current project state. Do NOT return complete files. Do NOT rewrite unrelated code. Do NOT invent a new operation. For vague requests such as 'make the menu better', return status needs_clarification with one concise question. Never return markdown or prose outside the schema.`;
  const result = await getClient().models.generateContent({
    model: MODEL,
    contents: `${system}\n\nUSER CHANGE:\n${String(instruction || "").slice(0, 2000)}\n\nEXISTING PROJECT:\n${source}`,
    config: structuredJsonConfig(STUDIO_EDIT_SCHEMA)
  });
  return parseJson(result.text);
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
      const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
      if (instruction.length < 2) return send(res, 400, { code: "invalid_instruction", message: "Tell Studio what to change." });
      const mobileSingleColumn = /single[- ]column.*mobile|mobile.*single[- ]column/i.test(instruction);
      if (mobileSingleColumn) {
        const deterministicPlan = inferResponsiveSingleColumnEdit(files);
        if (deterministicPlan) {
          const applied = applyTargetedEditsV2(files, deterministicPlan.edits);
          return send(res, 200, { ...applied, mode: "targeted_edit_v2", instruction, planner: "deterministic_responsive" });
        }
      }
      const plan = await editProject({ files, instruction });
      if (plan?.status === "needs_clarification") return send(res, 409, { code: "needs_clarification", message: String(plan.message || "Please describe one small specific change.") });
      const applied = applyTargetedEditsV2(files, plan?.edits);
      return send(res, 200, { ...applied, mode: "targeted_edit_v2", instruction });
    }
    return send(res, 400, { code: "invalid_action", message: "Studio action must be generate or edit." });
  } catch (error) {
    console.error("Studio API failed", { code: error?.code || "unknown", message: error?.message || "unknown" });
    return send(res, error?.status || 500, { code: error?.code || "studio_failed", message: error?.message || "Studio could not complete that request." });
  }
}
