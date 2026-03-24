/**
 * Migration: Time Tracking (Phase 1)
 *
 * Purpose: General-purpose time tracking for fractional/contract team members.
 * Supports manual entry (Phase 1), start/stop timer (Phase 2), and approval workflow (Phase 2).
 *
 * DECISION: Separate from otjt_time_logs (apprenticeship-specific) and timesheet_entries
 * (marketplace retainers). This is the core timesheet for all team members.
 *
 * DECISION: duration_minutes (integer) instead of decimal hours — avoids float issues.
 * Display as "Xh Ym" in the UI.
 *
 * Security:
 * - RLS: Users see/manage own entries. Managers (Executive/Founder) see all foundry entries.
 * - foundry_id isolation on all policies.
 *
 * Related:
 * - src/actions/time-tracking.ts — Server actions for CRUD
 * - src/app/(platform)/time/page.tsx — Main UI
 * - src/types/time-tracking.ts — TypeScript types
 *
 * Rollback: DROP TABLE IF EXISTS public.time_entries CASCADE;
 */

-- ─────────────────────────────────────────────────────────────────────────────
-- Table: time_entries
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.time_entries (
    id              uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id      text            NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    user_id         uuid            NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    entry_date      date            NOT NULL,
    duration_minutes integer        NOT NULL CHECK (duration_minutes >= 1 AND duration_minutes <= 1440),
    started_at      timestamptz,    -- NULL for manual entries; Phase 2 timer support
    ended_at        timestamptz,    -- NULL for manual entries / active timers
    description     text            NOT NULL DEFAULT '',
    task_id         uuid            REFERENCES public.tasks(id) ON DELETE SET NULL,
    finance_project_id uuid         REFERENCES public.finance_projects(id) ON DELETE SET NULL,
    is_billable     boolean         NOT NULL DEFAULT true,
    hourly_rate_pence integer,      -- NULL = inherit from project/foundry default (Phase 3)
    status          text            NOT NULL DEFAULT 'draft'
                                    CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
    submitted_at    timestamptz,
    reviewed_by     uuid            REFERENCES public.profiles(id),
    reviewed_at     timestamptz,
    rejection_reason text,
    created_at      timestamptz     NOT NULL DEFAULT now(),
    updated_at      timestamptz     NOT NULL DEFAULT now()
);

-- INTENT: Comment for future developers
COMMENT ON TABLE public.time_entries IS 'General-purpose time tracking. Phase 1: manual entry. Phase 2: timer + approval. Phase 3: reporting + finance.';
COMMENT ON COLUMN public.time_entries.duration_minutes IS 'Whole minutes (1-1440). Display as Xh Ym in UI. Avoids float precision issues.';
COMMENT ON COLUMN public.time_entries.hourly_rate_pence IS 'Override rate in pence. NULL = inherit from project/foundry default (Phase 3).';

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_time_entries_foundry
    ON public.time_entries(foundry_id);

CREATE INDEX IF NOT EXISTS idx_time_entries_user_foundry
    ON public.time_entries(user_id, foundry_id);

CREATE INDEX IF NOT EXISTS idx_time_entries_foundry_date
    ON public.time_entries(foundry_id, entry_date);

CREATE INDEX IF NOT EXISTS idx_time_entries_foundry_status
    ON public.time_entries(foundry_id, status);

CREATE INDEX IF NOT EXISTS idx_time_entries_task
    ON public.time_entries(task_id)
    WHERE task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_time_entries_finance_project
    ON public.time_entries(finance_project_id)
    WHERE finance_project_id IS NOT NULL;

-- INTENT: Enforce at most one active timer per user per foundry (Phase 2)
CREATE UNIQUE INDEX IF NOT EXISTS idx_time_entries_active_timer
    ON public.time_entries(user_id, foundry_id)
    WHERE started_at IS NOT NULL AND ended_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger: auto-update updated_at
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.time_entries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER time_entries_set_updated_at
    BEFORE UPDATE ON public.time_entries
    FOR EACH ROW
    EXECUTE FUNCTION public.time_entries_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS Policies
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

-- SELECT: Users see own entries. Managers (Executive/Founder) see all foundry entries.
CREATE POLICY "time_entries_select"
    ON public.time_entries
    FOR SELECT
    USING (
        user_id = auth.uid()
        OR (
            foundry_id IN (
                SELECT fm.foundry_id FROM public.foundry_memberships fm
                WHERE fm.user_id = auth.uid()
                  AND fm.role IN ('Executive', 'Founder')
            )
        )
    );

-- INSERT: Users create own entries in their own foundry
CREATE POLICY "time_entries_insert"
    ON public.time_entries
    FOR INSERT
    WITH CHECK (
        user_id = auth.uid()
        AND foundry_id IN (
            SELECT fm.foundry_id FROM public.foundry_memberships fm
            WHERE fm.user_id = auth.uid()
        )
    );

-- UPDATE: Users update own draft/rejected entries. Managers can update any entry in foundry (for approval).
CREATE POLICY "time_entries_update"
    ON public.time_entries
    FOR UPDATE
    USING (
        (user_id = auth.uid() AND status IN ('draft', 'rejected'))
        OR (
            foundry_id IN (
                SELECT fm.foundry_id FROM public.foundry_memberships fm
                WHERE fm.user_id = auth.uid()
                  AND fm.role IN ('Executive', 'Founder')
            )
        )
    );

-- DELETE: Users delete own draft entries only
CREATE POLICY "time_entries_delete"
    ON public.time_entries
    FOR DELETE
    USING (
        user_id = auth.uid()
        AND status = 'draft'
    );
