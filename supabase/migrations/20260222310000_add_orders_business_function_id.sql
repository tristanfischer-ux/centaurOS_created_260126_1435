-- =============================================
-- MIGRATION: Add business_function_id to orders
-- =============================================
-- The original migration (20260128100001) defined this column but it's
-- not present in the live schema. Multiple files reference it
-- (org-blueprint integration, payment flows, booking actions).

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS business_function_id UUID REFERENCES public.business_functions(id) ON DELETE SET NULL;
