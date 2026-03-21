-- =============================================
-- MIGRATION: Harden Claim RPCs (Red Team Fixes)
--
-- RT-CLAIM-03: Add SELECT ... FOR UPDATE to prevent race condition
-- RT-CLAIM-12: Add email check inside RPC (not just application layer)
-- RT-CLAIM-26: Partial unique index preventing double-claim on same listing
-- RT-CLAIM-19: Don't leak full company data for expired/claimed tokens
-- =============================================

-- ─── RT-CLAIM-26: Prevent multiple claims on the same listing ──────────────
-- Only one token per listing can have status = 'claimed'
CREATE UNIQUE INDEX IF NOT EXISTS idx_listing_claims_one_claim_per_listing
  ON public.listing_claim_tokens(listing_id)
  WHERE status = 'claimed';

-- ─── RT-CLAIM-03 + RT-CLAIM-12: Harden redeem_listing_claim RPC ───────────
-- Adds row-level locking (FOR UPDATE) to prevent race conditions and
-- email verification inside the RPC to prevent direct-call bypass.
CREATE OR REPLACE FUNCTION public.redeem_listing_claim(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_claim record;
  v_user_email TEXT;
BEGIN
  -- SECURITY: Lock the row to prevent concurrent redemption (RT-CLAIM-03)
  SELECT * INTO v_claim FROM listing_claim_tokens
  WHERE token = p_token AND status IN ('pending', 'clicked') AND expires_at > now()
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN RETURN false; END IF;

  -- SECURITY: Verify caller's email matches the token's intended recipient (RT-CLAIM-12)
  -- This prevents direct RPC calls from bypassing the application-layer email check.
  SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();
  IF lower(v_user_email) IS DISTINCT FROM lower(v_claim.email) THEN
    RETURN false;
  END IF;

  -- Update claim status
  UPDATE listing_claim_tokens
  SET status = 'claimed', claimed_at = now(), claimed_by = auth.uid()
  WHERE id = v_claim.id;

  -- Update listing verification tier and outreach status
  UPDATE marketplace_listings
  SET verification_tier = 'claimed',
      outreach_status = 'claimed'
  WHERE id = v_claim.listing_id;

  RETURN true;
END;
$$;

-- ─── RT-CLAIM-19: Don't leak full data for expired/claimed tokens ──────────
-- Return only title + is_valid for invalid tokens; full data only for valid ones.
CREATE OR REPLACE FUNCTION public.get_listing_preview_by_claim_token(p_token TEXT)
RETURNS TABLE (
  title TEXT,
  description TEXT,
  category marketplace_category,
  subcategory TEXT,
  specialties JSONB,
  certifications JSONB,
  industries JSONB,
  city TEXT,
  country TEXT,
  website_url TEXT,
  company_size TEXT,
  employee_count_exact INTEGER,
  founded_year INTEGER,
  production_capacity TEXT,
  lead_time TEXT,
  quality_systems TEXT,
  contact_name TEXT,
  materials JSONB,
  key_equipment JSONB,
  products JSONB,
  process_capabilities JSONB,
  email TEXT,
  is_valid BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_is_valid BOOLEAN;
  v_token_status TEXT;
BEGIN
  -- INTENT: Mark token as clicked for open-rate analytics (only if still pending)
  UPDATE listing_claim_tokens
  SET status = 'clicked'
  WHERE token = p_token AND status = 'pending';

  -- Check validity first
  SELECT
    (lct.status IN ('pending', 'clicked') AND lct.expires_at > now()),
    lct.status
  INTO v_is_valid, v_token_status
  FROM listing_claim_tokens lct
  WHERE lct.token = p_token;

  IF NOT FOUND THEN RETURN; END IF;

  -- SECURITY: For invalid tokens (expired/claimed), return only title + is_valid (RT-CLAIM-19)
  IF NOT v_is_valid THEN
    RETURN QUERY
    SELECT
      ml.title,
      NULL::TEXT,          -- description
      ml.category,
      NULL::TEXT,          -- subcategory
      NULL::JSONB,         -- specialties
      NULL::JSONB,         -- certifications
      NULL::JSONB,         -- industries
      NULL::TEXT,          -- city
      NULL::TEXT,          -- country
      NULL::TEXT,          -- website_url
      NULL::TEXT,          -- company_size
      NULL::INTEGER,       -- employee_count_exact
      NULL::INTEGER,       -- founded_year
      NULL::TEXT,          -- production_capacity
      NULL::TEXT,          -- lead_time
      NULL::TEXT,          -- quality_systems
      NULL::TEXT,          -- contact_name
      NULL::JSONB,         -- materials
      NULL::JSONB,         -- key_equipment
      NULL::JSONB,         -- products
      NULL::JSONB,         -- process_capabilities
      NULL::TEXT,          -- email
      false                -- is_valid
    FROM listing_claim_tokens lct2
    JOIN marketplace_listings ml ON ml.id = lct2.listing_id
    WHERE lct2.token = p_token;
    RETURN;
  END IF;

  -- Valid token: return full data
  RETURN QUERY
  SELECT
    ml.title,
    ml.description,
    ml.category,
    ml.subcategory,
    ml.specialties,
    ml.certifications,
    ml.industries,
    ml.city,
    ml.country,
    ml.website_url,
    ml.company_size,
    ml.employee_count_exact,
    ml.founded_year,
    ml.production_capacity,
    ml.lead_time,
    ml.quality_systems,
    ml.contact_name,
    ml.materials,
    ml.key_equipment,
    ml.products,
    ml.process_capabilities,
    lct3.email,
    true AS is_valid
  FROM listing_claim_tokens lct3
  JOIN marketplace_listings ml ON ml.id = lct3.listing_id
  WHERE lct3.token = p_token;
END;
$$;

-- Grants remain unchanged (already set by previous migration)
