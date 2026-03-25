-- Add reference_documents JSONB column to cad_lab_projects
ALTER TABLE public.cad_lab_projects
ADD COLUMN IF NOT EXISTS reference_documents JSONB DEFAULT NULL;

-- Add XLSX MIME type to xray-images bucket (PDF/DOCX/PPTX already present)
UPDATE storage.buckets
SET allowed_mime_types = allowed_mime_types || ARRAY[
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]::text[]
WHERE id = 'xray-images'
  AND NOT ('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' = ANY(allowed_mime_types));
