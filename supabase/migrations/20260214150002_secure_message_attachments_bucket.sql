/**
 * Migration: Secure legacy message-attachments bucket
 *
 * Purpose:
 * - Disable public access for legacy message attachment objects.
 * - Enforce access through signed URL flow and RLS policies only.
 *
 * Security:
 * - Prevent unauthenticated retrieval of historical attachments.
 * - Existing access for authenticated members remains governed by storage policies
 *   and API-level conversation/message ownership checks.
 *
 * Related:
 * - 20260202200000_message_attachments_storage.sql
 * - 20260214123000_secure_message_files_bucket.sql
 * - src/app/api/messages/file-url/route.ts
 */

UPDATE storage.buckets
SET public = false
WHERE id = 'message-attachments';
