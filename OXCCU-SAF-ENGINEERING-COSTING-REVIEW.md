# OXCCU Power-to-Liquid SAF — Engineering & Costing Deep-Dive (dossier v14)

*Review date: 2026-06-06. Source: `out/oxccu-saf-v14/` (state.json, chain-v2.pdf, audit files, physics critique) + tool/emitter source. Two grounded sub-agent audits (chem-E tool coverage; BoM bespoke-vs-commodity) + an independent costing pass.*

---

## Verdict in one paragraph

The `e_fuel_synthesis` class is **genuinely well-engineered at the plan level** — it was design-council-gated (Gemini 3.1 Pro · Grok 4.3 · MiMo) which already caught the big chemical-engineering traps (Fischer-Tropsch is exothermic so the dominant duty is *heat removal* not heating; real-gas compressibility; 3-phase separator derating; a mass-balance correction). The mass and thermal balances close, the equipment is real industrial kit, and the engine's own physics critic scored it 9–10. **But three things are true underneath that polish**, and all three are worth fixing:

1. **The headline yield numbers are hard-coded, not physics-derived.** Jet selectivity (0.60), carbon-to-liquids (0.65) and per-pass conversion (0.40) are assumptions dressed as results. The single biggest chem-E gap is that there is **no Anderson–Schulz–Flory (ASF) chain-growth model**, and the Fischer-Tropsch thermodynamic-feasibility tool **silently failed** on this run.
2. **The BoM is missing an entire commodity instrumentation-and-control layer** — your instinct is right. (The *bespoke vessels* are correctly bespoke; the problem is the absent instrument loop, not the reactors.)
3. **The costing is honestly *disclosed* but the headline is optimistic** — the levelised cost understates because the techno-economic model has no explicit hydrogen term, and the FOAK capex looks low.

**Meta-insight:** internal coherence fooled the physics critic. Self-consistent hard-coded numbers reconcile with each other and *look* rigorous, but they aren't first-principles. That's the real answer to "how good are the physics tools" — the *sizing* tools are excellent; the *reaction/selectivity/economics* layer is where the guesses hide.

---

## Q1 — Chemical-engineering tool coverage: how good, and what's missing

**The good news:** there is a rich, *real* chem-E toolset and most of it ran correctly on v14. These are first-principles or production-library calculations, not stubs:

| Need | Tool | Status on v14 |
|---|---|---|
| Mass balance / stoichiometry | `reaction:stoichiometry-balance` | ✅ ran, internally consistent (H₂ 3.30 t/d, water 19.6 t/d) |
| Compression (real-gas Z) | `gas:compressor-sizing` (Peng-Robinson per stage) | ✅ all 3 compressors |
| **FT exotherm → steam** | `process:steam-generator` (IAPWS-IF97) | ✅ the critical heat-removal tool, correctly scoped |
| 3-phase separation | `process:flash-separation` (Souders-Brown + Stokes, no mesh for wax) | ✅ |
| Reactor shell | `reactor:cstr-pfr-sizing` (ASME VIII UG-27) | ✅ |
| Heat exchangers | `ht:ntu-heat-exchanger` (Caleb Bell `ht` lib) | ✅ |
| Pumps, fired heater, flare, tanks, vessels | various, all real | ✅ |
| Techno-economics | `yield-economics:npv` (DCF) | ⚠️ ran, but weak opex model (see Q3) |

**The gaps (in priority order):**

1. **Anderson–Schulz–Flory chain-growth distribution — MISSING ENTIRELY. This is the single biggest lever.** The product slate (jet vs naphtha vs wax vs methane) is governed by one chain-growth probability α. For OXCCU's iron catalyst at 300 °C, α ≈ 0.75–0.85. At α = 0.80 the *physics* gives jet ≈ 52 %, naphtha ≈ 22 %, wax ≈ 18 %, methane ≈ 8 % — materially different from the hard-coded `jet_selectivity_frac = 0.60`. Because this number sets SAF yield → H₂ consumption → levelised cost, **the entire carbon balance is currently an LLM guess in numeric disguise.** *Fix: build `asf_chain_growth.py` (pure numpy, ~2 h).*

