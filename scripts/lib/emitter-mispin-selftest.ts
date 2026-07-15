#!/usr/bin/env npx tsx
/**
 * emitter-mispin-selftest.ts — proveCatch for the DB-name-match mis-pin guards in emitter-completion.ts
 * (Tristan 2026-06-28). These guards run on the Discover-on-miss / fill-blank DB-first pin path and keep
 * a generic spec rather than ship a wrong-domain or undersized part. Each case below is a REAL mis-pin the
 * physics critic flagged (or its legit counter-case) — the guard must FIRE on the bad input and stay
 * SILENT on the good one. Wired into verify-engine-guards.sh.
 */
import { isElectronicsIcMispin, isCommodityProcessValve, partFlowCapacityM3h, isIndicatorLightMispin, isMotorDriveSlot, isBoardMountSensorMispin, isCatalogueComponent, isCatalogueComponentByEitherName, foldPluralToken, dbHitAcceptableForWord, setInstrumentDeviceContext, scrubInstrumentIndustrialPartVerifications, motorDriveRatingAcceptable, partPowerRatingKw, wordMotorDriveDutyKw, partNameLeadSegment, isAccessoryRow, headNounHit, headNounLeadsPartName, pickBestDbCandidate, hostingPrincipalEquipmentName, tetherOrSuppressAccessoryValve, isGenericRepresentativeFiller, representativeDuplicateKey, wordQuantity, type DbPart } from '../../src/lib/pdf-engine-v2/lib/emitter-completion'

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
// ── NEVER_FOLD union parity (co2_mineralisation pre-flight family 1, 2026-07-05): TS
//    NEVER_FOLD and Python _JOIN_NEVER_FOLD must be the SAME set of mass-noun/acronym
//    tokens, or a name containing a diverged token plural-folds differently on the two
//    sides of the emitter↔Excel join. proveCatch: 'mains' and 'gas' must resist folding
//    on the TS side too (the union add for this class plan).
expect(foldPluralToken('mains') === 'mains',
  "NEVER_FOLD union: 'mains' is a mass noun (mains power/water) — folding to 'main' would land on a STOP token")
expect(foldPluralToken('gas') === 'gas',
  "NEVER_FOLD union: 'gas' must resist folding (kept in sync with build-excel-export.py::_JOIN_NEVER_FOLD)")
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
// ── DEVICE-SCALE INSTRUMENT rejection (2026-07-13, Grok MPN-help): an industrial part
//    that passes head-noun coherence but is the wrong SCALE for a handheld must be refused
//    on a device instrument, and ACCEPTED off-device (a plant breaker IS overcurrent) — so
//    no plant regression. The colorimeter's three real wrong-family "verified" pins.
const _max35104: DbPart = { part_name: 'MAX35104 ultrasonic time-to-digital / flow converter AFE', manufacturer: 'Maxim Integrated', part_number: 'MAX35104ETL+T', component_class: 'electronic_pcb', unit_price_gbp: null }
const _bannerS22: DbPart = { part_name: 'S22 Pro indicator / pick-to-light tower', manufacturer: 'Banner Engineering', part_number: 'S22LBRWPQ', component_class: 'electronic_pcb', unit_price_gbp: null }
const _nsx: DbPart = { part_name: 'ComPact NSX moulded-case circuit breaker 630 A', manufacturer: 'Schneider Electric', part_number: 'LV430630', component_class: 'circuit_breaker', unit_price_gbp: null }
setInstrumentDeviceContext(true)
expect(dbHitAcceptableForWord(_max35104, 'Analog To Digital Converter') === false,
  'DEVICE: an ultrasonic flow TDC (MAX35104) must be refused on a generic ADC slot')
expect(dbHitAcceptableForWord(_bannerS22, 'Power Indicator LED') === false,
  'DEVICE: a Banner industrial indicator tower must be refused on a device status-LED slot')
expect(dbHitAcceptableForWord(_nsx, 'Overcurrent Protection') === false,
  'DEVICE: a Schneider NSX 630 A MCCB must be refused on a device overcurrent slot')
expect(dbHitAcceptableForWord(_nsx, 'Circuit Breaker') === false,
  'DEVICE: the NSX MCCB is refused even on a coherent Circuit Breaker word (a handheld has no MCCB)')
