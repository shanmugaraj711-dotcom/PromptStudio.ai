import crypto from "node:crypto";
import { adminDb, requireUser } from "./_firebaseAdmin.js";
import { getRuntimeProductConfig } from "./_productConfig.js";

const MAX_DESCRIPTION = 12000;
const MAX_REFERENCE_FILES = 8;
const MAX_REFERENCE_TEXT = 120000;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_WEBSITE_URL = 2048;
const EXECUTABLE_EXTENSIONS = new Set([".exe", ".dll", ".msi", ".com", ".scr", ".bin"]);

const APP_FORGE_SYSTEM_INSTRUCTION = `You are PromptStudio App Forge, a precision-first application generation engine. Your job is to turn a customer's natural-language request and supplied evidence into the exact application they intended, not a generic template.

SOURCE OF TRUTH: Treat the customer's explicit requirements and supplied references as authoritative. Extract the user's actual goal, target users, required workflows, screens, data, integrations, constraints, visual references, platform requirements, and acceptance criteria. Never replace a specific requirement with a generic template merely because a template is easier.

INTENT PRESERVATION: Preserve named entities, business rules, quantities, roles, permissions, states, terminology, navigation, and important visual details. If the customer says “limited users”, “only one section”, “utmost careful monitoring”, or any other constraint, encode that constraint explicitly and test it. Do not silently broaden scope.

EVIDENCE DISCIPLINE: Separate facts supported by the request/reference from reasonable implementation assumptions. Never invent hidden functionality, APIs, content, credentials, user data, or integrations. When something is unspecified but required to make the app runnable, choose the smallest sensible default and record it as an assumption.

NO GENERIC OUTPUT: Do not produce placeholder screens, lorem ipsum, fake buttons, dead-end navigation, simulated backend success, or unrelated stock features. Every visible control must have a defined behavior or be omitted. Every major workflow must have a complete success, empty, loading, validation, permission, and failure state where applicable.

BUILD PRECISION: Select architecture and implementation details based on the actual requirements. Prefer Kotlin + Jetpack Compose for Android unless evidence requires another approach. Keep modules and dependencies minimal. Preserve existing behavior when adapting an existing product. Avoid unnecessary rewrites.

QUALITY GATE: Before considering the specification complete, perform a requirement-to-screen trace, workflow/state trace, data/integration trace, accessibility check, responsive/device check, security/privacy check, and acceptance-criteria check. Flag contradictions instead of hiding them. The final build must be testable against explicit acceptance criteria.

DELIVERY CONTRACT: Return a structured build specification that a real isolated build worker can execute. Include: customer intent, exact requirements, user roles, screens/navigation, workflows, data model, integrations, permissions, visual rules, non-functional requirements, assumptions, unsupported/unknown items, acceptance criteria, and verification plan. Do not claim that an APK exists until a real build and verification runner has produced and inspected it.`;

