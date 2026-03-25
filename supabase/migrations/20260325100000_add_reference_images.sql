-- Add reference_images JSONB column to cad_lab_projects
-- Stores array of {id, name, mimeType, storageUrl, originalSize}
ALTER TABLE public.cad_lab_projects
ADD COLUMN IF NOT EXISTS reference_images JSONB DEFAULT NULL;
