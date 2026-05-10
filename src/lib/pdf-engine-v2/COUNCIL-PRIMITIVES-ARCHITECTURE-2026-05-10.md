# ForgeOS PDF Engine v2 — Architecture Council: Primitives vs. Per-Class Manifests

**Date:** 2026-05-10  
**Trigger:** Tristan brainstorm — Tesla FSD analogy / primitives knowledge graph proposal  
**Council seats:** Google Gemini 3.1 Pro Preview · xAI Grok 4.3 · Moonshot Kimi K2.6  
**Task type:** Pure architecture thinking — NO code changes, NO implementation  
**Total estimated cost:** ~$0.17 USD

---

## Council Summary

### Q1 — Is the Tesla FSD analogy valid?

**Gemini:** Partially valid. Brittleness of scaling is identical — combinatorial explosion from per-class manifests mirrors the rule-stack problem. Differs materially: Tesla operated on continuous sensor data with tolerant, statistically learnable outputs. ForgeOS operates on symbolic, structured inputs with deterministic, legally-cited outputs. End-to-end neural models are the wrong prescription even if the diagnosis (brittleness) is correct. Verdict: **conditional YES — analogy valid for the trap, not for the cure**.

**Grok:** Partially valid. The duplication and missing cross-class invariants are the real similarity — BESS and EV charger manifests both have thermal rules that diverge through copy-paste. Edge cases at class boundaries (e.g., drone-mounted AUV payload) are genuinely unhandled. Key difference: FSD operated in continuous perceptual space where statistical approximation is acceptable. Feasibility reports must cite concrete standards; a hallucinated refrigerant GWP value is a contractual liability. **Pure learned end-to-end models must NOT replace the authoritative knowledge layer.** Verdict: **conditional YES — for diagnosis, NO for the cure**.

**Kimi:** The most structurally rigorous take. Correctly identifies three mechanisms of similarity: combinatorial rule explosion, coverage gaps at class intersections, and maintenance drag accumulating as tribal knowledge in unrunnable form. Decisive difference: the FSD input stream has no compact symbolic specification; product briefs already are symbolic. The escape from manifest brittleness is **modular symbolic composition, not neural net replacement**. Verdict: **conditional YES — analogy correctly identifies the disease, the cure is a compositional ontology not an end-to-end latent model**.

**Consensus:** The analogy is valid as a warning about scale. Invalid as a prescription for the fix. ForgeOS should not try to "do what Tesla eventually did" (neural learning) — it should factor invariant engineering knowledge into a compositional graph that is explicit and citable. All three seats agreed on this without prompting.

---

### Q2 — Minimum viable primitive set (target 30–50)

All three models converged on a range of **38–46 primitives** for ~90% industrial coverage, with strong agreement on groupings. Synthesised canonical list:

**Energy (6)**
1. `Battery_Pack` — electrochemical storage with BMS, charge/discharge envelope, cycle-life model
2. `Power_Converter_ACDC` — grid-interactive rectification and power factor correction
3. `Power_Converter_DCDC` — galvanic isolation or voltage transformation (buck, boost, flyback, resonant)
4. `Inverter` — DC to AC conversion for grid export or motor drive
5. `Solar_PV_Module` — photovoltaic harvester with degradation curve
6. `Supercapacitor_Module` — high-power-density buffer (Grok addition, Kimi omitted)

**Structural & Mechanical (5)**
7. `Enclosure_Chassis` — environmental barrier and mounting substrate, IP/NEMA rated
8. `Structural_Frame` — load-bearing geometric backbone (truss, rack, spar)
9. `Sealing_Interface` — static pressure boundary (gasket, O-ring, hermetic feedthrough, potting)
10. `Pressure_Vessel` — coded containment (ASME VIII, DOT, PVHO)
11. `Vibration_Isolator` — mechanical decoupling mount (Grok addition)

**Fluid (7)**
12. `Pump` — fluid mover (centrifugal, diaphragm, peristaltic, axial)
13. `Valve` — flow modulation (solenoid, proportional, check, relief, pinch)
14. `Heat_Exchanger` — fluid-to-fluid or fluid-to-air heat transfer (plate, shell-and-tube, micro-channel)
15. `Refrigeration_HVAC` — active pumped-thermal cycle: compressor + evaporator + condenser + working fluid
16. `Filter_Separator` — particulate or membrane separation (depth, HEPA, coalescing, strainer)
17. `Fluid_Reservoir` — working-fluid buffer, expansion tank, header
18. `Manifold_Plumbing` — multi-port fluid distribution block and interconnect tubing

