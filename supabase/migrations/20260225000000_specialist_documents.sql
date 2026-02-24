-- specialist_documents: persisted documents created by specialist tools
-- Used by the write_document tool to save analyses, reports, and deliverables.

create table if not exists specialist_documents (
    id uuid primary key default gen_random_uuid(),
    foundry_id text not null references foundries(id) on delete cascade,
    specialist_id text not null,
    title text not null,
    content text not null,
    content_type text not null default 'markdown' check (content_type in ('markdown', 'csv', 'json')),
    metadata jsonb default '{}'::jsonb,
    thread_id text,
    created_by text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Index for efficient lookups by foundry and specialist
create index if not exists idx_specialist_documents_foundry_specialist
    on specialist_documents(foundry_id, specialist_id, created_at desc);

-- RLS policy (disabled — application-level filtering via foundry_id)
alter table specialist_documents enable row level security;
