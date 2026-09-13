import { GoogleGenAI } from "@google/genai";

const MODELS = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash"];
const MAX_IMAGES = 4;
const MAX_TEXT = 100000;
const TOTAL_AI_BUDGET_MS = 8500;

const PREVIEW_SCHEMA = {
  type: "object",
  properties: {
    appName: { type: "string" },
    summary: { type: "string" },
    primaryUser: { type: "string" },
    screens: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          purpose: { type: "string" },
          widgets: { type: "array", items: { type: "string" } },
          primaryAction: { type: "string" }
        },
        required: ["id", "title", "purpose", "widgets", "primaryAction"]
      }
    },
    keyInteractions: { type: "array", items: { type: "string" } },
    dataEntities: { type: "array", items: { type: "string" } },
    assumptions: { type: "array", items: { type: "string" } },
    theme: {
      type: "object",
      properties: { accent: { type: "string" }, mood: { type: "string" } },
      required: ["accent", "mood"]
    }
  },
  required: ["appName", "summary", "primaryUser", "screens", "keyInteractions", "dataEntities", "assumptions", "theme"]
};

const clean = (value, max = 500) => String(value || "").trim().slice(0, max);
const safeArray = (value, max = 8) => Array.isArray(value) ? value.map((item) => clean(item, 300)).filter(Boolean).slice(0, max) : [];

const fallbackPreview = (description) => {
  const text = String(description || "").trim();
  const lower = text.toLowerCase();
  const medicine = /medicine|medication|tablet|pill|dose|reminder/.test(lower);
  if (medicine) return {
    appName: "Medicine Reminder",
    summary: "A focused medicine schedule that shows what is due, lets the user add medicines and records taken or skipped doses.",
    primaryUser: "A person managing recurring medicines or caring for someone who does.",
    screens: [
      { id: "home", title: "Today", purpose: "See the next and overdue doses at a glance.", widgets: ["Next dose card", "Today's medicine list", "Taken / skipped status"], primaryAction: "Mark dose taken" },
      { id: "add", title: "Add medicine", purpose: "Create a medicine with dose and reminder schedule.", widgets: ["Medicine name", "Dose", "Time", "Repeat schedule"], primaryAction: "Save reminder" },
      { id: "history", title: "History", purpose: "Review adherence over previous days.", widgets: ["Calendar", "Dose history", "Adherence summary"], primaryAction: "View day" }
    ],
    keyInteractions: ["Mark a scheduled dose as taken or skipped", "Add and edit a medicine schedule", "Surface overdue doses without inventing medical advice"],
    dataEntities: ["Medicine", "Dose schedule", "Dose event"],
    assumptions: ["Reminder times are user-entered; the app does not prescribe or change medication instructions."],
    theme: { accent: "cyan", mood: "calm, trustworthy, health-focused" }
  };
  const appName = clean((text.match(/(?:create|build|make|design)\s+(?:a|an|the)?\s*([^,.!?]+)/i)?.[1] || "Requested app"), 60);
  return {
    appName: appName || "Requested app",
    summary: `A focused Android experience derived directly from: ${clean(text, 220)}`,
    primaryUser: "The user described in the request.",
    screens: [
      { id: "home", title: "Home", purpose: "The primary workflow described by the customer.", widgets: ["Primary task", "Current state", "Relevant information"], primaryAction: "Start primary task" }
    ],
    keyInteractions: ["Complete the primary task described in the request"],
    dataEntities: [],
    assumptions: ["Only the behavior explicitly described by the customer is included until more detail is supplied."],
    theme: { accent: "cyan", mood: "clean, focused, modern" }
  };
};

const buildPrompt = ({ description, references }) => {
  const textRefs = references.filter((file) => file?.content && !file?.data).slice(0, 8).map((file) => `--- ${clean(file.name, 120)} ---\n${clean(file.content, MAX_TEXT)}`).join("\n");
  return `You are PromptStudio App Forge's product intelligence layer. Turn the customer's request into a high-fidelity PREVIEW PLAN before payment. Think like a senior product designer + mobile architect. Do not generate a generic template. Preserve explicit requirements, named entities, workflows, constraints and visual evidence. Infer only the smallest necessary assumptions and list them.

The preview must be useful to a customer: it should show what the app will actually look and behave like, not just say "screens will be derived". Design 1-5 screens that are directly justified by the request. For each screen, provide concise UI widgets that can be rendered in a phone mockup and one primary action. Include important interactions, data entities, and a small visual direction. Never invent medical advice, credentials, integrations, production data, or unsupported capabilities.

CUSTOMER REQUEST:\n${clean(description, 12000)}\n\nREFERENCE FILE TEXT:\n${textRefs || "None"}\n\nReturn JSON matching the supplied schema only.`;
};

