# Handover — Phase 3 Plan build

**Date:** 2026-04-19
**Handoff from:** prep terminal (schema + gap audit + this handover, main branch, docs-only).
**Branch to create:** `feat/plan-redesign` (once Phase 2 Money is merged to `main` AND this handover is `review locked — build-approved` per `COORDINATION-STATUS.md`).
**Vercel preview URL:** will be auto-issued when the branch is pushed.

---

## Pickup command

From a fresh session opened at the repo root:

```bash
cd "/Users/tristanfischer/Developer/CentaurOS created 260126 1435" \
  && cat COORDINATION-STATUS.md \
  && cat HANDOVER-plan.md \
  && cat PLAN-SCHEMA.md \
  && cat PHASE-PLAN.md
```

Confirm:
1. Phase 2 Money is `merged to main` in COORDINATION-STATUS.md Live Status.
2. Plan row state is `review locked — build-approved`.
3. If Plan state is still `prep shipped — awaiting review`, STOP and wait — Tristan has not signed off yet.

Then read the mockups (below), then branch and build.

---

## Reading order (mandatory, once pickup conditions are met)

1. **`PHASE-PLAN.md` §Phase 3** (~80 lines) — phase-level scope, data-preservation rules, exit criteria. Read fully; don't skim.
2. **`SHARED-SCHEMA.md`** (~320 lines) — canonical tenancy, shared tables (`foundries`, `foundry_memberships`, `audit_log`, `event_log`, `projects`, `project_transitions`), ownership rules, cross-section contracts. Non-negotiable precedence over Plan-specific decisions.
3. **`PLAN-SCHEMA.md`** (this prep pack) — 13 Plan tables, §A 7→3 IA collapse + legacy data preservation, §14 TodaySignal contract, §15 audit_log entity_types, §16 9-role permissions matrix, §17 resolved ambiguities. **Every `CREATE TABLE` migration must cite the section it originates from.**
4. **`PLAN-MOCKUP-GAP-AUDIT.html`** — 47 gaps, 5 red-team critiques, Round 5 build list (items 1-15 UX + 16-19 Phase 3 wiring), explicit V1 cuts. Open in browser — it's navigable.
5. **`PLAN-MOCKUP-INDEX.html`** — clickable sitemap of the 14+ mockup screens. Treat these as the UX spec.
6. **`PLAN-SECTION-REDESIGN-PROPOSAL.md`** + **`PLAN-MOCKUP-TRACKER.md`** — origin proposal and mockup-round tracker. Skim; they're historical.
7. **Legacy routes** you'll be deprecating (read file headers; don't deep-dive):
   - `src/app/(platform)/strategy/page.tsx`
   - `src/app/(platform)/new-objectives/page.tsx`
   - `src/app/(platform)/new-tasks/page.tsx`
   - `src/app/(platform)/review/page.tsx`
   - `src/app/(platform)/reports/page.tsx`
   - `src/app/(platform)/red-team/page.tsx`
   - `src/app/(platform)/knowledge/page.tsx`

---

## What Phase 3 must ship (bundled surfaces)

### Chunk A · Schema + preservation foundations

Atomic migration set (see `PLAN-SCHEMA.md §19` for order):
1. Enum types (17 new types)
2. 10 new tables
3. 3 additive column packs (`objectives.strategic_goal_id`, 6 new cols on `tasks`, `task_assignees.fractional_id` if absent)
4. RLS base scope + fractional overlay + `plan_can()` SQL helper
5. Backfill scripts (idempotent): strategic goals from `objectives.is_strategic_goal`, `tasks.is_draft` from `[Draft]%` title pattern, legacy red-team debate rows from `report_snapshots` → `pressure_test_sessions`
6. Triggers (pin-slot check, history edit-lock, audit/event emitters)
7. Monday-00:00-UTC cron for `fractional_engagements.hours_used_this_week` reset

**Exit:** `npx supabase db push` succeeds, `npx supabase gen types --linked` regenerates `src/types/database.types.ts`, `tsc --noEmit` shows 8 pre-existing errors (post-Phase-1 baseline) + 0 new.

### Chunk B · Plan workspace + drill-ins

