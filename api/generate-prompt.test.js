// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getUtcDateKey } from "../src/constants/quota";

const mocks = vi.hoisted(() => ({
  cert: vi.fn(),
  getApps: vi.fn(),
  getAuth: vi.fn(),
  getFirestore: vi.fn(),
  initializeApp: vi.fn(),
  serverTimestamp: vi.fn(() => "server-timestamp"),
  generateContent: vi.fn(),
  verifyIdToken: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn(function GoogleGenAI() {
    return { models: { generateContent: mocks.generateContent } };
  }),
}));

vi.mock("firebase-admin/app", () => ({ cert: mocks.cert, getApps: mocks.getApps, initializeApp: mocks.initializeApp }));
vi.mock("firebase-admin/auth", () => ({ getAuth: mocks.getAuth }));
vi.mock("firebase-admin/firestore", () => ({ FieldValue: { serverTimestamp: mocks.serverTimestamp }, getFirestore: mocks.getFirestore }));

import handler from "./generate-prompt";

const makeRef = (path) => ({
  path,
  id: path.split("/").at(-1),
  collection: (name) => makeRef(`${path}/${name}`),
  doc: (id) => makeRef(`${path}/${id}`),
});

const makeDatabase = (initialDocuments = {}) => {
  const documents = new Map(Object.entries(initialDocuments));
  const getSnapshot = (reference) => ({ exists: documents.has(reference.path), data: () => documents.get(reference.path) });
  const db = {
    collection: (name) => makeRef(name),
    runTransaction: async (work) => work({
      get: async (reference) => getSnapshot(reference),
      set: (reference, data, options = {}) => {
        const existing = documents.get(reference.path) || {};
        documents.set(reference.path, options.merge ? { ...existing, ...data } : data);
      },
      update: (reference, data) => documents.set(reference.path, { ...documents.get(reference.path), ...data }),
    }),
  };
  return { db, documents };
};

const makeResponse = () => ({
  body: null,
  setHeader: vi.fn(),
  status: vi.fn(function setStatus(status) { this.statusCode = status; return this; }),
  json: vi.fn(function setJson(payload) { this.body = payload; return this; }),
});

const makeRequest = (requestId = "request-001", extra = {}) => ({
  method: "POST",
  headers: { authorization: "Bearer valid-token" },
  body: {
    idea: "Create a useful product launch message",
    aiModel: "chatgpt",
    category: "marketing",
    requestId,
    ...extra,
  },
});

const intelligenceResponse = (prompt = "A durable server prompt") => ({
  text: JSON.stringify({
    prompt,
    perspectives: [
      { id: "faithful", label: "Faithful", prompt: `${prompt} — preserve the source faithfully.` },
      { id: "professional", label: "Professional", prompt: `${prompt} — optimize for polished production quality.` },
      { id: "creative", label: "Creative", prompt: `${prompt} — add controlled creative improvements.` },
    ],
    intent: "Create a useful product launch message.",
    outputType: "marketing",
    assumptions: [],
    missing: [],
    recommendations: [],
  }),
});

describe("POST /api/generate-prompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = "test-key";
    mocks.getApps.mockReturnValue([{}]);
    mocks.getAuth.mockReturnValue({ verifyIdToken: mocks.verifyIdToken });
    mocks.verifyIdToken.mockResolvedValue({ uid: "user-1" });
  });

  afterEach(() => delete process.env.GEMINI_API_KEY);

  it("rolls back only its reservation when Gemini fails", async () => {
    const today = getUtcDateKey();
    const { db, documents } = makeDatabase({ "users/user-1": { plan: "free", promptsToday: 0, lastPromptDate: today, quotaVersion: 0 } });
    mocks.getFirestore.mockReturnValue(db);
    mocks.generateContent.mockRejectedValue(new Error("Gemini unavailable"));
    const response = makeResponse();

    await handler(makeRequest(), response);

    expect(response.statusCode).toBe(502);
    expect(response.body).toMatchObject({ code: "generation_failed", quota: { promptsToday: 0, remaining: 3 } });
    expect(documents.get("users/user-1")).toMatchObject({ promptsToday: 0, quotaVersion: 2 });
    expect(documents.get("users/user-1/generationRequests/request-001")).toMatchObject({ status: "rolled_back" });
    expect([...documents.keys()].filter((path) => path.includes("/prompts/")).length).toBe(0);
  });

  it("writes one history record and does not decrement quota twice for a repeated request", async () => {
    const { db, documents } = makeDatabase({ "users/user-1": { plan: "free", promptsToday: 0, lastPromptDate: getUtcDateKey(), quotaVersion: 0 } });
    mocks.getFirestore.mockReturnValue(db);
    mocks.generateContent.mockResolvedValue(intelligenceResponse());

    const firstResponse = makeResponse();
    await handler(makeRequest("request-002"), firstResponse);
    const repeatedResponse = makeResponse();
    await handler(makeRequest("request-002"), repeatedResponse);

    expect(firstResponse.statusCode).toBe(200);
    expect(repeatedResponse.statusCode).toBe(200);
    expect(mocks.generateContent).toHaveBeenCalledTimes(1);
    expect(documents.get("users/user-1")).toMatchObject({ promptsToday: 1, quotaVersion: 1 });
    expect(documents.get("users/user-1/prompts/request-002")).toMatchObject({
      prompt: "A durable server prompt",
      aiModel: "chatgpt",
      category: "marketing",
      hasReferenceImage: false,
    });
  });

  it("passes a reference image to Gemini vision and records image metadata without storing the image", async () => {
    const { db, documents } = makeDatabase({ "users/user-1": { plan: "free", promptsToday: 0, lastPromptDate: getUtcDateKey(), quotaVersion: 0 } });
    mocks.getFirestore.mockReturnValue(db);
    mocks.generateContent.mockResolvedValue(intelligenceResponse("A reference-aware image prompt"));

    const response = makeResponse();
    await handler(makeRequest("request-image-1", {
      idea: "Turn this reference into a polished product image",
      category: "image",
      image: { mimeType: "image/jpeg", data: "ZmFrZS1pbWFnZS1kYXRh", name: "reference.jpg" },
    }), response);

    expect(response.statusCode).toBe(200);
    const contents = mocks.generateContent.mock.calls[0][0].contents;
    expect(contents).toEqual(expect.arrayContaining([
      expect.objectContaining({ inlineData: { mimeType: "image/jpeg", data: "ZmFrZS1pbWFnZS1kYXRh" } }),
    ]));
    expect(documents.get("users/user-1/prompts/request-image-1")).toMatchObject({
      hasReferenceImage: true,
      referenceImageName: "reference.jpg",
    });
    expect(JSON.stringify(documents.get("users/user-1/prompts/request-image-1"))).not.toContain("ZmFrZS1pbWFnZS1kYXRh");
  });
});
