# Money V2 — Pre-code schema

> **Phase 2 section schema** per [`SHARED-SCHEMA.md`](./SHARED-SCHEMA.md). Source of truth for Money-owned tables before coding begins. Resolves the 5 ambiguities flagged in MONEY-MOCKUP-GAP-AUDIT.html critique 4 + spells out RLS, specialist cost metering, Today-signal contract, and feature-flag strategy.

**Version:** 0.3 · 2026-04-19 (prep-terminal pass, post red-team)
**Depends on:** SHARED-SCHEMA.md v1.0 — the shared tables (`foundries`, `foundry_memberships`, `audit_log`, `event_log`, `projects`) are already landed in Phase 1 PR #1. This doc only covers Money-owned tables.
**Feature flag:** `new-money-experience` (default OFF until preview-approved) — gates all `/money/*` routes + sidebar "MONEY [V2]" group. Flag is route-level; data is additive and safe under rollback (see §5 Data preservation).

**Scope:** Money V2 only — does not touch Forge, Products, Plan, or the existing Strategy/Workshop tables except as foreign keys.

---

## 0 · Conventions

- All Money tables are **multi-tenant**, scoped by `foundry_id text NOT NULL REFERENCES foundries(id)`.
- RLS foundry-scoping uses **`foundry_memberships`** (per SHARED-SCHEMA.md §1.2 — not `foundry_members`; that was an earlier draft name).
- All tables have `created_at timestamptz DEFAULT now()`, `updated_at timestamptz`, managed via trigger `public.update_updated_at_column()`.
- All tables have RLS enabled. Policy template in §0.2; per-table role whitelists under each table.
- Amount columns use `integer` stored in **pence/cents** (never floats). Currency is per-row (`currency text` column).
- Soft delete via `archived_at timestamptz NULL` where relevant; hard delete only for obviously transient tables.
- JSONB used for flexible bags (overrides, settings, extracted fields); never for anything we query on in a hot path.
- Timestamps all UTC. Conversion to display tz on the client.
- FK column names: `<table_singular>_id` (per SHARED §0).
- Every mutating action writes **both** an `audit_log` row (SHARED table, scope='money') AND — if attention-worthy — an `event_log` row (SHARED table, section='money').

### 0.1 Role enum (forward-compat note)

SHARED-SCHEMA §1.2 currently ships with a **5-value** enum (`Founder` / `Executive` / `Apprentice` / `AI_Agent` / `Supplier`). The Money UI (Permissions page) plans for the **full 9-value** matrix: `founder / co_founder / executive / cto / advisor / contractor / read_only_observer / fractional_exec / apprentice`. Enum expansion is its own focused PR (deferred in SHARED-SCHEMA §1.2).

**Strategy for Phase 2:** Money write-whitelists compile to the 5-value enum **plus** the `permission_override` table below. When the 9-value expansion lands post-Phase 2, Money's per-table whitelists flip to the full enum in a follow-up migration. See §4 for the canonical matrix.

### 0.2 RLS policy template

```sql
-- Read (all Money tables): user must be an active member of the foundry.
CREATE POLICY money_foundry_read ON <table> FOR SELECT
  USING (
    foundry_id IN (
      SELECT foundry_id FROM foundry_memberships
      WHERE user_id = auth.uid() AND active = true
    )
  );

-- Write: same membership check PLUS per-table role whitelist.
CREATE POLICY money_foundry_write ON <table>
  FOR INSERT, UPDATE, DELETE
  USING (
    foundry_id IN (
      SELECT foundry_id FROM foundry_memberships
      WHERE user_id = auth.uid()
        AND active = true
        AND role IN ( /* per-table whitelist — see each section */ )
    )
  );
```

Per-table role whitelists appear under each table as "**RLS write whitelist:**". The `permission_override` table (in §2 Tables below) grants per-user exceptions beyond the role default, time-boxed.

---

## 1 · Ambiguity resolutions

**The 5 schema ambiguities flagged in the gap audit — decided here before any migration is written.**

### 1. Source of truth: Xero actuals vs Plan line items

**Decision.** Plan is the planning layer. Xero is the actuals layer. They are **separate tables**, never reconciled in place. Cockpit and Variance views **join** them at query time.

- `plan_line_items` — your forecast.
- `xero_transactions` — Xero's truth.
- **Cockpit runway** computes from: opening balance + expected cash flow over next 26 weeks, where `expected = plan_projection` for future periods and `actuals` for historical periods. Bounds at today.
- **Variance view** is strictly: `sum(xero_transactions WHERE date IN month) − sum(plan_projection WHERE month)` per category.
- When Xero is disconnected, Cockpit and Variance fall back to pure-Plan numbers with a visible "manual only" badge.

**Why:** reconciling two sources into one "resolved" number creates a third-thing nobody understands. Keep them separate, show both when it matters.

### 2. Scenario override storage: diff vs copy

**Decision.** Overrides are **diffs** stored as rows in `scenario_overrides`, keyed on `(scenario_id, line_item_id)`. When a base line item is **deleted**, orphaned overrides are automatically archived (`archived_at` set), not cascaded-deleted. Founder sees a "this scenario references a deleted line — value reverts to 0" warning on the scenario detail page.

- **Why diff over copy:** 90% of the time overrides are 1–6 lines. Copies waste storage and create reconciliation drift when base data changes.
- **Why auto-archive on deletion:** hard-deleting the override would silently change the scenario's math. Archive keeps the history, visibly degrades the scenario, founder resolves.

### 3. Pipeline event consistency: last-write-wins vs event-sourced

**Decision.** **Event-sourced + denormalised current state**. `investor_pipeline_events` is an append-only log. Current stage lives on `investor_pipeline_state.current_stage` (denormalised column, maintained by a Postgres trigger — NOT a materialised view). Concurrent moves resolve by `created_at` ordering; both events persist.

- **Why event-sourced over LWW:** investor stage transitions are small in volume (~100 events per round), easy to replay. Backdated corrections work without rewriting history. Audit log becomes free.
- **Why trigger-maintained column over materialised view:** red-team flagged a materialised-view storm risk — 50 rapid kanban drags × view-refresh-per-insert = lock contention + client thrash. A trigger updates one row per event, no view to refresh.
- Simultaneous moves by two users: both events land. UI shows a "conflict — Ada also moved this 2 seconds ago" banner, founder decides.

**`event_log` write gate (`isAttentionWorthy`):** not every pipeline event hits `event_log`. Helper in `src/lib/money/attention-worthy.ts`:

