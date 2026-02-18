-- ===========================================
-- Automated Reporting Engine
-- ===========================================
-- Functions for daily pulse, weekly rollup, monthly summary
-- Plus report preferences and snapshot storage

-- ===========================================
-- Report Preferences Table
-- ===========================================

CREATE TABLE IF NOT EXISTS report_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    
    -- Delivery channels
    telegram_enabled BOOLEAN DEFAULT true,
    email_enabled BOOLEAN DEFAULT false,
    slack_enabled BOOLEAN DEFAULT false,
    slack_webhook_url TEXT,
    
    -- Timing
    daily_report_time TIME DEFAULT '18:00:00',
    weekly_report_day INTEGER DEFAULT 1, -- 1 = Monday
    timezone TEXT DEFAULT 'UTC',
    
    -- Content preferences
    include_summary BOOLEAN DEFAULT true,
    include_trends BOOLEAN DEFAULT true,
    include_insights BOOLEAN DEFAULT true,
    include_team_activity BOOLEAN DEFAULT true,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    UNIQUE(profile_id)
);

-- Enable RLS
ALTER TABLE report_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own report preferences"
    ON report_preferences FOR SELECT
    USING (auth.uid() = profile_id);

CREATE POLICY "Users can insert their own report preferences"
    ON report_preferences FOR INSERT
    WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Users can update their own report preferences"
    ON report_preferences FOR UPDATE
    USING (auth.uid() = profile_id);

-- ===========================================
-- Report Snapshots Table (for history)
-- ===========================================

CREATE TABLE IF NOT EXISTS report_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT NOT NULL,
    profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    report_type TEXT NOT NULL CHECK (report_type IN ('daily', 'weekly', 'monthly')),
    report_date DATE NOT NULL,
    report_data JSONB NOT NULL DEFAULT '{}',
    summary_text TEXT,
    generated_at TIMESTAMPTZ DEFAULT now(),
    
    UNIQUE(foundry_id, profile_id, report_type, report_date)
);

-- Enable RLS
ALTER TABLE report_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view reports from their foundry"
    ON report_snapshots FOR SELECT
    USING (
        foundry_id IN (
            SELECT foundry_id FROM profiles WHERE id = auth.uid()
        )
    );

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_report_snapshots_lookup 
    ON report_snapshots(foundry_id, profile_id, report_type, report_date DESC);

-- ===========================================
-- Get Daily Pulse Data
-- ===========================================

