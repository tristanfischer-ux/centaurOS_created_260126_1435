# Page Rollout Tracker — mockup-faithful build of all Forge/Money/Plan pages

**Goal.** Ship every `*-MOCKUP-*.html` page at mockup parity. Per Tristan 2026-04-20:
> "Every single time you do a batch and deploy it, continue going, but once it has been deployed, check and send me the PNG files so I can actually look at them visually as well... And one key thing, which is critical, is to confirm that the information which is showing in all these boxes is actually true and it's not just complete junk."

**Rules per page.**
1. Port the mockup HTML DOM 1:1 (scoped CSS + 2-letter prefix + CSS vars in wrapper).
2. Wire real data or show an empty state at the same visual footprint. Never fake numbers, never placeholder copy where the mockup shows finished copy.
3. Deploy. Screenshot mockup + production at 1440×900 full-page. PNG delivered to Tristan.
4. Move to the next page only after the PNG is sent.

**Legend.**
- 🟢 done — visual + data truth both landed
- 🟡 visual — visual parity landed, data still stubbed (empty-state policy not yet applied)
- ⚪ queued
- 🔴 blocked — flagged issue to resolve

---

## Batch 1 — already deployed (need data-truth follow-ups)

| # | Mockup | Route | Status | Notes |
|---|---|---|---|---|
| 1 | FORGE-MOCKUP-TODAY-V2.html | /today | 🟡 visual | Wire: briefing, runway, waiting-on-you, pulse queue, calendar, projects, team |
| 2 | FORGE-MOCKUP-WORKSPACE.html | /the-forge-v2/projects/[id] | 🟡 visual | Phase tabs killed + blueprint placeholder improved. Wire: resume-state, health strip, artefact states, eng-intelligence reads from real libs, activity feed |
| 3 | FORGE-MOCKUP-BRIEF.html | /the-forge-v2/projects/[id]/brief | 🟡 visual | Wire: project.research.designBrief, cost vs ceiling, mass budget, revision history (needs brief_revisions migration) |

## Batch 2 — Forge artefact drill-ins (off the Workspace page)

| # | Mockup | Route | Status |
|---|---|---|---|
| 4 | FORGE-MOCKUP-MODULES.html | /the-forge-v2/projects/[id]/modules | ⚪ |
| 5 | FORGE-MOCKUP-MODULE-DETAIL.html | /the-forge-v2/projects/[id]/modules/[moduleId] | ⚪ |
| 6 | FORGE-MOCKUP-BOM.html | /the-forge-v2/projects/[id]/bom | ⚪ |
| 7 | FORGE-MOCKUP-PART-DETAIL.html | /the-forge-v2/projects/[id]/modules/[moduleId]/parts/[partId] | ⚪ |
| 8 | FORGE-MOCKUP-SUPPLIERS.html | /the-forge-v2/projects/[id]/suppliers | ⚪ |
| 9 | FORGE-MOCKUP-SUPPLIER-DETAIL.html | /the-forge-v2/projects/[id]/suppliers/[supplierId] | ⚪ |
| 10 | FORGE-MOCKUP-COST.html | /the-forge-v2/projects/[id]/cost | ⚪ |
| 11 | FORGE-MOCKUP-RISKS.html | /the-forge-v2/projects/[id]/risks | ⚪ |
| 12 | FORGE-MOCKUP-GEOMETRY.html | /the-forge-v2/projects/[id]/geometry | ⚪ |
| 13 | FORGE-MOCKUP-OPERATIONS.html | /the-forge-v2/projects/[id]/operations | ⚪ |
| 14 | FORGE-MOCKUP-REVISIONS.html | /the-forge-v2/projects/[id]/revisions | ⚪ |

## Batch 3 — Forge action pages (all exist scaffolded)

