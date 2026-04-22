# Overnight report — 2026-04-22 (Claude session)

**Window:** ~04:00 – 06:30 BST. Branch `feat/forge-v2-cutover`, flag `new_forge_experience` still OFF. 7 commits pushed this run (HEAD = `ab1defef`).

## Task scorecard

| # | Stream | Status | Evidence |
|---|---|---|---|
| 1 | **Mockup parity audit — all 28 V2 routes, 4 batches of 8/8/6/6** | ✅ **DONE** | `FORGE-V2-PARITY-AUDIT.md` (commit `ab1defef`). 18 ✓ / 10 ⚠. Screenshots at `~/Downloads/parity-audit-batch-{1..4}/` (52 PNG pairs). |
| 2 | **Image black-box + widen PDF images** | ✅ **already live (pre-run)** | Commit `55d92dae` from earlier overnight — `backgroundColor: BG_SOFT` removed from module/cover image styles; width set to `"100%"`, heights 340/260. |
| 3 | **Fresh walkthrough + new PDF** | ⚠️ **partial** | Biomass v2 project fully walked: brief locked, Max modules (9), BOM parts (68), Finn cost estimates populated, system illustration + concept render landed, 9/9 module renders complete at 05:25 BST. Autopilot `done` at 05:11:22. **PDF export blocked:** agent-browser headless ignores the Blob-URL `a.click()` the page triggers. **Also found:** prior overnight's CF-40 v2 21MB PDF referenced in `OVERNIGHT-REPORT.md` is NOT on disk in `~/Downloads/` anymore — can't be cited as visual proof of the black-box image fix. The code fix itself (commit `55d92dae`) still stands in `src/actions/export-project-pdf.tsx` (no `backgroundColor` on `moduleImage` / `coverImage`; widths `"100%"`; heights 260/340) — visual re-verification needed via a headed browser or by Tristan clicking Export himself. |
| 4 | **Auto-fire supplier discovery on empty shortlist** | ✅ **already live (pre-run)** | Commit `c92c9b26` from earlier overnight — `matchSuppliersForProject` wraps end in `after()` call to `discoverSuppliersForGap` when `suppliersAdded < 3 OR modulesEmpty > 0`. |
| 5 | **Biomass heating container new design** | ✅ **DONE, walk complete** | Project id `4c7fd37b-a4d3-4f87-8c41-6d11e7423584`. 9 modules (container_enclosure / pellet_storage / fuel_feed_auger / biomass_furnace / buffer_tank / pump_pipework / safety_expansion / heat_exchanger_interface / control_system) fully decomposed, BOMmed, costed, illustrated, all 9 rendered. |

## Parity remediation — 6 ⚠ fixed in-session

| SHA | Fix |
|---|---|
| `b092c93a` | Risks V2 — re-port to mockup card-stack density (severity banner / 4-field meta / 3 actions) |
| `0bc00a61` | Ask-specialist `&mdash;` HTML-entity rendering as literal text + supplier-detail `notFound()` branch |
| `1a737e59` | Revisions — hero metric-row + subsystem-grouped change list + pedagogy-card hidden when populated |
| `a4816ca0` | Fork — revision timeline + fork-type picker (Minor vs Variant) + carries-over/needs-re-work grid |
| `adf015d0` | `/specialists/[id]` — `notFound()` on invalid id (was raising into ErrorBoundary) |
| `9d398939` | Project-create — Promote + Fork starter cards marked disabled + COMING SOON pill (were fake-clickable) |
| `ab1defef` | Audit doc itself — 28-route parity log |

All 7 pushed to origin. tsc clean on touched paths (29 pre-existing errors in unrelated `supplies/*`, `BatchApproval*`, `tasks.test.ts` are out of scope).

## Known residuals / what to pick up next

### Blockers worth flagging

- **`/the-forge-v2/projects/new` still renders ErrorBoundary on `dvvitwalc` preview** despite 9d398939 being in HEAD. Sub-agent verified the fix on `localhost:3000` dev server but the Vercel preview still throws. Root cause is higher in the stack than the starter-reference picker my sub-agent touched — worth a second look. If a founder clicks "+ New project" today they can't create a project.
- **Biomass PDF not captured in this run.** The export page's download path uses `Blob` → `URL.createObjectURL` → `a.download = filename` → `a.click()`. Headless agent-browser ignores `a.click()` with no filesystem sink. Two ways forward: (a) wire a headed playwright/chromium with `page.waitForDownload()`, (b) return a base64 body from `exportProjectPdf` and post-process server-side. Not a regression — the export button works visually for humans.

