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
- [x] C.1 `src/lib/features/flags.ts` — `getFeatureFlag(supabase, userId, key)` + `getCurrentUserFeatureFlag(key)` + `requireFeatureFlag(key)` server helpers. Client hook split into `src/lib/features/use-feature-flag.ts` (`'use client'` + module-scope key cache).
- [x] C.2 `src/lib/features/keys.ts` — `FLAG_NEW_FORGE_EXPERIENCE` + `_PRODUCTS_` + `_PLAN_` + `_MONEY_` constants. `FeatureFlagKey` union type + `isFeatureFlagKey` type guard.
- [x] C.3 `src/app/api/flags/[key]/route.ts` — JSON endpoint. Returns `{ enabled: false }` on unknown key / unauth / lookup error. 404 status only for unknown key.
- [x] C.4 `scripts/flip-flag.sql` — helper with 4 recipes (flip on, flip off, flip for whole foundry via active members, inspect flag holders).
- [x] C.5 Smoke — `tsc --noEmit` passes with baseline-8 pre-existing errors (no new). Full end-to-end flag flip verified in G.6 after dev server is running.

### D · Audit log dual-write helper
- [ ] D.1 `src/lib/audit/write.ts` — writes both `action`+`event` (same value) and both `metadata`+`payload` so legacy readers keep working
- [ ] D.2 Swap 1 high-traffic call site to confirm helper works end-to-end; defer broad migration (not Phase-1 scope)

### E · Sidebar (E-MINIMAL — data extraction only; chrome rebuild deferred to PR #1.5)

Scope revision 2026-04-19: after inspecting `src/components/Sidebar.tsx` (605 lines, 20+ integrations), Tristan approved deferring the SHARED-SIDEBAR.html chrome rebuild to a focused PR #1.5. PR #1 ships the **data-architecture split** (the primitive Phases 2/3/4 consume) without touching visual chrome. Zero visual change.

