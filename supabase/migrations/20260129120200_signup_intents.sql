-- =============================================
-- MIGRATION: Signup Intents Tracking
-- =============================================
-- This migration creates a signup_intents table to track user intents
-- captured during signup (e.g., booking a specific service from the join page).

-- =============================================
-- 1. Create signup_intents table
-- =============================================

CREATE TABLE IF NOT EXISTS public.signup_intents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    intent_type TEXT NOT NULL,
    listing_id UUID REFERENCES public.marketplace_listings(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    fulfilled_at TIMESTAMPTZ DEFAULT NULL,
    
    -- Constraints
    CONSTRAINT valid_intent_type CHECK (
        intent_type IN (
            'book_listing',
            'view_listing',
            'contact_provider',
            'explore_marketplace',
            'join_guild',
            'create_rfq',
            'other'
        )
    )
);

-- =============================================
-- 2. Create indexes for performance
-- =============================================

-- Index on user_id for fast lookups by user
CREATE INDEX IF NOT EXISTS idx_signup_intents_user_id 
ON public.signup_intents(user_id);

-- Index on listing_id for provider analytics
CREATE INDEX IF NOT EXISTS idx_signup_intents_listing_id 
ON public.signup_intents(listing_id) 
WHERE listing_id IS NOT NULL;

-- Index on intent_type for analytics
CREATE INDEX IF NOT EXISTS idx_signup_intents_type 
ON public.signup_intents(intent_type);

-- Index on unfulfilled intents for reminder campaigns
CREATE INDEX IF NOT EXISTS idx_signup_intents_unfulfilled 
ON public.signup_intents(user_id, created_at) 
WHERE fulfilled_at IS NULL;

-- Composite index for user intent history
CREATE INDEX IF NOT EXISTS idx_signup_intents_user_created 
ON public.signup_intents(user_id, created_at DESC);

-- =============================================
-- 3. Enable Row Level Security (RLS)
-- =============================================

ALTER TABLE public.signup_intents ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 4. Create RLS Policies
-- =============================================

-- Users can view their own signup intents
DROP POLICY IF EXISTS "Users can view own signup intents" ON public.signup_intents;
CREATE POLICY "Users can view own signup intents" ON public.signup_intents
    FOR SELECT USING (
        auth.uid() = user_id
    );

-- Users can insert their own signup intents
DROP POLICY IF EXISTS "Users can create own signup intents" ON public.signup_intents;
CREATE POLICY "Users can create own signup intents" ON public.signup_intents
    FOR INSERT WITH CHECK (
        auth.uid() = user_id
    );

-- Users can update their own signup intents (e.g., mark as fulfilled)
DROP POLICY IF EXISTS "Users can update own signup intents" ON public.signup_intents;
CREATE POLICY "Users can update own signup intents" ON public.signup_intents
    FOR UPDATE USING (
        auth.uid() = user_id
    ) WITH CHECK (
        auth.uid() = user_id
    );

-- Service role can manage all intents for admin operations and analytics
DROP POLICY IF EXISTS "Service role can manage all signup intents" ON public.signup_intents;
CREATE POLICY "Service role can manage all signup intents" ON public.signup_intents
    FOR ALL USING (
        auth.role() = 'service_role'
    ) WITH CHECK (
        auth.role() = 'service_role'
    );

-- =============================================
-- 5. Add comments for documentation
-- =============================================

COMMENT ON TABLE public.signup_intents IS 
'Tracks user intents captured during signup flow, enabling personalized onboarding and conversion analytics.';

COMMENT ON COLUMN public.signup_intents.user_id IS 
'User who expressed the intent during signup';

COMMENT ON COLUMN public.signup_intents.intent_type IS 
'Type of intent: book_listing, view_listing, contact_provider, explore_marketplace, join_guild, create_rfq, other';

COMMENT ON COLUMN public.signup_intents.listing_id IS 
'Marketplace listing associated with the intent (if applicable)';

COMMENT ON COLUMN public.signup_intents.metadata IS 
'Additional context about the intent (e.g., referral source, campaign ID, selected options)';

COMMENT ON COLUMN public.signup_intents.fulfilled_at IS 
'Timestamp when the intent was fulfilled (e.g., booking completed, listing viewed)';

-- =============================================
-- 6. Example queries for reference
-- =============================================

-- Get unfulfilled intents for a user:
-- SELECT * FROM signup_intents WHERE user_id = auth.uid() AND fulfilled_at IS NULL ORDER BY created_at DESC;

-- Get all booking intents for analytics:
-- SELECT * FROM signup_intents WHERE intent_type = 'book_listing' ORDER BY created_at DESC;

-- Mark an intent as fulfilled:
-- UPDATE signup_intents SET fulfilled_at = now() WHERE id = '<intent_id>' AND user_id = auth.uid();

-- Get conversion rate by intent type:
-- SELECT 
--   intent_type,
--   COUNT(*) as total,
--   COUNT(fulfilled_at) as fulfilled,
--   ROUND(COUNT(fulfilled_at)::numeric / COUNT(*)::numeric * 100, 2) as conversion_rate
-- FROM signup_intents
-- GROUP BY intent_type;