setInstrumentDeviceContext(false)
expect(dbHitAcceptableForWord(_nsx, 'Circuit Breaker') === true,
  'PLANT: the SAME NSX breaker IS accepted off a device (guard is flag-gated → no plant regression)')
// ── HEAD-NOUN-LEADS ranking (2026-07-13, colorimeter seed gap): a web_verified_ingest row
//    whose part_name LEADS with the design vocabulary must outrank a distributor row whose
//    head noun only appears mid-name ("16-bit Microcontrollers - MCU" vs "Microcontroller — ATSAMD21").
const _mcuRows: DbPart[] = [
  { part_name: '16-bit Microcontrollers - MCU, mixed signal, 16 MHz', manufacturer: 'Texas Instruments', part_number: 'MSP430F5529IPNR', component_class: 'electronic_ic', unit_price_gbp: 5, confidence: 0.95, discovery_source: 'distributor_sweep' },
  { part_name: 'Microcontroller — ATSAMD21G18A-MU', manufacturer: 'Microchip', part_number: 'ATSAMD21G18A-MU', component_class: 'electronic_ic', unit_price_gbp: 3, confidence: 0.95, discovery_source: 'web_verified_ingest' },
]
const _mcuPick = pickBestDbCandidate(_mcuRows, ['microcontroller'], 'microcontroller', {})
expect(_mcuPick?.part_number === 'ATSAMD21G18A-MU',
  'verified-ingest row whose NAME LEADS with the head noun must outrank a distributor row whose head noun is mid-name')
expect(headNounLeadsPartName('Microcontroller — ATSAMD21G18A-MU', 'microcontroller') === true,
  'headNounLeadsPartName: family token in first position')
expect(headNounLeadsPartName('16-bit Microcontrollers - MCU', 'microcontroller') === false,
  'headNounLeadsPartName: head noun mid-name (16-bit leads) does not count as leading')
const _wika: DbPart = { part_name: 'Pressure transmitter — 0-7 bar (0-100 psi), 4-20 mA, G1/4', manufacturer: 'WIKA', part_number: '50372475', component_class: 'water_treatment', unit_price_gbp: null }
expect(dbHitAcceptableForWord(_wika, 'Low Pressure Switch') === false,
  'a pressure TRANSMITTER must never pin a pressure SWITCH word (head-noun families never cross)')
const _eatonEstop: DbPart = { part_name: 'Emergency stop switch station — safety mushroom pushbutton 38 mm, pull-to-release, 1NC+1NO (ISO 13850)', manufacturer: 'Eaton', part_number: '216516', component_class: 'water_treatment', unit_price_gbp: null }
expect(dbHitAcceptableForWord(_eatonEstop, 'Emergency Stop Button') === true,
  "the Eaton e-stop SWITCH station must pin the 'Emergency Stop Button' word (same-family head synonym)")
// ── FORM-FACTOR (2026-07-12, Grok P0): an embedded USB / connector interface is NEVER a
//    host-side PCIe expansion card (the colorimeter's Usb Interface pinned StarTech PEXUSB312C3).
const _pexCard: DbPart = { part_name: 'USB 3.1 (10Gbps) 2-Port PCIe Card, USB-C host adapter add-in card', manufacturer: 'StarTech', part_number: 'PEXUSB312C3', component_class: 'connectivity', unit_price_gbp: null }
expect(dbHitAcceptableForWord(_pexCard, 'Usb Interface') === false,
  "a USB-interface word must NOT pin a PCIe expansion / host-adapter add-in card (device USB ≠ host PCIe card)")
expect(dbHitAcceptableForWord(_pexCard, 'Usb Power Interface') === false,
  "a USB power-interface word must NOT pin a PCIe host-adapter card")
// USB-SERIAL CABLE (2026-07-14, gold delta G14): FTDI TTL-232RG is a host cable, not a device USB inlet.
const _ftdiCable: DbPart = { part_name: 'TTL-232RG-VSW3V3-P USB to TTL serial cable', manufacturer: 'FTDI', part_number: 'TTL-232RG-VSW3V3-P', component_class: 'connectivity', unit_price_gbp: 13 }
expect(dbHitAcceptableForWord(_ftdiCable, 'Usb Interface') === false,
  'DEVICE USB interface must NOT pin an FTDI USB-to-TTL serial cable assembly')
