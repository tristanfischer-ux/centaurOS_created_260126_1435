# Organoid Assay & Readout Equipment — Engineering Reference Report

**Prepared for:** Yuri / Centaur hardware design programme  
**Date:** 2026-07-18  
**Scope:** Ground-truth instruments for assaying and reading out organoids. Engineering detail captured for use in designing a compact in-orbit cassette reader.  
**Classification note:** Destructive (D) vs Non-destructive (ND) and Image-based (I) vs Requires-sample-return (S) flagged throughout.

---

## 1. High-Content Imaging Systems

### 1.1 Confocal High-Content Imagers

These are the workhorse class for phenotypic drug screening on organoids. All are widefield + spinning-disk confocal hybrids. All are non-destructive if fluorescent reporters are genetically encoded; they become semi-destructive when fixed and stained.

#### Table 1.1a — Confocal HCI Platform Comparison

| Parameter | Molecular Devices ImageXpress Micro Confocal | Molecular Devices ImageXpress HCS.ai | Revvity Opera Phenix Plus | Yokogawa CellVoyager CQ1 |
|---|---|---|---|---|
| **Vendor** | Molecular Devices (Danaher) | Molecular Devices (Danaher) | Revvity (ex-PerkinElmer) | Yokogawa Electric |
| **Confocal method** | Spinning disk (AgileOptix — swappable disk geometry) | Spinning disk (AgileOptix) | Spinning disk, simultaneous 4-channel | Dual Nipkow microlens spinning disk (CSU technology) |
| **Detector** | sCMOS (>3 log dynamic range, 16-bit) | sCMOS, 5 MP, 224 mm² sensor, 95% peak QE | Two sCMOS cameras (simultaneous confocal+confocal) | sCMOS |
| **Illumination** | Solid-state LED + optional 5-ch or 7-ch laser (400–1000 mW/ch) | 7 lasers, 8 channels | 5 solid-state lasers (405, 488, 561, 640, 785 nm) | Solid-state laser lines |
| **Objectives** | 20×, 40×, 60× water immersion; up to 12 magnifications | 12 magnifications incl. ELWD; water immersion | 5×–63× water and air; all corrected for plastic | 2×–60×; air + water immersion |
| **Plate formats** | 6–1536 well; hanging drops, round/flat-bottom | 6–384+ well; supports 96 and 384 primary | 6–1536 well; 4-slide holder; ANSI/SLAS | 6, 12, 24, 48, 96, 384, 1536 well; 35/60 mm dish; slide |
| **Throughput** | >1 million wells/week quoted; 40 plates (96-well, 2ch) in 2 h | 96-well (2ch) <90 s; 384-well 3D volumetric 25 min | Simultaneous 4-ch acquisition; full 384-well plate ~20 min | High-precision XY stage, 0.1 µm resolution |
| **Z-stack / 3D** | Yes; MetaXpress 3D analysis module | Yes; volumetric 384-well supported | Yes; full z-series with water objectives | Yes; 3D organoid quantification in situ |
| **Footprint/dimensions** | Large bench instrument (~1 m width); exact dim not published | Large; modular design | Large (instrument + server); exact dim not published | 600 × 400 × 298 mm (437 mm tall with phase contrast option) |
| **Mass** | Not published | Not published | Not published | 43 kg |
| **Environmental control** | Optional (temp + humidity + CO₂) | Optional | Integrated (temp + humidity) | Optional incubator integration |
| **On-board fluidics** | Optional robotic fluidics module | Optional | No | No |
| **Software** | MetaXpress; CellReporterXpress; AI module | AI-powered analysis built-in; MetaXpress | Harmony HCS software | CellPathfinder |
| **Assay type** | ND (live) or semi-D (fixed+stained) | ND or semi-D | ND or semi-D | ND or semi-D |
| **Data type** | Image (I) | Image (I) | Image (I) | Image (I) |
| **Cost band** | £300k–£600k | £400k–£700k | £350k–£650k | £200k–£350k |

**Key engineering notes:**
- All spinning-disk systems generate substantial vibration at disk rotation speeds (typically 1500–5000 rpm); vibration isolation tables are standard on the ground but are problematic in microgravity.
- Water immersion objectives require a fluid interface with the well plate lid/membrane; capillary bridging in microgravity is unsolved.
- sCMOS sensors (6.5 µm pixel) are now universal; cooling to ~-10°C reduces dark current; in-vacuum operations require active thermal management.
- The CQ1 is notably the most compact in this class at 43 kg, 600 × 400 mm bench footprint; others are ~2× larger.

