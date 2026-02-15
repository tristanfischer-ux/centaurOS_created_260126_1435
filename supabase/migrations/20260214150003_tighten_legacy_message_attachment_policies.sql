/**
 * Migration: Tighten legacy message-attachments storage policies
 *
 * Purpose:
 * - Remove permissive foundry-wide legacy policies on message-attachments objects.
 * - Enforce conversation participant checks for reads.
 * - Restrict deletes to attachment senders within authorized conversations.
 * - Prevent new writes to legacy bucket by removing INSERT policy.
 *
 * Security:
 * - Legacy attachment access now follows conversation membership boundaries.
 * - Direct storage object reads by unrelated foundry members are denied.
 * - Legacy bucket is treated as read-only migration surface.
 *
 * Related:
 * - 20260202200000_message_attachments_storage.sql
 * - 20260214130000_secure_message_attachments_bucket.sql
 * - src/app/api/messages/file-url/route.ts
 */

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Users can upload to own foundry'
  ) THEN
    DROP POLICY "Users can upload to own foundry" ON storage.objects;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Users can view files from own conversations'
  ) THEN
    DROP POLICY "Users can view files from own conversations" ON storage.objects;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Users can delete own files'
  ) THEN
    DROP POLICY "Users can delete own files" ON storage.objects;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Users can view legacy message attachments from participant conversations'
  ) THEN
    CREATE POLICY "Users can view legacy message attachments from participant conversations"
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (
      bucket_id = 'message-attachments'
      AND EXISTS (
        SELECT 1
        FROM public.messages m
        JOIN public.conversation_participants cp
          ON cp.conversation_id = m.conversation_id
        WHERE cp.profile_id = auth.uid()
          AND m.file_url IS NOT NULL
          AND (
            m.file_url LIKE '%' || name
            OR m.file_url LIKE '%' || replace(name, '/', '%2F')
          )
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Users can delete legacy attachments they sent'
  ) THEN
    CREATE POLICY "Users can delete legacy attachments they sent"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
      bucket_id = 'message-attachments'
      AND EXISTS (
        SELECT 1
        FROM public.messages m
        JOIN public.conversation_participants cp
          ON cp.conversation_id = m.conversation_id
        WHERE cp.profile_id = auth.uid()
          AND m.sender_id = auth.uid()
          AND m.file_url IS NOT NULL
          AND (
            m.file_url LIKE '%' || name
            OR m.file_url LIKE '%' || replace(name, '/', '%2F')
          )
      )
    );
  END IF;
END $$;
