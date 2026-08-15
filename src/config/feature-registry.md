# Feature Registry

The central registry is `src/config/features.js`.

- Use `isFeatureActive(featureId)` for simple enabled/disabled checks.
- Use `evaluateFeatureAccess(featureId, userPlan)` for plan-aware access.
- `core` capabilities are live.
- `core-next` capabilities are planned next and remain disabled until fully implemented.
- `upcoming` capabilities remain disabled until implemented and verified.

Paid access must also be enforced server-side when a paid feature becomes active.