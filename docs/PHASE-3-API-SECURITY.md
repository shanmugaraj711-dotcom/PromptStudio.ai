# Phase 3 Integration Security Boundary

## Required for external integrations

- Server-side authentication only.
- Never expose Firebase Admin credentials.
- Never allow a client/plugin/WhatsApp request to set its own credit balance.
- Every generation request must carry a unique request ID.
- Replays must return the existing result or a safe in-progress response instead of charging twice.
- Apply user and source rate limits.
- Validate model, category, image MIME type, image size and request payload server-side.
- Return only integration-safe fields; never expose server secrets or raw payment/webhook records.
- Keep payment and entitlement state server-authoritative.

## Planned credential model

The first `/api/v1/prompt` adapter inherits the current authenticated web request model. Before opening the API to third-party plugins, add a scoped integration credential/OAuth layer with:

- integration ID
- user/account owner
- scopes
- issued/created timestamp
- revocation status
- last-used metadata

Secrets must be stored only in server-side protected storage and never returned after creation.

## WhatsApp rule

WhatsApp messages must resolve to an authenticated/identified PromptStudio customer context before account-specific data is disclosed. Unknown users receive a safe onboarding path.

## Billing rule

WhatsApp and plugins may request a generation, but they must never implement their own credit deduction. The core generation service is the sole authority for quota and credit accounting.
