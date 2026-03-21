-- =============================================
-- MIGRATION: Harden validate_listing_claim + fix shared foundry ownership
--
-- RT2-12: validate_listing_claim leaks email for expired/claimed tokens
-- RT2-05: Shared foundries should have a system owner, not the first user
-- =============================================

-- ─── RT2-12: Don't leak email for invalid tokens ──────────────────────────
CREATE OR REPLACE FUNCTION public.validate_listing_claim(p_token TEXT)
RETURNS TABLE (
  listing_id UUID,
  company_name TEXT,
  email TEXT,
  is_valid BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_is_valid BOOLEAN;
BEGIN
  -- Check validity
  SELECT (lct.status IN ('pending', 'clicked') AND lct.expires_at > now())
  INTO v_is_valid
  FROM listing_claim_tokens lct
  WHERE lct.token = p_token;

  IF NOT FOUND THEN RETURN; END IF;

  -- SECURITY: For invalid tokens, return listing_id + company_name but NOT email (RT2-12)
  IF NOT v_is_valid THEN
    RETURN QUERY
    SELECT
      lct.listing_id,
      ml.title AS company_name,
      NULL::TEXT AS email,
      false AS is_valid
    FROM listing_claim_tokens lct
    JOIN marketplace_listings ml ON ml.id = lct.listing_id
    WHERE lct.token = p_token;
    RETURN;
  END IF;

  -- Valid token: return full data including email
  RETURN QUERY
  SELECT
    lct.listing_id,
    ml.title AS company_name,
    lct.email,
    true AS is_valid
  FROM listing_claim_tokens lct
  JOIN marketplace_listings ml ON ml.id = lct.listing_id
  WHERE lct.token = p_token;
END;
$$;

-- ─── RT2-05: Set shared foundry owners to a system UUID ────────────────────
-- Use a deterministic UUID so it's the same across environments.
-- This prevents the first signup user from becoming owner of the shared foundry.
DO $$
BEGIN
  -- Only update if the current owner is a real user (not the system UUID)
  UPDATE foundries
  SET owner_id = '00000000-0000-0000-0000-000000000000'
  WHERE id IN ('forge-guild', 'forge-suppliers')
    AND owner_id != '00000000-0000-0000-0000-000000000000';
EXCEPTION WHEN OTHERS THEN
  -- Shared foundries may not exist yet — that's OK
  NULL;
END;
$$;