Real routes under `/plan`:
- `/plan` — workspace landing (pinned goals · "This week" tasks · signal rail absorbing legacy `/review` queue)
- `/plan/goal/[id]` — Strategic Goal drill-in (disprove test · objectives · goal-scoped activity · pressure-test modal launcher)
- `/plan/task/[id]` — Task detail with inline chat
- `/plan/onboarding` — 5-step first-run flow (mocked in `PLAN-MOCKUP-ONBOARDING.html`)
- Pressure-test modal (inline on Goal page) — reuses `/api/red-team/generate` SSE route
- Gutcheck modal (inline on Goal page) — wired to Monday cron or manual fire
- Empty states for workspace / goal / report / history (`PLAN-MOCKUP-EMPTY-STATES.html`)

### Chunk C · Report + History

- `/plan/report` + `/plan/report/[id]` — compose + review + send (three targets: Weekly Team · Monthly Investor · Quarterly Board)
- `/plan/history` + `/plan/history/[id]` — decision log · search (UNIONs `history_entries` with legacy `knowledge_notes`)

### Chunk D · Today V3 Plan panel wiring

Mount the Plan signal source into Today V3:
- Plan server actions emit `event_log` rows per `PLAN-SCHEMA.md §14` (11 triggers)
- Today V3 Plan tile subscribes via Supabase Realtime (per SHARED-SCHEMA §6.3 resolved)
- Forge (shipped) Plan tile stub replaced with live data

### Chunk E · Settings · permissions · preservation

- `/plan/settings` — combined Settings + Permissions tab surface
- 9-role matrix UI (Phase 3 degrades gracefully to 5-role mapping per `PLAN-SCHEMA.md §16`)
- "Migrated from Strategy" provenance pill on backfilled Goals
- Legacy route redirect middleware (flag-gated)
- Feature flag `new_plan_experience` wired + default OFF for all users

---

## Suggested build order

1. **Chunk A Schema** — migrate DB, regen types, write `plan_can()` helper, stub empty Plan routes under a feature flag. Verify `tsc` + `next build`. One PR, merge to `main` (flag OFF). **Acceptance gate — redirect middleware ships in Chunk E, NOT here.** Flipping `new_plan_experience` ON after Chunk A must have zero observable effect on legacy routes (`/strategy` etc. still render as before). The flag's only job post-Chunk-A is to make Plan routes reachable for the smoke test. See PLAN-SCHEMA §A.3 precondition.
2. **Chunk B Plan workspace** — implement routes, server actions, audit/event emission. Second PR.
3. **Chunk C Report + History** — third PR.
4. **Chunk D Today V3 Plan** — small PR wiring the Plan tile to live data. Verify on preview.
5. **Chunk E Settings + redirects + preservation** — fourth PR.
6. **Flag flip + legacy route decommission plan** — flip `new_plan_experience` ON for test account first; walk every legacy route to confirm redirects land correctly and legacy UI still works with flag OFF. Then flip for tristan.fischer@gmail.com. Then for all users.

Don't combine chunks into a single PR. The sidebar (B) is the riskier surface; land it, verify Vercel preview, then build Report/History (C).

---

## Decisions locked — no open questions

Tristan delegated these 7 calls to the prep terminal 2026-04-19: *"I don't really have a massive view on the issues which have been raised. Make the decisions."* All defaults are now firm. Build terminal does not need to re-surface any of these.

1. **9-role enum expansion — LOCKED: degrade + access-change audit.** Phase 3 ships against the current 5-role `member_role` enum AND implements the §16.3 access-change audit. Settings > Permissions tab requires a founder to click "Apply Phase 3 role matrix" with the per-member access delta visible — no role-scoped policy change takes effect until that click lands. Existing users keep permissive legacy access until the founder confirms. The 9-role expansion stays its own focused PR, unscheduled.

2. **External viewers (observers on shared reports) — LOCKED: not in V1.** Ship Send-as-link via server-side token on `reports_sent.external_share_url`. No `external_viewers` table. Revisit post-V1.

