# PromptStudio Feature Registry

`features.js` is the single source of truth for product capability flags and plan access.

## Phases

- `core`: verified capabilities that are active now.
- `core-next`: next intelligence capabilities under implementation, currently disabled until their full pipeline exists.
- `upcoming`: planned product capabilities that should remain off until implemented and tested.

## Access model

`enabled` answers whether the capability is currently live.

`plans` answers which subscription plans may use it once live.

Use `isFeatureActive(featureId)` for simple global checks and `evaluateFeatureAccess(featureId, userPlan)` when the UI needs plan-aware access.

Do not use this registry as the server-side security boundary for paid features. Server/API authorization must independently enforce Pro-only capabilities when those features become active.