**Sources:** [Molecular Devices ImageXpress Micro Confocal](https://www.moleculardevices.com/products/cellular-imaging-systems/high-content-imaging/imagexpress-micro-confocal) | [ImageXpress HCS.ai](https://www.moleculardevices.com/products/cellular-imaging-systems/high-content-imaging/imagexpress-hcs-ai) | [Opera Phenix Plus](https://www.revvity.com/product/opera-phenix-plus-system-hh14001000) | [CQ1 Yokogawa](https://www.yokogawa.com/us/solutions/products-and-services/life-science/high-content-analysis/cellvoyager-cq1/)

---

### 1.2 Live-Cell Incubator Imagers (Widefield / Brightfield)

These trade confocal optical sectioning for in-incubator, longitudinal monitoring. Non-destructive by design. Data is entirely image-based and downlinkable.

#### Table 1.2 — In-Incubator Imagers

| Parameter | Sartorius Incucyte SX5 | Sartorius Incucyte CX3 | CytoSMART Lux3 BR/FL (Axion) |
|---|---|---|---|
| **Method** | Widefield brightfield + fluorescence | Widefield BF + confocal fluorescence | Widefield brightfield (BR) or + fluorescence (FL) |
| **Detector** | CMOS | sCMOS | 6.4 MP CMOS |
| **Pixel resolution** | Not published | Higher than SX5 | 0.7 µm/pixel (2072 × 2072) |
| **Field of view** | 1.45 × 1.45 mm | Larger; confocal enabled | 1.45 × 1.45 mm |
| **Objectives** | 4×, 10×, 20× | 4×, 10×, 20×; confocal disk | 4× (fixed) |
| **Plate capacity** | Up to 6 plates simultaneously | Up to 6 plates | Single plate/flask |
| **Plate formats** | 6–96 well; T-25/75 flasks | 6–96 well | Plates, flasks, dishes |
| **Temporal resolution** | 5 min – 12 h intervals | 5 min – 12 h intervals | 5 min – 12 h intervals; weeks of continuous operation |
| **Environmental control** | Passive (lives inside incubator >200 L) | Passive (lives inside incubator) | Passive (lives inside incubator) |
| **Dimensions** | Fits inside standard CO₂ incubator | Fits inside standard CO₂ incubator | Compact; fits inside standard incubator |
| **Power** | USB + 12 V (low power) | USB + 12 V | USB powered |
| **On-board analysis** | Phase contrast + fluorescence confluence, count, area | Brightfield + confocal organoid analysis (v2025c+) | Confluence only BF; basic FL |
| **Software** | Incucyte 2025c; Organoid Analysis Module (24/48/96 well plates, Matrigel) | Incucyte 2025c; Organoid Analysis Module | CytoSMART Companion (cloud) |
| **Assay type** | ND | ND | ND |
| **Data type** | Image (I) | Image (I) | Image (I) |
| **Cost band** | £80k–£130k | £120k–£180k | £10k–£20k (single unit) |

**Key engineering notes:**
- The Incucyte paradigm (instrument inside incubator) is highly relevant for space use: the imager itself need not manage temperature/CO₂, it is passively embedded in a controlled environment. The CX3 added confocal capability in 2025, expanding depth discrimination for organoids.
- The CytoSMART Lux3 is USB-powered at very low wattage; it is the only commercially available unit approaching spacecraft power budgets. Its 4× fixed objective limits resolution for small organoids (< 100 µm).
- Incubator-sized constraint (~200 L) is a barrier; a bespoke thermal/gas cassette paired with a miniaturised imager is the space analogy.

**Sources:** [Incucyte Organoid Assay](https://www.sartorius.com/en/applications/life-science-research/live-cell-assays/organoid-assay) | [CytoSMART Lux3](https://cytosmart.com/products/cytosmart-lux3-br) | [Incucyte SX5 Specs](https://www.sartorius.com/en/products/live-cell-imaging-analysis/live-cell-analysis-instruments/sx5-live-cell-analysis-instrument)

---

### 1.3 Light-Sheet Microscopy

Light-sheet fluorescence microscopy (LSFM) is the gold standard for high-resolution 3D organoid volumetric imaging; it is fast (seconds per z-stack) and low phototoxicity.

#### Table 1.3 — Light-Sheet Platforms

| Parameter | Miltenyi UltraMicroscope Blaze | Bruker/Luxendo TruLive3D Imager |
|---|---|---|
| **Vendor** | Miltenyi Biotec | Bruker (acquired Luxendo) |
| **Configuration** | Open-top illumination, multiple MI Plan objectives; automated turret | Dual-illumination SPIM; two detection arms |
| **Objectives** | 1.1×, 4×, 12× (+ magnification changer 0.6×–2.5×); total 0.66×–30× | Nikon 25× 1.1NA; Olympus 16× 0.8NA; water immersion throughout |
| **Laser lines** | 405, 488, 561, 639, 785 nm (5 lines) | Chromatic correction 440–660 nm |
| **Camera** | 4.2 or 5.5 MP sCMOS | Two Hamamatsu ORCA Flash 4.0 V3 sCMOS; >80 fps full frame, 500 fps cropped |
| **Light-sheet thickness** | Variable | 2–6 µm flexible |
| **Sample capacity** | Up to 48 organoid-sized samples per run (MACS UltraMount Series) | TruLive3D Dish; up to 6 conditions simultaneously; 75 mm stage travel |
| **Resolution (theoretical)** | 4.8–0.5 µm depending on objective | 340 nm in 3D (at highest NA) |
| **RI compatibility** | 1.33 (water) to 1.56 (DBA) — clearance agents | Water immersion primarily |
| **Environmental control** | Not specified (external incubation) | 20–37°C; CO₂ 0–15%; O₂ 1–21%; humidity 20–99% |
| **Long-term imaging** | Not specified | Up to 7 days continuous; multi-day time-lapse standard |
| **Compute** | External workstation | 256 GB RAM; dual 8-core Intel; RTX 3070; 8×4 TB RAID; 10 Gbit/s |
| **Footprint** | Large optical table (>1 m²) | Large optical table |
| **Assay type** | ND (native samples), semi-D (cleared samples — clearing destroys tissue) | ND for live; D for cleared |
| **Data type** | Image (I) — multi-TB per experiment | Image (I) — multi-TB per experiment |
| **Cost band** | £200k–£400k | £250k–£450k |

**Key engineering notes:**
- Tissue clearing (CUBIC, iDISCO, CLARITY) enables whole-organoid imaging but is inherently destructive and requires toxic organic solvents. Cleared samples cannot continue in culture.
- Native light-sheet in aqueous medium is non-destructive but requires a chamber with free fluidic access around the sample — incompatible with sealed plate well formats.
- Data volumes (multi-TB per session) dwarf any space downlink budget; onboard compression and pre-analysis (feature extraction only) would be mandatory.
- The MACS UltraMount can hold 48 organoid-sized specimens — this is a meaningful throughput number if adapted to a cassette format.

**Sources:** [Miltenyi UltraMicroscope Blaze](https://www.miltenyibiotec.com/IT-en/products/ultramicroscope-blaze.html) | [Bruker TruLive3D](https://www.bruker.com/en/products-and-solutions/fluorescence-microscopy/light-sheet-microscopes/trulive3d-imager.html)

---

## 2. Automated Organoid Analysis & AI Software

### 2.1 Integrated Analysis Suites

| Platform | Vendor | Key Capability | Integration | Assay types |
|---|---|---|---|---|
| **MetaXpress + CellReporterXpress** | Molecular Devices | 3D analysis module; z-stack deconvolution; organoid count/morphology; drug response curves | Paired to ImageXpress family | Morphology, viability, fluorescence |
| **CellXpress.ai** | Molecular Devices | Automated 3D cell culture + imaging robot; AI-guided exclusion of non-viable wells; brain organoid maintenance; 25× production scaling | Standalone robotic platform (integrated with ImageXpress) | Culture monitoring; brightfield morphology; media-change automation |
| **Harmony** | Revvity | 3D analysis pipelines for Opera Phenix; building-block analysis workflow; no scripting required; quantifies count, area, intensity, volume | Paired to Opera Phenix | Morphology, protein localisation, colocalization |
| **Genedata Screener (Imagence AI)** | Genedata | Cross-assay integration; AI-driven image analysis; combines brightfield + fluorescence + ELISA + qPCR; dose-response and IC50 | Instrument-agnostic | Phenotypic HTS; organoid drug response standardisation |
| **Incucyte Organoid Analysis Module** | Sartorius | Automated locate-and-analyse in Matrigel; morphology, count, size, differentiation, death; 24/48/96-well plates | Paired to Incucyte family | BF size/count; FL differentiation markers |
| **OrganoID** | Academic (open) | Deep learning; tracks single-organoid dynamics; count + size from brightfield | ImageJ/Python | Morphology, growth tracking |

**Engineering note:** All commercial AI software runs on-ground server hardware (GPU clusters; cloud upload). For space use, inference-only models (quantised, edge-deployed) would need to run on embedded compute (<20 W). The Genedata Imagence approach of extracting features (not raw images) is the right pattern: classify/measure on orbit, downlink only the feature vector.

---

## 3. Functional Assays & Readers

### 3.1 Multimode Plate Readers (Luminescence / Fluorescence / Absorbance)

This class performs bulk-well readout of biochemical assays. The workhorse for viability (CellTiter-Glo) and secretion (ELISA, luciferase reporters).

#### Table 3.1 — Plate Reader Comparison

| Parameter | BMG CLARIOstar Plus | BMG PHERAstar FSX | Tecan Spark |
|---|---|---|---|
| **Vendor** | BMG Labtech | BMG Labtech | Tecan |
| **Detection modes** | FI, FP, TRF, TR-FRET, LUM, AlphaScreen, Abs, Nephelometry (8 modes) | Same 8 modes; lens-based optic modules | FI, FP, TRF, LUM, Abs (fusion optics — any filter/mono combo) |
| **Wavelength range (LUM)** | 360–700 nm | Via optic modules | 360–700 nm |
| **Sensitivity (LUM)** | <0.4 pM ATP (<8 amol/well) | <0.4 pM ATP | Not published; comparable class |
| **Sensitivity (FI)** | <0.15 pM FITC (filters) | <0.15 pM FITC | Comparable |
| **Plate formats** | 6–1536 well; LVis plate (2 µL) | 6–3456 well; LVis plate | 6–1536 well |
| **Read speed (384-well)** | 15 s (single flash LUM); 57 s (10 flash) | 14 s (single flash); up to 1 min 29 s (50 flash) | "Flying mode": 9 s (96), 14 s (384), 27 s (1536) |
| **Dimensions (W × D × H)** | 45 × 51 × 40 cm | 45 × 51 × 47 cm | Not published (similar class) |
| **Mass** | 32 kg | 49 kg (62 kg with AAS) | Not published (~35 kg est.) |
| **Power (operating)** | 50 W | 50 W (80 W with AAS) | Not published |
| **Power (max)** | 300 VA | 300 VA | Not published |
| **Temperature control** | 18–42°C incubation + shaking | Dual upper/lower plate (condensation prevention) | 18–42°C incubation |
| **Injectors** | Optional (for flash luminescence) | Optional | Optional |
| **Assay type** | D (lysate-based like CellTiter-Glo); ND for secretion sampling | D | D (or ND if sampling conditioned media only) |
| **Data type** | Requires sample return for physical readout; only number out | Requires physical readout | Requires physical readout |
| **Cost band** | £40k–£80k | £80k–£130k | £30k–£60k |

**Engineering note on CellTiter-Glo 3D (Promega):** The standard destructive viability reagent for 3D cultures. Uses thermostable Ultra-Glo luciferase; enhanced lysis buffer penetrates organoid compactness. Protocol: equal volume CTG-3D + sample, shake 900 rpm 5 min, incubate 25 min, read. Glow signal stable >5 h. Detection by any luminescence plate reader (CLARIOstar LOD: 8 amol ATP/well). **Fully destructive (D)** — terminates the culture.

**Sources:** [BMG CLARIOstar Plus](https://www.bmglabtech.com/en/clariostar-plus/) | [PHERAstar FSX](https://www.bmglabtech.com/en/pherastar-fsx/) | [Tecan Spark](https://www.tecan.com/spark-overview) | [CellTiter-Glo 3D](https://www.promega.com/products/cell-health-assays/cell-viability-and-cytotoxicity-assays/celltiter-glo-3d-cell-viability-assay/)

---

### 3.2 Microelectrode Array (MEA) Systems — Neural & Cardiac Organoids

MEA records electrophysiological signals from electrically active organoids (brain, cardiac) in real time. Non-destructive; compatible with repeated measurements on the same culture.

#### Table 3.2 — MEA Platforms

| Parameter | MaxWell MaxTwo (MaxWell Biosystems) | Axion Maestro Pro / Edge | Axion Maestro Volt |
|---|---|---|---|
| **Vendor** | MaxWell Biosystems (Zurich) | Axion BioSystems (Atlanta) | Axion BioSystems |
| **Technology** | CMOS HD-MEA; platinum electrodes | MEA; gold electrodes | MEA |
| **Electrodes per well** | 26,400 | Varies by plate type (3DMap, SpheroHD, SpheroGuide) | Lower density |
| **Electrode density** | 3,265 electrodes/mm² | Lower than MaxTwo; but SpheroHD high-density for small organoids | — |
| **Electrode spacing** | 17.5 µm centre-to-centre | Varies by plate type | — |
| **Recording channels/well** | 1,020 simultaneously | Up to 96 wells simultaneously (Maestro Pro) | — |
| **Sampling rate** | 10 kHz/channel | 12.5 kHz standard | — |
| **Well formats** | 6-well + 24-well+ (96-well coming) | 6, 12, 24, 48, 96, 384 well | — |
| **Active sensing area/well** | 3.85 × 2.10 mm² | Well-dependent | — |
| **Dimensions** | 40 × 16 × 12 cm | Not published (bench instrument + incubator) | Smaller form factor |
| **Environmental control** | Integrated temperature + CO₂ | Integrated temp, CO₂, humidity — no external incubator needed | — |
| **Electrical stimulation** | Yes | Yes (Lumos: optical stimulation also) | — |
| **Consumable** | CMOS HD-MEA 24-well plate (electronic ID); 127.8 × 85.5 × 14.4 mm | Proprietary MEA plates (3DMap/SpheroGuide/SpheroHD) | — |
| **Perfluorodecalin anchoring** | Yes (PFD gently anchors organoid onto electrode array) | No (gravity-dependent settling) | — |
| **Signal types** | Action potentials; local field potentials; network bursts | Action potentials; LFPs; beat period; conduction velocity (cardiac) | — |
| **Assay type** | ND | ND | ND |
| **Data type** | Electrical signal data — can be compressed and downlinked (S or I depending on compression) | Electrical signal data | — |
| **Cost band** | £80k–£150k (+ consumable plates) | £60k–£120k (system); plates £200–£800/unit | Lower |

**Key engineering notes:**
- MaxTwo's 40 × 16 × 12 cm footprint is the most compact HD-MEA platform available; this is within range of CubeLab adaptation.
- The perfluorodecalin (PFD) anchoring approach is critical for microgravity: organoids cannot settle by gravity onto electrodes, so PFD (or equivalent surface-tension-based anchoring) solves the contact problem without mechanical compression.
- At 10 kHz × 1,020 channels per well × 24 wells, raw data rate is ~500 MB/s compressed; burst-detect + spike-sort on-chip is essential before downlink.
- Neural organoid MEA provides the richest functional information per watt of any assay that does not require lysis.

**Sources:** [MaxWell MaxTwo](https://www.mxwbio.com/products/maxtwo) | [MaxWell organoids](https://www.mxwbio.com/applications/organoids) | [Axion Maestro MEA](https://www.axionbiosystems.com/products/maestro-mea) | [Axion Organoid MEA plates](https://www.axionbiosystems.com/products/mea-plates/organoid-mea)

---

### 3.3 Impedance Spectroscopy — Label-Free Cell Analysis

Impedance measures cell adhesion, proliferation, morphology, and cytotoxicity without labels via gold biosensors embedded in well bases.

| Parameter | Agilent xCELLigence RTCA eSight |
|---|---|
| **Vendor** | Agilent Technologies |
| **Technology** | Gold biosensor E-Plates + widefield brightfield + 3-colour fluorescence (R, G, B) |
| **Objectives** | 5×, 10×, 20× |
| **Plate formats** | E-Plate VIEW 96; standard 96-well; 6–384 well; dishes/flasks |
| **Throughput** | 5 × 96-well plates simultaneously |
| **Imaging** | AI-driven label-free segmentation; cell counting from brightfield |
| **Impedance parameters** | Adhesion strength; proliferation; morphology; migration; differentiation |
| **Environmental control** | Passive (inside incubator) or active (built-in available) |
| **Assay type** | ND |
| **Data type** | Impedance curve (S or downlinkable as numerical data) |
| **Cost band** | £60k–£100k |

**Note:** Impedance does not penetrate thick 3D organoid cores well (signal originates at cell-electrode interface, not interior). Primarily suited to organoid-derived monolayers (e.g. gut epithelial monolayers on Transwell inserts) or surface-attached spheroids.

**Source:** [xCELLigence RTCA eSight](https://www.agilent.com/en/product/cell-analysis/real-time-cell-analysis/rtca-analyzers/xcelligence-rtca-esight-imaging-impedance-741228)

---

### 3.4 TEER — Barrier Function (Gut/BBB Organoids)

Transepithelial/Transendothelial Electrical Resistance measures tight junction integrity in organoid-derived monolayers on Transwell inserts.

| Platform | World Precision Instruments (WPI) EVOM Auto | Mimetas OrganoTEER |
|---|---|---|
| **Method** | AC electrical resistance (12.5 Hz) | Inline impedance sensing in OrganoPlate |
| **Format** | 24- or 96-Transwell plate automation | Microfluidic chip-based |
| **Readout** | Ω·cm² (resistance × area) | Real-time resistance; continuous monitoring |
| **Non-invasive** | Yes — label-free, does not harm cells | Yes |
| **Assay type** | ND | ND |
| **Data type** | Numerical (S) | Numerical (S) |
| **Cost band** | £15k–£30k | £20k–£40k |

**Note:** TEER requires a Transwell-type permeable membrane insert for organoid-derived monolayers, not whole 3D organoids. Whole organoids must first be enzymatically dissociated and re-seeded as monolayers — that process is partially destructive to the 3D architecture.

**Sources:** [WPI EVOM](https://wpiinc.com/blogs/all/evom-used-with-gut-organoid-monolayer-system) | [Mimetas OrganoTEER](https://www.mimetas.com/organoteer)

---

### 3.5 Oxygen & pH Sensing

Non-destructive, non-invasive metabolic readout. Luminescent oxygen sensors embedded in plate bases (spot sensors or foil) respond to oxygen quenching. No reagent consumption; read by a compatible plate reader or fibre-optic reader.

| Platform | Presens SDR SensorDish Reader | PyroScience FireSting-O2 |
|---|---|---|
| **Vendor** | Presens Precision Sensing (Germany) | PyroScience |
| **Method** | Optical (luminescent O₂/pH quenching); sensor spots in dish bases | Optical fibre; spot sensors |
| **Sample format** | 24-well SensorDish (pre-coated sensor spots) | Any vessel with spot; fibre dips in |
| **Parameters** | Dissolved O₂ (pO₂), pH simultaneously | O₂; temperature |
| **Throughput** | 24 wells per run | 4 channels simultaneously |
| **Resolution** | 0.001% O₂ | High resolution |
| **Environmental** | Compatible with standard incubator | Compatible with incubator |
| **Assay type** | ND | ND |
| **Data type** | Numerical (I — downlinkable as time-series) | Numerical |
| **Cost band** | £15k–£25k | £5k–£10k |

**Space relevance:** Oxygen-sensing well plates with embedded luminescent dyes are a strong candidate for miniaturised space assays. No reagents consumed; reader optics are simple (single LED + filter + PMT/photodiode per well); the sensor spot is a few mm² of immobilised dye. Presens has adapted this for organ-chip-integrated sensing (ScienceDirect 2024 paper confirms integration into microfluidic chips).

---

### 3.6 Calcium Imaging — Functional Neuronal / Cardiac Readout

Calcium imaging using genetically-encoded indicators (GCaMP6s, jGCaMP8) or chemical dyes (Fluo-4, Cal-520) reports action potential firing, network synchrony, and excitation-coupling — non-destructively if genetically encoded reporters are used.

- **Instrument platform:** Any confocal/widefield imager with 488 nm excitation and 510–540 nm detection (standard GFP channel). On Incucyte CX3: 2025 update adds confocal fluorescence enabling GCaMP detection in organoids.
- **CalciumZero toolbox (2024, Springer Brain Informatics):** Lentiviral GCaMP6s delivery to iPSC-derived brain organoids; enables long-term non-destructive calcium imaging.
- **Assay type:** ND (genetically encoded); semi-D (chemical dye — dye loading may perturb cell physiology over time)
- **Data type:** Image (I) — time series; extractable as calcium transient amplitude/frequency vectors

---

## 4. Molecular / Omics Readout

### 4.1 Single-Cell RNA Sequencing

All current scRNA-seq workflows are **destructive** (D) — require organoid dissociation, lysis, and cDNA library preparation.

#### Table 4.1 — scRNA-seq Platforms

| Parameter | 10x Genomics Chromium X | Oxford Nanopore MinION (direct RNA) |
|---|---|---|
| **Vendor** | 10x Genomics | Oxford Nanopore Technologies |
| **Method** | Droplet microfluidics; 10x GEM-X barcoding; next-gen sequencing output | Nanopore direct sequencing; native RNA or cDNA |
| **Throughput** | 80K–960K cells per kit; 6-minute chip run | Smaller; Flongle: ~1 Gb; MinION: up to 50 Gb per flow cell |
| **Cell recovery** | ~80% | N/A (sequencing not capture) |
| **Sample types** | Organoid single-cell suspension; all standard 3' and 5' + spatial (Visium) | Single-cell after library prep; or bulk RNA |
| **Dimensions (instrument)** | Chromium X: ~60 cm × 60 cm benchtop | MinION: palm-sized, <100 g, USB 3.0 powered |
| **Power** | Mains (standard lab) | USB (<5 W) |
| **Data output** | FASTq files → cloud/HPC analysis | Real-time base calling; raw fast5/pod5 |
| **Downstream sequencing** | Illumina NovaSeq/NextSeq (separate, large instrument) | Self-contained (nanopore reads) |
| **Assay type** | D | D |
| **Data type** | S (physical library) then I (sequence files) | S (flow cell physical; but data digital once sequenced) |
| **Cost band** | £200k+ instrument; £3k–£8k/sample reagents | MinION: £500–£1k; flow cell: £500–£800; Flongle: £90/cell |

**Engineering note:** Oxford Nanopore's MinION is the only sequencer approaching spacecraft compatibility: USB powered, <100 g, temperature-tolerant operation 10–35°C. The Flongle adapter reduces cost and consumable volume. However, sample preparation (cell lysis, reverse transcription, library prep) remains a complex multi-step wet chemistry workflow requiring centrifuges, thermal cyclers, and precision pipetting — currently incompatible with autonomous closed-loop space hardware. This is the single largest gap between what is scientifically desirable and what is technically feasible in orbit.

**Sources:** [10x Genomics Chromium](https://www.10xgenomics.com/platforms/chromium/product-family) | [Oxford Nanopore MinION](https://nanoporetech.com/products/minion)

---

### 4.2 Spatial Transcriptomics

| Platform | 10x Genomics Visium HD | 10x Genomics Xenium |
|---|---|---|
| **Method** | Sequencing-based spatial; 2×2 µm spots; probe-based | In situ imaging; padlock probe + rolling-circle amplification |
| **Resolution** | 2×2 µm spatial bins | Subcellular; single-molecule detection |
| **Sample requirement** | FFPE or fixed frozen tissue section (4–16 µm) | Fixed frozen or FFPE sections |
| **Gene panels** | Whole transcriptome (unbiased) | Up to 5,000 gene panel |
| **Instrument** | CytAssist slide handler + Illumina sequencer | Xenium Analyzer (proprietary imaging system, large footprint) |
| **Assay type** | D (requires tissue fixation) | D (requires tissue fixation) |
| **Data type** | S (physical section) then I (digital count matrix) | I (image-based in situ) |
| **Cost band** | £200k+; per sample: £1k–£3k | £300k+ instrument; per sample: £1.5k–£4k |

**Note:** Spatial proteomics was named Nature Method of the Year 2024. Emerging platforms (Nanostring CosMx, Akoya PhenoCycler) combine imaging with multi-protein panels at single-cell resolution — destructive but generating rich datasets from a single fixed sample.

---

### 4.3 qPCR

Standard qPCR (destructive) is the workhorse for gene expression confirmation. A standard 96-well thermocycler runs on mains power (~600 W). Miniaturised alternatives (e.g. BioRad CFX, QuantStudio) exist at ~45 kg, 60 cm bench footprint. All require physical sample lysis and RNA extraction — **destructive (D), requires sample return (S)** if sequencing follows, or numerical output if run on orbit.

---

## 5. Drug-Response / Precision Oncology Platforms

### 5.1 End-to-End Organoid Drug-Response Platforms

These platforms integrate culture, drug treatment, and multi-parametric readout into a workflow.

| Platform | Champions Oncology TumorGraft3D | Genedata Screener + HCI | Academic 384-pillar plate (2025) |
|---|---|---|---|
| **Description** | >1,400 patient-derived PDX-organoid (PDXO) library; matrix-free system; indication-specific media | Software orchestration layer across multiple instruments | Automated 3D organoid dispensing into pillar plates; fluorescence IC50 |
| **Drug formats** | Compound library; immune co-culture (FlowHT) | Dose-response curves; multi-assay integration | Single compound or library; 384-well format |
| **Readout types** | Flow cytometry; brightfield imaging; viability | Image (HCI) + biochemical + qPCR | Fluorescence (viability/apoptosis); brightfield |
| **Throughput** | CRO service; not instrument | HTS scale; thousands of compounds | 384-well; automated dispensing |
| **Assay type** | D (viability endpoint) or ND (longitudinal imaging) | D or ND depending on assay | D (endpoint) |
| **Data type** | I + S | I | I |

**Engineering note:** The "StarTrace" platform (bioRxiv 2025) combines multiplexed organoid avatars with paired drug testing for personalised medicine. The non-destructive, longitudinal tracking requirement (images taken serially before endpoint lysis) is the closest current workflow to what a space cassette would need: repeated imaging of the same organoids, then a terminal viability read at the end of the experiment.

---

## 6. Spaceflight-Specific Hardware Context

### 6.1 Known Spaceflight Deployments

| Programme | Hardware | Organoid type | Readout method | Platform |
|---|---|---|---|---|
| BRAINS project (DLR/LSA, 2024-2026) | Yuri Type-IV device | Human midbrain organoids | Viability post-return; neurite outgrowth imaging ground-based | Space Tango CubeLab on ISS |
| NASA iPSC study 2019 (UC San Diego) | Custom sealed containers | Neural organoids | Post-flight ground analysis | ISS |
| C. elegans CIP study (MDPI Life 2023) | Compact Imaging Platform (CIP): 7.5" × 4.5" × 5.5", ~700 g, 3 W USB | C. elegans (model organism) | Dark-field widefield imaging (iPod camera); 1080p video | Proof-of-concept; ISS certification pending |

**Yuri Type-IV / Space Tango CubeLab key points:**
- CubeLab is anodised aluminium, biocompatible, standardised form factor (NanoLab-derivative)
- Fluid management uses surface tension rather than pumps — manifolds designed to prevent bubble trapping in microgravity
- Yuri Type-IV hardware integrates media chambers, organoid culture wells, and basic environmental sensors
- On the 2024/2025 midbrain organoid mission: hardware malfunction prevented scheduled media exchanges, yet organoids remained viable and showed neurite outgrowth (biorxiv 2026) — demonstrating remarkable organoid robustness

### 6.2 Compact Imaging Platform (CIP) — Engineering Reference

The CIP paper (Stocker et al., MDPI Life 2023) is the most hardware-relevant prior art for a space organoid reader:
- **Size:** 19 × 11 × 14 cm (approx. from 7.5"×4.5"×5.5")
- **Mass:** ~700 g
- **Power:** 3 W (5 V, 0.6 A USB)
- **Optics:** Consumer smartphone camera (iPod Touch); white LED ring; dark-field illumination; no external optics; no mechanical focus
- **Resolution:** 1080p video; FOV 15–38 mm² (3× zoom)
- **Limitation:** No confocal; no fluorescence; no z-sectioning; brightfield only; limited to ~100 µm resolution in z

**Source:** [CIP spaceflight paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC9862956/)

---

## 7. What Is Hard to Miniaturise / Automate — Space Design Constraints

This section is the core engineering intelligence for Yuri hardware design.

### 7.1 Optical Sectioning

**Why hard:** Spinning-disk confocal requires a high-speed rotating disk assembly (precision bearings, vibration, multiple optical elements), a high-NA objective in liquid contact with the sample, and a cooled sCMOS camera. In microgravity, liquid meniscus at the objective-sample interface is unstable; spinning disks generate gyroscopic effects affecting spacecraft attitude if uncompensated. **Mitigation:** Replace confocal with structured illumination (no moving parts) or single-plane illumination (light-sheet at small scale). Bespoke miniaturised light-sheet systems (e.g. open-top OPM geometry) have been demonstrated in <5 kg, <20 W configurations by academic groups.

### 7.2 Water Immersion Objectives

**Why hard:** Water immersion objectives require a continuous fluid bridge between lens and sample. In microgravity, this fluid bubble is unstable under vibration. **Mitigation:** Long-working-distance air objectives (sacrifice NA); or design sealed gel-immersed imaging windows; or accept reduced resolution (10× air, NA 0.3, ~2 µm resolution is achievable with air objectives and adequate for gross morphology scoring).

### 7.3 Fluidics / Media Exchange

**Why hard:** Gravity-driven flow does not function; peristaltic pumps are large; precise microfluidic dosing is affected by microgravity bubble formation. The Yuri Type-IV mission demonstrated that missed media exchanges can be tolerated short-term (30 days), but this is experiment-design-limiting. **Mitigation:** Pressure-driven microfluidics (pneumatic actuation); surface-tension-driven passive flow (Yuri/Space Tango approach); electroosmotic flow in sealed channels. Organoid-on-a-chip in sealed microfluidic cassettes (Emulate/Hesperos approach) is more naturally compatible with microgravity than open-well culture.

### 7.4 Library Preparation for Omics

**Why hard:** scRNA-seq, spatial transcriptomics, and proteomics all require multi-step wet chemistry (cell lysis → RNA extraction → reverse transcription → PCR amplification → library construction → sequencing). Each step requires sub-microliter precision pipetting, centrifugation, temperature cycling, and reagent stability at 4°C and −20°C. On orbit, no centrifuges; no −80°C storage; vibration perturbs liquid handling. **Mitigation:** Droplet microfluidics on-chip can replace many manual steps; nanopore direct RNA sequencing eliminates reverse transcription; solid-phase PCR eliminates tubes. However, no complete closed-loop sample-to-sequence workflow exists at <10 kg, <50 W, <10 L. This remains the most immature subsystem for space omics.

### 7.5 Cell/Organoid Settling and Positioning

**Why hard:** Organoids settle by gravity in open wells on Earth; in microgravity they float. This affects: (a) electrode contact in MEA (MaxWell uses PFD solution — viable approach); (b) imaging focal plane (organoids drift out of focus plane); (c) reagent exposure uniformity. **Mitigation:** Microfluidic traps; hydrogel encapsulation (Matrigel already used routinely; also gravitationally neutral); magnetic beads (if organoids can be seeded with magnetic particles); centrifuge (small table-top centrifuge, ~2 kg, has been flown).

### 7.6 Large Data Volume (Light-Sheet, scRNA-seq)

**Why hard:** Light-sheet experiments generate 1–10 TB per session. scRNA-seq generates 30–100 GB of raw sequencing data per sample. ISS downlink bandwidth is ~10 Mbps (practical). **Mitigation:** On-orbit data reduction is mandatory. For imaging: segment organoids, extract morphological features (size, circularity, intensity, texture), discard raw pixels — feature vector is <1 kB per organoid. For sequencing: real-time base-calling + clustering on edge-GPU. The MinION's on-device Guppy base-caller runs at ~50 Mbps; a Jetson Orin NX could handle this within reasonable power (<20 W).

### 7.7 Chemical Reagent Stability

**Why hard:** CellTiter-Glo 3D, antibody panels, nucleic acid reagents all degrade at room temperature. ISS ambient is ~22°C with ±2°C variation. Lyophilised (freeze-dried) reagents are the standard solution for space; Promega does offer lyophilised assay kits for some products. **Mitigation:** Lyophilised reagent pellets rehydrated with culture media on demand; encapsulated in the cassette with foil-sealed blisters.

### 7.8 Fixed / Semi-Fixed Sample Modalities

**Why viable:** Paraformaldehyde fixation → immunofluorescence staining → confocal imaging can all be done in a closed cassette with sequential reagent injection. The fixed sample is stable indefinitely — it can be returned on a future mission for ground-based spatial transcriptomics. This is the **sample-return path**: fix on orbit (chemical; ND to the sample archive but D to live biology), return, analyse on ground.

---

## 8. Destructive vs Non-Destructive Classification

| Assay | Destructive? | Notes |
|---|---|---|
| Brightfield / phase contrast imaging | **ND** | Standard longitudinal monitoring |
| Widefield fluorescence (genetically encoded reporters) | **ND** | GCaMP, GFP-tagged organoids |
| Widefield fluorescence (antibody staining) | **D** (semi-D) | Fixation required; ends live culture |
| Confocal fluorescence (live, encoded reporters) | **ND** | Lower phototoxicity than widefield |
| Light-sheet (native aqueous) | **ND** | Very low phototoxic; live samples |
| Light-sheet (cleared tissue) | **D** | Tissue clearing kills cells; CUBIC/iDISCO involve toxic organic solvents |
| CellTiter-Glo 3D viability (ATP-luminescence) | **D** | Lysis required; terminates culture |
| CellTiter-Blue / Resazurin viability | **ND** | Metabolic reduction; medium can be refreshed |
| Calcium imaging (GCaMP) | **ND** | Long-term compatible |
| Calcium imaging (chemical dye: Fluo-4) | **Semi-D** | Dye loading perturbs physiology |
| MEA electrophysiology | **ND** | Repeated measurements on same organoid |
| TEER | **ND** | For monolayers; non-invasive AC |
| Impedance (xCELLigence) | **ND** | Continuous |
| Oxygen sensing (luminescent foil) | **ND** | Non-consumptive |
| pH sensing (optical) | **ND** | Non-consumptive |
| Conditioned media ELISA / secretome | **ND** | Sample small aliquot; organoid continues |
| scRNA-seq | **D** | Full dissociation + lysis |
| Spatial transcriptomics | **D** | Fixation + sectioning |
| qPCR | **D** | Lysis required |
| Proteomics (MS) | **D** | Lysis required |
| Drug response (imaging-based endpoint) | **ND** (longitudinal) then **D** (terminal viability) | Mixed workflow |

---

## 9. Image-Based (Downlinkable) vs Sample-Return Assays

| Assay class | On-orbit data type | Sample return needed? |
|---|---|---|
| Brightfield morphology | Image/feature vector | No |
| Fluorescence imaging (encoded reporters) | Image/feature vector | No |
| Calcium transient (GCaMP video) | Compressed video / activity trace | No |
| MEA spike data | Compressed spike trains | No |
| O₂/pH time-series | Numerical CSV | No |
| Conditioned media biomarkers (if on-chip sensing) | Numerical | No |
| TEER | Numerical | No |
| PFA-fixed immunostained organoid (post-fix imaging) | Image | No (but sample can return for higher-res ground imaging) |
| PFA-fixed organoid (no on-orbit imaging) | None on orbit | **Yes** — return for spatial omics |
| scRNA-seq library | Sequence file if MinION on orbit | MinION consumable return only; data digital |
| Proteomics lysate | None on orbit | **Yes** — MS hardware too large for orbit |
| Untouched live organoid cryo-preserved | None | **Yes** — full biobank return |

---

## 10. Source List

1. [Molecular Devices ImageXpress Micro Confocal](https://www.moleculardevices.com/products/cellular-imaging-systems/high-content-imaging/imagexpress-micro-confocal)
2. [Molecular Devices ImageXpress HCS.ai](https://www.moleculardevices.com/products/cellular-imaging-systems/high-content-imaging/imagexpress-hcs-ai)
3. [Molecular Devices CellXpress.ai](https://www.moleculardevices.com/products/3d-biology/cellxpress-ai-automated-cell-culture-system)
4. [Revvity Opera Phenix Plus](https://www.revvity.com/product/opera-phenix-plus-system-hh14001000)
5. [Revvity Opera Phenix Plus brochure](https://resources.revvity.com/pdfs/bro-opera-phenix-high-content-screening-system.pdf)
6. [Yokogawa CellVoyager CQ1](https://www.yokogawa.com/us/solutions/products-and-services/life-science/high-content-analysis/cellvoyager-cq1/)
7. [Yokogawa CQ1 brochure (Bulletin 80J01A01-01E)](https://web-material3.yokogawa.com/2/19364/files/Bulletin80J01A01-01E.pdf)
8. [Sartorius Incucyte Organoid Assay](https://www.sartorius.com/en/applications/life-science-research/live-cell-assays/organoid-assay)
9. [Sartorius Incucyte SX5](https://www.sartorius.com/en/products/live-cell-imaging-analysis/live-cell-analysis-instruments/sx5-live-cell-analysis-instrument)
10. [Sartorius Incucyte CX3 (Organoid module v2025c)](https://www.sartorius.com/en/products/live-cell-imaging-analysis/live-cell-analysis-software/incucyte-organoid-analysis-software)
11. [CytoSMART Lux3](https://cytosmart.com/products/cytosmart-lux3-br)
12. [Miltenyi UltraMicroscope Blaze](https://www.miltenyibiotec.com/IT-en/products/ultramicroscope-blaze.html)
13. [Bruker/Luxendo TruLive3D Imager](https://www.bruker.com/en/products-and-solutions/fluorescence-microscopy/light-sheet-microscopes/trulive3d-imager.html)
14. [BMG CLARIOstar Plus](https://www.bmglabtech.com/en/clariostar-plus/)
15. [BMG PHERAstar FSX](https://www.bmglabtech.com/en/pherastar-fsx/)
16. [Tecan Spark](https://www.tecan.com/spark-overview)
17. [Promega CellTiter-Glo 3D Cell Viability Assay](https://www.promega.com/products/cell-health-assays/cell-viability-and-cytotoxicity-assays/celltiter-glo-3d-cell-viability-assay/)
18. [MaxWell Biosystems MaxTwo](https://www.mxwbio.com/products/maxtwo)
19. [MaxWell Organoid applications](https://www.mxwbio.com/applications/organoids)
20. [Axion Biosystems Maestro MEA](https://www.axionbiosystems.com/products/maestro-mea)
21. [Axion Organoid MEA plates](https://www.axionbiosystems.com/products/mea-plates/organoid-mea)
22. [Agilent xCELLigence RTCA eSight](https://www.agilent.com/en/product/cell-analysis/real-time-cell-analysis/rtca-analyzers/xcelligence-rtca-esight-imaging-impedance-741228)
23. [WPI EVOM TEER technology](https://wpiinc.com/blogs/all/evom-used-with-gut-organoid-monolayer-system)
24. [Mimetas OrganoTEER](https://www.mimetas.com/organoteer)
25. [10x Genomics Chromium](https://www.10xgenomics.com/platforms/chromium/product-family)
26. [10x Genomics Visium HD and Xenium](https://www.10xgenomics.com/spatial-transcriptomics)
27. [Oxford Nanopore Technologies — products and specifications](https://nanoporetech.com/products/specifications)
28. [Oxford Nanopore MinION](https://nanoporetech.com/products/sequence/minion)
29. [Genedata Screener for organoids](https://lifesciences.danaher.com/us/en/we-see-a-way/genedata-screener-ai-organoid-assay-analysis.html)
30. [Champions Oncology TumorGraft3D](https://www.championsoncology.com/tumorgraft-3d-tumor-models-platform)
31. [CalciumZero GCaMP toolbox for brain organoids (2024)](https://braininformatics.springeropen.com/articles/10.1186/s40708-024-00248-5)
32. [Non-destructive organoid PDO microfluidic chemiluminescence (2025)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12786359/)
33. [Non-invasive label-free imaging analysis of 3D brain organoids (Nature Sci Rep 2024)](https://www.nature.com/articles/s41598-024-72038-2)
34. [Organ chip integrated multifunctional sensors O₂/pH (ScienceDirect 2024)](https://www.sciencedirect.com/science/article/pii/S0956566324006894)
35. [Space Tango CubeLab for microgravity R&D](https://spacetango.com/latest/space-tango-advances-neurological-disease-research-in-microgravity/)
36. [ISS midbrain organoid study — Yuri Type-IV (bioRxiv 2026)](https://www.biorxiv.org/content/10.64898/2026.05.04.722620v1.full.pdf)
37. [Lab-on-chip for space research (Microchimica Acta 2023)](https://link.springer.com/article/10.1007/s00604-023-06084-4)
38. [Compact Imaging Platform (CIP) for C. elegans spaceflight (MDPI Life 2023)](https://pmc.ncbi.nlm.nih.gov/articles/PMC9862956/)
39. [Miniaturised 3D organoid culture for ultra-high-throughput screening (JMCB 2020)](https://academic.oup.com/jmcb/article/12/8/630/5873160)
40. [Nature Method of the Year 2024 — Spatial Proteomics](https://www.nature.com/collections/dbifijbacd)
41. [Comparative review spatial transcriptomics platforms (PMC 2025)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11744898/)
42. [StarTrace multiplex organoid drug testing (bioRxiv 2025)](https://www.biorxiv.org/content/10.1101/2025.02.12.637574.full.pdf)
43. [High-content drug screening 384-pillar plate organoids (PMC 2025)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12718461/)

---

*End of report. Total word count: ~5,500 words.*
