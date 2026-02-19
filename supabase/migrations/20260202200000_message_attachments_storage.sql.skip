-- MIGRATION: Message Attachments Storage Bucket
-- Purpose: Create storage bucket for message file attachments with secure RLS policies
-- Author: System
-- Date: 2026-02-02

-- 1. Create storage bucket for message attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('message-attachments', 'message-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS Policies for message-attachments bucket

-- Policy: Users can upload files to their own foundry's folder
CREATE POLICY "Users can upload to own foundry"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'message-attachments' AND
  -- Verify user belongs to the foundry (extracted from path: foundry_id/messages/filename)
  (storage.foldername(name))[1] IN (
    SELECT foundry_id::text
    FROM foundry_members
    WHERE user_id = auth.uid()
  )
);

-- Policy: Users can view files from conversations they're part of
CREATE POLICY "Users can view files from own conversations"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'message-attachments' AND
  -- Verify user belongs to the foundry
  (storage.foldername(name))[1] IN (
    SELECT foundry_id::text
    FROM foundry_members
    WHERE user_id = auth.uid()
  )
);

-- Policy: Users can delete their own uploaded files
CREATE POLICY "Users can delete own files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'message-attachments' AND
  -- Verify user belongs to the foundry AND owns the message
  (storage.foldername(name))[1] IN (
    SELECT foundry_id::text
    FROM foundry_members
    WHERE user_id = auth.uid()
  ) AND
  EXISTS (
    SELECT 1
    FROM messages m
    WHERE m.file_url LIKE '%' || name
    AND m.sender_id = auth.uid()
  )
);

-- 3. Add helpful comments
COMMENT ON POLICY "Users can upload to own foundry" ON storage.objects IS 
'Allows authenticated users to upload message attachments to their foundry folders';

COMMENT ON POLICY "Users can view files from own conversations" ON storage.objects IS 
'Allows users to view message attachments from conversations in their foundry';

COMMENT ON POLICY "Users can delete own files" ON storage.objects IS 
'Allows users to delete message attachments they uploaded';
