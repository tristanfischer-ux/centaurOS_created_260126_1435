-- Tier -1 cost-logging instrumentation table.
--
-- Captures every LLM call in production with tokens in/out, model, action,
-- and cost (USD) so the founder can audit spend per foundry / per anonymous
-- visitor / per action and tune the £20 Starter / £10 add-on tier prices.
--
-- This is a CLEAN replacement for the legacy ai_usage_log + increment_ai_usage
-- RPC pipeline (which is fire-and-forget against the user-scoped Supabase
-- client and silently fails with `TypeError: fetch failed` in production).
-- The new wrapper at src/lib/cost-logging/llm-usage.ts uses the admin client
-- and writes directly to this table.
--
-- Indexed for the four most common audit queries:
--   1. all calls for a foundry sorted by recency
--   2. all calls for an anonymous visitor (pre-signup funnel)
--   3. all calls for a single action across all foundries
--   4. all calls from one IP (abuse/rate-limit forensics)

create table if not exists public.llm_usage (
  id uuid primary key default gen_random_uuid(),
  foundry_id text references public.foundries(id),
  anon_id text,
  user_id uuid references auth.users(id),
  action text not null,
  specialist_id text,
  model_used text not null,
  tokens_in int not null,
  tokens_out int not null,
  cost_usd numeric(12, 6) not null,
  status text not null default 'success'
    check (status in ('success', 'error', 'timeout', 'rate_limited')),
  error_message text,
  ip_address inet,
  created_at timestamptz not null default now()
);

create index if not exists llm_usage_foundry_created
  on public.llm_usage (foundry_id, created_at desc);

create index if not exists llm_usage_anon_created
  on public.llm_usage (anon_id, created_at desc)
  where anon_id is not null;

create index if not exists llm_usage_action_created
  on public.llm_usage (action, created_at desc);

create index if not exists llm_usage_ip_created
  on public.llm_usage (ip_address, created_at desc);

alter table public.llm_usage enable row level security;

-- service_role only — this table is audit-only and never read from the client.
-- The /admin/cost dashboard (separate task) will use the admin client to read
-- aggregates server-side.
drop policy if exists "service_role can do anything" on public.llm_usage;
create policy "service_role can do anything"
  on public.llm_usage
  for all
  using (auth.jwt() ->> 'role' = 'service_role');

comment on table public.llm_usage is
  'Tier -1 cost-logging: every LLM call writes one row. Replaces the broken ai_usage_log + increment_ai_usage RPC pipeline. Read by /admin/cost dashboard.';
