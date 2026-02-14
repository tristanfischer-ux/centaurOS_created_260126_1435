/**
 * Migration: Agent Permission Tiers and Governance
 *
 * Purpose: Establish governance boundaries for autonomous AI agents.
 * Agents can take actions based on permission tiers:
 * - Tier 1 (Execute): Always allowed (research, generate reports)
 * - Tier 2 (Propose): Always allowed but requires approval (create objectives/tasks)
 * - Tier 3 (Communicate): Requires approval + human review (send emails)
 * - Tier 4 (Spend): Requires explicit approval (financial transactions)
 * - Tier 5 (External Commit): Blocked entirely (sign contracts)
 *
 * Security:
 * - RLS policies enforce foundry isolation
 * - All agent actions logged for audit
 *
 * Rollback: This migration is backward-compatible. To rollback:
 * DROP TABLE IF EXISTS agent_action_log CASCADE;
 * DROP TABLE IF EXISTS foundry_agent_permissions CASCADE;
 * DROP TABLE IF EXISTS agent_permission_tiers CASCADE;
 */

-- ============================================================================
-- AGENT PERMISSION TIERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.agent_permission_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tier_name TEXT NOT NULL UNIQUE,
    tier_level INTEGER NOT NULL UNIQUE,
    requires_approval BOOLEAN DEFAULT false,
    requires_human_review BOOLEAN DEFAULT false,
    requires_explicit_approval BOOLEAN DEFAULT false,
    can_block BOOLEAN DEFAULT false,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default tiers
INSERT INTO agent_permission_tiers (tier_name, tier_level, requires_approval, requires_human_review, requires_explicit_approval, can_block, description) VALUES
    ('execute', 1, false, false, false, false, 'Execute assigned tasks, generate artifacts, research - always allowed'),
    ('propose', 2, true, false, false, false, 'Create objectives/tasks, suggest campaigns - requires approval'),
    ('communicate', 3, true, true, false, false, 'Send to external (email, social, webhooks) - requires approval + human review'),
    ('spend', 4, true, true, true, false, 'Any financial transaction - requires explicit approval'),
    ('external_commit', 5, false, false, false, true, 'Sign contracts, legal binding - blocked entirely')
ON CONFLICT (tier_name) DO NOTHING;

-- ============================================================================
-- PER-FOUNDRY TIER OVERRIDES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.foundry_agent_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    tier_name TEXT NOT NULL,
    enabled BOOLEAN DEFAULT true,
    custom_limits JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(foundry_id, tier_name)
);

-- Default: All tiers enabled for new foundries
-- Foundries can disable specific tiers via this table

