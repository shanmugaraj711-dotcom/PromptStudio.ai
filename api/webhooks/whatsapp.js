import crypto from "node:crypto";

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.end(JSON.stringify(payload));
}

function getVerifyToken() {
  return process.env.WHATSAPP_VERIFY_TOKEN || "";
}

function timingSafeEqualText(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function getRawBody(req) {
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody;
  if (typeof req.rawBody === "string") return Buffer.from(req.rawBody);
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body);
  return Buffer.from(JSON.stringify(req.body ?? {}));
}

function verifySignature(req, rawBody) {
  const appSecret = process.env.WHATSAPP_APP_SECRET || "";
  const signature = req.headers["x-hub-signature-256"] || "";

  if (!appSecret || !signature.startsWith("sha256=")) return false;

  const expected = `sha256=${crypto
    .createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex")}`;

  return timingSafeEqualText(signature, expected);
}

export default async function handler(req, res) {
  res.setHeader("X-PromptStudio-Webhook", "whatsapp");

  if (req.method === "GET") {
    const mode = req.query?.["hub.mode"];
    const token = req.query?.["hub.verify_token"];
    const challenge = req.query?.["hub.challenge"];

    if (mode === "subscribe" && token && timingSafeEqualText(token, getVerifyToken())) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.end(String(challenge || ""));
    }

    return sendJson(res, 403, { error: "webhook_verification_failed" });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return sendJson(res, 405, { error: "method_not_allowed" });
  }

  if (!process.env.WHATSAPP_VERIFY_TOKEN || !process.env.WHATSAPP_APP_SECRET) {
    return sendJson(res, 503, { error: "whatsapp_not_configured" });
  }

  const rawBody = getRawBody(req);
  if (!verifySignature(req, rawBody)) {
    return sendJson(res, 401, { error: "invalid_webhook_signature" });
  }

  let payload;
  try {
    payload = typeof req.body === "object" && req.body !== null
      ? req.body
      : JSON.parse(rawBody.toString("utf8"));
  } catch {
    return sendJson(res, 400, { error: "invalid_json" });
  }

  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  const eventCount = entries.reduce((count, entry) => {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    return count + changes.length;
  }, 0);

  console.info("PromptStudio WhatsApp webhook received", {
    object: payload.object || null,
    eventCount,
  });

  return sendJson(res, 200, { received: true });
}
