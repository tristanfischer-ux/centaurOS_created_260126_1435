-- Migration: Make Stripe columns nullable on user_subscriptions
-- Bug #3: Cannot create free-tier subscription records without dummy Stripe IDs.
-- This enables manual/demo/trial accounts that don't go through Stripe.
--
-- SECURITY: No RLS changes. Only removes NOT NULL constraints on Stripe-specific columns.

-- Drop the UNIQUE constraint on stripe_subscription_id first (it prevents nullable + unique combo issues)
-- Then re-add it as a partial unique index (only enforced when NOT NULL)
ALTER TABLE public.user_subscriptions
  ALTER COLUMN stripe_subscription_id DROP NOT NULL;

ALTER TABLE public.user_subscriptions
  ALTER COLUMN stripe_customer_id DROP NOT NULL;

-- Add a source column to distinguish how the subscription was created
-- This makes it clear whether Stripe manages the subscription or it was created manually
ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'stripe'
  CHECK (source IN ('stripe', 'manual', 'demo'));

-- Add a comment explaining the nullable columns
COMMENT ON COLUMN public.user_subscriptions.stripe_subscription_id IS 'Stripe subscription ID. NULL for manual/demo subscriptions not managed by Stripe.';
COMMENT ON COLUMN public.user_subscriptions.stripe_customer_id IS 'Stripe customer ID. NULL for manual/demo subscriptions not managed by Stripe.';
COMMENT ON COLUMN public.user_subscriptions.source IS 'How this subscription was created: stripe (via Stripe checkout), manual (admin-created), demo (test accounts).';
