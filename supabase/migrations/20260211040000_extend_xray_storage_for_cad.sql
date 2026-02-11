-- Migration: Extend xray-images bucket for CAD files (STEP, STL, SVG)
--
-- Purpose: Product X-Ray 3D CAD model generation produces STEP, STL, and SVG
-- files that need to be stored alongside existing PNG blueprint images.
-- Increases file size limit from 5MB to 20MB for STEP/STL files.
--
-- Related:
-- - Service: src/app/(platform)/product-xray/services/cad-generator.ts
-- - Modal worker: modal_cad_worker.py
--
-- Rollback: UPDATE storage.buckets SET allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp'], file_size_limit = 5242880 WHERE id = 'xray-images';

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
        'application/octet-stream'
    ],
    file_size_limit = 20971520  -- 20MB for STEP/STL files
WHERE id = 'xray-images';
