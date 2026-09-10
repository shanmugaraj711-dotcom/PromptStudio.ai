# Unified Workspace SPA Migration Plan

## UX target

Keep `/dashboard` as the persistent application shell. Selecting a capability changes the active workspace in place instead of sending the user to another page and asking them to submit the same idea again.

## Interaction model

1. The shared brief is entered once at the top of the dashboard.
2. Enter (without Shift) or **Go** runs the active creation engine.
3. The active result surface is revealed with smooth scrolling after generation.
4. Workspace controls change local React state only; they do not navigate.
5. Live Signal injects current location-aware topics into the shared brief.
6. Generation/payment/edit actions remain inside their purpose-built module.
7. Existing deep-link routes remain available for direct access and backwards compatibility.

## Primary header

The authenticated shell has exactly five core actions:

- Dashboard
- Manage Plan
- Help
- History
- Logout

Creation engines are workspace controls inside Dashboard, not global navigation tabs.

## Live Signal

`/api/live-signal` authenticates the current user and retrieves location-aware live topics. Supported Indian regions use Google Trends daily-trend data. Custom locations use live Google News RSS topic coverage rather than fabricated/curated placeholder trends. Browser location can be used with explicit permission and is reverse-geocoded server-side.

The UI clearly identifies the source and timestamp and does not claim a live signal when the provider returns no data.

## Module ownership

- Prompt Lab: existing prompt builder generation service and ResultCard.
- Image Intel: existing prompt builder visual-analysis path with inline image staging.
- Code Lab: existing Reference Coding backend/service with inline screenshot and output controls.
- Studio: existing structured Studio job, deterministic renderer, preview, edit and payment flow.
- APK Forge: existing Forge request, Razorpay checkout and delivery pipeline.

## Motion and accessibility

- Use React `lazy`/`Suspense` for heavier workspaces to keep the initial dashboard responsive.
- Use a short CSS opacity/translate/scale transition when the active workspace changes.
- Use `scrollIntoView({ behavior: "smooth" })` for generated content.
- Respect `prefers-reduced-motion` for both transitions and scrolling.

## Architecture rule

The dashboard is the orchestration layer. The shared brief is the single source of truth for the current creation intent. Workspace modules remain purpose-built and own their domain-specific API calls, validation, payments, and previews.

## Verification checklist

- [ ] Dashboard capability selection never changes `window.location`.
- [ ] Shared brief survives workspace switching.
- [ ] Enter/Go executes the active engine.
- [ ] Generated content is automatically revealed.
- [ ] Live Signal returns provider-backed location-aware topics.
- [ ] Live Signal supports Tamil Nadu, major Indian regions, custom locations, and browser location permission.
- [ ] Prompt generation returns in the active panel.
- [ ] Image reference upload remains functional.
- [ ] Code Lab calls the existing Reference Coding endpoint.
- [ ] Studio receives the shared brief without query-string handoff.
- [ ] APK Forge receives the shared brief without query-string handoff.
- [ ] Payment and delivery flows remain server-authoritative.
- [ ] Direct `/studio`, `/apk-forge`, `/reference-coding`, `/builder` links remain backwards compatible.
- [ ] Production build passes before merging to `main`.
