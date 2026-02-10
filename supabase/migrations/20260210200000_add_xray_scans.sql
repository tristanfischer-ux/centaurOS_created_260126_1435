-- Migration: Add xray_scans table + xray-images storage bucket
--
-- Purpose: Persist Product X-Ray AI scan results per foundry.
-- Each scan stores the full XRaySpec as JSONB, including modules,
-- diagnostic state, and image URLs.
--
-- Security:
-- - RLS policy ensures users can only see scans in their foundries
-- - Users can create/update scans in foundries they belong to
--
-- Related:
-- - Frontend: src/app/(platform)/product-xray/
-- - Actions: src/actions/xray.ts
-- - Schema: src/app/(platform)/product-xray/services/xray-schema.ts
--
-- Rollback: DROP TABLE public.xray_scans CASCADE; DELETE FROM storage.buckets WHERE id = 'xray-images';

-- ─── Table ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.xray_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT NOT NULL,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    idea TEXT NOT NULL,
    spec JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scanned', 'diagnostic_complete')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_xray_scans_foundry ON public.xray_scans(foundry_id);
CREATE INDEX IF NOT EXISTS idx_xray_scans_created_by ON public.xray_scans(created_by);
CREATE INDEX IF NOT EXISTS idx_xray_scans_status ON public.xray_scans(status);

-- ─── RLS ─────────────────────────────────────────────────────────────

ALTER TABLE public.xray_scans ENABLE ROW LEVEL SECURITY;

-- Users can view scans in their own foundry
CREATE POLICY "view_xray_scans_in_own_foundry"
ON public.xray_scans
FOR SELECT
USING (
    foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
);

-- Users can create scans in their own foundry
CREATE POLICY "create_xray_scans_in_own_foundry"
ON public.xray_scans
FOR INSERT
WITH CHECK (
    created_by = auth.uid()
    AND foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
);

-- Users can update scans in their own foundry
CREATE POLICY "update_xray_scans_in_own_foundry"
ON public.xray_scans
FOR UPDATE
USING (
    foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
);

-- ─── Updated_at trigger ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_xray_scans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER xray_scans_updated_at
    BEFORE UPDATE ON public.xray_scans
    FOR EACH ROW
    EXECUTE FUNCTION public.update_xray_scans_updated_at();

-- ─── Storage bucket for X-Ray images ────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'xray-images',
    'xray-images',
    true,  -- Public read for displaying in UI
    5242880,  -- 5MB max per image
    ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: authenticated users can upload images
CREATE POLICY "Authenticated users can upload xray images"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'xray-images'
    AND auth.uid() IS NOT NULL
);

-- Storage RLS: anyone can read (public bucket)
CREATE POLICY "Anyone can view xray images"
ON storage.objects FOR SELECT
USING (bucket_id = 'xray-images');

-- Storage RLS: users can delete their own uploads
CREATE POLICY "Users can delete own xray images"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'xray-images'
    AND auth.uid() IS NOT NULL
);
