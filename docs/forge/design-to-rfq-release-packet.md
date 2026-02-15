# Forge Design → Drawings → RFQ Release Packet

This packet is the final handoff bundle for launch readiness.

## Included Artifacts

- Rollout checklist: `docs/forge/design-to-rfq-rollout-checklist.md`
- Demo walkthrough: `docs/forge/design-to-rfq-demo-script.md`
- Changelog: `docs/forge/design-to-rfq-changelog.md`
- Telemetry event contract: `docs/forge/design-to-rfq-telemetry-events.md`
- QA execution report: `docs/forge/design-to-rfq-qa-report.md`
- Scenario matrix: `docs/forge/design-to-rfq-scenario-matrix.md`
- Migration verification runbook: `docs/forge/design-to-rfq-migration-verification.md`

## Release Gate Commands

### 1) Core RFQ quality regression

```bash
npm run test:forge-rfq
```

### 2) E2E smoke for login + Cad Lab landing

```bash
npm run test:forge-rfq:e2e-smoke
```

Includes:
- auth setup state generation
- Cad Lab landing smoke
- Forge entrypoint recommendation smoke

### 3) One-command release verification

```bash
npm run verify:forge-rfq-release
```

## Required Database Migration

Apply before rollout to eliminate profile policy recursion noise:

- `supabase/migrations/20260215120000_stabilize_profiles_rls_no_recursion.sql`

## Sign-off Checklist

- [ ] All release gate commands pass.
- [ ] DB migration applied in target environment.
- [ ] Demo walkthrough executed once in staging.
- [ ] Telemetry events visible in activity stream.
- [ ] No unresolved P0/P1 issues for RFQ creation flow.
