/**
 * Migration: Create whiteboards table
 *
 * Purpose: Store Excalidraw whiteboard canvas state as JSONB, linked to
 * objectives or projects within a foundry. Enables freeform visual
 * brainstorming integrated with the CentaurOS data model.
 *
 * Security:
 * - RLS policy ensures foundry-level isolation
 * - Only foundry members can view/edit whiteboards in their foundry
 * - Service role has full access for server-side operations
 *
 * Related:
 * - Frontend: src/app/(platform)/canvas/whiteboard/
 * - Actions: src/actions/whiteboards.ts
 *
 * Rollback: DROP TABLE IF EXISTS public.whiteboards CASCADE;
 */

-- Create whiteboards table
CREATE TABLE IF NOT EXISTS public.whiteboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Whiteboard metadata
  title TEXT NOT NULL DEFAULT 'Untitled Whiteboard',

  -- Optional link to parent entity (objective, project, etc.)
  linked_entity_type TEXT CHECK (linked_entity_type IN ('objective', 'project', 'general')),
  linked_entity_id UUID,

  -- Excalidraw scene state stored as JSON
  state JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Add comment
COMMENT ON TABLE public.whiteboards IS 'Stores Excalidraw whiteboard canvas state, linked to foundry entities for visual brainstorming.';

-- Enable RLS (REQUIRED)
ALTER TABLE public.whiteboards ENABLE ROW LEVEL SECURITY;

-- RLS: Foundry members can view whiteboards in their foundry
DROP POLICY IF EXISTS "foundry_members_view_whiteboards" ON public.whiteboards;
CREATE POLICY "foundry_members_view_whiteboards" ON public.whiteboards
  FOR SELECT USING (
    foundry_id IN (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
  );

-- RLS: Foundry members can create whiteboards in their foundry
DROP POLICY IF EXISTS "foundry_members_create_whiteboards" ON public.whiteboards;
CREATE POLICY "foundry_members_create_whiteboards" ON public.whiteboards
  FOR INSERT WITH CHECK (
    foundry_id IN (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    AND created_by = auth.uid()
  );

-- RLS: Foundry members can update whiteboards in their foundry
DROP POLICY IF EXISTS "foundry_members_update_whiteboards" ON public.whiteboards;
CREATE POLICY "foundry_members_update_whiteboards" ON public.whiteboards
  FOR UPDATE USING (
    foundry_id IN (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
  );

-- RLS: Creator can delete their own whiteboards
DROP POLICY IF EXISTS "creator_delete_whiteboards" ON public.whiteboards;
CREATE POLICY "creator_delete_whiteboards" ON public.whiteboards
  FOR DELETE USING (
    created_by = auth.uid()
  );

-- RLS: Service role full access
DROP POLICY IF EXISTS "service_role_whiteboards" ON public.whiteboards;
CREATE POLICY "service_role_whiteboards" ON public.whiteboards
  FOR ALL USING (auth.role() = 'service_role');

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_whiteboards_foundry_id ON public.whiteboards(foundry_id);
CREATE INDEX IF NOT EXISTS idx_whiteboards_created_by ON public.whiteboards(created_by);
CREATE INDEX IF NOT EXISTS idx_whiteboards_linked_entity ON public.whiteboards(linked_entity_type, linked_entity_id);
CREATE INDEX IF NOT EXISTS idx_whiteboards_updated_at ON public.whiteboards(updated_at DESC);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION public.update_whiteboards_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_whiteboards_updated_at ON public.whiteboards;
CREATE TRIGGER trigger_whiteboards_updated_at
  BEFORE UPDATE ON public.whiteboards
  FOR EACH ROW
  EXECUTE FUNCTION public.update_whiteboards_updated_at();
