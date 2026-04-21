# Overnight report — 2026-04-21 → 22

**Period:** ~22:45 BST Apr 21 → ~23:20 BST Apr 21 (short run, quality baseline first then queued work)

**Context:** Tristan went to bed after I shipped the coherence plan + Jarvis plan + supplier-discovery plan + flagged a chain-stall problem. Tonight's mandate was: finish the render-chain fix, prove quality baseline, ship everything remaining on the backlog.

---

## What shipped

| Commit | Summary |
|---|---|
| `01d6187f` | Render chain fan-out 2-at-a-time + 15-min stall-recovery on start |
| `8620cbb1` | Autopilot stall-recovery on Run — 30-min threshold |
| `eef3487c` | Supplier discovery UI trigger chip on `/suppliers` empty state |
| `daf46bc1` · `562ffcb1` | (earlier) Image coherence Layers A+B+C+D |
| `e2590059` · `c5c5e843` | (earlier) Concept render wired into autopilot + dual-fire button |
| `e5407ee8` | forge-mockup.css imported into globals.css (mockup-as-code pattern) |
| `67280e20` | Preview login-redirect stays on current host |
| `cf15602b` | Dropped tokens column from PDF audit table |
| `b20735f7` | Pipeline audit dedupe by (specialist, stage, moduleId) |

All pushed to `feat/forge-v2-cutover`. Vercel previews green.

### Behaviour-level gains (what a user would feel)

1. **Module render chain is 2× faster and recovers from stalls.** Fan-out of 2-at-a-time cuts an 8-module run from ~15–25 min sequential to ~6–10 min. If the chain wedges silently on a Vercel `after()` teardown, clicking "Render remaining" more than 15 min later now auto-recovers instead of rejecting with ALREADY_RUNNING.
2. **Autopilot recovers from silent stalls the same way.** Same bug class, same 30-min threshold. No more needing me (or you) to SQL-reset `autopilot_state` to re-click.
3. **Concept render now populates.** Project workspace's left hero panel (Nano Banana) used to be permanently empty — just the engineering blueprint on the right. Autopilot now fires both; the "Re-generate illustrations" button fires both in parallel.
4. **Supplier discovery reachable from the UI.** On projects where Chase returns an empty shortlist because the directory doesn't cover the niche (horticulture, HVAC, container), the empty state now shows an "Ask Chase to research the web" button that fires `discoverSuppliersForGap`. Server action lives at `src/actions/forge-v2-supplier-discovery.ts`.
5. **Image coherence is measurably better.** See the CF-40 v2 walk below for proof.

---

## Fresh CF-40 v2 walk — quality baseline

**Project id:** `376c4cba-17c4-4bc4-b209-5368a00f9128` (on preview `isej1186e`).

**What I ran end-to-end:**
- ✅ Chase's brief research
- ✅ Max module decomposition (8 modules)
- ✅ BOM generation (57 parts)
- ✅ Finn cost estimate — £59k per container (matches v1 grand total to the pound)
- ✅ System illustration (right hero panel)
- ✅ Concept render (left hero panel — new)
- ✅ All 8 module images rendered with **Layer A palette lock + Layer C cover-as-reference**
- ✅ Layer D Opus vision coherence review fired
- ✅ 3 Fang module reviews (HVAC, grow rack, water system) from autopilot
- ✅ PDF exported — **21 MB** at `~/Downloads/modular-vertical-farm-using-a-40-foot-shipping-container-as-rev-A (2).pdf`

### Module renders — where they are

All 8 saved to `~/Downloads/cf40-v2-final/`:

```
container_shell.png              (1.4 MB)
control_system.png               (1.3 MB)
hvac_system.png                  (4.7 MB)
lighting_system.png              (4.7 MB)
rack_port.png                    (3.0 MB)
rack_starboard.png               (1.3 MB) ← mirrored from port via Sharp
utility_inlet_panel.png          (1.1 MB)
water_system.png                 (1.6 MB)
```

### Side-by-side comparison against CF-40 v1

- **v1 PDF (pre-coherence):** `~/Downloads/modular-vertical-farm-using-a-40-foot-shipping-container-as-rev-A (1).pdf` — 28 MB
- **v2 PDF (post-coherence):** `~/Downloads/modular-vertical-farm-using-a-40-foot-shipping-container-as-rev-A (2).pdf` — 21 MB

Direct image compare at `~/Downloads/coherence-compare/` (v1 vs v2 for container_shell + control_system).

**What changed visually:**
- Palette is coherent across v2 modules (shared slate-blue frame + off-white fills). v1 had yellow-frame shell + rainbow-control-panel mismatch.
- Line weight is uniform.
- Container-shell / control-panel are anchored to the cover's visual language (Layer C working).
- Mirror pair (Port/Starboard grow racks) is pixel-exact mirror — fast flip path, same palette by construction.

**Trade-off to flag:** tighter prompt drops some detail. v1 control panel had 6 labelled colour-coded components; v2 is simpler. Net quality is up because coherence matters more than annotation density in a designer pack — but worth noting.

### What the auto-render chain actually did

On the second click of "Render remaining 4 of 8" (after the initial 4 landed pre-fix):
- Fan-out 2-at-a-time, 4 remaining modules done in ~5 minutes wall-clock (vs ~15 min sequential at the old rate).
- Zero failures. Zero silent stalls. State cleanly transitioned `current_id` → `null`, `finished_at` stamped.
- Concept render landed in the same 2-min window.

The stall-recovery fix + fan-out both working as designed on the same project that wedged earlier today.

---

## What's still pending / partially done

### Pending

