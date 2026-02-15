# Forge Design → RFQ Migration Verification (Profiles RLS)

This runbook verifies deployment of:

- `supabase/migrations/20260215120000_stabilize_profiles_rls_no_recursion.sql`

## Apply Migration

Use your normal migration pipeline (Supabase CLI / deployment runner) and ensure this migration is included.

If using CLI directly, ensure `SUPABASE_ACCESS_TOKEN` is available (or run `supabase login`) before:

```bash
npx supabase db push
```

Notes:

- `SUPABASE_SERVICE_ROLE_KEY` is **not** a Supabase CLI access token and cannot be used for `supabase login`.
- If `npx supabase db push` returns `Access token not provided`, authenticate with a personal access token (`sbp_...`) or use manual SQL execution below.
- If your project does not expose an admin RPC like `exec_sql`, apply the migration through CLI auth or SQL editor; REST RPC fallback will not be available.
- `SUPABASE_SERVICE_ROLE_KEY` is also **not** the database password for pooler `--db-url` auth; attempting `db push --db-url` with it fails password authentication.
- Supabase management SQL API with `SUPABASE_SERVICE_ROLE_KEY` bearer auth fails (`401`, `JWT could not be decoded`); management endpoints also require a proper PAT context.

If CLI auth is unavailable in your execution environment:

1. Open Supabase SQL editor for the target project.
2. Paste the contents of:
   - `supabase/migrations/20260215120000_stabilize_profiles_rls_no_recursion.sql`
3. Execute the SQL manually.

## Verify Policies in SQL

Run in SQL editor:

```sql
select policyname, permissive, roles, cmd
from pg_policies
where schemaname = 'public'
  and tablename = 'profiles'
order by policyname;
```

Expected profiles policies include:

- `profiles_select_authenticated`
- `profiles_update_own`

Legacy policy names should not appear (e.g. `Active users can view profiles in their foundry`).

## Verify Policy Expressions (No Recursive Helpers)

Run:

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

- no `get_my_foundry_id(` in any policy expression
- no `is_active_user(` in any policy expression
- `profiles_update_own` uses `auth.uid() = id` for both `USING` and `WITH CHECK`

## Runtime Verification

1. Sign in as founder account.
2. Visit:
   - `/the-forge`
   - `/the-forge/cad-lab`
3. Confirm there are no repeated logs of:
   - `infinite recursion detected in policy for relation "profiles"`

## Post-Migration Smoke

Run:

```bash
npm run test:forge-rfq:e2e-smoke
```

Expected:

- auth setup passes
- Cad Lab visual smoke passes
- Forge entrypoint smoke passes
