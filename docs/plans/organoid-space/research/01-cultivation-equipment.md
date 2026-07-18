# Organoid Cultivation Equipment: Hardware Research Report

**Prepared for:** Yuri Space-Biotech — Hardware Design Programme  
**Purpose:** Engineering-level survey of existing organoid cultivation hardware to inform new hardware design  
**Scope:** Formation methods, bioreactors, environment control, consumables (razor-and-blade layer)  
**Date:** July 2026

---

## Table of Contents

1. [Formation Methods and Their Hardware](#1-formation-methods-and-their-hardware)
2. [Bioreactors for Organoid Culture](#2-bioreactors-for-organoid-culture)
3. [Incubation and Environment Control](#3-incubation-and-environment-control)
4. [Consumables: The Razor-and-Blade Layer](#4-consumables-the-razor-and-blade-layer)
5. [Physics of Why Each Method Works](#5-physics-of-why-each-method-works)
6. [Space-Relevance Analysis](#6-space-relevance-analysis)
7. [Source List](#7-source-list)

---

## 1. Formation Methods and Their Hardware

Organoid formation requires a method for preventing 2D adhesion while providing a 3D mechanical scaffold or suspension environment. Six primary approaches exist, each implemented by distinct hardware.

### 1.1 Matrigel / Basement Membrane Extract (BME) Embedding

**Biological method:** Dissociated cells or crypt fragments are resuspended in a cold (4°C) gel consisting of laminin (~60%), collagen IV (~30%), entactin (~8%), and heparan-sulphate proteoglycans, then domed or sandwiched on a surface. Gelation is thermal (liquid at 4°C, solid at 37°C). The gel provides both the mechanical scaffold and growth-factor signalling.

**Key hardware:** pipettes, cold blocks, pre-chilled plates. The "equipment" is largely the consumable matrix itself.

| Attribute | Detail |
|---|---|
| Form factor | Micro-volumes (10–50 µL domes) dispensed into standard well plates |
| Gelation trigger | Temperature shift 4°C → 37°C, gels within ~10 min |
| Vessel used | 6-well, 24-well, or 96-well TC-treated plates |
| Key subsystem | Cold-chain handling; pipettes pre-chilled on ice |
| Throughput | 1 dome per pipetting step; 6–96 domes per plate |
| Limitation | Murine tumour-derived (xenogeneic); variable lot-to-lot composition; undefined growth factors; requires strict cold-chain |

**Corning Matrigel Product Family (primary commercial source):**

| Catalogue # | Formulation | Protein Concentration | Notes |
|---|---|---|---|
| 354230 | Standard GFR, LDEV-free | 7–12 mg/mL | General use |
| 356231 | GFR, Phenol Red-free, LDEV-free | 7–12 mg/mL | Fluorescence imaging |
| 356255 | Organoid Culture, Phenol Red-free | 7–12 mg/mL | Lot-qualified for elastic modulus; organoid-verified |
| 354262 | HC, Phenol Red-free, LDEV-free | 18–22 mg/mL | High-stiffness domes |
| 354263 | HC, GFR, LDEV-free | 18–22 mg/mL | Stiffest matrix; minimal growth factors |

**Competing / alternative BME products:**
- **Cultrex UltiMatrix (R&D Systems / Bio-Techne, BME001-05):** Elevated entactin/nidogen; higher storage modulus; greater purity. Drop-in Matrigel replacement.
- **Trevigen Cultrex BME:** Alternative EHS-derived matrix.

---

### 1.2 Scaffold-Free Suspension (Spheroid Method)

**Biological method:** Cells are seeded in suspension on non-adhesive surfaces; gravity and cell–cell adhesion drive self-aggregation. No exogenous ECM required. Suitable for tumour spheroids and some epithelial organoids.

**Hardware:** Ultra-Low Attachment (ULA) plates or U-bottom round-well plates.

**Corning Spheroid Microplates (primary commercial platform):**

| Attribute | Cat # / Model | Detail |
|---|---|---|
| 96-well ULA | 4515 (black/clear), 4520 (white/clear) | Round-bottom, ULA surface, opaque sidewalls for cross-talk reduction |
| 384-well ULA | 3830, 3830BC, 4516 | 384-well format; imaging-compatible flat clear bottom |
| 1536-well ULA | 4527 | High-throughput screening; 1536 microwells |
| Well volume | 96-well: 300 µL max | — |
| Footprint | ANSI/SBS standard | Compatible with all liquid handlers and readers |
| ULA mechanism | Covalently bonded hydrophilic coating | Prevents integrin-mediated cell attachment |
| Key limitation | Spheroid size cannot be precisely controlled without seeding optimisation; no ECM mechanical cues |

---

### 1.3 Hanging-Drop Plates

**Biological method:** A droplet (25–40 µL) is pipetted into an inverted well. Gravity draws cells to the drop's lowest point; surface tension retains the drop. Cell–cell contact drives aggregation without any surface contact.

**Commercial platforms:**

| Product | Vendor | Format | Drop Volume | Notes |
|---|---|---|---|---|
| 3D Petri Dish (hanging drop geometry) | Sigma-Aldrich / MicroTissues | 96-well equivalent | 25–40 µL | Uses moulded agarose; cells settle into U-bottom microwell (not true hanging drop but similar physics) |
| Custom hanging-drop plates | Research groups | 384-well adapted | 25 µL per well | Methocel (0.24%) + Matrigel (1.5%) formulation; 3000 RPTEC cells per drop |

**Key hardware requirement:** Inverted incubation is not needed if using inverted plate format; humidity chamber critical to prevent evaporation from exposed drops.

**Key limitation:** Manual handling; no easy media exchange without disturbing drop; low throughput without automation; evaporation risk at standard lab humidity.

---

### 1.4 Microwell / AggreWell Plates (Forced Aggregation)

**Biological method:** A centrifugation step forces thousands of cells into individual microwells simultaneously, creating uniform-size embryoid bodies or pre-organoids. Each microwell produces one aggregate of controlled size.

**STEMCELL Technologies AggreWell Family:**

| Model | Microwell Diameter | Microwells Per Well | Plate Format | Organoids Per Plate | Seeding Density |
|---|---|---|---|---|---|
| AggreWell 400 | 400 µm | ~1,200 per well | 24-well or 6-well | Up to ~7,000 per well (42,000/plate) | 50–20,000 cells per organoid |
| AggreWell 800 | 800 µm | ~300 per well | 24-well or 6-well | Up to ~1,800 per well | 200–20,000 cells per organoid |
| AggreWell HT | 900 µm | custom array | 24-well | Similar to 800 | High-throughput variant |

**Key subsystems:** Centrifuge (400–800 × g, 3 min); AggreWell Rinsing Solution to pre-treat microwells (prevents non-specific adhesion); standard CO2 incubator.

**Key limitation:** Centrifugation is a g-dependent step — incompatible with microgravity without redesign. Microwell geometry constrains organoid shape.

---

### 1.5 Air-Liquid Interface (ALI) Culture

**Biological method:** Epithelial cells (airway, intestinal) are seeded on a permeable membrane support. Once confluent, apical medium is removed; cells establish apical–basal polarity with apical surface exposed to humidified air. Differentiation into pseudostratified epithelium or secretory cell types occurs over 4–6 weeks.

**Primary hardware: Transwell Inserts (Corning Costar)**

| Format | Insert Diameter | Membrane | Pore Size | Well Plate | Application |
|---|---|---|---|---|---|
| 3470 | 6.5 mm | Polyester (PET) | 0.4 µm | 24-well | Airway ALI, small-scale |
| 3460 | 12 mm | Polyester (PET) | 0.4 µm | 12-well | Intestinal ALI |
| 3450 | 24 mm | Polyester (PET) | 0.4 µm | 6-well | Respiratory tissue |
| 3401 | 12 mm | Polycarbonate (PC) | 0.4 µm | 12-well | TEER monitoring |
| 7424 | 100 cm² | PET | 0.4 µm | Large format tray | Scalable epithelium |

**Recommended pre-coating:** Collagen I at 30 µg/mL, 1 hour at 37°C before cell seeding. TEER measurement (trans-epithelial electrical resistance) is the functional QC metric for barrier formation.

**Key limitation:** Static method; no flow; relies entirely on diffusion for basal nutrient delivery; differentiation timeline (4–6 weeks) is long; gravity-dependent apical/basal orientation is disrupted in microgravity.

---

### 1.6 ECM Alternatives (Xeno-Free / Defined Matrices)

| Product | Vendor | Composition | Key Properties | Organoid Types Validated |
|---|---|---|---|---|
| VitroGel ORGANOID-1/2/3/4 | TheWell Bioscience | Xeno-free polysaccharide hydrogel with bio-functional ligands | Room-temperature stable; no cold chain; tunable stiffness; 4 formulations | Patient-derived intestinal, breast, pancreatic |
| iMatrix-511 (MACSmatrix Laminin-511) | Miltenyi Biotec / Iwai North America / Takara Bio | Recombinant laminin-511 E8 fragment; CHO-produced | 150 kDa; stronger integrin-α6β1 binding than full-length laminin; GMP grade available; 0.5 mg/mL | iPSC maintenance, intestinal monolayers |
| Cultrex UltiMatrix RGF BME | R&D Systems | EHS-derived; elevated entactin; >8.6 mg/mL protein | Higher stiffness than standard Matrigel | Intestinal, colonoid |
| Fibrin-laminin hydrogel | Research / Custom | Fibrinogen + thrombin + laminin | Animal-derived but less undefined than Matrigel; GFR possible | Small intestinal, pancreatic, liver ASC-derived |
| Alginate hydrogel | Research / Custom | Sodium alginate; Ca²⁺ crosslinked | Fully synthetic; no biological activity without functionalisation; reversible gelation | PSC-derived intestinal |
| PEG hydrogels | Multiple (TheWell, research) | Poly(ethylene glycol); RGD peptide-functionalised | Fully defined; tuneable mechanics (0.1–50 kPa); no xenogeneic content | Cardiac, intestinal, lung |
| Silk fibroin hydrogel | Research / Custom | Bombyx mori silk protein | Slow gelation; good mechanics; cartilage organoids | Cartilage |

**Space relevance note:** Xeno-free, defined matrices (PEG, iMatrix-511, VitroGel) are critical for space hardware because: (1) cold-chain requirements for Matrigel are operationally difficult in orbit, (2) lot variability undermines reproducibility in isolated experiments, (3) defined matrices can be lyophilised for launch.

---

## 2. Bioreactors for Organoid Culture

### 2.1 Spinner Flasks (Stirred-Tank, Passive Mixing)

**Biological method:** Organoids are cultured in free suspension in a stirred vessel. A magnetic impeller or paddle stirs the media, providing convective nutrient delivery and preventing sedimentation. Shear stress is moderate.

**Commercial products:**

| Make + Model | Vendor | Volume | Dimensions | Impeller | Throughput | Key Notes |
|---|---|---|---|---|---|---|
| 3152 Disposable Spinner Flask | Corning | 125 mL (75 mL working vol.) | 63.5 mm dia × 145 mm H | Integrated magnetic paddle | ~1,000s of organoids per flask | Polystyrene; gamma-irradiated; 2 angled sidearms for gas exchange; single use |
| 4500-125 ProCulture Glass Spinner | Corning | 125 mL | ~130 mm H | Stretch impeller; borosilicate glass | same | Autoclavable; baffled for enhanced aeration; reusable |
| 4500-250 ProCulture Glass Spinner | Corning | 250 mL | ~185 mm H × 80 mm dia | Stretch impeller | same (larger scale) | Same family; bench or incubator shelf |
| Disposable Spinner 250 mL | Corning | 250 mL (150 mL working) | similar to 125 proportionally | Integrated magnetic paddle | — | Polystyrene; sterile; no cleaning required |

**Typical RPM for organoids:** 20–85 rpm depending on application (lower for retinal, higher for liver).  
**Shear stress:** Moderate (higher than RWV); not quantified for all conditions — CFD suggests 0.001–0.1 Pa range at standard RPM.  
**Power:** Driven by external magnetic stir plate; no dedicated electronics.  
**Key limitation:** Shear may damage fragile organoid types (cerebral, retinal); open sidearms require gas-exchange management; gravity-dependent sedimentation if RPM too low.

---

### 2.2 Miniaturised Spinning Bioreactors (Multi-Well, Incubator-Internal)

#### 2.2.1 SpinΩ / Spin∞ (Open-Source, DIY)

**Biological method:** Same as spinner flask but miniaturised to 12-well plate format; each well contains a small impeller paddle driven by a shared gear train.

| Attribute | SpinΩ / Spin∞ |
|---|---|
| Make | Open-source (Lancaster Lab / Quadrato Lab / Vanderbilt CDB) |
| Vessel format | 12-well culture plate; 3–4 mL media per well vs. 75–100 mL in spinner |
| Motor | DC 12V, 100 RPM gear motor (Greartisan B0721T1PXQ); rated to 70°C, 90% RH |
| Materials | ULTEM 1010 resin (autoclavable); stainless steel M3 hardware; PTFE paddles; acrylic base plate |
| Control | Raspberry Pi touchscreen + motor controller outside incubator |
| Cost to build | ~$2,500 total hardware |
| Sterilisation | Majority of components autoclavable |
| Culture duration | >200 days without motor replacement (Spin∞ iteration) |
| Files | OSF repository doi:10.17605/OSF.IO/FV9T4; CC-BY-SA 4.0 |
| Throughput | 12 independent wells per unit; multiple units per incubator |
| Key limitation | Gear RPM output not specified; custom build required; no commercial support |

#### 2.2.2 RPMotion (Commercial, 2024)

**Biological method:** Rotating tube bioreactor; 50 mL Falcon tubes in custom-designed rotating holders driven by DC motors. Stainless-steel R4 rotor geometry optimised by CFD to produce homogeneous flow with minimal dead zones.

| Attribute | RPMotion |
|---|---|
| Make + vendor | RPMotion / BioSPX |
| Vessel | Standard 50 mL flat-bottom Falcon tube |
| Lid design | Custom 3D-printed lid with 2× 0.22 µm sterile filters |
| Volume per tube | 5 mL initial; up to ~40 mL at later timepoints |
| Parallel cultures | 4 tubes per device; up to 32 devices per incubator |
| RPM range | 40–100 rpm (organoid-type specific) |
| Control | Arduino Uno + LCD screen; control unit outside incubator |
| Motor | 12V DC brushless |
| Throughput | 15–20 million cells per tube per 2 weeks |
| Fold-expansion vs. static | Liver: 5.2×; Intestinal: 3×; Pancreatic: 4× (published 2024) |
| Power | Low (12V DC, brushless motor) |
| Cost band | Research-grade; quote-on-request |
| Key limitation | Tube geometry limits imaging; no integrated environment sensors; Falcon-tube format not SBS-standard |

---

### 2.3 Rotating Wall Vessels (RWV / HARV / STLV)

**Biological method:** The vessel rotates about a horizontal axis, causing the fluid column to rotate as a solid body. Organoids fall through the rotating fluid in a constant state of "falling" — sedimenting downward while the vessel rotation brings them back up. Net result: near-zero effective gravitational settling; extremely low hydrodynamic shear (0.001–0.01 Pa). Gas exchange via a central or membrane-based oxygenator.

**Space connection:** RWVs were originally developed by NASA to simulate aspects of microgravity on the ground; their near-weightless organoid suspension is the closest terrestrial analogue to on-orbit conditions.

**Synthecon RCCS Product Family (primary commercial source):**

| Model | Type | Vessel Volume | Gas Exchange | Vessels/Unit | Notes |
|---|---|---|---|---|---|
| RCCS-1 | Autoclavable base, 1 station | HARV: 10 or 50 mL; STLV: 55 mL | HARV: membrane on face; STLV: central oxygenator | 1 | Adjustable RPM; bench top |
| RCCS-4H / 4HD | 4-station autoclavable | Same vessel options | Same | 4 | Expanded throughput; 4 independent rotators |
| RCCS4D / 4DQ | 4-station, disposable vessels | Disposable HARV: 10 mL or 50 mL | Membrane gas exchange | 4 | Single-use; gamma-sterilised; 4-pack vessels |
| RCCS8D / 8DQ | 8-station, disposable | 10 or 50 mL | Membrane | 8 | Highest throughput; disposable |
| RCCS-1SC / 2SC / 4SC | Stem cell variants | Adapted for stem cell media | — | 1, 2, or 4 | Optimised for suspension stem cell culture |
| RCCMAX / RCCMAX DUAL | Perfusion bioreactor | Larger volume | Integrated perfusion | 1 or 2 | Continuous media exchange |

**Vessel form factor detail (HARV vs. STLV):**

| Parameter | HARV | STLV |
|---|---|---|
| Shape | Disc/cylinder; large flat face | Cylinder; axial length > diameter |
| Gas exchange | Permeable silicone membrane on flat face | Central hollow-fibre or silicone tube oxygenator |
| Volume | 4, 10, 35, 50 mL | 55, 500 mL (larger scale) |
| Aeration | Bubble-free (membrane diffusion) | Bubble-free (internal oxygenator) |
| Bubble risk | Low (HARV major advantage) | Minimal with oxygenator |
| Organoid suitability | Standard for intestinal, kidney, liver, retinal | Scale-up (>50 mL) |

**Typical operating parameters:**
- RPM: 20–27 rpm adjusted as organoids grow (increasing mass increases terminal velocity; RPM must increase to maintain orbit)  
- Shear stress: 0.001–0.01 Pa (order of magnitude below stirred tanks)  
- Media composition / gas: Standard CO2-equilibrated media; gas exchange through membrane only  
- Maturation improvement: Organoids in RWV reached same maturation level in 25 days vs. 32 days in static culture

**Competitive alternatives to Synthecon:**
- **JTEC CellPet 3-D Ips (Japan):** Commercial RWV system; used for intestinal organoids in published studies.

**Key limitations:** RPM must be continuously adjusted as organoids grow (manual or programmed); large liquid volumes relative to organoid number; bench-top footprint is significant; not inherently sealed for closed-system processing.

---

### 2.4 Orbital Shakers (In-Incubator Agitation)

**Biological method:** Culture plates placed on an orbital shaker inside a standard CO2 incubator. Circular plate motion creates gentle convective mixing without impeller shear. Cerebral organoids commonly cultured at 60–90 rpm in 6-well plates.

| Make + Model | Vendor | Orbital Throw Options | RPM Range | Incubator Footprint | Notes |
|---|---|---|---|---|---|
| Multitron Cell | INFORS HT | 3 mm, 25 mm, 50 mm, or adjustable (12.5–50 mm) | 10–400 rpm | Large-capacity, stackable | Standard for cerebral organoids; accommodates microplates to flasks |
| Standard orbital shaker | Many (Thermo, Eppendorf, etc.) | Fixed throw (typically 19 or 25 mm) | 10–300 rpm | Per-unit: small to medium | Used when incubator shaker unavailable |

**Typical usage:** 6-well ULA plates at 90 rpm for cerebral organoids (Lancaster protocol); 12-well plates at 60 rpm in SpinΩ configuration.  
**Key limitation:** Gravity-dependent flow; wave amplitude scales with g; meaningless in true microgravity. Heat dissipation from motor in incubator must be verified.

---

### 2.5 CERO 3D Bioreactor (Tube Rotator, Commercial)

| Attribute | CERO 3D |
|---|---|
| Make + vendor | CellMicrosystems |
| Vessel format | Up to ~50 mL culture tubes; also CERO-plates (96-well, U-bottom, ULA) |
| Rotation | Bi-directional, low-shear rotation |
| Environment control | CO2, temperature, and pH regulation |
| Throughput | Thousands of organoids per tube |
| Imaging compatibility | CERO-plates compatible with standard HCS imagers |
| Contact | +1 252.285.9842 |
| Key limitation | Specific RPM and dimensional specs not publicly disclosed; quote-required |

---

### 2.6 Gas-Permeable Flask Systems (Wilson Wolf G-REX)

**Biological method:** Cells settle to the bottom of a silicone-bottom flask; oxygen diffuses upward through the membrane from a humidified gas environment below. Nutrients are delivered through a large volume of media above the cells. No mixing required for O2 delivery. Primarily used for T-cell expansion but applicable to adherent organoid precursor expansion.

| Model | Membrane Area | Media Volume | Scale | Notes |
|---|---|---|---|---|
| G-Rex 10 | 10 cm² | 8–40 mL | Research | 1M → 40–80M cells in 12 days; 2 media exchanges |
| G-Rex 100 | 10 cm² | 40 mL | Scale-up | 10 cm² membrane, low media per cm² |
| G-Rex 100M | 10 cm² | 100 mL | Clinical | Larger media reservoir; same membrane |
| G-Rex 500M-CS | 500 cm² | 5,000 mL | Manufacturing | Closed system; 250M → 10–20B cells in 10 days; no media exchange |

**Key limitation for organoids:** Primarily optimised for single-cell suspension expansion, not 3D aggregate culture. The flat surface discourages 3D formation without ULA treatment. Limited published organoid data.

---

### 2.7 Gravity-Based Microfluidic Systems

#### 2.7.1 InSphero Akura Flow

**Biological method:** Gravity-driven perfusion through a meandric channel connecting organoid compartments. A motorised tilter rocks the chip ±85°; media flows through the channel by hydrostatic pressure differential created by tilt angle. No pump required.

| Attribute | Akura Flow |
|---|---|
| Make + vendor | InSphero AG |
| Chip format | ANSI/SBS-standard microtiter plate footprint |
| Material | Polystyrene; 125 µm bottom thickness |
| Units per chip | 2 units per chip; 10 compartments per unit |
| Chips per holder plate | 4 chips in SBS holder plate = 32 experimental conditions |
| Well spacing | 4.5 mm (384-well positions) |
| Flow mechanism | Gravity; tilter at 0° to ±85° (170° total arc) |
| Flow control | Programmable tilt angles; 1-second to custom interval |
| Spheroid size range | 150–600 µm diameter |
| Coating | ULA throughout compartments and channel |
| Bottom | Flat, highly transparent polystyrene for imaging |
| Dead volume | Minimal; precise media exchange enabled |
| Tilter throughput | 4 frames simultaneously (All-In-One Tilter) |
| Key subsystem | SureXchange™ ledge for spheroid loading; automated liquid handler compatible |
| Key limitation | Flow rate fixed by tilt geometry (not independently programmable); chip format not compatible with standard patch-clamp or electrophysiology tools |

**Akura Flow 384 variant:** 24 units per plate; 12 compartments per unit; for high-throughput organ-on-chip studies.

#### 2.7.2 InSphero Akura 384 Spheroid Microplate

Static gravity-based spheroid formation plate. U-bottom, 384-well format, ULA surface. For formation without flow; pairs with Akura Flow for subsequent perfusion.

#### 2.7.3 Gri3D (SUN bioscience / InSphero)

| Attribute | Gri3D |
|---|---|
| Make + vendor | SUN bioscience (Lausanne); now distributed via InSphero |
| Plate format | 96-well (127.90 × 85.60 × 14.45 mm); 24-well (127.90 × 85.60 × 19.00 mm) |
| Microwell material | Poly-ethylene glycol (PEG) hydrogel; cell-repellent; non-adhesive |
| Top structure | Polystyrene |
| Bottom | Plastic 1 mm (standard) or IBIDI polymer 0.18 mm (imaging) |
| Microwell diameters | Standard: 400–800 µm; custom: 100–1,500 µm |
| Media volumes | 96-well: 50 µL seeding chamber + 150 µL pipetting port; 24-well: 200 µL + 800 µL |
| Formation principle | Gravity sedimentation into PEG microwells |
| Throughput | Same-focal-plane array: fast HCS imaging |
| Key strength | All organoids in same focal plane → reduced imaging time; 100% SBS compatible |
| Key limitation | No perfusion; static culture only; PEG not suitable for ECM-dependent types without coating |

---

### 2.8 Microfluidic Organ-on-Chip Systems

#### 2.8.1 Emulate Bio Human Emulation System

**Biological method:** PDMS/polymer chip with two parallel microchannels separated by a porous membrane. Cells cultured on both faces of the membrane; independent flow control for each channel. Pneumatic channels on either side of each cell channel apply cyclic vacuum/pressure to stretch the membrane (simulating breathing, peristalsis, etc.).

| Attribute | Emulate Zoë-CM2 | Emulate AVA |
|---|---|---|
| Make + vendor | Emulate, Inc. (Boston, MA) | Emulate, Inc. |
| Chip capacity | 12 chips per Zoë unit | 96 chips per run |
| Chip types | Chip-S1 (Stretchable), Chip-R1 (Rigid), Chip-A1 (Accessible), Chip-Array (AVA) | Chip-Array |
| Chip form factor | ~AA battery size | Array format |
| Pod (chip carrier) | 41.5 mm height; individual sealed carrier | — |
| Flow control | Independent top/bottom channel flow rates | Automated; 96-chip flow |
| Stretch parameters | Frequency, amplitude programmable | — |
| Gas supply | Via Orb Hub Module (5% CO2 + vacuum + power) | — |
| Orb Hub Module | Connects up to 4 Zoë units | — |
| Throughput | 12 chips (Zoë) or 96 chips (AVA) | 96 chips per run with real-time imaging |
| Key subsystems | Vacuum stretch actuation; dual-channel perfusion; Pod seal integrity; CO2 regulation |
| Key limitation | Chip cost is high; PDMS absorbs small hydrophobic molecules; requires Orb Hub for gas/power; batch size limited per Zoë unit |

#### 2.8.2 MIMETAS OrganoPlate

**Biological method:** Microfluidic channels patterned on a standard plate using PhaseGuide technology — a surface-tension-based interface between gel and liquid channels that prevents mixing without membranes. Gravity-induced levelling between top and bottom reservoirs drives flow. No pumps or tubing required.

| Attribute | OrganoPlate 9601 | OrganoPlate 7201 | OrganoPlate 6401 |
|---|---|---|---|
| Make + vendor | MIMETAS BV (Netherlands) | MIMETAS BV | MIMETAS BV |
| Format | 96 single cultures, single perfusion | 72 adjacent co-cultures, single perfusion | 64 cultures, dual perfusion |
| Chip integration | 40–96 chips per plate | — | — |
| Flow mechanism | Gravity-induced; reservoir level difference | Same | Dual-perfusion |
| Pumps required | None | None | None |
| Membrane | None (PhaseGuide surface tension) | None | None |
| Key limitation | Flow rate not independently programmable; no stretch actuation; gravity-dependent (cannot function in microgravity without redesign) |

#### 2.8.3 TissUse HUMIMIC Multi-Organ Chips

**Biological method:** PDMS microfluidic chips with pneumatically actuated micropumps (3 × 500 µm PDMS membranes per chip). Simulates systemic circulation across up to 4 organ compartments. HUMIMIC Starter control unit delivers pre-calibrated pumping pressures.

| Attribute | Chip2 (24-well) | Chip2 (96-well) | Chip4 |
|---|---|---|---|
| Make + vendor | TissUse GmbH (Berlin) | TissUse GmbH | TissUse GmbH |
| Channel dimensions | 100 µm H × 500 µm W | Same | — |
| Microfluidic volume | 6.5 µL | 5 µL | — |
| Microfluidic surface | 145 mm² | 115 mm² | — |
| Chamber sizes | 24-well (14 mm dia) + 96-well (6.5 mm dia) | 2× 96-well (6.5 mm dia) | 4 organ compartments |
| Reservoir capacity | Up to 750 µL | Same | — |
| Pump mechanism | 3 PDMS pump membranes; pneumatic actuation | Same | Same |
| Material | Polycarbonate adapter; PDMS microfluidics; glass slide; PEEK/PC compartments; MVQ 70A seals | Same | — |
| Price (Chip2) | ~£280 per chip | ~£280 per chip | Quote required |
| Insert format | Standard 96-well CCI insert compatible | Standard 96-well | — |
| Key strength | True multi-organ crosstalk with closed-loop circulation; systemic ADME profiling |
| Key limitation | Requires external control unit (HUMIMIC Starter); complex setup; small microfluidic volume limits sampling |

#### 2.8.4 ibidi Pump System (Perfusion for Channel Slides)

| Attribute | ibidi Pump System |
|---|---|
| Make + vendor | ibidi GmbH (Germany) |
| Flow principle | Air-pressure-driven; oscillating, pulsatile, or continuous flow |
| Flow rate range | 30 µL/min – 35 mL/min |
| Shear stress range | 0.3 dyn/cm² and above |
| Working volume | 2.5–50 mL per reservoir |
| Configuration | Computer-controlled air pump + up to 4 Fluidic Units (2 reservoirs each) |
| Slide compatibility | All ibidi µ-Slide series (incl. µ-Slide III 3D Perfusion) |
| µ-Slide III 3D Perfusion | PDMS-based; 3D ECM gel filling; top reservoir for perfusion over 3D culture |
| Key limitation | Requires paired ibidi slides; not compatible with standard multiwell plates |

---

### 2.9 Magnetic 3D Bioprinting (Greiner Bio-One n3D / NanoShuttle)

**Biological method:** Cells are magnetised by incubation with NanoShuttle-PL — a ~50 nm gold/iron-oxide/poly-L-lysine nanoparticle assembly that electrostatically adheres to cell membranes. Neodymium magnets placed below the well attract magnetised cells, overriding gravity and driving rapid cell–cell aggregation without ECM scaffold.

| Attribute | Magnetic 3D (Greiner / n3D Biosciences) |
|---|---|
| Make + vendor | Greiner Bio-One (distributed); technology from n3D Biosciences |
| Plate formats | 6-well through 1,536-well |
| Magnets (384-well drive) | 1/16″ × 1/4″ neodymium cylindrical; one per well |
| Magnets (1536-well drive) | 3/64″ × 1/4″ cylindrical; custom tolerance ±0.05 mm |
| Spheroid formation time | 4 hours (magnetised cells on drive) → full spheroid at 24 h |
| NanoShuttle-PL retention | ~8 days; then released to extracellular space |
| HTS throughput | 15,200 compounds/day tested in pilot screen (151,977 compounds in 10 days) |
| Drive incubator integration | Custom drives installed in GNF HTS incubators; 18-shelf plate hotels; 26 drive positions per hotel |
| Key strength | No ECM required; rapid (<4 h) formation; scalable to 1,536-well; automatable |
| Key limitation | Nanoparticle retention (~8 days) may confound long-term assays; iron oxide may affect some assays; well size defines spheroid size range |

---

## 3. Incubation and Environment Control

### 3.1 CO2 Incubators

Standard organoid culture requires: 37°C ± 0.1°C; 5% CO2 (or 7.5% for some protocols); ≥95% relative humidity; optional hypoxia (1–5% O2 for stem cell niches).

**Thermo Scientific Heracell VIOS (flagship reference):**

| Attribute | Heracell 150i / 240i | Heracell VIOS |
|---|---|---|
| Internal volume | 150 L / 240 L | 150 L or 240 L |
| CO2 range | 0–20% vol | 0–20% vol |
| O2 control (trigas) | 1–21% (hypoxia) or 5–90% (hyperoxia) | Full trigas: 1–21% / 5–90% |
| Temperature range | Ambient +3°C to 50°C | Ambient +3°C to 50°C |
| Sensor type | TC (thermal conductivity) or dual-beam IR | IR recommended for fluctuating humidity environments |
| Humidity | Direct humidification; up to 5× faster recovery vs. water pan | Integral reservoir |
| Chamber material | Copper (antimicrobial) or stainless steel | Copper chamber option |
| Power | 230V 50/60 Hz; ~700–900 W typical | Similar |
| Footprint | Bench or stacked (240i stacked pair) | Same |
| Key organoid feature | Trigas capability for hypoxic niche culture (intestinal stem cells ~5% O2; brain organoids often at 5% O2) |

**Panasonic/PHC MCO series:** Comparable specifications; copper chambers standard; used by many organoid labs. MCO-170AIC is a common research model.

### 3.2 Gas Mixing and Hypoxia Control

- Most modern CO2 incubators accept N2 input for O2 displacement (trigas configuration).
- External gas blenders (e.g., Okolab, Tokai Hit) can pre-mix gas for incubator injection.
- For organ-on-chip systems (Emulate, TissUse), dedicated gas management units (Emulate Orb Hub) mix and deliver precise CO2/O2/N2 blends at chip level.

### 3.3 Automated Media Exchange and Perfusion Pumps

**CellASIC ONIX2 (Sigma-Aldrich/Merck):**

| Attribute | CellASIC ONIX2 |
|---|---|
| Function | Automated microfluidic platform; precise media, temperature, gas changes |
| Mechanism | Vacuum seal with specialised microfluidic plates; pre-programmed protocols |
| Control | Software-defined sequences of media and gas switches |
| Application | Short-term (hours) stimulation-response experiments; not long-term organoid culture |

**Manual media exchange (standard):** Aspiration and replenishment using multichannel pipettes or automated liquid handlers (Hamilton, Tecan, Biomek). Frequency: every 2–3 days for most organoid types.

**Sartorius Ambr 15 (parallel microbioreactor with media exchange):**

| Attribute | Ambr 15 |
|---|---|
| Make + vendor | Sartorius Stedim Biotech |
| Scale | 10–15 mL microbioreactor |
| Parallel capacity | 24 or 48 simultaneous bioreactors |
| Process modes | Batch, fed-batch, perfusion-mimic, media exchange |
| Application | Cell line development, stem cell process development; not standard organoid culture but relevant for scale-up |

---

## 4. Consumables: The Razor-and-Blade Layer

This is the recurring revenue layer — hardware purchases are one-time, but consumables are needed every run.

### 4.1 Matrix / Scaffold Consumables

| Consumable | Vendor | Catalogue | Unit | Cold-chain? | Approx. Price Band |
|---|---|---|---|---|---|
| Matrigel GFR Organoid Culture | Corning | 356255 | 10 mL | -20°C → thaw on ice | ~$300–400 / 10 mL |
| Matrigel HC GFR | Corning | 354263 | 10 mL | -20°C → thaw on ice | ~$400–500 / 10 mL |
| Cultrex UltiMatrix RGF BME | R&D Systems | BME001-05 | 5 mL | -80°C; thaw at 4°C | Similar to Matrigel |
| VitroGel ORGANOID Discovery Kit | TheWell Bioscience | — | 4-formulation kit | Room temperature | ~$200–350 kit |
| iMatrix-511 | Iwai / Takara / Miltenyi | Multiple | 175 µg / 0.5 mg/mL | 4°C; no freeze-thaw | ~$300–400 / 175 µg |
| IntestiCult OGM (Human) | STEMCELL Technologies | 06010 | 500 mL | 4°C (2-part) | ~$400–500 / kit |
| IntestiCult-SF | STEMCELL Technologies | — | 500 mL | 4°C | Similar |
| IntestiCult Plus (2025) | STEMCELL Technologies | — | 500 mL | 4°C | Premium tier |
| STEMdiff Cerebral Organoid Kit | STEMCELL Technologies | DX21849 | Multi-component | 4°C / -20°C | ~$500–700 / kit |

### 4.2 Plates and Chips

| Consumable | Vendor | Format | Interface | Throughput |
|---|---|---|---|---|
| Corning 4515 Spheroid Microplate | Corning | 96-well ULA, round bottom | ANSI/SBS | 96 spheroids/plate |
| Corning 3830 Spheroid Microplate | Corning | 384-well ULA | ANSI/SBS | 384 spheroids/plate |
| Corning 4527 Spheroid Microplate | Corning | 1,536-well ULA | ANSI/SBS | 1,536 spheroids/plate |
| AggreWell 400 | STEMCELL Technologies | 6-well or 24-well; 400 µm microwells | ANSI/SBS | Up to 42,000 organoids/plate |
| AggreWell 800 | STEMCELL Technologies | 6-well; 800 µm microwells | ANSI/SBS | Up to ~10,000 organoids/plate |
| Gri3D 96-well | SUN bioscience / InSphero | 96-well; PEG hydrogel microwells | ANSI/SBS | 96 organoid arrays/plate |
| Gri3D 24-well | SUN bioscience / InSphero | 24-well | ANSI/SBS | 24 organoid arrays |
| Akura Flow chip | InSphero | 4 chips/SBS holder; 20 compartments/chip | SBS plate footprint | 32 conditions per holder |
| Akura 384 Spheroid Microplate | InSphero | 384-well ULA | ANSI/SBS | 384 spheroids |
| Emulate Chip-S1 | Emulate, Inc. | ~AA battery; 2-channel; stretchable | Pod carrier | 12 per Zoë run |
| Emulate Chip-R1 | Emulate, Inc. | Rigid (no stretch) | Pod carrier | 12 per Zoë run |
| HUMIMIC Chip2 (24-well) | TissUse | 2-organ; polycarbonate + PDMS | HUMIMIC Starter | 1 chip = 2-organ crosstalk |
| HUMIMIC Chip4 | TissUse | 4-organ | HUMIMIC Starter | 1 chip = 4-organ model |
| OrganoPlate 9601 | MIMETAS | 96 channels in SBS plate | Orbital shaker or rocker | 96 cultures |
| Corning 3470 Transwell | Corning | 6.5 mm insert, 24-well | 24-well plate | 24 ALI cultures per plate |
| Corning 3460 Transwell | Corning | 12 mm insert, 12-well | 12-well plate | 12 ALI cultures per plate |
| Corning Spinner Flask 3152 | Corning | 125 mL disposable | Magnetic stir plate | Continuous culture |

### 4.3 Key Media / Growth Factor Kits

| Product | Vendor | Organoid Type | Format | Notes |
|---|---|---|---|---|
| IntestiCult OGM Human | STEMCELL Technologies | Intestinal (human) | 2-part, 500 mL kit | ENR (EGF/Noggin/R-spondin) based |
| IntestiCult OGM Mouse | STEMCELL Technologies | Intestinal (mouse) | Same | Mouse crypt/villi culture |
| IntestiCult-SF | STEMCELL Technologies | Intestinal | Serum- and CM-free | Better expansion kinetics in long-term culture |
| IntestiCult Plus | STEMCELL Technologies | Intestinal | 2025 next-gen | Simultaneous expansion + differentiation; tuft cells + mature enterocytes |
| STEMdiff Cerebral Organoid Kit | STEMCELL Technologies | Cerebral | 4-stage kit | EB formation → induction → expansion → maturation |
| STEMdiff Cerebral Organoid Maturation Kit | STEMCELL Technologies | Cerebral (maturation) | Separate maturation medium | Long-term cerebral organoid maintenance |
| STEMdiff Intestinal Organoid Kit | STEMCELL Technologies | iPSC-derived intestinal | Kit | PSC-to-intestinal differentiation |
| mTeSR1 / TeSR-E8 | STEMCELL Technologies | iPSC maintenance | 500 mL | Required upstream of organoid induction |

---

## 5. Physics of Why Each Method Works

This section explains the physical principles determining each method's performance — and what changes in microgravity.

### 5.1 Sedimentation (Gravity-Dependent)

**Formula:** Stokes' law settling velocity: v = (2r²(ρ_cell - ρ_medium)g) / 9η

- Typical organoid: r ~100–500 µm; ρ_cell ~1.05–1.10 g/cm³; ρ_medium ~1.00 g/cm³; η ~0.001 Pa·s
- At 1g: settling velocity ~0.1–2.5 mm/min — organoids sediment rapidly in static culture
- This is why hanging-drop plates rely on surface tension (not gravity) to hold the drop, while ULA plates use chemistry to prevent adhesion

**Microgravity impact:** All sedimentation ceases. In ULA plates, organoids no longer settle to U-bottom — they float randomly. Hanging drops lose their gravity-driven aggregation point. AggreWell centrifugation (which also relies on g) is impossible without a centrifuge.

**Implication for hardware design:** Any method relying on gravity-driven sedimentation requires redesign for microgravity. Only suspension culture (where uniform mixing replaces sedimentation) is directly transferable.

### 5.2 Hydrodynamic Shear (Rotation / Flow Rate)

**Formula:** Wall shear stress τ_w = 6Qη / wh² (rectangular channel, Q = flow rate, w = width, h = height)

- For microfluidic channels (Emulate S1, TissUse Chip2): flow rates 1.5–20 µL/min; channel ~100 µm H × 500 µm W → shear ~0.001–0.01 Pa (10–100 µdyn/cm²)
- For rotating wall vessels: 0.001–0.01 Pa (lowest of all bioreactor types)
- For spinner flasks at 60–85 rpm: 0.01–0.5 Pa (varies with impeller geometry)
- For cerebral organoids: tissue is shear-sensitive; recommend <0.1 Pa

**Microgravity impact:** In microgravity, buoyancy-driven convection is absent. Diffusion alone is the mass transport mechanism without active flow. In closed bioreactor vessels, natural convection that partially compensates for mixing in 1g is eliminated. This worsens oxygen and nutrient delivery for the same hardware design.

**Implication:** Active mixing or perfusion becomes more critical in microgravity, not less. Passive gravity-driven flow (Akura Flow tilter, MIMETAS OrganoPlate gravity levelling, Emulate Orb vacuum stretch) all fail or degrade significantly.

### 5.3 Diffusion Limits (Organoid Size vs. Nutrient Delivery)

**Formula:** Diffusion penetration depth d ≈ √(2Dt), where D (O2 in tissue) ≈ 1–2 × 10⁻⁹ m²/s

- Oxygen diffusion into tissue: ~150–200 µm radius before hypoxic core forms
- This is why organoids >400 µm diameter develop necrotic cores in static culture
- Perfusion bioreactors, microfluidic chips, and RWVs all address this by providing convective transport to the organoid surface

**Microgravity impact:** Without natural convection, the diffusion-limited shell around each organoid thickens. The effective oxygen supply rate drops even if the incubator O2 partial pressure is identical. This selects against large organoids (>300 µm) in static microgravity culture.

**Implication:** Microfluidic perfusion (Emulate, TissUse, ibidi) becomes the dominant strategy in microgravity because it provides forced convective O2 delivery regardless of gravity. Spinner flasks remain viable if rotation is motorised (not gravity-driven).

### 5.4 ECM Mechanics (Gel Stiffness, Crosslink Density)

**Matrigel stiffness:** ~30–100 Pa (soft; typical for soft tissue niches)  
**Matrigel HC:** ~100–400 Pa (stiffer; higher crosslink density)  
**PEG hydrogels (tuneable):** 100–50,000 Pa  
**Brain tissue equivalent:** ~100–500 Pa  
**Intestinal crypt niche:** ~50–200 Pa  

**Mechanism:** Integrin-mediated mechanosensing: cells probe matrix stiffness via focal adhesion kinase (FAK) / YAP/TAZ pathways. Stiffness determines cell fate (e.g., soft gels → neural fate; stiff → mesenchymal). The gel must be stiff enough to maintain 3D dome shape but soft enough to allow cell migration and budding.

**Microgravity impact:** In microgravity, the ECM gel is not under compressive load from organoid weight. The gel deforms less — organoids that rely on gel deformation for morphogenesis (e.g., budding of intestinal crypts) may behave differently. Additionally, without gravity, dome-shaped Matrigel deposits may not form correctly — they require surface tension / spreading against gravity.

**Implication:** In-orbit, gel mechanics need validation. Xeno-free matrices (VitroGel) whose gelation is triggered by ionic concentration change (not temperature) may be more controllable in orbit than temperature-sensitive Matrigel.

### 5.5 Surface Tension and Capillary Effects (Microfluidics)

MIMETAS OrganoPlate PhaseGuide and gravity-driven levelling flow both rely on liquid–air interfaces and hydrostatic pressure from reservoir level differences. These are gravity-dependent.

**Microgravity impact:** Surface tension forces dominate over gravity forces at small scales (Bond number Bo = ρgL²/γ << 1 when L << 3 mm). This means microfluidic capillary effects actually become more important in microgravity, not less — but directed flow by gravity-column pressure heads fails completely.

**Implication:** Microfluidic chips requiring reservoir-height-driven flow must be redesigned to use peristaltic, syringe, or electroosmotic pumping in microgravity.

---

## 6. Space-Relevance Analysis

### 6.1 Methods That Transfer to Microgravity (With Modifications)

| Method | Transferability | Required Modification |
|---|---|---|
| Motorised spinner flask / RPMotion | Good | Seal vessel; replace gravity-stabilised sedimentation with continuous rotation; address gas exchange without gravity-driven convection |
| Rotating wall vessel (HARV/STLV) | Excellent | Already simulates microgravity; works well in-orbit (historically used for ISS experiments); seal against bubble formation |
| Microfluidic perfusion (Emulate, TissUse) | Good | Replace gravity-driven stretch/vacuum actuation with alternative (compressed gas from tank or electroactive) |
| Magnetic 3D bioprinting | Good | Magnets function without gravity; NanoShuttle aggregation is electromagnetically driven; formation time may change |
| ECM embedding | Moderate | Temperature-shift gelation still works in microgravity; dome dispensing requires a closed-vessel approach |
| ULA suspension in sealed vessel | Good | Cells float freely; organoids form by random collision + cell–cell adhesion; mixing still required |

### 6.2 Methods That Fail in Microgravity

| Method | Failure Mode |
|---|---|
| Hanging-drop plates | Drop falls away from surface without gravity |
| AggreWell (centrifugation) | Centrifuge needed; orbital centrifuges are heavy and power-hungry |
| Gravity-levelling microfluidics (MIMETAS OrganoPlate, Akura Flow tilter) | No hydrostatic pressure differential without g |
| Orbital shaker | Wave amplitude ∝ g; negligible mixing in microgravity |
| ALI culture (standard Transwell) | Apical/basal orientation undefined; air layer cannot form at correct face without g |
| Sedimentation-based spheroid formation | No settling to well bottom |

### 6.3 The Single Biggest Hardware Lever for a Space Version

**Sealed perfusion bioreactor with active pumping and integral gas exchange, using xeno-free gelless suspension or ECM-free microfluidic scaffold.**

The single largest engineering leverage point is replacing every gravity-dependent transport mechanism (sedimentation, gravity-driven flow, natural convection, hydrostatic pressure) with active mechanical perfusion in a hermetically sealed, compact cassette. This maps to:

1. A sealed cassette (no open wells, no air-liquid interface risk in microgravity)
2. A peristaltic or electroosmotic pump (no reservoir-height pressure heads)
3. Integrated gas exchange membrane (O2/CO2 without gas headspace)
4. ULA or PEG-coated interior surfaces (no ECM cold-chain; no gravity-dependent dome formation)
5. Magnetics for aggregation initiation (NanoShuttle or diamagnetic levitation)
6. Compatible with ISS standard payload volumes and power (28V DC nominal; ≤100W typical; <30 cm³ of internal culture volume is feasible)

The rotating wall vessel (Synthecon HARV) is the closest existing device to this — it was co-developed with NASA and has demonstrated successful organoid culture on ISS — but it still uses free liquid fill and gravity-adjusted RPM. The next-generation design should fix RPM mechanically (not gravity-adjusted) and use closed-loop O2 sensing rather than assuming ambient CO2 equilibration.

---

## 7. Source List

1. Bioreactor Technologies for Enhanced Organoid Culture (PMC, 2023): https://pmc.ncbi.nlm.nih.gov/articles/PMC10380004/
2. Corning Matrigel Matrix product page and application note: https://ecatalog.corning.com/life-sciences/b2c/US/en/Surfaces/Extracellular-Matrices-ECMs/Corning%C2%AE-Matrigel%C2%AE-Matrix/p/corningMatrigelMatrix
3. Corning Matrigel 3D Organoid Protocol (Application Note CLS-DL-AN-414): https://www.corning.com/catalog/cls/documents/application-notes/Application_Note_CLS-DL-AN-414_Matrigel_Matrix_3D_In_Vitro_Protocol.pdf
4. Cultrex UltiMatrix RGF BME (R&D Systems): https://www.rndsystems.com/products/cultrex-ultimatrix-reduced-growth-factor-basement-membrane-extract_bme001-05
5. Corning 96-well Spheroid Microplates product family: https://ecatalog.corning.com/life-sciences/b2c/US/en/Microplates/Assay-Microplates/96-Well-Microplates/Corning%C2%AE-96-well-Spheroid-Microplates/p/corning96WellSpheroidMicroplates
6. Corning Spheroid Microplates User Guide (CLS-AN-235): https://www.corning.com/catalog/cls/documents/protocols/CLS-AN-235.pdf
7. Corning Microplate Dimensions Data Sheet: https://www.corning.com/catalog/cls/documents/drawings/MicroplateDimensions96-384-1536.pdf
8. AggreWell 400 Product Page (STEMCELL Technologies): https://www.stemcell.com/products/aggrewell400.html
9. AggreWell 800 Product Page (STEMCELL Technologies): https://www.stemcell.com/products/aggrewell800.html
10. Spin∞ Updated Miniaturized Spinning Bioreactor (PMC): https://pmc.ncbi.nlm.nih.gov/articles/PMC7451502/
11. RPMotion Accelerated Epithelial Organoid Production (PMC, 2024): https://pmc.ncbi.nlm.nih.gov/articles/PMC11705766/
12. RPMotion product page (BioSPX): https://www.biospx.com/product/rpmotion-organoid-bioreactor/
13. Synthecon product families: https://www.synthecon.com/products/
14. Synthecon Autoclavable HARV page: https://www.synthecon.com/products-1/autoclavable-high-aspect-ratio-vessels-(harvs)
15. Culturing and Applications of RWV Bioreactor-Derived 3D Models (PMC): https://pmc.ncbi.nlm.nih.gov/articles/PMC3567125/
16. Air Bubble-Isolating RWV Bioreactor (PubMed): https://pubmed.ncbi.nlm.nih.gov/31328683/
17. Emulate Bio products page: https://emulatebio.com/products/
18. Emulate QM+CPM platform description: https://www.cpm.qmul.ac.uk/emulate/platform/
19. Emulate Basic Organ-Chip Culture Protocol EP177: https://emulatebio.com/wp-content/uploads/2021/06/EP177_v1.0_Basic_Organ-Chip_Culture_Protocol.pdf
20. MIMETAS OrganoPlate Technology: https://www.mimetas.com/technology
21. TissUse HUMIMIC Chip4: https://www.tissuse.com/en/humimic/chips/humimic-chip4/
22. TissUse HUMIMIC Chip2 (Darwin Microfluidics): https://darwin-microfluidics.com/products/humimic-chip2-2-organ-chip/
23. Exploring Multi-Organ Crosstalk via HUMIMIC (Biotech & Bioengineering, 2025): https://analyticalsciencejournals.onlinelibrary.wiley.com/doi/10.1002/bit.70031
24. InSphero Akura Flow product page: https://insphero.com/3d-cell-culture-tools/akura-flow-organ-on-chip/
25. InSphero Akura Flow 384: https://insphero.com/3d-cell-culture-tools/akura-flow-384/
26. InSphero Gri3D product page: https://insphero.com/solutions/gri3d/
27. SUN bioscience product page: https://sunbioscience.com/products/
28. Greiner Bio-One Magnetic 3D Bioprinting: https://focus.gbo.com/3d/magnetic-3d-bioprinting-to-create-3d-cell-culture
29. Automating Magnetic 3D Spheroid Model for HTS (PMC, 2020): https://pmc.ncbi.nlm.nih.gov/articles/PMC7704036/
30. Wilson Wolf G-REX product and order info: https://www.wilsonwolf.com/product-and-order-info/
31. Wilson Wolf G-Rex Technical Data Sheet G-Rex500: https://www.wilsonwolf.com/wp-content/uploads/2022/08/MM-0006-Technical-Data-Sheet-TDS-G-Rex500-Series-Rev-A.pdf
32. Wilson Wolf G-Rex Technical Data Sheet G-Rex100: https://www.wilsonwolf.com/wp-content/uploads/2023/08/MM-0004-Technical-Data-Sheet-TDS-G-Rex100-Series-Rev-B.pdf
33. ibidi Pump System product page: https://ibidi.com/pump-system/112-ibidi-pump-system.html
34. ibidi Pump System specifications (Elveflow mirror): https://www.elveflow.com/microfluidic-flow-control-archives/ibidi-pump-system/
35. CellASIC ONIX2 System (Sigma-Aldrich): https://www.sigmaaldrich.com/US/en/campaigns/cellasic-onix2-microfluidic-system
36. Thermo Scientific Heracell VIOS Brochure: https://documents.thermofisher.com/TFS-Assets/LPD/brochures/Heracell%20VIOS%20CO2%20Incubator%20Brochure%20BRCO2VIOSNA-EN%201020%20Web.pdf
37. Thermo Scientific Heracell 150i spec (51026283): https://www.thermofisher.com/order/catalog/product/51026283
38. INFORS HT Multitron: https://infors-ht.com/en/products/incubator-shakers/multitron
39. CERO 3D Bioreactor (CellMicrosystems): https://cellmicrosystems.com/cero-3d/
40. IntestiCult OGM Human: https://www.stemcell.com/products/intesticult-organoid-growth-medium-human.html
41. IntestiCult-SF: https://www.stemcell.com/products/intesticult-sf-organoid-growth-medium-human.html
42. IntestiCult Plus: https://www.stemcell.com/products/intesticult-plus-organoid-growth-media.html
43. STEMdiff Cerebral Organoid Kit: https://www.stemcell.com/products/stemdiff-cerebral-organoid-kit.html
44. STEMdiff Cerebral Organoid Maturation Kit: https://www.stemcell.com/products/stemdiff-cerebral-organoid-maturation-kit.html
45. Neural Organoid Culture Protocol (STEMCELL): https://www.stemcell.com/neural-organoid-culture.html
46. Corning Transwell 3470 (6.5 mm, 0.4 µm PET): https://ecatalog.corning.com/life-sciences/b2c/US/en/Permeable-Supports/Inserts/Corning%C2%AE-Transwell%C2%AE-Clear-Inserts,-Polyester-(PET)-membrane/p/3470
47. Corning Transwell 3460 (12 mm, 0.4 µm PET): https://ecatalog.corning.com/life-sciences/b2c/US/en/Permeable-Supports/Inserts/Corning%C2%AE-Transwell%C2%AE-Clear-Inserts,-Polyester-(PET)-membrane/p/3460
48. Corning Transwell Permeable Supports Selection Guide: https://www.corning.com/catalog/cls/documents/selection-guides/CLS-CC-027.pdf
49. Air-Liquid Interface FAQs (STEMCELL Technologies): https://www.stemcell.com/air-liquid-interface-faqs.html
50. VitroGel ORGANOID 3D Hydrogel (TheWell Bioscience): https://www.thewellbio.com/product/3d-organoid-culture-hydrogel/
51. iMatrix-511 (Takara Bio): https://www.takarabio.com/products/stem-cell-research/media-differentiation-kits-and-matrices/stem-cell-matrices/imatrix-511
52. Animal-free Matrigel alternatives for iPSC organoids (Scientific Reports, 2025): https://www.nature.com/articles/s41598-025-20091-w
53. Engineering the ECM for Organoid Culture (PMC, 2022): https://pmc.ncbi.nlm.nih.gov/articles/PMC8889330/
54. Establishing Neural Organoid Cultures for Microgravity in LEO (PubMed, 2024): https://pubmed.ncbi.nlm.nih.gov/38801498/
55. Stem Cell Research in Space (Cell Stem Cell, 2025): https://www.cell.com/cell-stem-cell/fulltext/S1934-5909(25)00332-7
56. Lab-on-chip technologies for space research (Microchimica Acta, 2023): https://link.springer.com/article/10.1007/s00604-023-06084-4
57. Development of Organ-on-a-Chip System with Continuous Flow in Simulated Microgravity (PMC, 2024): https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10972453/
58. Corning 125 mL Disposable Spinner Flask 3152: https://ecatalog.corning.com/life-sciences/b2c/US/en/Bioprocess-and-Scale-up/Disposable-Spinner-Flasks/Corning%C2%AE-Disposable-Spinner-Flasks/p/3152
59. Corning ProCulture Glass Spinner Flask 4500-125: https://ecatalog.corning.com/life-sciences/b2c/US/en/Cell-Culture/Cell-Culture-Vessels/Flasks,-Culture/Corning%C2%AE-Reusable-Glass-Spinner-Flask-with-Angled-Sidearms/p/4500-125
60. Sartorius Ambr 15 Cell Culture Bioreactor System: https://www.sartorius.com/en/products/fermentation-bioreactors/ambr-multi-parallel-bioreactors/ambr-15-cell-culture
61. High-content imaging on standardised human rectal organoid arrays (Molecular Devices): https://www.moleculardevices.com/en/assets/app-note/dd/img/high-content-imaging-and-morphology-analyses-on-standardized-human-rectal-organoid-arrays
62. ImageXpress Confocal HT.ai (Molecular Devices): https://www.moleculardevices.com/products/cellular-imaging-systems/high-content-imaging/imagexpress-confocal-ht-ai
63. Comparison of ALI transwell and airway organoid models (PMC, 2025): https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11839712/
64. Mini and customised low-cost bioreactors for organoids (PMC): https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6232071/
