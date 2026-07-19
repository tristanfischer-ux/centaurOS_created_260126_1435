# Lead Product Design Pack — Organoid Cassette + RPM-Appliance Host

*Deterministic design-for-manufacture pack for Yuri's lead organoid product. Built from the composer forms (`lead-product-composer-forms.json`) + the four research reports. Produced WITHOUT the LLM design chain — see note below. Use-case: tumour-organoid drug-response (the FDA/NAM precision-oncology tailwind).*

> **Why deterministic, not a chain dossier (2026-07-19):** the ForgeOS design chain was unavailable for a clean run — 4 wedged zombie chain processes from the makers-kit queue held the checkout, OpenRouter credit was ~$50 (402 risk mid-run), and the composer is not yet wired into the chain (it would generic-box this brand-new archetype). This pack delivers the same intent — a manufacturable spec + BoM for a CM RFQ — using the composer form directly. Run the chain later, once the checkout is clear, credits topped up, and the composer wired, to add the auto-costed dossier + drawings.

---

## A. Product definition

Two co-designed products against **one cassette dock** (razor-and-blade):

- **M2 — Universal Organoid Cassette** (the blade / consumable): a sealed, ANSI/SLAS microfluidic card that grows and perfuses scaffold-free organoids and reads them non-destructively. The recurring-revenue product.
- **M1 — Organoid RPM-Appliance** (the razor / host): a benchtop sealed enclosure that docks the cassette, applies random-positioning motion, incubates (CO₂-independent), perfuses, and images — the ground flagship, no launch needed.

The same cassette also runs in the flight bioreactor (M6) and return capsule (M8); design the dock once.

## B. The composed form (from the composer, verified)

**M2 cassette** — `sealed_cartridge`, axis `planar-card`, **52 placed volumes, one connected component**, envelope 127.76 × 85.60 × 14.35 mm:
- `card_substrate` — full-footprint COC laminate body (chassis)
- `fluidic_layer` — bonded microfluidic layer
- `reagent_reservoirs` ×24 — the scaffold-free culture chambers (count = `culture_chamber_count`)
- `inlet_ports` ×24 — perfusion I/O
- `detection_window` — glass read zone (optical sensing + imaging)
- `dock_interface` — keyed rail; the razor-and-blade `removable_interface` to the host

**M1 host** — `rotation`, axis `rotary-stack`, 3 roles (motor_base, rotor cradling the cassette, lid), envelope 400 × 400 × 450 mm. *Composite-host note: the composer forms the dominant medium (RPM motion); incubation + perfusion + imaging are docked subsystems (see synthesis §7).*

## C. Engineering specification

### C1. M2 Universal Organoid Cassette

| Parameter | Spec | Rationale (report) |
|---|---|---|
| Footprint | 127.76 × 85.60 mm (ANSI/SLAS-1), D1 anti-misload chamfer | automation-compatible; every liquid handler grips it (04) |
| Height | 14.35 mm (imaging/MEA tall variant 44 mm) | SLAS heights (04) |
| Mass | < 80 g dry | robot moment + launch mass (04) |
| Culture chambers | 24 scaffold-free suspension wells, domed | no scaffold needed in µg; SBS-24 throughput (01/03) |
| Body / floor | COC body + 170 µm #1.5 borosilicate glass floor | confocal-grade, low autofluorescence, gamma-stable (04) |
| Fluidics | sealed, zero-headspace; rotation-driven passive perfusion; ISO 80369-7 Luer for active pump; tortuous-path bubble traps; degassed prime | surface tension + no-convection + bubble-kill (03) |
| Gas | embedded silicone gas-permeable membrane per chamber; CO₂-independent HEPES media | diffusive-only exchange; removes gas management (03/04) |
| Sensing | non-contact optical O₂/pH/CO₂ spots (PreSens-class) read through floor | electronics stay off the disposable (04) |
| ID | DS2401 1-wire ROM + ISO 15693 HF RFID + Data Matrix | survives gamma + −196 °C (04) |
| Sterility / survival | 25 kGy gamma (SAL 10⁻⁶); GEVS 15 g / 20–2000 Hz vibration; triple biocontainment (return) | ISS payload rules (03/04) |

### C2. M1 RPM-Appliance Host

| Subsystem | Spec |
|---|---|
| Motion | dual-axis random-positioning gimbal, 0–20 rpm, encoders, vibration isolation |
| Cassette dock | keyed rail mating the M2 `dock_interface`; fluidic + optical + 1-wire/RFID pickup |
| Incubation | 37 ± 0.2 °C, CO₂-independent (no gas bottle); humidity control |
| Perfusion | micro positive-displacement/peristaltic pump + solenoid microvalves driving the cassette Luer |
| Imaging | in-host live-cell imager module (M4): widefield/phase, < 5 W, reads cassette window |
| Control/data | shared control PCB, edge compute, secure downlink/USB, camera trigger |
| Enclosure | sealed benchtop, ~400 × 400 × 450 mm, quiet, sensor-instrumented |

