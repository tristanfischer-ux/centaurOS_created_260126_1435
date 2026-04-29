-- ============================================================
-- meeting_threads — transcript PDF support
-- ============================================================
-- Adds transcript_pdf_url column so generated PDFs are cached
-- (avoids re-rendering on every download request), and extends
-- the ai_usage_log feature CHECK to include 'brainstorm_pdf'.
--
-- The server action generateMeetingThreadPdf:
--   1. Renders the PDF with @react-pdf/renderer
--   2. Uploads to brainstorm-assets/<thread_id>/transcript.pdf
--   3. Writes the signed URL here
--   4. Returns the URL for the browser to open
--
-- Re-render is triggered when the row has no URL yet, or when
-- the last entry was created AFTER the URL was last written
-- (see updated_at comparison in the action).

ALTER TABLE public.meeting_threads
    ADD COLUMN IF NOT EXISTS transcript_pdf_url text;

COMMENT ON COLUMN public.meeting_threads.transcript_pdf_url IS
    'Signed URL to brainstorm-assets/<id>/transcript.pdf; regenerated when stale.';

-- ─── brainstorm-assets bucket — allow application/pdf uploads ────────
-- The bucket's allowed_mime_types was set at bucket-creation time to
-- image/png, image/jpeg, audio/mpeg, audio/mp3, audio/wav. PDF uploads
-- fail without adding application/pdf. Applied live via SQL 2026-04-29.
UPDATE storage.buckets
    SET allowed_mime_types = ARRAY[
        'image/png', 'image/jpeg',
        'audio/mpeg', 'audio/mp3', 'audio/wav',
        'application/pdf'
    ]
    WHERE id = 'brainstorm-assets';

-- ─── ai_usage_log — register brainstorm_pdf feature ────────────────
-- Per MEMORY.md gotcha (forgeos_ai_usage_log_check_constraint): every
-- new withAIGate / manual insert call site needs its feature name in
-- this CHECK, otherwise the INSERT silently fails.
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
        'page_insights',
        'brainstorm_cover',
        'brainstorm_audio',
        'brainstorm_pdf',
        'other'
    ));
