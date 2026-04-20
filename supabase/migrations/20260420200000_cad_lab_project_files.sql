-- ─────────────────────────────────────────────────────────────────────────────
-- CAD upload Round A — per-project CAD file table + private storage bucket
--
-- One table, one bucket. Sits alongside `cad_lab_projects.reference_documents`
-- JSONB (which stays for PDFs/DOCX/etc) so CAD has structured columns for
-- downstream artefact joins (Modules / BOM / Cost / Suppliers).
--
-- Scope decisions pinned by Tristan (see CAD-UPLOAD-SCOPING.md + CAD-UPLOAD-HANDOVER.md):
--   • V1 formats: STEP, STL, DXF, DWG  (IGES / Parasolid deferred)
--   • Per-project scope (not foundry-wide)
--   • Free-tier (no paywall for V1)
--   • Clean RLS from day one — never bolt auth on later
--   • material_hint stored free-text (no enum — taxonomy will evolve)
--   • DWG parsing itself is stubbed to "unsupported" in V1 pending licensing
--     decision (see CAD-UPLOAD-HANDOVER.md). Row schema accepts it so the
--     only change needed when DWG comes online is the parser implementation.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Table ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cad_lab_project_files (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES public.cad_lab_projects(id) ON DELETE CASCADE,
  foundry_id          text NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  uploaded_by         uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  filename            text NOT NULL,
  storage_path        text NOT NULL,
  mime_type           text NOT NULL,
  size_bytes          bigint NOT NULL CHECK (size_bytes > 0),

  format              text NOT NULL
                        CHECK (format IN ('step', 'stl', 'dxf', 'dwg')),

  -- Free-text; the UI offers a dropdown but the taxonomy will evolve (nylon-glass,
  -- CFRP layups, etc) so we deliberately avoid an enum constraint.
  material_hint       text,

  parse_status        text NOT NULL DEFAULT 'pending'
                        CHECK (parse_status IN ('pending', 'parsing', 'parsed', 'failed')),
  parse_error         text,

  -- Parsed geometry — nullable until parse_status='parsed'
  bbox_min_mm         jsonb,   -- { x, y, z }
  bbox_max_mm         jsonb,   -- { x, y, z }
  volume_mm3          numeric,
  surface_area_mm2    numeric,
  part_count          integer,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cad_lab_project_files IS
  'CAD-upload Round A — per-project STEP/STL/DXF/DWG files with parsed geometry. '
  'Sits alongside cad_lab_projects.reference_documents (JSONB) so CAD has '
  'structured columns for downstream Modules/BOM/Cost/Suppliers joins.';

COMMENT ON COLUMN public.cad_lab_project_files.material_hint IS
  'Free-text founder answer to "what is it made of?". UI offers a fixed dropdown '
  'but the column is text so the taxonomy can evolve without a migration.';

COMMENT ON COLUMN public.cad_lab_project_files.storage_path IS
  'Full path inside the private project-cad-files bucket. '
  'Format: <foundry_id>/<project_id>/<file_id>.<ext>';


-- ── 2. Indexes ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS cad_lab_project_files_project_idx
  ON public.cad_lab_project_files (project_id);

CREATE INDEX IF NOT EXISTS cad_lab_project_files_foundry_idx
  ON public.cad_lab_project_files (foundry_id);

CREATE INDEX IF NOT EXISTS cad_lab_project_files_foundry_project_idx
  ON public.cad_lab_project_files (foundry_id, project_id);

CREATE INDEX IF NOT EXISTS cad_lab_project_files_uploader_idx
  ON public.cad_lab_project_files (uploaded_by);

CREATE INDEX IF NOT EXISTS cad_lab_project_files_status_idx
  ON public.cad_lab_project_files (parse_status)
  WHERE parse_status IN ('pending', 'parsing');


-- ── 3. updated_at trigger ───────────────────────────────────────────────────

DROP TRIGGER IF EXISTS cad_lab_project_files_set_updated_at
  ON public.cad_lab_project_files;

CREATE TRIGGER cad_lab_project_files_set_updated_at
  BEFORE UPDATE ON public.cad_lab_project_files
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();


-- ── 4. RLS ──────────────────────────────────────────────────────────────────
--
-- Pattern mirrored from public.projects (20260419100500_projects.sql):
-- foundry membership via public.foundry_memberships. Mutations (UPDATE / DELETE)
-- are further restricted to the uploader so a peer in the same foundry can
-- SEE another founder's CAD but cannot delete or mutate it.

ALTER TABLE public.cad_lab_project_files ENABLE ROW LEVEL SECURITY;

-- SELECT — any active foundry member can see the foundry's CAD files
CREATE POLICY "cad_lab_project_files_foundry_select"
  ON public.cad_lab_project_files
  FOR SELECT
  USING (
    foundry_id IN (
      SELECT fm.foundry_id
      FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid() AND fm.active = true
    )
  );

-- INSERT — must be an active foundry member AND must stamp themselves
-- as uploader (prevents spoofing uploaded_by)
CREATE POLICY "cad_lab_project_files_foundry_insert"
  ON public.cad_lab_project_files
  FOR INSERT
  WITH CHECK (
    foundry_id IN (
      SELECT fm.foundry_id
      FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid() AND fm.active = true
    )
    AND uploaded_by = auth.uid()
  );

-- UPDATE — uploader only
CREATE POLICY "cad_lab_project_files_uploader_update"
  ON public.cad_lab_project_files
  FOR UPDATE
  USING (
    uploaded_by = auth.uid()
    AND foundry_id IN (
      SELECT fm.foundry_id
      FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid() AND fm.active = true
    )
  )
  WITH CHECK (
    uploaded_by = auth.uid()
    AND foundry_id IN (
      SELECT fm.foundry_id
      FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid() AND fm.active = true
    )
  );

-- DELETE — uploader only
CREATE POLICY "cad_lab_project_files_uploader_delete"
  ON public.cad_lab_project_files
  FOR DELETE
  USING (
    uploaded_by = auth.uid()
    AND foundry_id IN (
      SELECT fm.foundry_id
      FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid() AND fm.active = true
    )
  );


-- ── 5. Storage bucket (PRIVATE) ────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-cad-files',
  'project-cad-files',
  false,                       -- PRIVATE. Signed URLs only.
  52428800,                    -- 50 MB (STEP assemblies routinely exceed 20 MB)
  ARRAY[
    'application/step',
    'application/STEP',
    'application/x-step',
    'model/step',
    'model/stl',
    'application/sla',
    'application/vnd.ms-pki.stl',
    'application/dxf',
    'image/vnd.dxf',
    'application/acad',
    'application/dwg',
    'application/x-dwg',
    'image/vnd.dwg',
    -- Fallback for CAD exporters that don't set a specific MIME
    'application/octet-stream'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;


-- ── 6. Storage object RLS ───────────────────────────────────────────────────
--
-- Path convention: <foundry_id>/<project_id>/<file_id>.<ext>
--   - foldername[1] = foundry_id  (text, matches foundries.id and foundry_memberships.foundry_id)
--   - foldername[2] = project_id  (uuid text)
--
-- SELECT: any active foundry member for that foundry
-- INSERT: authenticated user who is an active member of that foundry
-- DELETE: owner of the matching row in cad_lab_project_files
-- UPDATE: intentionally not allowed — uploads are immutable; to change a file
--         the user deletes and re-uploads (keeps audit trail simple).

DROP POLICY IF EXISTS "project_cad_files_select"  ON storage.objects;
DROP POLICY IF EXISTS "project_cad_files_insert"  ON storage.objects;
DROP POLICY IF EXISTS "project_cad_files_delete"  ON storage.objects;

CREATE POLICY "project_cad_files_select"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'project-cad-files'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] IN (
      SELECT fm.foundry_id
      FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid() AND fm.active = true
    )
  );

CREATE POLICY "project_cad_files_insert"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'project-cad-files'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] IN (
      SELECT fm.foundry_id
      FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid() AND fm.active = true
    )
  );

CREATE POLICY "project_cad_files_delete"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'project-cad-files'
    AND auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1
      FROM public.cad_lab_project_files f
      WHERE f.storage_path = storage.objects.name
        AND f.uploaded_by  = auth.uid()
    )
  );