-- ============================================================================
-- AGENT ACTION LOG (AUDIT TRAIL)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.agent_action_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    agent_name TEXT, -- Denormalized for easier debugging
    action_type TEXT NOT NULL,
    action_description TEXT,
    tier TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'blocked')),
    requires_approval_from UUID REFERENCES public.profiles(id),
    approved_by UUID REFERENCES public.profiles(id),
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: Users can view logs for their foundry
ALTER TABLE public.agent_action_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view_own_foundry_agent_logs" ON public.agent_action_log
    FOR SELECT USING (
        foundry_id IN (
            SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "insert_own_foundry_agent_logs" ON public.agent_action_log
    FOR INSERT WITH CHECK (
        foundry_id IN (
            SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
        )
    );

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_agent_action_log_foundry_id ON public.agent_action_log(foundry_id);
CREATE INDEX IF NOT EXISTS idx_agent_action_log_agent_id ON public.agent_action_log(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_action_log_status ON public.agent_action_log(status);
CREATE INDEX IF NOT EXISTS idx_agent_action_log_created_at ON public.agent_action_log(created_at DESC);

-- ============================================================================
-- AGENT CREATION TRACKING (Objectives & Tasks)
-- ============================================================================

-- Add agent tracking to objectives
ALTER TABLE public.objectives
    ADD COLUMN IF NOT EXISTS created_by_agent_id UUID REFERENCES public.profiles(id),
    ADD COLUMN IF NOT EXISTS agent_approved BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS owner_agent_id UUID REFERENCES public.profiles(id);

-- Add agent tracking to tasks
ALTER TABLE public.tasks
    ADD COLUMN IF NOT EXISTS created_by_agent_id UUID REFERENCES public.profiles(id),
    ADD COLUMN IF NOT EXISTS agent_approved BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS owner_agent_id UUID REFERENCES public.profiles(id);

-- ============================================================================
-- ACTION TYPE CLASSIFICATIONS
-- ============================================================================

-- Map specific action types to tiers
CREATE TABLE IF NOT EXISTS public.agent_action_tier_map (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_type TEXT NOT NULL UNIQUE,
    tier_name TEXT NOT NULL REFERENCES agent_permission_tiers(tier_name),
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed common action classifications
INSERT INTO agent_action_tier_map (action_type, tier_name, description) VALUES
    -- Tier 1: Execute (always allowed)
    ('research_competitors', 'execute', 'Research competitor products and strategies'),
    ('research_market', 'execute', 'Research market trends and opportunities'),
    ('generate_report', 'execute', 'Generate analysis reports'),
    ('generate_document', 'execute', 'Generate documents and drafts'),
    ('analyze_data', 'execute', 'Analyze internal data and metrics'),
    ('optimize_process', 'execute', 'Optimize internal processes'),
    ('create_design_mockup', 'execute', 'Create design mockups and concepts'),
    
    -- Tier 2: Propose (requires approval)
    ('create_objective', 'propose', 'Create new objective'),
    ('create_task', 'propose', 'Create new task'),
    ('suggest_campaign', 'propose', 'Suggest marketing campaign'),
    ('draft_email', 'propose', 'Draft email for review'),
    ('generate_funding_package', 'propose', 'Generate funding materials'),
    
    -- Tier 3: Communicate (requires approval + human review)
    ('send_email', 'communicate', 'Send email to external recipient'),
    ('post_social', 'communicate', 'Post to social media'),
    ('trigger_webhook', 'communicate', 'Trigger external webhook'),
    ('create_public_content', 'communicate', 'Create public-facing content'),
    
    -- Tier 4: Spend (requires explicit approval)
    ('process_payment', 'spend', 'Process any payment'),
    ('create_subscription', 'spend', 'Create subscription'),
    ('issue_refund', 'spend', 'Issue refund'),
    ('modify_billing', 'spend', 'Modify billing settings'),
    
    -- Tier 5: External Commit (blocked)
    ('sign_contract', 'external_commit', 'Sign legal contract'),
    ('file_regulatory', 'external_commit', 'File regulatory documents'),
    ('commit_legal', 'external_commit', 'Make legal commitments')
ON CONFLICT (action_type) DO NOTHING;

-- ============================================================================
-- RPC FUNCTIONS FOR PERMISSION CHECKING
-- ============================================================================

/**
 * Check if an agent action is allowed and what approval is needed
 */
CREATE OR REPLACE FUNCTION public.check_agent_permission(
    p_action_type TEXT,
    p_foundry_id TEXT,
    p_agent_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_tier RECORD;
    v_result JSONB;
    v_foundry_enabled BOOLEAN := true;
BEGIN
    -- Get tier for action
    SELECT apt.* INTO v_tier
    FROM agent_action_tier_map aatm
    JOIN agent_permission_tiers apt ON aatm.tier_name = apt.tier_name
    WHERE aatm.action_type = p_action_type;

    IF NOT FOUND THEN
        -- Unknown action - default to require approval
        RETURN jsonb_build_object(
            'allowed', false,
            'requires_approval', true,
            'requires_human_review', false,
            'requires_explicit_approval', false,
            'is_blocked', false,
            'tier', 'unknown',
            'tier_level', 99,
            'reason', 'Unknown action type - requires manual review'
        );
    END IF;

    -- Check if foundry has disabled this tier
    SELECT COALESCE(fap.enabled, true) INTO v_foundry_enabled
    FROM foundry_agent_permissions fap
    WHERE fap.foundry_id = p_foundry_id AND fap.tier_name = v_tier.tier_name;

    -- Determine result based on tier
    IF v_tier.can_block OR NOT v_foundry_enabled THEN
        v_result := jsonb_build_object(
            'allowed', false,
            'requires_approval', false,
            'requires_human_review', false,
            'requires_explicit_approval', false,
            'is_blocked', true,
            'tier', v_tier.tier_name,
            'tier_level', v_tier.tier_level,
            'reason', 'Action tier is blocked for this foundry'
        );
    ELSIF v_tier.requires_explicit_approval THEN
        v_result := jsonb_build_object(
            'allowed', false,
            'requires_approval', true,
            'requires_human_review', true,
            'requires_explicit_approval', true,
            'is_blocked', false,
            'tier', v_tier.tier_name,
            'tier_level', v_tier.tier_level,
            'reason', 'Action requires explicit human approval'
        );
    ELSIF v_tier.requires_human_review THEN
        v_result := jsonb_build_object(
            'allowed', false,
            'requires_approval', true,
            'requires_human_review', true,
            'requires_explicit_approval', false,
            'is_blocked', false,
            'tier', v_tier.tier_name,
            'tier_level', v_tier.tier_level,
            'reason', 'Action requires human review'
        );
    ELSIF v_tier.requires_approval THEN
        v_result := jsonb_build_object(
            'allowed', true,
            'requires_approval', true,
            'requires_human_review', false,
            'requires_explicit_approval', false,
            'is_blocked', false,
            'tier', v_tier.tier_name,
            'tier_level', v_tier.tier_level,
            'reason', 'Action can proceed but requires approval'
        );
    ELSE
        -- Tier 1: Always allowed
        v_result := jsonb_build_object(
            'allowed', true,
            'requires_approval', false,
            'requires_human_review', false,
            'requires_explicit_approval', false,
            'is_blocked', false,
            'tier', v_tier.tier_name,
            'tier_level', v_tier.tier_level,
            'reason', 'Action is always allowed'
        );
    END IF;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

/**
 * Log an agent action for audit trail
 */
CREATE OR REPLACE FUNCTION public.log_agent_action(
    p_foundry_id TEXT,
    p_agent_id UUID,
    p_agent_name TEXT,
    p_action_type TEXT,
    p_action_description TEXT,
    p_status TEXT DEFAULT 'pending',
    p_requires_approval_from UUID DEFAULT NULL,
    p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
    v_log_id UUID;
    v_tier TEXT;
BEGIN
    -- Get tier for action
    SELECT apt.tier_name INTO v_tier
    FROM agent_action_tier_map aatm
    JOIN agent_permission_tiers apt ON aatm.tier_name = apt.tier_name
    WHERE aatm.action_type = p_action_type;

    -- Insert log entry
    INSERT INTO agent_action_log (
        foundry_id,
        agent_id,
        agent_name,
        action_type,
        action_description,
        tier,
        status,
        requires_approval_from,
        details
    ) VALUES (
        p_foundry_id,
        p_agent_id,
        p_agent_name,
        p_action_type,
        p_action_description,
        COALESCE(v_tier, 'unknown'),
        p_status,
        p_requires_approval_from,
        p_details
    )
    RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
