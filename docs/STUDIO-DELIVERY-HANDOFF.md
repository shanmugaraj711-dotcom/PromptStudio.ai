# Studio delivery handoff capsule

## Scope and exact checkpoint
- Repository: shanmugaraj711-dotcom/PromptStudio.ai.
- Every repository write must explicitly use branch: studio/consolidated through GitHub.
- Never write main, any forge/* branch, or force-push. No local repository operations/artifacts.
- Accepted revision work was approved at 58c2c9df04c4403d9c4365402ca5c50ce3b2f675.
- Current task is Phase 1 item 1 ONLY: PAID -> frozen revision -> customer build -> deploy -> verified URL.
- Report item 1 with real GitHub diff/SHA before moving to item 2 (verification retry audit) or item 3 (unknown AI provider).
- Phase 2 UX redesign still requires direction approval first.
- Latest hosting correction: USE EXISTING VERCEL PROJECT. Do not create another project.
- Delivery implementation and CI added through a88c6c5fd884c51f1b40472096d65801efad58e8. This document's containing commit is the subsequent checkpoint.

## What is implemented
- Payment verification creates studioDeliveries/{studioBuildRequestId} in the same Firestore transaction as PAID. Existing matching queue documents are retained.
- Frozen source is loaded from studioAcceptedRevisions and its binding/hash checked. No studioJobs read/regeneration during delivery.
- Fixed build package compiles the accepted App.js/styles.css with React, lucide and esbuild. Customer imports are restricted; no customer package scripts/config are accepted.
- Firestore worker leases, durable submission intent, deployment-ID persistence, polling and bounded retries.
- An uncertain deployment POST is reconciled via Vercel metadata; it is never blindly posted again. Unresolved jobs eventually require operator review.
- Existing Vercel project is selected from STUDIO_CUSTOMER_VERCEL_PROJECT_ID or VERCEL_PROJECT_ID. Deployment target is omitted (preview); no production alias promotion.
- Public unauthenticated HTTP checks verify revision marker, page and JS/CSS before READY. This is HTTP/asset verification, NOT a browser-render smoke test.
- Signed-in customer history survives browser refresh and displays verified URLs. No email sending was added.
- GitHub workflow Studio delivery checks runs node regression tests, app production build and an actual frozen customer bundle compilation.

## Configuration still required — NOT live verified
1. On the existing Studio Vercel deployment, configure server-only STUDIO_CUSTOMER_VERCEL_TOKEN, STUDIO_CUSTOMER_VERCEL_TEAM_ID if applicable, and STUDIO_CUSTOMER_VERCEL_PROJECT_ID (or expose VERCEL_PROJECT_ID).
2. Configure a strong STUDIO_DELIVERY_WORKER_SECRET.
3. Configure an external scheduler to GET the deployed consolidated Studio URL at /api/studio-delivery?action=worker with Authorization: Bearer <worker secret>, regularly (e.g. every minute). Each invocation handles one due job.
   - Queue is durable, but does not progress without this scheduler.
   - Vercel preview deployments do not run Vercel Cron. Do not write main to enable a cron.
   - No scheduler has been configured in this task.
4. Customer preview deployment URLs must be public. Worker deliberately does not bypass deployment protection: protected URLs will not be marked READY.
5. Verify project/root/build settings and deployment retention support long-lived customer URLs. Avoid changing protection on the entire existing project without reviewing its other deployments.
6. Run a real test-mode payment on the consolidated deployment, confirm frozen edited source, observe worker/build/deploy, open the resulting public URL and verify rendered output.
   - No live customer deployment or payment has been performed in this task.
   - No claim of end-to-end readiness is justified yet.

## Follow-up checks and known limitations
- Read GitHub Actions results for the exact latest SHA; fix failures on this branch only.
- Add/perform full payment verification duplicate/concurrency tests in item 2 after reporting item 1. Queue creation is transactionally keyed, but the full HTTP verification audit is not yet done.
- Webhook-only payment completion (customer closes checkout before browser verify) is not wired into this Studio queue yet; reconcile this before release.
- ORDER_CREATING recovery from the approved earlier patch is still outstanding.
- Existing PAID rows without queue need verified replay/backfill; legacy rows lacking frozen revisions must remain rejected, never silently rebound.
- FAILED delivery has customer messaging but no operator retry/reconciliation UI yet.
- Worker throughput is one due job per scheduler call, with a 90-second lease and exponential error backoff.
- Review worker upper-bound request duration against the 60-second API limit.
- Customer history currently queries all owned deliveries then returns the latest 20; add pagination before scale.
- Accepted files remain client-supplied at checkout. Future hardening may require server-observed acceptance and proving the submitted files match what the user saw.
- Sandpack editor changes are not necessarily reflected in parent React files; verify that flow before release.
- Unknown-provider Groq -> Gemini behavior has NOT been changed.

## GitHub verification entry points
- Branch: https://github.com/shanmugaraj711-dotcom/PromptStudio.ai/tree/studio/consolidated
- Delivery implementation diff through CI addition: https://github.com/shanmugaraj711-dotcom/PromptStudio.ai/compare/58c2c9df04c4403d9c4365402ca5c50ce3b2f675...a88c6c5fd884c51f1b40472096d65801efad58e8
- CI: https://github.com/shanmugaraj711-dotcom/PromptStudio.ai/actions/workflows/studio-delivery-checks.yml
- GitHub reports Vercel integrations for prompt-studio-ai and prompt-studio-ai-forge-test in team prompt-studioai. Do not configure/touch the Forge integration. No Vercel credentials were read.
