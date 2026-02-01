---
name: supabase-migration
description: Create and apply database migrations to Supabase, verify they succeeded, and fix any migration errors. Use when modifying database schema, adding tables, updating RLS policies, creating migrations, or when the user mentions database, schema, migration, Supabase, tables, or SQL.
---

# Supabase Migration Skill

This skill handles the complete workflow for creating and applying database migrations to Supabase.

## IMPORTANT: Auto-Apply Policy

**Whenever you create or modify a migration file, ALWAYS run `npx supabase db push` automatically.** Do not wait for the user to ask. The user expects database changes to be applied immediately.

## Quick Commands (Use These!)

```bash
# Push all pending migrations (AUTO-RUN AFTER CREATING MIGRATIONS)
npx supabase db push

# Check what migrations are pending
npx supabase migration list

# Generate TypeScript types after schema changes
npx supabase gen types typescript --linked > src/types/database.types.ts

# Run arbitrary SQL query
npx supabase db query "SELECT * FROM table LIMIT 5;"
```

## Migration Workflow

```
Migration Progress:
- [ ] 1. Create migration file
- [ ] 2. Review SQL for correctness
- [ ] 3. Apply migration to Supabase (AUTO - npx supabase db push)
- [ ] 4. Verify migration succeeded
- [ ] 5. Update TypeScript types if needed
- [ ] 6. Fix any issues and retry if needed
```

## Step 1: Create Migration File

Create a new migration in `supabase/migrations/`:

**Naming convention:** `YYYYMMDDHHMMSS_descriptive_name.sql`

**Example:**
```
20260130143000_add_user_preferences.sql
```

Use this bash to get a timestamp:
```bash
date +%Y%m%d%H%M%S
```

## Step 2: Write Migration SQL

Follow these patterns for CentaurOS migrations:

### Create Table Pattern

```sql
-- Create new table
CREATE TABLE IF NOT EXISTS public.feature_name (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id UUID NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Your columns
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Add comment
COMMENT ON TABLE public.feature_name IS 'Description of what this table stores';

-- Enable RLS (REQUIRED for all tables)
ALTER TABLE public.feature_name ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "users_view_own_data" ON public.feature_name
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "users_manage_own_data" ON public.feature_name
  FOR ALL USING (user_id = auth.uid());

-- For service role access
CREATE POLICY "service_role_full_access" ON public.feature_name
  FOR ALL USING (auth.role() = 'service_role');

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_feature_name_user_id ON public.feature_name(user_id);
CREATE INDEX IF NOT EXISTS idx_feature_name_created_at ON public.feature_name(created_at DESC);
```

### Alter Table Pattern

```sql
-- Add column
ALTER TABLE public.existing_table 
  ADD COLUMN IF NOT EXISTS new_column TEXT;

-- Add column with default
ALTER TABLE public.existing_table 
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending' NOT NULL;

-- Add foreign key
ALTER TABLE public.existing_table 
  ADD COLUMN IF NOT EXISTS related_id UUID REFERENCES public.other_table(id);
```

### Create Function Pattern

```sql
-- Create or replace function
CREATE OR REPLACE FUNCTION public.my_function(param1 UUID, param2 TEXT)
RETURNS TABLE (id UUID, name TEXT) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT t.id, t.name
  FROM public.some_table t
  WHERE t.user_id = param1;
END;
$$;
```

### Atomic Balance/Counter Function Pattern

For atomic operations that update balances or counters (from billing implementation):

```sql
-- Function for atomic balance adjustment with audit trail
CREATE OR REPLACE FUNCTION public.adjust_account_balance(
  p_user_id UUID,
  p_amount DECIMAL,
  p_transaction_type TEXT,
  p_stripe_payment_intent_id TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS TABLE (success BOOLEAN, new_balance DECIMAL, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_balance DECIMAL;
  v_new_balance DECIMAL;
BEGIN
  -- Lock the row for update (prevents race conditions)
  SELECT balance INTO v_current_balance
  FROM public.account_balances
  WHERE user_id = p_user_id
  FOR UPDATE;
  
  -- Create account if doesn't exist
  IF v_current_balance IS NULL THEN
    INSERT INTO public.account_balances (user_id, balance)
    VALUES (p_user_id, 0)
    ON CONFLICT (user_id) DO NOTHING;
    v_current_balance := 0;
  END IF;
  
  -- Calculate new balance
  v_new_balance := v_current_balance + p_amount;
  
  -- Prevent negative balance (if required)
  IF v_new_balance < 0 THEN
    RETURN QUERY SELECT false, v_current_balance, 'Insufficient balance'::TEXT;
    RETURN;
  END IF;
  
  -- Update balance
  UPDATE public.account_balances
  SET balance = v_new_balance, updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- Create transaction record
  INSERT INTO public.balance_transactions (
    user_id, amount, transaction_type, 
    stripe_payment_intent_id, description,
    balance_before, balance_after
  ) VALUES (
    p_user_id, p_amount, p_transaction_type,
    p_stripe_payment_intent_id, p_description,
    v_current_balance, v_new_balance
  );
  
  RETURN QUERY SELECT true, v_new_balance, NULL::TEXT;
END;
$$;
```

