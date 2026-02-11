-- =============================================
-- Migration: Standardize platform fees to 10% + AI usage tracking
-- 
-- Purpose: 
-- 1. Standardize all platform fees to 10% across all roles and order types.
--    Previously: 8% standard, 10% retainers, 5% apprentice, 7% apprentice retainers
--    Now: 10% universal rate. Simplifies pricing, eliminates confusion.
--
-- 2. Add AI usage tracking tables to monitor token consumption per foundry.
--    Required to enforce tier-based AI limits and track costs.
--
-- Rollback: See bottom of file for rollback statements
-- =============================================

-- =============================================
-- SECTION 1: STANDARDIZE PLATFORM FEES TO 10%
-- =============================================

-- Update all existing fee configs to 10%
UPDATE public.platform_fee_config
SET fee_percent = 10.00
WHERE fee_percent != 10.00;

-- Update the fallback in get_platform_fee_percent to return 10 instead of 8
CREATE OR REPLACE FUNCTION public.get_platform_fee_percent(
    p_role TEXT DEFAULT 'default',
    p_order_type TEXT DEFAULT 'default'
)
RETURNS DECIMAL(5, 2) AS $$
DECLARE
    v_fee DECIMAL(5, 2);
BEGIN
    -- Try exact match first
    SELECT fee_percent INTO v_fee
    FROM public.platform_fee_config
    WHERE role = p_role 
      AND order_type = p_order_type
      AND (effective_until IS NULL OR effective_until > NOW())
    ORDER BY effective_from DESC
    LIMIT 1;
    
    IF v_fee IS NOT NULL THEN
        RETURN v_fee;
    END IF;
    
    -- Try role with default order type
    SELECT fee_percent INTO v_fee
    FROM public.platform_fee_config
    WHERE role = p_role 
      AND order_type = 'default'
      AND (effective_until IS NULL OR effective_until > NOW())
    ORDER BY effective_from DESC
    LIMIT 1;
    
    IF v_fee IS NOT NULL THEN
        RETURN v_fee;
    END IF;
    
    -- Try default role with specific order type
    SELECT fee_percent INTO v_fee
    FROM public.platform_fee_config
    WHERE role = 'default' 
      AND order_type = p_order_type
      AND (effective_until IS NULL OR effective_until > NOW())
    ORDER BY effective_from DESC
    LIMIT 1;
    
    IF v_fee IS NOT NULL THEN
        RETURN v_fee;
    END IF;
    
    -- Fall back to default-default (should always exist)
    SELECT fee_percent INTO v_fee
    FROM public.platform_fee_config
    WHERE role = 'default' 
      AND order_type = 'default'
      AND (effective_until IS NULL OR effective_until > NOW())
    ORDER BY effective_from DESC
    LIMIT 1;
    
    -- Standardized fallback: 10% (was 8%)
    RETURN COALESCE(v_fee, 10.00);
END;
$$ LANGUAGE plpgsql STABLE;


-- =============================================
-- SECTION 2: AI USAGE TRACKING
-- =============================================

