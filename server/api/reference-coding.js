import generatePromptCredits from "./generate-prompt-credits.js";

// Reference Coding is a first-class mode of the existing secure generation pipeline.
// The handler reuses authentication, rate limits, quota/credits and history storage.
export default async function handler(req, res) {
  if (req.method === "POST") {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    req.body = { ...body, referenceCoding: true, category: "coding", aiModel: "chatgpt" };
  }
  return generatePromptCredits(req, res);
}
