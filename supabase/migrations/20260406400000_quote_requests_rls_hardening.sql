-- Migration: Harden quote_requests RLS
-- INTENT: Add foundry_id check on INSERT (defense-in-depth against cross-foundry injection)
-- and add DELETE policy so users can remove their own quote requests.

-- Drop and recreate INSERT policy with foundry_id check
DROP POLICY IF EXISTS "Users can create quote requests" ON public.quote_requests;
CREATE POLICY "Users can create quote requests"
    ON public.quote_requests FOR INSERT
    WITH CHECK (
        user_id = auth.uid()
        AND foundry_id IN (
            SELECT fm.foundry_id FROM public.foundry_memberships fm WHERE fm.user_id = auth.uid()
        )
    );

-- Add DELETE policy
CREATE POLICY "Users can delete their own quote requests"
    ON public.quote_requests FOR DELETE
    USING (user_id = auth.uid());

-- Add quantity length check
ALTER TABLE public.quote_requests
    ADD CONSTRAINT quote_requests_quantity_length CHECK (quantity IS NULL OR length(quantity) <= 500);