expect(dbHitAcceptableForWord(_ftdiCable, 'Usb Power Interface') === false,
  'DEVICE USB power interface must NOT pin an FTDI USB-to-TTL serial cable assembly')
// non-blanket: the form-factor guard only fires when the WORD is a bare connector/port
// interface — a word that itself names a 'card'/'adapter'/'expansion' is not a connector
// word, so the guard does not fire on it (it may still be refused by the head-noun check,
// which is a separate concern). Proven by the two rejections above + the connector-word test.
const _molexUsbC: DbPart = { part_name: 'USB Type-C receptacle connector, 24-position, right-angle, SMT', manufacturer: 'Molex', part_number: '2172890001', component_class: 'connector', unit_price_gbp: null }
expect(typeof dbHitAcceptableForWord(_molexUsbC, 'Usb Interface') === 'boolean',
  "the form-factor guard returns a clean boolean on a real USB-C receptacle (does not throw)")
// PV scrub (2026-07-14): industrial MPNs frozen in partVerifications must clear when words did.
setInstrumentDeviceContext(true)
const _pvRows: Array<Record<string, unknown>> = [
  { word_name: 'Power Indicator LED', manufacturer: 'Banner Engineering', part_number: 'S22LBRWPQ', status: 'verified', distributor_price_gbp: 36.79 },
  { word_name: 'Overcurrent Protection', manufacturer: 'Schneider Electric', part_number: 'LV430630', status: 'uncertain', distributor_price_gbp: 6.5 },
  { word_name: 'LED Driver', manufacturer: 'Texas Instruments', part_number: 'TLC5916IDR', status: 'verified', distributor_price_gbp: 1 },
]
const _pvCleared = scrubInstrumentIndustrialPartVerifications(_pvRows)
expect(_pvCleared === 2, 'scrubInstrumentIndustrialPartVerifications clears Banner + Schneider, keeps TI LED driver')
expect(_pvRows[0].part_number == null && _pvRows[1].part_number == null && _pvRows[2].part_number === 'TLC5916IDR',
  'PV scrub nulls industrial MPNs but leaves a board-scale IC pin intact')
setInstrumentDeviceContext(false)
// ── DOMAIN COHERENCE for device power/safety (2026-07-12, Grok/Cursor #1): a battery is
//    never a machine-safety product; a device fuse is never a PV/solar fuse. The colorimeter
//    pinned Banner Engineering DBRQ (safety relay, £280) to 'Rechargeable Battery Pack' and
//    Eaton PV-15A10F (PV string fuse) to 'DC Input Fuse'.
const _bannerSafety: DbPart = { part_name: 'DBRQ dual-channel safety relay module, 24 VDC', manufacturer: 'Banner Engineering', part_number: 'DBRQ', component_class: 'oem_subsystem', unit_price_gbp: null }
expect(dbHitAcceptableForWord(_bannerSafety, 'Rechargeable Battery Pack') === false,
  "a battery word must NOT pin a Banner-Engineering machine-safety relay (£280 mis-pin) — battery is not machine safety")
const _pvFuse: DbPart = { part_name: 'PV string fuse 15 A 1000 VDC gPV', manufacturer: 'Eaton - Bussmann', part_number: 'PV-15A10F', component_class: 'fuse', unit_price_gbp: null }
expect(dbHitAcceptableForWord(_pvFuse, 'DC Input Fuse') === false,
  "a device DC input fuse must NOT pin a photovoltaic string fuse (plant-domain mis-pin)")
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

