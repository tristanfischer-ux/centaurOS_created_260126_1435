# ForgeOS PDF Engine v2 — Council: Mendeleev-Style Decomposition Spike Methodology

**Date:** 2026-05-10  
**Trigger:** Tristan's proposal to bottom-up decompose BESS V6 + vfarm Phase 5 into a 5-level linguistic hierarchy (radical → character → word → sentence → paragraph), let the primitives library EMERGE from observation rather than be designed top-down  
**Council seats:** xAI Grok 4.3 · Google Gemini 3.1 Pro Preview · DeepSeek V4 Pro  
**Prior council:** COUNCIL-PRIMITIVES-ARCHITECTURE-2026-05-10.md (commit 9c8a52d8)  
**Task type:** Pure methodology thinking — NO code changes, NO implementation  
**Total cost:** ~$0.053 USD

---

## The Proposal (verbatim for record)

**Linguistic hierarchy:**
- Radical = atomic component sold by distributors (Mouser/Farnell/Digi-Key)
- Character = composite of 2–4 radicals (e.g. fan assembly, capacitor module)
- Word = subsystem (e.g. BMS, power supply, battery rack)
- Sentence = system module (e.g. battery subsystem, propulsion system)
- Paragraph = full product (e.g. containerised BESS, vertical farm cell)

**Spike plan:** 2 weeks, decompose BESS V6 + vfarm Phase 5 PDF into 5 levels; measure radical/word reuse; use thresholds to decide whether model is valid.

**Three scaffolding rules proposed:**
1. Level boundaries by sourcing path (radical = distributor-sold)
2. Composition multiplicity rolls up cost
3. Composition coherence test: don't split past where the unit stops functioning as the named thing

---

## Q1 — Is the Mendeleev analogy accurate? Is 2 projects enough?

**Grok verdict:** No. Mendeleev worked from ~60 independently observed elements whose atomic weights already *showed* periodicity. The coordinator starts with 2 hand-picked instances and 3 a-priori rules — this is an imposed taxonomy, not an empirically emerged periodic law.

**Gemini verdict:** Analogy is conceptually beautiful but the experimental setup is fundamentally too thin. Two points define a line, not a periodic table. BESS and vertical farm are so orthogonal that you will observe the extremes of the spectrum but miss the interpolating structure entirely. "You won't find the periodic table; you will just find that lithium isn't lettuce."

**DeepSeek verdict:** The analogy is fundamentally misleading. Mendeleev had ~60 elements, each characterised by multiple measured properties, *plus* a predictive theory (periodicity) that allowed prediction of missing elements. The coordinator's scaffolding rules are purely taxonomic — they allow classification, not prediction. A sample of 2 projects gives a 95% confidence interval for any proportion so wide that any threshold crossing is noise.

**Consensus:** 2 projects is statistically indefensible as a basis for claiming structure has been found. All three seats agreed the analogy is partially valid as intuition (emergence is better than pure top-down design) but invalid as a justification for the experimental setup.

**Dissent:** None on this question — rare full alignment against the coordinator's framing.

---

## Q2 — Are the overlap-rate thresholds diagnostic? (≥70% radical, ≥40% word)

**Grok verdict:** No. These thresholds are arbitrary. Realistic cross-domain radical reuse for distributor-catalogue parts is 25–45% once you normalise for packaging and voltage class. Word reuse rarely exceeds 15–25% without explicit interface standards. The coordinator's 70% radical threshold is unrealistically high; the 40% word threshold is unrealistically high for the word level. A defensible test would require ≥55% radical reuse (post-normalisation for equivalents) and ≥30% word reuse, plus a secondary metric: unique sourcing paths per radical ≤1.4.

**Gemini verdict:** The thresholds guarantee an artificial failure. For two products with shared manufacturing paradigm (both use PCBAs), radical reuse of commodity parts (100nF capacitors, op-amps) could trivially exceed 90% — but that proves nothing about the linguistic model. Radical reuse for non-trivial domain-specific components will be under 15%. Word reuse will be under 5%.

**DeepSeek verdict:** The thresholds conflate two different diagnostic questions. The right test is whether the sequence R_reuse >> C_reuse >> W_reuse holds — specifically: radical reuse >0.85, character reuse in [0.30, 0.70], word reuse <0.30. If this ordering is violated, the level definitions are unsound. The coordinator's flat thresholds don't capture directional structure.

**Consensus (synthesised):** The proposed thresholds are not defensible. The council recommends replacing them with:
- A **directionality test**: radical reuse must be substantially higher than word reuse (ratio ≥3:1). If the ordering inverts, the model's level definitions are wrong.
- A **sourcing-path uniqueness** check: what fraction of radicals have a single unambiguous distributor sourcing path? If >35% have ambiguous paths (could be radical or character depending on context), the level-boundary rules are non-unique.
- Drop the absolute 70/40 thresholds entirely — they cannot survive contact with the actual data.

