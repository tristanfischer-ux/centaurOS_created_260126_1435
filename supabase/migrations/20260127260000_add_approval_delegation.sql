-- Add approval delegation system for remote team coordination
-- This enables executives to delegate approval authority when away

-- Create approval delegations table
CREATE TABLE public.approval_delegations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    delegator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    delegate_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    foundry_id text NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    
    -- Delegation period
    start_date timestamptz NOT NULL DEFAULT now(),
    end_date timestamptz,
    
    -- Scope
    all_tasks boolean DEFAULT true,
    task_types text[] DEFAULT '{}', -- Optional: specific task types only
    
    -- Metadata
    reason text,
    is_active boolean DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    
    -- Prevent delegator delegating to themselves
    CONSTRAINT no_self_delegation CHECK (delegator_id != delegate_id)
);

-- Create indexes
CREATE INDEX idx_approval_delegations_delegator ON public.approval_delegations(delegator_id);
CREATE INDEX idx_approval_delegations_delegate ON public.approval_delegations(delegate_id);
CREATE INDEX idx_approval_delegations_active ON public.approval_delegations(is_active) WHERE is_active = true;
CREATE INDEX idx_approval_delegations_dates ON public.approval_delegations(start_date, end_date);

-- Enable RLS
ALTER TABLE public.approval_delegations ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view delegations in same foundry" ON public.approval_delegations
    FOR SELECT
    USING (foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Executives can create delegations" ON public.approval_delegations
    FOR INSERT
    WITH CHECK (
        delegator_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() 
            AND role IN ('Executive', 'Founder')
        )
    );

CREATE POLICY "Delegators can update own delegations" ON public.approval_delegations
    FOR UPDATE
    USING (delegator_id = auth.uid())
    WITH CHECK (delegator_id = auth.uid());

CREATE POLICY "Delegators can delete own delegations" ON public.approval_delegations
    FOR DELETE
    USING (delegator_id = auth.uid());

-- Add approval settings to foundries (or create settings table)
-- For simplicity, we'll add columns to tasks for tracking timeouts
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS approval_requested_at timestamptz,
ADD COLUMN IF NOT EXISTS approval_escalated boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS escalation_reason text;

-- Create index for timeout monitoring
CREATE INDEX IF NOT EXISTS idx_tasks_approval_timeout 
ON public.tasks(approval_requested_at) 
WHERE status = 'Pending_Executive_Approval' AND approval_escalated = false;

-- Function to check if user can approve (including delegations)
CREATE OR REPLACE FUNCTION public.can_user_approve(p_task_id uuid, p_user_id uuid)
RETURNS boolean AS $$
DECLARE
    v_user_role text;
    v_has_delegation boolean;
BEGIN
    -- Check user's own role
    SELECT role INTO v_user_role FROM public.profiles WHERE id = p_user_id;
    
    -- Executives and Founders can always approve
    IF v_user_role IN ('Executive', 'Founder') THEN
        RETURN true;
    END IF;
    
    -- Check for active delegation
    SELECT EXISTS (
        SELECT 1 FROM public.approval_delegations
        WHERE delegate_id = p_user_id
        AND is_active = true
        AND (start_date <= now())
        AND (end_date IS NULL OR end_date >= now())
        AND all_tasks = true
    ) INTO v_has_delegation;
    
    RETURN v_has_delegation;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get pending approvals that need escalation (24h+ old)
CREATE OR REPLACE FUNCTION public.get_tasks_needing_escalation(p_timeout_hours integer DEFAULT 24)
RETURNS TABLE (
    task_id uuid,
    task_title text,
    status text,
    approval_requested_at timestamptz,
    hours_pending numeric
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id as task_id,
        t.title as task_title,
        t.status::text,
        t.approval_requested_at,
        EXTRACT(EPOCH FROM (now() - t.approval_requested_at)) / 3600 as hours_pending
    FROM public.tasks t
    WHERE t.status = 'Pending_Executive_Approval'
    AND t.approval_escalated = false
    AND t.approval_requested_at IS NOT NULL
    AND t.approval_requested_at < (now() - (p_timeout_hours || ' hours')::interval);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to escalate a task
CREATE OR REPLACE FUNCTION public.escalate_task(p_task_id uuid, p_reason text DEFAULT 'Approval timeout exceeded')
RETURNS public.tasks AS $$
DECLARE
    result public.tasks;
BEGIN
    UPDATE public.tasks
    SET 
        approval_escalated = true,
        escalation_reason = p_reason
    WHERE id = p_task_id
    RETURNING * INTO result;
    
    -- Could trigger notification here or via edge function
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.can_user_approve TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tasks_needing_escalation TO authenticated;
GRANT EXECUTE ON FUNCTION public.escalate_task TO authenticated;

-- Trigger to set approval_requested_at when task enters approval status
CREATE OR REPLACE FUNCTION public.set_approval_requested_at()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'Pending_Executive_Approval' AND OLD.status != 'Pending_Executive_Approval' THEN
        NEW.approval_requested_at = now();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER task_approval_requested
    BEFORE UPDATE ON public.tasks
    FOR EACH ROW
    EXECUTE FUNCTION public.set_approval_requested_at();

-- Enable realtime for delegations
ALTER PUBLICATION supabase_realtime ADD TABLE public.approval_delegations;

COMMENT ON TABLE public.approval_delegations IS 'Tracks approval authority delegations between executives';
COMMENT ON FUNCTION public.can_user_approve IS 'Checks if a user can approve a task (via role or delegation)';
COMMENT ON FUNCTION public.get_tasks_needing_escalation IS 'Returns tasks pending approval longer than timeout';
