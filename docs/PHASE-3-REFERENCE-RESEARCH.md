# Phase 3 Reference Research

Date: 2026-08-22

## Why these references
Before implementation, we reviewed successful integration patterns rather than inventing an isolated architecture.

### 1. Intercom + WhatsApp
Intercom treats WhatsApp as a customer-support channel connected to an inbox, with inbound/outbound messaging and automation. Its current documentation requires the WhatsApp Business Platform/API for the integration and a verified Meta Business Account for the full business-number flow.

**Pattern adopted:** WhatsApp should be a channel/adapter into PromptStudio support, not a second customer database or second billing system.

### 2. OpenAI platform / plugin model
OpenAI's current platform direction separates capabilities/apps from the underlying connected systems, with authenticated permissions and actions. Plugins/apps expose workflows while the connected service remains the system of record.

**Pattern adopted:** PromptStudio integrations should expose narrow, permissioned capabilities around our existing core rather than duplicate the entire web application.

### 3. Replicate-style model API
Replicate exposes a consistent API around model inputs/outputs, authentication, prediction execution, and structured model schemas. Image models accept prompt and image inputs and return generated outputs through a stable API contract.

**Pattern adopted:** Define a clean, versioned PromptStudio API contract so web, WhatsApp, and plugins can consume the same Image → Prompt capability.

### 4. Idempotent production API pattern
Successful production APIs use request identifiers/idempotency to prevent retries from causing duplicate side effects. PromptStudio already has a request ID and transactional reservation mechanism in the credit-aware generation endpoint.

**Pattern adopted:** Extend the existing request-ID/idempotency pattern to integrations rather than inventing another mechanism.

## What we will improve beyond the references
- Keep PromptStudio's existing credit/payment authority server-side.
- Use one generation engine for all channels.
- Use one transaction/support record for every customer issue.
- Attach integration source metadata to requests for analytics and debugging.
- Use scoped integration credentials rather than exposing Firebase credentials.
- Keep external integrations intentionally narrow at first.
- Preserve a web-first fallback so integrations can fail without affecting the core product.

## Reference links
- Intercom WhatsApp channel: https://www.intercom.com/help/en/articles/5454490-connect-your-whatsapp-channel
- Intercom WhatsApp channel usage: https://www.intercom.com/help/en/articles/9881312-using-whatsapp-as-a-channel
- OpenAI platform: https://openai.com/api/
- Replicate model API example: https://replicate.com/openai/gpt-image-1/api
