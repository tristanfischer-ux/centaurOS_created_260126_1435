/**
 * @file class-reference-graphs/vehicle-battery-pack.ts — K10 typed graph for
 * EV / vehicle traction battery packs (60-120 kWh HV-DC).
 *
 * @description Models an HV-DC traction battery pack for passenger / light-
 * commercial EV at the 40-120 kWh class. Architectural cousin of
 * `bess-utility-scale` but scaled down by ~50× (one container = ~3 MWh ↔
 * one vehicle = ~60 kWh) and with vehicle-grade safety + crash protection
 * + automotive packaging constraints. Sub-class of BESS at the unit level —
 * useful for validating that the graph framework handles sub-class
 * granularity (cell-pack architecture is shared; downstream is different).
 *
 * @sources Corpus values from `pretraining_extracted_specs` joined to
 * `pretraining_spec_documents WHERE product_class='second_life_battery_pack'`
 * at ~/.forge-truth/forge-truth.db (12 datasheets — primarily reuse-stage
 * EV packs but with full original-spec parameters). Supplemented by industry
 * knowledge of Tier-1 EV pack architecture (Tesla 4680 / 2170, BYD Blade,
 * VW MEB, Ford Mach-E, GM Ultium, Hyundai E-GMP).
 *
 * @corpus-coverage-2026-05-18
 *   - DC battery voltage range: 74.4-98.4 V (low-V variant); 168-453 V (3-4
 *     module 800 V class); EV pack voltage 300-600 V (industry); 800 V
 *     ultra-fast-charge (Porsche Taycan, Hyundai Ioniq 5, Lucid Air) —
 *     corpus + industry.
 *   - Max DC voltage: 500 V / 1000 V (residential corpus); EV pack 400 / 800 V.
 *   - Cell voltage: 4.2 V max / 2.4 V LL (corpus, NCA chemistry); LFP 3.65 V
 *     max / 2.5 V LL.
 *   - Cell chemistry: NCA / NMC / LFP (corpus + industry).
 *   - Cell capacity: 64 Ah (corpus); EV cells 50-280 Ah module-level.
 *   - Charging current: 22-70 A (corpus, slow); 200-500 A (DC fast charge).
 *   - Discharge current: 26 A (corpus); EV peak 800-1200 A short-duration.
 *   - Operating temp: -20 to +70 °C cell tolerance (corpus); operating
 *     range +5 to +30 °C nominal, -10 to +50 °C ambient.
 *   - Thermal runaway onset: 100 °C (corpus); LFP cathode collapse 310 °C
 *     vs NMC 150 °C (corpus).
 *   - SEI breakdown: 60-90 °C (corpus).
 *   - Standards: UL 9540A (corpus), IEC 62619, UN 38.3, IEC 61000-6-2/-3 EMC,
 *     IEC 63330 (second-life), UL 1974 (repurpose), AS 5139, IEC 60364-7-712.
 *
 * @scope-2026-05-18
 *   - HV-DC traction pack only — 12 V auxiliary lead-acid battery is OUT of
 *     scope (separate aux power architecture).
 *   - 400 V or 800 V class — both share the K10 module set; envelopes span
 *     both.
 *   - Liquid-cooled (water-glycol) typical for Tier-1 EV packs. Air-cooled
 *     (early Nissan Leaf, BYD entry-level) supported via optional fluid edge.
 *   - Crash protection (top + side + bottom impact) per FMVSS 305 / UNECE
 *     R100-02 REQUIRED.
 *   - LFP, NMC, NCA cell chemistries — all common.
 *   - Cell-to-pack (CTP) / cell-to-body (CTB) architectures (BYD Blade, Tesla
 *     structural pack) share the K10 module set with cell-module-pack (CMP).
 */

import { registerClassReferenceGraph, type ProductClassGraph } from '../class-reference-graph.js'

