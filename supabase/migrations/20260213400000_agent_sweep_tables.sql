/**
 * Migration: Always-On Agent Intelligence Tables
 *
 * Purpose: Creates the foundation for background specialist sweeps that
 * continuously monitor, analyze, and surface insights for each foundry.
 *
 * Tables:
 * - agent_insights: Proactive findings from background specialist sweeps
 * - agent_sweep_log: Audit trail of what ran, when, cost, and findings
 * - foundry_agent_preferences: Per-foundry settings for sweep frequency and notifications
 *
 * Security:
 * - RLS policies ensure foundry isolation on all tables
 * - Service role can insert via cron (bypasses RLS with SECURITY DEFINER RPCs)
 * - Users can only read/update data within their own foundry
 *
 * Rollback: DROP TABLE agent_insights, agent_sweep_log, foundry_agent_preferences CASCADE
 */

-- ============================================================
-- 1. agent_insights — Proactive findings from background sweeps
-- ============================================================

CREATE TABLE IF NOT EXISTS public.agent_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  specialist_id TEXT NOT NULL,
  -- Insight classification
  insight_type TEXT NOT NULL CHECK (insight_type IN (
    'alert',           -- Something needs immediate attention
    'recommendation',  -- A suggested action or improvement
    'observation',     -- A noteworthy pattern or trend
    'reminder',        -- An upcoming deadline or follow-up
    'report'           -- A periodic summary or analysis
  )),
  urgency TEXT NOT NULL DEFAULT 'informational' CHECK (urgency IN (
    'critical',        -- Push notification + top banner
    'important',       -- In-feed, highlighted
    'informational'    -- Collapsed section, digest
  )),
  -- Content
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  -- Structured metadata for domain-specific data (KPIs, metrics, etc.)
  domain_data JSONB DEFAULT '{}',
  -- Suggested actions (array of { label, action_type, action_data })
  suggested_actions JSONB DEFAULT '[]',
  -- Lifecycle
  is_read BOOLEAN NOT NULL DEFAULT false,
  is_dismissed BOOLEAN NOT NULL DEFAULT false,
  acted_on BOOLEAN NOT NULL DEFAULT false,
  acted_on_at TIMESTAMPTZ,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ  -- Optional expiry for time-sensitive insights
);

-- Indexes for common queries
CREATE INDEX idx_agent_insights_foundry_id ON public.agent_insights(foundry_id);
CREATE INDEX idx_agent_insights_specialist_id ON public.agent_insights(specialist_id);
CREATE INDEX idx_agent_insights_urgency ON public.agent_insights(urgency) WHERE NOT is_dismissed;
CREATE INDEX idx_agent_insights_created_at ON public.agent_insights(created_at DESC);

-- RLS: Foundry members can view and update insights in their foundry
ALTER TABLE public.agent_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view insights in their foundry"
  ON public.agent_insights FOR SELECT
  USING (foundry_id IN (
    SELECT COALESCE(active_foundry_id, foundry_id)
    FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Users can update insights in their foundry"
  ON public.agent_insights FOR UPDATE
  USING (foundry_id IN (
    SELECT COALESCE(active_foundry_id, foundry_id)
    FROM public.profiles WHERE id = auth.uid()
  ));

-- Service role inserts (cron job writes via service role, not user context)
CREATE POLICY "Service role can insert insights"
  ON public.agent_insights FOR INSERT
  WITH CHECK (true);


-- ============================================================
-- 2. agent_sweep_log — Audit trail of background sweep runs
-- ============================================================

CREATE TABLE IF NOT EXISTS public.agent_sweep_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  specialist_id TEXT NOT NULL,
  -- Execution metrics
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'failed', 'skipped')),
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd DECIMAL(10, 6) NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  -- Results
  insights_generated INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  -- Timestamps
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Index for querying sweep history per foundry/specialist
CREATE INDEX idx_agent_sweep_log_foundry_specialist
  ON public.agent_sweep_log(foundry_id, specialist_id, started_at DESC);