CREATE OR REPLACE FUNCTION get_daily_pulse(
    p_profile_id UUID,
    p_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB AS $$
DECLARE
    v_foundry_id TEXT;
    v_result JSONB;
    v_yesterday DATE := p_date - 1;
BEGIN
    -- Get user's foundry
    SELECT foundry_id INTO v_foundry_id FROM profiles WHERE id = p_profile_id;
    
    IF v_foundry_id IS NULL THEN
        RETURN jsonb_build_object('error', 'User has no foundry');
    END IF;
    
    SELECT jsonb_build_object(
        'date', p_date,
        'foundry_id', v_foundry_id,
        
        -- Personal stats for this user
        'personal', jsonb_build_object(
            'tasks_completed', (
                SELECT COALESCE(jsonb_agg(jsonb_build_object(
                    'task_id', th.task_id,
                    'title', t.title,
                    'completed_at', th.created_at,
                    'objective_title', o.title
                )), '[]'::jsonb)
                FROM task_history th
                JOIN tasks t ON t.id = th.task_id
                LEFT JOIN objectives o ON o.id = t.objective_id
                WHERE th.user_id = p_profile_id
                    AND th.action_type = 'COMPLETED'
                    AND th.created_at::date = p_date
            ),
            'tasks_completed_count', (
                SELECT COUNT(*)::INTEGER
                FROM task_history th
                WHERE th.user_id = p_profile_id
                    AND th.action_type = 'COMPLETED'
                    AND th.created_at::date = p_date
            ),
            'tasks_created_count', (
                SELECT COUNT(*)::INTEGER
                FROM task_history th
                JOIN tasks t ON t.id = th.task_id
                WHERE th.user_id = p_profile_id
                    AND th.action_type = 'CREATED'
                    AND th.created_at::date = p_date
            ),
            'tasks_due_today', (
                SELECT COUNT(*)::INTEGER
                FROM tasks t
                WHERE (t.assignee_id = p_profile_id OR t.id IN (
                    SELECT task_id FROM task_assignees WHERE profile_id = p_profile_id
                ))
                AND t.end_date::date = p_date
                AND t.status NOT IN ('Completed', 'Rejected')
            ),
            'tasks_overdue', (
                SELECT COUNT(*)::INTEGER
                FROM tasks t
                WHERE (t.assignee_id = p_profile_id OR t.id IN (
                    SELECT task_id FROM task_assignees WHERE profile_id = p_profile_id
                ))
                AND t.end_date::date < p_date
                AND t.status NOT IN ('Completed', 'Rejected')
            )
        ),
        
        -- Team stats (foundry-wide)
        'team', jsonb_build_object(
            'total_completed', (
                SELECT COUNT(*)::INTEGER
                FROM task_history th
                JOIN tasks t ON t.id = th.task_id
                WHERE t.foundry_id = v_foundry_id
                    AND th.action_type = 'COMPLETED'
                    AND th.created_at::date = p_date
            ),
            'total_created', (
                SELECT COUNT(*)::INTEGER
                FROM task_history th
                JOIN tasks t ON t.id = th.task_id
                WHERE t.foundry_id = v_foundry_id
                    AND th.action_type = 'CREATED'
                    AND th.created_at::date = p_date
            ),
            'completion_rate', (
                SELECT CASE 
                    WHEN COUNT(*) FILTER (WHERE th.action_type = 'CREATED') = 0 THEN 0
                    ELSE ROUND(
                        COUNT(*) FILTER (WHERE th.action_type = 'COMPLETED')::numeric /
                        COUNT(*) FILTER (WHERE th.action_type = 'CREATED') * 100
                    , 1)
                END
                FROM task_history th
                JOIN tasks t ON t.id = th.task_id
                WHERE t.foundry_id = v_foundry_id
                    AND th.created_at::date = p_date
            ),
            'top_completers', (
                SELECT COALESCE(jsonb_agg(row_to_json(x)), '[]'::jsonb)
                FROM (
                    SELECT pr.full_name, COUNT(*)::INTEGER as completed_count
                    FROM task_history th
                    JOIN tasks t ON t.id = th.task_id
                    JOIN profiles pr ON pr.id = th.user_id
                    WHERE t.foundry_id = v_foundry_id
                        AND th.action_type = 'COMPLETED'
                        AND th.created_at::date = p_date
                    GROUP BY pr.id, pr.full_name
                    ORDER BY completed_count DESC
                    LIMIT 3
                ) x
            )
        ),
        
        -- Blockers from standups
        'blockers', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'user_id', s.user_id,
                'user_name', pr.full_name,
                'blocker', s.blockers,
                'severity', s.blocker_severity,
                'needs_help', COALESCE(s.needs_help, false)
            )), '[]'::jsonb)
            FROM standups s
            JOIN profiles pr ON pr.id = s.user_id
            WHERE s.foundry_id = v_foundry_id
                AND s.standup_date = p_date
                AND s.blockers IS NOT NULL
        ),
        
        -- Forwarded tasks (potential blockers)
        'forwarded_tasks', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'task_id', th.task_id,
                'title', t.title,
                'from_user', (SELECT full_name FROM profiles WHERE id = (th.changes->>'previous_assignee')::uuid),
                'to_user', (SELECT full_name FROM profiles WHERE id = (th.changes->>'new_assignee')::uuid),
                'reason', th.changes->>'reason'
            )), '[]'::jsonb)
            FROM task_history th
            JOIN tasks t ON t.id = th.task_id
            WHERE t.foundry_id = v_foundry_id
                AND th.action_type = 'FORWARDED'
                AND th.created_at::date = p_date
        ),
        
        -- Pending approvals (for executives)
        'pending_approvals', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'task_id', t.id,
                'title', t.title,
                'status', t.status,
                'assignee_name', pr.full_name,
                'requested_at', t.approval_requested_at
            )), '[]'::jsonb)
            FROM tasks t
            LEFT JOIN profiles pr ON pr.id = t.assignee_id
            WHERE t.foundry_id = v_foundry_id
                AND t.status IN ('Pending_Executive_Approval', 'Amended_Pending_Approval', 'Pending_Peer_Review')
        ),
        
        -- Trends (compare to yesterday)
        'trends', jsonb_build_object(
            'completed_yesterday', (
                SELECT COUNT(*)::INTEGER
                FROM task_history th
                JOIN tasks t ON t.id = th.task_id
                WHERE t.foundry_id = v_foundry_id
                    AND th.action_type = 'COMPLETED'
                    AND th.created_at::date = v_yesterday
            ),
            'personal_completed_yesterday', (
                SELECT COUNT(*)::INTEGER
                FROM task_history th
                WHERE th.user_id = p_profile_id
                    AND th.action_type = 'COMPLETED'
                    AND th.created_at::date = v_yesterday
            )
        ),
        
        -- Active objectives progress
        'objectives', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'id', o.id,
                'title', o.title,
                'progress', COALESCE(o.progress, 0),
                'status', o.status,
                'end_date', o.end_date,
                'tasks_completed_today', (
                    SELECT COUNT(*)::INTEGER
                    FROM task_history th
                    JOIN tasks t ON t.id = th.task_id
                    WHERE t.objective_id = o.id
                        AND th.action_type = 'COMPLETED'
                        AND th.created_at::date = p_date
                )
            )), '[]'::jsonb)
            FROM objectives o
            WHERE o.foundry_id = v_foundry_id
                AND o.status = 'In Progress'
            ORDER BY o.end_date ASC NULLS LAST
            LIMIT 5
        )
        
    ) INTO v_result;
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- Get Weekly Rollup Data
-- ===========================================

