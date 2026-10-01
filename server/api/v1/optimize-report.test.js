import { describe, expect, it, vi } from "vitest";

vi.mock("../_firebaseAdmin.js", () => ({ adminDb: vi.fn() }));
vi.mock("../_publicTelemetry.js", () => ({ recordVisitorAttempt: vi.fn(), recordSuccessfulOptimization: vi.fn(), recordPublicError: vi.fn() }));

const { parseModelResult } = await import("./optimize.js");

describe("Prompt Doctor report parsing", () => {
  it("derives the original score from the breakdown and keeps the improvements", () => {
    const result = parseModelResult(JSON.stringify({
      optimized_prompt: "Write three Instagram captions for [restaurant name]...",
      score: 99,
      optimized_score: 90,
      breakdown: { goal: 10, context: 4, specificity: 6, format: 2, constraints: 3 },
      improvements: ["Defined the audience", "  Asked for three caption options  ", "", 42],
    }));

    expect(result.score).toBe(25);
    expect(result.optimizedScore).toBe(90);
    expect(result.breakdown).toEqual({ goal: 10, context: 4, specificity: 6, format: 2, constraints: 3 });
    expect(result.improvements).toEqual(["Defined the audience", "Asked for three caption options"]);
  });

  it("clamps dimensions to 0-20 and never reports the optimized score below the original", () => {
    const result = parseModelResult(JSON.stringify({
      optimized_prompt: "Better prompt",
      optimized_score: 10,
      breakdown: { goal: 35, context: -4, specificity: 12.6, format: 20, constraints: 0 },
    }));

    expect(result.breakdown).toEqual({ goal: 20, context: 0, specificity: 13, format: 20, constraints: 0 });
    expect(result.score).toBe(53);
    expect(result.optimizedScore).toBe(53);
  });

  it("falls back to the legacy shape when the breakdown is missing or incomplete", () => {
    const result = parseModelResult(JSON.stringify({
      optimized_prompt: "Better prompt",
      score: 41,
      breakdown: { goal: 10, context: 5 },
    }));

    expect(result).toEqual({ optimizedPrompt: "Better prompt", score: 41, optimizedScore: null, breakdown: null, improvements: [] });
  });

  it("caps improvements at five", () => {
    const result = parseModelResult(JSON.stringify({ optimized_prompt: "x".repeat(10), improvements: ["a", "b", "c", "d", "e", "f", "g"] }));
    expect(result.improvements).toHaveLength(5);
  });

  it("rejects an empty optimized prompt", () => {
    expect(() => parseModelResult(JSON.stringify({ optimized_prompt: "   ", score: 10 }))).toThrow(/incomplete/);
  });
});
