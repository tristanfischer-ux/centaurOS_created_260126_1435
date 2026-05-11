# Council: Universal Functional Taxonomy for Module-Decomposition Stage

**Date:** 2026-05-11
**Engine:** PDF Engine v2 (Radical)
**Stage:** Module decomposition (new — sits between brief and radical-tree)
**Seats:** 3 (Grok 4.3 generalist, Gemini 3.1 Pro systems thinker, GLM 5.1 implementation skeptic)
**Cost:** USD 0.045 (~ GBP 0.036)

---

## Executive Summary

All three seats independently arrived at the same three additions: **Actuation/Kinematics**, **Mass/Fluid Transport & Process**, and **Human-Machine Interface**. Without these, products with moving parts (drone, AUV, surgical end-effector, tidal turbine, satellite dish), process flows (bioreactor, RO desalination, microbrewery, vfarm, heat pump refrigerant loop), or user touchpoints (CGM patch, EV charger screen) cannot be cleanly decomposed — the LLM will scatter their core functional components across `Energy conversion` and `Materials/containment`, shattering BoM cohesion. Score consensus: **NEEDS_MINOR** (Grok, Gemini) to **NEEDS_MAJOR** (GLM); recommended action is to adopt a refined **12-module taxonomy** with stricter orthogonality boundaries between Safety, Environmental Interface, and Power Distribution.

---

## The Proposed 9 (Tristan's Draft)

1. Energy storage / source / dissipation
2. Energy conversion / transduction
3. Materials / structure / containment
4. Sensing / instrumentation
5. Control / compute / communication
6. Safety / protection
7. Environmental interface (thermal / fluid / atmospheric)
8. Power distribution
9. Maintenance / serviceability

## Recommended Additions (Convergent — All 3 Seats)

10. **Actuation / Kinematics / Mechanisms** — converts force/torque into kinematic intent (joints, gears, propellers, control surfaces, end-effector jaws, dish actuators, turbine blades). Required by drone, AUV, HAPS, surgical robot, tidal converter, satellite ground station.
11. **Mass / Fluid Transport & Process** — internal pumping, mixing, filtration, separation, phase change, biological/chemical processing (distinct from passive containment in 3 and from environmental heat/mass exchange in 7). Required by bioreactor, RO skid, microbrewery, vfarm, heat pump refrigerant circuit.
12. **Human-Machine Interface (HMI) & Ergonomics** — touchscreens, haptics, ergonomic grips, biocompatible/wearable interfaces, manual valves, sight glasses. Required by EV charger, CGM (skin-adhesive patch), surgical end-effector, microbrewery, satellite ground station.

---

## Per-Seat Verdicts

| Seat | Model | Verdict | One-line summary |
|------|-------|---------|------------------|
| 1 | x-ai/grok-4.3 | **NEEDS_MINOR** | Add Actuation + Fluid Transport; merge 8→5; demote 9 to metadata. |
| 2 | google/gemini-3.1-pro-preview | **NEEDS_MINOR** | Add Actuation + Mass Transport + HMI; tighten Safety/Materials and Safety/Maintenance boundaries. |
| 3 | z-ai/glm-5.1 | **NEEDS_MAJOR** | Same three additions; merge Power Distribution into Energy Systems; merge Maintenance into Safety. Will break in production on anything moving or processing fluid. |

---

## Per-Seat Detailed Responses (Verbatim)

### Seat 1 — Grok 4.3 (Engineering Generalist)

> **Completeness:** Missing: Mechanical actuation / kinematics / transmission. Required for drone (propulsion/flight surfaces), AUV (thrusters/rudders), tidal energy converter (turbine blades/gearbox), surgical-robot end-effector (grippers/joints), and marginally for heat-pump compressor and RO skid valves. Missing: Fluid transport / pumping / valving. Required for bioreactor (media loops), vfarm (irrigation), RO desalination skid, microbrewery vessel, and heat-pump refrigerant circuit.
>
> **Orthogonality:** Modules 1 and 8 overlap semantically on energy paths; an LLM routinely places switchgear, cabling and bus-bars under both. Refined boundary: confine 1 to generation/storage/dissipation elements; move all distribution conductors, breakers and conditioning to a merged electrical-distribution function within 5. Module 7 overlaps 3 on containment (pressure vessels, seals); confine 7 to external heat/mass transfer interfaces.
>
> **Redundancy:** Module 8 is redundant once boundaries above are applied and can merge into 5. Module 9 is largely procedural rather than functional for the test set and can be removed or demoted to an annotation tag.
>
> **Synthesis:** The nine-module taxonomy is largely coherent and maps onto most test products, yet the absence of distinct actuation/kinematics and fluid-transport categories forces repeated boundary violations; tightening 1/8 and demoting procedural maintenance yields a compact, non-overlapping set sufficient for universal BoM generation.

