#!/usr/bin/env npx tsx
/**
 * reopen-mispin-resolve-selftest.ts — proveCatch for the H10 MPN mispin-resolve fix
 * (F3 source fix, 2026-07-21). Three coupled rules, driven with fixture data (no sqlite):
 *
 *   (1) reopenMispinnedActiveMachineWords RE-OPENS an active-machine slot pinned to a
 *       consumable SKU (the organoid dosing PUMP holding Watson-Marlow TUB-SAN-6.4 tubing)
 *       by clearing its manufacturer+part_number modifiers, so fillBlankWordMpns treats it
 *       as blank and can resolve the real ingested pump — WITHOUT touching a real pump SKU,
 *       a genuine consumable requirement, or an already-blank placeholder.
 *   (2) dbHitAcceptableForWord REFUSES a consumable-stock DB row for an active-machine slot
 *       (so the re-opened pump never resolves back to its own tubing), while still accepting
 *       a real pump row.
 *   (3) pickBestDbCandidate PREFERS the deliberate per-class web_verified_ingest pump
 *       (Kamoer/Welco 'Dosing peristaltic pump — …', head mid-name) over a generic backfill
 *       seed ('Peristaltic pump', head leading) — the priority lane wins.
 *
 *   npx tsx scripts/lib/reopen-mispin-resolve-selftest.ts
 */
import {
  reopenMispinnedActiveMachineWords,
  dbHitAcceptableForWord,
  pickBestDbCandidate,
  isActiveMachineSlot,
  partIdentityIsConsumableStock,
  tokenize,
  type DbPart,
} from '../../src/lib/pdf-engine-v2/lib/emitter-completion'

let bad = 0
const check = (name: string, cond: boolean) => { if (!cond) { console.error(`  FAIL ${name}`); bad++ } }

// ── (1) RE-OPEN ──────────────────────────────────────────────────────────────
// The exact organoid mis-pin: a Dosing Peristaltic PUMP (active machine) pinned to
// Watson-Marlow TUB-SAN-6.4 (a length of sanitary tubing) — the pump name carries no
// stock noun, only the SKU's TUB- prefix betrays the consumable.
const modules: any = [{
  module: 'mass_fluid_transport_process',
  sub_modules: [{
    id: 'mass_fluid_transport_process__culture_vessel',
    words: [
      { id: 'pump_word', content_character: { name_human: 'Dosing Peristaltic Pump' },
        modifier_characters: [
          { kind: 'manufacturer', value: 'Watson-Marlow' },
          { kind: 'part_number', value: 'TUB-SAN-6.4' },
          { kind: 'quantity', value: '×1' },
        ] },
      // A REAL pump SKU on an active machine — must be untouched.
      { id: 'real_pump_word', content_character: { name_human: 'Recirculation Pump' },
        modifier_characters: [
          { kind: 'manufacturer', value: 'Welco' },
          { kind: 'part_number', value: 'WPX1' },
        ] },
      // A GENUINE consumable requirement (a tubing set) — NOT an active machine, untouched.
      { id: 'tubing_word', content_character: { name_human: 'Media Tubing Set' },
        modifier_characters: [
          { kind: 'manufacturer', value: 'Saint-Gobain' },
          { kind: 'part_number', value: 'AY242408' },
        ] },
      // An already-BLANK pump placeholder — nothing to re-open.
      { id: 'blank_pump_word', content_character: { name_human: 'Transfer Pump' },
        modifier_characters: [{ kind: 'part_number', value: 'TBD (detailed design)' }] },
    ],
  }],
}]

const res = reopenMispinnedActiveMachineWords(modules)
check('re-open fires exactly once (the pump-on-tubing mis-pin)', res.reopened.length === 1)
check('re-open names the pump slot', res.reopened[0]?.word_name === 'Dosing Peristaltic Pump')
check('re-open records the removed consumable SKU', res.reopened[0]?.removed_part_number === 'TUB-SAN-6.4')

const pumpMods = modules[0].sub_modules[0].words[0].modifier_characters
check('pump WORD no longer carries a part_number (re-opened blank)',
  !pumpMods.find((m: any) => m.kind === 'part_number'))
check('pump WORD no longer carries a manufacturer',
  !pumpMods.find((m: any) => m.kind === 'manufacturer'))
check('pump WORD keeps its non-identity modifiers (quantity)',
  !!pumpMods.find((m: any) => m.kind === 'quantity'))

