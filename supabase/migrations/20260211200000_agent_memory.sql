/**
 * Migration: Add Observational Memory tables
 *
 * Purpose: Enable persistent, compressed memory for AI agents across
 * workflow runs and foundry interactions. Implements the Observational
 * Memory pattern: raw messages are compressed into observations by an
 * Observer, and observations are consolidated by a Reflector.
 *
 * Tables:
 * - agent_memory_threads: Conversation/context threads
 * - agent_memory_messages: Individual messages within threads
 * - agent_memory_observations: Compressed observation blocks
 *
 * Security:
 * - RLS policies ensure foundry-level isolation
 * - Users can only access memory within their own foundry
 *
 * Rollback: DROP TABLE agent_memory_observations, agent_memory_messages, agent_memory_threads CASCADE
 */

-- ─── Threads ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.agent_memory_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    context_type TEXT NOT NULL DEFAULT 'workflow_run'
        CHECK (context_type IN ('workflow_run', 'foundry', 'ghost_worker', 'chat')),
    context_id TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memory_threads_foundry
    ON public.agent_memory_threads(foundry_id);
CREATE INDEX IF NOT EXISTS idx_memory_threads_context
    ON public.agent_memory_threads(foundry_id, context_type);

-- RLS: Users can access threads in their own foundry
ALTER TABLE public.agent_memory_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Memory threads: foundry members can read"
    ON public.agent_memory_threads FOR SELECT
    USING (
        foundry_id IN (
            SELECT COALESCE(active_foundry_id, foundry_id)
            FROM public.profiles
            WHERE id = auth.uid()
        )
    );

CREATE POLICY "Memory threads: foundry members can insert"
    ON public.agent_memory_threads FOR INSERT
    WITH CHECK (
        foundry_id IN (
            SELECT COALESCE(active_foundry_id, foundry_id)
            FROM public.profiles
            WHERE id = auth.uid()
        )
    );

CREATE POLICY "Memory threads: foundry members can update"
    ON public.agent_memory_threads FOR UPDATE
    USING (
        foundry_id IN (
            SELECT COALESCE(active_foundry_id, foundry_id)
            FROM public.profiles
            WHERE id = auth.uid()
        )
    );

-- ─── Messages ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.agent_memory_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES public.agent_memory_threads(id) ON DELETE CASCADE,
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'user'
        CHECK (role IN ('system', 'user', 'assistant', 'tool')),
    content TEXT NOT NULL,
    token_count INTEGER NOT NULL DEFAULT 0,
    is_observed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memory_messages_thread
    ON public.agent_memory_messages(thread_id, is_observed);
CREATE INDEX IF NOT EXISTS idx_memory_messages_foundry
    ON public.agent_memory_messages(foundry_id);

-- RLS: Users can access messages in their own foundry
ALTER TABLE public.agent_memory_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Memory messages: foundry members can read"
    ON public.agent_memory_messages FOR SELECT
    USING (
        foundry_id IN (
            SELECT COALESCE(active_foundry_id, foundry_id)
            FROM public.profiles
            WHERE id = auth.uid()
        )
    );

CREATE POLICY "Memory messages: foundry members can insert"
    ON public.agent_memory_messages FOR INSERT
    WITH CHECK (
        foundry_id IN (
            SELECT COALESCE(active_foundry_id, foundry_id)
            FROM public.profiles
            WHERE id = auth.uid()
        )
    );

CREATE POLICY "Memory messages: foundry members can update"
    ON public.agent_memory_messages FOR UPDATE
    USING (
        foundry_id IN (
            SELECT COALESCE(active_foundry_id, foundry_id)
            FROM public.profiles
            WHERE id = auth.uid()
        )
    );

-- ─── Observations ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.agent_memory_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES public.agent_memory_threads(id) ON DELETE CASCADE,
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    observations_text TEXT NOT NULL DEFAULT '',
    token_count INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memory_observations_thread
    ON public.agent_memory_observations(thread_id);
CREATE INDEX IF NOT EXISTS idx_memory_observations_foundry
    ON public.agent_memory_observations(foundry_id);

-- RLS: Users can access observations in their own foundry
ALTER TABLE public.agent_memory_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Memory observations: foundry members can read"
    ON public.agent_memory_observations FOR SELECT
    USING (
        foundry_id IN (
            SELECT COALESCE(active_foundry_id, foundry_id)
            FROM public.profiles
            WHERE id = auth.uid()
        )
    );

CREATE POLICY "Memory observations: foundry members can insert"
    ON public.agent_memory_observations FOR INSERT
    WITH CHECK (
        foundry_id IN (
            SELECT COALESCE(active_foundry_id, foundry_id)
            FROM public.profiles
            WHERE id = auth.uid()
        )
    );

CREATE POLICY "Memory observations: foundry members can update"
    ON public.agent_memory_observations FOR UPDATE
    USING (
        foundry_id IN (
            SELECT COALESCE(active_foundry_id, foundry_id)
            FROM public.profiles
            WHERE id = auth.uid()
        )
    );