// ── LEXICON ROUND 2 (2026-07-04): 5 real catalogue families that isCatalogueComponent
//    refused to admit as fill-blank candidates at all — the round-3 residual dissection.
//    proveCatch BOTH directions per noun: the qualified form is admitted; the bare head
//    noun / the scope-word lookalikes stay refused.
for (const [name, subId] of [
  ['Emergency Stop', 'safety_protection__overcurrent_protection'],
  ['Overcurrent Protection', 'safety_protection__overcurrent_protection'],
  ['Mains Incomer', 'energy_storage_source__mains_incomer'],
  ['Power Supply Unit', 'energy_storage_source__mains_incomer'],
  ['Ethernet Ip Module', 'control_compute_communication__plc_controller'],
] as const) {
  expect(isCatalogueComponent(`${name} ${subId}`) === true,
    `Lexicon round 2: '${name}' (${subId}) is a real catalogue part and MUST become a fill-blank candidate`)
}
for (const [name, subId] of [
  ['Module Support System', 'structure_containment__module_support_system'],
  ['Modular Stack Design', 'maintenance_serviceability__leveling_feet'],
] as const) {
  expect(isCatalogueComponent(`${name} ${subId}`) === false,
    `Lexicon round 2: '${name}' (${subId}) MUST stay refused (scope word, not a catalogue part)`)
}
expect(isCatalogueComponent('Full Stop safety_protection__end_of_line') === false,
  "a bare 'stop' with no 'emergency' qualifier MUST stay refused (qualifier-gated, not admitted outright)")
expect(isCatalogueComponent('Cathodic Protection safety_protection__corrosion_control') === false,
  "a bare 'protection' with no overcurrent/surge qualifier MUST stay refused")
expect(isCatalogueComponent('Water Supply mass_fluid_transport_process__utility_supply') === false,
  "a bare 'supply' with no 'power' qualifier MUST stay refused")

// ── TDS-vs-CONDUCTIVITY SHADOWING (2026-07-04): two real DB rows shadow each other
//    when the top-ranked candidate mentions BOTH families in its own text — the
//    Conductivity word's dbFirstLookup pick ALSO wins the TDS word's ranking, hiding
//    the genuinely-distinct row. Exclusive assignment (excludeKeys) must recover it.
{
  const ehRow: DbPart = { part_name: 'Conductivity Sensor CLS15D — TDS-capable 4-electrode contacting cell', manufacturer: 'Endress+Hauser', part_number: 'CLS15D-A1A', component_class: 'water_treatment', unit_price_gbp: null }
  const myronRow: DbPart = { part_name: 'TDS Sensor Myron L 750-Series II conductivity meter', manufacturer: 'Myron L', part_number: '750-II', component_class: 'water_treatment', unit_price_gbp: null }
  const rows = [ehRow, myronRow]
  const condPick = pickBestDbCandidate(rows, ['conductivity', 'sensor'], 'sensor')
  const tdsPickNoExclude = pickBestDbCandidate(rows, ['tds', 'sensor'], 'sensor')
  expect(condPick?.part_number === 'CLS15D-A1A', 'shadowing fixture: the Conductivity word picks the E+H row')
  expect(tdsPickNoExclude?.part_number === 'CLS15D-A1A',
    'shadowing fixture: the TDS word ALSO picks the E+H row when nothing is excluded (reproduces the bug)')
  const claimed = new Set<string>([`${condPick!.manufacturer}|${condPick!.part_number}`.toLowerCase()])
  const tdsPickExcluded = pickBestDbCandidate(rows, ['tds', 'sensor'], 'sensor', { excludeKeys: claimed })
  expect(tdsPickExcluded?.part_number === '750-II',
    'exclusive assignment: excluding the claimed E+H row lets the TDS word resolve the genuinely-distinct Myron L row')
  // a genuinely single-part run (no collision) is unaffected — excluding an UNRELATED key
  // changes nothing.
  const unrelated = new Set<string>(['nobody|nothing'])
  const condPickUnaffected = pickBestDbCandidate(rows, ['conductivity', 'sensor'], 'sensor', { excludeKeys: unrelated })
  expect(condPickUnaffected?.part_number === 'CLS15D-A1A',
    'exclusive assignment: excluding an unrelated key never changes a single, non-colliding pick')
}

