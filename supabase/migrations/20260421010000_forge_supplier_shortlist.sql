-- ============================================================
-- Forge supplier shortlist — DB-backed (Phase 4 of Source overhaul)
-- ============================================================
--
-- INTENT: Before this migration, the Forge Source-stage supplier shortlist
-- lived only in localStorage (`forge-supplier-shortlist-v2-<projectId>`).
-- State was lost when the user switched devices, browsers, or cleared
-- storage. No audit trail, no team sharing, no cross-session persistence.
--
-- This migration persists the shortlist in Postgres, RLS-scoped to the
-- project's owning foundry so cross-tenant leakage is impossible. Client
-- still reads localStorage as a one-time migration source on mount, then
-- writes through to the DB and wipes the v2 key in favour of a v3 marker.
--
-- Schema mirrors the ShortlistedSupplier TS interface in
-- src/app/(platform)/the-forge/cad-lab/source/page.tsx so the serialized
-- v2 blob maps 1:1 during migration.

CREATE TABLE IF NOT EXISTS public.forge_supplier_shortlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.cad_lab_projects(id) ON DELETE CASCADE,
  supplier_id text NOT NULL, -- matches marketplace_listings.id stringified (legacy localStorage key format)
  supplier_name text NOT NULL,
  is_verified boolean NOT NULL DEFAULT false,
  supplier_type text,
  module_ids text[] NOT NULL DEFAULT '{}',
  best_match_score numeric,
  best_score_breakdown jsonb,
  all_match_reasons text[] NOT NULL DEFAULT '{}',
  ramp_role text NOT NULL DEFAULT 'unassigned',
    -- proto | pilot | production | proto_only | unassigned
  notes text,
  added_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, supplier_id)
);

CREATE INDEX IF NOT EXISTS idx_forge_supplier_shortlist_project
  ON public.forge_supplier_shortlist(project_id);

CREATE INDEX IF NOT EXISTS idx_forge_supplier_shortlist_added_by
  ON public.forge_supplier_shortlist(added_by);

-- Keep updated_at fresh on UPDATE
CREATE OR REPLACE FUNCTION public.forge_supplier_shortlist_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_forge_supplier_shortlist_touch ON public.forge_supplier_shortlist;
CREATE TRIGGER trg_forge_supplier_shortlist_touch
  BEFORE UPDATE ON public.forge_supplier_shortlist
  FOR EACH ROW EXECUTE FUNCTION public.forge_supplier_shortlist_touch_updated_at();

-- ─── Row Level Security ─────────────────────────────────────────────

ALTER TABLE public.forge_supplier_shortlist ENABLE ROW LEVEL SECURITY;

-- Tenant scope: shortlist row is accessible iff the joined cad_lab_project
-- belongs to the caller's foundry. Mirrors the pattern used on
-- cad_lab_projects itself (profiles.foundry_id via auth.uid()).

CREATE POLICY "view_forge_supplier_shortlist_in_own_foundry"
  ON public.forge_supplier_shortlist
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.cad_lab_projects p
      WHERE p.id = forge_supplier_shortlist.project_id
        AND p.foundry_id = (
          SELECT profiles.foundry_id FROM public.profiles
          WHERE profiles.id = auth.uid()
        )
    )
  );

CREATE POLICY "create_forge_supplier_shortlist_in_own_foundry"
  ON public.forge_supplier_shortlist
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.cad_lab_projects p
      WHERE p.id = forge_supplier_shortlist.project_id
        AND p.foundry_id = (
          SELECT profiles.foundry_id FROM public.profiles
          WHERE profiles.id = auth.uid()
        )
    )
  );

CREATE POLICY "update_forge_supplier_shortlist_in_own_foundry"
  ON public.forge_supplier_shortlist
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.cad_lab_projects p
      WHERE p.id = forge_supplier_shortlist.project_id
        AND p.foundry_id = (
          SELECT profiles.foundry_id FROM public.profiles
          WHERE profiles.id = auth.uid()
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.cad_lab_projects p
      WHERE p.id = forge_supplier_shortlist.project_id
        AND p.foundry_id = (
          SELECT profiles.foundry_id FROM public.profiles
          WHERE profiles.id = auth.uid()
        )
    )
  );

CREATE POLICY "delete_forge_supplier_shortlist_in_own_foundry"
  ON public.forge_supplier_shortlist
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.cad_lab_projects p
      WHERE p.id = forge_supplier_shortlist.project_id
        AND p.foundry_id = (
          SELECT profiles.foundry_id FROM public.profiles
          WHERE profiles.id = auth.uid()
        )
    )
  );

COMMENT ON TABLE public.forge_supplier_shortlist IS
  'Per-project shortlist of matched suppliers used on the Forge Source stage. RLS-scoped to the project''s foundry via cad_lab_projects.foundry_id → profiles.foundry_id. Replaces localStorage "forge-supplier-shortlist-v2-<projectId>" (Phase 4 2026-04-18).';
