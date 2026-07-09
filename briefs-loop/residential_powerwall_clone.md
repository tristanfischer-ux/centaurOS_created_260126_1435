# Residential Wall-Mounted Battery Energy Storage — Powerwall-Class Clone (Experiment)

We are designing a **residential, wall-mounted, all-in-one battery energy storage system** in the same product class as a Tesla Powerwall 3: a single outdoor-rated cabinet that integrates the LFP battery pack, battery management, hybrid bidirectional inverter / PCS, solar DC inputs (MPPTs), thermal management, and the home / grid interface. This is an **experimental competitive-equivalent design study** for Fractional Forge / ForgeOS — **not** a Tesla product, not a reverse-engineer of Tesla firmware or proprietary pack architecture, and not for manufacture under Tesla trademarks. Public Powerwall-class performance envelopes are used only as **market-anchor targets**.

**Market anchors (specs + install clearances + self-check table):** see [`residential_powerwall_market_anchors.md`](./residential_powerwall_market_anchors.md). Design and score the dossier against that table. Primary public sources: Tesla Energy Library UK datasheet + Backup Gateway 2 install manual (linked in the anchors doc).

Target market: UK homes with rooftop PV, seeking whole-home backup, self-consumption, and optional grid services. Single-phase 230 V / 50 Hz domestic supply. Installer-fit on an exterior wall or floor plinth beside the consumer unit / generation meter.

## System description

- Lithium iron phosphate (LFP) prismatic cells in a sealed pack inside a slim wall-mount enclosure
- Integrated battery management (cell / module / pack) with isolation monitoring
- Integrated hybrid bidirectional inverter (PCS): charges from PV and/or grid; discharges to home loads and/or grid
- On-board solar DC inputs with multiple MPPTs (PV couples DC-side into the unit — no separate string inverter required for the baseline design)
- Liquid or high-performance forced-air thermal management sized for continuous rated AC power in UK outdoor ambient
- Backup / islanding interface compatible with a separate backup gateway or changeover arrangement (gateway may be a companion product; state the interface clearly)
- Communications: Wi-Fi / Ethernet; local EMS for self-consumption, time-of-use, and backup reserve
- Optional stackable DC expansion battery modules (same usable kWh class each) behind or beside the master unit — design the **master unit** first; expansion is a stated scalability path, not required for the baseline BoM to close

## Key constraints (baseline = one master unit)

State these as the brief’s hard targets. The engineering contract / lock-gate for class `bess` must be able to derive: `nameplate_capacity_kwh`, `continuous_power_kw`, `cell_count`, `dc_bus_voltage_v`.

- **Usable energy capacity:** 13.5 kWh (beginning of life, AC-side usable — the headline homeowner number)
- **Nameplate / total battery energy:** approximately 14.0 kWh (pack energy before usable reserve / DoD margin)
- **Continuous AC power (on-grid):** 11.04 kW at 230 V single-phase (≈ 48 A continuous)
- **Peak / backup capability:** support locked-rotor starting of large residential loads up to approximately 185 A LRA for short duration (state the PCS surge rating honestly)
- **Round-trip efficiency (PV → battery → home/grid):** at least 89% beginning of life under datasheet conditions
- **Battery chemistry:** lithium iron phosphate (LFP)
- **Pack / DC bus voltage:** design a residential high-voltage DC architecture consistent with an integrated hybrid inverter (state nominal `dc_bus_voltage_v` in the contract — typically several hundred volts for a wall hybrid, **not** a 1,500 V utility container bus). Do **not** invent a 1,500 V container DC bus for this product.
- **PV DC input:** up to 20 kW STC aggregate; at least 3 MPPTs; PV operating window suitable for UK residential strings (state Voc / MPPT ranges in the design)
- **Grid connection:** 230 V AC single-phase, 50 Hz. Hardware capable of up to **11.04 kW / 48 A** continuous; public Powerwall 3 UK sheets list both **G98** and **G99** (plus G100). At full 11.04 kW a real UK install is typically **G99**; the unit must also support software-configurable lower steps down to **3.68 kW** (G98 notification path). State DNO / export limits honestly — do not claim “G98-only” at 11.04 kW.
- **Charge power (master only):** maximum continuous charge on the order of **5 kW** (public Powerwall 3 master); with expansions the public ceiling rises toward **8 kW**. Do **not** claim 11 kW charge on a single master.
- **Enclosure:** outdoor-rated wall or floor mount; external envelope approximately **1,105 × 609 × 193 mm** (height × width × depth class, glass cover included in public dims); mass approximately **130 kg**. Install clearances per market-anchors doc (100 mm sides, 50 mm above, 300 mm front).
- **Operating environment:** outdoor ambient −20 °C to +50 °C (expect thermal derate above ~40 °C); enclosure **IP55** class with battery/power electronics toward **IP67**; operating noise &lt;50 dB(A) typical / &lt;62 dB(A) max @ 1 m
- **Companion islanding device:** design the AC / backup interface for a separate backup gateway (public reference: Backup Gateway 2, ~584×380×127 mm, ~11.4 kg) — companion product on the SLD, not silently stuffed into the master BoM unless justified
- **Design life:** 10+ years calendar / approximately 6,000–10,000 equivalent full cycles at the stated usable DoD (state the warranty energy throughput assumption)
- **Unit cost ceiling:** £8,500 ex-works for the master all-in-one unit (battery + integrated hybrid inverter + enclosure + BMS + thermal), excluding installation, gateway, and civil works — competitive with UK Powerwall 3 product-only listings (~£7.5k–£9k band)
- **Annual production volume (experiment):** 5,000 units per year (high-volume residential, not one-off)
- **Primary objective:** balanced — meet the usable-energy and continuous-power anchors at a cost competitive with the residential wall-battery market; prefer catalogue cells / inverter topologies the engine can price honestly

