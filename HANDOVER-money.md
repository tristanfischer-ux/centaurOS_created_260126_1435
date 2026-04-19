# Handover — Phase 2 Money build (next session)

**Date:** 2026-04-19
**Phase:** 2 of 4 · Money (Cockpit · Plan · Raise) — replaces legacy Cash Burn · Cash In · Cash Out · P&L · Investors · Fundraise
**Handoff from:** Money prep terminal (this session). Ship docs only, no code changes.
**Branch to create:** `feat/money-redesign` (not yet created — build terminal creates after "locked" signal)
**Feature flag:** `new-money-experience` (default OFF) — gates all `/money/*` routes + sidebar "MONEY [V2]" group. Flag is route-level; data migration is additive + twin-trigger-backed (see MONEY-SCHEMA §5 Data preservation).

---

## Pickup command (fresh terminal)

```
cd "/Users/tristanfischer/Developer/CentaurOS created 260126 1435" && cat COORDINATION-STATUS.md && cat HANDOVER-money.md
```

Then read in order: `SHARED-SCHEMA.md` → `PHASE-PLAN.md §Phase 2` → `MONEY-SCHEMA.md` → `MONEY-MOCKUP-GAP-AUDIT.html` (read the post-schema red-team banner at the top) → start execution.

---

## What's ready for you

This session shipped 3 docs (no code):

1. **`MONEY-SCHEMA.md`** (v0.3, ~880 lines) — Money-owned table designs + cross-references to SHARED-SCHEMA. Sections: conventions + RLS template (§0), 5 ambiguity resolutions (§1), ~20 table designs (§2 Tables), server-action layout (§3), 9-role permissions matrix (§4), data preservation contract (§5), 7 open decisions (§6), migration order (§7), change log (§8). Inline within §2 Tables: SHARED `audit_log` / `event_log` integration contracts + `ai_credits` family for specialist cost metering.
2. **`MONEY-MOCKUP-GAP-AUDIT.html`** (~1150 lines) — 47 gaps across 13 parent pages + 9 cross-cutting items, now with **hierarchical numbering 1.1 / 1.2 / C.N** (via CSS counters — reference any gap by ID). 5 original red-team critiques + a post-schema red-team banner at top linking to this handover's §Post-schema red-team.
3. **`HANDOVER-money.md`** (this file) — build-terminal pickup doc.

Already-existing (untouched in this session, cited extensively):
- `MONEY-MOCKUP-INDEX.html` + ~36 `MONEY-MOCKUP-*.html` mockups (route-level + drill-ins + onboarding + empty states + settings + audit log + permissions)
- `money-mockup.css` — shared mockup styling
- `SHARED-SCHEMA.md` v1.0 (Phase-1-landed shared primitives — `foundries`, `foundry_memberships`, `audit_log`, `event_log`, `projects`, `project_transitions`)
- `PHASE-PLAN.md` v1.0 (locked 2026-04-19: Forge → Money → Plan → Products)
- `HANDOVER-pr1-5-build.md` (this doc mirrors its structure)

---

## What Phase 2 must ship (three bundled surfaces)

### A · Sidebar: Cash Burn → MONEY [V2] with strikethrough pedagogy

Current sidebar `src/components/sidebar/data/money.ts` exports `moneyLegacyNavigation` (6 items: Cash Burn · Cash Out · Cash In · P&L · Investors · Fundraise). Replace with:

```ts
export const moneyV2Navigation: SidebarNavItem[] = [
  { name: 'Cockpit', href: '/money/cockpit', icon: Gauge },
  { name: 'Plan',    href: '/money/plan',    icon: Grid2X2 },
  { name: 'Raise',   href: '/money/raise',   icon: CircleDot },
]
```

