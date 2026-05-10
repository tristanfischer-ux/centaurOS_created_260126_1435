# Council: Grammar Layer + Corrected Radical Concept
**Date:** 2026-05-10  
**Session context:** Tristan brainstorm. Pure architecture thinking, no code changes.  
**Prior councils:** Primitives architecture (commit `9c8a52d8`), Mendeleev decomposition spike (commit `abf80d9f`).

## Models consulted (3 seats, parallel)
| Seat | Model | Cost |
|---|---|---|
| Grok 4.3 (adversarial) | `x-ai/grok-4.3` | $0.0074 |
| Gemini 3.1 Pro Preview (lead reasoner) | `google/gemini-3.1-pro-preview` | $0.0358 |
| DeepSeek V4-Pro (structured reasoner) | `deepseek/deepseek-v4-pro` | $0.0227 |
| **Total** | | **~$0.066 (~£0.052)** |

---

## V1 — Corrected radical concept: consensus verdict

**Unanimous: the corrected framing (radical = semantic primitive) is unambiguously superior.**

Grok: "Treating radical as catalogue entry collapses the abstraction layer required for composition and rule inheritance; it produces the exact false-synonymy failure already noted. The hierarchy is sound."

Gemini: "Modelling a catalogue entry as a 'radical' is an anti-pattern that leads to millions of root nodes — a mathematical disaster for search and constraint-solving."

DeepSeek: "The shift moves the model from a procurement-centric ontology to a compositional, property-based one — the bedrock of generative engineering reasoning."

### V1 minority push: Gemini's parametric interface gap

Gemini alone flagged a **structural gap** the others missed: the hierarchy leaps from Modifier directly to Catalogue Entry, skipping a **Parametric Interface (Archetype)** layer. In engineering practice, "M8×30 304 stainless bolt" is a parametric requirement; "McMaster 91290A115" is a supply-chain instantiation of that requirement. Engineers design at the Archetype layer before they buy. Grammar rules should fire against the Archetype, not against MPNs (which go EOL constantly).

**Revised hierarchy (Gemini recommendation):**
1. Radical (Primitive) — ~50–200
2. Character (Function-Class) — ~500–2,000
3. **Archetype / Parametric Interface** — Character + Modifiers; the "designed with" layer — ~10,000–100,000
4. Catalogue Entry (MPN instance) — millions
5. Word (Subsystem, 1–3 Characters)
6. Sentence (System Module)
7. Paragraph (Full Product)

**Council verdict on this refinement:** adopt. It is architecturally clean and matches what MBSE tools (SysML, Modelica) actually model. The Coordinator should note the Archetype insertion as a correction to the prior model.

### V1 minority push: Grok's typed-relation character model

