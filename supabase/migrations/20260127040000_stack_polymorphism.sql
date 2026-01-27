-- =============================================
-- MIGRATION: Support AI Tools in Foundry Stack
-- =============================================

-- 1. Add tool_id column
ALTER TABLE public.foundry_stack
ADD COLUMN tool_id uuid REFERENCES public.ai_tools(id);

-- 2. Make provider_id nullable (since a stack item can now be just a tool)
ALTER TABLE public.foundry_stack
ALTER COLUMN provider_id DROP NOT NULL;

-- 3. Add constraint to ensure mutual exclusivity (Poly-association enforcement)
-- A stack item must correspond to EITHER a service provider OR an AI tool, not both, and not neither.
ALTER TABLE public.foundry_stack
ADD CONSTRAINT foundry_stack_item_type_check
CHECK (
    (provider_id IS NOT NULL AND tool_id IS NULL) OR 
    (provider_id IS NULL AND tool_id IS NOT NULL)
);

-- 4. Create Index for new column
CREATE INDEX idx_foundry_stack_tool_id ON public.foundry_stack(tool_id);

-- 5. No changes needed to RLS policies as they are scoped to `foundry_id` on the main table,
-- which remains unchanged. The new column is covered by existing policies.
