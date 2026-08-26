# Phase 4 — External Integrations Foundation

## Goal
Expose PromptStudio's core Image → Prompt intelligence through external creator workflows without duplicating the AI engine, credits, payments, or user data.

## Product boundary
This is separate from WhatsApp and separate from monetization. WhatsApp remains a provider configuration task. Monetization remains its own unfinished step.

## External integration flow
User / external platform
→ integration adapter
→ authenticated PromptStudio API
→ existing Image → Prompt engine
→ structured prompt result
→ external platform

## v1 capability
`Analyze Image`

Input:
- reference image
- optional instruction
- target AI model
- category
- request/idempotency key

Output:
- primary prompt
- three perspectives
- intent
- output type
- assumptions
- missing information
- recommendations

## Security boundary
- External adapters never receive Firebase Admin credentials.
- External adapters never write directly to Firestore.
- External adapters never maintain a local credit ledger.
- External adapters never verify payments.
- Authentication, authorization, credits and generation remain server authoritative.
- Secrets belong only in server-side environment configuration.

## Adapter strategy
Build one provider-neutral contract first. Platform-specific adapters can later map their own supported extension/API mechanism to this contract. Do not claim a ChatGPT or Gemini marketplace/plugin is live until that platform's current integration requirements are configured and verified.

## UX
1. Attach/select image.
2. Optional target AI/category.
3. Analyze.
4. Show prompt + perspectives.
5. Copy prompt or continue in the user's preferred AI workflow.

## Non-goals for this batch
- WhatsApp credentials/webhook setup.
- Payment/pricing changes.
- A duplicate AI generation engine.
- Platform-specific marketplace submission.
- Production changes on `main`.

## Release gate
This foundation remains on `development` until build/lint/tests and preview verification are available. Production promotion requires explicit approval.
