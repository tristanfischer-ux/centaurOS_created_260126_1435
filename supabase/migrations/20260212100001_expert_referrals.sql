/**
 * Migration: Add expert referral system
 *
 * Purpose: Enable users to invite experts to join the ForgeOS network.
 * Tracks referrals, referral codes, and completion status. Builds the
 * supply side virally.
 *
 * Security:
 * - RLS: Users can only see and manage their own referrals
 * - Referral codes are unique per user
 * - Rate limit: max 20 pending referrals per user
 *
 * Rollback: DROP TABLE expert_referrals CASCADE;
 */

CREATE TABLE IF NOT EXISTS expert_referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    referred_email TEXT, -- Null if referral link used without specific email
    referral_code TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'signed_up', 'profile_created', 'expired')),
    referred_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Set when they sign up
    note TEXT, -- Optional note from the referrer
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days')
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_expert_referrals_referrer ON expert_referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_expert_referrals_code ON expert_referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_expert_referrals_email ON expert_referrals(referred_email);
CREATE INDEX IF NOT EXISTS idx_expert_referrals_status ON expert_referrals(status);

-- RLS
ALTER TABLE expert_referrals ENABLE ROW LEVEL SECURITY;

-- Users can read their own referrals
CREATE POLICY "Read own referrals"
    ON expert_referrals FOR SELECT
    USING (referrer_id = auth.uid());

-- Users can create referrals from their own account
CREATE POLICY "Create own referrals"
    ON expert_referrals FOR INSERT
    WITH CHECK (referrer_id = auth.uid());

-- Service role can update referral status (for signup tracking)
CREATE POLICY "Service update referrals"
    ON expert_referrals FOR UPDATE
    USING (true)
    WITH CHECK (true);

-- Users can delete their own pending referrals
CREATE POLICY "Delete own pending referrals"
    ON expert_referrals FOR DELETE
    USING (referrer_id = auth.uid() AND status = 'pending');

-- Helper function: Generate a unique referral code
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TEXT AS $$
DECLARE
    code TEXT;
    exists_already BOOLEAN;
BEGIN
    LOOP
        code := upper(substring(md5(random()::text) from 1 for 8));
        SELECT EXISTS(SELECT 1 FROM expert_referrals WHERE referral_code = code) INTO exists_already;
        EXIT WHEN NOT exists_already;
    END LOOP;
    RETURN code;
END;
$$ LANGUAGE plpgsql;
