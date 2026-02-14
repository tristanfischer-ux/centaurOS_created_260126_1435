/**
 * Migration: Agent Collaboration and Messaging
 *
 * Purpose: Enable agents to collaborate, delegate work, and communicate.
 * - Agent collaboration sessions for complex issues
 * - Agent-to-agent messaging
 * - Delegation requests between agents
 *
 * Rollback:
 * DROP TABLE IF EXISTS agent_delegation_requests CASCADE;
 * DROP TABLE IF EXISTS agent_collaboration_contributions CASCADE;
 * DROP TABLE IF EXISTS agent_collaboration_sessions CASCADE;
 * DROP TABLE IF EXISTS agent_messages CASCADE;
 */

-- ============================================================================
-- AGENT MESSAGES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.agent_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    from_agent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    from_agent_name TEXT NOT NULL,
    to_agent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    to_agent_name TEXT,
    message_type TEXT NOT NULL DEFAULT 'message'
        CHECK (message_type IN ('message', 'delegation_request', 'delegation_response', 'info_request', 'report_back')),
    content TEXT NOT NULL,
    context_objective_id UUID REFERENCES public.objectives(id) ON DELETE SET NULL,
    context_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    is_read BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_messages ENABLE ROW LEVEL SECURITY;

-- RLS: Foundry members can view agent messages
CREATE POLICY "view_own_foundry_agent_messages" ON public.agent_messages
    FOR SELECT USING (
        foundry_id IN (
            SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
        )
    );

-- RLS: Agents can insert messages in their foundry
CREATE POLICY "insert_own_foundry_agent_messages" ON public.agent_messages
    FOR INSERT WITH CHECK (
        foundry_id IN (
            SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
        )
    );

CREATE INDEX IF NOT EXISTS idx_agent_messages_foundry_id ON public.agent_messages(foundry_id);
CREATE INDEX IF NOT EXISTS idx_agent_messages_to_agent_id ON public.agent_messages(to_agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_messages_created_at ON public.agent_messages(created_at DESC);

-- ============================================================================
-- AGENT COLLABORATION SESSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.agent_collaboration_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'synthesizing', 'completed', 'cancelled')),
    initiated_by_agent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    initiated_by_agent_name TEXT NOT NULL,
    result_summary TEXT,
    result_artifact_id UUID REFERENCES public.agent_artifacts(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

ALTER TABLE public.agent_collaboration_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view_own_foundry_collaboration_sessions" ON public.agent_collaboration_sessions
    FOR SELECT USING (
        foundry_id IN (
            SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "insert_own_foundry_collaboration_sessions" ON public.agent_collaboration_sessions
    FOR INSERT WITH CHECK (
        foundry_id IN (
            SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
        )
    );

CREATE INDEX IF NOT EXISTS idx_collaboration_sessions_foundry_id ON public.agent_collaboration_sessions(foundry_id);
CREATE INDEX IF NOT EXISTS idx_collaboration_sessions_status ON public.agent_collaboration_sessions(status);

-- ============================================================================
-- AGENT COLLABORATION CONTRIBUTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.agent_collaboration_contributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.agent_collaboration_sessions(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    agent_name TEXT NOT NULL,
    contribution_type TEXT NOT NULL DEFAULT 'contribution'
        CHECK (contribution_type IN ('contribution', 'question', 'finding', 'vote', 'synthesis', 'reference')),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_collaboration_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view_own_foundry_contributions" ON public.agent_collaboration_contributions
    FOR SELECT USING (
        session_id IN (
            SELECT id FROM public.agent_collaboration_sessions
            WHERE foundry_id IN (
                SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
            )
        )
    );

CREATE POLICY "insert_own_foundry_contributions" ON public.agent_collaboration_contributions
    FOR INSERT WITH CHECK (
        session_id IN (
            SELECT id FROM public.agent_collaboration_sessions
            WHERE foundry_id IN (
                SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
            )
        )
    );

CREATE INDEX IF NOT EXISTS idx_contributions_session_id ON public.agent_collaboration_contributions(session_id);
CREATE INDEX IF NOT EXISTS idx_contributions_agent_id ON public.agent_collaboration_contributions(agent_id);

-- ============================================================================
-- AGENT DELEGATION REQUESTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.agent_delegation_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    requesting_agent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    requesting_agent_name TEXT NOT NULL,
    target_agent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    target_agent_name TEXT NOT NULL,
    request_type TEXT NOT NULL
        CHECK (request_type IN ('task_assignment', 'info_request', 'collaboration', 'review')),
    title TEXT NOT NULL,
    description TEXT,
    context_objective_id UUID REFERENCES public.objectives(id) ON DELETE SET NULL,
    context_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'rejected', 'completed', 'cancelled')),
    response_note TEXT,
    completed_artifact_id UUID REFERENCES public.agent_artifacts(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    responded_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

ALTER TABLE public.agent_delegation_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view_own_foundry_delegation_requests" ON public.agent_delegation_requests
    FOR SELECT USING (
        foundry_id IN (
            SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "insert_own_foundry_delegation_requests" ON public.agent_delegation_requests
    FOR INSERT WITH CHECK (
        foundry_id IN (
            SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
        )
    );

CREATE INDEX IF NOT EXISTS idx_delegation_foundry_id ON public.agent_delegation_requests(foundry_id);
CREATE INDEX IF NOT EXISTS idx_delegation_target_agent ON public.agent_delegation_requests(target_agent_id);
CREATE INDEX IF NOT EXISTS idx_delegation_status ON public.agent_delegation_requests(status);

-- ============================================================================
-- RPC FUNCTIONS
-- ============================================================================

/**
 * Get agent's unread message count
 */
CREATE OR REPLACE FUNCTION public.get_agent_unread_count(p_agent_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM agent_messages
    WHERE to_agent_id = p_agent_id AND is_read = false;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

/**
 * Get pending delegation requests for an agent
 */
CREATE OR REPLACE FUNCTION public.get_pending_delegations(p_agent_id UUID)
RETURNS TABLE(
    id UUID,
    title TEXT,
    request_type TEXT,
    requesting_agent_name TEXT,
    description TEXT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        adr.id,
        adr.title,
        adr.request_type,
        adr.requesting_agent_name,
        adr.description,
        adr.created_at
    FROM agent_delegation_requests adr
    WHERE adr.target_agent_id = p_agent_id
        AND adr.status = 'pending'
    ORDER BY adr.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

/**
 * Get active collaboration sessions
 */
CREATE OR REPLACE FUNCTION public.get_active_collaborations(p_foundry_id TEXT)
RETURNS TABLE(
    id UUID,
    title TEXT,
    status TEXT,
    initiated_by_agent_name TEXT,
    participant_count INTEGER,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        acs.id,
        acs.title,
        acs.status,
        acs.initiated_by_agent_name,
        COUNT(DISTINCT acc.agent_id)::INTEGER AS participant_count,
        acs.created_at
    FROM agent_collaboration_sessions acs
    LEFT JOIN agent_collaboration_contributions acc ON acc.session_id = acs.id
    WHERE acs.foundry_id = p_foundry_id
        AND acs.status IN ('active', 'synthesizing')
    GROUP BY acs.id
    ORDER BY acs.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
