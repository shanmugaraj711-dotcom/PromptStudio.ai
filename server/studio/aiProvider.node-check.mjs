import test from "node:test";
import assert from "node:assert/strict";
import { createAIProvider } from "./aiProvider.js";

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
