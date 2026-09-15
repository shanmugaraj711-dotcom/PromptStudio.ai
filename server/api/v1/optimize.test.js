import { describe, expect, it, vi, beforeEach } from "vitest";

const { generateContent } = vi.hoisted(() => ({
  generateContent: vi.fn()
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class GoogleGenAI {
    constructor() {
      this.models = { generateContent };
    }
  }
}));

vi.mock("../_firebaseAdmin.js", () => ({
  adminDb: vi.fn(() => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        _data: undefined,
        async get() { return { exists: Boolean(this._data), data: () => this._data }; }
      }))
    })),
    async runTransaction(callback) {
      const store = new Map();
      const tx = {
        async get(ref) { return { exists: store.has(ref), data: () => store.get(ref) }; },
        set(ref, value, options = {}) {
          const current = store.get(ref) || {};
          store.set(ref, options.merge ? { ...current, ...value } : value);
        }
      };
      return callback(tx);
    }
  })),
}));

vi.mock("../_publicTelemetry.js", () => ({
  recordVisitorAttempt: vi.fn(),
  recordSuccessfulOptimization: vi.fn(),
  recordPublicError: vi.fn()
}));

const loadHandler = async () => (await import("./optimize.js?test=" + Math.random())).default;

const makeResponse = () => {
  const headers = new Map();
  return {
    statusCode: 200,
    headersSent: false,
    body: "",
    status(code) { this.statusCode = code; return this; },
    setHeader(key, value) { headers.set(key.toLowerCase(), String(value)); },
    end(body = "") { this.body = body; this.headersSent = true; return this; },
    getHeader(key) { return headers.get(key.toLowerCase()); }
  };
};

const makeRequest = (body, ip = "203.0.113.10") => ({
  method: "POST",
  headers: { "content-type": "application/json", "content-length": String(JSON.stringify(body).length), "x-forwarded-for": ip },
  socket: { remoteAddress: ip },
  body
});

describe("POST /api/v1/optimize", () => {
  beforeEach(() => {
    vi.resetModules();
    generateContent.mockReset();
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_MODEL = "test-model";
    process.env.GROQ_API_KEY = "";
    process.env.AI_PROVIDER_ORDER = "gemini";
    generateContent.mockResolvedValue({
      text: JSON.stringify({
        optimized_prompt: "Create a concise launch announcement for a new mobile app, with a clear CTA and three headline options.",
        score: 41
      })
    });
  });

  it("optimizes without Firebase auth and returns the public funnel shape", async () => {
    const handler = await loadHandler();
    const response = makeResponse();
    await handler(makeRequest({ prompt: "make an app launch post", target: "ChatGPT" }), response);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      optimized_prompt: "Create a concise launch announcement for a new mobile app, with a clear CTA and three headline options.",
      score: 41,
      link: "https://promptstudioai.in/"
    });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("rejects requests without JSON content type", async () => {
    const handler = await loadHandler();
    const response = makeResponse();
    const request = makeRequest({ prompt: "hello" });
    request.headers["content-type"] = "text/plain";
    await handler(request, response);
    expect(response.statusCode).toBe(415);
    expect(JSON.parse(response.body).error.code).toBe("unsupported_media_type");
  });

  it("rejects an empty prompt", async () => {
    const handler = await loadHandler();
    const response = makeResponse();
    await handler(makeRequest({ prompt: "" }, "203.0.113.11"), response);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error.code).toBe("invalid_prompt");
    expect(generateContent).not.toHaveBeenCalled();
  });
});
