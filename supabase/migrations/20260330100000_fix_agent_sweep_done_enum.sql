/**
 * Migration: Fix agent sweep trigger enum reference
 *
 * BUG: notify_agent_sweep() references 'Done' which is not a valid
 * task_status enum value. The correct value is 'Completed'.
 * This causes "invalid input value for enum task_status: 'Done'"
 * on any task UPDATE (including status changes via the UI).
 *
 * Also fixes the RLS UPDATE policy for tasks — users could not
 * update their own tasks because the UPDATE policy was missing
 * or too restrictive for foundry_memberships-based access.
 */

-- Fix 1: Replace 'Done' with 'Completed' in notify_agent_sweep
CREATE OR REPLACE FUNCTION public.notify_agent_sweep()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_type TEXT;
  v_foundry_id TEXT;
  v_payload JSONB;
BEGIN
  v_foundry_id := COALESCE(NEW.foundry_id, OLD.foundry_id);

  IF v_foundry_id IS NULL THEN
    RETURN NEW;
  END IF;

  CASE TG_TABLE_NAME
    WHEN 'objectives' THEN
      IF TG_OP = 'INSERT' THEN
        v_event_type := 'objective_created';
      ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status IS DISTINCT FROM NEW.status THEN
          IF NEW.status = 'At Risk' THEN
            v_event_type := 'objective_at_risk';
          ELSIF NEW.status = 'Completed' THEN
            v_event_type := 'objective_completed';
          ELSE
            v_event_type := 'objective_updated';
          END IF;
        ELSE
          RETURN NEW;
        END IF;
      END IF;

    WHEN 'tasks' THEN
      IF TG_OP = 'UPDATE' THEN
        -- FIX: Changed 'Done' to 'Completed' (valid task_status enum value)
        IF NEW.end_date IS NOT NULL
           AND NEW.end_date::TIMESTAMPTZ < NOW()
           AND NEW.status != 'Completed'
           AND (OLD.end_date IS NULL OR OLD.end_date::TIMESTAMPTZ >= NOW() OR OLD.status = 'Completed')
        THEN
          v_event_type := 'task_overdue';
        ELSE
          RETURN NEW;
        END IF;
      END IF;

    WHEN 'profiles' THEN
      IF TG_OP = 'INSERT' THEN
        v_event_type := 'team_member_added';
      ELSIF TG_OP = 'DELETE' THEN
        v_event_type := 'team_member_removed';
        v_foundry_id := OLD.foundry_id;
      ELSE
        RETURN NEW;
      END IF;

    ELSE
      RETURN NEW;
  END CASE;

  IF v_event_type IS NULL THEN
    RETURN NEW;
  END IF;

  v_payload := jsonb_build_object(
    'event_type', v_event_type,
    'foundry_id', v_foundry_id,
    'table', TG_TABLE_NAME,
    'operation', TG_OP,
    'record_id', NEW.id,
    'timestamp', NOW()
  );

  PERFORM pg_notify('agent_sweep', v_payload::text);

  RETURN NEW;
END;
$$;

-- Fix 2: Ensure tasks UPDATE policy allows foundry members to update tasks
-- Drop any existing restrictive UPDATE policies
DROP POLICY IF EXISTS "Users can update tasks in their foundry" ON public.tasks;
DROP POLICY IF EXISTS "tasks_update_policy" ON public.tasks;

-- Create permissive UPDATE policy using foundry_memberships
CREATE POLICY "Users can update tasks in their foundry"
  ON public.tasks
  FOR UPDATE
  USING (
    foundry_id IN (
      SELECT fm.foundry_id
      FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    foundry_id IN (
      SELECT fm.foundry_id
      FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid()
    )
  );
