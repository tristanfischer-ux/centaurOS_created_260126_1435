-- ═══════════════════════════════════════════════════════════════
-- Grammar Version History — Enables rollback and audit trail
-- ═══════════════════════════════════════════════════════════════
--
-- When a grammar is updated, the previous version is archived here.
-- cad_grammars.previous_version_id links to the archived version.

-- 1. Version history table
CREATE TABLE cad_grammar_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grammar_id UUID NOT NULL REFERENCES cad_grammars(id) ON DELETE CASCADE,
  version INT NOT NULL,
  python_code TEXT NOT NULL,
  core_library_code TEXT,
  param_specs JSONB,
  defaults JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  change_summary TEXT,
  UNIQUE(grammar_id, version)
);

CREATE INDEX idx_cad_grammar_versions_grammar_id ON cad_grammar_versions(grammar_id);
CREATE INDEX idx_cad_grammar_versions_created_at ON cad_grammar_versions(created_at DESC);

-- 2. Add optional columns to cad_grammars
ALTER TABLE cad_grammars
  ADD COLUMN IF NOT EXISTS previous_version_id UUID REFERENCES cad_grammar_versions(id),
  ADD COLUMN IF NOT EXISTS deprecation_notice TEXT;

-- 3. Trigger: archive previous version on update (except __core_library__)
CREATE OR REPLACE FUNCTION archive_grammar_version_on_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Skip archiving for the core library row
  IF OLD.name = '__core_library__' THEN
    RETURN NEW;
  END IF;

  -- Archive the previous row into cad_grammar_versions
  INSERT INTO cad_grammar_versions (
    grammar_id, version, python_code, core_library_code,
    param_specs, defaults, created_by
  ) VALUES (
    OLD.id,
    OLD.version,
    OLD.python_code,
    OLD.core_library_code,
    OLD.param_specs,
    OLD.defaults,
    auth.uid()
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_archive_grammar_version
  BEFORE UPDATE ON cad_grammars
  FOR EACH ROW
  WHEN (
    OLD.name != '__core_library__'
    AND (OLD.python_code IS DISTINCT FROM NEW.python_code
         OR OLD.core_library_code IS DISTINCT FROM NEW.core_library_code
         OR OLD.param_specs IS DISTINCT FROM NEW.param_specs
         OR OLD.defaults IS DISTINCT FROM NEW.defaults)
  )
  EXECUTE FUNCTION archive_grammar_version_on_update();

-- RLS
ALTER TABLE cad_grammar_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read grammar versions"
  ON cad_grammar_versions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role manages grammar versions"
  ON cad_grammar_versions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
