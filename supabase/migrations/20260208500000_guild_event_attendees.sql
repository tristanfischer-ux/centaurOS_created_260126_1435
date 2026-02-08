-- Guild Event Attendees + Event Enhancement Migration
-- Adds RSVP/attendance tracking and event type classification

-- ==========================================
-- Step 1: Add new columns to guild_events
-- ==========================================

-- Event type classification
ALTER TABLE guild_events
ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'meetup'
    CHECK (event_type IN ('speed_networking', 'workshop', 'career_fair', 'meetup', 'summit'));

-- Event format (in-person, online, hybrid)
ALTER TABLE guild_events
ADD COLUMN IF NOT EXISTS event_format TEXT NOT NULL DEFAULT 'in_person'
    CHECK (event_format IN ('in_person', 'online', 'hybrid'));

-- URL for online/hybrid events
ALTER TABLE guild_events
ADD COLUMN IF NOT EXISTS event_url TEXT;

-- Index on event_type for filtered queries
CREATE INDEX IF NOT EXISTS idx_guild_events_type ON guild_events(event_type);

-- ==========================================
-- Step 2: Create event_attendees table
-- ==========================================

CREATE TABLE IF NOT EXISTS event_attendees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES guild_events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'going'
        CHECK (status IN ('going', 'maybe', 'cancelled')),
    checked_in_at TIMESTAMPTZ,
    rsvp_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One RSVP per user per event
    UNIQUE (event_id, user_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_event_attendees_event ON event_attendees(event_id);
CREATE INDEX IF NOT EXISTS idx_event_attendees_user ON event_attendees(user_id);
CREATE INDEX IF NOT EXISTS idx_event_attendees_status ON event_attendees(status);

-- ==========================================
-- Step 3: RLS Policies for event_attendees
-- ==========================================

ALTER TABLE event_attendees ENABLE ROW LEVEL SECURITY;

-- AUTH: All authenticated users can see who's attending public events
CREATE POLICY "Users can view event attendees"
    ON event_attendees FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM guild_events ge
            WHERE ge.id = event_attendees.event_id
            AND (
                ge.is_executive_only = FALSE
                OR EXISTS (
                    SELECT 1 FROM profiles
                    WHERE profiles.id = auth.uid()
                    AND profiles.role IN ('Executive', 'Founder')
                )
            )
        )
    );

-- AUTH: Users can RSVP to events they can see
CREATE POLICY "Users can RSVP to events"
    ON event_attendees FOR INSERT
    WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM guild_events ge
            WHERE ge.id = event_attendees.event_id
            AND (
                ge.is_executive_only = FALSE
                OR EXISTS (
                    SELECT 1 FROM profiles
                    WHERE profiles.id = auth.uid()
                    AND profiles.role IN ('Executive', 'Founder')
                )
            )
        )
    );

-- AUTH: Users can update their own RSVP status
CREATE POLICY "Users can update own RSVP"
    ON event_attendees FOR UPDATE
    USING (user_id = auth.uid());

-- AUTH: Users can cancel their own RSVP
CREATE POLICY "Users can delete own RSVP"
    ON event_attendees FOR DELETE
    USING (user_id = auth.uid());

-- ==========================================
-- Step 4: Update sample events with types
-- ==========================================

UPDATE guild_events SET event_type = 'meetup', event_format = 'in_person'
WHERE title = 'CentaurOS Community Meetup';

UPDATE guild_events SET event_type = 'summit', event_format = 'in_person'
WHERE title = 'Executive Leadership Summit';

UPDATE guild_events SET event_type = 'workshop', event_format = 'in_person'
WHERE title = 'AI Integration Workshop';
