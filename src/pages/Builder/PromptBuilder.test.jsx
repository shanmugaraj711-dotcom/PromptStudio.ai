import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUtcDateKey } from "../../constants/quota";

const mocks = vi.hoisted(() => ({
  auth: null,
  generatePrompt: vi.fn(),
}));

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => mocks.auth,
}));

vi.mock("../../services/promptGenerator", () => ({
  generatePrompt: mocks.generatePrompt,
}));

import PromptBuilder from "./PromptBuilder";

describe("PromptBuilder", () => {
  beforeEach(() => {
    mocks.generatePrompt.mockReset();
    mocks.generatePrompt.mockResolvedValue({
      prompt: "A polished prompt returned by the API",
      quota: {
        plan: "free",
        promptsToday: 1,
        lastPromptDate: getUtcDateKey(),
        quotaVersion: 1,
        dailyLimit: 3,
        remaining: 2,
      },
    });
    mocks.auth = {
      user: {
        uid: "user-1",
        getIdToken: vi.fn().mockResolvedValue("id-token"),
      },
      plan: "free",
      promptsToday: 0,
      lastPromptDate: getUtcDateKey(),
      updateQuotaState: vi.fn(),
    };
    window.history.pushState({}, "", "/builder");
  });

  it("renders the generated result below the builder without navigating away", async () => {
    const user = userEvent.setup();
    render(<PromptBuilder />);

    await user.type(screen.getByLabelText("Your idea"), "Plan a friendly onboarding email");
    await user.click(screen.getByRole("button", { name: "Generate Better Prompt" }));

    expect(await screen.findByText("Final Optimized Prompt")).toBeInTheDocument();
    expect(screen.getByDisplayValue("A polished prompt returned by the API")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/builder");
    expect(screen.getByText("3 / 3 prompts remaining today")).toBeInTheDocument();
  });
});