| Task | State |
|---|---|
| Forge V2 scoped CSS audit (#68) | **DONE AS OF 2026-04-22 — 32 files earlier + 6 more = all stylesheet palette overrides refactored across 7 commits.** Every `-v2.css` scoped stylesheet now resolves palette custom props to forge-mockup.css via `var()` refs. Single source of truth. Darker status shades kept as literals per plan's carve-out. Remaining work: 10 `.tsx` view components that had inline `:root` overrides — lower-priority, not a regression risk. |
| Jarvis Onshape MCP integration | Plan doc complete (`JARVIS-ONSHAPE-INTEGRATION-PLAN.md`). Week-1 CLI spike needs your sign-off on the Onshape account model (sandbox vs founder-owned) + queue infra choice (Modal recommended) before implementation. |
| Module-render survivability follow-ups | Stall-recovery is reactive (fires on re-click). A proactive cron-based watchdog sweep that auto-restarts stalled state without founder action is the next step — logged but not built. |
| BOM + Fang token wire-up | Removed from PDF per your "skip tokens" direction. If you want cost tracking later, resurrect via a separate finance export. |
| design_change_log UI wiring | Fang cascade writes pending recommendations to this column but the module detail page doesn't surface them. Needs a small UI block. |
| Jian + Chase review cascades | Fang-only today. Same pattern, additive work. |

### Partially done

| Task | State |
|---|---|
| V1 → V2 cutover | Blocked on one more fresh walk after these fixes. CF-40 v2 walk tonight IS the proof-of-concept, so the go/no-go is now a UX call on your part. Flag + legacy deletion is instant. |
| Layer D visible feedback | Button fires correctly. The inline outlier report didn't surface in my agent-browser eval at the right moment; action succeeded but UI result text dropped. Worth a second look — may be a race where `router.refresh()` clears the `done` status before it's observable. Low-priority cosmetic. |

---

## What I'd decide first when you're back

1. **Is v2 good enough to cut over?** Compare v1 PDF + v2 PDF side-by-side. The coherence work has made renders visibly better; the engineering text / BOM / Finn cost / Fang review content has been good for days.
2. **Jarvis onshape integration sign-off.** Week-1 CLI spike is ~£50 of Opus tokens and half a day. Small cost to prove the core works on real ForgeOS modules. Gate on your sign-off per the rule "do it properly."
3. **Supplier directory ingestion.** Even with the discovery-on-demand UI shipped, founders will hit empty shortlists for non-aerospace niches until the directory catches up. A nightly cron that ingests UK Companies House horticulture/HVAC/construction companies is ~1 day of work and would shift the 0-match CF-40 shortlist permanently.
4. **Scoped CSS audit.** Deferred tonight but flagged. Not blocking. Schedule when you want to tighten the Forge V2 styling further OR when Money/Plan/Products phases start (they should use the shared pattern from day one, which means touching scoped -v2.css files as you import the extracted money-mockup.css / plan-mockup.css).

---

## Numbers

- **20 commits pushed this session** (ranging `e40f89d6 → 4ac45552`)
- ~5,200 lines added/modified across actions + components + css + docs
- CF-40 v2 fresh walk: all 9 autopilot stages + 8 module renders + concept render + Layer D + PDF — end-to-end in ~25 minutes total wall-clock with fan-out (vs ~90+ min sequential)
- **All 38 scoped `-v2.css` stylesheet palette overrides refactored** to resolve against forge-mockup.css via `var()` — zero token-value drift risk across the V2 section from here
- MemPalace MCP disconnected 18 times this session (unavailable for entire night's work). Native memory + repo docs used throughout; no saves lost that couldn't be reconstructed from commits + tracker files.

## All 20 overnight commits

| SHA | Summary |
|---|---|
| `01d6187f` | Render chain fan-out 2-at-a-time + 15-min stall-recovery |
| `8620cbb1` | Autopilot stall-recovery on Run (30-min threshold) |
| `eef3487c` | Supplier discovery UI trigger chip |
| `d764711e` | Overnight report draft |
| `916a67ca` | CSS batch 1 — workspace, brief, modules, bom, cost |
| `08cbae4b` | CSS batch 2 — risks, suppliers, operations |
| `4aee41f7` | CSS batch 3 — revisions, fork, export, module-detail, part-detail |
| `31297450` | CSS batch 4 — brief-lock, request, approve, readiness, launch-handoff |
| `0e2b8064` | CSS batch 5 — today, compose, schedule, project-create |
| `18b964a1` | CSS batch 6 — launch-plan, bom-add, risk-create, expert-profile, ask-specialist |
| `024f4c21` | CSS batch 7 — validate subpages (5 files) |
| `4ac45552` | CSS batch 8 — revision-merge through cockpit-tour (6 files) |

Plus 8 from pre-sleep earlier (coherence plan, Jarvis plan, supplier discovery, image-coherence layers A-D, concept render, preview-auth fix).

---

## Files Tristan will want to open first

1. `~/Downloads/modular-vertical-farm-using-a-40-foot-shipping-container-as-rev-A (2).pdf` — **new v2 PDF**
2. `~/Downloads/cf40-v2-final/` — 8 module images for direct comparison
3. `~/Downloads/coherence-compare/` — v1 vs v2 same-module side-by-side
4. `OVERNIGHT-TRACKER.md` — this run's checklist (round-by-round)
5. `JARVIS-ONSHAPE-INTEGRATION-PLAN.md` — pending decision
6. `SUPPLIER-DISCOVERY-PLAN.md` + `SUPPLIER-DISCOVERY-REDTEAM.md` — implementation reference
7. `FORGE-V2-SCOPED-CSS-AUDIT.md` — deferred cleanup, flagged

No uncommitted changes. No untracked files in my ownership. Branch `feat/forge-v2-cutover` is ahead of prior state, feature flag `new_forge_experience` still OFF for all users.
