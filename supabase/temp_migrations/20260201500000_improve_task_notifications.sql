-- Improve task assignment notifications to be more actionable
-- Problem: Notifications say "You have been assigned a new task" without task name or who assigned it
-- Solution: Include task title, assigner name, and direct link to the task

-- Updated function to notify on task assignment with better details
CREATE OR REPLACE FUNCTION notify_task_assigned()
RETURNS TRIGGER AS $$
DECLARE
    v_assigner_name TEXT;
BEGIN
    -- Only notify if there's an assignee and it's a new assignment
    IF NEW.assignee_id IS NOT NULL AND (OLD IS NULL OR OLD.assignee_id IS DISTINCT FROM NEW.assignee_id) THEN
        -- Get the name of who assigned the task (the creator)
        SELECT COALESCE(full_name, 'Someone') INTO v_assigner_name 
        FROM profiles 
        WHERE id = NEW.creator_id;
        
        PERFORM create_notification(
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Updated function to notify on task completion with better details
CREATE OR REPLACE FUNCTION notify_task_completed()
RETURNS TRIGGER AS $$
DECLARE
    v_completer_name TEXT;
BEGIN
    -- Notify creator when task is completed
    IF NEW.status = 'Completed' AND (OLD IS NULL OR OLD.status != 'Completed') THEN
        IF NEW.creator_id IS NOT NULL AND NEW.creator_id != NEW.assignee_id THEN
            -- Get the name of who completed the task
            SELECT COALESCE(full_name, 'Someone') INTO v_completer_name 
            FROM profiles 
            WHERE id = NEW.assignee_id;
            
            PERFORM create_notification(
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add function for task forwarding notifications
CREATE OR REPLACE FUNCTION notify_task_forwarded()
RETURNS TRIGGER AS $$
DECLARE
    v_forwarder_name TEXT;
    v_forwarding_entry JSONB;
BEGIN
    -- Check if task was forwarded (assignee changed and forwarding_history was updated)
    IF NEW.assignee_id IS NOT NULL 
       AND OLD.assignee_id IS NOT NULL 
       AND NEW.assignee_id != OLD.assignee_id 
       AND NEW.forwarding_history IS NOT NULL 
       AND jsonb_array_length(NEW.forwarding_history) > COALESCE(jsonb_array_length(OLD.forwarding_history), 0) THEN
        
        -- Get the latest forwarding entry
        v_forwarding_entry := NEW.forwarding_history->-1;
        
        -- Get name of person who forwarded it
        SELECT COALESCE(full_name, 'Someone') INTO v_forwarder_name 
        FROM profiles 
        WHERE id = OLD.assignee_id;
        
        PERFORM create_notification(
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for task forwarding (only on UPDATE, after the main assignment trigger)
DROP TRIGGER IF EXISTS trigger_notify_task_forwarded ON tasks;
CREATE TRIGGER trigger_notify_task_forwarded
    AFTER UPDATE OF assignee_id ON tasks
    FOR EACH ROW
    WHEN (OLD.assignee_id IS NOT NULL AND NEW.forwarding_history IS NOT NULL)
    EXECUTE FUNCTION notify_task_forwarded();

COMMENT ON FUNCTION notify_task_assigned() IS 'Creates actionable notification when task is assigned, including assigner name and direct link';
COMMENT ON FUNCTION notify_task_completed() IS 'Creates actionable notification when task is completed, including completer name and direct link';
COMMENT ON FUNCTION notify_task_forwarded() IS 'Creates notification when task is forwarded, including reason if provided';