**Thermal & Environmental Control (5)**
19. `Fan_Blower` — air mover for convective rejection or ventilation (axial, centrifugal, EC)
20. `Heater_Element` — active thermal injection (resistive, induction, radiant IR)
21. `Thermal_Interface_Material` — interfacial conductivity enhancement (gap pad, phase-change, graphite, vapour chamber)
22. `TEC_Peltier` — thermoelectric cooler for precision temperature control
23. `Desiccant_Cartridge` — moisture control/adsorption for sealed enclosures

**Electronic & Interconnect (6)**
24. `PCB_Substrate` — component interconnect platform (rigid FR-4, flex polyimide, metal-core, ceramic)
25. `Power_Distribution_Busbar` — high-current copper/aluminium DC or AC backbone
26. `Cable_Harness` — bundled power/signal/fibre with shielding and jacket rating
27. `Connector` — detachable electromechanical interface (circular, rectangular, RF coax, fibre)
28. `Relay_Contactor` — electromechanical or solid-state switching for isolation and protection
29. `Circuit_Protection` — overcurrent/fault interruption (fuse, breaker, GFCI, surge suppressor)

**Computing & Processing (4)**
30. `MCU_Controller` — embedded microprocessor/microcontroller (ARM Cortex-M/R, safety-rated lock-step)
31. `AI_Accelerator` — parallel compute module (GPU, NPU, TPU) for inference workloads
32. `Memory_Storage` — volatile and non-volatile data retention (DRAM, NAND, NVMe)
33. `FPGA_Programmable_Logic` — reconfigurable digital fabric for hardware acceleration or protocol bridging

**Sensing (7)**
34. `Inertial_Sensor` — IMU, accelerometer, gyroscope, inclinometer
35. `Environmental_Sensor` — temperature, humidity, pressure, gas concentration
36. `Optical_Image_Sensor` — CMOS/CCD/InGaAs array with lens mount and spectral response
37. `Electrical_Sensor` — shunt current, Hall effect, voltage divider, insulation monitor
38. `Biosensor_Chemical` — analyte-specific transduction (enzymatic glucose, pH, dissolved O₂, optical assay)
39. `Position_Navigation` — encoder, LVDT, GNSS, LIDAR, hydroacoustic positioning
40. `Acoustic_Sonar_Sensor` — ultrasonic rangefinder, hydrophone, multibeam sonar

**Actuation & Motion (3)**
41. `Rotary_Motor` — continuous torque (BLDC, brushed DC, AC induction, stepper, outrunner)
42. `Linear_Actuator` — translational force (leadscrew, voice coil, hydraulic ram, piezo stack)
43. `Motor_Driver_ESC` — power-electronics bridge converting commands to phase currents (ESC, VFD, servo amplifier)

**Optical (2)**
44. `LED_Illumination` — solid-state photon source (visible, horticultural, UV, IR, status)
45. `Laser_Diode_Optical` — coherent/collimated photon source with lens assembly and photodetector

**Communications (4)**
46. `Cellular_Modem` — wide-area wireless packet data (4G/5G, NB-IoT, LTE-Cat-M)
47. `Short_Range_Radio` — local/meshed radio (BLE, Wi-Fi, Zigbee, LoRa, UWB)
48. `Wired_Network` — cabled digital fieldbus/Ethernet (RJ45, CAN, RS-485, EtherCAT)
49. `Satellite_Terminal` — beyond-line-of-sight link (L-band Iridium, K-band VSAT, optical satcom)

**Software & Control (3)**
50. `Firmware_RTOS` — time-critical low-level software (scheduler, BSP, HAL, watchdog)
51. `Control_Loop_Software` — closed-loop/sequenced behavioural logic (PID, MPC, state machine, mission planner)
52. `Security_Trust_Module` — cryptographic root-of-trust (TPM, HSM, secure boot, TEE)

**Safety & Hazard (2)**
53. `Fire_Suppression` — active hazard mitigation (aerosol generator, FM-200, water mist, Novec 1230)
54. `Safety_Interlock` — fail-safe electrical/mechanical break with certified SIL/PL rating

