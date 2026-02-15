# Forge Design → RFQ Release Handoff (Ops Runbook)

This runbook is the operator checklist for closing the final external blocker and completing launch sign-off.

## Objective

Move the release from **migration pending** to **go-live ready** in the target environment.

## Preconditions

- Target environment/project access is available.
- Migration file exists and is unchanged:
  - `supabase/migrations/20260215120000_stabilize_profiles_rls_no_recursion.sql`
- Latest local gate evidence already captured:
  - `npm run verify:forge-rfq-release` PASS
- Auth caveat:
  - `SUPABASE_SERVICE_ROLE_KEY` is not valid for Supabase management SQL API auth (`/database/query` returns `401` / `JWT could not be decoded`).
  - use PAT-backed CLI auth or manual SQL editor fallback.

## Path A — Authenticated Supabase CLI (preferred)

1. Authenticate Supabase CLI with a personal access token (`sbp_...`):

   ```bash
   export SUPABASE_ACCESS_TOKEN="<your_sbp_token>"
   ```

2. Apply migrations:

   ```bash
   npx supabase db push
   ```

3. Confirm migration applied successfully (no auth errors, no SQL failures).

## Path A2 — GitHub Actions migration runner (optional)

You can also run the manual workflow:

- `.github/workflows/forge-rfq-release-operations.yml`
- Trigger with:
  - `apply_migration = true`
  - optional `run_release_verify = true`
- Note: GitHub only allows workflow_dispatch for workflows present on the default branch. If this workflow only exists on a feature branch, merge first.

Required repository secrets:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF`
- `SUPABASE_DB_PASSWORD`

## Path B — Manual SQL editor fallback

Use this path when CLI PAT auth is unavailable in the runtime environment.

1. Open Supabase dashboard SQL editor for the target project.
2. Paste contents of:
   - `supabase/migrations/20260215120000_stabilize_profiles_rls_no_recursion.sql`
3. Execute SQL and confirm success.

## Mandatory Post-Apply Verification

Run policy checks in SQL editor:

```sql
select policyname, permissive, roles, cmd
from pg_policies
where schemaname = 'public'
  and tablename = 'profiles'
order by policyname;
```

Expected policies include:

- `profiles_select_authenticated`
- `profiles_update_own`

Then validate policy expressions:

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

Expected:

- no `get_my_foundry_id(` references
- no `is_active_user(` references
- `profiles_update_own` remains `auth.uid() = id` in `USING` and `WITH CHECK`

## Final Release Verification

After migration apply in target environment:

```bash
npm run verify:forge-rfq-release
```

## Required Artifact Updates After Successful Staging Verification

1. Update go-live status:
   - set migration gate from `⛔ PENDING` to `✅ PASS`
   - refresh verification snapshot timestamp + commit hash
2. Update release packet sign-off checklist:
   - mark migration and policy-audit checklist items complete
3. Update migration closure report:
   - fill execution metadata + SQL verification output sections in `design-to-rfq-migration-closure-report.md`
4. Update manual product pass results artifact status if staging run generated new evidence.

## Evidence to attach in release review

- CLI or SQL editor confirmation of migration apply
- SQL query outputs for policy name + expression checks
- `npm run verify:forge-rfq-release` output from target environment
- Updated go-live status and release packet checklist state
