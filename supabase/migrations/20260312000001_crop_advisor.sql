/**
 * @file Crop Planning Advisor — Database Schema
 *
 * @description Creates three tables for the two-sided crop planning feature:
 *   1. buyer_intent_signals — Buyers post future demand signals visible to growers
 *   2. buyer_intent_responses — Growers respond to buyer intents with offers
 *   3. crop_advisor_alerts — Deduplication for grower notifications
 *
 * @decision Uses foundry_id (not organisation_id) for multi-tenant isolation,
 *   consistent with the rest of ForgeOS.
 * @decision Uses TEXT columns for category/quality_grade/growing_method to stay
 *   consistent with the existing price_index table which also uses TEXT.
 */

-- ============================================================================
-- Table 1: buyer_intent_signals
-- Buyers post what they want to buy in the future — visible to growers.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.buyer_intent_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    quality_grade TEXT NOT NULL DEFAULT 'B',
    growing_method TEXT,
    weekly_quantity_kg DECIMAL(10,2) NOT NULL,
    desired_start_date DATE NOT NULL,
    desired_end_date DATE,
    target_price_per_kg DECIMAL(10,4),
    max_price_per_kg DECIMAL(10,4),
    is_public BOOLEAN NOT NULL DEFAULT true,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'fulfilled', 'withdrawn', 'expired')),
    notes TEXT,
    response_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for buyer_intent_signals
CREATE INDEX idx_buyer_intents_foundry ON public.buyer_intent_signals(foundry_id);
CREATE INDEX idx_buyer_intents_product ON public.buyer_intent_signals(product_id);
CREATE INDEX idx_buyer_intents_status ON public.buyer_intent_signals(status) WHERE status = 'active';
CREATE INDEX idx_buyer_intents_category ON public.buyer_intent_signals(category);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_buyer_intent_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_buyer_intent_updated_at
    BEFORE UPDATE ON public.buyer_intent_signals
    FOR EACH ROW
    EXECUTE FUNCTION update_buyer_intent_updated_at();

-- ============================================================================
-- Table 2: buyer_intent_responses
-- Growers respond to buyer intents with offers.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.buyer_intent_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    intent_id UUID NOT NULL REFERENCES public.buyer_intent_signals(id) ON DELETE CASCADE,
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    offered_price_per_kg DECIMAL(10,4) NOT NULL,
    offered_quantity_kg DECIMAL(10,2) NOT NULL,
    available_from DATE NOT NULL,
    growing_method TEXT,
    quality_grade TEXT NOT NULL DEFAULT 'B',
    message TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(intent_id, foundry_id)
);

-- Indexes for buyer_intent_responses
CREATE INDEX idx_intent_responses_intent ON public.buyer_intent_responses(intent_id);
CREATE INDEX idx_intent_responses_foundry ON public.buyer_intent_responses(foundry_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_intent_response_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_intent_response_updated_at
    BEFORE UPDATE ON public.buyer_intent_responses
    FOR EACH ROW
    EXECUTE FUNCTION update_intent_response_updated_at();

-- Increment response_count on the parent intent when a response is inserted
CREATE OR REPLACE FUNCTION increment_intent_response_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.buyer_intent_signals
    SET response_count = response_count + 1
    WHERE id = NEW.intent_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_increment_response_count
    AFTER INSERT ON public.buyer_intent_responses
    FOR EACH ROW
    EXECUTE FUNCTION increment_intent_response_count();

-- ============================================================================
-- Table 3: crop_advisor_alerts
-- Deduplication for grower notifications (prevents repeat alerts).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.crop_advisor_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    alert_type TEXT NOT NULL
        CHECK (alert_type IN ('high_opportunity', 'new_intent', 'price_surge')),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    alert_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(foundry_id, alert_key)
);

CREATE INDEX idx_crop_alerts_foundry ON public.crop_advisor_alerts(foundry_id);

-- ============================================================================
-- RLS Policies
-- ============================================================================

-- Enable RLS on all three tables
ALTER TABLE public.buyer_intent_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_intent_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crop_advisor_alerts ENABLE ROW LEVEL SECURITY;

-- buyer_intent_signals: Buyers manage own intents, everyone sees active+public
CREATE POLICY "select_active_public_intents" ON public.buyer_intent_signals
    FOR SELECT USING (
        (is_public = true AND status = 'active')
        OR profile_id = auth.uid()
    );

CREATE POLICY "insert_own_intents" ON public.buyer_intent_signals
    FOR INSERT WITH CHECK (profile_id = auth.uid());

CREATE POLICY "update_own_intents" ON public.buyer_intent_signals
    FOR UPDATE USING (profile_id = auth.uid())
    WITH CHECK (profile_id = auth.uid());

CREATE POLICY "delete_own_intents" ON public.buyer_intent_signals
    FOR DELETE USING (profile_id = auth.uid());

-- buyer_intent_responses: Growers manage own responses, buyers see responses to their intents
CREATE POLICY "select_intent_responses" ON public.buyer_intent_responses
    FOR SELECT USING (
        profile_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.buyer_intent_signals
            WHERE id = buyer_intent_responses.intent_id
            AND profile_id = auth.uid()
        )
    );

CREATE POLICY "insert_own_responses" ON public.buyer_intent_responses
    FOR INSERT WITH CHECK (profile_id = auth.uid());

CREATE POLICY "update_own_responses" ON public.buyer_intent_responses
    FOR UPDATE USING (profile_id = auth.uid())
    WITH CHECK (profile_id = auth.uid());

-- Buyers can also update responses to their intents (accept/decline)
CREATE POLICY "buyer_update_responses" ON public.buyer_intent_responses
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.buyer_intent_signals
            WHERE id = buyer_intent_responses.intent_id
            AND profile_id = auth.uid()
        )
    );

-- crop_advisor_alerts: scoped to own foundry
CREATE POLICY "select_own_alerts" ON public.crop_advisor_alerts
    FOR SELECT USING (
        foundry_id IN (
            SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "insert_own_alerts" ON public.crop_advisor_alerts
    FOR INSERT WITH CHECK (
        foundry_id IN (
            SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
        )
    );
