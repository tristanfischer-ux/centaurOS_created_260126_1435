# ForgeOS Redesign — Coordination Status

> **Single source of truth for multi-terminal phase progress.** Every terminal appends one line when a milestone ships. Read this FIRST before starting any "continue <section>" task.

**Phase order (locked 2026-04-19):** Forge → Money → Plan → Products

---

## Live Status

| Phase | Section | State | Branch | Pickup doc | Last update |
|---|---|---|---|---|---|
| 1 | Forge | PR #1 merged, PR #1.5 in flight | `feat/forge-visual-rebuild` | `HANDOVER-pr1-5-build.md` | 2026-04-19 |
| Pre | Products Coming Soon sidecar | **merged to main** (commit `1d4d88b7` · flag-free — all users see Coming Soon immediately · legacy read-only at `/products/legacy`) | `feat/products-coming-soon` | `PHASE-PLAN.md` §Pre-Phase | 2026-04-19 |
| 2 | Money | **merged to main** (PR #68 · commit `4656f369` · flag OFF default) | `feat/money-redesign` | `HANDOVER-money.md` + `COMPLETENESS-AUDIT-money.md` | 2026-04-19 |
| 3 | Plan | build in flight (parallel, Chunk A shipped) — DO NOT double-claim | `feat/plan-redesign` | `HANDOVER-plan.md` | 2026-04-19 |
| 4 | Products | review locked — build-approved (autonomous RT mitigations + defaults, ready to build after Plan merges) | — | `HANDOVER-products.md` | 2026-04-19 |

---

## Milestone Log (append one line per event)

- ✅ 2026-04-19 — Forge PR #1 merged to main (commit `000be5b3`). Feature flags OFF, no user-visible change yet.
- ✅ 2026-04-19 — Forge PR #1.5 research foundation shipped to `feat/forge-visual-rebuild`: HANDOVER-pr1-5-build.md, SIDEBAR-CLASS-INVENTORY.md, TODAY-V3-SIGNAL-PORTING-MAP.md, FORGE-LEGACY-ROUTES-AUDIT.md, TRACKER-forge-visual-rebuild-pr1-5.md.
- ✅ 2026-04-19 — Phase order revised: Forge → Money → Plan → Products (was Forge → Products → Plan → Money). Products Coming Soon sidecar planned as pre-phase.
- ✅ 2026-04-19 — Parallelisation decision locked: prep docs parallel (3 terminals), code builds sequential. See MemPalace `drawer_forgeos_decisions_9cafddb3415ab00b`.
- ✅ 2026-04-19 — Products prep shipped (Phase 4): PRODUCTS-SCHEMA.md + PRODUCTS-MOCKUP-INDEX.html + PRODUCTS-MOCKUP-GAP-AUDIT.html + HANDOVER-products.md. 18 gaps (6 MUST) + 5 red-team critiques (2 CRIT / 2 HIGH / 1 MED). Awaiting Tristan red-team review → reply `locked` to unblock build.
- ✅ 2026-04-19 — Money prep shipped (Phase 2): MONEY-SCHEMA.md v0.3 (~880 lines, 20 tables + ai_credits family + Today signal contract + 9-role matrix + §5 data preservation with confirmed legacy table names) + MONEY-MOCKUP-GAP-AUDIT.html refresh (47 gaps now hierarchically numbered 1.1/1.2/C.N + post-schema red-team banner with 3 HIGH must-fix) + HANDOVER-money.md. Red-team surfaced 7 findings (3 HIGH: parallel-data-model, specialist-cost-metering, RLS-role-enum-mismatch) — 2 resolved in v0.2/v0.3, 1 awaiting Tristan choice (role enum strategy). Awaiting Tristan red-team review → reply `locked` to unblock build.
- ✅ 2026-04-19 — Money prep LOCKED by Tristan (verbal sign-off, MemPalace drawer_forgeos_decisions_bd713f6a077b91f8). Tristan: "I don't really have a massive view on the issues which have been raised. Make the decisions." Defaults locked per HANDOVER-money.md §Open questions: role enum = Option A (coarse 5-value + permission_override), legacy route lifecycle 90d, FX transaction-date-rate cached, shortlist → active-round backfill, match-score on-demand-with-24h-stale, outreach persistence assumed in investor_notes+investor_news_intel, investor updates via Gmail OAuth. Build terminal picks up Money after Forge PR #1.5/#2 merges.
- ✅ 2026-04-19 — Plan prep shipped (Phase 3): PLAN-SCHEMA.md v2.0 (~900 lines · 13 tables + §A 7→3 legacy data preservation incl. `strategy_pillars` / `review_cycles` + §14 Today signal contract with canonical-token CTAs + §15 audit_log entity_types + §16 9-role matrix with §16.3 mandatory access-change audit + §17 resolved ambiguities) + PLAN-MOCKUP-GAP-AUDIT.html refresh (47 gaps hierarchically numbered 1.1/C.N + 6 new Phase 3 wiring gaps C.12-C.17 + Round 5 items 16-19 for redirects/Today/permissions/preservation banner) + HANDOVER-plan.md (build chunks A-E, 7 open questions w/ defaults, 10 pitfalls). Red-team surfaced 5 new structural critiques (3 HIGH: orphaned shared tables, cta_href flag coupling, silent role degradation · 2 MED: backfill uniqueness, Chunk A/E ordering) — ALL 5 mitigated in v2.0. Awaiting Tristan red-team review → reply `locked` to unblock build.
- ✅ 2026-04-19 — Plan review locked — build-approved. Tristan delegated all 7 open questions to the prep terminal ("I don't really have a massive view on the issues which have been raised. Make the decisions."). Defaults locked in HANDOVER-plan.md §Decisions locked: (1) 9-role → degrade + access-change audit, (2) external viewers → not in V1, (3) knowledge notes → no destructive backfill, (4) rollback UX → maintenance banner only, (5) pressure-test → inline modal, (6) custom report → not in V1, (7) fractional invite → minimal. Plan build will not start until Phase 2 Money is `merged to main`. Build terminal: pick up Plan third, after Money merges and before Products.
- ✅ 2026-04-19 — Products prep LOCKED autonomously (Tristan verbal sign-off: "I don't really have a massive view on the issues which have been raised. Make the decisions. We need to wait until some of the other sections are done first. Just get yourself ready."). All 5 red-team mitigations + 7 HANDOVER open questions + 7 SCHEMA §10 decisions locked to recommended defaults. Key locks: RT1 readiness-close enforced via DB CHECK on evidence_ref; RT2 assumption-valid gated on linked_experiment_id with decision='keep'; RT3 stale evidence = derived flag + warning (not block); RT4 hypothesis-create 3 separate columns (if_change/then_impact/because_assumption); RT5 promote reversibility copy explicit. OQ1 composite score KILLED (closed count only, no ≤100 number); OQ2 legacy /products/legacy kept 30d post-cutover; OQ3 D/F/V tagging deferred to v2; OQ4 stale = warn not block; OQ5 Priya drafts Forge Brief async on promote; OQ6 rollback banner shown; OQ7 show both promote + brief-lock events. Full rationale in MemPalace drawer. Build terminal picks up Products AFTER Plan merges to main — sequential phase order holds.
- ✅ 2026-04-19 — Plan build Chunk A shipped to `feat/plan-redesign` (commit `f8b6d94b`). Running in PARALLEL with Money in an isolated `/tmp/plan-build` worktree — primary worktree / Money's surface never touched. Chunk A contents: 5 migration SQL files (enums, tables, additive columns, RLS+plan_can(), backfill) written as TEXT ONLY (not yet applied to live Supabase — Money owns live DB until its migrations merge); hand-written `src/types/plan.ts`; flag-gated stubs for /plan /plan/report /plan/history; flag-aware `planNavigationV2` in sidebar data. Flag `new_plan_experience` default OFF for all users. AUTONOMOUS BUILD TERMINAL: Plan is already owned — do NOT check out `feat/plan-redesign` or start a parallel build when Money merges. This terminal continues Plan Chunks B–E.
- ✅ 2026-04-19 — Money Phase 2 **MERGED to main** via PR #68 (merge commit `4656f369`). 10 commits on feat/money-redesign + `new_money_experience` flag default OFF. Ships: 20 V2 tables + 5 helper libs + 25+ routes + 13 server actions + Today V3 money tiles live + sidebar Credits pill + specialist_call cost metering (4 invocation sites wired; broader wiring is follow-up). tsc 8 pre-existing / 0 new; zero new design-token violations; agent-browser walkthrough confirmed all routes render clean on preview `ipugmc8jb`. See COMPLETENESS-AUDIT-money.md for 56-task reconciliation (49✅/3⚠️/2🟡/2❌). Chunk 1G (legacy forward-migration + write-twins) + Chunk 5A broader specialist-call wiring + Chunk 4C live match-score recompute tracked as post-merge follow-ups. Plan build unblocked.
- ✅ 2026-04-19 — Products Pre-Phase Coming Soon sidecar **MERGED to main** (commit `1d4d88b7`). All `/products/*` routes now render a Coming Soon placeholder; users with existing `products` rows get "View N existing product records (read-only)" link to `/products/legacy`. Sidebar Products item auto-picks up SOON badge via registry entry (`isRouteComingSoon('/products')`). Existing `products` table untouched — zero data loss. tsc 8 pre-existing / 0 new. User authorised deploy: *"I think you're saying that we are ready to actually go live in the app. If that is the case, go for it."* Phase 4 Products build still waits on Plan per sequential order.

---

## How to pick up from this file

**Starting a new build session:**
```
cd "/Users/tristanfischer/Developer/CentaurOS created 260126 1435" && cat COORDINATION-STATUS.md
```

Then follow the pickup doc for the section you're continuing.

**"Continue Money" prompt:**
```
Continue Money build per HANDOVER-money.md. Read COORDINATION-STATUS.md first, then HANDOVER-money.md, then MONEY-SCHEMA.md, then execute.
```

**"Continue Plan" prompt:**
```
Continue Plan build per HANDOVER-plan.md. Read COORDINATION-STATUS.md first, then HANDOVER-plan.md, then PLAN-SCHEMA.md, then execute.
```

**"Continue Products" prompt:**
```
Continue Products build per HANDOVER-products.md. Read COORDINATION-STATUS.md first, then HANDOVER-products.md, then PRODUCTS-SCHEMA.md, then execute.
```

---

## Append rules

- One line per milestone, dated `YYYY-MM-DD`.
- States: `prep in flight`, `prep shipped — awaiting review`, `review locked — build-approved`, `build in flight`, `merged to main`.
- When a section transitions, update BOTH the Live Status table AND append a Milestone Log entry.
- Do NOT delete old entries — the log is append-only history.

---

## Pipeline rules (state machine for the autonomous build terminal)

**The build terminal runs continuously through all 4 phases. It consults this file between phases and picks up the next ready one.**

### State transitions (per section)

```
not started
    ↓ (prep terminal starts)
prep in flight
    ↓ (prep terminal commits + updates this file)
prep shipped — awaiting review
    ↓ (Tristan red-teams the gap audit, says "locked")
review locked — build-approved
    ↓ (build terminal starts)
build in flight
    ↓ (PR merges to main)
merged to main
```

### Build terminal decision loop (runs after each PR merge)

1. Re-read this file.
2. Find the next phase in order (Forge → Money → Plan → Products) whose state is `review locked — build-approved`.
3. If found: check out the section's handover doc (`HANDOVER-<section>.md`), create branch `feat/<section>-redesign`, start building.
4. If the next phase is `prep shipped — awaiting review`: notify Tristan (iMessage + prominent banner) and wait. Do NOT close session.
5. If the next phase is `not started` or `prep in flight`: notify Tristan that prep is still needed. Wait.
6. If all 4 sections are `merged to main`: update this file to `redesign complete — pipeline closed` and report to Tristan. Session may end.

### Prep terminal completion protocol

Each of the 3 prep terminals (Money, Plan, Products) MUST do ALL of these on completion:

1. Commit schema + gap audit + handover doc to main.
2. Save MemPalace drawer `forgeos/decisions` summarising V1 cuts + open questions.
3. Update Live Status table row for their section: state = `prep shipped — awaiting review`, pickup doc = `HANDOVER-<section>.md`.
4. Append Milestone Log line with date.
5. Notify Tristan via iMessage (or prominent banner): `<Section> prep ready for red-team review — open <SECTION>-MOCKUP-GAP-AUDIT.html and reply "locked" when approved.`
6. Session may end after step 5.

### Tristan's role (minimised)

- Kick off 3 prep terminals (once).
- When notified, open each `<SECTION>-MOCKUP-GAP-AUDIT.html`, red-team it, reply `locked` to the build terminal (or update this file directly if convenient).
- Nothing else. Pipeline is self-driven between prep completions and build completions.

### Compaction safety

Between each phase, the build terminal must save a MemPalace checkpoint (`forgeos/decisions`) describing what just shipped + what's next. This guarantees the chain survives `/compact` or session restart. A fresh session reading MEMORY.md + this file can always re-enter the pipeline at the correct state.