- [x] E.1 _(deferred to PR #1.5)_ full chrome rebuild to match SHARED-SIDEBAR.html `sb-*` class system.
- [x] E.2 `src/components/sidebar/data/me.ts` — `welcomeNavItem` + `todayNavItem` + `meNavigation` (4 items).
- [x] E.3 `src/components/sidebar/data/supplier-portal.ts` — `supplierNavigation` (6 items), rendered only when `profiles.is_supplier = true` (condition in Sidebar.tsx unchanged).
- [x] E.4 `src/components/sidebar/data/plan.ts` — **legacy 7-item** (Strategy/Objectives/Tasks/Review/Reports/Red Team/Knowledge). Phase 3 swaps in a single-file edit.
- [x] E.5 `src/components/sidebar/data/money.ts` — **legacy 6-item Cash Burn** exported as `moneyLegacyNavigation`. Section label in the sidebar stays "Cash Burn" during Phase 1; Phase 4 changes label to "MONEY [V2]".
- [x] E.6 `src/components/sidebar/data/workshop.ts` — exports `getWorkshopNavigation(newForgeExperience: boolean): SidebarNavItem[]`. When flag true, Forge href = `/the-forge-v2`; when false, `/the-forge`. All other workshop entries unchanged.
- [x] E.7 `src/components/sidebar/data/marketplace.ts` — `marketplacePeopleNavigation` + `marketplaceSuppliesNavigation` (PEOPLE + SUPPLIES sub-groups).
- [x] E.8 AUDIT section excluded (never existed in current Sidebar — so no change needed).
- [x] E.9 `src/app/(platform)/layout.tsx` reads flag via `getFeatureFlag(supabase, user.id, FLAG_NEW_FORGE_EXPERIENCE)` (reuses existing supabase client — no extra round-trip), passes as `newForgeExperienceEnabled` prop to Sidebar. Sidebar.tsx accepts the prop and calls `getWorkshopNavigation(newForgeExperienceEnabled)`.
- [x] E.10 _(deferred to PR #1.5)_ delete old `src/components/Sidebar.tsx` + `useSidebarCollapse`. Existing component path preserved per Tristan's E-minimal guardrail.

Supporting file: `src/components/sidebar/data/types.ts` exports the shared `SidebarNavItem` type consumed by every data file.

tsc: 8 pre-existing errors, 0 new. Visual change: zero.

### F · Today V3 — Today-MINIMAL scope only (visual rebuild deferred to PR #1.5)

Scope revision 2026-04-19 (Tristan reversed the reskin-plus-frame instruction after the same compound-risk argument as Sidebar — `today-view.tsx` is 1636 lines with 30+ signal surfaces; rebuilding it alongside migrations + flag + sidebar-data in one PR = four-dimensional regression debugging in one preview). PR #1 ships the **data contract** only; PR #1.5 ships the visual rebuild bundled with sidebar chrome.

- [x] F.1 _(deferred to PR #1.5)_ Priority card + Runway + Plan/Forge/Products/Money panels + Waiting-on-you inbox + Cal hero slab — all land in the bundled visual rebuild.
- [x] F.2 `src/types/today.ts` — `TodaySignal` interface + `TodaySignalSection` / `TodaySignalUrgency` / `TodaySignalDecayRate` narrowed unions + `DECAY_RATE_RANK` table + `compareTodaySignals(a, b)` sort comparator + `toTodaySignal(row)` from-DB-row mapper. Envelope stable for downstream phases.
- [x] F.3 `src/app/api/today-feed/route.ts` — GET handler reading `event_log` where `section='forge'` AND `resolved_at IS NULL`, `limit 200`, then sorted in-route via `compareTodaySignals` (decay_rate → consequence_weight DESC → created_at DESC). Foundry scoping enforced by `event_log_foundry_select` RLS. Returns `{ signals: [] }` on unauth or lookup error — never 500s.
- [x] F.4 `src/hooks/useTodayForgeFeed.ts` — client hook. Hydrates via `/api/today-feed`, subscribes to `event_log` INSERT + UPDATE via Supabase Realtime (channel `event_log_forge_<foundryId>`, filter `foundry_id=eq.<id>` + client-side `section === 'forge'` check). UPDATE with non-null `resolved_at` evicts the row. **Ships wired but NOT MOUNTED** on `/today` in PR #1 — PR #1.5 mounts it.
- [x] F.5 `/today` page — visually unchanged. `today-view.tsx` preserved byte-for-byte. Zero regression.
- [x] F.6 tsc baseline-clean (8 pre-existing errors, 0 new).

**What Phases 2/3/4 consume from PR #1 Today-minimal:** `TodaySignal` type + `/api/today-feed` route + `useTodayForgeFeed` hook + `event_log` table (from B.5) + Realtime publication. Phase 2 Products will write to `event_log` with `section='products'` (and extend the route's filter); PR #1.5 visual rebuild mounts the subscription so events actually show on Today.

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

## PR sequence — revised 15-PR plan (Tristan 2026-04-19)

Three drill-ins not in the original 12-PR plan are scheduled here; PR #1.5 bundles the visual rebuild of the two most-used surfaces (sidebar chrome + Today V3) for one focused review.

- **PR #1** (this PR) — Shared primitives: migrations + flag primitive + sidebar data extraction + Today-minimal API contract. Visual change = zero.
- **PR #1.5** — Visual rebuild bundle. Sidebar chrome to `sb-*` system per `SHARED-SIDEBAR.html`; `today-view.tsx` full rebuild per `FORGE-MOCKUP-TODAY-V3.html` with ALL existing signals ported into V3 panel slots (briefing.nudges → Waiting-on-you, topTasks/blockers → Today queue, strategyHealth → Plan panel, Cal narrative → Priority slab when hottest, pulseData stats → 3-tile mini-grid). Bundle rationale: both surfaces consume the same `sb-*` token system — one review cycle, one agent-browser walkthrough, one preview sign-off.
- **Pre-PR #2 audit (required)** — `FORGE-LEGACY-ROUTES-AUDIT.md`. Audit every file under `src/app/(platform)/the-forge/*`; for each file NOT covered by a `FORGE-MOCKUP-*` spec, decide fate: **Migrate** (content folds into new structure), **Preserve** (stays at legacy path — CAD lab is the obvious one), or **Deprecate** (removed with migration path for affected users). Prevents surfaces falling through cracks during v2 build.
- **PR #2** — Workspace + phase tabs + 9-artefact grid shell at `/the-forge-v2` **+ PROJECT-CREATE** (can't use Workspace without creating projects).
- **PR #3** — Brief artefact + Brief-Lock flow (Brief-Lock is an approve flow; partial coverage of APPROVE).
- **PR #4 — Modules + Module-Detail + Part-Detail. Three deliverables (Tristan 2026-04-19):**
  - **(a) UI** per `FORGE-MOCKUP-MODULE-DETAIL.html` + `FORGE-MOCKUP-PART-DETAIL.html` — all 10 sections mandatory: breadcrumb, dual-illustration hero, DESCRIPTION, Why This Matters, Inputs/Outputs, Key Components, Failure Modes, Unknowns, Lead time, Design Grounded In.
  - **(b) Migration — `cad_lab_modules → new-slot` field mapping** (PR #4's own `FORGE-DATA-PRESERVATION.md` must include this):
    - `description` → DESCRIPTION section
    - `rationale` / `mission_relevance` → Why This Module Matters callout
    - `inputs[]` / `outputs[]` → Inputs/Outputs pills
    - `components[]` / `bom_items[]` → KEY COMPONENTS bullets
    - `failure_modes[]` / `risks[]` → FAILURE MODES list
    - `open_questions[]` / `unknowns[]` → UNKNOWNS list
    - `lead_time_weeks` → Lead time badge
    - `materials_referenced[]` / library tags → DESIGN GROUNDED IN pills
  - Pre-PR-#4 audit: count `cad_lab_modules` rows with populated `rationale` / `failure_modes` / `unknowns` etc. in production; migration must preserve 100%.
  - **(c) Specialist regeneration paths per section.** Empty field on a CAD-Lab-linked module → the relevant specialist can populate it on demand. Jian (structure), Fang (DFM), Chase (supply). PR #4 wires specialist server actions per section, not just static fields.
- **PR #5** — BOM + BOM-Add + Part-Detail ties.
- **PR #6** — Suppliers + Supplier-Create + Supplier-Detail.
- **PR #6.5** — Comms & workflows bundle: ASK-SPECIALIST + COMPOSE + REQUEST + SCHEDULE. Referenced from almost every artefact page; natural inflection between "routes exist" and "actions work".
- **PR #7** — Risks + Risk-Create.
- **PR #8** — Cost.
- **PR #8.5** — EXPORT (standalone, can land any time after Cost and before cutover).
- **PR #9** — Experts + Expert-Profile.
- **PR #10** — Geometry + Geometry-Upload + CAD lab drill-in CTA.
- **PR #11** — Launch + Launch-Handoff + Operations + Revisions + Fork + Revision-Merge.
- **PR #11.5** — Onboarding flow (7-step mockup set). Must land before cutover so wide release has day-one onboarding.
- **PR #12** — Cutover: rename `/the-forge-v2` → `/the-forge`, CAD lab stays at `/the-forge/cad-lab`, feature flag removed as dead code.

### Phase 2 gate

Phase 2 (Products) cannot start until Phase 1 is **functionally complete**, not just "15 PRs merged":

1. Users can create projects (PROJECT-CREATE shipped in PR #2).
2. Every mockup action has a wired destination — no dead `href="#"`.
3. Today V3 coordinates Forge signals end-to-end (PR #1.5 visual + PR #6.5 ASK-SPECIALIST wired).
4. Legacy routes migrated or preserved per pre-PR #2 audit.
