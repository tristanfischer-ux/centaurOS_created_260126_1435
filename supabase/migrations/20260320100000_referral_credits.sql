-- =============================================================================
-- Referral Credits System
-- "Give AI Credits, Get AI Credits" — Tesla Supercharger playbook for ForgeOS
-- =============================================================================

-- 1. New columns on profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS referral_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_founding_member BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS founding_member_number INTEGER;

-- 2. Referral credits table
CREATE TABLE IF NOT EXISTS referral_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id TEXT NOT NULL REFERENCES foundries(id) ON DELETE CASCADE,
  granted_to UUID NOT NULL REFERENCES auth.users(id),
  granted_by UUID REFERENCES auth.users(id),
  amount INTEGER NOT NULL DEFAULT 10,
  consumed INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL CHECK (reason IN ('referral_made', 'referral_received', 'founding_member', 'manual')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT positive_amount CHECK (amount > 0),
  CONSTRAINT consumed_within_amount CHECK (consumed >= 0 AND consumed <= amount)
);

CREATE INDEX IF NOT EXISTS idx_referral_credits_granted_to ON referral_credits(granted_to);
CREATE INDEX IF NOT EXISTS idx_referral_credits_foundry_id ON referral_credits(foundry_id);
CREATE INDEX IF NOT EXISTS idx_referral_credits_expires_at ON referral_credits(expires_at);

-- 3. RLS: users can only SELECT their own credits
ALTER TABLE referral_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own credits"
  ON referral_credits FOR SELECT
  USING (granted_to = auth.uid());

CREATE POLICY "Service role can manage credits"
  ON referral_credits FOR ALL
  USING (auth.role() = 'service_role');

-- 4. RPC: get_bonus_credits — total available (unconsumed, non-expired)
CREATE OR REPLACE FUNCTION get_bonus_credits(p_foundry_id TEXT)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(SUM(amount - consumed), 0)::INTEGER
  FROM referral_credits
  WHERE foundry_id = p_foundry_id
    AND consumed < amount
    AND expires_at > NOW();
$$;

-- 5. RPC: consume_bonus_credit — decrement oldest non-expired credit (FIFO)
-- Uses FOR UPDATE SKIP LOCKED for concurrency safety
CREATE OR REPLACE FUNCTION consume_bonus_credit(p_foundry_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_credit_id UUID;
BEGIN
  SELECT id INTO v_credit_id
  FROM referral_credits
  WHERE foundry_id = p_foundry_id
    AND consumed < amount
    AND expires_at > NOW()
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_credit_id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE referral_credits
  SET consumed = consumed + 1
  WHERE id = v_credit_id;

  RETURN TRUE;
END;
$$;

-- 6. Trigger: auto-generate unique 7-char referral code on profile INSERT
CREATE OR REPLACE FUNCTION assign_referral_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_code TEXT;
  v_exists BOOLEAN;
BEGIN
  -- Only assign if not already set
  IF NEW.referral_code IS NOT NULL THEN
    RETURN NEW;
  END IF;

  LOOP
    -- Generate 7-char alphanumeric code
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 7));
    SELECT EXISTS(SELECT 1 FROM profiles WHERE referral_code = v_code) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;

  NEW.referral_code := v_code;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_assign_referral_code
  BEFORE INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION assign_referral_code();

-- 7. Backfill: assign codes to existing profiles that don't have one
DO $$
DECLARE
  r RECORD;
  v_code TEXT;
  v_exists BOOLEAN;
BEGIN
  FOR r IN SELECT id FROM profiles WHERE referral_code IS NULL LOOP
    LOOP
      v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 7));
      SELECT EXISTS(SELECT 1 FROM profiles WHERE referral_code = v_code) INTO v_exists;
      EXIT WHEN NOT v_exists;
    END LOOP;
    UPDATE profiles SET referral_code = v_code WHERE id = r.id;
  END LOOP;
END;
$$;

-- 8. Backfill: mark first 100 users as founding members + grant +25 bonus credits
DO $$
DECLARE
  r RECORD;
  v_member_num INTEGER := 0;
BEGIN
  FOR r IN
    SELECT p.id, p.foundry_id
    FROM profiles p
    ORDER BY p.created_at ASC
    LIMIT 100
  LOOP
    v_member_num := v_member_num + 1;

    UPDATE profiles
    SET is_founding_member = TRUE,
        founding_member_number = v_member_num
    WHERE id = r.id;

    -- Grant +25 founding member bonus credits (only if foundry actually exists in foundries table)
    IF r.foundry_id IS NOT NULL THEN
      PERFORM 1 FROM foundries WHERE id = r.foundry_id;
      IF FOUND THEN
        INSERT INTO referral_credits (foundry_id, granted_to, granted_by, amount, reason)
        VALUES (r.foundry_id, r.id, NULL, 25, 'founding_member');
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- 9. RPC: get_founding_member_count — for dynamic join page counter
CREATE OR REPLACE FUNCTION get_founding_member_count()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COUNT(*)::INTEGER FROM profiles WHERE is_founding_member = TRUE;
$$;
