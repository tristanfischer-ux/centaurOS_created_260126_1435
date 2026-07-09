// proveCatch for dropUnstatedMembraneStages (universal-contract-sizing.ts).
//
// THE BUG: a RO-only makeup brief (city water → particle → GAC → softener → RO) still
// shipped UF Module Banks / Toray HFU UF modules invented by the generator from library
// candidates (codema-ship). Those words are grounded (not `_synthesized`) so the invented-
// principal drop never saw them.
// THE RULE: when brief prose never names UF/NF/MF, drop principal words claiming that
// membrane family. A brief that DOES name ultrafiltration keeps UF words.

import { dropUnstatedMembraneStages, reconcilePrincipalEquipment } from './universal-contract-sizing'

function names(modules: any): string[] {
  const out: string[] = []
  for (const m of modules) for (const sm of m.sub_modules) for (const w of sm.words ?? []) {
    if ((w as { _subcomponent?: boolean })._subcomponent) continue
    out.push(w.name_human || '')
  }
  return out
}

function run(): void {
  // proveCatch: RO-only brief → UF banks/modules DROPPED; RO skid SURVIVES.
  const m1: any = [{
    module: 'purification',
    sub_modules: [{
      sub_module: 'makeup',
      words: [
        {
          id: 'reverse_osmosis_skid_synth_word', name_human: 'Reverse Osmosis Skid', _synthesized: true,
          content_character: { character_id: 'reverse_osmosis_skid_synth', name_human: 'Reverse Osmosis Skid' },
          modifier_characters: [{ kind: 'quantity', value: '×1' }],
        },
        {
          id: 'uf_membrane_bank_word', name_human: 'Uf Membrane Bank',
          content_character: { character_id: 'uf_membrane_bank', name_human: 'Uf Membrane Bank' },
          modifier_characters: [{ kind: 'quantity', value: '×1' }, { kind: 'dimension', value: '364 m² area' }],
        },
        {
          id: 'uf_module_bank_word', name_human: 'Uf Module Bank',
          content_character: { character_id: 'uf_module_bank', name_human: 'Uf Module Bank' },
          modifier_characters: [{ kind: 'quantity', value: '×1' }],
        },
        {
          id: 'ro_membrane_elements_word', name_human: 'Toray HFU-2020AN UF Module',
          content_character: { character_id: 'ro_membrane_elements', name_human: 'Toray HFU-2020AN UF Module' },
          modifier_characters: [{ kind: 'quantity', value: '×1' }, { kind: 'dimension', value: '364 m² area' }],
        },
        {
          id: 'ultrafiltration_module_word', name_human: 'Ultrafiltration Module',
          content_character: { character_id: 'ultrafiltration_module', name_human: 'Ultrafiltration Module' },
          modifier_characters: [{ kind: 'quantity', value: '×1' }],
        },
      ],
    }],
  }]
  const roOnlyBrief =
    'City water to particle filter to granular activated carbon to duplex softener to reverse osmosis permeate. No other membrane stages.'
  const nDrop = dropUnstatedMembraneStages(m1, roOnlyBrief)
  if (nDrop < 3) throw new Error(`membrane-stage-brief-gate proveCatch: expected ≥3 UF words dropped, got ${nDrop}`)
  const n1 = names(m1)
  if (n1.some((x) => /\buf\b|ultrafiltrat/i.test(x))) {
    throw new Error(`membrane-stage-brief-gate proveCatch: UF words survived on RO-only brief (got ${JSON.stringify(n1)})`)
  }
  if (!n1.some((x) => /reverse osmosis/i.test(x))) {
    throw new Error(`membrane-stage-brief-gate proveCatch: RO skid must survive (got ${JSON.stringify(n1)})`)
  }

  // proveNoFalsePositive: brief that NAMES ultrafiltration keeps UF words.
  const m2: any = [{
    module: 'purification',
    sub_modules: [{
      sub_module: 'makeup',
      words: [
        {
          id: 'uf_membrane_bank_word', name_human: 'Uf Membrane Bank',
          content_character: { character_id: 'uf_membrane_bank', name_human: 'Uf Membrane Bank' },
          modifier_characters: [{ kind: 'quantity', value: '×1' }],
        },
      ],
    }],
  }]
  const ufBrief = 'Pretreatment includes ultrafiltration (UF) ahead of reverse osmosis.'
  const nKeep = dropUnstatedMembraneStages(m2, ufBrief)
  if (nKeep !== 0) throw new Error(`membrane-stage-brief-gate proveNoFalsePositive: UF-named brief must keep UF words, dropped ${nKeep}`)
  if (!names(m2).some((x) => /uf membrane/i.test(x))) {
    throw new Error('membrane-stage-brief-gate proveNoFalsePositive: Uf Membrane Bank must remain')
  }

  // Empty brief → strict no-op (never invent a drop without brief evidence).
  const m3: any = JSON.parse(JSON.stringify(m2))
  if (dropUnstatedMembraneStages(m3, '') !== 0) {
    throw new Error('membrane-stage-brief-gate: empty briefText must be a no-op')
  }

  // Wired through reconcilePrincipalEquipment when briefText is passed.
  const m4: any = [{
    module: 'purification',
    sub_modules: [{
      sub_module: 'makeup',
      words: [
        {
          id: 'reverse_osmosis_skid_synth_word', name_human: 'Reverse Osmosis Skid', _synthesized: true,
          content_character: { character_id: 'reverse_osmosis_skid_synth', name_human: 'Reverse Osmosis Skid' },
          modifier_characters: [{ kind: 'quantity', value: '×1' }, { kind: 'capacity', value: '10', unit: 'm³' }],
        },
        {
          id: 'uf_module_bank_word', name_human: 'Uf Module Bank',
          content_character: { character_id: 'uf_module_bank', name_human: 'Uf Module Bank' },
          modifier_characters: [{ kind: 'quantity', value: '×1' }],
        },
      ],
    }],
  }]
  reconcilePrincipalEquipment(
    m4 as never[],
    { quantities: { reverse_osmosis_skid_volume_m3: { value: 10 }, reverse_osmosis_skid_count: { value: 1 } } } as never,
    { briefText: roOnlyBrief },
  )
  if (names(m4).some((x) => /\buf\b|ultrafiltrat/i.test(x))) {
    throw new Error(`membrane-stage-brief-gate reconcile path: UF must be dropped (got ${JSON.stringify(names(m4))})`)
  }

  // eslint-disable-next-line no-console
  console.log('membrane-stage-brief-gate --selftest OK (RO-only drops UF; UF-brief keeps UF; empty brief no-op; reconcile wired)')
}

run()
