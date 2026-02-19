/**
 * Migration: Knowledge Vault Fix
 *
 * Purpose: The original knowledge_vault migration (20260216900000) was shadowed by a
 * timestamp collision with public_directory_access. This migration:
 * 1. Adds foundry_id to the existing knowledge_domains table (nullable to preserve
 *    blueprint template domains which have no foundry)
 * 2. Creates knowledge_notes and knowledge_links tables
 * 3. Adds required indexes and RLS policies
 *
 * Rollback: DROP TABLE knowledge_links, knowledge_notes CASCADE;
 *           ALTER TABLE knowledge_domains DROP COLUMN IF EXISTS foundry_id;
 */

-- ─── Patch knowledge_domains to add foundry_id ────────────────────────────────

ALTER TABLE public.knowledge_domains
    ADD COLUMN IF NOT EXISTS foundry_id TEXT REFERENCES public.foundries(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS slug TEXT,
    ADD COLUMN IF NOT EXISTS icon TEXT NOT NULL DEFAULT 'folder',
    ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS note_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_knowledge_domains_foundry
    ON public.knowledge_domains(foundry_id);

-- RLS on knowledge_domains (foundry-scoped rows use foundry_id check; template rows with null foundry_id are always readable)
ALTER TABLE public.knowledge_domains ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Knowledge domains: foundry members can read" ON public.knowledge_domains;
CREATE POLICY "Knowledge domains: foundry members can read"
    ON public.knowledge_domains FOR SELECT
    USING (
        foundry_id IS NULL -- blueprint template domains are globally readable
        OR foundry_id IN (
            SELECT COALESCE(active_foundry_id, foundry_id)
            FROM public.profiles
            WHERE id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Knowledge domains: foundry members can insert" ON public.knowledge_domains;
CREATE POLICY "Knowledge domains: foundry members can insert"
    ON public.knowledge_domains FOR INSERT
    WITH CHECK (
        foundry_id IN (
            SELECT COALESCE(active_foundry_id, foundry_id)
            FROM public.profiles
            WHERE id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Knowledge domains: foundry members can update" ON public.knowledge_domains;
CREATE POLICY "Knowledge domains: foundry members can update"
    ON public.knowledge_domains FOR UPDATE
    USING (
        foundry_id IN (
            SELECT COALESCE(active_foundry_id, foundry_id)
            FROM public.profiles
            WHERE id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Knowledge domains: foundry members can delete" ON public.knowledge_domains;
CREATE POLICY "Knowledge domains: foundry members can delete"
    ON public.knowledge_domains FOR DELETE
    USING (
        foundry_id IN (
            SELECT COALESCE(active_foundry_id, foundry_id)
            FROM public.profiles
            WHERE id = auth.uid()
        )
    );

-- ─── Knowledge Notes ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.knowledge_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    domain_id UUID REFERENCES public.knowledge_domains(id) ON DELETE SET NULL,

    title TEXT NOT NULL,
    content TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',

    note_type TEXT NOT NULL DEFAULT 'insight'
        CHECK (note_type IN (
            'claim', 'decision', 'insight', 'fact',
            'preference', 'lesson', 'observation'
        )),

    source_specialist TEXT,
    source_thread_id UUID,
    source_message_id UUID,
    confidence REAL NOT NULL DEFAULT 0.8
        CHECK (confidence >= 0 AND confidence <= 1),

    tags TEXT[] NOT NULL DEFAULT '{}',

    is_pinned BOOLEAN NOT NULL DEFAULT false,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    is_verified BOOLEAN NOT NULL DEFAULT false,
    verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,

    extraction_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    link_count INTEGER NOT NULL DEFAULT 0,
    view_count INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_notes_foundry ON public.knowledge_notes(foundry_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_notes_domain ON public.knowledge_notes(domain_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_notes_type ON public.knowledge_notes(foundry_id, note_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_notes_specialist ON public.knowledge_notes(foundry_id, source_specialist);
CREATE INDEX IF NOT EXISTS idx_knowledge_notes_tags ON public.knowledge_notes USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_knowledge_notes_search ON public.knowledge_notes USING GIN (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, '') || ' ' || coalesce(description, ''))
);

ALTER TABLE public.knowledge_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Knowledge notes: foundry members can read"
    ON public.knowledge_notes FOR SELECT
    USING (
        foundry_id IN (
            SELECT COALESCE(active_foundry_id, foundry_id)
            FROM public.profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Knowledge notes: foundry members can insert"
    ON public.knowledge_notes FOR INSERT
    WITH CHECK (
        foundry_id IN (
            SELECT COALESCE(active_foundry_id, foundry_id)
            FROM public.profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Knowledge notes: foundry members can update"
    ON public.knowledge_notes FOR UPDATE
    USING (
        foundry_id IN (
            SELECT COALESCE(active_foundry_id, foundry_id)
            FROM public.profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Knowledge notes: foundry members can delete"
    ON public.knowledge_notes FOR DELETE
    USING (
        foundry_id IN (
            SELECT COALESCE(active_foundry_id, foundry_id)
            FROM public.profiles WHERE id = auth.uid()
        )
    );

-- Service role bypass
CREATE POLICY "Knowledge notes: service role full access"
    ON public.knowledge_notes FOR ALL
    USING (auth.role() = 'service_role');

-- ─── Knowledge Links ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.knowledge_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    source_note_id UUID NOT NULL REFERENCES public.knowledge_notes(id) ON DELETE CASCADE,
    target_note_id UUID NOT NULL REFERENCES public.knowledge_notes(id) ON DELETE CASCADE,
    relationship TEXT NOT NULL DEFAULT 'related'
        CHECK (relationship IN ('related', 'supports', 'contradicts', 'extends', 'supersedes', 'caused_by', 'led_to')),
    description TEXT NOT NULL DEFAULT '',
    discovered_by TEXT NOT NULL DEFAULT 'system'
        CHECK (discovered_by IN ('system', 'user', 'specialist')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(source_note_id, target_note_id)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_links_foundry ON public.knowledge_links(foundry_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_links_source ON public.knowledge_links(source_note_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_links_target ON public.knowledge_links(target_note_id);

ALTER TABLE public.knowledge_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Knowledge links: foundry members can read"
    ON public.knowledge_links FOR SELECT
    USING (
        foundry_id IN (
            SELECT COALESCE(active_foundry_id, foundry_id)
            FROM public.profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Knowledge links: foundry members can insert"
    ON public.knowledge_links FOR INSERT
    WITH CHECK (
        foundry_id IN (
            SELECT COALESCE(active_foundry_id, foundry_id)
            FROM public.profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Knowledge links: service role full access"
    ON public.knowledge_links FOR ALL
    USING (auth.role() = 'service_role');
