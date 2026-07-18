# Yuri — Device & Hardware Manufacturing Handover

*Purpose: a grounding + ideation brief for a Claude Code session. It captures everything Yuri could plausibly **manufacture** — now and in the future — drawn from our full document set (master investor deck v4–v36, Strategic Update v1–v6, the Organoids/Bioprinting briefing, the Pre-Meeting Red-Team briefing, the RPM subscription model, the HSG report, the Delphi material) and the meeting notes with Maria/Christian/Daniel and the TTP/Simon Lesbirel conversation.*

*Use it as the input layer for design work: each device below is written to be turned into a brief → spec → bill of materials → concept. It is deliberately expansive — some ideas are core, some are frontier. Prioritisation guidance is at the end.*

*Prepared by Tristan Fischer · Strategic Advisor, Yuri · July 2026 · confidential working note.*

---

## 1. Who Yuri is (context for the design work)

Yuri (yuri GmbH, Meckenbeuren, Germany; Luxembourg holdco; new US office) is the **"picks-and-shovels" layer under space biotech** — it builds the small automated bioreactors, incubators and experiment cassettes that let a scientist run a living-cell experiment in orbit without being a space engineer. Flight heritage: **192 payloads for ~65 customers across ~25 ISS missions since 2019.**

The strategic direction we've developed together (the **"ladder"**):

1. **Ground** — sell/subscribe microgravity-simulation hardware (RPMs) on Earth: recurring revenue *now*, no launch needed. This is the launchpad.
2. **Data** — instrument everything; the run data becomes a recurring, defensible product (a µ-gravity biology dataset for AI-drug companies).
3. **Return** — grow biology in orbit and bring it back alive (the hard, differentiated bit).
4. **Organs** — long-horizon: seed tissue/organoids in microgravity, mature them, ultimately toward transplant-grade tissue.

**Core commercial pull (the "why now"):** the FDA is actively moving to replace animal testing with organoids / organ-on-chip (NAMs). That turns "better organoids" from a science paper into something pharma R&D will pay for. Yuri's edge is producing *superior, more predictive* organoids/tissues, using microgravity (real or simulated) as a **quality differentiator** in a market that already exists on the ground.

**The honest scientific caveat (keep it in every design rationale):** microgravity is only demonstrated to help a *narrow, cell-type-dependent subset* of tissues, and ground simulators (RPM, rotating-wall vessels) reproduce much of the effect cheaply. So the most defensible hardware is hardware that (a) earns money on the ground today, and (b) generates the paired-control evidence that settles where orbit is genuinely necessary.

---

## 2. Design principles (constraints every device must respect)

These are Tristan's hard rules from the strategy work — treat them as design constraints:

1. **Small and modular, never big and bespoke.** Big bespoke systems are always late and over budget, can't be iterated, and never get down the cost curve. Everything should be a small, repeatable unit you can make hundreds/thousands of.
2. **Fit-anywhere / vehicle-agnostic.** It should be small enough to ride *any* launcher up and *any* capsule (or even hand-luggage / a separate package) down. No dependency on one station or one bay. Standard mechanical/data/power interfaces.
3. **Razor-and-blade.** The durable machine (RPM, incubator, rack) is the razor; the **cassette / cartridge / consumable** is the blade — the recurring-revenue engine. Design the consumable interface first.
4. **Contract-manufacture, never build the factory.** At this stage: design-for-manufacture, outsource production to a qualified CM partner, drive the bill-of-materials cost down through supply chain, not capex. (Open workstream: Yuri has no qualified CM partner yet.)
5. **Scientific rigour is a feature.** Paired 1g controls, standardised readouts and traceability aren't overhead — they're what makes the data sellable and the organoid claim credible.
6. **Automate the manual.** A recurring theme from the customer-research workstream: understand how the existing ~100 RPM customers work by hand, then sell them the automated version. Manual protocol → automated appliance is a product line in itself.
7. **Physiological stressor, not magic.** Frame microgravity (and other in-cassette stressors) as a controllable *physiological stressor* that accelerates or reveals biology — not as "space makes magic tissue."

