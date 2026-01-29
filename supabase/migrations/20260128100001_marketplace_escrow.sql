-- =============================================
-- MIGRATION: Marketplace Escrow System
-- =============================================
-- Comprehensive marketplace infrastructure including:
-- - Provider profiles with Stripe Connect
-- - Orders and escrow management
-- - Messaging system
-- - RFQ (Request for Quote) workflow
-- - Reviews and ratings
-- - Dispute resolution
-- - Admin and audit functionality
-- - GDPR compliance

-- =============================================
-- SECTION 1: ENUMS
-- =============================================

-- Supplier verification tiers
CREATE TYPE supplier_tier AS ENUM ('verified_partner', 'approved', 'pending', 'suspended');

-- Order lifecycle status
CREATE TYPE order_status AS ENUM ('pending', 'accepted', 'in_progress', 'completed', 'disputed', 'cancelled');

-- Escrow money status
CREATE TYPE escrow_status AS ENUM ('pending', 'held', 'partial_release', 'released', 'refunded');

-- Order type classification
CREATE TYPE order_type AS ENUM ('people_booking', 'product_rfq', 'service');

-- Notification urgency levels
CREATE TYPE notification_priority AS ENUM ('critical', 'high', 'medium', 'low');

-- Notification delivery methods
CREATE TYPE notification_channel AS ENUM ('push', 'email', 'sms', 'in_app');

-- Dispute resolution stages
CREATE TYPE dispute_status AS ENUM ('open', 'under_review', 'mediation', 'arbitration', 'resolved', 'escalated');

-- RFQ type classification
CREATE TYPE rfq_type AS ENUM ('commodity', 'custom', 'service');

-- Alter existing rfq_status enum to add missing values
-- Note: existing values are 'Open', 'Bidding', 'Awarded', 'Closed'
DO $$ BEGIN
    ALTER TYPE rfq_status ADD VALUE IF NOT EXISTS 'priority_hold';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TYPE rfq_status ADD VALUE IF NOT EXISTS 'cancelled';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Admin role types
CREATE TYPE admin_role AS ENUM ('super_admin', 'operations', 'support', 'finance', 'readonly');

-- GDPR request types
CREATE TYPE data_request_type AS ENUM ('access', 'deletion', 'export');

-- GDPR request status
CREATE TYPE data_request_status AS ENUM ('pending', 'processing', 'completed', 'denied');

-- =============================================
-- SECTION 2: CORE TABLES
-- =============================================

-- 1. Provider Profiles - Links users to marketplace with Stripe Connect
CREATE TABLE IF NOT EXISTS public.provider_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    listing_id UUID REFERENCES public.marketplace_listings(id) ON DELETE SET NULL,
    stripe_account_id TEXT,
    stripe_onboarding_complete BOOLEAN DEFAULT FALSE,
    day_rate DECIMAL(10, 2),
    currency TEXT DEFAULT 'GBP',
    bio TEXT,
    headline TEXT,
    tier supplier_tier DEFAULT 'pending',
    is_active BOOLEAN DEFAULT TRUE,
    max_concurrent_orders INTEGER DEFAULT 5,
    current_order_count INTEGER DEFAULT 0,
    auto_pause_at_capacity BOOLEAN DEFAULT TRUE,
    timezone TEXT DEFAULT 'Europe/London',
    out_of_office BOOLEAN DEFAULT FALSE,
    out_of_office_message TEXT,
    out_of_office_until TIMESTAMPTZ,
    auto_response_enabled BOOLEAN DEFAULT FALSE,
    auto_response_message TEXT,
    auto_response_delay_minutes INTEGER DEFAULT 60,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- 2. Provider Applications - Supplier vetting workflow
CREATE TABLE IF NOT EXISTS public.provider_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    company_name TEXT,
    application_data JSONB DEFAULT '{}'::jsonb,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 'approved', 'rejected')),
    assigned_tier supplier_tier,
    reviewer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewer_notes TEXT,
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ
);

-- 3. Availability Slots - Calendar availability management
CREATE TABLE IF NOT EXISTS public.availability_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES public.provider_profiles(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    status TEXT DEFAULT 'available' CHECK (status IN ('available', 'booked', 'blocked')),
    booking_id UUID,
    source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'calendar_sync', 'booking')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(provider_id, date)
);

-- 4. Orders - Central transaction record
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT UNIQUE,
    buyer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    seller_id UUID NOT NULL REFERENCES public.provider_profiles(id) ON DELETE RESTRICT,
    listing_id UUID REFERENCES public.marketplace_listings(id) ON DELETE SET NULL,
    order_type order_type NOT NULL,
    status order_status DEFAULT 'pending',
    total_amount DECIMAL(12, 2) NOT NULL,
    platform_fee DECIMAL(12, 2) DEFAULT 0,
    currency TEXT DEFAULT 'GBP',
    stripe_payment_intent_id TEXT,
    escrow_status escrow_status DEFAULT 'pending',
    objective_id UUID REFERENCES public.objectives(id) ON DELETE SET NULL,
    business_function_id UUID REFERENCES public.business_functions(id) ON DELETE SET NULL,
    vat_amount DECIMAL(12, 2) DEFAULT 0,
    vat_rate DECIMAL(5, 4) DEFAULT 0.20,
    tax_treatment TEXT DEFAULT 'standard' CHECK (tax_treatment IN ('standard', 'reverse_charge', 'exempt', 'zero_rated')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- 5. Order Milestones - Staged payment releases
CREATE TABLE IF NOT EXISTS public.order_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    amount DECIMAL(12, 2) NOT NULL,
    due_date DATE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'approved', 'rejected', 'paid')),
    submitted_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Escrow Transactions - Audit trail for money movement
CREATE TABLE IF NOT EXISTS public.escrow_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    milestone_id UUID REFERENCES public.order_milestones(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('deposit', 'hold', 'release', 'refund', 'fee_deduction')),
    amount DECIMAL(12, 2) NOT NULL,
    stripe_transfer_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Conversations - Messaging threads
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    rfq_id UUID,
    listing_id UUID REFERENCES public.marketplace_listings(id) ON DELETE SET NULL,
    buyer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'reported')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Messages - Individual messages
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT,
    message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'file', 'system')),
    file_url TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. RFQs - Request for quotes
CREATE TABLE IF NOT EXISTS public.rfqs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    rfq_type rfq_type NOT NULL,
    title TEXT NOT NULL,
    specifications JSONB DEFAULT '{}'::jsonb,
    budget_min DECIMAL(12, 2),
    budget_max DECIMAL(12, 2),
    deadline DATE,
    category TEXT,
    status rfq_status DEFAULT 'Open',
    priority_holder_id UUID REFERENCES public.provider_profiles(id) ON DELETE SET NULL,
    priority_hold_expires_at TIMESTAMPTZ,
    awarded_to UUID REFERENCES public.provider_profiles(id) ON DELETE SET NULL,
    urgency TEXT DEFAULT 'standard' CHECK (urgency IN ('urgent', 'standard')),
    race_opens_at TIMESTAMPTZ,
    foundry_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Update conversation FK to rfqs now that rfqs table exists