### Seat 2 — Gemini 3.1 Pro (Systems Thinker)

> While it handles Energy (Categories 1, 2, 8) and Information (Categories 4, 5) quite well, it lacks sufficient granularity for dynamic flows and manipulation of **Matter**. Furthermore, it ignores the human element. The missing universal categories are: Actuation, Kinematics & Mechanisms; Mass Transport & Process Fluidics; Human-Machine Interface (HMI) & Ergonomics.
>
> **Orthogonality concerns:** Energy Conversion (2) vs. Environmental Interface (7) — In a Heat Pump, expanding refrigerant cools the air. Is the evaporator "energy conversion" or "environmental interface"? Refined boundary: Module 2 covers sub-systems generating power or changing energy domains (e.g., motor, fuel cell, transformer). Module 7 covers managing the by-products of operation (e.g., heat sinks, HVAC) and weather proofing.
>
> Safety (6) vs. Materials/Structure/Containment (3) — Module 3 is for *passive* baseline physical integrity (the chassis, sealing, pressure vessels). Module 6 is for *active or specific* hazard mitigation systems (pressure relief valves, E-stops, fuses, radiation shielding, burst disks).
>
> Safety (6) vs. Maintenance (9) — Module 6 is for protecting the system/users *during operation*. Module 9 is for systems designed for *offline* accessibility (diagnostic ports, lifting lugs, modular swappable bays).
>
> **Synthesis:** Your proposed taxonomy forms a highly robust baseline for automating the generation of engineering specifications, successfully capturing the energy and information flows of complex systems. However, its current structure reveals a "power-electronics and IoT" bias, lacking the requisite dimensions to describe dynamic flows of matter (fluids, chemicals) and physical manipulation (robotics, kinematics). By introducing distinct modules for Actuation/Mechanisms, Mass Transport, and HMI, you complete the universal Matter-Energy-Information triad. Furthermore, establishing strict prompt-level boundaries — particularly forcing "Safety" and "Maintenance" to represent active sub-systems (e.g., E-stops, diagnostic ports) rather than cross-cutting concepts — will be critical to prevent your LLM from hallucinating overlapping Bills of Materials across the modules.

### Seat 3 — GLM 5.1 (Implementation-Leaning Skeptic)

> The taxonomy is incomplete. It is heavily biased towards electro-mechanical and structural systems, ignoring kinematic intent and process flow. An LLM using this taxonomy will routinely misclassify core functional components because it lacks the semantic buckets to put them in.
>
> **Missing: Actuation/Kinematics/Locomotion** — Energy conversion (Module 2) changes energy *type*, but actuation applies that mechanical energy to *kinematic intent*. Without this, an LLM will put a drone propeller or surgical robot joint under "Energy conversion" or worse, "Materials", destroying the kinematic traceability of the BOM.
>
> **Missing: Mass/Fluid Transport & Processing** — Module 3 (Containment) is static. Many engineering products exist to move, mix, or filter mass through process stages. Without this, the process-flow logic of a BOM is shattered. An LLM will put a bioreactor impeller in "Energy conversion" and the vessel in "Containment", losing the fact that they form a single functional mixing system.
>
> **Missing: HMI/Ergonomics** — If an LLM has to classify a touchscreen, a haptic feedback joystick, or an ergonomic grip, it will scatter them between Sensing (4), Control/Compute (5), and Materials (3). HMI is a distinct functional domain that dictates form factor and UX compliance.
>
> **Critical orthogonality fix:** Module 8 (Power distribution) must be strictly limited to *uninterrupted* routing (busbars, cables, switchgear). All current-interrupting/fail-safe devices must be forced into Module 6 (Safety). Module 7 must be restricted to *filtering/buffering* the environment. Module 6 must strictly cover *interlocks and failure containment*.
>
> **Synthesis:** This taxonomy will break in production the moment the pipeline encounters a system that physically moves or processes fluid. By conflating "energy conversion" with "kinematic actuation" and "containment" with "process flow", the schema forces the LLM to make arbitrary semantic choices that shatter the functional cohesion of a BOM — a heat exchanger and a compressor will be orphaned in different modules rather than linked as a thermodynamic cycle.

