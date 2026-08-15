import { describe, expect, it } from "vitest";
import { addPurchasedCredits, canSpendCredits, createCreditState, spendCredits } from "./credits.js";

describe("credit accounting", () => {
  it("normalizes invalid balances to zero", () => {
    expect(createCreditState({ credits: -10, creditVersion: -1 })).toEqual({ credits: 0, creditVersion: 0 });
  });

  it("spends the exact operation cost and increments the version", () => {
    expect(spendCredits({ credits: 4, creditVersion: 7 }, "referenceImageAnalysis")).toEqual({
      ok: true,
      reason: "spent",
      credits: 1,
      creditVersion: 8,
      cost: 3,
    });
  });

  it("never allows a negative balance", () => {
    expect(canSpendCredits({ credits: 2 }, "referenceImageAnalysis")).toBe(false);
    expect(spendCredits({ credits: 2 }, "referenceImageAnalysis")).toMatchObject({
      ok: false,
      reason: "insufficient_credits",
      credits: 2,
    });
  });

  it("adds a purchased pack without expiring existing credits", () => {
    expect(addPurchasedCredits({ credits: 7, creditVersion: 2 }, 25)).toEqual({
      credits: 32,
      creditVersion: 3,
    });
  });
});
