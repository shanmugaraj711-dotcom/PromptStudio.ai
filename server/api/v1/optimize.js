import { GoogleGenAI } from "@google/genai";

const MAX_PROMPT_LENGTH = 6000;
const MAX_BODY_BYTES = 32_000;
const WINDOW_MS = 60_000;
const IP_LIMIT = 12;
const rateBuckets = new Map();

const sendJson = (res, status, payload, headers = {}) => {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  return res.end(JSON.stringify(payload));
};

const getClientIp = (req) => {
  const forwarded = String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return (forwarded || String(req.socket?.remoteAddress || "unknown")).slice(0, 100);
};

const enforceIpRateLimit = (req) => {
  const now = Date.now();
  for (const [ip, entry] of rateBuckets) {
    if (now - entry.startedAt >= WINDOW_MS) rateBuckets.delete(ip);
  }

  const ip = getClientIp(req);
  const entry = rateBuckets.get(ip);
  if (!entry) {
    rateBuckets.set(ip, { startedAt: now, count: 1 });
    return { remaining: IP_LIMIT - 1 };
  }

  if (entry.count >= IP_LIMIT) {
    const retryAfter = Math.max(1, Math.ceil((WINDOW_MS - (now - entry.startedAt)) / 1000));
    const error = new Error("Too many optimization requests. Please wait a minute and try again.");
    error.status = 429;
    error.code = "rate_limited";
    error.retryAfter = retryAfter;
    throw error;
  }

  entry.count += 1;
  return { remaining: IP_LIMIT - entry.count };
};

const parseBody = (body) => {
  if (!body) return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      const error = new Error("The request body must be valid JSON.");
      error.status = 400;
      error.code = "invalid_request";
      throw error;
    }
  }
  return body;
};

const validate = (body) => {
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (prompt.length < 3) {
    const error = new Error("Provide a prompt with at least 3 characters.");
    error.status = 400;
    error.code = "invalid_prompt";
    throw error;
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    const error = new Error(`Prompt must be ${MAX_PROMPT_LENGTH} characters or fewer.`);
    error.status = 400;
    error.code = "prompt_too_long";
    throw error;
  }

  const target = typeof body.target === "string" && body.target.trim()
    ? body.target.trim().slice(0, 80)
    : "general AI";

  return { prompt, target };
};

const clampScore = (value) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

const generateOptimizedPrompt = async ({ prompt, target }) => {
  if (!process.env.GEMINI_API_KEY) {
    const error = new Error("The optimization service is not configured.");
    error.status = 503;
    error.code = "service_unavailable";
    throw error;
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const systemInstruction = `You are PromptStudio's prompt optimization engine. Improve the user's rough prompt so a target AI can understand and execute it more reliably. Preserve the user's intent. Do not invent business facts, names, prices, claims, requirements, or hidden context. Add useful specificity, structure, constraints, output requirements, and success criteria only when they follow from the request. Remove ambiguity and unnecessary verbosity. The result must be ready to paste into the target AI.

Return JSON only with exactly this shape: {"optimized_prompt":"string","score":0}. The score is the quality of the ORIGINAL prompt before optimization, from 0 to 100. Do not score the optimized prompt. The optimized prompt must not mention PromptStudio or this optimization process. Target AI: ${target}.`;
  const contents = `${systemInstruction}\n\nUSER PROMPT:\n${prompt}`;
  const models = [
    process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
    process.env.GEMINI_FALLBACK_MODEL || "gemini-3.6-flash"
  ];
  let lastError;

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: { responseMimeType: "application/json", maxOutputTokens: 1800 }
      });
      const raw = response.text?.trim();
      if (!raw) throw new Error("The AI service returned an empty response.");
      const parsed = JSON.parse(raw);
      const optimizedPrompt = typeof parsed.optimized_prompt === "string" ? parsed.optimized_prompt.trim() : "";
      if (!optimizedPrompt) throw new Error("The AI service returned an incomplete response.");
      return { optimizedPrompt, score: clampScore(parsed.score) };
    } catch (error) {
      lastError = error;
      const status = Number(error?.status || error?.statusCode || 0);
      const message = String(error?.message || "").toLowerCase();
      const transient = [408, 429, 500, 502, 503, 504].includes(status) || /high demand|temporar|unavailable|overload|timeout|aborted|deadline/.test(message);
      if (!transient || model === models[models.length - 1]) break;
    }
  }

  const error = new Error("The AI service could not optimize the prompt right now.");
  error.status = 502;
  error.code = "generation_failed";
  error.cause = lastError;
  throw error;
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Request-ID");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return sendJson(res, 405, { error: { code: "method_not_allowed", message: "Use POST to optimize a prompt." } });

  try {
    const contentType = String(req.headers?.["content-type"] || "").toLowerCase();
    if (!contentType.includes("application/json")) return sendJson(res, 415, { error: { code: "unsupported_media_type", message: "Content-Type must be application/json." } });

    const length = Number(req.headers?.["content-length"] || 0);
    if (Number.isFinite(length) && length > MAX_BODY_BYTES) return sendJson(res, 413, { error: { code: "payload_too_large", message: "Request payload is too large." } });

    const rate = enforceIpRateLimit(req);
    const { prompt, target } = validate(parseBody(req.body));
    const result = await generateOptimizedPrompt({ prompt, target });

    return sendJson(res, 200, {
      optimized_prompt: result.optimizedPrompt,
      score: result.score,
      link: "https://promptstudioai.in/"
    }, {
      "X-RateLimit-Limit": String(IP_LIMIT),
      "X-RateLimit-Remaining": String(rate.remaining)
    });
  } catch (error) {
    if (error.retryAfter) res.setHeader("Retry-After", String(error.retryAfter));
    return sendJson(res, Number(error.status) || 500, {
      error: {
        code: error.code || "optimization_failed",
        message: error.message || "Unable to optimize the prompt right now."
      }
    });
  }
}
