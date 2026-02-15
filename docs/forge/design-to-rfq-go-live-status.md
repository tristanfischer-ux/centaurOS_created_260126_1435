# Forge Design → RFQ Go-Live Status (Current Branch)

This status page captures the current release readiness state for the Design → Drawings → RFQ rollout.

## Verification Snapshot

- Last verified at (UTC): `2026-02-15 18:35:48 UTC`
- Branch head at verification: `7b85c74a`
- Verification command: `npm run verify:forge-rfq-release`
- Verification environment: `SUPABASE_ACCESS_TOKEN=missing` (migration apply remains blocked in this runtime)

## Gate Status

| Gate | Status | Evidence |
| --- | --- | --- |
| Contract drift checks (`test:forge-rfq:contracts`) | ✅ PASS | Included in `verify:forge-rfq-release` |
| Core regression bundle (`test:forge-rfq`) | ✅ PASS | Included in `verify:forge-rfq-release` |
| End-to-end smoke bundle (`test:forge-rfq:e2e-smoke`) | ✅ PASS | Included in `verify:forge-rfq-release` |
| One-command release verification (`verify:forge-rfq-release`) | ✅ PASS | Latest local execution completed successfully |
| Five-scenario product pass results artifact | ✅ PASS | `design-to-rfq-manual-product-pass-results.md` |
| Release operations workflow available on default branch | ⛔ PENDING | PR #36 is ready for review with merge state `UNSTABLE`; workflow dispatch requires merge to `main` |
| Migration closure report artifact | ⛔ PENDING | `design-to-rfq-migration-closure-report.md` must be updated with target SQL outputs |
| Profiles RLS migration applied in target environment | ⛔ PENDING | Requires Supabase CLI PAT (`SUPABASE_ACCESS_TOKEN`) or manual SQL editor execution |

## Active Blocker

- **Pending external action:** apply `20260215120000_stabilize_profiles_rls_no_recursion.sql` in target environment.
- **Pending release operations action:** clear branch protections/checks and merge PR #36 to `main` so `.github/workflows/forge-rfq-release-operations.yml` can be dispatched.
- Current runtime lacks Supabase CLI PAT auth; documented fallback is manual SQL execution in Supabase dashboard.
- Migration closure report still requires target-environment SQL verification evidence attachment.
- Execute `docs/forge/design-to-rfq-release-handoff.md` in staging/target to close migration and sign-off gates.

## Immediate Next Action

1. Satisfy required checks and merge `cursor/forge-design-to-rfq-fc87` into `main`.
2. Execute `docs/forge/design-to-rfq-release-handoff.md` in staging/target environment.
3. Apply migration in staging via authenticated runner/dashboard.
4. Optionally trigger `.github/workflows/forge-rfq-release-operations.yml` with `apply_migration=true` for managed CI execution.
5. Capture SQL verification outputs in `design-to-rfq-migration-closure-report.md`.
6. Re-run `npm run verify:forge-rfq-release` in staging environment.
7. Mark release packet sign-off checklist items complete.
