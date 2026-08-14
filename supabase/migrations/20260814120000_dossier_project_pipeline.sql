-- Brief-intake & project-status pipeline (§6 Phase-1 MVP, 2026-08-14)
-- Applied to jyarhvinengfyrwgtskq via MCP apply_migration (dossier_project_pipeline_phase1
-- + dossier_pipeline_private_outbound_bucket). Recorded here for provenance.
-- NOTE: named dossier_projects — public.projects already belongs to the
-- ForgeOS platform (foundry projects) and is untouched.
-- NOTE: the pre-existing PUBLIC 'dossiers' bucket serves the marketing example
-- workbook; customer dossiers use the PRIVATE 'project-dossiers' bucket.

create type public.dossier_project_status as enum (
  'submitted','validated','in_progress','in_review','ready','delivered',
  'needs_info','on_hold','declined'
);

create table public.dossier_projects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  customer_name text not null,
  customer_email text not null,
  company text,
  sector text,
  brief_text text not null,
  status public.dossier_project_status not null default 'submitted',
  status_updated_at timestamptz not null default now(),
  nda_requested boolean not null default false,
  -- 64 hex chars from two UUIDs: unguessable without a pgcrypto dependency
  access_token text not null unique
    default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  assigned_to text,
  internal_notes text
);

create index dossier_projects_status_idx on public.dossier_projects (status);
create index dossier_projects_created_idx on public.dossier_projects (created_at desc);

create table public.dossier_project_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.dossier_projects(id) on delete cascade,
  from_status public.dossier_project_status,
  to_status public.dossier_project_status not null,
  note text,
  actor text not null default 'system',
  created_at timestamptz not null default now()
);
create index dossier_project_events_project_idx on public.dossier_project_events (project_id, created_at);

create table public.dossier_project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.dossier_projects(id) on delete cascade,
  kind text not null check (kind in ('brief_attachment','dossier','other')),
  storage_path text not null,
  original_name text,
  uploaded_by text not null default 'customer',
  created_at timestamptz not null default now()
);
create index dossier_project_files_project_idx on public.dossier_project_files (project_id);

-- RLS: enabled with NO policies — anon/authenticated see nothing; every read
-- and write goes through service-role server actions (token checked in code).
alter table public.dossier_projects enable row level security;
alter table public.dossier_project_events enable row level security;
alter table public.dossier_project_files enable row level security;

-- Private storage buckets (inbound briefs, outbound customer dossiers).
insert into storage.buckets (id, name, public) values ('briefs','briefs',false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('project-dossiers','project-dossiers',false)
  on conflict (id) do nothing;
