# Overnight tracker — 2026-04-21 / 22 autonomous run

**Start:** ~2026-04-21 22:45 BST
**Budget:** ~10 hours of work, main-thread only (sub-agent quota resets 2026-04-23 21:00)
**User:** asleep, expects full progress by morning

## Context this run is answering

Tristan's last words: *"Every so often I want you to check in on yourself and see how you're getting on, and then continue. I want you to just continue working through the night. I don't want to discover in the morning there's a whole bunch of stuff which you haven't done, which should have happened already."*

So — everything on the pending list gets a swing. No stopping. No "this is hard, I'll flag it." If a fix fails, write what failed to this doc + move on.

## Round 1 — Render chain fix (P0; quality blocker)

**Why P0:** sequential per-module loop silently stalls on `after()` container teardown. Observed 2× today on CF-40 v2 (2/8 then 2 more then stalled). Cannot export a clean comparison PDF until this is reliable.

Two fixes, same commit:

### 1a. Watchdog — detect stalled `image_render_state`

- New server action `sweepStalledImageRenders()` that:
  - Finds rows where `image_render_state->>'finished_at' IS NULL AND image_render_state->>'started_at' < now() - interval '5 minutes'` AND `current_id` hasn't changed in 5 min.
  - Marks `current_id` module as failed, nudges state to next unrendered module, re-schedules `renderNextModuleStage` via `after()`.
- Call this from the module-render button handler on page-load when state looks stalled (founder re-visit = recovery).
- Also call from pipeline-runs-watchdog (if it exists) or add a plain cron surface.

### 1b. Fan-out 2-at-a-time

- Modify `renderNextModuleStage` to pull the next TWO unrendered modules (primaries first), fire them in parallel via `Promise.allSettled`, then schedule next round. Each stage's Vercel budget now covers 2 × ~60s = 120s. Still well under 300s.
- Simpler than concurrency=3 (which brushes the 300s cap) or concurrency=4 (brushes it more).

### Checklist
- [ ] Write sweepStalledImageRenders
- [ ] Modify renderNextModuleStage to batch=2
- [ ] Wire sweep into `startRenderAllRemainingModuleImages` (detect + recover on re-click)
- [ ] tsc clean
- [ ] Commit + push
- [ ] Verify new preview live
- [ ] Re-fire render on CF-40 v2, watch all 8 land

## Round 2 — Fresh v2 walk with fixes (P0; proof of quality)

- CF-40 v2 has 4/8 rendered, chain wedged. After Round 1 ships:
  - Either reset state + click "Render remaining 4 of 8" (the UI) and verify all 8 land
  - OR scrap CF-40 v2, create CF-40 v3 with the same brief + full autopilot + full render chain + Layer D + PDF
- Target: clean comparison PDF at `~/Downloads/container-farm-*-rev-A.pdf` against CF-40 v1 (28 MB PDF from earlier).

### Checklist
- [ ] All 8 modules rendered on CF-40 v2 (or v3 if easier)
- [ ] Concept render landed (clicking "Re-generate illustrations" on new preview)
- [ ] Layer D coherence review run; outliers noted
- [ ] PDF exported to Downloads
- [ ] Screenshots extracted of key pages (modules, hvac detail, cost, bom)

## Round 3 — Supplier discovery UI (P1)

**Status:** server action ships (`forge-v2-supplier-discovery.ts`, commit from earlier); no UI button.

Per plan §7:
- Chip on `/suppliers` page when shortlist < 3 matches for a module.
- Click → fires `discoverSuppliersForGap(projectId, moduleId)`.
- Chip shows "Chase is searching the web for {process} suppliers…" with progress polling.
- On done: new candidates visible with `unverified` pill + "Verify & add" action.

### Checklist
- [ ] Create `discovery-trigger-chip.tsx` client component.
- [ ] Wire into `suppliers-view.tsx` where the empty-state chip already lives.
- [ ] Add `loadSupplierDiscoveryStatus(projectId)` for page-load-time state.
- [ ] tsc clean
- [ ] Commit + push
- [ ] Smoke test on CF-40 v2 (horticulture gap — should return real UK suppliers)

## Round 4 — Autopilot watchdog (P1)

Same stall failure class as render chain. Autopilot's `after()` dies silently; `autopilot_state.finished_at` stays null; Run autopilot button rejects with ALREADY_RUNNING forever until SQL reset.

- Analog of 1a — sweep autopilot_state where `started_at < now() - 10 min AND finished_at IS NULL AND no pipeline_runs in last 5 min`.
- Mark stage as failed, allow re-click.
- Better: nudge current stage to next + re-schedule.

### Checklist
- [ ] Write sweepStalledAutopilot.
- [ ] Wire into startAutopilot (detect + recover on click).
- [ ] Smoke test by forcibly stalling on CF-40 v2.
- [ ] Commit + push.

## Round 5 — Scoped-CSS audit first pass (P2)

Per FORGE-V2-SCOPED-CSS-AUDIT.md. 48 files. First pass: 8 most-stable pages (workspace, brief, modules, bom, cost, risks, suppliers, operations). Delete `:root` palette duplicates that now come from globals' `@import "../styles/forge-mockup.css"`.

### Checklist
- [ ] workspace-v2.css
- [ ] brief-v2.css
- [ ] modules-v2.css
- [ ] bom-v2.css
- [ ] cost-v2.css
- [ ] risks-v2.css
- [ ] suppliers-v2.css
- [ ] operations-v2.css
- [ ] Per file: read, delete duplicate `:root` block, keep page-local CSS, commit individually, agent-browser screenshot-diff against mockup, tick.
- [ ] Final commit summarising.

## Round 6 — Morning handover doc (must land)

Regardless of where I get to, write `OVERNIGHT-REPORT.md` with:

- What shipped (commits + what each does)
- What's verified end-to-end (screenshots, PDF)
- What's pending / partially done / blocked
- What Tristan needs to decide when he wakes up
- Rough time each round took

Write to repo root. Commit + push.

## Self-check rhythm

Every ~30-45 min of work, ScheduleWakeup to give me a break + verify deploys. The wakeups keep cache warm + let Vercel builds finish.

Maximum 1 hour without a commit landing. If I'm in a rabbit hole, STOP + log to this tracker + move on.

## Order of operations (straight line)

1. Round 1 (render chain fan-out + watchdog) — immediate.
2. Round 2 (fresh walk) — once 1 is live. Scheduled via wakeup so Vercel has 4 min to build.
3. Round 3 (supplier discovery UI) — main thread code, run in parallel while Round 2 walk is firing.
4. Round 4 (autopilot watchdog) — main thread code, post-Round 2.
5. Round 5 (scoped CSS) — low risk, done in parallel with whatever other wait.
6. Round 6 (morning report) — last thing before I stop.

## Log — updated as I go

(This gets appended below by the agent as rounds complete.)
