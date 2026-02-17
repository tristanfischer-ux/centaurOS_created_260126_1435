/**
 * Migration: Forge Data Tables
 *
 * Purpose: Create 7 tables to receive LLM-generated catalogue data from
 * ForgeOS Studio scripts. These tables hold component pricing, certifications,
 * compatibility pairs, cross-sell recommendations, entity reviews, tutorials,
 * and project templates.
 *
 * Security:
 * - All tables are public catalogue data (not per-foundry)
 * - SELECT for all authenticated users
 * - INSERT/UPDATE/DELETE restricted to service role (scripts use service_role key)
 *
 * Related:
 * - scripts/generate-pricing-data.py → component_pricing
 * - scripts/generate-reviews.py → entity_reviews
 * - scripts/generate-tutorials.py → tutorials
 * - scripts/generate-certifications.py → component_certifications
 * - scripts/generate-cross-sell.py → component_recommendations
 * - scripts/generate-project-templates.py → project_templates
 * - scripts/scrape-compatibility-pairs.py → component_compatibility
 *
 * Rollback: DROP TABLE component_pricing, entity_reviews, tutorials,
 *           component_certifications, component_recommendations,
 *           project_templates, component_compatibility CASCADE;
 */

-- ============================================================
-- 1. component_pricing
-- Tiered pricing, MOQ breakpoints, and lead times per component
-- ============================================================

CREATE TABLE IF NOT EXISTS component_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component_name text NOT NULL,
  manufacturer text,
  pricing_tiers jsonb NOT NULL DEFAULT '[]'::jsonb,
  moq int DEFAULT 1,
  lead_time_days jsonb,
  shipping_notes text,
  currency text DEFAULT 'USD',
  last_verified text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT component_pricing_unique UNIQUE (component_name, manufacturer)
);

CREATE INDEX IF NOT EXISTS idx_component_pricing_name ON component_pricing (component_name);
CREATE INDEX IF NOT EXISTS idx_component_pricing_manufacturer ON component_pricing (manufacturer);

ALTER TABLE component_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read component pricing"
  ON component_pricing FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- 2. entity_reviews
-- Reviews for components, suppliers, marketplace listings, blueprints, etc.
-- Named entity_reviews to avoid conflict with existing order-based reviews table
-- ============================================================

CREATE TABLE IF NOT EXISTS entity_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_name text NOT NULL,
  reviewer_name text,
  reviewer_role text,
  reviewer_company text,
  rating int NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title text,
  body text NOT NULL,
  pros text[] DEFAULT '{}',
  cons text[] DEFAULT '{}',
  verified_purchase boolean DEFAULT false,
  helpful_count int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entity_reviews_lookup ON entity_reviews (entity_type, entity_name);
CREATE INDEX IF NOT EXISTS idx_entity_reviews_rating ON entity_reviews (rating);

ALTER TABLE entity_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read entity reviews"
  ON entity_reviews FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- 3. tutorials
-- Step-by-step build guides, how-tos, and safety guides
-- ============================================================

CREATE TABLE IF NOT EXISTS tutorials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  topic text,
  difficulty text CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  estimated_read_minutes int,
  tags text[] DEFAULT '{}',
  prerequisites text[] DEFAULT '{}',
  tools_mentioned text[] DEFAULT '{}',
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  common_mistakes text[] DEFAULT '{}',
  further_reading text[] DEFAULT '{}',
  key_takeaways text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tutorials_topic ON tutorials (topic);
CREATE INDEX IF NOT EXISTS idx_tutorials_difficulty ON tutorials (difficulty);
CREATE INDEX IF NOT EXISTS idx_tutorials_slug ON tutorials (slug);

ALTER TABLE tutorials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read tutorials"
  ON tutorials FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- 4. component_certifications
-- CE, UL, RoHS, ITAR compliance data per component
-- ============================================================

CREATE TABLE IF NOT EXISTS component_certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component_name text NOT NULL,
  manufacturer text,
  certifications jsonb NOT NULL DEFAULT '[]'::jsonb,
  compliance_summary jsonb,
  export_control jsonb,
  material_declarations text[] DEFAULT '{}',
  regulatory_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT component_certifications_unique UNIQUE (component_name, manufacturer)
);

CREATE INDEX IF NOT EXISTS idx_component_certs_name ON component_certifications (component_name);
CREATE INDEX IF NOT EXISTS idx_component_certs_manufacturer ON component_certifications (manufacturer);

ALTER TABLE component_certifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read component certifications"
  ON component_certifications FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- 5. component_recommendations
-- Cross-sell bundles and "frequently used together" data
-- ============================================================

CREATE TABLE IF NOT EXISTS component_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_product text NOT NULL,
  primary_category text,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  bundle_suggestion jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT component_recommendations_unique UNIQUE (primary_product)
);

CREATE INDEX IF NOT EXISTS idx_component_recs_product ON component_recommendations (primary_product);
CREATE INDEX IF NOT EXISTS idx_component_recs_category ON component_recommendations (primary_category);

ALTER TABLE component_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read component recommendations"
  ON component_recommendations FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- 6. project_templates
-- Complete starter projects with BOM, steps, and cost estimates
-- ============================================================

CREATE TABLE IF NOT EXISTS project_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  difficulty text CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  estimated_hours numeric,
  estimated_cost_usd numeric,
  category text,
  tags text[] DEFAULT '{}',
  tools_required text[] DEFAULT '{}',
  skills_required text[] DEFAULT '{}',
  bom jsonb DEFAULT '[]'::jsonb,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  safety_warnings text[] DEFAULT '{}',
  "references" text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_templates_category ON project_templates (category);
CREATE INDEX IF NOT EXISTS idx_project_templates_difficulty ON project_templates (difficulty);
CREATE INDEX IF NOT EXISTS idx_project_templates_slug ON project_templates (slug);

ALTER TABLE project_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read project templates"
  ON project_templates FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- 7. component_compatibility
-- "Works with" pairs between components
-- ============================================================

CREATE TABLE IF NOT EXISTS component_compatibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component_a text NOT NULL,
  component_a_category text,
  component_b text NOT NULL,
  component_b_category text,
  relationship text NOT NULL,
  confidence numeric CHECK (confidence >= 0 AND confidence <= 1),
  notes text,
  domain text,
  source_url text,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT component_compat_unique UNIQUE (component_a, component_b, relationship)
);

CREATE INDEX IF NOT EXISTS idx_component_compat_a ON component_compatibility (component_a);
CREATE INDEX IF NOT EXISTS idx_component_compat_b ON component_compatibility (component_b);
CREATE INDEX IF NOT EXISTS idx_component_compat_domain ON component_compatibility (domain);

ALTER TABLE component_compatibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read component compatibility"
  ON component_compatibility FOR SELECT TO authenticated
  USING (true);
