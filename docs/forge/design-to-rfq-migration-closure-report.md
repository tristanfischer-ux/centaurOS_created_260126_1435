# Forge Design → RFQ Migration Closure Report

Use this artifact to record completion evidence for the profiles RLS stabilization migration in the target environment.

## Execution Metadata

- Environment:
- Project ref:
- Applied by:
- Applied at (UTC):
- Execution path:
  - [ ] Authenticated CLI (`supabase db push`)
  - [ ] Manual SQL editor
  - [ ] GitHub Actions release operations workflow

## Migration Applied

- Migration file:
  - `supabase/migrations/20260215120000_stabilize_profiles_rls_no_recursion.sql`
- Apply command or dashboard note:
- Outcome:
  - [ ] PASS
  - [ ] FAIL
- Error notes (if any):

## Policy Verification Output

Record output (or screenshot reference) for:

```sql
select policyname, permissive, roles, cmd
from pg_policies
where schemaname = 'public'
  and tablename = 'profiles'
order by policyname;
```

Expected policies:

- `profiles_select_authenticated`
- `profiles_update_own`

## Policy Expression Verification Output

Record output for:

```sql
select
  policyname,
  coalesce(qual, '') as using_expression,
  coalesce(with_check, '') as with_check_expression
from pg_policies
where schemaname = 'public'
  and tablename = 'profiles'
order by policyname;
```

Checks:

- [ ] No `get_my_foundry_id(` references
- [ ] No `is_active_user(` references
- [ ] `profiles_update_own` uses `auth.uid() = id` in both clauses

## Post-Migration Verification

- `npm run verify:forge-rfq-release` in target environment:
  - [ ] PASS
  - [ ] FAIL
- Verification run timestamp (UTC):
- Verification run commit hash:

## Release Checklist Impact

- [ ] Go-live status migration gate flipped from `⛔ PENDING` to `✅ PASS`
- [ ] Release packet sign-off checklist migration items marked complete
- [ ] QA report notes updated with migration closure reference

## Linked Runbooks and Status Artifacts

- Release handoff runbook: `docs/forge/design-to-rfq-release-handoff.md`
- Go-live status tracker: `docs/forge/design-to-rfq-go-live-status.md`
- Release packet checklist: `docs/forge/design-to-rfq-release-packet.md`
- SQL verification query file: `docs/forge/profiles-rls-verification.sql`
