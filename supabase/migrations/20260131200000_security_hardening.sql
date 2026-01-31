-- =====================================================
-- Security Hardening Migration
-- Fixes RLS recursive subquery issues and adds rate limiting table
-- =====================================================

-- 1. Create rate_limits table for distributed rate limiting
CREATE TABLE IF NOT EXISTS public.rate_limits (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    key text NOT NULL UNIQUE,
    count integer DEFAULT 1,
    window_start timestamptz DEFAULT now(),
    window_end timestamptz NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_end ON public.rate_limits(window_end);
CREATE INDEX IF NOT EXISTS idx_rate_limits_key ON public.rate_limits(key);

-- No RLS on rate_limits - it's accessed via service role only

-- 2. Create atomic rate limit check function
CREATE OR REPLACE FUNCTION public.check_rate_limit(
    p_key text,
    p_limit integer,
    p_window_start timestamptz,
    p_now timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result jsonb;
    v_count integer;
    v_reset_at timestamptz;
    v_window_ms integer := EXTRACT(EPOCH FROM (p_now - p_window_start)) * 1000;
BEGIN
    -- Clean up old entries
    DELETE FROM public.rate_limits 
    WHERE window_end < p_now;
    
    -- Try to insert or update atomically
    INSERT INTO public.rate_limits (key, count, window_start, window_end)
    VALUES (p_key, 1, p_now, p_now + (v_window_ms || ' milliseconds')::interval)
    ON CONFLICT (key) DO UPDATE SET
        count = CASE 
            WHEN rate_limits.window_end < p_now THEN 1  -- Reset if expired
            ELSE rate_limits.count + 1
        END,
        window_start = CASE 
            WHEN rate_limits.window_end < p_now THEN p_now
            ELSE rate_limits.window_start
        END,
        window_end = CASE 
            WHEN rate_limits.window_end < p_now THEN p_now + (v_window_ms || ' milliseconds')::interval
            ELSE rate_limits.window_end
        END,
        updated_at = p_now
    RETURNING count, window_end INTO v_count, v_reset_at;
    
    -- Return result
    IF v_count > p_limit THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'count', v_count,
            'reset_at', v_reset_at
        );
    ELSE
        RETURN jsonb_build_object(
            'allowed', true,
            'count', v_count,
            'reset_at', v_reset_at
        );
    END IF;
END;
$$;

-- 3. Add processing_started_at column to stripe_events for race condition prevention
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'stripe_events' 
        AND column_name = 'processing_started_at'
    ) THEN
        ALTER TABLE public.stripe_events 
        ADD COLUMN processing_started_at timestamptz;
    END IF;
END $$;

-- 4. Fix Advisory Forum RLS policies to use get_my_foundry_id() instead of recursive subquery
-- Only modify if tables exist
DO $$ 
BEGIN
    -- Advisory Questions (uses asked_by column, not author_id)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'advisory_questions') THEN
        DROP POLICY IF EXISTS "Users can view questions in their foundry" ON public.advisory_questions;
        DROP POLICY IF EXISTS "Users can create questions in their foundry" ON public.advisory_questions;
        DROP POLICY IF EXISTS "Users can update their own questions" ON public.advisory_questions;
        DROP POLICY IF EXISTS "view_questions" ON public.advisory_questions;
        DROP POLICY IF EXISTS "insert_questions" ON public.advisory_questions;
        DROP POLICY IF EXISTS "update_own_questions" ON public.advisory_questions;
        
        CREATE POLICY "Users can view questions in their foundry" ON public.advisory_questions
            FOR SELECT USING (foundry_id = get_my_foundry_id() OR visibility = 'network');
        CREATE POLICY "Users can create questions in their foundry" ON public.advisory_questions
            FOR INSERT WITH CHECK (foundry_id = get_my_foundry_id());
        CREATE POLICY "Users can update their own questions" ON public.advisory_questions
            FOR UPDATE USING (asked_by = auth.uid() AND foundry_id = get_my_foundry_id());
    END IF;
    
    -- Advisory Answers (uses author_id and needs question's foundry_id via join)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'advisory_answers') THEN
        DROP POLICY IF EXISTS "Users can view answers in their foundry" ON public.advisory_answers;
        DROP POLICY IF EXISTS "Users can create answers in their foundry" ON public.advisory_answers;
        DROP POLICY IF EXISTS "Users can update their own answers" ON public.advisory_answers;
        DROP POLICY IF EXISTS "view_answers" ON public.advisory_answers;
        DROP POLICY IF EXISTS "insert_answers" ON public.advisory_answers;
        DROP POLICY IF EXISTS "update_own_answers" ON public.advisory_answers;
        
        -- Advisory answers don't have foundry_id directly, they inherit from question
        CREATE POLICY "Users can view answers" ON public.advisory_answers
            FOR SELECT USING (
                EXISTS (
                    SELECT 1 FROM public.advisory_questions q 
                    WHERE q.id = question_id 
                    AND (q.foundry_id = get_my_foundry_id() OR q.visibility = 'network')
                )
            );
        CREATE POLICY "Users can create answers" ON public.advisory_answers
            FOR INSERT WITH CHECK (
                EXISTS (
                    SELECT 1 FROM public.advisory_questions q 
                    WHERE q.id = question_id 
                    AND (q.foundry_id = get_my_foundry_id() OR q.visibility = 'network')
                )
            );
        CREATE POLICY "Users can update their own answers" ON public.advisory_answers
            FOR UPDATE USING (author_id = auth.uid());
    END IF;
    
    -- Advisory Endorsements (if table exists)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'advisory_endorsements') THEN
        DROP POLICY IF EXISTS "Users can view endorsements in their foundry" ON public.advisory_endorsements;
        DROP POLICY IF EXISTS "Users can create endorsements in their foundry" ON public.advisory_endorsements;
        
        -- Endorsements have foundry_id, use it directly
        CREATE POLICY "Users can view endorsements in their foundry" ON public.advisory_endorsements
            FOR SELECT USING (foundry_id = get_my_foundry_id());
        CREATE POLICY "Users can create endorsements in their foundry" ON public.advisory_endorsements
            FOR INSERT WITH CHECK (foundry_id = get_my_foundry_id());
    END IF;