2. **The Fischer-Tropsch feasibility check silently FAILED.** `reaction:feasibility-gibbs` is a real tool, but the class plan passed it the species `CH₂` (the FT repeat unit), which has no Gibbs-of-formation in the `chemicals` library → Python exit 3, nothing written. *Fix (~30 min): use the ASTM FT-SPK surrogate hexadecane (C₁₆H₃₄, CAS 544-76-3). Correct balance is `16 CO₂ + 49 H₂ → C₁₆H₃₄ + 32 H₂O` (note: the obvious "33 H₂" is wrong — paraffin chain-ends add 2 H; 49 gives H₂:CO₂ = 3.06, matching the brief). Verified exergonic.*

3. **No FT kinetics.** Per-pass conversion (0.40) is an input, not an output — `reactor:cstr-pfr-sizing` sizes a vessel from a fixed residence time, it does not compute conversion from a rate law.

4. **Cantera is installed and works but is NOT wired to e_fuel.** It could compute the reverse-water-gas-shift equilibrium vs temperature (the 300 °C per-pass equilibrium is currently a guess). Cheap to add a class-plan step.

5. **Distillation = shell only.** The fractionation column *shell* is sized (ASME), but tray count, minimum reflux and number of stages are not computed. The brief acknowledges this as a ±30 % shortcut with a "rigorous tool is follow-up" note. *Fix: `distillation_fug_shortcut.py` (Fenske-Underwood-Gilliland).*

6. **No hydrocracker reactor tool** — it's an emitter descriptor, not a sized unit. *Fix: add a `trickle_bed` mode to the existing reactor tool.*

7. **No pinch / heat-integration check** — individual exchangers are sized, but the claim that FT exotherm reboils the column / preheats feed is narrative, not validated.

8. **Three universal tools returned empty for e_fuel** (regulatory-cert-cost, reliability-fmea, cybersecurity) because the class isn't in their lookup tables; a guard skips them silently.

9. **Avoided-GHG vs fossil Jet-A is absent from the LCA** — the lifecycle tool computes the plant's *own* footprint but not the carbon *saved* by displacing Jet-A (2.54 kg CO₂e/kg). That saving is the central OXCCU value proposition and it isn't in any tool output.

---

## Q2 — Why the BoM is "mainly bespoke" (your instinct is right — with one nuance)

**The numbers:** 92 % of BoM value is bespoke/engineered (37 lines, £9.06M); 8 % real branded (18 lines, £0.79M); **zero commodity-generic lines.**

**The nuance:** the bespoke *process vessels* (FT reactor, fractionation column, separators, compressor packages, catalyst charges) **genuinely are bespoke** for a first-of-a-kind plant — labelling them "made-to-order fabrication" is correct, and gate-20 rightly relegates those honest descriptors to LOW. **So "make it all commodity" would be wrong.**

**The real problem — exactly what you spotted:** an entire **commodity instrument-and-control loop is missing**. A 1,000 t/yr SAF plant carries 150–250 individual field instrument lines; this dossier has essentially none outside the M7 control cabinet:

- **No field transmitters at all** across M1–M6 — no pressure (a 25-bar process needs ≥25 loops), temperature (≥20), flow, or level transmitters.
- **No process control valves** (only the purge valve + ESD valves), **no VFDs** (every compressor is called "VSD-driven" but no drive is listed), **no motor control centre, no UPS, no network switches, no HMI, no online gas analyser.**

These should be commodity branded kit — Endress+Hauser, Emerson/Rosemount, ABB, Siemens, Dräger — worth ~£150k across ~20 lines. The £ effect is small (£150k on £15.65M) but the **credibility effect is large**: a reviewer sees "all bespoke" instead of the correct "bespoke vessels + a commodity instrument loop."

