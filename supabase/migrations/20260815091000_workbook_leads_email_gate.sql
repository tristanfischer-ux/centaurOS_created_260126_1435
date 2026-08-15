-- P1-c: lightweight email capture in front of the example workbook (2026-08-15)
-- Applied to jyarhvinengfyrwgtskq via MCP apply_migration (workbook_leads_email_gate).
create table public.workbook_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null,
  source text not null default 'example-workbook',
  ip text
);
create index workbook_leads_email_idx on public.workbook_leads (email);
alter table public.workbook_leads enable row level security;
-- deny-all: writes via service-role server action only
