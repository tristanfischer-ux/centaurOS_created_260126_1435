/**
 * @file class-reference-graphs/distribution-transformer.ts — K10 typed
 * graph for medium-voltage distribution transformers (50 kVA-3150 kVA
 * three-phase, MV-grid scale).
 *
 * @description Models a packaged MV-LV distribution transformer at the
 * 50-3150 kVA three-phase class — ABB CAST RESIN / DRY-Type / TXpert,
 * Siemens GEAFOL / FITformer, Schneider Minera / Vegeta / Trihal, Areva
 * / GE Prolec / Hammond Power Solutions. Passive power-electronics
 * complement to `pv_module_residential` (PV → string inverter → grid
 * tie at LV) but scaled up to MV-grid (11 / 20 / 33 kV primary, 400 / 433
 * V secondary). Three K10 paths under test:
 *   - `power_distribution` (MV primary winding + LV secondary winding +
 *     tap changer + neutral bushing).
 *   - `safety_protection` (winding-temperature thermal trip, oil-pressure
 *     relief on oil-immersed variants, Buchholz relay, fault-arc
 *     detection, surge arresters).
 *   - `environmental_interface` (radiator / cooling fans for ONAN / ONAF
 *     forced-air; dry-type air convection; oil-pressure conservator).
 * Distinct from `pv_string_inverter` (active power electronics with IGBT
 * switching) — this is purely passive (iron-core + windings) but tests
 * the same K10 abstractions at MV-grid scale.
 *
 * @sources Corpus values from `pretraining_extracted_specs` joined to
 * `pretraining_spec_documents WHERE product_class='distribution_transformer'`
 * at ~/.forge-truth/forge-truth.db (10 datasheets — primarily ABB CAST
 * RESIN / Schneider Minera + Vegeta / Hammond cast-coil + Siemens GEAFOL).
 * Transformer standards from corpus: CEI EN 60076-11 (dry-type),
 * CEI EN 60076-12 (loading guide), IEC 60076, DIN VDE 0532, EU Ecodesign
 * Directive 2009/125/EC + Regulation 548/2014 (Tier-1 / Tier-2 losses),
 * IBC 2018 + ASCE 7-10 + IEEE 693 (seismic), UL 1562 + ANSI/ISA 12.12.10
 * (NA listing), 26. BimSchV (German EMF limits).
 *
 * @corpus-coverage-2026-05-18
 *   - Rating: 30-40,000 kVA / 100-3150 kVA / 50-1500 VA (small dry-type) —
 *     corpus direct.
 *   - Primary voltage: 11 / 20 kV MV (corpus); 33 kV upper bound — corpus.
 *   - Secondary voltage: 400 / 433 V LV (corpus) — corpus direct.
 *   - BIL rating: 10 / 30 kV (corpus, dry-type) — corpus direct.
 *   - Frequency: 50 / 60 Hz; 50-400 Hz aerospace variant — corpus.
 *   - Connection: Dyn11 typical (corpus) — corpus direct.
 *   - Short-circuit voltage Ucc: 4-6% (corpus); short-circuit current
 *     12.5 kA (corpus).
 *   - Efficiency: 98.10-99.37% (corpus across kVA range, Tier-1 Eco losses).
 *   - Insulation class: 130 °C (small dry-type), 200-220 °C (hi-T Plus
 *     epoxy resin), F-class oil-immersed — corpus direct.
 *   - Hot-spot temp max: 155 °C (hi-T Plus); over-temp alarm 130 °C;
 *     emergency shutdown 150 °C — corpus direct.
 *   - Cooling: ONAN / ONAF (oil-natural air-forced — fan switch on 100 °C,
 *     off 80 °C per corpus) for oil-immersed; AN (air-natural) for dry-type.
 *   - No-load losses (Po): 750 W (typ. 1000 kVA) — corpus.
 *   - Load losses (Pk): 4840 W @ 75 °C / 5500 W @ 120 °C — corpus.
 *   - Taps: ±2 × 2.5% off-circuit (corpus).
 *   - Sound power Lwa: 60 dB (corpus, 1000 kVA dry-type); 70-85 dB
 *     oil-immersed forced-cool.
 *   - Standards: CEI EN 60076-11, IEC 60076, DIN VDE 0532, IEEE 693 seismic,
 *     IEC 60296 mineral oil, IEC 62271 (MV switchgear interface), ANSI/IEEE
 *     C57.12.01 (US dry-type), UL 1562, CSA C22.2 No. 47, EU Ecodesign
 *     548/2014, 26. BimSchV German EMF limits — corpus direct.
 *
 * @scope-2026-05-18
 *   - Cast-resin / dry-type three-phase distribution transformer at the
 *     100-3150 kVA class is the dominant template. Oil-immersed (ONAN /
 *     ONAF, e.g. Schneider Minera classic oil) shares the same K10 module
 *     set with the cooling-fluid envelope swapped to mineral oil + Buchholz
 *     relay added to safety_protection edges.
 *   - Single-phase (10-167 kVA, US-style pole-mount) is partially in
 *     scope — the K10 module set is identical; envelopes carry the single-
 *     phase voltage (7.2 / 14.4 kV pri, 240 V sec).
 *   - MV-LV step-down only (11/20/33 kV → 400/433 V). LV-LV isolation
 *     transformers (industrial UPS isolators), HV-MV station transformers
 *     (>33 kV pri), and grid-tie unit transformers (generator step-up,
 *     11/22/35 kV → 132/275/400 kV) are OUT of scope.
 *   - 50 Hz EU / 60 Hz NA. Aerospace 400 Hz variants exist (corpus:
 *     50-400 Hz range) but are OUT of scope as a primary target.
 *   - Distribution scope: pole-mount / pad-mount / kiosk / substation-
 *     integrated. Pole-mount + pad-mount converge on same K10 module set;
 *     scope_notes for environmental_interface differ on outdoor IP rating.
 */

