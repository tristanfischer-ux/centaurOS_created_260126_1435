-- ============================================================
-- meeting_threads — add audio_url column
-- ============================================================
-- The combined-audio approach (Fix 1) stores one audio file per
-- session rather than one clip per specialist. This column holds
-- the storage path (brainstorm-assets/<threadId>/audio/combined.wav).
-- refreshSessionAssetUrls signs it on read, same pattern as
-- cover_image_url.
--
-- Also adds audio/wav to the brainstorm-assets bucket allow-list so
-- the WAV upload in generateSessionAudio does not get rejected.

ALTER TABLE public.meeting_threads
    ADD COLUMN IF NOT EXISTS audio_url text;

COMMENT ON COLUMN public.meeting_threads.audio_url IS
    'F3: storage path to brainstorm-assets/<id>/audio/combined.wav; signed on read.';

-- Allow WAV uploads — the Gemini TTS pipeline outputs PCM that we wrap
-- in a WAV header client-side (no ffmpeg) and upload as audio/wav.
UPDATE storage.buckets
SET allowed_mime_types = array_append(allowed_mime_types, 'audio/wav')
WHERE id = 'brainstorm-assets'
  AND NOT ('audio/wav' = ANY(allowed_mime_types));
