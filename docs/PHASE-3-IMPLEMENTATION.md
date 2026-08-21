# Phase 3 — Integration Foundation

## Completed in this phase

- Added a versioned `POST /api/v1/prompt` integration boundary.
- Kept the endpoint intentionally thin so it delegates to the existing credit-aware generation core.
- Preserved the existing authentication, request validation, rate limiting, idempotency, quota reservation, credit deduction, Gemini generation and rollback behavior.
- Added the v1 API contract and safety documentation.

## Why this design

The first implementation must not duplicate business logic. The existing generation handler already performs server-authoritative credit/quota reservation and rollback. The new API surface therefore wraps that core instead of creating a second implementation.

## Next implementation sequence

1. Add automated contract/regression coverage around `/api/v1/prompt`.
2. Extract reusable core services only where tests prove behavior is preserved.
3. Add server-authoritative transaction/support lookup endpoints.
4. Add a scoped external integration credential layer.
5. Connect WhatsApp Business support.
6. Build the first Image → Prompt plugin using the same API.
7. Add integration-specific analytics and observability.

## Production rule

This branch must not be merged to `main` until the existing web generation, credits, payments, transactions and support flows pass regression testing and the new API contract has automated coverage.
