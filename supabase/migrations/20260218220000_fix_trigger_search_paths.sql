/**
 * Migration: Fix trigger function search_paths broken by security advisor
 *
 * Purpose: The security advisor migration (20260218150000) correctly pinned
 * search_path = '' on all public functions to prevent search-path injection.
 * However, trigger functions that reference tables without schema qualification
 * (e.g. `FROM profiles` instead of `FROM public.profiles`) now fail with:
 *   "relation 'profiles' does not exist"
 *
 * This broke task creation because:
 *   1. INSERT into tasks fires notify_task_assigned() trigger
 *   2. notify_task_assigned() calls create_notification()
 *   3. Both reference `profiles` and `notifications` without `public.` prefix
 *   4. With search_path = '', PostgreSQL can't resolve the table names
 *
 * Fix: Recreate all affected functions with SET search_path = public and
 * fully-qualified table references for defense in depth.
 *
 * Rollback: ALTER FUNCTION public.<name>(<args>) SET search_path = '';
 */

-- ============================================================================
-- FIX 1: create_notification — used by all task/notification triggers
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_notification(
    p_user_id UUID,
    p_type TEXT,
    p_title TEXT,
    p_message TEXT DEFAULT NULL,
    p_link TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_foundry_id TEXT;
    v_notification_id UUID;
BEGIN
    SELECT foundry_id INTO v_foundry_id
    FROM public.profiles
    WHERE id = p_user_id;

    IF v_foundry_id IS NULL THEN
        RAISE EXCEPTION 'User not found or has no foundry';
    END IF;

    INSERT INTO public.notifications (user_id, foundry_id, type, title, message, link, metadata)
    VALUES (p_user_id, v_foundry_id, p_type, p_title, p_message, p_link, p_metadata)
    RETURNING id INTO v_notification_id;

    RETURN v_notification_id;
END;
$$;

-- ============================================================================
-- FIX 2: notify_task_assigned — fires on INSERT/UPDATE of tasks.assignee_id
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_assigner_name TEXT;
BEGIN
    IF NEW.assignee_id IS NOT NULL AND (OLD IS NULL OR OLD.assignee_id IS DISTINCT FROM NEW.assignee_id) THEN
        SELECT COALESCE(full_name, 'Someone') INTO v_assigner_name
        FROM public.profiles
        WHERE id = NEW.creator_id;

        PERFORM public.create_notification(
            NEW.assignee_id,
            'task_assigned',
            v_assigner_name || ' assigned you: ' || COALESCE(NEW.title, 'New Task'),
            'Click to view task details and take action',
            '/tasks?taskId=' || NEW.id,
            jsonb_build_object(
                'task_id', NEW.id,
                'assigner_id', NEW.creator_id,
                'assigner_name', v_assigner_name
            )
        );
    END IF;
    RETURN NEW;
END;
$$;

-- ============================================================================
-- FIX 3: notify_task_completed — fires on UPDATE of tasks.status
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notify_task_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_completer_name TEXT;
BEGIN
    IF NEW.status = 'Completed' AND (OLD IS NULL OR OLD.status != 'Completed') THEN
        IF NEW.creator_id IS NOT NULL AND NEW.creator_id != NEW.assignee_id THEN
            SELECT COALESCE(full_name, 'Someone') INTO v_completer_name
            FROM public.profiles
            WHERE id = NEW.assignee_id;

            PERFORM public.create_notification(
                NEW.creator_id,
                'task_completed',
                v_completer_name || ' completed: ' || COALESCE(NEW.title, 'A Task'),
                'Click to review the completed work',
                '/tasks?taskId=' || NEW.id,
                jsonb_build_object(
                    'task_id', NEW.id,
                    'completer_id', NEW.assignee_id,
                    'completer_name', v_completer_name
                )
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- ============================================================================
-- FIX 4: notify_task_forwarded — fires on UPDATE of tasks.assignee_id
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notify_task_forwarded()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_forwarder_name TEXT;
    v_forwarding_entry JSONB;
BEGIN
    IF NEW.assignee_id IS NOT NULL
       AND OLD.assignee_id IS NOT NULL
       AND NEW.assignee_id != OLD.assignee_id
       AND NEW.forwarding_history IS NOT NULL
       AND jsonb_array_length(NEW.forwarding_history) > COALESCE(jsonb_array_length(OLD.forwarding_history), 0) THEN

        v_forwarding_entry := NEW.forwarding_history->-1;

        SELECT COALESCE(full_name, 'Someone') INTO v_forwarder_name
        FROM public.profiles
        WHERE id = OLD.assignee_id;

        PERFORM public.create_notification(
            NEW.assignee_id,
            'task_assigned',
            v_forwarder_name || ' forwarded you: ' || COALESCE(NEW.title, 'A Task'),
            COALESCE(v_forwarding_entry->>'reason', 'Click to view task details'),
            '/tasks?taskId=' || NEW.id,
            jsonb_build_object(
                'task_id', NEW.id,
                'forwarder_id', OLD.assignee_id,
                'forwarder_name', v_forwarder_name,
                'reason', v_forwarding_entry->>'reason'
            )
        );
    END IF;
    RETURN NEW;
END;
$$;

-- ============================================================================
-- FIX 5: trigger_ghost_worker — fires on INSERT/UPDATE of tasks
-- Already uses public.profiles but needs search_path for net.http_post
-- ============================================================================
CREATE OR REPLACE FUNCTION public.trigger_ghost_worker()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    is_ai boolean;
    project_url text := 'https://jyarhvinengfyrwgtskq.supabase.co/functions/v1/ghost-worker';
    service_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5YXJodmluZW5nZnlyd2d0c2txIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTQzMzU2NCwiZXhwIjoyMDg1MDA5NTY0fQ.A4FN045WPv9yTe8EIe--lGyrFT-bF5W1y24gA4dyj1A';
BEGIN
    SELECT (role = 'AI_Agent') INTO is_ai FROM public.profiles WHERE id = NEW.assignee_id;

    IF is_ai THEN
        PERFORM net.http_post(
            url := project_url,
            headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || service_key),
            body := jsonb_build_object('record', row_to_json(NEW), 'type', TG_OP)
        );
    END IF;
    RETURN NEW;
END;
$$;

-- ============================================================================
-- FIX 6: update_message_reply_count — references unqualified messages table
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_message_reply_count()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.parent_message_id IS NOT NULL THEN
        UPDATE public.messages
        SET reply_count = reply_count + 1,
            last_reply_at = NEW.created_at
        WHERE id = NEW.parent_message_id;
    ELSIF TG_OP = 'DELETE' AND OLD.parent_message_id IS NOT NULL THEN
        UPDATE public.messages
        SET reply_count = GREATEST(reply_count - 1, 0)
        WHERE id = OLD.parent_message_id;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- ============================================================================
-- FIX 7: create_notification_safe — alternate notification function
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_notification_safe(
    p_user_id uuid,
    p_title text,
    p_body text,
    p_priority text DEFAULT 'medium',
    p_action_url text DEFAULT NULL,
    p_metadata jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_foundry_id text;
    v_notification_id uuid;
BEGIN
    SELECT foundry_id INTO v_foundry_id
    FROM public.profiles
    WHERE id = p_user_id;

    IF v_foundry_id IS NULL THEN
        RETURN NULL;
    END IF;

    INSERT INTO public.notifications (user_id, foundry_id, type, title, message, link, metadata)
    VALUES (p_user_id, v_foundry_id, 'system', p_title, p_body, p_action_url, COALESCE(p_metadata, '{}'::jsonb))
    RETURNING id INTO v_notification_id;

    RETURN v_notification_id;
END;
$$;

-- ============================================================================
-- BULK FIX: Set search_path = public on ALL remaining trigger functions
-- ============================================================================
-- SECURITY: Trigger functions inherently need access to the public schema
-- since they operate on table events. Setting search_path = public is safe
-- for trigger functions specifically, as they run with SECURITY DEFINER
-- and the caller cannot inject a custom search_path.

DO $$
DECLARE
    func_record RECORD;
    fixed_count INTEGER := 0;
BEGIN
    FOR func_record IN
        SELECT
            p.proname AS function_name,
            pg_get_function_identity_arguments(p.oid) AS args,
            p.oid
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.prorettype = 'trigger'::regtype
        AND EXISTS (
            SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS config
            WHERE config = 'search_path='
        )
    LOOP
        BEGIN
            EXECUTE format(
                'ALTER FUNCTION public.%I(%s) SET search_path = public',
                func_record.function_name,
                func_record.args
            );
            fixed_count := fixed_count + 1;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Skipped trigger function % (%)', func_record.function_name, SQLERRM;
        END;
    END LOOP;

    RAISE NOTICE 'Fixed search_path on % trigger functions', fixed_count;
END;
$$;