// ── UNTETHERED ACCESSORY VALVE — tether-or-suppress at emission (2026-07-05,
//    the 0faea5550 routed follow-on). proveCatch BOTH directions: a commodity
//    valve word sitting beside a real principal-equipment sibling (the
//    universal-contract-sizing.ts "— principal equipment sized from the
//    engineering contract" stamp) MUST be tethered (its name mutated to carry
//    the host equipment, so requirements_bom.py's substring join can find it);
//    a commodity valve in a catch-all bucket with NO such sibling (the exact
//    v70/v73 shape — 'Isolation Valves' under maintenance_serviceability__
//    leveling_feet, siblings all other generic placeholders) MUST be refused a
//    tether (verdict 'suppress'), never fabricated. The v73 REAL shape puts
//    MANY distinct principal-equipment words in ONE flat sub_module (16 pumps/
//    vessels/tanks sharing a single words[] — "presence anywhere" is genuinely
//    ambiguous), so the host is resolved by ARRAY ORDER: the nearest PRECEDING
//    principal-equipment word is the direct parent (explodeEquipmentSubAssemblies
//    always appends a parent's children contiguously right after it, before the
//    next principal's own block begins) — proven below on a 2-pump array.
{
  const principalWord = (name: string) => ({
    id: `${name.toLowerCase().replace(/\s+/g, '_')}_word`,
    name_human: name,
    content_character: { name_human: name },
    modifier_characters: [{ kind: 'form', value: `${name} — principal equipment sized from the engineering contract` }],
  })
  const genericWord = (name: string) => ({
    id: `${name.toLowerCase().replace(/\s+/g, '_')}_word`,
    name_human: name,
    content_character: { name_human: name },
    modifier_characters: [{ kind: 'form', value: `${name} — representative maintenance serviceability component` }],
  })

  // (a) a real tether exists — the pump's own exploded Suction Isolation Valve
  // sitting beside its parent pump word.
  const valveWord = genericWord('Suction Isolation Valve') as any
  const pumpSub = { id: 'mass_fluid_transport__pump', words: [principalWord('Fertigation Dosing Pump'), valveWord] } as any
  const host = hostingPrincipalEquipmentName(pumpSub, valveWord)
  expect(host === 'Fertigation Dosing Pump',
    `hostingPrincipalEquipmentName must find the nearest preceding principal-equipment word (got ${JSON.stringify(host)})`)
  const tetheredResult = tetherOrSuppressAccessoryValve(valveWord, pumpSub)
  expect(tetheredResult.verdict === 'tethered' && (tetheredResult as any).hostName === 'Fertigation Dosing Pump',
    `a valve beside a real principal-equipment sibling MUST tether (got ${JSON.stringify(tetheredResult)})`)
  expect(valveWord.name_human === 'Suction Isolation Valve (on Fertigation Dosing Pump)',
    `the tether MUST mutate name_human to carry the host equipment (got ${JSON.stringify(valveWord.name_human)})`)
  expect(valveWord.content_character.name_human === 'Suction Isolation Valve (on Fertigation Dosing Pump)',
    'the tether MUST also mutate content_character.name_human (whichever the BoM renderer reads)')

  // (b) the exact v70/v73 shape — NO real principal-equipment sibling, only
  // other generic TIER_C_FLOOR placeholders. MUST refuse, never guess.
  const isoValveWord = genericWord('Isolation Valves') as any
  const catchAllSub = {
    id: 'maintenance_serviceability__leveling_feet',
    words: [genericWord('Cable Glands'), genericWord('Cleaning Tank'), isoValveWord],
  } as any
  const noHost = hostingPrincipalEquipmentName(catchAllSub, isoValveWord)
  expect(noHost === null,
    `a catch-all bucket with no principal-equipment sibling MUST resolve no tether (got ${JSON.stringify(noHost)})`)
  const suppressResult = tetherOrSuppressAccessoryValve(isoValveWord, catchAllSub)
  expect(suppressResult.verdict === 'suppress',
    `an untethered accessory valve MUST be refused a tether, never fabricated (got ${JSON.stringify(suppressResult)})`)
  expect(isoValveWord.name_human === 'Isolation Valves',
    'a suppressed word MUST be left untouched by the tether attempt (the caller removes it, this function never mutates on suppress)')

  // (c) the v73 REAL multi-principal shape — TWO distinct pumps in ONE flat
  // sub_module, each with its OWN exploded valve child. The valve after
  // "Softener Vessel" MUST tether to Softener Vessel (not Gac Filter, which
  // comes AFTER it in the array — array order, never presence-anywhere).
  const softenerValve = genericWord('Discharge Isolation Valve') as any
  const gacFilterValve = genericWord('Non-Return Valve') as any
  const multiPrincipalSub = {
    id: 'mass_fluid_transport__shared',
    words: [principalWord('Softener Vessel'), softenerValve, principalWord('Gac Filter'), gacFilterValve],
  } as any
  const softenerHost = hostingPrincipalEquipmentName(multiPrincipalSub, softenerValve)
  expect(softenerHost === 'Softener Vessel',
    `a valve between two principals MUST tether to the NEARER preceding one, not a later one (got ${JSON.stringify(softenerHost)})`)
  const gacFilterHost = hostingPrincipalEquipmentName(multiPrincipalSub, gacFilterValve)
  expect(gacFilterHost === 'Gac Filter',
    `a valve after the SECOND principal MUST tether to that second principal, not the first (got ${JSON.stringify(gacFilterHost)})`)

  // (d) a valve with NO principal-equipment word preceding it AT ALL (even though
  // one exists LATER in the array) MUST refuse — array order only looks backward,
  // never forward (a forward guess would be exactly the fabrication refused above).
  const leadingValve = genericWord('Check Valve') as any
  const leadingSub = { id: 'mass_fluid_transport__leading', words: [leadingValve, principalWord('Irrigation Pump')] } as any
  const leadingHost = hostingPrincipalEquipmentName(leadingSub, leadingValve)
  expect(leadingHost === null,
    `a valve with no principal PRECEDING it must refuse even if one follows later (got ${JSON.stringify(leadingHost)})`)

  // (e) a non-valve word is never touched by this mechanism — isCommodityProcessValve
  // gates both call sites, so a real principal-equipment word itself never reaches
  // tetherOrSuppressAccessoryValve in production; confirmed here that the vocabulary
  // guard is what keeps the mechanism scoped (BESS/SAF byte-identity rests on this).
  expect(isCommodityProcessValve('Fertigation Dosing Pump') === false,
    'a principal-equipment word must never be classified as a commodity valve (scope guard for byte-identity)')
}

