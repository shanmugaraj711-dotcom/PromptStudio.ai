# PromptStudio Integration API v1

## Purpose

PromptStudio exposes a narrow, versioned integration surface. The existing `/api/v1/prompt` endpoint remains the authenticated, credit-aware generation boundary. A separate stateless optimizer is provided for lightweight external AI integrations such as a GPT Action.

## Stateless optimize endpoint

`POST /api/v1/optimize`

This endpoint is deliberately separate from the logged-in product flow. It does not create users, save prompts, write history, reserve quota, deduct credits, or require Firebase authentication.

### Request

JSON body:

```json
{
  "prompt": "make a marketing post for my restaurant",
  "target": "ChatGPT"
}
```

Rules:
- `prompt` is required, 3–6000 characters;
- `target` is optional and defaults to `general AI`;
- `Content-Type: application/json` is required;
- no user account or Firebase ID token is required;
- requests are best-effort rate-limited by source IP at 12 requests per 60 seconds per warm serverless instance;
- the endpoint never writes to Firestore or any PromptStudio user/history collection;
- the Gemini credential remains server-only in Vercel.

### Response

Successful responses intentionally contain only the funnel payload:

```json
{
  "optimized_prompt": "Create a concise marketing post for a restaurant...",
  "score": 41,
  "link": "https://promptstudioai.in/"
}
```

`score` is the model's 0–100 assessment of the **original** prompt before optimization.

Failures use:

```json
{
  "error": {
    "code": "invalid_prompt",
    "message": "Provide a prompt with at least 3 characters."
  }
}
```

### Integration boundary

The optimize endpoint is read-only from the product's data perspective and stateless with respect to users. It is intentionally a funnel into PromptStudio rather than a parallel account/history product. Saving, history, credits, billing, and authenticated generation stay behind the main website login.

## Existing authenticated generation endpoint

`POST /api/v1/prompt`

The existing v1 endpoint remains a thin compatibility boundary over the credit-aware generation handler. It requires the authenticated Firebase user context and preserves quota, credit, history, request-ID/idempotency, and rate-limit behavior.

## Existing plugin adapter

`POST /api/v1/plugin/image-to-prompt`

This adapter intentionally uses the authenticated v1 generation contract. It is separate from the stateless `/api/v1/optimize` endpoint.
