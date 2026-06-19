# RAS FLOOR-8 TRACKER — single source of truth

> **Deadline: FishFrom demo, Monday 2026-06-22.** Sole agent (GLM/OpenCode stood down 2026-06-19).
> **Goal:** RAS as the working example — every quality-scorecard section ≥ 8 on the **dashboard + parts ledger + Blender + 8 drawings**, physics correct. NOT the customer PDF.
> **Universal by construction, RAS-validated:** every fix is universal (no `if ras`), but only RAS is driven/validated before Monday.
>
> **DEFINITION OF DONE:** a row is **VERIFIED** only when a **FULL chain run**'s `quality-scorecard.json` shows the section ≥ 8, cited with run dir + commit SHA. Isolated re-renders are signal only (drawer `forgeos_gotchas d66c890e`). Claimed ≠ Verified.
> **Check in 10s:** `bash scripts/verify-floor.sh`

## Baseline — VERIFIED 2026-06-19 (`out/ras-v26-verify`, git `df27cabac`)
`floor=2 mean=7.5` · tool_archetype 2 · physics_fidelity 4 · connectivity 6 · brief_compliance 7 · P&ID 23.6% · BFD 34.8%

---

## ARCHITECTURE (corrected by Tristan 2026-06-19) — LEDGER = single source of truth

```
STAGE 1 — ENGINEERING CONVERGENCE  (pre-Blender · deterministic · tool-driven)   ← the ENTIRE 8/10 won here
  brief → expand → contract → tools → emitter → physics → FULL CONNECTION GRAPH → LEDGER
  ALL scorecard sections converge ≥8 here, INCLUDING connectivity.
  connectivity = the logical graph is complete (every part in+out, every instrument associated,
  every connection's service + logical size) — computed with tools, NO geometry needed.

STAGE 2 — BLENDER  (geometry REALISER, not a designer)
  takes the COMPLETE graph → assigns actual 3D locations → measures actual distances/lengths
  → writes ONLY location + distance back into the LEDGER → re-runs length-dependent sizing/cost
  topology NEVER changes here; Blender only realises + measures.

STAGE 3 — ENGINEERING DOCUMENTS  (8 drawings from the ONE ledger)
  all 8 read the same ledger graph (no divergent sources) → drawing gates ≥8 → defects loop back to Stage 1.
```
**Key consequence:** the connection graph moves OUT of Blender (`build_universal_scene.py` currently routes it) into a deterministic pre-Blender tool. Blender then only adds positions + measured lengths. (Full move = Horizon B; Monday does the minimum to lift connectivity ≥8 without violating this direction.)

---

## SCOPE — two horizons (honest, given 3 days)

**HORIZON A — demo-credible RAS by Monday** (floor→8 + visuals right). Realistic. *Independent confidence: moderate-high that RAS is demo-credible; moderate that all 4 sections hit a clean ≥8.*
**HORIZON B — the full staged re-architecture** (sequential phase-gate, routing fully deterministic pre-Blender, settle-loop closed to the tools, universal validation across CO2/SAF). *After Monday.*

## HORIZON A — increments (ordered for demo impact × tractability)

