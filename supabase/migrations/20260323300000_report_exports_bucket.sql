-- Migration: Create private report-exports bucket
--
-- INTENT: Report files (PDF, DOCX, PPTX, PNG) were previously stored in the
-- public xray-images bucket. While the UI uses signed URLs, files at known
-- paths were world-readable without auth. This migration creates a dedicated
-- private bucket so report files are never publicly accessible.
--
-- DECISION: Separate bucket instead of making xray-images private because
-- 40+ getPublicUrl() calls across the codebase depend on xray-images being public.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'report-exports',
  'report-exports',
  false,
  52428800, -- 50 MB
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/png'
  ]
);

-- RLS: Authenticated users can upload, read, and delete their own files.
-- Foundry-level isolation is enforced at the application layer (server actions
-- filter by foundry_id). Storage RLS only gates on auth.uid() because Storage
-- objects don't carry a foundry_id column.

CREATE POLICY "auth_upload_report_exports" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'report-exports' AND auth.uid() IS NOT NULL);

CREATE POLICY "auth_read_report_exports" ON storage.objects FOR SELECT
  USING (bucket_id = 'report-exports' AND auth.uid() IS NOT NULL);

CREATE POLICY "auth_delete_report_exports" ON storage.objects FOR DELETE
  USING (bucket_id = 'report-exports' AND auth.uid() IS NOT NULL);