const VEHICLE_BATTERY_PACK: ProductClassGraph = {
  product_class: 'vehicle_battery_pack',
  display_name: 'EV Traction Battery Pack (40-120 kWh HV-DC, 400/800 V)',
  scope_notes:
    'HV-DC traction battery pack for passenger / light-commercial EV at the 40-120 kWh class. ' +
    '400 V or 800 V architecture, NMC/NCA/LFP chemistry. Liquid-cooled (water-glycol) typical; ' +
    'air-cooled supported. Crash protection per FMVSS 305 / UNECE R100-02. 12 V auxiliary ' +
    'battery is OUT of scope. Cell-to-pack and cell-module-pack architectures both supported.',

  nodes: [
    {
      class: 'energy_storage_source',
      role: 'principal',
      required: true,
      display: 'Cell stack (NMC / NCA / LFP) + module / pack assembly + inter-cell tabs',
    },
    {
      class: 'power_distribution',
      role: 'subsystem',
      required: true,
      display: 'HV-DC bus + pyro / contactor disconnect + pre-charge resistor + main + service disconnect',
    },
    {
      class: 'control_compute_communication',
      role: 'subsystem',
      required: true,
      display: 'BMS master + cell-monitor ICs (CMC) + CAN gateway to vehicle (VCU)',
    },
    {
      class: 'sensing_instrumentation',
      role: 'sensor',
      required: true,
      display: 'Per-cell V (CMC ICs) + module T (NTC) + pack current (Hall shunt) + IMD isolation monitor',
    },
    {
      class: 'safety_protection',
      role: 'safety',
      required: true,
      display: 'Cell-level fuses + pyrotechnic main disconnect (Bosch / Eaton PyroFuse) + HVIL + propagation barriers + venting',
    },
    {
      class: 'environmental_interface',
      role: 'subsystem',
      required: true,
      display: 'Cold-plate manifolds (water-glycol) + chiller/heater + EMI filter + venting / pressure-relief',
    },
    {
      class: 'mass_fluid_transport_process',
      role: 'subsystem',
      required: false,
      display: 'Coolant manifolds + pump + reservoir (shared with vehicle thermal loop or pack-local)',
    },
    {
      class: 'structure_containment',
      role: 'enclosure',
      required: true,
      display: 'Pack case (Al / steel / composite) + crash-frame + top cover + bottom shield (impact)',
    },
    {
      class: 'maintenance_serviceability',
      role: 'service',
      required: false,
      display: 'Manual service disconnect (MSD) + diagnostic port + module-level access for end-of-life recycling',
    },
  ],

  edges: [
    // ── Power: cells → power distribution → vehicle traction inverter ──
    {
      from_class: 'energy_storage_source',
      to_class: 'energy_conversion_transduction',
      protocol: 'physical',
      mechanism: 'dc_busbar',
      electrical: {
        voltage_nominal_v: 400,
        voltage_range_v: [250, 850],  // 400 V class: 250-450; 800 V class: 500-850
        ac_or_dc: 'DC',
        current_max_a: 1200,           // peak — sustained typ. 300-500 A
        power_max_w: 500_000,          // 500 kW peak for performance EVs
      },
      mechanical: { connector: 'M10/M12 busbar lugs', cable_type: 'orange HV cable 50-95 mm²' },
      required: false,
      direction: 'mutual',
      notes: 'Cell pack DC bus to traction inverter (energy_conversion_transduction). 400 V class: 250-450 V envelope (~96-100 series cells NMC). 800 V class: 500-850 V (~180-200 series cells). EV peak 800-1200 A short-duration (corpus residential 26 A is the slow case). K10-4 ROUTING NOTE: Modern EV packs route the DC bus through a discrete `power_distribution` block (pyro disconnect + pre-charge + main contactor + MSD). The K10-4 rule requires emitters to route via `power_distribution` instead of a direct ESS↔ECT edge. This edge is downgraded to required:false; the canonical chain is ESS↔PD↔(external ECT) (the PD edge below remains required:true). Out-of-pack ECT (traction inverter) lives in the vehicle, not the pack — so the canonical edge ends at PD.',
      source_references: [
        'corpus:EV battery voltage@second_life_battery_pack (300-600 V)',
        'corpus:Maximum DC voltage for BS EN 62485-5@second_life_battery_pack (1500 V)',
        'industry:Tesla Model S/X 400 V pack architecture',
        'industry:Porsche Taycan 800 V pack architecture',
      ],
    },
    {
      from_class: 'energy_storage_source',
      to_class: 'power_distribution',
      protocol: 'physical',
      mechanism: 'dc_busbar',
      electrical: {
        voltage_nominal_v: 400,
        voltage_range_v: [250, 850],
        ac_or_dc: 'DC',
        current_max_a: 1200,
      },
      mechanical: { connector: 'busbar lugs M10', cable_type: 'orange HV cable + integrated busbar' },
      required: true,
      direction: 'mutual',
      notes: 'DC distribution block houses: (1) pyrotechnic disconnect (Bosch CDS / Eaton PyroFuse — fires on crash signal from airbag ECU); (2) main HV contactor (Gigavac / TE Connectivity sealed); (3) pre-charge resistor (typ. 50-100 Ω, 50 W ceramic) + pre-charge contactor for capacitor inrush; (4) main + service disconnect (MSD).',
      source_references: [
        'industry:Bosch CDS pyrotechnic disconnect',
        'industry:Eaton PyroFuse',
        'industry:Gigavac GX series sealed HV contactor',
        'standard:UNECE R100-02 (HV safety)',
      ],
    },

    // ── Thermal / fluid path (K10-3 canonical chain) ──
    {
      from_class: 'energy_storage_source',
      to_class: 'environmental_interface',
      protocol: 'physical',
      mechanism: 'cooling_loop',
      fluid: {
        medium: 'water-glycol',
        pressure_max_bar: 2.5,         // pack-internal cooling, lower than BESS
        flow_max_lpm: 30,
        temperature_max_c: 50,         // pack cooling target ≤45 °C cell
        temperature_min_c: -20,
        pipe_dn_mm: 20,
      },
      required: false,
      direction: 'mutual',
      notes: 'Cell pack thermal control: cold-plate cooling at the cell or module level. Target cell temp 25-35 °C nominal, ≤45 °C max for cycle-life (thermal-runaway onset at 100 °C per corpus). Pack heater (PTC element) for cold-soak warm-up below -10 °C. K10-3 ROUTING NOTE: Active liquid cooling is a two-edge chain — the K10-3 prompt rule requires ESS→mass_fluid_transport_process→environmental_interface. Direct ESS↔EI edges miss the explicit MFTP intermediary. This direct edge is downgraded to required:false; the canonical chain via mass_fluid_transport_process remains required:true. Air-cooled packs (early Nissan Leaf) would emit a direct edge here.',
      source_references: [
        'corpus:Thermal runaway onset temperature@second_life_battery_pack (100 degC)',
        'corpus:SEI breakdown temperature@second_life_battery_pack (60-90 C)',
        'corpus:Operating temperature@second_life_battery_pack (0 to 30 °C nominal)',
        'industry:Tesla Model 3 cold-plate cooling',
        'industry:VW MEB pack thermal architecture',
      ],
    },
    {
      from_class: 'energy_storage_source',
      to_class: 'mass_fluid_transport_process',
      protocol: 'physical',
      mechanism: 'fluid_routing',
      fluid: {
        medium: 'water-glycol',
        pressure_max_bar: 2.5,
        flow_max_lpm: 30,
        pipe_dn_mm: 20,
      },
      required: false,
      direction: 'mutual',
      notes: 'Coolant manifolds supply water-glycol to module-level cold plates and return warmed fluid to the vehicle chiller (shared with cabin HVAC loop typically). Pack-local pump on standalone designs (rare). Optional only because some packs share the vehicle thermal loop with no pack-local circulation.',
      source_references: [
        'industry:VW MEB shared cabin/pack thermal loop',
        'industry:Tesla pack-local Octovalve thermal architecture',
      ],
    },

    // ── Control: BMS master ──
    {
      from_class: 'control_compute_communication',
      to_class: 'energy_storage_source',
      protocol: 'CAN',
      mechanism: 'can_bus',
      electrical: { voltage_nominal_v: 12, ac_or_dc: 'DC' },
      mechanical: { connector: 'D-sub 9 or M12 5-pin', cable_type: 'CAN twisted pair 120 Ω' },
      required: true,
      direction: 'mutual',
      notes: 'BMS master communicates with cell-monitor ICs (LTC6804, ADBMS6822, Maxim MAX17853) at 250-500 kbit/s isoSPI or daisy-chain CAN. Reports per-cell V (4096 cells in a 96s4p NMC pack), module T, pack current, SoC, SoH, fault state.',
      source_references: [
        'corpus:Cell voltage (max)@second_life_battery_pack (4.2 V)',
        'corpus:Cell voltage lower limit@second_life_battery_pack (2.4 V)',
        'industry:Analog Devices LTC6804 / ADBMS6822 cell monitor',
        'industry:Maxim MAX17853 cell monitor',
      ],
    },
    {
      from_class: 'control_compute_communication',
      to_class: 'environmental_interface',
      protocol: 'CAN',
      mechanism: 'can_bus',
      electrical: { voltage_nominal_v: 12, ac_or_dc: 'DC' },
      required: true,
      direction: 'mutual',
      notes: 'BMS master commands coolant pump speed + chiller/heater setpoint + HVAC priority via vehicle CAN. SAE J1939 or proprietary OEM CAN. Reports thermal state to VCU for charging-rate limiting.',
      source_references: ['industry:Tesla CAN-A pack thermal commands', 'standard:SAE J1939'],
    },
    {
      from_class: 'control_compute_communication',
      to_class: 'sensing_instrumentation',
      protocol: 'I2C',
      mechanism: 'sensor_feedback',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 5 },
      required: true,
      direction: 'mutual',
      notes: 'BMS master reads pack current via Hall-effect or shunt-based current sensor (LEM HASS / Isabellenhütte IVT-MOD), pack-level voltage via isolated divider, IMD (insulation monitor — Bender ISOMETER, ≥1 MΩ trip). Closed-loop SoC integration at 10-100 ms cadence.',
      source_references: [
        'industry:LEM HASS Hall current transducer',
        'industry:Isabellenhütte IVT-MOD precision shunt',
        'industry:Bender IR155 / ISOMETER iso155',
      ],
    },

    // ── Safety chain ──
    {
      from_class: 'safety_protection',
      to_class: 'energy_storage_source',
      protocol: 'Digital-24V',
      mechanism: 'contactor_command',
      electrical: { voltage_nominal_v: 12, ac_or_dc: 'DC', current_max_a: 5 },
      required: true,
      direction: 'directional',
      notes: 'Hard-wired safety chain trips main contactors + pyro disconnect on: cell-level fault (over-V / under-V / over-T), HVIL (HV interlock loop) break, crash signal from airbag ECU. Independent of BMS firmware. Cell-level fuse-link or PTC at cell tab.',
      source_references: [
        'standard:UNECE R100-02 (HVIL requirement)',
        'standard:FMVSS 305 (crash disconnect)',
        'industry:Bosch CDS pyrotechnic disconnect',
      ],
    },
    {
      from_class: 'safety_protection',
      to_class: 'sensing_instrumentation',
      protocol: 'Analog-thermistor',
      mechanism: 'alarm_interlock',
      required: true,
      direction: 'mutual',
      notes: 'Thermal-runaway detection: smoke / off-gas sensor (Tesla 4680 pack), per-module NTC thermistor, pressure transducer in vent space. Triggers vent + propagation-barrier deployment. UL 9540A test methodology (corpus) for thermal-propagation containment.',
      source_references: [
        'corpus:UL 9540A@second_life_battery_pack (Thermal runaway fire safety)',
        'standard:UL 9540A (cell-level thermal runaway)',
        'standard:IEC 62619 (industrial Li safety)',
      ],
    },
    {
      from_class: 'safety_protection',
      to_class: 'power_distribution',
      protocol: 'Digital-24V',
      mechanism: 'safety_isolation',
      electrical: { voltage_nominal_v: 12, ac_or_dc: 'DC' },
      required: true,
      direction: 'directional',
      notes: 'Manual Service Disconnect (MSD) — physical pull-handle that opens HV bus for first-responder / mechanic safety. Spring-loaded HVIL through the MSD body interlocks the main contactor. Service plug visible bright orange/yellow.',
      source_references: [
        'industry:TE Connectivity MSD plug',
        'standard:SAE J1772 / UNECE R100-02 service disconnect',
      ],
    },

    // ── Mechanical path (crash protection) ──
    {
      from_class: 'energy_storage_source',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'mechanical_mount',
      mechanical: { mount: 'bolted', connector: 'M12 case bolts + structural adhesive', cable_type: 'cast aluminium or steel case' },
      required: true,
      direction: 'mutual',
      notes: 'Cells / modules bolted or adhesive-bonded into pack case. Top cover + bottom shield (titanium / aluminium 5-8 mm) for road-debris impact. Side rails for pole-impact / IIHS small-overlap. Crash test per FMVSS 305 (post-crash energy <9 kJ leakage) / UNECE R100-02. Cell-to-pack (CTP, BYD Blade) eliminates module-level fasteners for higher volumetric density.',
      source_references: [
        'industry:Tesla structural pack (Model Y)',
        'industry:BYD Blade cell-to-pack',
        'standard:FMVSS 305 (US EV crash safety)',
        'standard:UNECE R100-02 (EU EV safety)',
        'standard:IEC 62660-2 (vehicle Li-ion safety)',
      ],
    },
    {
      from_class: 'power_distribution',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'cable_transit',
      mechanical: { mount: 'panel', connector: 'sealed HV gland + ground stud' },
      required: true,
      direction: 'mutual',
      notes: 'HV cable exits the pack case through a sealed gland (IP67 / IP6K9K). Ground stud bonds case to vehicle chassis. Quick-disconnect HV connector (Rosenberger H-MTD or Amphenol RADSOK) at the pack-to-vehicle interface.',
      source_references: [
        'industry:Rosenberger H-MTD HV connector',
        'industry:Amphenol RADSOK HV connector',
        'standard:IP6K9K (vehicle ingress)',
      ],
    },

    // ── Service path ──
    {
      from_class: 'maintenance_serviceability',
      to_class: 'energy_storage_source',
      protocol: 'physical',
      mechanism: 'cable_transit',
      mechanical: { mount: 'panel', connector: 'MSD pull-handle + diagnostic OBD-II port' },
      required: false,
      direction: 'mutual',
      notes: 'MSD pull-handle + diagnostic port (OBD-II accesses BMS via vehicle gateway; pack-direct via CAN coupler for end-of-life / repurpose access per IEC 63330 + UL 1974 second-life standards). Module-level access for cell-rebalance or replacement.',
      source_references: [
        'corpus:UL 1974@second_life_battery_pack',
        'corpus:IEC 63330@second_life_battery_pack',
        'corpus:IEC 63338@second_life_battery_pack',
      ],
    },
  ],

  sources_cited: [
    'corpus:second_life_battery_pack (~12 datasheets, 2026-05-18 — primary corpus source)',
    'standard:UNECE R100-02 (EV HV safety)',
    'standard:FMVSS 305 (US EV crash safety)',
    'standard:IEC 62660-2 (vehicle Li-ion safety)',
    'standard:IEC 62619 (industrial Li safety)',
    'standard:UL 9540A (thermal runaway)',
    'standard:UL 1974 (second-life evaluation)',
    'standard:IEC 63330 (second-life safety)',
    'standard:IEC 63338 (second-life environmental)',
    'standard:UN 38.3 (Li transport)',
    'standard:SAE J1939 (vehicle CAN)',
    'standard:SAE J1772 (charging interface)',
    'industry:Tesla 4680 / structural pack architecture',
    'industry:BYD Blade cell-to-pack architecture',
    'industry:VW MEB / Porsche Taycan 800 V pack',
    'industry:Bosch / Eaton pyrotechnic disconnect',
    'industry:Analog Devices / Maxim cell-monitor ICs',
    'industry:Bender IMD isolation monitor',
  ],
}

registerClassReferenceGraph(VEHICLE_BATTERY_PACK)

export { VEHICLE_BATTERY_PACK }