```ts
// returns true only if the event deserves a Today-queue slot
function isAttentionWorthy(row: PipelineEvent, prior: PipelineState | null): boolean {
  if (row.event_type === 'stage_move') {
    // kanban reorder within same stage → not worthy
    if (row.from_stage === row.to_stage) return false
    // move to verbal / closed → ALWAYS worthy
    if (['verbal', 'closed'].includes(row.to_stage)) return true
    // debounce: same investor moved within last 5 minutes → coalesce
    if (prior && (Date.now() - prior.stage_entered_at.getTime()) < 5 * 60_000) return false
    return true
  }
  if (row.event_type === 'pass') return true  // always worthy
  if (row.event_type === 'touch_logged') {
    // touch that closes an overdue event → silent resolve, not new event
    return false  // touches resolve `touch_overdue` events; no new row
  }
  return false  // note_added, doc_shared, view_recorded → audit_log only
}
```

**Realtime debouncing:** Today subscribers debounce `event_log` changefeed refetches to max 1/second per section (client-side throttle in the `useTodayFeed` hook). SHARED §5.1 documents the debounce rule.

### 4. Thesis versioning: retroactive re-rank vs frozen-at-touch

**Decision.** Match scores are **not stored**. Every time the founder views the 180 matches, they're computed against the **current** thesis version. Historical touches remember the thesis_version_at_touch_time in their payload — useful for "why did I contact them?" retrospection, not used in current ranking.

- **Why compute live:** thesis scores are a derived quantity. Storing them creates cache-invalidation pain; investor records change, thesis changes, both are cheap to re-rank together.
- `investor_thesis` is versioned (new row per save, not update). Soft delete the old versions so you can restore. Active version pointed to by `foundry.active_thesis_id`.

### 5. RLS policies

See §0.2 Policy template (at head of doc) — canonical RLS uses `foundry_memberships` (per SHARED-SCHEMA §1.2), not `foundry_members` (that was an earlier draft name). Per-table role whitelists spelled out in each section below.

---

## 2 · Tables

### `money_settings`

Foundry-level preferences. One row per foundry. Populated on first onboarding save.

| Column | Type | Notes |
|---|---|---|
| `foundry_id` | `text PK REFERENCES foundries(id)` | One row per foundry |
| `currency` | `text DEFAULT 'GBP'` | ISO 4217 |
| `fiscal_year_start_month` | `smallint DEFAULT 4` | 1–12 · UK default April |
| `number_format` | `text DEFAULT 'en-GB'` | BCP 47 locale code |
| `runway_danger_weeks` | `integer DEFAULT 13` | Cockpit tag threshold |
| `runway_healthy_weeks` | `integer DEFAULT 18` | |
| `large_expense_threshold_cents` | `integer DEFAULT 50000` | £500 default |
| `variance_alert_pct` | `smallint DEFAULT 10` | |
| `digest_schedule` | `text DEFAULT 'weekly_mon_09'` | enum or cron expr |
| `specialists_enabled` | `jsonb DEFAULT '{"finn":true,"fiona":true,"harper":true,"leo":true}'` | |
| `specialist_model_tier` | `text DEFAULT 'sonnet'` | `haiku` / `sonnet` / `opus` |
| `retention_years` | `smallint DEFAULT 7` | Audit log retention |

**RLS write whitelist:** `founder`, `co_founder`.

---

### `plan_line_items`

