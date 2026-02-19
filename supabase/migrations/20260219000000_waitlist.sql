/**
 * Migration: Waitlist table for invite-only signup
 *
 * Purpose: Store waitlist signups (email only). Admins approve entries;
 * approved users receive an invite link to complete signup at /join?token=...
 *
 * Security:
 * - RLS enabled with no policies: only service role (server-side) can read/write.
 * - No anon/authenticated access.
 *
 * Rollback: DROP TABLE public.waitlist;
 *
 * If db push fails due to migration history, apply this file manually
 * in Supabase Dashboard > SQL Editor.
 */

CREATE TABLE public.waitlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
    invite_token UUID DEFAULT gen_random_uuid() UNIQUE,
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES auth.users(id),
    redeemed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (email)
);

CREATE INDEX idx_waitlist_email ON public.waitlist (email);
CREATE INDEX idx_waitlist_invite_token ON public.waitlist (invite_token);
CREATE INDEX idx_waitlist_status ON public.waitlist (status);

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- No policies: only service role can access (bypasses RLS).

COMMENT ON TABLE public.waitlist IS 'Invite-only waitlist; server actions and API use service role to manage entries.';
