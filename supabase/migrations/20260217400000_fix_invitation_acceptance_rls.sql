-- Migration: Fix invitation acceptance RLS + type mismatch
--
-- Problems fixed:
-- 1. Invited users (Apprentices) cannot mark their own invitation as accepted
--    because UPDATE policy only allows Founders/Executives
-- 2. get_invitation_by_token returns foundry_id as uuid but column is text
--
-- Security:
-- - New policy scoped to UPDATE only, restricted to matching email
-- - WITH CHECK ensures users can only modify their own invitation row
-- - SECURITY DEFINER on RPC function bypasses RLS for public token lookups

-- =============================================
-- 1. Allow invited users to accept their own invitation
-- =============================================

-- RLS: The invited user can update their own invitation (to mark accepted_at)
DROP POLICY IF EXISTS "Invited user can accept own invitation" ON public.company_invitations;
CREATE POLICY "Invited user can accept own invitation" ON public.company_invitations
    FOR UPDATE USING (
        lower(email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
    )
    WITH CHECK (
        lower(email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
    );

-- =============================================
-- 2. Fix get_invitation_by_token return type
-- =============================================
-- The company_invitations.foundry_id column is text, not uuid.
-- The function was returning uuid which could cause implicit cast failures.

CREATE OR REPLACE FUNCTION public.get_invitation_by_token(invitation_token text)
RETURNS TABLE (
    id uuid,
    foundry_id text,
    foundry_name text,
    email text,
    role public.member_role,
    invited_by_name text,
    expires_at timestamptz,
    is_valid boolean
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ci.id,
        ci.foundry_id,
        f.name as foundry_name,
        ci.email,
        ci.role,
        p.full_name as invited_by_name,
        ci.expires_at,
        (ci.accepted_at IS NULL AND ci.expires_at > now()) as is_valid
    FROM public.company_invitations ci
    JOIN public.foundries f ON f.id = ci.foundry_id
    JOIN public.profiles p ON p.id = ci.invited_by
    WHERE ci.token = invitation_token;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
