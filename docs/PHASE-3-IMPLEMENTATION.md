# Phase 3 — Integration Foundation

## Completed

- Added versioned `POST /api/v1/prompt` integration boundary.
- Kept the endpoint thin and delegated to the existing credit-aware generation core.
- Preserved existing authentication, validation, rate limiting, request-ID/idempotency, quota reservation, credit deduction, Gemini generation and rollback.
- Added API contract, safety baseline, current system map and reference research documentation.

## Why this design

The first integration surface must not duplicate business logic. The existing generation handler already performs server-authoritative credit/quota reservation and rollback, so the versioned API boundary delegates to that core.

## Next implementation sequence

1. Add automated contract/regression coverage for `/api/v1/prompt`.
2. Extract reusable core services only where tests prove behavior is preserved.
3. Add server-authoritative transaction/support lookup endpoints.
4. Add a scoped external integration credential layer.
5. Connect WhatsApp Business support.
6. Build the first Image → Prompt plugin using the same API.
7. Add integration analytics and observability.

## Production rule

This branch must not be merged to `main` until existing web generation, credits, payments, transactions and support flows pass regression testing and the new API contract has automated coverage.