## D. Bill of materials (first-pass, DFM-oriented)

### D1. M2 cassette — per-unit BoM (target CM cost)

| Line | Component | Qty | Basis / example | Est. unit cost |
|---|---|---|---|---|
| 1 | COC injection-moulded body | 1 | TOPAS 6013 grade, gamma-stable | £0.60 |
| 2 | #1.5 borosilicate glass floor, laser-cut | 1 | 170 µm, 128×86 | £0.45 |
| 3 | Microfluidic layer (COC or PSA laminate) | 1 | die-cut + bonded | £0.35 |
| 4 | Silicone gas-permeable membrane | 1 | PDMS/silicone sheet, die-cut | £0.20 |
| 5 | Optical O₂ + pH sensor spots | 2 | PreSens SP-PSt3 / HP5 class | £1.20 |
| 6 | Bubble-trap / hydrophobic vent (PTFE) | 1 | 0.2 µm PTFE membrane | £0.15 |
| 7 | Luer/ISO-80369 port inserts | 2 | moulded | £0.10 |
| 8 | 1-wire ROM ID (DS2401) | 1 | Maxim | £0.08 |
| 9 | HF RFID inlay (ISO 15693) | 1 | NXP ICODE | £0.12 |
| 10 | PSA seals, foil port caps, assembly, gamma sterilisation, QC | — | contract-manufactured | £1.10 |
| | **Cassette total (build)** | | | **≈ £4.35** |
| | *Retail band (razor-and-blade)* | | organ-chip market $/plate (04) | **£150–400** |

*Smart assay variant (M3) adds a CMOS MEA electrode array on the glass floor (+£40–120 build, MaxWell-class) — the one component that must live on the consumable.*

### D2. M1 host — indicative BoM (capital instrument, loss-leader)

| Subsystem | Key components | Est. cost band |
|---|---|---|
| RPM gimbal | 2× BLDC + encoders, slip-ring, frame, isolation | £600–1,200 |
| Perfusion | micro pump (Bartels/TTP mp6 class) + 4× solenoid microvalves | £250–500 |
| Incubation/thermal | PTC heater, Peltier option, NTC sensors, controller | £200–400 |
| Imaging module (M4) | CMOS sensor, objective, LED illum, edge compute (Pi/Jetson) | £300–700 |
| Sensing readout | optical phase-fluorimeter for the cassette spots | £150–350 |
| Control PCB + PSU + enclosure + firmware | shared board, 28 V/mains PSU, sealed housing | £500–1,000 |
| | **Host total (build)** | **≈ £2,000–4,150** |

**Unit economics:** the host is the loss-leader; the annuity is the cassette (£4 build → £150–400 retail, 25–85% gross per report 04). One host running a 24-well cassette weekly = the subscription model.

## E. DFM notes for the contract manufacturer (the RFQ ask)

- **Cassette:** injection-moulded COC + laminated microfluidics + glass floor is a **standard organ-chip CM process** — target a microfluidics CM (e.g. a COC/lab-on-chip house), not a general plastics shop. Terminal gamma sterilisation, SAL 10⁻⁶. Tolerances: ±0.25 mm footprint (automation), ±25 µm fluidic features. **This is Yuri's open gap — no qualified CM partner yet (principle 4); this pack is the RFQ starting point.**
- **Host:** conventional electromechanical assembly; outsource to a contract electronics/mechatronics builder. RPM gimbal is the long-lead custom item.
- **Standardise the PCB + microfluidics + optics cluster once** (report 04) and reuse across M1/M3/M4/M6 — the biggest BoM cost-down lever.

## F. What's still needed (open decisions for Tristan)

1. **Lead organoid type** — tumour (drug-response, NAM tailwind) assumed; confirm vs neural/cardiac (which give the strongest *microgravity* MEA data).
2. **CM partner qualification** — the binding blocker; this pack → RFQ to 2–3 microfluidics CMs.
3. **Active vs passive cassette** — passive (rotation-driven, cheaper) for ground/most, active-pump only where perfusion demands it.
4. **Chain dossier** — when the checkout is clear + credits topped up + composer wired, run M2+M1 through the full chain for the auto-costed BoM + drawings dossier to append here.

*Composer forms: `lead-product-composer-forms.json`. Research: `research/01–04`. Synthesis: `00-SYNTHESIS-AND-DESIGN.md`.*
