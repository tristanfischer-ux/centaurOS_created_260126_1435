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
- [ ] A.3 `FORGE-DATA-PRESERVATION-PR1-5.md` — answers PHASE-PLAN §8 for this PR (no data touched, only chrome + render path changes)

### B · Sidebar chrome rebuild
- [ ] B.1 Map SHARED-SIDEBAR.html structure: grep every `sb-*` class + section + variant. Produce internal `SIDEBAR-CLASS-INVENTORY.md` if needed.
- [ ] B.2 Port `forge-mockup.css` (or the sidebar-relevant subset) into a Tailwind-compatible form. Decision: inline via a new component CSS file OR extend `@theme` layer.
- [ ] B.3 Build new `src/components/sidebar/Sidebar.tsx` (server component shell) — consumes section data from existing `src/components/sidebar/data/*.ts` (from PR #1).
- [ ] B.4 Build client sub-components for interactive bits: `SidebarFoundrySwitcher`, `SidebarCollapse`, `SidebarActiveTracker`, `SidebarGettingStartedCard`, `SidebarAICreditsBar`, `SidebarTimeWeekBar`, `SidebarFocusMode`, `SidebarFeedbackTrigger`, `SidebarQuickCaptureTrigger`, `SidebarUnreadAlertPolling`.
- [ ] B.5 Update `src/app/(platform)/layout.tsx` to import the new Sidebar component.
- [ ] B.6 Delete old `src/components/Sidebar.tsx` + `src/hooks/useSidebarCollapse.ts`.
- [ ] B.7 Verify no other imports of the old component (grep).
- [ ] B.8 5-variant render check via `agent-browser` on different active-section pages.

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
| (to fill on each push) | | | |

---

## PR #2..N downstream (unchanged from revised plan)

Same sequence as captured in [TRACKER-forge-redesign-phase1.md](./TRACKER-forge-redesign-phase1.md). This tracker is scoped to PR #1.5 only.
