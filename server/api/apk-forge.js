import crypto from "node:crypto";
import { adminDb, requireUser } from "./_firebaseAdmin.js";
import { getRuntimeProductConfig } from "./_productConfig.js";

const MAX_DESCRIPTION = 12000;
const MAX_REFERENCE_FILES = 8;
const MAX_REFERENCE_TEXT = 120000;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_WEBSITE_URL = 2048;
const EXECUTABLE_EXTENSIONS = new Set([".exe", ".dll", ".msi", ".com", ".scr", ".bin"]);

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
  return { mode: "apk-forge", platform: "android", outputFormat: outputFormat || "build-ready-android-brief", websiteUrl: websiteUrl || null, intent: description, evidence: safeReferences, warnings: executableReferences.length ? ["One or more references appear to be executable/binary content. They were classified as reference evidence only and must never be executed."] : [], implementation: { appArchitecture: "Choose a maintainable Android architecture appropriate to the requirements; prefer Kotlin and Jetpack Compose unless evidence requires otherwise.", screens: "Derive screens and navigation from screenshots, documentation and the customer's stated intent.", behavior: "Preserve only behavior supported by evidence. Mark inferred behavior as an assumption.", accessibility: "Include semantics, touch targets, contrast, dynamic text and screen-reader support.", responsive: "Support common Android phone sizes and orientations where relevant.", acceptance: "Define testable acceptance criteria for every major screen and flow." }, handoff: "This response is a build specification/handoff. Android compilation must occur in an isolated build runner, never inside the production serverless runtime." };
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