### Brief metrics (exact keys for compliance — emit matching delivered quantities)

Use these metric names so the Executive Summary / brief-compliance matrix can verify by exact key (lesson from Codema `ro_makeup_flow_m3_per_hr` UNVERIFIED):

| key_metric | value | unit |
|---|---:|---|
| `usable_energy_kwh` | 13.5 | kWh |
| `nameplate_capacity_kwh` | 14.0 | kWh |
| `continuous_power_kw` | 11.04 | kW |
| `dc_bus_voltage_v` | *(design-derived; state in contract)* | V |
| `round_trip_efficiency_pct` | 89 | % |
| `enclosure_mass_kg` | 130 | kg |
| `pv_stc_input_kw` | 20 | kW |
| `max_continuous_charge_kw` | 5 | kW |
| `mppt_count` | 3 | — |
| `enclosure_ip_rating` | 55 | IP (overall; battery/PE toward IP67) |

## Scalability (design path — not baseline BoM inflation)

- Up to **4** master wall units in parallel for power scaling
- Up to **3** DC expansion packs per master for energy scaling (each expansion ≈ 13.5 kWh usable)
- Baseline dossier sizes and prices **one master unit** only; document expansion as a design decision / option, do not silently multiply the BoM to a 7-unit stack

## Safety and regulatory (UK / EU residential)

- UKCA marking
- Engineering Recommendation G98 / G99 as applicable for the connection
- IEC 62619 (secondary lithium cells/batteries for industrial — cell/pack safety)
- IEC 62933 family where applicable to electrical energy storage systems
- UL 9540 / UL 9540A (or EN equivalents) for ESS safety / thermal-runaway propagation — cite only standards appropriate to the UK/EU jurisdiction
- Low Voltage Directive, EMC Directive, and applicable inverter grid-code settings for UK Type A/B generation
- BS 7671 for the electrical installation interface (consumer unit / generation meter / backup loads)
- Battery transport: UN 38.3 for the pack

## Sub-modules expected

LFP cell modules and pack structure; pack BMS; DC contactor / fuse / isolation; hybrid bidirectional inverter (PCS) with AC filter and grid interface; PV MPPT inputs; thermal management (cold plate / heat exchanger / fans or liquid loop as justified); enclosure and mounting; fire detection / venting strategy appropriate to a sealed residential wall ESS; communications and EMS; auxiliary PSU; optional backup-gateway interface (companion, not necessarily inside the same cabinet).

## Explicit non-goals

- Not a 20-foot / 40-foot container BESS
- Not MV (11 kV) step-up or G99 utility Dynamic Containment plant
- Not a Tesla-branded product, Tesla part numbers, or copied Tesla industrial design
- Not vehicle traction battery / Megapack scale

## Success for this experiment

A chain-native Excel dossier that a competent residential ESS engineer would take seriously: usable 13.5 kWh and ~11 kW continuous close honestly, BoM prices in the residential wall-battery band (not utility £/kWh), drawings show a wall cabinet not a container, and every tab scores ≥9 with honest `ships: true`.
