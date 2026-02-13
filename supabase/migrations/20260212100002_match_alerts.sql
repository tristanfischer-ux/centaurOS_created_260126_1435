/**
 * Migration: Add match alerts for People marketplace
 *
 * Purpose: Proactive notifications that pull users back to the platform.
 * Alerts when new experts match their needs, saved experts get reviews,
 * or new talent joins in their industry.
 *
 * Security:
 * - RLS: Users can only see their own alerts
 * - Service role creates alerts (background job)
 * - Users can mark as read or dismiss
 *
 * Rollback: DROP TABLE match_alerts CASCADE;
 */

CREATE TABLE IF NOT EXISTS match_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN (
        'new_match',        -- New expert matches their team gaps
        'saved_update',     -- Saved expert got a new review or badge
        'industry_join',    -- New expert joined in their industry
        'weekly_digest',    -- Weekly summary placeholder
        'endorsement'       -- Someone endorsed an expert they've worked with
    )),
    title TEXT NOT NULL,
    description TEXT,
    listing_id UUID REFERENCES marketplace_listings(id) ON DELETE CASCADE,
    metadata JSONB DEFAULT '{}'::jsonb, -- Additional context data
    read_at TIMESTAMPTZ,
    dismissed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_match_alerts_user ON match_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_match_alerts_unread ON match_alerts(user_id) WHERE read_at IS NULL AND dismissed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_match_alerts_type ON match_alerts(user_id, type);
CREATE INDEX IF NOT EXISTS idx_match_alerts_created ON match_alerts(created_at DESC);

-- RLS
ALTER TABLE match_alerts ENABLE ROW LEVEL SECURITY;

-- Users can only read their own alerts
CREATE POLICY "Read own alerts"
    ON match_alerts FOR SELECT
    USING (user_id = auth.uid());

-- Service role creates alerts
CREATE POLICY "Service create alerts"
    ON match_alerts FOR INSERT
    WITH CHECK (true);

-- Users can update (mark read/dismiss) their own alerts
CREATE POLICY "Update own alerts"
    ON match_alerts FOR UPDATE
    USING (user_id = auth.uid());

-- Users can delete their own alerts
CREATE POLICY "Delete own alerts"
    ON match_alerts FOR DELETE
    USING (user_id = auth.uid());

-- Helper function: Get unread alert count for a user
CREATE OR REPLACE FUNCTION get_unread_alert_count(p_user_id UUID)
RETURNS BIGINT AS $$
    SELECT COUNT(*)
    FROM match_alerts
    WHERE user_id = p_user_id
      AND read_at IS NULL
      AND dismissed_at IS NULL;
$$ LANGUAGE sql SECURITY DEFINER;
