-- Add pipeline_stage column to cad_lab_projects for the 4-stage product development flow.
-- Stages: design → specify → source → assemble → complete

CREATE TYPE public.pipeline_stage AS ENUM ('design', 'specify', 'source', 'assemble', 'complete');

ALTER TABLE public.cad_lab_projects
  ADD COLUMN pipeline_stage public.pipeline_stage NOT NULL DEFAULT 'design';

COMMENT ON COLUMN public.cad_lab_projects.pipeline_stage IS
  'Current pipeline stage in the product development flow (design → specify → source → assemble → complete)';
