-- RPC function to atomically transfer task assignee
-- This prevents race conditions when forwarding tasks concurrently
CREATE OR REPLACE FUNCTION transfer_task_assignee(
    p_task_id UUID,
    p_new_assignee_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Delete all existing assignees for this task
    DELETE FROM task_assignees
    WHERE task_id = p_task_id;
    
    -- Insert the new assignee
    INSERT INTO task_assignees (task_id, profile_id)
    VALUES (p_task_id, p_new_assignee_id);
END;
$$;
