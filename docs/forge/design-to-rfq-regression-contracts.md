# Forge Design → RFQ Regression Contracts

This document summarizes the release-contract regression guards that protect critical Design-to-RFQ behavior from silent drift.

## Why this exists

As the release packet grows, some failures are best caught by low-cost contract tests (doc + config + payload guardrails) instead of relying only on end-to-end smoke checks.

## Contract Guards in `npm run test:forge-rfq`

### 1) Profiles RLS migration contract

- Test: `profiles-rls-migration.test.ts`
- Protects:
  - canonical non-recursive policy names
  - `auth.uid() = id` self-update constraints
  - legacy recursive profiles policies remain explicitly dropped

### 2) Release config contract

- Test: `release-config-consistency.test.ts`
- Protects:
  - login-hero image quality whitelist (`qualities: [75, 90]`)
  - non-deprecated Sentry Next.js config keys
  - prevention of deprecated `disableLogger` reintroduction

### 3) Release docs contract

- Test: `release-docs-consistency.test.ts`
- Protects:
  - full release verify command references remain present
  - migration auth prerequisite (`SUPABASE_ACCESS_TOKEN`) remains documented
  - policy-expression SQL audit + manual SQL fallback instructions stay in rollout docs

### 4) Telemetry event contract

- Test: `telemetry-event-contract-consistency.test.ts`
- Protects:
  - emitted Cad Lab telemetry events stay aligned with telemetry contract documentation
  - rollout alpha event checklist names remain synchronized with code + docs

### 5) Scenario matrix contract

- Test: `scenario-matrix-consistency.test.ts`
- Protects:
  - QA scenario matrix stays aligned with golden benchmark fixtures
  - documented scenario count remains synchronized with benchmark set size

### 6) Manual product-pass results contract

- Test: `manual-product-pass-results-consistency.test.ts`
- Protects:
  - published product-pass results table stays aligned with benchmark scenario fixture set
  - release artifact continues to capture smoke-chain evidence and migration blocker context

### 7) Go-live status contract

- Test: `go-live-status-consistency.test.ts`
- Protects:
  - current branch go-live status document tracks all critical release gates
  - migration blocker remains explicit until target environment migration is applied

### 8) Release handoff contract

- Test: `release-handoff-consistency.test.ts`
- Protects:
  - migration-closure runbook retains both authenticated CLI and manual SQL fallback paths
  - policy-expression verification + post-migration verify gate instructions remain explicit
  - release closure handoff continues to require flipping go-live migration gate from pending to pass

### 9) Release snapshot consistency contract

- Test: `release-snapshot-consistency.test.ts`
- Protects:
  - go-live status verification snapshot stays synchronized with QA report snapshot
  - release timestamp + commit evidence do not drift across launch artifacts

### 10) Release workflow consistency contract

- Test: `release-workflow-consistency.test.ts`
- Protects:
  - manual GitHub release-operations workflow retains verify + migration execution paths
  - required migration secrets and documentation references remain aligned

### 11) Migration closure report contract

- Test: `migration-closure-report-consistency.test.ts`
- Protects:
  - migration closure artifact keeps required SQL verification evidence sections
  - release closure remains tied to explicit policy-expression checks and verify command output

### 12) Profiles RLS verification script contract

- Test: `profiles-rls-verification-script-consistency.test.ts`
- Protects:
  - canonical SQL verification script retains policy-name and policy-expression checks
  - non-recursive helper constraints remain explicitly encoded for operators

## Operational Usage

Run:

```bash
npm run test:forge-rfq:contracts
```

or as part of the full release gate:

```bash
npm run test:forge-rfq
```

This command now validates both product logic regressions and release-contract drift risks before staging or production rollout.

`npm run verify:forge-rfq-release` now executes this contract suite first before running the full regression + E2E smoke chain.

## Focused Contract Suite Inventory (`test:forge-rfq:contracts`)

- `profiles-rls-migration.test.ts`
- `profiles-rls-verification-script-consistency.test.ts`
- `manual-product-pass-results-consistency.test.ts`
- `migration-closure-report-consistency.test.ts`
- `go-live-status-consistency.test.ts`
- `release-config-consistency.test.ts`
- `release-docs-consistency.test.ts`
- `release-handoff-consistency.test.ts`
- `release-packet-consistency.test.ts`
- `release-snapshot-consistency.test.ts`
- `release-verify-script-consistency.test.ts`
- `release-workflow-consistency.test.ts`
- `scenario-matrix-consistency.test.ts`
- `telemetry-event-contract-consistency.test.ts`
