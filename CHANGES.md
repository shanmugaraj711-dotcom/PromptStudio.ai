# Changes in this pass

## Removed
- **Live Signal** panel on the Dashboard (`src/pages/Dashboard/Dashboard.jsx`), its service (`src/services/liveSignal.js`), its API handler (`server/api/live-signal.js`), its route in `api/index.js` and `vercel.json`, and its mention in `docs/UNIFIED-WORKSPACE-MIGRATION.md`.
- `src/pages/Landing/PublicOptimizer.jsx`: unused duplicate of Prompt Doctor with an outdated target list.

## Bug fixes
- **Stalled AI calls never timed out** (`server/api/v1/optimize.js`). The Gemini request ignored the timeout, so a hung call blocked the whole request and the Groq fallback never ran. Now a deadline fails it over to the next model or provider.
- **Strict JSON parsing.** Replies wrapped in a code fence or prose now parse; unreadable replies fail over cleanly.
- **Network failures** in Prompt Doctor now show a readable message ("We couldn't reach PromptStudio...") instead of "Failed to fetch". The visitor's text is kept.

## Product improvements
- **Per-AI rewrites.** The optimizer now shapes the fix for each target: markdown for ChatGPT, XML-style tags for Claude, task-first for Gemini, short for Grok, single image prompt for Midjourney.
- **Target hint** under the picker explains what the fix will look like for the chosen AI.
- **"Your original prompt"** panel in the report, so users can see exactly what changed.
- **Target picker accessibility.** Uses correct toggle-button semantics (`aria-pressed`) instead of a radio group with no arrow-key support.
- **Target input is sanitized** (control characters stripped, length capped) before it reaches the model.

## Tests
- Added regression tests to `server/api/v1/optimize-report.test.js` and `src/pages/Landing/PromptDoctor.test.jsx`.
- **Not run in this environment.** The package registry was blocked, so `npm ci` and `vitest` could not run. Verified instead: all changed files parse, the optimizer's timeout failover and fenced-JSON parsing were exercised against stubbed dependencies, and the Prompt Doctor component server-renders with the new elements. Run `npm ci && npm test && npm run build` before deploying.

## Video prompts
- **Four video targets** in Prompt Doctor: Veo, Sora, Runway and Kling. Each has its own rewrite guidance: one continuous shot for Veo, timed beats for Sora, motion-first for Runway, action-first for Kling. A hint under the picker explains the format.
- **AI Video library category** with 4 fill-in-the-blank prompts (product hero shot, explainer scene, three-shot reel, cinematic mood clip). The library now has 28 prompts.
- README updated to list the video targets and the new prompt count.
- Tests added for video guidance and for the Veo picker hint. Same caveat as before: not run here, because the package registry is blocked.
- Video guidance was checked end to end: a Veo request reaches the model with the video instructions.

## Redesign: started, not finished
- Removed the Workflows page (route, Builder link, smoke-test entry); the Pro plan line now says "Saved history, favourites and share links".
- Deleted 10 unused files (old landing sections Hero, Features, Pricing, HowItWorks, WorksWith, ExampleGallery; BeforeAfter, AdminToolsTabs, CreditBadge, Badge).
- New design foundation: ink-navy colour scale (replaces slate site-wide), highlighter-yellow `brand` colour, Schibsted Grotesk + Kalam fonts, dark page background, visible keyboard focus.
- Removed the CSS hacks that forced Reference Coding into a light theme.
- NOT done yet: unified header/footer, landing page rewrite, converting the light pages (Builder, Login/Signup, History, Transactions, Shared prompt, Admin) to the dark theme, App Forge/Studio polish, and a build + screenshot check.
- Update: white-themed pages (Builder, Login/Signup/Forgot password, History, Transactions, Shared prompt, result cards, toasts, form controls) converted to the dark theme.
- Update: one header and footer for all public pages (About, Help, Feedback and Reference Coding now use the main site header); brand yellow applied to the header, app frame and landing page.
- Update: all 8-10px text raised to 12px for readability; "APK Forge" title renamed "App Forge" to match the product.
- Still not checked visually: run `npm ci && npm test && npm run build`, then click through every page before going live.
