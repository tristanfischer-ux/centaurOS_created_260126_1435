-- Expand the ai_usage_log feature CHECK constraint to include all AIFeature values.
-- The previous constraint (from 20260213400000) only allowed 16 features.
-- The TypeScript AIFeature union has grown to 40+ values, and trackAIUsage()
-- silently fails when inserting a feature not in the CHECK list.
-- This migration drops the old constraint and adds a new one covering all features.

ALTER TABLE ai_usage_log DROP CONSTRAINT IF EXISTS ai_usage_log_feature_check;

ALTER TABLE ai_usage_log ADD CONSTRAINT ai_usage_log_feature_check CHECK (feature IN (
    -- Original features
    'ghost_agent',
    'voice_to_task',
    'voice_to_rfq',
    'ai_search',
    'centaur_matcher',
    'comparison_assistant',
    'advisory_answers',
    'coverage_assessment',
    'business_plan_analysis',
    'talent_match',
    'specialist_tts',
    'specialist_stt',
    'specialist_voice',
    'specialist_avatar',
    'background_sweep',
    -- Specialist chat modalities
    'specialist_text',
    'specialist_image',
    'specialist_audio',
    'specialist_video',
    'specialist_slides',
    -- CAD Lab features
    'cad_lab_generate',
    'cad_lab_generate_module',
    'cad_lab_review',
    'cad_lab_cost',
    'cad_lab_images',
    'cad_lab_classify',
    'cad_lab_projects',
    'cad_lab_grammar',
    'cad_lab_buy_search',
    -- Analysis & strategy
    'analyze',
    'xray',
    'strategic_planner',
    'canvas',
    'transcript_to_strategy',
    'strategic_briefing',
    -- Reports & documents
    'report_generation',
    'progress_report',
    'document_questions',
    -- Planning & goals
    'plan_generator',
    'smart_goals',
    'nudges',
    'team_pulse',
    -- Marketplace & sourcing
    'bom',
    'outreach',
    'forge_match',
    'component_library',
    'step_template_matching',
    'backfill_embeddings',
    -- Slide & media
    'slide_image',
    -- Enrichment & reports
    'enrichment',
    'weekly_report',
    'ai_worker',
    -- Catch-all
    'other'
));
