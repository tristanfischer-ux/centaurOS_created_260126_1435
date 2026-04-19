# PLAN-SCHEMA.md

Canonical data model for the ForgeOS **Plan** section (Phase 3 of the 4-phase redesign). Owned by the Plan terminal. Consumes shared entities from `SHARED-SCHEMA.md` (foundries, foundry_memberships, audit_log, event_log, projects, project_transitions) — never duplicates them.

> **Status:** Prep draft · pre-code · 2026-04-19.
> **Reference implementations:** MONEY-SCHEMA.md (same contract shape, different section) · SHARED-SCHEMA.md (tenancy, ownership rules).
> **Consumers:** build terminal implementing `feat/plan-redesign` reads §0 conventions, §A legacy-data-preservation, §1–§13 tables, §14 Today signal contract, §15 audit_log entity_types, §16 permissions matrix, §17 ambiguities. Every `CREATE TABLE` migration must cite the section it originates from.

---

## 0 · Conventions (inherited from SHARED-SCHEMA)

- All tables: `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- All tables: `foundry_id text NOT NULL REFERENCES foundries(id) ON DELETE CASCADE` unless stated
- All tables: `created_at / updated_at timestamptz NOT NULL DEFAULT now()` with `public.update_updated_at_column()` trigger
- All tables: **RLS ENABLED** with foundry-scoped policy plus fractional-scoped overlay where called out
- User FKs name the column `user_id` when referencing `auth.users.id` (not `profile_id` — aligning with SHARED-SCHEMA §0). The existing Plan mockups use `profile_id`; that was pre-SHARED-SCHEMA drafting — use `user_id` in code
- Soft delete (`deleted_at timestamptz NULL`) on user-facing tables; hard delete on log tables
- FK columns named `<table_singular>_id`
- Plan writes `audit_log` entries for every state-changing mutation; writes `event_log` entries only for attention-worthy events per §14
- Section label in both shared logs: `section = 'plan'`

---

## A · 7 → 3 IA collapse + legacy data preservation

**The single hardest constraint in Phase 3.** PHASE-PLAN.md §Phase 3 §Data-preservation rule states: *"No redesign phase is allowed to delete, orphan, or hide existing user data. This overrides every other consideration."* Plan is "trickiest" because 7 current legacy routes all carry user data.

### A.1 · Sidebar mapping (old 7 → new 3)

| Legacy sidebar item | Legacy route (file path) | Holds user data in tables | New sidebar item | New route | Absorption pattern |
|---|---|---|---|---|---|
| Strategy | `src/app/(platform)/strategy/page.tsx` | `objectives` (rows w/ `is_strategic_goal=true`), `business_plan_snapshots`, `foundries.strategy_data`, `profiles.*` | **Plan** | `/plan` | Pillars + strategic goals absorbed into Plan workspace. `is_strategic_goal` flag migrated into new `strategic_goals` table via §A.4. |
| Objectives | `src/app/(platform)/new-objectives/page.tsx` (href `/new-objectives`) | `objectives`, `tasks`, `work_edges`, `teams`, `products` | **Plan** | `/plan` (and `/plan/goal/[id]`) | Board/tree/gantt views collapse into Plan workspace side-drawer; data stays in `objectives` table. New `strategic_goals` + `disprove_assumptions` tables layer on top (non-destructive). |
| Tasks | `src/app/(platform)/new-tasks/page.tsx` (href `/new-tasks`) | `tasks`, `task_assignees`, `task_files`, `messages` | **Plan** | `/plan` + `/plan/task/[id]` | List/board/focus views collapse into Plan; tasks table untouched; `is_draft / is_pinned / horizon / origin` added in §A.5. |
| Review | `src/app/(platform)/review/page.tsx` | `agent_artifacts`, `agent_artifact_versions`, `tasks` (Draft%), `agent_action_log` | **Plan** (as "Waiting on you" signal rail) | `/plan#waiting` | Review queue absorbs into Plan signal rail + Today V3 Plan panel (per SHARED-SCHEMA §1.4 event_log). Sub-route `/plan/review` redirects to Plan workspace with `?tab=waiting`. |
| Reports | `src/app/(platform)/reports/page.tsx` | `report_snapshots` (incl. `report_type='red-team-debate'`), `scheduled_reports` | **Report** | `/plan/report` + `/plan/report/[id]` | Existing `report_snapshots` rows preserved verbatim. New `reports_sent` table (§12) is additive — only new sends write here; legacy `report_snapshots` reads remain read-compatible for the history browser. |
| Red Team | `src/app/(platform)/red-team/page.tsx` | `report_snapshots` where `report_type='red-team-debate'`, `/api/red-team/generate` SSE route, `objectives` (via `createRedTeamActions`), `tasks` (via `createRedTeamActions`) | **Plan** (inline, not its own route) + **History** (archive) | Pressure-test modal launched from `/plan/goal/[id]`; transcript persisted in new `pressure_test_sessions` table (§10) | Legacy route kept as redirect to new modal. Existing `report_snapshots` red-team rows: backfilled into `pressure_test_sessions` via one-time script; original rows retained as archived `report_snapshots`. SSE route `/api/red-team/generate` REUSED. |
| Knowledge | `src/app/(platform)/knowledge/page.tsx` | `knowledge_notes`, `knowledge_domains`, `knowledge_links` (with pgvector embeddings), `business_plan_snapshots` | **History** | `/plan/history` (+ `/plan/history/[id]`) | `knowledge_*` tables preserved verbatim. New `history_entries` table (§9) layers on top — auto-populated decision log, searchable alongside legacy knowledge notes through a unified search view. Knowledge-decay + re-embed crons keep running. |

**Sidebar source of truth:** the mapping above drives the Phase 3 edits to `src/components/sidebar/data/plan.ts`. 7 items become 3 items. Nothing is removed from the database.

### A.2 · Data-preservation contract (per-table)

Every legacy table must remain readable in its original shape, indefinitely. Phase 3 is **purely additive** at the database layer:

| Legacy table | Phase 3 treatment | Rollback behaviour |
|---|---|---|
| `objectives` | Preserved verbatim. New FK `strategic_goal_id uuid NULL REFERENCES strategic_goals(id)` added (nullable, default NULL — old rows unaffected). `is_strategic_goal=true` rows backfilled into `strategic_goals` via one-time script (§A.4). | If `new_plan_experience` flag flips OFF, legacy `/new-objectives` UI reads `objectives` directly; backfilled `strategic_goals` rows are invisible but harmless. |
| `tasks` | Preserved. Columns added per §A.5. No data loss. | Flag off → `/new-tasks` UI reads legacy columns; new columns ignored. |
| `task_assignees`, `task_files`, `messages` | Untouched. New `task_assignees` rows use same schema. | N/A |
| `report_snapshots` | Preserved. New sends write to `reports_sent` (§12) AND `report_snapshots` for backward compat during transition. Cleanup follow-up 30+ days post-launch. | Flag off → `/reports` UI reads `report_snapshots` directly. |
| `agent_artifacts`, `agent_artifact_versions`, `agent_action_log` | Preserved. Surfaced via Plan signal rail instead of `/review` page. | Flag off → `/review` UI still functional. |
| `knowledge_notes`, `knowledge_domains`, `knowledge_links` | Preserved. Cron jobs (`knowledge-decay`, `re-embed-techniques`) untouched. Unified search view UNIONs `knowledge_notes` with `history_entries` for `/plan/history`. | Flag off → `/knowledge` UI functional. |
| `business_plan_snapshots` | Preserved. `getLastAnalyzedAt()` surfaced on Plan workspace hero. | N/A |
| `foundries.strategy_data` (jsonb) | Preserved. Data NOT migrated out — still read by legacy `/strategy` page. New Plan workspace reads `strategic_goals` primarily and falls back to `strategy_data` where `strategic_goals` is empty for a foundry. | N/A |
| `strategy_pillars` | **Preserved verbatim.** SHARED-SCHEMA §2 names this as a Plan-owned shared table. Phase 3 does NOT alter, absorb, or surface it. A follow-up focused PR decides its V2 home. No schema change, no RLS change, no write path change in Phase 3. | Flag off → legacy surface unchanged. Flag on → pillars remain readable via legacy route; new Plan workspace surfaces pillars only if/when the follow-up PR lands. |
| `review_cycles` | **Preserved verbatim.** SHARED-SCHEMA §2 names this as a Plan-owned shared table. Phase 3 does NOT alter, absorb, or surface it. `/review` absorption (signal rail) uses `agent_artifacts` + `agent_action_log` + `tasks` — NOT `review_cycles`. A follow-up focused PR decides `review_cycles`'s V2 home. | Flag off → legacy `/review` unchanged. Flag on → table stays readable; no Phase 3 surface reads or writes it. |

**Rule:** no `DROP TABLE`, no `DROP COLUMN`, no destructive migration in Phase 3. Deprecation is UX-level (sidebar absorbs items, routes redirect), not schema-level.

### A.3 · Legacy route redirect policy

**Precondition — redirects activate only when Chunks B and C have merged, NOT on Chunk A flag flip.** Chunk A merges the empty Plan route shells plus the feature flag; it does NOT enable redirects. If `new_plan_experience` flips ON for a test account after Chunk A but before Chunk B, legacy routes continue to render normally — the flag has no observable effect until Chunk B's workspace UI lands. The redirect middleware ships with Chunk E (see HANDOVER Chunk E) and checks two conditions: (1) the flag is ON for the user AND (2) the destination `/plan/...` route renders a non-stub component. Both must be true before the 301 fires.


| Legacy path | Phase 3 response when `new_plan_experience` flag ON | When flag OFF |
|---|---|---|
| `/strategy` | Server redirect 301 → `/plan` | Original page renders |
| `/new-objectives`, `/objectives/[id]`, `/objectives` | 301 → `/plan` (drill to Goal via `?goal=<id>` if drill-in URL) | Original page renders |
| `/new-tasks`, `/tasks`, `/tasks/[id]` | 301 → `/plan?task=<id>` opens task drawer | Original page renders |
| `/review`, `/review/preview/[id]` | 301 → `/plan?tab=waiting` | Original page renders |
| `/reports`, `/reports/[id]` | 301 → `/plan/report` (respectively `/plan/report/[id]`) | Original page renders |
| `/red-team`, `/red-team/[id]` | 301 → `/plan` with pressure-test modal opened; past debates reachable at `/plan/history?type=pressure_test` | Original page renders |
| `/knowledge`, `/knowledge/[id]` | 301 → `/plan/history` (respectively `/plan/history/[id]`) with `?source=knowledge` param | Original page renders |
| `/api/red-team/generate` (SSE) | **Route unchanged.** Consumed by new modal too. | Unchanged. |
| Cron routes (`/api/cron/knowledge-decay`, `/api/cron/re-embed-techniques`, `/api/cron/reports`, `/api/cron/scheduled-reports`, `/api/cron/report-downloads-cleanup`, `/api/cron/agent-sweep`, `/api/cron/weekly-synthesis`, `/api/cron/morning-brief`, `/api/cron/morning-digest`, `/api/cron/decision-followups`, `/api/cron/specialist-briefings`, `/api/cron/telegram-briefings`) | **All unchanged.** They write to preserved tables. | Unchanged. |

### A.4 · One-time backfill: `objectives.is_strategic_goal=true` → `strategic_goals`

Runs once during Phase 3 migration. **Idempotency is enforced by `strategic_goals.source_objective_id uuid NULL UNIQUE`**, which is the FK back to the legacy `objectives.id`. Title-based deduplication was considered and rejected — foundries have duplicate titles across quarters and `created_at` is second-precision so collisions exist.

Schema precondition on `strategic_goals` (part of the Phase 3 migration):
```sql
ALTER TABLE strategic_goals
  ADD COLUMN IF NOT EXISTS source_objective_id uuid NULL REFERENCES objectives(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS strategic_goals_source_objective_id_uniq
  ON strategic_goals(source_objective_id) WHERE source_objective_id IS NOT NULL;
```

Backfill SQL:
```sql
INSERT INTO strategic_goals (id, foundry_id, title, description, state, quarter, milestone_date, created_by, created_at, updated_at, source_objective_id)
SELECT
  gen_random_uuid(),
  o.foundry_id,
  o.title,
  o.description,
  CASE o.status
    WHEN 'completed' THEN 'completed'::goal_state
    WHEN 'cancelled' THEN 'killed'::goal_state
    ELSE 'active'::goal_state END,
  COALESCE(o.metadata->>'quarter', to_char(now(), '"Q"Q YYYY')),
  COALESCE((o.metadata->>'target_date')::date, (now() + interval '90 days')::date),
  o.created_by,
  o.created_at,
  o.updated_at,
  o.id
FROM objectives o
WHERE o.is_strategic_goal = true
  AND o.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM strategic_goals sg WHERE sg.source_objective_id = o.id
  );
```