-- Individual AI API call log
-- Note: foundries.id is TEXT, not UUID
CREATE TABLE IF NOT EXISTS public.ai_usage_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    feature TEXT NOT NULL CHECK (feature IN (
        'ghost_agent',
        'voice_to_task',
        'voice_to_rfq',
        'ai_search',
        'centaur_matcher',
        'comparison_assistant',
        'advisory_answers',
        'coverage_assessment',
        'business_plan_analysis',
        'other'
    )),
    model TEXT NOT NULL DEFAULT 'gpt-4o',
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    estimated_cost_usd DECIMAL(10, 6) NOT NULL DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Monthly aggregated usage per foundry (for quick limit checks)
CREATE TABLE IF NOT EXISTS public.ai_usage_monthly (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    month_year TEXT NOT NULL, -- Format: '2026-02'
    total_ai_tasks INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    total_cost_usd DECIMAL(10, 4) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(foundry_id, month_year)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_foundry_created
    ON public.ai_usage_log(foundry_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_log_feature
    ON public.ai_usage_log(feature, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_monthly_foundry_month
    ON public.ai_usage_monthly(foundry_id, month_year);

-- Function to increment monthly AI usage counter (atomic upsert)
CREATE OR REPLACE FUNCTION public.increment_ai_usage(
    p_foundry_id TEXT,
    p_user_id UUID,
    p_feature TEXT,
    p_model TEXT DEFAULT 'gpt-4o',
    p_prompt_tokens INTEGER DEFAULT 0,
    p_completion_tokens INTEGER DEFAULT 0,
    p_estimated_cost_usd DECIMAL DEFAULT 0,
    p_metadata JSONB DEFAULT '{}'
)
RETURNS TABLE(monthly_task_count INTEGER, monthly_cost DECIMAL) AS $$
DECLARE
    v_month_year TEXT;
    v_total_tokens INTEGER;
    v_task_count INTEGER;
    v_cost DECIMAL;
BEGIN
    v_month_year := to_char(NOW(), 'YYYY-MM');
    v_total_tokens := p_prompt_tokens + p_completion_tokens;
    
    -- Insert detailed log entry
    INSERT INTO public.ai_usage_log (
        foundry_id, user_id, feature, model,
        prompt_tokens, completion_tokens, total_tokens,
        estimated_cost_usd, metadata
    ) VALUES (
        p_foundry_id, p_user_id, p_feature, p_model,
        p_prompt_tokens, p_completion_tokens, v_total_tokens,
        p_estimated_cost_usd, p_metadata
    );
    
    -- Upsert monthly aggregate
    INSERT INTO public.ai_usage_monthly (foundry_id, month_year, total_ai_tasks, total_tokens, total_cost_usd)
    VALUES (p_foundry_id, v_month_year, 1, v_total_tokens, p_estimated_cost_usd)
    ON CONFLICT (foundry_id, month_year)
    DO UPDATE SET
        total_ai_tasks = public.ai_usage_monthly.total_ai_tasks + 1,
        total_tokens = public.ai_usage_monthly.total_tokens + v_total_tokens,
        total_cost_usd = public.ai_usage_monthly.total_cost_usd + p_estimated_cost_usd,
        updated_at = NOW();
    
    -- Return current monthly totals
    SELECT m.total_ai_tasks, m.total_cost_usd
    INTO v_task_count, v_cost
    FROM public.ai_usage_monthly m
    WHERE m.foundry_id = p_foundry_id AND m.month_year = v_month_year;
    
    RETURN QUERY SELECT v_task_count, v_cost;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get current month usage for a foundry
CREATE OR REPLACE FUNCTION public.get_ai_usage_current_month(
    p_foundry_id TEXT
)
RETURNS TABLE(total_ai_tasks INTEGER, total_tokens INTEGER, total_cost_usd DECIMAL) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(m.total_ai_tasks, 0),
        COALESCE(m.total_tokens, 0),
        COALESCE(m.total_cost_usd, 0::DECIMAL)
    FROM public.ai_usage_monthly m
    WHERE m.foundry_id = p_foundry_id
      AND m.month_year = to_char(NOW(), 'YYYY-MM');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- RLS policies
ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_monthly ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view AI usage in their own foundry
CREATE POLICY "Users can view AI usage in their foundry"
    ON public.ai_usage_log FOR SELECT
    USING (
        foundry_id IN (
            SELECT p.foundry_id FROM public.profiles p WHERE p.id = auth.uid()
        )
    );

-- RLS: Only system can insert (via SECURITY DEFINER function)
CREATE POLICY "System can insert AI usage"
    ON public.ai_usage_log FOR INSERT
    WITH CHECK (true);

-- RLS: Users can view monthly aggregates in their foundry
CREATE POLICY "Users can view monthly AI usage in their foundry"
    ON public.ai_usage_monthly FOR SELECT
    USING (
        foundry_id IN (
            SELECT p.foundry_id FROM public.profiles p WHERE p.id = auth.uid()
        )
    );

-- RLS: Only system can modify monthly aggregates (via SECURITY DEFINER function)
CREATE POLICY "System can manage monthly AI usage"
    ON public.ai_usage_monthly FOR ALL
    USING (true)
    WITH CHECK (true);


-- =============================================
-- ROLLBACK STATEMENTS (for reference)
-- =============================================
-- To revert fee standardization:
-- UPDATE public.platform_fee_config SET fee_percent = 8.00 WHERE role IN ('default','executive','founder') AND order_type = 'default';
-- UPDATE public.platform_fee_config SET fee_percent = 10.00 WHERE role IN ('default','executive','founder') AND order_type = 'retainer';
-- UPDATE public.platform_fee_config SET fee_percent = 5.00 WHERE role = 'apprentice' AND order_type = 'default';
-- UPDATE public.platform_fee_config SET fee_percent = 7.00 WHERE role = 'apprentice' AND order_type = 'retainer';
--
-- To drop AI usage tables:
-- DROP TABLE IF EXISTS public.ai_usage_log CASCADE;
-- DROP TABLE IF EXISTS public.ai_usage_monthly CASCADE;
-- DROP FUNCTION IF EXISTS public.increment_ai_usage CASCADE;
-- DROP FUNCTION IF EXISTS public.get_ai_usage_current_month CASCADE;
