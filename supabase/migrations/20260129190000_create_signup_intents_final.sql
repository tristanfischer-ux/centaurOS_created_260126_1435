-- Create signup_intents table (idempotent)
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_signup_intents_user_id ON public.signup_intents(user_id);
CREATE INDEX IF NOT EXISTS idx_signup_intents_listing_id ON public.signup_intents(listing_id) WHERE listing_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_signup_intents_type ON public.signup_intents(intent_type);
CREATE INDEX IF NOT EXISTS idx_signup_intents_unfulfilled ON public.signup_intents(user_id, created_at) WHERE fulfilled_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_signup_intents_user_created ON public.signup_intents(user_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.signup_intents ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view own signup intents" ON public.signup_intents;
CREATE POLICY "Users can view own signup intents" ON public.signup_intents FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own signup intents" ON public.signup_intents;
CREATE POLICY "Users can create own signup intents" ON public.signup_intents FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own signup intents" ON public.signup_intents;
CREATE POLICY "Users can update own signup intents" ON public.signup_intents FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage all signup intents" ON public.signup_intents;
CREATE POLICY "Service role can manage all signup intents" ON public.signup_intents FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
