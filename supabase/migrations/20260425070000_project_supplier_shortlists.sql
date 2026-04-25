-- Supplier stickiness rebuild — Tier 4 step 19 of RED-TEAM-PIVOT-PLAN.md
--
-- Three tables + one column:
--   1. project_supplier_shortlists  — per-project supplier roster with status enum
--   2. supplier_quotes              — quote-tracking ledger per shortlisted supplier
--   3. procurement_diary_entries    — free-text changelog per project
--   4. cad_lab_projects.target_launch_date — for lead-time alert computation
--
-- Applied via mcp__claude_ai_Supabase__apply_migration on 2026-04-25
-- to project jyarhvinengfyrwgtskq.

-- ── 1. Enum type (DO block because CREATE TYPE has no IF NOT EXISTS) ──────
do $$ begin
  create type public.supplier_shortlist_status as enum (
    'researching',
    'contacted',
    'quoting',
    'negotiating',
    'selected',
    'rejected'
  );
exception when duplicate_object then null;
end $$;

-- ── 2. project_supplier_shortlists ─────────────────────────────────────

create table if not exists public.project_supplier_shortlists (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.cad_lab_projects(id) on delete cascade,
  -- supplier_id is text to mirror forge_supplier_shortlist.supplier_id
  -- (marketplace_listings.id stringified for localStorage parity)
  supplier_id text not null,
  supplier_name text not null,
  added_by_user_id uuid not null references auth.users(id),
  status public.supplier_shortlist_status not null default 'researching',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, supplier_id)
);

create index if not exists project_supplier_shortlists_project_idx
  on public.project_supplier_shortlists(project_id, created_at desc);

create index if not exists project_supplier_shortlists_supplier_idx
  on public.project_supplier_shortlists(supplier_id);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists project_supplier_shortlists_updated_at
  on public.project_supplier_shortlists;
create trigger project_supplier_shortlists_updated_at
  before update on public.project_supplier_shortlists
  for each row execute procedure public.set_updated_at();

alter table public.project_supplier_shortlists enable row level security;

drop policy if exists "foundry members manage own project supplier shortlists"
  on public.project_supplier_shortlists;
create policy "foundry members manage own project supplier shortlists"
  on public.project_supplier_shortlists
  for all
  using (
    exists (
      select 1
      from public.cad_lab_projects p
      where p.id = project_supplier_shortlists.project_id
        and p.foundry_id = (
          select profiles.foundry_id
          from public.profiles
          where profiles.id = auth.uid()
        )
    )
  )
  with check (
    exists (
      select 1
      from public.cad_lab_projects p
      where p.id = project_supplier_shortlists.project_id
        and p.foundry_id = (
          select profiles.foundry_id
          from public.profiles
          where profiles.id = auth.uid()
        )
    )
  );

comment on table public.project_supplier_shortlists is
  'Per-project supplier shortlist with procurement status workflow. RED-TEAM-PIVOT-PLAN Tier 4 step 19, 2026-04-25.';

-- ── 3. supplier_quotes ──────────────────────────────────────────────────

create table if not exists public.supplier_quotes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.cad_lab_projects(id) on delete cascade,
  supplier_id text not null,
  quote_amount_pence bigint,
  currency text not null default 'GBP',
  volume int,
  lead_time_days int,
  valid_until date,
  terms text,
  received_at date,
  notes text,
  created_at timestamptz not null default now(),
  created_by_user_id uuid not null references auth.users(id)
);

create index if not exists supplier_quotes_project_supplier_idx
  on public.supplier_quotes(project_id, supplier_id, created_at desc);

create index if not exists supplier_quotes_project_idx
  on public.supplier_quotes(project_id, created_at desc);

alter table public.supplier_quotes enable row level security;

drop policy if exists "foundry members manage own project supplier quotes"
  on public.supplier_quotes;
create policy "foundry members manage own project supplier quotes"
  on public.supplier_quotes
  for all
  using (
    exists (
      select 1
      from public.cad_lab_projects p
      where p.id = supplier_quotes.project_id
        and p.foundry_id = (
          select profiles.foundry_id
          from public.profiles
          where profiles.id = auth.uid()
        )
    )
  )
  with check (
    exists (
      select 1
      from public.cad_lab_projects p
      where p.id = supplier_quotes.project_id
        and p.foundry_id = (
          select profiles.foundry_id
          from public.profiles
          where profiles.id = auth.uid()
        )
    )
  );

comment on table public.supplier_quotes is
  'Quote-tracking ledger: structured fields per received quote, scoped to (project, supplier). RED-TEAM-PIVOT-PLAN Tier 4 step 19, 2026-04-25.';
comment on column public.supplier_quotes.quote_amount_pence is
  'Quote value in pence (integer arithmetic avoids float rounding). Null when founder logs without a price yet.';

-- ── 4. procurement_diary_entries ────────────────────────────────────────

create table if not exists public.procurement_diary_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.cad_lab_projects(id) on delete cascade,
  author_user_id uuid not null references auth.users(id),
  entry text not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists procurement_diary_entries_project_idx
  on public.procurement_diary_entries(project_id, occurred_at desc);

alter table public.procurement_diary_entries enable row level security;

drop policy if exists "foundry members manage own procurement diary"
  on public.procurement_diary_entries;
create policy "foundry members manage own procurement diary"
  on public.procurement_diary_entries
  for all
  using (
    exists (
      select 1
      from public.cad_lab_projects p
      where p.id = procurement_diary_entries.project_id
        and p.foundry_id = (
          select profiles.foundry_id
          from public.profiles
          where profiles.id = auth.uid()
        )
    )
  )
  with check (
    exists (
      select 1
      from public.cad_lab_projects p
      where p.id = procurement_diary_entries.project_id
        and p.foundry_id = (
          select profiles.foundry_id
          from public.profiles
          where profiles.id = auth.uid()
        )
    )
  );

comment on table public.procurement_diary_entries is
  'Free-text procurement diary: reverse-chronological changelog per project. RED-TEAM-PIVOT-PLAN Tier 4 step 19, 2026-04-25.';

-- ── 5. target_launch_date column on cad_lab_projects ────────────────────

alter table public.cad_lab_projects
  add column if not exists target_launch_date date;

comment on column public.cad_lab_projects.target_launch_date is
  'Target launch date. Used by supplier lead-time alert system to compute buffer weeks until launch. RED-TEAM-PIVOT-PLAN Tier 4 step 19, 2026-04-25.';