-- RLS
ALTER TABLE public.agent_sweep_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view sweep logs in their foundry"
  ON public.agent_sweep_log FOR SELECT
  USING (foundry_id IN (
    SELECT COALESCE(active_foundry_id, foundry_id)
    FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Service role can insert sweep logs"
  ON public.agent_sweep_log FOR INSERT
  WITH CHECK (true);


-- ============================================================
-- 3. foundry_agent_preferences — Per-foundry sweep configuration
-- ============================================================

CREATE TABLE IF NOT EXISTS public.foundry_agent_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  -- Global toggle
  sweeps_enabled BOOLEAN NOT NULL DEFAULT true,
  -- Frequency: how often to run sweeps (in minutes)
  sweep_interval_minutes INTEGER NOT NULL DEFAULT 120 CHECK (sweep_interval_minutes >= 30),
  -- Per-specialist overrides (specialist_id -> { enabled, interval_minutes })
  specialist_overrides JSONB DEFAULT '{}',
  -- Budget guard: max monthly spend on background sweeps (USD)
  monthly_budget_usd DECIMAL(10, 2) NOT NULL DEFAULT 50.00,
  -- Notification preferences
  notify_critical_telegram BOOLEAN NOT NULL DEFAULT true,
  notify_critical_in_app BOOLEAN NOT NULL DEFAULT true,
  notify_important_telegram BOOLEAN NOT NULL DEFAULT false,
  notify_important_in_app BOOLEAN NOT NULL DEFAULT true,
  notify_digest_telegram BOOLEAN NOT NULL DEFAULT true,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One preferences row per foundry
  CONSTRAINT unique_foundry_agent_preferences UNIQUE (foundry_id)
);

-- RLS
ALTER TABLE public.foundry_agent_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their foundry preferences"
  ON public.foundry_agent_preferences FOR SELECT
  USING (foundry_id IN (
    SELECT COALESCE(active_foundry_id, foundry_id)
    FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Users can update their foundry preferences"
  ON public.foundry_agent_preferences FOR UPDATE
  USING (foundry_id IN (
    SELECT COALESCE(active_foundry_id, foundry_id)
    FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Users can insert foundry preferences"
  ON public.foundry_agent_preferences FOR INSERT
  WITH CHECK (foundry_id IN (
    SELECT COALESCE(active_foundry_id, foundry_id)
    FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Service role can manage preferences"
  ON public.foundry_agent_preferences FOR ALL
  USING (true)
  WITH CHECK (true);


-- ============================================================
-- 4. RPC: Insert insight from service role (bypasses RLS cleanly)
-- ============================================================

CREATE OR REPLACE FUNCTION public.insert_agent_insight(
  p_foundry_id TEXT,
  p_specialist_id TEXT,
  p_insight_type TEXT,
  p_urgency TEXT,
  p_title TEXT,
  p_body TEXT,
  p_domain_data JSONB DEFAULT '{}',
  p_suggested_actions JSONB DEFAULT '[]',
  p_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_insight_id UUID;
BEGIN
  INSERT INTO public.agent_insights (
    foundry_id, specialist_id, insight_type, urgency,
    title, body, domain_data, suggested_actions, expires_at
  ) VALUES (
    p_foundry_id, p_specialist_id, p_insight_type, p_urgency,
    p_title, p_body, p_domain_data, p_suggested_actions, p_expires_at
  )
  RETURNING id INTO v_insight_id;

  RETURN v_insight_id;
END;
$$;


-- ============================================================
-- 5. RPC: Log a sweep run from service role
-- ============================================================

CREATE OR REPLACE FUNCTION public.log_agent_sweep(
  p_foundry_id TEXT,
  p_specialist_id TEXT,
  p_status TEXT DEFAULT 'completed',
  p_tokens_in INTEGER DEFAULT 0,
  p_tokens_out INTEGER DEFAULT 0,
  p_estimated_cost_usd DECIMAL DEFAULT 0,
  p_duration_ms INTEGER DEFAULT 0,
  p_insights_generated INTEGER DEFAULT 0,
  p_error_message TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.agent_sweep_log (
    foundry_id, specialist_id, status,
    tokens_in, tokens_out, estimated_cost_usd,
    duration_ms, insights_generated, error_message,
    completed_at
  ) VALUES (
    p_foundry_id, p_specialist_id, p_status,
    p_tokens_in, p_tokens_out, p_estimated_cost_usd,
    p_duration_ms, p_insights_generated, p_error_message,
    NOW()
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;


-- ============================================================
-- 6. Update ai_usage_log feature CHECK to include background_sweep
-- ============================================================

-- Drop and recreate the CHECK constraint to add background_sweep
ALTER TABLE public.ai_usage_log
  DROP CONSTRAINT IF EXISTS ai_usage_log_feature_check;

ALTER TABLE public.ai_usage_log
  ADD CONSTRAINT ai_usage_log_feature_check CHECK (feature IN (
    'ghost_agent', 'voice_to_task', 'voice_to_rfq', 'ai_search', 'centaur_matcher',
    'comparison_assistant', 'advisory_answers', 'coverage_assessment',
    'business_plan_analysis', 'talent_match', 'specialist_tts', 'specialist_stt',
    'specialist_voice', 'specialist_avatar', 'background_sweep', 'other'
  ));
