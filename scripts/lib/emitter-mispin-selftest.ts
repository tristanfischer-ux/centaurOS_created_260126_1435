#!/usr/bin/env npx tsx
/**
 * emitter-mispin-selftest.ts — proveCatch for the DB-name-match mis-pin guards in emitter-completion.ts
 * (Tristan 2026-06-28). These guards run on the Discover-on-miss / fill-blank DB-first pin path and keep
 * a generic spec rather than ship a wrong-domain or undersized part. Each case below is a REAL mis-pin the
 * physics critic flagged (or its legit counter-case) — the guard must FIRE on the bad input and stay
 * SILENT on the good one. Wired into verify-engine-guards.sh.
 */
import { isElectronicsIcMispin, isCommodityProcessValve, partFlowCapacityM3h, isIndicatorLightMispin, isMotorDriveSlot, isBoardMountSensorMispin, isCatalogueComponent, foldPluralToken, dbHitAcceptableForWord, motorDriveRatingAcceptable, partPowerRatingKw, wordMotorDriveDutyKw, partNameLeadSegment, isAccessoryRow, headNounHit, type DbPart } from '../../src/lib/pdf-engine-v2/lib/emitter-completion'

let failures = 0
const expect = (cond: boolean, msg: string) => { if (!cond) { failures++; console.error('  ✗ ' + msg) } }

// ── isElectronicsIcMispin — an IC-vendor chip on a field-instrument OR control/distribution slot is wrong
expect(isElectronicsIcMispin('PLC Controller', 'Renesas / Intersil') === true,
  "ISL1571IRZ (Renesas/Intersil DSL-driver IC) pinned as a 'PLC Controller' MUST be flagged (compound vendor split)")
expect(isElectronicsIcMispin('Dc3 Power Controller', 'Renesas / Intersil') === true,
  "the SAME IC on the RENAMED slot 'Dc3 Power Controller' MUST still be flagged (name-variance robustness)")
expect(isElectronicsIcMispin('Low Pressure Switch', 'Maxim Integrated') === true,
  "a Maxim IC on a 'Low Pressure Switch' MUST stay flagged (field-instrument case preserved)")
expect(isElectronicsIcMispin('Cable Tray', 'Texas Instruments') === true,
  "an IC vendor on cable tray (cabling) MUST be flagged")
expect(isElectronicsIcMispin('Reverse Osmosis Skid', 'Veolia') === false,
  "a legit principal from a process vendor must NOT be flagged")
expect(isElectronicsIcMispin('Conductivity Sensor', 'Endress+Hauser') === false,
  "a real field-instrument vendor must NOT be flagged")
expect(isElectronicsIcMispin('Control Cabinet', 'Rittal') === false,
  "a populated enclosure (excluded slot) + non-IC vendor must NOT be flagged")
expect(isElectronicsIcMispin('Irrigation Pump', 'Grundfos') === false,
  "a pump (not a wrong-domain slot) from a pump vendor must NOT be flagged")

// ── isBoardMountSensorMispin — a PCB board-mount sensor chip must not pin a process field-device slot
expect(isBoardMountSensorMispin('Differential-Pressure Switch', 'HSCDLNN100MDSA5') === true,
  "the EXACT v37 gate-21 case: Honeywell HSCDLNN100MDSA5 (board sensor) on a 'Differential-Pressure Switch' MUST be flagged")
expect(isBoardMountSensorMispin('Pressure Transmitter', 'SSCDANN150PG2A3') === true,
  "a Honeywell SSC-series board sensor on a 'Pressure Transmitter' MUST be flagged")
expect(isBoardMountSensorMispin('Level Switch', 'ABPDANT001PG2A3') === true,
  "a Honeywell ABP-series board sensor on a field 'Level Switch' MUST be flagged")
expect(isBoardMountSensorMispin('Differential-Pressure Switch', 'DPS-400-2-N4') === false,
  "a REAL field DP-switch MPN (not a board-sensor family) must NOT be flagged")
expect(isBoardMountSensorMispin('Reverse Osmosis Skid', 'HSCDLNN100MDSA5') === false,
  "even a board-sensor MPN on a NON-field-instrument slot (a skid) must NOT be flagged (slot guard)")
expect(isBoardMountSensorMispin('Conductivity Sensor', 'CLS21D-A1A') === false,
  "a real E+H field-sensor MPN must NOT be flagged")

// ── isIndicatorLightMispin — a panel pilot light / LED indicator must not pin a non-light slot
expect(isIndicatorLightMispin('Cable Trays', { part_name: 'LED Panel Mount Indicators K30LM Series EZ-LIGHT: 1-Color Hazardous Area Indicator', raw_excerpt: 'Banner EZ-LIGHT' }) === true,
  "K30LMBXXP (LED EZ-LIGHT indicator) pinned as 'Cable Trays' MUST be flagged")
