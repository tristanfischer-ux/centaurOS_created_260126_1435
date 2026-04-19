# PRODUCTS-SCHEMA.md

**Status:** prep draft — awaiting red-team review
**Owner:** Forge+Products terminal
**Phase:** 4 (last — after Forge, Money, Plan ship)
**Companion docs:** [`SHARED-SCHEMA.md`](./SHARED-SCHEMA.md) · [`PHASE-PLAN.md`](./PHASE-PLAN.md) · [`FORGE-MOCKUP-PRODUCTS-V2.html`](./FORGE-MOCKUP-PRODUCTS-V2.html) · [`PRODUCTS-MOCKUP-GAP-AUDIT.html`](./PRODUCTS-MOCKUP-GAP-AUDIT.html)

> **Scope.** This doc covers Products-owned section-specific tables (`hypotheses`, `market_sizings`, `competitors`, `customer_interviews`, `lois`, `assumptions`, `experiments`, `readiness_items`, `hypothesis_archive_reasons`) and the contracts Products has with the rest of ForgeOS: the **project spine** (Products ↔ Forge handoff), the **event_log** (Today surface), the **audit_log** (compliance), and the **9-role permissions matrix**.
>
> **Non-goals.** Forge-side tables (owned by `FORGE-SCHEMA.md`, not yet written), Money-side tables (MONEY-SCHEMA.md, not yet written), Plan-side tables (PLAN-SCHEMA.md, not yet written).

---

## 0 · Why Products is being redesigned

The current `/products` page is a 5-tab stub (Overview · Market · Economics · Fundability · History) riding on a single `products` table with three JSONB grab-bags (`market_assessment`, `unit_economics`, `fundability_score`). Three rounds of red-team (synthesised in MemPalace drawer `forgeos/decisions`, 2026-04-19) concluded:

- **Kill the 56/100 Fundability composite score** — pseudo-quant built on hallucinated inputs. Replace with a Readiness Checklist grouped by investor question (Team · Ask · Market · Moat · Path).
- **Kill unsourced "AI Estimated" TAM/SAM/SOM** with precise digits. Need source + methodology + date + confidence, or kill.
- **Kill Priya's long generic narratives.** Keep the Synthesis ribbon, kill the monologue.
- **Keep Aligned-vs-Trade-off framing** — right structure, wrong inputs. Inputs need to be named numbers + cohorts, not consultancy-speak.
- **Keep the 5-tab scaffold** — structure is right. Content is what changes.

The new Products is a **market-validation workbench** — a founder tests hypotheses, logs evidence, and scores investor-readiness. It is **not** a product-catalogue CRUD.

---

## 1 · Five-tab structure (canonical)

| Tab | Canonical name (this doc + PHASE-PLAN) | Terminal-prompt alias | What the founder does here |
|---|---|---|---|
| 1 | **Hypothesis** | Hypothesis | One-page: problem · customer · offer · target unit price · target COGS · synthesis ribbon |
| 2 | **Market** | TAM-SAM-SOM | Sized with sources; segments with evidence; named competitors with URL + evidence links |
| 3 | **Evidence** | Evidence | Customer interviews · LOIs · assumption register · experiment log (the workbench) |
| 4 | **Economics** | Unit Economics | Target unit price + target COGS + contribution margin; reads COGS from Forge when linked |
| 5 | **Action** | Investor-Readiness | Readiness Checklist grouped by investor question; aligned-vs-trade-off moves |

**Every tab has an empty, partial, error, and populated state.** See `PRODUCTS-MOCKUP-INDEX.html` for the mock-set coverage and `PRODUCTS-MOCKUP-GAP-AUDIT.html` for known gaps.

### 1.1 Surface ownership per tab

| Tab | Primary table | Reads from | Writes event_log? |
|---|---|---|---|
| Hypothesis | `hypotheses` | — | Yes (on brief-draft, promote-to-Forge) |
| Market | `market_sizings`, `competitors` | — | Yes (on market re-size, competitor added with `#blocker` tag) |
| Evidence | `customer_interviews`, `lois`, `assumptions`, `experiments` | — | Yes (on LOI signed, assumption invalidated, interview tagged `blocker`) |
| Economics | `hypotheses.target_unit_price_pence`, `hypotheses.target_cogs_pence` | **Forge** `projects.unit_cost_ceiling_pence` when linked | No (Economics edits are not "founder-attention-worthy") |
| Action | `readiness_items` | `hypotheses`, `market_sizings`, `customer_interviews`, `lois` | Yes (on readiness-item closed) |

