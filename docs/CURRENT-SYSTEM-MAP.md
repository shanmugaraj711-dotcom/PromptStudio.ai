# PromptStudio AI — Current System Map & Phase 3 Upgrade Plan

**Audit baseline:** `main` at `25ce8df8b5c9050e28a2b2c76f1e9ab887e0ae48`

## 1. Repository and stack

The repository is a private GitHub repository. The current application is a React 18 + Vite + Tailwind frontend with React Router, Firebase client/server SDKs, Google Gemini SDK, Vercel serverless APIs, ESLint and Vitest. `package.json` defines `dev`, `build`, `preview`, `lint`, and `test` scripts.

## 2. Application map

### Public experience
- Landing page
- Image to Prompt page
- Login/signup/password reset
- About, Help, Contact, Feedback
- Terms, Privacy, Refund
- Public shared prompt route `/p/:id`

### Authenticated application
- Dashboard
- Prompt Builder
- Workflows
- Account
- Prompt History (runtime-feature gated)
- Transactions
- Referral
- Admin
- Founder Referral Rewards
- Global support, payment-success and referral-reward UI

The route structure is defined centrally in `src/App.jsx` and uses `ProtectedRoute`, `RuntimeFeatureRoute`, and `AppLayout` for authenticated/runtime-controlled areas.

## 3. Backend/API map

Current serverless endpoints include:
- `generate-prompt.js` — prompt generation flow
- `generate-prompt-credits.js` — credit-aware generation flow
- `razorpay-order.js` — payment order creation
- `razorpay-verify.js` — payment verification
- `razorpay-webhook.js` — payment webhook processing
- `razorpay-subscription.js` — subscription flow
- `admin.js` / `admin-bootstrap.js` — founder/admin operations
- `product-config.js` — product configuration endpoint
- `feedback.js` — feedback submission
- `support-message.js` — support messaging
- `share-prompt.js` — public prompt sharing
- internal helpers for Firebase Admin, admin security, product config, rate limiting and Razorpay

## 4. AI generation flow

Current reference-aware generation is already more than a basic prompt wrapper:
1. Client sends idea/options/request ID and optional JPEG reference image.
2. Server validates request, model/category, request ID and image size/type.
3. User identity is verified server-side.
4. Runtime product configuration is loaded.
5. Generation quota/credit reservation is performed transactionally.
6. Gemini receives the user request plus optional inline reference image.
7. System instructions require structured visual decomposition, including subject, composition, camera/light, style/materials, color, typography/graphics and distinctive details.
8. Gemini returns JSON containing a main prompt, exactly three perspectives and intelligence metadata.
9. Successful output is saved to prompt history and the generation request.
10. Failed generation rolls back reserved quota/credits.
11. Primary/fallback Gemini models and timeouts are already used.

## 5. Data/security model

Firestore rules show a deliberately server-authoritative model:
- Users can read their own user document and update only allowed profile fields.
- Prompt history is user-readable/listable; creation is server-only; only favorite can be client-updated.
- Prompt templates are Pro-only.
- Generation requests are server-only.
- Runtime config, admin audit, payment orders/subscriptions/webhook events, support messages, feedback and public prompt shares are server-only from the client rules layer.

This is a strong foundation for future integrations because external channels should call authenticated server APIs rather than receive direct Firestore write access.

## 6. Current strengths

### Green — already strong
- Production branch has a known baseline.
- Authentication is protected by route guards and server-side token verification.
- Generation has request IDs/idempotency behavior.
- Quota reservation and rollback are transactional.
- Credit deductions occur inside server transactions.
- Gemini fallback exists.
- Generation rate limiting exists.
- Runtime product configuration exists.
- Payment endpoints and webhook path exist.
- Transaction/support/admin concepts already exist.
- Firestore rules prevent direct client writes to sensitive collections.
- Tests/lint/build scripts exist.

## 7. Areas requiring audit before expansion

### Yellow — verify, don't rewrite
- Consolidation between the legacy/free generation endpoint and the credit-aware generation endpoint.
- Exact current quota/credit semantics across all plans and image-analysis paths.
- Payment webhook idempotency and reconciliation edge cases.
- Public share authorization/expiry behavior.
- Admin permission boundaries and audit coverage.
- Support-to-transaction linking completeness.
- End-to-end coverage for payment → credits → transaction history.
- Rate-limit behavior under concurrent requests.
- Image upload constraints and future support for additional image MIME types.
- API error/observability standards across all endpoints.

## 8. Phase 3 architecture recommendation

Do NOT build WhatsApp and plugins as independent business-logic systems.

Create a single secure integration boundary:

```text
Web UI ───────────────┐
WhatsApp Business ────┼──> Integration/API Layer ──> PromptStudio Core
Plugins ──────────────┘                                  │
                                                         ├─ Auth
                                                         ├─ Prompt Intelligence
                                                         ├─ Credits
                                                         ├─ Billing
                                                         ├─ Transactions
                                                         └─ Support
```

### Step 1 — Integration contract
Define versioned API contracts for:
- authentication/context
- image submission
- prompt generation
- credits/entitlement checks
- transaction lookup
- support ticket creation

### Step 2 — Core service boundary
Extract shared server-side business functions from endpoint-specific handlers without changing behavior. The first extraction candidates are quota/credit reservation, generation orchestration, transaction lookup, and support linkage.

### Step 3 — API security
Use short-lived authenticated access, scoped capabilities, rate limits, request IDs/idempotency and strict input validation. Never expose Firebase Admin credentials, payment secrets or raw server-only collections to integrations.

### Step 4 — WhatsApp Business
Build WhatsApp as a support/customer-service channel first, not as a second PromptStudio application. Initial supported intents:
- payment issue
- credits missing
- transaction lookup
- generation issue
- account/help

### Step 5 — Plugin surface
Start with a narrow Image → Prompt action. A plugin should send a reference image/context to PromptStudio and receive the generated prompt/perspectives. Do not initially duplicate billing, wallet or user-management UI inside the plugin.

## 9. Upgrade order

1. Regression test current production flows.
2. Map and consolidate duplicated generation/credit logic.
3. Define API contracts and common error schema.
4. Add integration authentication/rate limits/idempotency.
5. Add transaction/support lookup service.
6. Add WhatsApp support adapter.
7. Add Image → Prompt plugin adapter.
8. Add observability and integration analytics.
9. Preview and run full regression suite.
10. Merge only after approval.

## 10. Explicit non-goals for Phase 3

- No rewrite of the frontend.
- No replacement of Firebase.
- No replacement of the current payment provider.
- No direct edits to production `main`.
- No duplicated WhatsApp/plugin business rules.
- No change to pricing/credit economics unless separately approved.

## 11. Definition of done

Phase 3 foundation is complete when:
- existing web generation remains behaviorally compatible;
- credits/quota cannot be double-spent through concurrent integration requests;
- every integration request has traceable request IDs;
- payment/transaction/support lookup is server-authoritative;
- WhatsApp can resolve the initial support intents;
- the first plugin can perform Image → Prompt without duplicating core logic;
- build, lint, unit/integration tests and production preview pass;
- rollback to the protected baseline remains straightforward.
