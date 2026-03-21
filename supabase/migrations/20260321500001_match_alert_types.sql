/**
 * Migration: Ensure match_alerts table + add new alert types.
 *
 * Purpose: Executives need proactive notifications when:
 * 1. A founder contacts them via the marketplace (contact_enquiry)
 * 2. They appear in a talent search with a high score (talent_search)
 *
 * This migration is idempotent — creates the table if missing, then updates
 * the CHECK constraint to include new types.
 *
 * Rollback: DROP TABLE match_alerts CASCADE;
 */

-- Ensure table exists (idempotent — original migration may not have been applied)
CREATE TABLE IF NOT EXISTS match_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    listing_id UUID,
    metadata JSONB DEFAULT '{}'::jsonb,
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

-- Policies (IF NOT EXISTS via DO block)
DO $$ BEGIN
    CREATE POLICY "Read own alerts" ON match_alerts FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "Service create alerts" ON match_alerts FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "Update own alerts" ON match_alerts FOR UPDATE USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "Delete own alerts" ON match_alerts FOR DELETE USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Drop any existing CHECK constraint on type and re-create with new values.
-- L-1: Handle both user-named and auto-generated constraint names.
DO $$ DECLARE
    _con_name text;
BEGIN
    FOR _con_name IN
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'match_alerts'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%type%IN%'
    LOOP
        EXECUTE format('ALTER TABLE match_alerts DROP CONSTRAINT %I', _con_name);
    END LOOP;
END $$;

ALTER TABLE match_alerts ADD CONSTRAINT match_alerts_type_check CHECK (type IN (
    'new_match',
    'saved_update',
    'industry_join',
    'weekly_digest',
    'endorsement',
    'talent_search',
    'contact_enquiry'
));

-- Index for deduplication queries (recent alerts per user per type)
CREATE INDEX IF NOT EXISTS idx_match_alerts_dedup
    ON match_alerts(user_id, type, created_at DESC);

-- Helper function: Get unread alert count for a user
CREATE OR REPLACE FUNCTION get_unread_alert_count(p_user_id UUID)
RETURNS BIGINT AS $$
    SELECT COUNT(*)
    FROM match_alerts
    WHERE user_id = p_user_id
      AND read_at IS NULL
      AND dismissed_at IS NULL;
$$ LANGUAGE sql SECURITY DEFINER;
