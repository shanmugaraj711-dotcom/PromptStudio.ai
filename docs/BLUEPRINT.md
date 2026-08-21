# PromptStudio AI — Master Blueprint

## Product identity
PromptStudio AI is a visual prompt-intelligence product built around the core workflow:

**REFERENCE IMAGE → PROMPTSTUDIO INTELLIGENCE → HIGH-QUALITY PROMPT → CREATE ANYWHERE**

Brand promise: **SEE IT. GET THE PROMPT. CREATE IT.**

## Current core
- Reference image → prompt generation
- Idea → structured prompt generation
- Prompt history
- Copy/reuse workflows
- Firebase authentication and Firestore-backed user data
- Gemini-backed generation API through Vercel
- Credits, payments, wallet/entitlements and transaction history
- Support and payment-help flows
- Founder/admin controls and runtime configuration
- Analytics and referral capabilities

## Architecture
- Frontend: React 18 + Vite + Tailwind CSS
- Routing: React Router DOM
- Auth/data: Firebase Authentication + Firestore
- Backend: Vercel serverless API
- AI: official Google Gemini SDK
- Language: JavaScript
- Testing: Vitest + Testing Library

## Protected production rule
`main` is the production-safe baseline. Do not experiment directly on `main`.

All upgrades should:
1. branch from the known production baseline;
2. isolate the feature;
3. test existing critical flows;
4. verify build/lint/tests and preview deployment;
5. review the diff;
6. merge only after approval.

## Critical flows that must not regress
- Authentication
- Image upload and Image → Prompt generation
- Prompt generation quota/credits
- Paid credit purchase and entitlement delivery
- Wallet/credit balance
- Transaction history
- Support/payment issue linking
- Account/runtime configuration
- Admin/founder controls
- Existing public routes and API routing

## Future phases
### Phase A — Safety and documentation
- Preserve production baseline
- Maintain rollback reference
- Keep architecture and launch docs current

### Phase B — Customer support expansion
- WhatsApp Business support
- Transaction-linked support
- Payment/credit issue triage

### Phase C — Integrations
- Public API layer
- Browser/plugin workflows
- AI-tool integrations

### Phase D — Creator growth
- Shareable prompts
- Referral improvements
- Creator analytics
- Social-content workflows

### Phase E — Advanced intelligence
- Better visual decomposition
- Camera/lens/lighting inference
- Style and composition extraction
- More controllable prompt outputs

## Repository layout target
```text
apps/                    # future app boundaries if needed
api/                     # current Vercel serverless API
src/                     # current React application
database/                # future schema/migration organization
integrations/            # future WhatsApp/plugins/API integrations
tests/                   # unit/integration/e2e coverage
docs/                    # product and technical documentation
```

## Non-negotiable principle
**New functionality must never sacrifice a working production flow.**
Incremental upgrades are preferred over rewrites.
