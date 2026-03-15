-- Migration: Add GLB MIME type to xray-images bucket
--
-- Purpose: Tripo and TRELLIS providers produce GLB (GL Binary) files.
-- The bucket only allowed STL/STEP — GLB uploads were silently rejected,
-- causing "No 3D model" in the comparison UI despite successful generation.
--
-- Also bumps file size limit from 20MB to 50MB for large Tripo GLBs (16MB+).
--
-- Rollback: UPDATE storage.buckets SET allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp','image/svg+xml','application/step','application/sla','model/stl','application/octet-stream'], file_size_limit = 20971520 WHERE id = 'xray-images';

UPDATE storage.buckets
SET
    allowed_mime_types = ARRAY[
        'image/png',
        'image/jpeg',
        'image/webp',
        'image/svg+xml',
        'application/step',
        'application/sla',
        'model/stl',
        'model/gltf-binary',
        'application/octet-stream'
    ],
    file_size_limit = 52428800  -- 50MB for large GLB files (Tripo produces 16MB+)
WHERE id = 'xray-images';
