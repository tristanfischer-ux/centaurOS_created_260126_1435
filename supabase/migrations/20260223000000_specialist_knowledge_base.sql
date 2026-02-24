-- Specialist Knowledge Base: persistent facts extracted from conversations
-- Used to give specialists memory across sessions

create table if not exists specialist_knowledge_base (
    id uuid primary key default gen_random_uuid(),
    foundry_id uuid not null references foundries(id) on delete cascade,
    specialist_id text not null,
    knowledge_type text not null check (knowledge_type in ('fact', 'preference', 'decision', 'metric', 'relationship', 'goal')),
    key text not null,
    value text not null,
    confidence float not null default 0.8 check (confidence >= 0 and confidence <= 1),
    source text, -- e.g., 'conversation', 'sweep', 'manual'
    source_thread_id uuid,
    last_updated_at timestamptz not null default now(),
    created_at timestamptz not null default now(),

    -- Prevent duplicate knowledge entries
    unique(foundry_id, specialist_id, key)
);

-- Indexes for fast lookup
create index if not exists idx_knowledge_base_foundry_specialist
    on specialist_knowledge_base(foundry_id, specialist_id);
create index if not exists idx_knowledge_base_type
    on specialist_knowledge_base(foundry_id, specialist_id, knowledge_type);

-- RLS
alter table specialist_knowledge_base enable row level security;

create policy "Users can read knowledge for their foundry"
    on specialist_knowledge_base for select
    using (foundry_id in (
        select foundry_id from profiles where id = auth.uid()
    ));

create policy "Users can insert knowledge for their foundry"
    on specialist_knowledge_base for insert
    with check (foundry_id in (
        select foundry_id from profiles where id = auth.uid()
    ));

create policy "Users can update knowledge for their foundry"
    on specialist_knowledge_base for update
    using (foundry_id in (
        select foundry_id from profiles where id = auth.uid()
    ));