import { registerClassReferenceGraph, type ProductClassGraph } from '../class-reference-graph.js'

const DISTRIBUTION_TRANSFORMER: ProductClassGraph = {
  product_class: 'distribution_transformer',
  display_name: 'MV-LV Distribution Transformer (100-3150 kVA, 11/20/33 kV → 400/433 V)',
  scope_notes:
    'Three-phase cast-resin / dry-type or oil-immersed distribution transformer at the ' +
    '100-3150 kVA class. 11 / 20 / 33 kV MV primary, 400 / 433 V LV secondary. ' +
    'Dyn11 connection typical; off-circuit ±2 × 2.5% tap changer. EU Ecodesign Tier-2 ' +
    '(EU 548/2014) loss compliance. PED 2014/68 NOT applicable (no pressure equipment). ' +
    'Single-phase pole-mount partially covered; HV-MV station, LV-LV isolation, and ' +
    'generator step-up unit transformers are OUT of scope. EMF compliance per 26. BimSchV.',

  nodes: [
    {
      class: 'energy_conversion_transduction',
      role: 'principal',
      required: true,
      display: 'Iron core (grain-oriented silicon steel / amorphous-metal) + primary + secondary windings (Cu or Al)',
    },
    {
      class: 'power_distribution',
      role: 'subsystem',
      required: true,
      display: 'MV primary bushings (porcelain or polymeric) + LV secondary bushings + off-circuit tap changer + neutral',
    },
    {
      class: 'structure_containment',
      role: 'enclosure',
      required: true,
      display: 'IP21 / IP31 / IP65 enclosure (NEMA 3R indoor / outdoor) + base frame + lifting lugs + (oil-immersed) tank',
    },
    {
      class: 'safety_protection',
      role: 'safety',
      required: true,
      display: 'Winding-temp PT100 + over-temp / emergency-trip thermistor + (oil) Buchholz + pressure relief + surge arrester',
    },
    {
      class: 'environmental_interface',
      role: 'subsystem',
      required: true,
      display: 'AN cooling (dry-type) OR radiator + cooling fans ONAN/ONAF + (oil) conservator + breather',
    },
    {
      class: 'sensing_instrumentation',
      role: 'sensor',
      required: true,
      display: 'Winding temperature monitor + oil-level gauge (oil) + tap position indicator + fault recorder',
    },
    {
      class: 'control_compute_communication',
      role: 'subsystem',
      required: false,
      display: 'Smart transformer monitor (ABB TXpert / Siemens FITformer) + DNP3 / IEC 61850 / Modbus / SCADA uplink',
    },
    {
      class: 'maintenance_serviceability',
      role: 'service',
      required: false,
      display: '(Oil) oil sampling tap + drain valve + dehydrating breather + tap changer manual handle',
    },
  ],

  edges: [
    // ── MV primary → windings (electrical) ──
    {
      from_class: 'power_distribution',
      to_class: 'energy_conversion_transduction',
      protocol: 'physical',
      mechanism: 'ac_busbar',
      electrical: {
        voltage_nominal_v: 20000,           // corpus: 20 kV typical MV primary
        voltage_range_v: [11000, 36000],    // 11-33 kV operational; 36 kV max (corpus)
        ac_or_dc: 'AC',
        ac_phases: 3,
        ac_frequency_hz: 50,                // 50/60 Hz; 60 Hz NA
        current_max_a: 200,
      },
      mechanical: { connector: 'plug-in elbow (24 kV / 36 kV class) or porcelain bushing', cable_type: 'XLPE-insulated MV cable, 95-300 mm²' },
      required: true,
      direction: 'directional',
      notes: 'MV primary winding terminated at plug-in elbow connectors (24 kV / 36 kV class, e.g. Euromold M400LR / Pfisterer CONNEX) or porcelain bushings for substation-integrated variants. Corpus: 11 kV primary (corpus), 20 kV rated (corpus), 36 kV maximum (corpus). Primary rated current 11.5 A typical for 400 kVA 20 kV (corpus). BIL 10/30 kV per dry-type corpus.',
      source_references: [
        'corpus:Primary Voltage@distribution_transformer (11 kV)',
        'corpus:Rated voltage@distribution_transformer (20 kV)',
        'corpus:Maximum voltage@distribution_transformer (36 kV)',
        'corpus:MV Voltage@distribution_transformer (20 kV)',
        'corpus:Transformer primary rated current@distribution_transformer (11.5 A)',
        'corpus:BIL Rating@distribution_transformer (10 kV / 30 kV)',
        'corpus:Connection@distribution_transformer (Dyn11)',
        'industry:Euromold M400LR plug-in elbow',
        'industry:Pfisterer CONNEX MV interface',
        'standard:CEI EN 62271-200 (MV switchgear interface)',
      ],
    },
    {
      from_class: 'energy_conversion_transduction',
      to_class: 'power_distribution',
      protocol: 'physical',
      mechanism: 'ac_busbar',
      electrical: {
        voltage_nominal_v: 400,
        voltage_range_v: [380, 433],
        ac_or_dc: 'AC',
        ac_phases: 3,
        ac_frequency_hz: 50,
        current_max_a: 4500,                // 3150 kVA / 400 V √3 ≈ 4550 A
      },
      mechanical: { connector: 'LV terminal block + bolt-on busbar lugs M16', cable_type: 'PVC or LSZH cable up to 4 × 240 mm² parallel' },
      required: true,
      direction: 'directional',
      notes: 'LV secondary winding terminated at terminal block + bolt-on busbar lugs. Corpus: 433 V secondary (corpus); 400 V European standard; 240 V single-phase NA pole-mount. Secondary nominal current 578 A for 400 kVA at 400 V (corpus). Dyn11 vector group typical (corpus). Short-circuit voltage Ucc 4-6% (corpus); withstands Isc 12.5 kA (corpus) for 2 s.',
      source_references: [
        'corpus:Secondary Voltage@distribution_transformer (433 V)',
        'corpus:LV busbar rated voltage@distribution_transformer (400 V)',
        'corpus:Transformer secondary nominal current@distribution_transformer (578.0 A)',
        'corpus:Transformer short circuit voltage@distribution_transformer (4%)',
        'corpus:Short-circuit voltage (UDC)@distribution_transformer (6%)',
        'corpus:Three-phase short-circuit current@distribution_transformer (12.5 kA)',
        'standard:IEC 60076 (power transformers)',
        'standard:CEI EN 60076-11 (dry-type)',
        'standard:ANSI/IEEE C57.12.01 (NA dry-type)',
      ],
    },

    // ── Off-circuit tap changer (mechanical adjustment, not under load) ──
    {
      from_class: 'power_distribution',
      to_class: 'maintenance_serviceability',
      protocol: 'physical',
      mechanism: 'mechanical_mount',
      mechanical: { mount: 'panel', connector: 'tap-changer handle (manual / motorised) + position indicator' },
      required: false,
      direction: 'mutual',
      notes: 'Off-circuit (de-energised) tap changer ±2 × 2.5% per corpus on MV side — adjusts primary winding ratio to compensate grid voltage drift. Manual handle on dry-type / pad-mount; motorised tap-changer on substation-integrated variants. Under-load tap-changer (OLTC) is a separate transformer category and is OUT of scope here.',
      source_references: [
        'corpus:Taps@distribution_transformer (±2x2.5%)',
        'industry:Schneider Minera off-circuit tap changer',
        'standard:IEC 60214-1 (tap changer general)',
      ],
    },

    // ── Cooling: ONAN/ONAF or AN ──
    {
      from_class: 'energy_conversion_transduction',
      to_class: 'environmental_interface',
      protocol: 'physical',
      mechanism: 'cooling_loop',
      fluid: {
        medium: 'oil',                      // ONAN/ONAF; dry-type AN uses air; envelope keeps the broader case
        pressure_max_bar: 1.5,              // oil-immersed conservator pressure (very low — atmospheric + breather)
        temperature_max_c: 100,             // corpus: fan switch on 100 °C
        temperature_min_c: -45,             // corpus: operating temp -45 °C lower bound (cold-climate)
      },
      mechanical: { connector: 'radiator banks + fan motor + (dry-type) air-flow shroud', cable_type: 'mineral oil-filled radiator (oil) or copper / Al heat-spreader (dry)' },
      required: true,
      direction: 'mutual',
      notes: 'Two cooling regimes: ONAN/ONAF (oil-natural air-natural + air-forced) for oil-immersed — radiator banks with thermostatically-controlled fans (corpus: fan switch on 100 °C / off 80 °C). Mineral oil (IEC 60296) + conservator + dehydrating breather. Dry-type (cast-resin GEAFOL / CAST RESIN / Trihal) uses pure air-natural convection (AN) — no fluid, just heat-spreader fins + enclosure ventilation. Hot-spot 155 °C limit (corpus); operating temp -45 to +200 °C internal (corpus).',
      source_references: [
        'corpus:Cooling fan switch on@distribution_transformer (100 °C)',
        'corpus:Cooling fan switch off@distribution_transformer (80 °C)',
        'corpus:Operating Temperature Range@distribution_transformer (-45 to +200 °C)',
        'corpus:Maximum hot spot temperature (hi-T Plus)@distribution_transformer (155 °C)',
        'corpus:Maximum cooling air temperature@distribution_transformer (40 °C)',
        'corpus:Annual average cooling air temperature@distribution_transformer (20 °C)',
        'corpus:Fan speed@distribution_transformer (600-800 min-1)',
        'corpus:Fan efficiency@distribution_transformer (0.7-0.9)',
        'standard:IEC 60076-2 (temperature rise)',
        'standard:IEC 60076-11 (dry-type cooling)',
        'standard:IEC 60296 (mineral insulating oil)',
      ],
    },

    // ── Safety: winding-temp trip + Buchholz (oil) + surge arrester ──
    {
      from_class: 'safety_protection',
      to_class: 'energy_conversion_transduction',
      protocol: 'Digital-24V',
      mechanism: 'safety_isolation',
      electrical: { voltage_nominal_v: 24, ac_or_dc: 'DC', current_max_a: 2 },
      required: true,
      direction: 'directional',
      notes: 'Winding-temperature thermistor (PT100 embedded in casting / oil-immersed thermometer pocket): alarm 130 °C (corpus); emergency shutdown / trip 150 °C (corpus). For oil-immersed: Buchholz relay (gas accumulation from incipient internal fault) trips primary MV breaker; sudden-pressure relay backs it up. Surge arresters (typ. ZnO gapless MOV, 24 / 36 kV class on primary, 1 kV LV class on secondary) clamp lightning + switching surges. Earth-fault current 50 A (corpus); clearance 0.2 s double earth-fault (corpus).',
      source_references: [
        'corpus:Over-temperature alarm@distribution_transformer (130 °C)',
        'corpus:Emergency shutdown trip@distribution_transformer (150 °C)',
        'corpus:Double earth fault clearance time@distribution_transformer (0.2 s)',
        'corpus:Single-phase earth fault clearance time@distribution_transformer (10 s)',
        'corpus:Single-phase earth fault current@distribution_transformer (50 A)',
        'corpus:Internal arc protection (IAC-AB)@distribution_transformer (20 kA)',
        'industry:ABB MWK type Buchholz relay',
        'industry:Siemens 3EQ4 ZnO surge arrester',
        'standard:IEC 60076-10 (sound + ancillary protection)',
        'standard:CEI EN 60044-7 (instrument transformer)',
      ],
    },
    {
      from_class: 'safety_protection',
      to_class: 'sensing_instrumentation',
      protocol: 'Modbus-RTU',
      mechanism: 'alarm_interlock',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 24 },
      required: true,
      direction: 'mutual',
      notes: 'Winding temperature monitor (ABB TEC, Schneider TWM, Siemens) reads PT100 winding sensors + ambient temp. Oil-level gauge (oil-immersed) + tap position indicator + fault recorder. Hydrogen explosion threshold 4% (corpus, oil-immersed dissolved-gas-in-oil monitoring). Oxygen insufficiency 18% (corpus, vault confined-space alarm).',
      source_references: [
        'corpus:Hydrogen explosion danger threshold@distribution_transformer (4%)',
        'corpus:Oxygen insufficiency threshold@distribution_transformer (18%)',
        'corpus:Magnetic induction quality objective@distribution_transformer (3 µT)',
        'corpus:Maximum magnetic flux density limit (26. BimSchV)@distribution_transformer (100 µT)',
        'industry:ABB TEC winding temperature controller',
        'standard:26. BimSchV (German EMF limits)',
      ],
    },

    // ── Control: SCADA / DNP3 / IEC 61850 ──
    {
      from_class: 'control_compute_communication',
      to_class: 'sensing_instrumentation',
      protocol: 'Modbus-TCP',
      mechanism: 'modbus_tcp',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 24 },
      mechanical: { connector: 'RJ45 or fibre-optic ST/LC', cable_type: 'Cat 5e or SM/MM fibre' },
      required: false,
      direction: 'mutual',
      notes: 'Smart transformer monitors (ABB TXpert, Siemens FITformer, GE TVOC) read winding temp + tap position + oil level + DGA (dissolved gas analysis, oil-immersed) and report to SCADA over IEC 61850 (substation automation), DNP3, or Modbus TCP. Required:false because legacy passive transformers have no comms — only smart variants (post-2018) carry this edge.',
      source_references: [
        'industry:ABB TXpert smart transformer',
        'industry:Siemens FITformer monitoring',
        'standard:IEC 61850 (substation automation)',
        'standard:DNP3 / IEEE 1815 (utility SCADA)',
      ],
    },

    // ── Mechanical: chassis + seismic anchorage ──
    {
      from_class: 'energy_conversion_transduction',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'mechanical_mount',
      mechanical: {
        mount: 'bolted',
        connector: 'base-frame bolts (M20-M30) + lifting lugs + seismic anchors (IBC 2018, IEEE 693)',
        cable_type: 'galvanised steel base frame + IP65 outdoor enclosure or IP31 indoor',
      },
      required: true,
      direction: 'mutual',
      notes: 'Core + windings + cooling system bolted to galvanised steel base frame. Total weight 1680 kg typical for 400 kVA dry-type (corpus). Indoor (IP21 / IP31) or outdoor (NEMA 3R / IP65) enclosure per IEC 60529. Lifting lugs for crane + forklift handling. Seismic anchorage per IBC 2018 + ASCE 7-10 + IEEE 693 (corpus): spectral acceleration ≤2.0 g, importance factor 1.5, seismic severity 0.5-1.0 g (corpus). 30-year design life (corpus).',
      source_references: [
        'corpus:Total weight@distribution_transformer (1680 kg)',
        'corpus:Design Life@distribution_transformer (30 years)',
        'corpus:Spectral acceleration@distribution_transformer (≤2.0 g)',
        'corpus:Importance factor@distribution_transformer (1.5)',
        'corpus:Seismic Qualification@distribution_transformer (IBC 2018, ASCE 7-10)',
        'corpus:Seismic severity level 1@distribution_transformer (0.5 g)',
        'corpus:Seismic severity level 2@distribution_transformer (1.0 g)',
        'corpus:Enclosure Type@distribution_transformer (3R)',
        'corpus:IP Rating@distribution_transformer (65)',
        'standard:IBC 2018 + ASCE 7-10 seismic',
        'standard:IEEE 693 seismic',
        'standard:IEC 60529 IP rating',
      ],
    },
    {
      from_class: 'power_distribution',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'cable_transit',
      mechanical: { mount: 'panel', connector: 'MV cable gland + LV cable lug compartment + earth bus' },
      required: true,
      direction: 'mutual',
      notes: 'MV cable enters through gland or plug-in elbow; LV cable lug compartment terminates on bolt-on busbar. Earth bus continuous through tank / enclosure to ground grid (typ. 95 mm² Cu minimum cross-section per corpus). Minimum cable cross-section 95 mm² (corpus). Maximum cable length 20 m (corpus, internal interconnect).',
      source_references: [
        'corpus:Minimum cable cross section@distribution_transformer (95 mm2)',
        'corpus:Minimum cross-section (LV equipotential copper)@distribution_transformer (6 mm2)',
        'corpus:Minimum cross-section (MV equipotential copper)@distribution_transformer (16 mm2)',
        'corpus:Maximum cable length@distribution_transformer (20 m)',
        'standard:CEI 0-16 (Italy MV cable interface)',
        'standard:DIN VDE 0100 / 0101 (German earthing)',
      ],
    },

    // ── Service: oil sampling + drain + dehydrating breather (oil only) ──
    {
      from_class: 'maintenance_serviceability',
      to_class: 'environmental_interface',
      protocol: 'physical',
      mechanism: 'cable_transit',
      mechanical: { mount: 'in-line', connector: 'oil sampling valve + drain port + silica-gel breather' },
      required: false,
      direction: 'mutual',
      notes: 'For oil-immersed only: oil sampling valve (1/2" NPT) for periodic DGA test (every 1-3 years); drain valve at tank bottom; silica-gel dehydrating breather on conservator (prevents moisture ingress as oil cools). Tap changer manual handle locking pin for tap-position lock. Dry-type variants skip this edge — no oil to sample.',
      source_references: [
        'corpus:Operational life (GSEC/HySec)@distribution_transformer (30 years)',
        'corpus:Recommended escape route length@distribution_transformer (10 m)',
        'industry:Maschinenfabrik Reinhausen MR breather',
        'standard:IEC 60599 (DGA interpretation)',
      ],
    },
  ],

  sources_cited: [
    'corpus:distribution_transformer (10 datasheets, 2026-05-18 — ABB CAST RESIN / Schneider Minera+Vegeta / Hammond / Siemens GEAFOL)',
    'standard:IEC 60076 / CEI EN 60076 (power transformers)',
    'standard:CEI EN 60076-11 (dry-type)',
    'standard:CEI EN 60076-12 (loading guide)',
    'standard:DIN VDE 0532 / EN 50588-1 (small power transformers)',
    'standard:IEC 60296 (mineral insulating oil)',
    'standard:IEC 60599 (DGA interpretation)',
    'standard:IEC 60214-1 (tap changer)',
    'standard:IEC 62271-200 (MV switchgear interface)',
    'standard:IEC 61850 (substation automation)',
    'standard:DNP3 / IEEE 1815 (utility SCADA)',
    'standard:ANSI/IEEE C57.12.01 (NA dry-type)',
    'standard:UL 1562 / CSA C22.2 No. 47',
    'standard:IBC 2018 + ASCE 7-10 + IEEE 693 (seismic)',
    'standard:IEC 60529 (IP rating)',
    'standard:EU Ecodesign Directive 2009/125/EC + EU 548/2014 (Tier-2 losses)',
    'standard:26. BimSchV (German EMF limits ≤100 µT)',
    'standard:CEI 99-4 / CEI 0-16 (Italy MV grid connection)',
    'industry:ABB CAST RESIN / DRY-Type / TXpert',
    'industry:Siemens GEAFOL / FITformer',
    'industry:Schneider Minera / Vegeta / Trihal',
    'industry:Hammond Power Solutions cast-coil',
    'industry:GE Prolec / Areva substation transformer',
  ],
}

registerClassReferenceGraph(DISTRIBUTION_TRANSFORMER)

export { DISTRIBUTION_TRANSFORMER }
