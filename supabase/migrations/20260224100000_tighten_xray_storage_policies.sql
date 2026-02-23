--- Migration: Tighten xray-images storage bucket SELECT policy (F3)
---
--- Problem: The xray-images bucket had a public-read policy ("Anyone can view
--- xray images") that allowed any unauthenticated user to enumerate all scan
--- images across all foundries.
---
--- Fix: Replace with authenticated-read. Any logged-in user can view images
--- (needed because images are referenced across foundry contexts in the
--- marketplace/matching flow). Unauthenticated users cannot enumerate.
---
--- Rollback:
---   DROP POLICY IF EXISTS "Authenticated users can view xray images" ON storage.objects;
---   CREATE POLICY "Anyone can view xray images" ON storage.objects FOR SELECT
---   USING (bucket_id = 'xray-images');

DROP POLICY IF EXISTS "Anyone can view xray images" ON storage.objects;

CREATE POLICY "Authenticated users can view xray images"
ON storage.objects FOR SELECT
USING (bucket_id = 'xray-images' AND auth.uid() IS NOT NULL);