### Trigger Function Pattern

For auto-updating timestamps and derived data:

```sql
-- Generic updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to a table
CREATE TRIGGER update_feature_updated_at
  BEFORE UPDATE ON public.feature_name
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
```

### Metrics Calculation Trigger Pattern

For auto-calculating aggregated metrics (from blueprints):

```sql
-- Function to recalculate coverage metrics
CREATE OR REPLACE FUNCTION public.calculate_blueprint_coverage()
RETURNS TRIGGER AS $$
DECLARE
  v_blueprint_id UUID;
  v_total_domains INTEGER;
  v_covered_domains INTEGER;
  v_coverage_score DECIMAL;
BEGIN
  -- Get blueprint_id from affected row
  IF TG_OP = 'DELETE' THEN
    v_blueprint_id := OLD.blueprint_id;
  ELSE
    v_blueprint_id := NEW.blueprint_id;
  END IF;
  
  -- Calculate metrics
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE coverage_status = 'covered')
  INTO v_total_domains, v_covered_domains
  FROM public.blueprint_domains
  WHERE blueprint_id = v_blueprint_id;
  
  -- Calculate percentage
  v_coverage_score := CASE 
    WHEN v_total_domains > 0 
    THEN (v_covered_domains::DECIMAL / v_total_domains) * 100
    ELSE 0 
  END;
  
  -- Update blueprint with new metrics
  UPDATE public.blueprints
  SET 
    total_domains = v_total_domains,
    covered_domains = v_covered_domains,
    coverage_score = v_coverage_score,
    updated_at = NOW()
  WHERE id = v_blueprint_id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger on domain changes
DROP TRIGGER IF EXISTS trigger_blueprint_coverage ON public.blueprint_domains;
CREATE TRIGGER trigger_blueprint_coverage
  AFTER INSERT OR UPDATE OR DELETE ON public.blueprint_domains
  FOR EACH ROW
  EXECUTE FUNCTION public.calculate_blueprint_coverage();
```

### RPC Function for Complex Queries

When you need parameterized queries callable from client:

```sql
-- Get platform fee based on role and order type
CREATE OR REPLACE FUNCTION public.get_platform_fee_percent(
  p_role TEXT,
  p_order_type TEXT DEFAULT 'default'
)
RETURNS DECIMAL
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN COALESCE(
    (SELECT fee_percent 
     FROM public.fee_configuration 
     WHERE role = p_role AND order_type = p_order_type),
    (SELECT fee_percent 
     FROM public.fee_configuration 
     WHERE role = 'default' AND order_type = p_order_type),
    8.0  -- Fallback default
  );
END;
$$;
```

### Calling Functions from TypeScript

```typescript
// Call RPC function
const { data, error } = await supabase.rpc('get_platform_fee_percent', {
  p_role: 'executive',
  p_order_type: 'retainer',
})

// Call function that returns table rows
const { data, error } = await supabase.rpc('adjust_account_balance', {
  p_user_id: userId,
  p_amount: 1000,
  p_transaction_type: 'top_up',
  p_description: 'Account balance top-up',
})

if (data?.[0]?.success) {
  console.log('New balance:', data[0].new_balance)
}
```

## Step 3: Apply Migration (AUTO-RUN!)

**ALWAYS run this after creating a migration file:**

```bash
npx supabase db push
```

This will:
1. Connect to your remote Supabase instance
2. Show pending migrations
3. Apply them automatically (answers Y to prompts)

If there are errors, fix the SQL and run again.

## Step 4: Verify Migration

After applying, verify the migration worked:

```bash
# Check migration was applied
npx supabase migration list

# Test table exists
npx supabase db query "SELECT COUNT(*) FROM public.new_table;"
```

## Step 5: Update TypeScript Types (Optional)

If you added new tables/columns that need type-safe access:

```bash
npx supabase gen types typescript --linked > src/types/database.types.ts
```

## Step 6: Fix Migration Errors

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `relation already exists` | Table exists | Use `IF NOT EXISTS` |
| `policy already exists` | Policy name conflict | Use `DROP POLICY IF EXISTS` first |
| `column does not exist` | Typo or missing column | Check spelling |
| `violates foreign key` | Referenced row missing | Add data first or make nullable |
| `permission denied` | RLS blocking | Check RLS policies |

### Error: Policy Already Exists

```sql
-- Drop existing policy first
DROP POLICY IF EXISTS "policy_name" ON public.table_name;

-- Then create new one
CREATE POLICY "policy_name" ON public.table_name ...
```

### Error: Trigger Already Exists