---

## 3. What Yuri already makes / has named (the baseline)

| Existing / named | What it is | Ladder stage |
|---|---|---|
| **RPM (Random Positioning Machine)** | Ground-based microgravity simulator; ~100 in the field / installed base | Ground |
| **ScienceTaxi / BioSpin** | Automated flight life-sciences incubator, hosts up to ~38 experiments/launch (temp control, automation, real-time data) | Access / Return |
| **Modular flight bioreactors** | Compact, transport-friendly cell-culture units designed to fly | Access / Return |
| **Experiment cassettes / cartridges** | The per-experiment consumable that holds sample + media + fluidics | Consumable (all stages) |
| **EVA service** | End-to-end launch → research → in-orbit dev → manufacture → return (with RFA launch + ATMOS re-entry) | Return (service, not a device) |
| **Vehicle-agnostic rack (in progress)** | Standard experiment rack that fits multiple stations/capsules | Access / Return |

Everything in Section 4 either extends these or opens an adjacent line.

---

## 4. The device catalogue (the brainstorm)

Each entry: **what it is · why Yuri · ladder stage · target customer · key subsystems · consumable · design notes.** Ordered roughly from nearest-term/most-defensible to frontier.

### Family A — Ground microgravity-simulation hardware (the launchpad — recurring revenue *now*)

**A1. Next-gen RPM (benchtop random positioning machine).**
- *Why Yuri:* their installed base and brand; the ground product that needs no launch.
- *Stage:* Ground. *Customer:* pharma/academic cell-biology labs, CROs, the existing ~100.
- *Subsystems:* dual-axis gimbal + motors/encoders, controller, vibration isolation, incubator-compatible frame, live-imaging port, telemetry.
- *Consumable:* sealed sample cassette (see C1). *Notes:* the razor. Make it quieter, smaller, cheaper, sensor-instrumented; the differentiation is the cassette + data, not the gimbal.

**A2. RPM-as-appliance ("microgravity incubator in a box").**
- Sealed, plug-and-play desktop unit: RPM motion + CO₂/temp incubation + perfusion + imaging in one enclosure, driven entirely by drop-in cassettes.
- *Stage:* Ground. *Customer:* labs that want organoid results without building a rig. *Consumable:* pre-loaded organoid cassette. *Notes:* the flagship ground product and the clearest subscription/razor-blade play — this is the unit the RPM subscription model is built around.

**A3. 3D clinostat (entry-level simulator).**
- Simpler, cheaper single-sample simulator as the low-end funnel product into the RPM/appliance line. *Stage:* Ground. *Notes:* good "land" product for land-and-expand.

**A4. Rotating-wall vessel (RWV) / HARV bioreactor.**
- Suspension-culture vessel for scaffold-free spheroid/organoid growth; the ground method that in some tissues *outperforms* orbit. *Why Yuri:* completes the ground simulator range; honest hedge against "do you even need space?". *Consumable:* vessel + media pack.

**A5. Magnetic-levitation / diamagnetic bioassembler (ground).**
- Field-based tissue assembly / levitational culture as a ground analogue to microgravity. *Stage:* Ground → Organs. *Notes:* frontier-ish but a credible IP-rich adjacency to bioprinting.

### Family B — Flight bioreactors, incubators & racks (access hardware)

**B1. ScienceTaxi / BioSpin successor (automated multi-experiment flight incubator).**
- Next-gen automated incubator: more experiments per launch, better thermal control, onboard imaging, autonomous media handling, crew-free. *Stage:* Access/Return. *Customer:* the 65+ flight customers, agencies (ESA, DLR, SPRIND).

**B2. Single-experiment modular flight bioreactor.**
- The smallest self-contained flyable culture unit; the "fit-anywhere" atom. *Notes:* design to hand-luggage envelope; standard power/data/mech interface.

**B3. Perfusion bioreactor cassette (in-flight media exchange).**
- Keeps tissue alive on longer missions via automated media/waste exchange. *Consumable:* media + waste cartridge. *Notes:* enabler for the "grow bigger tissue in orbit" thesis.

