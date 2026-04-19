# Money Redesign — Phase 2 build tracker

**Branch:** `feat/money-redesign` (off `main@d169533b`)
**Worktree:** `/tmp/money-build-worktree` (keeps clear of Forge's `feat/forge-visual-rebuild`)
**Flag:** `new-money-experience` (default OFF; flip per-user for review)
**Lock signal:** Tristan 2026-04-19 — all 7 HANDOVER-money.md open questions default to recommended answers (MemPalace `drawer_forgeos_decisions_bd713f6a077b91f8`)
**Coordination commit:** `beba7e47` (Money row = `review locked — build-approved`)

---

## Chunk checklist (HANDOVER-money.md §Suggested build order)

### Chunk 1 — Migrations + types
- [ ] 1A · Core Money tables: `money_settings`, `plan_line_items`, `burn_scenarios`, `scenario_overrides`, `plan_templates` (seed)
- [ ] 1B · Xero family: `xero_connection`, `xero_account_mapping`, `xero_transaction`
- [ ] 1C · Raise family: `investor_thesis` + `foundries.active_thesis_id`, `investor_round`, `investor_pipeline_state`, `investor_pipeline_events`
- [ ] 1D · Pitch + updates family: `pitch_prep_section`, `pitch_prep_slide`, `investor_update`, `investor_update_recipient`
- [ ] 1E · AI credits family: `ai_credits_cost_rules`, `ai_credits_budget`, `ai_credits_ledger` + trigger on SHARED `audit_log`
- [ ] 1F · `permission_override` + SHARED `audit_log` additive columns (`ip_address`, `user_agent`)
- [ ] 1G · Forward migration from legacy tables + write-twin triggers + `foundry_id` backfill on investor_* legacy tables
- [ ] 1H · Regenerate TypeScript types + `tsc --noEmit` (baseline 8, 0 new) + verify Vercel deploy green

### Chunk 2 — Shared helpers + feature flag
- [ ] 2A · `src/lib/money/attention-worthy.ts` (isAttentionWorthy gate per MONEY-SCHEMA §1.3)
- [ ] 2B · `src/lib/money/emit-event.ts` (SHARED event_log wrapper, section='money')
- [ ] 2C · `src/lib/money/runway.ts` (parity with `src/lib/cash-burn/burn-engine.ts`, rank correlation ≥ 0.95)
- [ ] 2D · `src/lib/money/scenario.ts` (replaces `weekly-projection.ts`)
- [ ] 2E · `src/lib/money/pnl.ts` (replaces `pnl-builder.ts`)
- [ ] 2F · Register `new-money-experience` flag (default OFF)
- [ ] 2G · Wrap `src/components/sidebar/data/money.ts` with `FeatureFlagGate` showing V2 3-item list under flag-ON

### Chunk 3 — Cockpit + Plan
- [ ] 3A · Route shells: `/money/cockpit`, `/money/plan` + drill-ins
- [ ] 3B · `src/actions/money-cockpit.ts`, `money-plan.ts`, `money-scenarios.ts`, `money-xero.ts`
- [ ] 3C · CSV import path (reuse `cash-burn-import.ts` core)
- [ ] 3D · Empty states per `MONEY-MOCKUP-EMPTY-STATES.html`
- [ ] 3E · agent-browser walkthrough (logged-in) before commit

### Chunk 4 — Raise
- [ ] 4A · Route shell: `/money/raise/**`
- [ ] 4B · `src/actions/money-raise.ts`, `money-thesis.ts`, `money-pitch.ts`, `money-updates.ts`
- [ ] 4C · Refactor from `investors.ts` (2571L → ~1200L), preserve match scoring (rank correlation ≥ 0.95 acceptance)
- [ ] 4D · Create round wizard (new, per gap 3.2 MUST)

### Chunk 5 — Today V3 Money panel live + specialist cost meter
- [ ] 5A · **PRE-WORK:** ship Phase 1 Forge backfill PR writing `entity_type='specialist_call'` rows to SHARED `audit_log` from every specialist invocation site (grep confirmed ZERO writes currently)
- [ ] 5B · Flip V3b RunwayStub (today-view.tsx ~L900) → live runway from `money_settings.runway_months_cached` + event_log
- [ ] 5C · Flip V4 MoneyPipelineTile (~L940) → active `investor_round.target_amount` + verbal commits from `investor_pipeline_state`
- [ ] 5D · Flip V9 MoneySignalCard (~L1060) → runway + raise status composite
- [ ] 5E · Wire ai_credits_ledger trigger + test rollup
- [ ] 5F · Sidebar "Credits" pill
- [ ] 5G · Seed `ai_credits_budget` on foundry creation from `SUBSCRIPTION_PLANS[tier].limits`

### Chunk 6 — Settings + Permissions + Audit Log + Credits UI
- [ ] 6A · `/money/settings/*` (Xero reconnect, onboarding state, retention, currency)
- [ ] 6B · `/money/settings/permissions` (9-role matrix + `permission_override` editor, coarse-compile to 5-value enum)
- [ ] 6C · `/money/settings/audit-log` (filtered view SHARED audit_log scope='money')
- [ ] 6D · `/money/settings/credits` (ai_credits_ledger display)

### Chunk 7 — Verify + deploy + flag + self-merge
- [ ] 7A · `./scripts/check-design-tokens.sh` clean
- [ ] 7B · `NODE_OPTIONS="--max-old-space-size=8192" npx tsc --noEmit` 8 baseline / 0 new
- [ ] 7C · `npm run build` green
- [ ] 7D · agent-browser walkthroughs on Cockpit / Plan / Raise (empty + populated) via `~/.claude/scripts/forgeos-login.sh`
- [ ] 7E · Red-team re-run: verify the 7 HANDOVER findings have landed or are documented
- [ ] 7F · Flip `new-money-experience` flag ON for `claude-test@forgeos.test` + `tristan.fischer@gmail.com`
- [ ] 7G · PR description referencing HANDOVER-money + MONEY-SCHEMA + this tracker
- [ ] 7H · Self-merge on green (autonomy rule from Forge handoff)

---

## Decisions locked (7 open questions resolved)

1. **Role enum:** Option A — coarse 5-value compile (`Founder` / `Executive` / `Apprentice` / `AI_Agent` / `Supplier`, CapitalCase) + `permission_override` per-user exceptions. Do NOT expand enum.
2. **Legacy route lifecycle:** 90 days read-write post-cutover, then read-only archive.
3. **FX rate for historical Xero:** transaction-date rate, cached in new `fx_rate_cache` table (daily seed from open-API).
4. **Shortlist → pipeline mapping:** backfill `investor_shortlist` rows to active round's `investor_pipeline_state` with `current_stage='target'`. Create `"Pre-round shortlist · migrated"` draft round if no active round.
5. **Match score cache:** on-demand with `stale > 24h OR thesis version changed` refresh.
6. **Investor outreach persistence:** assume `investor_notes` + `investor_news_intel` are canonical; targeted migration if missing table discovered.
7. **Monthly investor update send:** Gmail OAuth (founder's own address) in V1. Transactional SMTP in V2.

---

## Red-team status (carried forward from prep)

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | HIGH | Parallel data model contradiction | RESOLVED in MONEY-SCHEMA v0.3 §5 (MIGRATE + write-twin) — Chunk 1G executes |
| 2 | HIGH | Specialist cost metering self-contradicting | RESOLVED (ai_credits family) — **Chunk 5A pre-work writes Forge backfill PR** (specialist_call events ZERO today, confirmed 2026-04-19) |
| 3 | HIGH | RLS role whitelists name non-existent enum values | RESOLVED via Option A — Chunk 1 migrations use CapitalCase values + override table |
| 4 | HIGH | Claimed §6/§7/§8 missing | RESOLVED in v0.2/v0.3 renumber |
| 5 | MED | Realtime thrashing | PATCHED — Chunk 2A implements isAttentionWorthy helper |
| 6 | MED | Xero one-org-two-foundries silent fail | PATCHED — Chunk 3B OAuth explicit reject |
| 7 | MED | Cold-start empty-state | PATCHED — plan_templates seed in 1A; Chunk 3D empty states |

---

## Gotchas on deck (check before each commit)

- [ ] **`member_role` is CapitalCase 5-value enum.** RLS whitelists MUST use `'Founder'` not `'founder'`. Type check: every WHERE clause with `role IN (...)` uses CapitalCase strings.
- [ ] **`foundries.id` is `text`, not `uuid`.** Every FK uses `text NOT NULL REFERENCES foundries(id)`.
- [ ] **`audit_log` dual-write.** Writers call `src/lib/audit/write.ts` which sets both `action`+`event` (same string) AND both `metadata`+`payload` (same jsonb). Never set one without the other.
- [ ] **`event_log` INSERT only via service_role.** Server actions must use admin client, not user client.
- [ ] **`"use server"` files export async functions ONLY.** No `export const maxDuration = ...` — put in page segment config instead.
- [ ] **Pre-commit hook race.** For docs-only commits: `git commit --no-verify`. For code commits: let hook run, verify `git show HEAD --stat`.
- [ ] **`NODE_OPTIONS="--max-old-space-size=8192"`** required for `npx tsc --noEmit` after types regen.
- [ ] **`staleTimes.dynamic` in next.config.ts MUST be 0.** Don't change.
- [ ] **Supabase `*.html` gitignored.** Force-add with `-f` if committing gap audits etc.

---

## Commit log (append per commit)

- (2026-04-19) Setup: worktree created at `/tmp/money-build-worktree` on `feat/money-redesign` off `main@d169533b`. Tracker + Chunk 1 start.
