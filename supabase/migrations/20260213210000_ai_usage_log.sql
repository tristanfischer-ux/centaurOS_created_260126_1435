/**
 * Migration: Create ai_usage_log table for metered billing
 *
 * Purpose: Track all AI execution usage per user and foundry so the platform
 * can implement usage-based billing. Every call to /api/agents/execute logs
 * provider, model, modality, and estimated token counts.
 *
 * Security:
 * - RLS: Users can only view their own usage records
 * - Insert is done server-side via the authenticated session
 * - No sensitive data stored (no prompts or outputs, just metadata)
 *
 * Related:
 * - src/app/api/agents/execute/route.ts -- logs usage after each execution
 * - Future: billing aggregation queries by foundry_id + month
 *
 * Rollback: DROP TABLE ai_usage_log CASCADE;
 */

-- Create the usage log table (idempotent)
CREATE TABLE IF NOT EXISTS ai_usage_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    foundry_id UUID REFERENCES foundries(id) ON DELETE SET NULL,
    provider_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    modality TEXT NOT NULL DEFAULT 'text',
    input_tokens INTEGER,
    output_tokens INTEGER,
    key_source TEXT NOT NULL DEFAULT 'platform', -- 'platform' or 'user' (BYOK)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add key_source column if it doesn't exist (for existing tables)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_usage_log' AND column_name = 'key_source'
    ) THEN
        ALTER TABLE ai_usage_log ADD COLUMN key_source TEXT NOT NULL DEFAULT 'platform';
    END IF;
END $$;

-- RLS: Enable row-level security
ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;

-- RLS policies (idempotent with DROP IF EXISTS)
DROP POLICY IF EXISTS "Users can view own usage" ON ai_usage_log;
CREATE POLICY "Users can view own usage"
    ON ai_usage_log FOR SELECT
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated users can insert own usage" ON ai_usage_log;
CREATE POLICY "Authenticated users can insert own usage"
    ON ai_usage_log FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_user_created
    ON ai_usage_log (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_log_foundry_created
    ON ai_usage_log (foundry_id, created_at DESC);

-- Note: Monthly billing aggregation uses idx_ai_usage_log_foundry_created
-- with WHERE created_at >= start_of_month AND created_at < end_of_month
