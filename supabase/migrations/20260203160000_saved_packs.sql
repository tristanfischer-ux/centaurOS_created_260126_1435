-- ================================================
-- SAVED PACKS
-- ================================================
-- Allow users to save/favorite objective packs for later viewing
-- This is user-specific (not foundry-wide)

CREATE TABLE IF NOT EXISTS public.saved_packs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    pack_id uuid NOT NULL,
    -- pack_id can reference either objective_packs or subsystem_objective_packs
    -- We don't add FK constraint because packs come from multiple tables
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id, pack_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_saved_packs_user_id 
    ON public.saved_packs(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_packs_pack_id 
    ON public.saved_packs(pack_id);

-- RLS Policies
ALTER TABLE public.saved_packs ENABLE ROW LEVEL SECURITY;

-- Users can view their own saved packs
CREATE POLICY "Users can view their saved packs"
    ON public.saved_packs
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can save packs
CREATE POLICY "Users can save packs"
    ON public.saved_packs
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can unsave their own packs
CREATE POLICY "Users can unsave packs"
    ON public.saved_packs
    FOR DELETE
    USING (auth.uid() = user_id);
