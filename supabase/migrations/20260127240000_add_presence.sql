-- Add presence tracking for remote team coordination
-- This enables the Presence Agent to show who's online/available

-- Create presence status enum
CREATE TYPE public.presence_status AS ENUM ('online', 'away', 'focus', 'offline');

-- Create presence table
CREATE TABLE public.presence (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status public.presence_status NOT NULL DEFAULT 'offline',
    current_task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
    last_seen timestamptz NOT NULL DEFAULT now(),
    timezone text,
    availability_start time,
    availability_end time,
    focus_until timestamptz,
    status_message text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id)
);

-- Create index for fast lookups
CREATE INDEX idx_presence_user_id ON public.presence(user_id);
CREATE INDEX idx_presence_status ON public.presence(status);
CREATE INDEX idx_presence_last_seen ON public.presence(last_seen);

-- Enable RLS
ALTER TABLE public.presence ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view presence of users in same foundry
CREATE POLICY "Users can view presence in same foundry" ON public.presence
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p1, public.profiles p2
            WHERE p1.id = auth.uid()
            AND p2.id = presence.user_id
            AND p1.foundry_id = p2.foundry_id
        )
    );

-- Policy: Users can update their own presence
CREATE POLICY "Users can update own presence" ON public.presence
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Policy: Users can insert their own presence
CREATE POLICY "Users can insert own presence" ON public.presence
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Policy: Users can delete their own presence
CREATE POLICY "Users can delete own presence" ON public.presence
    FOR DELETE
    USING (user_id = auth.uid());

-- Function to update presence timestamp
CREATE OR REPLACE FUNCTION public.update_presence_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update timestamp
CREATE TRIGGER update_presence_updated_at
    BEFORE UPDATE ON public.presence
    FOR EACH ROW
    EXECUTE FUNCTION public.update_presence_timestamp();

-- Function to upsert presence (for heartbeat)
CREATE OR REPLACE FUNCTION public.upsert_presence(
    p_status public.presence_status DEFAULT 'online',
    p_current_task_id uuid DEFAULT NULL,
    p_timezone text DEFAULT NULL,
    p_status_message text DEFAULT NULL
)
RETURNS public.presence AS $$
DECLARE
    result public.presence;
BEGIN
    INSERT INTO public.presence (user_id, status, current_task_id, last_seen, timezone, status_message)
    VALUES (auth.uid(), p_status, p_current_task_id, now(), p_timezone, p_status_message)
    ON CONFLICT (user_id)
    DO UPDATE SET
        status = EXCLUDED.status,
        current_task_id = EXCLUDED.current_task_id,
        last_seen = now(),
        timezone = COALESCE(EXCLUDED.timezone, presence.timezone),
        status_message = EXCLUDED.status_message,
        updated_at = now()
    RETURNING * INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.upsert_presence TO authenticated;

-- Enable realtime for presence table
ALTER PUBLICATION supabase_realtime ADD TABLE public.presence;

COMMENT ON TABLE public.presence IS 'Tracks user presence status for remote team coordination';
COMMENT ON COLUMN public.presence.status IS 'Current presence status: online, away, focus, or offline';
COMMENT ON COLUMN public.presence.current_task_id IS 'Task the user is currently working on';
COMMENT ON COLUMN public.presence.focus_until IS 'When focus mode will end (null if not in focus mode)';
COMMENT ON COLUMN public.presence.availability_start IS 'Daily availability start time in user timezone';
COMMENT ON COLUMN public.presence.availability_end IS 'Daily availability end time in user timezone';
