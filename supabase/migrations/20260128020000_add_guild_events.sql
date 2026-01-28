-- Add guild_events table for O2O networking events
CREATE TABLE IF NOT EXISTS guild_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT REFERENCES foundries(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    event_date TIMESTAMPTZ NOT NULL,
    location_geo TEXT,
    location_address TEXT,
    is_executive_only BOOLEAN NOT NULL DEFAULT FALSE,
    max_attendees INTEGER,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_guild_events_date ON guild_events(event_date);
CREATE INDEX IF NOT EXISTS idx_guild_events_foundry ON guild_events(foundry_id);
CREATE INDEX IF NOT EXISTS idx_guild_events_exec_only ON guild_events(is_executive_only);

-- Enable RLS
ALTER TABLE guild_events ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view non-executive events
CREATE POLICY "Users can view public guild events"
    ON guild_events FOR SELECT
    USING (
        is_executive_only = FALSE 
        OR EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role IN ('Executive', 'Founder')
        )
    );

-- Founders and Executives can create events
CREATE POLICY "Executives can create guild events"
    ON guild_events FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role IN ('Executive', 'Founder')
        )
    );

-- Creators and admins can update events
CREATE POLICY "Creators can update guild events"
    ON guild_events FOR UPDATE
    USING (
        created_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'Founder'
        )
    );

-- Creators and admins can delete events
CREATE POLICY "Creators can delete guild events"
    ON guild_events FOR DELETE
    USING (
        created_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'Founder'
        )
    );

-- Add some sample events
INSERT INTO guild_events (title, description, event_date, location_geo, is_executive_only) VALUES
    ('CentaurOS Community Meetup', 'Join fellow Centaurs for networking and knowledge sharing. All skill levels welcome!', NOW() + INTERVAL '7 days', 'San Francisco, CA', FALSE),
    ('Executive Leadership Summit', 'Strategic planning session for executives and founders. Deep dive into Q2 roadmap.', NOW() + INTERVAL '14 days', 'New York, NY', TRUE),
    ('AI Integration Workshop', 'Hands-on workshop covering best practices for human-AI collaboration.', NOW() + INTERVAL '21 days', 'Austin, TX', FALSE);
