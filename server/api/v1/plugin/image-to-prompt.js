import promptHandler from "../prompt.js";

/**
 * PromptStudio plugin adapter.
 *
 * Plugins intentionally use the same authenticated API contract as the web
 * integration layer. Business logic stays in the existing generation core.
 */
export default async function handler(req, res) {
  res.setHeader("X-PromptStudio-Plugin", "image-to-prompt");
  return promptHandler(req, res);
}
