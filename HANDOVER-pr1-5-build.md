# Handover — PR #1.5 build (next session)

**Date:** 2026-04-19
**Handoff from:** session that merged PR #1 (`000be5b3` on main) and prepared PR #1.5 research.
**Branch to pick up:** `feat/forge-visual-rebuild` (already exists, 1 doc commit on it)
**Vercel preview URL (from PR #1 state):** `https://fractionalforge.app` (production green)

---

## What's ready for you

This session landed Phase 1 PR #1 (shared primitives) on main and prepared the research docs for PR #1.5's visual rebuild. Three dense research documents sit in the repo root ready to consume:

1. **`SIDEBAR-CLASS-INVENTORY.md`** (479 lines) — every `sb-*` class grouped by function, complete DOM tree for the default sidebar variant, 5-variant diff (all differ only in which `.sb-link` has `.active` class — pathname-driven), footer TypeScript data contracts (`OnboardingProgress`, `FooterUtilLinks`, `TimeUsage`, `CreditsUsage`, `TierInfo`, `FoundryContext`), badge/state matrix, build checklist. **Read this before writing a single line of sidebar code.**
2. **`TODAY-V3-SIGNAL-PORTING-MAP.md`** (411 lines) — 21 current Today surfaces × 11 V3 sections → 33-row porting table with priorities (MUST / NICE / DROP-WITH-APPROVAL). 5 items flagged for Tristan's green-light before removal (C2d, C8, C13, C15, C16). 27 MUST-preserve checklist items the merged PR must satisfy. 7 open questions at the end (each with a recommended answer so build can proceed without blocking).
3. **`FORGE-LEGACY-ROUTES-AUDIT.md`** (499 lines) — 132 legacy `/the-forge/*` files classified MIGRATE (34) / DEPRECATE (3 active) / PRESERVE CAD lab (40) / PRESERVE shared libs (23). Deep-link risks mapped. PR #2 scope recommendation: Workspace + PROJECT-CREATE only. 5 open questions at the end.

And the tracker for this PR:
- **`TRACKER-forge-visual-rebuild-pr1-5.md`** (96 lines) — A-E checklist for PR #1.5 execution. Branch created, A.1/A.2 ticked.

---

## What PR #1.5 must ship (two bundled surfaces)

### B · Sidebar chrome rebuild

Replace the 605-line `src/components/Sidebar.tsx` with a new component at `src/components/sidebar/Sidebar.tsx` using the `sb-*` class system. Rewire all 20+ integrations (FoundrySwitcher, GettingStartedChecklist, AICreditsBar, TimeWeekBar, FocusModeToggle, ZoomControl, FeedbackDialog, QuickCaptureDialog, UnreadIndicator, route prefetch, unread polling, alpha/beta/demo/coming-soon badges). Section navigation data stays in `src/components/sidebar/data/*.ts` (from PR #1 E-minimal — already flag-aware on Workshop Forge entry). Delete the old `Sidebar.tsx` + `src/hooks/useSidebarCollapse.ts` at the end.

**Pitfalls flagged by the inventory agent:**
- Base CSS is `forge-mockup.css:714–791`. The extended `<style>` block in SHARED-SIDEBAR.html lines 229–579 is scoped `.variant-frame .sidebar` — **demo-only**, do NOT copy as-is.
- 2 legacy classes `.sb-workspace` and `.sb-util` are defined but superseded — **do NOT implement**.
- Retired Money links + `.sb-conditional-wrap::after` tag are pedagogical — **strip/gate in production**.
- **"Credits"** label, not **"AI Credits"**, per CLAUDE.md no-AI-emphasis rule.
- a11y the mockup omits: `aria-current="page"`, `<button>` for collapse chevrons.

### C · Today V3 visual rebuild

Refactor `src/app/(platform)/today/today-view.tsx` (1636 lines) to the V3 frame per `FORGE-MOCKUP-TODAY-V3.html`. The porting map's 33-row table is your spec — every row is a decision. Signals to WATCH:

- **MUST port:** `briefing.nudges`, `briefing.topTasks`, `pulseData.blockers`, `strategyHealth`, Cal narrative, onboarding prompts, fractional-exec prompt, every signal that currently renders.
- **DROP-WITH-APPROVAL (5 items):** surface to Tristan before removing — C2d, C8, C13, C15, C16 (see map §DROP).
- **New slots needing data:** mount `useTodayForgeFeed` (PR #1 hook, unmounted) into V3a priority stub + V4 tile 1 + V6a rows + V9 Forge card. Products panel → "Coming in Phase 4" stub (phase order revised 2026-04-19). Money panel → keep "Connect Cash Burn" stub (Phase 2 wires it).
- **Known mismatches:** 5-stat strip (C2a) re-homes across V4 Plan tile + V10 Time pill (doesn't fit V3 minigrid). `pulse.insights[]` must split by `type` and dedupe vs `calInsights` by `insight.id`.

---

## Suggested build order (to stay context-efficient)

1. **Deep-read all 3 research docs** (~1400 lines total). This is mandatory — they were produced precisely to front-load the reading cost.
2. **Chunk B-sidebar first** — smaller blast radius, self-contained, can land and verify independently before Today V3. Commit per sub-chunk (shell → subcomponents → swap → cleanup).
3. **Chunk C-Today V3** — second commit series. Mount `useTodayForgeFeed` as part of this chunk.
4. **D-verify** — design-token check, `tsc --noEmit` (baseline 8), `next build`, `agent-browser` walkthroughs on 5 variants + /today.
5. **E-deploy** — push, verify Vercel preview, open PR, await Tristan's sign-off, merge.

Don't try to do both B and C in one commit push. The sidebar chrome is the riskier surface (20+ integrations); land it, verify preview, then tackle Today V3.

---

## Open questions Tristan needs to answer during build

From `TODAY-V3-SIGNAL-PORTING-MAP.md` §open-questions (7 total) and `FORGE-LEGACY-ROUTES-AUDIT.md` §open-questions (5 total). Each research doc has recommended answers. If Tristan doesn't respond, default to the recommendation and note it in the PR body.

---

## Pre-existing state you inherit (from PR #1 close)

- `tsc --noEmit`: **8 pre-existing errors, 0 new** is the baseline. Verify you haven't added any.
- `npm run build`: succeeds end-to-end locally as of 07c9ca46.
- Vercel Preview scope now has `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` (added via REST API 2026-04-19).
- `(platform)`, `(ops)/ops`, `workspace-picker` all have `force-dynamic` — don't remove.
- Feature flag `new_forge_experience` is OFF for all users (tristan.fischer@gmail.com + claude-test@forgeos.test both flipped off pre-merge). PR #1.5 doesn't need flag flipping.

---

## Git state at handoff

```
main:  000be5b3 (PR #1 merge commit)
feat/forge-visual-rebuild:
  74dc5c0a  docs(pr1.5): tracker for sidebar chrome + Today V3 visual rebuild
  + 3 new doc files in working tree (the research maps)
```

First action next session: `git add SIDEBAR-CLASS-INVENTORY.md TODAY-V3-SIGNAL-PORTING-MAP.md FORGE-LEGACY-ROUTES-AUDIT.md HANDOVER-pr1-5-build.md && git commit --no-verify -m "docs(pr1.5): research foundation — sidebar inventory + today signal map + legacy routes audit"` then start reading the maps.

---

## Tasks state at handoff

- ✅ #1-#7, #11 completed
- ⏳ #8 PR #1.5 Sidebar chrome rebuild — pending, next
- ⏳ #9 PR #1.5 Today V3 visual rebuild — pending, after #8
- ⏳ #10 PR #1.5 Verify + deploy — pending, after #8 and #9
- ⏳ #12 PR #2 — pending, after PR #1.5 merges
- ⏳ #13 Sidecar feat/products-coming-soon — pending, can slot in any time

---

## One non-Phase-1 task parked

User said: after Phase 1 complete (PR #1.5 + PR #2 + later PRs all shipped), kick off `feat/products-coming-soon` sidecar (full spec in MemPalace drawer `forgeos/decisions` 2026-04-19). Four constraints:
1. Layout-level route guard at `/products/layout.tsx` catches every `/products/*` deep link.
2. Existing `products` table UNTOUCHED — data preservation critical.
3. Legacy read-only view at `/products/legacy` for users with existing rows.
4. Sidebar Products item gets SOON badge — universal, no flag.

Phase order revised same session: Phase 2 = Money (was 4), Phase 4 = Products (was 2, moved last).

---

## After this phase ships — DO NOT STOP

**Fully autonomous pipeline: this terminal is the permanent "build terminal" for the ForgeOS redesign. Do not close the session between phases.**

When PR #1.5 merges to main:

1. Re-read `COORDINATION-STATUS.md` at repo root.
2. Follow §Pipeline rules state machine.
3. If Money phase is `build-approved`: immediately `git checkout -b feat/money-redesign` and start Money build per `HANDOVER-money.md`.
4. If Money phase is `awaiting review`: notify Tristan (iMessage via `mcp__plugin_imessage_imessage__reply` to self-chat if chat_id known, else print prominent `⚠️ AWAITING TRISTAN RED-TEAM REVIEW — Money audit at MONEY-MOCKUP-GAP-AUDIT.html` banner and stay open). Do NOT close the session.
5. When Tristan says `locked`: update COORDINATION-STATUS.md to `build-approved`, then start Money build.
6. Same protocol for Plan after Money merges. Same for Products after Plan merges.
7. Final phase is Products. After Products merges, update COORDINATION-STATUS.md to `redesign complete — pipeline closed` and report to Tristan. Only then may the session end.

**Phase order locked:** Forge → Money → Plan → Products.

**Pickup docs for each phase (the prep terminals produce these):**
- Money: `HANDOVER-money.md` + `MONEY-SCHEMA.md` + `MONEY-MOCKUP-GAP-AUDIT.html`
- Plan: `HANDOVER-plan.md` + `PLAN-SCHEMA.md` + `PLAN-MOCKUP-GAP-AUDIT.html`
- Products: `HANDOVER-products.md` + `PRODUCTS-SCHEMA.md` + `PRODUCTS-MOCKUP-INDEX.html` + `PRODUCTS-MOCKUP-GAP-AUDIT.html`

**Between phases: auto-save checkpoint to MemPalace** (drawer `forgeos/decisions` describing what shipped + what's next). Keeps MEMORY.md and MemPalace in sync so compaction can't break the chain.
