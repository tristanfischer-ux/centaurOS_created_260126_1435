-- Add notifications table for in-app notifications
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    foundry_id TEXT NOT NULL REFERENCES foundries(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'general',
    title TEXT NOT NULL,
    message TEXT,
    link TEXT,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at TIMESTAMPTZ
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_foundry_id ON notifications(foundry_id);

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can only see their own notifications
CREATE POLICY "Users can view own notifications"
    ON notifications FOR SELECT
    USING (user_id = auth.uid());

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications"
    ON notifications FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- System can insert notifications (via service role or triggers)
CREATE POLICY "Service role can insert notifications"
    ON notifications FOR INSERT
    WITH CHECK (
        user_id IN (
            SELECT id FROM profiles WHERE foundry_id = notifications.foundry_id
        )
    );

-- Users can delete their own notifications
CREATE POLICY "Users can delete own notifications"
    ON notifications FOR DELETE
    USING (user_id = auth.uid());

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- Function to create a notification
CREATE OR REPLACE FUNCTION create_notification(
    p_user_id UUID,
    p_type TEXT,
    p_title TEXT,
    p_message TEXT DEFAULT NULL,
    p_link TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
    v_foundry_id UUID;
    v_notification_id UUID;
BEGIN
    -- Get user's foundry
    SELECT foundry_id INTO v_foundry_id FROM profiles WHERE id = p_user_id;
    
    IF v_foundry_id IS NULL THEN
        RAISE EXCEPTION 'User not found or has no foundry';
    END IF;
    
    INSERT INTO notifications (user_id, foundry_id, type, title, message, link, metadata)
    VALUES (p_user_id, v_foundry_id, p_type, p_title, p_message, p_link, p_metadata)
    RETURNING id INTO v_notification_id;
    
    RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to notify on task assignment
CREATE OR REPLACE FUNCTION notify_task_assigned()
RETURNS TRIGGER AS $$
BEGIN
    -- Only notify if there's an assignee and it's a new assignment
    IF NEW.assignee_id IS NOT NULL AND (OLD IS NULL OR OLD.assignee_id IS DISTINCT FROM NEW.assignee_id) THEN
        PERFORM create_notification(
            NEW.assignee_id,
            'task_assigned',
            'New task assigned: ' || NEW.title,
            'You have been assigned a new task',
            '/tasks',
            jsonb_build_object('task_id', NEW.id)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to notify on task assignment
DROP TRIGGER IF EXISTS trigger_notify_task_assigned ON tasks;
CREATE TRIGGER trigger_notify_task_assigned
    AFTER INSERT OR UPDATE OF assignee_id ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION notify_task_assigned();

-- Function to notify on task status change to completed
CREATE OR REPLACE FUNCTION notify_task_completed()
RETURNS TRIGGER AS $$
BEGIN
    -- Notify creator when task is completed
    IF NEW.status = 'Completed' AND (OLD IS NULL OR OLD.status != 'Completed') THEN
        IF NEW.creator_id IS NOT NULL AND NEW.creator_id != NEW.assignee_id THEN
            PERFORM create_notification(
                NEW.creator_id,
                'task_completed',
                'Task completed: ' || NEW.title,
                'A task you created has been marked as completed',
                '/tasks',
                jsonb_build_object('task_id', NEW.id)
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to notify on task completion
DROP TRIGGER IF EXISTS trigger_notify_task_completed ON tasks;
CREATE TRIGGER trigger_notify_task_completed
    AFTER UPDATE OF status ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION notify_task_completed();