**Root causes (4):**
- **A — gate-20 fallback:** the emitter *tried* real Siemens part numbers (e.g. `6ES7515-2UM02-0AB0`), gate-20 flagged them as absent-from-DB, and rather than seeding the DB the emitter fell back to prose ("— engineered"). Wrong fix chosen.
- **B — structural gap:** the co2-mineralisation emitter (e_fuel's stated mirror) has a dedicated `emitSensingInstrumentation()` module with real branded instruments; **the e-fuel emitter has no equivalent.**
- **C — no e_fuel class reference graph:** `class-reference-graphs/` has 20 archetypes but no e-fuel one, so Stage 17.6 RAG has no branded I&C candidates to substitute.
- **D — VFD/MCC/UPS bundled** into package prices instead of line items.

---

## Q3 — Costing accuracy

**The cost stack (honestly caveated):** raw BoM £9.39M → OEM transfer £15.6M → installed ASP £24.3M, with an explicit note to add ~30 % for contingency + EPC + owner's cost (≈ £31.6M all-in). The dossier uses a skid-modular factor (2.5–3.5×) rather than the textbook stick-built Lang factor (4.74×) and says so. Good disclosure.

**Levelised cost — the weak point.** Headline £5.85/kg computed vs a £2.20/kg (£2,200/t) NOAK target, correctly marked `TARGET` (not a false PASS). But:
- **H₂ feedstock alone is £4.5–6.7/kg of SAF** at the brief's own 140 kg/h and £4–6/kg green H₂. The total levelised cost (£5.85/kg) sits *at or below its own hydrogen floor.*
- Cause: the techno-economic tool models opex as `capex × 8%` with **no explicit hydrogen, CO₂ or electricity term** — and H₂ is 60–80 % of PtL opex. A defensible FOAK figure is **~£8–11/kg**. *(Confidence: moderate-high on direction, moderate on the exact figure — the precise opex formula needs reading.)*
- Amortisation is straight-line with **no discount rate** in the £/kg — a proper capital-recovery factor (≈ 0.10 at 8 %/20 yr) roughly doubles the capex contribution.

**CAPEX magnitude.** Achieved ex-works £15.65M vs a £45M ceiling (note: the design spec says ≤ £28M — that £28M/£45M inconsistency should be reconciled). Independent view: **£15.65M ex-works is low for a FOAK micro-scale integrated PtL-FT plant** (FT reactor + hydrocracker + fractionation + 3 compressors + utilities); real first-of-a-kind plants at this scale run £25–50M. It passes the gate-32 band (£12k–60k/(t·yr)) but sits at the low edge. The £45M ceiling is the more realistic anchor.

**Bugs / framing:** `plant_payback_years = 0` is a glitch (should be derived or "never within horizon"); `plant_npv_gbp = −£58.6M` is realistic for FOAK but the dossier should *frame* it (FOAK is not expected to be NPV-positive — that's what the NOAK target is for) rather than leave a stark negative. The H₂ price sensitivity (£3/£4/£6/kg) **is** shown — good.

---

## Prioritised recommendations

| # | Action | Effort | Value | Universal? |
|---|---|---|---|---|
| 1 | **Build the ASF chain-growth tool** → physics-derived selectivity & carbon balance | ~2 h | ★★★ highest | ✅ any FT/PtL class |
| 2 | **Fix the Gibbs feasibility failure** (hexadecane + correct stoichiometry) | ~30 min | ★★ (silent failure) | ✅ any reaction with a polymer/repeat-unit species |
| 3 | **Add an explicit H₂/CO₂/electricity opex term** to the TEA → honest levelised cost | ~1 h | ★★★ | ✅ any fuel-synthesis class |
| 4 | **Add avoided-GHG vs Jet-A** to the LCA → the OXCCU value proposition | ~1 h | ★★ | ✅ any emissions-reducing product |
| 5 | Wire **Cantera** for RWGS equilibrium vs temperature | ~1 h | ★★ | ✅ |
| 6 | **Commodity I&C coverage** (see strategic note) | varies | ★★ credibility | decision needed |
| 7 | FUG distillation tool; hydrocracker reactor mode; pinch check; fix payback bug; reconcile £28M/£45M; split hydrocracker/isomerisation catalysts; swap the sub-1000 kg/h recycle compressor from centrifugal → reciprocating/diaphragm | mixed | ★ | mostly ✅ |

### Strategic note (ties to THE AIM)
Recommendations 1–5 are **universal** — they improve every chemical-process class, not just OXCCU, which is the right kind of work. Recommendation 6 (the instrument loop) has two paths:
- **Fast:** hand-write `emitSensingInstrumentation()` for e_fuel + an e_fuel class reference graph (~3–4 h). Fixes OXCCU but is exactly the per-class hand-coding THE AIM warns against.
- **Right:** make instrument-loop coverage **self-generating** — the engine should infer the standard I&C suite for *any* process plant and pull branded parts from a self-growing DB (DB-first → web/own-training on miss → verify → write back). Slower, but it fixes every future class at once.

**My recommendation:** do 1–5 now (universal, high-value, low-risk), and take the universal path on 6. I held off implementing anything chain-altering because (a) several fixes change the chemistry/cost *outputs* and need a validated chain run, and (b) #6 is a genuine universal-vs-per-class fork that's your call. Give me the green light and I'll start with #2 (cheapest, fixes a silent failure) and #1 (biggest lever), each with a regression invariant and a validation run.
