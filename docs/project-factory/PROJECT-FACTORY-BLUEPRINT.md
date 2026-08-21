# Project Factory — Phase 1 Blueprint

## Purpose

Turn the proven PromptStudio.ai development workflow into a repeatable, evidence-driven automation pipeline for building future software projects.

PromptStudio.ai is the golden reference implementation. Phase 1 captures the workflow as an executable specification without changing production behavior.

## Core Contract

**Human gives intent. The factory plans, executes, tests, repairs, verifies, and reports.**

The factory must never treat an AI statement such as "done" as proof of completion. Completion requires observable evidence.

## Pipeline

1. Intake
2. Requirements normalization
3. Acceptance criteria
4. Architecture and implementation plan
5. Task graph creation
6. Implementation
7. Automated tests
8. Runtime/browser verification
9. Failure diagnosis
10. Targeted repair
11. Regression verification
12. Security/configuration checks
13. Deployment
14. Production smoke test
15. Final evidence report
16. Project checkpoint / handoff

## Stage Contract

| Stage | Input | Output | Required evidence | Pass condition |
|---|---|---|---|---|
| Intake | Natural-language request | Project brief | Captured request | Scope is explicit |
| Requirements | Brief | Requirements | Requirements artifact | No critical ambiguity |
| Acceptance | Requirements | Testable criteria | Criteria list | Every feature has a pass condition |
| Plan | Criteria + repo | Architecture + tasks | Plan artifact | Dependencies and order are explicit |
| Build | Task | Code/config changes | Diff/commit | Buildable change exists |
| Test | Change | Test results | Logs/results | Required tests pass |
| Runtime verify | Running app | Verified behavior | Browser/API evidence | User flow works |
| Diagnose | Failure evidence | Root cause | Diagnosis record | Failure is explained or escalated |
| Repair | Diagnosis | Minimal fix | Diff + retest | Failure is resolved without regression |
| Security | Release candidate | Findings | Security/config checks | No blocking findings |
| Deploy | Release candidate | Deployment | Deployment result | Deployment succeeds |
| Smoke test | Live deployment | Production validation | Live checks | Critical paths work |
| Handoff | All evidence | Final report + checkpoint | Evidence index | Project is reproducible |

## State Machine

```text
INTAKE
  -> SPECIFIED
  -> PLANNED
  -> BUILDING
  -> TESTING
  -> VERIFYING
  -> [PASS] RELEASE_READY
  -> DEPLOYING
  -> LIVE
  -> HANDOFF

TESTING / VERIFYING
  -> [FAIL] DIAGNOSING
  -> REPAIRING
  -> REGRESSION_TESTING
  -> TESTING / VERIFYING

Any stage
  -> [BLOCKED] HUMAN_REVIEW
  -> RESUME
```

## Agent Roles

### Orchestrator
Owns state, ordering, retries, evidence, checkpoints, and escalation. It does not silently skip failed stages.

### Planner
Converts the request into requirements, acceptance criteria, architecture, dependencies, and atomic tasks.

### Builder
Makes the smallest safe implementation changes required by the active task.

### QA
Runs deterministic tests and maps failures back to acceptance criteria.

### Browser/Runtime Verifier
Checks real user flows, API behavior, routing, auth, quotas, payments, and other runtime behavior that static tests cannot prove.

### Debugger
Uses logs, failing tests, diffs, and runtime evidence to identify root causes and propose a targeted fix.

### Security Reviewer
Checks authentication/authorization boundaries, secrets, configuration, exposed endpoints, data access, and production-safe defaults.

### Deployment/Release Worker
Prepares and executes deployment only after release gates pass.

### Final Verifier
Independently checks that requested outcomes are actually true and assembles the evidence report.

## Human Control Policy

- **Automatic:** reversible code edits, tests, lint/build, local verification, documentation, checkpoints.
- **Approval required:** architecture changes with broad blast radius, production configuration changes, migrations with irreversible effects, and production deployment when policy requires it.
- **Human escalation:** missing credentials, ambiguous business decisions, destructive operations, unresolved security findings, or repeated repair loops.

## Evidence Rules

Every task records:

```text
Task ID
Input
Action
Changed files / resources
Command or tool used
Result
Evidence location
Status
Timestamp
```

A task cannot be marked PASS without evidence.

A project cannot be marked COMPLETE unless all required acceptance criteria are PASS or explicitly accepted as a human-approved exception.

## Repair Loop Rules

1. Preserve the failure evidence.
2. Identify the smallest likely root cause.
3. Change only the necessary scope.
4. Re-run the failed check.
5. Re-run affected regression checks.
6. If still failing, update diagnosis rather than repeating blindly.
7. Escalate after a bounded number of unsuccessful repair cycles.

## PromptStudio Golden Flow

The current PromptStudio repository establishes a concrete reference workflow:

- React/Vite/Tailwind client
- Firebase Authentication and Firestore
- Vercel serverless generation API
- Official Gemini SDK for generation
- Shared constants/policy for pricing and quota behavior
- Browser API and Firestore services
- Unit/build/lint checks
- Runtime verification of user-facing flows
- Production deployment and post-deployment validation

Recent work also demonstrates cross-surface verification patterns: referral attribution and reward visibility, transaction history, founder analytics, pricing/quota accuracy, customer-support/payment flows, and launch metadata. These are examples of features that require both backend and UI evidence.

## Project Memory Contract

Every project must retain:

- `project brief`
- `requirements`
- `acceptance criteria`
- `architecture`
- `task graph`
- `decisions`
- `change log`
- `test evidence`
- `runtime evidence`
- `failures and diagnoses`
- `deployment record`
- `final verification`
- `next checkpoint`

The checkpoint must be sufficient for another automation run to resume without reconstructing the entire history.

## Non-Goals for Phase 1

- Do not replace the PromptStudio production architecture.
- Do not introduce an autonomous deployment system yet.
- Do not attempt to support every technology stack.
- Do not claim full autonomy before the workflow is proven on a second project.

## Phase 1 Exit Criteria

Phase 1 is complete when:

- The workflow is documented as stage contracts.
- Every stage has explicit inputs, outputs, evidence, and pass conditions.
- Failure/repair behavior is defined.
- Human escalation boundaries are defined.
- Project memory/checkpoint requirements are defined.
- PromptStudio is identified as the golden reference.
- The specification is version-controlled and reviewable.

## Next Phase

Phase 2 will implement the smallest orchestrator capable of executing this specification against a controlled test project, with persistent state and evidence collection before any production autonomy is introduced.
