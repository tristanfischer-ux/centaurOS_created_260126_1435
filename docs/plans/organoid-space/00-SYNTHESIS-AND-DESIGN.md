# Organoids in Space — Synthesis, Plan & Machine Designs

*Prepared by Claude Code (terminal) for Yuri, 2026-07-18. Built on four cited research reports in `research/` (cultivation, assay, space/microgravity hardware, automation/consumables) and validated against the ForgeOS functional-form composer — every machine below composes a coherent, connected form and, where space-deployed, fits its declared launch envelope.*

---

## 1. The one-paragraph thesis

Organoids are Yuri's product because the FDA's move to replace animal testing with organoids/organ-on-chip (NAMs) turns "better organoids" into something pharma already pays for on the ground — and microgravity is a *quality differentiator* for a cell-type-dependent subset of tissues (brain, cardiac, tumour show the clearest orbital effects). The hardware that wins is **not a big bespoke orbital lab**; it is a **sealed, autonomous, cassette-driven perfusion bioreactor the size of a paperback**, plus the razor (a ground RPM-appliance + a flight carrier) and the data layer (a smart assay cassette). The consumable cassette is the recurring-revenue centre; everything else exists to run it, read it, and bring it home alive.

## 2. What the research changed about the design (the five load-bearing facts)

These come straight from the four reports and they *invert* bench practice:

1. **Microgravity removes the need for scaffolding/matrix — no sedimentation.** (Redwire BFF precedent, report 03/01.) The terrestrial dome/hanging-drop/AggreWell geometry is gravity-dependent and *fails on orbit*; scaffold-free suspension is the native space method. This is the single most important design fact — it simplifies the consumable.
2. **No buoyancy convection → gas exchange & mixing are purely diffusive.** (Report 03.) Organoids >~300 µm or cultures >7 days *require active perfusion past the tissue* + an embedded silicone gas-permeable membrane. A passive container is not enough; the cassette must be an active bioreactor with a micro-pump.
3. **No free liquid surfaces — surface tension dominates.** (Report 03/04.) Fully sealed, zero-headspace, positive-displacement fluidics, pre-degassed media, and **tortuous-path bubble traps are non-negotiable** (bubbles don't rise → they lodge on and kill tissue).
4. **Full autonomy in ~1 L / 10–20 W.** (Report 03.) ISS crew time ≈ $1M/hour; every feed/fix/image/sample event must be robotic. This bounds the whole design: micro-pumps, solenoid valves, on-board camera, thermal control, all inside a CubeLab-class envelope.
5. **The best on-orbit data is non-destructive and downlinkable.** (Report 02.) MEA electrophysiology (neural/cardiac) + non-contact optical O₂/pH + periodic brightfield morphology is the trio: <10 MB/day, no reagents, no sample return needed for the *data* product — and uniquely microgravity-sensitive. scRNA-seq / spatial omics are *not* feasible on orbit (need centrifuge, cryo, pipetting) → those ride the return sample.

**Design corollary (razor-and-blade):** keep the cassette *passive where possible* (optical sensing read through a glass floor, ID chip, no electronics on the disposable), put the pumps/valves/optics/compute in the reusable *host*. The one exception is the smart assay cassette, where the MEA electrode array has to be on the consumable.

## 3. The universal cassette interface (the blade — design this first)

Per report 04's convergent spec (ANSI/SLAS is the automation-compatible footprint every vendor grips):

| Domain | Spec |
|---|---|
| Footprint | 127.76 × 85.60 mm (ANSI/SLAS-1); asymmetric D1 chamfer (anti-misload) |
| Height | 14.35 mm standard · up to 44 mm tall (high-content imaging / MEA) |
| Mass | < 80 g dry |
| Body / floor | COC body + 170 µm #1.5 borosilicate glass floor (confocal-grade, low autofluorescence) |
| Fluidics | Sealed, zero-headspace; **rotation replaces tilt** for passive perfusion in 0 g; optional ISO 80369-7 Luer for active pump; integral tortuous-path bubble traps; degassed prime |
| Gas | Embedded silicone gas-permeable membrane adjacent to culture space; CO₂-independent HEPES media (no gas atmosphere to manage) |
| Sensing | Non-contact optical O₂/pH/CO₂ spots read through the floor (PreSens-class); electronics stay in the host |
| ID | 1-wire ROM (DS2401) + HF RFID (survives gamma + −196 °C) + 2D Data Matrix |
| Survival | GEVS 15 g launch vibration; 25 kGy gamma sterile (SAL 10⁻⁶); triple biocontainment for return |

This single interface is the common denominator across the ground appliance, the flight carrier, the assay reader, and the return capsule — get it right and the machines become variations on one dock.

## 4. The machine set (mapped to Yuri's ladder + composer + priority)

Eight machines span the workflow **source → form → culture → mature → assay → preserve/return**. Every one composes a coherent connected form in the ForgeOS composer (verified 2026-07-18); the composer medium is how *function drove the form*.

| # | Machine | Ladder | Composer medium | Space envelope | Role |
|---|---|---|---|---|---|
| **M2** | **Universal organoid cassette** (blade) | all stages | `sealed_cartridge` | ANSI/SLAS card | The recurring-revenue consumable. **Build first.** |
| **M1** | **Organoid RPM-appliance** ("µg incubator in a box") | Ground | `rotation` (+incubation)¹ | benchtop | The ground flagship razor; subscription anchor. |
| **M3** | **Smart assay cassette** (MEA + optical + window) | Data | `sealed_cartridge` | ANSI/SLAS tall | Turns every run into sellable, downlinkable data. |
| **M4** | **In-host live-cell imager module** | Data | `light` / `image_plane` | in-host | Reads the cassette window; feeds the data moat. |
| **M6** | **Autonomous perfusion bioreactor** | Return | `culture_fluid` | CubeLab 4U (<1 L, 10–20 W) | The core orbital culture unit — the hard, differentiated bit. |
| **M5** | **CubeLab organoid carrier** (rack/bus) | Access/Return | `structural_carrier` | CubeLab 9U | Holds N cassettes; standard fit-anywhere payload. |
| **M7** | **In-orbit 1g reference centrifuge** | cross-cutting | `rotation` | middeck locker | Paired-1g control → credibility → sellable data. |
| **M8** | **Sample-return / fixation cassette** | Return | `sealed_cartridge` | ANSI/SLAS card | Auto-fixes/cools at mission end; capsule-compatible. |

¹ **Honest limitation:** M1 is a *composite host* (RPM motion + CO₂/temp incubation + perfusion + imaging in one enclosure). The composer resolves it to its dominant medium (`rotation`) and forms that; it does not yet *compose several media into one enclosure*. This is the known "composite-host" gap — see §7. For now M1 is designed as a rotation host that docks the cassette and hosts the M4 imager + incubation subsystems.

**Priority (research × Yuri's "design-first six"):** M2 → M1 → M3 → M6. M2+M1 earn money on the ground *now* (no launch); M3 opens the data business; M6 is the orbital capability. M7 is the credibility multiplier that makes the M3/M6 data sellable.

## 5. Per-machine design

### M2 — Universal organoid cassette (the blade) · `sealed_cartridge`
- **Function → form:** a thin ANSI/SLAS laminate; COC body + glass floor; N scaffold-free culture chambers (`culture_chamber_count` drives the array), each with a domed suspension well, an embedded gas membrane, optical O₂/pH spots, and a shared perfusion channel with bubble traps; keyed dock rail (the razor-and-blade `removable_interface`).
- **Consumable economics:** ~€3–6 build → hundreds of $/plate retail (report 04). The annuity.
- **Why this shape:** scaffold-free + no headspace + rotation-driven flow are the microgravity musts (§2.1–2.3).

### M1 — Organoid RPM-appliance (the ground razor) · `rotation`
- **Function → form:** dual-axis RPM gimbal cradling the docked cassette, inside a sealed enclosure with CO₂-independent incubation, a perfusion manifold, and the M4 imager on a port. Benchtop, quiet, sensor-instrumented.
- **Why:** the ground product needs no launch → recurring revenue today; the ~60+ RPM-2.0 groups are the installed base to automate ("automate the manual", principle 6). Differentiation is the cassette + data, not the gimbal.

### M3 — Smart assay cassette (the data blade) · `sealed_cartridge`
- **Function → form:** M2 + an on-floor CMOS **MEA** electrode array (the one thing that must live on the consumable) + optical spots + a brightfield window. Tall (44 mm) variant.
- **Why MEA:** report 02's top pick — non-destructive, <10 MB/day, reagent-free, uniquely microgravity-sensitive (neural maturation, cardiac rhythm). Perfluorodecalin anchoring solves electrode-settling in 0 g.

### M4 — In-host live-cell imager module · `light`/`image_plane`
- **Function → form:** compact widefield/phase imager (<5 W, Incucyte-in-incubator paradigm) that reads the cassette glass floor through a window; illumination + objective + detector + edge compute. Lives inside M1 (ground) and M6 (orbit).

### M6 — Autonomous perfusion bioreactor (the orbital core) · `culture_fluid`
- **Function → form:** sealed culture vessel + micro-peristaltic/positive-displacement pump + solenoid valves + silicone gas membrane + optical sensors + camera + thermal control, fully robotic, in a **CubeLab 4U (<1 L, 10–20 W)** envelope. Docks the M2/M3 cassette. Synthecon HARV is the ISS-flown precedent; Emulate/TissUse the perfusion-architecture model.
- **Why:** closes the >300 µm / >7-day perfusion requirement (§2.2) with full autonomy (§2.4).

### M5 — CubeLab organoid carrier (the bus/rack) · `structural_carrier`
- **Function → form:** a standard **CubeLab 9U** carrier holding N cassette/bioreactor bays with a universal power/data/mechanical interface — the "fit-anywhere, vehicle-agnostic" payload (principles 1–2). Space Tango CubeLab (10×10×10 cm/U, 270+ experiments flown) is the target format Yuri cassettes already integrate with.

### M7 — In-orbit 1g reference centrifuge · `rotation`
- **Function → form:** a compact centrifuge spinning a paired 1 g control cassette *in the same environment* as the µg sample — the internal control (principle 5). BioSpin already demonstrates in-flight partial-gravity (Moon/Mars/0 g) control; this is the discrete, manufacturable mechanism version. Middeck-locker envelope.

### M8 — Sample-return / fixation cassette · `sealed_cartridge`
- **Function → form:** M2 with reservoirs of fixative/RNAlater and a passive cold-sink; auto-fixes or chemically stabilises at mission end, mates Varda/ATMOS-class re-entry capsules, GEVS-rated. **Cold-chain is the binding return constraint** (ISS has no vapour-LN2; MELFI floors at −80 °C) → chemical stabilisation is the pragmatic fallback to cryo.

## 6. "What you'd need" — the systems shopping list

Cross-cutting subsystems that recur across the set (report 04's "PCB + microfluidics + optics cluster" — standardise these once):
- **Fluidics:** micro positive-displacement/peristaltic pump, solenoid microvalves, tortuous-path bubble traps, degassing membrane, ISO 80369-7 Luer, silicone gas-exchange membrane.
- **Sensing:** non-contact optical O₂/pH/CO₂ (PreSens-class), NTC temperature, optional TEER; MEA CMOS array (assay cassette only).
- **Optics:** widefield/phase imager module (<5 W), LED illumination, glass-floor window.
- **Compute/control:** shared control PCB, edge compute + secure downlink, solenoid/pump drivers, camera trigger.
- **Thermal:** 37 ± 0.2 °C control, CO₂-independent HEPES media (removes gas management).
- **Mechanical:** dual-axis RPM gimbal (ground), centrifuge rotor (control), CubeLab carrier + universal interface, GEVS-rated restraints, biocontainment.
- **Consumable materials:** COC body, #1.5 glass floor, gamma-sterile, RFID/1-wire ID.
- **Open Yuri gap (principle 4):** no qualified contract manufacturer yet — the whole set assumes outsourced manufacture (partner-qualification pack + RFQ-ready drawings, not an in-house line).

## 7. Composer/engine follow-on (what this exposed)

- **Composite-host gap (confirmed real, now scoped):** M1 and M6 are single-enclosure integrations of *several* media (rotation + culture_fluid + light + thermal). The composer forms the dominant medium and docks the rest as subsystems; it does not yet *co-compose* multiple media into one host. This is the next composer capability after the cassette + carrier families (both shipped). It is the difference between "designs a centrifuge" and "designs the RPM-appliance that spins **and** incubates **and** images **and** docks a cassette."
- Everything else in the set composes today.

## 8. Recommended next step

Run the **lead worked example through the full ForgeOS design chain** for a real BoM + drawings + dossier: **M2 universal organoid cassette + M1 RPM-appliance host**, with **M3 smart assay cassette** as the data variant. That produces the design-for-manufacture + bill-of-materials pass Yuri needs for a contract-manufacturer RFQ (principle 4), and stress-tests the composer's new cassette/carrier families on a real, funded use-case (tumour-organoid drug response — the NAM/precision-oncology tailwind).

*Sources: `research/01-cultivation-equipment.md`, `research/02-assay-equipment.md`, `research/03-space-microgravity-hardware.md`, `research/04-automation-consumables.md` (163 cited sources total).*
