# CO₂ Dossier — Cost Findings (the honest answer to "where did the costings come from?")

_2026-06-05. Grounded on `out/release-co2_mineralisation-iter1` (the founder's dossier run, 4 Jun) + an independent first-principles sizing. Two parallel agents; numbers cited to the run artifacts._

## 1. Where the fabricated-equipment costs actually came from — the root cause

**For this run, no engineering contract was registered for `co2_mineralisation`** (`0.5-engineering-contract.json`: *"Engineering Contract not registered for co2_mineralisation — falling back to LLM-only chain."*). Consequences, all confirmed in the state:

- **Every fabricated size, material and price is LLM-authored** (the generator's `modifier_characters` + `list_price_gbp`), cross-checked only against an advisory corpus median.
- **Pricing provenance across all 129 BoM lines: 103 LLM list-price guesses · 26 corpus-median · 0 live vendor prices.** The only 8 lines with a real distributor price are control/electrical commodities (PLC I/O, HMI, switch, soft-starter, relays) — **none of the flagship process equipment** — and even those 8 real prices were captured but **not used** as the rendered price.
- **The process-sizing tools that ran were wrong-domain stand-ins** — `pressure-vessel:design` (ship-hull collapse), `irrigation:pump-sizing` (Hazen-Williams sprinkler), `corrosion:anode-sizing` (cathodic protection). They are exactly the marine/irrigation mis-applications gates 33/34 were built to catch. They produced shell mass / hoop stress / HX duty but **never the diameter, height or volume of any column, reactor or crystalliser** — those exist only as free-text strings, reconciled against nothing.
- The corpus cross-check is advisory, so lines **shipped anyway** at 0.14×–2.74× the corpus median (absorber +174%, reboiler −68%, cross-HX −53%, column plinth −86%). The errors partly cancel, so the aggregate `gate-32` cost-sanity **passed** (£4,615/(t·yr), inside the wide £1,500–10,000 band) while individual lines are badly wrong in both directions.

**Plain answer for the founder:** the manufactured-equipment numbers are model-authored list-price guesses with little or no dimensional basis, not vendor quotes or engineering correlations — which is precisely why they can't yet survive the question "where did this come from?"

## 2. Side-by-side sizing — the engine's design vs an independent first-principles sizing

| Equipment | Engine design size | Independent sizing (Class 4/5, ±30–50%) | Divergence |
|---|---|---|---|
| Packed absorber column | 0.4 m dia × **6 m** | DN300 × **~12 m packing, ~16.5 m T-T** | engine **~⅓ the height** a real MEA absorber needs |
| Stripper / regenerator column | 0.3 m dia, **no height** | DN250–300 × ~12 m T-T | engine has **no height at all** |
| Gypsum carbonation reactor | **4 m³** | **~1.0 m³** (τ=45 min, 20% solids) | engine **~4× oversized** |
| K₂SO₄ crystalliser | **no dimension at all** | **~1.1 m³** FC evaporative, ~80 kW evap | engine **dimensionless guess** |
| Lean/rich cross-exchanger | duty **186 kW** | duty **43.6 kW**, ~8 m² plate | engine **~4× the duty** |
| Reboiler | **91 kW / 180 kg/h steam** | **42.8 kW**, ~3 m² (3.7 GJ/t CO₂) | engine **~2× high** |
| MEA circulation pump | **2.9 m³/h** | **0.68 m³/h** | engine **~4× the flow** |
| Flue-gas blower | 500 kg/h (odd units) | 225 m³/h, **0.8 kW shaft / 1.5 kW motor** | engine over-spec'd |
| Skid structural steel | 12×2.4×2.59 m | ~**16 t** | comparable |

The independent sizing is **internally consistent** (reboiler duty 42.8 kW ≈ recovered cross-exchanger duty 43.6 kW — the correct MEA heat-integration signature; blower ΔP reconciles with the 12 m packing). The engine's is not.

## 3. Directional cost implications (indicative — to be firmed by correlation + RFQ, not final)
- **Absorber:** engine £26k is both over-billed vs corpus *and* under-sized vs reality — a correct **16.5 m field-erected 316L column costs more, not less** (likely £40–80k). The £26k is wrong in two directions at once.
- **K₂SO₄ crystalliser:** a forced-circulation crystalliser is a **£50–150k package**, not a £21k dimensionless guess (likely **3–7× low**).
- **Carbonation reactor:** correct ~1 m³ (vs 4 m³) → **lower**, ~£10–20k.
- **Heat exchangers:** engine duties run ~2–4× high → areas and costs overstated.
- Net: the current £1.01M BoM is a stack of offsetting errors, not a defensible figure.

## 4. A real design-intent gap for the founder (independent finding)
The brief's stoichiometry is over-determined: 3.1 t/d gypsum + 2.6 t/d KOH fixes only **~0.5 t/d CO₂** as carbonate by Ca-balance, **not the full 1 t/d captured**. So either the plant is capture-only (vent after stripping the rest) or it needs a second carbonation sink. This materially changes the mineralisation-section sizing and should be clarified before any firm cost.

## 5. What this means for the work
- A Level-1 trail applied to the *current* numbers would simply expose that they're guesses — not what the founder wants to show. So **Level 2 (defensible basis on correct sizes) is required, not optional.**
- The defensible path is concrete: cost the **independent (correct) sizes** with sourced Towler & Sinnott / Turton correlations + Lang/bare-module factors, show the **side-by-side** vs the engine's current number so the founder sees what changed and why, and put the trail on *those* numbers.
- Systematically, the engine needs a **registered engineering contract + correct process-sizing tools for `co2_mineralisation`** (this run had neither) — the same gap behind the HAPS physics findings.

## Next
Cost the independent sizes with sourced correlations (coefficients verified to source, CEPCI-dated — not from memory), render the side-by-side "Cost Basis & Assumptions" mockup, sign-off, then wire.
