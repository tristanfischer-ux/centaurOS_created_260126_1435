-- Migration: Add videos storage bucket for onboarding walkthroughs
--
-- Purpose: Host short product walkthrough videos (30-90s) for onboarding,
-- Help Center, and contextual help dialogs. Self-hosted instead of YouTube
-- for zero third-party dependencies and faster native <video> playback.
--
-- Structure:
--   videos/walkthroughs/{topic}.mp4   — walkthrough videos
--   videos/thumbnails/{topic}.jpg     — video thumbnail images
--
-- Security:
--   - Public read access (anyone can watch onboarding videos)
--   - Only service_role can upload (admin-only, not user-facing)
--   - 50MB file size limit (sufficient for 90s 1080p video)
--
-- Rollback: DELETE FROM storage.buckets WHERE id = 'videos';

-- Create the videos bucket (public read, restricted write)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'videos',
  'videos',
  true,
  52428800, -- 50MB
  ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- RLS: Anyone can view videos (public bucket for onboarding content)
CREATE POLICY "Videos are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'videos');

-- RLS: Only authenticated users with admin role can upload
-- (videos are uploaded by admins via dashboard or CLI, not end users)
CREATE POLICY "Only admins can upload videos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'videos'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('Founder', 'Executive')
    )
  );

-- RLS: Only admins can update videos
CREATE POLICY "Only admins can update videos"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'videos'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('Founder', 'Executive')
    )
  );

-- RLS: Only admins can delete videos
CREATE POLICY "Only admins can delete videos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'videos'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('Founder', 'Executive')
    )
  );
