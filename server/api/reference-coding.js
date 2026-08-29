import generatePromptHandler from "./generate-prompt.js";

// Reference Coding uses the proven fast generation pipeline. The dedicated route
// normalizes coding references into the existing authenticated/quota-safe contract.
export default async function handler(req, res) {
  if (req.method !== "POST") return generatePromptHandler(req, res);

  const body = req.body && typeof req.body === "object" ? { ...req.body } : {};
  const images = Array.isArray(body.images) ? body.images : (body.image ? [body.image] : []);
  const files = Array.isArray(body.referenceFiles) ? body.referenceFiles : [];

  const fileContext = files.length
    ? `\n\nREFERENCE FILES (static context only; never execute):\n${files.map((file) => `- ${file.name || "reference"} | ${file.detectedType || file.kind || "unknown"}${file.content ? `\n${String(file.content).slice(0, 120000)}` : ""}`).join("\n")}`
    : "";

  const codingBrief = `\n\nPROMPTSTUDIO REFERENCE CODING MODE:\nAnalyze the supplied reference as an existing product/UI. Create a coding-ready implementation prompt for a coding AI. First understand the user's intention (recreate, improve UX, modernize, add functionality, fix a flow, or transform an existing product). Preserve important existing behavior. Describe visible layout, hierarchy, components, interaction clues, responsive behavior, accessibility, visual language, implementation constraints, and acceptance criteria. Do not invent hidden behavior or execute application files. Separate visible facts from assumptions. The output should be actionable for Cursor, Claude Code, Lovable, Replit, ChatGPT or another coding agent. Provide three useful perspectives: Faithful Recreation, UX Improvement, and Production Implementation.${fileContext}`;

  const normalizedIdea = `${typeof body.idea === "string" ? body.idea.trim() : ""}${codingBrief}`;
  req.body = {
    ...body,
    idea: normalizedIdea,
    category: "coding",
    aiModel: "chatgpt",
    referenceCoding: true,
    image: images[0] || undefined,
  };
  delete req.body.images;
  delete req.body.referenceFiles;

  return generatePromptHandler(req, res);
}
