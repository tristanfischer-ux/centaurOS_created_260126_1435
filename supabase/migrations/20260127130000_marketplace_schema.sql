-- =============================================
-- MIGRATION: Marketplace Schema
-- =============================================

-- 1. Create Enums
CREATE TYPE marketplace_category AS ENUM ('People', 'Products', 'Services', 'AI');

-- 2. Create Table
CREATE TABLE IF NOT EXISTS public.marketplace_listings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    category marketplace_category NOT NULL,
    subcategory TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    attributes JSONB DEFAULT '{}'::jsonb,
    image_url TEXT,
    is_verified BOOLEAN DEFAULT true
);

-- 3. Enable RLS
ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies

-- READ: Public (Authenticated Users)
DROP POLICY IF EXISTS "Global Read for Marketplace" ON public.marketplace_listings;
CREATE POLICY "Global Read for Marketplace" ON public.marketplace_listings
    FOR SELECT USING (auth.role() = 'authenticated');

-- WRITE: Service Role Only (for seeding/admin)
-- Users cannot create listings yet (it's a curated marketplace)
DROP POLICY IF EXISTS "Service Role Manage Marketplace" ON public.marketplace_listings;
CREATE POLICY "Service Role Manage Marketplace" ON public.marketplace_listings
    FOR ALL USING (auth.role() = 'service_role');