CREATE OR REPLACE FUNCTION get_weekly_rollup(
    p_foundry_id TEXT,
    p_week_start DATE DEFAULT date_trunc('week', CURRENT_DATE)::date
)
RETURNS JSONB AS $$
DECLARE
    v_week_end DATE := p_week_start + INTERVAL '6 days';
    v_prev_week_start DATE := p_week_start - INTERVAL '7 days';
    v_prev_week_end DATE := p_week_start - INTERVAL '1 day';
BEGIN
    RETURN jsonb_build_object(
        'period', jsonb_build_object(
            'start', p_week_start,
            'end', v_week_end,
            'week_number', EXTRACT(WEEK FROM p_week_start)::INTEGER
        ),
        
        -- This week's stats
        'stats', jsonb_build_object(
            'tasks_created', (
                SELECT COUNT(*)::INTEGER
                FROM task_history th
                JOIN tasks t ON t.id = th.task_id
                WHERE t.foundry_id = p_foundry_id
                    AND th.action_type = 'CREATED'
                    AND th.created_at::date BETWEEN p_week_start AND v_week_end
            ),
            'tasks_completed', (
                SELECT COUNT(*)::INTEGER
                FROM task_history th
                JOIN tasks t ON t.id = th.task_id
                WHERE t.foundry_id = p_foundry_id
                    AND th.action_type = 'COMPLETED'
                    AND th.created_at::date BETWEEN p_week_start AND v_week_end
            ),
            'blockers_reported', (
                SELECT COUNT(*)::INTEGER
                FROM standups
                WHERE foundry_id = p_foundry_id
                    AND standup_date BETWEEN p_week_start AND v_week_end
                    AND blockers IS NOT NULL
            ),
            'standup_submissions', (
                SELECT COUNT(*)::INTEGER
                FROM standups
                WHERE foundry_id = p_foundry_id
                    AND standup_date BETWEEN p_week_start AND v_week_end
            ),
            'avg_daily_completion', (
                SELECT ROUND(AVG(daily_count)::numeric, 1)
                FROM (
                    SELECT th.created_at::date, COUNT(*)::INTEGER as daily_count
                    FROM task_history th
                    JOIN tasks t ON t.id = th.task_id
                    WHERE t.foundry_id = p_foundry_id
                        AND th.action_type = 'COMPLETED'
                        AND th.created_at::date BETWEEN p_week_start AND v_week_end
                    GROUP BY th.created_at::date
                ) sub
            )
        ),
        
        -- Previous week stats for comparison
        'previous_week', jsonb_build_object(
            'tasks_completed', (
                SELECT COUNT(*)::INTEGER
                FROM task_history th
                JOIN tasks t ON t.id = th.task_id
                WHERE t.foundry_id = p_foundry_id
                    AND th.action_type = 'COMPLETED'
                    AND th.created_at::date BETWEEN v_prev_week_start AND v_prev_week_end
            ),
            'tasks_created', (
                SELECT COUNT(*)::INTEGER
                FROM task_history th
                JOIN tasks t ON t.id = th.task_id
                WHERE t.foundry_id = p_foundry_id
                    AND th.action_type = 'CREATED'
                    AND th.created_at::date BETWEEN v_prev_week_start AND v_prev_week_end
            )
        ),
        
        -- Top performers
        'top_completers', (
            SELECT COALESCE(jsonb_agg(row_to_json(x)), '[]'::jsonb)
            FROM (
                SELECT pr.id, pr.full_name, COUNT(*)::INTEGER as completed_count
                FROM task_history th
                JOIN tasks t ON t.id = th.task_id
                JOIN profiles pr ON pr.id = th.user_id
                WHERE t.foundry_id = p_foundry_id
                    AND th.action_type = 'COMPLETED'
                    AND th.created_at::date BETWEEN p_week_start AND v_week_end
                GROUP BY pr.id, pr.full_name
                ORDER BY completed_count DESC
                LIMIT 5
            ) x
        ),
        
        -- Objectives progress
        'objectives_progress', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'id', o.id,
                'title', o.title,
                'progress', COALESCE(o.progress, 0),
                'status', o.status,
                'tasks_completed_this_week', (
                    SELECT COUNT(*)::INTEGER
                    FROM task_history th
                    JOIN tasks t ON t.id = th.task_id
                    WHERE t.objective_id = o.id
                        AND th.action_type = 'COMPLETED'
                        AND th.created_at::date BETWEEN p_week_start AND v_week_end
                ),
                'tasks_remaining', (
                    SELECT COUNT(*)::INTEGER
                    FROM tasks t
                    WHERE t.objective_id = o.id
                        AND t.status NOT IN ('Completed', 'Rejected')
                )
            )), '[]'::jsonb)
            FROM objectives o
            WHERE o.foundry_id = p_foundry_id
                AND o.status IN ('In Progress', 'Not Started')
        ),
        
        -- Daily breakdown
        'daily_breakdown', (
            SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.date), '[]'::jsonb)
            FROM (
                SELECT 
                    d.date,
                    COALESCE(completed.count, 0)::INTEGER as completed,
                    COALESCE(created.count, 0)::INTEGER as created
                FROM generate_series(p_week_start, v_week_end, '1 day'::interval) d(date)
                LEFT JOIN (
                    SELECT th.created_at::date as date, COUNT(*) as count
                    FROM task_history th
                    JOIN tasks t ON t.id = th.task_id
                    WHERE t.foundry_id = p_foundry_id AND th.action_type = 'COMPLETED'
                    GROUP BY th.created_at::date
                ) completed ON completed.date = d.date::date
                LEFT JOIN (
                    SELECT th.created_at::date as date, COUNT(*) as count
                    FROM task_history th
                    JOIN tasks t ON t.id = th.task_id
                    WHERE t.foundry_id = p_foundry_id AND th.action_type = 'CREATED'
                    GROUP BY th.created_at::date
                ) created ON created.date = d.date::date
            ) x
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- Get Monthly Summary Data
-- ===========================================

