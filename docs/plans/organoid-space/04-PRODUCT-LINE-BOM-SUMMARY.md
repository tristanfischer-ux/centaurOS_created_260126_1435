# Organoid Product Line — First-Pass Cost Summary (all 8 machines)

*Extends the lead-product BoM (`01-LEAD-PRODUCT-DESIGN-PACK.md`) to the whole set, so every machine is RFQ-ready. First-pass component-class costs + bands (not fabricated line-items) — grounded in the four research reports. Confirm against live quotes before use.*

## The shared platform (build once, reuse everywhere — biggest cost-down lever)

Report 04's "PCB + microfluidics + optics cluster." Standardise these and every machine is a variation:
- **Shared control PCB** (MCU + solenoid/pump drivers + edge compute + secure downlink): £120–260
- **Micro pump + solenoid microvalves** (Bartels/TTP mp6-class + 2–4 valves): £250–500
- **Optical sensing readout** (phase-fluorimeter for O₂/pH spots): £150–350
- **Imager module** (CMOS + objective + LED + edge compute, Incucyte-in-incubator class, <5 W): £300–700
- **Thermal control** (PTC/Peltier + NTC, 37 ± 0.2 °C, CO₂-independent): £150–400

## Consumables (blades) — build cost → retail (razor-and-blade annuity)

| Machine | Build | Retail band | Note |
|---|---|---|---|
| **M2** Universal cassette | ~£4.35 | £150–400 | full BoM in design pack §D1 |
| **M3** Smart assay cassette | ~£45–125 | £400–900 | M2 + CMOS MEA array on the glass floor (MaxWell-class) |
| **M8** Return/fixation cassette | ~£6–9 | £200–500 | M2 + fixative/RNAlater reservoirs + passive cold-sink |
| **C3** Reagent/media pack (not modelled as a machine) | ~£2–4 | £40–120 | pure consumable |

*Consumable gross margin 25–85% (report 04). The annuity is here.*

## Hosts / instruments (razors — loss-leaders, capital)

| Machine | Distinctive subsystems (on top of shared platform) | Build band |
|---|---|---|
| **M1** RPM-appliance | dual-axis RPM gimbal (2× BLDC + encoders + slip-ring + isolation) £600–1,200; incubation; cassette dock | **£2,000–4,150** |
| **M4** Live-cell imager | just the imager module + body (subset of shared cluster) | **£450–900** |
| **M6** Perfusion bioreactor | culture vessel + micro-pump + valves + silicone gas membrane + optical sensing + camera + thermal, CubeLab-4U space-qualified | **£3,500–7,000** (space QA premium) |
| **M7** 1g centrifuge | precision centrifuge rotor + drive + encoder + balance; middeck-locker enclosure | **£1,500–3,500** |
| **M5** CubeLab carrier | 9U frame + universal power/data/mech interface + N bay docks; GEVS-rated | **£1,200–3,000** (structure + interface) |

*Space-deployed units (M5–M8) carry a QA/qualification premium (GEVS vibration, materials, biocontainment, documentation) not in the ground units (M1/M4) — a real multiplier, flagged not hidden.*

## The economics in one line

One ground **M1 appliance** (£2–4k, sold/subscribed) running a **£4 M2 cassette** weekly at £150–400 retail = the recurring-revenue engine. The space units (M5–M8) are the differentiated capability that generates the sellable µg dataset; they carry a QA premium and depend on the return/cold-chain constraint (report 03). **Yuri's binding blocker across all of it: no qualified contract manufacturer yet** — this line + the design pack are the RFQ starting point.

## Honesty notes
- Costs are component-class first-pass bands, not fabricated MPN-level line-items. The chain would produce the auto-costed, live-priced BoM once wired + credits allow (deferred — see BLOCKERS).
- M3's MEA cost dominates its cassette build (£40–120) — the one place the razor-and-blade margin compresses; worth confirming whether MEA lives on the consumable or a reusable reader interface.
