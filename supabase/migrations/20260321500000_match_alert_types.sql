/**
 * Migration: Add 'talent_search' and 'contact_enquiry' alert types to match_alerts.
 *
 * Purpose: Executives need proactive notifications when:
 * 1. A founder contacts them via the marketplace (contact_enquiry)
 * 2. They appear in a talent search with a high score (talent_search)
 *
 * The CHECK constraint on match_alerts.type must be updated to allow these new values.
 *
 * Rollback: Re-create the CHECK with the old values only (manual — ALTER + ADD).
 */

-- Drop the existing CHECK constraint and re-create with new values
ALTER TABLE match_alerts DROP CONSTRAINT IF EXISTS match_alerts_type_check;

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