| # | Increment | Lifts | Files (verified) | Approach (universal) | Proof | Est |
|---|---|---|---|---|---|---|
| 0 | Safety+measure: de-dup `physics_fidelity` (rename gate-33 → `physics_gates`); gate OFF code-fix layer; eyeball Blender hero | honest score | `serial-design-chain-v2.tsx:2405`, `:9083` | rename 2nd push; `MAX_CODE_FIX_CYCLES=0` | `verify-floor.sh` one-per-section; hero judged | 0.5–1h |
| 1 | tool_archetype 2→8 | **floor** | `tool-archetype-coherence-audit.ts` (gate-34 markers), `relevance-sweep.ts` | (a) suppress marine markers for a legit-coastal seawater RAS (false-pos on `heat_pump_source`); (b) stop planner picking `refrigeration-cycle:cop` (cooling tool on a HEATING duty) | full-run tool_archetype ≥8; gate-34 still fires on a real wrong-domain tool | 0.5 day |
| 2 | brief_compliance 7→8 | floor | `render-minimal-pdf.tsx` METRIC_MAP, `brief-constraint-completeness-audit.ts`, contract quantities | classify the 7 "—": map (METRIC_MAP alias) or compute (emit the quantity) | full-run brief_compliance ≥8 | 0.5 day |
| 3 | physics_fidelity 4→8 (ledger SSoT, RAS slice) | floor | `engineering-contract.ts` (pump), emitter, `requirements_bom.py` | emitter READS the contract's authoritative pump kW (kill 107 vs 132 divergence); critic + contract share ONE head model | full-run physics_fidelity ≥8; no emitter↔contract drift | 1 day |
| 4 | connectivity 6→8 (deterministic graph completion) | floor | connection synthesis (pre-Blender), `parts_ledger.py` connectivity, `build_universal_scene.py` routing | complete the connection graph so every process part has in+out + every instrument an association (proc & inst ≥80%); resolve 8 orphans + 28 off-graph (tag collisions) | full-run connectivity ≥8 | 1–1.5 day |
| 5 | Drawings + hero look right for the demo | visuals | `draw_*.py` read the ledger graph; `build_universal_scene.py`/hero | drawings read the ONE ledger (densify P&ID/BFD, legibility ≤4:1); hero non-blobby | eyeball all 8 + hero; drawing_gates ≥8 holds | 0.5–1 day |

**GATE for Monday:** `verify-floor.sh` floor ≥ 8 on a clean full RAS run + every surface (hero, dashboard, ledger, 8 drawings) eyeballed credible.

## Day-by-day to Monday (today = Fri 2026-06-19)
- **Fri (rest):** INC 0 + INC 1 (tool_archetype) + INC 2 (brief_compliance) — the cheap floor wins. Kick a baseline run. Judge the hero.
- **Sat:** INC 3 (physics/pump, ledger-reads-contract) — full run + verify.
- **Sun:** INC 4 (connectivity graph completion) + INC 5 (drawings/hero) — full run + verify floor.
- **Mon AM:** clean demo run; eyeball every surface; `verify-floor.sh` floor≥8; freeze the demo artefact; push to main if the live site is shown.

