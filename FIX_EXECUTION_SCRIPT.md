# Complete Fix Execution Script

## 🎯 Objective
Execute all database migrations that are needed but not yet applied to the remote database.

## 📋 Total Database Fixes Required

Based on the analysis, we need to execute these SQL sections:

### 1. ✅ Complete Database Fix (RUN_THIS_SQL_IN_SUPABASE.sql)
- onboarding_data JSONB column
- signup_intents table with indexes and RLS
- profiles table enhancements

### 2. 🔄 Company Invitations System (20260129210000_company_invitations.sql)
- foundries.owner_id column
- company_invitations table with RLS
- project_assignments table with RLS
- Helper functions and triggers

## 🚀 Execution Steps

### Step 1: Go to Supabase Dashboard
Navigate to: https://supabase.com/dashboard/project/jyarhvinengfyrwgtskq

### Step 2: Open SQL Editor
Left sidebar → SQL Editor → New Query

### Step 3: Execute First Script
Copy and paste the entire content from `RUN_THIS_SQL_IN_SUPABASE.sql`

```sql
-- Complete database fix from RUN_THIS_SQL_IN_SUPABASE.sql
-- This adds:
-- 1. onboarding_data column to profiles table
-- 2. signup_intents table with indexes and RLS policies
-- 3. Proper verification queries
```

### Step 4: Execute Company Invitations Script
Copy and paste the entire content from `20260129210000_company_invitations.sql`

```sql
-- Company invitations system
-- This adds:
-- 1. owner_id to foundries table
-- 2. company_invitations table with all policies
-- 3. project_assignments table
-- 4. Helper functions and triggers
```

### Step 5: Verification Queries
Execute these verification queries:

```sql
-- =============================================
-- VERIFICATION QUERIES - Execute after both scripts
-- =============================================

-- Verify profiles.onboarding_data column exists
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name = 'onboarding_data';
-- Expected: onboarding_data | jsonb | NO

-- Verify signup_intents table structure
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'signup_intents';
-- Expected: 1 row with table_name = 'signup_intents'

-- Verify company_invitations table structure  
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'company_invitations';
-- Expected: 1 row with table_name = 'company_invitations'

-- Verify project_assignments table structure
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'project_assignments';
-- Expected: 1 row with table_name = 'project_assignments'

-- Verify foundries.owner_id column exists
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'foundries' 
AND column_name = 'owner_id';
-- Expected: owner_id | uuid | YES

-- Quick RLS check
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('signup_intents', 'company_invitations', 'project_assignments')
ORDER BY tablename;
-- Expected: All should show rowsecurity = true
```

## ✅ Success Criteria

After executing both scripts and verification queries, you should see:

1. **Profiles table**: Should have `onboarding_data` JSONB column
2. **signup_intents table**: Should exist with all indexes and RLS policies
3. **company_invitations table**: Should exist with all RLS policies
4. **project_assignments table**: Should exist with all RLS policies
5. **foundries table**: Should have `owner_id` column
6. **All RLS policies**: Should be active for security

## 🔄 What to do after SQL execution:

1. Return to terminal
2. Run: `npm run build` (should still succeed)
3. Test the application locally
4. Verify marketplace onboarding works
5. Verify user intent tracking works
6. Test new company invitation features

## 🎉 Expected Results
After completing these steps:
- Database schema completely up-to-date
- All security policies active
- New marketplace onboarding functional
- User intent tracking active
- Company invitation system ready
- Build remains successful