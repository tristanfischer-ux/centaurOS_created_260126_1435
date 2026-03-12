-- Migration: Comprehensive business audit log
-- Provides a founder-facing audit trail of who did what and when.
-- Separate from security_audit_log (which tracks auth/security events).

CREATE TABLE IF NOT EXISTS public.audit_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id  TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    action      TEXT NOT NULL,
    entity_type TEXT,
    entity_id   TEXT,
    metadata    JSONB DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX idx_audit_log_foundry_created ON public.audit_log (foundry_id, created_at DESC);
CREATE INDEX idx_audit_log_user_created ON public.audit_log (user_id, created_at DESC);
CREATE INDEX idx_audit_log_action ON public.audit_log (action);

-- RLS
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Founders can read their foundry's audit log
CREATE POLICY "Founders can view audit log"
    ON public.audit_log FOR SELECT
    USING (
        foundry_id IN (
            SELECT p.foundry_id FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'Founder'
        )
    );

-- Server-side writes (via admin client) bypass RLS, but add a permissive
-- INSERT policy so service-role inserts succeed when RLS is on.
CREATE POLICY "Service role can insert audit log"
    ON public.audit_log FOR INSERT
    WITH CHECK (true);
