/**
 * Migration: Create user_intelligence_profiles table
 * 
 * Purpose: Store computed user patterns and preferences that enable
 * the app to "learn" each user over time. Updated daily when the 
 * Today page loads (if stale >6 hours). Stores productivity patterns,
 * communication style, focus areas, risk tolerance, recent wins, and blockers.
 *
 * Security:
 * - RLS enforced: users can only read/write their own profile
 * - Scoped per user + foundry for multi-tenant isolation
 *
 * Related:
 * - src/lib/intelligence/profile-builder.ts — computes and upserts the profile
 * - src/lib/ai-context/builder.ts — injects profile into AI prompts
 * 
 * Rollback: DROP TABLE user_intelligence_profiles CASCADE
 */

-- Create user_intelligence_profiles table
CREATE TABLE IF NOT EXISTS user_intelligence_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  foundry_id TEXT NOT NULL REFERENCES foundries(id) ON DELETE CASCADE,

  -- Computed patterns (JSONB for flexibility as we learn what's useful)
  productivity_patterns JSONB DEFAULT '{}'::jsonb,
  communication_style JSONB DEFAULT '{}'::jsonb,
  focus_areas JSONB DEFAULT '{}'::jsonb,
  risk_tolerance JSONB DEFAULT '{}'::jsonb,
  recent_wins JSONB DEFAULT '[]'::jsonb,
  known_blockers JSONB DEFAULT '[]'::jsonb,

  -- Metadata
  days_of_data INTEGER DEFAULT 0,
  first_activity_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One profile per user per foundry
  UNIQUE(user_id, foundry_id)
);

-- RLS: Users can only access their own profile
ALTER TABLE user_intelligence_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own intelligence profile"
  ON user_intelligence_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own intelligence profile"
  ON user_intelligence_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own intelligence profile"
  ON user_intelligence_profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_intelligence_profiles_user_foundry
  ON user_intelligence_profiles(user_id, foundry_id);
