# Feature Registry Verification

Before enabling any `core-next` or `upcoming` feature:

1. Verify the implementation is complete.
2. Verify UI access through `evaluateFeatureAccess`.
3. Verify server/API authorization for any paid capability.
4. Verify existing quota and rollback behavior.
5. Test the feature on both free and Pro plans where applicable.
6. Only then change `enabled` to `true`.
