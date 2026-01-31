-- =============================================
-- MIGRATION: Billing System Enhancements
-- =============================================
-- Adds comprehensive billing features including:
-- 1. Saved payment methods (Stripe Customer)
-- 2. Role-based fee tiers
-- 3. Credit balance / wallet system
-- 4. Payment retry tracking
-- 5. Multi-currency preferences
-- 6. Payout preferences

-- =============================================
-- SECTION 1: STRIPE CUSTOMERS & SAVED PAYMENT METHODS
-- =============================================

-- Add stripe_customer_id to profiles for saved payment methods
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id 
ON profiles(stripe_customer_id) 
WHERE stripe_customer_id IS NOT NULL;

COMMENT ON COLUMN profiles.stripe_customer_id IS 'Stripe Customer ID for saved payment methods (buyers)';

-- Saved payment methods table
CREATE TABLE IF NOT EXISTS public.saved_payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    stripe_payment_method_id TEXT NOT NULL UNIQUE,
    card_brand TEXT, -- visa, mastercard, amex, etc.
    card_last_four TEXT,
    card_exp_month INTEGER,
    card_exp_year INTEGER,
    is_default BOOLEAN DEFAULT FALSE,
    billing_name TEXT,
    billing_email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_payment_methods_user_id ON public.saved_payment_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_payment_methods_default ON public.saved_payment_methods(user_id, is_default) WHERE is_default = TRUE;

-- Trigger to ensure only one default payment method per user
CREATE OR REPLACE FUNCTION public.ensure_single_default_payment_method()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_default = TRUE THEN
        UPDATE public.saved_payment_methods
        SET is_default = FALSE, updated_at = NOW()
        WHERE user_id = NEW.user_id AND id != NEW.id AND is_default = TRUE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_ensure_single_default_payment_method ON public.saved_payment_methods;
CREATE TRIGGER trigger_ensure_single_default_payment_method
    BEFORE INSERT OR UPDATE OF is_default ON public.saved_payment_methods
    FOR EACH ROW
    WHEN (NEW.is_default = TRUE)
    EXECUTE FUNCTION public.ensure_single_default_payment_method();

-- =============================================
-- SECTION 2: ROLE-BASED FEE CONFIGURATION
-- =============================================

-- Fee configuration table
CREATE TABLE IF NOT EXISTS public.platform_fee_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role TEXT NOT NULL CHECK (role IN ('executive', 'founder', 'apprentice', 'default')),
    order_type TEXT NOT NULL CHECK (order_type IN ('people_booking', 'product_rfq', 'service', 'retainer', 'default')),
    fee_percent DECIMAL(5, 2) NOT NULL CHECK (fee_percent >= 0 AND fee_percent <= 100),
    min_fee_amount INTEGER DEFAULT 0, -- in smallest currency unit
    max_fee_amount INTEGER, -- null means no max
    effective_from TIMESTAMPTZ DEFAULT NOW(),
    effective_until TIMESTAMPTZ, -- null means currently active
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(role, order_type, effective_from)
);

-- Insert default fee configuration
INSERT INTO public.platform_fee_config (role, order_type, fee_percent) VALUES
    ('default', 'default', 8.00),
    ('default', 'retainer', 10.00),
    ('executive', 'default', 8.00),
    ('executive', 'retainer', 10.00),
    ('founder', 'default', 8.00),
    ('founder', 'retainer', 10.00),
    ('apprentice', 'default', 5.00), -- Lower fee for apprentices to encourage hiring
    ('apprentice', 'retainer', 7.00)
ON CONFLICT DO NOTHING;

-- Function to get applicable fee for a transaction
CREATE OR REPLACE FUNCTION public.get_platform_fee_percent(
    p_role TEXT DEFAULT 'default',
    p_order_type TEXT DEFAULT 'default'
)
RETURNS DECIMAL(5, 2) AS $$
DECLARE
    v_fee DECIMAL(5, 2);