| # | Mockup | Route | Status |
|---|---|---|---|
| 15 | FORGE-MOCKUP-APPROVE.html | /the-forge-v2/projects/[id]/approve | ⚪ |
| 16 | FORGE-MOCKUP-ASK-SPECIALIST.html | /the-forge-v2/projects/[id]/ask | ⚪ |
| 17 | FORGE-MOCKUP-BRIEF-LOCK.html | /the-forge-v2/projects/[id]/brief-lock | ⚪ |
| 18 | FORGE-MOCKUP-COMPOSE.html | /the-forge-v2/projects/[id]/compose | ⚪ |
| 19 | FORGE-MOCKUP-EXPORT.html | /the-forge-v2/projects/[id]/export | ⚪ |
| 20 | FORGE-MOCKUP-FORK.html | /the-forge-v2/projects/[id]/fork | ⚪ |
| 21 | FORGE-MOCKUP-PROMOTE.html | /the-forge-v2/projects/[id]/promote | ⚪ |
| 22 | FORGE-MOCKUP-REQUEST.html | /the-forge-v2/projects/[id]/request | ⚪ |
| 23 | FORGE-MOCKUP-SCHEDULE.html | /the-forge-v2/projects/[id]/schedule | ⚪ |
| 24 | FORGE-MOCKUP-LAUNCH.html | /the-forge-v2/projects/[id]/launch | ⚪ |
| 25 | FORGE-MOCKUP-ASSUMPTION-TEST.html | /the-forge-v2/projects/[id]/assumption-test | ⚪ |
| 26 | FORGE-MOCKUP-ARCHIVE-PRODUCT.html | /the-forge-v2/projects/[id]/archive | ⚪ |

## Batch 4 — Forge specialists + extras

| # | Mockup | Route | Status |
|---|---|---|---|
| 27 | FORGE-MOCKUP-EXPERTS.html | /the-forge-v2/experts | ⚪ |
| 28 | FORGE-MOCKUP-EXPERT-PROFILE.html | /the-forge-v2/experts/[id] | ⚪ |
| 29 | FORGE-MOCKUP-PROJECT-CREATE.html | /the-forge-v2/new | ⚪ |
| 30 | FORGE-MOCKUP-PRODUCTS-V2.html | /the-forge-v2 (or /products) | ⚪ |
| 31 | FORGE-MOCKUP-PRODUCTS-LIST.html | /the-forge-v2/products | ⚪ |

## Batch 5 — Forge onboarding

| # | Mockup | Route | Status |
|---|---|---|---|
| 32 | FORGE-MOCKUP-ONBOARD-WELCOME.html | /onboarding | ⚪ |
| 33 | FORGE-MOCKUP-ONBOARD-FOUNDRY.html | /onboarding/foundry | ⚪ |
| 34 | FORGE-MOCKUP-ONBOARD-PREFERENCES.html | /onboarding/preferences | ⚪ |
| 35 | FORGE-MOCKUP-ONBOARD-TEAM.html | /onboarding/team | ⚪ |
| 36 | FORGE-MOCKUP-ONBOARD-PRODUCT.html | /onboarding/product | ⚪ |
| 37 | FORGE-MOCKUP-ONBOARD-INTEGRATIONS.html | /onboarding/integrations | ⚪ |
| 38 | FORGE-MOCKUP-ONBOARD-COCKPIT-TOUR.html | /onboarding/tour | ⚪ |

## Batch 6 — Money cockpit + pipeline

| # | Mockup | Route | Status |
|---|---|---|---|
| 39 | MONEY-MOCKUP-COCKPIT.html | /money (or /cockpit) | ⚪ |
| 40 | MONEY-MOCKUP-PNL.html | /money/pnl | ⚪ |
| 41 | MONEY-MOCKUP-PLAN.html | /money/plan | ⚪ |
| 42 | MONEY-MOCKUP-VARIANCE.html | /money/variance | ⚪ |
| 43 | MONEY-MOCKUP-RAISE.html | /money/raise | ⚪ |
| 44 | MONEY-MOCKUP-PORTFOLIO.html | /money/portfolio | ⚪ |
| 45 | MONEY-MOCKUP-INVESTOR-DETAIL.html | /money/investors/[id] | ⚪ |
| 46 | MONEY-MOCKUP-BOARDPACK.html | /money/board | ⚪ |
| 47 | MONEY-MOCKUP-SCENARIO-DETAIL.html | /money/scenarios/[id] | ⚪ |
| 48 | MONEY-MOCKUP-NEW-SCENARIO.html | /money/scenarios/new | ⚪ |

## Batch 7 — Money integrations + editors + onboarding