expect(isIndicatorLightMispin('Pilot Indicator Light', { part_name: 'LED Panel Mount Indicators K30LM' }) === false,
  "the SAME indicator pinned to an actual indicator-light slot must NOT be flagged")
expect(isIndicatorLightMispin('Cable Trays', { part_name: 'Steel Cable Tray 300mm', raw_excerpt: 'hot-dip galvanised' }) === false,
  "a real cable tray on the cable-tray slot must NOT be flagged")
expect(isIndicatorLightMispin('Level Sensor', { part_name: 'Photoelectric Sensor', raw_excerpt: 'optical retroreflective sensor' }) === false,
  "an optical SENSOR (not an indicator light) must NOT be flagged — no over-reach on component_class 'optical'")

// ── isCommodityProcessValve — a simple mechanical valve is generic-spec; an actuated/dosing one is not
expect(isCommodityProcessValve('Non-Return Valve') === true, "a non-return valve is commodity → generic spec")
expect(isCommodityProcessValve('Pneumatic Actuated Valve') === false, "an actuated valve carries a real MPN")
expect(isCommodityProcessValve('Reverse Osmosis Skid') === false, "a non-valve must not be a commodity-valve")

// ── partFlowCapacityM3h — parse the candidate's flow capacity from its raw_excerpt (the Dosatron case)
expect(partFlowCapacityM3h({ part_name: 'Dosatron D8RE5', raw_excerpt: 'water-powered doser, 0.3–8 m³/h' }) === 8 ||
       partFlowCapacityM3h({ part_name: 'Dosatron D8RE5', raw_excerpt: '8 m3/h max flow' }) === 8,
  "the Dosatron D8RE5 capacity (8 m³/h) must parse from raw_excerpt so the capacity gate can fire vs a 45 m³/h duty")

// ── isMotorDriveSlot — a VFD / drive / soft-starter is generic-spec (frame sized to its motor), not a
//    name-matched DB MPN (the ABB ACS580-01-12A6-4 ≈ 5.5 kW pinned on a 15 kW pump's drive = physics HIGH)
expect(isMotorDriveSlot('Vfd Controller') === true, "a VFD controller is a motor drive → generic spec")
expect(isMotorDriveSlot('Vfd Drive') === true, "a VFD drive is a motor drive → generic spec")
expect(isMotorDriveSlot('Soft Starter') === true, "a soft-starter is a motor drive → generic spec")
expect(isMotorDriveSlot('Variable Speed Drive') === true, "a variable-speed drive is a motor drive")
expect(isMotorDriveSlot('Irrigation Pump') === false, "a pump is not a drive (it carries its own duty)")
expect(isMotorDriveSlot('Direct Drive Generator') === false, "a direct-drive generator is not a motor controller")
expect(isMotorDriveSlot('Hard Disk Drive') === false, "a disk drive is not a motor controller")

// ── BAR A (2026-07-03): plural-folded candidacy lexicon — an industrial catalogue family must be a
//    fill-blank candidate (the singular-only \bvalve\b + missing nouns kept 52 engineered lines TBD
//    while their verified parts sat in forge-truth.db), and scope/structural items must stay refused.
expect(foldPluralToken('valves') === 'valve' && foldPluralToken('switches') === 'switch' &&
       foldPluralToken('batteries') === 'battery' && foldPluralToken('ups') === 'ups',
  'plural fold: valves→valve, switches→switch, batteries→battery; UPS never folds')
for (const nm of ['Manual Isolation Valves', 'Pressure Transmitters', 'Control + Instrument UPS',
                  'Standby Diesel Generator', 'SCADA / Plant Control System', 'pH Analyser',
                  'UV Disinfection', 'Electrical Control Panel', 'Main Switchboard',
                  'Emergency Stop Button', 'Variable-Speed Drive', 'Surge Protection Device']) {
  expect(isCatalogueComponent(nm) === true, `Bar A candidacy: '${nm}' is a purchased catalogue family`)
}
for (const nm of ['Piping Network', 'Stack Design', 'battery_pack_enclosure', 'Access Panel',
                  'wing_spar', 'motor_pylon_mount']) {
  expect(isCatalogueComponent(nm) === false, `Bar A candidacy: '${nm}' stays structural/scope (never MPN-pinned)`)
}

