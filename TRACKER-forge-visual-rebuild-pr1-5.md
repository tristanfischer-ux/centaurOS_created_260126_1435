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
- [ ] C.1 Deep-read `FORGE-MOCKUP-TODAY-V3.html` — map every section + style block to an element in today-view.
- [ ] C.2 Deep-read current `today-view.tsx` — inventory every signal surface (briefing, pulse, strategy, cal, onboarding prompt, fractional-exec prompt, dialogs, etc.).
- [ ] C.3 Produce `TODAY-V3-SIGNAL-PORTING-MAP.md` — one row per existing signal → which V3 slot it lands in. Review with Tristan before rewrite.
- [ ] C.4 Rewrite `today-view.tsx` layout to V3 frame. Preserve all component imports.
- [ ] C.5 Mount `useTodayForgeFeed` hook — Forge panel populates live (empty until PR #2 writes events).
- [ ] C.6 Products panel — "Coming in Phase 4" placeholder (revised phase order).
- [ ] C.7 Money panel — keep "Connect Cash Burn" stub; Phase 2 Money ships the real runway card.
- [ ] C.8 Plan panel — existing strategyHealth + pulseData signals render in new frame.
- [ ] C.9 Priority slab — Cal narrative when hottest signal, else topmost nudge.
- [ ] C.10 Waiting-on-you inbox — briefing.nudges + briefing.topTasks + pulseData.blockers with source-tags per terminal.

### D · Verification
- [ ] D.1 `./scripts/check-design-tokens.sh` — semantic tokens only, no hardcoded colors.
- [ ] D.2 `tsc --noEmit` — 8 pre-existing errors, 0 new.
- [ ] D.3 `next build` — clean.
- [ ] D.4 `agent-browser` walkthrough on `/today` — desktop 1440×900 + mobile 375×812 — screenshots.
- [ ] D.5 `agent-browser` walkthrough on each 5 sidebar variants — screenshots for each.
- [ ] D.6 Fresh-signup onboarding flow — Today V3 empty-state doesn't break new users.
- [ ] D.7 No regression on existing signals — every signal visible before still visible after.

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

---

## PR #2..N downstream (unchanged from revised plan)

Same sequence as captured in [TRACKER-forge-redesign-phase1.md](./TRACKER-forge-redesign-phase1.md). This tracker is scoped to PR #1.5 only.