| # | Mockup | Route | Status |
|---|---|---|---|
| 49 | MONEY-MOCKUP-CONNECT-XERO.html | /money/connect/xero | ⚪ |
| 50 | MONEY-MOCKUP-GMAIL-IMPORT.html | /money/import/gmail | ⚪ |
| 51 | MONEY-MOCKUP-CSV-IMPORT.html | /money/import/csv | ⚪ |
| 52 | MONEY-MOCKUP-LINE-ITEM-EDITOR.html | /money/line-items/[id] | ⚪ |
| 53 | MONEY-MOCKUP-LOG-EXPENSE.html | /money/log/expense | ⚪ |
| 54 | MONEY-MOCKUP-LOG-TOUCH.html | /money/log/touch | ⚪ |
| 55 | MONEY-MOCKUP-SEND-INVOICE.html | /money/invoice/send | ⚪ |
| 56 | MONEY-MOCKUP-UPDATE-SEND.html | /money/update/send | ⚪ |
| 57 | MONEY-MOCKUP-PITCH-SECTION.html | /money/pitch/[section] | ⚪ |
| 58 | MONEY-MOCKUP-SLIDE-EDITOR.html | /money/pitch/slide/[id] | ⚪ |
| 59 | MONEY-MOCKUP-THESIS-BUILDER.html | /money/thesis | ⚪ |
| 60 | MONEY-MOCKUP-CREATE-ROUND.html | /money/round/new | ⚪ |
| 61 | MONEY-MOCKUP-DRY-RUN.html | /money/raise/dry-run | ⚪ |
| 62 | MONEY-MOCKUP-PASS-INVESTOR.html | /money/investors/[id]/pass | ⚪ |
| 63 | MONEY-MOCKUP-PIPELINE-MOVE.html | /money/pipeline/move | ⚪ |
| 64 | MONEY-MOCKUP-PERMISSIONS.html | /money/settings/permissions | ⚪ |
| 65 | MONEY-MOCKUP-SETTINGS.html | /money/settings | ⚪ |
| 66 | MONEY-MOCKUP-TRANSACTION-DRILL.html | /money/transactions/[id] | ⚪ |
| 67 | MONEY-MOCKUP-COST-DETAIL.html | /money/cost/[id] | ⚪ |
| 68 | MONEY-MOCKUP-AUDIT-LOG.html | /money/audit-log | ⚪ |
| 69 | MONEY-MOCKUP-ONBOARDING-WELCOME.html | /money/onboarding | ⚪ |
| 70 | MONEY-MOCKUP-ONBOARDING-CONNECT.html | /money/onboarding/connect | ⚪ |
| 71 | MONEY-MOCKUP-ONBOARDING-THESIS.html | /money/onboarding/thesis | ⚪ |
| 72 | MONEY-MOCKUP-ONBOARDING-FIRST-PLAN.html | /money/onboarding/plan | ⚪ |
| 73 | MONEY-MOCKUP-ONBOARDING-TOUR.html | /money/onboarding/tour | ⚪ |

## Batch 8 — Plan

| # | Mockup | Route | Status |
|---|---|---|---|
| 74 | PLAN-MOCKUP-WORKSPACE.html | /plan | ⚪ |
| 75 | PLAN-MOCKUP-GOAL.html | /plan/goals/[id] | ⚪ |
| 76 | PLAN-MOCKUP-GOAL-CREATE.html | /plan/goals/new | ⚪ |
| 77 | PLAN-MOCKUP-OBJECTIVE-CREATE.html | /plan/objectives/new | ⚪ |
| 78 | PLAN-MOCKUP-TASK.html | /plan/tasks/[id] | ⚪ |
| 79 | PLAN-MOCKUP-TASK-CREATE.html | /plan/tasks/new | ⚪ |
| 80 | PLAN-MOCKUP-DELEGATE.html | /plan/tasks/[id]/delegate | ⚪ |
| 81 | PLAN-MOCKUP-ADD-FRACTIONAL.html | /plan/team/add | ⚪ |
| 82 | PLAN-MOCKUP-GUTCHECK.html | /plan/gutcheck | ⚪ |
| 83 | PLAN-MOCKUP-PRESSURE-TEST.html | /plan/pressure-test | ⚪ |
| 84 | PLAN-MOCKUP-REPORT.html | /plan/report | ⚪ |
| 85 | PLAN-MOCKUP-REPORT-WEEKLY.html | /plan/report/weekly | ⚪ |
| 86 | PLAN-MOCKUP-REPORT-BOARD.html | /plan/report/board | ⚪ |
| 87 | PLAN-MOCKUP-HISTORY.html | /plan/history | ⚪ |
| 88 | PLAN-MOCKUP-HISTORY-ENTRY.html | /plan/history/[id] | ⚪ |
| 89 | PLAN-MOCKUP-SETTINGS.html | /plan/settings | ⚪ |
| 90 | PLAN-MOCKUP-ONBOARDING.html | /plan/onboarding | ⚪ |