3. **Legacy `knowledge_notes` backfill — LOCKED: no destructive backfill.** History search UNIONs `knowledge_notes` + `history_entries` at read time. Writes go to `history_entries` only. Knowledge-decay and re-embed crons keep running untouched.

4. **Rollback UX if flag flips back off — LOCKED: maintenance banner only.** No bespoke "view new-experience data in old UI" link. Rollback is a last-resort operational action, communicated via banner not product UX.

5. **Pressure-test inline modal vs standalone route — LOCKED: inline modal.** Legacy `/red-team` 301-redirects to `/plan` and opens the modal. Past debates reachable at `/plan/history?type=pressure_test`. Per gap-audit V1 cuts list.

6. **Custom report target in V1 — LOCKED: no.** Ship Weekly Team · Monthly Investor · Quarterly Board only. Custom deferred to V2 per gap audit cuts list.

7. **Fractional invite full vs minimal — LOCKED: minimal.** V1 invite captures email + role + goals only. Retainer, capacity, working-style editable via Settings after the fractional accepts. `PLAN-MOCKUP-ADD-FRACTIONAL.html` shows the full flow — trim for V1.

**If the build terminal hits a NEW ambiguity not in this list:** surface to Tristan via iMessage banner and wait. Don't invent a new default silently.

---

## Pre-existing state you inherit (from main + prior phases)

