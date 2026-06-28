#!/usr/bin/env npx tsx
/**
 * emitter-mispin-selftest.ts — proveCatch for the DB-name-match mis-pin guards in emitter-completion.ts
 * (Tristan 2026-06-28). These guards run on the Discover-on-miss / fill-blank DB-first pin path and keep
 * a generic spec rather than ship a wrong-domain or undersized part. Each case below is a REAL mis-pin the
 * physics critic flagged (or its legit counter-case) — the guard must FIRE on the bad input and stay
 * SILENT on the good one. Wired into verify-engine-guards.sh.
 */
import { isElectronicsIcMispin, isCommodityProcessValve, partFlowCapacityM3h, isIndicatorLightMispin, isMotorDriveSlot } from '../../src/lib/pdf-engine-v2/lib/emitter-completion'

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

if (failures) { console.error(`emitter-mispin selftest: ${failures} FAILED`); process.exit(1) }
console.log('emitter-mispin selftest OK (IC-vendor wrong-domain + commodity-valve + flow-capacity + motor-drive guards proven)')
