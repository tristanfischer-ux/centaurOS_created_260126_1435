/**
 * @file class-reference-graphs/insulin-pump.ts — K10 typed graph for
 * wearable insulin pumps (continuous subcutaneous insulin infusion / CSII).
 *
 * @description Models a wearable insulin pump in the Tandem t:slim X2 +
 * Control-IQ / Insulet Omnipod 5 + DASH / Medtronic 780G class. Two
 * architectures share the same K10 module set: (a) tubed pump (t:slim,
 * 780G) — a reservoir-pump-display unit clipped to the body with a
 * separate cannula via an infusion-set tube; (b) tubeless pod (Omnipod) —
 * a 26 g adhesive patch with integrated reservoir + cannula + pump
 * mechanism, paired to a separate Personal Diabetes Manager (PDM)
 * controller phone-app. Both interoperate with a CGM (Dexcom G6/G7,
 * Freestyle Libre 2/3) via Bluetooth Low Energy for automated closed-
 * loop (hybrid AID) operation.
 *
 * @sources Corpus values from `pretraining_extracted_specs` joined to
 * `pretraining_spec_documents WHERE product_class='insulin_pump'` in
 * ~/.forge-truth/forge-truth.db (18 datasheets, well-covered — primarily
 * Insulet Omnipod 5).
 *
 * @corpus-coverage-2026-05-18
 *   - Reservoir / cartridge capacity: 200 units (Omnipod) / 300 units
 *     (t:slim) — corpus direct.
 *   - Cartridge volume: 2-3 mL — corpus direct.
 *   - Cartridge usage interval: 3 days — corpus direct.
 *   - Adhesive duration: 3 days — corpus direct.
 *   - Basal delivery rate: 0-35 U/hr (Omnipod) / 0.05-30 U/hr (t:slim) — corpus.
 *   - Basal pulse increment: 0.05 U — corpus direct.
 *   - Bolus delivery speed (Standard): 1.5 U/min; (Quick): 15 U/min — corpus.
 *   - Bolus range: 0.05-30 U — corpus direct.
 *   - Compatible insulin: U-100 (NovoLog/Humalog/Lyumjev) — corpus.
 *   - Maximum infusion pressure: 35 psi (~2.4 bar) — corpus direct.
 *   - Cannula insertion depth: 0.16-0.28 inch (~4-7 mm) — corpus direct.
 *   - Communication: Bluetooth Low Energy 2.400-2.480 GHz — corpus direct.
 *   - Communication range: 1.5 m (standard) / 15 m (max) — corpus direct.
 *   - Controller battery: 2800 mAh @ 3.8 V Li-ion + Micro-B USB charger — corpus.
 *   - Pod weight: 26 g — corpus direct.
 *   - IP rating: IP28 (Pod waterproof to 7.6 m / 25 ft for 60 min) / IP22
 *     (controller) — corpus direct.
 *   - Alarm output: 45 dB(A) — corpus direct.
 *   - Automated insulin delivery interval: 5 minutes — corpus direct.
 *   - Controller operating temp: 5-40 °C — corpus direct.
 *   - RF separation distance: 30 cm — corpus direct.
 *   - Standards: 21 CFR 880.5725 (infusion pump), 21 CFR 880.5730 (ACE pump),
 *     IEC 60601-1 (medical electrical), IEC 60601-2-24 (infusion pump),
 *     IEC 60601-1-10 (physiologic closed-loop), IEC 62304 (software),
 *     ISO 14971 (risk), ISO 13485 (QMS), ISO 10993-1/-5/-10/-12/-17/-18
 *     (biocompatibility), HIPAA, FCC Part 15 — corpus extensive.
 *
 * @scope-2026-05-18
 *   - Both tubed-pump and tubeless-pod architectures.
 *   - Closed-loop (AID) with paired CGM is the standard case — the CGM ↔
 *     PDM edge is REQUIRED for AID-capable units; the controller-to-pump
 *     edge is REQUIRED universally.
 *   - Glucagon pumps and patch-CGM/pump combined products are out of scope —
 *     they share modules but the closed-loop algorithm differs.
 *   - The CGM sensor itself is OUT of scope — referenced as an external
 *     sensor at the BLE boundary.
 */

import { registerClassReferenceGraph, type ProductClassGraph } from '../class-reference-graph.js'