**Total: 54 primitives.** All three models converged near this number (38–46 core, with Kimi adding several that Grok and Gemini implicitly covered under broader entries). The set is deliberately slightly over 50 to avoid artificial compression — pruning to ~42 for v1 is achievable by collapsing close synonyms.

---

### Q3 — Knowledge each primitive entry needs

All three models agreed on a core schema. **HVAC worked example (synthesised from all three):**

- **Capacity ranges:** Cooling 1–5,000 kW; COP 2.5–5.0+; SEER/IPLV ratings; turndown 10–30%
- **Refrigerant types + regulatory constraints:**
  - R-410A (GWP 2088): EU F-gas phasedown, no virgin use in new splits post-2027–2030 in most jurisdictions
  - R-32 (GWP 675): A2L mildly flammable, charge limits per IEC 60335-2-40 based on room volume
  - R-454B / Opteon XL41 (GWP 466): A2L, R-410A drop-in replacement, same charge-limit maths
  - R-290 propane (GWP 3): A3 highly flammable, severe charge limits (152 g per IEC 60335-2-89), cannot use in ducted splits above threshold volumes without machinery-room isolation
  - R-1234yf / R-1234ze (GWP <1): Long-term transition path; thermodynamic properties require compressor redesign
  - CO₂ R-744 (GWP 1): Transcritical above 31 °C; 100+ bar working pressure, EN 378 compliance
  - Regulatory cross-cuts: EPA SNAP approvals, Kigali Amendment HFC phasedown, EN 378, ASHRAE 15, ISO 817, UL 60335-2-40
- **Common manufacturers:** Carrier, Daikin, Trane, Johnson Controls/York, Mitsubishi Electric, Gree, Midea, Bosch Climate Solutions; Danfoss, Embraco/NEK (components)
- **Typical lead times:** Residential 2–6 weeks; commercial rooftop/AHU 8–16 weeks; custom chiller 16–30 weeks; compressor sub-assemblies 8–12 weeks; note A2L bottleneck (2024–2027) on R-32/R-454B compressors
- **Common failure modes:** Scroll-wear after 35 kh; TXV sticking below 0 °C; formicary corrosion pinholes in evaporator coil; condenser fan bearing wear from VFD-induced bearing currents; control board humidity/corrosion; heat-exchanger fouling (biofilm, dust, scale); low-charge compressor overheating
- **Key design rules:** Evaporator ΔT 10–20 °F under design load; condensing approach 10–30 °F; superheat 8–12 °F at suction; subcooling 5–10 °F at condenser outlet; airflow 350–450 CFM/ton; suction line max velocity 3,000 FPM; crankcase heater mandatory below 5 °C ambient; A2L charge-limit calculation mandatory before specifying split-system type; oil-return traps on vertical suction risers >3 m

