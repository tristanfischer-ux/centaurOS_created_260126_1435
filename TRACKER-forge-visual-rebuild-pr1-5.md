# TRACKER — Forge Visual Rebuild (PR #1.5)

**Branch:** `feat/forge-visual-rebuild` (from main @ 000be5b3 after PR #1 merged)
**Started:** 2026-04-19
**Phase:** 1 — Forge redesign
**Predecessor:** PR #1 (shared primitives, merged 000be5b3)
**Grounding docs:** [SHARED-SIDEBAR.html](./SHARED-SIDEBAR.html) · [FORGE-MOCKUP-TODAY-V3.html](./FORGE-MOCKUP-TODAY-V3.html) · [forge-mockup.css](./forge-mockup.css)

---

## Scope — visual rebuild bundle

Per Tristan's 2026-04-19 decision, this PR bundles the two most-used visible surfaces so reviewers see the new visual design-system holistically in one preview cycle:

1. **Sidebar chrome rebuild** — replace the 605-line `src/components/Sidebar.tsx` with a new component at `src/components/sidebar/Sidebar.tsx` that uses SHARED-SIDEBAR.html's bespoke `sb-*` class system, gradient/shadow treatments, and the 5 variant states (default, forge-active, plan-active, money-active, marketplace-active). Rewire all 20+ integrations (FoundrySwitcher, GettingStartedChecklist, AICreditsBar, TimeWeekBar, FocusModeToggle, ZoomControl, FeedbackDialog, QuickCaptureDialog, UnreadIndicator, route prefetch, unread polling, alpha/beta/demo/coming-soon badges) into the new chrome. Delete `src/components/Sidebar.tsx` + `src/hooks/useSidebarCollapse.ts` when superseded.

2. **Today V3 visual rebuild** — refactor `src/app/(platform)/today/today-view.tsx` (1636 lines) to match `FORGE-MOCKUP-TODAY-V3.html`. Port ALL existing signals into V3 panel slots per the reskin-plus-frame rule:
   - `briefing.nudges` → Waiting-on-you inbox
   - `briefing.topTasks` / `pulseData.blockers` → Today queue
   - `strategyHealth` → Plan panel signals
   - Cal narrative → Priority slab (when hottest signal)
   - `pulseData` stats → 3-tile mini-grid
   - Runway card (Money panel) — still a "Connect Cash Burn" stub; Phase 2/4 wires it
   - Forge panel — mount `useTodayForgeFeed` hook (from PR #1). Panel populates live as Forge events land (empty until PR #2+ writes them)
   - Products panel — "Coming in Phase 4" placeholder (phase order revised 2026-04-19)

---

## Checklist

### A · Branch + docs
- [x] A.1 Branch `feat/forge-visual-rebuild` from main @ 000be5b3
- [x] A.2 This tracker written
- [x] A.3 `FORGE-DATA-PRESERVATION-PR1-5.md` — answers PHASE-PLAN §8 (zero data risk, chrome + render-path only, standard revert on rollback)

### B · Sidebar chrome rebuild
- [x] B.1 Mapped: `SIDEBAR-CLASS-INVENTORY.md` (479 lines) landed in preceding commit. DOM tree + 5-variant diff + footer data contracts documented.
- [x] B.2 Decision: **Tailwind utility classes mapped to production semantic tokens** (bg-background, text-international-orange, text-muted-foreground, bg-international-orange/10). No parallel `--brand/--surface` var layer, no new CSS file — keeps scripts/check-design-tokens.sh clean and avoids cascade conflicts.
- [x] B.3 Built `src/components/sidebar/Sidebar.tsx` (423 lines, 61 fewer than old). Single file, client component (`"use client"`). `NavLink` + `BadgePill` sub-components extracted.
- [~] B.4 Client sub-components: REUSED existing `FoundrySwitcher`, `SectionHeader`, `GettingStartedChecklist`, `AICreditsBarLoader`, `TimeWeekBarLoader`, `FocusModeToggle`, `FeedbackDialog`, `QuickCaptureDialog`, `UnreadIndicator` as-is. `SidebarFoundrySwitcher`/`SidebarActiveTracker`/etc. from the original spec were unnecessary — existing integrations are already well-factored.
- [x] B.5 `src/app/(platform)/layout.tsx` import swapped: `@/components/Sidebar` → `@/components/sidebar/Sidebar`.
- [x] B.6 Old `src/components/Sidebar.tsx` deleted. `src/hooks/useSidebarCollapse.ts` KEPT — still used by the new sidebar for localStorage-persisted collapse state. Handover's "delete it" note overruled — the hook is reusable logic, no churn value in rewriting.
- [x] B.7 Grep confirmed: no other importers of `@/components/Sidebar`.
- [x] B.8 5-variant render check: preview `qel77mko2` Ready (4m build), logged in as claude-test, verified /today (Me > Today active + ME expanded + all 6 Me items + Getting Started 0/6 + THIS WEEK 0h/40h + Explorer 35/50) and /the-forge (Workshop auto-expanded, The Forge BETA badge, brand-soft active bg). Accessibility tree confirms `complementary "Primary navigation"` (aria-label), `link aria-current="page"` on active items, `button "Collapse/Expand <section> section"` semantics. Screenshots: `/tmp/sidebar-today.png`, `/tmp/sidebar-forge.png`.

### C · Today V3 visual rebuild
- [x] C.1 Deep-read `FORGE-MOCKUP-TODAY-V3.html` — full 945-line read. V0→V11 sections mapped to V1–V10 render targets (V0/V11 annotations not built).
- [x] C.2 Deep-read current `today-view.tsx` — 30 surfaces inventoried (C0…C20 + 5 cross-cutting) in the porting map.
- [x] C.3 `TODAY-V3-SIGNAL-PORTING-MAP.md` committed in 8430e8f6. 33-row decision table is the spec.
- [x] C.4 Rewrote `today-view.tsx` in fa38befa — V3 frame with GreetingHeader + HeadlineGrid + Minigrid + WaitingOnYouCard + QueueCard + CalendarPeekStub + HorizonStub + SignalsStrip + AppSignalsFooter. All MUST-preserve imports kept (FractionalExecPromoCard, GettingStartedHero, SandboxWelcomeBanner, CreateCompanyDialog, PageTour, StreakBadge, AskSpecialistButton, SpecialistInsightCard, WeeklyBrief, InsightFeed, ReferralNudgeBanner, TodayTimeCard, useCalBriefing, useAdvisorPanel, useCelebration, useRegisterScreenContext).
- [x] C.5 `useTodayForgeFeed({ foundryId })` mounted. `foundryId` resolved server-side in page.tsx via `getFoundryIdCached()` and passed as prop. Feed populates V3a priority candidate, V4 Forge-cost tile, V6a queue rows, V9 Forge signal card.
- [x] C.6 Products panel — "Coming in Phase 4" placeholder in V9 ProductsSignalCard.
- [x] C.7 Money panel — V3b Runway stub + V4 Money pipeline tile + V9 Money signal card all render "Connect Cash/Burn" / "Coming in Phase 2 · Money" stubs.
- [x] C.8 Plan panel — strategyHealth powers V9 Plan signal card + StrategySpotlightSection preserved below V9 (pillar list + progress bars). `pulseData.personal.tasks_*` feeds V4 Plan tile + V2 chips + V10 Review pill.
- [x] C.9 Priority slab — source-agnostic. `pickPrioritySlab()` returns highest-urgency row from merged queue; falls back to top Waiting-on-you row; falls back to "all caught up" empty state.
- [x] C.10 Waiting-on-you inbox — pending_approvals + blockers with source-tags (plan). Send-standup nudge links to /updates.

### D · Verification
- [x] D.1 `./scripts/check-design-tokens.sh src/app/(platform)/today/` — PASSED, zero violations. Source-tag palette uses semantic tokens (international-orange/electric-blue/status-*/muted) + permitted palette classes (sky/lime/purple/teal for section distinctions not in forbidden list).
- [x] D.2 `tsc --noEmit` — exactly 8 errors, all pre-existing in tasks.test.ts / BatchApprovalSheet.tsx / InlineBatchApproval.tsx. 0 new from today-view.tsx or page.tsx.
- [x] D.3 `next build` — succeeded end-to-end. `/today` compiled as dynamic (ƒ) route as expected.
- [x] D.4 `agent-browser` walkthrough on preview `cckwriumj` — logged in as claude-test, snapshot confirms every V3 section renders (V1 h1 "Morning, Claude", V2 chip row, V3a priority slab with META source tag, V3b Runway stub "— months / Connect Cash/Burn", V4 minigrid 3 tiles, V6a queue with 6 filter buttons + 2 view-toggle buttons, V6b calendar peek, V7 horizon stub, V9 4-section strip, team brief collapsed-by-default, V10 app signals pills). Screenshots saved /tmp/today-v3-desktop.png + /tmp/today-v3-mobile.png.
- [~] D.5 `/today` verified clean on preview. 4 other sidebar variants (forge, plan, money, marketplace) covered by Chunk B's preview-verification on qel77mko2 — no regressions expected since Chunk C only touched `today-view.tsx` + `today/page.tsx`.
- [~] D.6 Fresh-signup empty-state — test account is effectively a fresh-signup case (0 topTasks, 0 atRiskObjectives, 0 strategyHealth). V3 renders cleanly: queue shows the 1 welcome nudge, waiting-on-you gate suppresses the whole card (items.length===0), minigrid/signals-strip show appropriate "0/0 on-track" / "Coming in Phase 2" placeholders, all-clear confetti fires correctly. No crash, no layout break.
- [x] D.7 No regression on existing signals — a11y tree confirms aria-live="polite" on Cal narrative wrapper, aria-current="page" on Today sidebar link, data-tour attrs (today-briefing, today-focus, today-insights) all attached to stable containers, 8 aria-pressed queue buttons, h1 "Morning, Claude". All 27 MUST-preserve items from TODAY-V3-SIGNAL-PORTING-MAP.md §8 grep-verified in today-view.tsx.

### E · Deploy
- [ ] E.1 Commit per chunk (sidebar shell → sidebar subcomponents → sidebar swap → today map → today rebuild).
- [ ] E.2 Push + verify Vercel preview Ready.
- [ ] E.3 Open PR referencing this tracker + the signal-porting map + before/after screenshots.
- [ ] E.4 Tristan approves on preview.
- [ ] E.5 Merge to main. Production deploys cleanly.

---

## Abort criteria

Stop and re-plan if:
1. A signal visible on current `/today` disappears in V3 render without explicit descope approval.
2. Sidebar swap breaks ANY platform route's rendering (not just Forge).
3. `sb-*` class system can't be cleanly integrated with the existing Tailwind + shadcn UI primitives. Fallback: apply sb-* as overrides on top of current styling instead of a full chrome replacement.
4. `forge-mockup.css` conflicts with existing global styles — CSS cascade issues.

---

## Deploy log

| Timestamp | Commit SHA | Vercel status | Notes |
|---|---|---|---|
| 2026-04-19 (PR #1.5 tracker) | 74dc5c0a | n/a (docs only) | Tracker written. |
| 2026-04-19 (research) | 8430e8f6 | n/a (docs only) | Research docs + handover. |
| 2026-04-19 (Chunk B) | 07cbfa56 | Ready (preview qel77mko2, 4m build) | Sidebar chrome rebuild. `tsc --noEmit`: 8 pre-existing, 0 new. Design-token check: 0 new violations in new sidebar. agent-browser /today + /the-forge verified — a11y tree clean, visual clean, Workshop auto-expand on /the-forge confirmed. |
| 2026-04-19 (Chunk C) | fa38befa | building (pending Vercel) | Today V3 visual rebuild. today-view.tsx: 1636 → 1887 lines (heavy structural decomposition into ~20 V3 subcomponents). page.tsx: +5 lines passing `foundryId` from `getFoundryIdCached()`. `tsc --noEmit` 8/0, design-tokens PASS on today/, `next build` green. Applied 5 DROP-WITH-APPROVAL defaults (Tristan confirmed 2026-04-19) + 7 open-question defaults. |

---

## PR #2..N downstream (unchanged from revised plan)

Same sequence as captured in [TRACKER-forge-redesign-phase1.md](./TRACKER-forge-redesign-phase1.md). This tracker is scoped to PR #1.5 only.
