/**
 * Migration: Time Tracking — Identity Field Protection
 *
 * RT2-C1 fix: The hardening migration's WITH CHECK clauses contained tautologies:
 *   `foundry_id = foundry_id` and `user_id = user_id` compare the column to itself
 *   (always true) — they do NOT prevent identity field mutation.
 *
 * PostgreSQL RLS WITH CHECK can only reference the NEW row, not OLD. To prevent
 * changing user_id/foundry_id on UPDATE, we use a BEFORE UPDATE trigger.
 *
 * Also cleans up the tautological WITH CHECK clauses in the update policies.
 *
 * Rollback:
 *   DROP TRIGGER IF EXISTS time_entries_immutable_identity ON public.time_entries;
 *   DROP FUNCTION IF EXISTS public.time_entries_prevent_identity_change();
 *   -- Then re-create old policies from 20260324200000
 */

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger: Prevent mutation of identity fields (user_id, foundry_id)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.time_entries_prevent_identity_change()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.user_id != OLD.user_id THEN
        RAISE EXCEPTION 'Cannot change user_id on time entries';
    END IF;
    IF NEW.foundry_id != OLD.foundry_id THEN
        RAISE EXCEPTION 'Cannot change foundry_id on time entries';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER time_entries_immutable_identity
    BEFORE UPDATE ON public.time_entries
    FOR EACH ROW
    EXECUTE FUNCTION public.time_entries_prevent_identity_change();

-- ─────────────────────────────────────────────────────────────────────────────
-- Fix tautological WITH CHECK clauses in update policies
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop old policies with tautologies
DROP POLICY IF EXISTS "time_entries_update_own" ON public.time_entries;
DROP POLICY IF EXISTS "time_entries_update_manager" ON public.time_entries;

-- Policy 1: Users update own draft/rejected entries (content fields only)
-- Identity protection now handled by trigger — no need for foundry_id check here
CREATE POLICY "time_entries_update_own"
    ON public.time_entries
    FOR UPDATE
    USING (
        user_id = auth.uid()
        AND status IN ('draft', 'rejected')
    )
    WITH CHECK (
        -- Must remain own entry (trigger also enforces this)
        user_id = auth.uid()
        -- Cannot self-promote status
        AND status IN ('draft', 'rejected')
        -- Cannot set workflow fields
        AND reviewed_by IS NULL
        AND reviewed_at IS NULL
        AND rejection_reason IS NULL
    );

-- Policy 2: Managers approve/reject submitted entries (workflow fields only)
-- Identity fields protected by trigger
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
        -- Must set a valid workflow status
        status IN ('approved', 'rejected')
    );
