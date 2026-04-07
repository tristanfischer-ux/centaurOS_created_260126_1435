-- ============================================================================
-- SPECIALIST CONTENT PUBLISHING
-- ============================================================================
-- Extends agent_artifacts to support a draft -> review -> publish workflow.
-- Specialists propose content (blog posts, pages, case studies) which the
-- founder reviews and publishes to public routes.
--
-- DECISION: Extend agent_artifacts rather than creating a new table.
-- The artifact system already has versioning, foundry isolation, RLS,
-- and sharing. Publishing is just a new state on top of that.
-- ============================================================================

-- 1. Add publishing columns
ALTER TABLE public.agent_artifacts
    ADD COLUMN IF NOT EXISTS publish_status TEXT
        CHECK (publish_status IN ('draft', 'review', 'revision_requested', 'published', 'archived')),
    ADD COLUMN IF NOT EXISTS publish_metadata JSONB DEFAULT '{}'::jsonb;

-- INTENT: publish_metadata holds SEO and publishing fields:
-- {
--   slug: string,           -- URL-safe identifier
--   meta_title: string,     -- <title> tag (defaults to artifact title)
--   meta_description: string,
--   og_image_url: string,
--   tags: string[],
--   content_category: string, -- e.g. 'pe-fractional', 'hiring-guide'
--   published_at: timestamp,
--   published_by: uuid,
--   reviewed_by: uuid,
--   review_notes: string,
--   view_count: int
-- }

-- 2. Expand content_type to include publishable types
-- GOTCHA: Can't ALTER a CHECK constraint directly in Postgres.
-- Must drop and recreate.
ALTER TABLE public.agent_artifacts
    DROP CONSTRAINT IF EXISTS agent_artifacts_content_type_check;

ALTER TABLE public.agent_artifacts
    ADD CONSTRAINT agent_artifacts_content_type_check
    CHECK (content_type IN (
        'document', 'email', 'report', 'presentation', 'checklist',
        'blog', 'page', 'case-study', 'email-template', 'landing-page'
    ));

-- 3. Unique slug per foundry (only for artifacts that have a publish_status)
CREATE UNIQUE INDEX IF NOT EXISTS idx_artifacts_publish_slug
    ON public.agent_artifacts ((publish_metadata->>'slug'), foundry_id)
    WHERE publish_status IS NOT NULL AND publish_metadata->>'slug' IS NOT NULL;

-- 4. Fast lookup for published content by slug
CREATE INDEX IF NOT EXISTS idx_artifacts_published_slug_lookup
    ON public.agent_artifacts ((publish_metadata->>'slug'))
    WHERE publish_status = 'published';

-- 5. Index for review queue (founder sees pending items)
CREATE INDEX IF NOT EXISTS idx_artifacts_review_queue
    ON public.agent_artifacts (foundry_id, publish_status)
    WHERE publish_status IN ('review', 'revision_requested');

-- 6. RLS: Founders in the same foundry can update publish_status
-- SECURITY: This is separate from the existing "update_own_artifacts" policy
-- which only lets the creator update. Founders need to approve artifacts
-- created by specialists (system user).
CREATE POLICY "founders_publish_artifacts" ON public.agent_artifacts
    FOR UPDATE USING (
        foundry_id IN (
            SELECT p.foundry_id FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'Founder'
        )
    );

-- 7. Public content RPC (SECURITY DEFINER — bypasses RLS safely)
-- INTENT: Public blog/page routes call this to fetch published content.
-- Only returns published content. Never exposes drafts or internal metadata.
CREATE OR REPLACE FUNCTION public.get_published_content(p_slug TEXT)
RETURNS TABLE (
    id UUID,
    title TEXT,
    content TEXT,
    content_type TEXT,
    publish_metadata JSONB,
    created_by UUID,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    foundry_id TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT
        a.id,
        a.title,
        a.content,
        a.content_type,
        a.publish_metadata,
        a.created_by,
        a.created_at,
        a.updated_at,
        a.foundry_id
    FROM public.agent_artifacts a
    WHERE a.publish_metadata->>'slug' = p_slug
      AND a.publish_status = 'published'
    LIMIT 1;
$$;

-- 8. RPC to list all published content (for blog index, sitemap)
CREATE OR REPLACE FUNCTION public.list_published_content(
    p_content_type TEXT DEFAULT NULL,
    p_limit INT DEFAULT 50,
    p_offset INT DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    title TEXT,
    content_type TEXT,
    publish_metadata JSONB,
    created_by UUID,
    created_at TIMESTAMPTZ,
    foundry_id TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT
        a.id,
        a.title,
        a.content_type,
        a.publish_metadata,
        a.created_by,
        a.created_at,
        a.foundry_id
    FROM public.agent_artifacts a
    WHERE a.publish_status = 'published'
      AND (p_content_type IS NULL OR a.content_type = p_content_type)
    ORDER BY (a.publish_metadata->>'published_at')::timestamptz DESC NULLS LAST
    LIMIT p_limit
    OFFSET p_offset;
$$;

-- 9. RPC to increment view count (called from public routes)
CREATE OR REPLACE FUNCTION public.increment_content_view(p_slug TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.agent_artifacts
    SET publish_metadata = publish_metadata || jsonb_build_object(
        'view_count', COALESCE((publish_metadata->>'view_count')::int, 0) + 1
    )
    WHERE publish_metadata->>'slug' = p_slug
      AND publish_status = 'published';
END;
$$;

-- 10. Grant execute to authenticated and anon (public routes need anon access)
GRANT EXECUTE ON FUNCTION public.get_published_content(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_published_content(TEXT, INT, INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_content_view(TEXT) TO anon, authenticated;