Cost and income lines. `direction` flags which is which.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK DEFAULT gen_random_uuid()` | |
| `foundry_id` | `text NOT NULL REFERENCES foundries(id)` | |
| `name` | `text NOT NULL` | |
| `direction` | `text NOT NULL CHECK (direction IN ('out', 'in'))` | |
| `category` | `text NOT NULL CHECK (category IN ('people','premises','tools','materials','growth','other','revenue','grants','equity','loans'))` | 6 cost + 4 income buckets |
| `amount_cents` | `integer NOT NULL` | Fixed mode · override if formula used |
| `currency` | `text DEFAULT 'GBP'` | FX applied to reporting currency at query time |
| `frequency` | `text NOT NULL CHECK (frequency IN ('one_off','weekly','monthly','quarterly','annual','variable'))` | |
| `effective_from` | `date NOT NULL` | |
| `effective_to` | `date NULL` | null = indefinite |
| `probability_pct` | `smallint DEFAULT 100 CHECK (probability_pct BETWEEN 0 AND 100)` | For income only · reduces expected-value |
| `formula` | `text NULL` | Optional expression evaluated server-side |
| `formula_variables` | `jsonb NULL` | Snapshot of vars at save time |
| `sensitivity_pct` | `smallint DEFAULT 5` | For best/worst envelope |
| `annual_uplift_pct` | `smallint DEFAULT 0` | For auto-inflation |
| `accounting_tags` | `text[] DEFAULT '{}'` | Hidden from founders · used by Xero export |
| `xero_account_code` | `text NULL` | For reverse mapping |
| `project_allocation` | `text NULL` | `nimfarm_deployment` / `rd_general` etc |
| `vat_treatment` | `text DEFAULT 'standard_20'` | `standard_20` / `zero` / `exempt` |
| `source` | `text DEFAULT 'manual' CHECK (source IN ('manual','template','csv_import','xero_inferred'))` | Provenance |
| `owner_user_id` | `uuid REFERENCES profiles(id) NULL` | Specialist or human owner |
| `notes` | `text NULL` | |
| `archived_at` | `timestamptz NULL` | Soft delete |
| `created_at`, `updated_at` | `timestamptz` | |

**Indexes:** `(foundry_id, direction, archived_at)`, `(foundry_id, category)`, `(foundry_id, effective_from, effective_to)`.

**RLS write whitelist:** `founder`, `co_founder`. Accountant = read-only.

**Deletion rule:** archived_at set; hard-delete only if never referenced by any scenario_override or xero_transaction.

---

### `burn_scenarios`

Named scenarios. **V1 simplified per gap audit critique 5.**

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `foundry_id` | `text NOT NULL REFERENCES foundries(id)` | |
| `name` | `text NOT NULL` | e.g. "Worst case · pilot slips" |
| `question` | `text NULL` | Freetext — what question is this answering |
| `template_source` | `text NULL` | `worst_case`, `best_case`, `hiring`, `custom` etc |
| `is_default` | `boolean DEFAULT false` | |
| `visibility` | `text DEFAULT 'founders' CHECK (visibility IN ('founders','all_members','private'))` | |
| `archived_at` | `timestamptz NULL` | |
| `created_at`, `updated_at` | | |

**Indexes:** `(foundry_id, archived_at)`, `(foundry_id, is_default)`.

**Constraints:** at most one row with `is_default = true` per foundry (partial unique index).

**Explicitly NOT in V1:** `global_params`, `trigger_actions`, `formulas_inside_overrides`.

**RLS write whitelist:** `founder`, `co_founder`.

---

### `scenario_overrides`

Diff against default plan. Each row = one overridden line in one scenario.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `foundry_id` | `text NOT NULL` | |
| `scenario_id` | `uuid NOT NULL REFERENCES burn_scenarios(id) ON DELETE CASCADE` | |
| `line_item_id` | `uuid NOT NULL REFERENCES plan_line_items(id) ON DELETE SET NULL` | See ambiguity #2 |
| `override_amount_cents` | `integer NULL` | null = unchanged amount |
| `override_frequency` | `text NULL` | |
| `override_effective_from` | `date NULL` | |
| `override_effective_to` | `date NULL` | |
| `override_probability_pct` | `smallint NULL` | |
| `note` | `text NULL` | Why this override exists |
| `archived_at` | `timestamptz NULL` | Auto-set if line_item deleted |
| `created_at`, `updated_at` | | |

**Unique:** `(scenario_id, line_item_id)`.

**RLS write whitelist:** `founder`, `co_founder`.

---

### `investor_thesis`

Versioned. New row per save; active pointed to by `foundries.active_thesis_id`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `foundry_id` | `text NOT NULL` | |
| `version` | `integer NOT NULL` | Auto-increment per foundry |
| `stage_tags` | `text[] NOT NULL` | `['pre_seed']` |
| `sector_tags` | `text[] NOT NULL` | `['hardware','agri_tech']` |
| `geography` | `text[] DEFAULT '{}'` | ISO country codes |
| `cheque_min_cents` | `integer NULL` | |
| `cheque_max_cents` | `integer NULL` | |
| `keywords` | `text[] DEFAULT '{}'` | Auto-generated from company docs |
| `preferred_instrument` | `text[] DEFAULT '{}'` | `['safe','priced_equity']` |
| `decision_speed_max_weeks` | `smallint NULL` | |
| `lead_follower_pref` | `text DEFAULT 'either'` | `lead_only` / `follower_only` / `either` |
| `no_go_rules` | `jsonb DEFAULT '[]'` | Array of rule objects |
| `weights` | `jsonb NOT NULL DEFAULT '{"thesis":35,"stage":20,"cheque":15,"warm":12,"geo":8,"recency":6,"speed":4}'` | Must sum to 100 |
| `data_sources` | `jsonb DEFAULT '{"crunchbase":true,"companies_house":true,"forge_capital":true,"forge_network":true,"angellist":false}'` | |
| `created_by` | `uuid REFERENCES profiles(id)` | |
| `created_at` | | |

**Indexes:** `(foundry_id, version)`. Active version resolved via `foundries.active_thesis_id` FK.

**RLS write whitelist:** `founder`, `co_founder`.

---

### `investor_round`

At most one active per foundry.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `foundry_id` | `text NOT NULL` | |
| `name` | `text NOT NULL` | "Pre-seed · Summer 2026" |
| `stage` | `text NOT NULL` | `pre_seed` / `seed` / `series_a` etc |
| `target_cents` | `integer NOT NULL` | |
| `currency` | `text DEFAULT 'GBP'` | |
| `close_date` | `date NOT NULL` | |
| `instrument` | `text NOT NULL` | `safe_post`, `safe_pre`, `priced`, `convertible`, `asa` |
| `cap_cents` | `integer NULL` | For SAFE |
| `discount_pct` | `smallint NULL` | |
| `cheque_min_cents` | `integer NULL` | |
| `cheque_max_cents` | `integer NULL` | |
| `lead_structure` | `text DEFAULT 'open_to_leads'` | `open_to_leads` / `follower_only` / `party` |
| `close_style` | `text DEFAULT 'rolling'` | `rolling` / `single_close` |
| `syndicate_narrative` | `text NULL` | |
| `state` | `text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','active','closing','closed','archived'))` | |
| `opened_at`, `closed_at`, `archived_at` | `timestamptz` | |
| `created_at`, `updated_at` | | |

**Constraint:** at most one `state = 'active'` per foundry (partial unique).

**RLS write whitelist:** `founder`, `co_founder`.

---

### `investor_pipeline_state`

Current state per investor in this foundry. Derived from events but materialised for query speed.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `foundry_id` | `text NOT NULL` | |
| `round_id` | `uuid REFERENCES investor_round(id) NULL` | Null = not yet in a round |
| `investor_firm_id` | `uuid REFERENCES investor_firms(id)` | External directory |
| `investor_person_id` | `uuid REFERENCES investor_people(id) NULL` | Primary contact |
| `current_stage` | `text NOT NULL CHECK (current_stage IN ('target','researching','contacted','meeting','due_diligence','verbal','closed','passed'))` | |
| `stage_entered_at` | `timestamptz NOT NULL` | |
| `probability_pct` | `smallint NULL` | For verbal commits |
| `commit_amount_cents` | `integer NULL` | Non-null once verbal+ |
| `lead_role` | `text NULL` | `lead`/`co_lead`/`follower`/`undecided` |
| `pass_reason` | `text NULL` | Non-null only if stage = `passed` |
| `warm_intro_via_user_id` | `uuid NULL` | Who connected them |
| `match_score_cached` | `smallint NULL` | Last computed against current thesis |
| `match_score_computed_at` | `timestamptz NULL` | |
| `archived_at`, `created_at`, `updated_at` | | |

**Indexes:** `(foundry_id, current_stage)`, `(round_id, current_stage)`.

**RLS write whitelist:** `founder`, `co_founder`. Accountant = no access to raise at all.

---

### `investor_pipeline_events`

Append-only event log. Source of truth for pipeline_state.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `foundry_id` | `text NOT NULL` | |
| `pipeline_state_id` | `uuid NOT NULL REFERENCES investor_pipeline_state(id)` | |
| `event_type` | `text NOT NULL` | `stage_move`, `touch_logged`, `pass`, `reopen`, `note_added`, `doc_shared` |
| `from_stage` | `text NULL` | null for create events |
| `to_stage` | `text NULL` | |
| `payload` | `jsonb NOT NULL DEFAULT '{}'` | Typed per event_type — see below |
| `actor_user_id` | `uuid REFERENCES profiles(id) NULL` | null = system |
| `backdated_to` | `timestamptz NULL` | If backdated from UI |
| `created_at` | `timestamptz DEFAULT now()` | |

**`payload` shape by event_type (validated in TS not SQL):**
- `stage_move → verbal`: `{amount_cents, terms, lead_role, conditions, notes}`
- `stage_move → meeting`: `{meeting_date, attendees_user_ids[], format, agenda}`
- `stage_move → due_diligence`: `{expected_timeline_weeks, blockers[]}`
- `stage_move → closed`: `{wire_date, doc_url, final_amount_cents}`
- `touch_logged`: `{type, date, duration, attendees, outcome, asks[], notes_md, quote}`
- `pass`: `{reason, narrative, last_touch_days, warmth, revisit_in_months}`

**Indexes:** `(pipeline_state_id, created_at)`, `(foundry_id, event_type, created_at)`.

