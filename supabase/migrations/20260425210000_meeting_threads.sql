-- ============================================================
-- meeting_threads — one row per brainstorming session
-- ============================================================
CREATE TABLE IF NOT EXISTS public.meeting_threads (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id           text NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    author_user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- The original question / topic posed by the founder
    topic                text NOT NULL,
    -- Council tier used: quick | full | deep | strategy
    council_tier         text NOT NULL DEFAULT 'quick',
    -- Specialist IDs present in this meeting
    specialist_ids       text[] NOT NULL DEFAULT '{}',
    -- Structured outputs blob (notes, decisions, action items, etc.)
    outputs              jsonb,
    -- Citations extracted from outputs (may be empty for older meetings)
    citations            jsonb DEFAULT '[]'::jsonb,
    -- Linked artifact id (the agent_artifacts row written at wrap-up)
    artifact_id          uuid REFERENCES public.agent_artifacts(id) ON DELETE SET NULL,
    -- Branching support
    parent_thread_id     uuid REFERENCES public.meeting_threads(id) ON DELETE SET NULL,
    branched_from_entry_id uuid,               -- FK added below after meeting_entries exists
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- meeting_entries — one row per specialist response (or follow-up)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.meeting_entries (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id        uuid NOT NULL REFERENCES public.meeting_threads(id) ON DELETE CASCADE,
    -- null for the founder's own follow-up messages
    specialist_id    text,
    specialist_name  text,
    -- Council position label: "Quick take", "Challenge", "Synthesis", etc.
    council_position text,
    -- Wall-clock ms from meeting start when this response completed
    arrival_ms       integer,
    -- Round number within the thread (1-based; follow-up rounds continue)
    round_number     integer NOT NULL DEFAULT 1,
    content          text NOT NULL,
    -- role = 'founder' for the founder's follow-up messages; 'specialist' otherwise
    role             text NOT NULL DEFAULT 'specialist' CHECK (role IN ('specialist', 'founder')),
    created_at       timestamptz NOT NULL DEFAULT now()
);

-- Add the self-referential FK now that meeting_entries exists
ALTER TABLE public.meeting_threads
    ADD CONSTRAINT meeting_threads_branched_from_entry_id_fkey
    FOREIGN KEY (branched_from_entry_id)
    REFERENCES public.meeting_entries(id)
    ON DELETE SET NULL;

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS meeting_threads_foundry_idx   ON public.meeting_threads(foundry_id);
CREATE INDEX IF NOT EXISTS meeting_threads_created_idx   ON public.meeting_threads(created_at DESC);
CREATE INDEX IF NOT EXISTS meeting_threads_parent_idx    ON public.meeting_threads(parent_thread_id) WHERE parent_thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS meeting_entries_thread_idx    ON public.meeting_entries(thread_id);
CREATE INDEX IF NOT EXISTS meeting_entries_created_idx   ON public.meeting_entries(created_at);

-- Full-text search index across topic + entry content
CREATE INDEX IF NOT EXISTS meeting_threads_topic_fts_idx
    ON public.meeting_threads USING gin(to_tsvector('english', topic));
CREATE INDEX IF NOT EXISTS meeting_entries_content_fts_idx
    ON public.meeting_entries USING gin(to_tsvector('english', content));

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.meeting_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meeting_threads_select" ON public.meeting_threads
    FOR SELECT USING (
        foundry_id IN (
            SELECT p.foundry_id FROM public.profiles p WHERE p.id = auth.uid()
        )
    );

CREATE POLICY "meeting_threads_insert" ON public.meeting_threads
    FOR INSERT WITH CHECK (
        author_user_id = auth.uid()
        AND foundry_id IN (
            SELECT p.foundry_id FROM public.profiles p WHERE p.id = auth.uid()
        )
    );

CREATE POLICY "meeting_threads_update" ON public.meeting_threads
    FOR UPDATE USING (author_user_id = auth.uid());

CREATE POLICY "meeting_entries_select" ON public.meeting_entries
    FOR SELECT USING (
        thread_id IN (
            SELECT mt.id FROM public.meeting_threads mt
            WHERE mt.foundry_id IN (
                SELECT p.foundry_id FROM public.profiles p WHERE p.id = auth.uid()
            )
        )
    );

CREATE POLICY "meeting_entries_insert" ON public.meeting_entries
    FOR INSERT WITH CHECK (
        thread_id IN (
            SELECT mt.id FROM public.meeting_threads mt
            WHERE mt.author_user_id = auth.uid()
        )
    );

-- ============================================================
-- updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.touch_meeting_thread_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER meeting_threads_updated_at
    BEFORE UPDATE ON public.meeting_threads
    FOR EACH ROW EXECUTE FUNCTION public.touch_meeting_thread_updated_at();
