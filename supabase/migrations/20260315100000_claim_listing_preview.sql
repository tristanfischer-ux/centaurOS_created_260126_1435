-- =============================================
-- MIGRATION: Claim Listing Preview RPC
-- Purpose: Return public-safe listing data for the claim landing page.
-- Called unauthenticated when someone clicks a claim link.
-- Side effect: marks token as 'clicked' for open-rate analytics.
-- =============================================

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
BEGIN
  -- INTENT: Mark token as clicked for open-rate analytics (only if still pending)
  UPDATE listing_claim_tokens
  SET status = 'clicked'
  WHERE token = p_token AND status = 'pending';

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
    lct.email,
    (lct.status IN ('pending', 'clicked') AND lct.expires_at > now()) AS is_valid
  FROM listing_claim_tokens lct
  JOIN marketplace_listings ml ON ml.id = lct.listing_id
  WHERE lct.token = p_token;
END;
$$;

-- SECURITY: Grant to both anon and authenticated — this is a public claim page
GRANT EXECUTE ON FUNCTION public.get_listing_preview_by_claim_token TO anon;
GRANT EXECUTE ON FUNCTION public.get_listing_preview_by_claim_token TO authenticated;
