-- Free tier 14-day trial gating
-- INTENT: Every new account gets 14 days of full-access features.
-- After trial_ends_at, free-tier users lose access to supplier matching,
-- RFQ generation, and marketplace features until they upgrade.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

-- Set trial_ends_at for all existing profiles that don't have a paid subscription
-- DECISION: Existing users get a fresh 14-day trial from today as a goodwill gesture
UPDATE profiles
SET trial_ends_at = now() + INTERVAL '14 days'
WHERE trial_ends_at IS NULL;

-- Default for new profiles: 14 days from creation
-- GOTCHA: This trigger fires on INSERT, not on approval. The trial clock starts
-- when the profile row is created (i.e., after the user creates their account).
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

COMMENT ON COLUMN profiles.trial_ends_at IS '14-day full-access trial expiry. After this, free-tier users drop to limited features.';