**RLS:** read = any foundry member with raise access; write = founder/co_founder via server action only (no direct client writes).

---

### `investor_firms`, `investor_people`

External directory. Replicated from data sources (Crunchbase, Companies House, etc). Shared across foundries; foundry-specific overlays live on `investor_pipeline_state`.

Schema details out of scope for V1 MVP — reuses existing `investors.ts` backing tables with minor extensions for portfolio + analyst records.

---

### `investor_update`

Monthly investor updates sent from Board pack.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `foundry_id` | `text NOT NULL` | |
| `round_id` | `uuid REFERENCES investor_round(id) NULL` | |
| `month_label` | `text NOT NULL` | "April 2026" |
| `subject` | `text NOT NULL` | |
| `body_html` | `text NOT NULL` | Full rendered |
| `body_sections` | `jsonb NOT NULL` | Structured sections for re-edit |
| `headline_quote` | `text NULL` | |
| `sent_by_user_id` | `uuid REFERENCES profiles(id)` | |
| `sent_at` | `timestamptz NULL` | null = draft |
| `scheduled_for` | `timestamptz NULL` | |
| `state` | `text DEFAULT 'draft' CHECK (state IN ('draft','scheduled','sent','cancelled'))` | |
| `created_at`, `updated_at` | | |

---

### `investor_update_recipient`

Per-recipient tracking.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `update_id` | `uuid NOT NULL REFERENCES investor_update(id) ON DELETE CASCADE` | |
| `pipeline_state_id` | `uuid REFERENCES investor_pipeline_state(id) NULL` | null if external/mum |
| `email` | `text NOT NULL` | |
| `name` | `text NULL` | |
| `stage_at_send` | `text NULL` | Snapshot of their stage when sent |
| `delivered_at` | `timestamptz NULL` | |
| `opened_count` | `integer DEFAULT 0` | |
| `opened_first_at`, `opened_last_at` | `timestamptz NULL` | |
| `clicked_count` | `integer DEFAULT 0` | |
| `replied_at` | `timestamptz NULL` | |
| `bounced_at` | `timestamptz NULL` | |

**Indexes:** `(update_id)`, `(email, delivered_at)`.

---

### `pitch_prep_section`

8 sections per round (company, market, problem, traction, team, ask, financial_model, cap_table).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `foundry_id` | `text NOT NULL` | |
| `round_id` | `uuid REFERENCES investor_round(id)` | |
| `section_key` | `text NOT NULL` | Fixed enum |
| `status` | `text DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','done'))` | |
| `narrative_fields` | `jsonb DEFAULT '{}'` | Freetext per sub-field |
| `last_edited_by_user_id` | `uuid` | |
| `last_edited_at` | `timestamptz` | |
| `created_at` | | |

**Unique:** `(round_id, section_key)`.

---

### `pitch_prep_slide`

Ordered slides within a section.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `foundry_id` | `text NOT NULL` | |
| `section_id` | `uuid NOT NULL REFERENCES pitch_prep_section(id) ON DELETE CASCADE` | |
| `position` | `smallint NOT NULL` | Ordinal 1..n |
| `layout` | `text NOT NULL` | `title_body`, `bullets_chart`, `chart_full`, etc |
| `title`, `subtitle` | `text` | |
| `body_elements` | `jsonb NOT NULL DEFAULT '[]'` | Array of element descriptors |
| `data_bindings` | `jsonb DEFAULT '[]'` | `[{element_id, binding_path}]` |
| `speaker_notes_md` | `text NULL` | |
| `archived_at` | `timestamptz NULL` | |
| `created_at`, `updated_at` | | |

**Indexes:** `(section_id, position)`.

---

### `audit_log` — **SHARED table (landed Phase 1)**

**Not a Money-owned table.** Money writes to the SHARED `audit_log` per SHARED-SCHEMA §1.3. Every mutating Money server action writes one row via the existing `withAuth` middleware, with:

- `section = 'money'`
- `entity_type` ∈ `plan_line_item` / `burn_scenario` / `scenario_override` / `investor_round` / `investor_pipeline_state` / `investor_pipeline_event` / `investor_thesis` / `investor_update` / `pitch_prep_section` / `pitch_prep_slide` / `xero_connection` / `xero_account_mapping` / `xero_transaction` / `money_setting` / `permission_override`
- `event` ∈ `created` / `updated` / `archived` / `moved` / `connected` / `synced` / `sent` / `locked`
- `payload` carries the before/after diff (redacted for `xero_*` rows — no PII logged).

**UI retrieval:** Money's Audit surface (`/money/settings/audit-log`) queries SHARED `audit_log` filtered by `section='money'` + foundry_id. Retention is governed by `money_settings.retention_years` (nightly cron).

**Extensions Money needs on SHARED `audit_log` (additive migrations):**

| Column | Type | Notes |
|---|---|---|
| `ip_address` | `inet NULL` | For compliance export |
| `user_agent` | `text NULL` | For compliance export |

These columns are additive — they live on the shared `audit_log` table, null-safe, and do not affect Forge/Products/Plan writes.

---

### `event_log` signal contract — **SHARED table (landed Phase 1)**

SHARED `event_log` (SHARED-SCHEMA §1.4) is where Money writes Today-surface signals. This is the contract Money must emit, by event:

| Trigger | `source_entity_type` | `urgency` | `decay_rate` | `cta_label` | `cta_href` |
|---|---|---|---|---|---|
| Runway drops below `runway_danger_weeks` | `runway_danger` | `critical` | `immediate` | "Review runway" | `/money/cockpit` |
| Runway crosses from healthy to caution | `runway_caution` | `high` | `3d` | "Review runway" | `/money/cockpit` |
| Variance exceeds `variance_alert_pct` on any category | `variance_alert` | `medium` | `7d` | "Review variance" | `/money/plan/variance` |
| Large expense flagged (> `large_expense_threshold_cents`) | `unusual_expense` | `medium` | `3d` | "Review transaction" | `/money/plan/tx/:id` |
| Xero sync failed for > 24h | `xero_sync_failed` | `high` | `1d` | "Reconnect Xero" | `/money/cockpit/connect` |
| Investor touch overdue > 7d (stage ≥ `meeting`) | `touch_overdue` | `high` | `3d` | "Log touch" | `/money/raise/investor/:id` |
| Round close date < 14 days and target not met | `round_close_approaching` | `high` | `1d` | "Review round" | `/money/raise` |
| Verbal commit received | `verbal_commit` | `medium` | `7d` | "View investor" | `/money/raise/investor/:id` |
| Round closed (final wire) | `round_closed` | `medium` | `30d` | "Send update" | `/money/raise/update` |
| Investor update send failed (bounce > 10%) | `update_bounce_spike` | `high` | `3d` | "Review deliverability" | `/money/raise/update/:id` |
| Credits budget > 80% of tier cap | `credits_budget_warning` | `medium` | `7d` | "Review usage" | `/money/settings/credits` |
| Credits budget > 100% (hard cap) | `credits_budget_breach` | `critical` | `immediate` | "Upgrade plan" | `/billing` |

