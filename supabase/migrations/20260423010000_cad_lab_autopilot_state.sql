-- Adds autopilot_state jsonb to cad_lab_projects.
--
-- The V2 Autopilot feature walks a locked brief through the whole pipeline
-- (Chase → Max → BOM → Finn → illustration → suppliers → Fang reviews) in
-- one click. Vercel's 300s per-function cap makes the walk impossible in a
-- single request, so we split it into stages chained via next/server's
-- after(). Each stage writes its progress back to this column so the UI
-- can render an honest status without polling pipeline_runs for every
-- specialist.
--
-- Shape (enforced in application code, not SQL):
--   {
--     started_at: iso8601,
--     stage: string,                    // current stage slug
--     completed_stages: string[],       // stages that landed cleanly
--     failed_stages: string[],          // stages that landed with an error
--     error?: string,                   // last error message (nullable)
--     finished_at: string | null,       // iso8601 when either all stages
--                                       // complete OR a stage fails. null
--                                       // while autopilot is running.
--   }
--
-- Null when the project has never had autopilot invoked. The UI reads
-- `autopilot_state IS NULL` as "Run autopilot" CTA and a populated object
-- as "running" or "finished" depending on finished_at.
--
-- Additive-only. No existing rows touched. RLS unchanged — the column is
-- guarded by the same cad_lab_projects policies that gate every other
-- column on the row. The startAutopilot server action layers a
-- foundry-ownership check on top before issuing the first update.

alter table public.cad_lab_projects
    add column if not exists autopilot_state jsonb;

comment on column public.cad_lab_projects.autopilot_state is
    'Autopilot pipeline progress object. NULL = never run. Populated while running; finished_at stamped when the walk ends (completed or failed). See src/actions/forge-v2-autopilot.ts for the shape contract.';
