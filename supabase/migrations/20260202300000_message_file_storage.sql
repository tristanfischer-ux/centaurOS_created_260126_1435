-- Migration: Add storage bucket for message files
-- 
-- Purpose: Create storage bucket for file attachments in messages
-- 
-- Security:
-- - Files are organized by conversation ID
-- - RLS policies ensure users can only access files from conversations they're part of
-- - Public read access for participants, authenticated write

-- Create storage bucket for message files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'message-files',
  'message-files',
  true, -- Public read access (authenticated users only via RLS)
  10485760, -- 10MB limit
  ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'application/zip',
    'application/x-zip-compressed'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- RLS Policies (idempotent)
DO $$
BEGIN
    -- RLS Policy: Users can upload files to conversations they're part of
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' 
        AND tablename = 'objects' 
        AND policyname = 'Users can upload files to their conversations'
    ) THEN
        CREATE POLICY "Users can upload files to their conversations"
        ON storage.objects
        FOR INSERT
        TO authenticated
        WITH CHECK (
          bucket_id = 'message-files' AND
          -- Check if user is participant in the conversation
          -- Path format: messages/{conversation_id}/{filename}
          EXISTS (
            SELECT 1
            FROM conversation_participants cp
            WHERE cp.conversation_id = (
              -- Extract conversation_id from path (messages/{uuid}/filename)
              (string_to_array(name, '/'))[2]
            )::uuid
            AND cp.profile_id = auth.uid()
          )
        );
    END IF;

    -- RLS Policy: Users can view files from conversations they're part of
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' 
        AND tablename = 'objects' 
        AND policyname = 'Users can view files from their conversations'
    ) THEN
        CREATE POLICY "Users can view files from their conversations"
        ON storage.objects
        FOR SELECT
        TO authenticated
        USING (
          bucket_id = 'message-files' AND
          EXISTS (
            SELECT 1
            FROM conversation_participants cp
            WHERE cp.conversation_id = (
              (string_to_array(name, '/'))[2]
            )::uuid
            AND cp.profile_id = auth.uid()
          )
        );
    END IF;

    -- RLS Policy: Users can delete their own uploaded files
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' 
        AND tablename = 'objects' 
        AND policyname = 'Users can delete their own files'
    ) THEN
        CREATE POLICY "Users can delete their own files"
        ON storage.objects
        FOR DELETE
        TO authenticated
        USING (
          bucket_id = 'message-files' AND
          owner = auth.uid()
        );
    END IF;
END $$;
