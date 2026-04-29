-- =============================================================================
-- Migration: 20260429110000_demo_public_browse_access
-- Purpose: Adds read-only browse access for engine-quality observer users
--          (e.g. claude-test@forgeos.test) to a curated set of demo projects
--          without requiring foundry membership or modifying existing RLS.
--
--          This also lays the foundation for a future public-demo / sales-
--          showcase feature: any project flagged is_demo_public = true becomes
--          accessible to all authenticated users in SELECT-only capacity.
-- =============================================================================

-- 1. Add is_demo_public column to cad_lab_projects
ALTER TABLE cad_lab_projects
  ADD COLUMN IF NOT EXISTS is_demo_public boolean NOT NULL DEFAULT false;

-- 2. Tag the 5 demo projects
UPDATE cad_lab_projects
SET is_demo_public = true
WHERE id IN (
  '0ab0457a-ab32-4d2a-b1e3-32d8b877222c',  -- BESS — 40ft 3.5 MWh containerised
  '330e1bec-58f8-422c-b225-ea42b18580d1',  -- Containerised desalination — 500 m3/day SWRO
  '365eb5bf-69ff-475a-8ef9-f18d4adb8135',  -- HAPS — Wren-style hybrid stratospheric platform
  '3acf3007-b720-400b-8dc4-818394df102d',  -- Hedgerow — premium garden bird feeder
  '517ae649-b3d3-42ad-94d7-99ac408e428b'   -- Modular vertical farm — 40ft container
);

-- 3a. Parallel SELECT policy on cad_lab_projects for demo-flagged rows
CREATE POLICY "view_demo_public_projects"
  ON cad_lab_projects
  FOR SELECT
  TO authenticated
  USING (is_demo_public = true);

-- 3b. Parallel SELECT policy on pipeline_runs for demo project runs
-- (pipeline_runs has project_id; join through cad_lab_projects to check flag)
CREATE POLICY "pipeline_runs_select_demo_public"
  ON pipeline_runs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM cad_lab_projects p
      WHERE p.id = pipeline_runs.project_id
        AND p.is_demo_public = true
    )
  );

-- 3c. Parallel SELECT policy on report_downloads for demo project downloads.
-- report_downloads has no project_id column; storage_path follows the pattern
-- {foundry_id}/{project_id}/filename so we match on the second path segment.
CREATE POLICY "select_demo_public_report_downloads"
  ON report_downloads
  FOR SELECT
  TO authenticated
  USING (
    split_part(storage_path, '/', 2) IN (
      '0ab0457a-ab32-4d2a-b1e3-32d8b877222c',
      '330e1bec-58f8-422c-b225-ea42b18580d1',
      '365eb5bf-69ff-475a-8ef9-f18d4adb8135',
      '3acf3007-b720-400b-8dc4-818394df102d',
      '517ae649-b3d3-42ad-94d7-99ac408e428b'
    )
  );

-- Note: gate_verdicts has RLS disabled (relrowsecurity = false) so no policy
-- needed — all authenticated reads already pass through.

-- 4. Storage policy: allow authenticated users to read PDFs for demo projects
--    Path pattern in report-downloads bucket: {foundry_id}/{project_id}/filename
--    We match on the second path segment being one of the 5 demo project IDs.
CREATE POLICY "report_downloads_select_demo_public"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'report-downloads'
    AND split_part(name, '/', 2) IN (
      '0ab0457a-ab32-4d2a-b1e3-32d8b877222c',
      '330e1bec-58f8-422c-b225-ea42b18580d1',
      '365eb5bf-69ff-475a-8ef9-f18d4adb8135',
      '3acf3007-b720-400b-8dc4-818394df102d',
      '517ae649-b3d3-42ad-94d7-99ac408e428b'
    )
  );