**B4. Vehicle-agnostic experiment rack (productised).**
- Standard rack with a universal interface that drops into any station bay or free-flyer/capsule. *Why Yuri:* kills Haven-bay dependency; a sellable platform product, not a bespoke build. *Stage:* Access/Return.

**B5. Autonomous free-flyer bio-payload.**
- A small self-contained free-flyer that hosts biology without a crewed station (post-ISS resilience; Varda-style but biology-first). *Stage:* Return. *Notes:* frontier; only if return economics close.

### Family C — Consumables & cassettes (the blades — recurring revenue core)

**C1. Universal experiment cassette / cartridge.**
- The disposable at the centre of everything: holds sample, media, fluidics, sensors; common interface across RPM, appliance, flight incubator, rack. *Notes:* **design this interface first** — it defines the razor-blade economics. Cost-down via contract manufacturing is the single biggest margin lever (see the cassette margin work in the RPM model).

**C2. Microfluidic assay card (lab-on-chip).**
- In-situ assays (viability, secretion, tox readouts) on-cassette so results are generated in place, not just on return. *Stage:* Data. *Notes:* bridges hardware into the data product; PCB + microfluidics + optics — a genuine design-engine candidate.

**C3. Pre-loaded media / reagent packs.**
- Mission-ready, standardised media/bioink/reagent modules that snap into cassettes. *Notes:* pure consumable revenue; also standardises results (good for the data set).

**C4. Fixation / preservation cassette.**
- Auto-fixes or cryo-stabilises samples at mission end (e.g. RNAlater/fixative release, cooling) so returned biology is analysable. *Stage:* Return. *Notes:* protects the value of every returned experiment.

**C5. Multi-well organoid plate for microgravity/RPM.**
- Standardised, high-throughput organoid array formatted for RPM/appliance/flight. *Notes:* the format that makes "hundreds of thousands of cassettes" tractable.

### Family D — Organoid production systems (climbing to the product)

**D1. Scaffold-free organoid formation reactor (ground + flight).**
- Produces uniform, spherical, scaffold-free organoids exploiting reduced sedimentation. *Customer:* pharma R&D, CROs, organoid biobanks. *Stage:* Ground/Return → product.

**D2. Tumour-organoid drug-response cassette (precision oncology).**
- Patient-derived tumour organoid + automated multi-dose drug-response readout. *Why now:* precision-oncology + NAM tailwind. *Stage:* Data/product. *Notes:* strong standalone product; pairs with C2 assay card and Family G readout.

**D3. "Seed-in-orbit, grow-out-on-Earth" cassette (the breeder model).**
- Start a small self-supporting cell clump in microgravity, de-orbit it, finish the grow-out in an Earth "fattening" bioreactor (Family K). *Why:* captures the high-margin "breeder/genetics" position (à la salmon/poultry/cattle genetics) rather than the low-margin "grow-out farm." *Stage:* Return → Organs. *Notes:* the signature long-term thesis; design the cassette + the ground grow-out chamber as a matched pair.

**D4. Standardised organoid "master cell/seed" cassette.**
- Consistent starter cultures as a productised consumable — being the breeder, not the farm.

### Family E — Bioprinting & tissue-assembly hardware

**E1. Microgravity 3D bioprinter.**
- Prints soft tissue that would slump under 1g; scaffold-free complex geometries. *Stage:* Organs. *Consumable:* bioink cartridge (C3). *Notes:* frontier; keep timelines separate from drug-testing organoids.

**E2. Acoustic / magnetic bioassembler.**
- Field-directed cell assembly (no nozzle) for spheroid/tissue construction. *Notes:* IP-rich adjacency; ground-usable (links to A5).

### Family F — Return, re-entry & preservation devices

**F1. Sample-return cassette (capsule-compatible).**
- Standard cassette that mates with ATMOS/Varda-class re-entry capsules; keeps biology viable through re-entry g-loads and thermal load. *Stage:* Return. *Notes:* the physical enabler of the whole EVA service.

