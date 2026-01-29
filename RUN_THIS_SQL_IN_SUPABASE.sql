-- =============================================
-- COMPLETE DATABASE FIX
-- Run this entire file in Supabase Dashboard SQL Editor
-- =============================================

-- =============================================
-- 1. Add onboarding_data column to profiles
-- =============================================

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS onboarding_data JSONB DEFAULT '{}'::jsonb NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_onboarding_data 
ON public.profiles USING GIN(onboarding_data);

CREATE INDEX IF NOT EXISTS idx_profiles_marketplace_tour_incomplete 
ON public.profiles((onboarding_data->>'marketplace_tour_completed')) 
WHERE (onboarding_data->>'marketplace_tour_completed') IS NULL 
   OR (onboarding_data->>'marketplace_tour_completed')::boolean = false;

COMMENT ON COLUMN public.profiles.onboarding_data IS 
'Tracks user onboarding progress and first actions';

-- =============================================
-- 2. Create signup_intents table
-- =============================================

CREATE TABLE IF NOT EXISTS public.signup_intents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    intent_type TEXT NOT NULL,
    listing_id UUID REFERENCES public.marketplace_listings(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    fulfilled_at TIMESTAMPTZ DEFAULT NULL,
    
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

-- Indexes for signup_intents
CREATE INDEX IF NOT EXISTS idx_signup_intents_user_id 
ON public.signup_intents(user_id);

CREATE INDEX IF NOT EXISTS idx_signup_intents_listing_id 
ON public.signup_intents(listing_id) 
WHERE listing_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_signup_intents_type 
ON public.signup_intents(intent_type);

CREATE INDEX IF NOT EXISTS idx_signup_intents_unfulfilled 
ON public.signup_intents(user_id, created_at) 
WHERE fulfilled_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_signup_intents_user_created 
ON public.signup_intents(user_id, created_at DESC);

-- =============================================
-- 3. Enable Row Level Security
-- =============================================

ALTER TABLE public.signup_intents ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 4. Create RLS Policies for signup_intents
-- =============================================

DROP POLICY IF EXISTS "Users can view own signup intents" ON public.signup_intents;
CREATE POLICY "Users can view own signup intents" ON public.signup_intents
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own signup intents" ON public.signup_intents;
CREATE POLICY "Users can create own signup intents" ON public.signup_intents
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own signup intents" ON public.signup_intents;
CREATE POLICY "Users can update own signup intents" ON public.signup_intents
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage all signup intents" ON public.signup_intents;
CREATE POLICY "Service role can manage all signup intents" ON public.signup_intents
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- =============================================
-- 5. Add documentation comments
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
-- VERIFICATION QUERIES
-- =============================================

-- Verify profiles.onboarding_data column
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name = 'onboarding_data';

-- Verify signup_intents table
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'signup_intents'
ORDER BY ordinal_position;
