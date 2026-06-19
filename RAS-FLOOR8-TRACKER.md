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