BEGIN
    -- Try exact match first
    SELECT fee_percent INTO v_fee
    FROM public.platform_fee_config
    WHERE role = p_role 
      AND order_type = p_order_type
      AND (effective_until IS NULL OR effective_until > NOW())
    ORDER BY effective_from DESC
    LIMIT 1;
    
    IF v_fee IS NOT NULL THEN
        RETURN v_fee;
    END IF;
    
    -- Try role with default order type
    SELECT fee_percent INTO v_fee
    FROM public.platform_fee_config
    WHERE role = p_role 
      AND order_type = 'default'
      AND (effective_until IS NULL OR effective_until > NOW())
    ORDER BY effective_from DESC
    LIMIT 1;
    
    IF v_fee IS NOT NULL THEN
        RETURN v_fee;
    END IF;
    
    -- Try default role with specific order type
    SELECT fee_percent INTO v_fee
    FROM public.platform_fee_config
    WHERE role = 'default' 
      AND order_type = p_order_type
      AND (effective_until IS NULL OR effective_until > NOW())
    ORDER BY effective_from DESC
    LIMIT 1;
    
    IF v_fee IS NOT NULL THEN
        RETURN v_fee;
    END IF;
    
    -- Fall back to default-default (should always exist)
    SELECT fee_percent INTO v_fee
    FROM public.platform_fee_config
    WHERE role = 'default' 
      AND order_type = 'default'
      AND (effective_until IS NULL OR effective_until > NOW())
    ORDER BY effective_from DESC
    LIMIT 1;
    
    RETURN COALESCE(v_fee, 8.00); -- Ultimate fallback
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================
-- SECTION 3: CREDIT BALANCE / WALLET SYSTEM
-- =============================================

-- Account balance table
CREATE TABLE IF NOT EXISTS public.account_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
    balance_amount INTEGER DEFAULT 0, -- in smallest currency unit (pence)
    currency TEXT DEFAULT 'GBP',
    last_topped_up_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_balances_user_id ON public.account_balances(user_id);

-- Balance transactions for audit trail
CREATE TABLE IF NOT EXISTS public.balance_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('top_up', 'spend', 'refund', 'adjustment', 'withdrawal')),
    amount INTEGER NOT NULL, -- positive for credits, negative for debits
    balance_before INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    reference_type TEXT, -- 'order', 'retainer', 'manual', 'stripe_topup'
    reference_id UUID,
    stripe_payment_intent_id TEXT,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_balance_transactions_user_id ON public.balance_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_balance_transactions_created_at ON public.balance_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_balance_transactions_reference ON public.balance_transactions(reference_type, reference_id);

-- Function to safely adjust balance with transaction logging
CREATE OR REPLACE FUNCTION public.adjust_account_balance(
    p_user_id UUID,
    p_amount INTEGER,
    p_transaction_type TEXT,
    p_reference_type TEXT DEFAULT NULL,
    p_reference_id UUID DEFAULT NULL,
    p_stripe_payment_intent_id TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, new_balance INTEGER, error_message TEXT) AS $$
DECLARE
    v_balance_before INTEGER;
    v_balance_after INTEGER;
    v_currency TEXT;