ALTER TABLE public.conversations 
    ADD CONSTRAINT conversations_rfq_id_fkey 
    FOREIGN KEY (rfq_id) REFERENCES public.rfqs(id) ON DELETE SET NULL;

-- 10. RFQ Responses - Supplier responses to RFQs
CREATE TABLE IF NOT EXISTS public.rfq_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rfq_id UUID NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES public.provider_profiles(id) ON DELETE CASCADE,
    response_type TEXT NOT NULL CHECK (response_type IN ('accept', 'info_request', 'decline')),
    quoted_price DECIMAL(12, 2),
    message TEXT,
    responded_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(rfq_id, provider_id)
);

-- 11. RFQ Broadcasts - Time zone-aware broadcast tracking
CREATE TABLE IF NOT EXISTS public.rfq_broadcasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rfq_id UUID NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES public.provider_profiles(id) ON DELETE CASCADE,
    scheduled_at TIMESTAMPTZ NOT NULL,
    delivered_at TIMESTAMPTZ,
    viewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(rfq_id, provider_id)
);

-- 12. Reviews - Ratings and feedback
CREATE TABLE IF NOT EXISTS public.reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reviewee_id UUID NOT NULL REFERENCES public.provider_profiles(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    is_public BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(order_id, reviewer_id)
);

-- 13. Provider Ratings - Aggregated scores (materialized view-like table)
CREATE TABLE IF NOT EXISTS public.provider_ratings (
    provider_id UUID PRIMARY KEY REFERENCES public.provider_profiles(id) ON DELETE CASCADE,
    average_rating DECIMAL(3, 2) DEFAULT 0,
    total_reviews INTEGER DEFAULT 0,
    total_transactions INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. Disputes - Conflict resolution
CREATE TABLE IF NOT EXISTS public.disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    raised_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    evidence_urls TEXT[] DEFAULT '{}',
    status dispute_status DEFAULT 'open',
    resolution TEXT,
    resolution_amount DECIMAL(12, 2),
    assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. Notification Preferences - User notification settings
CREATE TABLE IF NOT EXISTS public.notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    channel notification_channel NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    critical_enabled BOOLEAN DEFAULT TRUE,
    high_enabled BOOLEAN DEFAULT TRUE,
    medium_enabled BOOLEAN DEFAULT TRUE,
    low_enabled BOOLEAN DEFAULT FALSE,
    phone_number TEXT,
    push_token TEXT,
    UNIQUE(user_id, channel)
);

-- 16. Notification Log - Sent notifications audit
CREATE TABLE IF NOT EXISTS public.notification_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    priority notification_priority NOT NULL,
    channels notification_channel[] DEFAULT '{}',
    title TEXT NOT NULL,
    body TEXT,
    action_url TEXT,
    delivered_via notification_channel[] DEFAULT '{}',
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 17. Admin Users - Platform administrators
CREATE TABLE IF NOT EXISTS public.admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    admin_role admin_role NOT NULL,
    permissions JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- 18. Admin Audit Log - Admin action tracking
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    before_state JSONB,
    after_state JSONB,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 19. Platform Discounts - Negotiated supplier discounts
CREATE TABLE IF NOT EXISTS public.platform_discounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES public.provider_profiles(id) ON DELETE CASCADE,
    discount_percent DECIMAL(5, 2) NOT NULL CHECK (discount_percent > 0 AND discount_percent <= 100),
    discount_type TEXT NOT NULL CHECK (discount_type IN ('volume', 'exclusive', 'promotional')),
    valid_from TIMESTAMPTZ DEFAULT NOW(),
    valid_until TIMESTAMPTZ,
    min_order_value DECIMAL(12, 2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 20. Provider Portfolio - Work samples
CREATE TABLE IF NOT EXISTS public.provider_portfolio (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES public.provider_profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    image_urls TEXT[] DEFAULT '{}',
    project_url TEXT,
    client_name TEXT,
    completion_date DATE,
    is_featured BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 21. Provider Certifications - Credentials
CREATE TABLE IF NOT EXISTS public.provider_certifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES public.provider_profiles(id) ON DELETE CASCADE,
    certification_name TEXT NOT NULL,
    issuing_body TEXT NOT NULL,
    credential_id TEXT,
    issued_date DATE,
    expiry_date DATE,
    verification_url TEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 22. Provider Badges - System-assigned badges
CREATE TABLE IF NOT EXISTS public.provider_badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES public.provider_profiles(id) ON DELETE CASCADE,
    badge_type TEXT NOT NULL,
    earned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(provider_id, badge_type)
);

-- 23. Contract Templates - Legal document templates
CREATE TABLE IF NOT EXISTS public.contract_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_type TEXT NOT NULL,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    variables JSONB DEFAULT '[]'::jsonb,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 24. Order Contracts - Generated contracts
CREATE TABLE IF NOT EXISTS public.order_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    template_id UUID REFERENCES public.contract_templates(id) ON DELETE SET NULL,
    rendered_content TEXT NOT NULL,
    variable_values JSONB DEFAULT '{}'::jsonb,
    buyer_signed_at TIMESTAMPTZ,
    seller_signed_at TIMESTAMPTZ,
    pdf_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 25. Order Documents - Invoices and other docs
CREATE TABLE IF NOT EXISTS public.order_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL CHECK (document_type IN ('invoice', 'receipt', 'statement', 'credit_note', 'other')),
    file_url TEXT NOT NULL,
    generated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 26. Retainers - Ongoing engagements
CREATE TABLE IF NOT EXISTS public.retainers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    seller_id UUID NOT NULL REFERENCES public.provider_profiles(id) ON DELETE CASCADE,
    weekly_hours INTEGER NOT NULL,
    hourly_rate DECIMAL(10, 2) NOT NULL,
    currency TEXT DEFAULT 'GBP',
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paused', 'cancelled')),
    started_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancellation_effective TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 27. Timesheet Entries - Weekly time tracking
CREATE TABLE IF NOT EXISTS public.timesheet_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    retainer_id UUID NOT NULL REFERENCES public.retainers(id) ON DELETE CASCADE,
    week_start DATE NOT NULL,
    hours_logged DECIMAL(5, 2) NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'disputed', 'paid')),
    submitted_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    stripe_payment_intent_id TEXT,
    UNIQUE(retainer_id, week_start)
);

-- 28. Stripe Events - Webhook idempotency
CREATE TABLE IF NOT EXISTS public.stripe_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stripe_event_id TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMPTZ,
    error TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 29. Tax Profiles - VAT information
CREATE TABLE IF NOT EXISTS public.tax_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES public.provider_profiles(id) ON DELETE CASCADE,
    country_code TEXT NOT NULL,
    vat_number TEXT,
    vat_verified BOOLEAN DEFAULT FALSE,
    tax_exempt BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(provider_id)
);

-- 30. Data Requests - GDPR requests
CREATE TABLE IF NOT EXISTS public.data_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    request_type data_request_type NOT NULL,
    status data_request_status DEFAULT 'pending',
    reason TEXT,
    processed_by UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
    completed_at TIMESTAMPTZ,
    export_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 31. Preferred Suppliers - Buyer favorites