---

## Q3 — Cheapest falsifiable test: what is X?

**Grok:** X = more than 35% of radicals exhibit multiple distinct sourcing paths in the same level-1 or level-2 tree position (i.e., the same component appearing sometimes as a discrete radical and sometimes as a sub-element of a character, with incompatible footprints). This can be calculated in <4 person-days and constitutes a hard falsifier that the linguistic boundary rules are non-unique.

**Gemini:** X = The Ghost Layer Phenomenon. If more than 50% of radical nodes skip the character/word levels and attach directly to sentences (system modules), the 5-tier nested model is wrong — hardware graphs are scale-free or bipartite, not linguistic. This would prove that the hierarchy assumption itself fails.

**DeepSeek:** X = Two qualified engineers independently tag a random sample of 100 BOM nodes from the BESS decomposition. If Cohen's kappa for level-assignment agreement on character vs. word boundaries is below 0.6, the model's categories lack objective grounding. This can be run within Week 1, before Week 2 even begins.

**Consensus (the most actionable single X):** Run the inter-rater agreement test (DeepSeek's Q3) at the end of Week 1, inside the BESS decomposition itself. Two engineers (human + coordinator) independently tag 100 nodes. Kappa < 0.6 = model fails, stop before Week 2. This is the cheapest possible kill signal. Grok's path-divergence metric and Gemini's ghost-layer check are additional confirmatory tests to run if kappa ≥ 0.6.

---

## Q4 — Does the composition coherence test avoid the heat-pump failure mode?

**Grok verdict:** Only partially. The rule prevents gratuitous decomposition but does not define interface specifications. A refrigerant loop can be declared atomic while still hiding critical parameters (working fluid, charge mass, pressure ratios) that surface later at word/sentence level. New failure mode: **hidden cross-cutting constraints** that cannot be composed from declared radicals and characters without external knowledge.

**Gemini verdict:** No — it introduces a worse failure: the **Black-Box Trap**. A heat pump refrigerant cycle cannot be further split without losing function (coherence rule applies), so it becomes a single atomic node. But you cannot buy a "heat pump plumbing loop" from Digi-Key. If you obey the coherence rule you lose the ability to generate a BOM. If you break it down into BOM lines you lose the fluid-dynamic function. The rule conflates supply-chain hierarchies with physics hierarchies — these are not the same tree.

**DeepSeek verdict:** The coherence test handles the original failure mode but introduces two new ones: (1) **Emergence blindness** — a specific thermostatic expansion valve's non-linearity only manifests at sentence level, but if the sentence is treated as coherent whole, you lose the ability to trace system-level emergent behaviours back to radical choices; (2) **Abstraction lock-in** — the rule incentivises keeping subsystems opaque, preventing incremental innovation. The library becomes a graveyard of outdated subsystem designs that nobody can split without violating coherence.

**Consensus:** The coherence rule is necessary but not sufficient. It avoids the refrigerant-cycle decomposition failure. It does NOT avoid: (a) the sourcing-path paradox for custom-fabricated or physics-governed units, and (b) cross-level emergent constraint loss. The rule needs a companion: **every atomic node that stops functioning when split must declare its interface envelope** (performance parameters, regulatory constraints, sourcing path) explicitly as node metadata, not just as a named black box.

---

## Q5 — Should we add a 3rd project? Which one?

**Grok:** Yes. Drone propulsion is the strongest third test — it stresses mechanical radicals (bearings, propellers, carbon spars) that share almost no sourcing path with BESS power electronics or vfarm lighting/hydronics. Heat pump is too close to BESS in thermal-management primitives and provides weak additional falsification.

**Gemini:** Yes. Either heat pump (to isolate thermodynamic cycle) or AUV (to force cross-domain re-grafting of battery/fluid/sensor trees). Heat pump is the harder case for physics reasons.

**DeepSeek:** Yes. Heat pump explicitly, not drone. Heat pump stress-tests the model on three axes BESS and vfarm cannot: closed-loop fluid dynamics, continuous geometry (custom heat exchangers), and performance defined by differential equations rather than discrete parts. Drone is dominated by off-the-shelf components (motors, ESCs, frames, batteries) that will fit the radical/character paradigm too easily — it won't challenge the model.

**Council consensus:** Add a 3rd project. **Heat pump** is the right choice. It maximises diagnostic pressure on the model's ability to handle non-electronic-dominant, physics-governed, process-driven products. Drone would likely validate the model superficially (it's too BOM-friendly). Heat pump challenges the sourcing-path rule (custom heat exchangers are not distributor-sold radicals), the coherence rule (refrigerant loop), and the cost roll-up rule (fluid charge price is not a simple multiplicity sum).