BEGIN
    -- Get current balance with row lock
    SELECT balance_amount, currency INTO v_balance_before, v_currency
    FROM public.account_balances
    WHERE user_id = p_user_id
    FOR UPDATE;
    
    -- Create balance record if doesn't exist
    IF v_balance_before IS NULL THEN
        INSERT INTO public.account_balances (user_id, balance_amount, currency)
        VALUES (p_user_id, 0, 'GBP')
        ON CONFLICT (user_id) DO NOTHING;
        v_balance_before := 0;
        v_currency := 'GBP';
    END IF;
    
    -- Calculate new balance
    v_balance_after := v_balance_before + p_amount;
    
    -- Prevent negative balance for spend transactions
    IF p_transaction_type = 'spend' AND v_balance_after < 0 THEN
        RETURN QUERY SELECT FALSE, v_balance_before, 'Insufficient balance'::TEXT;
        RETURN;
    END IF;
    
    -- Update balance
    UPDATE public.account_balances
    SET balance_amount = v_balance_after,
        updated_at = NOW(),
        last_topped_up_at = CASE WHEN p_transaction_type = 'top_up' THEN NOW() ELSE last_topped_up_at END
    WHERE user_id = p_user_id;
    
    -- Record transaction
    INSERT INTO public.balance_transactions (
        user_id, transaction_type, amount, balance_before, balance_after,
        reference_type, reference_id, stripe_payment_intent_id, description
    ) VALUES (
        p_user_id, p_transaction_type, p_amount, v_balance_before, v_balance_after,
        p_reference_type, p_reference_id, p_stripe_payment_intent_id, p_description
    );
    
    RETURN QUERY SELECT TRUE, v_balance_after, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- SECTION 4: PAYMENT RETRY TRACKING
-- =============================================

-- Failed payment tracking
CREATE TABLE IF NOT EXISTS public.failed_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    timesheet_id UUID REFERENCES public.timesheet_entries(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    stripe_payment_intent_id TEXT,
    failure_code TEXT,
    failure_message TEXT,
    amount INTEGER NOT NULL,
    currency TEXT DEFAULT 'GBP',
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    next_retry_at TIMESTAMPTZ,
    last_retry_at TIMESTAMPTZ,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'retrying', 'succeeded', 'exhausted', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_failed_payments_user_id ON public.failed_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_failed_payments_status ON public.failed_payments(status) WHERE status IN ('pending', 'retrying');
CREATE INDEX IF NOT EXISTS idx_failed_payments_next_retry ON public.failed_payments(next_retry_at) WHERE status IN ('pending', 'retrying');
CREATE INDEX IF NOT EXISTS idx_failed_payments_order ON public.failed_payments(order_id) WHERE order_id IS NOT NULL;

-- Function to schedule next retry with exponential backoff
CREATE OR REPLACE FUNCTION public.schedule_payment_retry(p_failed_payment_id UUID)
RETURNS TIMESTAMPTZ AS $$
DECLARE
    v_retry_count INTEGER;
    v_max_retries INTEGER;
    v_next_retry TIMESTAMPTZ;
BEGIN
    SELECT retry_count, max_retries INTO v_retry_count, v_max_retries
    FROM public.failed_payments
    WHERE id = p_failed_payment_id;
    
    IF v_retry_count >= v_max_retries THEN
        -- Mark as exhausted
        UPDATE public.failed_payments
        SET status = 'exhausted', resolved_at = NOW()
        WHERE id = p_failed_payment_id;
        RETURN NULL;
    END IF;
    
    -- Exponential backoff: 1 hour, 4 hours, 24 hours
    v_next_retry := NOW() + (POWER(2, v_retry_count) || ' hours')::INTERVAL;
    
    UPDATE public.failed_payments
    SET retry_count = retry_count + 1,
        next_retry_at = v_next_retry,
        last_retry_at = NOW(),
        status = 'retrying'
    WHERE id = p_failed_payment_id;
    
    RETURN v_next_retry;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- SECTION 5: MULTI-CURRENCY PREFERENCES
-- =============================================

-- Add preferred currency to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS preferred_currency TEXT DEFAULT 'GBP' CHECK (preferred_currency IN ('GBP', 'EUR', 'USD'));

COMMENT ON COLUMN profiles.preferred_currency IS 'User preferred display currency';

-- Currency exchange rates (cached)
CREATE TABLE IF NOT EXISTS public.currency_exchange_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    base_currency TEXT NOT NULL,
    target_currency TEXT NOT NULL,
    rate DECIMAL(12, 6) NOT NULL,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '1 hour',
    UNIQUE(base_currency, target_currency)
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_currencies ON public.currency_exchange_rates(base_currency, target_currency);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_expires ON public.currency_exchange_rates(expires_at);

-- =============================================
-- SECTION 6: PAYOUT PREFERENCES
-- =============================================

-- Payout schedule preferences
CREATE TABLE IF NOT EXISTS public.payout_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES public.provider_profiles(id) ON DELETE CASCADE UNIQUE,
    payout_schedule TEXT DEFAULT 'automatic' CHECK (payout_schedule IN ('automatic', 'manual', 'weekly', 'monthly')),
    minimum_payout_amount INTEGER DEFAULT 5000, -- £50 minimum
    preferred_payout_day INTEGER CHECK (preferred_payout_day >= 1 AND preferred_payout_day <= 28), -- For weekly/monthly
    instant_payout_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payout_preferences_provider_id ON public.payout_preferences(provider_id);

-- Payout requests (for manual payouts)
CREATE TABLE IF NOT EXISTS public.payout_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES public.provider_profiles(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    currency TEXT DEFAULT 'GBP',
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    stripe_payout_id TEXT,
    failure_reason TEXT,
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payout_requests_provider_id ON public.payout_requests(provider_id);
CREATE INDEX IF NOT EXISTS idx_payout_requests_status ON public.payout_requests(status);

-- =============================================
-- SECTION 7: SUBSCRIPTION BILLING
-- =============================================

-- User subscriptions table
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
    stripe_subscription_id TEXT NOT NULL UNIQUE,
    stripe_customer_id TEXT NOT NULL,
    tier TEXT NOT NULL CHECK (tier IN ('free', 'starter', 'professional', 'enterprise')),
    status TEXT NOT NULL CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete')),
    current_period_start TIMESTAMPTZ NOT NULL,
    current_period_end TIMESTAMPTZ NOT NULL,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    trial_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON public.user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_stripe_subscription ON public.user_subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status ON public.user_subscriptions(status);

-- =============================================
-- SECTION 8: WIRE TRANSFER / BANK TRANSFER SUPPORT
-- =============================================

-- Bank transfer requests for enterprise accounts
CREATE TABLE IF NOT EXISTS public.bank_transfer_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL, -- in smallest currency unit
    currency TEXT DEFAULT 'GBP',
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'awaiting_funds', 'processing', 'completed', 'expired', 'failed')),
    stripe_payment_intent_id TEXT,
    bank_transfer_instructions JSONB, -- Contains account details for wire
    reference_number TEXT UNIQUE,
    expires_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_transfer_requests_user_id ON public.bank_transfer_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_bank_transfer_requests_status ON public.bank_transfer_requests(status);
