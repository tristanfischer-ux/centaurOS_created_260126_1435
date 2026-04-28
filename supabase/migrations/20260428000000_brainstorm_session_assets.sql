-- ============================================================
-- Brainstorming Session Assets — F1 / F2 / F3 schema additions
-- ============================================================
-- Adds cover-image + audio-clip support to meeting_threads, plus
-- a pin flag for F1 saved-sessions ordering, and the Storage bucket
-- + RLS policies that hold the generated PNG / MP3 assets.
--
-- Linked spec: BRAINSTORM-FEATURES-PLAN.md (Phase 0).
-- Tracker rows: #29 (F1), #30 (F2), #31 (F3).

-- ─── meeting_threads — new columns ──────────────────────────────────
ALTER TABLE public.meeting_threads
    ADD COLUMN IF NOT EXISTS cover_image_url text,
    ADD COLUMN IF NOT EXISTS cover_status text NOT NULL DEFAULT 'pending'
        CHECK (cover_status IN ('pending', 'generating', 'ready', 'failed')),
    ADD COLUMN IF NOT EXISTS audio_clips jsonb NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS audio_status text NOT NULL DEFAULT 'pending'
        CHECK (audio_status IN ('pending', 'generating', 'ready', 'failed', 'refused_too_long')),
    ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS pinned_at timestamptz;

-- Pinned-first ordering needs a partial index so /agents loads fast even
-- once a foundry has hundreds of saved sessions.
CREATE INDEX IF NOT EXISTS meeting_threads_pinned_idx
    ON public.meeting_threads(foundry_id, pinned_at DESC NULLS LAST, created_at DESC)
    WHERE is_pinned = true;

-- ─── meeting_threads — DELETE policy (was missing) ─────────────────
-- F1 deleteMeetingThread requires the author to be able to remove their
-- own thread. Cascade on entries is already handled by the FK.
DROP POLICY IF EXISTS "meeting_threads_delete" ON public.meeting_threads;
CREATE POLICY "meeting_threads_delete" ON public.meeting_threads
    FOR DELETE USING (author_user_id = auth.uid());

-- ─── Storage bucket — brainstorm-assets ────────────────────────────
-- Holds <thread_id>/cover.png + <thread_id>/audio/<idx>-<specialist>.mp3.
-- Private bucket — every read goes through createSignedUrl so the asset
-- inherits the same per-thread RLS the meeting_threads row enforces.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'brainstorm-assets',
    'brainstorm-assets',
    false,
    -- 10 MB ceiling per file: cover PNG ~1 MB, MP3 clip ~1 MB; well below cap
    10 * 1024 * 1024,
    ARRAY['image/png', 'image/jpeg', 'audio/mpeg', 'audio/mp3']
)
ON CONFLICT (id) DO UPDATE
SET file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage RLS — owner-scoped. Storage.objects.owner is set to auth.uid()
-- automatically when the upload uses an authenticated client. Server-side
-- uploads via the service role bypass these policies (intended — the
-- service role is what writes the generated assets); the policies guard
-- direct client reads + deletes.
DROP POLICY IF EXISTS "brainstorm_assets_select_own" ON storage.objects;
CREATE POLICY "brainstorm_assets_select_own" ON storage.objects
    FOR SELECT
    USING (
        bucket_id = 'brainstorm-assets'
        AND (
            owner = auth.uid()
            OR EXISTS (
                -- Allow any user in the same foundry as the thread author
                -- to read the asset, matching meeting_threads_select RLS.
                SELECT 1
                FROM public.meeting_threads mt
                JOIN public.profiles p ON p.foundry_id = mt.foundry_id
                WHERE p.id = auth.uid()
                  AND name LIKE mt.id::text || '/%'
            )
        )
    );

DROP POLICY IF EXISTS "brainstorm_assets_insert_own" ON storage.objects;
CREATE POLICY "brainstorm_assets_insert_own" ON storage.objects
    FOR INSERT
    WITH CHECK (
        bucket_id = 'brainstorm-assets'
        AND owner = auth.uid()
    );

DROP POLICY IF EXISTS "brainstorm_assets_delete_own" ON storage.objects;
CREATE POLICY "brainstorm_assets_delete_own" ON storage.objects
    FOR DELETE
    USING (
        bucket_id = 'brainstorm-assets'
        AND (
            owner = auth.uid()
            OR EXISTS (
                SELECT 1
                FROM public.meeting_threads mt
                WHERE mt.author_user_id = auth.uid()
                  AND name LIKE mt.id::text || '/%'
            )
        )
    );

-- ─── ai_usage_log — register the new feature names ─────────────────
-- Per MEMORY.md gotcha: forgetting this silently breaks every
-- withAIGate('feature_name', ...) call site.
ALTER TABLE public.ai_usage_log
    DROP CONSTRAINT IF EXISTS ai_usage_log_feature_check;

ALTER TABLE public.ai_usage_log
    ADD CONSTRAINT ai_usage_log_feature_check CHECK (feature IN (
        'ghost_agent', 'voice_to_task', 'voice_to_rfq', 'ai_search',
        'centaur_matcher', 'comparison_assistant', 'advisory_answers',
        'coverage_assessment', 'business_plan_analysis', 'talent_match',
        'specialist_tts', 'specialist_stt', 'specialist_voice',
        'specialist_avatar', 'background_sweep',
        'specialist_text', 'specialist_image', 'specialist_audio',
        'specialist_video', 'specialist_slides',
        'cad_lab_generate', 'cad_lab_generate_module', 'cad_lab_review',
        'cad_lab_cost', 'cad_lab_images', 'cad_lab_classify',
        'cad_lab_projects', 'cad_lab_grammar', 'cad_lab_buy_search',
        'analyze', 'xray', 'strategic_planner', 'canvas',
        'transcript_to_strategy', 'strategic_briefing',
        'report_generation', 'progress_report', 'document_questions',
        'plan_generator', 'smart_goals', 'nudges', 'team_pulse',
        'bom', 'outreach', 'forge_match', 'component_library',
        'step_template_matching', 'backfill_embeddings',
        'slide_image',
        'enrichment', 'weekly_report', 'ai_worker',
        -- Page insights (already in production but missing from previous migration)
        'page_insights',
        -- Brainstorming features (F2 + F3)
        'brainstorm_cover',
        'brainstorm_audio',
        'other'
    ));

-- ─── pinned_at auto-touch trigger ─────────────────────────────────
-- Caught by OpenRouter Gemini 2.5 Pro review: relying on the client
-- to set pinned_at correctly is fragile. Trigger fires on is_pinned
-- toggle and stamps the timestamp server-side.
CREATE OR REPLACE FUNCTION public.touch_meeting_thread_pinned_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.is_pinned IS DISTINCT FROM OLD.is_pinned THEN
        IF NEW.is_pinned THEN
            NEW.pinned_at = now();
        ELSE
            NEW.pinned_at = NULL;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS meeting_threads_pinned_at ON public.meeting_threads;
CREATE TRIGGER meeting_threads_pinned_at
    BEFORE UPDATE OF is_pinned ON public.meeting_threads
    FOR EACH ROW EXECUTE FUNCTION public.touch_meeting_thread_pinned_at();

COMMENT ON COLUMN public.meeting_threads.cover_image_url IS
    'F2: signed URL to brainstorm-assets/<id>/cover.png; refreshed on read.';
COMMENT ON COLUMN public.meeting_threads.audio_clips IS
    'F3: array of {specialist_id, voice, url, duration_ms, char_count} entries.';
COMMENT ON COLUMN public.meeting_threads.is_pinned IS
    'F1: true when the founder pins this session to the top of the saved list.';
