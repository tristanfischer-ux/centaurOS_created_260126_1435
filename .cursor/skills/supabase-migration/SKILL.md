---
name: supabase-migration
description: Create and apply database migrations to Supabase, verify they succeeded, and fix any migration errors. Use when modifying database schema, adding tables, updating RLS policies, creating migrations, or when the user mentions database, schema, migration, Supabase, tables, or SQL.
---

# Supabase Migration Skill

This skill handles the complete workflow for creating and applying database migrations to Supabase.

## Migration Workflow

```
Migration Progress:
- [ ] 1. Create migration file
- [ ] 2. Review SQL for correctness
- [ ] 3. Apply migration to Supabase
- [ ] 4. Verify migration succeeded
- [ ] 5. Update TypeScript types if needed
- [ ] 6. Fix any issues and retry if needed
```

## Step 1: Create Migration File

Create a new migration in `supabase/migrations/`:

```bash
# Generate timestamp for migration name
TIMESTAMP=$(date +%Y%m%d%H%M%S)
echo "Migration: supabase/migrations/${TIMESTAMP}_description.sql"
```

**Naming convention:** `YYYYMMDDHHMMSS_descriptive_name.sql`

**Example:**
```
20260130143000_add_user_preferences.sql
```

## Step 2: Write Migration SQL

Follow these patterns for CentaurOS migrations:

### Create Table Pattern

```sql
-- Create new table
create table public.feature_name (
  id uuid primary key default gen_random_uuid(),
  foundry_id uuid not null references public.foundries(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  
  -- Your columns
  name text not null,
  description text,
  status text default 'active' check (status in ('active', 'inactive', 'archived')),
  
  -- Timestamps
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Add comment
comment on table public.feature_name is 'Description of what this table stores';

-- Enable RLS (REQUIRED for all tables)
alter table public.feature_name enable row level security;

-- Create RLS policies
create policy "Users can view own foundry data"
  on public.feature_name for select
  using (foundry_id = (
    select (raw_user_meta_data->>'foundry_id')::uuid 
    from auth.users 
    where id = auth.uid()
  ));

create policy "Users can insert own foundry data"
  on public.feature_name for insert
  with check (foundry_id = (
    select (raw_user_meta_data->>'foundry_id')::uuid 
    from auth.users 
    where id = auth.uid()
  ));

create policy "Users can update own foundry data"
  on public.feature_name for update
  using (foundry_id = (
    select (raw_user_meta_data->>'foundry_id')::uuid 
    from auth.users 
    where id = auth.uid()
  ));

create policy "Users can delete own foundry data"
  on public.feature_name for delete
  using (foundry_id = (
    select (raw_user_meta_data->>'foundry_id')::uuid 
    from auth.users 
    where id = auth.uid()
  ));

-- Create indexes for common queries
create index idx_feature_name_foundry_id on public.feature_name(foundry_id);
create index idx_feature_name_created_at on public.feature_name(created_at desc);

-- Add updated_at trigger
create trigger set_updated_at
  before update on public.feature_name
  for each row
  execute function public.handle_updated_at();
```

### Alter Table Pattern

```sql
-- Add column
alter table public.existing_table 
  add column new_column text;

-- Add column with default
alter table public.existing_table 
  add column status text default 'pending' not null;

-- Add foreign key
alter table public.existing_table 
  add column related_id uuid references public.other_table(id);

-- Add constraint
alter table public.existing_table 
  add constraint check_status 
  check (status in ('pending', 'active', 'completed'));
```

### Create Function Pattern

```sql
-- Create or replace function
create or replace function public.my_function(param1 uuid, param2 text)
returns table (id uuid, name text) 
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select t.id, t.name
  from public.some_table t
  where t.foundry_id = param1;
end;
$$;

-- Grant execute permission
grant execute on function public.my_function to authenticated;
```

## Step 3: Apply Migration

**Method 1: Supabase CLI (Recommended)**

