/**
 * Migration: Data-Driven Sweep Triggers
 *
 * Purpose: Creates database functions and triggers that fire webhook
 * notifications when key data changes occur, enabling real-time
 * specialist sweeps beyond the cron schedule.
 *
 * Triggers:
 * - Objective status changes → notify strategist + product lead
 * - Task overdue detection → notify chief of staff
 * - Team member changes → notify HR specialist
 *
 * Implementation: Uses pg_net extension (if available) or pg_notify
 * for webhook delivery. The actual webhook URL is configured via
 * the app_settings table or environment.
 *
 * Security:
 * - Trigger functions run as SECURITY DEFINER
 * - Only fires on meaningful state changes (not every update)
 *
 * Rollback: DROP FUNCTION IF EXISTS notify_agent_sweep CASCADE
 */

-- ============================================================
-- 1. Generic pg_notify function for agent sweep events
-- ============================================================
-- Uses pg_notify to publish events to a channel that Edge Functions
-- or a listener can pick up and forward to the sweep trigger API.

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
  -- Determine event type and foundry_id based on trigger context
  v_foundry_id := COALESCE(NEW.foundry_id, OLD.foundry_id);

  -- Skip if no foundry_id
  IF v_foundry_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Determine event type based on table and operation
  CASE TG_TABLE_NAME
    WHEN 'objectives' THEN
      IF TG_OP = 'INSERT' THEN
        v_event_type := 'objective_created';
      ELSIF TG_OP = 'UPDATE' THEN
        -- Only fire on meaningful changes
        IF OLD.status IS DISTINCT FROM NEW.status THEN
          IF NEW.status = 'At Risk' THEN
            v_event_type := 'objective_at_risk';
          ELSIF NEW.status = 'Completed' THEN
            v_event_type := 'objective_completed';
          ELSE
            v_event_type := 'objective_updated';
          END IF;
        ELSE
          RETURN NEW; -- No meaningful change
        END IF;
      END IF;

    WHEN 'tasks' THEN
      IF TG_OP = 'UPDATE' THEN
        -- Detect overdue transitions (tasks use end_date as deadline)
        IF NEW.end_date IS NOT NULL
           AND NEW.end_date::TIMESTAMPTZ < NOW()
           AND NEW.status != 'Done'
           AND (OLD.end_date IS NULL OR OLD.end_date::TIMESTAMPTZ >= NOW() OR OLD.status = 'Done')
        THEN
          v_event_type := 'task_overdue';
        ELSE
          RETURN NEW; -- No overdue transition
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

  -- Only proceed if we identified an event
  IF v_event_type IS NULL THEN
    RETURN NEW;
  END IF;

  -- Build payload
  v_payload := jsonb_build_object(
    'event_type', v_event_type,
    'foundry_id', v_foundry_id,
    'entity_id', COALESCE(NEW.id::TEXT, OLD.id::TEXT),
    'timestamp', NOW()::TEXT
  );

  -- Publish to pg_notify channel for the sweep listener
  PERFORM pg_notify('agent_sweep_events', v_payload::TEXT);

  RETURN NEW;
END;
$$;


-- ============================================================
-- 2. Attach triggers to key tables
-- ============================================================

-- Objectives: fire on INSERT and status UPDATE
DROP TRIGGER IF EXISTS trg_agent_sweep_objectives ON public.objectives;
CREATE TRIGGER trg_agent_sweep_objectives
  AFTER INSERT OR UPDATE OF status ON public.objectives
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_agent_sweep();

-- Tasks: fire on UPDATE to detect overdue transitions
DROP TRIGGER IF EXISTS trg_agent_sweep_tasks ON public.tasks;
CREATE TRIGGER trg_agent_sweep_tasks
  AFTER UPDATE OF end_date, status ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_agent_sweep();

-- Profiles: fire on INSERT/DELETE for team changes
DROP TRIGGER IF EXISTS trg_agent_sweep_profiles ON public.profiles;
CREATE TRIGGER trg_agent_sweep_profiles
  AFTER INSERT OR DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_agent_sweep();
