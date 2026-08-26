# Phase 4 — Monetization Rollout

## Product decision
PromptStudio monetization is centered on Image → Prompt, not generic prompt generation.

## Current offers
- Free: 3 prompt generations/day + 1 Image → Prompt/day.
- Creator Credits: ₹49 for 25 credits; ₹99 for 60 credits.
- Pro: ₹79/month or ₹499/year.
- Standard prompt cost: 2 credits.
- Image → Prompt cost: 5 credits.
- Purchased credits do not expire.

## Existing payment architecture
- Razorpay order creation exists server-side.
- Razorpay Checkout is loaded client-side.
- Payment signatures are verified server-side.
- Credit fulfillment is transactional and idempotent.
- Pro subscriptions use server-created Razorpay subscriptions.

## Rollout batches
### Batch 1 — pricing/conversion foundation
- Align public pricing copy with authoritative product configuration.
- Make Image → Prompt the primary monetization message.
- Clearly surface ₹49 and ₹99 Creator Credit choices.
- Keep pricing CTAs behind account authentication.

### Batch 2 — purchase UX
- Make Creator Credits purchase path obvious after sign-in.
- Show current credits before checkout.
- Show exact credits/price before payment.
- Show success/failure state and updated balance after verification.

### Batch 3 — trust + recovery
- Payment history visibility.
- Clear failed/cancelled payment recovery.
- Support path for payment issues.
- Founder/admin audit visibility.

### Batch 4 — conversion optimization
- Test Image → Prompt CTA wording.
- Test ₹49 vs ₹99 emphasis.
- Add contextual upgrade prompts only when a user reaches a limit.
- Measure visitor → signup → first Image → Prompt → purchase.

## Safety
No payment provider secrets are stored in client code. Pricing shown in UI must remain consistent with server-authoritative product configuration. Do not change credit economics casually.
