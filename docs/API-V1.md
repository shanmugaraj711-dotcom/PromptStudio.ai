# PromptStudio Integration API v1

## Purpose

The first integration surface is deliberately narrow: **Image → Prompt**. Web, WhatsApp and future plugins should use the same PromptStudio generation core rather than implementing their own prompt, credit or billing logic.

## Endpoint

`POST /api/v1/prompt`

The v1 endpoint is a thin compatibility boundary over the existing credit-aware generation handler. This keeps behavior identical while giving integrations a stable versioned path.

## Authentication

Use the same authenticated user context currently required by the core generation handler. The current implementation verifies the Firebase-authenticated request server-side. A future external-plugin credential/OAuth layer can be added at this boundary without moving business logic into the client.

## Request

JSON body:

```json
{
  "idea": "optional user intent",
  "image": {
    "name": "reference.jpg",
    "mimeType": "image/jpeg",
    "data": "base64-image-data"
  },
  "aiModel": "gemini",
  "category": "image",
  "requestId": "unique-client-request-id"
}
```

Rules inherited from the core:
- `idea` is optional when a reference image is supplied.
- supported models/categories are validated server-side;
- request IDs are required for idempotency;
- reference images are currently JPEG and bounded in size;
- rate limiting is enforced before generation;
- credits/quota are reserved transactionally before the AI call.

## Response

Successful responses contain:
- `prompt`
- `perspectives` (three useful prompt variants)
- `intelligence`
- `historyId`
- `quota`
- `creditsRemaining`
- `creditCost`

Failures use a stable `code` + `message` shape and may include the current `quota` state where appropriate.

## Safety guarantees

The integration endpoint does **not** write credits directly and does **not** accept client-supplied balances. It delegates to the existing server-authoritative generation flow, which uses Firebase transactions for reservation/rollback and server-side product configuration.

## Future v1.x additions

Only after the core endpoint is proven:
- transaction lookup;
- support ticket creation;
- prompt history lookup;
- share-link creation.

## Future v2

A separate external integration authentication layer may introduce scoped API keys/OAuth, but it must still terminate in the same PromptStudio core services. Never give plugins or WhatsApp direct Firestore access.
