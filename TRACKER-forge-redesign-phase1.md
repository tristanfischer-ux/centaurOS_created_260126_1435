# TRACKER — Forge Redesign Phase 1 (PR #1: Shared Primitives)

**Branch:** `feat/forge-redesign`
**Started:** 2026-04-19
**Phase plan:** [PHASE-PLAN.md](./PHASE-PLAN.md)
**Grounding docs:** [SHARED-SIDEBAR.html](./SHARED-SIDEBAR.html) · [SHARED-SCHEMA.md](./SHARED-SCHEMA.md) · [FORGE-MOCKUP-TODAY-V3.html](./FORGE-MOCKUP-TODAY-V3.html) · [FORGE-MOCKUP-GAP-AUDIT.html](./FORGE-MOCKUP-GAP-AUDIT.html)
**Data preservation:** [FORGE-DATA-PRESERVATION.md](./FORGE-DATA-PRESERVATION.md)

---

## Scope of PR #1 (unflagged shared primitives)

Lands the primitives every Phase (2/3/4) will consume. Forge routes themselves are NOT in this PR — they come in PR #2+ behind `new_forge_experience` flag at `/the-forge-v2/*`.

---

## Checklist

### A · Branch + docs
- [x] A.1 Create `feat/forge-redesign` from `main`
- [x] A.2 Write this tracker
- [x] A.3 Write `FORGE-DATA-PRESERVATION.md`

