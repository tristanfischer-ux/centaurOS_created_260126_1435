-- =============================================
-- MIGRATION: Secure Foundry Stack
-- =============================================

-- Enable RLS (idempotent)
ALTER TABLE public.foundry_stack ENABLE ROW LEVEL SECURITY;

-- 1. VIEW: Users can view their own foundry's stack
DROP POLICY IF EXISTS "Users can view stack in their foundry" ON public.foundry_stack;
CREATE POLICY "Users can view stack in their foundry" ON public.foundry_stack
    FOR SELECT USING (
        foundry_id = get_my_foundry_id()
    );

-- 2. INSERT: Users can add items to their foundry's stack
-- Critical: We must ensure they can only insert with THEIR OWN foundry_id
DROP POLICY IF EXISTS "Users can add to stack in their foundry" ON public.foundry_stack;
CREATE POLICY "Users can add to stack in their foundry" ON public.foundry_stack
    FOR INSERT WITH CHECK (
        foundry_id = get_my_foundry_id()
    );

-- 3. DELETE: Users can remove items from their foundry's stack
DROP POLICY IF EXISTS "Users can remove from stack in their foundry" ON public.foundry_stack;
CREATE POLICY "Users can remove from stack in their foundry" ON public.foundry_stack
    FOR DELETE USING (
        foundry_id = get_my_foundry_id()
    );

-- 4. UPDATE: Users can update status of items in their foundry's stack
DROP POLICY IF EXISTS "Users can update stack in their foundry" ON public.foundry_stack;
CREATE POLICY "Users can update stack in their foundry" ON public.foundry_stack
    FOR UPDATE USING (
        foundry_id = get_my_foundry_id()
    ) WITH CHECK (
        foundry_id = get_my_foundry_id()
    );