---

## Q6 — Biggest risk of bottom-up decomposition (surfaces post-commitment only)

**Grok:** Library lock-in to product-line artefacts rather than distributor-stable atoms. Once >800 nodes are encoded from 2–3 projects, any new product requiring a slightly different package (0603 vs 0805 passives, new cell tab format) forces either combinatorial explosion of near-duplicate nodes or costly retroactive re-tagging of the entire corpus. This only appears after the library is large and change-control becomes expensive.

**Gemini:** Spaghetti ontology via false synonymy, surfacing only when generating a net-new combination at runtime. A 12V DC water pump in a vfarm and a 12V glycol cooling pump in a BESS may decompose into identical character sub-graphs (motor + driver + wire). The generation engine will borrow the cheap vfarm pump character to cool a grid-scale lithium battery because the API matched — unconstrained emergence captures the *what* but fundamentally fails to capture domain constraints (safety ratings, thermal tolerances, regulatory context).

**DeepSeek:** Taxonomic drift — the library's vocabulary reflects the historical projects decomposed, not a universal primitives set. The library overfits to BESS and vfarm architectures. When a 4th or 5th dissimilar product is added (AUV, medical device), the existing level-boundaries don't apply and the library must be retrofitted — at which point tooling is integrated, reports are in production, and ripping out the taxonomy is extremely costly. This failure only surfaces at product 4 or 5, after considerable investment.

**Consensus (most critical):** DeepSeek's taxonomic drift is the failure mode that the prior council's top-down approach specifically prevents. The bottom-up approach produces an artefact-specific vocabulary, not a universal primitives vocabulary. Gemini's false-synonymy failure (pump-for-pump substitution across safety-critical domains) is the most immediately dangerous for report quality, since it would produce physically wrong but structurally plausible BOMs. Both are post-commitment failures — they cannot be detected in a 2-week spike.

---

## Q7 — LLM vs human decomposition

**Grok:** Hybrid. Senior engineer defines the initial radical/character boundary lexicon on the first product (~20 person-hours), audits 10% of LLM-tagged lines on the second product. LLM handles remaining tagging with strict post-editing of sourcing path and multiplicity fields. Pure LLM will silently misclassify footprint variants; pure human won't scale past 3 products.

**Gemini:** Cyborg centaur. Human defines the traversal paths ("trace the power route", "trace the thermal route"). LLM ingests the PDFs, assigns tier probabilities, flags anomalies (items fitting multiple tiers or none). Human reviews only the flagged anomalies — not the full BOM. This concentrates human judgment where it matters.

**DeepSeek:** LLM-first with structured prompting, mandatory human adjudication on 100% of character vs word boundary decisions until inter-rater agreement stabilises. Practical protocol: (1) human defines tagging protocol with concrete edge-case examples; (2) LLM processes 100% of BOM lines with few-shot examples; (3) human samples 20% randomly, calculates agreement; (4) if disagreement >10%, retrain prompt with error cases and re-run. Costs ~2–3 person-days per project.

**Consensus:** Human-defined protocol + LLM execution + human review of anomalies only. The critical human judgment requirement is specifically the character↔word boundary (subsystem identification). That boundary is where the model is most likely to fail and where tacit engineering knowledge matters most. Do not delegate character/word decisions to LLM unsupervised until inter-rater kappa is established.

---

## Q8 — Time/cost: spike vs prior 8–11 week v1

**Grok:** The 2-week spike costs ~$12–18k (senior + LLM assist) and defers, not eliminates, the 8–11 week engineering cost. The spike is a useful 2-week filter, not a substitute. After the spike, hidden constraints and interface modelling will still require 6–7 weeks before a usable primitives library exists.

**Gemini:** 2-week spike is infinitely better as a starting point, viewed as an epistemological de-risking exercise. Spending ~40 person-hours and $50 of LLM API credits to attempt to break the linguistic model will save hardcoding a 5-tier relational nightmare into the database schema. Do the spike, expect the model to break, let the results guide the actual schema shape, then execute the 8-week build.

**DeepSeek:** The leaner spike is a useful pre-conditioner that adds 2–3 weeks but can save wasting 8–11 weeks on a flawed model. Total timeline becomes 10–14 weeks, similar to the original plan, but with a decision gate. The value is real — IF the failure thresholds are set a priori and are stringent enough, AND if the coordinator is prepared to actually kill the linguistic model if the test fails. If the coordinator plans to proceed regardless, the spike is theatre that adds delay without risk mitigation. The spike must have a written, pre-committed kill condition.