const generateModel = async ({ client, model, contents }) => {
  const response = await client.models.generateContent({
    model,
    contents,
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: PREVIEW_SCHEMA,
      maxOutputTokens: 1800,
      thinkingConfig: { thinkingLevel: model === MODELS[0] ? "high" : "medium" }
    }
  });
  return JSON.parse(String(response.text || "{}"));
};

const withTimeout = (promise, ms) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(Object.assign(new Error("Forge preview intelligence timed out."), { code: "forge_preview_timeout", status: 504 })), ms);
  promise.then(resolve, reject).finally(() => clearTimeout(timer));
});

const normalize = (preview, description) => {
  const fallback = fallbackPreview(description);
  const source = preview && typeof preview === "object" ? preview : {};
  const screens = Array.isArray(source.screens) ? source.screens.slice(0, 5).map((screen, index) => ({
    id: clean(screen?.id, 40) || `screen-${index + 1}`,
    title: clean(screen?.title, 60) || `Screen ${index + 1}`,
    purpose: clean(screen?.purpose, 220) || "Primary workflow screen.",
    widgets: safeArray(screen?.widgets, 6),
    primaryAction: clean(screen?.primaryAction, 80) || "Continue"
  })).filter((screen) => screen.widgets.length || screen.purpose) : [];
  return {
    appName: clean(source.appName, 70) || fallback.appName,
    summary: clean(source.summary, 320) || fallback.summary,
    primaryUser: clean(source.primaryUser, 220) || fallback.primaryUser,
    screens: screens.length ? screens : fallback.screens,
    keyInteractions: safeArray(source.keyInteractions, 6).length ? safeArray(source.keyInteractions, 6) : fallback.keyInteractions,
    dataEntities: safeArray(source.dataEntities, 8),
    assumptions: safeArray(source.assumptions, 5).length ? safeArray(source.assumptions, 5) : fallback.assumptions,
    theme: { accent: clean(source.theme?.accent, 30) || fallback.theme.accent, mood: clean(source.theme?.mood, 100) || fallback.theme.mood }
  };
};

export async function createForgePreview({ description, references = [] }) {
  const fallback = normalize(null, description);
  if (!process.env.GEMINI_API_KEY) return { ...fallback, intelligenceStatus: "fallback_no_key", model: null };
  const imageRefs = references.filter((file) => file?.data && String(file.mimeType || "").startsWith("image/")).slice(0, MAX_IMAGES);
  const contents = [{ text: buildPrompt({ description, references }) }, ...imageRefs.map((file) => ({ inlineData: { mimeType: file.mimeType, data: file.data } }))];
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  let lastError;
  const startedAt = Date.now();
  for (let index = 0; index < MODELS.length; index += 1) {
    const remaining = TOTAL_AI_BUDGET_MS - (Date.now() - startedAt);
    if (remaining <= 500) break;
    const model = MODELS[index];
    const attemptBudget = Math.min(remaining - 250, index === 0 ? 5000 : 2500);
    try {
      const preview = normalize(await withTimeout(generateModel({ client, model, contents }), attemptBudget), description);
      return { ...preview, intelligenceStatus: "ai", model };
    } catch (error) {
      lastError = error;
      const status = Number(error?.status || error?.statusCode || 0);
      const message = String(error?.message || "").toLowerCase();
      const retryable = [408, 429, 500, 502, 503, 504].includes(status) || (status === 404 && message.includes("model")) || message.includes("temporar") || message.includes("overload") || message.includes("timeout") || message.includes("aborted");
      console.warn("Forge preview model attempt failed", { model, status, reason: error?.name || error?.code || "unknown" });
      if (!retryable) break;
    }
  }
  return { ...fallback, intelligenceStatus: "fallback_ai_unavailable", model: null, warning: clean(lastError?.message, 180) };
}
