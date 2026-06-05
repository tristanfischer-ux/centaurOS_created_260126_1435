# CO₂ Capture + Mineralisation Plant — Independent Cost Assessment

**1 tonne CO₂/day · AACE Class 4 (±30%) · £2024 · 2026-06-05**

Independent, traceable build-up — every line costed from published equipment cost curves, not model guesses. Reproducible: `scripts/co2_class4_capex.py`; cost engine `scripts/lib/cost/process-equipment-cost.ts` (20/20 tests).

---

## The number

| | Installed plant capital | £/(tonne·yr CO₂) |
|---|---|---|
| **Low** | £1.52 M | £4,160 |
| **Central** | **£2.66 M** | **£7,290** |
| **High** | £4.09 M | £11,200 |

- This is **equipment + installation** (purchased equipment × a skid-plant installation factor). The existing dossier's **£2.61 M ASP sits dead-centre** of this range — so its headline is **vindicated as a number**, but it reached it by cancelling errors (model-authored list prices, no sizing); this build-up reaches the same place on a **traceable, sized, curve-based** basis.
- **For a fundable project figure, add contingency + EPC.** £2.66 M excludes contingency (Class-4: +15–30%), engineering/EPC fee (+10–15%), owner's cost, land/buildings, first MEA fill and spares. **All-in plant capital ≈ £3.3–3.8 M** before land/owner's cost. If the £2.61 M is being presented to investors as "what it costs to build", it is missing the contingency an investor will expect.
- Confidence: **moderate on the £2.66 M aggregate, low on any single line** (most lines are below the cost-curve floors at this tiny scale → RFQ). The aggregate is robust because the line errors are not one-directional.
- Corroboration: £7,290/(t·yr) sits mid-band in the engine's own `co2_mineralisation` cost-sanity reference **£1,500–10,000/(t·yr)** (IEA DAC 2024 / Climeworks–Heirloom). High case clears it — expected for a 1 t/day first-of-a-kind in 316L + PED + ATEX.

## Purchased equipment cost (PEC) — £887 k

| Section | Independent PEC | Dossier module |
|---|---|---|
| Skid & structure | £56 k | £43 k |
| Thermal utilities (boiler, cooling, instr-air) | £101 k | £64 k |
| MEA absorption (absorber, packing, blower, quench) | £120 k | £87 k |
| MEA recovery (stripper, reboiler, condenser, coolers, pumps) | £139 k | £77 k |
| Carbonation reactor + agitator + KOH/gypsum feed | £112 k | £150 k |
| CaCO₃ filtration + drying | £71 k | £77 k |
| K₂SO₄ crystallisation + filter + dry | £207 k | £161 k |
| Bagging / packaging | £81 k | £95 k |
| Electrical / instruments / control / safety | *in install factor* | £257 k |
| **TOTAL** | **£887 k** (range £607 k–£1,168 k) | £1,011 k (incl. EICS) |

Off-scale honesty: the absorber & stripper are read **beyond** the packed-column curve (extrapolated); the boiler, cooling skid, small heat exchangers, dryers and centrifuges fall **below** their curve floors and were replaced with defensible small-package figures, **not** the inflated chart minimums; atmospheric tanks were **down-corrected** off the pressure-vessel curve. The crystalliser, hopper, silos and bagging line have **no public curve** → RFQ bands.

## Installation basis — factor 2.5 / 3.0 / 3.5 (not stick-built Lang 4.74)

This is a **shop-fabricated skid plant**: shop labour replaces field labour, piping/wiring is pre-installed on the modules, and the site is a plinth not a foundation field — so total-installed ÷ purchased runs **~2.5–3.5**, well below the stick-built 4.74. Two **field-erected 316L columns** + PED/ATEX push toward the top of that band. Electrical/instruments/control/safety are **folded into the factor** (no double-count); costed explicitly instead (PEC £1.14 M) the equivalent factor is ~2.3×.

## What would firm it — quote these (and which way they'd move)

1. **K₂SO₄ forced-circulation crystalliser** (£100 k ±50 %) — the single dominant uncertainty; packaged FC units have a high floor at this scale → likely **up**.
2. **Absorber + stripper columns** (£133 k, extrapolated curve) — field-erected segmented 316L; real tall columns cost **more** than naïve reads → likely **up**.
3. **The install factor itself** (3.0 vs 3.5 = ±£440 k) — a skid-builder/EPC quote on the factor is the **largest single lever** on the total.
4. Solids trains (dryers ×2, centrifuges ×2, £151 k) and the bagging line (£65 k) — could come **down** if one shared train serves both product streams.

Quoting 1–3 takes the estimate from ±30 % to ~±12–15 %, and on balance nudges the central **upward**.

## Before any firm cost — a design question to resolve
The brief's stoichiometry (3.1 t/d gypsum + 2.6 t/d KOH) fixes only **~0.5 t/d CO₂** as carbonate by calcium balance — **not the full 1 t/d captured**. Either the plant is capture-only (vent the balance after stripping) or it needs a second carbonation sink. This changes the **most uncertain ~£390 k** of the plant (crystalliser, reactor, solids trains) and should be settled before quotes are sought.

## Sources
Equipment cost curves: H.P. Loh, J. Lyons, C.W. White III, *Process Equipment Cost Estimation, Final Report*, DOE/NETL-2002/1169, Jan 2002 (1Q-1998 US$). Escalation: CEPCI 1998 = 389.5 → 2024 ≈ 800 (×2.054). Alloy factors: DOE/NETL Table 7 (316SS = 2.90 solid). USD→GBP 0.79. Equipment sizing: independent first-principles concept sizing (Towler & Sinnott / Perry's). Industry £/(t·yr) band: gate-32 `co2_mineralisation` reference (IEA DAC 2024).