CREATE INDEX IF NOT EXISTS idx_bank_transfer_requests_reference ON public.bank_transfer_requests(reference_number);

-- Function to generate unique reference numbers
CREATE OR REPLACE FUNCTION public.generate_bank_transfer_reference()
RETURNS TRIGGER AS $$
DECLARE
    v_ref TEXT;
BEGIN
    -- Format: CENT-XXXX-XXXX (random alphanumeric)
    v_ref := 'CENT-' || 
             UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 4)) || '-' ||
             UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 4));
    
    NEW.reference_number := v_ref;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_generate_bank_transfer_reference ON public.bank_transfer_requests;
CREATE TRIGGER trigger_generate_bank_transfer_reference
    BEFORE INSERT ON public.bank_transfer_requests
    FOR EACH ROW
    WHEN (NEW.reference_number IS NULL)
    EXECUTE FUNCTION public.generate_bank_transfer_reference();

-- =============================================
-- SECTION 9: ROW LEVEL SECURITY
-- =============================================

-- Enable RLS
ALTER TABLE public.saved_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_fee_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.balance_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.failed_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.currency_exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transfer_requests ENABLE ROW LEVEL SECURITY;

-- Saved Payment Methods Policies
CREATE POLICY "users_manage_own_payment_methods" ON public.saved_payment_methods
    FOR ALL USING (user_id = auth.uid());