**Generalised primitive schema (Kimi's was the most complete — endorsed by Grok and Gemini):**

| Field | Type | What it captures |
|---|---|---|
| `primitive_id` | UUID/String | Canonical machine identifier |
| `primitive_name` | String | Human-readable label |
| `version_tag` | String | Semantic version of knowledge entry |
| `taxonomy_path` | List<String> | Hierarchical classification |
| `function_signature` | Enum | Dominant physical transformation (store_energy, convert_energy, transmit_signal, support_load, regulate_flow, process_information, emit_photons, sense_physical_quantity) |
| `physics_model_parameters` | Dict | Governing coefficients (thermal resistance K/W, torque constant Nm/A, flow coefficient Cv/Kv, efficiency maps) |
| `interface_specifications` | List<Interface> | Standardised ports: mechanical, electrical, fluidic, thermal, data |
| `performance_envelope` | Dict | Absolute operating limits: temp, humidity, altitude, vibration, IP rating, EMC class |
| `capacity_ranges` | List<QuantifiedRange> | Throughput metrics with units |
| `regulatory_constraints` | List<RegulationEntry> | IEC, ISO, ASME, UL, CE, FCC; chemical (RoHS, REACH); environmental (F-gas, Kigali); safety integrity (SIL, PL, ATEX) |
| `vendor_landscape` | List<VendorProfile> | Manufacturer entries: name, part families, geographic origin, MOQ, qualification grades, single-source risk flag |
| `supply_chain_parameters` | Struct | Lead times, shelf life, HTS codes, alternate-source availability, obsolescence risk, geographic concentration risk |
| `cost_model` | Struct | NRE estimate, unit cost at volumes {1, 100, 10k}, tooling amortisation, certification cost per unit |
| `failure_modes` | List<FailureMode> | FMEA-aligned: failure mode, mechanism, root cause, detection, severity/occurrence/detectability, Weibull shape+scale |
| `design_rules` | List<DesignRule> | Prescriptive constraints: clearances, derating curves, safety factors, material compatibility, orientation limits |
| `verification_test_suite` | List<TestMethod> | HALT/HASS, ESS, burn-in, pressure testing, EMC, ingress, thermal cycling |
| `compatibility_matrix` | List<CompatibilityNote> | Galvanic series conflicts, refrigerant-oil miscibility, chemical incompatibility |
| `dependency_graph_rules` | List<CausalLink> | Cause-consequence relations (e.g., Battery_Pack.thermal_runaway → Fire_Suppression requirement) |
| `maintenance_calendar` | Dict | Service intervals, consumable replacement schedule, calibration drift |
| `end_of_life_directive` | Struct | Disassembly sequence, recyclable streams, hazardous waste classification (UN38.3, refrigerant recovery) |
| `semantic_tags` | List<String> | Ontological search markers: high_voltage, hermetic, safety_critical, long_lead, ATEX_zone2 |
| `provenance_log` | List<SourceEntry> | Origin of each fact: SME attribution, datasheet URL, standard clause citation, LLM-extraction confidence + human-validation flag |

---

### Q4 — Decomposition approach (product brief → list of primitives)

**Gemini:** Hybrid. LLM does initial semantic mapping from brief → candidate primitive IDs. Deterministic graph validator resolves dependencies (if BLDC Motor, flag missing Motor Driver and High-Current Power Supply). Best signals: primary power source, operating environment, form factor, core function, regulatory target. Failure modes: hallucination, missing implicit dependents, granularity mismatch (decomposing to capacitor level instead of PCB level).

**Grok:** Hybrid. LLM structured extraction first, then deterministic lookup and disambiguation rules. Effective signals: exact matches against a 200+ term controlled vocabulary, numeric ranges mapping to capacity fields, constraint phrases ("IP67", "-40 °C", "UL9540A"), dependency keywords ("refrigerant loop", "high-voltage bus"). Best prompt pattern: force JSON output using only the canonical primitive vocabulary; flag any term that has no match.

**Kimi:** Most architecturally detailed. Three-stage pipeline:
1. **Stage A — Deterministic requirement extraction:** Regex/NLP NER for invariant physical signals (voltage levels, mass budgets, IP ratings, flow rates). Produces a constraint envelope that grounds the LLM.
2. **Stage B — LLM constrained decoding:** Force output into JSON schema via CFG/FSA constraint layer (outlines/lmql/logit-processor in vLLM). Grammar masks illegal tokens — LLM cannot hallucinate a primitive not in the registry. Beam of k=4 partial graphs maintained for global constraint checking (energy balance, mass-flow continuity).
3. **Stage C — Graph instantiation + SHACL validation:** Property graph in Neo4j or Rust petgraph. Interface type matching, physics closure (Kirchhoff-like energy balance), dimensional chain and safety checks (creepage distances per IEC/UL).

**Consensus:** All three agree — **hybrid is the only viable answer**. Pure LLM: inconsistent granularity, hallucination risk, non-deterministic BOM. Pure deterministic: fails on novel phrasing. The split is: LLM for semantic intent → deterministic rules for constraint enforcement and dependency resolution. Kimi's three-stage pipeline is the most production-ready framing.

---

### Q5 — The 80/20

**v1 — handles 90% of the 10 baseline classes (day one)**

Grok: 18 primitives. Kimi: 13 meta-primitives (higher abstraction level). Gemini: ~20 primitives. Reconciled v1 set (18 concrete primitives):

1. `Battery_Pack` (+ BMS)
2. `Power_Converter_ACDC`
3. `Power_Converter_DCDC`
4. `Enclosure_Chassis`
5. `Structural_Frame`
6. `PCB_Substrate`
7. `MCU_Controller`
8. `AI_Accelerator`
9. `Rotary_Motor`
10. `Motor_Driver_ESC`
11. `Linear_Actuator`
12. `Heat_Exchanger`
13. `Refrigeration_HVAC`
14. `Fan_Blower`
15. `Pump`
16. `Valve`
17. `Environmental_Sensor` (temperature/pressure/humidity)
18. `Cellular_Modem`

**v2 additions (months 4–9):** Safety_Interlock, Chemical_Separation_Membrane, Phase_Change_Working_Fluid, Propulsion_Aerofoil, Pressure_Hull_Rated, IMU/Inertial_Sensor, Connector (high-current), Laser_Diode_Optical, LoRa/Short_Range_Radio, TEC_Peltier, Cable_Harness, Biosensor_Chemical

**v3 additions (months 10–18):** Cyber_Physical_Feedback_Loop (control loop as first-class primitive), Thermal_Runaway_Cascade (BESS hazard propagation primitive), Biological_Agent (living organism as system co-tenant), Atmospheric_Buoyancy_Engine (HAPS station-keeping), fuel cell stack, supercapacitor module, FPGA, desiccant, positive-displacement pump, satellite terminal

---

### Q6 — Third paths beyond manifests AND primitives

**Gemini's three alternatives:**
1. **Corpus-driven RAG** — vector DB of historical engineering documents and past reports. High fluency, poor physical constraint enforcement. Non-deterministic BOM.
2. **Hierarchical compositional ontology** — subsystems at top level that recursively expand into primitives. Bridges top-down manifests and bottom-up primitives. (This is closer to v3 of the primitives approach than a true third path.)
3. **Multi-agent simulation** — domain-specific LLM agents (Mechanical, Electrical, Thermal) negotiate the brief in a loop until convergence. Interesting but extremely complex to stabilise.

**Grok's third path:** RAG over all previously produced feasibility reports plus attached vendor datasheets and standards PDFs, augmented by hierarchical agglomerative clustering on embeddings with periodic human review of new leaf nodes. Preserves interaction knowledge (how BESS and vertical-farm primitives interacted in a specific prior project) that a pure primitives graph loses. No explicit primitive list maintained — taxonomy self-organises.

**Kimi's four alternatives (most rigorous):**
1. **Learned embeddings / metric-learning decomposition** — fine-tune an embedding model on historical engineering paragraphs with contrastive loss; new chunks are assigned primitive labels by nearest-neighbour retrieval. Zero hand-authored ontology. Fatal flaw: orphan-vector problem for truly novel architectures with no corpus neighbours.
2. **RAG from prior engineering corpus** — exemplar paragraphs in context window, LLM performs analogical induction. Handles surface variability well. Coupling is implicit in retrieved text, not explicit in graph — non-deterministic BOM.
3. **Self-organising taxonomy via Hierarchical Dirichlet Process or Formal Concept Analysis** — bottom-up ontology induction from unlabelled corpus. Polysemy is lethal ("cell" in BESS vs. bioreactor vs. CGM). Resulting lattice is too dense or too shallow. Requires expert pruning that recreates the primitives graph post-hoc.
4. **Hierarchical compositional knowledge via neuro-symbolic program induction** — product is an AST in a domain-specific language; a neural synthesiser maps document embeddings to programs that are then compiled into a physics co-simulator. Deep physics integration but prohibitive up-front cost, combinatorial search space, requires writing a full DSL grammar and simulator backend.

**Council's best "third path":** Kimi's assessment is that the primitives graph is the optimal industrial midpoint: interpretability and deterministic validation lacking in embedding/RAG, without the prohibitive cost of program synthesis. However, **combining primitives with RAG is the strongest practical hybrid** — use the primitives graph as the knowledge backbone and validated constraint layer, while RAG fills the prose sections of reports by retrieving analogous passages from prior reports and datasheets. This is neither pure manifests nor pure primitives — it is a knowledge-graph-anchored RAG.

---

### Q7 — Failure modes of the primitives approach

All three models were specific. Synthesised failure taxonomy:

| Product Class | Failure Mechanism | Why Primitives Break |
|---|---|---|
| **BESS** | Thermal runaway as non-modular cascade | Thermal runaway creates ad-hoc coupling paths outside designed ports (venting gas, arc-faults, ejected particles). The hazard is an emergent property of the array graph, not a primitive. v1 treats each cell as isolated node — statically correct, systemically wrong. |
| **Drone** | Aeromechanical emergence | Rotor inflow, blade-vortex interaction, and airframe wake coupling are unsteady fluid-structure interactions. Motor torque is a function of inflow velocity, which is a function of airframe attitude. Primitives model static topology; flight dynamics are dynamically incoherent at primitives level. |
| **CGM wearable** | Biosignal transduction chemistry | Glucose oxidase kinetics, mediator diffusion, interstitial fluid perfusion, and foreign-body response are not slot values — they are a coupled biochemical system that modifies the sensor surface over time. Primitive decomposition loses the living interface. |
| **Heat pump** | Refrigerant cycle integrity | Splitting into Pump + Motor + Heat_Exchanger fractures the sealed refrigerant loop. Enthalpy and mass balances fail closure because the Rankine/vapour-compression cycle is the atomic unit of thermodynamic coherence, not the compressor. (Kimi's sharpest point — Grok also named this.) |
| **AUV** | Neutrally buoyant coupled dynamics | Moving ballast changes centre of gravity, altering hydrodynamic stability, which changes drag and energy budget. Trim is a vehicle-level meta-property, not a linear actuator's local function. |
| **HAPS** | Diurnal spatiotemporal station-keeping | 24-hour energy balance couples battery, motor, structure, and envelope buoyancy across a geographic-temporal epoch. Primitives are spatial/structural; HAPS operation is kinematic-geospatial. Graph lacks a "mission epoch" dimension. |
| **EV charger** | Protocol state machine spanning blocks | ISO 15118 control pilot PWM and HPGP powerline communication define a state machine spanning Power_Converter, Controller, and Comms simultaneously. PLC is simultaneously power and data — no powerline-communication dual-medium port type exists in the ontology. |
| **Bioreactor** | Biological agency | Living cells exhibit autopoiesis, mutation, and biofilm fouling that clog designed fluid paths. The biological agent is not a component but an active co-tenant that redesigns system boundaries. Primitives model designed artefacts, not evolving populations. |
| **Novel wide-bandgap** (Grok raised) | No primitive for GaN half-bridge | PCB_Power primitive cannot express 800 V GaN thermal and EMC design rules. Nearest primitive is too generic to produce valid engineering content. |

**General pattern (Grok's formulation, endorsed by all three):** Any product whose value derives from emergent interface physics — or from a single material system that spans multiple primitives — will produce reports that are locally correct but system-incorrect.

---

### Q8 — Time/cost estimate for v1 primitives system

**Gemini:** 8–11 weeks, 4 FTE. Primitives ongoing maintenance ~3–4 engineering weeks/year. Per-class manifest expansion ~16–20 weeks/year at 10+ classes. **Maintenance ratio ~5:1 in favour of primitives.**

**Grok:** 9–11 weeks. Primitives ongoing ~4–6 engineering hours/month. Per-class manifests ~12–18 hours/month once 10th class is live. Crossover point: month 5. **Primitives approach shows ~55% lower cumulative maintenance hours over 12 months.**

**Kimi:** 16–18 weeks for a fully production-grade system (2 senior platform engineers + 1 knowledge/ontology engineer + 1 ML/LLM pipeline engineer). Conservative maintenance comparison: primitives 8–10 weeks/year engineering vs. per-class manifests 24–30 weeks/year. **Ratio ~3:1 (conservative), widening to ~5:1 as class catalogue grows.** Kimi's estimate is higher because it includes constrained decoding pipeline (CFG/FSA layer), physics-closure validator, and full Neo4j schema — a production-grade system rather than a prototype.

**Consensus range:**
- Prototype/MVP primitives: **8–11 weeks** (Gemini/Grok estimate — handles the 10 baseline classes with validation)
- Production-grade with full physics validation: **16–18 weeks** (Kimi — includes constrained decoding, graph DB, SHACL validation layer)
- 12-month maintenance savings vs. continuing per-class: **55–70% reduction in engineering hours**, crossover at month 4–5

---

## Surprising Suggestions

1. **Kimi — Phase_Change_Working_Fluid as a mandatory v2 primitive (not v1):** The heat pump failure mode is that splitting refrigeration into generic Pump + Heat_Exchanger loses thermodynamic cycle closure. Kimi argues this warrants its own first-class primitive with T-s diagram closure as a slot — not a subtype of HVAC. This is non-obvious and architecturally significant for ForgeOS given heat pump and BESS thermal management are two of the 10 baseline classes.

2. **Kimi — Biological_Agent as a system primitive (not just a product class):** A living organism (bioreactor culture, vertical-farm crop) is not a subsystem to be modelled like a passive component. It is an active co-tenant that modifies boundaries. Making it a first-class primitive with mutation, fouling, and growth-rate slots is the only way the bioreactor and vertical farm classes will ever score above 7/10.

3. **Grok — The RAG+primitives hybrid preserves interaction knowledge:** Grok pointed out that a pure primitives graph loses knowledge about how specific combinations of primitives behaved in prior ForgeOS projects. The fix is not to abandon primitives but to augment with a RAG layer over past reports. This is the "third path" that neither Tristan's original framing nor the pure primitives proposal covers.

4. **Kimi — Decomposer failure taxonomy (7 named modes):** Over-decomposition (abstraction leakage), under-decomposition (monolithic residue), phantom primitive binding, cyclomatic interface mismatch, temporal scale asynchrony, dimensional inconsistency, phantom material closure. These are concrete, testable failure categories the v1 decomposer validation harness should be checking.

5. **All three — The cure is NOT "do what Tesla eventually did":** None of the three models supported end-to-end neural replacement of the knowledge layer. All three explicitly stated that engineering reports require citable, deterministic facts — and that an LLM cannot "learn" that R-410A has a GWP of 2088 or that a specific clause of EN 378 applies. This is a direct, unambiguous council-level rejection of the most literal reading of the Tesla analogy.

---

## Final Consensus: Primitives vs. Per-Class for ForgeOS

**Verdict: PRIMITIVES YES — start a parallel spike within 2–4 weeks, not immediately as a full pivot.**

Reasoning from council:
- The per-class manifest approach has the same brittleness trajectory as Tesla's rule stack. This is not theoretical — it is already visible at BESS 6.9/10 and vertical farm 5.9/10, where scores plateau not because the generation prompt is wrong but because knowledge about cross-domain primitives (thermal runaway, biological agency, refrigerant cycle closure) is missing from class-specific manifests.
- The primitives approach is the architecturally correct direction. All three seats agreed without reservation.
- However, an immediate full pivot would be high-risk: the primitives graph for all 10 classes is an 8–18 week investment, and the existing per-class manifests still have quality headroom (better prompts, better scoring, F-gas data, etc.) that can be extracted faster.
- The recommended path is a **parallel track**: continue improving the current manifests for near-term quality gains while building the v1 primitives schema and knowledge population for the most-shared primitives (battery pack, enclosure, thermal management, PCB, MCU) as a background spike. The two tracks merge when the primitives system has ≥18 primitives populated and validated — at that point, the per-class manifests can be deprecated one class at a time.

---

## Recommended Sequencing

| Week | Action |
|---|---|
| Now–2 | Continue current RL loop on per-class manifests. In parallel: define primitive schema (Q3 generalised schema above) and enumerate v1 primitive set (18 from Q5). |
| 2–4 | Populate the 8 most-shared primitives with full knowledge content (battery pack, enclosure, PCB, MCU, heat exchanger, pump, motor, environmental sensor). These appear in 7–10 of the 10 baseline classes. |
| 4–8 | Build hybrid decomposer: LLM structured extraction → deterministic dependency resolution. Validate against all 10 baseline product briefs. |
| 8–12 | Full 18-primitive v1 knowledge population. Integration with report generation pipeline. Run A/B on BESS and vertical farm (the two lowest-scoring classes) to confirm quality uplift. |
| 12+ | v2 additions (Q5 list). Begin deprecating weakest per-class manifests in favour of primitive-assembled reports. |

**Trigger condition for full pivot:** When primitives-assembled BESS report scores ≥8.0/10 on council and vertical farm scores ≥7.5/10 — at that point the primitives approach has demonstrated it outperforms the per-class approach on the hardest cases, and full migration is justified.

---

## Quote-worthy Insight

> "The analogy correctly diagnoses the disease — brittle, combinatorial explicit-rule systems. But the cure for ForgeOS is not 'neural nets replacing code.' It is a compositional ontology that factors invariant physical and commercial knowledge out of product-specific manifests. The governing laws of thermodynamics, the Kigali Amendment HFC phasedown schedule, and a compressor's rated capacity at 35 °C ambient are discrete, authoritative facts. An end-to-end neural network cannot 'learn' them — it would hallucinate the values or smooth over regulatory discontinuities."
> — Kimi K2.6 (Moonshot), Q1 answer

---

*Council raw responses archived in session context. Cost: ~$0.17 USD total (Gemini $0.026, Grok $0.009, Kimi $0.131). Saturation check: Grok and Gemini second-pass complete. Kimi Q4–Q8 called separately after 16k truncation — full coverage confirmed.*
