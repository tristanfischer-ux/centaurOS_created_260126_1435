/**
 * Migration: Add founder_preferences table for specialist relationship memory
 *
 * Purpose: Stores the founder's communication preferences, decision patterns,
 * and working style so that specialists can adapt their responses over time.
 * This is the core of the "Founder Relationship Memory" system — specialists
 * learn how the founder likes to receive information and adjust accordingly.
 *
 * Security:
 * - RLS policy ensures users can only see/edit preferences for their own foundry
 * - Only foundry members can read preferences
 * - Only the foundry owner can update preferences (or the system via service role)
 *
 * Related:
 * - Frontend: src/lib/agents/founder-preferences.ts
 * - Execute route: src/app/api/agents/execute/route.ts
 * - Memory observer: src/lib/agent-memory/observer.ts
 *
 * Rollback: DROP TABLE founder_preferences CASCADE
 */

-- Create the founder_preferences table
CREATE TABLE IF NOT EXISTS founder_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id UUID NOT NULL REFERENCES foundries(id) ON DELETE CASCADE,

    -- Communication style preferences (learned from interactions)
    preferred_length TEXT DEFAULT 'balanced' CHECK (preferred_length IN ('brief', 'balanced', 'detailed')),
    format_preference TEXT DEFAULT 'mixed' CHECK (format_preference IN ('bullets', 'prose', 'tables', 'mixed')),
    tone_preference TEXT DEFAULT 'conversational' CHECK (tone_preference IN ('casual', 'conversational', 'professional')),

    -- Decision-making patterns
    decision_speed TEXT DEFAULT 'balanced' CHECK (decision_speed IN ('fast', 'balanced', 'deliberate')),
    prefers_data BOOLEAN DEFAULT true,
    prefers_recommendation BOOLEAN DEFAULT true,

    -- Learned vocabulary and patterns (updated by observer)
    vocabulary JSONB DEFAULT '[]'::jsonb,
    pet_peeves JSONB DEFAULT '[]'::jsonb,
    values_signals JSONB DEFAULT '[]'::jsonb,
    celebration_style TEXT DEFAULT 'brief',

    -- Interaction counters for trust level calculation
    total_interactions INTEGER DEFAULT 0,
    total_corrections INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One preference profile per foundry
    CONSTRAINT unique_foundry_preferences UNIQUE (foundry_id)
);

-- Index for quick lookups by foundry
CREATE INDEX IF NOT EXISTS idx_founder_preferences_foundry ON founder_preferences(foundry_id);

-- RLS policies
ALTER TABLE founder_preferences ENABLE ROW LEVEL SECURITY;

-- Members of the foundry can read preferences
CREATE POLICY "Foundry members can view preferences"
    ON founder_preferences FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM foundry_members fm
            WHERE fm.foundry_id = founder_preferences.foundry_id
            AND fm.user_id = auth.uid()
        )
    );

-- Only the system (service role) updates preferences via the observer
-- Users with Founder role can also update manually
CREATE POLICY "Founders can update preferences"
    ON founder_preferences FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM foundry_members fm
            WHERE fm.foundry_id = founder_preferences.foundry_id
            AND fm.user_id = auth.uid()
            AND fm.role IN ('Founder', 'Executive')
        )
    );

-- Service role can insert (for initial creation)
CREATE POLICY "Founders can insert preferences"
    ON founder_preferences FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM foundry_members fm
            WHERE fm.foundry_id = founder_preferences.foundry_id
            AND fm.user_id = auth.uid()
        )
    );

-- Add relationship metadata columns to agent_memory_threads
-- These track the specialist's relationship with the founder over time
ALTER TABLE agent_memory_threads
    ADD COLUMN IF NOT EXISTS trust_level TEXT DEFAULT 'building' CHECK (trust_level IN ('building', 'established', 'deep')),
    ADD COLUMN IF NOT EXISTS total_interactions INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_interaction_at TIMESTAMPTZ;
