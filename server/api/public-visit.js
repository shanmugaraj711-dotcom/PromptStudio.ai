import { recordVisitorAttempt } from "./_publicTelemetry.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });

  const forwarded = String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  const ip = (forwarded || String(req.socket?.remoteAddress || "unknown")).slice(0, 100);
  await recordVisitorAttempt({ ip });
  return res.status(204).end();
}
