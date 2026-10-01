import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Smoke test: every page must render for a signed-in user without throwing.
// Network, Firebase and Firestore are mocked so this runs offline.
const fakeUser = vi.hoisted(() => ({ uid: "smoke-user", email: "smoke@example.test", displayName: "Smoke Tester", getIdToken: async () => "smoke-token" }));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    user: fakeUser,
    userProfile: { credits: 12, plan: "free", promptsToday: 1, lastPromptDate: new Date().toISOString().slice(0, 10), referralCode: "SMOKE1" },
    plan: "free",
    promptsToday: 1,
    lastPromptDate: new Date().toISOString().slice(0, 10),
    loading: false,
    updateQuotaState: vi.fn(),
    refreshProfile: vi.fn(),
    signup: vi.fn(),
    login: vi.fn(),
    loginWithGoogle: vi.fn(),
    logout: vi.fn(),
    resetPassword: vi.fn(),
    getUserProfile: vi.fn(),
  }),
  AuthProvider: ({ children }) => children,
}));
vi.mock("../firebase", () => ({ auth: { currentUser: fakeUser }, db: {}, googleProvider: {}, default: {} }));
vi.mock("../services/promptHistoryService", () => ({ subscribeToPromptHistory: (_uid, onChange) => { onChange([]); return () => {}; }, deletePrompt: vi.fn(), setPromptFavorite: vi.fn() }));
vi.mock("../services/promptTemplateService", () => ({ subscribeToPromptTemplates: (_uid, onChange) => { onChange([]); return () => {}; }, createPromptTemplate: vi.fn(), updatePromptTemplate: vi.fn(), deletePromptTemplate: vi.fn() }));
vi.mock("@codesandbox/sandpack-react", () => ({ Sandpack: () => null, SandpackProvider: ({ children }) => children, SandpackPreview: () => null, SandpackLayout: ({ children }) => children, SandpackCodeEditor: () => null }));

const PAGES = [
  ["/", () => import("../pages/Landing/Landing")],
  ["/prompts", () => import("../pages/PromptLibrary/PromptLibrary")],
  ["/dashboard", () => import("../pages/Dashboard/Dashboard")],
  ["/builder?mode=standard", () => import("../pages/Builder/PromptBuilder")],
  ["/builder?mode=image", () => import("../pages/Builder/PromptBuilder")],
  ["/reference-coding", () => import("../pages/ReferenceCoding/ReferenceCoding")],
  ["/studio", () => import("../pages/Studio/Studio")],
  ["/apk-forge", () => import("../pages/ApkForge/ApkForge")],
  ["/apk-forge/my-builds", () => import("../pages/ApkForge/ApkForgeBuilds")],
  ["/workflows", () => import("../pages/Workflows/WorkflowLibrary")],
  ["/history", () => import("../pages/Result/PromptHistory")],
  ["/account", () => import("../pages/Account/Account")],
  ["/transactions", () => import("../pages/Transactions/Transactions")],
  ["/referral", () => import("../pages/Referral/Referral")],
  ["/admin", () => import("../pages/Admin/Admin")],
  ["/admin/operations", () => import("../pages/Admin/AdminMvp")],
  ["/admin/referrals", () => import("../pages/Admin/ReferralRewards")],
  ["/about", () => import("../pages/About/About")],
  ["/help", () => import("../pages/Help/Help")],
  ["/contact", () => import("../pages/Contact/Contact")],
  ["/feedback", () => import("../pages/Feedback/Feedback")],
  ["/terms", () => import("../pages/Legal/Terms")],
  ["/privacy", () => import("../pages/Legal/Privacy")],
  ["/refund", () => import("../pages/Legal/Refund")],
  ["/login", () => import("../pages/Auth/Login")],
  ["/signup", () => import("../pages/Auth/Signup")],
  ["/forgot-password", () => import("../pages/Auth/ForgotPassword")],
];

describe("page smoke test (signed-in user)", () => {
  let consoleErrors;
  beforeEach(() => {
    consoleErrors = [];
    vi.spyOn(console, "error").mockImplementation((...args) => { consoleErrors.push(args.map(String).join(" ").slice(0, 300)); });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })));
    window.scrollTo = () => {};
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it.each(PAGES)("renders %s", async (path, load) => {
    const { default: Page } = await load();
    render(<MemoryRouter initialEntries={[path]}><Routes><Route path="*" element={<Page />} /></Routes></MemoryRouter>);
    await waitFor(() => expect(document.body.textContent.length).toBeGreaterThan(20));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText(/Something went off track/i)).toBeNull();
    const reactErrors = consoleErrors.filter((line) => /The above error occurred|Uncaught|is not a function|Cannot read properties|Maximum update depth/i.test(line));
    expect(reactErrors).toEqual([]);
  });
});