// ── TYPE-COHERENCE (gate-15 spirit): the head noun must hit the candidate's LEADING family phrase.
//    The Hoogendoorn iSii (a process COMPUTER whose text mentions 'fertigation') must never pin the
//    'Fertigation Dosing Pump' word; the type-correct Grundfos dosing pump must.
const _iSii: DbPart = { part_name: 'SCADA / plant control system — horticultural irrigation and fertigation process computer', manufacturer: 'Hoogendoorn', part_number: 'iSii', component_class: 'water_treatment', unit_price_gbp: null }
const _grundfos: DbPart = { part_name: 'Fertigation dosing / injection pump — vertical multistage, 30 m3/h @ 53.1 m, 7.5 kW', manufacturer: 'Grundfos', part_number: '96122012', component_class: 'water_treatment', unit_price_gbp: null }
expect(dbHitAcceptableForWord(_iSii, 'Fertigation Dosing Pump') === false,
  "the iSii process computer MUST be refused on a dosing PUMP word (the lm-only-rubber-stamped mis-pin family)")
expect(dbHitAcceptableForWord(_grundfos, 'Fertigation Dosing Pump') === true,
  'the type-correct Grundfos fertigation dosing pump MUST be accepted')
expect(dbHitAcceptableForWord(_iSii, 'SCADA / Plant Control System') === true,
  'the iSii MUST still pin its OWN family (a SCADA/plant-control word)')
const _panelPc: DbPart = { part_name: 'HMI Displays & Panel PCs 12.1" XGA fanless touch panel computer with Intel Celeron processor N3060, 5-wire resistive touch screen and 24 VDC power input (terminal block connector)', manufacturer: 'Axiomtek', part_number: 'GOT5120T-845', component_class: 'oem_subsystem', unit_price_gbp: null }
expect(dbHitAcceptableForWord(_panelPc, 'Terminal Blocks') === false,
  "a panel PC whose spec TAIL says '(terminal block connector)' must never pin 'Terminal Blocks' (lead-segment discipline)")
const _wika: DbPart = { part_name: 'Pressure transmitter — 0-7 bar (0-100 psi), 4-20 mA, G1/4', manufacturer: 'WIKA', part_number: '50372475', component_class: 'water_treatment', unit_price_gbp: null }
expect(dbHitAcceptableForWord(_wika, 'Low Pressure Switch') === false,
  'a pressure TRANSMITTER must never pin a pressure SWITCH word (head-noun families never cross)')
const _eatonEstop: DbPart = { part_name: 'Emergency stop switch station — safety mushroom pushbutton 38 mm, pull-to-release, 1NC+1NO (ISO 13850)', manufacturer: 'Eaton', part_number: '216516', component_class: 'water_treatment', unit_price_gbp: null }
expect(dbHitAcceptableForWord(_eatonEstop, 'Emergency Stop Button') === true,
  "the Eaton e-stop SWITCH station must pin the 'Emergency Stop Button' word (same-family head synonym)")
expect(isAccessoryRow('Circuit Breaker Accessories 508, DM, 40A Entrance Supply module REX12-T') === true &&
       isAccessoryRow('Mains incomer circuit breaker — Tmax XT1N 160 MCCB') === false,
  'an ACCESSORY row is recognised by its lead family phrase; a primary breaker is not')
expect(headNounHit(partNameLeadSegment('Board Mount Pressure Sensors Harsh Media 100PSI Absolute Pressure Element, Sawn Wafer on Tape'), 'element') === false,
  "a tail 'Element' mention on a board-mount sensor never counts as the family (lead segment cuts it)")

// ── BAR B: DUTY-AWARE motor-drive pin — in-band pins allowed, undersize stays refused, no-duty stays TBD.
expect(motorDriveRatingAcceptable(15, 5.5) === false,
  'the ACS580 5.5 kW frame on a 15 kW pump duty (the original physics HIGH) must stay refused')
expect(motorDriveRatingAcceptable(4.2, 4) === true && motorDriveRatingAcceptable(7.5, 15) === true,
  'frame-rounding (4 kW on 4.2 kW nameplate) and next-frame-up (15 kW on 7.5 kW) are in band')
expect(motorDriveRatingAcceptable(4.2, null) === false, 'a candidate with NO parseable kW never pins')
expect(partPowerRatingKw({ part_name: 'VFD drive — variable frequency drive 15 kW, 3x380-480 V, IP20, 31 A (VLT Micro Drive FC-51)' }) === 15,
  "the drive kW parses from the row's family text")
expect(wordMotorDriveDutyKw({ modifier_characters: [{ kind: 'rating_primary', value: '7.5', unit: 'kW' }] } as any) === 7.5,
  "the driven-motor duty reads from the word's own rating_primary kW")
expect(wordMotorDriveDutyKw({ modifier_characters: [{ kind: 'quantity', value: '×1' }] } as any) === null,
  'a duty-less drive word resolves NO duty (stays the honest generic TBD)')

if (failures) { console.error(`emitter-mispin selftest: ${failures} FAILED`); process.exit(1) }
console.log('emitter-mispin selftest OK (IC-vendor wrong-domain + commodity-valve + flow-capacity + motor-drive guards + Bar-A candidacy + type-coherence + duty-band proven)')