CREATE TABLE IF NOT EXISTS public.preferred_suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES public.provider_profiles(id) ON DELETE CASCADE,
    notes TEXT,
    auto_notify_on_availability BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(buyer_id, provider_id)
);

-- 32. Message Templates - Saved responses
CREATE TABLE IF NOT EXISTS public.message_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT,
    is_system BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 33. Platform Metrics - Health monitoring
CREATE TABLE IF NOT EXISTS public.platform_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_name TEXT NOT NULL,
    metric_value DECIMAL(20, 4) NOT NULL,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 34. Fraud Signals - Risk detection
CREATE TABLE IF NOT EXISTS public.fraud_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    signal_type TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    details JSONB DEFAULT '{}'::jsonb,
    action_taken TEXT,
    reviewed_by UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 35. Transaction Limits - Velocity controls
CREATE TABLE IF NOT EXISTS public.transaction_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    limit_type TEXT NOT NULL CHECK (limit_type IN ('daily', 'weekly', 'monthly', 'per_transaction')),
    limit_amount DECIMAL(12, 2) NOT NULL,
    current_amount DECIMAL(12, 2) DEFAULT 0,
    reset_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, limit_type)
);

-- 36. Listing Migration - Transition tracking
CREATE TABLE IF NOT EXISTS public.listing_migration (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
    contact_email TEXT,
    invitation_sent_at TIMESTAMPTZ,
    provider_created_at TIMESTAMPTZ,
    migration_completed_at TIMESTAMPTZ,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'invited', 'in_progress', 'completed', 'declined')),
    UNIQUE(listing_id)
);

-- 37. Order Tasks - Links orders to tasks
CREATE TABLE IF NOT EXISTS public.order_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    task_type TEXT NOT NULL CHECK (task_type IN ('onboarding', 'check_in', 'milestone_review', 'completion')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(order_id, task_id)
);

-- =============================================
-- SECTION 3: INDEXES
-- =============================================