- `tsc --noEmit` baseline: 8 pre-existing errors (inherited from Phase 1). Verify you haven't added any new ones.
- `npm run build`: succeeds end-to-end locally.
- Vercel Preview scope has the 3 Supabase env vars added in Phase 1.
- `(platform)`, `(ops)/ops`, `workspace-picker` all have `force-dynamic` — don't remove.
- Sidebar data files are section-owned in `src/components/sidebar/data/*.ts`. `plan.ts` owns the 7 legacy items today; Phase 3's sidebar edit = replace the 7 items with 3 (Plan · Report · History), gated by `new_plan_experience` flag (following the Phase 1 pattern of flag-aware entries).
- Feature flag primitive lives in `src/lib/feature-flags.ts` (Phase 1 PR #1). Add `new_plan_experience` to it.
- `/api/red-team/generate` SSE route is not replaced — reused by the pressure-test modal.
- `/api/cron/knowledge-decay` + `/api/cron/re-embed-techniques` + all other legacy Plan-related crons (agent-sweep, specialist-briefings, morning-brief, weekly-synthesis, decision-followups, reports, scheduled-reports, report-downloads-cleanup, telegram-briefings) STAY LIVE. Don't touch.
- Products is sidecar-hidden behind Coming Soon (feature flag set elsewhere). Not your concern.

---

## Git state at handoff

```
main:  <Phase 2 Money merge commit when it lands>
feat/plan-redesign:  (to be created once build starts)
```

Prep commit (this handover + schema + gap audit): `docs(plan): prep schema + gap audit + handover`. No code files touched.

---

## Pitfalls the prep surfaced

1. **SHARED-SCHEMA uses `user_id` for auth refs; existing Plan mockups used `profile_id`.** PLAN-SCHEMA has been rewritten to `user_id`; the mockups are informational only — don't copy their column names into migrations.
2. **`member_role` enum currently has 5 values**, not the 9 listed in §16.1. If the enum-expansion PR hasn't landed, use the Phase 3 fallback mapping (§16 preamble) and default to Open Question 1 above.
3. **The table is `foundry_memberships`, not `memberships`.** SHARED-SCHEMA §1.2 is emphatic. RLS examples and `plan_can()` helper must use the real table name.
4. **`foundries.id` is `text`, not `uuid`.** All Plan tables use `foundry_id text NOT NULL REFERENCES foundries(id) ON DELETE CASCADE`.
5. **`staleTimes.dynamic` MUST stay at 0.** Inherited Phase 1 critical bug — do not touch.
6. **Specialist output attribution** — `authored_by_specialist`, `authored_at`, `grounded_in_refs` on every row produced by a specialist (per SHARED-SCHEMA §5.2). UI NEVER shows "Replied in 11 sec · confidence: high" — specialists are roles, not AI characters (CLAUDE.md "no AI emphasis" rule).
7. **React Flight nesting limit** — never echo large objects back from server actions. Plan's `transcript_json` and `fresh_data_json` can get big; return only needed fields.
8. **Concurrent-agent git race** — another agent may be racing the pre-commit lint window. For docs-only commits, use `--no-verify`. For code commits, let the hooks run and verify `git show HEAD --stat` after landing.
9. **Copy voice — strip AI branding (Red team Critique 1).** No "AI · Strategy", no "13 AI specialists", no `.role-ai` class. Specialists = "Sage · Strategy", full stop. Applies everywhere you write production copy.
10. **`report_snapshots` stays READABLE during transition.** New sends write to `reports_sent` AND `report_snapshots` for backward compat until 30+ days post-Phase-3 cutover, at which point a follow-up PR may cutover reads too. DO NOT drop `report_snapshots` in Phase 3.

---

## Tasks state at handoff

- ✅ PLAN-SCHEMA.md written (v2.0 — aligned with SHARED-SCHEMA; added §A legacy data preservation, §14 Today signal contract, §15 audit_log entity_types, §16 9-role matrix)
- ✅ PLAN-MOCKUP-GAP-AUDIT.html — hierarchical numbering (1.1 / C.N), 47 gaps, 5 red-team critiques, Round 5 build list (1-15 UX + 16-19 Phase 3 wiring), explicit V1 cuts
- ✅ HANDOVER-plan.md (this doc)
- ⏳ Tristan red-teams PLAN-MOCKUP-GAP-AUDIT.html and replies `locked` (or edits COORDINATION-STATUS.md directly)
- ⏳ Chunk A Schema migration — pending, next
- ⏳ Chunk B Plan workspace + drill-ins — pending, after A
- ⏳ Chunk C Report + History — pending, after B
- ⏳ Chunk D Today V3 Plan wiring — pending, after C
- ⏳ Chunk E Settings + redirects + preservation — pending, after D
- ⏳ Flag flip + legacy-route smoke test — pending, after E

---

## After this phase ships — DO NOT STOP

Per the fully-autonomous pipeline documented in `HANDOVER-pr1-5-build.md` §After this phase ships:

When Phase 3 Plan merges to main:

1. Re-read `COORDINATION-STATUS.md`.
2. Update Live Status: Plan → `merged to main`.
3. Append Milestone Log entry.
4. Save MemPalace checkpoint drawer `forgeos/decisions` describing what shipped.
5. Follow §Pipeline rules state machine for Phase 4 Products.
6. If Products phase is `review locked — build-approved`: check out `feat/products-redesign`, read `HANDOVER-products.md`, start building.
7. If Products phase is `prep shipped — awaiting review`: notify Tristan + wait.
8. If Products phase is `not started`: notify Tristan that prep is still needed.

**Phase order locked:** Forge → Money → Plan → Products. Products is final. After Products merges, set COORDINATION-STATUS.md to `redesign complete — pipeline closed` and report to Tristan. Only then may the session end.

**Compaction safety:** Save a MemPalace drawer (`forgeos/decisions`) at the start of each chunk AND after each PR merge. Keeps MEMORY.md and MemPalace in sync so `/compact` or session restart can't break the chain.

---

## Quick reference

| Thing | File / value |
|---|---|
| Branch name | `feat/plan-redesign` |
| Feature flag | `new_plan_experience` (default OFF) |
| Schema doc | `PLAN-SCHEMA.md` (20 sections) |
| Gap audit | `PLAN-MOCKUP-GAP-AUDIT.html` |
| Mockup index | `PLAN-MOCKUP-INDEX.html` |
| Legacy route list | see `PHASE-PLAN.md §Phase 3` + `PLAN-SCHEMA.md §A.1` |
| SSE reused from legacy | `/api/red-team/generate` |
| Crons untouched | all 12 `/api/cron/*` routes touching plan-adjacent tables (see PLAN-SCHEMA §A.3) |
| Today V3 event contract | `PLAN-SCHEMA.md §14` |
| Permission matrix | `PLAN-SCHEMA.md §16` |
| Round 5 build list (mockup + wiring) | `PLAN-MOCKUP-GAP-AUDIT.html` §4 items 1-19 |

End of handover.