---

## 2 · Canonical entity model

### 2.1 `hypotheses` — one row per founder hypothesis

Replaces the current `products` table as the entity spine. Every existing `products` row migrates to a `hypotheses` row 1:1 (§3 data preservation).

| column | type | notes |
|---|---|---|
| id | uuid PK DEFAULT gen_random_uuid() | |
| foundry_id | text NOT NULL FK → foundries.id | RLS scope |
| project_id | uuid NULL FK → projects.id | Populated on PROMOTE_TO_FORGE; NULL until then |
| created_by | uuid NOT NULL FK → auth.users.id | |
| name | text NOT NULL | Display name |
| slug | text NOT NULL | Unique per foundry; URL-stable |
| one_liner | text | One-sentence statement of the offer |
| problem | text | Who has this pain, how badly, today |
| customer_segment | text | Primary cohort (free text + pick-list) |
| hero_image_url | text | Supabase storage path |
| lifecycle_stage | text NOT NULL DEFAULT 'concept' | `concept` / `researching` / `validated` / `promoted` / `archived` — mirrors projects.lifecycle_stage once linked |
| target_unit_price_pence | integer | What the customer pays |
| target_cogs_pence | integer | Founder estimate until `project_id` is set; then READ-ONLY (sourced from Forge's `unit_cost_ceiling_pence`) |
| target_monthly_units | integer | Volume assumption |
| synthesis_ribbon | text | Short (≤ 280 chars) derived summary — populated by specialist (Priya), editable by founder |
| archived_at | timestamptz | Null = active |
| archived_reason_id | uuid FK → hypothesis_archive_reasons.id | Non-null only when archived |
| created_at / updated_at | timestamptz NOT NULL DEFAULT now() | |

**RLS:** foundry-scoped per §5 of SHARED-SCHEMA.
**Index:** `(foundry_id, lifecycle_stage)`, `(foundry_id, archived_at)`, `(project_id)` unique partial WHERE `project_id IS NOT NULL`.
**Unique:** `(foundry_id, slug)`.

**Naming rule (§5.3 of SHARED-SCHEMA).** `target_unit_price_pence` and `target_cogs_pence` — never just "cost" or "price". `target_cogs_pence` is read-only when `project_id IS NOT NULL`; UI shows a **"sourced from Forge"** badge in place of the input field.

### 2.2 `market_sizings` — one row per hypothesis

One sizing per hypothesis (Market tab is single-instance, not a list).

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| hypothesis_id | uuid NOT NULL FK → hypotheses.id ON DELETE CASCADE | |
| foundry_id | text NOT NULL FK | Denormalised for RLS speed |
| tam_gbp_pence | bigint | |
| sam_gbp_pence | bigint | |
| som_gbp_pence | bigint | |
| methodology | text NOT NULL | How the number was derived (top-down / bottom-up / hybrid — free text required) |
| source_url | text | Primary citation |
| source_label | text | Human label for citation |
| sourced_at | date | When the cited source was published / last updated |
| confidence | text NOT NULL DEFAULT 'low' | `low` / `medium` / `high` — shown as confidence bar on card |
| segments | jsonb | Array of `{ name, size_units, size_gbp_pence, evidence_url, evidence_label }` |
| last_resized_at | timestamptz | Surfaces to Today if > 180 days stale AND confidence < 'high' |
| created_at / updated_at | timestamptz | |

**Hard constraint:** `source_url IS NOT NULL OR methodology LIKE '%founder-estimate%'` — you cannot save a sizing without either a source OR an explicit "founder estimate" acknowledgement. This kills the "AI Estimated" hallucination pattern. If the founder explicitly marks it as their own estimate, fine — just no fake sources.

### 2.3 `competitors` — many per hypothesis

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| hypothesis_id | uuid NOT NULL FK | |
| foundry_id | text NOT NULL FK | |
| name | text NOT NULL | |
| url | text NOT NULL | External URL |
| insight | text | Short ≤ 200-char takeaway ("undercuts on price; weak on support") |
| price_pence | integer | Their competing unit price |
| tags | text[] | e.g. `['direct','incumbent','#blocker']` — `#blocker` tag auto-creates event_log entry |
| evidence_url | text | Saved search / screenshot / snapshot |
| added_at | timestamptz DEFAULT now() | |
| last_checked_at | timestamptz | Stale > 90 days → Today signal |
| created_at / updated_at | timestamptz | |

### 2.4 `customer_interviews` — many per hypothesis

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| hypothesis_id | uuid NOT NULL FK | |
| foundry_id | text NOT NULL FK | |
| interviewee_name | text | Nullable (anonymised ok) |
| interviewee_role | text | |
| interviewee_company | text | |
| segment_tag | text | Matches one of `market_sizings.segments[].name` — used for cross-ref filtering |
| interviewed_at | date NOT NULL | |
| quote | text NOT NULL | Single verbatim quote (the point of the record) |
| notes | text | Free-form |
| tags | text[] | `['must-have','nice-to-have','#blocker','#willing-to-pay']` |
| conducted_by | uuid FK → auth.users.id | |
| created_at / updated_at | timestamptz | |

**Attention rule.** Any interview tagged `#blocker` writes to event_log — "Blocker raised by {interviewee}: '{quote short}'".

### 2.5 `lois` — letters of intent

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| hypothesis_id | uuid NOT NULL FK | |
| foundry_id | text NOT NULL FK | |
| buyer_name | text NOT NULL | |
| buyer_role | text | |
| buyer_company | text | |
| status | text NOT NULL DEFAULT 'draft' | `draft` / `sent` / `signed` / `declined` |
| intent_units | integer | Volume they've indicated |
| intent_price_pence | integer | Price they're willing to pay (pence per unit) |
| intent_window | text | "within 12 weeks of shipping" |
| file_url | text | Supabase storage path to the signed doc |
| signed_at | date | Non-null when status=signed |
| created_at / updated_at | timestamptz | |

**Attention rule.** `status → 'signed'` writes to event_log with urgency `high` — founders want to celebrate and investors want the fact.

### 2.6 `assumptions` — the assumption register

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| hypothesis_id | uuid NOT NULL FK | |
| foundry_id | text NOT NULL FK | |
| text | text NOT NULL | The assumption ("Farmers will pay ≥£400/unit at launch") |
| risk_level | int 1-5 NOT NULL | 5 = kill-the-company-if-wrong; 1 = edge case |
| status | text NOT NULL DEFAULT 'untested' | `untested` / `testing` / `valid` / `invalid` |
| linked_experiment_id | uuid FK → experiments.id | The test that flipped it |
| last_status_change_at | timestamptz | |
| created_at / updated_at | timestamptz | |

**Attention rule.** `status → 'invalid'` AND `risk_level ≥ 4` writes to event_log with urgency `critical`.

### 2.7 `experiments` — the experiment log

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| hypothesis_id | uuid NOT NULL FK | |
| foundry_id | text NOT NULL FK | |
| name | text NOT NULL | Short title of the test |
| assumption_id | uuid FK → assumptions.id | Nullable — some experiments test a broader hypothesis |
| test_method | text | e.g. `landing_page` / `concierge_mvp` / `wizard_of_oz` / `price_survey` / `interview_series` |
| success_criterion | text NOT NULL | The pre-declared bar ("≥ 30% of interviewees agree to a £50 pre-order") |
| started_at | date | |
| ended_at | date | |
| result_summary | text | What happened |
| decision | text | `keep` / `iterate` / `kill` — the founder's call |
| created_at / updated_at | timestamptz | |

### 2.8 `readiness_items` — the investor-readiness checklist

Replaces the dead `fundability_score` JSONB composite.

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| hypothesis_id | uuid NOT NULL FK | |
| foundry_id | text NOT NULL FK | |
| investor_question | text NOT NULL | Grouping: `team` / `ask` / `market` / `moat` / `path` |
| item_text | text NOT NULL | e.g. "Can you name 3 signed LOIs?" / "Is target COGS within 2× a credible benchmark?" |
| status | text NOT NULL DEFAULT 'open' | `open` / `closed` / `not_applicable` |
| evidence_ref | jsonb | Array of `{entity_type, entity_id}` — which LOI/interview/sizing backs the close |
| closed_at | timestamptz | |
| closed_by | uuid FK → auth.users.id | |
| seeded_from_template | bool DEFAULT false | True if auto-created from the default 12-item template |
| created_at / updated_at | timestamptz | |

**Default seed.** Creating a hypothesis seeds 12 readiness_items (3 per investor_question × 5 groupings minus 3 composite items) from a hard-coded template. Founders can edit, delete, or add.

**Attention rule.** Three-or-more `closed` in a 7-day window writes a positive event_log entry ("Readiness: 3 items closed this week — viable for re-pitch"). Closing an individual item is not founder-attention-worthy.

### 2.9 `hypothesis_archive_reasons` — why it got archived

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| foundry_id | text NOT NULL FK | |
| label | text NOT NULL | e.g. `killed_by_assumption_invalidation` / `pivoted_into_other_hypothesis` / `market_too_small` / `paused_founder_decision` |
| pivoted_into_hypothesis_id | uuid FK → hypotheses.id | Non-null when label = `pivoted_into_other_hypothesis` |
| notes | text | Free-form |
| created_by | uuid FK → auth.users.id | |
| created_at | timestamptz DEFAULT now() | |

This is its own table, not a `hypotheses.archived_reason` text column, because a "killed" hypothesis with a clear reason trail is the signal investors want to see on a founder. It's valuable data, not stigma.

---

## 3 · Data preservation plan — existing `products` rows

**Hard guarantee (per PHASE-PLAN §Data preservation rules):** every existing `products` row must migrate into a `hypotheses` row with zero loss. Additive migration only — `products` table is NOT dropped.

### 3.1 Column-by-column mapping

| Existing `products` column | New destination | Conversion |
|---|---|---|
| `id` | `hypotheses.id` | **Keep identical** — makes URL rewrites trivial and keeps foreign keys (cash_in_items.product_id, cash_out_items.product_id, tasks.product_id, objectives.product_id) intact |
| `foundry_id` | `hypotheses.foundry_id` | Direct copy |
| `created_by` | `hypotheses.created_by` | Direct copy |
| `name` | `hypotheses.name` | Direct copy |
| `description` | `hypotheses.one_liner` (truncated to 280) + `hypotheses.problem` (full) | Split — one_liner shows on list view, problem on Hypothesis tab |
| `hero_image_url` | `hypotheses.hero_image_url` | Direct copy |
| `lifecycle` | `hypotheses.lifecycle_stage` | Direct copy if value ∈ new enum; otherwise map: `draft` → `concept`, `researched` → `researching`, `complete` → `promoted` |
| `market_assessment` jsonb | `market_sizings` row + `competitors` rows | Parse jsonb: `{tam, sam, som}` → sizing row with `methodology = 'migrated-from-v1'`, `source_url = NULL`, `confidence = 'low'`, `last_resized_at = products.updated_at`. `{competitors: [...]}` → one `competitors` row per entry |
| `unit_economics` jsonb | `hypotheses.target_unit_price_pence`, `target_cogs_pence`, `target_monthly_units` | Extract top-level fields — the rest stays in a separate archival blob (see 3.2) |
| `fundability_score` jsonb | 12 `readiness_items` rows (seeded from template) + `readiness_archive` blob (see 3.2) | Composite score is DISCARDED from UI; original jsonb preserved in archive for investigation |
| `unit_price_pence` | `hypotheses.target_unit_price_pence` | Direct copy (column already in pence) |
| `target_monthly_units` | `hypotheses.target_monthly_units` | Direct copy |
| `cad_lab_project_id` | `projects.linked_cad_lab_project_id` + `hypotheses.project_id` | Only if a `projects` row exists for that CAD project; otherwise leave NULL and let Phase 1 Forge backfill create the `projects` row later |
| `created_at` / `updated_at` | `hypotheses.created_at` / `updated_at` | Direct copy |

### 3.2 Archival preservation

The old JSONB blobs (`market_assessment`, `unit_economics`, `fundability_score`) are **not thrown away**. Two layers of safety:

1. **`products` table stays intact** — the row itself is never deleted, dropped, or modified by the migration. Legacy read-only view (shipped during Pre-Phase Coming Soon) reads directly from `products`.
2. **`hypothesis_migration_archive` table** — single-purpose audit table with one row per migrated hypothesis: `{hypothesis_id, original_products_row jsonb, migrated_at, migrated_by_user_id}`. Keeps a perfect snapshot so we can reason about "what was the fundability_score before" without re-joining.

### 3.3 Migration timing

- **Migration applies at flag-flip**, not at migration-push. Schema lands behind the `new_products_experience` flag off. Only when a foundry flips the flag on does the migration-per-foundry runner fire (one SQL `INSERT … SELECT` per foundry, idempotent via `ON CONFLICT (id) DO NOTHING`).
- **Rollback guarantee.** Flag-off returns the user to the Coming Soon page which reads from `products` directly. New data created in the new experience (hypothesis edits, market_sizings rows, etc.) remains in the new tables — when the flag flips back on, the user sees it again. Nothing is lost.
- **Flag-flip-off → flag-flip-on idempotency.** The migration runner is `ON CONFLICT DO NOTHING` on every insert, so re-running doesn't duplicate.

### 3.4 Known data gaps (migrate anyway)

The existing `products` schema has fields we need but doesn't carry:
- **No `source_url` on market_assessment** → migrated sizings get `confidence = 'low'` and a warning banner ("Market sizing needs a source — add one") auto-created as a readiness_item.
- **No `methodology` on market_assessment** → migrated sizings get `methodology = 'migrated-from-v1 — original methodology not captured'`.
- **No segment breakdown** → migrated `market_sizings.segments = []`; founder populates on re-sizing.
- **No per-assumption structure** — migrated hypotheses start with an empty assumptions register. Priya (specialist) can suggest 5 default assumptions from the hypothesis text if the founder runs "Seed assumptions" once.
- **No LOI table exists today** — `lois` starts empty for all migrated hypotheses.
- **No experiments table exists today** — `experiments` starts empty.

Each of these gaps surfaces as a readiness_item on the Action tab, so the founder knows what's missing.

---

## 4 · Today signal contract — events Products writes to `event_log`

Products writes an `event_log` row (§1.4 of SHARED-SCHEMA) when one of these happens. Everything else is `audit_log`-only.

| Event | Trigger | Urgency | Decay | Title template |
|---|---|---|---|---|
| `interview_blocker_tagged` | `customer_interviews` row inserted with tag `#blocker` | `high` | `7d` | "Blocker raised — {interviewee_role} @ {interviewee_company}" |
| `loi_signed` | `lois.status` → `signed` | `high` | `30d` | "LOI signed — {buyer_company} for {intent_units} units" |
| `assumption_invalidated` | `assumptions.status` → `invalid` AND `risk_level ≥ 4` | `critical` | `immediate` | "Assumption invalidated — {text short}" |
| `competitor_blocker_flagged` | `competitors` row inserted/updated with tag `#blocker` | `medium` | `7d` | "Competitor flagged — {competitor_name}" |
| `market_sizing_stale` | `market_sizings.last_resized_at` > 180 days AND `confidence != 'high'` | `medium` | `30d` | "Market sizing is 6+ months stale" |
| `competitor_check_stale` | `competitors.last_checked_at` > 90 days | `low` | `30d` | "Competitor check overdue — {name}" |
| `readiness_3_closed_week` | ≥ 3 `readiness_items.status` → `closed` in rolling 7 days | `medium` | `3d` | "Readiness: 3 items closed this week" |
| `hypothesis_promoted_to_forge` | `hypotheses.project_id` set via PROMOTE_TO_FORGE | `medium` | `1d` | "Promoted to Forge — {hypothesis.name}" |
| `hypothesis_archived` | `hypotheses.archived_at` set | `low` | `30d` | "Hypothesis archived — {hypothesis.name} ({reason})" |

**Founder-attention test (§5.1 of SHARED-SCHEMA).** Would a founder opening the app at 8am want to know this? If yes, event_log. If no, audit_log only.

**Things Products does NOT push to event_log:**
- Interview note edited
- Competitor URL updated without `#blocker` tag
- Readiness-item closed individually (it's the batch-of-3 that's noteworthy)
- Synthesis ribbon regenerated
- Economics-tab edits (unit price / target cogs adjustment)
- Adding a market segment

---

## 5 · Cross-section handoff — PROMOTE_TO_FORGE

This is the single most important cross-section action and the one the red team flagged hardest. It flips `canonical_surface` from `products` to `forge` and locks the Brief.

### 5.1 What crosses over

Per `project_transitions.carried_over_ids` jsonb map (§3.3 of SHARED-SCHEMA):

| From hypotheses | To Forge artefact |
|---|---|
| `hypotheses.name` | `projects.name` + `briefs.name` |
| `hypotheses.one_liner` + `problem` | `briefs.intent` (concatenated with separator) |
| `hypotheses.target_unit_price_pence` | `briefs.target_unit_price_pence` (informational only — Forge uses this as an envelope) |
| `hypotheses.target_cogs_pence` | `briefs.unit_cost_ceiling_pence` (this becomes the Forge build envelope) |
| `hypotheses.target_monthly_units` | `briefs.target_monthly_units` |
| `lois` where status=signed | `briefs.demand_evidence_refs jsonb` (array of LOI IDs) — NOT moved, just referenced |
| `market_sizings.som_gbp_pence` | `briefs.target_market_som_pence` (informational) |

**What does NOT cross (per R3 rule "Products owns hypotheses; Forge owns artefacts"):**
- TAM / SAM stay in Products only.
- Customer interviews stay in Products only.
- Assumptions / experiments stay in Products only.
- BOM stays in Forge only (hypothesis has no BOM).
- Readiness_items stay in Products only.

### 5.2 Ownership-flip trigger

On the PROMOTE_TO_FORGE server action:
1. `projects` row inserted with `lifecycle_stage = 'brief_locked'`, `hypothesis_id = {hypothesis.id}`, `canonical_surface = 'forge'`.
2. `hypotheses.project_id` set, `hypotheses.lifecycle_stage = 'promoted'`.
3. Forge side receives the brief payload via Forge's server action (not via direct Products write).
4. `audit_log` + `event_log` rows written.
5. `project_transitions` row logs the transition with `carried_over_ids` jsonb.
6. **Products UI now read-only for this hypothesis** — every tab editor is gated by `canonical_surface === 'products'`. The Hypothesis tab shows a banner: "Promoted to Forge — the Brief is the canonical surface now. Edits live at The Forge."

### 5.3 Unpromote / unarchive path

A rare-but-important inverse:
- `PROMOTE_TO_FORGE` is reversible only if the Brief is not yet locked. Once Brief-Lock fires in Forge, the hypothesis is permanently read-only in Products (founder can `archive` but cannot un-promote — the Brief is the authoritative record).
- `ARCHIVE` is reversible — unarchiving restores `archived_at = NULL` and re-enables editing, and if the hypothesis had a `project_id` the user sees a banner "This hypothesis was promoted to a Forge project — re-promote to re-link".

---

## 6 · Nine-role permissions matrix

Per SHARED-SCHEMA §6 Q4 ("OPEN — each section owner drafts their own row-level matrix"). This is Products' row.

**Nine roles** (deferred enum expansion per SHARED-SCHEMA §1.2): `founder / co_founder / executive / cto / advisor / contractor / read_only_observer / fractional_exec / apprentice`.

**Phase 4 ships with the current 5-role enum** (`Founder / Executive / Apprentice / AI_Agent / Supplier`) — the 9-role matrix below is the target state once the enum expansion PR lands (deferred per SHARED-SCHEMA §1.2). Until then, mappings collapse (`co_founder → Founder`, `cto → Executive`, etc.) and the matrix is enforced at the server-action level against the 5-role enum.

| Action | founder | co_founder | executive | cto | advisor | contractor | read_only_observer | fractional_exec | apprentice |
|---|---|---|---|---|---|---|---|---|---|
| **Read** the Products tab at all | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| **Create** a hypothesis | Y | Y | Y | Y | N | N | N | Y | N |
| **Edit** hypothesis name / one_liner / problem | Y | Y | Y | Y | N | N | N | Y | N |
| **Edit** target_unit_price / target_cogs (Economics) | Y | Y | Y | Y | N | N | N | Y | N |
| **Archive** a hypothesis | Y | Y | N | N | N | N | N | N | N |
| **Unarchive** a hypothesis | Y | Y | N | N | N | N | N | N | N |
| **Add / edit market_sizings** | Y | Y | Y | N | N | N | N | Y | N |
| **Add / edit competitors** | Y | Y | Y | N | N | Y | N | Y | Y |
| **Log a customer interview** | Y | Y | Y | Y | Y | Y | N | Y | Y |
| **Delete a customer interview** | Y | Y | Y | N | N | N | N | N | N |
| **Add / edit an LOI** | Y | Y | Y | N | N | N | N | Y | N |
| **Mark an LOI as `signed`** | Y | Y | N | N | N | N | N | Y | N |
| **Add an assumption** | Y | Y | Y | Y | Y | Y | N | Y | Y |
| **Change assumption status to `invalid`** | Y | Y | Y | Y | N | N | N | Y | N |
| **Run an experiment (log result + decision)** | Y | Y | Y | Y | N | Y | N | Y | Y |
| **Close a readiness_item** | Y | Y | Y | N | N | N | N | Y | N |
| **PROMOTE_TO_FORGE** | Y | Y | N | N | N | N | N | N | N |

### 6.1 Reasoning behind the harder calls

- **Why can't a `cto` promote-to-Forge?** Promotion is an investor-facing commitment (the brief is locked, canonical ownership flips). It's a company-ownership-level decision — founder / co_founder only. CTO lives downstream on the Forge side.
- **Why can a `contractor` add competitors?** Competitive research is a delegable task. Contracting this out is common and the blast radius is low (no revenue decisions).
- **Why can't an `advisor` create hypotheses?** Advisors advise, founders decide. Advisors can log interviews and assumptions (input) but can't generate new hypotheses.
- **Why can a `fractional_exec` mark an LOI signed?** Fractional execs often handle sales / BD on behalf of the founder. This is the role that most often closes commercial traction in a hardware startup.
- **Why can an `apprentice` edit competitors and assumptions?** Apprentices are learning — giving them editable surfaces on low-blast-radius entities is the point of the role.
- **Why can't a `read_only_observer` do anything?** By definition.

### 6.2 Enforcement

Every server action guards with `withAuth({ requiredRole, foundryId })`. The permission check is **role-based**, not `created_by`-based — a founder can edit interviews logged by an apprentice.

**Cross-cutting rule (SHARED-SCHEMA §5.2).** Specialist-authored rows (from Priya, Cal, etc.) carry `authored_by_specialist`. Specialists follow the founder's role in practice — a specialist call made from a founder's session has founder permissions. Specialists do not independently gain or lose permissions from this matrix.

---

## 7 · Migration DDL sketch (additive)

Not a final migration — a shape-of-the-PRs sketch for review.

```sql
-- Migration 1: new tables (additive, do not touch existing `products`)
CREATE TABLE public.hypotheses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id text NOT NULL REFERENCES public.foundries(id),
  project_id uuid REFERENCES public.projects(id),
  created_by uuid NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  one_liner text,
  problem text,
  customer_segment text,
  hero_image_url text,
  lifecycle_stage text NOT NULL DEFAULT 'concept',
  target_unit_price_pence integer,
  target_cogs_pence integer,
  target_monthly_units integer,
  synthesis_ribbon text,
  archived_at timestamptz,
  archived_reason_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (foundry_id, slug)
);
CREATE INDEX idx_hypotheses_foundry_lifecycle ON public.hypotheses(foundry_id, lifecycle_stage);
CREATE INDEX idx_hypotheses_foundry_archived ON public.hypotheses(foundry_id, archived_at);
CREATE UNIQUE INDEX idx_hypotheses_project_unique ON public.hypotheses(project_id) WHERE project_id IS NOT NULL;
ALTER TABLE public.hypotheses ENABLE ROW LEVEL SECURITY;
-- RLS policies copy SHARED-SCHEMA §5.4 templates (foundry_id IN ...memberships)
-- Trigger: updated_at via update_updated_at_column()

-- Migration 2: market_sizings
CREATE TABLE public.market_sizings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hypothesis_id uuid NOT NULL REFERENCES public.hypotheses(id) ON DELETE CASCADE,
  foundry_id text NOT NULL REFERENCES public.foundries(id),
  tam_gbp_pence bigint,
  sam_gbp_pence bigint,
  som_gbp_pence bigint,
  methodology text NOT NULL,
  source_url text,
  source_label text,
  sourced_at date,
  confidence text NOT NULL DEFAULT 'low' CHECK (confidence IN ('low','medium','high')),
  segments jsonb DEFAULT '[]'::jsonb,
  last_resized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_url IS NOT NULL OR methodology LIKE '%founder-estimate%')
);
-- + index, RLS, trigger

-- Migration 3: competitors, customer_interviews, lois, assumptions, experiments, readiness_items, hypothesis_archive_reasons, hypothesis_migration_archive
-- (one migration each — keep small for rollback safety)

-- Migration N (last): data migration runner — one SQL function per foundry invoked at flag-flip.
CREATE OR REPLACE FUNCTION public.migrate_products_to_hypotheses(p_foundry_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.hypotheses (id, foundry_id, created_by, name, slug, one_liner, problem, hero_image_url, lifecycle_stage, target_unit_price_pence, target_cogs_pence, target_monthly_units, created_at, updated_at)
  SELECT
    id, foundry_id, created_by, name,
    lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')),
    left(description, 280),
    description,
    hero_image_url,
    CASE lifecycle
      WHEN 'concept' THEN 'concept'
      WHEN 'draft' THEN 'concept'
      WHEN 'researching' THEN 'researching'
      WHEN 'validated' THEN 'validated'
      WHEN 'complete' THEN 'promoted'
      ELSE 'concept'
    END,
    unit_price_pence,
    COALESCE((unit_economics->>'cogs_per_unit_pence')::integer, NULL),
    target_monthly_units,
    created_at, updated_at
  FROM public.products
  WHERE foundry_id = p_foundry_id
  ON CONFLICT (id) DO NOTHING;
  -- Also insert market_sizings, readiness_items (12 per hypothesis), and hypothesis_migration_archive.
END;
$$;
```

**Migration PR count estimate:** ~10 additive migrations (one per table + 1 data runner + 1 updated_at trigger batch). All small, all rollback-safe via flag.

---

## 8 · Seeds and specialist prompts

- **Readiness template** (12 items × 5 investor groupings = 60-field template) is seeded from a hard-coded list in `src/lib/products/readiness-template.ts`. The template is versioned (v1, v2, …) — migrated hypotheses get v1; new hypotheses get the current template.
- **Priya (specialist `product-lead`) prompts** live in her personality config (`src/lib/specialists/personalities/product-lead.ts`). Products tab uses four Priya actions: `generateSynthesisRibbon`, `suggestAssumptionsFromHypothesis`, `proposeCompetitorsFromMarket`, `draftInterviewQuestions`. Each respects the voice-sandwich pattern (§Specialist Configuration Protocol in CLAUDE.md).
- **Initial synthesis ribbon** — on `hypotheses` insert, Priya is called async (fire-and-forget) to generate the ribbon. If the call fails, the ribbon stays empty and the UI shows "Run Priya" button.

---

## 9 · Non-goals (things this schema explicitly does NOT do)

- **No composite "fundability score".** Killed per red team. Action tab is a checklist, not a number.
- **No AI-estimated sizing with precise digits.** `confidence = 'low'` + source requirement is the anti-hallucination gate.
- **No product catalogue / SKU management.** This is a validation workbench, not a catalogue. If a hypothesis ships, it becomes a Forge project, which lives in `projects` + Forge's catalogue.
- **No pricing engine.** Target unit price is an assumption the founder writes — it's not a calculator.
- **No analytics dashboard.** Today's Products panel + Action tab's checklist are the dashboard.
- **No "autopromote when good" heuristic.** PROMOTE_TO_FORGE is a founder-only decision. No rules auto-flip it.

---

## 10 · Open questions (for Tristan's red-team)

| # | Question | Recommended default | Why |
|---|---|---|---|
| Q1 | Keep `hypothesis_migration_archive` table forever, or drop after 90 days of flag-on? | **Keep forever** | Audit trail has low storage cost and high investigation value. Drop only if legal requires. |
| Q2 | Seed 12 readiness_items per hypothesis, or require the founder to pick a template first? | **Seed 12** | Friction-free default; founder deletes items they don't care about. |
| Q3 | Allow more than one `market_sizings` per hypothesis (e.g. re-sizing versions)? | **No — one row, overwrite on re-size, audit the history via audit_log** | Simpler UI. Re-size history is an audit concern, not a working-memory concern. |
| Q4 | Should `assumption_invalidated` with `risk_level ≥ 4` auto-archive the hypothesis? | **No — surface it as a critical event_log entry but let the founder decide** | Auto-archive is opinionated; founders may reframe the hypothesis rather than kill it. |
| Q5 | Should `competitors.tags` be free-text or a pick-list? | **Pick-list seeded with 8 defaults + free-text fallback** | Tag consistency matters for filter UX; free-text sprawl ruins it. |
| Q6 | Where does the "reason I haven't signed any LOIs yet" narrative live? | **Add `hypotheses.traction_explainer` text column (Phase 4 addendum)** | Founders need a place to frame absence of LOIs for investors. Not critical for V1 but worth noting. |
| Q7 | Is `readiness_items.investor_question` a free-text tag or an enum? | **Enum (team / ask / market / moat / path) — consistent with mockups** | Enforces grouping in UI. Free-text would fragment. |

---

## 11 · Change log

| Date | Change | Author |
|---|---|---|
| 2026-04-19 | v1.0 initial draft — schema, 5-tab model, permissions matrix, data preservation, Today contract | Forge+Products terminal (Products prep) |
