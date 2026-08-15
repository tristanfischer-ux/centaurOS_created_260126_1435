-- §6.8 Phase 2: NDA flow tracking on the dossier pipeline (2026-08-15)
-- Applied to jyarhvinengfyrwgtskq via MCP apply_migration (dossier_pipeline_nda_status).
alter table public.dossier_projects
  add column nda_status text
  check (nda_status in ('requested','sent','signed'));

-- Backfill: projects that ticked the NDA box start at 'requested'
update public.dossier_projects set nda_status = 'requested' where nda_requested;