CREATE OR REPLACE FUNCTION get_monthly_summary(
    p_foundry_id TEXT,
    p_month DATE DEFAULT date_trunc('month', CURRENT_DATE)::date
)
RETURNS JSONB AS $$
DECLARE
    v_month_end DATE := (p_month + INTERVAL '1 month' - INTERVAL '1 day')::date;
    v_prev_month DATE := (p_month - INTERVAL '1 month')::date;
    v_prev_month_end DATE := (p_month - INTERVAL '1 day')::date;
BEGIN
    RETURN jsonb_build_object(
        'period', jsonb_build_object(
            'start', p_month,
            'end', v_month_end,
            'month_name', to_char(p_month, 'Month YYYY')
        ),
        
        -- This month's stats
        'stats', jsonb_build_object(
            'tasks_created', (
                SELECT COUNT(*)::INTEGER
                FROM task_history th
                JOIN tasks t ON t.id = th.task_id
                WHERE t.foundry_id = p_foundry_id
                    AND th.action_type = 'CREATED'
                    AND th.created_at::date BETWEEN p_month AND v_month_end
            ),
            'tasks_completed', (
                SELECT COUNT(*)::INTEGER
                FROM task_history th
                JOIN tasks t ON t.id = th.task_id
                WHERE t.foundry_id = p_foundry_id
                    AND th.action_type = 'COMPLETED'
                    AND th.created_at::date BETWEEN p_month AND v_month_end
            ),
            'objectives_completed', (
                SELECT COUNT(*)::INTEGER
                FROM objectives
                WHERE foundry_id = p_foundry_id
                    AND status = 'Completed'
                    AND updated_at::date BETWEEN p_month AND v_month_end
            ),
            'objectives_started', (
                SELECT COUNT(*)::INTEGER
                FROM objectives
                WHERE foundry_id = p_foundry_id
                    AND created_at::date BETWEEN p_month AND v_month_end
            ),
            'avg_weekly_completion', (
                SELECT ROUND(AVG(weekly_count)::numeric, 1)
                FROM (
                    SELECT date_trunc('week', th.created_at)::date as week, COUNT(*) as weekly_count
                    FROM task_history th
                    JOIN tasks t ON t.id = th.task_id
                    WHERE t.foundry_id = p_foundry_id
                        AND th.action_type = 'COMPLETED'
                        AND th.created_at::date BETWEEN p_month AND v_month_end
                    GROUP BY date_trunc('week', th.created_at)
                ) sub
            )
        ),
        
        -- Previous month for comparison
        'previous_month', jsonb_build_object(
            'tasks_completed', (
                SELECT COUNT(*)::INTEGER
                FROM task_history th
                JOIN tasks t ON t.id = th.task_id
                WHERE t.foundry_id = p_foundry_id
                    AND th.action_type = 'COMPLETED'
                    AND th.created_at::date BETWEEN v_prev_month AND v_prev_month_end
            ),
            'tasks_created', (
                SELECT COUNT(*)::INTEGER
                FROM task_history th
                JOIN tasks t ON t.id = th.task_id
                WHERE t.foundry_id = p_foundry_id
                    AND th.action_type = 'CREATED'
                    AND th.created_at::date BETWEEN v_prev_month AND v_prev_month_end
            )
        ),
        
        -- Top contributors
        'top_contributors', (
            SELECT COALESCE(jsonb_agg(row_to_json(x)), '[]'::jsonb)
            FROM (
                SELECT pr.id, pr.full_name, pr.role, COUNT(*)::INTEGER as completed_count
                FROM task_history th
                JOIN tasks t ON t.id = th.task_id
                JOIN profiles pr ON pr.id = th.user_id
                WHERE t.foundry_id = p_foundry_id
                    AND th.action_type = 'COMPLETED'
                    AND th.created_at::date BETWEEN p_month AND v_month_end
                GROUP BY pr.id, pr.full_name, pr.role
                ORDER BY completed_count DESC
                LIMIT 10
            ) x
        ),
        
        -- Weekly breakdown
        'weekly_breakdown', (
            SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.week_start), '[]'::jsonb)
            FROM (
                SELECT 
                    date_trunc('week', th.created_at)::date as week_start,
                    COUNT(*) FILTER (WHERE th.action_type = 'COMPLETED')::INTEGER as completed,
                    COUNT(*) FILTER (WHERE th.action_type = 'CREATED')::INTEGER as created
                FROM task_history th
                JOIN tasks t ON t.id = th.task_id
                WHERE t.foundry_id = p_foundry_id
                    AND th.created_at::date BETWEEN p_month AND v_month_end
                GROUP BY date_trunc('week', th.created_at)
            ) x
        ),
        
        -- Objectives summary
        'objectives_summary', (
            SELECT jsonb_build_object(
                'total_active', COUNT(*) FILTER (WHERE status = 'In Progress'),
                'completed_this_month', COUNT(*) FILTER (WHERE status = 'Completed' AND updated_at::date BETWEEN p_month AND v_month_end),
                'at_risk', COUNT(*) FILTER (WHERE status = 'In Progress' AND COALESCE(progress, 0) < 50 AND end_date < CURRENT_DATE + INTERVAL '14 days')
            )
            FROM objectives
            WHERE foundry_id = p_foundry_id
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- Get Trend Data for Charts
-- ===========================================

CREATE OR REPLACE FUNCTION get_completion_trend(
    p_foundry_id TEXT,
    p_days INTEGER DEFAULT 14
)
RETURNS TABLE(date DATE, completed INTEGER, created INTEGER) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.date::date,
        COALESCE(c.completed, 0)::INTEGER,
        COALESCE(cr.created, 0)::INTEGER
    FROM generate_series(
        CURRENT_DATE - (p_days - 1),
        CURRENT_DATE,
        '1 day'::interval
    ) d(date)
    LEFT JOIN (
        SELECT th.created_at::date as dt, COUNT(*)::INTEGER as completed
        FROM task_history th
        JOIN tasks t ON t.id = th.task_id
        WHERE t.foundry_id = p_foundry_id
            AND th.action_type = 'COMPLETED'
            AND th.created_at >= CURRENT_DATE - p_days
        GROUP BY th.created_at::date
    ) c ON c.dt = d.date::date
    LEFT JOIN (
        SELECT th.created_at::date as dt, COUNT(*)::INTEGER as created
        FROM task_history th
        JOIN tasks t ON t.id = th.task_id
        WHERE t.foundry_id = p_foundry_id
            AND th.action_type = 'CREATED'
            AND th.created_at >= CURRENT_DATE - p_days
        GROUP BY th.created_at::date
    ) cr ON cr.dt = d.date::date
    ORDER BY d.date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- Triggers for updated_at
-- ===========================================

-- Use existing update_messaging_updated_at function from telegram integration
CREATE TRIGGER report_preferences_updated_at
    BEFORE UPDATE ON report_preferences
    FOR EACH ROW EXECUTE FUNCTION update_messaging_updated_at();

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_daily_pulse(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_weekly_rollup(TEXT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_monthly_summary(TEXT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_completion_trend(TEXT, INTEGER) TO authenticated;
