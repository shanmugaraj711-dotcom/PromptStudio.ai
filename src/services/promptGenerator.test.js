import { describe, it, expect, vi } from "vitest";
import { generatePrompt } from "./promptGenerator";

const okPayload = { prompt: "P", perspectives: ["a", "b", "c"], quota: { remaining: 2 } };
const baseArgs = { idea: "x", aiModel: "chatgpt", category: "writing", idToken: "token", requestId: "r1" };

describe("generatePrompt", () => {
  it("returns the payload on success", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => okPayload }));
    const result = await generatePrompt({ ...baseArgs, fetchImpl });
    expect(result).toEqual(okPayload);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("maps server errors with their code", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, json: async () => ({ message: "Nope", code: "generation_failed" }) }));
    await expect(generatePrompt({ ...baseArgs, fetchImpl })).rejects.toMatchObject({ name: "PromptGenerationError", code: "generation_failed" });
  });

  it("times out with History guidance instead of hanging forever (issue #76)", async () => {
    // Mimics real fetch: the promise only settles when the abort signal fires.
    const fetchImpl = vi.fn((_url, opts) => new Promise((_resolve, reject) => {
      opts.signal.addEventListener("abort", () => {
        const error = new Error("The operation was aborted");
        error.name = "AbortError";
        reject(error);
      });
    }));
    await expect(generatePrompt({ ...baseArgs, fetchImpl, timeoutMs: 10 })).rejects.toMatchObject({ name: "PromptGenerationError", code: "timeout" });
  });

  it("still maps plain network failures to network_error", async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    await expect(generatePrompt({ ...baseArgs, fetchImpl })).rejects.toMatchObject({ name: "PromptGenerationError", code: "network_error" });
  });
});
