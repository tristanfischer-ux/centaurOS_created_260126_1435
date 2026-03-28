-- REPAIR: The 20260328100000_scheduled_emails and 20260328200000_free_trial_gating
-- migrations were recorded in schema_migrations (due to timestamp collision with
-- convert_sandboxes) but their SQL never executed. This migration re-applies them.

-- ── scheduled_emails table ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scheduled_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  template TEXT NOT NULL,
  template_data JSONB DEFAULT '{}',
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'pending', 'sent', 'failed', 'cancelled')),
  description TEXT,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_emails_due ON scheduled_emails (status, scheduled_for)
  WHERE status IN ('scheduled', 'pending');

CREATE INDEX IF NOT EXISTS idx_scheduled_emails_user ON scheduled_emails (user_id, status);

ALTER TABLE scheduled_emails ENABLE ROW LEVEL SECURITY;

-- ── profiles.trial_ends_at column ───────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

UPDATE profiles
SET trial_ends_at = now() + INTERVAL '14 days'
WHERE trial_ends_at IS NULL;

CREATE OR REPLACE FUNCTION set_trial_end()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.trial_ends_at IS NULL THEN
    NEW.trial_ends_at := now() + INTERVAL '14 days';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_trial_end ON profiles;
CREATE TRIGGER trg_set_trial_end
  BEFORE INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION set_trial_end();

-- ── profiles.tier + profiles.subscription_status columns ────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'starter', 'professional', 'enterprise')),
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'trialing' CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'cancelled', 'none'));