```sql
DROP TRIGGER IF EXISTS trigger_name ON public.table_name;
CREATE TRIGGER trigger_name ...
```

## RLS Policy Patterns for CentaurOS

### User-owned data
```sql
CREATE POLICY "users_manage_own" ON public.table
  FOR ALL USING (user_id = auth.uid());
```

### Foundry-scoped data
```sql
CREATE POLICY "foundry_access" ON public.table
  FOR ALL USING (
    foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
  );
```

### Service role full access
```sql
CREATE POLICY "service_full_access" ON public.table
  FOR ALL USING (auth.role() = 'service_role');
```

### Authenticated read, restricted write
```sql
CREATE POLICY "authenticated_read" ON public.table
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "owner_write" ON public.table
  FOR INSERT WITH CHECK (user_id = auth.uid());
```

## Migration Checklist

Before considering a migration complete:

- [ ] SQL uses `IF NOT EXISTS` / `IF EXISTS` for idempotency
- [ ] Table has RLS enabled
- [ ] RLS policies cover required access patterns
- [ ] Service role has access if needed by server actions
- [ ] Indexes created for frequently queried columns
- [ ] `npx supabase db push` ran successfully

## Troubleshooting

### Migration won't apply
```bash
# Check if you're linked to the right project
npx supabase status

# Re-link if needed
npx supabase link --project-ref YOUR_PROJECT_REF
```

### Need to check current schema
```bash
npx supabase db query "
  SELECT table_name 
  FROM information_schema.tables 
  WHERE table_schema = 'public' 
  ORDER BY table_name;
"
```

### Need to see table columns
```bash
npx supabase db query "
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_name = 'your_table'
  ORDER BY ordinal_position;
"
```

---

## When to Use This Skill

Use this skill when:

1. **Adding new database tables** - New features requiring data storage
2. **Modifying existing tables** - Adding columns, changing types, or constraints
3. **Creating RLS policies** - Access control for new or existing tables
4. **Adding database functions** - Stored procedures, triggers, or RPC functions
5. **Schema troubleshooting** - Migration errors or RLS issues

## When NOT to Use

| Situation | Use Instead |
|-----------|-------------|
| Fixing bugs not related to schema | [bug-fix-workflow](../bug-fix-workflow/SKILL.md) |
| Full feature implementation | [feature-implementation-guide](../feature-implementation-guide/SKILL.md) |
| Security audit of RLS policies | [secure-database](../secure-database/SKILL.md) |
| TypeScript type issues | [code-quality](../code-quality/SKILL.md) |
| Deploying to production | [vercel-deploy](../vercel-deploy/SKILL.md) |

## Quick Reference

| Task | Command/Action |
|------|----------------|
| **Create migration file** | `date +%Y%m%d%H%M%S` → create `supabase/migrations/{timestamp}_name.sql` |
| **Push migrations** | `npx supabase db push` |
| **List pending migrations** | `npx supabase migration list` |
| **Regenerate TS types** | `npx supabase gen types typescript --linked > src/types/database.types.ts` |
| **Run arbitrary SQL** | `npx supabase db query "SELECT ..."` |
| **Check project link** | `npx supabase status` |
| **Re-link project** | `npx supabase link --project-ref YOUR_REF` |
| **View table schema** | `npx supabase db query "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'table'"` |

## Troubleshooting

### Issue: "relation already exists" error

**Cause:** Table or object created in a previous migration run

**Fix:**
```sql
-- Use IF NOT EXISTS for tables
CREATE TABLE IF NOT EXISTS public.my_table (...);

-- For policies, drop first
DROP POLICY IF EXISTS "policy_name" ON public.my_table;
CREATE POLICY "policy_name" ON public.my_table ...;
```

### Issue: RLS blocking all queries (empty results)

**Cause:** RLS enabled but no policy allows access

**Fix:**
1. Check existing policies: `SELECT * FROM pg_policies WHERE tablename = 'table_name';`
2. Verify user has `foundry_id` in metadata matching the row
3. Add appropriate policy:
```sql
CREATE POLICY "allow_access" ON public.my_table
  FOR ALL USING (foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid()));
```
4. For server actions, ensure service role policy exists

### Issue: TypeScript errors after migration

**Cause:** Database types out of sync with new schema

**Fix:**
```bash
# Always run after schema changes
npx supabase gen types typescript --linked > src/types/database.types.ts

# Then check for type errors
npx tsc --noEmit
```

## Related Skills

- [secure-database](../secure-database/SKILL.md) - Security checklist for RLS policies and database operations
- [feature-implementation-guide](../feature-implementation-guide/SKILL.md) - Full workflow for implementing features with database changes
- [bug-fix-workflow](../bug-fix-workflow/SKILL.md) - Debug RLS and database-related bugs
- [vercel-deploy](../vercel-deploy/SKILL.md) - Deploy migrations to production
