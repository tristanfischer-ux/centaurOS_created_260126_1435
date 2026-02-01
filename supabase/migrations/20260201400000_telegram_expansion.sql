-- Telegram Integration Expansion
-- Adds preferences, ideas capture, and decision queue for enhanced Telegram bot

-- ===========================================
-- Telegram Preferences
-- ===========================================
CREATE TABLE IF NOT EXISTS telegram_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    messaging_link_id UUID REFERENCES messaging_links(id) ON DELETE CASCADE,
    
    -- Notification settings
    notifications_enabled BOOLEAN DEFAULT true,
    daily_briefing_enabled BOOLEAN DEFAULT true,
    daily_briefing_time TIME DEFAULT '08:00:00', -- Local time
    timezone TEXT DEFAULT 'UTC',
    
    -- Notification types (granular control)
    notify_task_assigned BOOLEAN DEFAULT true,
    notify_task_completed BOOLEAN DEFAULT true,
    notify_mentions BOOLEAN DEFAULT true,
    notify_approvals BOOLEAN DEFAULT true,
    notify_orders BOOLEAN DEFAULT true,
    notify_rfq BOOLEAN DEFAULT true,
    
    -- Mute settings
    muted_until TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    UNIQUE(profile_id)
);

-- Index for efficient lookup
CREATE INDEX idx_telegram_prefs_profile ON telegram_preferences(profile_id);
CREATE INDEX idx_telegram_prefs_briefing ON telegram_preferences(daily_briefing_enabled, daily_briefing_time) 
    WHERE daily_briefing_enabled = true;

-- RLS
ALTER TABLE telegram_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own telegram preferences"
    ON telegram_preferences FOR SELECT
    USING (profile_id = auth.uid());

CREATE POLICY "Users can insert own telegram preferences"
    ON telegram_preferences FOR INSERT
    WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Users can update own telegram preferences"
    ON telegram_preferences FOR UPDATE
    USING (profile_id = auth.uid());

-- ===========================================
-- Ideas Inbox (Quick Capture)
-- ===========================================
CREATE TABLE IF NOT EXISTS telegram_ideas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    foundry_id TEXT NOT NULL REFERENCES foundries(id) ON DELETE CASCADE,
    
    content TEXT NOT NULL,
    transcribed_from_voice BOOLEAN DEFAULT false,
    original_audio_url TEXT,
    
    -- Status tracking
    status TEXT DEFAULT 'inbox' CHECK (status IN ('inbox', 'promoted', 'archived', 'dismissed')),
    promoted_to_objective_id UUID REFERENCES objectives(id) ON DELETE SET NULL,
    
    -- Metadata
    telegram_message_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_telegram_ideas_profile ON telegram_ideas(profile_id);
CREATE INDEX idx_telegram_ideas_status ON telegram_ideas(profile_id, status) WHERE status = 'inbox';
CREATE INDEX idx_telegram_ideas_created ON telegram_ideas(created_at DESC);

-- RLS
ALTER TABLE telegram_ideas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ideas"
    ON telegram_ideas FOR SELECT
    USING (profile_id = auth.uid());

CREATE POLICY "Users can insert own ideas"
    ON telegram_ideas FOR INSERT
    WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Users can update own ideas"
    ON telegram_ideas FOR UPDATE
    USING (profile_id = auth.uid());

CREATE POLICY "Users can delete own ideas"
    ON telegram_ideas FOR DELETE
    USING (profile_id = auth.uid());

-- ===========================================
-- Decision Queue (for Telegram approvals)
-- ===========================================
CREATE TABLE IF NOT EXISTS telegram_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    foundry_id TEXT NOT NULL REFERENCES foundries(id) ON DELETE CASCADE,
    
    -- What needs decision
    decision_type TEXT NOT NULL CHECK (decision_type IN (
        'task_review', 'rfq_proposal', 'order_milestone', 
        'team_request', 'expense_approval', 'other'
    )),
    title TEXT NOT NULL,
    description TEXT,
    
    -- Reference to the thing being decided
    reference_type TEXT NOT NULL, -- 'task', 'rfq', 'order', etc.
    reference_id UUID NOT NULL,
    
    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'deferred', 'expired')),
    decided_at TIMESTAMPTZ,
    decision_note TEXT,
    
    -- Telegram tracking
    telegram_message_id TEXT,
    telegram_chat_id TEXT,
    
    -- Metadata
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    expires_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_telegram_decisions_profile ON telegram_decisions(profile_id);
CREATE INDEX idx_telegram_decisions_pending ON telegram_decisions(profile_id, status) WHERE status = 'pending';
CREATE INDEX idx_telegram_decisions_priority ON telegram_decisions(priority, created_at) WHERE status = 'pending';
CREATE INDEX idx_telegram_decisions_reference ON telegram_decisions(reference_type, reference_id);

-- RLS
ALTER TABLE telegram_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own decisions"
    ON telegram_decisions FOR SELECT
    USING (profile_id = auth.uid());

CREATE POLICY "Users can update own decisions"
    ON telegram_decisions FOR UPDATE
    USING (profile_id = auth.uid());

-- ===========================================
-- Telegram Notification Log
-- ===========================================
CREATE TABLE IF NOT EXISTS telegram_notification_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    notification_id UUID REFERENCES notifications(id) ON DELETE SET NULL,
    
    telegram_chat_id TEXT NOT NULL,
    telegram_message_id TEXT,
    
    notification_type TEXT NOT NULL,
    sent_at TIMESTAMPTZ DEFAULT now(),
    delivered BOOLEAN DEFAULT true,
    error_message TEXT
);

