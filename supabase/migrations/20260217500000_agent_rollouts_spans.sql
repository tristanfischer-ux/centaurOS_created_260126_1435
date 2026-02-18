/**
 * Migration: Agent rollouts and spans for training/optimization
 *
 * Purpose: Store each agent run as a "rollout" with "spans" (prompt/response
 * snapshots and token counts). Enables out-of-band prompt optimization (APO)
 * or RL training. Reward columns on rollouts allow attaching outcome signals
 * (e.g. task completed, listing contact).
 *
 * Security:
 * - RLS: Users can only view/insert their own rollouts (user_id = auth.uid()).
 * - Prompt/response snapshots are truncated server-side; no raw export to third parties.
 *
 * Related:
 * - src/lib/agent-spans.ts -- createRollout, addSpan, finishRollout, addReward
 * - src/app/api/agents/execute/route.ts -- instruments with rollout + span
 *
 * Rollback: DROP TABLE agent_spans CASCADE; DROP TABLE agent_rollouts CASCADE;
 */

-- agent_rollouts: one row per agent request (rollout)
CREATE TABLE IF NOT EXISTS public.agent_rollouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL,
    thread_id UUID NULL,
    prompt_id UUID NULL,
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'finished', 'failed')),
    metadata JSONB DEFAULT '{}',
    reward NUMERIC NULL,
    reward_source TEXT NULL,
    rewarded_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- agent_spans: one or more per rollout (e.g. one LLM call = one span)
CREATE TABLE IF NOT EXISTS public.agent_spans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rollout_id UUID NOT NULL REFERENCES public.agent_rollouts(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'llm_call' CHECK (kind IN ('llm_call', 'tool_call')),
    prompt_snapshot TEXT NULL,
    response_snapshot TEXT NULL,
    prompt_tokens INTEGER NULL,
    completion_tokens INTEGER NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE public.agent_rollouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_spans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own rollouts" ON public.agent_rollouts;
CREATE POLICY "Users can view own rollouts"
    ON public.agent_rollouts FOR SELECT
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated users can insert own rollouts" ON public.agent_rollouts;
CREATE POLICY "Authenticated users can insert own rollouts"
    ON public.agent_rollouts FOR INSERT
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own rollouts" ON public.agent_rollouts;
CREATE POLICY "Users can update own rollouts"
    ON public.agent_rollouts FOR UPDATE
    USING (user_id = auth.uid());

-- Spans: allow select/insert only for rollouts owned by the user
DROP POLICY IF EXISTS "Users can view spans of own rollouts" ON public.agent_spans;
CREATE POLICY "Users can view spans of own rollouts"
    ON public.agent_spans FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.agent_rollouts r
            WHERE r.id = agent_spans.rollout_id AND r.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can insert spans for own rollouts" ON public.agent_spans;
CREATE POLICY "Users can insert spans for own rollouts"
    ON public.agent_spans FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.agent_rollouts r
            WHERE r.id = agent_spans.rollout_id AND r.user_id = auth.uid()
        )
    );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_rollouts_foundry_created
    ON public.agent_rollouts (foundry_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_rollouts_user_created
    ON public.agent_rollouts (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_rollouts_agent_id
    ON public.agent_rollouts (agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_spans_rollout_id
    ON public.agent_spans (rollout_id);
