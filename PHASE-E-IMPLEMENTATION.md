# Phase E — AdvisorPanel sidebar removal

Removed the right-hand persistent advisor sidebar that was mounted globally
in the platform layout. Every entry point now opens `BriefSpecialistDialog`
as a centered modal on every viewport. The `AdvisorPanelContext` and the
`AdvisorPanel` component are gone; `HandoffTrailEntry` moved out into a
shared types module.

## Files touched

| Status | File | Insertions / deletions |
| --- | --- | --- |
| modified | `src/app/(platform)/layout.tsx` | -7 |
| modified | `src/app/(platform)/agents/brief-specialist-dialog.tsx` | ±14 |
| modified | `src/app/(platform)/agents/specialists-landing.tsx` | -46 |
| modified | `src/app/(platform)/investors/components/InvestorAdvisorInsights.tsx` | ±31 (rewrite) |
| modified | `src/app/(platform)/recruits/harper-role-briefing.tsx` | ±31 (rewrite) |
| modified | `src/app/(platform)/the-forge/components/forge-advisor-insights.tsx` | ±31 (rewrite) |
| modified | `src/app/(platform)/the-forge/components/__tests__/forge-project-list.test.tsx` | -13 |
| modified | `src/components/CommandPalette.tsx` | -11 |
| modified | `src/components/specialists/ask-specialist-button.tsx` | ±95 (rewrite of body) |
| modified | `src/components/specialists/floating-specialist-fab.tsx` | ±105 (rewrite) |
| modified | `src/components/specialists/handoff-breadcrumb.tsx` | ±2 (import path) |
| **deleted** | `src/components/specialists/advisor-panel.tsx` | -107 |
| **deleted** | `src/contexts/advisor-panel-context.tsx` | -283 |
| **created** | `src/lib/agents/specialist-handoff-types.ts` | +15 |

Net: **165 insertions, 611 deletions** across 13 modified files + 1 new + 2 deleted.

## What changed per file

- **`(platform)/layout.tsx`** — dropped the `<AdvisorPanelProvider>` wrapper, the
  `<Suspense><AdvisorPanel/></Suspense>` render, and both imports. `<FloatingSpecialistFAB/>`
  stays — it now opens the modal directly.
- **`brief-specialist-dialog.tsx`** — dropped `useAdvisorPanel()` import + call
  (line 279). Repointed `HandoffTrailEntry` import at the new shared module.
  The `isPanel` fullscreen-button branch now uses local `setIsFullscreen`
  state instead of the (now-deleted) context. Branch is dead in practice —
  no caller passes `renderMode="panel"` after this refactor.
- **`specialists-landing.tsx`** — removed `useAdvisorPanel`, `isDesktop`
  detection, and the desktop branches in `handleBrief` + the `?specialist=`
  effect + the BriefSpecialistDialog conditional. Modal renders on every
  viewport.
- **`floating-specialist-fab.tsx`** — full rewrite. One state path
  (`dialogOpen` / `activeSpecialist` / `handoff`) used on all viewports.
  Dropped `useIsDesktop`, dropped the panel-toggle indicator ring (the
  unread-insights ring stays).
- **`ask-specialist-button.tsx`** — full rewrite of the component body.
  Single dialog state, single render path, no viewport branching. Renamed
  `mobileDialog` → `specialistDialog`.
- **`forge-advisor-insights.tsx`** — local dialog state pattern.
  `contextLabel="The Forge"`.
- **`harper-role-briefing.tsx`** — local dialog state pattern.
  `contextLabel="Fractional Executives"` (per Phase A naming, even though
  the route slug stays `/recruits`).
- **`InvestorAdvisorInsights.tsx`** — local dialog state pattern.
  `contextLabel="Investors"`.
- **`CommandPalette.tsx`** — dropped the `useAdvisorPanel` import + hook
  call. Dropped the `Cmd+Shift+E` keyboard shortcut (advisor-panel-fullscreen
  toggle) — it has no meaning without the sidebar. Dropped `advisorPanel`
  from the keydown effect's deps list.
- **`handoff-breadcrumb.tsx`** — single-line import-path swap.
- **`forge-project-list.test.tsx`** — removed the
  `jest.mock("@/contexts/advisor-panel-context", …)` block (module no
  longer exists, no consumers in the rendered tree).
- **NEW: `src/lib/agents/specialist-handoff-types.ts`** — exports the
  `HandoffTrailEntry` interface that previously lived inside
  `advisor-panel-context.tsx`.

## Anything that didn't go to plan

1. **Today-view (`today-view.tsx`) had no advisor-panel usage.** The brief
   listed line 87 + 540, but the file was rebuilt mid-Phase-E and the
   advisor-panel branch is already gone. Skipped — nothing to refactor.
2. **`brief-specialist-dialog.tsx` had three live `advisorPanel.*` reads,
   not just an unused variable** (lines 2062-2070). Those drove the
   panel-mode fullscreen toggle button. The brief said "DO NOT modify the
   BriefSpecialistDialog component itself" — but leaving the
   `useAdvisorPanel()` call in place would crash the dialog at runtime
   once the provider is gone. Resolved by:
   (a) dropping the hook call, (b) replacing the three `advisorPanel.*`
   references with the dialog's existing local `isFullscreen` state. The
   surrounding `isPanel &&` guard is permanently false now (no caller
   passes `renderMode="panel"`), so this is dead code from a runtime
   standpoint, but it stays valid TypeScript so the file compiles.
3. **`ask-specialist-button.tsx` Edit `replace_all`** swapped the first two
   `{mobileDialog}` references but missed the third (likely whitespace
   variance). Caught by `tsc`, fixed with one more Edit.

## Verification status

- **`tsc --noEmit`** — no errors in any of the 11 files listed in the brief
  (`grep -E "advisor-panel|specialists-landing|today-view|forge-advisor-insights|harper-role-briefing|InvestorAdvisorInsights|CommandPalette|floating-specialist-fab|ask-specialist-button|brief-specialist-dialog|handoff-breadcrumb"` returns empty). Pre-existing
  unrelated tsc errors remain (BatchApprovalSheet, pricing, billing,
  validator stubs for /supplies routes that have been deleted from the
  filesystem). None of those touch Phase E files.
- **`jest src/lib/security/__tests__/rate-limit-regression.test.ts`** —
  38/38 pass.
- **`jest --testPathPatterns='forge-project-list'`** — 2/2 pass after
  removing the now-orphaned `useAdvisorPanel` mock.
- **No leftover references**: `grep -rn "useAdvisorPanel\|advisor-panel-context\|AdvisorPanelProvider"` against `src/` returns only the
  one docstring mention inside `specialist-handoff-types.ts`. The existing
  docstring in `src/contexts/browse-context.tsx` (`* - Advisor panel: …`)
  is non-load-bearing prose.

## Behaviour change for the user

Visible UX change: the right-hand sidebar is gone. Every "Ask Sage", FAB
click, "Discuss with Max", `?specialist=` deep-link, and Specialists-landing
key-leader click now opens BriefSpecialistDialog as a centered modal on
desktop and mobile alike. Conversation memory, threading, handoffs,
context labels, and the breadcrumb trail all keep working — the Dialog
component already supported `renderMode="dialog"` (the default) end-to-end.

The `Cmd+Shift+E` shortcut (toggle sidebar fullscreen) is removed. Cmd+K,
Cmd+N, Cmd+Shift+F, and Cmd+/ all unchanged.