**F2. Cold-chain / cryo-preservation return module.**
- Active cooling / controlled freezing during descent and recovery. *Notes:* mission-critical for cell viability; a discrete, manufacturable module.

**F3. G-load / shock-protected living-sample holder.**
- Mechanical isolation + short-duration life support for the sample through re-entry. *Notes:* pumps/valves/dampers — squarely a design-engine problem.

### Family G — Analytical & in-situ instrumentation (the DATA rung — highest strategic value)

**G1. In-situ live-cell imaging module.**
- Compact microscopy per cassette/incubator streaming images to the ground. *Stage:* Data. *Notes:* feeds the data moat directly; optics + illumination + edge compute.

**G2. Multi-parameter sensor pod (per cassette).**
- O₂, CO₂, pH, temperature, optical density, maybe impedance — continuous environmental + growth telemetry. *Notes:* small PCB + sensors; turns every run into structured data.

**G3. In-orbit assay reader (fluorescence / luminescence).**
- Reads viability/secretion/reporter assays in place. *Stage:* Data.

**G4. Sample-to-insight sequencing / analysis instrument.**
- Miniaturised sample-to-answer genomics/omics box (Oxford-Nanopore-class), inspired by the TTP/Simon brain-tumour system (biopsy → classification in ~2 h). Applied to organoids/tissue in-orbit or in-lab. *Stage:* Data. *Notes:* ambitious, high-value, and aligned with the kind of hire (Simon) who could lead it; strong razor-blade (flow-cell consumables).

**G5. Automated liquid-handling / pipetting micro-robot (on-cassette or in-incubator).**
- Removes the manual pipetting step — the exact "automate the manual" opportunity from the customer research. *Stage:* Ground/Access.

**G6. Edge-compute / telemetry module.**
- Onboard analytics + secure downlink; the hardware root of the software/data moat. *Notes:* pairs with the analytics platform (software, not covered here).

### Family H — Protein crystallisation & formulation

**H1. Protein-crystal growth cassette.**
- Grows larger, more uniform, lower-defect protein crystals for drug formulation/structural work (the classic Merck/MIRP example). *Stage:* Return/product. *Customer:* pharma formulation & structural biology. *Notes:* a well-proven microgravity use case; a clean, self-contained consumable-driven product distinct from organoids.

**H2. Controlled-nucleation crystallisation module.**
- Temperature/vapour-diffusion-controlled crystallisation with in-situ monitoring.

### Family I — Scientific-rigour / control devices

**I1. In-orbit 1g reference centrifuge.**
- Spins a paired 1g control sample alongside the microgravity sample *in the same environment* — the internal control that makes results credible and the data sellable. *Stage:* cross-cutting. *Notes:* one of the highest-leverage devices for credibility; a discrete, manufacturable mechanism.

**I2. Variable-/partial-gravity centrifuge.**
- Selectable partial gravity (Moon 0.16g, Mars 0.38g, and intermediate) for dose-response-in-gravity studies. *Notes:* research-grade differentiator; also a hedge — lets customers *tune* the gravitational stressor.

### Family J — Automation & lab-workflow appliances (adjacent revenue)

**J1. Automated RPM sample loader / media-exchange station.**
- Bolts onto the installed RPM base to remove manual handling. *Stage:* Ground. *Notes:* upsell to the existing 100; pure "automate the manual."

**J2. Smart/tracked cassette (RFID/QR + onboard datalogger).**
- Every consumable self-identifies and logs its own sensor history; feeds LIMS and the data product. *Notes:* cheap, high-leverage, ties hardware to software.

**J3. Cold-storage / incubation logistics units.**
- Transport incubators / shippers that keep organoids alive between Yuri and customer. *Notes:* mundane but real recurring hardware.

### Family K — Frontier / long-horizon (the "organs" rung)

**K1. Earth-side "fattening" / maturation bioreactor.**
- Grows out the space-seeded tissue on the ground (pairs with D3). *Notes:* where the breeder→grow-out model is completed.