-- Fee Config Policies (read-only for users, service role manages)
CREATE POLICY "users_view_fee_config" ON public.platform_fee_config
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "service_manage_fee_config" ON public.platform_fee_config
    FOR ALL USING (auth.role() = 'service_role');

-- Account Balances Policies
CREATE POLICY "users_view_own_balance" ON public.account_balances
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "service_manage_balances" ON public.account_balances
    FOR ALL USING (auth.role() = 'service_role');

-- Balance Transactions Policies
CREATE POLICY "users_view_own_transactions" ON public.balance_transactions
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "service_manage_transactions" ON public.balance_transactions
    FOR ALL USING (auth.role() = 'service_role');

-- Failed Payments Policies
CREATE POLICY "users_view_own_failed_payments" ON public.failed_payments
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "service_manage_failed_payments" ON public.failed_payments
    FOR ALL USING (auth.role() = 'service_role');

-- Exchange Rates Policies (public read)
CREATE POLICY "anyone_view_exchange_rates" ON public.currency_exchange_rates
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "service_manage_exchange_rates" ON public.currency_exchange_rates
    FOR ALL USING (auth.role() = 'service_role');

-- Payout Preferences Policies
CREATE POLICY "providers_manage_own_payout_preferences" ON public.payout_preferences
    FOR ALL USING (
        provider_id IN (SELECT id FROM public.provider_profiles WHERE user_id = auth.uid())
    );

-- Payout Requests Policies
CREATE POLICY "providers_view_own_payout_requests" ON public.payout_requests
    FOR SELECT USING (
        provider_id IN (SELECT id FROM public.provider_profiles WHERE user_id = auth.uid())
    );

CREATE POLICY "providers_create_payout_requests" ON public.payout_requests
    FOR INSERT WITH CHECK (
        provider_id IN (SELECT id FROM public.provider_profiles WHERE user_id = auth.uid())
    );

CREATE POLICY "service_manage_payout_requests" ON public.payout_requests
    FOR ALL USING (auth.role() = 'service_role');

-- User Subscriptions Policies
CREATE POLICY "users_view_own_subscription" ON public.user_subscriptions
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "service_manage_subscriptions" ON public.user_subscriptions
    FOR ALL USING (auth.role() = 'service_role');

-- Bank Transfer Requests Policies
CREATE POLICY "users_view_own_bank_transfers" ON public.bank_transfer_requests
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "users_create_bank_transfers" ON public.bank_transfer_requests
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "service_manage_bank_transfers" ON public.bank_transfer_requests
    FOR ALL USING (auth.role() = 'service_role');

-- =============================================
-- SECTION 10: COMMENTS
-- =============================================

COMMENT ON TABLE public.saved_payment_methods IS 'Saved payment methods for buyers (Stripe PaymentMethod IDs)';
COMMENT ON TABLE public.platform_fee_config IS 'Configurable platform fees by role and order type';
COMMENT ON TABLE public.account_balances IS 'Pre-funded account balances for buyers';
COMMENT ON TABLE public.balance_transactions IS 'Audit trail for all balance changes';
COMMENT ON TABLE public.failed_payments IS 'Tracking failed payments for retry logic';
COMMENT ON TABLE public.currency_exchange_rates IS 'Cached exchange rates for multi-currency display';
COMMENT ON TABLE public.payout_preferences IS 'Provider payout schedule preferences';
COMMENT ON TABLE public.payout_requests IS 'Manual payout requests from providers';
COMMENT ON TABLE public.user_subscriptions IS 'User subscription status and Stripe subscription mapping';
COMMENT ON TABLE public.bank_transfer_requests IS 'Bank/wire transfer requests for enterprise accounts';

-- =============================================
-- END OF MIGRATION
-- =============================================
