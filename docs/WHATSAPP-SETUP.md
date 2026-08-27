# PromptStudio WhatsApp — Setup

## Current status

WhatsApp infrastructure is implemented on `development`. WhatsApp number authentication and Meta credentials are intentionally postponed.

## Webhook endpoint

`GET/POST https://promptstudioai.in/api/webhooks/whatsapp`

## Meta configuration after authentication

Configure these as server-side deployment environment variables:

- `WHATSAPP_VERIFY_TOKEN` — private webhook verification token.
- `WHATSAPP_APP_SECRET` — Meta app secret for `X-Hub-Signature-256` validation.
- `WHATSAPP_ACCESS_TOKEN` — Meta Cloud API access token. Never expose it to the browser.
- `WHATSAPP_PHONE_NUMBER_ID` — Meta phone number ID for the PromptStudio business number.

## Verification flow

1. Meta calls the webhook with `hub.mode`, `hub.verify_token`, and `hub.challenge`.
2. PromptStudio returns the challenge only when the verification token matches.
3. POST events are accepted only when the `X-Hub-Signature-256` signature validates.
4. Verified events are acknowledged with HTTP 200.
5. Outbound replies remain disabled until the business number and credentials are configured.

## Customer flow after activation

Customer sends image/message
→ Meta WhatsApp Cloud API
→ PromptStudio webhook
→ existing Image → Prompt engine
→ structured prompt result
→ WhatsApp reply

## Safety

Do not commit access tokens, app secrets, verification tokens, or phone credentials to GitHub. Configure them only in the deployment environment.

Do not change `main` as part of this work.
