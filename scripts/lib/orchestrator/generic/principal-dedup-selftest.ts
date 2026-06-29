// proveCatch for the FINAL same-name principal de-dup wired into reconcilePrincipalEquipment
// (Tristan 2026-06-29, the v37 TK-108 duplicate).
//
// THE BUG: reconcile (the last synthesis pass) re-synthesised a `*_synth_word` TWIN of an equipment
// the LLM decomposition already named — two "Nutrient Tank" words (one synth, one original) survived,
// got tagged independently, and produced a DUPLICATE TAG (TK-108×2) that collapsed the BoM Ledger
// score 8→4. THE FIX: dedupePrincipalWords (name-based collapse, keeping the better-specified word)
// runs at the END of reconcile so any same-name twin from ANY synthesis path is merged to one. This
// guard fails the build if that collapse stops working OR starts over-merging legitimately-distinct
// equipment (a qty-N word, or two differently-named principals).

import { dedupePrincipalWords } from './universal-contract-sizing'

function word(id: string, name: string, synth: boolean, mods: Array<[string, string]>) {
  return {
    id,
    name_human: name,
    content_character: { character_id: id, name_human: name },
    modifier_characters: mods.map(([kind, value]) => ({ kind, value })),
    ...(synth ? { _synthesized: true } : {}),
  }
}

function countByName(modules: any[], sub: string): number {
  let n = 0
  for (const m of modules) for (const sm of m.sub_modules ?? []) for (const w of sm.words ?? [])
    if (!String(w.id ?? '').includes('__') && String(w.name_human ?? '').toLowerCase().includes(sub)) n += 1
  return n
}

function run() {
  // The exact v37 scenario: the original LLM word + a reconcile-minted synth twin, SAME name_human,
  // DIFFERENT ids, in DIFFERENT modules. Plus a distinct tank + a qty-N word that must NOT merge.
  const modules = [
    {
      module: 'fertigation_dosing_system',
      sub_modules: [{ id: 'a', words: [
        word('nutrient_tank_word', 'Nutrient Tank', false, [['quantity', '×8'], ['capacity', '1000']]),
        word('drain_water_tank_word', 'Drain Water Tank', false, [['quantity', '×1'], ['dimension', '5.8 m dia x 1.5 m']]),
      ] }],
    },
    {
      module: 'mass_fluid_transport_process',
      sub_modules: [{ id: 'b', words: [
        word('nutrient_tank_synth_word', 'Nutrient Tank', true, [['quantity', '×8'], ['dimension', '0.9 m dia x 1.6 m'], ['capacity', '1']]),
        word('pressure_vessels_word', 'Pressure Vessels', true, [['quantity', '×2'], ['dimension', '1.2 m dia x 1.3 m']]),
      ] }],
    },
  ]

  const removed = dedupePrincipalWords(modules)

  // 1. the duplicate "Nutrient Tank" MUST collapse to exactly one.
  const nNutrient = countByName(modules, 'nutrient tank')
  if (nNutrient !== 1) {
    throw new Error(`principal-dedup: two same-name "Nutrient Tank" words must collapse to ONE (got ${nNutrient}; removed=${removed})`)
  }
  // 2. the survivor must be the BETTER-SPECIFIED one (the synth carries the dimension modifier).
  const survivor = modules.flatMap((m) => m.sub_modules.flatMap((sm: any) => sm.words))
    .find((w: any) => String(w.name_human).toLowerCase().includes('nutrient'))
  const hasDim = (survivor?.modifier_characters ?? []).some((mc: any) => mc.kind === 'dimension')
  if (!hasDim) {
    throw new Error('principal-dedup: the surviving "Nutrient Tank" must keep the dimensioned spec (better-specified survivor)')
  }
  // 3. a DISTINCT tank name must be UNTOUCHED (no over-merge across different names).
  if (countByName(modules, 'drain water tank') !== 1) {
    throw new Error('principal-dedup: a distinctly-named "Drain Water Tank" must NOT be merged away')
  }
  // 4. a qty-N word (one word standing for N instances) must be UNTOUCHED.
  if (countByName(modules, 'pressure vessel') !== 1) {
    throw new Error('principal-dedup: a qty-N "Pressure Vessels" word must be left intact (it is one word for N instances)')
  }

  // eslint-disable-next-line no-console
  console.log('principal-dedup --selftest OK (same-name twin → 1 keeping the dimensioned survivor; distinct names + qty-N words untouched)')
}

run()
