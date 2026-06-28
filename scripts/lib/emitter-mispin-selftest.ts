#!/usr/bin/env npx tsx
/**
 * emitter-mispin-selftest.ts — proveCatch for the DB-name-match mis-pin guards in emitter-completion.ts
 * (Tristan 2026-06-28). These guards run on the Discover-on-miss / fill-blank DB-first pin path and keep
 * a generic spec rather than ship a wrong-domain or undersized part. Each case below is a REAL mis-pin the
 * physics critic flagged (or its legit counter-case) — the guard must FIRE on the bad input and stay
 * SILENT on the good one. Wired into verify-engine-guards.sh.
 */
import { isElectronicsIcMispin, isCommodityProcessValve, partFlowCapacityM3h } from '../../src/lib/pdf-engine-v2/lib/emitter-completion'

let failures = 0
const expect = (cond: boolean, msg: string) => { if (!cond) { failures++; console.error('  ✗ ' + msg) } }

// ── isElectronicsIcMispin — an IC-vendor chip on a field-instrument OR control/distribution slot is wrong
expect(isElectronicsIcMispin('PLC Controller', 'Renesas / Intersil') === true,
  "ISL1571IRZ (Renesas/Intersil DSL-driver IC) pinned as a 'PLC Controller' MUST be flagged (compound vendor split)")
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

// ── isCommodityProcessValve — a simple mechanical valve is generic-spec; an actuated/dosing one is not
expect(isCommodityProcessValve('Non-Return Valve') === true, "a non-return valve is commodity → generic spec")
expect(isCommodityProcessValve('Pneumatic Actuated Valve') === false, "an actuated valve carries a real MPN")
expect(isCommodityProcessValve('Reverse Osmosis Skid') === false, "a non-valve must not be a commodity-valve")

// ── partFlowCapacityM3h — parse the candidate's flow capacity from its raw_excerpt (the Dosatron case)
expect(partFlowCapacityM3h({ part_name: 'Dosatron D8RE5', raw_excerpt: 'water-powered doser, 0.3–8 m³/h' }) === 8 ||
       partFlowCapacityM3h({ part_name: 'Dosatron D8RE5', raw_excerpt: '8 m3/h max flow' }) === 8,
  "the Dosatron D8RE5 capacity (8 m³/h) must parse from raw_excerpt so the capacity gate can fire vs a 45 m³/h duty")

if (failures) { console.error(`emitter-mispin selftest: ${failures} FAILED`); process.exit(1) }
console.log('emitter-mispin selftest OK (IC-vendor wrong-domain + commodity-valve + flow-capacity guards proven)')
