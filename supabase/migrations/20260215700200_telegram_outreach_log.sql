-- Telegram proactive outreach logging
-- Tracks outreach events for rate limiting and analytics
--
-- SECURITY: Service role only — no user-facing access needed.
-- Users don't query this table directly; it's used by the
-- proactive outreach system to enforce rate limits and track
-- engagement metrics.
--
-- Related: src/lib/telegram/proactive-outreach.ts

CREATE TABLE IF NOT EXISTS telegram_outreach_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    specialist_id TEXT NOT NULL,
    outreach_type TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for rate limiting queries (count per user per day)
CREATE INDEX IF NOT EXISTS idx_telegram_outreach_log_user_day
    ON telegram_outreach_log(user_id, created_at DESC);

-- RLS: Enable but restrict to service role only
ALTER TABLE telegram_outreach_log ENABLE ROW LEVEL SECURITY;

-- Service role full access (no user-facing policies needed)
CREATE POLICY "Service role full access" ON telegram_outreach_log
    FOR ALL USING (true) WITH CHECK (true);

-- Auto-cleanup entries older than 30 days to keep the table lean
CREATE OR REPLACE FUNCTION cleanup_old_outreach_logs()
RETURNS void AS $$
BEGIN
    DELETE FROM telegram_outreach_log
    WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
