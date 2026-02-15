# Forge Design → RFQ Go-Live Status (Current Branch)

This status page captures the current release readiness state for the Design → Drawings → RFQ rollout.

## Gate Status

| Gate | Status | Evidence |
| --- | --- | --- |
| Contract drift checks (`test:forge-rfq:contracts`) | ✅ PASS | Included in `verify:forge-rfq-release` |
| Core regression bundle (`test:forge-rfq`) | ✅ PASS | Included in `verify:forge-rfq-release` |
| End-to-end smoke bundle (`test:forge-rfq:e2e-smoke`) | ✅ PASS | Included in `verify:forge-rfq-release` |
| One-command release verification (`verify:forge-rfq-release`) | ✅ PASS | Latest local execution completed successfully |
| Five-scenario product pass results artifact | ✅ PASS | `design-to-rfq-manual-product-pass-results.md` |
| Profiles RLS migration applied in target environment | ⛔ PENDING | Requires Supabase CLI PAT (`SUPABASE_ACCESS_TOKEN`) or manual SQL editor execution |

## Active Blocker

- **Pending external action:** apply `20260215120000_stabilize_profiles_rls_no_recursion.sql` in target environment.
- Current runtime lacks Supabase CLI PAT auth; documented fallback is manual SQL execution in Supabase dashboard.

## Immediate Next Action

1. Apply migration in staging via authenticated runner/dashboard.
2. Re-run `npm run verify:forge-rfq-release` in staging environment.
3. Mark release packet sign-off checklist items complete.
