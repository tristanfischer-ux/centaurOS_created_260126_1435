-- Add Stripe-related columns for marketplace payments
-- Migration: 20260128210000_add_stripe_tables.sql
-- Note: stripe_events table is created in 20260128100001_marketplace_escrow.sql

-- Add stripe_account_id to profiles table for providers
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS stripe_account_id TEXT UNIQUE;

-- Create index for looking up profiles by Stripe account
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_account_id 
ON profiles(stripe_account_id) 
WHERE stripe_account_id IS NOT NULL;

-- Add updated_at column to stripe_events if it doesn't exist
-- (Table is created in marketplace_escrow migration)
ALTER TABLE stripe_events 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create trigger to update updated_at on stripe_events
CREATE OR REPLACE FUNCTION update_stripe_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS stripe_events_updated_at ON stripe_events;
CREATE TRIGGER stripe_events_updated_at
    BEFORE UPDATE ON stripe_events
    FOR EACH ROW
    EXECUTE FUNCTION update_stripe_events_updated_at();

-- Comment on profile stripe column
COMMENT ON COLUMN profiles.stripe_account_id IS 'Stripe Connect account ID for providers';