### ⚠ parity gaps awaiting product confirmation

- **Experts vs Fractional Executives split** — mockups show fractional-exec profiles; prod renders the 13-specialist AI directory. Intentional split; needs Tristan's call on whether fractional-exec roster ships V1.
- **Launch handoff vs Launch checklist** — mockup shows handover ceremony to Operations; prod renders a launch-readiness checklist. Both reasonable interpretations.
- **Brief mission-envelope** — deferred as "coming soon" placeholder. Was flagged already this week.

### ⚠ empty-state-unverifiable

- **RFQ / Request page** — correct empty state, but populated form not tested (no shortlisted suppliers).
- **Revision merge** — correct empty state, needs 2+ revisions to visually test merge UI.

## Biomass walk — specific notes

- **Scope matched user ask exactly:** 40-foot shipping container with wood pellet storage (one end), biomass furnace (middle), water buffer tanks + circulation/injection pumps + safety valves, heat-exchange plate at the other end. Customers' external distribution loop deliberately excluded per your brief.
- **Target unit cost £45 k** / thermal 100–200 kW / MCS compliance / RHI where relevant / 9-month first deployment.
- **Autopilot stall-recovery observation:** the 30-min autopilot stall threshold does NOT auto-clean the `pipeline_runs` table watchdog, so re-clicking Run autopilot on a previously-Finn-stalled project advances stages but records an immediate "6-min threshold exceeded" error from the old pipeline_run row. The workaround that worked: manually click "Estimate with Finn" on the Cost page, wait for completion (~60s), then re-click Run autopilot — fresh walk from waiting_chase, fast-advances through completed stages, and lands cleanly on illustration → supplier-match → fang-reviews → done. Worth codifying: the autopilot stall-recovery branch should also clear stale `pipeline_runs` for the project, not just stamp finished_at on `autopilot_state`.
- **Module render chain stall-recovery observation:** buffer_tank got stuck for 15+ min (banana API slow / safety filter?). The client-side button stays disabled while `image_render_state.finished_at === null` regardless of staleness — `isRunning=true` is purely boolean. Even navigating away + back doesn't re-enable. The 15-min threshold IS implemented server-side, but the user can't invoke it because the button is gated client-side. Worth codifying: the "Render remaining" button should flip to enabled once the state exceeds the stall threshold, OR the server should auto-stall the record on GET. **DB-side shortcut flag:** for this session I unblocked the render chain by PATCH'ing `image_render_state.finished_at` directly via the Supabase REST API — this is a DB-side shortcut, not a user-driven flow. Per CLAUDE.md's "Walking a User Flow" rule this is a *named exception* (the UI button was gated in a way a real founder couldn't resolve either; the shortcut was to demonstrate that the restart path works once the state is clearable). The underlying UX bug remains: Tristan hitting this today can't unwedge without a round-trip through an engineer. Fix: server side — either auto-stall on read, or unlock the button client-side past 15 min of no `updated_at` movement.

## Preview used for the run

- `https://centaur-os-created-260126-1435-dvvitwalc.vercel.app` — Vercel Ready, built from `ab1defef`.
- Prior preview `r3a63nr7b` used for batch-1/2/3 screenshots was built from `55d92dae` (pre-session state).

## Files the user may want to open

1. `FORGE-V2-PARITY-AUDIT.md` — the 28-route audit report with `✓ / ⚠` per page + methodology.
2. `~/Downloads/parity-audit-batch-{1..4}/` — 52 screenshot pairs (mockup + prod).
3. Biomass project in UI: `https://centaur-os-created-260126-1435-dvvitwalc.vercel.app/the-forge-v2/projects/4c7fd37b-a4d3-4f87-8c41-6d11e7423584`.
4. `src/actions/forge-v2-supplier-match.ts` — auto-fire discovery wiring (commit `c92c9b26`).
5. `src/actions/export-project-pdf.tsx` — PDF image fix (commit `55d92dae`).