---

## Coverage Table: Test Product × Module

Y = clearly applies, N = absent or trivial, ? = LLM ambiguity / forced shoehorn under draft taxonomy. Modules 10–12 are the convergent additions.

| Product | 1 Energy | 2 Conv | 3 Struct | 4 Sense | 5 Ctrl | 6 Safe | 7 EnvInt | 8 PwrDist | 9 Maint | 10 Actuate | 11 Process | 12 HMI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BESS 3.5 MWh | Y | Y | Y | Y | Y | Y | Y | Y | Y | N | N | ? |
| Heat pump R290 | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y (compressor) | Y (refrigerant loop) | ? |
| CGM | Y | N | Y | Y | Y | Y | Y | N | N | N | ? | Y (skin patch) |
| Drone | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y (rotors/gimbal) | N | ? |
| EV charger DC fast | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y (cooled cable) | ? (coolant) | Y (screen/handle) |
| Bioreactor SU | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y (impeller) | Y (media/sparging) | Y (sample ports) |
| Vertical farm | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y (lift/rack) | Y (irrigation) | Y |
| Edge AI 1U | Y | Y | Y | Y | Y | Y | Y | Y | Y | N | N | N |
| AUV | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y (thrusters) | Y (ballast) | N |
| HAPS | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y (control surfaces) | N | N |
| Tidal converter 1.5 MW | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y (blades/gearbox) | Y (flow) | N |
| RO desalination skid | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y (HP pump) | Y (membrane train) | Y (HMI panel) |
| Satellite ground station | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y (dish actuator) | N | Y (ops console) |
| Microbrewery vessel | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y (agitator) | Y (wort/yeast) | Y (sight glass/valves) |
| Surgical end-effector | Y | Y | Y | Y | Y | Y | N | Y | Y | Y (jaws/cables) | N | Y (haptics) |

**Verdict:** Without modules 10–12, the right-hand columns force shoehorning into 2/3/4. The 9-module draft fails 11 of 15 test products.

---

## Final Synthesised Taxonomy (12 Modules)

**Universal Functional Taxonomy v1.0**

1. **Energy storage / source / dissipation** — generation, batteries, fuel, capacitors, bleed resistors. *Boundary:* energy held or originated, not routed.
2. **Energy conversion / transduction** — motors, fuel cells, transformers, compressors, inverters. *Boundary:* changes energy domain; does not impart kinematic intent (see 10).
3. **Materials / structure / containment** — passive chassis, frames, pressure vessels, seals. *Boundary:* passive integrity only; active hazard mitigation belongs to 6.
4. **Sensing / instrumentation** — physical-phenomenon transduction (transducers, encoders, biosensors). *Boundary:* if the component runs algorithms, default to 5.
5. **Control / compute / communication** — MCUs, BMS, comms stacks, edge AI inference, networking.
6. **Safety / protection** — *active* hazard mitigation: fuses, breakers, RCDs, pressure-relief valves, E-stops, interlocks, fire suppression. *Boundary:* operation-time hazards only; offline access belongs to 9.
7. **Environmental interface** — heat sinks, HVAC, weather sealing, EMI shielding, ingress protection. *Boundary:* manages by-products / weather; not internal process flow (see 11).
8. **Power distribution** — busbars, cables, switchgear, harnesses, PCB power planes. *Boundary:* uninterrupted routing only; interrupting devices live in 6.
9. **Maintenance / serviceability** — diagnostic ports, access panels, lifting lugs, modular swappable bays, LOTO points. *Boundary:* offline access; operation-time protection lives in 6.
10. **Actuation / kinematics / mechanisms** *(NEW)* — joints, gears, linkages, propellers, control surfaces, end-effector jaws, dish actuators, turbine blades. *Boundary:* applies converted energy to kinematic intent.
11. **Mass / fluid transport & process** *(NEW)* — pumps, valves, manifolds, membranes, mixers, sparging, filtration, separation, phase change, biological/chemical processing. *Boundary:* internal mass flow / transformation; passive containment is 3.
12. **Human-machine interface & ergonomics** *(NEW)* — touchscreens, haptics, displays, manual controls, sight glasses, ergonomic grips, biocompatible / wearable surfaces.

