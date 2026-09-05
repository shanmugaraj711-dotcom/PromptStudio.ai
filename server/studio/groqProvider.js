const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_GROQ_MODEL = "moonshotai/kimi-k2-instruct";

const getGroqApiKey = () => {
  if (!process.env.GROQ_API_KEY) {
    const error = new Error("Groq AI is not configured yet.");
    error.status = 503;
    error.code = "server_configuration_error";
    throw error;
  }
  return process.env.GROQ_API_KEY;
};

const toMessages = (contents) => [{
  role: "user",
  content: typeof contents === "string" ? contents : JSON.stringify(contents),
}];

const createGroqResponse = (payload, model) => ({
  text: payload?.choices?.[0]?.message?.content || "",
  usageMetadata: {
    promptTokenCount: Number(payload?.usage?.prompt_tokens || 0),
    candidatesTokenCount: Number(payload?.usage?.completion_tokens || 0),
    totalTokenCount: Number(payload?.usage?.total_tokens || 0),
  },
  provider: "groq",
  model,
  raw: payload,
});

export const createGroqProvider = () => ({
  name: "groq",
  async generateStructuredSpec({ model, contents, config = {} }) {
    const activeModel = model || process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL;
    const controller = new AbortController();
    const abortSignal = config.abortSignal;
    const abortForwarder = () => controller.abort(abortSignal?.reason);
    if (abortSignal) {
      if (abortSignal.aborted) controller.abort(abortSignal.reason);
      else abortSignal.addEventListener("abort", abortForwarder, { once: true });
    }

    try {
      const responseFormat = config.responseJsonSchema
        ? {
            type: "json_schema",
            json_schema: {
              name: "studio_spec",
              strict: true,
              schema: config.responseJsonSchema,
            },
          }
        : { type: "json_object" };

      const response = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getGroqApiKey()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: activeModel,
          messages: toMessages(contents),
          response_format: responseFormat,
          temperature: 0,
          max_tokens: config.maxOutputTokens,
          signal: controller.signal,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(payload?.error?.message || `Groq request failed with status ${response.status}.`);
        error.status = response.status;
        error.code = payload?.error?.code || "groq_request_failed";
        throw error;
      }
      return createGroqResponse(payload, activeModel);
    } finally {
      if (abortSignal) abortSignal.removeEventListener("abort", abortForwarder);
    }
  },
});