-- Provider profiles indexes
CREATE INDEX IF NOT EXISTS idx_provider_profiles_user_id ON public.provider_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_provider_profiles_listing_id ON public.provider_profiles(listing_id);
CREATE INDEX IF NOT EXISTS idx_provider_profiles_tier ON public.provider_profiles(tier);
CREATE INDEX IF NOT EXISTS idx_provider_profiles_is_active ON public.provider_profiles(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_provider_profiles_stripe_account ON public.provider_profiles(stripe_account_id) WHERE stripe_account_id IS NOT NULL;

-- Provider applications indexes
CREATE INDEX IF NOT EXISTS idx_provider_applications_user_id ON public.provider_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_provider_applications_status ON public.provider_applications(status);
CREATE INDEX IF NOT EXISTS idx_provider_applications_category ON public.provider_applications(category);

-- Availability slots indexes
CREATE INDEX IF NOT EXISTS idx_availability_slots_provider_id ON public.availability_slots(provider_id);
CREATE INDEX IF NOT EXISTS idx_availability_slots_date ON public.availability_slots(date);
CREATE INDEX IF NOT EXISTS idx_availability_slots_status ON public.availability_slots(provider_id, status);

-- Orders indexes
CREATE INDEX IF NOT EXISTS idx_orders_buyer_id ON public.orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_seller_id ON public.orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_orders_listing_id ON public.orders(listing_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_escrow_status ON public.orders(escrow_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON public.orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_stripe_payment_intent ON public.orders(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;

-- Order milestones indexes
CREATE INDEX IF NOT EXISTS idx_order_milestones_order_id ON public.order_milestones(order_id);
CREATE INDEX IF NOT EXISTS idx_order_milestones_status ON public.order_milestones(status);
CREATE INDEX IF NOT EXISTS idx_order_milestones_due_date ON public.order_milestones(due_date);

-- Escrow transactions indexes
CREATE INDEX IF NOT EXISTS idx_escrow_transactions_order_id ON public.escrow_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_escrow_transactions_milestone_id ON public.escrow_transactions(milestone_id);
CREATE INDEX IF NOT EXISTS idx_escrow_transactions_type ON public.escrow_transactions(type);
CREATE INDEX IF NOT EXISTS idx_escrow_transactions_created_at ON public.escrow_transactions(created_at DESC);

-- Conversations indexes
CREATE INDEX IF NOT EXISTS idx_conversations_order_id ON public.conversations(order_id);
CREATE INDEX IF NOT EXISTS idx_conversations_rfq_id ON public.conversations(rfq_id);
CREATE INDEX IF NOT EXISTS idx_conversations_buyer_id ON public.conversations(buyer_id);
CREATE INDEX IF NOT EXISTS idx_conversations_seller_id ON public.conversations(seller_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON public.conversations(updated_at DESC);

-- Messages indexes
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON public.messages(conversation_id, is_read) WHERE is_read = FALSE;

-- RFQs indexes
CREATE INDEX IF NOT EXISTS idx_rfqs_buyer_id ON public.rfqs(buyer_id);
CREATE INDEX IF NOT EXISTS idx_rfqs_status ON public.rfqs(status);
CREATE INDEX IF NOT EXISTS idx_rfqs_foundry_id ON public.rfqs(foundry_id);
CREATE INDEX IF NOT EXISTS idx_rfqs_category ON public.rfqs(category);
CREATE INDEX IF NOT EXISTS idx_rfqs_deadline ON public.rfqs(deadline);
CREATE INDEX IF NOT EXISTS idx_rfqs_priority_holder ON public.rfqs(priority_holder_id) WHERE priority_holder_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rfqs_awarded_to ON public.rfqs(awarded_to) WHERE awarded_to IS NOT NULL;

-- RFQ responses indexes
CREATE INDEX IF NOT EXISTS idx_rfq_responses_rfq_id ON public.rfq_responses(rfq_id);
CREATE INDEX IF NOT EXISTS idx_rfq_responses_provider_id ON public.rfq_responses(provider_id);
CREATE INDEX IF NOT EXISTS idx_rfq_responses_response_type ON public.rfq_responses(response_type);

-- RFQ broadcasts indexes
CREATE INDEX IF NOT EXISTS idx_rfq_broadcasts_rfq_id ON public.rfq_broadcasts(rfq_id);
CREATE INDEX IF NOT EXISTS idx_rfq_broadcasts_provider_id ON public.rfq_broadcasts(provider_id);
CREATE INDEX IF NOT EXISTS idx_rfq_broadcasts_scheduled_at ON public.rfq_broadcasts(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_rfq_broadcasts_pending ON public.rfq_broadcasts(scheduled_at) WHERE delivered_at IS NULL;

-- Reviews indexes
CREATE INDEX IF NOT EXISTS idx_reviews_order_id ON public.reviews(order_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer_id ON public.reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewee_id ON public.reviews(reviewee_id);
CREATE INDEX IF NOT EXISTS idx_reviews_rating ON public.reviews(rating);
CREATE INDEX IF NOT EXISTS idx_reviews_public ON public.reviews(reviewee_id, is_public) WHERE is_public = TRUE;

-- Provider ratings indexes (PK is already provider_id, no additional needed)

-- Disputes indexes
CREATE INDEX IF NOT EXISTS idx_disputes_order_id ON public.disputes(order_id);
CREATE INDEX IF NOT EXISTS idx_disputes_raised_by ON public.disputes(raised_by);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON public.disputes(status);
CREATE INDEX IF NOT EXISTS idx_disputes_assigned_to ON public.disputes(assigned_to) WHERE assigned_to IS NOT NULL;

-- Notification preferences indexes
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user_id ON public.notification_preferences(user_id);

-- Notification log indexes
CREATE INDEX IF NOT EXISTS idx_notification_log_user_id ON public.notification_log(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_created_at ON public.notification_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_log_unread ON public.notification_log(user_id, read_at) WHERE read_at IS NULL;

-- Admin users indexes
CREATE INDEX IF NOT EXISTS idx_admin_users_user_id ON public.admin_users(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_users_role ON public.admin_users(admin_role);

-- Admin audit log indexes
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin_id ON public.admin_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_entity ON public.admin_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON public.admin_audit_log(created_at DESC);

-- Platform discounts indexes
CREATE INDEX IF NOT EXISTS idx_platform_discounts_provider_id ON public.platform_discounts(provider_id);
CREATE INDEX IF NOT EXISTS idx_platform_discounts_valid ON public.platform_discounts(valid_from, valid_until);

-- Provider portfolio indexes
CREATE INDEX IF NOT EXISTS idx_provider_portfolio_provider_id ON public.provider_portfolio(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_portfolio_featured ON public.provider_portfolio(provider_id, is_featured) WHERE is_featured = TRUE;

-- Provider certifications indexes
CREATE INDEX IF NOT EXISTS idx_provider_certifications_provider_id ON public.provider_certifications(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_certifications_verified ON public.provider_certifications(is_verified) WHERE is_verified = TRUE;
CREATE INDEX IF NOT EXISTS idx_provider_certifications_expiry ON public.provider_certifications(expiry_date);

-- Provider badges indexes
CREATE INDEX IF NOT EXISTS idx_provider_badges_provider_id ON public.provider_badges(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_badges_type ON public.provider_badges(badge_type);

-- Contract templates indexes
CREATE INDEX IF NOT EXISTS idx_contract_templates_type ON public.contract_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_contract_templates_default ON public.contract_templates(is_default) WHERE is_default = TRUE;

-- Order contracts indexes
CREATE INDEX IF NOT EXISTS idx_order_contracts_order_id ON public.order_contracts(order_id);
CREATE INDEX IF NOT EXISTS idx_order_contracts_template_id ON public.order_contracts(template_id);

-- Order documents indexes
CREATE INDEX IF NOT EXISTS idx_order_documents_order_id ON public.order_documents(order_id);
CREATE INDEX IF NOT EXISTS idx_order_documents_type ON public.order_documents(document_type);

-- Retainers indexes
CREATE INDEX IF NOT EXISTS idx_retainers_buyer_id ON public.retainers(buyer_id);
CREATE INDEX IF NOT EXISTS idx_retainers_seller_id ON public.retainers(seller_id);
CREATE INDEX IF NOT EXISTS idx_retainers_status ON public.retainers(status);

-- Timesheet entries indexes
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_retainer_id ON public.timesheet_entries(retainer_id);
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_week_start ON public.timesheet_entries(week_start);
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_status ON public.timesheet_entries(status);

-- Stripe events indexes
CREATE INDEX IF NOT EXISTS idx_stripe_events_stripe_event_id ON public.stripe_events(stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_stripe_events_event_type ON public.stripe_events(event_type);
CREATE INDEX IF NOT EXISTS idx_stripe_events_processed ON public.stripe_events(processed) WHERE processed = FALSE;
CREATE INDEX IF NOT EXISTS idx_stripe_events_created_at ON public.stripe_events(created_at DESC);

-- Tax profiles indexes
CREATE INDEX IF NOT EXISTS idx_tax_profiles_provider_id ON public.tax_profiles(provider_id);
CREATE INDEX IF NOT EXISTS idx_tax_profiles_country ON public.tax_profiles(country_code);

-- Data requests indexes
CREATE INDEX IF NOT EXISTS idx_data_requests_user_id ON public.data_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_data_requests_status ON public.data_requests(status);
CREATE INDEX IF NOT EXISTS idx_data_requests_type ON public.data_requests(request_type);

-- Preferred suppliers indexes
CREATE INDEX IF NOT EXISTS idx_preferred_suppliers_buyer_id ON public.preferred_suppliers(buyer_id);
CREATE INDEX IF NOT EXISTS idx_preferred_suppliers_provider_id ON public.preferred_suppliers(provider_id);

-- Message templates indexes
CREATE INDEX IF NOT EXISTS idx_message_templates_user_id ON public.message_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_message_templates_system ON public.message_templates(is_system) WHERE is_system = TRUE;

-- Platform metrics indexes
CREATE INDEX IF NOT EXISTS idx_platform_metrics_name ON public.platform_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_platform_metrics_recorded_at ON public.platform_metrics(recorded_at DESC);

-- Fraud signals indexes
CREATE INDEX IF NOT EXISTS idx_fraud_signals_user_id ON public.fraud_signals(user_id);
CREATE INDEX IF NOT EXISTS idx_fraud_signals_severity ON public.fraud_signals(severity);
CREATE INDEX IF NOT EXISTS idx_fraud_signals_type ON public.fraud_signals(signal_type);
CREATE INDEX IF NOT EXISTS idx_fraud_signals_created_at ON public.fraud_signals(created_at DESC);

-- Transaction limits indexes
CREATE INDEX IF NOT EXISTS idx_transaction_limits_user_id ON public.transaction_limits(user_id);
CREATE INDEX IF NOT EXISTS idx_transaction_limits_reset ON public.transaction_limits(reset_at) WHERE reset_at IS NOT NULL;

-- Listing migration indexes
CREATE INDEX IF NOT EXISTS idx_listing_migration_listing_id ON public.listing_migration(listing_id);
CREATE INDEX IF NOT EXISTS idx_listing_migration_status ON public.listing_migration(status);

-- Order tasks indexes
CREATE INDEX IF NOT EXISTS idx_order_tasks_order_id ON public.order_tasks(order_id);
CREATE INDEX IF NOT EXISTS idx_order_tasks_task_id ON public.order_tasks(task_id);

-- =============================================
-- SECTION 4: FUNCTIONS
-- =============================================

-- Function to generate order numbers (ORD-YYYY-NNNNN format)
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER AS $$
DECLARE
    v_year TEXT;
    v_seq INTEGER;
    v_order_number TEXT;
BEGIN
    v_year := to_char(NOW(), 'YYYY');
    
    -- Get next sequence number for this year
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(order_number FROM 10 FOR 5) AS INTEGER)
    ), 0) + 1
    INTO v_seq
    FROM public.orders
    WHERE order_number LIKE 'ORD-' || v_year || '-%';
    
    -- Format: ORD-YYYY-NNNNN
    v_order_number := 'ORD-' || v_year || '-' || LPAD(v_seq::TEXT, 5, '0');
    
    NEW.order_number := v_order_number;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate order numbers
DROP TRIGGER IF EXISTS trigger_generate_order_number ON public.orders;
CREATE TRIGGER trigger_generate_order_number
    BEFORE INSERT ON public.orders
    FOR EACH ROW
    WHEN (NEW.order_number IS NULL)
    EXECUTE FUNCTION public.generate_order_number();

-- Function to update provider ratings when reviews are added
CREATE OR REPLACE FUNCTION public.update_provider_ratings()
RETURNS TRIGGER AS $$
BEGIN
    -- Upsert into provider_ratings
    INSERT INTO public.provider_ratings (provider_id, average_rating, total_reviews, total_transactions, updated_at)
    SELECT 
        NEW.reviewee_id,
        COALESCE(AVG(rating), 0),
        COUNT(*),
        (SELECT COUNT(*) FROM public.orders WHERE seller_id = NEW.reviewee_id AND status = 'completed'),
        NOW()
    FROM public.reviews
    WHERE reviewee_id = NEW.reviewee_id AND is_public = TRUE
    ON CONFLICT (provider_id) DO UPDATE SET
        average_rating = EXCLUDED.average_rating,
        total_reviews = EXCLUDED.total_reviews,
        total_transactions = EXCLUDED.total_transactions,
        updated_at = NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update provider ratings
DROP TRIGGER IF EXISTS trigger_update_provider_ratings ON public.reviews;
CREATE TRIGGER trigger_update_provider_ratings
    AFTER INSERT OR UPDATE OR DELETE ON public.reviews
    FOR EACH ROW
    EXECUTE FUNCTION public.update_provider_ratings();

-- Function to update provider order count
CREATE OR REPLACE FUNCTION public.update_provider_order_count()
RETURNS TRIGGER AS $$
BEGIN
    -- When order becomes active
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status != NEW.status) THEN
        IF NEW.status IN ('accepted', 'in_progress') THEN
            UPDATE public.provider_profiles
            SET current_order_count = current_order_count + 1
            WHERE id = NEW.seller_id;
        END IF;
        
        -- When order completes or is cancelled
        IF NEW.status IN ('completed', 'cancelled') AND 
           (TG_OP = 'INSERT' OR OLD.status IN ('accepted', 'in_progress')) THEN
            UPDATE public.provider_profiles
            SET current_order_count = GREATEST(current_order_count - 1, 0)
            WHERE id = NEW.seller_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update provider order count
DROP TRIGGER IF EXISTS trigger_update_provider_order_count ON public.orders;
CREATE TRIGGER trigger_update_provider_order_count
    AFTER INSERT OR UPDATE OF status ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.update_provider_order_count();

-- Function to auto-pause provider at capacity
CREATE OR REPLACE FUNCTION public.check_provider_capacity()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.current_order_count >= NEW.max_concurrent_orders AND NEW.auto_pause_at_capacity THEN
        NEW.is_active := FALSE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to check capacity
DROP TRIGGER IF EXISTS trigger_check_provider_capacity ON public.provider_profiles;
CREATE TRIGGER trigger_check_provider_capacity
    BEFORE UPDATE OF current_order_count ON public.provider_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.check_provider_capacity();

-- Function to update conversation updated_at on new message
CREATE OR REPLACE FUNCTION public.update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.conversations
    SET updated_at = NOW()
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for conversation timestamp
DROP TRIGGER IF EXISTS trigger_update_conversation_timestamp ON public.messages;
CREATE TRIGGER trigger_update_conversation_timestamp
    AFTER INSERT ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.update_conversation_timestamp();

-- =============================================
-- SECTION 5: ROW LEVEL SECURITY
-- =============================================

-- Enable RLS on all tables
ALTER TABLE public.provider_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escrow_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfq_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfq_broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_portfolio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retainers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheet_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preferred_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fraud_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_migration ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_tasks ENABLE ROW LEVEL SECURITY;

-- =============================================
-- PROVIDER PROFILES POLICIES
-- =============================================

-- Anyone authenticated can view active provider profiles
CREATE POLICY "view_active_provider_profiles" ON public.provider_profiles
    FOR SELECT USING (auth.role() = 'authenticated' AND is_active = TRUE);

-- Users can view their own profile (even if inactive)
CREATE POLICY "view_own_provider_profile" ON public.provider_profiles
    FOR SELECT USING (user_id = auth.uid());

-- Users can insert their own provider profile
CREATE POLICY "insert_own_provider_profile" ON public.provider_profiles
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can update their own provider profile
CREATE POLICY "update_own_provider_profile" ON public.provider_profiles
    FOR UPDATE USING (user_id = auth.uid());

-- =============================================
-- PROVIDER APPLICATIONS POLICIES
-- =============================================

-- Users can view their own applications
CREATE POLICY "view_own_applications" ON public.provider_applications
    FOR SELECT USING (user_id = auth.uid());

-- Users can create their own applications
CREATE POLICY "insert_own_applications" ON public.provider_applications
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can update their own pending applications
CREATE POLICY "update_own_pending_applications" ON public.provider_applications
    FOR UPDATE USING (user_id = auth.uid() AND status = 'pending');

-- Admins can view and manage all applications (via service role)
CREATE POLICY "admin_manage_applications" ON public.provider_applications
    FOR ALL USING (auth.role() = 'service_role');

-- =============================================
-- AVAILABILITY SLOTS POLICIES
-- =============================================

-- Anyone authenticated can view available slots
CREATE POLICY "view_available_slots" ON public.availability_slots
    FOR SELECT USING (auth.role() = 'authenticated');

-- Providers can manage their own slots
CREATE POLICY "manage_own_slots" ON public.availability_slots
    FOR ALL USING (
        provider_id IN (SELECT id FROM public.provider_profiles WHERE user_id = auth.uid())
    );

-- =============================================
-- ORDERS POLICIES
-- =============================================

-- Users can view orders they're involved in
CREATE POLICY "view_own_orders" ON public.orders
    FOR SELECT USING (
        buyer_id = auth.uid() OR 
        seller_id IN (SELECT id FROM public.provider_profiles WHERE user_id = auth.uid())
    );

-- Buyers can create orders
CREATE POLICY "create_orders" ON public.orders
    FOR INSERT WITH CHECK (buyer_id = auth.uid());

-- Participants can update orders
CREATE POLICY "update_own_orders" ON public.orders
    FOR UPDATE USING (
        buyer_id = auth.uid() OR 
        seller_id IN (SELECT id FROM public.provider_profiles WHERE user_id = auth.uid())
    );

-- =============================================
-- ORDER MILESTONES POLICIES
-- =============================================

-- View milestones for orders user is involved in
CREATE POLICY "view_order_milestones" ON public.order_milestones
    FOR SELECT USING (
        order_id IN (
            SELECT id FROM public.orders 
            WHERE buyer_id = auth.uid() OR 
                  seller_id IN (SELECT id FROM public.provider_profiles WHERE user_id = auth.uid())
        )
    );

-- Manage milestones for own orders
CREATE POLICY "manage_order_milestones" ON public.order_milestones
    FOR ALL USING (
        order_id IN (
            SELECT id FROM public.orders 
            WHERE buyer_id = auth.uid() OR 
                  seller_id IN (SELECT id FROM public.provider_profiles WHERE user_id = auth.uid())
        )
    );

-- =============================================
-- ESCROW TRANSACTIONS POLICIES
-- =============================================

-- View escrow transactions for own orders
CREATE POLICY "view_escrow_transactions" ON public.escrow_transactions
    FOR SELECT USING (
        order_id IN (
            SELECT id FROM public.orders 
            WHERE buyer_id = auth.uid() OR 
                  seller_id IN (SELECT id FROM public.provider_profiles WHERE user_id = auth.uid())
        )
    );

-- Service role can insert escrow transactions
CREATE POLICY "service_insert_escrow" ON public.escrow_transactions
    FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- =============================================
-- CONVERSATIONS POLICIES
-- =============================================

-- Users can view conversations they're part of
CREATE POLICY "view_own_conversations" ON public.conversations
    FOR SELECT USING (buyer_id = auth.uid() OR seller_id = auth.uid());

-- Users can create conversations
CREATE POLICY "create_conversations" ON public.conversations
    FOR INSERT WITH CHECK (buyer_id = auth.uid() OR seller_id = auth.uid());

-- Users can update their conversations
CREATE POLICY "update_own_conversations" ON public.conversations
    FOR UPDATE USING (buyer_id = auth.uid() OR seller_id = auth.uid());

-- =============================================
-- MESSAGES POLICIES
-- =============================================

-- Users can view messages in their conversations
CREATE POLICY "view_conversation_messages" ON public.messages
    FOR SELECT USING (
        conversation_id IN (
            SELECT id FROM public.conversations 
            WHERE buyer_id = auth.uid() OR seller_id = auth.uid()
        )
    );

-- Users can send messages in their conversations
CREATE POLICY "send_messages" ON public.messages
    FOR INSERT WITH CHECK (
        sender_id = auth.uid() AND
        conversation_id IN (
            SELECT id FROM public.conversations 
            WHERE buyer_id = auth.uid() OR seller_id = auth.uid()
        )
    );

-- Users can update their own messages (mark as read, etc)
CREATE POLICY "update_own_messages" ON public.messages
    FOR UPDATE USING (
        conversation_id IN (
            SELECT id FROM public.conversations 
            WHERE buyer_id = auth.uid() OR seller_id = auth.uid()
        )
    );

-- =============================================
-- RFQS POLICIES
-- =============================================

-- Users can view RFQs in their foundry
CREATE POLICY "view_foundry_rfqs" ON public.rfqs
    FOR SELECT USING (
        foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    );

-- Users can create RFQs
CREATE POLICY "create_rfqs" ON public.rfqs
    FOR INSERT WITH CHECK (
        buyer_id = auth.uid() AND
        foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    );

-- Buyers can update their own RFQs
CREATE POLICY "update_own_rfqs" ON public.rfqs
    FOR UPDATE USING (buyer_id = auth.uid());

-- =============================================
-- RFQ RESPONSES POLICIES
-- =============================================

-- RFQ owner and responding provider can view responses
CREATE POLICY "view_rfq_responses" ON public.rfq_responses
    FOR SELECT USING (
        rfq_id IN (SELECT id FROM public.rfqs WHERE buyer_id = auth.uid()) OR
        provider_id IN (SELECT id FROM public.provider_profiles WHERE user_id = auth.uid())
    );

-- Providers can respond to RFQs
CREATE POLICY "create_rfq_responses" ON public.rfq_responses
    FOR INSERT WITH CHECK (
        provider_id IN (SELECT id FROM public.provider_profiles WHERE user_id = auth.uid())
    );

-- Providers can update their responses
CREATE POLICY "update_own_rfq_responses" ON public.rfq_responses
    FOR UPDATE USING (
        provider_id IN (SELECT id FROM public.provider_profiles WHERE user_id = auth.uid())
    );

-- =============================================
-- RFQ BROADCASTS POLICIES
-- =============================================

-- RFQ owner and targeted providers can view broadcasts
CREATE POLICY "view_rfq_broadcasts" ON public.rfq_broadcasts
    FOR SELECT USING (
        rfq_id IN (SELECT id FROM public.rfqs WHERE buyer_id = auth.uid()) OR
        provider_id IN (SELECT id FROM public.provider_profiles WHERE user_id = auth.uid())
    );

-- Service role manages broadcasts
CREATE POLICY "service_manage_broadcasts" ON public.rfq_broadcasts
    FOR ALL USING (auth.role() = 'service_role');

-- =============================================
-- REVIEWS POLICIES
-- =============================================

-- Anyone authenticated can view public reviews
CREATE POLICY "view_public_reviews" ON public.reviews
    FOR SELECT USING (auth.role() = 'authenticated' AND is_public = TRUE);

-- Users can view their own reviews
CREATE POLICY "view_own_reviews" ON public.reviews
    FOR SELECT USING (
        reviewer_id = auth.uid() OR 
        reviewee_id IN (SELECT id FROM public.provider_profiles WHERE user_id = auth.uid())
    );

-- Buyers can create reviews for completed orders
CREATE POLICY "create_reviews" ON public.reviews
    FOR INSERT WITH CHECK (
        reviewer_id = auth.uid() AND
        order_id IN (SELECT id FROM public.orders WHERE buyer_id = auth.uid() AND status = 'completed')
    );

-- =============================================
-- PROVIDER RATINGS POLICIES
-- =============================================

-- Anyone authenticated can view ratings
CREATE POLICY "view_provider_ratings" ON public.provider_ratings
    FOR SELECT USING (auth.role() = 'authenticated');

-- Service role updates ratings
CREATE POLICY "service_update_ratings" ON public.provider_ratings
    FOR ALL USING (auth.role() = 'service_role');

-- =============================================
-- DISPUTES POLICIES
-- =============================================

-- Involved parties can view disputes
CREATE POLICY "view_own_disputes" ON public.disputes
    FOR SELECT USING (
        raised_by = auth.uid() OR
        order_id IN (
            SELECT id FROM public.orders 
            WHERE buyer_id = auth.uid() OR 
                  seller_id IN (SELECT id FROM public.provider_profiles WHERE user_id = auth.uid())
        )
    );

-- Users can create disputes for their orders
CREATE POLICY "create_disputes" ON public.disputes
    FOR INSERT WITH CHECK (
        raised_by = auth.uid() AND
        order_id IN (
            SELECT id FROM public.orders 
            WHERE buyer_id = auth.uid() OR 
                  seller_id IN (SELECT id FROM public.provider_profiles WHERE user_id = auth.uid())
        )
    );

-- Users can update their own disputes (add evidence)
CREATE POLICY "update_own_disputes" ON public.disputes
    FOR UPDATE USING (raised_by = auth.uid());

-- =============================================
-- NOTIFICATION PREFERENCES POLICIES
-- =============================================

-- Users can view their own preferences
CREATE POLICY "view_own_notification_preferences" ON public.notification_preferences
    FOR SELECT USING (user_id = auth.uid());

-- Users can manage their own preferences
CREATE POLICY "manage_own_notification_preferences" ON public.notification_preferences
    FOR ALL USING (user_id = auth.uid());

-- =============================================
-- NOTIFICATION LOG POLICIES
-- =============================================

-- Users can view their own notifications
CREATE POLICY "view_own_notification_log" ON public.notification_log
    FOR SELECT USING (user_id = auth.uid());

-- Service role can insert notifications
CREATE POLICY "service_insert_notifications" ON public.notification_log
    FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Users can update their own (mark as read)
CREATE POLICY "update_own_notification_log" ON public.notification_log
    FOR UPDATE USING (user_id = auth.uid());

-- =============================================
-- ADMIN USERS POLICIES
-- =============================================

-- Admins can view other admins
CREATE POLICY "admin_view_admins" ON public.admin_users
    FOR SELECT USING (
        user_id = auth.uid() OR
        EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
    );

-- Super admins manage admins (via service role)
CREATE POLICY "service_manage_admins" ON public.admin_users
    FOR ALL USING (auth.role() = 'service_role');

-- =============================================
-- ADMIN AUDIT LOG POLICIES
-- =============================================

-- Admins can view audit logs
CREATE POLICY "admin_view_audit_log" ON public.admin_audit_log
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
    );

-- Service role inserts audit logs
CREATE POLICY "service_insert_audit_log" ON public.admin_audit_log
    FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- =============================================
-- PLATFORM DISCOUNTS POLICIES
-- =============================================

-- Authenticated users can view active discounts
CREATE POLICY "view_active_discounts" ON public.platform_discounts
    FOR SELECT USING (
        auth.role() = 'authenticated' AND
        (valid_until IS NULL OR valid_until > NOW())
    );

-- Service role manages discounts
CREATE POLICY "service_manage_discounts" ON public.platform_discounts
    FOR ALL USING (auth.role() = 'service_role');

-- =============================================
-- PROVIDER PORTFOLIO POLICIES
-- =============================================

-- Anyone authenticated can view portfolios
CREATE POLICY "view_portfolios" ON public.provider_portfolio
    FOR SELECT USING (auth.role() = 'authenticated');

-- Providers manage their own portfolio
CREATE POLICY "manage_own_portfolio" ON public.provider_portfolio
    FOR ALL USING (
        provider_id IN (SELECT id FROM public.provider_profiles WHERE user_id = auth.uid())
    );

-- =============================================
-- PROVIDER CERTIFICATIONS POLICIES
-- =============================================

-- Anyone authenticated can view certifications
CREATE POLICY "view_certifications" ON public.provider_certifications
    FOR SELECT USING (auth.role() = 'authenticated');

-- Providers manage their own certifications
CREATE POLICY "manage_own_certifications" ON public.provider_certifications
    FOR ALL USING (
        provider_id IN (SELECT id FROM public.provider_profiles WHERE user_id = auth.uid())
    );

-- =============================================
-- PROVIDER BADGES POLICIES
-- =============================================

-- Anyone authenticated can view badges
CREATE POLICY "view_badges" ON public.provider_badges
    FOR SELECT USING (auth.role() = 'authenticated');

-- Service role assigns badges
CREATE POLICY "service_manage_badges" ON public.provider_badges
    FOR ALL USING (auth.role() = 'service_role');

-- =============================================
-- CONTRACT TEMPLATES POLICIES
-- =============================================

-- Authenticated users can view templates
CREATE POLICY "view_contract_templates" ON public.contract_templates
    FOR SELECT USING (auth.role() = 'authenticated');

-- Service role manages templates
CREATE POLICY "service_manage_templates" ON public.contract_templates
    FOR ALL USING (auth.role() = 'service_role');

-- =============================================
-- ORDER CONTRACTS POLICIES
-- =============================================

-- Order participants can view contracts
CREATE POLICY "view_order_contracts" ON public.order_contracts
    FOR SELECT USING (
        order_id IN (
            SELECT id FROM public.orders 
            WHERE buyer_id = auth.uid() OR 
                  seller_id IN (SELECT id FROM public.provider_profiles WHERE user_id = auth.uid())
        )
    );

-- Service role creates contracts
CREATE POLICY "service_create_contracts" ON public.order_contracts
    FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Participants can sign (update) contracts
CREATE POLICY "sign_contracts" ON public.order_contracts
    FOR UPDATE USING (
        order_id IN (
            SELECT id FROM public.orders 
            WHERE buyer_id = auth.uid() OR 
                  seller_id IN (SELECT id FROM public.provider_profiles WHERE user_id = auth.uid())
        )
    );

-- =============================================
-- ORDER DOCUMENTS POLICIES
-- =============================================

-- Order participants can view documents
CREATE POLICY "view_order_documents" ON public.order_documents
    FOR SELECT USING (
        order_id IN (
            SELECT id FROM public.orders 
            WHERE buyer_id = auth.uid() OR 
                  seller_id IN (SELECT id FROM public.provider_profiles WHERE user_id = auth.uid())
        )
    );

-- Service role creates documents
CREATE POLICY "service_create_documents" ON public.order_documents
    FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- =============================================
-- RETAINERS POLICIES
-- =============================================

-- Participants can view their retainers
CREATE POLICY "view_own_retainers" ON public.retainers
    FOR SELECT USING (
        buyer_id = auth.uid() OR 
        seller_id IN (SELECT id FROM public.provider_profiles WHERE user_id = auth.uid())
    );

-- Buyers can create retainers
CREATE POLICY "create_retainers" ON public.retainers
    FOR INSERT WITH CHECK (buyer_id = auth.uid());

-- Participants can update retainers
CREATE POLICY "update_own_retainers" ON public.retainers
    FOR UPDATE USING (
        buyer_id = auth.uid() OR 
        seller_id IN (SELECT id FROM public.provider_profiles WHERE user_id = auth.uid())
    );

-- =============================================
-- TIMESHEET ENTRIES POLICIES
-- =============================================

-- Retainer participants can view timesheets
CREATE POLICY "view_retainer_timesheets" ON public.timesheet_entries
    FOR SELECT USING (
        retainer_id IN (
            SELECT id FROM public.retainers 
            WHERE buyer_id = auth.uid() OR 
                  seller_id IN (SELECT id FROM public.provider_profiles WHERE user_id = auth.uid())
        )
    );

-- Providers can create/update timesheets
CREATE POLICY "manage_own_timesheets" ON public.timesheet_entries
    FOR ALL USING (
        retainer_id IN (
            SELECT id FROM public.retainers 
            WHERE seller_id IN (SELECT id FROM public.provider_profiles WHERE user_id = auth.uid())
        )
    );

-- Buyers can update timesheets (approve)
CREATE POLICY "approve_timesheets" ON public.timesheet_entries
    FOR UPDATE USING (
        retainer_id IN (
            SELECT id FROM public.retainers WHERE buyer_id = auth.uid()
        )
    );

-- =============================================
-- STRIPE EVENTS POLICIES
-- =============================================

-- Only service role accesses stripe events
CREATE POLICY "service_manage_stripe_events" ON public.stripe_events
    FOR ALL USING (auth.role() = 'service_role');

-- =============================================
-- TAX PROFILES POLICIES
-- =============================================

-- Providers can view/manage their tax profile
CREATE POLICY "manage_own_tax_profile" ON public.tax_profiles
    FOR ALL USING (
        provider_id IN (SELECT id FROM public.provider_profiles WHERE user_id = auth.uid())
    );

-- Service role can view all for compliance
CREATE POLICY "service_view_tax_profiles" ON public.tax_profiles
    FOR SELECT USING (auth.role() = 'service_role');

-- =============================================
-- DATA REQUESTS POLICIES
-- =============================================

-- Users can view their own data requests
CREATE POLICY "view_own_data_requests" ON public.data_requests
    FOR SELECT USING (user_id = auth.uid());

-- Users can create data requests
CREATE POLICY "create_data_requests" ON public.data_requests
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- Service role processes requests
CREATE POLICY "service_process_data_requests" ON public.data_requests
    FOR ALL USING (auth.role() = 'service_role');

-- =============================================
-- PREFERRED SUPPLIERS POLICIES
-- =============================================

-- Users can view/manage their preferred suppliers
CREATE POLICY "manage_preferred_suppliers" ON public.preferred_suppliers
    FOR ALL USING (buyer_id = auth.uid());

-- =============================================
-- MESSAGE TEMPLATES POLICIES
-- =============================================

-- Users can view system templates and their own
CREATE POLICY "view_message_templates" ON public.message_templates
    FOR SELECT USING (is_system = TRUE OR user_id = auth.uid());

-- Users can manage their own templates
CREATE POLICY "manage_own_message_templates" ON public.message_templates
    FOR ALL USING (user_id = auth.uid());

-- =============================================
-- PLATFORM METRICS POLICIES
-- =============================================

-- Only service role/admins access metrics
CREATE POLICY "admin_view_metrics" ON public.platform_metrics
    FOR SELECT USING (
        auth.role() = 'service_role' OR
        EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
    );

CREATE POLICY "service_insert_metrics" ON public.platform_metrics
    FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- =============================================
-- FRAUD SIGNALS POLICIES
-- =============================================

-- Only admins/service role access fraud signals
CREATE POLICY "admin_view_fraud_signals" ON public.fraud_signals
    FOR SELECT USING (
        auth.role() = 'service_role' OR
        EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
    );

CREATE POLICY "service_manage_fraud_signals" ON public.fraud_signals
    FOR ALL USING (auth.role() = 'service_role');

-- =============================================
-- TRANSACTION LIMITS POLICIES
-- =============================================

-- Users can view their own limits
CREATE POLICY "view_own_limits" ON public.transaction_limits
    FOR SELECT USING (user_id = auth.uid());

-- Service role manages limits
CREATE POLICY "service_manage_limits" ON public.transaction_limits
    FOR ALL USING (auth.role() = 'service_role');

-- =============================================
-- LISTING MIGRATION POLICIES
-- =============================================

-- Service role manages migration tracking
CREATE POLICY "service_manage_migration" ON public.listing_migration
    FOR ALL USING (auth.role() = 'service_role');

-- =============================================
-- ORDER TASKS POLICIES
-- =============================================

-- Order participants can view order tasks
CREATE POLICY "view_order_tasks" ON public.order_tasks
    FOR SELECT USING (
        order_id IN (
            SELECT id FROM public.orders 
            WHERE buyer_id = auth.uid() OR 
                  seller_id IN (SELECT id FROM public.provider_profiles WHERE user_id = auth.uid())
        )
    );

-- Service role creates order tasks
CREATE POLICY "service_create_order_tasks" ON public.order_tasks
    FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- =============================================
-- SECTION 6: COMMENTS
-- =============================================

COMMENT ON TABLE public.provider_profiles IS 'Links users to marketplace listings with Stripe Connect integration';
COMMENT ON TABLE public.provider_applications IS 'Supplier vetting workflow for marketplace onboarding';
COMMENT ON TABLE public.availability_slots IS 'Calendar availability for provider bookings';
COMMENT ON TABLE public.orders IS 'Central transaction record for all marketplace orders';
COMMENT ON TABLE public.order_milestones IS 'Staged payment releases for milestone-based orders';
COMMENT ON TABLE public.escrow_transactions IS 'Audit trail for all money movement through escrow';
COMMENT ON TABLE public.conversations IS 'Messaging threads between buyers and sellers';
COMMENT ON TABLE public.messages IS 'Individual messages within conversations';
COMMENT ON TABLE public.rfqs IS 'Request for Quotes - buyer requests broadcast to providers';
COMMENT ON TABLE public.rfq_responses IS 'Provider responses to RFQs';
COMMENT ON TABLE public.rfq_broadcasts IS 'Time zone-aware broadcast tracking for RFQ delivery';
COMMENT ON TABLE public.reviews IS 'Ratings and feedback for completed orders';
COMMENT ON TABLE public.provider_ratings IS 'Aggregated provider scores (materialized)';
COMMENT ON TABLE public.disputes IS 'Conflict resolution tracking';
COMMENT ON TABLE public.notification_preferences IS 'User notification channel preferences';
COMMENT ON TABLE public.notification_log IS 'Audit log of sent notifications';
COMMENT ON TABLE public.admin_users IS 'Platform administrator accounts';
COMMENT ON TABLE public.admin_audit_log IS 'Admin action audit trail';
COMMENT ON TABLE public.platform_discounts IS 'Negotiated supplier discounts';
COMMENT ON TABLE public.provider_portfolio IS 'Provider work samples and case studies';
COMMENT ON TABLE public.provider_certifications IS 'Provider credentials and certifications';
COMMENT ON TABLE public.provider_badges IS 'System-assigned achievement badges';
COMMENT ON TABLE public.contract_templates IS 'Legal document templates';
COMMENT ON TABLE public.order_contracts IS 'Generated contracts for orders';
COMMENT ON TABLE public.order_documents IS 'Invoices, receipts, and other order documents';
COMMENT ON TABLE public.retainers IS 'Ongoing retainer engagements';
COMMENT ON TABLE public.timesheet_entries IS 'Weekly time tracking for retainers';
COMMENT ON TABLE public.stripe_events IS 'Webhook idempotency tracking';
COMMENT ON TABLE public.tax_profiles IS 'VAT/tax information for providers';
COMMENT ON TABLE public.data_requests IS 'GDPR data access/deletion requests';
COMMENT ON TABLE public.preferred_suppliers IS 'Buyer favorite suppliers';
COMMENT ON TABLE public.message_templates IS 'Saved message responses';
COMMENT ON TABLE public.platform_metrics IS 'Platform health monitoring metrics';
COMMENT ON TABLE public.fraud_signals IS 'Risk detection signals';
COMMENT ON TABLE public.transaction_limits IS 'Velocity controls for transactions';
COMMENT ON TABLE public.listing_migration IS 'Tracking existing listings migration to providers';
COMMENT ON TABLE public.order_tasks IS 'Links orders to task management system';

-- =============================================
-- END OF MIGRATION
-- =============================================