Other mutations (BOM-line added, interview-note edited, plan-line recategorised) write `audit_log` only, not `event_log` — test is "would a founder opening the app at 8am want to know this happened?" per SHARED §5.1.

**Insert pattern:** each Money server action calls a helper `emitEvent({ foundry_id, section: 'money', source_entity_type, source_entity_id, urgency, decay_rate, title, body, cta_label, cta_href, assigned_to, expires_at })` that writes the SHARED `event_log` row. Auto-resolution: setting `resolved_at` on the source trigger (e.g. touch logged → `touch_overdue` row resolves) closes the event silently.

**Realtime:** Today surface subscribes via Supabase Realtime (SHARED §6 Q3 resolved 2026-04-19) — events land in the triage queue as Money writes them.

---

### `ai_credits` family — Specialist cost metering (SHARED §6 Q5 resolved 2026-04-19)

Money owns specialist LLM cost accounting. The contract:

1. **Forge / Products / Plan** write `specialist_call` rows to SHARED `audit_log` (entity_type=`specialist_call`, actor_specialist set, payload carries `{model, input_tokens, output_tokens, duration_ms, specialist_id, invocation_id}`).
2. **Money** reads those rows + computes cost via `ai_credits_cost_rules` + stores rollup in `ai_credits_ledger` + surfaces in Cockpit "Credits" bar and `/money/settings/credits`.
3. **Enforcement:** `money_settings.credits_cap_cents` + `ai_credits_budget` drives hard-ceiling checks in the Forge/Products/Plan server actions via a `checkCreditsBudget(foundry_id)` guard. Over-budget → specialist invocation rejected with `CREDITS_EXCEEDED` error.

#### `ai_credits_cost_rules`

Pricing table keyed by model + specialist tier. Seeded per release; editable per foundry for enterprise overrides.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `foundry_id` | `text NULL REFERENCES foundries(id)` | NULL = global default, foundry row overrides when present |
| `model_id` | `text NOT NULL` | `sonnet` / `haiku` / `opus` / `deepseek-v4` / `gpt-5.4` / etc |
| `input_cost_per_mtoken_cents` | `integer NOT NULL` | |
| `output_cost_per_mtoken_cents` | `integer NOT NULL` | |
| `margin_multiplier` | `numeric(4,2) NOT NULL DEFAULT 1.00` | Applied to user-facing cost (e.g. 1.20 = 20% service margin) |
| `effective_from` | `timestamptz NOT NULL` | |
| `effective_to` | `timestamptz NULL` | null = current |
| `created_at`, `updated_at` | | |

**Indexes:** `(foundry_id NULLS FIRST, model_id, effective_from DESC)`.

**RLS:** read = any foundry member; write = service_role only (global pricing) OR founder+co_founder for per-foundry overrides.

#### `ai_credits_ledger`

One row per specialist invocation. Denormalised rollup from `audit_log.specialist_call` events. Written by a nightly cron + backfilled on-demand.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `foundry_id` | `text NOT NULL` | |
| `audit_log_id` | `bigint NOT NULL REFERENCES audit_log(id)` | Source row |
| `specialist_id` | `text NOT NULL` | `cal` / `sage` / `finn` / `fiona` / `priya` etc |
| `section` | `text NOT NULL` | `forge` / `products` / `plan` / `money` — where the invocation originated |
| `invoked_by_user_id` | `uuid NULL` | null = system-initiated |
| `model_id` | `text NOT NULL` | |
| `input_tokens` | `integer NOT NULL` | |
| `output_tokens` | `integer NOT NULL` | |
| `cost_cents` | `integer NOT NULL` | Computed at rollup time via `ai_credits_cost_rules` |
| `billable_cost_cents` | `integer NOT NULL` | `cost_cents × margin_multiplier` |
| `duration_ms` | `integer NULL` | |
| `invocation_id` | `text NULL` | Trace ID for cross-service debugging |
| `invoked_at` | `timestamptz NOT NULL` | Mirrors `audit_log.created_at` |
| `created_at` | `timestamptz DEFAULT now()` | When the ledger row was written |

**Indexes:** `(foundry_id, invoked_at DESC)`, `(foundry_id, specialist_id, invoked_at)`, `(foundry_id, section, invoked_at)`. Unique `(audit_log_id)`.

**RLS:** read = founder+co_founder only (cost is founder-confidential); write = service_role only.

**Backfill strategy:** trigger on `audit_log` INSERT where `entity_type='specialist_call'` writes the `ai_credits_ledger` row synchronously in the same transaction. Nightly job reconciles any orphans.

#### `ai_credits_budget`

Budget cap per foundry per period. Multiple periods can coexist (e.g. monthly soft-cap + annual hard-cap).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `foundry_id` | `text NOT NULL` | |
| `period_type` | `text NOT NULL CHECK (period_type IN ('monthly','quarterly','annual','custom'))` | |
| `period_start` | `date NOT NULL` | |
| `period_end` | `date NOT NULL` | |
| `cap_cents` | `integer NOT NULL` | Hard ceiling for this period |
| `warning_threshold_pct` | `smallint NOT NULL DEFAULT 80` | Event fires at this % of cap |
| `breach_behaviour` | `text NOT NULL DEFAULT 'block' CHECK (breach_behaviour IN ('block','warn_only'))` | |
| `tier_seeded` | `boolean DEFAULT false` | True if created from subscription plan defaults |
| `created_at`, `updated_at` | | |

**Indexes:** `(foundry_id, period_start, period_end)`, `(foundry_id, period_type, period_start DESC)`.

**RLS write whitelist:** `founder`, `co_founder`.

**Default seeding:** on foundry creation, `ai_credits_budget` rows are seeded from `SUBSCRIPTION_PLANS[tier].limits.creditsCapCents` (existing ForgeOS constant). Seeding is idempotent on tier upgrade.

---

### `audit_log` columns Money adds (Money-owned extensions)

See `audit_log` section above. The `ip_address` + `user_agent` columns are additive extensions to the SHARED table.

---

### `permission_override`

Per-user exceptions to the 4-role defaults.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `foundry_id` | `text NOT NULL` | |
| `user_id` | `uuid NOT NULL REFERENCES profiles(id)` | |
| `capability` | `text NOT NULL` | Enum of capability keys |
| `granted` | `boolean NOT NULL` | True = grant access beyond role default |
| `granted_by_user_id` | `uuid REFERENCES profiles(id)` | |
| `reason` | `text NULL` | |
| `expires_at` | `timestamptz NULL` | Optional time-box |
| `created_at` | | |

