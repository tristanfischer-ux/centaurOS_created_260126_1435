# Macro plan — why the engine shipped a 9/10 it should have rejected, and how to fix it

## The question
If an adversarial council finds these faults in 10 minutes, why can't the engine?

## The answer (diagnosis — it's design debt, not missing information)
**The engine already COMPUTES most of the bad news, then declines to let it bind the verdict.** Proof, all from the shipped `2150` artefacts:

| Signal the engine already had | Value | Why "ships" stayed true |
|---|---|---|
| `selfAudit.min_score` | 4 | advisory / soft-capped — not wired into `ships` |
| `selfAudit.blocking_defects` (physics HIGH) | present | not read by `compute_verdict` |
| `costStack.oem_transfer_price_gbp` | £429 > £385 ceiling | HARD check compares **materials £259**, not oem |
| `costSanity` band | £100–£5,000,000/unit | useless for an instrument — always PASS |
| `wordDomainCoherence.verdict` | flagged (9 plant words) | advisory; not scored/blocked for device-scale |
| `physicsCritique` | 7/10, HIGH volume error | `advisory: true` → "never scores" |
| `render-vision-critique` | broken:false | rubric catches catastrophe (blank/floating), not Lego blockout |
| Brief tab | score 10, `checked: 0` | empty-check path mints a perfect 10 |
| 8 out-of-scope tabs | score 10 each | still counted in the "every tab ≥8" narrative |

So the failure is in **three layers**, not one:
1. **BINDING** — detectors are advisory/soft-capped; their verdicts don't reach `ships`/floor.
2. **COVERAGE** — the detectors that DO bind have gaps: vision catches only catastrophe; cost compares materials not oem; gate 34 has no additive-manufacturing marker; there is no "Σ part-volume ≤ enclosure" invariant; the device-scale volume override is consulted by only one stage.
3. **SCORING SUBSTANCE** — tab scores reward *cell contracts* (populated/typed/arithmetic-consistent cells) over *semantic correctness*; empty/OOS tabs mint 10s.

**The engine cannot self-CORRECT these because there is no auto-correction loop for domain-scale / tool-archetype / scoring-honesty faults** (the physics-critic-autocorrect exists only for individual mis-spec'd PARTS). It can, however, be made to self-DETECT and REFUSE — which is the first and most important half.

## The fix — four pillars, every item proveCatch'd on frozen `2150` (the known-bad fixture), no `if organoid`

### Pillar 1 — BIND what's already computed (make detection floor the verdict)
The single highest-leverage change. In `compute_verdict` / the ship banner:
- `selfAudit.blocking_defects` non-empty → `ships=False`, floor ≤ min(floor, 4).
- `wordDomainCoherence` process_plant_vessel markers on a device-scale class → block (not advisory).
- `physicsCritique` HIGH + confidence≥medium on a device-scale-impossible geometry (Σ principal-part volume > enclosure) → block.
- oem_transfer_price > unit_cost_ceiling (instrument classes) → Verification HARD FAIL.
- Invert the selftests (~28223, ~31472, ~28266) that currently assert "advisory self-audit must not floor" / "OOS tab stamps 10, floor 9" — those proveNoFalsePositives are now the bug.

### Pillar 2 — One multi-axis ship card that cannot disagree with itself
Cover / Exec / stdout print side-by-side and ships ONLY if ALL pass: `tab_floor`, `self_audit_min`, `oem_vs_ceiling`, `pcb_readiness_honest`, `vision_adversarial`. Never announce "ships floor 9" from tab_scorecard alone. Also fix the vision-critic timing race (Renders capped ≤6 until `render-vision-critique.json` is present).

### Pillar 3 — Close the detector coverage gaps (make SIGHT adversarial, per OPERATING-FRAME §0.5)
- **Vision:** the render/drawing critic must FAIL 2150's `04`/`00-hero` — instrument adversarial criteria (no connector recess, cuboid button pegs, floating PCB, glowing-block "internals", no optical/thermal story axis). broken:false on a catastrophe-only checklist must not let Renders ≥8 for `isInstrumentDevice`. proveCatch on the frozen PNGs.
- **Cost:** oem-vs-ceiling for instruments; gate 32 HIGH when oem>ceiling; a real per-class sanity band (not £100–5M).
- **Brief/OOS:** `checked==0` → UNSCORED/≤4; OOS tabs → `score=None`, excluded from min_tab AND from "every tab ≥8".
- **PCB:** `package_family` weight ≤0.5, NOT FAB-READY-eligible for interface-critical roles; role→footprint guards (USB ≠ PinHeader, LED ≠ TE connector); OD board with empty `requiredWordIds` = electronic gap; multi-board `requiresKiCadDeliverable`>1 with one KiCad project → PARTIAL not FAB-READY. (Refines my `cfc19f96d`: mpn tiers were genuinely missing, but package_family must not alone reach FAB-READY.)
- **Gate 34:** add additive-manufacturing/extruder/printer marker family + generic "tool-domain ∉ class tool-whitelist".
- **Drawings:** OOS/absent → `skipped` not `pass:true`; interconnect edge-label domain must match endpoint roles (`J-LED:VLED`→Peltier = FAIL).

### Pillar 4 — Fix the SOURCE so the design is genuinely right (not just refused)
- **Meta-root:** `isProcessPlantScale(state) = isProcessPlantClass(class) && !isDeviceScaleDesign(state)` consulted by every plant stage (word-expansion, geometry, electrical, cost, interconnect) → kills the plant-vessel leak, metre-scale geometry, 3-phase/25 kVA electrical, DN25 pipe, plant cost curve at once.
- Stability HARD metric requires a derived `temp_stability_c`; catalogue-part families reject "bespoke fabrication to drawing"; redundant Peltier+heater collapsed; pump slot-mispin (tubing SKU) rejected; confidence-honesty on unfound MPNs.

## The deeper principle (the AIM this serves)
The engine's self-audit must **BE the adversarial council**: run per-dimension adversarial critics on the DELIVERED artefact (Excel cells / PNG / KiCad / interconnect), BIND their verdicts to `ships`, and route each to its SOURCE stage for fix. The SIGHT mechanism (OPERATING-FRAME §0.5) already exists in spirit; this plan makes it (a) binding, (b) adversarial not catastrophe-only, (c) proveCatch'd on known-bad runs so it can never silently regress.

## Sequencing + ownership (from Cursor's pack)
- **Terminal (me):** Pillar 1 (verdict binding) + Pillar 2 (ship card) + Pillar 3 vision/cost/brief/OOS + Pillar 4 meta-root + gate 34 + plant-word leak + interconnect.
- **Cursor (`cursor-pcb`):** PCB role→footprint, LED/USB reject, OD empty-board gap, FAB-READY tier set + gate 38 fitness. Firmware-proof wiring: Cursor or Terminal (Tristan's ask) — banner stays UNPROVEN IN HARDWARE.
- Frozen `2150` is the shared regression fixture. Do a fresh bake only after Pillar 1–3 land + selftests green.

## Acceptance ("fixed")
1. Re-scoring frozen `2150` (no re-render needed) yields **ships=false, floor ≤4, PCB not FAB-READY, cost HARD-fails on oem>ceiling, vision fails the blockout.** (i.e. the engine now REFUSES what it shipped.)
2. A NEW bake claims ≥8 on a tab ONLY when the adversarial checks pass on the new PNGs/KiCad — never because OOS tabs are 10.
3. Every fix carries a proveCatch on the 2150 fixture, wired into the selftest/regression harness.