**K2. Perfusion / vascularisation maturation chamber.**
- Matures printed/assembled tissue with perfusion to solve the vascularisation/scaffolding problem. *Stage:* Organs.

**K3. Implant-grade tissue-patch production unit.**
- Cartilage/skin/tissue patches toward clinical use. *Notes:* long horizon, heavy regulation; keep separate from the drug-testing narrative.

---

## 5. Mapping devices to the ladder & to priority

| Ladder stage | Anchor devices | Time-to-revenue | Notes |
|---|---|---|---|
| **Ground (now)** | A1–A4, B (as flight), C1–C5, G5, J1–J3 | Immediate — no launch | The recurring-revenue launchpad. Highest priority. |
| **Data** | C2, G1–G6, I1, J2 | Near | Instrument everything; the defensible moat. |
| **Return** | B4–B5, C4, D1–D3, F1–F3, H1 | Medium | The hard, differentiated capability. |
| **Organs** | D3–D4, E1–E2, I2, K1–K3 | Long | Frontier; separate timeline, don't over-claim. |

**Suggested "design first" shortlist (highest value × most defensible × most manufacturable):**
1. **C1 universal cassette** — defines the razor-blade economics; everything depends on it.
2. **A2 RPM-as-appliance** — the flagship ground subscription product.
3. **G2 sensor pod + J2 smart cassette** — cheap, turn every run into sellable data.
4. **I1 in-orbit 1g centrifuge** — credibility multiplier.
5. **D2 tumour-organoid drug-response cassette** — rides the NAM/precision-oncology tailwind.
6. **H1 protein-crystal cassette** — a proven, self-contained microgravity product.

---

## 6. Cross-cutting design/build notes for the terminal

- **Start every device from the cassette interface** (C1) — mechanical, fluidic, power, data, and the sealing/sterility spec. Get that standard right and most devices become variations.
- **Bill-of-materials cost-down is the margin story.** For each device produce a BOM and a design-for-manufacture pass aimed at a contract manufacturer; the cassette unit cost swings the whole subscription model (see `Yuri_RPM_Subscription_Model.xlsx`).
- **PCB + microfluidics + optics** recur across C2, G1–G4, J2 — a natural cluster to standardise (shared control board, shared optical module).
- **Keep it small and to a hand-luggage/standard-launcher envelope** — mass and volume budgets are first-class constraints, not afterthoughts.
- **Regulatory:** ground lab devices (Family A, D2, H1) are the fastest to market; implant-grade (K3) and clinical genomics (G4) carry heavy regulatory load — flag and separate.
- **No factory.** Output should assume outsourced manufacture: partner-qualification pack, RFQ-ready drawings, tolerances, and test/QA plan — not an in-house production line.

## 7. Source material (for deeper context)

In the Yuri folder / data room:
- `Yuri Briefing — Organoids, Bioprinting & Space Biotech 11 June 2026.md` (science + the ScienceTaxi/BioSpin/EVA baseline)
- `Yuri — Pre-Meeting Grounding & Red-Team Briefing.md` (what's real vs. aspirational; contract-manufacturing + data-monetisation as Yuri's own stated models)
- `Yuri_Strategic_Update_v6.pptx` (the ladder, consumables, contract-manufacturing and commercial-engine slides)
- `Yuri_RPM_Subscription_Model.xlsx` (cassette/consumable unit economics, razor-blade model)
- `Yuri_Customer_Research_Pack.docx` (how the existing ~100 RPM customers work → what to automate)
- OneDrive data room: `Tech Roadmap.pptx`, `further input/UseCases/*` (science papers), `HSG/Yuri - Data monetization.xlsx`, `HSG/Yuri_Platform.xlsx`

*Meeting-notes provenance: the ladder, breeder/grow-out analogy, "small & modular / fit-anywhere," "automate the manual," in-orbit 1g control and the physiological-stressor framing all come from the Yuri workshop (Maria, Christian, Daniel) and the TTP/Simon Lesbirel discussion. Device concepts are grounded in Yuri's own materials plus reasonable adjacencies; the frontier items (Families E, K, some of G) are deliberately speculative and flagged as such.*