No row deletion. Legacy `objectives` rows keep `is_strategic_goal=true`; `strategic_goals.source_objective_id` is the traceable link for provenance pills, unified reads, and eventual (post-V1) cleanup. A view (`strategic_goals_unified`) UNIONs both for belt-and-braces reads during the transition. Re-running the backfill is a no-op because every backfilled row has a unique `source_objective_id`.

### A.5 · Additive columns on `tasks`

```sql
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS strategic_goal_id uuid NULL REFERENCES strategic_goals(id),
  ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS horizon text NULL CHECK (horizon IN ('this_week','this_month','later','done')),
  ADD COLUMN IF NOT EXISTS origin text NULL,
  ADD COLUMN IF NOT EXISTS origin_ref text NULL;

-- Backfill draft detection from legacy `[Draft]%` title convention used by Review
UPDATE tasks SET is_draft = true WHERE title LIKE '[Draft]%' AND is_draft = false;
```

All nullable / defaulted — old code paths unaffected.

---

## 1 · `strategic_goals`

The top-level Strategic Goal — pinnable, quarter-scoped, with a disprove test.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `foundry_id` | text NOT NULL | FK → foundries |
| `title` | text NOT NULL | Max 200 chars (app-enforced) |
| `description` | text NULL | Plain text, optional |
| `state` | enum `goal_state` | `draft · active · at_risk · off_track · on_track · killed · pivoted · completed` |
| `is_pinned` | boolean NOT NULL DEFAULT false | Only 3 pinned at a time (enforced app-side + partial unique index) |
| `pin_order` | smallint NULL | 1–3 when pinned, NULL otherwise |
| `quarter` | text NOT NULL | Format "Q2 2026" |
| `milestone_date` | date NOT NULL | Target close date |
| `started_at` | date NULL | When first pinned |
| `lead_user_id` | uuid NULL | → auth.users.id (founder, fractional, or executive member) |
| `lead_fractional_id` | uuid NULL | → fractional_executives.id (external humans) |
| `lead_specialist_slug` | text NULL | → specialist_profiles.slug (built-in 13) |
| `purpose_connection` | text NULL | How it ladders to foundry purpose |
| `state_overridden_until` | timestamptz NULL | Manual `state` override expiry — specialist-derived states resume after (resolves §17.1) |
| `created_by` | uuid NOT NULL | → auth.users.id |
| `created_at`, `updated_at`, `deleted_at` | timestamptz | Standard |

**Check:** exactly one of `lead_user_id / lead_fractional_id / lead_specialist_slug` is non-null.

**Partial unique index for pin constraint:**
```sql
CREATE UNIQUE INDEX strategic_goals_pin_slot ON strategic_goals (foundry_id, pin_order)
  WHERE is_pinned = true AND deleted_at IS NULL;
```

**Indexes:** `(foundry_id, is_pinned, pin_order)` · `(foundry_id, state, milestone_date)` · `(foundry_id, deleted_at)` partial WHERE deleted_at IS NULL.

**RLS:**
- Founders/executives/cto see all goals in the foundry
- Fractionals see only goals they're on (via `goal_team_assignments`) — see §16
- Observers see only goals with `state != 'draft'` in foundries where they're an observer
- `FOR ALL USING (foundry_id IN (SELECT foundry_id FROM foundry_memberships WHERE user_id = auth.uid() AND active = true))` is the base policy; fractional/observer overlays layer in §16

