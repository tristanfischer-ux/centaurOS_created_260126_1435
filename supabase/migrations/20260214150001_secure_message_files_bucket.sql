/**
 * Migration: Secure message-files bucket by disabling public access
 *
 * Purpose:
 * - Enforce authenticated, conversation-participant access to message files.
 * - Prevent unauthenticated access through public bucket URLs.
 *
 * Security:
 * - Bucket public access is disabled.
 * - Access remains controlled via existing storage.objects RLS policies:
 *   - "Users can upload files to their conversations"
 *   - "Users can view files from their conversations"
 *   - "Users can delete their own files"
 *
 * Related:
 * - 20260202300000_message_file_storage.sql
 * - src/app/api/messages/upload/route.ts
 * - src/app/api/messages/file-url/route.ts
 */

UPDATE storage.buckets
SET public = false
WHERE id = 'message-files';
