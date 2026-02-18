/**
 * Migration: Step Template Library
 *
 * Purpose: Store real-world STEP/STL template files downloaded from
 * open-source repositories (KiCad, FreeCAD, OpenBuilds, NASA).
 * These serve as starting-point designs users can browse and use.
 *
 * Security:
 * - Public read (templates are open-source, anyone can browse)
 * - Foundry-scoped insert for user-uploaded custom templates
 *
 * Related:
 * - src/actions/step-templates.ts (future)
 * - scripts/upload-step-templates.py
 *
 * Rollback: DROP TABLE step_templates CASCADE;
 */

CREATE TABLE IF NOT EXISTS step_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  description TEXT,
  source_repo TEXT NOT NULL,
  source_path TEXT NOT NULL,
  license TEXT NOT NULL,
  step_url TEXT,
  stl_url TEXT,
  thumbnail_url TEXT,
  file_size_bytes INTEGER,
  tags TEXT[] DEFAULT '{}',
  is_assembly BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  foundry_id TEXT REFERENCES foundries(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_step_templates_category ON step_templates(category);
CREATE INDEX IF NOT EXISTS idx_step_templates_subcategory ON step_templates(subcategory);
CREATE INDEX IF NOT EXISTS idx_step_templates_tags ON step_templates USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_step_templates_source ON step_templates(source_repo);
CREATE INDEX IF NOT EXISTS idx_step_templates_slug ON step_templates(slug);

-- RLS: Public read, foundry-scoped write for custom uploads
ALTER TABLE step_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view step templates"
  ON step_templates FOR SELECT
  USING (true);

CREATE POLICY "Foundry members can add custom templates"
  ON step_templates FOR INSERT
  WITH CHECK (
    foundry_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM foundry_memberships fm
      WHERE fm.foundry_id = step_templates.foundry_id
      AND fm.user_id = auth.uid()
    )
  );

-- Also add preview columns to existing component_geometry_types
ALTER TABLE component_geometry_types
  ADD COLUMN IF NOT EXISTS preview_step_url TEXT,
  ADD COLUMN IF NOT EXISTS preview_stl_url TEXT,
  ADD COLUMN IF NOT EXISTS preview_svg TEXT;
