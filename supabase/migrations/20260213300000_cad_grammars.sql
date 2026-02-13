-- ═══════════════════════════════════════════════════════════════
-- CAD Grammars — Grammar-Based Parametric CAD System
-- ═══════════════════════════════════════════════════════════════
--
-- Stores domain grammars that encode engineering knowledge for
-- parametric CAD generation. Each grammar converts parameters
-- into deterministic 3D geometry via a three-level pipeline:
--   Level 1 (AI): Natural language → parameters
--   Level 2 (Math): derive_skeleton() → all dimensions
--   Level 3 (CadQuery): build() → 3D assembly
--
-- Grammars grow over time: built-in, researched, user-created.

CREATE TABLE IF NOT EXISTS cad_grammars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL,

  -- Discovery / matching
  domain_keywords TEXT[] NOT NULL DEFAULT '{}',
  example_prompts TEXT[] NOT NULL DEFAULT '{}',

  -- Code
  python_code TEXT NOT NULL,
  core_library_code TEXT NOT NULL,

  -- Schema (extracted from Python for server-side use)
  param_specs JSONB NOT NULL DEFAULT '[]',
  defaults JSONB NOT NULL DEFAULT '{}',
  constraints_summary TEXT,

  -- Provenance
  source TEXT NOT NULL DEFAULT 'built_in'
    CHECK (source IN ('built_in', 'researched', 'user_created')),
  research_references JSONB,

  -- Lifecycle
  is_active BOOLEAN NOT NULL DEFAULT true,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for grammar lookup
CREATE INDEX IF NOT EXISTS idx_cad_grammars_active ON cad_grammars (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_cad_grammars_name ON cad_grammars (name);
CREATE INDEX IF NOT EXISTS idx_cad_grammars_keywords ON cad_grammars USING GIN (domain_keywords);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_cad_grammars_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cad_grammars_updated_at
  BEFORE UPDATE ON cad_grammars
  FOR EACH ROW
  EXECUTE FUNCTION update_cad_grammars_updated_at();

-- ═══════════════════════════════════════════════════════════════
-- RLS Policies
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE cad_grammars ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read active grammars
CREATE POLICY "Authenticated users can read active grammars"
  ON cad_grammars FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Service role has full access (for seeding and grammar creation)
CREATE POLICY "Service role manages grammars"
  ON cad_grammars FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
