# PromptStudio External Integrations

This directory is reserved for adapters that expose PromptStudio intelligence to external creator workflows.

## Canonical flow
External platform → adapter → PromptStudio API → Image → Prompt engine → structured result.

Adapters must remain thin. They must not duplicate AI generation, credits, payments, Firebase Admin access, or Firestore writes.

## v1 contract
Action: `Analyze Image`

The canonical request and response shape is documented in `docs/PLUGIN-CONTRACT.md` and `docs/PHASE-4-INTEGRATIONS.md`.

Platform-specific implementation should be added only after the target platform's current authentication and extension/API requirements are verified.
