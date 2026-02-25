-- =============================================
-- MIGRATION: Listing Claim Tokens
-- Purpose: Allow companies to claim their marketplace listing
-- via a magic link sent in outreach emails. Follows the
-- company_invitations token pattern.
-- =============================================

CREATE TABLE IF NOT EXISTS public.listing_claim_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'clicked', 'claimed', 'expired', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  claimed_at TIMESTAMPTZ,
  claimed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_listing_claims_token
  ON public.listing_claim_tokens(token);
CREATE INDEX IF NOT EXISTS idx_listing_claims_listing
  ON public.listing_claim_tokens(listing_id);
CREATE INDEX IF NOT EXISTS idx_listing_claims_email
  ON public.listing_claim_tokens(email);

ALTER TABLE public.listing_claim_tokens ENABLE ROW LEVEL SECURITY;

-- Service role manages all claim tokens
CREATE POLICY "Service role manage claims" ON public.listing_claim_tokens
  FOR ALL USING (auth.role() = 'service_role');

-- ─── RPCs ────────────────────────────────────────────────────────────────────

-- Validate a claim token (public-safe, returns minimal info)
CREATE OR REPLACE FUNCTION public.validate_listing_claim(p_token TEXT)
RETURNS TABLE (
  listing_id UUID,
  company_name TEXT,
  email TEXT,
  is_valid BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    lct.listing_id,
    ml.title AS company_name,
    lct.email,
    (lct.status IN ('pending', 'clicked') AND lct.expires_at > now()) AS is_valid
  FROM listing_claim_tokens lct
  JOIN marketplace_listings ml ON ml.id = lct.listing_id
  WHERE lct.token = p_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_listing_claim TO anon;
GRANT EXECUTE ON FUNCTION public.validate_listing_claim TO authenticated;

-- Redeem a claim (requires authenticated user)
CREATE OR REPLACE FUNCTION public.redeem_listing_claim(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_claim record;
BEGIN
  SELECT * INTO v_claim FROM listing_claim_tokens
  WHERE token = p_token AND status IN ('pending', 'clicked') AND expires_at > now();

  IF NOT FOUND THEN RETURN false; END IF;

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

GRANT EXECUTE ON FUNCTION public.redeem_listing_claim TO authenticated;

-- Get listing claimed by a user (for /my-listing page)
CREATE OR REPLACE FUNCTION public.get_my_claimed_listing()
RETURNS TABLE (
  listing_id UUID,
  title TEXT,
  description TEXT,
  attributes JSONB,
  category TEXT,
  subcategory TEXT,
  verification_tier TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_title TEXT,
  contact_linkedin TEXT,
  contact_phone TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    ml.id AS listing_id,
    ml.title,
    ml.description,
    ml.attributes,
    ml.category::TEXT,
    ml.subcategory,
    ml.verification_tier::TEXT,
    ml.contact_name,
    ml.contact_email,
    ml.contact_title,
    ml.contact_linkedin,
    ml.contact_phone
  FROM listing_claim_tokens lct
  JOIN marketplace_listings ml ON ml.id = lct.listing_id
  WHERE lct.claimed_by = auth.uid()
    AND lct.status = 'claimed'
  ORDER BY lct.claimed_at DESC
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_claimed_listing TO authenticated;

-- Update a claimed listing (only the claimant can update)
CREATE OR REPLACE FUNCTION public.update_claimed_listing(
  p_listing_id UUID,
  p_description TEXT DEFAULT NULL,
  p_contact_name TEXT DEFAULT NULL,
  p_contact_email TEXT DEFAULT NULL,
  p_contact_title TEXT DEFAULT NULL,
  p_contact_linkedin TEXT DEFAULT NULL,
  p_contact_phone TEXT DEFAULT NULL,
  p_attributes JSONB DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_is_claimant BOOLEAN;
BEGIN
  -- SECURITY: Verify the caller is the claimant
  SELECT EXISTS (
    SELECT 1 FROM listing_claim_tokens
    WHERE listing_id = p_listing_id
      AND claimed_by = auth.uid()
      AND status = 'claimed'
  ) INTO v_is_claimant;

  IF NOT v_is_claimant THEN RETURN false; END IF;

  UPDATE marketplace_listings SET
    description = COALESCE(p_description, description),
    contact_name = COALESCE(p_contact_name, contact_name),
    contact_email = COALESCE(p_contact_email, contact_email),
    contact_title = COALESCE(p_contact_title, contact_title),
    contact_linkedin = COALESCE(p_contact_linkedin, contact_linkedin),
    contact_phone = COALESCE(p_contact_phone, contact_phone),
    attributes = COALESCE(p_attributes, attributes),
    contact_source = 'self_reported',
    contact_enriched_at = now()
  WHERE id = p_listing_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_claimed_listing TO authenticated;
