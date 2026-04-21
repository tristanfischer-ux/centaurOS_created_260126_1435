-- Adds ship-and-handoff terminal state to cad_lab_projects.
--
-- The V2 Launch page ("Ship & hand off to Operations") is the transition
-- point at which canonical ownership of a hardware product flips from
-- Forge (build-time) to Operations (post-despatch). Before this migration
-- there was no persisted "shipped" state — the Launch page rendered the
-- pre-flight checklist but the Ship button was a disabled stub because
-- no column existed to record the act.
--
-- Two additive columns:
--   - shipped_at  timestamptz — null while project is still in Forge;
--                               set once the founder hits "Ship and hand
--                               off" on the Launch page.
--   - shipped_by  uuid        — which founder clicked Ship. Foreign key
--                               to auth.users for provenance. Null when
--                               shipped_at is null.
--
-- Additive-only. No existing rows touched. No policy changes needed —
-- the same RLS that gates cad_lab_projects updates already gates these
-- columns. The shipCadLabProject server action layers a business-rule
-- check on top (brief must be locked, caller must be in the owning
-- foundry) before issuing the update.

alter table public.cad_lab_projects
    add column if not exists shipped_at timestamptz,
    add column if not exists shipped_by uuid references auth.users (id);

comment on column public.cad_lab_projects.shipped_at is
    'Timestamp when the founder clicked Ship on /launch. Null while the project is still build-time (Forge-owned). Terminal — once set, the project is read-only in Forge.';

comment on column public.cad_lab_projects.shipped_by is
    'Founder who clicked Ship. Null while shipped_at is null.';

-- Index for the "show me recently-shipped projects" query the Operations
-- dashboard will eventually need. Partial — skips the still-in-Forge rows
-- entirely so the index is small.
create index if not exists idx_cad_lab_projects_shipped_at
    on public.cad_lab_projects (shipped_at desc)
    where shipped_at is not null;
