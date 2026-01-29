# Manual Database Fix Required

## Issue
The `onboarding_data` column needs to be added to the `profiles` table. The migration file exists at `supabase/migrations/20260129120100_onboarding_tracking.sql` and is marked as applied, but the SQL was not executed on the remote database.

## Required SQL (Run in Supabase Dashboard)

```sql
-- Add onboarding_data column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS onboarding_data JSONB DEFAULT '{}'::jsonb NOT NULL;

-- Create indexes for onboarding queries
CREATE INDEX IF NOT EXISTS idx_profiles_onboarding_data 
ON public.profiles USING GIN(onboarding_data);

CREATE INDEX IF NOT EXISTS idx_profiles_marketplace_tour_incomplete 
ON public.profiles((onboarding_data->>'marketplace_tour_completed')) 
WHERE (onboarding_data->>'marketplace_tour_completed') IS NULL 
   OR (onboarding_data->>'marketplace_tour_completed')::boolean = false;

-- Add comment
COMMENT ON COLUMN public.profiles.onboarding_data IS 
'Tracks user onboarding progress and first actions. 
Structure: {
  "marketplace_tour_completed": boolean,
  "marketplace_tour_skipped": boolean,
  "first_marketplace_action": string,
  "first_marketplace_action_at": timestamp,
  "dashboard_tour_completed": boolean,
  "guild_tour_completed": boolean
}';
```

## Steps to Fix

1. Go to Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Navigate to SQL Editor
4. Copy and paste the above SQL
5. Click "Run" or press Cmd+Enter

## Verification

After running the SQL, verify it worked:

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name = 'onboarding_data';
```

You should see:
```
column_name      | data_type
-----------------|----------
onboarding_data  | jsonb
```

## After Fix

Once the column is added, rebuild the application:

```bash
npm run build
```

The build should now complete successfully.

## Why This Happened

The migrations were marked as "applied" in the migration history table, but the actual SQL statements were never executed on the database. This can happen when migrations are repaired or marked as applied without running through the normal push flow.
