/**
 * Migration: Add professional_background JSONB column to profiles
 *
 * Purpose: Store structured professional background data (career summary,
 * previous companies, education) entered by the user. This data powers
 * deeply personalized specialist conversations via the AI Context Builder.
 *
 * Structure: { summary: string, previous_companies: string, education: string }
 *
 * Security: Inherits existing profiles RLS policies. Users can only
 * update their own profile row.
 *
 * Rollback: ALTER TABLE profiles DROP COLUMN IF EXISTS professional_background;
 */

-- Add professional_background JSONB column
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS professional_background JSONB DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN profiles.professional_background IS 'Structured professional background: { summary, previous_companies, education }. Entered by user, consumed by AI Context Builder.';
