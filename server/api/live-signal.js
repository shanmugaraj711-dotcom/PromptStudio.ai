import { requireUser, json } from "./_firebaseAdmin.js";

const clean = (value, max = 220) => String(value || "").trim().replace(/[<>]/g, "").slice(0, max);
const providerError = (message, code = "provider_unavailable") => Object.assign(new Error(message), { status: 503, code });

const MODEL_EXAMPLES = [
  { name: "GPT-6 Astra", fit: "frontier reasoning + coding" },
  { name: "GPT-5.6 Sol", fit: "complex professional work" },
  { name: "Gemini 3.8 Flash", fit: "long-horizon engineering + agents" },
  { name: "Codex", fit: "end-to-end software engineering" },
];

const PROMPT_PULSE = [
  { title: "Turn one messy idea into a build-ready product spec", category: "Product", prompt: "Take my messy product idea, extract the exact user goal, must-have features, screens, states, constraints and acceptance criteria, then produce a build-ready specification. Do not invent requirements; label every assumption.", model: "GPT-6 Astra" },
  { title: "Make an existing app dramatically easier to use", category: "UX", prompt: "Audit this existing app from a user's point of view. Identify the highest-friction moments, propose the smallest changes with the biggest usability impact, then give an implementation-ready redesign with acceptance criteria.", model: "GPT-5.6 Sol" },
  { title: "Build a real workflow instead of a one-off answer", category: "Agents", prompt: "Turn this repeated task into a reliable AI workflow: define inputs, steps, tools, decision points, approval gates, failure handling and final output. Prefer deterministic handoffs over vague autonomous behavior.", model: "Codex" },
  { title: "Turn a business problem into a tiny app people will use", category: "App idea", prompt: "Find the smallest useful app that solves this real-world problem. Define the target user, one core action, essential screens, data model, edge cases and a simple success metric. Avoid feature bloat.", model: "Gemini 3.8 Flash" },
  { title: "Make AI check its own work before delivering", category: "Quality", prompt: "Complete the task, then run a self-review against explicit acceptance criteria. List failures, unsupported assumptions and missing edge cases, fix them, and return only the verified final result plus a concise verification summary.", model: "GPT-6 Astra" },
  { title: "Create a content system, not 10 random posts", category: "Marketing", prompt: "Build a repeatable content engine for my business: audience insight, content pillars, weekly formats, hooks, production workflow, distribution plan and measurement loop. Give me the first 7 ready-to-use pieces.", model: "GPT-5.6 Sol" },
  { title: "Give a coding agent the exact job, not a vague request", category: "Coding", prompt: "Act as the implementation lead. Inspect the supplied requirements and repository context, identify the smallest safe change, preserve existing behavior, implement it, test the changed paths, and report only verified results. Never claim success without evidence.", model: "Codex" },
  { title: "Compare models by the job, not by hype", category: "Model strategy", prompt: "For this task, compare GPT-6 Astra, GPT-5.6 Sol, Gemini 3.8 Flash and Codex by reasoning depth, coding ability, multimodal needs, latency, cost sensitivity and tool use. Recommend one and explain the trade-off.", model: "GPT-6 Astra" },
];

const rotatePulse = () => {
  const day = Math.floor(Date.now() / 86400000);
  const offset = day % PROMPT_PULSE.length;
  return Array.from({ length: 8 }, (_, index) => {
    const item = PROMPT_PULSE[(offset + index) % PROMPT_PULSE.length];
    const model = MODEL_EXAMPLES[index % MODEL_EXAMPLES.length];
    return { rank: index + 1, title: item.prompt, traffic: `${item.category} · ${item.model || model.name}`, description: item.title, prompt: item.prompt, model: item.model || model.name, modelFit: model.fit, url: "" };
  });
};

const decodeTrends = (text) => {
  const raw = String(text || "").replace(/^\)\]\}',?\s*/, "");
  let data;
  try { data = JSON.parse(raw); } catch { throw providerError("The live trend source returned invalid data.", "invalid_provider_data"); }
  const day = data?.default?.trendingSearchesDays?.[0];
  const trends = (day?.trendingSearches || []).slice(0, 8).map((item) => clean(item?.title?.query, 120)).filter(Boolean);
  if (!trends.length) throw providerError("The live trend source returned no current topics.", "no_topics");
  return trends.map((trend, index) => {
    const template = PROMPT_PULSE[index % PROMPT_PULSE.length];
    const model = MODEL_EXAMPLES[index % MODEL_EXAMPLES.length];
    const prompt = `${template.prompt} Current signal: "${trend}". Use it only as context; do not treat the trend as a requirement or fact about the user.`;
    return { rank: index + 1, title: prompt, traffic: `${template.category} · ${model.name}`, description: `Trend signal: ${trend}`, prompt, model: model.name, modelFit: model.fit, url: "" };
  });
};

const withTimeout = async (url, ms = 6500) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try { return await fetch(url, { signal: controller.signal, headers: { "User-Agent": "PromptStudioAI/1.0 PromptPulse" } }); }
  catch (error) { if (error?.name === "AbortError") throw providerError("Prompt Pulse took too long to receive fresh data.", "provider_timeout"); throw providerError("Prompt Pulse could not reach its live data source.", "provider_network_error"); }
  finally { clearTimeout(timer); }
};

export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { code: "method_not_allowed", message: "Prompt Pulse uses GET requests." });
  try {
    await requireUser(req);
    const requestedLocation = clean(req.query?.location || "India", 80) || "India";
    let topics = [];
    let source = "curated-ai-pulse";
    const geoCodes = { "tamil nadu": "IN-TN", chennai: "IN-TN", coimbatore: "IN-TN", madurai: "IN-TN", kerala: "IN-KL", karnataka: "IN-KA", bengaluru: "IN-KA", "andhra pradesh": "IN-AP", telangana: "IN-TG", maharashtra: "IN-MH", delhi: "IN-DL", india: "IN" };
    const geoCode = geoCodes[requestedLocation.toLowerCase()];
    if (geoCode) {
      try {
        const response = await withTimeout(`https://trends.google.com/trends/api/dailytrends?hl=en-IN&tz=-330&geo=${encodeURIComponent(geoCode)}&ns=15`);
        if (!response.ok) throw providerError("The live trend source is temporarily unavailable.");
        topics = decodeTrends(await response.text());
        source = "google-trends-prompt-pulse";
      } catch (error) {
        console.warn("[prompt-pulse] Google Trends unavailable; using curated AI prompt pulse", { location: requestedLocation, code: error?.code || "unknown" });
        topics = rotatePulse();
      }
    } else {
      topics = rotatePulse();
    }
    res.setHeader("Cache-Control", "private, max-age=300, stale-while-revalidate=600");
    return json(res, 200, { location: requestedLocation, source, updatedAt: new Date().toISOString(), topics, modelExamples: MODEL_EXAMPLES });
  } catch (error) {
    console.error("[prompt-pulse] request failed", { code: error?.code || "unknown", status: error?.status || 503, message: error?.message || "unknown" });
    return json(res, Number(error?.status) || 503, { code: error?.code || "prompt_pulse_unavailable", message: error?.message || "Prompt Pulse is temporarily unavailable. Please try again shortly." });
  }
}
