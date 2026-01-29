# ⚡ EXECUTE THIS SQL IN SUPABASE DASHBOARD NOW

## Quick Steps (< 2 minutes)

1. **Open Supabase Dashboard**: https://supabase.com/dashboard/project/jyarhvinengfyrwgtskq
2. **Go to SQL Editor** (left sidebar)
3. **Click "New Query"**
4. **Copy/paste the SQL below**
5. **Click "Run" or press Cmd+Enter**

---

## SQL to Execute

```sql
-- Add onboarding_data column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS onboarding_data JSONB DEFAULT '{}'::jsonb NOT NULL;

-- Create index for fast queries
CREATE INDEX IF NOT EXISTS idx_profiles_onboarding_data 
ON public.profiles USING GIN(onboarding_data);

-- Add optional index for incomplete tours
CREATE INDEX IF NOT EXISTS idx_profiles_marketplace_tour_incomplete 
ON public.profiles((onboarding_data->>'marketplace_tour_completed')) 
WHERE (onboarding_data->>'marketplace_tour_completed') IS NULL 
   OR (onboarding_data->>'marketplace_tour_completed')::boolean = false;

-- Add documentation comment
COMMENT ON COLUMN public.profiles.onboarding_data IS 
'Tracks user onboarding progress and first actions';

-- Verify it worked
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name = 'onboarding_data';
```

---

## Expected Output

You should see:

```
column_name      | data_type | is_nullable
-----------------|-----------|------------
onboarding_data  | jsonb     | NO
```

---

## After Running SQL

Come back here and run:

```bash
npm run build
```

The build should now complete successfully!

---

## Why This is Needed

The `onboarding_data` column stores user onboarding progress including:
- Marketplace tour completion
- First marketplace action
- Dashboard tour completion
- Other onboarding milestones

The migration file exists but wasn't executed on the remote database. This SQL adds it manually.
