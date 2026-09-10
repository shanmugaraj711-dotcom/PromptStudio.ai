# Unified Workspace SPA Migration Plan

## UX target

Keep `/dashboard` as the persistent application shell. Selecting a capability changes the active workspace in place instead of sending the user to another page and asking them to submit the same idea again.

## Interaction model

1. The shared brief is entered once at the top of the dashboard.
2. Workspace tabs change local React state only.
3. The active module renders directly below the controls.
4. Trend prompts inject into the shared brief without navigation.
5. Generation/payment/edit actions remain inside their purpose-built module.
6. Existing deep-link routes remain available for direct access and backwards compatibility.

## Module ownership

- Prompt Lab: existing prompt builder generation service and ResultCard.
- Image Intel: existing prompt builder visual-analysis path with inline image staging.
- Code Lab: existing Reference Coding backend/service with inline screenshot and output controls.
- Studio: existing structured Studio job, deterministic renderer, preview, edit and payment flow.
- APK Forge: existing Forge request, Razorpay checkout and delivery pipeline.

## Transition strategy

- Use React `lazy`/`Suspense` for heavier workspaces to keep the initial dashboard responsive.
- Use a short CSS layout/opacity/translate transition when the active workspace changes.
- Respect `prefers-reduced-motion`.
- Avoid full-page transitions for ordinary workspace changes.

## Routing policy

Navigation is retained only where it represents a genuine document/state boundary (authentication, legal pages, account management, direct deep links). Capability selection from the dashboard is state-driven.

## Backend policy

No API contracts are moved as part of the UX migration. Existing services remain the source of truth. The frontend calls the same authenticated service functions already used by the dedicated pages, reducing regression risk.

## Verification checklist

- [ ] Dashboard capability selection never changes `window.location`.
- [ ] Shared brief survives workspace switching.
- [ ] Trend injection updates the shared brief immediately.
- [ ] Prompt generation returns in the active panel.
- [ ] Image reference upload remains functional.
- [ ] Code Lab calls the existing Reference Coding endpoint.
- [ ] Studio receives the shared brief without query-string handoff.
- [ ] APK Forge receives the shared brief without query-string handoff.
- [ ] Payment and delivery flows remain server-authoritative.
- [ ] Direct `/studio`, `/apk-forge`, `/reference-coding`, `/builder` links remain backwards compatible.
- [ ] Production build passes before merging to `main`.