const INSULIN_PUMP: ProductClassGraph = {
  product_class: 'insulin_pump',
  display_name: 'Wearable Insulin Pump (CSII, tubeless or tubed, AID-capable)',
  scope_notes:
    'Wearable insulin pump (continuous subcutaneous insulin infusion). Covers both tubed (Tandem ' +
    't:slim X2, Medtronic 780G) and tubeless pod (Insulet Omnipod 5) architectures. AID-capable ' +
    'with a paired CGM (Dexcom G6/G7, FreeStyle Libre 2/3) over Bluetooth Low Energy. CGM sensor ' +
    'itself is OUT of scope. Combined CGM+pump products and glucagon pumps are separate graphs.',

  nodes: [
    {
      class: 'mass_fluid_transport_process',
      role: 'principal',
      required: true,
      display: 'Insulin reservoir + micro pump (lead-screw piston or piezoelectric) + occlusion sensor',
    },
    {
      class: 'actuation_kinematics',
      role: 'actuator',
      required: true,
      display: 'Spring-loaded cannula inserter + soft Teflon cannula (4-7 mm subcutaneous)',
    },
    {
      class: 'control_compute_communication',
      role: 'subsystem',
      required: true,
      display: 'Pod MCU (motor drive + BLE) + PDM controller (AID algorithm + UI + 4G optional)',
    },
    {
      class: 'energy_storage_source',
      role: 'subsystem',
      required: true,
      display: 'Pod primary battery (zinc-air / Li primary, ~80 hr life) + PDM 2800 mAh Li-ion rechargeable',
    },
    {
      class: 'sensing_instrumentation',
      role: 'sensor',
      required: true,
      display: 'Occlusion / pressure sensor + reservoir-volume sensor + skin-contact detect + CGM data feed',
    },
    {
      class: 'safety_protection',
      role: 'safety',
      required: true,
      display: 'Occlusion alarm + low-reservoir + auto-suspend on low glucose + audible 45 dB(A) alarm + watchdog',
    },
    {
      class: 'structure_containment',
      role: 'enclosure',
      required: true,
      display: 'Pod IP28 housing + medical-grade adhesive patch (3-day wear) + biocompatible plastics',
    },
    {
      class: 'environmental_interface',
      role: 'subsystem',
      required: true,
      display: 'Skin-contact adhesive + cannula site + BLE 2.4 GHz radio path to CGM and PDM',
    },
    {
      class: 'hmi_ergonomics',
      role: 'subsystem',
      required: true,
      display: 'PDM touchscreen (smartphone app on Omnipod 5) — bolus entry + alarms + history + presets',
    },
    {
      class: 'power_distribution',
      role: 'subsystem',
      required: false,
      display: 'Micro-B USB charge port (PDM) + 100-240 VAC charger; pod has no external power port',
    },
    {
      class: 'maintenance_serviceability',
      role: 'service',
      required: false,
      display: 'Cartridge fill port + adhesive removal + pod swap every 3 days (consumable)',
    },
  ],

  edges: [
    // ── Insulin delivery path ──
    {
      from_class: 'mass_fluid_transport_process',
      to_class: 'actuation_kinematics',
      protocol: 'physical',
      mechanism: 'fluid_routing',
      fluid: {
        medium: 'process-fluid', // U-100 insulin
        pressure_max_bar: 2.4,    // 35 psi corpus
        flow_max_lpm: 0.0015,     // 15 U/min Quick bolus = 0.15 mL/min = 0.00015 L/min; using max conservative
      },
      mechanical: { connector: 'cannula hub barb', cable_type: 'integrated reservoir-to-cannula channel (Omnipod) or 23/43 inch infusion tube (t:slim)' },
      required: true,
      direction: 'directional',
      notes: 'Lead-screw piston (Omnipod) or syringe-style stepper (t:slim) drives U-100 insulin from a 200-300 unit reservoir through a soft Teflon cannula at 4-7 mm subcutaneous depth (corpus: 0.16-0.28 in). Max infusion pressure 35 psi (~2.4 bar) (corpus); basal pulse increment 0.05 U (corpus). Standard bolus 1.5 U/min, Quick 15 U/min (corpus).',
      source_references: [
        'corpus:Maximum Infusion Pressure@insulin_pump (35 psi)',
        'corpus:Basal pulse increment@insulin_pump (0.05 U)',
        'corpus:Bolus delivery speed (Standard)@insulin_pump (1.5 units/minute)',
        'corpus:Bolus delivery speed (Quick)@insulin_pump (15 units/minute)',
        'corpus:Cannula insertion depth@insulin_pump (0.16-0.28 in)',
        'corpus:Cartridge Capacity@insulin_pump (200 units)',
        'corpus:Cartridge Volume@insulin_pump (3 mL)',
        'corpus:Compatible Insulin@insulin_pump (NovoLog U-100 Insulin)',
        'standard:IEC 60601-2-24 (infusion pump particulars)',
        'standard:U-100 insulin concentration',
      ],
    },

    // ── Pump drive (control → pump) ──
    {
      from_class: 'control_compute_communication',
      to_class: 'mass_fluid_transport_process',
      protocol: 'PWM',
      mechanism: 'contactor_command',
      electrical: { voltage_nominal_v: 3.0, ac_or_dc: 'DC' },
      required: true,
      direction: 'directional',
      notes: 'Pod MCU drives the lead-screw stepper or piezo pump in 0.05 U pulses. Automated delivery interval 5 minutes (corpus) — every 5 min the AID algorithm computes the next micro-bolus and commands the pump. Insulin pulse delivery 0.05 U (corpus).',
      source_references: [
        'corpus:Automated insulin delivery interval@insulin_pump (5 minutes)',
        'corpus:Insulin pulse delivery@insulin_pump (0.05 U)',
        'corpus:Minimum insulin delivery threshold for notification@insulin_pump (0.05 U/hr)',
        'standard:IEC 60601-1-10 (closed-loop)',
      ],
    },

    // ── Cannula insertion (one-shot) ──
    {
      from_class: 'actuation_kinematics',
      to_class: 'environmental_interface',
      protocol: 'physical',
      mechanism: 'mechanical_mount',
      mechanical: { mount: 'standoff', connector: 'spring-loaded inserter + retractable needle' },
      required: true,
      direction: 'directional',
      notes: 'One-shot insertion at pod activation: a stainless-steel introducer needle drives the soft Teflon cannula 4-7 mm subcutaneous, then retracts. The needle is sealed inside the pod after retraction (no sharps exposure). Adhesive wear duration 3 days (corpus).',
      source_references: [
        'corpus:Cannula insertion depth@insulin_pump (0.16-0.28 in)',
        'corpus:Adhesive duration@insulin_pump (3 days)',
        'standard:ISO 7864 (sterile hypodermic needles)',
        'standard:ISO 10555-1 (intravascular catheters)',
      ],
    },

    // ── CGM data feed (sensor → control via BLE) ──
    {
      from_class: 'sensing_instrumentation',
      to_class: 'control_compute_communication',
      protocol: 'BLE',
      mechanism: 'rf_path',
      electrical: { ac_or_dc: 'DC' },
      required: true,
      direction: 'mutual',
      notes: 'BLE 2.400-2.480 GHz (corpus) data feed from a paired CGM (Dexcom G6/G7, FreeStyle Libre 2/3) every 5 min. CGM glucose range 40-400 mg/dL (corpus). Pairing range 1.5 m standard / 15 m max (corpus). Min separation from other RF emitters 30 cm (corpus). 12-min calibration validity window (corpus). Required for AID; degrades to open-loop on CGM signal loss.',
      source_references: [
        'corpus:Communication Protocol@insulin_pump (Bluetooth Low Energy (BLE))',
        'corpus:RF Frequency@insulin_pump (2.400-2.480 GHz)',
        'corpus:CGM Value range@insulin_pump (40-400 mg/dL)',
        'corpus:Communication range (maximum)@insulin_pump (15 meters)',
        'corpus:Pod communication range@insulin_pump (1.5 to 15 metres)',
        'corpus:BG meter reading validity window@insulin_pump (12 minutes)',
        'standard:IEEE ANSI C63.27-2017 (wireless coexistence)',
        'standard:Bluetooth Low Energy',
      ],
    },

    // ── Pod ↔ PDM control link ──
    {
      from_class: 'control_compute_communication',
      to_class: 'hmi_ergonomics',
      protocol: 'BLE',
      mechanism: 'rf_path',
      electrical: { ac_or_dc: 'DC' },
      mechanical: { connector: 'BLE antenna integrated in pod and PDM' },
      required: true,
      direction: 'mutual',
      notes: 'Pod MCU ↔ PDM (Personal Diabetes Manager) over BLE for user-initiated bolus, pause delivery, alarm acknowledgment, history sync. Pod alarm communication delay 25 s awake / 6 min asleep (corpus). Pod weight only 26 g (corpus) — comms must be ultra-low-power.',
      source_references: [
        'corpus:Pod alarm communication delay (awake)@insulin_pump (25 seconds)',
        'corpus:Pod alarm communication delay (asleep)@insulin_pump (6 minutes)',
        'corpus:Pod Weight@insulin_pump (26 grams)',
        'standard:FCC Part 15 Subpart C',
      ],
    },

    // ── Pod sensor feedback ──
    {
      from_class: 'control_compute_communication',
      to_class: 'sensing_instrumentation',
      protocol: 'Analog-thermistor',
      mechanism: 'sensor_feedback',
      electrical: { voltage_nominal_v: 3.0, ac_or_dc: 'DC' },
      required: true,
      direction: 'mutual',
      notes: 'Pod MCU reads occlusion / motor-stall sensor (pressure transducer or motor-current proxy), reservoir-volume tracking (mechanical encoder on lead-screw), and ambient temp. Occlusion alarm time scales with basal rate: 51 hr typical at 0.05 U/hr, 3 hr at 1.00 U/hr, 33 min for 5 U bolus (corpus). 16-bit A/D conversion (corpus).',
      source_references: [
        'corpus:A/D Conversion@insulin_pump (16 bit)',
        'corpus:0.05 U/hr basal occlusion alarm time (typical)@insulin_pump (51 hours)',
        'corpus:1.00 U/hr basal occlusion alarm time (typical)@insulin_pump (3.0 hours)',
        'corpus:5.00 U bolus occlusion alarm time (typical)@insulin_pump (33 minutes)',
        'corpus:Low reservoir threshold@insulin_pump (5 units)',
      ],
    },

    // ── Safety alarms ──
    {
      from_class: 'safety_protection',
      to_class: 'mass_fluid_transport_process',
      protocol: 'Digital-5V',
      mechanism: 'safety_isolation',
      electrical: { voltage_nominal_v: 3.0, ac_or_dc: 'DC' },
      required: true,
      direction: 'directional',
      notes: 'On occlusion, low-reservoir, low-glucose-predicted, or watchdog timeout, the safety logic commands the pump to suspend insulin delivery and triggers a 45 dB(A) audible alarm (corpus). Automated mode adjustment loops every 5 min (corpus) and can drop into Limited state after 20 min without CGM data (corpus).',
      source_references: [
        'corpus:Alarm output@insulin_pump (45 db(A))',
        'corpus:Automated: Limited Trigger Time@insulin_pump (20 minutes)',
        'corpus:Automated Mode Calculation Interval@insulin_pump (5 minutes)',
        'corpus:Missing CGM values advisory alarm time@insulin_pump (60 minutes)',
        'standard:21 CFR 880.5730 (ACE pump)',
        'standard:IEC 60601-1-8 (alarm systems)',
      ],
    },
    {
      from_class: 'safety_protection',
      to_class: 'sensing_instrumentation',
      protocol: 'Analog-thermistor',
      mechanism: 'alarm_interlock',
      required: true,
      direction: 'mutual',
      notes: 'Hypo/hyper-glycaemia detection on CGM stream drives auto-suspend (predicted-low-glucose suspend, PLGS). High CGM threshold 400 mg/dL, low threshold 40 mg/dL (corpus). Suspend-before-low and suspend-on-low are mandatory ACE-pump features.',
      source_references: [
        'corpus:High CGM threshold@insulin_pump (400 mg/dL)',
        'corpus:Low CGM threshold@insulin_pump (40 mg/dL)',
        'standard:21 CFR 880.5730 (ACE pump)',
      ],
    },

    // ── Power path ──
    {
      from_class: 'energy_storage_source',
      to_class: 'control_compute_communication',
      protocol: 'physical',
      mechanism: 'dc_busbar',
      electrical: {
        voltage_nominal_v: 3.8,
        ac_or_dc: 'DC',
        current_max_a: 1,
      },
      required: true,
      direction: 'directional',
      notes: 'Pod uses a primary zinc-air or lithium primary battery sealed in for the 3-day pod life. PDM uses a 2800 mAh @ 3.8 V Li-ion rechargeable (corpus). Pod has no external power port; PDM charges via Micro-B USB 100-240 VAC (corpus). Low-power BLE peripheral mode keeps pod current to mA-class average.',
      source_references: [
        'corpus:Controller Battery Capacity@insulin_pump (2800 mAh)',
        'corpus:Controller Battery Voltage@insulin_pump (3.8 V)',
        'corpus:Battery Charger Voltage@insulin_pump (100 to 240 VAC)',
        'corpus:Charging port type@insulin_pump (Micro-B USB)',
        'corpus:Battery type@insulin_pump (NiMH)',
      ],
    },

    // ── Skin-contact mounting ──
    {
      from_class: 'structure_containment',
      to_class: 'environmental_interface',
      protocol: 'physical',
      mechanism: 'mechanical_mount',
      mechanical: { mount: 'standoff', connector: '3M / Smith&Nephew medical adhesive' },
      required: true,
      direction: 'mutual',
      notes: 'Hypoallergenic medical-grade adhesive bonds the pod or infusion-set base to skin for 3 days (corpus). IP28 water rating (Pod) — submersible to 7.6 m / 25 ft for 60 minutes (corpus). PDM IP22 (drip-tight only). Biocompatibility per ISO 10993-1/-5/-10/-18.',
      source_references: [
        'corpus:Adhesive duration@insulin_pump (3 days)',
        'corpus:Pod IP rating@insulin_pump (IP28)',
        'corpus:IP Rating (Controller)@insulin_pump (IP22)',
        'standard:ISO 10993-1 (biocompatibility evaluation)',
        'standard:ISO 10993-5 (cytotoxicity)',
        'standard:ISO 10993-10 (irritation)',
      ],
    },

    // ── HMI (user-facing controller) ──
    {
      from_class: 'control_compute_communication',
      to_class: 'sensing_instrumentation',
      protocol: 'Digital-24V',
      mechanism: 'hmi_data',
      required: true,
      direction: 'mutual',
      notes: 'PDM touchscreen (smartphone-app form factor in Omnipod 5; dedicated handheld in t:slim) hosts the AID algorithm UI, bolus calculator, history, alerts. Carbs input 0.1-225 g (corpus), correction factor 1-400 mg/dL (corpus). Backlight timeout 15-180 s (corpus). Controller operating temp 5-40 °C (corpus).',
      source_references: [
        'corpus:Carbs input range@insulin_pump (0.1 – 225 g)',
        'corpus:Correction Factor range@insulin_pump (1 – 400 mg/dL)',
        'corpus:Backlight timeout@insulin_pump (15, 30, 60, 180 seconds)',
        'corpus:Controller operating temperature@insulin_pump (5 to 40 °C)',
        'standard:IEC 62366-1 (usability engineering)',
        'standard:ANSI/AAMI HE74:2001 (human factors)',
      ],
    },

    // ── Service ──
    {
      from_class: 'maintenance_serviceability',
      to_class: 'mass_fluid_transport_process',
      protocol: 'physical',
      mechanism: 'cable_transit',
      mechanical: { mount: 'panel', connector: 'reservoir fill port (Luer)' },
      required: false,
      direction: 'mutual',
      notes: 'User-side service: fill reservoir from a U-100 vial via Luer or proprietary fill needle, replace pod / cartridge every 3 days (corpus). Adhesive duration 3 days (corpus). No field-serviceable internals — the pod is a sealed consumable.',
      source_references: [
        'corpus:Cartridge Usage Interval@insulin_pump (3 days)',
        'corpus:Adhesive duration@insulin_pump (3 days)',
        'industry:Insulet Omnipod 5 user guide (filling)',
      ],
    },
  ],

  sources_cited: [
    'corpus:insulin_pump (~18 datasheets, 2026-05-18; primarily Insulet Omnipod 5)',
    'standard:21 CFR 880.5725 (infusion pump regulation)',
    'standard:21 CFR 880.5730 (ACE pump — alternate controller enabled)',
    'standard:IEC 60601-1 (medical electrical, basic safety)',
    'standard:IEC 60601-1-2 (EMC)',
    'standard:IEC 60601-1-8 (alarm systems)',
    'standard:IEC 60601-1-10 (physiologic closed-loop)',
    'standard:IEC 60601-1-11 (home healthcare)',
    'standard:IEC 60601-2-24 (infusion pumps)',
    'standard:IEC 62304 (medical device software)',
    'standard:IEC 62366-1 (usability)',
    'standard:ISO 14971 (risk management)',
    'standard:ISO 13485 (QMS)',
    'standard:ISO 10993-1/-5/-10/-12/-17/-18 (biocompatibility)',
    'standard:ISO 7864 (sterile hypodermic needles)',
    'standard:ISO 10555-1 (intravascular catheters)',
    'standard:ISO 11608-1 (pen-injectors)',
    'standard:FCC Part 15 Subpart C (RF emissions)',
    'standard:IEEE ANSI C63.27-2017 (wireless coexistence)',
    'standard:HIPAA (privacy)',
    'standard:Medical Device Regulation (EU) 2017/745',
    'industry:Insulet Omnipod 5 + DASH datasheets',
    'industry:Tandem t:slim X2 + Control-IQ datasheet',
    'industry:Medtronic 780G datasheet',
  ],
}

registerClassReferenceGraph(INSULIN_PUMP)

export { INSULIN_PUMP }
