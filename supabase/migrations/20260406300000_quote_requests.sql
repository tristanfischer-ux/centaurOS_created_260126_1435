-- Migration: quote_requests table
-- INTENT: Track quote requests sent from the marketplace to suppliers.
-- Since 0 suppliers have ForgeOS accounts, all engagement is via email.
-- This table records what was sent, to whom, and the status.

CREATE TABLE IF NOT EXISTS public.quote_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Who sent the request
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id),

    -- Which supplier listing
    listing_id UUID NOT NULL REFERENCES public.marketplace_listings(id),
    supplier_name TEXT NOT NULL,
    supplier_email TEXT, -- may be null if supplier has no contact_email

    -- Request details
    subject TEXT NOT NULL CHECK (length(subject) <= 500),
    message TEXT NOT NULL CHECK (length(message) <= 5000),
    quantity TEXT, -- free text: "100 units", "prototype", etc.
    deadline DATE,

    -- Status tracking
    status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('draft', 'sent', 'replied', 'expired', 'cancelled')),

    -- Email metadata
    email_sent_at TIMESTAMPTZ,
    email_message_id TEXT -- Resend message ID for tracking
);

-- RLS: Users can see and create their own quote requests
ALTER TABLE public.quote_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own quote requests"
    ON public.quote_requests FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can create quote requests"
    ON public.quote_requests FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own quote requests"
    ON public.quote_requests FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Indexes
CREATE INDEX idx_quote_requests_user_id ON public.quote_requests(user_id);
CREATE INDEX idx_quote_requests_listing_id ON public.quote_requests(listing_id);
CREATE INDEX idx_quote_requests_created_at ON public.quote_requests(created_at DESC);