## Batch 9 — empty states + misc

| # | Mockup | Route | Status |
|---|---|---|---|
| 91 | FORGE-MOCKUP-EMPTY-TODAY.html | /today (no data variant) | ⚪ |
| 92 | FORGE-MOCKUP-EMPTY-WORKSPACE.html | /the-forge-v2/projects/[id] (empty) | ⚪ |
| 93 | FORGE-MOCKUP-EMPTY-BOM.html | bom empty | ⚪ |
| 94 | FORGE-MOCKUP-EMPTY-COST.html | cost empty | ⚪ |
| 95 | FORGE-MOCKUP-EMPTY-RISKS.html | risks empty | ⚪ |
| 96 | FORGE-MOCKUP-EMPTY-PRODUCTS-V2.html | products empty | ⚪ |
| 97 | MONEY-MOCKUP-EMPTY-STATES.html | money empty | ⚪ |
| 98 | PLAN-MOCKUP-EMPTY-STATES.html | plan empty | ⚪ |
| 99 | FORGE-MOCKUP-LOI-DETAIL.html | /the-forge-v2/projects/[id]/loi/[id] | ⚪ |
| 100 | FORGE-MOCKUP-HYPOTHESIS-CREATE.html | /the-forge-v2/projects/[id]/hypothesis/new | ⚪ |
| 101 | FORGE-MOCKUP-INTERVIEW-CREATE.html | /the-forge-v2/projects/[id]/interviews/new | ⚪ |
| 102 | FORGE-MOCKUP-INTERVIEW-DETAIL.html | /the-forge-v2/projects/[id]/interviews/[id] | ⚪ |
| 103 | FORGE-MOCKUP-EXPERIMENT-DETAIL.html | /the-forge-v2/projects/[id]/experiments/[id] | ⚪ |
| 104 | FORGE-MOCKUP-MARKET-SIZING.html | /the-forge-v2/projects/[id]/market-sizing | ⚪ |
| 105 | FORGE-MOCKUP-COMPETITOR-DETAIL.html | /the-forge-v2/projects/[id]/competitors/[id] | ⚪ |
| 106 | FORGE-MOCKUP-READINESS-ACTION.html | /the-forge-v2/projects/[id]/readiness | ⚪ |
| 107 | FORGE-MOCKUP-BOM-ADD.html | /the-forge-v2/projects/[id]/bom/add | ⚪ |
| 108 | FORGE-MOCKUP-GEOMETRY-UPLOAD.html | /the-forge-v2/projects/[id]/geometry/upload | ⚪ |
| 109 | FORGE-MOCKUP-RISK-CREATE.html | /the-forge-v2/projects/[id]/risks/new | ⚪ |
| 110 | FORGE-MOCKUP-SUPPLIER-CREATE.html | /the-forge-v2/projects/[id]/suppliers/new | ⚪ |
| 111 | FORGE-MOCKUP-LAUNCH-HANDOFF.html | /the-forge-v2/projects/[id]/launch/handoff | ⚪ |
| 112 | FORGE-MOCKUP-REVISION-MERGE.html | /the-forge-v2/projects/[id]/revisions/merge | ⚪ |
| 113 | FORGE-MOCKUP-PROMOTE-TO-FORGE.html | /the-forge-v2/promote-to-forge | ⚪ |
| 114 | FORGE-MOCKUP-UNARCHIVE.html | /the-forge-v2/projects/[id]/unarchive | ⚪ |

---

## PNG delivery log

As each batch deploys, capture + deliver:
```
/tmp/<page>-mockup.png   — mockup full-page at 1440×900
/tmp/<page>-prod.png     — production full-page at 1440×900
```

Open both with `open /tmp/<page>-mockup.png /tmp/<page>-prod.png` for side-by-side.

## Data truth checklist (per page)

Before marking 🟢, confirm:
- [ ] Every text string comes from a real action, a real DB read, or is static UI copy that's identical on every load
- [ ] Every number is derived from real data (runway, cost, counts, percentages)
- [ ] Empty states fire for any missing data source — no fake placeholder values
- [ ] Any mockup-only content that can't be real for this project (mission envelope SVG specific to HAPS, placeholder avatars) is either parameterised or replaced with a project-agnostic empty state
