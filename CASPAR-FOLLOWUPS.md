# Caspar — open engineering questions (CO2 dossier)

*Questions for Caspar Schoolderman that need his domain call — surfaced by the engine's own checks. Send alongside the corrected dossier.*

## 1. Absorber aspect ratio at pilot scale
The 20 m packed height (your pilot-data anchor) combined with the tiny 1 t/day flow's flooding diameter (~0.2 m) gives a ~100:1 height-to-diameter column. The engine's physics critic flags this as physically impossible at that diameter (it computes a ~28.6 m bed at 0.2 m).
- **Question:** does the ~20 m of packing hold at this **pilot** scale? If so, the column presumably needs either a larger diameter (over-sized for the flow but practical) or to be built in **staged beds with redistributors**. Or is 20 m a **commercial-scale** figure that shouldn't carry down to a 0.2 m pilot column?

## 2. Gypsum carbonation reactor size / height
The reactor renders at ~5 m³ / ~3.1 m tall (the orchestrator's residence-time sizing tool overrides the contract's intended 1.3 m³). 3.1 m exceeds the 2.59 m road-skid transport height.
- **Question:** what's the right reactor volume / residence time for the 1 t/day pilot, and is it skid-mounted or a separate field-erected vessel? (An earlier cost audit suggested ~1 m³ is closer to right.)

## 3. Pattern — pilot-scale geometry
Both of the above are the same class: the engine's sizing is geometrically awkward at 1 t/day (thin-tall absorber, too-tall reactor). Worth a general steer on whether the pilot is genuinely 1 t/day or a slipstream of a larger unit, since that drives all the column/vessel geometry.

---

## Casper call — strategic direction (2026-06-09)

**Customer:** Casper (Concrete4Change CEO archetype — construction/concrete founder who accidentally has to run a chemical company). Primary validation source for the engine's product direction.

### Product
1. **The "one location" for all engineering tools is the product.** Pain: every tool is a separate licensed silo (Koch/Cochledge columns, Calvion heat exchangers, Aspen process, Excel kinetics) that don't interoperate. Win = one place to iterate the whole design (absorber/reactor/heat-exchanger/mass-&-heat-balance) and **tweak any tool input + re-run**. The brief editor is the seed → extend edit→save→re-run to each engineering-tool card. Tools-as-Python-packets is already the right architecture.
2. **Balance automatic-generation vs modifiability:** "I use what the AI proposes unless I have further info" (e.g. multi-phase CP correction) → then edit numbers + re-run. Editable everywhere.
3. **Engineering depth is the SUBSTRATE, not the product.** For the funnel, engineering "isn't essential" — value = visualisation + cost + "get expert XYZ next". REFRAME of THE AIM: credible-enough-to-hand-to-an-expert, not ≥8-on-everything. Keep numbers defensible (a wrong figure kills expert trust) but invest marginal effort in the expert/supplier hand-off + editable-tool UX.
4. **Engineering-first layout VALIDATED:** pure engineering + process flow up front, THEN 3D structure (modules + sub-components). The Part 1/Part 2 split was the right call.

### Business model (stage-gate funnel)
- Free concept doc (gets them in) → £5k refined version → £20k next stage → construction → testing (small or full) → in-house/on-site operation. Increasing gates.
- Revenue: cut of expert/consultant hours (Casper's back-catalogue) + 2-3% on hardware — and the 2-3% can be **supplier-paid** (you bring suppliers customers).
- The doc names the next step: "~N days expert hours, £5-10k, here's who."
- Expert feedback loop: experts refine the doc, talk to each other, return a new version → feeds back to update the report with real people + real materials/costs (data flywheel = growing-DB principle).
- End-state: licensable design-and-build; sell concept/plant to operators.

### Tech to evaluate
- **DWSIM** — open-source Aspen equivalent, verified, C# (slow) but has Python modules; Casper uses it for simulation now. Candidate real sim backend behind the tool packets.
- **GoToEngine** — open software, lets you state intent without a fixed workflow.
- Tool provenance: licensed (Koch/Calvion) OR free (MIT/Oxford/Delft, good provenance) OR AI-generated deterministic Python. Matches the engine's tool model.
- Blender-style layout: collision boxes → "allowable-space" envelopes; parts DB drag-drop; auto pipe-routing (like electrical CAD).
