import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ copyToClipboard: vi.fn(async () => true) }));
vi.mock("../../utils/copyToClipboard", () => ({ copyToClipboard: mocks.copyToClipboard }));

import PromptDoctor from "./PromptDoctor";

const report = (score) => ({
  optimized_prompt: "Write a launch post for [app name] aimed at [audience].",
  score,
  optimized_score: 90,
  breakdown: { goal: score / 5, context: score / 5, specificity: score / 5, format: score / 5, constraints: score / 5 },
  improvements: ["Named the audience", "Set a clear goal"],
});
const respond = (body, status = 200, remaining = "1") => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "X-RateLimit-Remaining": remaining } });
const renderDoctor = () => render(<MemoryRouter><PromptDoctor /></MemoryRouter>);

describe("PromptDoctor", () => {
  beforeEach(() => { localStorage.clear(); mocks.copyToClipboard.mockClear(); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("scores a prompt, fills the blanks and copies the finished prompt", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(report(20))));
    const user = userEvent.setup();
    renderDoctor();

    await user.type(screen.getByLabelText(/paste your prompt/i), "write a launch post");
    await user.click(screen.getByRole("button", { name: /score & fix my prompt/i }));

    expect(await screen.findByText("What the doctor fixed")).toBeInTheDocument();
    expect(screen.getByText("1 free check left today", { exact: false })).toBeInTheDocument();
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ prompt: "write a launch post", target: "ChatGPT" });

    await user.type(screen.getByLabelText("app name"), "Chai Finder");
    expect(screen.getByText("1/2 done", { exact: false })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /copy prompt/i }));
    expect(mocks.copyToClipboard).toHaveBeenCalledWith("Write a launch post for Chai Finder aimed at [audience].");

    const builderLink = screen.getByRole("link", { name: /open in prompt builder/i });
    expect(decodeURIComponent(builderLink.getAttribute("href"))).toBe("/builder?mode=standard&idea=Write a launch post for Chai Finder aimed at [audience].");
  });

  it("remembers recent checks and celebrates a new personal best", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(respond(20)).mockResolvedValueOnce(respond(report(20))).mockResolvedValueOnce(respond(report(60))));
    const user = userEvent.setup();
    renderDoctor();
    const textarea = screen.getByLabelText(/paste your prompt/i);

    await user.type(textarea, "first prompt");
    await user.click(screen.getByRole("button", { name: /score & fix my prompt/i }));
    expect(await screen.findByText(/incomplete report/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /score & fix my prompt/i }));
    await screen.findByText("What the doctor fixed");
    expect(screen.queryByText(/new personal best/i)).toBeNull();

    await user.click(screen.getByRole("button", { name: /check another prompt/i }));
    expect(screen.getByText(/your recent checks/i)).toBeInTheDocument();
    await user.type(textarea, "a much better prompt");
    await user.click(screen.getByRole("button", { name: /score & fix my prompt/i }));
    expect(await screen.findByText(/new personal best/i)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("ps-doctor-recent")).map((item) => item.prompt)).toEqual(["a much better prompt", "first prompt"]);
  });

  it("keeps the visitor's text when the free limit is reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond({ error: { code: "free_daily_limit", message: "You've used today's 2 free optimizations." } }, 429, "0")));
    const user = userEvent.setup();
    renderDoctor();
    await user.type(screen.getByLabelText(/paste your prompt/i), "help me plan a trip");
    await user.click(screen.getByRole("button", { name: /score & fix my prompt/i }));

    const continueLink = await screen.findByRole("link", { name: /continue free in prompt builder/i });
    expect(decodeURIComponent(continueLink.getAttribute("href"))).toBe("/builder?mode=standard&idea=help me plan a trip");
    await waitFor(() => expect(screen.getByText("0 free checks left today", { exact: false })).toBeInTheDocument());
  });
});
