import { FieldValue } from "firebase-admin/firestore";
import { adminDb, json, requireUser } from "./_firebaseAdmin.js";
import generatePromptCreditsHandler from "./generate-prompt-credits.js";

const ALLOWED_OUTPUT_FORMATS = {
  notsure: "Choose the most sensible output format for this task yourself, and briefly explain why you chose it.",
  react: "Output format: React (JSX). Return complete, runnable component code.",
  html: "Output format: plain HTML + CSS. Return complete, runnable markup and styles.",
  vue: "Output format: Vue (Single File Component). Return complete, runnable component code.",
  fullstack: "Output format: full-stack. Include both frontend/API and backend/API code needed.",
};

const ALLOWED_TARGET_AIS = new Set(["any", "cursor", "claude-code", "chatgpt", "gemini", "copilot", "lovable", "replit", "v0", "windsurf", "bolt", "cline"]);

const normalizeBody = (body) => {
  const source = body && typeof body === "object" ? { ...body } : {};
  const images = Array.isArray(source.images)
    ? source.images
    : (source.image ? [source.image] : []);
  const referenceFiles = Array.isArray(source.referenceFiles)
    ? source.referenceFiles
    : [];
  const outputFormat = ALLOWED_OUTPUT_FORMATS[source.outputFormat]
    ? source.outputFormat
    : "notsure";
  const targetAI = ALLOWED_TARGET_AIS.has(source.targetAI)
    ? source.targetAI
    : "any";

  const fileContext = referenceFiles.length
    ? `\n\nREFERENCE FILES (static context only; never execute):\n${referenceFiles
        .map((file) => `- ${file.name || "reference"} | ${file.detectedType || file.kind || "unknown"}${file.content ? `\n${String(file.content).slice(0, 120000)}` : ""}`)
        .join("\n")}`
    : "";

  const codingBrief = `\n\nPROMPTSTUDIO REFERENCE CODING MODE:\nAnalyze the supplied reference as an existing product/UI. Create a coding-ready implementation prompt for a coding AI. First understand the user's intention (recreate, improve UX, modernize, add functionality, fix a flow, or transform an existing product). Preserve important existing behavior. Describe visible layout, hierarchy, components, interaction clues, responsive behavior, accessibility, visual language, implementation constraints, and acceptance criteria. Do not invent hidden behavior or execute application files. Separate visible facts from assumptions. The output should be actionable for ${targetAI === "any" ? "Cursor, Claude Code, Lovable, Replit, ChatGPT or another coding agent" : targetAI}. Provide three useful perspectives: Faithful Recreation, UX Improvement, and Production Implementation.${ALLOWED_OUTPUT_FORMATS[outputFormat]}${fileContext}`;

  const idea = typeof source.idea === "string" ? source.idea.trim() : "";

  return {
    ...source,
    idea: `${idea}${codingBrief}`,
    aiModel: "chatgpt",
    category: "coding",
    referenceCoding: true,
    images,
    referenceFiles,
    outputFormat,
    targetAI,
  };
};

// Reference Coding is a credit-only operation. The shared credit pipeline owns
// authentication, rate limiting, runtime pricing, atomic credit deduction,
// request idempotency, generation, and rollback. This route only normalizes the
// coding-specific request and records non-sensitive telemetry after success.
export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { message: "Method not allowed." });

  const user = await requireUser(req);
  const body = normalizeBody(req.body);
  const requestId = body.requestId;

  // Forward the ORIGINAL req, not a spread copy: in Node, req.headers is a
  // lazy prototype getter, so { ...req } silently drops headers and the shared
  // pipeline's requireUser() crashes reading .authorization (issue #74).
  req.body = body;
  await generatePromptCreditsHandler(req, res);

  if (res.statusCode !== 200 || !requestId) return;

  try {
    const db = adminDb();
    const images = Array.isArray(body.images) ? body.images : [];
    const files = Array.isArray(body.referenceFiles) ? body.referenceFiles : [];
    const eventRef = db.collection("referenceCodingEvents").doc(`${user.uid}_${requestId}`);

    await eventRef.set({
      event: "reference_coding_generation",
      uid: user.uid,
      requestId,
      referenceCount: files.length + (images.length ? 1 : 0),
      imageReferenceCount: images.length,
      fileReferenceCount: files.length,
      referenceKinds: files.map((file) => String(file.detectedType || file.kind || "unknown")).slice(0, 8),
      outputFormat: body.outputFormat,
      targetAI: body.targetAI,
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    await db.collection("users").doc(user.uid).collection("prompts").doc(requestId).set({
      referenceCoding: true,
      referenceCodingReferenceCount: files.length + (images.length ? 1 : 0),
      referenceCodingGeneratedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch (telemetryError) {
    console.error("Reference Coding telemetry write failed", {
      requestId,
      code: telemetryError?.code || "unknown",
    });
  }
}