Sidebar group header reads `MONEY` + `[V2]` badge. Under the flag-OFF path, sidebar shows the **legacy 6-item list**. Under flag-ON, shows the 3-item list with the 6 retired routes rendered strikethrough below the active group as pedagogical hints (first 14 days post-flip then removed). Wire via `FeatureFlagGate` on the sidebar data file (same pattern as PR #1 E-minimal for Workshop → The Forge BETA). See `SHARED-SIDEBAR.html` for the exact strikethrough pattern.

### B · Routes: `/money/cockpit`, `/money/plan`, `/money/raise` + drill-ins

Per `MONEY-MOCKUP-INDEX.html`, the route inventory is:

**Cockpit** (`/money/cockpit`)
- Runway cockpit with single-number runway tile (Brex pattern — competitor research §1)
- 26-week cash-flow projection chart
- Source pill (Xero healthy / syncing / error / manual-only)
- Upcoming commitments tray (VAT, rent, payroll)
- Quick actions: Log expense (modal from `MONEY-MOCKUP-LOG-EXPENSE.html`), Send invoice (`MONEY-MOCKUP-SEND-INVOICE.html`)
- Connect Xero flow (`MONEY-MOCKUP-CONNECT-XERO.html` → `MONEY-MOCKUP-DRY-RUN.html`)
- First-run empty state (`MONEY-MOCKUP-EMPTY-STATES.html`)

**Plan** (`/money/plan`)
- Plan line items grid (6 cost buckets + 4 income buckets) — `plan_line_items` table
- Scenarios picker + overlay (best/worst envelope via `sensitivity_pct`)
- Scenario detail / new (`MONEY-MOCKUP-SCENARIO-DETAIL.html`, `MONEY-MOCKUP-NEW-SCENARIO.html`) — V1 simplified (no formulas/triggers/global params)
- Cost detail + line editor (`MONEY-MOCKUP-COST-DETAIL.html`, `MONEY-MOCKUP-LINE-ITEM-EDITOR.html`)
- CSV import (`MONEY-MOCKUP-CSV-IMPORT.html`) — reuses existing `cash-burn-import.ts` (378 lines) as starting point
- Variance vs Xero (`MONEY-MOCKUP-VARIANCE.html`) → transaction drill (`MONEY-MOCKUP-TRANSACTION-DRILL.html`)
- Full P&L (`MONEY-MOCKUP-PNL.html`)

**Raise** (`/money/raise`)
- Kanban pipeline (Target · Researching · Contacted · Meeting · DD · Verbal · Closed · Passed) with thesis-match scores
- Create round wizard (new — per gap audit row 3.2 MUST)
- Investor detail (`MONEY-MOCKUP-INVESTOR-DETAIL.html`) — right-rail of pipeline row
- Pipeline move (`MONEY-MOCKUP-PIPELINE-MOVE.html`) · Pass flow (`MONEY-MOCKUP-PASS-INVESTOR.html`) · Log touch (`MONEY-MOCKUP-LOG-TOUCH.html`, `MONEY-MOCKUP-GMAIL-IMPORT.html`)
- Thesis builder (`MONEY-MOCKUP-THESIS-BUILDER.html`) + onboarding thesis (`MONEY-MOCKUP-ONBOARDING-THESIS.html`)
- Pitch prep (`MONEY-MOCKUP-PITCH-SECTION.html` + `MONEY-MOCKUP-SLIDE-EDITOR.html`)
- Board pack / investor update (`MONEY-MOCKUP-BOARDPACK.html`, `MONEY-MOCKUP-UPDATE-SEND.html`)
- Portfolio (post-close shareholder view — `MONEY-MOCKUP-PORTFOLIO.html`)

**Cross-cutting:** Settings (`MONEY-MOCKUP-SETTINGS.html`) · Permissions (`MONEY-MOCKUP-PERMISSIONS.html`) · Audit log (`MONEY-MOCKUP-AUDIT-LOG.html`).

### C · Today V3 Money panel populated + specialist cost metering activates

Two PR #1.5-era stubs flip from placeholder to live data:

1. **Today V3 Money panel** — currently shows "Connect Cash Burn" placeholder. Flip to live: wire to SHARED `event_log` filtered by `section='money'`. Money writes the signals listed in MONEY-SCHEMA.md §event_log signal contract (12 triggers — runway_danger / runway_caution / variance_alert / unusual_expense / xero_sync_failed / touch_overdue / round_close_approaching / verbal_commit / round_closed / update_bounce_spike / credits_budget_warning / credits_budget_breach).
2. **Specialist cost metering** — `ai_credits_cost_rules` + `ai_credits_ledger` + `ai_credits_budget` per MONEY-SCHEMA.md §ai_credits. Sidebar "Credits" pill + `/money/settings/credits` surface show rolled-up cost. Trigger on SHARED `audit_log` WHERE `entity_type='specialist_call'` drives the ledger. **Pre-Phase-2 prerequisite:** confirm Phase 1 Forge actually writes `specialist_call` events to SHARED `audit_log` (grep `src/actions/` for `entity_type: 'specialist_call'`). If not: ship a Phase 1 backfill PR that adds the write from every specialist invocation site.

---

## Suggested build order (context-efficient)

1. **Deep-read the prep docs** (~4000 lines total). Mandatory front-loaded reading:
   - `COORDINATION-STATUS.md` (110 lines — understand the pipeline state machine)
   - `PHASE-PLAN.md §Phase 2` (lines 74-90 + §Data preservation rules lines 137-177)
   - `SHARED-SCHEMA.md` (325 lines — particularly §1, §3, §5, §6 resolved items)
   - `MONEY-SCHEMA.md` (~900 lines — all of it)
   - `MONEY-MOCKUP-GAP-AUDIT.html` (focus on post-schema banner at top + the 3 HIGH red-team items)
   - This handover's §Post-schema red-team, §Legacy inventory, and §Open questions below
   - Skim `MONEY-MOCKUP-INDEX.html` + 10-12 key mockup pages (Cockpit / Plan / Raise / Create Round / Empty states / Onboarding / Permissions)

2. **Chunk 1: Migrations + types (Week 1)** — smallest blast radius, unblocks everything.
   - 18 migrations per MONEY-SCHEMA §10 order (money_settings → xero_* → plan_line_items → burn_scenarios → xero_transaction → investor_thesis → investor_round → investor_pipeline_* → pitch_prep_* → investor_update_* → ai_credits_* → permission_override → audit_log additive columns → plan_templates seed table)
   - Write-twin triggers for the 8 legacy tables listed in MONEY-SCHEMA §5.2 (cash_out_items / cash_in_items / burn_scenarios.item_overrides / investor_alerts / investor_notes / investor_shortlist / investor_views / investor_news_intel)
   - One-time forward migration script (tag `source='legacy_migration'` on copied rows)
   - `foundry_id` backfill on legacy investor_* tables (per MONEY-SCHEMA §5.3 — use `audit_log` lookup for ambiguous rows)
   - Run `npx supabase gen types --linked` after push, verify with `npx tsc --noEmit` (baseline 8 errors, 0 new)
   - **Commit + push + verify Vercel Preview builds green before proceeding.**

3. **Chunk 2: Shared helpers + feature flag (Week 1)**
   - `src/lib/money/attention-worthy.ts` (isAttentionWorthy gate per MONEY-SCHEMA §3)
   - `src/lib/money/emit-event.ts` (wrapper that writes to SHARED `event_log` with section='money')
   - `src/lib/money/runway.ts` (core runway computation — preserve parity with `src/lib/cash-burn/burn-engine.ts` to within 0.1%)
   - `src/lib/money/scenario.ts` (override resolution — replaces `src/lib/cash-burn/weekly-projection.ts`)
   - `src/lib/money/pnl.ts` (replaces `src/lib/cash-burn/pnl-builder.ts`)
   - Register `new-money-experience` flag, default OFF, toggleable per-user
   - Wrap sidebar money data file with `FeatureFlagGate`

4. **Chunk 3: Cockpit + Plan (Week 2)** — Money UI foundation. Cockpit first (simplest, most visible).
   - Route group: `src/app/(platform)/money/cockpit/page.tsx` + view
   - Route group: `src/app/(platform)/money/plan/page.tsx` + view + drill-ins
   - Server actions: `money-cockpit.ts`, `money-plan.ts`, `money-scenarios.ts`, `money-xero.ts`
   - Wire CSV import from `cash-burn-import.ts` into new Plan surface
   - Empty states per `MONEY-MOCKUP-EMPTY-STATES.html`
   - **Verify each surface with agent-browser (logged-in via `~/.claude/scripts/forgeos-login.sh`) before committing.**

5. **Chunk 4: Raise (Week 3)** — Investor pipeline is the biggest surface.
   - Route group: `src/app/(platform)/money/raise/**`
   - Server actions: `money-raise.ts`, `money-thesis.ts`, `money-pitch.ts`, `money-updates.ts`
   - Migrate from `investors.ts` (2571 lines → ~1200 lines refactor) — preserve match scoring with rank correlation ≥ 0.95 against pre-migration golden set
   - Build create-round wizard (new, per gap 3.2 MUST)

6. **Chunk 5: Today V3 Money panel live + specialist cost meter active (Week 4)**
   - Flip Today V3 Money panel from "Connect Cash Burn" stub to live feed
   - Confirm Phase 1 Forge writes specialist_call events (ship backfill PR if not)
   - Wire `ai_credits_ledger` trigger on SHARED `audit_log`
   - Sidebar "Credits" pill renders live cost
   - Seed `ai_credits_budget` on foundry creation from `SUBSCRIPTION_PLANS[tier].limits`

7. **Chunk 6: Settings + Permissions + Audit Log (Week 4)**
   - `/money/settings/*` (Xero reconnect, onboarding state, retention, currency)
   - `/money/settings/permissions` (9-role matrix + `permission_override` editor)
   - `/money/settings/audit-log` (filtered view of SHARED audit_log scope='money')
   - `/money/settings/credits` (ai_credits_ledger display)

8. **Chunk 7: Verify + deploy (Week 4-5)**
   - `./scripts/check-design-tokens.sh` clean
   - `tsc --noEmit` still 8 baseline, 0 new
   - `next build` green
   - agent-browser walkthroughs on Cockpit / Plan / Raise (empty state + populated state)
   - Red-team lite pass: re-run the 7 findings below, confirm each is addressed
   - Flip `new-money-experience` flag on for tristan.fischer@gmail.com only, get sign-off
   - Flip on for all users, merge

**Do not parallelise chunks 3 and 4.** Cockpit/Plan land first (smaller blast radius), verify on preview, then Raise (biggest surface, most cross-table queries).

**Commit-per-chunk, push-per-chunk, verify Vercel deploy green before next chunk.**

---

## Post-schema red-team (7 findings · 3 HIGH must-fix before build)

Second adversarial review after MONEY-SCHEMA v0.2 landed. Full findings with evidence/mitigation. Items 1-4 are HIGH, 5-7 are MED. All are reflected in MONEY-SCHEMA v0.3.

### 1. Parallel data model contradiction → **PARTIALLY RESOLVED in v0.3** — Severity HIGH
**Claim.** PHASE-PLAN promises "same tables, re-surfaced". MONEY-SCHEMA introduced 15 greenfield tables with no stated relationship to live `cash_burn_*` / `investors` / `finance_*` tables.
**Resolution in v0.3:** MONEY-SCHEMA §5 now specifies MIGRATE + dual-read strategy with confirmed legacy table names (via legacy-routes audit) and write-twin triggers during rollout window. §5.3 addresses the RLS user_id → foundry_id backfill.
**Outstanding for build terminal:** write `MONEY-DATA-PRESERVATION.md` (formal per-PHASE-PLAN doc) in the Phase-2 PR. §5.5 lists the 5 PHASE-PLAN questions it must answer.

### 2. Specialist cost metering was self-contradicting → **RESOLVED in v0.2** — Severity HIGH
**Claim.** SHARED-SCHEMA §6 Q5 said `ai_credits` owned by Money; MONEY-SCHEMA §Open Decisions #2 reopened with a different table name.
**Resolution in v0.2:** `ai_credits_cost_rules` + `ai_credits_ledger` + `ai_credits_budget` added. Trigger on SHARED `audit_log` writes ledger rows for every `specialist_call` event. MONEY-SCHEMA §6 Open decision #2 marked RESOLVED.
**Outstanding for build terminal:** confirm Phase 1 Forge is actually writing `specialist_call` events to SHARED `audit_log`. Grep `src/actions/` for `entity_type: 'specialist_call'`. If not present, ship a Phase 1 backfill PR BEFORE Money Chunk 5.

### 3. RLS role whitelists reference enum values that don't exist — Severity HIGH
**Claim.** MONEY-SCHEMA uses `role IN ('founder', 'co_founder')` but production `member_role` enum only ships 5 CapitalCase values (`Founder / Executive / Apprentice / AI_Agent / Supplier`). Case-sensitivity trap: `'founder' != 'Founder'`. First migration either no-ops all writes or fails on enum mismatch.
**Resolution path:** MONEY-SCHEMA §0.1 proposes "coarse compile" collapse (founder+co_founder+executive+fractional_exec → `Founder`; cto+advisor+read_only+contractor → `Executive`; apprentice → `Apprentice`). MONEY-SCHEMA §4 has the 9-role target matrix.
**Outstanding — BLOCKER:** Tristan must decide:
  - **Option A (coarse):** ship Phase 2 with 5-role compile + `permission_override` for finer distinctions. Enum expansion PR lands post-Phase-2.
  - **Option B (expand first):** promote the 5→9 enum migration to a Phase-2 prerequisite. Adds ~1 week to the schedule (touches every RLS policy + `withAuth` call site).
  - **Recommended default:** Option A (coarse). The `permission_override` table covers edge cases. Enum expansion stays clean as its own focused PR.

### 4. Claimed Today-signal / permissions / data-preservation sections didn't exist in v0.1 → **RESOLVED in v0.2/v0.3** — Severity HIGH
**Claim.** v0.1 preamble referenced Today signal contract, permissions matrix, data preservation — none existed in the file.
**Resolution:** v0.2 added Today signal contract (inline at event_log section in §2), §4 9-role matrix, §5 data preservation contract. v0.3 renumbered to contiguous §0-§8 after a final cleanup pass.

### 5. Real-time thrashing under 50-events-per-minute — Severity MED → **PATCHED in v0.3**
**Claim.** SHARED §6 Q3 resolved to realtime push. MONEY used materialised-view recompute-per-insert. 50 rapid kanban drags → 50 view refreshes → 50 realtime broadcasts → 50 Today re-renders.
**Resolution in v0.3:** §3 now uses trigger-maintained `investor_pipeline_state.current_stage` column (no materialised view). `isAttentionWorthy(row, prior)` helper gates `event_log` writes — kanban reorders within same stage return false; moves within 5 minutes of prior move coalesce. Client-side `useTodayFeed` debounces refetches to max 1/second.
**Outstanding for build terminal:** implement `src/lib/money/attention-worthy.ts` per the spec in §3.

### 6. Xero one-org-two-foundries silent failure — Severity MED → **PATCHED in v0.3**
**Claim.** `xero_connection.foundry_id PK` forbids one Xero org serving two foundries. Tristan's own case (Fractional Forge + client foundry same Xero) hits this on day 1.
**Resolution in v0.3:** §xero_connection now explicitly REJECTS one-org-two-foundries in V1 with a clear OAuth error ("This Xero organisation is already connected to foundry X. Contact support to split."). Future multi-org-per-foundry enablement stays additive via `(foundry_id, organisation_id)` composite PK.
**Outstanding for build terminal:** add the gap-audit row for "Xero org conflict" onboarding error (currently not mocked).

### 7. Cold-start empty-state + template seed — Severity MED → **PARTIALLY PATCHED in v0.3**
**Claim.** Red-team #2 original said "most value depends on data founder doesn't have yet". v0.1 had no first-run contract, no templates, no onboarding persistence.
**Resolution in v0.3:** MONEY-SCHEMA §6.4 RESOLVED: `money_settings.onboarding_progress jsonb` (foundry-level) + `profiles.onboarding_data jsonb` (user-level). §6.4a adds `plan_templates` shared seed table (UK pre-seed / US pre-seed / bootstrapped / hardware prototyping rows).
**Outstanding for build terminal:** seed the `plan_templates` table at migration time. Build Chunk 2 Phase-2 exit criteria should include "all 4 MUST empty-state mocks (Cockpit / Plan / Raise / Thesis) built + flagged".

---

## Open questions + recommended defaults

Build terminal can proceed without Tristan answers by using the recommended default; note choices in PR body so Tristan can redirect.

1. **Role enum strategy (blocker from red-team #3).** Option A (coarse compile, 5 roles + override table) or Option B (9-role enum expansion PR first)?
   **Recommended default:** Option A. Ship Phase 2 on 5 roles; expand later.
2. **Legacy route lifecycle post-cutover.** MONEY-SCHEMA §5.4 says "90 days then archived". Is 90 days right, or should legacy routes become read-only sooner (30 days) to force adoption?
   **Recommended default:** 90 days, read-write during the window, read-only archive after.
3. **Currency FX rate for historical Xero transactions.** MONEY-SCHEMA §6.1 proposes transaction-date rate. Alternative: today's rate (simpler but creates retroactive drift). Tristan uses primarily GBP so this is low-risk for him specifically.
   **Recommended default:** transaction-date rate, cached in new `fx_rate_cache` table. Daily seed from an open-API feed (exchangerate.host or similar).
4. **Investor shortlist → pipeline mapping for existing data.** Current `investor_shortlist` is global (founder-curated, not per-round). V2's `investor_pipeline_state` is per-round. Where does the existing shortlist land?
   **Recommended default:** map to the current active round's `investor_pipeline_state` with `current_stage='target'`. If no active round exists, create a draft "Pre-round shortlist · migrated" round and backfill to it.
5. **Match score recompute cadence.** MONEY-SCHEMA §Ambiguity #4 says "not stored, computed live". What cadence is the cache refresh in practice? On-demand per investor-view, or batch-weekly?
   **Recommended default:** on-demand (cache in `investor_pipeline_state.match_score_cached` with `match_score_computed_at`; refresh if stale > 24h OR thesis version changed).
6. **Investor outreach persistence location.** Legacy-routes audit couldn't confirm a single canonical table for investor outreach data. Is it in `investor_notes`, a custom table, or spread across several?
   **Recommended default:** assume `investor_notes` + `investor_news_intel` are the canonical sources for "touches"; if during build a missing table is discovered, add a targeted migration in Chunk 2.
7. **Board-pack → monthly investor update send method.** Does ForgeOS have its own SMTP/Resend integration, or does the send go through Gmail OAuth (founder's own account)?
   **Recommended default:** Gmail OAuth in V1 (sends from founder's own address = more deliverable, less spam-trap risk). ForgeOS transactional SMTP lands in V2.

---

## Pre-existing state you inherit (from Phase 1 close)

- `main` at commit `000be5b3` (Phase 1 PR #1 merge) + `feat/forge-visual-rebuild` (Phase 1 PR #1.5 in flight per HANDOVER-pr1-5-build.md).
- `tsc --noEmit`: **8 pre-existing errors, 0 new** is the baseline. Verify you haven't added any.
- `npm run build` succeeds locally as of 07c9ca46.
- Vercel Preview scope already has `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`.
- `(platform)`, `(ops)/ops`, `workspace-picker` all have `force-dynamic` — don't remove.
- Feature flags: `new_forge_experience` OFF for all. `new-money-experience` DOESN'T EXIST YET — Chunk 2 registers it.
- Phase 1 sidebar data files live at `src/components/sidebar/data/*.ts` (section-owned). You'll edit `money.ts` in Chunk 2.
- Test account: `claude-test@forgeos.test` (Founder role, sandbox foundry `claude-test-foundry`, email drips suppressed). Login via `~/.claude/scripts/forgeos-login.sh [path]`.

---

## Git state at handoff

```
main                              000be5b3  (Phase 1 PR #1 merge)
feat/forge-visual-rebuild         07cbfa56  (Phase 1 PR #1.5 Chunk B sidebar chrome)
```

Money prep terminal will push 1 commit to main before ending this session:

```
docs(money): prep schema v0.3 + gap audit refresh + handover
```

First actions of build terminal when Tristan says "locked":
```
git checkout main && git pull
git checkout -b feat/money-redesign
# start Chunk 1 migrations
```

---

## Legacy inventory (from sub-agent audit this session)

Full report in the sub-agent transcript — summary pulled into MONEY-SCHEMA §5.2. Key facts:
- **48 files**, **8,604 lines** of legacy Money-domain code.
- **Classification:** 37 MIGRATE · 8 PRESERVE-READONLY · 2 DEPRECATE · 1 SHARED-LIB.
- **Legacy tables (confirmed):** `cash_out_items`, `cash_in_items`, `burn_scenarios` (with `item_overrides` JSONB to normalise), `investor_alerts`, `investor_notes`, `investor_shortlist`, `investor_views`, `investor_news_intel`, `investor_portfolio_companies`, `investor_grants`. Plus `money_map_*` (stays preserved, separate feature).
- **Legacy RLS gotcha:** investor_* tables use `user_id = auth.uid()` RLS, not foundry-scoped. MONEY-SCHEMA §5.3 addresses the foundry_id backfill.
- **Legacy actions with heaviest migration surface:** `investors.ts` (2,571 lines, 60+ exports) → targets `money-raise.ts` + `money-thesis.ts`. `cash-burn-*.ts` files (~2,200 lines combined) → target `money-plan.ts` + `money-cockpit.ts` + `money-scenarios.ts`. `investor-outreach.ts` (174 lines) → target `money-raise.ts` (pipeline events append).
- **Legacy scoring algorithm preservation:** `src/lib/investor-match.ts` rank correlation ≥ 0.95 is the acceptance criterion for V2 scorer validation. Snapshot top 50 investor scores pre-migration as golden test data.
- **Deep-link references to patch:** `/cash-burn/cash-in`, `/cash-burn/cash-out`, `/cash-burn/pnl` (internal); `/investors`, `/fundraise` (from Products view + Fundraise view).
- **Existing migrations (16 total):** `20260226150000_cash_burn_planning.sql` (169L), plus 15 investor-related migrations (investor_stats_rpc, intelligence, features, match_report_type, grants, portfolio_companies, query_performance, hardening, news_intel, intel_hardening, semantic_search, co_investor_network_rpc, views_library). Plus `money_map` (pre-Phase-2, separate feature).

---

## Competitor landscape — patterns to steal, gaps to win

From sub-agent research this session. Condensed (full brief in sub-agent transcript).

**Competitive map:**
- **Brex / Ramp / Pry** — strong US spend + runway. UK-locked-out. Pry's Xero/QBO forecasting is the benchmark for connected-to-actuals planning.
- **Runway.com / Finmark / Causal** — FP&A for teams. Finmark **sunsets 2026-04-01** → real users looking for a home *right now*.
- **Visible.vc / Foundersuite / Affinity** — investor CRM + updates. Visible is the UX benchmark. Pipeline is *disconnected* from finance data — nobody shows "runway vs pipeline coverage" in one place.
- **Crunchbase / PitchBook** — reference directories. ForgeOS wraps Crunchbase-like data for `investor_firms` enrichment; doesn't compete as a directory.

**5 things Money V2 must match (table stakes):**
1. Xero actuals pulled live — no CSV, no copy-paste, under-60-second reconciliation.
2. Single-number runway tile visible on every Money screen (Brex pattern).
3. Kanban investor pipeline with custom stages / notes / attachments / follow-up reminders (Visible parity).
4. Investor-update composer that renders to email with embedded live KPIs (Visible pattern).
5. Scenario branching — modify a plan without mutating live model, see runway delta as a *number*, not a chart (Pry + Runway pattern).

**3 things Money V2 can uniquely win on (in priority order):**
1. **Actuals ↔ pipeline linked on one surface.** "Runway drops below 6 months" ← linked → "here are the 8 investors in your pipeline matched to your stage and thesis". Nobody does this. Founders stitch it manually.
2. **UK-first + hardware-first.** Brex/Ramp are US-gated. Pry/Finmark are US-entity. Crunchbase is US-biased. Native UK Ltd + Xero + £ + hardware-specific buckets (tooling / prototypes / BOM) is a real wedge.
3. **Thesis-match on the investor record itself.** Not keyword search — semantic match of portfolio data to company description. Visible has the DB; nobody does the matching layer.

**2 anti-patterns to avoid:**
1. **Model-builder-as-feature.** Causal / Runway make you *build* the model. Founders don't want to build — they want Xero plugged in + an already-right forecast. Opinionated > flexible.
2. **Per-seat + sales-gated pricing.** Runway's "call us" page kills pre-seed founders. Flat, visible, sub-£50/mo or it won't convert.

**3 red-team questions for next design round:**
1. Do we link the investor pipeline to the runway cockpit, or keep them as separate tabs? (Linking is the wedge; risks overloading Money with CRM semantics.)
2. Thesis-matching — semantic or rules-based? (Semantic is magical but hallucinates; rules-based is defensible. How do we avoid the "AI-powered" trap per the no-AI-emphasis rule?)
3. Monthly investor update emailer — composer or generator? (Visible's composer is the benchmark. Auto-draft risks putting words in the founder's mouth, which violates Tristan's "never assume the user's situation" rule.)

---

## Pitfalls learned during prep

Items that bit this prep session and will bite the build if not pre-empted:

1. **`foundry_memberships` vs `foundry_members`.** v0.1 MONEY-SCHEMA used `foundry_members` in RLS examples. The real table is `foundry_memberships` (per SHARED-SCHEMA §1.2, shipped 2026-03-30). Fixed in v0.2. Any legacy copy-paste of RLS SQL must be sanity-checked.
2. **`cash_burn_lines` doesn't exist.** v0.1 §Data-preservation cited `cash_burn_lines`. The real tables are `cash_out_items` + `cash_in_items` + `burn_scenarios`. Fixed in v0.3 after legacy audit confirmed names.
3. **`member_role` enum is CapitalCase + 5-value.** MONEY-SCHEMA whitelists wrote `'founder'` (lowercase). Production enum is `'Founder'` (CapitalCase). Case-sensitivity trap. Red-team #3 flagged. Resolution pending Tristan pick (Option A / B in §Open questions #1).
4. **`audit_log` is SHARED, not Money-owned.** v0.1 defined a Money-specific `audit_log` table. Conflicts with SHARED-SCHEMA §1.3. Fixed in v0.2 — Money extends SHARED `audit_log` with additive columns + writes with `section='money'`.
5. **Specialist cost is not a Money invention.** v0.1 §Open #2 reopened the specialist cost question with `specialist_usage_log` — but SHARED §6 Q5 already rejected this pattern. Fixed in v0.2 with `ai_credits` family reading SHARED `audit_log`. Phase 1 Forge **must** already be writing the events — confirm before Chunk 5.
6. **Mockup-schema drift risk.** ~36 mockup files reference fields/flows. No line-by-line audit was done. Chunk 1 pre-work: grep mockup files for column references, cross-check against MONEY-SCHEMA fields. Flag any drift in the PR body.

---

## After this phase ships — DO NOT STOP

**Per COORDINATION-STATUS.md §Pipeline rules — the build terminal runs continuously through all 4 phases.** When Money merges to main:

1. Re-read `COORDINATION-STATUS.md`.
2. Find the next phase `review locked — build-approved`. Order: Plan (phase 3) next.
3. If Plan phase is `build-approved`: `git checkout -b feat/plan-redesign`, start Plan build per `HANDOVER-plan.md`.
4. If Plan phase is `prep shipped — awaiting review`: notify Tristan via iMessage + print banner `⚠ AWAITING TRISTAN RED-TEAM REVIEW — Plan audit at PLAN-MOCKUP-GAP-AUDIT.html`. Do NOT close session.
5. If Plan phase is `prep in flight` or `not started`: notify Tristan that prep is still needed. Wait.
6. Between phases: save a MemPalace checkpoint (`wing=forgeos`, `room=decisions`) so compaction can't break the chain.

**Phase order locked:** Forge → Money → Plan → Products. Products stays behind Coming Soon sidecar until Phase 4.

---

## Session end checklist (before this prep terminal closes)

- [ ] Commit: `git add MONEY-SCHEMA.md MONEY-MOCKUP-GAP-AUDIT.html HANDOVER-money.md && git commit -m "docs(money): prep schema v0.3 + gap audit refresh + handover" && git push`
- [ ] MemPalace drawer: `wing=forgeos`, `room=decisions`, summary of V1 cuts + open questions + 3 HIGH red-team items
- [ ] Update COORDINATION-STATUS.md: Money row state = `prep shipped — awaiting review`, pickup doc = `HANDOVER-money.md`; append milestone log line
- [ ] Notify Tristan: iMessage reply (self-chat) or print banner `⚠ MONEY PREP READY — open MONEY-MOCKUP-GAP-AUDIT.html, reply "locked" to build terminal when approved`
