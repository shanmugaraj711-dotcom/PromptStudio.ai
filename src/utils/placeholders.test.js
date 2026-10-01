import { describe, expect, it } from "vitest";
import { extractPlaceholders, fillPlaceholders, splitPlaceholders } from "./placeholders";

describe("placeholders", () => {
  const prompt = "Write a post for [business name] in [city]. Mention [business name] twice. See [docs](https://example.com).";

  it("extracts unique placeholders in order and ignores markdown links", () => {
    expect(extractPlaceholders(prompt)).toEqual(["business name", "city"]);
  });

  it("fills every occurrence and leaves unfilled placeholders intact", () => {
    expect(fillPlaceholders(prompt, { "business name": " Chai Corner " })).toBe("Write a post for Chai Corner in [city]. Mention Chai Corner twice. See [docs](https://example.com).");
  });

  it("splits text into renderable segments", () => {
    expect(splitPlaceholders("Hi [name]!")).toEqual([
      { type: "text", value: "Hi " },
      { type: "placeholder", label: "name", raw: "[name]" },
      { type: "text", value: "!" },
    ]);
  });

  it("handles empty and non-string input", () => {
    expect(extractPlaceholders("")).toEqual([]);
    expect(extractPlaceholders(null)).toEqual([]);
    expect(fillPlaceholders("no blanks here", { x: "y" })).toBe("no blanks here");
  });
});