**Unique:** `(foundry_id, user_id, capability)`.

---

### `xero_connection`

One per foundry (multi-Xero-org per foundry deferred to V2). **One Xero org across two foundries is explicitly REJECTED in V1** — the OAuth flow errors with "This Xero organisation is already connected to foundry X. Contact support to split." Primary key stays `foundry_id` for V1; a future `(foundry_id, organisation_id)` composite enables the multi-org-per-foundry direction additively.

| Column | Type | Notes |
|---|---|---|
| `foundry_id` | `text PK` | |
| `organisation_id` | `text NOT NULL` | Xero tenant ID |
| `organisation_name` | `text NOT NULL` | |
| `access_token_encrypted` | `bytea NOT NULL` | AES-256 |
| `refresh_token_encrypted` | `bytea NOT NULL` | |
| `token_expires_at` | `timestamptz NOT NULL` | |
| `scopes` | `text[] NOT NULL` | |
| `connected_by_user_id` | `uuid NOT NULL` | |
| `connected_at` | `timestamptz NOT NULL` | |
| `last_sync_at` | `timestamptz NULL` | |
| `sync_frequency` | `text DEFAULT 'every_15_min'` | |
| `webhook_enabled` | `boolean DEFAULT true` | |
| `sync_state` | `text DEFAULT 'healthy' CHECK (sync_state IN ('healthy','syncing','error','paused'))` | |
| `last_error_message` | `text NULL` | |

---

### `xero_account_mapping`

Xero account code → ForgeOS category.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `foundry_id` | `text NOT NULL` | |
| `xero_account_code` | `text NOT NULL` | `7000`, `4000` etc |
| `xero_account_name` | `text NOT NULL` | |
| `forgeos_category` | `text NOT NULL` | Enum matching plan_line_items |
| `confidence_pct` | `smallint NOT NULL` | From auto-match |
| `user_confirmed` | `boolean DEFAULT false` | |
| `user_confirmed_by_user_id` | `uuid NULL` | |
| `user_confirmed_at` | `timestamptz NULL` | |

**Unique:** `(foundry_id, xero_account_code)`.

---

### `xero_transaction`

Imported transactions. Large table — budget for indexing + partitioning if growth warrants.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `foundry_id` | `text NOT NULL` | |
| `xero_transaction_id` | `text NOT NULL` | Xero's UUID |
| `transaction_date` | `date NOT NULL` | |
| `description` | `text NOT NULL` | |
| `vendor_name` | `text NULL` | |
| `amount_cents` | `integer NOT NULL` | Negative = out, positive = in |
| `currency` | `text DEFAULT 'GBP'` | |
| `xero_account_code` | `text NOT NULL` | |
| `assigned_category` | `text NOT NULL` | Resolved via xero_account_mapping or override |
| `category_override` | `text NULL` | User manual reclass |
| `category_override_by_user_id` | `uuid NULL` | |
| `flagged` | `text NULL` | `unusual_for_category`, `structural_drift`, `duplicate_suspected` |
| `synced_at` | `timestamptz NOT NULL` | |

**Indexes:** `(foundry_id, transaction_date DESC)`, `(foundry_id, assigned_category, transaction_date)`, `(xero_transaction_id)` unique.

**Dedup:** unique on `(foundry_id, xero_transaction_id)` — reimports are idempotent.

---

## 3 · Server action file layout

Following the existing `src/actions/*.ts` pattern:

- `src/actions/money-plan.ts` — plan_line_items CRUD, formula eval, CSV import
- `src/actions/money-scenarios.ts` — burn_scenarios, scenario_overrides
- `src/actions/money-cockpit.ts` — runway computation, cash-balance query, variance monitor
- `src/actions/money-raise.ts` — round + pipeline_state (CRUD) + pipeline_events (append)
- `src/actions/money-thesis.ts` — thesis versioning + match scoring
- `src/actions/money-pitch.ts` — pitch_prep_section + pitch_prep_slide
- `src/actions/money-updates.ts` — investor_update + send/tracking
- `src/actions/money-xero.ts` — OAuth + mapping + sync + webhooks
- `src/actions/money-expense.ts` — quick-log expense with receipt OCR
- `src/actions/money-invoice.ts` — quick-send invoice + Stripe link
- `src/actions/money-audit.ts` — audit_log read + export
- `src/actions/money-permissions.ts` — role + override management
- `src/actions/money-settings.ts` — money_settings CRUD

All actions enforce: `withAuth` wrapper → foundry_id resolution → role check → mutation → audit_log write. Use the existing `withAuth` helper pattern from ForgeOS.

---

## 4 · Permissions matrix (9-role, per Money table)

SHARED-SCHEMA §6 Q4 is OPEN at the enum level (deferred to its own focused PR). This section defines Money's *target* matrix so enum-expansion PR has a ready reference.

**Legend:** R = Read · W = Write/Update · C = Create · D = Delete (archive) · L = Lock/Approve · — = No access

| Table                         | founder | co_founder | executive | cto | advisor | contractor | read_only | fractional_exec | apprentice |
|---|---|---|---|---|---|---|---|---|---|
| `money_settings`              | RWCD    | RW         | R         | R   | R       | —          | R         | RW              | R          |
| `plan_line_items`             | RWCDL   | RWCD       | R         | R   | R       | —          | R         | RWCD            | R          |
| `burn_scenarios`              | RWCDL   | RWCD       | R         | R   | R       | —          | R         | RWCD            | R          |
| `scenario_overrides`          | RWCD    | RWCD       | R         | R   | R       | —          | R         | RWCD            | R          |
| `investor_thesis`             | RWCDL   | RWCD       | R         | —   | R       | —          | R         | RWCD            | —          |
| `investor_round`              | RWCDL   | RWCD       | R         | —   | R       | —          | R         | RWCD            | —          |
| `investor_pipeline_state`     | RWCD    | RWCD       | R         | —   | R       | —          | R         | RWCD            | —          |
| `investor_pipeline_events`    | RWC     | RWC        | R         | —   | R       | —          | R         | RWC             | —          |
| `investor_update`             | RWCDL   | RWCD       | R         | —   | R       | —          | R         | RWCD            | —          |
| `investor_update_recipient`   | R       | R          | R         | —   | R       | —          | R         | R               | —          |
| `pitch_prep_section`          | RWCD    | RWCD       | R         | —   | R       | —          | R         | RWCD            | —          |
| `pitch_prep_slide`            | RWCD    | RWCD       | R         | —   | R       | —          | R         | RWCD            | —          |
| `xero_connection`             | RWCD    | RWCD       | —         | —   | —       | —          | —         | RWCD            | —          |
| `xero_account_mapping`        | RWCD    | RWCD       | R         | —   | —       | —          | —         | RWCD            | —          |
| `xero_transaction`            | R       | R          | R         | —   | R       | —          | R         | R               | —          |
| `ai_credits_ledger`           | R       | R          | —         | —   | —       | —          | —         | R               | —          |
| `ai_credits_budget`           | RWCD    | RWCD       | —         | —   | —       | —          | —         | RWCD            | —          |
| `ai_credits_cost_rules`       | R       | R          | —         | —   | —       | —          | —         | R               | —          |
| `permission_override`         | RWCD    | RW         | —         | —   | —       | —          | —         | —               | —          |
| SHARED `audit_log` (money scope) | R  | R          | R         | R   | R       | —          | R         | R               | R          |

