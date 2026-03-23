-- Red team hardening for report_downloads table + xray-images bucket.
--
-- Fixes:
-- C-1: Add PDF/DOCX/PPTX MIME types to xray-images bucket (uploads were silently rejected)
-- C-2: INSERT RLS policy now checks foundry_id matches user's foundry (prevents cross-foundry injection)
-- H-1: file_size_bytes upgraded from integer to bigint (prevents overflow for large reports)
-- H-3: CHECK constraints on report_source and file_format (enum-like validation at DB level)
-- M-2: report_name length capped at 500 characters

-- ═══════════════════════════════════════════════════════════════
-- C-1: Add document MIME types to xray-images bucket
-- ═══════════════════════════════════════════════════════════════
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/svg+xml',
    'application/step',
    'application/sla',
    'model/stl',
    'model/gltf-binary',
    'application/octet-stream',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
]
WHERE id = 'xray-images';

-- ═══════════════════════════════════════════════════════════════
-- C-2: Fix INSERT policy — require foundry_id matches user's foundry
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "insert_own" ON report_downloads;
CREATE POLICY "insert_own" ON report_downloads FOR INSERT
  WITH CHECK (
    profile_id = auth.uid()
    AND foundry_id IN (SELECT foundry_id FROM profiles WHERE id = auth.uid())
  );

-- ═══════════════════════════════════════════════════════════════
-- H-1: Upgrade file_size_bytes from integer to bigint
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE report_downloads ALTER COLUMN file_size_bytes TYPE bigint;

-- ═══════════════════════════════════════════════════════════════
-- H-3: CHECK constraints on enum-like columns
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE report_downloads
  ADD CONSTRAINT chk_report_source
    CHECK (report_source IN ('cad-lab', 'reports', 'investors', 'finance', 'agents'));

ALTER TABLE report_downloads
  ADD CONSTRAINT chk_file_format
    CHECK (file_format IN ('docx', 'pptx', 'pdf', 'csv', 'png'));

-- ═══════════════════════════════════════════════════════════════
-- M-2: Cap report_name length
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE report_downloads
  ADD CONSTRAINT chk_report_name_length
    CHECK (length(report_name) <= 500);
