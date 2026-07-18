# Space Microgravity Hardware for Organoid and Cell Culture
## Research Report — Prepared for Yuri Space Biotech Hardware Design
**Date:** July 2026 | **Scope:** 2019–2026 programmes, engineering detail first

---

## Table of Contents

1. [Ground Microgravity Simulators](#1-ground-microgravity-simulators)
   - 1.1 Random Positioning Machines (RPM)
   - 1.2 2D and 3D Clinostats
   - 1.3 Rotating Wall Vessels (RWV / HARV)
   - 1.4 Magnetic Levitation / Diamagnetic Simulation
   - 1.5 Which Tissues Actually Benefit — Evidence Summary
2. [ISS and Orbital Bioculture Hardware](#2-iss-and-orbital-bioculture-hardware)
   - 2.1 NASA Bioculture System
   - 2.2 NASA ADSEP (Advanced Space Experiment Processor)
   - 2.3 Redwire BioFabrication Facility (BFF)
   - 2.4 Space Tango CubeLab / TangoLab
   - 2.5 Yuri ScienceTaxi and ScienceTaxi BioSpin
   - 2.6 ESA Kubik Incubator
   - 2.7 Kayser Italia / Bioreactor Express
   - 2.8 Nanoracks BlackBox
   - 2.9 SpacePharma NEXUS Lab
   - 2.10 FLUMIAS-DEA In-Orbit Fluorescence Microscope
3. [Organoid and Tissue-Specific Space Missions and Results](#3-organoid-and-tissue-specific-space-missions-and-results)
   - 3.1 Neural / Brain Organoids
   - 3.2 Cardiac Organoids
   - 3.3 Skeletal Muscle Tissue Chips
   - 3.4 Kidney and Vascular Tissue Chips
   - 3.5 Cancer Spheroids and Tumour Organoids
   - 3.6 Stem Cell Expansion
   - 3.7 Protein Crystal Growth Heritage
4. [Return / Re-entry Biology Hardware](#4-return--re-entry-biology-hardware)
   - 4.1 Varda Space Industries W-Series
   - 4.2 ATMOS Space Cargo PHOENIX
   - 4.3 SpacePharma
   - 4.4 ISS Dragon / Cygnus Return Protocols
5. [Engineering Constraints Unique to Space](#5-engineering-constraints-unique-to-space)
6. [Synthesis — What Microgravity Changes for Organoid Culture, and the Hardware Implications](#6-synthesis--what-microgravity-changes-for-organoid-culture-and-the-hardware-implications)
7. [Source List](#7-source-list)

---

## 1. Ground Microgravity Simulators

### 1.1 Random Positioning Machines (RPM)

The RPM (sometimes called a 3D clinostat) rotates a sample about two independent, perpendicular axes under computer-controlled, randomised angular velocities. The gravity vector is thus distributed isotropically over time, producing a time-averaged near-zero net gravitational stimulus — typically cited as ~10⁻³ g. It does not eliminate gravity at any instant but prevents cells from sedimenting in a preferred direction, which is the primary mechanobiological cue being cancelled.

**Mechanism:** Two gimballed frames driven by independent motors. Software randomises rotation speed and direction. The RPM 2.0 (Yuri's product, formerly developed by the Dutch office of Airbus for ESA) adds software-driven partial-gravity simulation: 0.16 g (Moon), 0.38 g (Mars), and microgravity (~10⁻³ g) are all selectable — relevant for future mission-analogue studies.

**Key hardware variants:**

| Variant | Developer | Status | Distinguishing features |
|---|---|---|---|
| RPM 1.0 | Airbus Netherlands / ESA | Operational (legacy) | Two-axis, zero-g only, ~60+ units distributed globally to NASA, ESA and universities |
| RPM 2.0 | Airbus → acquired by Yuri GmbH (date: ~2022) | Current commercial standard | Software-selectable partial gravity (0.16 g to 1 g), incubator-compatible, CO₂/humidity/temperature maintained externally by host incubator, radiation-facility compatible |
| Desktop RPM | Equiprobe | Commercial | Compact benchtop, single-researcher use |

**Form factor notes:** The RPM working volume sits inside a standard cell culture incubator. The RPM 2.0 frame is large enough to house standard T-flasks, multi-well plates, or purpose-built spinner vessels. No power budget is required beyond the incubator — the RPM draws grid power for motors.

**Gravity simulation quality:** The simulation is time-averaged. Rotation must be faster than the biological settling timescale for the cell type under study (faster for single cells, slower for aggregates). If rotation is too fast, centrifugal forces become significant; too slow, and cells sediment transiently. The RPM introduces shear and fluid motion artefacts that are absent in real microgravity — the primary limitation of all ground simulators.

**Biological results (organoid-relevant):**
- Thyroid cancer cells form 3D multicellular spheroids within 24–72 h on the RPM where they remain 2D monolayers at 1 g.
- Colorectal cancer organoids grown on the RPM showed reduced sensitivity to 5-fluorouracil compared with 1 g controls, demonstrating drug-resistance phenotyping capability.
- Fluid dynamics studies (Wuest et al. 2017) quantified bubble formation and shear in RPM vessels — a critical engineering finding: bubbles trapped in the medium cause mechanical disruption, and surface-tension-driven bubble accumulation in closed vessels mimics (unintentionally) a real space-flight failure mode.

**Limitation for organoid validation:** The RPM distributes gravity over time but does not provide true microgravity at any instant. Dense organoids (>500 µm) that sediment faster than the rotation period are not well simulated. For pre-flight validation of organoid protocols, the RPM is nonetheless the most widely accepted ground analogue.

---

### 1.2 2D and 3D Clinostats

A **2D clinostat** rotates a sample about a single horizontal axis at constant, slow speed (1–10 rpm). The gravity vector rotates in one plane, averaging to near zero in that plane. It simulates microgravity adequately for cells in liquid suspension but produces residual acceleration components for off-axis samples.

A **3D clinostat** (distinct from the RPM) rotates about two axes at constant, pre-set speeds (e.g., inner 1.5 rpm, outer 3.825 rpm). When speeds are irrational multiples the trajectory quasi-randomises, approaching RPM behaviour. At rational multiples it produces repeating patterns.

**Key difference from RPM:** The RPM actively randomises angular velocity; the 3D clinostat uses constant speeds. Results for bacterial biofilm transcriptomes and cancer cell spheroid formation are comparable between well-tuned 3D clinostats and the RPM 2.0 at equivalent speed settings. For most cell-biology purposes they are interchangeable.

**Synthecon Rotary Cell Culture System (RCCS)** — a US-marketed 2D clinostat variant — is distinct from the HARV (see 1.3). It is a horizontally rotating vessel; the RCCS is classified as a 2D clinostat. Used widely as a ground control comparison for RWV data.

---

### 1.3 Rotating Wall Vessels (RWV / HARV) — NASA Heritage

**Origin:** NASA Johnson Space Center, developed in the 1990s by Ray Schwartz and colleagues to allow continuous suspension culture without sedimentation without the turbulence of stirred bioreactors. The goal was to grow large 3D tissue constructs on the ground that could serve as models for microgravity biology.

**Mechanism:** The vessel is a cylinder that rotates about a horizontal axis. Solid-body rotation means the fluid and the vessel wall rotate at the same angular velocity — laminar flow with minimal shear. A coaxial silicone membrane tube provides gas exchange (O₂ in, CO₂ out) without disturbing the culture. Cells are maintained in suspension by the balance between gravitational settling and the fluid drag from vessel rotation.

**Commercial manufacturer:** Synthecon Inc. (Houston, TX), the original licensee of the NASA patent. Two primary formats:
- **HARV (High-Aspect Rotating Vessel):** Flat disc shape, 10 mL or 50 mL working volume. Oxygenation through the silicone membrane on the flat face. Best for adherent-cell-derived spheroids and microcarrier cultures.
- **STLV (Slow-Turning Lateral Vessel):** Cylindrical, 110 mL to 500 mL. For larger tissue constructs.

| Parameter | HARV (10 mL) | STLV (110 mL) |
|---|---|---|
| Working volume | 10 mL | 110 mL |
| Rotation speed | 8–30 rpm (adjustable) | 12–20 rpm typical |
| Gas exchange | Silicone membrane, diffusion only | Silicone membrane |
| Shear stress | ~0.5–3 dyne/cm² (low) | Similar |
| O₂ membrane area | Fixed, face of disc | Cylindrical membrane |
| Temperature | Host incubator | Host incubator |

**Heritage and results:**
- Intestinal organoids (Nickerson lab, University of Arizona): Salmonella-infected intestinal epithelium organotypic models; recapitulated 3D villus architecture not achievable in 2D culture. Foundational work pre-2010 that established RWV credibility.
- Chondrocyte cartilage constructs: Multiple groups achieved mm-scale cartilage tissue without a scaffold, accelerating chondrogenesis versus static 3D culture.
- Hepatocyte spheroids: Long-term metabolic activity (CYP450 activity) maintained weeks longer than in 2D, relevant for drug-metabolism modelling.

**Key limitation for space organoid design:** The RWV relies on buoyancy-driven suspension of cells. In real microgravity there is no buoyancy, so the RWV mechanism is not operative. The RWV is a ground tool; it does not translate directly to orbit. It also introduces shear from rotation that is absent in true microgravity. It remains valuable as a rapid, low-cost spheroid-generation tool for pre-flight protocol development.

---

### 1.4 Magnetic Levitation / Diamagnetic Simulation

**Principle:** All biological materials are weakly diamagnetic (small negative magnetic susceptibility). In a strong magnetic field gradient, the diamagnetic repulsion force can be tuned to counterbalance gravity, levitating a cell or small tissue mass without any physical contact.

**Key system — n3D Biosciences (now Nano3D Biosciences, Houston TX):** Uses a magnetic plate containing neodymium magnets plus a paramagnetic fluid (e.g., manganese(II) chloride or gadolinium at low concentrations in culture medium). Cells are labelled with biocompatible iron oxide nanoparticles, then the magnetic force levitates them against gravity, allowing 3D self-assembly. This is distinct from pure diamagnetic levitation — it uses positive magnetisation of cells.

**Magnetic levitational bioassembly in space (Parfenov et al., Science Advances 2020):** A magnetic bioassembler was designed, certified for spaceflight, and flown. Human chondrocyte tissue spheroids were assembled by magnetic levitation in microgravity for the first time — 3D constructs of ~2–3 mm diameter. Key finding: magnetic assembly in microgravity produces more uniform, less compressed structures than either magnetic assembly at 1 g or free-floating microgravity culture, because gravitational compaction of the magnetic field gradient is removed. [Source: PMC7363443]

**Engineering considerations for space:**
- Strong permanent or superconducting magnets add mass and volume.
- The paramagnetic fluid (Mn²⁺ or Gd) must be biocompatible at working concentration (typically 1–2 mM MnCl₂).
- Interaction with ISS metallic structures (magnetic safety zones) requires clearance.
- Diamagnetic levitation (no nanoparticles) requires fields of ~10–20 Tesla — impractical for flight. The nanoparticle-assisted approach requires only ~0.3–1 T.

**Status:** Demonstrated once on ISS (2019 flight). No follow-on commercial service as of 2026. Primary utility is in ground-based scaffold-free 3D culture and in producing uniform spheroids at scale.

---

### 1.5 Which Tissues Actually Benefit — Evidence Summary

| Tissue / organoid type | Ground simulator evidence | Real microgravity evidence | Primary benefit observed |
|---|---|---|---|
| Neural / brain organoids | RPM: accelerated differentiation markers; limited spheroid improvement | ISS (Space Tango CubeLab): accelerated maturation; 1,183 DEGs in dopaminergic organoids | Faster maturation; lower proliferation; potential neurodegeneration model compaction |
| Cardiac muscle / cardiomyocytes | RWV: improved Ca²⁺ handling; 3D structure | ISS (NASA BCS, BioServe): 3× larger spheres, 20× higher nuclei counts; improved sarcomeric organisation | Proliferation enhancement; functional improvement |
| Bone / cartilage | RWV: mm-scale constructs; chondrogenesis | Limited ISS organoid data; astronaut bone-loss well documented | Ground: structural advantage; in space: risk of degeneration |
| Intestinal epithelium | RWV: 3D villus-crypt structures; pathogen response | Historical shuttle data; few recent organoid missions | 3D architecture fidelity |
| Skeletal muscle | Clinostat/RWV: atrophy modelling | ISS tissue chip (CRS-21): downregulated myoblast proliferation; muscle-type transcriptome changes | Disease model (atrophy); not a production benefit |
| Liver / hepatocyte | RWV: CYP450 activity longer maintained | ISS ADSEP experiments: extended culture; drug metabolism | Improved metabolic model; longer functional window |
| Tumour spheroids | RPM: spheroid formation within 72 h; drug resistance changes | ISS: thyroid, endothelial cancer cells form 3D spheroids; reduced 5-FU sensitivity | Drug-screening model that better reflects in vivo resistance |
| Protein crystals | — (not cell-based) | ISS PCG (JAXA, Merck): larger, more ordered crystals | Structure-based drug discovery; 20+ years heritage |

**Bottom line:** Tissues where gravity-driven compaction, sedimentation of secreted matrix, or convection-driven nutrient gradients are the limiting factor benefit most from microgravity. These are primarily: neural organoids, cardiac progenitors, and tumour spheroids for drug-resistance modelling. Bone and muscle are primarily disease-modelling targets, not production targets.

---

## 2. ISS and Orbital Bioculture Hardware

### 2.1 NASA Bioculture System (BCS)

| Attribute | Detail |
|---|---|
| Operator | NASA Ames Research Center (PI: Julie Robinson / Elizabeth Pane) |
| Rack format | EXPRESS Rack locker (one locker volume: ~520 × 430 × 212 mm) |
| Cassette count | 10 independently controlled experiment cassettes per locker |
| Cassette design | Each cassette: disposable flow-path assembly + base + cover; perfusion-based bioreactor; independent temperature and flow rate control |
| Temperature | Per-cassette independent control (nominal 37°C; range not publicly specified, likely 4–40°C) |
| Gas supply | Shared N₂/O₂/CO₂ supply assembly across all cassettes |
| Media exchange | Earth-remote-controllable flow rate; automated medium exchange, cell sampling, and chemical fixation |
| Missions flown | SpaceX CRS-13 (Dec 2017, validation with mouse MLO-Y4 osteocytes + human iPSC-cardiomyocytes); SpaceX CRS-18 (Jul 2019, CS-02); SpaceX CRS-22 (Jun 2021, CS-04) |
| Heritage lineage | Successor to Cell Culture Module (CCM) that flew on 18 Space Shuttle missions |
| Key capability | Long-duration biology (weeks to months); autonomous media exchange; perfusion at adjustable rates |
| Known limitation | Shared gas supply means one cassette gas leak can affect others; flow-path assembly is single-use disposable, adding launch mass per mission |

**Biological heritage:** The CCM predecessor flew on 18 shuttle missions, providing decades of evidence for long-duration mammalian cell culture in microgravity. The BCS extends this to ISS operational cadence.

---

### 2.2 NASA ADSEP (Advanced Space Experiment Processor)

| Attribute | Detail |
|---|---|
| Operator | Originally Techshot Inc. (now Redwire Space via acquisition) |
| Rack format | Single Middeck Locker (approximate 330 × 210 × 200 mm) |
| Cassette count | Up to 4 experiment cassettes simultaneously |
| Temperature range | 4°C to 40°C |
| Application focus | Pharmaceutical research, cell culture, tissue engineering, bioseparations, fluid processing, colloids |
| Coupling with BFF | ADSEP serves as the bioreactor/maturation chamber for tissues printed by the BFF — the printed construct is transferred to ADSEP for post-print conditioning |
| Autonomy | Fully automated; no crew time required beyond transfer and plug-in |
| Status | Active on ISS as of 2024 |

**Key role in the Redwire bioprinting pipeline:** The BFF prints a bioink construct; that construct then matures for days to weeks inside ADSEP cassettes under controlled perfusion, temperature, and biochemical stimulation. This two-stage (print + bioreactor) architecture is the most complete in-orbit biomanufacturing pipeline currently operational.

---

### 2.3 Redwire BioFabrication Facility (BFF)

| Attribute | Detail |
|---|---|
| Operator | Redwire Space (formerly Techshot) |
| Rack format | EXPRESS Rack locker; BFF-1 flew November 2019; upgraded BFF-2 flew November 2022 |
| Function | Extrusion-based 3D bioprinting of living tissue from bioinks containing human or animal cells |
| Print architecture | Z-axis tower with multiple print heads; X-Y print stage with integrated bioreactor |
| Post-print maturation | Constructs transferred to ADSEP cassettes for culture and conditioning |
| Mission heritage | BFF-Cardiac (heart tissue); BFF-Meniscus (knee meniscus); BFF-Meniscus-2 |
| Milestone results | Sept 2023: first human knee meniscus bioprinted on orbit. May 2024: first live 3D bioprinted cardiac tissue returned from ISS. |
| Bioink types | Collagen-based for meniscus; custom cardiac bioinks with human cardiomyocytes |
| Microgravity advantage | Without gravity, soft bioink structures maintain their 3D shape without mechanical support structures (scaffolds, sacrificial supports); constructs that would slump or collapse under 1 g self-support in orbit |
| Current programme | PIL-BOX pharmaceutical crystal experiments also run through Redwire; second batch returned 2024 |

**Engineering significance for organoid hardware:** The BFF demonstrates that extrusion bioprinting is feasible in microgravity — nozzle clogging, bubble injection, and bioink viscosity all behave differently without sedimentation. The printer must be enclosed and sealed to prevent bioink droplets from floating free (contamination/safety risk). Print resolution is lower than ground-based systems because surface tension dominates at the nozzle exit.

---

### 2.4 Space Tango CubeLab / TangoLab

The most widely used commercial platform for small-scale biology on ISS as of 2026.

| Attribute | Detail |
|---|---|
| Operator | Space Tango Inc. (Lexington, KY) |
| Unit format | CubeLab unit = 10 × 10 × 10 cm (1U). Experiments scale to 2U, 4U, 6U, or 9U configurations. |
| Host hardware | TangoLab (TL-1 installed July 2016; TL-2 deployed later). Each TangoLab = one EXPRESS Rack locker (~58 × 46 cm footprint). TangoLab holds two 9U CubeLab payload slots |
| Power | 12 V, 5 V, and 3.3 V available per slot; USB and Ethernet data |
| Thermal control | Cold flask subsystem capable of maintaining ≥4°C for cold samples; 37°C incubation standard |
| Autonomy | Fully automated; flight computer provides remote control and near-real-time data downlink |
| Throughput | Over 270 experiments flown across TangoLab-1 and TL-2 as of 2024 |
| Organoid use | Brain organoids (National Stem Cell Foundation / Scripps Research, CRS-19, CRS-29); midbrain organoids (Yuri GmbH hardware integrated into Space Tango CubeLab, 2024/2025 preprint); muscle tissue chips (CRS-21); kidney chips (operated by astronaut Christina Koch) |
| Key limitation | 9U maximum volume is small (~1 litre envelope); media exchange is difficult in static-culture configurations — some missions used sealed cryovials with no in-flight exchange |

**Organoid culture method used in practice (brain organoids, CRS-19/CRS-29):** Individual organoids placed in sealed NUNC cryovials with 1 mL culture medium. No media exchange during the 30-day mission. This is an important engineering constraint: the static, sealed-vial approach eliminates the need for fluid management but limits culture duration and removes waste metabolites from the system, creating a nutrient-stress environment.

**Note on the Yuri / Space Tango integration (2024–2025 preprint):** Yuri GmbH designed custom culture cassettes that were integrated into Space Tango CubeLab hardware. This is an emerging model where a biology specialist (Yuri) provides the cassette design and the biology protocol while the hardware integrator (Space Tango) provides the flight-certified CubeLab shell, power, thermal, and data infrastructure.

---

### 2.5 Yuri ScienceTaxi and ScienceTaxi BioSpin

Yuri GmbH (headquartered in Meckenbeuren, Germany; Luxembourg engineering team) is the client organisation commissioning this report. Their hardware platform is described here for completeness.

**ScienceTaxi (original):**
- A powered incubator designed to be carried aboard Cygnus or Dragon as a secondary payload; transferred to ISS on arrival.
- Provides power, temperature control, and data downlink to hosted ScienceShell experiment cassettes.
- First flown on NG-23 (Cygnus); transferred to Dragon on-station during mission.
- Hosts external commercial research customers (pharmaceutical companies, universities) using standardised ScienceShell cassettes developed by Yuri's missions team in Germany.

**ScienceTaxi BioSpin:**
- Extended variant with a built-in centrifuge providing adjustable gravity levels: Earth (1 g), Moon (0.16 g), Mars (0.38 g), and microgravity (near 0 g).
- Capacity: up to 38 individual experiments per launch.
- Contains automated systems, temperature control, and real-time telemetry.
- Development time: 3.5 years by Luxembourg engineering team.
- Launched September 2025 on the HUMB (Human Biology) mission.
- Sierra Space partnership (announced March 2025): Sierra Space provides payload integration, logistics, and operational support for all mission phases (launch, on-orbit, re-entry) and is the primary logistics provider for BioSpin. Future integration into Sierra Space's LIFE habitat is planned.

| Attribute | ScienceTaxi | ScienceTaxi BioSpin |
|---|---|---|
| Experiment slots | Not publicly specified | Up to 38 |
| Centrifuge | No | Yes (0 g to 2 g adjustable) |
| Temperature | Controlled (range not published) | Controlled |
| Telemetry | Real-time data | Real-time data |
| Launch vehicle compatibility | Cygnus (NG-23 heritage); Dragon | Dragon (HUMB mission) |
| Specimen types | Organoids, plants, crystals | Organoids, plants, crystals |
| Ground simulation analogue | Yuri RPM 2.0, Clinostat | Same, plus partial-g comparison in flight |

**ScienceShells:** Yuri's modular cassette concept. Individual automated mini-bioreactors designed for specific biological applications (cell culture, organoid, plant). Standardised to slot into ScienceTaxi or BioSpin bays. The cassette approach is the consumable model: customers develop their biology with Yuri's ground RPM/clinostat, then the same consumable format flies in space.

---

### 2.6 ESA Kubik Incubator

| Attribute | Detail |
|---|---|
| Developer | COMAT Aerospace (Toulouse, France) for ESA |
| Location | Columbus module, ISS (permanent installation since 2004) |
| Dimensions | ~37 cm length (compact form factor; fits standard ISS drawer) |
| Temperature range | 6°C to 38°C (settable) |
| Centrifuge option | Centrifuge insert available; 0.2 g to 2 g settable |
| Remote control | Ground-commanded via ISS MPCC (KUBIK ground software) |
| Models built | 9 models; 2 permanently on ISS; others as spares |
| Mission heritage | More than 40 experiments on ISS since 2004 |
| Biological range | Bacteria, plants, seeds, yeasts, animals, human cells |
| Container format | Standardised experiment containers (EC); hand-size bioreactors with all reagents pre-loaded |
| Autonomy | Full autonomy; crew only transfers and connects the container |

**Commercial access:** Via Kayser Italia / ESA Bioreactor Express Service (see 2.7).

**Key strength:** 20+ years of flight heritage; proven temperature stability; the centrifuge insert is unique for providing a 1 g reference within the same device as a microgravity experiment, eliminating hardware variability between gravity conditions. This is a significant experimental design advantage.

---

### 2.7 Kayser Italia / Bioreactor Express Service

| Attribute | Detail |
|---|---|
| Service operator | Kayser Italia s.r.l. (under ESA commercial exploitation agreement, signed July 2019) |
| Platform used | ESA Kubik on Columbus/ISS |
| Container capacity | Up to 24 experiment containers per Kubik session |
| Price | Starting under €250,000 per experiment slot |
| Lead time | Under 12 months from contract to launch |
| First commercial payload | BioAsteroid experiment (SpaceX CRS-21, December 2020 — microbe-rock mineral weathering study by Prof. Charles Cockell, University of Edinburgh) |
| Biological scope | Cells, tissues, bacteria, plants, algae, biochemistry, material science |
| Container format | Pre-loaded, sealed, autonomous experiment units |

**Significance for competitors / benchmark:** This is the lowest cost-to-orbit biological incubation service with ESA heritage hardware. The sub-€250 k entry point and <12 month lead time make it accessible for academic and mid-size pharma customers.

---

### 2.8 Nanoracks BlackBox

| Attribute | Detail |
|---|---|
| Operator | Nanoracks (now Voyager Technologies) |
| Format | Full middeck locker size |
| Interface | Power, data, and communications; fully remotely commanded |
| Crew interaction | Near-zero; crew only plugs in the locker |
| Safety | Designed for chemical or biological agents too hazardous for direct crew handling; fully enclosed |
| Launch | First flight SpaceX CRS-20, March 2020 |
| Biology capability | Multiple simultaneous experiments; BioCells family compatible (plate-reader compatible cell culture plates) |
| Key use case | Hazardous biological agents, viruses, pathogens where crew containment is mandatory |

---

### 2.9 SpacePharma NEXUS Lab

| Attribute | Detail |
|---|---|
| Operator | SpacePharma (Israel) |
| Format | Miniaturised, automated, remote-controlled laboratory |
| Mission flown | NEXUS on NG-8 (Orbital ATK CRS-8), November 2017, on ISS via Cygnus |
| Key claim | First ISS life-science device operated directly by researchers on Earth without astronaut involvement |
| Biological scope | Small-molecule crystallisation, biologics crystallisation, organoid and stem-cell research, cancer modelling, anti-ageing research, microbiology |
| Remote operation | Researchers control experiments from ground via dedicated software |
| Current status | Active; expanded service offering post-NEXUS |

---

### 2.10 FLUMIAS-DEA In-Orbit Fluorescence Microscope

| Attribute | Detail |
|---|---|
| Full name | FLUorescence Microscope with Artificial Intelligence Support — Demonstration ExperimentA |
| Developer | German Aerospace Center (DLR) / OHB System AG |
| Technology | 3D fluorescence structured illumination microscopy (SIM) — first SIM system in space |
| Resolution | Sub-diffraction-limited 3D fluorescence; comparable to ground confocal |
| Samples | Fixed and living human cells |
| Operation | Successfully operated on ISS; automated, AI-assisted focus control |
| Relevance | First demonstration that high-resolution 3D fluorescence imaging is feasible on ISS without crew assistance; critical for in-situ quality control of organoids |

**Keyence BZ-X800E on ISS:** A commercial all-in-one fluorescence microscope (Keyence Research Microscope Testbed, KRMT) delivered to ISS early 2021. Used by crew for fluorescence imaging of biological samples. Less automated than FLUMIAS-DEA but commercially available hardware.

---

## 3. Organoid and Tissue-Specific Space Missions and Results

### 3.1 Neural / Brain Organoids

**National Stem Cell Foundation / Scripps Research / New York Stem Cell Foundation (CRS-19, 2019; CRS-29, 2024):**
- Organoids generated from iPSCs of patients with primary progressive multiple sclerosis (PPMS), Parkinson's disease (PD), and non-symptomatic controls.
- Hardware: Space Tango CubeLab (9U); organoids in sealed NUNC cryovials at 37°C; static culture (no media exchange).
- Duration: 30 days on ISS.
- Results: Organoids returned healthy. Accelerated maturation: lower levels of CCND1, CDKN1A, GADD45A (proliferation); higher levels of tyrosine hydroxylase, dopa decarboxylase (dopaminergic maturation markers). Dopaminergic organoids: 1,183 differentially expressed genes vs ground. Cortical organoids: 926 DEGs. (Published: *Stem Cells Translational Medicine*, October 2024; PMC11631337)
- Wnt signalling pathway implicated in microgravity-induced differentiation changes.

**Midbrain organoids, Yuri GmbH / Space Tango collaboration (SpX CRS-19; preprint 2026):**
- Custom Yuri-designed cassettes integrated into Space Tango CubeLab.
- 30-day spaceflight at 37°C on ISS.
- Hardware malfunction prevented scheduled media exchanges during flight — organoids survived on initial 1 mL medium for full 30 days.
- Results: Organoids viable; robust neurite outgrowth with growth cones observed post-return. Spaceflight and the consequent nutrient stress triggered neural plasticity, cytoskeletal remodelling, and selective neuronal vulnerability responses. (Preprint: biorxiv 2026.05.04.722620)
- **Engineering lesson:** Static sealed-vial culture can sustain 30-day organoid viability, but nutrient stress confounds microgravity-specific biology. Media exchange in orbit is the next technical priority.

**UCSD / Space Tango $5M NASA award (2024–ongoing):** Dedicated stem cell research laboratory on ISS with active media exchange capability, targeting brain organoids. System expected fully operational by 2025–2026.

**CNES (France) / first cerebral organoids on ISS:** Cerebral organoids spent 40 days on ISS, returning December 2023. This mission specifically emphasised the formation and structural integrity of cerebral organoids (not just neural cells), validating that complex organoid architectures survive 40-day spaceflight.

---

### 3.2 Cardiac Organoids

**iPSC-derived cardiomyocytes (Stem Cell Reports, 2022; PMC9561632):**
- Cryopreserved 3D cardiac progenitors cultured on ISS for 3 weeks.
- Results: 3× larger sphere sizes, 20× higher nuclei counts, increased proliferation markers versus 1 g ground cultures. Highly enriched cardiomyocytes generated in space showed improved Ca²⁺ handling and increased sarcomeric gene expression.
- Hardware: NASA BCS cassettes.

**BFF-Cardiac (Redwire, 2024):**
- First live 3D bioprinted cardiac tissue returned from ISS, May 2024.
- Cardiac organoids bioprinted using BFF, matured in ADSEP bioreactor cassettes.
- Tissue returned viable; exact functional characterisation results pending publication as of July 2026.

**SpaceX CRS-31 (launched late 2024):**
- Research from Oregon State University and Texas Tech: 3D-bioprinted cardiac organoids to study microgravity-induced heart muscle atrophy.
- Hardware: Space Tango CubeLab.
- Published in PNAS (October 2024): human heart tissue harmed by even short orbital stays; cardiac function alteration documented — relevant for astronaut health and modelling cardiac disease.

---

### 3.3 Skeletal Muscle Tissue Chips

**Tissue Chips in Space (NIH/NCATS + NASA ISS National Lab partnership):**
- 16 muscle tissue chips (myobundles from biopsies of young and older adults) integrated into autonomous Space Tango CubeLab.
- Launched SpaceX CRS-21, December 2020; 10-day experiment.
- RNA-Seq results: downregulation of myoblast proliferation and muscle differentiation transcripts in space vs ground. Muscle fibre type composition shifts.
- Validated that engineered muscle-on-a-chip platforms are viable for studying atrophy in microgravity.
- Follow-on: *Microgravity Accelerates Skeletal Muscle Degeneration: Functional and Transcriptomic Insights from a Muscle Lab-on-Chip Model Onboard the ISS* (preprint 2025, further characterisation of functional loss).

---

### 3.4 Kidney and Vascular Tissue Chips

**Kidney chips (ISS National Lab / Tissue Chips programme):**
- Astronaut Christina Koch operated kidney chips on ISS.
- Purpose: model age-related kidney decline accelerated by microgravity.

**Lung-bone marrow tissue chip (Children's Hospital of Philadelphia):**
- Investigates neutrophil mobilisation from bone marrow to lung during bacterial infection.
- Demonstrates multi-organ chip capability in space.

---

### 3.5 Cancer Spheroids and Tumour Organoids

**Thyroid cancer cells (multiple groups):**
- Form 3D spheroids in microgravity (both real and simulated) where they remain 2D monolayers at 1 g.
- Spheroid morphology recapitulates in vivo tumour architecture; altered expression of VEGF, focal adhesion kinase, E-cadherin.

**Colorectal cancer organoids (Scientific Reports, 2024):**
- Grown in simulated microgravity (RPM); reduced sensitivity to 5-fluorouracil.
- Demonstrates RPM as a pre-flight drug-resistance screening platform.

**Endothelial cells on ISS:**
- Survive spaceflight and form 3D spheroids within a cell incubator; relevant for vascular tumour microenvironment modelling.

**Strategic value:** Tumour organoids in microgravity are less sensitive to chemotherapy — i.e., they recapitulate the clinical problem of drug resistance better than 2D cultures. This is one of the strongest commercial arguments for space-based drug screening.

---

### 3.6 Stem Cell Expansion

**Mesenchymal stem cells (MSCs):**
- Simulated microgravity potentiated proliferation of human bone-marrow-derived MSCs.
- ISS culture (7 and 14 days): more potent immunosuppressive capacity vs ground control.
- Therapeutic scenario: expand patient-specific iPSCs in microgravity at scale; return to Earth for differentiation into neuronal cells (Parkinson's) or cardiomyocytes (heart failure). Microgravity may shorten cell therapy production timelines.

---

### 3.7 Protein Crystal Growth Heritage

Protein crystal growth (PCG) is the longest-running and highest-volume space biology programme — by far the largest single category of ISS experiments.

| Attribute | Detail |
|---|---|
| Primary operators | JAXA (~66% of all ISS PCG experiments), NASA/CASIS, ESA, SpacePharma |
| Duration | 20+ years of continuous PCG on ISS |
| Hardware (JAXA) | Protein Crystallisation Research Facility (PCRF) in Kibo; uses counter-diffusion method in capillary tubes |
| Results | More ordered, larger crystals than ground equivalents; improved resolution in X-ray diffraction |
| Drug discovery outputs | TAS-205 (Duchenne Muscular Dystrophy drug); compounds for breast cancer, gum disease, periodontal disease; Merck pembrolizumab crystal structure improvement |
| Varda W-1 (pharmaceutical): | Ritonavir Form III (metastable polymorph) crystallised for first time in sustained orbit; superior Form III crystal quality demonstrated vs ground |

**Relevance to organoid hardware design:** PCG demonstrates that sealed, autonomous, passively diffusion-based containers work well in microgravity for molecule-scale phenomena. However, cell culture demands active metabolite removal and nutrient replenishment — a fundamentally harder engineering problem than crystal growth.

---

## 4. Return / Re-entry Biology Hardware

### 4.1 Varda Space Industries W-Series

| Attribute | Detail |
|---|---|
| Operator | Varda Space Industries (El Segundo, CA) |
| Vehicle | W-series free-flying production satellite; reentry capsule + Rocket Lab Photon spacecraft bus |
| Reentry speed | >18,000 mph; >Mach 25 at atmospheric entry |
| W-1 mission | Launched June 2023 (SpaceX Transporter-8 rideshare); 8+ months on orbit; landed February 21, 2024, Utah Test and Training Range |
| Processing capability | Pharmaceutical mixing, heating, cooling, crystallisation in orbit; sealed environment |
| First result | Ritonavir (HIV/Hepatitis C antiretroviral): Form III polymorph (metastable) produced for first time in sustained microgravity; crystal quality confirmed by Improved Pharma analysis post-return |
| Funding | $187M raised as of July 2025 |
| Next missions | W-2 onwards; proprietary roadmap |
| Cold chain | No active cold chain described; pharmaceutical crystals are dry solid — thermal stability adequate for reentry without active cooling |
| Biology limitation | W-1 was pharmaceutical crystal / small molecule; live cell return in the capsule has not yet been demonstrated; thermal shock at reentry is an open challenge for live biology |

**Why Varda matters for organoid hardware:** Varda is the proof-of-concept that orbital pharmaceutical manufacturing and return can be commercially viable. Their W-series architecture (free-flyer + reentry capsule) bypasses ISS scheduling constraints and crew-time bottlenecks. If live biology (organoids, expanded stem cells) can tolerate the thermal profile of the Varda capsule during reentry and recovery, this becomes a pathway for returning living material at commercial scale without relying on Dragon or Starliner.

---

### 4.2 ATMOS Space Cargo PHOENIX

| Attribute | Detail |
|---|---|
| Operator | ATMOS Space Cargo (Germany) |
| Technology | Inflatable heat shield (novel); nitrogen gas canister + atmospheric air intake two-stage inflation |
| Reentry shield diameter | 6 m (inflated) |
| Payload capacity | Up to 100 kg downmass |
| Downmass efficiency | Claims 1:2 upmass:downmass ratio — claimed 10× above current market standard |
| PHOENIX 1 | First orbital test flight April 2025 (Bandwagon-3 rideshare, SpaceX); carried four payloads including biological experiments (DLR, Imperial College London, IDDK, Frontier Space) |
| PHOENIX 2 | Planned 2026; adds propulsion for trajectory control and splashdown zone selection |
| Cold chain | Not specified in public documentation; biological payload compatibility being demonstrated |
| Status | PHOENIX 1 first successful re-entry April 2025 |

**Significance:** The inflatable heat shield is lighter than ablative shields, potentially allowing more mass budget for insulation and biological sample conditioning during descent. The 100 kg downmass capacity is large relative to current Dragon-limited return mass. PHOENIX 2 with active trajectory control would allow splashdown near a recovery facility with cold-chain access — critical for live cell return.

---

### 4.3 SpacePharma

SpacePharma's miniaturised lab approach targets the full experiment cycle: ground preparation, launch, autonomous in-orbit operation, and return. Their declared biological scope includes organoid and stem-cell research, cancer modelling, and crystallisation. The NEXUS platform (flown 2017) demonstrated remote ground operation without crew. SpacePharma's return sample handling protocols are not publicly disclosed; they appear to rely on Dragon CRS return for sample recovery, using standard cold-pack protocols.

---

### 4.4 ISS Dragon / Cygnus Return Protocols

**SpaceX Dragon (CRS):** The primary sample return vehicle for ISS biology. Dragon's unpressurised trunk and pressurised capsule can accommodate biological samples. Cold stowage (GLACIER, MELFI units at 4°C, -20°C, -80°C, or -160°C) is available on-station for pre-return conditioning.

**Key return hardware:**
- **GLACIER (General Laboratory Active Cryogenic ISS Equipment Refrigerator):** 4°C to -160°C; used for biological sample storage and return.
- **MELFI (Minus Eighty Laboratory Freezer for ISS):** -80°C storage on-station; large capacity; samples transferred to GLACIER for Dragon return.
- **Cold Bags / Icepacks:** Short-duration (4°C) for samples that can tolerate brief thermal transients during transfer between capsule landing and ground lab.

**Recovery timeline:** Dragon splashes down in Pacific Ocean; recovery vessels retrieve within ~2–4 hours. Cold chain maintained if samples are in GLACIER units or adequate passive cold-packs. Live organoids require handling within 4–24 hours of splashdown depending on thermal sensitivity.

**Cygnus:** Destructive re-entry (no downmass capability). Biological samples must be fixed, frozen, or dried before departure.

---

## 5. Engineering Constraints Unique to Space

### 5.1 Launch Mass and Volume

| Parameter | Typical constraint | Engineering response |
|---|---|---|
| Launch mass | CubeLab 9U: <10 kg; full EXPRESS locker: <26 kg | Minimise liquid volume; use lightweight polymers; no glass |
| Volume | CubeLab 9U: ~1 litre usable; EXPRESS locker: ~22 litres | Cassette stacking; microfluidic-scale culture volumes |
| Payload density | Consumables (medium, reagents) contribute mass | Lyophilised or concentrated reagents reconstituted on orbit where possible |

### 5.2 Vibration and G-loads at Launch and Reentry

| Phase | Environment | Consequence for biology |
|---|---|---|
| Launch | ~3–5 g quasi-static; acoustic 140–145 dB; random vibration up to 30 g RMS (short duration) | Cell detachment from surfaces; bubble injection into medium; mechanical disruption of fragile organoids; gel matrix deformation |
| Ascent vibration | 20–2000 Hz random spectrum | Microfluidic channel deformation; valve opening/closing |
| On-orbit | ~10⁻⁶ g (true microgravity) | Desired state |
| Re-entry (Dragon) | ~3.5–5 g sustained; thermal shock | Cell viability risk; ice crystal formation if thawing occurs |

**Hardware responses:**
- Organoids should be in gel matrices (Matrigel, fibrin) or scaffolds that cushion vibration rather than free-floating in liquid during launch.
- Medium volume should be minimised during launch to reduce hydraulic hammer forces.
- Vent/pressure equalisation must prevent pressure differentials as altitude changes.
- Anti-vibration mounts within the cassette (elastomeric mounts) attenuate high-frequency energy.

### 5.3 No Free Liquid Surfaces — Surface Tension Dominates

In microgravity, surface tension is the dominant interfacial force. Liquid does not settle to the bottom of a container. **Critical consequences:**
- Liquid clings to walls and forms bridges between surfaces — an organoid submerged in a vial may be surrounded by culture medium clinging to the vial walls at arbitrary orientations.
- Bubbles do not rise. Gas generated by cell respiration or dissolved in medium forms and grows where it nucleates, potentially engulfing organoids and cutting off nutrient access.
- Pipetting/dispensing liquid requires capillary-driven or positive-displacement microfluidic mechanisms; gravity-assisted dispensing fails.
- Gas–liquid interfaces in any open bioreactor will have unpredictable geometry; sealed bioreactors are preferred.

**Engineering responses:**
- Closed, sealed cassettes with no free headspace.
- Microfluidic peristaltic pumps for medium exchange.
- Bubble traps using membrane vents (hydrophobic membranes that pass gas but not liquid) at specific geometric points.
- Pre-degassed medium to minimise dissolved gas that nucleates in microgravity.
- Hydrophilic coatings on internal surfaces to control wetting and prevent medium from dewetting from organoid surfaces.

### 5.4 Gas Exchange Without Buoyancy-Driven Convection

On Earth, O₂ and CO₂ exchange in a bioreactor is assisted by buoyancy: hot, CO₂-rich, less dense medium rises; cooler, oxygenated medium sinks. Convection is eliminated in microgravity. Gas exchange becomes purely diffusion-limited.

**Consequences:**
- Organoids in static culture: O₂ diffusion limit is ~150–200 µm radius, as on Earth, but CO₂ accumulation around the organoid is not flushed away. A necrotic core develops faster if metabolites accumulate locally.
- Silicone or PTFE gas-permeable membranes (as used in HARV on the ground) must be incorporated into the cassette wall adjacent to the culture space.
- Perfusion-based systems (NASA BCS model) avoid this by pumping fresh oxygenated medium past the organoid; this is the gold standard but adds mechanical complexity.
- Minimum viable approach: silicone membrane on cassette face, with medium in direct contact; diffusion alone sustains culture for organoids <400 µm diameter.

### 5.5 No Sedimentation

Organoids and cells do not settle in microgravity. This is beneficial for 3D culture (no compaction) but introduces a challenge:
- The extracellular matrix (ECM) also does not settle, so gel casting must be done in microgravity using fast-gelling formulations triggered by temperature or UV rather than relying on gravitational spreading.
- If scaffold-free, organoids will drift to the nearest wall due to random fluid motions — cassette geometry must ensure they do not contact and adhere to a wall where they cannot be recovered.
- In printing applications (BFF), the printed layer does not spread by gravity; surface tension controls layer shape. Bioinks must be formulated to be more viscous than ground-based inks to maintain shape without gravitational settling of cells within the bioink.

### 5.6 Crew Time Minimisation / Autonomy Requirement

ISS crew time is the scarcest and most expensive resource in orbital biology. Every experiment that requires crew interaction adds cost, scheduling dependencies, and execution risk.

**Standard of practice:** All current commercial biology hardware (CubeLab, ScienceTaxi, Kubik, BlackBox) requires zero or near-zero crew interaction after initial power connection. The hardware runs fully autonomously; medium exchange, fixation, imaging, and data logging are all automated and commanded from the ground.

**Engineering implications:**
- All valves must be actuated electrically or electrochemically; no manual intervention.
- Waste fluid and spent medium must be contained in sealed reservoirs without requiring disposal by crew.
- Failure modes must be benign (sealed, no spill) — a bioreactor leak that releases liquid into the ISS cabin is a critical safety event.
- Autonomous fixation: the cassette must be capable of terminating the experiment on command (injecting fixative, lowering temperature to 4°C, or deep-freezing) without crew.

### 5.7 Power and Thermal Budgets

| Platform | Power budget | Thermal dissipation | Temperature control |
|---|---|---|---|
| CubeLab 9U (Space Tango) | ~20–30 W average (estimated from interface ICD) | Convected via TangoLab structure | Heater + thermocouple per CubeLab unit |
| EXPRESS Rack locker | Up to 700 W available across rack; per-locker allocation negotiated | Liquid cooling available from rack | Active liquid cooling optional |
| KUBIK (ESA) | Not publicly specified; small incubator, est. 50–100 W | Passive + small heater | Peltier elements, 6–38°C |
| ScienceTaxi | Not public; designed for transport vehicle integration | Active (estimate: similar to KUBIK) | Automated |

**Key constraint:** Cell culture at 37°C in a volume that is also below ambient ISS temperature (nominally 21–23°C) requires a constant heater load. In a CubeLab, this is manageable (~5–10 W for a 1-litre insulated incubator). For the centrifuge in BioSpin, additional power is required for motor operation. The total budget must be negotiated with ISS/transport vehicle operators.

### 5.8 Radiation

Galactic cosmic radiation (GCR) and solar particle events (SPE) at ISS altitude (400 km, 51.6° inclination):
- Average dose: ~0.5–1.0 mSv/day (10–20× ground level).
- A 30-day mission delivers ~15–30 mSv.
- Dose is sufficient to cause single-strand DNA breaks, oxidative stress, and altered gene expression in dividing cells.
- Radiation confounds microgravity-specific results. The only control is to fly identical samples on a 1 g centrifuge (KUBIK centrifuge insert; BioSpin centrifuge) at the same altitude to isolate the microgravity effect from the radiation effect.

**Hardware response:** Lead shielding adds mass and is impractical for small platforms. Current approach is: (1) accept radiation as a confound and use ground controls at 1 g; or (2) use the in-flight centrifuge as a 1 g radiation control.

---

## 6. Synthesis — What Microgravity Changes for Organoid Culture, and the Hardware Implications

This section is the core engineering translation. For each physical phenomenon changed by microgravity, it traces the consequence for organoid biology and then derives the hardware requirement.

### 6.1 Media / Gas Exchange

| What changes | Biological consequence | Hardware implication |
|---|---|---|
| Convection eliminated | O₂ and CO₂ gradients build up around organoid; necrotic core risk for >400 µm constructs in static culture | Gas-permeable membrane (silicone/PTFE) integral to cassette wall; or perfusion pump delivering fresh oxygenated medium past organoid |
| Diffusion becomes sole transport mechanism | Nutrient depletion zones form; metabolite accumulation (lactate, NH₃) inhibit growth | Perfusion flow rate must compensate; minimum flow rate must be engineered from metabolic model of organoid size and cell density |
| CO₂ does not rise to headspace | pH drift in bicarbonate-buffered medium | Either HEPES buffer (pH-independent of CO₂) or sealed CO₂ gas reservoir within cassette; or continuous CO₂ partial pressure control via membrane sensor |
| Medium surface tension prevents gravity-driven flow | Peristaltic or syringe pump required for any medium movement | Miniature peristaltic pump (e.g., Bartels or equivalent); pump head must be bubble-tolerant |

**Design rule:** For organoids >300 µm diameter and culture durations >7 days, perfusion is not optional — it is necessary for viability. The sealed static-vial approach used in the 2024 brain organoid missions (30 days, no exchange) works but introduces nutrient-stress as a confound and limits organoid size.

### 6.2 Mixing and Shear

| What changes | Biological consequence | Hardware implication |
|---|---|---|
| Buoyancy-driven convection absent | No natural mixing of medium; gradients persist locally | Gentle active mixing (e.g., oscillating flow, slow orbital rotation of cassette) preferred |
| Any mechanical mixing causes shear | Organoids are shear-sensitive at >1 dyne/cm²; excessive shear disrupts surface cells | Any pump or mixing element must be characterised for shear at organoid surfaces; bubble-column mixing is absent (no rising bubbles) |
| Bubble formation from respiration or dissolved gas | Bubbles nucleate on organoid surfaces, displace medium contact, and mechanically disrupt cells | Pre-degas all medium; use bubble trap membranes; design flow path to route bubbles to vent |

**Design rule:** Oscillatory flow (low-amplitude, low-frequency) or slow rotation of the cassette provides mixing without sedimentation and with minimum shear. Avoid turbulent mixing; avoid bubble injection.

### 6.3 Sedimentation

| What changes | Biological consequence | Hardware implication |
|---|---|---|
| Organoids do not settle | No gravity-driven compaction; more spherical growth; ECM not compressed | Positive effect — no scaffold needed; scaffold-free culture is the natural mode in microgravity |
| Cells in suspension do not sediment | Initial aggregation to form spheroid requires time without gravitational assistance | Culture must start as pre-formed organoid (not single-cell suspension in orbit); or use brief centrifuge to initiate aggregation |
| Dense particles (beads, debris) remain in suspension | Contamination particles or dead cells persist in medium rather than falling away | Higher importance of medium exchange with filtration to remove debris |

**Design rule:** Launch organoids as pre-formed structures (day 20–30 post-induction), not as single-cell suspensions. Single-cell suspension culture in orbit to form organoids de novo is technically feasible (microgravity actually aids 3D aggregation) but requires extended culture time and careful medium exchange. If the goal is to study mature organoid behaviour, arrive at the station with the organoid already formed.

### 6.4 Matrix vs Scaffold-Free

| What changes | Biological consequence | Hardware implication |
|---|---|---|
| No gravitational compression on ECM | Hydrogels (Matrigel, collagen) swell and distribute uniformly; no gravitational compaction; gel architecture is more isotropic | Gels can be used in microgravity without the gravitational settling that creates density gradients at 1 g |
| Gel casting in microgravity | Liquid gel must be introduced and allowed to set without gravity driving it to the bottom | Trigger gelation by temperature (Matrigel, fibrin) or photo-crosslinking (GelMA) after organoid positioning; cassette must allow temperature step or UV exposure |
| Scaffold-free spheroids possible | Microgravity allows scaffold-free spheroid to maintain shape without external support | Preferred for drug testing (no scaffold interference); requires cassette to prevent wall contact (non-adherent coating, spacer geometry) |

**Design rule:** If using hydrogel embedding, use fast-gelling formulations triggered post-transfer (temperature or UV), not gravity-settled gels. Design the cassette with non-adherent (PEG-coated or ultra-low-attachment surface) walls to prevent organoid adhesion to the cassette interior.

### 6.5 Imaging

| What changes | Biological consequence | Hardware implication |
|---|---|---|
| Organoids float at arbitrary positions | Cannot rely on organoid settling to bottom of well as on Earth | Fixed position in gel or constrained in micro-well; or active tracking microscopy |
| Vibration (from ISS fans, docking) | Motion artefact in long-exposure fluorescence imaging | Vibration isolation mount; short-exposure imaging; correlation imaging algorithms |
| Crew cannot operate standard microscopes | Only autonomous imaging possible | On-board brightfield or fluorescence camera, pre-programmed imaging schedules, or return sample for ground imaging |
| High-power objectives not practical in orbit | Limited working distance, tight packaging | Wide-field fluorescence preferred over confocal; FLUMIAS-DEA demonstrates SIM is feasible but complex |

**Design rule:** For quality control of organoids on orbit, integrate a miniature wide-field fluorescence camera (e.g., a custom cell-phone-sensor-based system) at a fixed focal plane with pre-loaded fluorescence indicators (metabolic dye, live/dead stain). Full confocal imaging on return. The KEyence system on ISS requires crew operation and is not available for cassette-internal imaging.

### 6.6 Sample Handling

| What changes | Biological consequence | Hardware implication |
|---|---|---|
| No free liquid — dispensing requires active pumping | Cannot pipette by gravity | All fluid transfers via pumps or gas-pressure displacement; volume metered by pump speed and time |
| Containment is absolute | A spill of biological material in the ISS cabin is a safety and contamination emergency | Double containment mandatory; primary container (vial/cassette) + secondary containment (sealed outer bag or rigid shell) |
| Return live biology requires cold chain from capsule to ground lab | Cell death during recovery if cold chain breaks | Pre-validated cold-chain protocol; GLACIER/MELFI at 4°C on-station; passive cold pack for dragon descent (2–4 h); ground transport at 4°C within 24 h |
| Fixation must be autonomous | Science team is on the ground; crew cannot perform wet chemistry | Automated fixative injection (via solenoid valve on command) or autonomous temperature reduction to 4°C or -80°C |

**Design rule:** All liquid handling in the cassette must be autonomous. Design for double containment. All return samples should be fixed, frozen, or placed at 4°C prior to Dragon undocking. Live return is possible (demonstrated with cardiac tissue, May 2024) but requires ice integration and rapid ground processing (<4 hours post-splashdown).

---

## 7. Source List

1. Wuest SL et al. "Fluid Dynamics Appearing during Simulated Microgravity Using Random Positioning Machines." *PLOS ONE* (2017). https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5279744/

2. Kohn FM et al. "Fluid and Bubble Flow Detach Adherent Cancer Cells to Form Spheroids on a Random Positioning Machine." *Cells* 12(22):2665 (2023). https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10670461/

3. Warnke E et al. "Simulated Microgravity: Critical Review on the Use of Random Positioning Machines for Mammalian Cell Culture." *BioMed Research International* (2014). https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4310317/

4. Wikipedia. "Random positioning machine." https://en.wikipedia.org/wiki/Random_positioning_machine

5. Parfenov VA et al. "Magnetic levitational bioassembly of 3D tissue construct in space." *Science Advances* 6(29):eaba4174 (2020). https://pmc.ncbi.nlm.nih.gov/articles/PMC7363443/

6. Yuri GmbH. "Yuri acquires industry-leading RPM machine from Airbus." https://yurigravity.com/post/yuri-acquires-industry-leading-rpm-machine-from-airbus

7. Yuri GmbH. "Platform." https://yurigravity.com/platform

8. Yuri GmbH. "Yuri launches ScienceTaxi BioSpin to the ISS in the commercial HUMB mission." https://yurigravity.com/post/yuri-launches-sciencetaxi-biospin-to-the-iss-in-the-commercial-humb-mission

9. Sierra Space. "Sierra Space Strengthens Partnership with Yuri to Advance Space-Based Medical Research." (March 2025). https://www.sierraspace.com/press-releases/sierra-space-strengthens-partnership-with-yuri-to-advance-space-based-medical-research/

10. Luxembourg Space Agency. "Yuri's BioSpin mission on the ISS showcases Luxembourg innovation!" (2026). https://space-agency.public.lu/en/news-events/news/2026/yuris-biospin-mission-on-the-iss-showcases-luxembourg-innovation.html

11. ISS National Lab. "BioFabrication Facility." https://issnationallab.org/facilities/biofabrication-facility/

12. Redwire Space. "Redwire Launching Upgraded 3D Bioprinter to Space Station." (2022). https://rdw.com/newsroom/redwire-launching-upgraded-3d-bioprinter-to-space-station-to-investigate-new-treatment-to-aid-military-service-members-expands-crop-production-research-and-materials-testing-on-orbit/

13. Redwire Space. "Redwire Pioneering Biopharma Production in Space by Successfully Bioprinting Live Human Heart Tissue." (2024). https://ir.redwirespace.com/news-events/press-releases/detail/119/redwire-pioneering-biopharma-production-in-space-by

14. ISS National Lab. "TangoLab." https://issnationallab.org/facilities/tangolab/

15. Space Tango. "CubeLab." https://spacetango.com/cubelab/

16. Space Tango. "Space Tango Advances Neurological Disease Research in Microgravity." https://spacetango.com/latest/space-tango-advances-neurological-disease-research-in-microgravity/

17. NASA Ames. "Bioculture System." https://www.nasa.gov/ames/space-biosciences/cell-science/bioculture-system/

18. ISS National Lab. "Bioculture System." https://issnationallab.org/facilities/bioculture-system/

19. ISS National Lab. "Advanced Space Experiment Processor (ADSEP)." https://issnationallab.org/facilities/advanced-space-experiment-processor/

20. COMAT / ESA. "Kubik." https://comat.space/en/p/explorations-and-sciences/en-kubik/

21. ESA BSGN. "Bioreactor Express Service." https://bsgn.esa.int/service/bioreactor-express-service/

22. Factories in Space. "Kayser Italia / Bioreactor Express." https://www.factoriesinspace.com/kayser-italia

23. ISS National Lab. "Nanoracks Blackbox." https://issnationallab.org/facilities/nanoracks-blackbox/

24. Voyager Technologies / Nanoracks. "Bringing Nanoracks' BlackBox to Life with MIT." https://voyagertechnologies.com/insights/bringing-nanoracks-blackbox-to-life-with-mit-space-exploration-initiative-rides/

25. Factories in Space. "SpacePharma." https://www.factoriesinspace.com/spacepharma

26. SpacePharma. "Applications." https://www.spacepharma.health/applications

27. Shelhamer M et al. "Effects of microgravity on human iPSC-derived neural organoids on the International Space Station." *Stem Cells Translational Medicine* 13(12):1186 (2024); PMC11631337. https://academic.oup.com/stcltm/article/13/12/1186/7833382

28. biorxiv. "Microgravity enhances the viability of midbrain organoids on the International Space Station." Preprint (2026). https://www.biorxiv.org/content/10.64898/2026.05.04.722620v1.full.pdf

29. ISS National Lab. "Neural Organoids in Space: Unlocking the Mysteries of the Brain in Microgravity." https://issnationallab.org/iss360/brain-cell-research-published-marotta/

30. Scripps Research. "Brain cells remain healthy after a month on the ISS, but mature faster." (December 2024). https://www.scripps.edu/news-and-events/press-room/2024/20241216-loring-stem-cells.html

31. ISS National Lab. "NASA Award Supports Continued Brain Organoid Research on Upcoming ISS Stem Cell Lab." https://issnationallab.org/iss360/nasa-award-ucsd-space-tango-stem-cell-lab-onstation/

32. CNES. "First cerebral organoids successfully grown in space." https://cnes.fr/en/news/first-cerebral-organoids-successfully-grown-space

33. Hwang H et al. "Space microgravity improves proliferation of human iPSC-derived cardiomyocytes." *Stem Cell Reports* 19(10):1453 (2022); PMC9561632. https://www.cell.com/stem-cell-reports/fulltext/S2213-6711(22)00416-7

34. ISS National Lab. "Mission to ISS Launches Research on Brain Organoids, Heart Muscle Atrophy." (SpaceX CRS-31). https://issnationallab.org/press-releases/spacex-crs31-research/

35. Lifespan.io. "Heart Organoids Flown to Space Show Signs of Dysfunction." https://lifespan.io/heart-organoids-flown-to-space-show-signs-of-dysfunction/

36. NASA. "Tissue Chips Accurately Model Organs in Space." https://www.nasa.gov/image-article/tissue-chips-accurately-model-organs-in-space/

37. Baehr CM et al. "Validation of Human Skeletal Muscle Tissue Chip Autonomous Platform to Model Age-Related Muscle Wasting in Microgravity." *npj Microgravity* (2023); PMC10081368. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10081368/

38. Colón-Mercado JM et al. "Human skeletal muscle tissue chip autonomous payload reveals changes in fiber type and metabolic gene expression due to spaceflight." *npj Microgravity* (2023); PMC10504373. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10504373/

39. NCATS / NIH. "Tissue Chips in Space." https://ncats.nih.gov/research/research-activities/tissue-chip/projects/space

40. Masuda S et al. "Effects of simulated microgravity on colorectal cancer organoids growth and drug response." *Scientific Reports* (2024). https://www.nature.com/articles/s41598-024-76737-8

41. Hemmersbach R et al. "Recent studies of the effects of microgravity on cancer cells and the development of 3D multicellular cancer spheroids." *Stem Cells Translational Medicine* 14(3):szaf008 (2025); PMC11914975. https://pmc.ncbi.nlm.nih.gov/articles/PMC11914975/

42. Varda Space Industries. "W-1 Mission." https://www.varda.com/mission/w-1

43. Improved Pharma. "Mission success: Ritonavir crystallization experiments conducted in space worked flawlessly." https://improvedpharma.com/mission-success-ritonavir-crystallization-experiments-conducted-space-worked-flawlessly/

44. CNBC. "Space startup Varda raises $187 million in funding to make drugs in orbit." (July 2025). https://www.cnbc.com/2025/07/10/space-startup-varda-medicine-orbit.html

45. ATMOS Space Cargo. "PHOENIX 1 — Mission Completion Update." (April 2025). https://atmos-space-cargo.com/milestones/mission-completion-update/

46. Gunter's Space Page. "Phoenix 1 (ATMOS)." https://space.skyrocket.de/doc_sdat/phoenix-1_atmos.htm

47. JAXA. "JAXA High Quality Protein Crystal Growth Project." https://humans-in-space.jaxa.jp/en/biz-lab/news/detail/001417.html

48. NASA. "Creating New and Better Drugs with Protein Crystal Growth Experiments." https://www.nasa.gov/missions/station/iss-research/creating-new-and-better-drugs-with-protein-crystal-growth-experiments/

49. Frontiers in Space Technologies. "Development of an inexpensive 3D clinostat and comparison with other microgravity simulators." (2022). https://www.frontiersin.org/journals/space-technologies/articles/10.3389/frspt.2022.1032610/full

50. Ulbrich C et al. "Real-Time 3D High-Resolution Microscopy of Human Cells on the ISS." *Int J Mol Sci* 20(8):2033 (2019). https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6514950/

51. ISS National Lab. "KEyence Research MIcroscope Testbed." https://issnationallab.org/facilities/keyence-research-microscope-testbed/

52. Nature npj Microgravity. "A new strategy for constructing microgravity culture environment via gas-liquid coupled oscillatory flow field." (2025). https://www.nature.com/articles/s41526-025-00546-0

53. Drug Discovery News. "3D bioprinting tissues in space to heal people on Earth." https://www.drugdiscoverynews.com/3d-bioprinting-tissues-in-space-to-heal-people-on-earth-1-15845

54. ISS National Lab. "Tissue Engineering and Biomanufacturing Research Opportunity (NLRA-2024-1)." https://issnationallab.org/nlra-2024-1-tissue-engineering-biomanufacturing/

55. Brainfacts.org. "Space-traveled Organoids Help Scientists Study Neurodegeneration." (April 2025). https://www.brainfacts.org/in-the-lab/tools-and-techniques/2025/space-traveled-organoids-help-scientists-study-neurodegeneration-043025

---

*Report compiled July 2026. All programme statuses are as of July 2026 based on publicly available sources. Proprietary hardware specifications (e.g., exact ScienceTaxi dimensions, BFF print resolution) are not publicly disclosed; values marked "estimated" are engineering estimates from available analogues.*
