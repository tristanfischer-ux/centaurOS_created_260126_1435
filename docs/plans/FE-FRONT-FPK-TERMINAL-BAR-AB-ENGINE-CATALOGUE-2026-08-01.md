# FE Front FPK — Terminal progress vs Bar A/B + engine catalogue

**Date:** 2026-08-01  
**Twin (only):** `out/formula-e-front-mgu-20260729-1432/`  
**Branch:** `oxccu-efuel`  
**ship_ok:** always **false** · homologation **NOT_HOMOLOGATED**  
**Blender ownership:** handed **back to terminal** after Cursor closed cutaway / PCD / hi-res / axial-explode work (see §0).

**Council assistants on unused-engines section (§4):** GPT-5.6 Sol (xhigh) + Kimi K3.  
**GLM 5.2:** not available in this Cursor Task model list — section synthesises GPT+Kimi; Tristan can re-run GLM in terminal if wanted.

---

## 0. Blender handback (Cursor → terminal)

Cursor owned Blender while terminal owned EM. Delivered SOURCE fixes (not PNG patches):

| Fix | Where | Result |
|---|---|---|
| Meshing PCD unify | `build_universal_scene.py` + `fpk_gear_teeth.py` | Ring PCD = sun+2×planet; `pcd_meshing_mismatch` cleared |
| Cutaway shell-off | `build_universal_scene.py` | Open views hide hollow_rotor/stator/magnets/carrier; nest exposed |
| Involute readability | `forge_blender_lib.py` | Thin ring rim, flat shade, lighter gear mat |
| Traction hi-res | `instrument_form_grammar.py` | Product 4800×3200; catalogue 7200×4800 (same framing) |
| Axial explode (13) | `build_universal_scene.py` | Assembly stack along pack +X, not catalogue lattice |

**Residual for terminal SIGHT:** teeth still fine at whole-kit framing (physical m=0.6 mm); authenticity sphere-proxies remain; do not invent “looks better” without SOURCE geometry.

---

## 1. How is terminal getting on? (Bar A / Bar B)

### Live twin snapshot (2026-08-01)

| Signal | Value | Bar impact |
|---|---|---|
| `duty_torque_screen_ok` | **false** | Blocks Bar A |
| Mean \|T\| / required | **~0.462** (≈57.8 / 125.21 N·m) | Blocks Bar A |
| `torque_reliable` | **false** (ripple ~207%, sign reversal) | Blocks Bar A / DEC-EM-1 |
| `architectureBlockers` stamp | Often **[]** while duty fails | Honesty risk — do not treat as cleared |
| Gear oil screening | **CLEARED** (cornering + gallery analytical) | Helps Bar A; free-surface CFD stays Bar B |
| Planetary strength writeback | **INVALIDATED** (`PLANETARY_STRENGTH_VS_ROTOR_BORE`) | Correct pause until EM geometry freezes |
| PCB | Draft / NOT_FAB | Honest — Bar B fab gate open |
| Homologation | **NOT_HOMOLOGATED** | Correct |
| `ship_ok` | **false** | Correct |

### What terminal has done well (helps the bar)

1. **EM honesty loop** — winding belt repair (swat_em, +7.3×), rotor-frame sweep, torque-integration / airgap work, EM brief v2. This is the right Bar A bottleneck.
2. **Provenance / Jack-facing discipline** — ABD / race / oil-screen SOURCE stamps; oil cleared without pretending CFD bench is done.
3. **Scaffolding for Bar B paths** — CalculiX, ROSS, OpenFOAM docker cases, ISO 6336 / bevel screens, PCB draft NOT_FAB.
4. **Council + reject discipline** — Sol/GLM/Kimi red-teams kept race OPEN; no false homologation mint.

### What is still blocking Bar A

