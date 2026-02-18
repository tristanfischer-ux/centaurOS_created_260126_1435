/**
 * Migration: Agent file attachments and shared artifacts
 *
 * Purpose:
 * - Store file attachments for specialist/agent chat (agent_file_attachments).
 * - Enable shareable read-only links for artifacts (shared_artifacts).
 * - Storage bucket agent-attachments for foundry-scoped uploads.
 *
 * Security:
 * - RLS on agent_file_attachments: foundry isolation.
 * - RLS on shared_artifacts: creator can manage; public read via token (service or anon).
 * - Storage: upload/select only when path prefix matches user's foundry.
 *
 * Related:
 * - src/app/api/agents/upload/route.ts
 * - src/actions/agent-artifacts.ts (shareArtifact)
 *
 * Rollback:
 *   DROP TABLE shared_artifacts CASCADE;
 *   DROP TABLE agent_file_attachments CASCADE;
 *   DELETE FROM storage.buckets WHERE id = 'agent-attachments';
 */

-- ============================================================================
-- AGENT FILE ATTACHMENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.agent_file_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    thread_id UUID NOT NULL REFERENCES public.agent_memory_threads(id) ON DELETE CASCADE,
    message_index INTEGER NOT NULL DEFAULT 0,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_file_attachments_foundry
    ON public.agent_file_attachments(foundry_id);
CREATE INDEX IF NOT EXISTS idx_agent_file_attachments_thread
    ON public.agent_file_attachments(thread_id);

ALTER TABLE public.agent_file_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agent attachments: foundry members can read"
    ON public.agent_file_attachments FOR SELECT
    USING (
        foundry_id IN (
            SELECT COALESCE(active_foundry_id, foundry_id)
            FROM public.profiles
            WHERE id = auth.uid()
        )
    );

CREATE POLICY "Agent attachments: foundry members can insert"
    ON public.agent_file_attachments FOR INSERT
    WITH CHECK (
        foundry_id IN (
            SELECT COALESCE(active_foundry_id, foundry_id)
            FROM public.profiles
            WHERE id = auth.uid()
        )
    );

CREATE POLICY "Agent attachments: foundry members can delete"
    ON public.agent_file_attachments FOR DELETE
    USING (
        foundry_id IN (
            SELECT COALESCE(active_foundry_id, foundry_id)
            FROM public.profiles
            WHERE id = auth.uid()
        )
    );

-- ============================================================================
-- SHARED ARTIFACTS (share links)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.shared_artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artifact_id UUID NOT NULL REFERENCES public.agent_artifacts(id) ON DELETE CASCADE,
    share_token TEXT NOT NULL UNIQUE,
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ,
    view_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shared_artifacts_token
    ON public.shared_artifacts(share_token);
CREATE INDEX IF NOT EXISTS idx_shared_artifacts_artifact
    ON public.shared_artifacts(artifact_id);
CREATE INDEX IF NOT EXISTS idx_shared_artifacts_expires
    ON public.shared_artifacts(expires_at)
    WHERE expires_at IS NOT NULL;

ALTER TABLE public.shared_artifacts ENABLE ROW LEVEL SECURITY;

-- Creator can manage their share links
CREATE POLICY "Shared artifacts: creator can select"
    ON public.shared_artifacts FOR SELECT
    USING (created_by = auth.uid());

CREATE POLICY "Shared artifacts: creator can insert"
    ON public.shared_artifacts FOR INSERT
    WITH CHECK (created_by = auth.uid());

CREATE POLICY "Shared artifacts: creator can update"
    ON public.shared_artifacts FOR UPDATE
    USING (created_by = auth.uid());

CREATE POLICY "Shared artifacts: creator can delete"
    ON public.shared_artifacts FOR DELETE
    USING (created_by = auth.uid());

-- ============================================================================
-- STORAGE BUCKET: agent-attachments
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'agent-attachments',
    'agent-attachments',
    false,
    10485760, -- 10MB
    ARRAY[
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain', 'text/csv',
        'application/zip', 'application/x-zip-compressed'
    ]
)
ON CONFLICT (id) DO NOTHING;

-- Path format: {foundry_id}/{thread_id}/{filename}
-- RLS: User can only access objects under their foundry path
CREATE POLICY "Agent attachments: foundry members can upload"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'agent-attachments'
        AND auth.uid() IS NOT NULL
        AND (storage.foldername(name))[1] IN (
            SELECT COALESCE(active_foundry_id, foundry_id)::text
            FROM public.profiles
            WHERE id = auth.uid()
        )
    );

CREATE POLICY "Agent attachments: foundry members can read"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'agent-attachments'
        AND auth.uid() IS NOT NULL
        AND (storage.foldername(name))[1] IN (
            SELECT COALESCE(active_foundry_id, foundry_id)::text
            FROM public.profiles
            WHERE id = auth.uid()
        )
    );

CREATE POLICY "Agent attachments: foundry members can delete"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'agent-attachments'
        AND auth.uid() IS NOT NULL
        AND (storage.foldername(name))[1] IN (
            SELECT COALESCE(active_foundry_id, foundry_id)::text
            FROM public.profiles
            WHERE id = auth.uid()
        )
    );