### B · Migrations (additive only)
- [x] B.1 `20260419100000_profiles_feature_flags.sql` — add `feature_flags jsonb NOT NULL DEFAULT '{}'`
- [x] B.2 `20260419100100_foundries_shared_schema_columns.sql` — add `tier` (with CHECK), `member_count_cached`, `updated_at` + updated_at trigger + initial backfill of member count
- [x] B.3 `20260419100200_audit_log_shared_schema_columns.sql` — add `section`, `event`, `actor_user_id`, `actor_specialist`, `payload`; preserve `action`, `user_id`, `metadata`; indexes `(foundry_id, created_at DESC)` + partial `(foundry_id, section, entity_id) WHERE section IS NOT NULL`
- [x] B.4 `20260419100300_foundry_memberships_shared_schema_columns.sql` — **REVISED**: existing `foundry_memberships` table IS SHARED-SCHEMA's `memberships`. Additively add `active`, `active_at`, `updated_at` + updated_at trigger + `refresh_foundry_member_count` trigger that keeps `foundries.member_count_cached` in sync. Existing `profiles_ensure_membership` sync trigger (from 20260330200000) unchanged. Role-enum expansion (5 CapitalCase → 9 snake_case) **deferred** from Phase 1 PR #1 — cascades to every consumer.
- [x] B.5 `20260419100400_event_log.sql` — CREATE TABLE + RLS (foundry-scoped SELECT + service_role INSERT + foundry-member resolve-only UPDATE) + indexes + Supabase Realtime publication
- [x] B.6 `20260419100500_projects.sql` — CREATE TABLE + unique `(foundry_id, slug)` + RLS + `hypothesis_id` nullable uuid without FK (FK added Phase 2 when hypotheses table lands)
- [x] B.7 `20260419100600_project_transitions.sql` — CREATE TABLE + RLS (foundry SELECT, service_role INSERT, append-only) + FK to projects
- [x] B.8 Migrations applied via Supabase Management API (`apply_migration` MCP) — **CLI `db push` blocked by pre-existing migration-history drift** (12 remote-only rows + duplicate-timestamp pair at `20260421000000` + 11 backlog local files, none of which are PR #1 scope). 22/22 DB verification checks passed (columns, triggers, RLS, Realtime publication). Decision: handle the drift in a separate reconciliation PR, not here.
- [x] B.9 Types regenerated via `npx supabase gen types typescript --linked` — 23,099 lines. `event_log`, `projects`, `project_transitions`, new columns on profiles/foundries/audit_log/foundry_memberships all present.
- [x] B.10 `tsc --noEmit` baseline-clean — **8 errors total, all pre-existing** (discriminated-union narrowing in `tasks.test.ts`, `BatchApprovalSheet.tsx`, `InlineBatchApproval.tsx`; none reference my new schema). Baseline confirmed by stashing working tree and re-running tsc: same 8 errors.

### C · Feature-flag primitive
- [ ] C.1 `src/lib/features/flags.ts` — `getFeatureFlag(supabase, userId, key)`, `requireFeatureFlag(key)` server helper, `useFeatureFlag(key)` client hook
- [ ] C.2 `src/lib/features/keys.ts` — `FLAG_NEW_FORGE_EXPERIENCE` constant
- [ ] C.3 `src/app/api/flags/[key]/route.ts` — client-hook JSON endpoint
- [ ] C.4 `scripts/flip-flag.sql` — parameterised helper
- [ ] C.5 Unit-ish smoke: flag off → false; flag on → true; no user → false

### D · Audit log dual-write helper
- [ ] D.1 `src/lib/audit/write.ts` — writes both `action`+`event` (same value) and both `metadata`+`payload` so legacy readers keep working
- [ ] D.2 Swap 1 high-traffic call site to confirm helper works end-to-end; defer broad migration (not Phase-1 scope)

### E · Sidebar (atomic swap — verified safe, only `(platform)/layout.tsx` imports it)
- [ ] E.1 `src/components/sidebar/Sidebar.tsx` — new shell matching SHARED-SIDEBAR.html chrome (foundry switcher, section groups, footer Getting Started + AI Credits bar). Semantic tokens only, light-first.
- [ ] E.2 `src/components/sidebar/data/me.ts` — new Me structure
- [ ] E.3 `src/components/sidebar/data/supplier-portal.ts` — conditional, faded per mockup
- [ ] E.4 `src/components/sidebar/data/plan.ts` — **legacy 7-item** (Strategy/Objectives/Tasks/Review/Reports/Red Team/Knowledge → existing routes). Phase 3 swaps.
- [ ] E.5 `src/components/sidebar/data/money.ts` — **legacy 6-item Cash Burn** (no strikethrough pedagogy). Phase 4 swaps.
- [ ] E.6 `src/components/sidebar/data/workshop.ts` — Forge entry reads `new_forge_experience` flag; target `/the-forge-v2` when true, `/the-forge` when false. Server component.
- [ ] E.7 `src/components/sidebar/data/marketplace.ts` — PEOPLE + SUPPLIES sub-groups per mockup
- [ ] E.8 **Exclude** the AUDIT section (pedagogical only, not for production)
- [ ] E.9 Update `src/app/(platform)/layout.tsx` to import new Sidebar
- [ ] E.10 Delete `src/components/Sidebar.tsx` + `useSidebarCollapse` if fully superseded (else document why retained)

### F · Today V3 (reskin-plus-frame — preserve existing signals)
- [ ] F.1 Port headline Priority card — use `briefing.nudges[0]` / `briefing.topTasks[0]` as the primary signal source (existing Today logic)
- [ ] F.2 Runway card (Money slot) — "Connect Cash Burn" stub (no existing runway action wired to Today). Mini-stats empty.
- [ ] F.3 Plan panel — populate from `getStrategyHealthSummary()` + `getMyDailyPulse()` (at-risk objectives, tasks due/overdue/completed)
- [ ] F.4 Forge panel — "Coming in PR #N · Forge experience build starts next" placeholder
- [ ] F.5 Products panel — "Coming in Phase 2" placeholder
- [ ] F.6 Waiting-on-you inbox — `briefing.nudges` + `briefing.topTasks` + `pulseData.blockers`
- [ ] F.7 Greeting + Cal hero narrative — reuse existing `use-cal-briefing.ts`
- [ ] F.8 `src/types/today.ts` — `TodaySignal` interface matching `event_log` row
- [ ] F.9 `src/app/api/today-feed/route.ts` — stub returning empty `signals` array (subscribes to `event_log` via Realtime client-side; hydrates only Forge events once PR #2+ starts writing)
- [ ] F.10 Verify fresh-signup flow via `~/.claude/scripts/forgeos-login.sh` — Today V3 empty-state must not break onboarding

### G · Verification
- [ ] G.1 `./scripts/check-design-tokens.sh` — no hardcoded colors
- [ ] G.2 `npm run verify` (Tier 1 static + Tier 2 smoke)
- [ ] G.3 `agent-browser` walkthrough on local `/today` (1440×900 + 375×812) — screenshot + snapshot
- [ ] G.4 `agent-browser` walkthrough on `/the-forge`, `/strategy`, `/cash-burn`, `/marketplace` — sidebar renders, no regressions
- [ ] G.5 Fresh-account onboarding walkthrough — Today V3 empty-state OK
- [ ] G.6 Flag flip test: SQL flip `new_forge_experience=true` → sidebar Forge target flips to `/the-forge-v2`; flag off → flips back

### H · Commit + deploy
- [ ] H.1 Commits per chunk (migrations, flags, sidebar, Today) — not one mega-commit
- [ ] H.2 `git push -u origin feat/forge-redesign`
- [ ] H.3 Open draft PR referencing phase plan, tracker, data-preservation doc, screenshots
- [ ] H.4 Verify Vercel preview Ready (Production + Preview both green per the verify-deploy rule)
- [ ] H.5 Flip flag on for Tristan's account via `scripts/flip-flag.sql`
- [ ] H.6 Flip flag on for `claude-test@forgeos.test` sandbox account
- [ ] H.7 `agent-browser` walkthrough on Vercel preview URL — final report to Tristan

### I · Exit criteria
- [ ] I.1 All B-H boxes ticked (or explicitly explained why descoped)
- [ ] I.2 No user-visible regression on `/today` (signals still flow for existing users)
- [ ] I.3 Sidebar renders on every platform route without 404s
- [ ] I.4 `tsc --noEmit` + `npm run verify` + design-token check all clean
- [ ] I.5 Tristan approves on Vercel preview

---

## Abort criteria

Stop and re-plan if:
1. A migration fails and can't be fixed inside 30 min investigation — `supabase migration repair` + re-plan
2. The sidebar component swap breaks ANY platform route's rendering (not just Forge)
3. Today V3 port loses signals a user previously saw on Today (regression)
4. `memberships` backfill produces wrong role assignments for >0 real (non-sandbox) profiles
5. Feature-flag primitive reads stale data (caching issue — `getFoundryIdCached()` 60s window is a known gotcha)
6. The CAD lab route stops working at `/the-forge/cad-lab` (untouched by design — if it breaks, something else is wrong)

---

## Deploy log

| Timestamp | Commit SHA | Vercel status | Notes |
|---|---|---|---|
| (to fill on each push) | | | |

---

## Red-team notes (lite, per surface)

Populated during implementation. Format: `[surface] risk · mitigation`.

### Migrations
- [audit_log] Adding nullable columns to a hot-written table — confirm no long-running ALTER locks under production write load. Mitigation: columns are NULL-default, additive only, no backfill required.
- [memberships sync trigger] Recursive trigger risk if trigger also writes to profiles — confirm memberships trigger writes ONLY to memberships, never back to profiles.

### Flag primitive
- Caching: if we cache the flag result per request, changes to `profiles.feature_flags` for a user in session #1 won't reflect until session #2. Acceptable for Phase 1 review (Tristan flips, refreshes, sees change). Document explicitly.

### Sidebar
- Atomic swap verified safe (only `(platform)/layout.tsx` imports). If any route renders its own layout with a sidebar override mid-phase, this breaks. Grep for `Sidebar` rendering in page.tsx files — confirmed none.

### Today V3
- Empty-state for Forge panel on fresh-account first-login must not look broken. Verify via test account.
- Cal briefing narrative sometimes fails (existing behavior). V3 must preserve the graceful DB-greeting fallback.

---

## Scoring ledger

| Round | Date | Migrations passing | Sidebar regressions | Today signals preserved | Vercel preview | Tristan sign-off |
|---|---|---|---|---|---|---|
| R1 | (pending) | 0/7 | N/A | N/A | N/A | N/A |

---

## PR #2..N roadmap (not this PR)

Sketched for handover continuity — not executed in PR #1.

- PR #2 — Workspace + phase tabs + 9-artefact grid shell at `/the-forge-v2`
- PR #3 — Brief + Brief-Lock
- PR #4 — Modules + Module-Detail + Part-Detail
- PR #5 — BOM + BOM-Add
- PR #6 — Suppliers + Supplier-Create + Supplier-Detail
- PR #7 — Risks + Risk-Create
- PR #8 — Cost
- PR #9 — Experts + Expert-Profile
- PR #10 — Geometry + Geometry-Upload + CAD lab drill-in CTA
- PR #11 — Launch + Launch-Handoff + Operations + Revisions
- PR #12 — Cutover: rename `/the-forge-v2` → `/the-forge`, flag global on, remove flag-gate dead code