Grok proposed treating Characters as typed *relations* between Radicals rather than simple bags. "Steel bolt" is not steel ⊕ fastening-function but steel ⊕ fastening-function with a *cross-section* property — enabling direct attachment of domain equations at the character level (Ohm's law, skin effect) without waiting for sentence level. This is compatible with the Gemini Archetype addition and is a useful implementation detail for the character layer.

---

## V2 — Candidate radical seed list

Compiled from all three council members, deduplicated, grouped by category. **Recommended v1 library: ~45–50 primitives.**

### Materials (~20)
- steel (carbon/alloy)
- stainless-steel (316L / 304 distinguished at modifier level)
- aluminium
- copper
- titanium
- nickel
- zinc
- brass
- polymer (thermoplastic)
- polymer (thermoset)
- elastomer
- ceramic (alumina / technical)
- glass
- silicon
- composite (CFRP)
- composite (GFRP)
- graphite / carbon
- refrigerant (class: fluid)
- dielectric-fluid
- thermal-paste / phase-change material

### Functions (~16)
- structural-support / load-bearing
- fastening
- sealing (static)
- sealing (dynamic)
- electrical-conducting
- electrical-insulating
- thermal-conducting
- thermal-insulating
- sensing (transduce)
- actuating (kinematic)
- fluid-transport / pumping
- switching (electromechanical)
- controlling (logic)
- energy-storage (electrical)
- energy-storage (chemical)
- heat-transfer (phase-change)

### Energy forms (~8)
- electrical-DC
- electrical-AC
- mechanical-rotational
- mechanical-linear
- thermal-sensible
- thermal-latent
- chemical-bond
- hydraulic-pressure

### States of matter (~5)
- solid
- liquid
- gas
- two-phase (explicit)
- supercritical (refrigerant only)

### Fields (~6)
- electric-field
- magnetic-field
- thermal-gradient
- fluid-velocity / pressure field
- mechanical-stress-field
- gravitational (structural only)

**Total: ~55 candidates. Trim to ~45 for v1 by merging overlapping function radicals.**

---

## G1 — Grammar separate from vocabulary?

**Verdict: yes, architecturally separate — but must be designed with shared property contracts.**

All three agreed. Grammar and vocabulary are separate concerns (vocabulary defines typed nodes; grammar defines constraint predicates over the typed graph), but they share a **property API interface**: every property that a grammar rule queries must be present in the vocabulary definition. Designing grammar first risks vocabulary lacking the right properties; designing vocabulary first risks missing grammar-required fields.

**When grammar fires (all three agreed on dual-mode):**
1. **During decomposition (local, incremental):** as each Character or Archetype is composed, pairwise rules fire immediately. Prunes invalid branches early. Matches how constraint solvers in Modelica/CAD work.
2. **Post-decomposition (global):** after a complete Paragraph is assembled, system-level rules fire (conservation laws, full-cycle energy balance, standards compliance). Cannot fire incrementally because they require global state.

Gemini's key framing: "If you wait until a full BESS design is generated to check for thermal runaway standards, you will reject 99.9% of outputs — a Generate-and-Test failure mode." Grammar must prune during generation.

---

## G2 — Rule-attachment-with-inheritance model

**Verdict: correct starting model, but requires three supplements.**

All three agreed the single-inheritance model is the right *scaffold*. Failure modes flagged:

**1. Emergent constraints (all three):** Rules that depend on aggregation across siblings (e.g., total current on a busbar = sum of all branch circuits) cannot attach to any one component. Requires *assembly-scope rules* that operate on collections, not individuals.

**2. Context-dependent relaxation (DeepSeek):** A pump rated at 80°C used at 90°C with an additional cooling jacket is valid — but the inherited rule would block it. The rule must be parameterised: `ambient_temp < 80°C` where the assembly supplies the actual ambient value. Override at the character level would incorrectly mutate the pump's intrinsic limit. Rules need context injection, not just override.

**3. Multiple-inheritance conflicts (DeepSeek):** A bimetal strip inherits rules from two material radicals. Conflict resolution strategy needed (min/max/domain-specific). No consensus on the resolution mechanism — this is an open design question.

**4. Propagation latency (Grok):** When a procurement rule (EOL date) is updated at radical level, all catalogue descendants must be re-validated. Without explicit dependency tracking, this becomes O(n) expensive. Mitigation: maintain explicit override log and dependency graph.

**5. Trait-based multiple inheritance (Gemini):** Gemini pushed hardest here — called strict single-parent hierarchy "the wrong model." Proposed trait/mixin model: rules attach to *traits* (e.g., `Conductor`, `Purchasable`), not to hierarchical levels. If a component has the `Conductor` trait, it inherits KCL/KVL rules. This is compatible with the inheritance model as long as Radicals can carry multiple traits. Adopt as implementation detail.

**Supplement:** Add assembly-scope rules, context-parameterised rules, and trait-based attachment on top of the inheritance scaffold.

---

## G3 — v1 Grammar Registry: 45 specific rules

Compiled from all three responses. De-duplicated. Ordered by criticality within each group.

### Conservation Laws (5 rules)
1. **KCL:** ΣI_in = ΣI_out at every electrical node.
2. **KVL:** ΣV_drops − ΣV_sources = 0 in every closed loop.
3. **Fluid mass balance:** Σ mass-flow-in = Σ mass-flow-out (steady state, closed loop).
4. **Thermal energy balance:** Q_in − Q_out + Q_gen = m·c·ΔT per thermal node; total system dissipation < total cooling capacity.
5. **Species conservation:** In chemical/electrochemical reactors, moles consumed = moles produced per stoichiometry.

### Materials Compatibility (10 rules)
6. **Galvanic — copper/aluminium:** Direct contact in humid environment; interpose dielectric washer or bilateral coating. (Anodic index difference > 0.25V = violation.)
7. **Galvanic — zinc/stainless:** Zinc and 304 stainless in moist environment; require sealant or bimetallic isolator.
8. **Thermal expansion mismatch:** Polymer bonded to steel over ΔT > 50K; joint must allow differential strain or use flexible adhesive.
9. **Copper + ammonia:** Forbidden above 60°C (stress-corrosion cracking).
10. **316L stainless + chloride:** Cl⁻ concentration > 1,000 ppm requires pitting-resistance verification (PREN ≥ 33).
11. **Elastomer EPDM + mineral oil:** Forbidden; severe swelling.
12. **Elastomer NBR (Buna-N) + ozone/ketone:** Forbidden; rapid degradation.
13. **PVC conduit + hydrocarbon hydraulic fluid:** Forbidden; chemical attack.
14. **High-strength steel (UTS > 1,000 MPa) + hydrogen:** Hydrogen embrittlement risk; require coating or lower-strength grade.
15. **Copper at > 200°C in air:** Rapid oxidation; require nickel or silver plating.

### Domain Physics (10 rules)
16. **Refrigerant cycle closure:** Compressor inlet enthalpy < evaporator outlet enthalpy; superheat ≥ 5K.
17. **Refrigerant mass flow:** Mass flow through compressor = mass flow through expansion valve (steady state).
18. **Battery charge rate:** Charging current ≤ max C-rate at current SoC and temperature.
19. **Battery cell balance:** Max ΔSoC between any two cells ≤ 3% at C/5 rate.
20. **Transformer volt-second balance:** Volt-second product on each core leg under PWM must not cause saturation.
21. **Inductive flyback:** Inductive loads (relays, motors) on DC circuits must have parallel flyback diode.
22. **NPSH margin:** Pump NPSHA ≥ NPSHR + 1m safety margin to prevent cavitation.
23. **Pipe erosion velocity:** Flow velocity ≤ erosion limit for material (e.g., 1.5 m/s for copper in potable water).
24. **Drone lift margin:** Total thrust ≥ 1.5× MTOW at hover.
25. **Antenna resonance:** Physical dimensions must respect λ/4 to λ/2 for target frequency.

### Standards (8 rules)
26. **IEC 60664 clearance:** If voltage > 50V RMS, spatial clearance between exposed conductors must meet Table F.4 (e.g., 1.5mm for 300V, PD2).
27. **G99 ROCOF:** Rate of Change of Frequency protection must trip and isolate if df/dt > 1.0 Hz/s sustained ≥ 5s.
28. **G99 frequency response:** Active power must reduce by 40%/Hz between 50.5 and 52 Hz.
29. **IEC 62619 overcharge test:** Cell-level overcharge at 1.072× max charging voltage for 4h; no fire/explosion.
30. **UL 9540A thermal runaway:** Cell-to-cell barriers must prevent propagation propagation for ≥ 1 hour; required if > 20 kWh in one enclosure.
31. **NFPA 855 energy density:** Maximum stored energy per rack ≤ 50 kWh (lithium) unless 3-hour fire barrier. Separation between racks ≥ 0.9m.
32. **F-Gas / Kigali:** Refrigerant GWP ≤ 750 for new products (scope-dependent; ≤ 150 for heat pumps post-2025 EU).
33. **ISO 13485 (CGM):** All materials in contact with tissue must have ISO 10993 cytotoxicity certification; USP Class VI for direct contact.

### Manufacturer Limits (6 rules)
34. **Voltage derating:** Applied voltage ≤ 80% of manufacturer-rated continuous voltage.
35. **Current derating:** Steady-state current ≤ nominal I_rating at operating temperature.
36. **Temperature envelope:** Operating ambient must remain within [T_min, T_max] from datasheet.
37. **Capacitor life (Arrhenius):** L = L₀ × 2^((T_max − T_op)/10) must exceed system MTBF target.
38. **1,500V DC fuse breaking capacity:** ≥ 30 kA for grid-scale BESS applications.
39. **Minimum cable bend radius:** > 5× OD for static, > 10× OD for dynamic routing.

### Procurement Reality (6 rules)
40. **NRND/EOL block:** Any MPN with "NRND" status or EOL date < 18 months from project production date triggers hard block.
41. **Lead time risk:** Supplier lead time > (critical-path date − today) + 4 weeks triggers supply-chain risk flag.
42. **MOQ feasibility:** MOQ > 5,000 units on a prototype build (< 50 units) triggers soft warning; suggest alternative package or cross-project aggregation.
43. **Certification completeness:** Selected part must carry required certifications (CE, UKCA, UL, CSA) for target market; absence triggers hard block.
44. **ITAR/EAR flag:** Any FPGA or IC handling encrypted RF telemetry must trigger ITAR/EAR compliance review.
45. **Metric/Imperial thread mixing:** Fastener thread standards must not mix Metric (M) and Imperial (UNC/UNF) on the same sub-assembly.

---

## G4 — Standards extraction approach

**All three recommended hybrid. Grok and DeepSeek placed pure-LLM failure rate at 15–40% for quantified limits — unacceptable for safety-critical rules.**

| Approach | Failure rate | Notes |
|---|---|---|
| Pure LLM-on-PDF | 25–40% | Hallucinated thresholds, missed conditionals, mixed clauses |
| Pure hand curation | < 2% | Accurate but ~4–6 person-hours per 100-page standard; unscalable |
| Hybrid (recommended) | < 5–8% | LLM pre-parses to candidate JSON tuples; engineer reviews in structured dashboard; automated test suite validates against known pass/fail cases from standard |

**Recommended v1 approach:**
1. LLM agent digests PDF → structured JSON: `[Standard, Target_Trait, Condition, Limit_Value, Source_Clause_Reference]`
2. Engineering SME dashboard shows candidate + side-by-side PDF highlight
3. Engineer approves or corrects each predicate
4. Approved rules compile to grammar DSL; test suite validates against reference scenarios
5. Audit trail established (legally traceable to source clause)

**For v1:** hand-curate the 10 most safety-critical standards (G99, IEC 62619, NFPA 855, UL 9540A, F-Gas, ISO 13485); use hybrid for remainder.

---

## G5 — Violation response: soft warn vs hard block

**Consensus: rule class determines response. Three-tier model.**

| Rule class | Response | Rationale |
|---|---|---|
| Conservation laws, safety-critical standards (NFPA 855, UL 9540A, IEC clearances) | **Hard block + forced re-decomposition** | Cannot warn someone a fluid loop violates mass conservation or a battery will arc flash |
| Materials compatibility, manufacturer limits (> 10% over-limit) | **Hard block** | Gross violation indicates invalid part selection |
| Manufacturer limits (< 10% margin breach), domain physics with acceptable workarounds | **Soft warn + redesign suggestion** | Small overstress may be acceptable with derating analysis; offer next-best alternative automatically |
| Procurement (lead time, MOQ, EOL < 18 months) | **Soft warn** | Supply-chain risk only; does not invalidate technical performance unless EOL is imminent |
| Unresolvable conflicts (conservation law AND physical envelope constraint — no valid solution exists) | **Halt + escalate to user** | System must surface the constraint conflict and ask user to relax a global requirement |

**Re-decomposition trigger:** when a hard block fires, system should offer automatic substitution from the library (next-best catalogue entry that satisfies all rules), re-running validation, before escalating to user.

---

## G6 — Sequencing: vocabulary spike first, grammar, or parallel?

**Dissent between seats. This is the most contested question.**

| Seat | Verdict | Reasoning |
|---|---|---|
| Grok | Grammar first (reversed) | Grammar prunes the vocabulary search space before expensive catalogue lookup or BOM costing; inserting grammar early avoids generating combinatorially invalid compositions |
| Gemini | Parallel ("skinny-thread") | Vocabulary designed without grammar won't include the right parametric properties (e.g., ESR for capacitors for thermal rules); parallel co-evolution avoids expensive vocabulary rewrite |
| DeepSeek | Vocabulary first (sequential) | Grammar rules are constraints over vocabulary types; unstable vocabulary means rules built on shifting ground with high rework risk |

**Synthesis:** Gemini's skinny-thread parallel approach resolves the deadlock. The risk Grok names (combinatorial explosion) is real but is addressed by building minimal vocabulary (5 radicals, 10 characters, 1 subsystem) and attaching 3 conservation + 3 materials + 3 standards rules before expanding. The risk DeepSeek names (vocabulary churn invalidating rules) is real but is addressed by treating the early parallel sprint as a joint spike, not independent workstreams.

**Final recommendation: parallel co-evolution via skinny-thread spike.**
- Week 1: 5 radicals + 10 characters + 3 conservation rules + 3 materials compatibility rules → prove the property-API interface
- Week 2: expand vocabulary to 25 radicals based on what the rules need to query
- Week 3: expand grammar to 20 rules based on what the vocabulary can support

---

## G7 — Biggest grammar-layer failure mode

**Two answers emerged. Both are genuine risks; one is more acute.**

**Grok: Silent Ossification (most acute for ForgeOS)**
> "Once the grammar registry contains several hundred rules, novel but physically valid architectures are rejected without explanation because the required exception pathway was never coded. The system appears correct while systematically blocking the next product generation."

Example: a novel solid-state battery architecture using ceramic electrolyte is hard-blocked by a rule requiring a liquid separator, which was written for lithium-ion. The rule is correct for LI but wrong for SSB. The system has no mechanism to surface this as "rule needs update" vs "architecture is invalid."

**Gemini: Emergent Over-Constraint / Design Space Deadlock (most severe in consequence)**
> "When thousands of rigid boolean rules interact, the design space shrinks to zero. Engineering is almost exclusively about managed trade-offs."

Example: drone motor shielding triggers EMI constraint → steel mass triggers dynamic load constraint → larger motor needed → battery C-rate violated → larger battery violates FAA weight limit → system deadlocks with no valid design.

**Resolution:** the grammar engine cannot be a pure boolean pass/fail checker. Rules must carry relaxation weights. When deadlocked, the engine must know which rules can be *softened* (reduce MTBF expectation to solve weight) rather than returning "ERROR: IMPOSSIBLE." This is the Optimization/Cost-Function Solver framing.

**Synthesis: both risks are real. Ossification is the more likely failure for v1 (happens first, quietly). Deadlock is the more catastrophic failure at scale (blocks all output). Design the override/exception mechanism into the grammar architecture from day one.**

---

## Final verdict

**Proceed: parallel vocabulary spike + grammar registry co-evolution (skinny-thread), not sequential.**

Rationale:
- The corrected radical concept is architecturally sound and should be adopted, with Gemini's Archetype/Parametric Interface layer inserted between Modifier and Catalogue Entry
- Grammar is a genuinely separate concern but must share a property API with vocabulary; they cannot be designed in isolation
- The inheritance model is correct as a scaffold but needs: assembly-scope rules, context-parameterised rules, and trait-based attachment
- The v1 grammar registry (45 rules above) is defensible and can be implemented incrementally
- Standards extraction must be hybrid; pure LLM failure rate is disqualifying for safety-critical rules
- The violation response must be tiered (hard block / soft warn / halt+escalate), not uniform
- Build the relaxation-weight mechanism into the grammar architecture now, before the registry grows large enough to cause deadlock

---

## Single most important pushback for Tristan and the Coordinator

**Gemini's Archetype layer insertion is the most consequential correction.**

The current hierarchy (Radical → Character → Modifier → Catalogue Entry) has grammar rules firing against MPNs, which are volatile (EOL, re-spins, distributor-specific). Every rule written against a catalogue entry must be rewritten when the MPN changes. The Archetype / Parametric Interface layer sits between Modifier and Catalogue Entry and is stable: it is the "designed-with" layer that engineers actually work in. Grammar rules should attach here, not at the MPN layer. This is not a cosmetic refinement — it changes where 80% of the grammar rules live, and it makes the system maintainable as Mouser's catalogue turns over.

**Action required:** before the vocabulary spike adds a single catalogue entry, confirm that the Archetype layer is explicit in the schema. Everything else can be iterated.