```bash
# Push all pending migrations
npx supabase db push

# Or push to specific project
npx supabase db push --db-url "postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres"
```

**Method 2: Direct SQL Execution**

If CLI isn't working, run SQL directly:

1. Go to Supabase Dashboard → SQL Editor
2. Paste migration SQL
3. Click "Run"

**Method 3: Use Supabase Studio**

1. Open Supabase Dashboard → Table Editor
2. Make schema changes via UI
3. These changes apply immediately

## Step 4: Verify Migration

After applying, verify the migration worked:

```bash
# List all migrations (local vs remote)
npx supabase migration list

# Check table exists
npx supabase db query "SELECT * FROM public.feature_name LIMIT 1;"

# Verify RLS policies
npx supabase db query "
  SELECT schemaname, tablename, policyname, cmd, qual 
  FROM pg_policies 
  WHERE tablename = 'feature_name';
"
```

**Via Supabase Dashboard:**
1. Table Editor → Check table exists
2. Authentication → Policies → Verify RLS policies

## Step 5: Update TypeScript Types

After schema changes, regenerate types:

```bash
# Generate fresh types from database
npx supabase gen types typescript --project-id [project-ref] > src/types/database.types.ts

# Or if linked
npx supabase gen types typescript --linked > src/types/database.types.ts
```

Then update your application types in `src/types/`:

```typescript
// src/types/feature-name.ts
export interface FeatureName {
  id: string;
  foundry_id: string;
  name: string;
  description: string | null;
  status: 'active' | 'inactive' | 'archived';
  created_at: string;
  updated_at: string;
}
```

## Step 6: Fix Migration Errors

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `relation already exists` | Table exists | Skip or drop first |
| `policy already exists` | Policy name conflict | Drop existing policy first |
| `column does not exist` | Typo or missing column | Check spelling |
| `violates foreign key` | Referenced row missing | Add data first or make nullable |
| `permission denied` | RLS blocking | Use service role or fix policy |

### Error: Migration Failed Partially

If migration partially applied:

```sql
-- Check what was created
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' ORDER BY table_name;

-- Manually complete or rollback
DROP TABLE IF EXISTS public.partially_created_table CASCADE;
```

### Error: RLS Blocking Queries

```sql
-- Temporarily disable RLS (for debugging only)
ALTER TABLE public.table_name DISABLE ROW LEVEL SECURITY;

-- Re-enable after fixing
ALTER TABLE public.table_name ENABLE ROW LEVEL SECURITY;
```

### Creating Rollback Migrations

If you need to undo a migration:

```sql
-- YYYYMMDDHHMMSS_rollback_feature_name.sql
-- Rollback: Drop feature_name table

-- Drop policies first
drop policy if exists "Users can view own foundry data" on public.feature_name;
drop policy if exists "Users can insert own foundry data" on public.feature_name;
drop policy if exists "Users can update own foundry data" on public.feature_name;
drop policy if exists "Users can delete own foundry data" on public.feature_name;

-- Drop table
drop table if exists public.feature_name cascade;
```

## RLS Policy Patterns

See [references/rls-patterns.md](references/rls-patterns.md) for comprehensive RLS policy patterns used in CentaurOS.

## Migration Checklist

Before considering a migration complete:

- [ ] Table created with correct columns
- [ ] Foreign keys reference correct tables
- [ ] RLS enabled on table
- [ ] RLS policies for SELECT, INSERT, UPDATE, DELETE
- [ ] Appropriate indexes created
- [ ] TypeScript types updated
- [ ] Service layer updated to use new schema

## Quick Commands

```bash
# Create new migration file
touch "supabase/migrations/$(date +%Y%m%d%H%M%S)_description.sql"

# Push migrations
npx supabase db push

# Check migration status
npx supabase migration list

# Generate types
npx supabase gen types typescript --linked > src/types/database.types.ts

# Run arbitrary SQL
npx supabase db query "SELECT * FROM table LIMIT 5;"

# Reset database (CAUTION: destroys data)
npx supabase db reset
```
