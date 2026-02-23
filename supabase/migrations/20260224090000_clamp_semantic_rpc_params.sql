-- SECURITY: Clamp match_count and match_threshold in semantic RPCs
-- to prevent DB memory exhaustion (unbounded match_count) and
-- full-table scans (match_threshold = 0.0).
--
-- match_count: capped at 100 (prevents MAX_INT → OOM)
-- match_threshold: floored at 0.1 (prevents returning entire table)

-- Recreate match_suppliers_semantic with parameter clamping
CREATE OR REPLACE FUNCTION match_suppliers_semantic(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  supplier_type text,
  domain_categories text[],
  capabilities jsonb,
  verification_status text,
  community_rating numeric,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id,
    s.name,
    s.description,
    s.supplier_type,
    s.domain_categories,
    s.capabilities,
    s.verification_status,
    s.community_rating,
    1 - (s.embedding <=> query_embedding) AS similarity
  FROM suppliers s
  WHERE s.embedding IS NOT NULL
    AND 1 - (s.embedding <=> query_embedding) > GREATEST(match_threshold, 0.1)
  ORDER BY s.embedding <=> query_embedding
  LIMIT LEAST(match_count, 100);
$$;

-- Recreate match_people_semantic with parameter clamping
CREATE OR REPLACE FUNCTION match_people_semantic(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  headline text,
  bio text,
  specializations text[],
  industries text[],
  day_rate numeric,
  years_experience int,
  is_active boolean,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.headline,
    p.bio,
    p.specializations,
    p.industries,
    p.day_rate,
    p.years_experience,
    p.is_active,
    1 - (p.embedding <=> query_embedding) AS similarity
  FROM provider_profiles p
  WHERE p.embedding IS NOT NULL
    AND p.is_active = true
    AND 1 - (p.embedding <=> query_embedding) > GREATEST(match_threshold, 0.1)
  ORDER BY p.embedding <=> query_embedding
  LIMIT LEAST(match_count, 100);
$$;