END $$;

-- 5. Fix Business Functions RLS policies (only if tables exist)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'business_functions') THEN
        DROP POLICY IF EXISTS "Users can view business functions in their foundry" ON public.business_functions;
        DROP POLICY IF EXISTS "Executives can manage business functions" ON public.business_functions;
        DROP POLICY IF EXISTS "Authenticated users can view business functions" ON public.business_functions;
        
        CREATE POLICY "Authenticated users can view business functions" ON public.business_functions
            FOR SELECT USING (auth.role() = 'authenticated');
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'business_function_skills') THEN
        DROP POLICY IF EXISTS "Users can view skills in their foundry" ON public.business_function_skills;
        DROP POLICY IF EXISTS "Executives can manage skills" ON public.business_function_skills;
        DROP POLICY IF EXISTS "Authenticated users can view business function skills" ON public.business_function_skills;
        
        CREATE POLICY "Authenticated users can view business function skills" ON public.business_function_skills
            FOR SELECT USING (auth.role() = 'authenticated');
    END IF;
END $$;

-- 6. Fix task_files INSERT policy to verify foundry_id (only if table exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'task_files') THEN
        DROP POLICY IF EXISTS "Users can insert task files" ON public.task_files;
        
        CREATE POLICY "Users can insert task files" ON public.task_files
            FOR INSERT WITH CHECK (
                uploaded_by = auth.uid() AND
                EXISTS (
                    SELECT 1 FROM public.tasks 
                    WHERE tasks.id = task_files.task_id 
                    AND tasks.foundry_id = get_my_foundry_id()
                )
            );
    END IF;
END $$;

-- 7. Fix notifications INSERT policy (only if table exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notifications') THEN
        DROP POLICY IF EXISTS "Users can create notifications for their foundry" ON public.notifications;
    END IF;
END $$;

-- Use SECURITY DEFINER function for safe notification creation
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
AS $$
DECLARE
    v_foundry_id text;
    v_notification_id uuid;
BEGIN
    -- Get the target user's foundry_id
    SELECT foundry_id INTO v_foundry_id 
    FROM public.profiles 
    WHERE id = p_user_id;
    
    IF v_foundry_id IS NULL THEN
        RAISE EXCEPTION 'User not found or has no foundry';
    END IF;
    
    -- Insert the notification
    INSERT INTO public.notifications (
        user_id, foundry_id, title, body, priority, action_url, metadata
    ) VALUES (
        p_user_id, v_foundry_id, p_title, p_body, p_priority, p_action_url, p_metadata
    ) RETURNING id INTO v_notification_id;
    
    RETURN v_notification_id;
END;
$$;

-- 8. Grant execute on new functions
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_notification_safe(uuid, text, text, text, text, jsonb) TO authenticated;

-- 9. Add comment for documentation
COMMENT ON TABLE public.rate_limits IS 'Distributed rate limiting table for API and action throttling';
COMMENT ON FUNCTION public.check_rate_limit IS 'Atomically checks and increments rate limit counter';
COMMENT ON FUNCTION public.create_notification_safe IS 'Safely creates notifications with proper foundry_id lookup';
