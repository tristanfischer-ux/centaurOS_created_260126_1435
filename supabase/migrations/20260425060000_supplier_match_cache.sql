-- Phase G mirror (spec 6f): supplier match output cache.
--
-- Every paid supplier match on /the-forge-v2/projects/:id/suppliers gets a
-- Sonnet-generated "why this supplier is relevant to YOU" paragraph and three
-- tailored qualifying questions. The cost ceiling on the £20/month Starter and
-- £10/100 add-on holds only if every (project, supplier, project_context_hash)
-- triple is generated once and reused on every subsequent render. Regenerate
-- only when the project's bill of materials, brief, or constraints change
-- (driving a new context hash).
--
-- Mirrors investor_match_cache (migration 20260425050000). Same caching
-- discipline, same source-citation rule, same RLS pattern adapted from
-- foundry_memberships to the project's owning foundry via cad_lab_projects.
--
-- Applied via mcp__claude_ai_Supabase__apply_migration on 2026-04-25
-- to project jyarhvinengfyrwgtskq.

create table if not exists public.supplier_match_cache (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.cad_lab_projects(id) on delete cascade,
  -- supplier_id is text (not uuid) to mirror forge_supplier_shortlist.supplier_id,
  -- which stringifies marketplace_listings.id for legacy localStorage parity.
  supplier_id text not null,
  project_context_hash text not null,
  why_relevant text not null,
  questions_to_ask jsonb not null,           -- array of 3 question strings
  source_citations jsonb not null,           -- array of {claim, source} objects
  model_used text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_pence int not null default 0,
  created_at timestamptz not null default now(),
  unique (project_id, supplier_id, project_context_hash)
);

create index if not exists supplier_match_cache_project_created_idx
  on public.supplier_match_cache(project_id, created_at desc);

create index if not exists supplier_match_cache_lookup_idx
  on public.supplier_match_cache(project_id, supplier_id, project_context_hash);

alter table public.supplier_match_cache enable row level security;

-- RLS: foundry members of the project's owning foundry can SELECT the cache.
-- Mirrors forge_supplier_shortlist's policy pattern (project -> foundry via
-- cad_lab_projects, then foundry membership via profiles.foundry_id).
drop policy if exists "users see own foundry supplier match cache" on public.supplier_match_cache;
create policy "users see own foundry supplier match cache"
  on public.supplier_match_cache
  for select
  using (
    exists (
      select 1
      from public.cad_lab_projects p
      where p.id = supplier_match_cache.project_id
        and p.foundry_id = (
          select profiles.foundry_id
          from public.profiles
          where profiles.id = auth.uid()
        )
    )
  );

-- INSERT is service-role-only — the generator runs server-side via the
-- admin client; users never write directly.
drop policy if exists "service_role inserts supplier match cache" on public.supplier_match_cache;
create policy "service_role inserts supplier match cache"
  on public.supplier_match_cache
  for insert
  with check (auth.jwt()->>'role' = 'service_role');

comment on table public.supplier_match_cache is
  'Cache of generated why-relevant + three-questions outputs per (project, supplier, project_context_hash). RED-TEAM-PIVOT-PLAN spec 6f, Phase G mirror, 2026-04-25.';
comment on column public.supplier_match_cache.project_context_hash is
  'sha256 hex digest of the canonical project context string (subject, target industry, mission, BOM summary, module count, cost ceiling). Regenerate row when this changes.';
comment on column public.supplier_match_cache.questions_to_ask is
  'JSONB array of exactly three qualifying-question strings tailored to this (project, supplier) pair.';
comment on column public.supplier_match_cache.source_citations is
  'JSONB array of {claim, source} objects. claim is a sentence from why_relevant, source names which supplier-profile or project-spec field it was drawn from.';