const normalizeName = (value) => String(value || "reference").trim().slice(0, 180) || "reference";
const extensionOf = (name) => { const value = normalizeName(name).toLowerCase(); const index = value.lastIndexOf("."); return index >= 0 ? value.slice(index) : ""; };
const looksExecutable = (file) => {
  const name = normalizeName(file?.name);
  const extension = extensionOf(name);
  const mime = String(file?.mimeType || file?.type || "").toLowerCase();
  const declaredKind = String(file?.detectedType || file?.kind || "").toLowerCase();
  const signature = String(file?.signature || "").toUpperCase();
  return EXECUTABLE_EXTENSIONS.has(extension) || mime.includes("application/x-msdownload") || mime.includes("application/vnd.microsoft.portable-executable") || declaredKind.includes("executable") || declaredKind.includes("binary") || signature === "MZ" || signature.startsWith("PE");
};
const sanitizeReference = (file) => {
  const size = Number(file?.size || file?.bytes || 0);
  const executable = looksExecutable(file);
  return { name: normalizeName(file?.name), size: Number.isFinite(size) && size >= 0 ? size : null, mimeType: String(file?.mimeType || file?.type || "unknown").slice(0, 160), detectedType: executable ? "executable_or_binary" : String(file?.detectedType || file?.kind || "unknown").slice(0, 80), executable, contentAccepted: !executable && typeof file?.content === "string" && file.content.length <= MAX_REFERENCE_TEXT };
};
const validateWebsiteUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.length > MAX_WEBSITE_URL) throw Object.assign(new Error("Website URL is too long."), { status: 400, code: "website_url_too_long" });
  let url;
  try { url = new URL(raw); } catch { throw Object.assign(new Error("Website URL must be a valid HTTPS URL."), { status: 400, code: "invalid_website_url" }); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) throw Object.assign(new Error("Website URL must be HTTPS and contain only an origin."), { status: 400, code: "invalid_website_url" });
  return url.origin;
};
const buildBrief = ({ description, references, outputFormat, websiteUrl }) => {
  const executableReferences = references.filter((item) => item.executable);
  const safeReferences = references.map((item) => `- ${item.name} | ${item.detectedType} | ${item.size ?? "unknown"} bytes | executable/binary=${item.executable}`).join("\n");
  return { mode: "apk-forge", platform: "android", outputFormat: outputFormat || "build-ready-android-brief", websiteUrl: websiteUrl || null, systemInstruction: APP_FORGE_SYSTEM_INSTRUCTION, intent: description, evidence: safeReferences, warnings: executableReferences.length ? ["One or more references appear to be executable/binary content. They were classified as reference evidence only and must never be executed."] : [], implementation: { appArchitecture: "Choose a maintainable Android architecture appropriate to the requirements; prefer Kotlin and Jetpack Compose unless evidence requires otherwise.", screens: "Derive screens and navigation from the customer's stated intent and supplied evidence; do not add unrelated template screens.", behavior: "Implement every explicitly requested behavior. Preserve only behavior supported by evidence and mark inferred behavior as an assumption.", dataModel: "Derive only the entities and fields required by the requested workflows; never invent production data.", integrations: "Implement only requested or explicitly required integrations; otherwise mark them as pending/unsupported.", permissions: "Request the minimum Android permissions required by the actual feature set.", accessibility: "Include semantics, touch targets, contrast, dynamic text and screen-reader support.", responsive: "Support common Android phone sizes and orientations where relevant.", acceptance: "Define testable acceptance criteria for every major screen, state and workflow.", verification: "Build, install, exercise the critical flows, verify failure states, and inspect the final APK before marking READY." }, handoff: "This response is a build specification/handoff. Android compilation must occur in an isolated build runner, never inside the production serverless runtime." };
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ code: "method_not_allowed", message: "APK Forge accepts POST requests only." });
  try {
    const user = await requireUser(req);
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const description = String(body.description || body.idea || "").trim();
    const platform = String(body.platform || "android").toLowerCase();
    const outputFormat = String(body.outputFormat || "build-ready-android-brief").slice(0, 80);
    const websiteUrl = validateWebsiteUrl(body.websiteUrl || body.url);
    const referencesInput = Array.isArray(body.references) ? body.references : [];
    if (!description) return res.status(400).json({ code: "description_required", message: "Tell Forge what the app should do and what you want built." });
    if (description.length > MAX_DESCRIPTION) return res.status(413).json({ code: "description_too_large", message: `Description must be ${MAX_DESCRIPTION} characters or less.` });
    if (platform !== "android") return res.status(400).json({ code: "unsupported_platform", message: "APK Forge currently targets Android APK builds." });
    if (referencesInput.length > MAX_REFERENCE_FILES) return res.status(413).json({ code: "too_many_references", message: `Forge accepts at most ${MAX_REFERENCE_FILES} references.` });
    const sanitized = referencesInput.map(sanitizeReference);
    const oversized = sanitized.find((file) => file.size !== null && file.size > MAX_FILE_BYTES);
    if (oversized) return res.status(413).json({ code: "reference_too_large", message: `${oversized.name} exceeds the 25 MB Forge reference limit.` });
    const brief = buildBrief({ description, references: sanitized, outputFormat, websiteUrl });
    const config = await getRuntimeProductConfig(adminDb());
    const pricing = config.pricing.apkForge || {};
    if (pricing.enabled !== true) return res.status(503).json({ code: "apk_forge_disabled", message: "APK Forge is temporarily unavailable." });
    const forgeRequestId = crypto.randomUUID().replace(/-/g, "");
    const createdAt = new Date();
    await adminDb().collection("apkForgeRequests").doc(forgeRequestId).create({ forgeRequestId, uid: user.uid, status: "PAYMENT_REQUIRED", description, websiteUrl, platform: "android", outputFormat, referenceCount: sanitized.length, safeReferenceMetadata: sanitized, forge: brief, pricingVersion: "PRODUCT_CONFIG.pricing.apkForge", amountInr: Number(pricing.buildPriceInr), currency: String(pricing.currency || "INR").toUpperCase(), createdAt, updatedAt: createdAt });
    return res.status(200).json({ ok: true, forgeRequestId, status: "PAYMENT_REQUIRED", amountInr: Number(pricing.buildPriceInr), currency: String(pricing.currency || "INR").toUpperCase(), forge: brief, referenceCount: sanitized.length, safeReferenceMetadata: sanitized });
  } catch (error) {
    console.error("APK Forge request creation failed", { code: error?.code || "unknown", status: error?.status });
    return res.status(error.status || 500).json({ code: error.code || "apk_forge_request_failed", message: error.message || "Could not create Forge request." });
  }
}