-- Index for deduplication
CREATE INDEX idx_telegram_notif_log_dedup ON telegram_notification_log(notification_id) 
    WHERE notification_id IS NOT NULL;
CREATE INDEX idx_telegram_notif_log_profile ON telegram_notification_log(profile_id, sent_at DESC);

-- RLS
ALTER TABLE telegram_notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notification log"
    ON telegram_notification_log FOR SELECT
    USING (profile_id = auth.uid());

-- ===========================================
-- Helper Functions
-- ===========================================

-- Function to get pending decisions count
CREATE OR REPLACE FUNCTION get_pending_decisions_count(p_profile_id UUID)
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)::INTEGER 
        FROM telegram_decisions 
        WHERE profile_id = p_profile_id 
        AND status = 'pending'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create a decision item (called by triggers or app code)
CREATE OR REPLACE FUNCTION create_telegram_decision(
    p_profile_id UUID,
    p_decision_type TEXT,
    p_title TEXT,
    p_description TEXT,
    p_reference_type TEXT,
    p_reference_id UUID,
    p_priority TEXT DEFAULT 'normal',
    p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
    v_foundry_id TEXT;
    v_decision_id UUID;
BEGIN
    -- Get user's foundry
    SELECT foundry_id INTO v_foundry_id FROM profiles WHERE id = p_profile_id;
    
    IF v_foundry_id IS NULL THEN
        RAISE EXCEPTION 'User not found or has no foundry';
    END IF;
    
    INSERT INTO telegram_decisions (
        profile_id, foundry_id, decision_type, title, description,
        reference_type, reference_id, priority, metadata,
        expires_at
    ) VALUES (
        p_profile_id, v_foundry_id, p_decision_type, p_title, p_description,
        p_reference_type, p_reference_id, p_priority, p_metadata,
        now() + interval '7 days' -- Default 7 day expiry
    )
    RETURNING id INTO v_decision_id;
    
    RETURN v_decision_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get daily briefing data
CREATE OR REPLACE FUNCTION get_daily_briefing(p_profile_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
    v_foundry_id TEXT;
BEGIN
    -- Get user's foundry
    SELECT foundry_id INTO v_foundry_id FROM profiles WHERE id = p_profile_id;
    
    SELECT jsonb_build_object(
        'tasks_due_today', (
            SELECT COUNT(*)::INTEGER FROM tasks 
            WHERE assignee_id = p_profile_id 
            AND end_date::date = CURRENT_DATE 
            AND status NOT IN ('Completed', 'Cancelled')
        ),
        'tasks_overdue', (
            SELECT COUNT(*)::INTEGER FROM tasks 
            WHERE assignee_id = p_profile_id 
            AND end_date::date < CURRENT_DATE 
            AND status NOT IN ('Completed', 'Cancelled')
        ),
        'pending_decisions', (
            SELECT COUNT(*)::INTEGER FROM telegram_decisions 
            WHERE profile_id = p_profile_id 
            AND status = 'pending'
        ),
        'unread_notifications', (
            SELECT COUNT(*)::INTEGER FROM notifications 
            WHERE user_id = p_profile_id 
            AND is_read = false
        ),
        'active_objectives', (
            SELECT COUNT(*)::INTEGER FROM objectives 
            WHERE creator_id = p_profile_id 
            AND status = 'In Progress'
        ),
        'ideas_in_inbox', (
            SELECT COUNT(*)::INTEGER FROM telegram_ideas 
            WHERE profile_id = p_profile_id 
            AND status = 'inbox'
        )
    ) INTO v_result;
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- Triggers
-- ===========================================

-- Update timestamps
CREATE TRIGGER telegram_preferences_updated_at
    BEFORE UPDATE ON telegram_preferences
    FOR EACH ROW EXECUTE FUNCTION update_messaging_updated_at();

CREATE TRIGGER telegram_ideas_updated_at
    BEFORE UPDATE ON telegram_ideas
    FOR EACH ROW EXECUTE FUNCTION update_messaging_updated_at();

CREATE TRIGGER telegram_decisions_updated_at
    BEFORE UPDATE ON telegram_decisions
    FOR EACH ROW EXECUTE FUNCTION update_messaging_updated_at();

-- ===========================================
-- Create decision on task needing review
-- ===========================================
CREATE OR REPLACE FUNCTION create_task_review_decision()
RETURNS TRIGGER AS $$
BEGIN
    -- When task status changes to "Ready for Review" or similar
    IF NEW.status = 'Ready for Review' AND (OLD IS NULL OR OLD.status != 'Ready for Review') THEN
        -- Create decision for the task creator (who needs to review)
        IF NEW.creator_id IS NOT NULL AND NEW.creator_id != NEW.assignee_id THEN
            PERFORM create_telegram_decision(
                NEW.creator_id,
                'task_review',
                'Review: ' || NEW.title,
                'Task submitted for review by assignee',
                'task',
                NEW.id,
                'normal',
                jsonb_build_object('assignee_id', NEW.assignee_id)
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Only create trigger if tasks table has 'Ready for Review' status option
-- (This depends on your task status enum)
-- DROP TRIGGER IF EXISTS trigger_task_review_decision ON tasks;
-- CREATE TRIGGER trigger_task_review_decision
--     AFTER UPDATE OF status ON tasks
--     FOR EACH ROW
--     EXECUTE FUNCTION create_task_review_decision();
