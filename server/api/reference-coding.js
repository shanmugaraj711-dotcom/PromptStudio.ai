// Reference Coding uses the existing authenticated, quota-aware generation pipeline
// with a coding-optimized Gemini model. The delegated handler still performs
// all auth, rate-limit, quota/credit reservation, reference validation, AI call,
// rollback, and history persistence.
export default async function handler(req, res) {
  const previousPrimary = process.env.GEMINI_MODEL;
  const previousFallback = process.env.GEMINI_FALLBACK_MODEL;
  process.env.GEMINI_MODEL = "gemini-3.7-flash";
  process.env.GEMINI_FALLBACK_MODEL = "gemini-3.6-flash";

  try {
    // Cache-busting keeps this coding-specific import isolated from the normal
    // generation handler's model constants in warm serverless runtimes.
    const module = await import(`./generate-prompt-credits.js?reference-coding=${Date.now()}`);
    return await module.default(req, res);
  } finally {
    if (previousPrimary === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = previousPrimary;
    if (previousFallback === undefined) delete process.env.GEMINI_FALLBACK_MODEL;
    else process.env.GEMINI_FALLBACK_MODEL = previousFallback;
  }
}
