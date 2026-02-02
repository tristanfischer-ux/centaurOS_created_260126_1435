-- Fix Daily Pulse ORDER BY issue with jsonb_agg

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
    SELECT foundry_id INTO v_foundry_id FROM profiles WHERE id = p_profile_id;
    
    IF v_foundry_id IS NULL THEN
        RETURN jsonb_build_object('error', 'User has no foundry');
    END IF;
    
    SELECT jsonb_build_object(
        'date', p_date,
        'foundry_id', v_foundry_id,
        
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
        
        -- FIXED: Order in subquery to avoid GROUP BY error
        'objectives', (
            SELECT COALESCE(jsonb_agg(obj_data), '[]'::jsonb)
            FROM (
                SELECT jsonb_build_object(
                    'id', o.id,
                    'title', o.title,
                    'progress', COALESCE(o.progress, 0),
                    'status', o.status,
                    'tasks_completed_today', (
                        SELECT COUNT(*)::INTEGER
                        FROM task_history th
                        JOIN tasks t ON t.id = th.task_id
                        WHERE t.objective_id = o.id
                            AND th.action_type = 'COMPLETED'
                            AND th.created_at::date = p_date
                    )
                ) as obj_data
                FROM objectives o
                WHERE o.foundry_id = v_foundry_id
                    AND o.status = 'In Progress'
                ORDER BY o.updated_at DESC NULLS LAST
                LIMIT 5
            ) subq
        )
        
    ) INTO v_result;
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
