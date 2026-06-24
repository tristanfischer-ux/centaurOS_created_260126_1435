# 3-Example Quality Loop — Autonomous (started 2026-06-23, Tristan asleep)

═══════════════════════════════════════════════════════════════════════════════
## ▶▶▶ RESUME (2026-06-24 night, Tristan asleep — "keep going all the way through")
═══════════════════════════════════════════════════════════════════════════════
20-FT BESS SHOWCASE is the canonical example (40-ft RETIRED — Tristan: "nobody uses 40-ft").
Industry input (drawer forgeos_reference_c190d8414ae30c20): 20-ft = 5-9 MWh, 2.5 MW max, 2-8h family;
the container is BATTERIES ONLY (PCS/transformer/MV in a SEPARATE container); BESS-only ~$80/kWh(2h)/$65(8h).

DONE THIS SESSION (all on main except the last re-run; main==origin/main as of the pushes):
  ✓ Gate work: benchmark net wired (gate 36) + prove-the-catch registry (all 20 gates) + enforcement
    on for wrongness gates + gate-17 renderer guard + DB verify-before-writeback. (earlier commits)
  ✓ Branch drift CLOSED + root cause fixed (jest mis-collected tsx-scripts → unpassable gate → bypassed).
  ✓ COST source-rules (all UNIVERSAL, requirements_bom.py, each --selftest'd): capacity→m³, flow→kW,
    busbar floor, corpus-lift class-mismatch + RATIO guard (£40→£3k trays), micro-commodity material
    split (wire/pad £0.3-2.5 vs metal £2-15), BATTERY CELL energy-priced (£0/£100→£40, dominant line),
    small-heater £/W ceiling + lift-skip (£1500→£150). 20-ft BoM now £539k = £185/kWh, cell 24% (realistic).
  ✓ RENDER placement: exterior pass runs on artifact-reuse → 2 interior + 2 exterior.
  ✓ CONTAINER-FIT: triggers for 20-ft (aspect≥2.2 OR payload-rated); battery-only split → PCS/
    transformer/switchgear to a COMPANION container; battery container 11m→9.4m.
  ✓ CI red FIXED-LOCALLY: pre-push now runs typecheck:baseline (was never running tsc); baseline
    re-captured (166 pre-existing errors, none mine). ⚠ CI STILL RED until TRISTAN changes ci.yml's
    typecheck step `npx tsc --noEmit` → `npm run typecheck:baseline` (needs `workflow` token scope I lack).

IN FLIGHT: clean 20-ft re-run → out/bess-20ft-v2 (bg task b9g5lxb6p, ~40min) with ALL fixes. When done:
  verify cost(~£185/kWh)/GA-fit/4-renders/benchmark-net verdict → push the 3 unpushed commits to main →
  handover. REMAINING over-prices the net will route: off-gas activation solenoid £1500/u (×13), + the
  battery-container chiller still ~9.4m (engine sizes a 2.4m standalone chiller; real = compact in-line).
NEXT (engine fixes, beyond Tristan's explicit cell/heater/battery-split list — all UNIVERSAL):
  1. ⭐ 40-FT CONTAINER HARDCODED: deterministic-emitter.ts emitStructureContainment(p: BessParams)
     hardcodes a 40-ft Hi-Cube container word (line ~4220, CIMC 40HC-BESS-HD £14,000 list) +
     "86 m³ = 40-ft HC" defaults (lines 620/712/718). The emitter has NO access to the brief's
     max_dimensions_mm → a 20-ft brief still emits a 40-ft container (£14k line + wrong GA size +
     "40-foot" narrative). Tristan: "nobody uses 40-ft anymore" → the DEFAULT is now wrong. Fix:
     thread max_dimensions_mm → BessParams → emit a 20-ft (~£4-5k) or 40-ft container by the brief.
  2. 5-9 MWh DENSITY: engine sizes 2.91 MWh in a 20-ft (briefed 5) — needs 2026 high-density cells;
     G0.5 should flag the density infeasibility instead of silently sizing down.
  3. GA: 2-high rack stacking + compact/wall-mount battery-side BoP (chiller) so the battery
     container fits 6.06 m (currently 9.4 m). Drawer forgeos_gotchas_7669116b0b806dfc.
  4. Smaller cost over-prices the net will route: insulation monitor £10k (IMD ~£500-2k), container
     AC £7.8k (corpus-lifted £3.8k→£7.8k, 2× — under the 20× ratio guard).



═══════════════════════════════════════════════════════════════════════════════
## ▶▶▶ RESUME HERE (post-compaction #5, 2026-06-24) — BESS showcase + quality arc
═══════════════════════════════════════════════════════════════════════════════
DONE THIS SESSION (4 commits on oxccu-efuel):
  ✓ 1. WIRE THE NET INTO THE CHAIN — gate 36 (commit 3f9c3ea23). serial-design-chain-v2.tsx generates the
       benchmark after the authoritative cost-sanity re-derive, compareToBenchmark, records
       state.benchmarkDivergence/.benchmarkExpectation/.benchmarkFaults, prints the full-check. SHADOW by
       default; BENCHMARK_NET_ENFORCING hard-exits 36 on RADICAL. Runs on QUALITY_LOOP_PHASE>=3 or
       BENCHMARK_NET_FORCE=1; CHAIN_SKIP_BENCHMARK_NET=1 kills it. Gate 36 in CLAUDE.md table. Harness
       invariant UNIVERSAL.benchmark_net_flags_radical_divergence.
  ✓ NO-PDF GUARD (commit c3eb265f8) — regression-harness rendered a PDF/snapshot (Tristan caught it AGAIN).
       REGRESSION_NO_RENDER=1 / --no-render now runs pure invariants with ZERO PDFs. USE THIS to verify a
       pure invariant against a snapshot. (chain is Excel-only; CHAIN_WANT_PDF off by default.)
  ✓ 3. SYSTEMIC COMPONENT-VOLUME BUG (commit 8f7bc85c3) — ROOT CAUSE was requirements_bom.py:2532
       hardcoding " m³" onto ANY `capacity` modifier, ignoring its unit. So 2300 A breaker→"2300 m³",
       150 L/min pump→"150 m³", 86 kW chiller→"86 m³" (the benchmark net's 48× sizing flag). FIXED: honour
       the capacity unit (m³ only when truly volume; else A/V/W/kW/L; drop if rating_primary covers it).
       38 bogus m³ lines → 0. requirements_bom.py --selftest gains 4 capacity-unit assertions.
  ✓ GA-CONTAINER-FIT (commit f35178660) — "doesn't fit the 40-ft container." build_universal_scene laid
       BESS into an 8.68×7.97 m SQUARE. The brief HAS the envelope (max_dimensions_mm). Added a
       containerised layout (gated aspect≥3, every other class untouched): main() detects the envelope;
       place_rack_farm lines racks down BOTH walls + wraps the BoP into the same rows + shell at true 40-ft
       dims; place_all gets a _place_container flat-pack for non-rack-farm containerised classes; optimiser
       skipped when containerised. VERIFIED by render: 8.68×7.97 → 12.7×2.9 m container-shaped.
  ✓ 4. COMMODITY OVER-PRICES (5 commits) — cost £2,963/kWh → £206/kWh (£617k, INSIDE the benchmark
       £600-950k envelope). TWO recurring bug families (drawer forgeos_unit_confusion_and_corpus_mismatch):
       (a) UNIT-CONFUSION: rating_kw read "150 L/min" as 150 kW → pump £210k→£3.3k (commit b321236c9).
       (b) MICRO-COMMODITY floor/cap: cell busbar £120-floor→£3 (£448k→£11k); tap wire/pad reel-price
       capped £12 (£371k→£90k) (commits 18b62a274, 56e1e9b2d). (c) CORPUS-LIFT class-mismatch: module
       frame £40→£34k×15 + cold plate £700→£19k matched to large-component refs → rejected when target
       >£10k & orig <£1k (commit 56e1e9b2d). All guarded by requirements_bom.py --selftest.
REMAINING, IN ORDER:
  2. B1 — flip sanity gates ENFORCING for the clean run: COST_SANITY_ENFORCING=1 BENCHMARK_NET_ENFORCING=1
     (env flags on the run command; no code).
  5. FIX RENDER PLACEMENT — dossier visuals tab (build-excel-export.py ~5683-5702) expects
     00-hero + 02-corner-FR (interior) + exterior/00-hero + exterior/02-corner-FR (a BLENDER_PLANT_SHELL=1
     pass to <run>/exterior/ that isn't being produced → only interior shows). Best fixed AFTER the
     re-run produces the real render set. For a CONTAINER, "exterior" = the closed 40-ft container shell.
  6. CLEAN BESS RE-RUN (`npx tsx scripts/serial-design-chain-v2.tsx briefs-loop/bess_grid_storage.md
     out/bess-clean`, ~45 min, NEEDS TRISTAN'S GO-AHEAD — deliberate compute spend) with the B1 flags →
     run the benchmark net → must read OK/within-envelope BEFORE shipping → THEN export the Exec-Summary
     cover as the LinkedIn one-pager + cherry-pick the commercial commits (e12f5a342 funnel, 5c65befb9
     breakdown, c2af05c59 cover) onto origin/main (prod).
SESSION COMMITS (8, all on oxccu-efuel): 3f9c3ea23 (net→gate36) · c3eb265f8 (no-PDF guard) · 8f7bc85c3
(capacity→m³) · f35178660 (GA container-fit) · b321236c9 (rating_kw unit) · 18b62a274 (busbar floor) ·
56e1e9b2d (corpus-mismatch + micro-cap). NO background processes. All committed.
Drawers: net design 604abf87e23f3f51, GLM-5.2 token squeeze 058a933ac8f135ff, BESS showcase e83ec8ec10e9d32f,
Tristan voice = historyfuturenow.com 267ce26369937301. NO background processes running. All code committed.

═══════════════════════════════════════════════════════════════════════════════
## ⭐⭐⭐ POST-COMPACTION RESUME #3 — READ FIRST (2026-06-24, pre-compaction #3)
═══════════════════════════════════════════════════════════════════════════════
**THE SESSION PIVOTED to WEBSITE / MONEY (Fractional Forge commercialisation). Engine work is in
a good state (parked). After compaction, resume the COMMERCIAL thread.**

### THE STRATEGY (agreed with Tristan — don't re-litigate)
Fractional Forge thesis: help a hardware-software startup go design→manufacturable in a fraction of
time/people/cost. THE DOSSIER IS THE WEDGE (one-sided, sells day one, no network). Everything else is
a CONCIERGE LADDER one customer climbs: £100 dossier → experts the dossier flagged (10% of per-diem via
Stripe) → RFQs to suppliers (paid) → fundraising help (%). THE WEBSITE = a MAP that SHOWS the whole
journey but only TRANSACTS the dossier; every later rung is a "request this" CTA Tristan fulfils BY HAND
until demand repeats. Tristan's circle = building instead of SELLING; the cure = sell 5 dossiers this week
(manually) + the 5-investor validation test, and let those customers' questions dictate what to build.
Anchor doc: FRACTIONAL-FORGE-RELAUNCH-PLAN.md (mostly WIRING not building — Stripe billing, marketplace,
supplier matcher, 29k suppliers all ALREADY BUILT).

### DEPLOY: main IS PROD (Tristan confirmed). Website code is IDENTICAL on oxccu-efuel and origin/main —
the 147-commit gap is ALL engine R&D. To ship a web fix: CHERRY-PICK only the isolated commercial
commits onto origin/main (keep engine R&D off prod). Vercel auto-deploys main.

### COMMITTED THIS TURN (commercial), on oxccu-efuel — STILL NEED CHERRY-PICK TO main TO DEPLOY:
- PUBLIC_ROUTES funnel fix: /about /contact /story /case-study /sample-package /investor-readiness
  /preview-landing made public (were bouncing anon visitors to /login — funnel-killer). src/lib/supabase/middleware.ts.
- f7039600c UNIVERSAL instrument-pricing fix: field instruments (probe/sensor/meter/gauge) were
  inheriting a co-located vessel's material take-off → a CO2 pH probe priced £62,529 (~£250k phantom/
  dossier). Added them to AUXILIARY_GUARD in scripts/lib/cost/bom-cost-grounding.ts. 39 tests pass.
  ⚠ Re-prices on the NEXT chain run — existing dossiers still have the £62k probes baked in.

### ⭐ BESS SHOWCASE + QUALITY/SANITY-NET ARC (2026-06-24, the live thread)
PUBLIC SHOWCASE = BESS (drawer forgeos_decisions_e83ec8ec10e9d32f): CO2 confidential (client brief),
SAF→OXCCU, fish→FishFrom. Fresh clean-room brief `briefs-loop/bess_grid_storage.md`. The 20 MWh/5 MW
version FAILED G0.5 (engine's BESS archetype caps at ONE ~2.9 MWh container, can't scale to multi-
container — a real engine limitation). RIGHT-SIZED to a single 3 MWh/1.5 MW 40-ft container → G0.5 PASS.
THEN Tristan inspected the output and found CLEAR quality bugs (I'd been watching logs, NOT output —
process failure):
  1. COST ~10× over (£2,963/kWh). Root: corpus-median-lift + floors over-pricing per-cell COMMODITIES.
     FIXED A1 (ef9986f2f): commodity-noun lift-skip (busbar £452→£120, BoM £4.67M→£2.42M = £806/kWh).
     STILL ~2.7× over — remaining whack-a-mole over-prices: module steel frame £34k×15, cooling pump
     £105k×2, cold plate £19k, cell tap wire £59×3750, busbar £120 floor still high. THESE STILL NEED FIXING.
  2. BUSBAR VOLUME = 350 m³ (should be ~0.07) → GA drawing doesn't fit the 40-ft container (mass DOES
     fit: 29,875<30,480 kg, so it's a GEOMETRY/volume bug not overflow). A2 NOT YET FIXED — find the
     busbar volume computation.
  3. RENDERS: 33 PNGs exist but the dossier places only ~1 internal (expected 2 internal + 2 external) —
     recurring placement bug (same as the CO2 "4 images, 1 shows"). A3 NOT YET FIXED.
  4. `costSanity=HIGH` FIRED but is SHADOW → engine KNEW and shipped anyway. B1 = flip the existing
     sanity gates to ENFORCING (COST_SANITY_ENFORCING=1 etc.) — the "pull back", already built, NOT YET ON.

⭐⭐⭐ BENCHMARK NET — FULL VERSION DONE (4bc58388a, supersedes the cost-only 20987f432). 3 anchors
(COST + SIZING + COMPONENT) + AUTO-DIAGNOSE all working. On out/bess-clean it auto-flagged cost 9.4×,
sizing total 7,711 m³ vs 160 m³ (48×), and the auto-diagnose (grok-4.3) pinpointed the SYSTEMIC ROOT
CAUSE: ~6 components carry 50-250× too-large VOLUMES (busbar 350 m³, PTC heater 250 m³, coolant 200 m³,
pump 150 m³, chiller 86 m³, grounding 50 m³) — NOT one busbar; a pervasive component VOLUME-ATTRIBUTE
bug in the emitter/sizing. Also LLM-flagged a genuinely MISSING fire-suppression subsystem. Design rules
in drawer forgeos_decisions_604abf87e23f3f51; GLM-5.2 token/latency squeeze in forgeos_gotchas_058a933ac8f135ff
(empty at low max_tokens, timeout at high → diagnose uses grok-4.3 4000tok/180s, generation GLM-5.2 6000tok).
REMAINING on the net: WIRE INTO CHAIN (generate at brief, compare post-cost, record state.benchmarkDivergence,
optionally gate when enforcing).

⭐ (historical) generative benchmark SANITY NET v1 cost-only (B2, 20987f432):
`scripts/lib/benchmark-expectation.ts`. An LLM (z-ai/glm-5.2, the most capable; BENCHMARK_MODEL overrides)
generates a TOP-DOWN market benchmark (expected cost/output/BoM-mix) from the brief; diffed vs the
deterministic engine; RADICAL divergence (≥2.5×) → auto-flag + "full check". INDEPENDENCE PRINCIPLE
(load-bearing): benchmark is TOP-DOWN (market gestalt £/kWh) vs engine BOTTOM-UP (sums parts) — prompt
FORBIDS itemise-and-add so it can't reproduce the engine's arithmetic bug. UNIVERSAL (no hardcoded band,
unlike gate 32). VERIFIED: on out/bess-clean GLM-5.2 said £600-950k, flagged engine's £8.89M as RADICAL
11.9×. CLI `npx tsx scripts/lib/benchmark-expectation.ts <out-dir>`, --selftest passes. REMAINING: WIRE
INTO THE CHAIN (generate at brief, compare post-cost, record state.benchmarkDivergence, optionally gate).

NEXT (this arc, in order): wire benchmark net into chain + B1 enforce + A1-remainder over-prices + A2
busbar volume + A3 render placement → then a clean BESS re-run that passes the benchmark → THEN the
LinkedIn one-pager. Do NOT ship the BESS dossier until the benchmark verdict is OK/within-envelope.

### ✅ DONE since RESUME #3 (commercial commits, on oxccu-efuel — need cherry-pick to main):
- 5c65befb9 COST-BREAKDOWN OVERVIEW — "Where the money goes" capex-by-category table+bars on Overview
  tab (cost_breakdown_by_category in build-excel-export.py; instruments BEFORE vessels in classifier).
- c2af05c59 EXECUTIVE SUMMARY "WOW" COVER — new FIRST tab (gridlines off, hero, headline cards
  WHAT/OUTPUT/COST/STATUS, cost breakdown, what's-inside, concierge ladder). Forced ahead of Contents.
STILL TODO this thread: LinkedIn one-pager (PNG/PDF export of the cover — NEEDS a clean re-run first +
a voice sample from Tristan per the "Writing for Tristan" rules) + website concierge-journey section.
⚠ GATING DEPENDENCY: a CLEAN CO2 re-run (all fixes applied) is needed before the cover/LinkedIn asset
show CREDIBLE numbers — current co2_mineralisation-fix still has the £62k probes + floor 6/10. Deliberate
~20-40min compute spend; confirm with Tristan; do NOT run concurrent with another CO2 chain.

### EARLIER NEXT-BUILD NOTES (kept for the classifier design):
1. COST-BREAKDOWN OVERVIEW (deterministic "where does my money go", % by category). Classifier is
   designed+tested: read parts-ledger.json equipment[].type + line_gbp + connections[] (pipework/
   cabling). Use a richer NAME-based classifier (reboil pot→vessel, dryer→thermal, centrifuge→
   separation, MCC→electrical, skid→structural) — but put INSTRUMENTS/VALVES *before* VESSELS so
   "reactor pH probe"→instrument not vessel. Categories: Vessels/reactors/columns, Heat exchangers,
   Pumps/blowers/compressors, Filtration/separation, Instruments, Valves, Electrical/power, Control,
   Structure, Material-handling, Pipework, Cabling, Balance-of-plant. Put it in the Overview/cover.
2. EXEC-SUMMARY "WOW" COVER TAB (Tristan: first tabs must say "wow", not look like a grid): gridlines
   OFF, big hero render, headline (what·output·all-in cost·1-line verdict), the cost breakdown, "what's
   inside" tab-map, "your next steps" concierge ladder. + a STANDALONE LinkedIn one-pager (PNG/PDF export
   of that summary — you CANNOT post Excel on LinkedIn). build-excel-export.py tab_overview is the base.
3. WEBSITE concierge-journey section (the ladder visible) + DRAFT the LinkedIn post in Tristan's voice
   (British spelling; "I built a system that turns a hardware idea into a full engineering dossier in
   days — here's a real one — DM me"). 
4. ⚠ NEEDS a CLEAN dossier re-run (with the pricing fix) to demo on credible numbers. Do NOT run a 2nd
   concurrent CO2 chain (collision risk). Run ONE deliberate CO2 re-run when nothing else is running.

### NEW BUG FOUND (follow-up): TWO COST SURFACES DISAGREE. The chain's reconcile verdict said
"compatible" for a £2.57M CO2 design vs a £1.90M ceiling (wrong — it's over). state.sweetSpot was
computed from a DIFFERENT cost surface (costStack/costBasis) than readHeadlineCostGbp (£2.57M). A dossier
must not claim "fits your budget" when it doesn't — make the chain reconcile use the SAME authoritative
cost surface readHeadlineCostGbp uses. (Two-cost-surfaces gotcha: costBasis ≠ requirementsBom.)

### ENGINE STATE (parked — proven, don't redo): cost/output OPTIMISATION done — sweet-spot scoping
(65efb64a9 core, 757807edb wiring: brief primary_objective field + cost_sanity defer + dossier display)
+ #47 design-to-target CLOSED LOOP logic complete (951835e8d core root-finder, 320802ccb orchestrator+
DESIGN_TARGET_SCALE chain override, e5605658b auto-trigger smart entry point `npx tsx scripts/design-to-
target-run.ts <brief> <outdir>`, 4db0acd47 metrics-scaling fix). RAS scale-0.5 run PROVED the override
genuinely resizes the real design (production/biomass/capex all halved). The CO2 soak was KILLED (slow
~1hr/round, core already proven). Remaining: #46 Phase-2 structural-lever scenarios; a full real soak (low
priority). Drawers: design-to-target 5aef0031a66f777c, two-layer decision b543c1f04089e9d1.

═══════════════════════════════════════════════════════════════════════════════
## ⭐⭐ POST-COMPACTION RESUME — READ FIRST (written 2026-06-24 pre-compaction #2)
═══════════════════════════════════════════════════════════════════════════════
**You were compacted mid-feature. THE NEXT BUILD = task #47: the DESIGN-TO-TARGET CLOSED LOOP
(the "accurate layer" of the cost/output optimisation). Tristan said "get ready to compress…
resume after." After compaction, confirm-or-start #47.**

### WHAT THIS FEATURE IS (cost/output optimisation — the engine's real job)
A brief is a WISH-LIST, can ask incompatible things (1M t/yr for £1). The engine must RECONCILE by
the brief's stated `primary_objective` (cost_min | output_max | balanced) and find the SWEET SPOT.
TWO LAYERS (decision drawer `forgeos_decisions_b543c1f04089e9d1`):
- **Layer 1 = SCOPING (DONE + committed):** `scripts/lib/sweet-spot.ts` reconcile() — an ANALYTICAL
  six-tenths frontier Capex(Q)=Capex_ref·(Q/Q_ref)^0.65 picks the approximate target per objective.
  Commits: core 65efb64a9; wiring (brief primary_objective field + chain state.sweetSpot + cost_sanity
  DEFER + dossier Financial-model display) 757807edb. Verified: CO2→incompatible (365 t/yr@£2.54M vs
  £1.90M ceiling → balanced 302 t/yr), RAS→compatible. `npx tsx scripts/lib/sweet-spot.ts --selftest`.
- ⚠ **Layer 2 = #47, NOT YET BUILT (Tristan's key correction):** the six-tenths law is CRUDE — at a
  different scale the DESIGN is genuinely different, so the estimate is close-ish but NEVER the real
  number. The accurate answer: take the chosen target, RE-RUN the full chain at that scale, measure
  ACTUAL (output, cost), and LOOP on REAL data (secant root-finding — real points replace the 0.65
  assumption after round 1) until converged (±tol or ~4 rounds). This AUTOMATES the manual RAS-£5M
  iteration (Tristan nudges productivity/scale by hand to land on £5M). Expensive (2-4 full ~20-min
  runs) but ONLY on the committed design.

### HOW TO BUILD #47
- Read: scripts/lib/sweet-spot.ts (gives rescale_factor + frontier), state.sweetSpot (recorded by the
  chain), readHeadlineCostGbp + deriveOutputDenominator (src/lib/pdf-engine-v2/lib/independent-cost-
  sanity-audit.ts). The cost_sanity DEFER in serial-design-chain-v2.tsx (~line 2416, triggers on
  state.sweetSpot.verdict==='incompatible') is the Layer-1 STOPGAP that "excuses" the cost — Layer-2
  must REPLACE it with redirect-to-redesign-at-reconciled-scale.
- FIND how the chain sets its target SCALE (the brief target_performance / contract capacity) so the
  loop can re-invoke the chain at a NEW output target. The loop re-runs the chain (a real run) per round.
- Don't auto-loop on every option — only on the chosen/committed design. Tie expensive runs to the
  cost-discipline (Tristan picked QUEUE not auto-dispatch for the coverage heartbeat — same spirit).

### ALSO DONE THIS SESSION (committed — DO NOT redo). Branch oxccu-efuel.
Loop strengthenings #1-#5: lesson-loop→failure-ledger+invariant-stubs (2dcab4d38), DB-first class-
standards for unseen archetypes flag-gated STANDARDS_DB_LIVE (a868461d8), executable preflight
(76c94fc0c), £0 coverage-heartbeat queue + enforcing-drain (76e74c823). CO2 tank fixes: absorber
DN300×24.5 + distillation height + crystalliser cone_vessel primitive (9697ff072) + cone-shape
ancillary fix (68cc1f4ff). Connectivity/cabinets/connector-deck (8933c1280), 4 renders + m³ tank
geometry (806508e9a), Excel consolidation 38→30 one-Ledger+Financial-model (038a9b551). Genset 5000kVA
verified. CO2 quality-loop runaway was KILLED (was spinning zero-delta on cost_sanity=2 — the tension
this whole feature fixes).

### GOTCHAS (drawers): CLAUDE.md "corpus tables" table is STALE — specs/standards writeback IS live
(30315e18e07d8262). The connectivity audit must read connection-LEDGER.json not -schedule.json
(6e97dd8ef132a01f). Blender m³-only dims silently box-collapse; exterior renders gated BLENDER_PLANT_
SHELL=1 (311bbdbc0c2e0f3f). Excel tab-consolidation decision (3258f6dbb4806e29). 338-341 project tsc
errors are PRE-EXISTING baseline (chain runs via tsx) — don't chase.

### TASKS: #41 follow-ups (fix stale CLAUDE.md table, #2 writeback slice, soak flags), #46 Phase 2
(structural-lever scenarios: layout/lean/intensify), #47 Phase 1.5 design-to-target loop = THE NEXT
BUILD. #42-45 done. Open Q to Tristan (asked, unanswered): start #47 now vs pause — he chose compress,
so resume into #47.
═══════════════════════════════════════════════════════════════════════════════

═══════════════════════════════════════════════════════════════════════════════
## ✅ COMPLETED 2026-06-24 — #27/#29/#31/#32 ALL DONE + VERIFIED (commit 8933c1280)
═══════════════════════════════════════════════════════════════════════════════
ROOT CAUSE of false connector orphans: parts_ledger.py audited connection-SCHEDULE.json
(sized cables/pipes only, NO signal) instead of the AUTHORITATIVE connection-LEDGER.json
(full graph). Fixed → parts_ledger reads both. Drawer drawer_forgeos_gotchas_6e97dd8ef132a01f.
Other universal fixes (all Blender-side): distribution-spine classifies power transformer as
a series stage + chains boards main→MCC + safety-relay/motor-protection taps; cl.close_residual_
completeness self-healing net (service-aware dedup so signal can parallel power); _classify
matches \bmeter\b (density meter was typing as vessel); make-up tank = origin; relief valve exempt.
#29 cabinets: parts_ledger._build_cabinets houses small power/control devices. #32: Excel
"Cabinet schedule" tab proves per-cabinet contents + in/out connectors + all-connected verdict.
VERIFIED all 3 (SAF/RAS/CO2): parts_ledger=0, strict ledger=0, integrity=0, all cabinets proven.
#31: FRESH RAS chain re-run (out/ras-genset-verify) → genset 2500→5000 kVA (fix applied),
ledger COMPLETENESS ✓ all 83, cabinets all_proven, Excel built+opens. Chain exit 20/21 =
render-and-flag distributor-reality disclosures (un-catalogued MPN + 1 mispriced line),
PRE-EXISTING, orthogonal to this work. Dossiers in ~/Downloads/{SAF,CO2,RAS}-cabinet-connectors-v*.xlsx.
REMAINING (optional): re-run SAF+CO2 chains to apply genset fix to those examples too (universal,
already validated on RAS); cabinet auto-assignment is deterministic but cosmetic (a few empty cabinets).

═══════════════════════════════════════════════════════════════════════════════
## ⭐ POST-COMPACTION RESUME — (superseded by the COMPLETED block above)
═══════════════════════════════════════════════════════════════════════════════
**You were compacted mid-task. Tristan said "yes, proceed" with the LAST remaining piece:
close #27's connector gaps + build #29 cabinet grouping, UNIVERSAL, verified by SINGLE controlled
chain re-runs. Resume that. Archetypes: e_fuel_synthesis(SAF) / aquaculture_ras(RAS) / co2_mineralisation(CO2).
Out dirs: `out/<arch>-fix/`. Briefs: `briefs-loop/<arch>.md`. Preserved clean states: `out/<arch>-fix/state.iter1.json`.**

### ALREADY DONE — 6 universal fixes COMMITTED (do NOT redo): worked-calc-static (Excel opens),
PDF-audit-gate-skip (no false exit-10), genset cap-undersizing, tool-provenance DAG (#26 ✅), connector-proof-
UNIVERSAL (#27 proof ✅: CONN0 + Excel Connection-trace deck now read parts-ledger.json::connectivity for ALL),
render-palette (#28 ✅: desaturated MODULE_EQUIP_COLOURS → killed parts-vomit; CO2/SAF renders now clean).
### 7 VERIFIED NON-BUGS — do NOT re-chase: cost-sanity (works, field cost_per_output_unit), mpn-shape (intentional),
degasser qty-22 (correct=4×turnover), economics £22/kg (grounded kingfish), physics_fidelity (LLM advisory),
biofilter HRT (MBBR sized by TAN load not HRT), heater #148 (deliberate 50% standby + 85% HEX covers it). (#30 ✅)

### THE TASK: close #27's 12 gaps (RAS 0, SAF 5, CO2 7) + #29 cabinet
**#27 ELECTRICAL gaps (7 of 12, the bulk) ROOT CAUSE (traced):** parts_ledger.py audits `connection-schedule.json`
for connectivity.concerns. That file is written by `build_universal_scene.py` (~L5396, authored ~L5294) and its
electrical power edges source from a GENERIC "Electrical Supply" boundary (pattern at build_universal_scene.py:3216
`electrical_supply|grid|mains|incomer`) → loads, BYPASSING the real transformer→switchgear→busbar/MCC, which then
read as orphaned (no in/out). (connection_ledger.py::close_power_directions DOES wire a hub→loads but writes to
connection-ledger.json which is Blender/RAS-only — SPLIT authoring, NOT what parts_ledger reads.) **FIX:** in
build_universal_scene.py make the connection-schedule power edges route the DISTRIBUTION HIERARCHY
grid/genset→transformer→switchgear→busbar/MCC/distribution-board→loads (load spurs source from the board, not the
boundary). Blender-side → verify by RE-RENDER then re-run parts_ledger → CONN0 n_concerns drops.
**#27 PROCESS gaps (5 of 12):** some are MIS-CLASSIFICATION fixable in parts_ledger.py (no chain re-run): R-109
"slurry density meter" is typed `vessel` (should be instrument); I-101 "pressure-relief valve" not in the
AIR_OR_SUBCOMPONENT exemption (parts_ledger.py:504-518) — add relief-valve/density-meter/instrument-on-line. Others
(C-101 column feed, K-103 compressor out, V-102 filter out, TK-101 tank feed) are real topology ties.
**#29 CABINET (new synthesis feature, no existing grouping):** in `engineering-contract.ts`, identify SMALL
control/electrical parts (size<~700mm + type instrument/breaker/relay/marshalling/PLC/IO) → HOUSE in a cabinet
(control/marshalling for I&C; distribution-board/MCC for power) → emit cabinet as BoM/render unit + parts as contents
(new parent_tag field; manifest/BoM/render honour it). COUPLED with #27-electrical (the board IS the distribution hub).
RAS scatters 30 small parts/0 cabinets; CO2/SAF have a few. Chain-re-run-verified.

### COMMANDS (verified working)
- RENDER one (≈1-2min): `INSPECT=0 BLENDER_OUT_DIR=out/<arch>-fix STATE_JSON=out/<arch>-fix/state.json /opt/homebrew/bin/blender --background --python scripts/blender-universal/build_universal_scene.py -- out/<arch>-fix/state.json` (writes 00-hero.png; view it with Read).
- REBUILD Excel: `.venv/bin/python scripts/build-excel-export.py out/<arch>-fix out/<arch>-fix/dossier.xlsx`
- SINGLE chain re-run (≈25min, PDF off, Excel-only): `npx tsx scripts/serial-design-chain-v2.tsx briefs-loop/<arch>.md out/<arch>-fix` — ⚠ NEVER use scripts/run-3-example-loop.sh (the 3-concurrent runner RAN AWAY: overlapping/restarting chains).
- VERIFY CONN0: `.venv/bin/python -c "import sys,json;sys.path.insert(0,'scripts');import deterministic_checks_lib as d;[print(a,[c.actual for c in d._checks_connectivity(json.load(open(f'out/{a}-fix/state.json')),f'out/{a}-fix') if c.producer=='conn:ledger_completeness']) for a in ['e_fuel_synthesis','aquaculture_ras','co2_mineralisation']]"`
- VERIFY provenance: load dossier.xlsx 'Tool provenance' tab, Status col should be USED (0 ORPHANED).
- GAPS list: `parts-ledger.json::connectivity.concerns` per out dir.

### BRANCH: on `oxccu-efuel` (6 fixes committed here). origin/main canonical but pre-push hook fails on
PRE-EXISTING jest tests → consolidation deferred. Deliver clean dossiers to ~/Downloads as <arch>-example-vN.xlsx.
═══════════════════════════════════════════════════════════════════════════════


## GOAL (the only done-condition)
SAF (`e_fuel_synthesis`), CO2 (`co2_mineralisation`), RAS (`aquaculture_ras`) each at **≥8 on EVERY
deterministic section** (scorecard floor — the FLOOR, not the average) AND the **Excel numbers
reconcile with the engine's physics computations** (Tristan 2026-06-23: "check the Excel sheet to see
whether all the numbers are actually working relative to the physics you produce"). No PDFs — Excel only.

## IRON RULE — EVERY FIX IS UNIVERSAL (Tristan 2026-06-23)
Fix the ENGINE MECHANISM, never an archetype-specific patch. No `if class == 'ras'`. The fix must make
EVERY unseen archetype better. Per CLAUDE.md: every chain commit adds a `scripts/regression-harness.tsx`
invariant OR a `regression-harness: no-invariant-needed because <reason>` commit line. If a bug recurs,
that means the fix wasn't universal — escalate to the root mechanism.

## LOOP PROTOCOL (detect → route → fix-at-source → invariant → re-run → pass)
Per archetype, each iteration:
1. RUN `npx tsx scripts/serial-design-chain-v2.tsx briefs-loop/<arch>.md out/<arch>-fix` (Excel-only,
   gates SHADOW so it completes + records every score). Runner: `scripts/run-3-example-loop.sh` (3 concurrent).
2. INSPECT (NEVER trust stdout alone):
   - scorecard floor — `out/<arch>-fix/` scorecard/state → every section ≥8?
   - `drawing-gates.json` (G1-G5) + `drawing-gates-punchlist.md`
   - the 13 audits (audit-pdf-*, parts-spec, sizing, etc.) + cost-sanity (gate 32) + tool-archetype (gate 34)
   - **EXCEL-vs-PHYSICS**: open `out/<arch>-fix/dossier.xlsx`, confirm cost surfaces reconcile (BoM Σ ==
     cover total == requirementsBom), the physics-derived quantities (sizing tool outputs) match the
     Calculations tab, Economics has no #DIV/0!/#N/A/blank, brief-compliance units+direction correct.
3. FIX at source, UNIVERSAL + add invariant.
4. RE-RUN. Repeat until every section ≥8 AND Excel reconciles.

## KNOWN ISSUES from the 2026-06-23 audit (starting work-list — verify against the fresh re-run)
UNIVERSAL (all 3 — highest leverage):
- [ ] `parts-ledger grand_total_gbp` exports as 0 → cost-reconciliation Check shows false FAIL though BoM reconciles. (build-excel-export)
- [ ] Economics tab shows #DIV/0!/#N/A/−NPV/blank when sale price is £0/absent → show LEVELISED COST instead of a broken revenue/NPV block. (engine economics + excel)
- [ ] Brief-compliance bug class: (a) MAX-constraints (≤) checked as must-meet (≥) → compliant designs spuriously FAIL; (b) unit-conversion misses (kW-vs-MW "3000 MW", fraction-vs-% "0.6% vs 60%"); (c) value+unit stream-matcher conflates different streams (K2SO4=gypsum). (brief-constraint-completeness-audit + compliance renderer + metric matcher)
SAF: economics display (above); feedstock cost £0 omits H2/CO2 opex (dominant) → levelised cost understated.
CO2: Economics blank; hero render "part-vomit" (universal-procedural fallback — needs bespoke template OR the template-adapter path); wrong brief-compliance matches.
RAS: cover Floor 0 / connectivity 0 / physics-fidelity "severe implausibilities (pump/velocity/generator)"; capex stated 3 ways + £5M-vs-£50M ceiling (capex-ceiling fix already committed — verify it took); over-replication (22 degassers/23 pumps); revenue £22/kg — VERIFY independently (kingfish sashimi ≠ salmon; audit benchmarked vs salmon, may be wrong).

## STATUS (after iter-1 baseline)
| Archetype | iter-1 | Excel opens | self-audit | cost £/t·yr (manual, all in-band) | drawing-gates fail |
|---|---|---|---|---|---|
| SAF | exit10(false) | ✅ v7 | 7 | £14.8k (band 12-60k) ✅ | panel load_reconcile |
| CO2 | exit10(false) | ✅ v7 | 7 | £7.0k (band 1.5-10k) ✅ | BFD legibility 4.3:1 + 1 |
| RAS | exit10(false) | ✅ v7 | 4 ⚠ | £47.8k (band 10-55k) ✅ | qty_coverage (degasser 22→manifest 1) ×4 |

## DONE (universal, committed, verified)
- **worked-calc results → STATIC** (build-excel-export): kills the recurring SAF sheet14 corruption for EVERY
  archetype (no worked-calc can emit an Excel-invalid formula). Proven: 0 non-cell-ref Calc formulas, LibreOffice
  drops 0, CO2 regression clean. The prior v6 was per-FILE (not universal) — chain regenerated the break.
- **PDF-audit gate skipped when no PDF** (serial-design-chain-v2): the exit-10 "chain-v2.pdf missing" false-fail
  blocked EVERY Excel-only run. Now BoM validated by Excel ⚠Checks + state-based gates.

## CORRECTIONS (verified non-bugs — do NOT chase)
- ~~cost-sanity headline=None~~ = MY FIELD-NAME MISREAD. computeCostSanity WORKS: real fields are
  `cost_per_output_unit` + `headline_cost_gbp` + `direction` (not headline_per_unit/ratio). SAF verified
  in_band £14,832/(t·yr) PASS. Costs are sane. NOT a bug.
- mpn-shape missing module (Stage 10.6 "Cannot find module") = INTENTIONAL. git a86f921b1 reverted it
  ("it activated a CRASHING Stage 10.6"). DO NOT recreate — re-introduces the crash. Warning benign; gate 20 backstop.

## iter-2 (engine cc793c946) — foundational fixes CONFIRMED
- SAF exit=0 (was exit 10) + Excel 0 invalid / 0 Calc-nonref → BOTH committed universal fixes work END-TO-END.
- CO2/RAS heavier iter (~40min, progressing not stuck: CO2 Blender CAD, RAS BoM pricing).

## CONSOLIDATED VERDICT (after rigorous per-issue verification)
The 2026-06-23 audit MASSIVELY over-flagged. Verified NON-bugs (do NOT chase): cost-sanity works;
mpn-shape intentional; degasser qty-22 CORRECT (recirc 39,296=4× tank-vol 9,824 per brief); economics
£22/kg grounded-correct for sashimi kingfish; physics_fidelity LLM number is advisory. The examples
now WORK (open, costs in-band: SAF £14.8k/CO2 £7.0k/RAS £47.8k per t·yr). 2 REAL blockers FIXED+verified
(worked-calc static, PDF-gate-skip). 
THE genuinely-real remaining issue = RAS physics-SIZING (Physics Critic high/high, deterministic):
  (a) GENSET 2500 kVA vs 3784 kW life-safety load (~1.9× undersized) — universal sizing-rule fix (size to load/PF).
  (b) BACKUP HEATER 1649 kW vs 3254 kW make-up heating — = KNOWN memory #148 (makeup-heating/heat-pump
      cascade, flagged "needs Tristan, risky"). DO NOT auto-fix blind — flag for Tristan.
  (c) BIOFILTER single 451 m³ @ 39,296 m³/h → HRT 41s (grossly undersized). The biofilter is the wrongly-
      SINGLE unit (NOT the degasser, which is correctly ×22). Universal fix: size biofilter to a real HRT
      (parallel-replicate like the degasser, or size the tank to flow). 
SAF/CO2 self-audit 7 (closer to 8). Drawing-gate fidelity gaps (RAS qty manifest-rep, SAF panel reconcile,
CO2 BFD legibility) are DEEP Blender-manifest fixes needing ~55min re-runs to verify.

## NEXT (prioritised, do carefully + tested, add invariant each)
0. RAS genset sizing (size to life-safety load ÷ PF) + biofilter sizing (size to proper HRT / replicate) —
   UNIVERSAL root-cause sizing fixes; the genuine ≥8 blockers. FLAG the heater (#148) for Tristan, don't auto-fix.
1. drawing-gates (the deterministic ≥8 DRAWING condition) — fix at each gate's named stage:
   RAS qty_coverage (degasser contract qty 22 vs parts-manifest 1 — BUT verify 22 isn't over-replication
   first: a 600t RAS shouldn't need 22 degassers — likely a SIZING bug in universal-contract-sizing.ts, not
   a manifest-replication gap); SAF panel load_reconcile (panel Σ vs connected_electrical_load_kw); CO2 BFD
   legibility 4.3:1 (multi-sheet wrap in the BFD draw-script — universal: any >4:1 diagram).
2. economics `is_ras`/£22 per-class hardcode → ONE universal path: verified sale price → revenue/NPV, else
   LEVELISED COST (not #DIV/0). Pervasive refactor (is_ras at L2424-2433/2469/2723/2752/2777) — careful + tested.
   NOTE £22/kg is plausible for kingfish (premium) so it's a code-smell, not a wild number.
3. drawing-gates: RAS qty_coverage (parts-manifest must replicate qty-N principal nodes, not collapse to 1 —
   universal manifest-expansion fix); SAF panel load_reconcile (panel total vs connected_electrical_load_kw);
   CO2 BFD legibility (multi-sheet wrap in draw-script). Each names its fix-stage.
4. RAS self-audit 4 (deeper design quality) — investigate after 1-3.
- NOTE: scorecard-floor key empty in state — find where the deterministic floor is recorded (selfAudit is the LLM one).

## BRANCH DRIFT (resolve when work is clean)
Working in the `oxccu-efuel` linked worktree; canonical = `origin/main` (separate worktree at
`CentaurOS created 260126 1435`, on `main`). HEAD is 126 ahead of origin/main. Pre-push hook runs
lint+jest; **jest currently FAILS** (blocker — diagnose: likely pre-existing council-scorer tests).
Per memory `forgeos_one_engine_on_main_anti_drift`: consolidate to main. PLAN: once the loop's fixes
are committed + jest green (or failures confirmed pre-existing + unrelated), `git push origin HEAD:main`
to fast-forward main (it's a strict ancestor), then work on main. Do NOT force a 126-commit deploy mid-broken-examples.

## ROOT-CAUSE FINDINGS (for precise universal fixes — apply AFTER iter-1 baseline lands)
### #1 ECONOMICS (universal, highest leverage) — `scripts/build-excel-export.py` ~L2356-2450, 2567-2730
- ROOT: `_ECON_DEFAULTS["sale_price_ras"]=22.0` + `feed_price_ras`/`fcr_ras` + the `is_ras` branch (L2424) is a
  PER-CLASS HARDCODE — this IS the audit's "£22/kg". Violates the universal rule.
- NONE of the 3 contracts carries a verified sale price (`grep` of 0.5-engineering-contract.json: SAF only
  `saf_output_tonnes_yr`, RAS only `annual_production_t_yr`, CO2 none). Generic path (L2631) → sale 0 → CO2/SAF
  #DIV/0!/#N/A/−NPV. SAF brief's "£2,200/tonne" is a COST TARGET, not a sale price (the deliberate £0 fix).
- UNIVERSAL FIX (do tested, post-baseline): delete the `is_ras` price hardcode + `sale_price_ras`/`feed_price_ras`/
  `fcr_ras`; ONE path. If a VERIFIED sale price exists (brief/contract/commodity lookup, `sale_price_verified`) →
  revenue/EBITDA/NPV/IRR. ELSE → render a LEVELISED COST view (£/output-unit = (annual opex + annualised capex)/output;
  always computable, honest for a first-commercial plant) — NO #DIV/0, NO fabricated NPV, NO £/kg stub.
  INVARIANT: no per-class price literals in build-excel-export; economics renders levelised-cost (not #DIV/0) when
  `sale_price_verified` is False. TEST: run build-excel-export on a complete state (saf-example) → valid xlsx, no #DIV/0.
### #2 grand_total_gbp=0 (cost-reconciliation false-FAIL) — build-excel L1922; check parts_ledger.py grand_total OR derive from BoM Σ.
### #3 brief-compliance bug class — direction (≤ vs ≥), unit-conversion (kW/MW, fraction/%), stream-matcher conflation. (brief-constraint-completeness-audit + compliance renderer)
### #4 CO2 part-vomit render (bespoke template / template-adapter); #5 RAS over-replication + connectivity-0 + physics-fidelity.
DISCIPLINE: every build-excel edit TESTED on a complete saved state before relying on it (the in-flight chains call it as a subprocess at their end).

## SESSION RESULT (autonomous, 2026-06-23 night)
THREE universal fixes committed: (1) worked-calc results static → all Excels open [verified end-to-end:
SAF iter-2 exit=0 + 0 invalid]; (2) PDF-audit gate skipped when no PDF → no false exit-10 [verified: SAF
exit=0]; (3) genset never silently undersized (cap→round-up) [math-verified 4730→5000 kVA; NEEDS an
end-to-end re-run to confirm the RAS critic clears].
SIX "issues" DEBUNKED as non-bugs (verified each — do NOT chase): cost-sanity works (field-name misread);
mpn-shape missing is intentional (reverted, crashes if recreated); degasser qty-22 correct (=4× tank turnover
per brief); economics £22/kg grounded-correct for sashimi kingfish; physics_fidelity LLM score is advisory;
biofilter "HRT 41s" is a critic misread (MBBR correctly sized by TAN load / media area, not HRT).
ONE genuine NEEDS-TRISTAN: backup heater 1649 vs 3254 kW make-up heating = known memory #148 (heat-pump
makeup-heating cascade, flagged risky — do NOT auto-fix).
EXAMPLES NOW WORK: all 3 Excels open; costs in-band (SAF £14.8k / CO2 £7.0k / RAS £47.8k per t·yr); designs
largely sound. The 2026-06-23 audit's "FIX FIRST / not investable / part-vomit" verdict was substantially
OVER-STATED (6 of its flags were non-bugs).
REMAINING (slow / Tristan): genset end-to-end re-run verify; drawing-gate FIDELITY (RAS manifest qty-rep so
the GA shows 22 degassers not 1; CO2 BFD multi-sheet wrap >4:1; SAF panel load_reconcile) — deep Blender,
~55min/re-run; heater #148 (Tristan).
RUNAWAY NOTE: the 3-concurrent runner (run-3-example-loop.sh) ran away on iter-2 (overlapping/restarting
chains, >75min vs 27, process count 15→24) — KILLED. Use a SINGLE controlled chain for re-runs; investigate
the runner's restart/duplicate behaviour before re-using it.

## LOG
- 2026-06-23 ~20:35 — launched iter-1 of all 3 (bg `scripts/run-3-example-loop.sh`); poll `out/loop-status.txt`.
- 2026-06-23 ~20:45 — confirmed all 3 chains healthy (PA Stage 3, correctly classified). Root-caused the #1 universal
  bug (economics is_ras/£22 hardcode + no-sale-price → levelised cost). Holding edits until iter-1 lands (test vs complete states).