**Notes:**
- Pin/unpin is a separate mutation from create/delete (per Tristan's "pin ≠ create" rule)
- `state` transitions are explicit; no implicit derivation. A gutcheck sets `at_risk` → `on_track` etc.

---

## 2 · `disprove_assumptions`

The 3-assumption disprove test per Strategic Goal.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `goal_id` | uuid NOT NULL | FK → strategic_goals, ON DELETE CASCADE |
| `order_index` | smallint NOT NULL | 1-3 typically; CHECK 1-5 max |
| `assumption` | text NOT NULL | The claim ("we get 3 term sheets by 30 Jun") |
| `current_state` | enum `assumption_state` | `holding · slipping · broken · unknown` |
| `last_refreshed_at` | timestamptz NULL | When state was last updated |
| `refreshed_by` | text NULL | `auto_specialist` · `founder` · `gutcheck` |
| `fresh_data_json` | jsonb NULL | Snapshot of data used to set current_state |

**Indexes:** `(goal_id, order_index)` unique.

**RLS:** inherits from parent goal via `EXISTS (SELECT 1 FROM strategic_goals g WHERE g.id = disprove_assumptions.goal_id AND <goal RLS predicate>)`.

---

## 3 · `objectives` (existing table — additive columns only)

Phase 3 adds one FK column to the existing `objectives` table:

```sql
ALTER TABLE objectives
  ADD COLUMN IF NOT EXISTS strategic_goal_id uuid NULL REFERENCES strategic_goals(id) ON DELETE SET NULL;
```

All other columns on `objectives` remain as-is. No row deletion. The new Plan workspace reads `objectives WHERE strategic_goal_id IS NOT NULL` to build the goal-grouped view; legacy `new-objectives` continues to read regardless of the new FK.

**Assumption text:** stored in `objectives.metadata->>'assumptions'` as an array (lighter than a second table). If richer state-tracking becomes necessary later, migrate to a new `objective_assumptions` table in a focused PR (noted in §17).

---

## 4 · `tasks` (existing table — additive columns only)

Per §A.5 above, 6 nullable columns added. No row migration. `horizon` is app-derived initially from `due_date` — not retro-populated.

**RLS:** existing foundry-scope + fractional overlay (see §16).

---

## 5 · `task_assignees` (existing table, reused)

Current shape is compatible with Plan's needs. No schema change. The existing columns that Plan relies on:
- `task_id uuid`
- `user_id uuid NULL` (for humans on the platform)
- `specialist_slug text NULL` (for built-in 13)
- `role text NULL`

Plan introduces `fractional_id uuid NULL` IF current schema lacks it:
```sql
ALTER TABLE task_assignees
  ADD COLUMN IF NOT EXISTS fractional_id uuid NULL REFERENCES fractional_executives(id);
-- Revise existing CHECK to include fractional branch
```
Build terminal: verify current shape before migrating. If this column already exists, skip.

---

## 6 · `fractional_executives`

Human fractional pool. One row per person, potentially shared across foundries (the network). **NO `foundry_id`** — this table is the fractional-person, not an engagement.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid NULL | → auth.users.id if they have a ForgeOS login; NULL if contactable via email only |
| `display_name` | text NOT NULL | |
| `email` | text NOT NULL UNIQUE | |
| `specialisation` | enum `fractional_specialisation` | `fundraising · legal · cto · people · cfo · marketing · product · sales · operations · advisory · other` |
| `bio_short` | text NULL | |
| `bio_long` | text NULL | |
| `avatar_gradient` | text NULL | CSS gradient for deterministic avatar rendering |
| `network_listed` | boolean NOT NULL DEFAULT false | `true` = in Fractional Forge network; `false` = private hire |
| `default_retainer_monthly` | integer NULL | GBP |
| `default_hours_weekly` | smallint NULL | |
| `response_time_avg_hours` | numeric NULL | Computed statistic |
| `reply_rate` | numeric NULL | 0–1 |
| `created_at / updated_at` | timestamptz | |

**RLS:** `network_listed = true` visible to every authenticated user. `network_listed = false` visible only to foundries that have an active `fractional_engagements` row for this person.

---

## 7 · `fractional_engagements`

The per-foundry relationship record.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `foundry_id` | text NOT NULL | |
| `fractional_id` | uuid NOT NULL | → fractional_executives |
| `role_in_foundry` | text NOT NULL | Free-text ("Fractional Fundraising" etc.) |
| `hours_per_week` | smallint NOT NULL | |
| `hours_used_this_week` | numeric NOT NULL DEFAULT 0 | Reset Monday 00:00 UTC by cron — resolves §17.3 |
| `retainer_monthly` | integer NOT NULL | GBP |
| `started_on` | date NOT NULL | |
| `ended_on` | date NULL | |
| `status` | enum `engagement_status` | `pending_accept · active · ended · on_hold` |
| `working_style` | enum `working_style` | `proactive · responsive · blended` |
| `notice_period_days` | smallint NOT NULL DEFAULT 30 | |

**Indexes:** `(foundry_id, status)` · `(fractional_id)`.

**RLS:** foundry-scoped. Fractional can read their own engagement via `fractional_executives.user_id = auth.uid()`.

---

## 8 · `goal_team_assignments`

Who is on which goal.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `goal_id` | uuid NOT NULL | → strategic_goals |
| `assignee_type` | enum `assignee_type` | `user · fractional · specialist · observer` |
| `user_id / fractional_id / specialist_slug` | NULL-with-CHECK | Exactly one non-null |
| `role_on_goal` | text | `lead · supporting · reviewer · observer` |
| `added_at` | timestamptz | |
| `added_by` | uuid | |

**Indexes:** `(goal_id)` · `(fractional_id)` · `(specialist_slug)`.

**RLS:** inherits from goal.

---

## 9 · `history_entries`

Auto-populated decision/event log. Fed by every mutating server action across the Plan section + a one-time backfill from `knowledge_notes`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `foundry_id` | text NOT NULL | |
| `entry_type` | enum `history_entry_type` | `decision · pressure_test · update_sent · goal_pinned · goal_state_changed · specialist_rec_accepted · specialist_rec_rejected · gutcheck_outcome · manual` |
| `title` | text NOT NULL | |
| `body` | text NULL | Rich narrative |
| `actor_type` | enum `actor_type` | `founder · fractional · specialist · system` |
| `actor_id` | text NULL | uuid for human, specialist_slug for specialist |
| `goal_id` | uuid NULL | → strategic_goals |
| `related_ids_json` | jsonb NULL | `{objective_ids[], task_ids[], pressure_test_id, ...}` |
| `outcome` | enum `outcome_state` NULL | `positive · negative · pending · neutral` |
| `outcome_note` | text NULL | |
| `outcome_revisit_at` | timestamptz NULL | Cron prompt to revisit |
| `alternatives_json` | jsonb NULL | For decisions: `[{name, why_rejected}]` |
| `grounding_text` | text NULL | "Sage read X + Y · confidence: high" |
| `edit_log_json` | jsonb NULL | Append-only edit history (resolves §17.5) |
| `created_at` | timestamptz | |

**Indexes:** `(foundry_id, entry_type, created_at DESC)` · `(goal_id)` · GIN on `related_ids_json` · full-text on `(title || ' ' || coalesce(body,''))`.

**RLS:** foundry-scoped. Hard delete forbidden at policy level (`WITH CHECK (false)` on DELETE). `body` edits allowed within 5 min of creation; afterwards appends to `edit_log_json`.

---

## 10 · `pressure_test_sessions`

Red-team debate artefacts. **Replaces the legacy pattern of storing debates in `report_snapshots` WHERE `report_type='red-team-debate'`.** Legacy rows backfilled; table is canonical going forward.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `foundry_id` | text NOT NULL | |
| `goal_id` | uuid NULL | |
| `subject_type` | enum `pressure_subject_type` | `goal · objective · report_draft · custom` |
| `subject_ref` | uuid NULL | |
| `subject_snapshot` | jsonb NOT NULL | Frozen state at debate start |
| `personas_used` | text[] NOT NULL | `{bull,bear,realist,disruptor,wildcard}` |
| `human_reviewers_json` | jsonb NULL | |
| `rounds` | smallint NOT NULL | |
| `transcript_json` | jsonb NOT NULL | Per-round per-persona messages |
| `tensions_json` | jsonb NULL | Summarised conflicts |
| `verdict` | enum `pressure_verdict` | `proceed · proceed_with_mitigations · pivot · kill · inconclusive` |
| `verdict_body` | text NULL | |
| `recommended_actions_json` | jsonb NULL | |
| `legacy_report_snapshot_id` | uuid NULL | FK to the backfilled `report_snapshots` row if migrated from legacy |
| `created_at` | timestamptz | |

**Indexes:** `(foundry_id, goal_id, created_at DESC)`.

**SSE source route:** `/api/red-team/generate` REUSED as-is; the handler writes to both `report_snapshots` AND `pressure_test_sessions` during transition, then to `pressure_test_sessions` only after legacy route is decommissioned.

---

## 11 · `gutcheck_sessions`

Mid-quarter gutcheck events.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `foundry_id` | text NOT NULL | |
| `goal_id` | uuid NOT NULL | |
| `fired_at` | timestamptz NOT NULL | |
| `triggered_by` | text | `cron_week6 · manual · calendar` |
| `assumption_states_json` | jsonb | Snapshot of 3 assumptions at fire-time |
| `cal_narrative` | text NULL | Auto-drafted data summary |
| `human_narrative` | text NULL | Fractional's commentary |
| `decision` | enum `gutcheck_decision` NULL | `kill · pivot · double_down · dismissed · expired` |
| `decision_note` | text NULL | |
| `decided_at` | timestamptz NULL | |

**Indexes:** `(foundry_id, goal_id, fired_at DESC)`.

---

## 12 · `reports_sent`

Every Report the founder has shipped.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `foundry_id` | text NOT NULL | |
| `target_type` | enum `report_target` | `weekly_team · monthly_investor · quarterly_board · custom` |
| `subject_line` | text NOT NULL | |
| `body_html` | text NULL | |
| `body_markdown` | text NULL | Source-of-truth for edits |
| `pulled_from_json` | jsonb | Which Goals/Tasks/Decisions were the source |
| `recipients_json` | jsonb | `[{email, name, to_cc_bcc}]` |
| `sent_via` | text[] | `{email, slack, link}` |
| `sent_at` | timestamptz NOT NULL | |
| `pressure_tested_before_send` | boolean NOT NULL DEFAULT false | |
| `pressure_test_session_id` | uuid NULL | → pressure_test_sessions |
| `draft_by` | enum `report_draft_by` | `cal · founder` |
| `edits_count` | smallint NOT NULL DEFAULT 0 | |
| `external_share_url` | text NULL | |
| `link_expires_at` | timestamptz NULL | |
| `open_count` | integer NOT NULL DEFAULT 0 | Resend webhook |
| `reply_count` | integer NOT NULL DEFAULT 0 | |
| `legacy_report_snapshot_id` | uuid NULL | If this send was made via the legacy `/reports` UI |

**Indexes:** `(foundry_id, target_type, sent_at DESC)`.

---

## 13 · `specialist_recommendations`

Every proactive suggestion a specialist makes + whether the founder accepted/rejected. Drives the "reversal rate" stat on History.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `foundry_id` | text NOT NULL | |
| `specialist_slug` | text NOT NULL | |
| `context_type` | enum `rec_context_type` | `goal · objective · task · gutcheck · pressure_test · report` |
| `context_ref` | uuid NULL | |
| `summary` | text NOT NULL | |
| `body` | text NOT NULL | |
| `grounding_text` | text NOT NULL | |
| `confidence` | enum `rec_confidence` | `low · medium · high · very_high` |
| `status` | enum `rec_status` | `pending · accepted · edited_accepted · rejected · ignored · expired` |
| `expires_at` | timestamptz NULL | Default `created_at + 72h` unless `durable=true`; resolves §17.4 |
| `durable` | boolean NOT NULL DEFAULT false | True = ignore the 72h expiry |
| `responded_at` | timestamptz NULL | |
| `responded_note` | text NULL | |

**Indexes:** `(foundry_id, status, created_at DESC)` · `(specialist_slug, status)`.

---

## 14 · Today signal contract — which Plan events feed `event_log`

Per SHARED-SCHEMA §1.4 + §5.1, `event_log` is the Today V3 feed source. Plan writes only **attention-worthy** events here. Test: *"Would a founder opening the app at 8am want to know this happened?"*

### 14.1 · Events that DO feed `event_log` (section = `'plan'`)

| `source_entity_type` | Trigger | Default `urgency` | Default `decay_rate` | `cta_label` → `cta_href` |
|---|---|---|---|---|
| `strategic_goal` | Goal transitions `on_track → at_risk` or `at_risk → off_track` | `high` | `3d` | "Review goal" → `plan:goal:[id]` |
| `strategic_goal` | Goal milestone_date within 7 days + `state != completed` | `medium` | `1d` | "Check goal" → `plan:goal:[id]` |
| `disprove_assumption` | `current_state → broken` | `high` | `3d` | "Pressure-test goal" → `plan:goal:[id]?modal=pressure-test` |
| `gutcheck_session` | `fired_at` → founder must decide | `high` | `1d` | "Make the call" → `plan:goal:[goal_id]?gutcheck=[session_id]` |
| `task` | Task `due_date` overdue > 3 days | `medium` | `1d` | "Update task" → `plan:task:[id]` |
| `task` | Task in `is_pinned=true` horizon=`this_week` + not `done` on Friday | `medium` | `1d` | "Close the week" → `plan:task:[id]` |
| `specialist_recommendation` | New rec with `confidence IN ('high','very_high')` | `medium` | `3d` | "See recommendation" → `plan:rec:[id]` |
| `pressure_test_session` | Verdict reached + founder hasn't acknowledged | `medium` | `7d` | "Read verdict" → `plan:history:[id]` |
| `fractional_engagement` | `hours_used_this_week > hours_per_week * 0.9` | `low` | `1d` | "Review capacity" → `plan:team:[fractional_id]` |
| `fractional_engagement` | `ended_on` within 14 days | `high` | `7d` | "Plan handover" → `plan:team:[fractional_id]` |
| `reports_sent` | Scheduled send failed (Resend webhook error) | `high` | `1d` | "Resend" → `plan:report:[id]` |

### 14.2 · Events that do NOT feed `event_log`

- Task edits (title, description, subtask toggles)
- Goal body edits (title, description, purpose_connection)
- Specialist recommendations with `confidence IN ('low','medium')`
- `history_entries` creation (History is passive — the founder pulls it, it doesn't push)
- Pressure-test in-progress round updates (only verdict is attention-worthy)
- Objective kanban reorders
- Knowledge note reads

### 14.3 · `assigned_to` assignment rules

- If the source entity has a `lead_user_id` → `assigned_to = lead_user_id`
- Else if the source entity has a `lead_fractional_id` whose fractional has a `user_id` → `assigned_to = fractional.user_id`
- Else → `assigned_to = null` (shows in every founder's queue, deduped by `(foundry_id, source_entity_id)`)

### 14.4 · Resolution rules

- Acting on the CTA marks `resolved_at = now()`
- Goal state returning from `at_risk → on_track` auto-resolves the earlier `at_risk` event
- Task transitioning to `done` resolves its overdue/pin events
- `gutcheck_sessions.decision NOT NULL` resolves the associated event
- Specialist rec `status IN ('accepted','edited_accepted','rejected')` resolves
- 30-day cron: anything with `created_at < now() - interval '30 days'` AND `resolved_at IS NULL` → `resolved_at = now()` with `payload.auto_resolved=true`

### 14.5 · Realtime

Per SHARED-SCHEMA §6.3 RESOLVED: Today V3 subscribes via Supabase Realtime on `event_log` WHERE `foundry_id = <current>`. Plan server actions emit events synchronously inside the mutating transaction so the Realtime push fires within ~500ms of the underlying state change.

### 14.6 · CTA hrefs — store canonical tokens, resolve client-side

**Never write raw `/plan/...` hrefs into `event_log.cta_href`.** The `new_plan_experience` feature flag is per-user; the same event row may be read by a flag-ON founder (wants `/plan/goal/<id>`) and a flag-OFF co-founder (wants `/new-objectives?goal=<id>`). Storing a raw path locks the CTA to one rendering universe.

**Canonical token format:** `<section>:<entity_type>:<entity_id>[?key=value]` — e.g. `plan:goal:abc-123`, `plan:task:def-456`, `plan:rec:ghi-789`, `plan:goal:abc-123?modal=pressure-test`, `plan:goal:abc-123?gutcheck=jkl-012`.

Today V3 reads `event_log.cta_href`, strips the `plan:` prefix, and resolves to a URL based on the READER'S current `new_plan_experience` flag state via a client-side resolver (`src/lib/plan/route-resolver.ts`):
- Flag ON → `plan:goal:abc-123` → `/plan/goal/abc-123`
- Flag OFF → `plan:goal:abc-123` → `/new-objectives?goal=abc-123` (or equivalent legacy path)

Resolver table maps every `<section>:<entity_type>` pair to a `(flag_on_path, flag_off_path)` tuple. If the legacy path no longer exists (post-decommission), the resolver falls back to flag-on path with a one-time banner "this section has moved".

Rollback safety: if the flag flips OFF after event rows already exist, every stored CTA keeps working because the resolver re-evaluates at render time, not at emission time. This is what makes rollback safe at the Today-signal layer.

---

## 15 · `audit_log` — Plan entity_types and events

Every state-changing Plan mutation writes an `audit_log` row per SHARED-SCHEMA §1.3. Plan does not add columns to `audit_log` — it populates existing columns. The Plan-owned `entity_type` and `event` vocabularies:

### 15.1 · `entity_type` values Plan writes

- `strategic_goal`
- `disprove_assumption`
- `objective` (Plan mutations only — legacy `/new-objectives` writes its own audit rows too; both coexist)
- `task` (same)
- `task_assignee`
- `goal_team_assignment`
- `fractional_engagement`
- `gutcheck_session`
- `pressure_test_session`
- `reports_sent`
- `specialist_recommendation`
- `history_entry`
- `plan_settings` (for the Settings surface)

### 15.2 · `event` values (extension of shared vocabulary)

Shared vocabulary: `created · updated · locked · archived · promoted · merged · shipped`. Plan adds:
- `pinned` / `unpinned` (goals, tasks)
- `state_changed` (goals — payload carries from_state + to_state + reason)
- `killed` (goals, with reason)
- `pivoted` (goals, with new disprove test)
- `accepted` / `rejected` / `edited_accepted` (specialist_recommendation)
- `assigned` / `unassigned` (task_assignee, goal_team_assignment)
- `specialist_call` (for Money to read and compute cost — per SHARED-SCHEMA §6.5)
- `gutcheck_fired` / `gutcheck_decided`
- `pressure_test_started` / `pressure_test_verdict`
- `report_drafted` / `report_sent`

### 15.3 · `actor_user_id` vs `actor_specialist`

Exactly one is set per row. If a specialist mutates on the founder's behalf (e.g. Cal drafts a Report via cron) → `actor_specialist='cal'`, `actor_user_id=NULL`. If a founder clicks accept on a specialist's recommendation, the resulting `specialist_recommendation.status='accepted'` is logged twice:
1. Row 1: `entity=specialist_recommendation`, `event=accepted`, `actor_user_id=<founder>`
2. Row 2: `entity=<whatever was acted on>`, `event=created|updated|...`, `actor_user_id=<founder>` (payload includes `{source: 'specialist_rec', rec_id: ...}` for traceability)

---

## 16 · 9-role permissions matrix (Plan rows)

Per SHARED-SCHEMA §6.4 (still OPEN in shared doc — Plan owns its row-level matrix here).

**Role enum** (to be landed in a separate focused PR that expands `member_role` — not bundled with Phase 3 code; Phase 3 uses the existing 5-role enum and degrades gracefully):
`founder · co_founder · executive · cto · advisor · contractor · read_only_observer · fractional_exec · apprentice`

**Phase 3 mapping from the current 5-role enum** (the enum still in place 2026-04-19):
- `Founder` → `founder`
- `Executive` → `executive`
- `Apprentice` → `apprentice`
- `AI_Agent` → n/a (specialists are not human members)
- `Supplier` → n/a for Plan (supplier role has no Plan access; absent from matrix)

Until the 9-role enum lands, Plan reads `foundry_memberships.role` and maps via the table above; missing values (co_founder, cto, advisor, contractor, read_only_observer, fractional_exec) are not expressible in Phase 3 UI but the matrix below is the target.

### 16.1 · Action matrix — Plan surface

Legend: ✅ allowed · 👁 read-only · ⚠️ scoped (see notes) · ❌ denied.

| Action | founder | co_founder | executive | cto | advisor | contractor | read_only_observer | fractional_exec | apprentice |
|---|---|---|---|---|---|---|---|---|---|
| **Plan workspace** | | | | | | | | | |
| View Plan workspace | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️¹ | 👁 | ⚠️² | 👁 |
| Create Strategic Goal | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Edit Goal title/desc | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Pin/unpin Goal | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Kill/pivot Goal | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Set Goal state manually | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ⚠️² | ❌ |
| Edit disprove assumptions | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ⚠️² | ❌ |
| **Objectives / Tasks** | | | | | | | | | |
| Create objective | ✅ | ✅ | ✅ | ✅ | ❌ | ⚠️¹ | ❌ | ⚠️² | ✅ |
| Edit objective | ✅ | ✅ | ✅ | ✅ | ❌ | ⚠️¹ | ❌ | ⚠️² | ✅ |
| Create task | ✅ | ✅ | ✅ | ✅ | ❌ | ⚠️¹ | ❌ | ⚠️² | ✅ |
| Assign task to self | ✅ | ✅ | ✅ | ✅ | ❌ | ⚠️¹ | ❌ | ⚠️² | ✅ |
| Assign task to others | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ⚠️² | ❌ |
| Close own task | ✅ | ✅ | ✅ | ✅ | ❌ | ⚠️¹ | ❌ | ⚠️² | ✅ |
| Delete task | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Fractional team** | | | | | | | | | |
| Invite fractional | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| End engagement | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Set capacity/retainer | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | 👁 (own) | ❌ |
| **Gutcheck / Pressure-test** | | | | | | | | | |
| Decide gutcheck | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Start pressure-test | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ⚠️² | ❌ |
| Close pressure-test | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Report** | | | | | | | | | |
| Draft report | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ⚠️² | ❌ |
| Edit report draft | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ⚠️² | ❌ |
| Send report | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| View sent reports | ✅ | ✅ | ✅ | ✅ | 👁 | ❌ | 👁³ | ⚠️² | 👁 |
| **History** | | | | | | | | | |
| View History | ✅ | ✅ | ✅ | ✅ | 👁 | ❌ | 👁 | ⚠️² | 👁 |
| Add manual entry | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Mark entry outcome | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Settings** | | | | | | | | | |
| Change nudge frequency | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Change specialist behaviour | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage permissions | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

¹ **Contractor** scope: read/write only on tasks/objectives where the contractor is listed in `task_assignees` or `goal_team_assignments`. No workspace-wide view.
² **Fractional_exec** scope: all read/write actions are scoped to Strategic Goals they're assigned to via `goal_team_assignments`. Cannot see goals/objectives/tasks/reports outside those goals.
³ **Observer** scope: `read_only_observer` can be token-granted read access to a specific Report via `reports_sent.external_share_url`. They DO NOT have a `foundry_memberships` row by default. A separate `external_viewers` table (deferred — see §17.7) token-gates this.

### 16.2 · RLS implementation sketch

Base policy (applies to most Plan tables):
```sql
CREATE POLICY plan_foundry_scope ON <table> FOR SELECT
USING (foundry_id IN (
  SELECT foundry_id FROM foundry_memberships
  WHERE user_id = auth.uid() AND active = true
));
```

Fractional overlay (on `strategic_goals`, `objectives`, `tasks`, `disprove_assumptions`, `gutcheck_sessions`, `pressure_test_sessions`):
```sql
CREATE POLICY plan_fractional_scope ON <table> FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM foundry_memberships fm
    WHERE fm.user_id = auth.uid()
      AND fm.foundry_id = <table>.foundry_id
      AND fm.active = true
      AND fm.role IN ('founder','co_founder','executive','cto','advisor','apprentice')
  )
  OR EXISTS (
    SELECT 1 FROM goal_team_assignments gta
    JOIN fractional_executives fe ON fe.id = gta.fractional_id
    WHERE fe.user_id = auth.uid()
      AND gta.goal_id = <resolved goal_id for this row>
  )
);
```

Write policies use CHECK clauses that read `foundry_memberships.role` and gate mutations per the action matrix above. Implementation delegates to a SQL helper `plan_can(user_id, foundry_id, action text)` returning boolean — keeps policies legible.

### 16.3 · Access-change audit (MANDATORY before flag flip)

**Today's legacy routes enforce foundry-scoped RLS but NOT role-scoped write gates.** A foundry member of ANY role (including `Apprentice`, `Supplier`) can currently create objectives/tasks/strategic goals via `/strategy`, `/new-objectives`, `/new-tasks`. The matrix in §16.1 tightens this — e.g. `apprentice` loses "Create Strategic Goal", `Supplier` loses Plan access entirely.

This is a **policy change disguised as a mapping** and PHASE-PLAN.md §Data-preservation rule forbids silently reducing access. Before flipping `new_plan_experience` ON for any foundry:

1. **Pre-flip audit SQL** produces a per-member access delta:
   ```sql
   SELECT
     fm.user_id, fm.foundry_id, fm.role AS current_role,
     <mapped_new_role> AS phase3_role,
     array_agg(action) FILTER (WHERE <could_do_before> AND NOT <can_do_under_phase3>) AS actions_lost,
     array_agg(action) FILTER (WHERE NOT <could_do_before> AND <can_do_under_phase3>) AS actions_gained
   FROM foundry_memberships fm
   CROSS JOIN LATERAL (...actions enum...) actions(action)
   WHERE fm.foundry_id = $1 AND fm.active = true
   GROUP BY fm.user_id, fm.foundry_id, fm.role;
   ```
2. **Founder confirmation UX**: the Settings > Permissions tab, on first open per foundry post-Phase-3, shows the access delta per member and requires an explicit "Apply Phase 3 role matrix" click by a `founder` or `co_founder`. Until this click lands, `new_plan_experience` stays visually enabled but Plan writes fall back to permissive legacy RLS for any role that would lose access — so no regression without informed consent.
3. **Per-member email** (optional, via Resend) summarising any access change, fired when the founder confirms.

Build terminal: this is NOT optional. Ships in Chunk E before flag flip.

---

## 17 · Ambiguities to resolve before coding

Revised from the earlier draft; each item now has a recommended default for build terminal to take if Tristan doesn't answer before build starts.

1. **Source of truth for Goal state (manual override vs specialist-derived).** **Resolved:** `state_overridden_until timestamptz NULL` on `strategic_goals` — manual override wins until expiry, specialist-derived `at_risk → on_track` transitions resume after. Default expiry 14 days.

2. **Deletion vs archiving of Goals.** **Resolved:** soft-delete (`deleted_at`) is never used for "killed" goals — those use `state='killed'` and stay visible in History. `deleted_at` only set if a Goal is created-then-removed before any children exist.

3. **Fractional weekly capacity reset.** **Resolved:** Monday 00:00 UTC system-wide. Per-foundry timezone preferences defer to V2.

4. **Specialist recommendation expiry.** **Resolved:** 72h default; `durable=true` flag bypasses expiry.

5. **History entry immutability + typo correction.** **Resolved:** edit `body` allowed within 5 min of creation; after that all changes append to `edit_log_json`. Hard delete forbidden at RLS policy level.

6. **Objective assumptions shape.** **Resolved for Phase 3:** `objectives.metadata->>'assumptions' text[]`. Migration to dedicated `objective_assumptions` table deferred to post-V1 focused PR if demand emerges.

7. **External viewers (board members on reports). Resolved 2026-04-19:** not in V1. Phase 3 V1 ships without `read_only_observer` / `external_viewers` surface; Send-as-link writes `reports_sent.external_share_url` with a server-side token-gated read route only. Full observer permissions wait for a later PR (no schedule).

8. **9-role enum expansion. Resolved 2026-04-19:** degrade + access-change audit (NOT a prerequisite PR). Phase 3 ships against the current 5-role `member_role` enum AND implements §16.3 access-change audit. Settings > Permissions tab shows per-member delta and requires an explicit "Apply Phase 3 role matrix" founder click before any role-scoped RLS change bites. Full 9-role expansion stays its own focused PR (no schedule).

9. **Legacy `report_snapshots` rows with `report_type='red-team-debate'` — migrate or dual-read?** **Resolved:** one-time script backfills into `pressure_test_sessions` with `legacy_report_snapshot_id` link. Legacy rows retained; SELECT queries use a view that UNIONs both.

10. **Knowledge notes backfill into `history_entries`?** **Resolved:** no destructive backfill. The `/plan/history` search view UNIONs `knowledge_notes` with `history_entries` at read time; writes go to `history_entries` only (new). Knowledge-decay cron continues to run against `knowledge_notes`.

---

## 18 · Server action signatures (sketch)

```ts
// src/actions/plan/goals.ts
export async function createStrategicGoal(input: CreateGoalInput): Promise<GoalResult>
export async function pinGoal(goalId: string, slot: 1|2|3): Promise<void>
export async function unpinGoal(goalId: string): Promise<void>
export async function setGoalState(goalId: string, state: GoalState, reason: string): Promise<HistoryEntry>
export async function editGoal(goalId: string, patch: Partial<Goal>): Promise<Goal>
export async function killGoal(goalId: string, reason: string): Promise<HistoryEntry>
export async function pivotGoal(goalId: string, newDisproveTest: DisproveAssumption[], reason: string): Promise<HistoryEntry>

// src/actions/plan/pressure-test.ts
export async function startPressureTest(subject: PressureTestSubject, rounds: number): Promise<{sessionId: string}>
export async function runNextRound(sessionId: string, extraHumanReviewerIds?: string[]): Promise<TranscriptRound>
export async function closePressureTest(sessionId: string, acceptMitigations: boolean): Promise<HistoryEntry>

// src/actions/plan/gutcheck.ts
export async function fireGutcheckIfDue(goalId: string): Promise<GutcheckSession | null>
export async function decideGutcheck(sessionId: string, decision: 'kill'|'pivot'|'double_down', note: string): Promise<HistoryEntry>

// src/actions/plan/tasks.ts
export async function createTask(input: CreateTaskInput): Promise<Task>
export async function pinTaskToWeek(taskId: string): Promise<void>
export async function delegateTaskToSpecialist(taskId: string, specialistSlug: string, brief: string): Promise<void>
export async function completeTask(taskId: string, closingNote?: string): Promise<void>

// src/actions/plan/fractionals.ts
export async function inviteFractional(input: InviteInput): Promise<FractionalEngagement>
export async function endEngagement(engagementId: string, reason: string): Promise<HistoryEntry>
export async function updateCapacity(engagementId: string, hoursUsedThisWeek: number): Promise<void>

// src/actions/plan/reports.ts
export async function draftReport(target: ReportTarget, pullFromGoalIds?: string[]): Promise<{draftId: string}>
export async function editReportBlock(draftId: string, blockPath: string, newContent: string): Promise<void>
export async function sendReport(draftId: string, channels: ('email'|'slack'|'link')[]): Promise<ReportsSentRow>

// src/actions/plan/history.ts
export async function getHistoryEntry(id: string): Promise<HistoryEntryWithRelations>
export async function markHistoryOutcome(id: string, outcome: Outcome, note: string): Promise<void>
export async function addManualHistoryEntry(input: ManualEntryInput): Promise<HistoryEntry>
```

Every action: Zod input validation · `withAuth` wrapper (provides `{supabase, user, foundryId}`) · permissions check against §16 matrix · audit_log row on success · event_log row if §14 trigger matches.

---

## 19 · Migration plan · order of operations

1. **Enum types first** — `goal_state`, `assumption_state`, `fractional_specialisation`, `engagement_status`, `working_style`, `assignee_type`, `history_entry_type`, `actor_type`, `outcome_state`, `pressure_subject_type`, `pressure_verdict`, `gutcheck_decision`, `report_target`, `report_draft_by`, `rec_context_type`, `rec_confidence`, `rec_status`.
2. **New tables** — strategic_goals, disprove_assumptions, fractional_executives, fractional_engagements, goal_team_assignments, history_entries, pressure_test_sessions, gutcheck_sessions, reports_sent, specialist_recommendations. 10 new tables.
3. **Additive columns** — `objectives.strategic_goal_id`, `tasks.(strategic_goal_id, is_draft, is_pinned, horizon, origin, origin_ref)`, `task_assignees.fractional_id` (if absent).
4. **RLS policies + write helpers** — `plan_can()` SQL helper, base scope + fractional/observer overlays.
5. **Backfill scripts** — §A.4 (strategic goals from `objectives.is_strategic_goal`), `tasks.is_draft` from `[Draft]%` title pattern, legacy `report_snapshots`→`pressure_test_sessions` for red-team-debate rows.
6. **Triggers** — `strategic_goals` pin-slot check, `history_entries` edit-lock after 5 min, audit_log/event_log emission helpers.
7. **Cron: Monday reset of `fractional_engagements.hours_used_this_week`** — `/api/cron/fractional-capacity-reset`.
8. **Legacy route redirects** — Next.js middleware-level, flag-gated on `new_plan_experience`.
9. **`plan_settings` table or `foundries.plan_settings jsonb`** — build terminal picks the lighter option.
10. **Feature flag** `new_plan_experience` — default OFF for all users; flipped on per-user for review.

Later phases MUST NOT alter Plan-owned tables except via additive migration. Same rule Plan must follow for tables it does NOT own.

---

## 20 · Change log

| Date | Change | Author |
|---|---|---|
| 2026-04-19 | v1.0 — 13-table draft with ambiguities | Plan terminal |
| 2026-04-19 | v2.0 — aligned with SHARED-SCHEMA; added §A 7→3 IA collapse + legacy data preservation; §14 Today signal contract; §15 audit_log entity_types; §16 9-role permissions matrix; resolved §17 ambiguities 1–6 and 9–10; deferred §17.7–8 | Plan terminal (prep) |

End of schema. Every ambiguity in §17 with "OPEN" must have a decision (or the recommended default accepted) before the first `CREATE TABLE` migration is applied.