**Consensus:** The 2-week spike does not replace the 8–11 week v1. It is a decision gate that sits in front of it. If the model passes, proceed to v1 (total ~10–13 weeks). If the model fails, the spike saves 8–11 weeks of wasted engineering. The net expected value is positive — but only if the kill condition is non-negotiable and written down before the spike begins.

---

## Overall Verdict

**Verdict: Proceed with the 2–3 week decomposition spike, but with three mandatory modifications before starting.**

The spike is the right starting point. Do not skip directly to the 8–11 week v1. Do not skip the spike and continue with per-class manifests either. The bottom-up decomposition approach is epistemologically sound as an experiment. It is not sound as a deployment strategy.

The 3 mandatory modifications:

**Modification 1: Add heat pump as the 3rd project (Week 3).**  
2 projects are statistically insufficient. Heat pump is the right 3rd choice — not drone. Run all 3 projects before making the go/no-go decision.

**Modification 2: Replace the 70/40 thresholds with the directionality test + kappa test.**  
Write down before Week 1 begins: the model fails if (a) Cohen's kappa for character↔word boundary decisions is below 0.6, OR (b) radical reuse rate is not substantially higher than word reuse rate (ratio ≥3:1 required). Do not change these thresholds mid-spike.

**Modification 3: Every atomic node that invokes the coherence rule must declare its interface envelope explicitly.**  
The coherence test avoids decomposition failures but introduces hidden cross-cutting constraints. Any node labelled "do not decompose" must carry: performance parameters, regulatory constraints, sourcing path, and failure modes as declared metadata — not as a black box.

---

## Third Path (if spike fails)

If the spike fails (kappa < 0.6 or directionality inverts), do not return to per-class manifests and do not abandon primitives. Instead:

**Hybrid path:** Use the failed decomposition to identify the natural "granularity pressure points" — the BOM levels where the linguistic model breaks down. Build the primitives library at those specific levels only, with explicit graph edges between levels rather than strict 5-tier nesting. This is the knowledge-graph-anchored approach from the prior council, without the rigid linguistic framing. The spike's decomposition work is not wasted — it becomes the initial graph population exercise.

---

## The Single Most Important Pushback Tristan Should Hear

**The spike only has value if you commit to a kill condition in writing before it starts.**

All three council seats flagged this independently. DeepSeek put it most directly: "Founders often fall in love with analogies; there is risk the threshold will be lowered to 'pass' the test, rendering the spike a justification exercise rather than a genuine validation. That would be a net loss — it adds delay without real risk mitigation."

The Mendeleev analogy is compelling and probably directionally correct. That is exactly why it is dangerous. The risk is not that the spike produces bad data — it is that the spike produces ambiguous data and the analogy's appeal causes the coordinator to interpret that ambiguity as a pass. The linguistic model should be treated as a falsifiable hypothesis, not as a framework to be validated. Write the kill condition now, before any decomposition begins.

---

## Synthesis Table

| Question | Grok | Gemini | DeepSeek | Council Verdict |
|---|---|---|---|---|
| Q1: Analogy accurate? | No — imposed taxonomy | Partially — two points don't make a table | No — no predictive theory | **Analogy is motivating, not sufficient. 2 projects too thin.** |
| Q2: Thresholds defensible? | No — 55%/30% better | No — commodity reuse ≠ model validation | No — directionality ratio more diagnostic | **Replace with kappa test + 3:1 directionality ratio.** |
| Q3: Cheapest falsifier? | Path-divergence >35% radicals | Ghost-layer: >50% radicals skip tiers | Kappa <0.6 on character↔word | **Kappa test (Week 1, BESS only). Stop before Week 2 if fails.** |
| Q4: Coherence rule fixes heat pump? | Partially — hidden constraints remain | No — Black-Box Trap | Partially — two new failure modes | **Rule necessary, not sufficient. Add interface envelope declaration.** |
| Q5: 3rd project? | Drone | AUV or heat pump | Heat pump | **Heat pump (consensus 2/3).** |
| Q6: Biggest risk post-commitment? | Library lock-in at 800+ nodes | False synonymy across safety-critical domains | Taxonomic drift at product 4–5 | **Taxonomic drift (DeepSeek) + false synonymy (Gemini) — both post-commitment failures the spike cannot detect.** |
| Q7: LLM or human? | Hybrid: human lexicon + LLM tagging | Cyborg: human routes + LLM anomaly-flagging | LLM-first + human kappa check | **Hybrid. Human owns character↔word boundary until kappa established.** |
| Q8: Spike vs 8–11 week v1? | Spike defers, doesn't eliminate v1 | Spike is essential de-risking before v1 | Net positive only with pre-committed kill condition | **Spike = decision gate, not replacement. Total timeline ~10–13 weeks if model passes.** |

---

*Cost: ~$0.053 USD total (Grok $0.0050, Gemini $0.0271, DeepSeek $0.0207)*
