/**
 * Migration: Knowledge Vault — Organizational second brain for foundries
 *
 * Purpose: Create a structured, interconnected knowledge graph that accumulates
 * organizational intelligence from specialist conversations. Each foundry gets
 * a "vault" of atomic knowledge notes linked by explicit connections, enabling
 * specialists to consult accumulated knowledge and users to browse what their
 * AI team has learned.
 *
 * Tables:
 * - knowledge_notes: Atomic knowledge entries (facts, decisions, insights, etc.)
 * - knowledge_links: Explicit connections between notes (bidirectional)
 * - knowledge_domains: Domain categories for organizing notes (Maps of Content)
 *
 * Security:
 * - RLS policies enforce foundry-level isolation
 * - Users can only access knowledge within their own foundry
 *
 * Related:
 * - src/lib/knowledge-vault/ — TypeScript implementation
 * - src/actions/knowledge.ts — Server actions
 * - src/app/(platform)/knowledge/ — UI page
 *
 * Rollback: DROP TABLE knowledge_links, knowledge_notes, knowledge_domains CASCADE
 */

-- ─── Knowledge Domains (Maps of Content) ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.knowledge_domains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    icon TEXT NOT NULL DEFAULT 'folder',
    sort_order INTEGER NOT NULL DEFAULT 0,
    note_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(foundry_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_domains_foundry
    ON public.knowledge_domains(foundry_id);

-- RLS: Foundry members can access domains
ALTER TABLE public.knowledge_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Knowledge domains: foundry members can read"
    ON public.knowledge_domains FOR SELECT
    USING (
        foundry_id IN (
            SELECT COALESCE(active_foundry_id, foundry_id)
            FROM public.profiles
            WHERE id = auth.uid()
        )
    );

CREATE POLICY "Knowledge domains: foundry members can insert"
    ON public.knowledge_domains FOR INSERT
    WITH CHECK (
        foundry_id IN (
            SELECT COALESCE(active_foundry_id, foundry_id)
            FROM public.profiles
            WHERE id = auth.uid()
        )
    );

CREATE POLICY "Knowledge domains: foundry members can update"
    ON public.knowledge_domains FOR UPDATE
    USING (
        foundry_id IN (
            SELECT COALESCE(active_foundry_id, foundry_id)
            FROM public.profiles
            WHERE id = auth.uid()
        )
    );

CREATE POLICY "Knowledge domains: foundry members can delete"
    ON public.knowledge_domains FOR DELETE
    USING (
        foundry_id IN (
            SELECT COALESCE(active_foundry_id, foundry_id)
            FROM public.profiles
            WHERE id = auth.uid()
        )
    );

-- ─── Knowledge Notes ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.knowledge_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    domain_id UUID REFERENCES public.knowledge_domains(id) ON DELETE SET NULL,

    -- Content
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',

    -- Classification
    note_type TEXT NOT NULL DEFAULT 'insight'
        CHECK (note_type IN (
            'claim',       -- A factual assertion about the business or market
            'decision',    -- A choice that was made (with rationale)
            'insight',     -- An analytical finding or synthesis
            'fact',        -- A verified piece of information
            'preference',  -- A user or organizational preference
            'lesson',      -- Something learned from experience
            'observation'  -- A pattern or trend noticed
        )),

    -- Provenance
    source_specialist TEXT,
    source_thread_id UUID REFERENCES public.agent_memory_threads(id) ON DELETE SET NULL,
    source_message_id UUID REFERENCES public.agent_memory_messages(id) ON DELETE SET NULL,
    confidence REAL NOT NULL DEFAULT 0.8
        CHECK (confidence >= 0 AND confidence <= 1),

    -- Organization
    tags TEXT[] NOT NULL DEFAULT '{}',

    -- Status
    is_pinned BOOLEAN NOT NULL DEFAULT false,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    is_verified BOOLEAN NOT NULL DEFAULT false,
    verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,

    -- Metadata
    extraction_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    link_count INTEGER NOT NULL DEFAULT 0,
    view_count INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_notes_foundry
    ON public.knowledge_notes(foundry_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_notes_domain
    ON public.knowledge_notes(domain_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_notes_type
    ON public.knowledge_notes(foundry_id, note_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_notes_specialist
    ON public.knowledge_notes(foundry_id, source_specialist);
CREATE INDEX IF NOT EXISTS idx_knowledge_notes_tags
    ON public.knowledge_notes USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_knowledge_notes_search
    ON public.knowledge_notes USING GIN (
        to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, '') || ' ' || coalesce(description, ''))
    );

-- RLS: Foundry members can access notes
ALTER TABLE public.knowledge_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Knowledge notes: foundry members can read"
    ON public.knowledge_notes FOR SELECT
    USING (
        foundry_id IN (
            SELECT COALESCE(active_foundry_id, foundry_id)
            FROM public.profiles
            WHERE id = auth.uid()
        )
    );

CREATE POLICY "Knowledge notes: foundry members can insert"
    ON public.knowledge_notes FOR INSERT
    WITH CHECK (
        foundry_id IN (
            SELECT COALESCE(active_foundry_id, foundry_id)
            FROM public.profiles
            WHERE id = auth.uid()
        )
    );

CREATE POLICY "Knowledge notes: foundry members can update"
    ON public.knowledge_notes FOR UPDATE
    USING (
        foundry_id IN (
            SELECT COALESCE(active_foundry_id, foundry_id)
            FROM public.profiles
            WHERE id = auth.uid()
        )
    );

CREATE POLICY "Knowledge notes: foundry members can delete"
    ON public.knowledge_notes FOR DELETE
    USING (
        foundry_id IN (
            SELECT COALESCE(active_foundry_id, foundry_id)
            FROM public.profiles
            WHERE id = auth.uid()
        )
    );

-- ─── Knowledge Links (Connections between notes) ─────────────────────

CREATE TABLE IF NOT EXISTS public.knowledge_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    source_note_id UUID NOT NULL REFERENCES public.knowledge_notes(id) ON DELETE CASCADE,
    target_note_id UUID NOT NULL REFERENCES public.knowledge_notes(id) ON DELETE CASCADE,

    -- Relationship metadata
    relationship TEXT NOT NULL DEFAULT 'related'
        CHECK (relationship IN (
            'related',      -- Generic connection
            'supports',     -- Source supports/evidences target
            'contradicts',  -- Source contradicts target
            'extends',      -- Source builds on target
            'supersedes',   -- Source replaces target
            'caused_by',    -- Source was caused by target
            'led_to'        -- Source led to target outcome
        )),
    description TEXT NOT NULL DEFAULT '',

    -- How it was discovered
    discovered_by TEXT NOT NULL DEFAULT 'system'
        CHECK (discovered_by IN ('system', 'user', 'specialist')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Prevent duplicate links in the same direction
    UNIQUE(source_note_id, target_note_id)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_links_foundry
    ON public.knowledge_links(foundry_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_links_source
    ON public.knowledge_links(source_note_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_links_target
    ON public.knowledge_links(target_note_id);

-- RLS: Foundry members can access links
ALTER TABLE public.knowledge_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Knowledge links: foundry members can read"
    ON public.knowledge_links FOR SELECT
    USING (
        foundry_id IN (
            SELECT COALESCE(active_foundry_id, foundry_id)
            FROM public.profiles
            WHERE id = auth.uid()
        )
    );

CREATE POLICY "Knowledge links: foundry members can insert"
    ON public.knowledge_links FOR INSERT
    WITH CHECK (
        foundry_id IN (
            SELECT COALESCE(active_foundry_id, foundry_id)
            FROM public.profiles
            WHERE id = auth.uid()
        )
    );

CREATE POLICY "Knowledge links: foundry members can update"
    ON public.knowledge_links FOR UPDATE
    USING (
        foundry_id IN (
            SELECT COALESCE(active_foundry_id, foundry_id)
            FROM public.profiles
            WHERE id = auth.uid()
        )
    );

CREATE POLICY "Knowledge links: foundry members can delete"
    ON public.knowledge_links FOR DELETE
    USING (
        foundry_id IN (
            SELECT COALESCE(active_foundry_id, foundry_id)
            FROM public.profiles
            WHERE id = auth.uid()
        )
    );

-- ─── Triggers: Auto-update timestamps ────────────────────────────────

CREATE OR REPLACE FUNCTION update_knowledge_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_knowledge_notes_updated_at
    BEFORE UPDATE ON public.knowledge_notes
    FOR EACH ROW EXECUTE FUNCTION update_knowledge_updated_at();

CREATE TRIGGER trg_knowledge_domains_updated_at
    BEFORE UPDATE ON public.knowledge_domains
    FOR EACH ROW EXECUTE FUNCTION update_knowledge_updated_at();

-- ─── Triggers: Maintain link_count on notes ──────────────────────────

CREATE OR REPLACE FUNCTION update_knowledge_link_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.knowledge_notes
            SET link_count = link_count + 1
            WHERE id IN (NEW.source_note_id, NEW.target_note_id);
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.knowledge_notes
            SET link_count = GREATEST(link_count - 1, 0)
            WHERE id IN (OLD.source_note_id, OLD.target_note_id);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_knowledge_links_count
    AFTER INSERT OR DELETE ON public.knowledge_links
    FOR EACH ROW EXECUTE FUNCTION update_knowledge_link_count();

-- ─── Triggers: Maintain note_count on domains ────────────────────────

CREATE OR REPLACE FUNCTION update_knowledge_domain_note_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.domain_id IS NOT NULL THEN
        UPDATE public.knowledge_domains
            SET note_count = note_count + 1
            WHERE id = NEW.domain_id;
    ELSIF TG_OP = 'DELETE' AND OLD.domain_id IS NOT NULL THEN
        UPDATE public.knowledge_domains
            SET note_count = GREATEST(note_count - 1, 0)
            WHERE id = OLD.domain_id;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.domain_id IS DISTINCT FROM NEW.domain_id THEN
            IF OLD.domain_id IS NOT NULL THEN
                UPDATE public.knowledge_domains
                    SET note_count = GREATEST(note_count - 1, 0)
                    WHERE id = OLD.domain_id;
            END IF;
            IF NEW.domain_id IS NOT NULL THEN
                UPDATE public.knowledge_domains
                    SET note_count = note_count + 1
                    WHERE id = NEW.domain_id;
            END IF;
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_knowledge_notes_domain_count
    AFTER INSERT OR UPDATE OR DELETE ON public.knowledge_notes
    FOR EACH ROW EXECUTE FUNCTION update_knowledge_domain_note_count();

-- ─── Seed default domains per foundry ────────────────────────────────
-- These are the default Maps of Content. Users can add more.
-- We seed them via the application layer when a foundry first accesses
-- the Knowledge page, not in this migration, to avoid coupling to
-- existing foundry data.
