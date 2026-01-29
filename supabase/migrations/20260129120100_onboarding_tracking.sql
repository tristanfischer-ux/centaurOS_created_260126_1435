-- =============================================
-- MIGRATION: Onboarding Tracking
-- =============================================
-- This migration adds onboarding tracking capabilities to the profiles table,
-- enabling tour completion tracking and first-action analytics.

-- =============================================
-- 1. Add onboarding_data column to profiles
-- =============================================

-- Add onboarding_data JSONB column for flexible onboarding tracking
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS onboarding_data JSONB DEFAULT '{}'::jsonb NOT NULL;

-- =============================================
-- 2. Create indexes for onboarding queries
-- =============================================

-- GIN index for efficient JSONB queries on onboarding_data
CREATE INDEX IF NOT EXISTS idx_profiles_onboarding_data 
ON public.profiles USING GIN(onboarding_data);

-- Partial index for users who haven't completed marketplace tour
-- Useful for targeted onboarding campaigns
CREATE INDEX IF NOT EXISTS idx_profiles_marketplace_tour_incomplete 
ON public.profiles((onboarding_data->>'marketplace_tour_completed')) 
WHERE (onboarding_data->>'marketplace_tour_completed') IS NULL 
   OR (onboarding_data->>'marketplace_tour_completed')::boolean = false;

-- =============================================
-- 3. Add comments for documentation
-- =============================================

COMMENT ON COLUMN public.profiles.onboarding_data IS 
'Tracks user onboarding progress and first actions. 
Structure: {
  "marketplace_tour_completed": boolean,
  "marketplace_tour_skipped": boolean,
  "first_marketplace_action": string (e.g., "view_listing", "create_booking"),
  "first_marketplace_action_at": timestamp,
  "dashboard_tour_completed": boolean,
  "guild_tour_completed": boolean
}';

-- =============================================
-- 4. Example queries for reference
-- =============================================

-- Query users who completed marketplace tour:
-- SELECT * FROM profiles WHERE onboarding_data->>'marketplace_tour_completed' = 'true';

-- Query users who took first marketplace action:
-- SELECT * FROM profiles WHERE onboarding_data->>'first_marketplace_action' IS NOT NULL;

-- Query users by first action type:
-- SELECT * FROM profiles WHERE onboarding_data->>'first_marketplace_action' = 'view_listing';
