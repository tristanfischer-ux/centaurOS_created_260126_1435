-- Telegram Integration for CentaurOS
-- Enables users to send messages/voice notes via Telegram to create objectives

-- Table to link messaging accounts (Telegram) to CentaurOS profiles
CREATE TABLE IF NOT EXISTS messaging_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    foundry_id TEXT NOT NULL REFERENCES foundries(id) ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('telegram', 'whatsapp')),
    platform_user_id TEXT NOT NULL, -- Telegram chat_id
    platform_username TEXT, -- Telegram username (optional)
    verified_at TIMESTAMPTZ,
    verification_code TEXT, -- One-time code for linking
    verification_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(platform, platform_user_id) -- Only one CentaurOS account per Telegram user
);

-- Table to store pending objective drafts awaiting user confirmation
CREATE TABLE IF NOT EXISTS pending_intents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    foundry_id TEXT NOT NULL REFERENCES foundries(id) ON DELETE CASCADE,
    messaging_link_id UUID REFERENCES messaging_links(id) ON DELETE SET NULL,
    platform TEXT NOT NULL,
    platform_user_id TEXT NOT NULL,
    platform_message_id TEXT, -- Original message ID for reference
    original_message TEXT NOT NULL,
    transcribed_text TEXT, -- If voice, this is the transcription
    parsed_objective JSONB NOT NULL, -- {title, description, tasks[]}
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected', 'expired', 'editing')),
    confirmation_message_id TEXT, -- Bot's confirmation message ID (for updating)
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ DEFAULT (now() + interval '24 hours')
);

-- Indexes for performance
CREATE INDEX idx_messaging_links_profile ON messaging_links(profile_id);
CREATE INDEX idx_messaging_links_platform_user ON messaging_links(platform, platform_user_id);
CREATE INDEX idx_messaging_links_verification ON messaging_links(verification_code) WHERE verification_code IS NOT NULL;

CREATE INDEX idx_pending_intents_profile ON pending_intents(profile_id);
CREATE INDEX idx_pending_intents_platform_user ON pending_intents(platform, platform_user_id);
CREATE INDEX idx_pending_intents_status ON pending_intents(status) WHERE status = 'pending';

-- RLS Policies
ALTER TABLE messaging_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_intents ENABLE ROW LEVEL SECURITY;

-- Users can view/manage their own messaging links
CREATE POLICY "Users can view own messaging links"
    ON messaging_links FOR SELECT
    USING (profile_id = auth.uid());

CREATE POLICY "Users can insert own messaging links"
    ON messaging_links FOR INSERT
    WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Users can update own messaging links"
    ON messaging_links FOR UPDATE
    USING (profile_id = auth.uid());

CREATE POLICY "Users can delete own messaging links"
    ON messaging_links FOR DELETE
    USING (profile_id = auth.uid());

-- Users can view/manage their own pending intents
CREATE POLICY "Users can view own pending intents"
    ON pending_intents FOR SELECT
    USING (profile_id = auth.uid());

CREATE POLICY "Users can update own pending intents"
    ON pending_intents FOR UPDATE
    USING (profile_id = auth.uid());

-- Service role bypass for bot operations (webhook needs to insert/update)
-- Note: Webhook will use service role key

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_messaging_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER messaging_links_updated_at
    BEFORE UPDATE ON messaging_links
    FOR EACH ROW EXECUTE FUNCTION update_messaging_updated_at();

CREATE TRIGGER pending_intents_updated_at
    BEFORE UPDATE ON pending_intents
    FOR EACH ROW EXECUTE FUNCTION update_messaging_updated_at();

-- Function to clean up expired intents (can be called via cron)
CREATE OR REPLACE FUNCTION cleanup_expired_intents()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    WITH deleted AS (
        DELETE FROM pending_intents
        WHERE status = 'pending' AND expires_at < now()
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
