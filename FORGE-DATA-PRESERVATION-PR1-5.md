# FORGE-DATA-PRESERVATION — PR #1.5 (Sidebar chrome + Today V3 visual rebuild)

**PR branch:** `feat/forge-visual-rebuild`
**Date:** 2026-04-19
**Predecessor:** PR #1 (`000be5b3` on main) — shared primitives
**Successor:** PR #2 (Workspace + PROJECT-CREATE at `/the-forge-v2`)

Answers PHASE-PLAN §8 five data-preservation questions for this PR.

---

## 1. What data does this PR create, modify, or delete?

**Nothing.** PR #1.5 is pure chrome + render-path work.

- **No migrations.** PR #1's 7 migrations already landed on main. PR #1.5 adds zero new ones.
- **No table writes.** The new sidebar chrome reads the same props `(platform)/layout.tsx` already provides; the Today V3 rebuild reads the same `briefing`, `pulseData`, `strategyHealth`, `calInsights`, `useTodayForgeFeed.signals` streams as today.
- **No schema changes.** Every rendered field maps 1:1 to an existing column / action return type.
- **No deletions.** Deleting `src/components/Sidebar.tsx` and `src/hooks/useSidebarCollapse.ts` is code cleanup, not data.

## 2. Is any existing user data at risk of being lost, mis-rendered, or hidden?

**No data loss; strict render-path preservation.**

The risk surface is *visible-signals-disappearing* on `/today`, not data loss. That surface is covered by `TODAY-V3-SIGNAL-PORTING-MAP.md` §8 (the 27-item MUST-preserve checklist). Every row in that checklist must render in V3 before merge. Items flagged DROP-WITH-APPROVAL (§7, 5 items) require explicit Tristan green-light; default is preserve.

Sidebar risk surface: the 5 variant states must all render correctly for flag-off users (current experience). The flag-on Forge path (`/the-forge-v2`) 404s today — that's expected until PR #2; the sidebar still renders, it just links to a page that doesn't exist yet.

## 3. What's the rollback procedure if PR #1.5 ships a bug in production?

**Standard revert.** No data migration to unwind.

1. `git revert <merge-commit>` on main. Vercel auto-deploys. All signals reappear via the pre-PR-#1.5 render path.
2. Feature flag `new_forge_experience` is unaffected — it's OFF for all users, so flag-on bugs can only hit users who have it manually flipped on (Tristan + claude-test, both currently off).
3. Old `src/components/Sidebar.tsx` and `src/hooks/useSidebarCollapse.ts` live in git history; revert restores them as files. No dangling imports because `(platform)/layout.tsx` is part of the same revert.

## 4. What's the data-dependency contract between this PR and PR #1 / PR #2?

**Upstream (PR #1):**
- `profiles.feature_flags` JSONB column — consumed by `(platform)/layout.tsx` via `getFeatureFlag()`, passed to Sidebar as `newForgeExperienceEnabled` prop. Unchanged.
- `event_log` table — consumed by `/api/today-feed` + `useTodayForgeFeed` hook, which PR #1.5 mounts into Today V3 for the first time. Empty until PR #2+ writes events.
- `TodaySignal` type + sort comparator (`src/types/today.ts`) — consumed by Today V3 queue card (V6a). Contract stays stable.
- `getWorkshopNavigation(flag)` — consumed by new Sidebar's Workshop section; flag-aware Forge href unchanged.

**Downstream (PR #2):**
- New `/the-forge-v2/**` routes render inside the same platform layout. The new sidebar must link to `/the-forge-v2` when the flag is on — already wired via `getWorkshopNavigation`. No sidebar change needed at PR #2 merge.
- PR #2 writes `event_log` rows for Forge events. Today V3 queue card picks them up automatically via the mounted `useTodayForgeFeed` hook (no Today-view change needed).
- The new sidebar's Supplier Portal conditional wrap renders based on `profile.is_supplier` (same prop the old sidebar reads). PR #2 does not touch this.

## 5. Any user-visible behaviour change users should be warned about?

**For flag-OFF users (everyone in production post-merge):**
- **Sidebar visual** — complete re-skin to `sb-*` design system. Same sections, same nav items, same routes. Reorganised footer (Getting Started card is now pinned above the util row, followed by Time + Credits bars + tier strip). No route breaks.
- **Today page** — V3 frame: greeting chip row at top, priority slab + runway stub in a 2-col hero, 3-tile minigrid, "Waiting on you" inbox, ranked queue, calendar peek stub, 14-day horizon stub, section-at-a-glance strip, app-signals pill row. Every signal that currently renders still renders (per porting map). Layout is denser, more triage-oriented.
- **Sandbox + error branches** preserved verbatim.
- **Onboarding** — `GettingStartedHero` + `SandboxWelcomeBanner` + `PageTour` still mount in the same gate conditions.

**For flag-ON users (Tristan + claude-test only, currently off):**
- Sidebar Workshop > The Forge links to `/the-forge-v2` which 404s until PR #2. Expected.
- Today page behaves identically to flag-off users in PR #1.5. The flag does not gate the V3 rebuild — V3 is the only Today view after this PR.

**No warning needed.** Change is strictly additive on the render path (chrome rebuild + frame rebuild). No user data is rewritten, no settings change, no URL breaks.

---

## Abort criteria (if any of these trip during build, stop and re-plan)

1. Any current `/today` signal disappears in V3 render without explicit DROP-WITH-APPROVAL.
2. Sidebar swap breaks rendering on any platform route (not just Forge).
3. Design-token check fails — new hardcoded colours introduced.
4. `tsc --noEmit` regresses past 8 pre-existing errors.
5. Supabase schema-drift indicator fires (it shouldn't — no migrations — but belt-and-braces).

---

*Data-preservation scoring: ZERO risk. Chrome + render-path only. Ship.*