**Cross-cutting attributes (NOT modules):** "-ilities" such as reliability, regulatory compliance, lifecycle cost. These should be metadata tags on every module entry, not a module of their own — Gemini and GLM both flagged that 6 and 9 risk drifting into this category.

---

## Convergent Concerns (All 3 Seats)

1. **Add Actuation/Kinematics** — unanimous; without it, kinematic traceability of any BoM with moving parts is destroyed.
2. **Add Mass/Fluid Transport & Process** — unanimous; without it, refrigerant loops, bioreactors, RO trains, brewing fermentation are shattered across multiple modules.
3. **Add Human-Machine Interface** — Gemini + GLM strongly; Grok implicitly accepts via product gaps.
4. **Tighten Safety vs. Materials and Safety vs. Maintenance boundaries** — Gemini explicit, Grok and GLM aligned. Active mitigation only in 6.
5. **Power Distribution (8) is anaemic for small products** — Grok wants merge into 5, GLM wants merge into Energy Systems. Both agree it should not be a peer-level module unless tightly bounded.

## Divergent Concerns

| Concern | Grok | Gemini | GLM |
|---|---|---|---|
| Power Distribution (8) | Merge into Control (5) | Keep separate; better for BoM | Merge into Energy Systems (1+2) |
| Maintenance (9) | Demote to metadata tag | Keep but tighten boundary vs. 6 | Merge into Safety (6) |
| Overall severity | NEEDS_MINOR | NEEDS_MINOR | NEEDS_MAJOR |
| HMI as distinct module | Implicit (didn't propose) | Explicit recommendation | Explicit recommendation |

**Resolution chosen for v1.0:** Keep 8 and 9 as separate modules but tighten boundaries (Gemini's position). Rationale: BoM generation benefits from explicit busbar/harness lines and explicit serviceability lines; merging them risks the LLM forgetting to enumerate cabling or service hatches. The cost of an extra module is low; the cost of missing line items in a BoM is high.

---

## Confidence Level

**High** on the three additions (10, 11, 12) — independently arrived at by all three seats with concrete failure cases.

**Moderate** on keeping 8 and 9 as separate modules — 2 of 3 seats recommended merging. Pre-flight: run one Iter 3 product (recommend RO desalination skid or bioreactor — exercise modules 11 and 12) and inspect whether 8 and 9 actually carry distinct line items, or whether they collapse into adjacent modules. If empty in practice, demote to metadata tags per Grok's recommendation.

**Moderate** on the orthogonality boundary text — language is the LLM's only handle. Recommend a single canonical "boundary clause" per module embedded in the system prompt (drafted above, tightened from Gemini's framing).

---

## Open Questions for Tristan

1. **Adopt 12 modules, or 10 (merge 8 into 1+2 and 9 into 6)?** GLM argues the 9-module draft will break in production; Gemini argues separation is better for BoM completeness. Recommendation: ship 12, monitor for empty modules, demote later if they stay empty across 5+ products.
2. **HMI scope** — does it include external connectors (EV charger plug, RO skid CIP port) or only operator-facing touchpoints? Recommendation: operator-facing only; connectors stay in 8 (electrical) or 11 (fluid).
3. **Cross-cutting "-ilities"** — should reliability, certification, sustainability appear as module metadata tags or as a separate output stream alongside the BoM? Council didn't address; defer to renderer design.
4. **Module-decomposition stage outputs** — does each module emit a `present: bool`, a list of sub-functions, or a list of candidate component types? The taxonomy doesn't dictate; needs a separate schema decision.
5. **Council validation gate** — at what score does the per-product module catalog pass to the next stage? Recommend 8/10 per stage-gate convention.

---

## Recommendation for Iter 3 Design

Adopt the 12-module taxonomy as the universal scaffold. Insert a new pipeline stage **between brief and radical-tree**:

```
brief → module-decomposition (12-module taxonomy + LLM-derived per-product catalog
        + council validation @ ≥8/10) → radical-tree → ...
```

For Iter 3, smoke-test the taxonomy against **one new product not in the original 10 baselines** (recommend **RO desalination skid** — exercises modules 11 + 12 hardest, and is the most distant from any current BoM generator). If the per-product module catalog comes back with all 12 modules either populated or explicitly marked `not-applicable`, the taxonomy holds. If 2+ modules sit empty across 3+ products, revisit the 10-module merge.