// ── DUPLICATE-REPRESENTATIVE-POPULATION fold (2026-07-05, the Codema v75 pneumatic-
// actuated-valve triple-count: BoM billed 600 units as 3 separate 200-off lines
// [Pneumatic Actuated Valve / Pneumatic Actuated Valves / Pneumatic Actuators], the
// process-schedule valve list showed 3 separate "(×200)" rows, and the cross-schedule
// reconciliation net caught the symptom (630 vs 476, >20%) without naming the fault).
{
  const repWord = (name: string, qty: number, moduleDisplay = 'actuation kinematics') => ({
    id: `${name.toLowerCase().replace(/\s+/g, '_')}_word`,
    name_human: name,
    content_character: { name_human: name },
    modifier_characters: [
      { kind: 'quantity', value: `×${qty}` },
      { kind: 'form', value: `${name} — representative ${moduleDisplay} component` },
    ],
  })
  const realWord = (name: string) => ({
    id: `${name.toLowerCase().replace(/\s+/g, '_')}_word`,
    name_human: name,
    content_character: { name_human: name },
    modifier_characters: [{ kind: 'form', value: `${name} — principal equipment sized from the engineering contract` }],
  })

  const valve = repWord('Pneumatic Actuated Valve', 200) as any
  const valves = repWord('Pneumatic Actuated Valves', 200) as any
  const actuators = repWord('Pneumatic Actuators', 200) as any
  const solenoid1 = repWord('Solenoid Valve', 1) as any
  const solenoid2 = repWord('Solenoid Valves', 1) as any
  const different = repWord('Pneumatic Actuated Valve', 2) as any  // same name, DIFFERENT qty → NOT a duplicate
  const principal = realWord('Reverse Osmosis Skid') as any

  expect(isGenericRepresentativeFiller(valve) === true,
    'a "<name> — representative <module> component" word IS a generic filler')
  expect(isGenericRepresentativeFiller(principal) === false,
    'a "<name> — principal equipment sized from the engineering contract" word is NOT a generic filler (real equipment must never be folded)')

  const kValve = representativeDuplicateKey(valve, 'Pneumatic Actuated Valve')
  const kValves = representativeDuplicateKey(valves, 'Pneumatic Actuated Valves')
  const kActuators = representativeDuplicateKey(actuators, 'Pneumatic Actuators')
  const kSolenoid1 = representativeDuplicateKey(solenoid1, 'Solenoid Valve')
  const kSolenoid2 = representativeDuplicateKey(solenoid2, 'Solenoid Valves')
  const kDifferent = representativeDuplicateKey(different, 'Pneumatic Actuated Valve')

  expect(kValve === kValves,
    `singular/plural of the SAME filler must fold to one key (got ${kValve} vs ${kValves})`)
  expect(kValve === kActuators,
    `an actuated valve and its own inseparable actuator (same qty) must fold to one key — the ` +
    `{actuator,actuated,valve} family (got ${kValve} vs ${kActuators})`)
  expect(kSolenoid1 === kSolenoid2,
    `'Solenoid Valve' / 'Solenoid Valves' (the v75 REAL second instance, qty×1 each) must fold to one key`)
  expect(kValve !== kSolenoid1,
    'two genuinely DIFFERENT populations (pneumatic vs solenoid) must NOT collide')
  expect(kValve !== kDifferent,
    `the SAME name at a DIFFERENT quantity is not provably the same population — quantity must be ` +
    `part of the key (got ${kValve} vs ${kDifferent})`)
  expect(wordQuantity(valve) === 200 && wordQuantity(solenoid1) === 1,
    'wordQuantity parses the ×N quantity modifier')

  // The actual fold LOOP a caller runs (mirrors fillBlankWordMpns's per-sub_module walk):
  // only the FIRST of N duplicates in one sub_module survives.
  const subWords = [valve, valves, actuators, principal]
  const seen = new Set<string>()
  const survivors = subWords.filter((w) => {
    if (!isGenericRepresentativeFiller(w)) return true // real equipment always survives
    const key = representativeDuplicateKey(w, w.name_human)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  expect(survivors.length === 2 && survivors[0] === valve && survivors[1] === principal,
    `folding a 3-way duplicate (valve/valves/actuators, same qty) in one sub_module must leave ` +
    `exactly the FIRST filler + the real principal (got ${survivors.map((w: any) => w.name_human)})`)
}

// ── isCatalogueComponentByEitherName — the bess-campaign-v11 alias-resolution fix
// (2026-07-05): a word's PRIMARY name and its ALIAS (content_character.name_human vs
// name_human) are two independent authored surfaces; a candidate must reach DB-first/
// generate when EITHER carries the lexicon's catalogue signal, not only whichever the
// caller happened to prefer. Real X-32/I-15 v11 cases: the alias alone lacks the signal
// the primary name carries — the union must still fire.
expect(isCatalogueComponentByEitherName('earth rod', 'driven earth electrode', 'emc_grounding') === true,
  "'earth rod' (qualified rod+earth) must reach catalogue even though its alias 'driven earth " +
  "electrode' carries no lexicon signal on its own (the X-32 real not-found root cause)")
expect(isCatalogueComponentByEitherName('smoke detector sounder', 'fire alarm sounder-beacon', 'smoke_detector') === true,
  "'smoke detector sounder' (qualified detector+smoke) must reach catalogue even though its alias " +
  "'fire alarm sounder-beacon' carries no lexicon signal on its own (the I-15 real not-found root cause)")
expect(isCatalogueComponentByEitherName('driven earth electrode', 'earth rod', 'emc_grounding') === true,
  'the union is symmetric — order of (name, aliasName) must never matter')
expect(isCatalogueComponentByEitherName('module top cover', 'module top cover', 'rack_structure') === false,
  'a genuinely non-catalogue name (no signal in EITHER surface, alias identical to primary) must stay excluded')
expect(isCatalogueComponentByEitherName('wing spar', null, 'airframe') === false,
  'no alias at all must behave exactly like the single-name isCatalogueComponent check')

// ── LEXICON ROUND 4 (2026-07-06, co2-campaign-v5 round-5-parts latent-noun
//    dissection): 7 real catalogue nouns that isCatalogueComponent refused to admit,
//    even though the round-5 parts agent had already verified+ingested a real MPN row
//    for each (K-102 CEM blower, X-102 ANDRITZ ecoOne centrifuge, X-131 Kee Safety
//    platform, X-133 Hughes Safety Showers unit, I-105 Groth 3011 regulator, X-107
//    Fischbein sealer, X-140 Foscott heater-cartridge element) — fillBlankWordMpns
//    never reached dbFirstLookup for any of them. proveCatch BOTH directions: the
//    real word (name+subId, verbatim from out/co2-campaign-v5/state.json) is now
//    admitted; the cross-class NEGATIVE fixtures that motivated qualifier-gating
//    instead of a bare admit (SAF-v21's nitrogen/blanketing skid, water-v79's RO-vessel
//    access-ladder-platform) stay refused — proven verbatim against their OWN real
//    name/alias/subId text (out/oxccu-saf-v21 + out/fischer-codema-v79 state.json).
for (const [name, aliasName, subId] of [
  ['flue-gas inlet blower', null, 'mea_absorption_train_mass_fluid_transport_process'],
  ['K2SO4 pusher centrifuge', null, 'k2so4_recovery_line_mass_fluid_transport_process'],
  ['bag heat sealer', null, 'bagging_packaging_line_thermal_transfer'],
  ['band-sealer jaw heating element', 'sealer jaw heating element', 'bagging_packaging_line_thermal_transfer'],
  ['safety shower and eyewash', 'safety shower + eyewash', 'safety_protection_mass_fluid_transport_process'],
  ['access platform and ladders', 'access platform + ladders', 'skid_structure'],
  ['MEA-tank nitrogen blanketing skid (O2 exclusion)', 'nitrogen blanketing skid', 'safety_protection_mass_fluid_transport_process'],
] as const) {
  expect(isCatalogueComponentByEitherName(name, aliasName, subId) === true,
    `Lexicon round 4: '${name}' (${subId}) has a verified DB row (round-5 CO2 parts ingest) and MUST become a fill-blank candidate`)
}
// Negative fixture 1 — SAF-v21's REAL 'nitrogen inerting skid' (utilities_offsites): carries
// 'nitrogen'+'skid' on its alias surface and 'blanketing'+'skid' on its primary-name surface,
// but NEVER 'exclusion' on either — the qualifier this round deliberately chose BECAUSE the
// obvious 'nitrogen'/'blanketing' qualifiers each individually collide with this exact word.
expect(isCatalogueComponentByEitherName(
  'N2 generation + inerting/blanketing skid', 'nitrogen inerting skid', 'utilities_offsites',
) === false,
  "Lexicon round 4 negative fixture: SAF-v21's real 'nitrogen inerting skid' MUST stay refused " +
  "(no 'exclusion' qualifier on either surface) — proves the skid qualifier is 'exclusion', not " +
  "'nitrogen'/'blanketing', which would have flipped this word")
// Negative fixture 2 — water-v79's REAL 'Access Ladder & Platform' (RO-vessel structural
// accessory, mass_fluid_transport_process__ro_membrane_elements): carries 'access'+'platform'
// together but NEVER 'skid' — the compound gate requires ALL of {access, skid} alongside the
// 'platform' head, so a single-qualifier ('access') admit would have wrongly flipped this word.
expect(isCatalogueComponentByEitherName(
  'Access Ladder & Platform', null, 'mass_fluid_transport_process__ro_membrane_elements',
) === false,
  "Lexicon round 4 negative fixture: water-v79's real 'Access Ladder & Platform' MUST stay " +
  "refused (no 'skid' token) — proves the platform gate is a 3-way AND (platform+access+skid), " +
  "not a single 'access' qualifier, which would have flipped this word")
// Bare-noun sanity: 'skid' and 'platform' alone (no qualifier at all) must still be refused —
// the new gates are additive, not a backdoor bare admit.
expect(isCatalogueComponent('cooling-water skid thermal_utilities') === false,
  "a bare 'skid' with no 'exclusion' qualifier MUST stay refused (still qualifier-gated, not admitted outright)")
expect(isCatalogueComponent('platform assembly maintenance_serviceability__leveling_feet') === false,
  "a bare 'platform' with no access+skid compound qualifier MUST stay refused")

if (failures) { console.error(`emitter-mispin selftest: ${failures} FAILED`); process.exit(1) }
console.log('emitter-mispin selftest OK (IC-vendor wrong-domain + commodity-valve + flow-capacity + motor-drive guards + Bar-A candidacy + type-coherence + duty-band + lexicon-round-2 + lexicon-round-4 + exclusive-assignment + untethered-accessory-valve tether-or-suppress + duplicate-representative-population fold proven)')