| Blocker | Status | Owner path |
|---|---|---|
| **Duty torque 125.21 N·m @ 20 000 rpm** | FE mean ~58 N·m; linear routes higher; sign reversal unexplained | EM brief v2 §6 → DEC-EM-1 |
| **Planetary nest vs rotor bore** | Writeback invalidated | Freeze EM OD first, then re-open KISSsoft-class LTCA |
| **Tracker freshness** | Tracker still cites older ~118 N·m in places; twin is ~58 | Refresh tracker from twin, not memory |
| **3D EM / SiC / oil free-surface** | Correctly parked or scaffolding | Do not burn cycles until DEC-EM-1 |

### Bar B reality check

Bar B checklist items can be filled under assumptions; **none of that mints homologation**. Still OPEN by nature:

- Dyno / HIL / Gerber release / XYZ / oil free-surface CFD / NVH / FIA homologation pack

**Verdict:** Terminal is **helping Bar A** on the correct critical path (EM + honesty). It is **not close to Bar A pass** until duty torque closes with reliable FE (or DEC-EM-1 redesign). It is **correctly not pretending Bar B is closable in software**.

---

## 2. Software / code engines USED — what on, what insight

| Engine / package | Used on | Insight gained |
|---|---|---|
| **xfemm / femmcli** (+ Pyleecan geometry) | IPMSM loaded sweep @ duty | Mean \|T\| ~58 N·m vs 125; huge ripple; saturation vs linear material gap is real |
| **swat_em** | Winding belt map | Fixed bogus 12-slot pattern on 24-slot machine; +7.3× torque jump — proves winding was a real bug |
| **ISO 6336 / bevel analytic screens** | Planetary + post-diff | Nest FoS vs rotor bore → **INVALIDATED** writeback (correct stop) |
| **CoolProp / fluids / ht** | Cold-plate analytical | Thermal screens partial; analytical oil/thermal ≠ CFD proof |
| **OpenFOAM** (docker) | Cold-plate / jacket scaffolding | Cases can converge; mesh too coarse for oil galleries; not free-surface |
| **CalculiX** | Rotor / magnet pocket | Screening FoS only — not fatigue / LTCA |
| **ROSS** | Rotordynamics screen | Analytical companion; not Campbell/NVH proof |
| **Blender / Cycles** | Product views 00–14 | Morphology/SIGHT; involute + hi-res + axial explode (Cursor tranche) |
| **CadQuery / forge-truth CAD seeds** | Some CAD families | Sphere-proxy residual remains on authenticity |
| **Excel LIVE** | Power/thermal arithmetic | Trace honesty for Jack |
| **atopile / KiCad path** | PCB draft | NOT_FAB honesty; channels draft |
| **OpenAlex / lit extract** | Claims support | Partial wiring |
| **Council LLMs** (Sol / GLM / Kimi in terminal) | Red-team / race | REJECT; keep OPEN — useful as adversarial review, not as physics |

---

## 3. Engines NOT used but could / should — GPT-5.6 + Kimi K3 synthesis

*(GLM 5.2 unavailable here; both GPT and Kimi independently converge on the same P0 themes.)*

### Consensus P0 (do these; don't theatre)

1. **Treat 58→125 as design-space / topology**, not “run another 2D FEA package.” Swapping FEMM↔JMAG-2D for the same geometry will not invent 2× torque.
2. **One industrial EM path** — **JMAG** *or* **Motor-CAD + Maxwell** — as second-opinion / industrial credibility **after** (or in parallel with) linear-material FE + sign-reversal fix in brief v2. Expected: confirm saturation/ripple diagnosis; support DEC-EM-1 geometry freeze.
3. **Constrained MDO** around existing FE — **pymoo** or **OpenMDAO** — for slot opening / turns / magnet / OD trade under packing + voltage + current. Expected: Pareto of torque vs OD/loss; inputs to DEC-EM-1.
4. **Freeze EM geometry before resurrecting planetary** — then **KISSsoft** or **Romax** LTCA (not another analytic ISO pass alone). Expected: valid planet/sun FoS + microgeometry; clear INVALIDATED stamp honestly.
5. **SiC honesty path** — **LTspice DPT** + **FastHenry/Q3D** → **PLECS** (system). Expected: switching loss + loop inductance before claiming SiC inverter ready.
6. **Oil free-surface** only after gear freeze — **Particleworks** (SPH) *or* real **OpenFOAM VOF** with mesh discipline — not splash video theatre. Expected: gallery wetting / starvation risk under cornering.
7. **HIL prep cheap now** — **cantools** DBC + **Renode/QEMU**; buy **Typhoon HIL** later. Expected: ECU/comms readiness without waiting for dyno.

