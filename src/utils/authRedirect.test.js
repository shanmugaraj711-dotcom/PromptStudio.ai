import { describe, expect, it } from "vitest";
import { getReturnPath } from "./authRedirect";

describe("getReturnPath", () => {
  it("keeps the query string and hash of the page the user wanted", () => {
    expect(getReturnPath({ from: { pathname: "/builder", search: "?mode=image", hash: "#top" } })).toBe("/builder?mode=image#top");
  });

  it("falls back when there is no stored destination", () => {
    expect(getReturnPath(undefined)).toBe("/dashboard");
    expect(getReturnPath({}, "/account#plans")).toBe("/account#plans");
  });

  it("never returns to an auth page or an off-site path", () => {
    expect(getReturnPath({ from: { pathname: "/login" } })).toBe("/dashboard");
    expect(getReturnPath({ from: { pathname: "//evil.example" } })).toBe("/dashboard");
    expect(getReturnPath({ from: { pathname: "https://evil.example" } })).toBe("/dashboard");
  });
});
