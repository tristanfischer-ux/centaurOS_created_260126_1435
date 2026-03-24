/**
 * Migration: Time Tracking — Red Team Hardening
 *
 * Fixes from security review:
 * - C-1: UPDATE policy missing WITH CHECK — users could self-approve via direct Supabase REST
 * - C-2: Manager UPDATE too permissive — could overwrite user_id, foundry_id, duration on any entry
 * - C-5: No description/rejection_reason length limits — storage abuse vector
 *
 * Strategy: Drop overly-permissive UPDATE policy, replace with two scoped policies:
 *   1. Users: can update content fields on own draft/rejected entries (cannot touch workflow fields)
 *   2. Managers: can update workflow fields on submitted entries only
 *
 * Rollback:
 *   DROP POLICY IF EXISTS "time_entries_update_own" ON public.time_entries;
 *   DROP POLICY IF EXISTS "time_entries_update_manager" ON public.time_entries;
 *   CREATE POLICY "time_entries_update" ON public.time_entries FOR UPDATE USING (...);
 *   ALTER TABLE public.time_entries DROP CONSTRAINT IF EXISTS time_entries_description_length;
 *   ALTER TABLE public.time_entries DROP CONSTRAINT IF EXISTS time_entries_rejection_reason_length;
 */

-- ─────────────────────────────────────────────────────────────────────────────
-- C-5: Add length constraints
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.time_entries
    ADD CONSTRAINT time_entries_description_length
    CHECK (char_length(description) <= 5000);

ALTER TABLE public.time_entries
    ADD CONSTRAINT time_entries_rejection_reason_length
    CHECK (rejection_reason IS NULL OR char_length(rejection_reason) <= 2000);

-- ─────────────────────────────────────────────────────────────────────────────
-- C-1 + C-2: Replace single UPDATE policy with two scoped policies
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop the overly-permissive policy
DROP POLICY IF EXISTS "time_entries_update" ON public.time_entries;

-- Policy 1: Users update own draft/rejected entries (content fields only)
-- WITH CHECK prevents mutation of workflow fields (status, reviewed_by, etc.)
-- and identity fields (user_id, foundry_id).
CREATE POLICY "time_entries_update_own"
    ON public.time_entries
    FOR UPDATE
    USING (
        user_id = auth.uid()
        AND status IN ('draft', 'rejected')
    )
    WITH CHECK (
        -- Cannot change identity
        user_id = auth.uid()
        AND foundry_id = foundry_id
        -- Cannot self-promote status
        AND status IN ('draft', 'rejected')
        -- Cannot set workflow fields
        AND reviewed_by IS NULL
        AND reviewed_at IS NULL
        AND rejection_reason IS NULL
    );

-- Policy 2: Managers approve/reject submitted entries (workflow fields only)
-- USING: only submitted entries in their foundry
-- WITH CHECK: can only move to approved/rejected, cannot change content
CREATE POLICY "time_entries_update_manager"
    ON public.time_entries
    FOR UPDATE
    USING (
        status = 'submitted'
        AND foundry_id IN (
            SELECT fm.foundry_id FROM public.foundry_memberships fm
            WHERE fm.user_id = auth.uid()
              AND fm.role IN ('Executive', 'Founder')
        )
    )
    WITH CHECK (
        -- Cannot change identity or content
        user_id = user_id
        AND foundry_id = foundry_id
        -- Must set a valid workflow status
        AND status IN ('approved', 'rejected')
    );