### Theatre flags (both models)

- 3D EM before torque closes  
- NVH campaigns now  
- SPH splash videos for sales  
- Package-swapping FEMM↔JMAG-2D expecting the shortfall to vanish  

### GPT-specific adds

- **getdp / ONELAB** as FOSS 3D EM cross-check (only after 2D closes)  
- **StarCCM+ / Fluent** as industrial CFD peer if OpenFOAM VOF stalls  
- **Ansys nCode / fe-safe** for fatigue after CalculiX screening  

### Kimi-specific adds

- **MOTOR-CAD** thermal + EM coupled for duty cycle (not just peak torque)  
- **GT-SUITE** or **Amesim** for system thermal-hydraulic oil loop  
- Explicit **DEC-EM-1 gate** before any expensive industrial licence burn  

---

## 4. What else should we be using — reason + expected result

| Priority | Tool / code | Why | Expected result |
|---|---|---|---|
| **P0** | Finish EM brief v2 §6 in **xfemm** (linear mat, sign-reversal, slot opening) | Cheapest path to DEC-EM-1 | Either FE ≥125 reliable **or** clear redesign decision with numbers |
| **P0** | **pymoo / OpenMDAO** wrapping current FE | Design-space search, not more plots | Pareto → DEC-EM-1 options table |
| **P0** | **JMAG *or* Motor-CAD+Maxwell** (pick one) | Industrial second opinion / Jack credibility | Confirms diagnosis; freezes geometry for gears |
| **P1** | **KISSsoft / Romax** after EM OD freeze | Planetary writeback is INVALIDATED | Valid nest FoS; clear Bar A gear strength |
| **P1** | **LTspice DPT + FastHenry → PLECS** | SiC claims without switching physics are theatre | Loss + loop L; inverter Bar A honesty |
| **P1** | **cantools + Renode** | HIL prep without Typhoon spend yet | DBC + ECU sim ready for Bar B |
| **P2** | **OpenFOAM VOF** or **Particleworks** (post gear freeze) | Oil CLEARED is analytical only | Free-surface Bar B evidence |
| **P2** | **Typhoon HIL** (when hardware path real) | Real-time inverter/plant | Bar B HIL gate |
| **Avoid now** | 3D EM, NVH suites, SPH marketing renders | Wrong time on critical path | Wasted weeks; false confidence |

---

## 5. Recommended terminal focus (next 1–2 weeks)

```
1. EM brief v2 §6 → numbers that hold under SIGHT
2. DEC-EM-1 (geometry freeze or redesign)
3. Refresh Bar A tracker from twin (~58 N·m, not stale ~118)
4. Only then: KISSsoft/Romax planetary re-open
5. Parallel cheap: LTspice DPT + cantools DBC
6. Blender: terminal owns SIGHT; Cursor out unless asked
```

**Bar A pass condition (minimum):** duty torque screen true + torque_reliable true + planetary writeback re-validated on frozen EM OD + oil screen stays CLEARED + no empty-blocker stamp while duty fails.

**Bar B pass condition:** not software — dyno/HIL/fab/XYZ/CFD/FIA. Keep checklist honest.

---

## 6. References

- Twin: `out/formula-e-front-mgu-20260729-1432/`
- EM brief: `docs/plans/FE-FRONT-EM-TORQUE-REVIEW-BRIEF-v2-2026-08-01.md`
- Tracker: `docs/plans/JLR-FE-FRONT-FPK-BAR-A-BAR-B-CLOSEOUT-TRACKER-2026-07-31.md`
- Blender SOURCE: `scripts/blender-universal/build_universal_scene.py`, `scripts/blender-templates/forge_blender_lib.py`, `scripts/lib/instrument_form_grammar.py`
