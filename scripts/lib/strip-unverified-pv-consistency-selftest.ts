#!/usr/bin/env npx tsx
/**
 * strip-unverified-pv-consistency-selftest.ts — proveCatch for the R1 pv-consistency fix
 * (2026-07-21): stripUnverifiedParts must clear the matching partVerification ROW when it
 * strips a fake part_number from a WORD, else the BoM/⚠Checks still see the proven-fake SKU
 * (F3 active-machine-pinned-to-consumable + F4 IDENTIFIED-over-unverified keep flagging the
 * organoid dosing pump left holding Watson-Marlow TUB-SAN-6.4 tubing).
 *
 *   npx tsx scripts/lib/strip-unverified-pv-consistency-selftest.ts
 */
import { stripUnverifiedParts } from '../../src/lib/pdf-engine-v2/radical/part-verification'

let bad = 0
const check = (name: string, cond: boolean) => { if (!cond) { console.error(`  FAIL ${name}`); bad++ } }

// A dosing peristaltic PUMP (active machine) that verification proved is actually a Watson-Marlow
// TUBING SKU (unverified + high confidence) — the exact organoid mis-pin.
const modules: any = [{
  module: 'mass_fluid_transport_process',
  sub_modules: [{
    id: 'mass_fluid_transport_process__culture_vessel',
    words: [{
      id: 'dosing_peristaltic_pump_word',
      modifier_characters: [
        { kind: 'manufacturer', value: 'Watson-Marlow' },
        { kind: 'part_number', value: 'TUB-SAN-6.4' },
        { kind: 'quantity', value: '×1' },
      ],
    }],
  }],
}]
const verifications: any = [{
  module: 'mass_fluid_transport_process',
  sub_module_id: 'mass_fluid_transport_process__culture_vessel',
  word_id: 'dosing_peristaltic_pump_word',
  manufacturer: 'Watson-Marlow',
  part_number: 'TUB-SAN-6.4',
  status: 'unverified',
  confidence: 'high',
  price_estimate_gbp: 35,
}]

const res = stripUnverifiedParts(modules, verifications)
check('the fake pump SKU is stripped from the WORD (stripped ≥1)', res.stripped >= 1)
const wordPn = modules[0].sub_modules[0].words[0].modifier_characters
  .find((m: any) => String(m.kind) === 'part_number')
check('word no longer carries the part_number modifier', !wordPn)
check('pv ROW part_number cleared in lockstep (no fake SKU left for F3/F4 to read)',
  verifications[0].part_number === '')
check('pv keeps the price estimate (the pump still exists, just no real SKU yet)',
  verifications[0].price_estimate_gbp === 35)
check('pv records what was stripped (audit trail)',
  verifications[0].stripped_fake_pn === 'TUB-SAN-6.4')

// NO FALSE POSITIVE: a VERIFIED real part is never stripped.
const okModules: any = [{ module: 'm', sub_modules: [{ id: 's', words: [{ id: 'w',
  modifier_characters: [{ kind: 'part_number', value: 'DS18B20+' }] }] }] }]
const okPv: any = [{ module: 'm', sub_module_id: 's', word_id: 'w',
  part_number: 'DS18B20+', status: 'verified', confidence: 'high' }]
stripUnverifiedParts(okModules, okPv)
check('a VERIFIED part is untouched (pv keeps its real SKU)', okPv[0].part_number === 'DS18B20+')

if (bad === 0) {
  console.log('strip-unverified pv-consistency --selftest OK (word+pv cleared in lockstep; price kept; verified part untouched)')
  process.exit(0)
}
process.exit(1)