## HORIZON B — after Monday
Sequential phase-gate (Stage-1 loop → gate → Blender); move routing fully deterministic pre-Blender; close the settle loop to the tools (#95/#135); harness + re-enable the code-fix layer; validate CO2+SAF (#155).

## Log
- 2026-06-19 · baseline + corrected architecture (connectivity pre-Blender) + Monday scope · `out/ras-v26-verify` · `df27cabac` · floor 2 / mean 7.5

### ⏯ RESUME POINT (INC 3, pinned 2026-06-19) — start here next session
ROOT CAUSE (sharpened by the Excel ⚠Checks tab 2026-06-19): TWO basis conflicts in the pump word. (a) FLOW: 1,336 = 13,360 ÷ 10 is a per-TANK inlet flow (10 rearing tanks) mis-used as the pump per-unit, but there are 8 pump TRAINS → 8×1,336 = 10,688 ≠ 13,360 (per-tank ÷10 vs per-train ÷8). (b) POWER: the pump-sizing worked-calc computes on the FULL 13,360 loop (≈983 kW hydraulic / 1,217 kW motor) while the contract stores PER-PUMP (67,687 W / recirc_pump_motor_kw 132). Emitter and contract disagree on basis. FIX: carry ONE consistent basis = PER-PUMP (flow 13,360÷8 = 1,670; power = full-loop ÷ 8, reconciled to recirc_pump_motor_kw×count). Same family: biofilter tank uses media vol 92 not tank 153; degasser count. Findings 1 (pump flow) + 2 (motor 8×132 vs 1,217) + 3 (biofilter word uses media vol 92, not tank vol 153) + 5 (degasser count 8 vs 1 column) are ALL this one bug. The synonym-dedup at `scripts/lib/orchestrator/generic/universal-contract-sizing.ts:1725` reconciles COUNT+rating but NOT the per-unit FLOW/duty consistency.
FIX (universal, not yet implemented): after the principal-equipment count reconcile, recompute each principal's per-unit duty = matching-contract-total ÷ reconciled-count (pump flow, motor kW, biofilter tank vol, degasser count). Then fix the `buildAuditDigest` design-JSON truncation (kills judge finding #6). Verify with a Stage-1 chain run (physics_fidelity is the SEMANTIC self-audit score → no off-budget check).
JUDGE-SIDE leave-alone: #4 "biofilter 10% of main" — judge misread the 1,330 AIR flow as water; confirm the biofilter WATER flow is correct then leave. Tristan said "make it correct" on #4/#5 → #5 is a REAL fix (above); #4 verify-then-leave.
NEXT after INC 3: bundle INC 2 (brief metric value+unit mapping) → one Stage-1 chain run → INC 4 (connectivity) → INC 5 (drawings + hero reframe).

### CHAIN RUN RESULT — out/ras-inc3 (2026-06-19, verifies INC 0/1/3)
mean 7.5→8.2, FLOOR STILL 2. WINS: tool_archetype 2→10 ✓ (INC 1 end-to-end), physics_gates 10 ✓ (INC 0 de-dup), brief_compliance 7→8, narrative 8→9, perf 9→10.
INC 3 INCOMPLETE: contract was already right; the fix corrected the pump TOOL + BoM connection rows + invariants but the PRINCIPAL pump WORD is Phase-2-LLM-pinned at 1,336 (per-tank) — the fix didn't reach it → critic still reads 1,336 → physics_fidelity 4→2 (worse; + 2 more real issues surfaced).
physics_fidelity=2 drivers (the judge): (1) pump word 1,336 [Phase-2 pin]; (2) MAIN BREAKER 121 A undersized for ~2 MW (needs ~3,000 A); (3) biofilter tank 92 = media 92 = 100% fill (contract tank is 153).
REGRESSION: drawing_gates 10→8 — panel load_reconcile 2,865 kW vs contract 1,719 (connected-load scope / heater).
INC 3 NOT pushed (held local 6f0e1704e). COMPLETION (all UNIVERSAL, no if-ras):
 (A) post-Phase-2 reconcile: every PRINCIPAL WORD's per-unit rating = contract-total ÷ its own count (fixes pump 1,336→1,670 + biofilter 92→153; general, in reconcilePrincipalEquipment).
 (B) main-incomer breaker sized to connected load (I = kW·1000/(√3·V·PF)·margin) — fixes #2.
 (C) reconcile panel total ↔ contract connected_electrical_load scope — fixes drawing_gates #4.
Then a full chain run to re-score (semantic). 50-improvements spreadsheet pass running in background.
- 2026-06-19 · INC 0 DONE · de-dup scorecard (physics_fidelity→physics_gates) + code-fix layer gated off · SHA `2475c38a6` · (effect confirmed by next full run)
- 2026-06-19 · INC 1 DONE · tool_archetype 2→10 — seawater carve-out + drop COP-157 wrong-domain tool · SHA `58439188a` · OFF-BUDGET verified (verify-tool-archetype.tsx); full-run pending
- 2026-06-19 · INC 2 DIAGNOSED · brief_compliance=7 is a MAPPING gap: 8 brief metrics have name=None (unparsed), achieved values all in contract quantities (annual_production_t_yr=204, stocking 60, fcr 1.37…); 5 render "unverified". Fix = value+unit fallback match in _buildComplianceRows. Semantic score → verify in a chain run. BUNDLED with the Stage-1 run.
- RE-ORDER (2026-06-19): floor after INC 1 is physics_fidelity=4 → do INC 3 (physics/pump) next, then INC 4 (connectivity), bundle INC 2 mapping into the Stage-1 chain run.
- 2026-06-19 · INC 3 DIAGNOSED · physics_fidelity=4 = 6 critic findings: 3 REAL (one root = emitter emits own numbers, diverges from authoritative contract — the ledger-SSoT keystone): (1) pump flow 8×1336=10688 vs contract 13360 m³/h, should be 1670/pump; (2) motor 8×132=1056 kW vs stated 1217; (3) biofilter tank emitted 92 m³ (=media vol) vs contract tank 153 m³ (media 92 = correct 60% fill). + 3 JUDGE-ERROR/artefact NOT to touch: (4) "biofilter 10% flow" judge misread 1330 AIR flow as water (side-stream OK); (5) degasser 10:1 CORRECT (memory); (6) "JSON truncated" = buildAuditDigest truncates design before judge (artefact). FIX = emitter reads contract pump/motor/biofilter (kills 1-3) + fix digest truncation (kills 6). Needs chain run to re-score (semantic). Awaiting Tristan confirm on #4/#5.
