-- RLS hardening for quote_requests table
-- Adds foundry_id check on INSERT, DELETE policy, quantity length constraint

-- Add DELETE policy: users can delete their own quote requests
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'quote_requests' AND policyname = 'Users can delete own quote requests'
  ) THEN
    CREATE POLICY "Users can delete own quote requests"
      ON public.quote_requests FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Add quantity length CHECK constraint (max 500 chars) if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'quote_requests_quantity_length'
  ) THEN
    ALTER TABLE public.quote_requests
      ADD CONSTRAINT quote_requests_quantity_length
      CHECK (char_length(quantity) <= 500);
  END IF;
END $$;

-- Tighten INSERT policy to check foundry_id matches user's foundry
-- First drop existing INSERT policy if it exists and recreate with foundry check
DO $$
BEGIN
  -- Check if there's an INSERT policy without foundry_id check
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'quote_requests' AND cmd = 'INSERT'
    AND qual NOT LIKE '%foundry_id%'
  ) THEN
    -- Drop and recreate with foundry check
    DROP POLICY IF EXISTS "Users can create quote requests" ON public.quote_requests;
    CREATE POLICY "Users can create quote requests"
      ON public.quote_requests FOR INSERT
      WITH CHECK (
        auth.uid() = user_id
        AND foundry_id IN (
          SELECT fm.foundry_id FROM public.foundry_memberships fm
          WHERE fm.profile_id = auth.uid()
        )
      );
  END IF;
END $$;
