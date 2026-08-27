import crypto from "node:crypto";

const MAX_BODY_BYTES = 2_000_000;

export function requestId(req) {
  const incoming = String(req.headers?.["x-request-id"] || "").trim();
  if (incoming && /^[A-Za-z0-9._:-]{1,120}$/.test(incoming)) return incoming;
  return crypto.randomUUID();
}

export function setIntegrationHeaders(res, id) {
  res.setHeader("X-Request-ID", id);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

export function integrationError(res, status, code, message, id) {
  return res.status(status).json({ error: { code, message, requestId: id } });
}

export function requireJson(req, res, id) {
  const contentType = String(req.headers?.["content-type"] || "").toLowerCase();
  if (req.method !== "GET" && !contentType.includes("application/json")) {
    integrationError(res, 415, "unsupported_media_type", "Content-Type must be application/json.", id);
    return false;
  }
  const length = Number(req.headers?.["content-length"] || 0);
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    integrationError(res, 413, "payload_too_large", "Request payload is too large.", id);
    return false;
  }
  return true;
}