**Interpretation rules:**
- `advisor` + `read_only` can see Raise but not edit — investors expect confidentiality, advisors might be investors themselves.
- `contractor` cannot see Money at all (no row-level access) — contractors bill against BOM/Forge but never see cap table / runway / salaries.
- `apprentice` sees Cockpit + Plan only, read-only — they can learn from the numbers but not steer them.
- `fractional_exec` = a Fractional Forge fractional CFO/COO placed into the foundry — full Money edit rights minus legal/governance (no `permission_override` edits).
- `cto` sees Cockpit + Plan read-only — they understand cash context but don't touch fundraising.
- **Lock/Approve (L)** rights: only `founder` can lock a Scenario (mark board-approved), approve a Brief cost-ceiling breach, or send an investor update on the Board Pack (co-founder can draft; founder locks-and-sends).
- `permission_override` edits are founder-exclusive + co_founder (with founder notified) per the `permission_override` table design in §2.

**Phase-2 compile strategy:** until the 5→9 enum migration ships, Money writes compile into 5 roles by collapsing:
- `founder` + `co_founder` + `executive` + `fractional_exec` → `Founder` (in SHARED enum)
- `cto` + `advisor` + `read_only` + `contractor` → `Executive` (in SHARED enum)
- `apprentice` → `Apprentice` (in SHARED enum)

This means Phase-2 shipping compile is "coarse" — finer distinctions land in a post-Phase-2 enum-expansion PR. The `permission_override` table provides per-user exceptions to close the gap during the coarse-compile window.

---

## 5 · Data preservation (flag rollback safety)

**Per PHASE-PLAN.md §Data preservation rules, Phase 2 must ship `MONEY-DATA-PRESERVATION.md`.** This section IS that contract for the pre-build phase — the build terminal expands it in its PR. Real legacy table names confirmed by the legacy-routes audit (see HANDOVER-money.md §Legacy inventory).

### 5.1 Strategy choice — MIGRATE, not VIEW, not GREENFIELD

Red-team #1 flagged a contradiction between PHASE-PLAN ("same tables, re-surfaced") and MONEY-SCHEMA (15 greenfield tables). **Resolution:** use a **MIGRATE + dual-read** strategy during the rollout window:

1. **One-time forward migration** runs at Phase 2 code ship: every row in `cash_out_items` / `cash_in_items` / `burn_scenarios` / `investor_alerts` / `investor_notes` / `investor_shortlist` / `investor_views` / `investor_news_intel` is copied into the new Money V2 tables with `source='legacy_migration'` tags.
2. **Write-twin triggers** during the coexistence window (flag rollout phase): new writes to Money V2 tables echo into legacy tables where schemas align. Legacy UI keeps reading legacy tables; Money V2 UI reads V2 tables. Twin triggers removed post-cutover.
3. **No `VIEW` approach** — unioning old+new schema creates a third-thing no one understands and makes RLS reasoning impossible.

### 5.2 Table-by-table mapping (confirmed by legacy-routes audit)

| Legacy table (exists today) | Money V2 target | Strategy | Key migration notes |
|---|---|---|---|
| `cash_out_items` | `plan_line_items` (direction='out') | MIGRATE + twin | Category enum maps 1:1; drop `product_id` FK (Forge-specific); add `source='legacy_migration'` |
| `cash_in_items` | `plan_line_items` (direction='in') | MIGRATE + twin | `source_type → category` map; `probability_pct` carries over |
| `burn_scenarios.item_overrides` (JSONB) | `scenario_overrides` (normalised rows) | ETL + twin | For each scenario, iterate `item_overrides` array and INSERT one `scenario_overrides` row per entry; preserve original `(scenario_id, line_item_id)` mapping |
| `investor_alerts` | `investor_pipeline_state` (current_stage='target') | MIGRATE | User-scoped RLS today — foundry_id backfill required via `foundry_memberships` |
| `investor_notes` | `investor_pipeline_events` (event_type='note_added') | MIGRATE | Each note becomes one append-only event row |
| `investor_shortlist` | `investor_pipeline_state` (current_stage='target', kanban position in payload) | MIGRATE | Preserve `sort_order` → V2 kanban position |
| `investor_views` | `investor_pipeline_events` (event_type='view_recorded') | MIGRATE | Optional — view log is noisy; consider retaining only last 30 days |
| `investor_news_intel` | `investor_pipeline_events` (event_type='news_logged') | MIGRATE | Preserve user attribution + source_url |
| `marketplace_listings` (Finance category) | `investor_firms` + `investor_people` (derived) | SHARED-READ | No migration — V2 reads marketplace_listings for directory data; foundry overlay lives on `investor_pipeline_state` |
| `rounds` / `fundraise_rounds` (if exists) | `investor_round` | MIGRATE | Confirm table presence during build — legacy audit couldn't verify a rounds table exists |
| Xero connection (if exists) | `xero_connection` | ADDITIVE | Same name; additive columns only; existing OAuth token stays valid |

### 5.3 RLS preservation (critical — legacy tables use user_id, not foundry_id)

Legacy-routes audit found: `investor_alerts / investor_notes / investor_views / investor_shortlist` all use `user_id = auth.uid()` RLS, not foundry scoping. Money V2 tables MUST use `foundry_memberships` scoping per SHARED-SCHEMA §0. **Migration step:** backfill `foundry_id` on each legacy row by looking up the owning user's primary foundry. If the user belonged to multiple foundries at the time, use the foundry they created the row under (requires `audit_log` lookup). Rows with ambiguous foundry assignment are flagged for founder-reconciliation post-migration.

### 5.4 Flag-off behaviour (rollback safety)

- New `/money/*` routes return 404 → sidebar MONEY [V2] group is hidden (via `FeatureFlagGate` on the sidebar data file).
- Legacy `/cash-burn/*`, `/investors/*`, `/fundraise/*`, `/cash-burn/pnl` routes remain mounted for 90 days post-cutover and continue reading legacy tables.
- **Risk:** data written to Money V2 tables during the new-experience window is not readable from legacy UI. **Mitigation:** the write-twin triggers (5.1.2) keep legacy tables current while the flag is on. Flag-off continues to work because legacy tables were maintained throughout.
- **Legacy-table retention:** 90 days post-cutover (per `money_settings.retention_years` flag), then archived to cold storage.

