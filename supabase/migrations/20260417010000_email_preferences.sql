-- Email preferences table for per-channel marketing email control
-- INTENT: UK PECR + GDPR compliance. Every marketing email must carry a working
-- unsubscribe link. This table holds the opt-in/opt-out state.
--
-- DESIGN:
-- - One row per user (user_id PK)
-- - Six per-channel booleans covering every marketing email category
-- - unsubscribed_all_at: hard stop, overrides all channel flags when NOT NULL
-- - paused_all_until: soft pause (e.g. 90-day snooze)
-- - Lazy-created: the row is inserted on first preference check, not via trigger,
--   so signup flow is not coupled to this table

CREATE TABLE IF NOT EXISTS email_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Hard stop. When NOT NULL, user receives NO marketing email regardless of channel flags.
  -- Transactional emails (password reset, order status) ignore this.
  unsubscribed_all_at TIMESTAMPTZ,

  -- Soft pause. When set to a future timestamp, no marketing emails until that point.
  paused_all_until TIMESTAMPTZ,

  -- Per-channel opt-in flags (default true = opted in)
  product_announcements BOOLEAN NOT NULL DEFAULT true,
  welcome_drip BOOLEAN NOT NULL DEFAULT true,
  dormancy_nudges BOOLEAN NOT NULL DEFAULT true,
  morning_digest BOOLEAN NOT NULL DEFAULT true,
  outreach_drip BOOLEAN NOT NULL DEFAULT true,
  specialist_briefings BOOLEAN NOT NULL DEFAULT true,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for bulk unsubscribe checks when we're fanning out a campaign
CREATE INDEX idx_email_preferences_unsubscribed
  ON email_preferences (unsubscribed_all_at)
  WHERE unsubscribed_all_at IS NOT NULL;

-- Auto-update updated_at on any row change
CREATE OR REPLACE FUNCTION email_preferences_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_email_preferences_set_updated_at ON email_preferences;
CREATE TRIGGER trg_email_preferences_set_updated_at
  BEFORE UPDATE ON email_preferences
  FOR EACH ROW
  EXECUTE FUNCTION email_preferences_set_updated_at();

-- RLS: user can read/write own row; service role bypasses RLS automatically
ALTER TABLE email_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_email_preferences"
  ON email_preferences
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "users_insert_own_email_preferences"
  ON email_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_update_own_email_preferences"
  ON email_preferences
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE email_preferences IS 'Per-user marketing email preferences. UK PECR + GDPR compliance.';
COMMENT ON COLUMN email_preferences.unsubscribed_all_at IS 'Hard stop — when NOT NULL, no marketing email is sent regardless of channel flags.';
COMMENT ON COLUMN email_preferences.paused_all_until IS 'Soft pause — no marketing email until this timestamp.';
