-- Add embedding columns to suppliers and provider_profiles for semantic matching.
-- Used by the Forge X-Ray supplier/people matching services.

-- Suppliers
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS embedding vector(1536);
CREATE INDEX IF NOT EXISTS idx_suppliers_embedding
  ON suppliers USING hnsw (embedding vector_cosine_ops);

-- Provider profiles
ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS embedding vector(1536);
CREATE INDEX IF NOT EXISTS idx_provider_profiles_embedding
  ON provider_profiles USING hnsw (embedding vector_cosine_ops);

-- Semantic match function for suppliers
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
LANGUAGE sql STABLE
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
    AND 1 - (s.embedding <=> query_embedding) > match_threshold
  ORDER BY s.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Semantic match function for people (provider profiles)
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
LANGUAGE sql STABLE
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
    AND 1 - (p.embedding <=> query_embedding) > match_threshold
  ORDER BY p.embedding <=> query_embedding
  LIMIT match_count;
$$;