const realPumpMods = modules[0].sub_modules[0].words[1].modifier_characters
check('a REAL pump SKU (Welco WPX1) is UNTOUCHED',
  realPumpMods.find((m: any) => m.kind === 'part_number')?.value === 'WPX1')
const tubingMods = modules[0].sub_modules[0].words[2].modifier_characters
check('a GENUINE consumable requirement (Media Tubing Set) is UNTOUCHED',
  tubingMods.find((m: any) => m.kind === 'part_number')?.value === 'AY242408')
check('an already-BLANK pump placeholder is unchanged (no double-clear)',
  modules[0].sub_modules[0].words[3].modifier_characters.length === 1)

// predicates directly
check('isActiveMachineSlot: a pump slot is an active machine', isActiveMachineSlot('Dosing Peristaltic Pump'))
check('isActiveMachineSlot: a Media Tubing Set is NOT (a stock requirement)',
  !isActiveMachineSlot('Media Tubing Set'))
check('partIdentityIsConsumableStock: TUB-SAN-6.4 reads consumable (SKU prefix)',
  partIdentityIsConsumableStock('Watson-Marlow', 'TUB-SAN-6.4', null))
check('partIdentityIsConsumableStock: WPX1 pump does NOT read consumable',
  !partIdentityIsConsumableStock('Welco', 'WPX1', 'Dosing peristaltic pump'))

// ── (2) TYPE-COHERENCE: a pump slot refuses tubing, accepts a real pump ──────
const tubingRow: DbPart = {
  part_name: 'dosing pump tubing', manufacturer: 'Watson-Marlow', part_number: 'TUB-SAN-6.4',
  component_class: 'fluid_path', unit_price_gbp: 20.74, confidence: 0.95,
  discovery_source: 'backfill:pre-timestamp-seed',
}
const welcoRow: DbPart = {
  part_name: 'Dosing peristaltic pump — ultra-compact OEM peristaltic pump, 12/24 V DC / stepper',
  manufacturer: 'Welco', part_number: 'WPX1', component_class: 'motor_actuator',
  unit_price_gbp: 55, confidence: 0.9, discovery_source: 'web_verified_ingest',
}
check('dbHitAcceptableForWord: a PUMP slot REFUSES a consumable tubing row (F3)',
  !dbHitAcceptableForWord(tubingRow, 'Dosing Peristaltic Pump'))
check('dbHitAcceptableForWord: a PUMP slot ACCEPTS a real pump row',
  dbHitAcceptableForWord(welcoRow, 'Dosing Peristaltic Pump'))

// ── (3) RANKING: verified-ingest pump beats a generic backfill seed ──────────
const backfillPumpRow: DbPart = {
  part_name: 'Peristaltic pump', manufacturer: 'Watson Marlow', part_number: '102R',
  component_class: 'mechanical_assembly', unit_price_gbp: 300, confidence: 1.0,
  discovery_source: 'backfill:pre-timestamp-seed',
}
const kamoerRow: DbPart = {
  part_name: 'Dosing peristaltic pump — micro stepper-driven metering peristaltic pump, 12/24 V DC',
  manufacturer: 'Kamoer', part_number: 'KDS', component_class: 'motor_actuator',
  unit_price_gbp: 48, confidence: 0.9, discovery_source: 'web_verified_ingest',
}
const toks = tokenize('Dosing Peristaltic Pump')
const head = toks[toks.length - 1]
const winner = pickBestDbCandidate([backfillPumpRow, kamoerRow], toks, head)
check('pickBestDbCandidate: the web_verified_ingest pump (Kamoer/Welco) wins over the backfill seed',
  winner?.discovery_source === 'web_verified_ingest')
// order-independence: same winner regardless of row order
const winner2 = pickBestDbCandidate([kamoerRow, backfillPumpRow], toks, head)
check('ranking is order-independent (verified wins either way)',
  winner2?.discovery_source === 'web_verified_ingest')

if (bad === 0) {
  console.log('reopen-mispin-resolve --selftest OK '
    + '(pump re-opens off its tubing → real pump resolves; consumable refused for an active machine; '
    + 'verified-ingest pump beats backfill; real SKU / genuine consumable / blank placeholder untouched)')
  process.exit(0)
}
console.error(`reopen-mispin-resolve --selftest FAILED (${bad})`)
process.exit(1)