### 5.5 What's in the build-terminal's MONEY-DATA-PRESERVATION.md

The build terminal expands this section into a dedicated doc that answers the 5 PHASE-PLAN questions (§Data preservation rules):
1. What existing data does Phase 2 touch? → §5.2 table above
2. How is it preserved? → MIGRATE + twin (§5.1)
3. Flag-on behaviour? → Money V2 reads V2 tables; twin keeps legacy current
4. Flag-off after new data created? → legacy UI reads legacy tables (kept current by twin)
5. Legacy routes? → preserved read-write for 90 days then read-only archive

---

## 6 · Open decisions (NOT resolved · bring up before coding)

1. **Multi-currency display** — amounts in `amount_cents` + per-row `currency`. Display in `money_settings.currency`. Do we convert at the day's FX rate or at the transaction date's FX rate? **Proposed:** transaction-date rate, cached in an `fx_rate_cache` table (new, small, OSS API seeds daily).

2. **Specialist LLM cost attribution granularity** — per-user or per-foundry? **RESOLVED 2026-04-19:** per-foundry via `ai_credits_ledger` (§ai_credits family above). Per-user attribution is a display slice on the ledger, not a storage decision.

3. **Soft-delete vs hard-delete semantics** — every table says `archived_at`. Do archived rows count against plan limits? Appear in historical queries? **Proposed:** archived excluded from current queries and from plan limits; visible in audit + admin views only. Exception: `plan_line_items` archived rows stay in historical P&L + variance queries (their actuals still count).

4. **Onboarding state persistence — RESOLVED 2026-04-19:** foundry-level for primary steps (stored in `money_settings.onboarding_progress jsonb` — shape `{ connect_accounting: bool, first_plan_line: bool, define_thesis: bool, create_round: bool, log_first_touch: bool, send_first_update: bool }`), user-level for "has seen the tour" (stored in `profiles.onboarding_data jsonb` — existing column). Progress widget in sidebar queries `money_settings.onboarding_progress` per foundry.

4a. **Starter plan templates (new, red-team #7):** add a shared read-only table `plan_templates` (global, seeded by release) with rows for `uk_pre_seed_4_eng`, `us_pre_seed_bootstrapped`, `uk_seed_scaling`, `hardware_prototyping`. Each row has a JSONB `line_items_seed` array that the onboarding flow clones into `plan_line_items`. Table is NOT Money-owned — it's a shared seed table. **Proposed schema:** `id text PK`, `label text`, `region text`, `stage text`, `line_items_seed jsonb`, `active boolean`, `created_at`. No RLS (read is public).

5. **Currency conversion on historical Xero data** — when founder changes reporting currency mid-year, does historical data reconvert? **Proposed:** no — historical displays stay in original-at-capture currency with a "in GBP at the time" caveat.

6. **`investor_firms` / `investor_people` ownership** — currently marked "out of scope for V1 MVP · reuses existing `investors.ts` backing tables". **Open:** is the existing `investors` table a Money-owned or a shared-directory table? If shared, should it move to `public.investor_firms_directory` with cross-foundry read? **Proposed:** shared directory, foundry-specific overlays via `investor_pipeline_state`.

7. **Specialist cost-per-call ceiling** — should Money enforce a per-invocation cap (e.g. "reject any specialist call > £2 in cost")? Or only aggregate budget? **Proposed:** aggregate only; per-call cap is a specialist-config concern (handled in Forge's specialist personalities), not a Money concern.

---

## 7 · Migration order (recommended)

Recommended order so FKs resolve, revised to reflect ai_credits family + SHARED-SCHEMA reuse:

1. `money_settings` (foundry-scoped; depends on `foundries` which landed in Phase 1)
2. `xero_connection` + `xero_account_mapping`
3. `plan_line_items`
4. `burn_scenarios` + `scenario_overrides`
5. `xero_transaction` (depends on mapping)
6. `investor_thesis` + `foundries.active_thesis_id` additive column
7. `investor_round`
8. `investor_pipeline_state` + `investor_pipeline_events`
9. `pitch_prep_section` + `pitch_prep_slide`
10. `investor_update` + `investor_update_recipient`
11. `ai_credits_cost_rules` (global pricing seed)
12. `ai_credits_budget` (foundry seeding from subscription tier)
13. `ai_credits_ledger` + trigger on SHARED `audit_log` for specialist_call rollup
14. `permission_override`
15. Additive columns on SHARED `audit_log`: `ip_address`, `user_agent`

Plus RLS enable on each table as it lands. Plus per-table triggers for `updated_at`. Plus write-twin triggers for legacy-table echo (removed post-cutover).

Estimated ~18 migrations, ~1000 lines of SQL total.

---

## 8 · Change log

| Version | Date | Change | Author |
|---|---|---|---|
| 0.1 | 2026-04-19 (initial) | First draft — resolved the 5 gap-audit ambiguities, ~15 tables | Money prep terminal |
| 0.2 | 2026-04-19 (prep refresh) | Added ai_credits family (SHARED §6 Q5), Today signal contract, 9-role matrix, data preservation contract, reconciled `foundry_memberships` naming with SHARED-SCHEMA, clarified `audit_log` is SHARED not Money-owned, added feature flag statement, bumped migration count 15→18 | Money prep terminal |
| 0.3 | 2026-04-19 (red-team pass) | Post-schema adversarial review closed findings: §3 (trigger-maintained state column replaces materialised view), `isAttentionWorthy` gate spec, Xero one-org-one-foundry rejection explicit, §8 expanded with confirmed legacy table names (`cash_out_items`/`cash_in_items`/`burn_scenarios.item_overrides`/`investor_alerts`/`investor_notes`/`investor_shortlist`/`investor_views`/`investor_news_intel`) + foundry_id backfill plan, §9.4a `plan_templates` seed table added. Top-3 red-team HIGH items cross-referenced in HANDOVER-money.md. | Money prep terminal |

---

## What's next (after schema agreed)

1. Review this doc with Tristan — push back on anything wrong
2. Resolve the 5 open decisions above
3. Generate the 15 migration files
4. Generate TypeScript types via `supabase gen types --linked`
5. Build the 13 server action files (one per domain)
6. Build the pages in route priority order: Cockpit → Plan → Raise → drills → admin
7. Sidebar nav update (add MONEY section, retire old Cash Burn section)
8. Run existing regression tests · add Money-specific smoke tests

~4–6 weeks to MVP at the existing pace if no show-stoppers surface during migration.
