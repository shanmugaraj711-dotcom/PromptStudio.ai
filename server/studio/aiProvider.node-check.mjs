import test from "node:test";
import assert from "node:assert/strict";
import { createAIProvider, listGeminiModels } from "./aiProvider.js";

test("unknown Studio AI provider fails explicitly instead of falling back to Gemini", () => {
  const previous = process.env.STUDIO_AI_PROVIDER;
  process.env.STUDIO_AI_PROVIDER = "not-a-provider";
  try {
    assert.throws(() => createAIProvider(), { code: "ai_provider_unsupported", status: 503 });
  } finally {
    if (previous === undefined) delete process.env.STUDIO_AI_PROVIDER;
    else process.env.STUDIO_AI_PROVIDER = previous;
  }
});

test("provider names remain explicit for supported providers", () => {
  const previous = process.env.STUDIO_AI_PROVIDER;
  process.env.STUDIO_AI_PROVIDER = "gemini";
  try {
    assert.equal(createAIProvider().name, "gemini");
  } finally {
    if (previous === undefined) delete process.env.STUDIO_AI_PROVIDER;
    else process.env.STUDIO_AI_PROVIDER = previous;
  }
});

test("listGeminiModels awaits the models.list() pager before iterating (issue #75)", async () => {
  // @google/genai v2 shape: models.list() returns Promise<Pager>, and the
  // resolved pager — not the promise — is the async iterable.
  const fakeClient = {
    models: {
      list: async () => ({
        [Symbol.asyncIterator]: async function* () {
          yield { name: "models/gemini-2.5-flash", supportedActions: ["generateContent"] };
          yield { name: "models/text-embedding-004", supportedActions: ["embedContent"] };
          yield { supportedActions: [] };
        },
      }),
    },
  };
  const models = await listGeminiModels(fakeClient);
  assert.deepEqual(models, [
    { id: "gemini-2.5-flash", supportedActions: ["generateContent"] },
    { id: "text-embedding-004", supportedActions: ["embedContent"] },
  ]);
});
