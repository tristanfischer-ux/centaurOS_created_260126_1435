/**
 * Focused test for the Physics-Critic Phase-2 auto-correct.
 *
 * Exercises the PURE decision/parse/locate helpers + the full orchestration with a MOCK
 * LLM and a MOCK re-critique, so no network is needed:
 *   T1  selectCorrectableFindings targets the named-part findings (MDPE tank, screw feeder)
 *       and SKIPS the vague/holistic + JSON-truncation findings.
 *   T2  locateWordForFinding resolves the MDPE finding to the RIGHT word by its part tokens
 *       even when the module name repeats (the where indices point at a different word).
 *   T3  parseCorrection parses a corrected-modifier reply, restricts to allowed kinds,
 *       drops empties, and treats a declined / unparseable reply as declined.
 *   T4  applyCorrectionToWord patches modifier_characters in place (316L + rating + PN),
 *       keeps one value per kind, stamps source_detail, and leaves word.id untouched.
 *   T5  runPhysicsCriticAutocorrect SHADOW mode records corrections but does NOT mutate
 *       the shipped modules; ENABLED mode mutates + the re-critique loop marks the fault
 *       cleared.
 *
 * Run: npx tsx scripts/lib/physics-critic-autocorrect.test.tsx
 * Exits non-zero on first failed assertion.
 */

import {
  selectCorrectableFindings,
  locateWordForFinding,
  parseCorrection,
  applyCorrectionToWord,
  snapshotModifiers,
  buildBriefPinSummary,
  buildRespecPrompt,
  runPhysicsCriticAutocorrect,
  physicsCriticAutocorrectModeFromEnv,
  CORRECTABLE_MODIFIER_KINDS,
} from './physics-critic-autocorrect'
import type { CritiqueReport, CritiqueIssue } from '../../src/lib/pdf-engine-v2/radical/physics-critic'

let passed = 0
let failed = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed += 1; console.log(`  ✓ ${name}`) }
  else { failed += 1; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

async function main() {

// ─── Synthetic design: TWO modules with the SAME name, to prove index-navigation is
//     unsafe and the corrector must resolve by part tokens. ──────────────────────────
function makeDesign(): { modules: any[] } {
  const word = (id: string, name: string, mods: Array<[string, string]>) => ({
    id,
    name_human: name,
    content_character: { character_id: id, function_radical_primary: id.replace(/_word$/, '') },
    modifier_characters: mods.map(([kind, value]) => ({ kind, value })),
  })
  return {
    modules: [
      {
        module: 'structure_containment',
        sub_modules: [
          {
            sub_module_id: 'mea_buffer_storage',
            words: [
              // The named flagged part: an MDPE buffer tank on a 120°C loop.
              word('buffer_tank_word', 'MEA buffer tank', [
                ['quantity', '×1'],
                ['form', 'MDPE buffer tank'],
                ['material', 'MDPE'],
                ['manufacturer', 'Forge Plastics'],
                ['part_number', 'MDPE-2000L'],
                ['list_price_gbp', '1200'],
              ]),
              // A decoy word in the same sub_module the where-index might collide with.
              word('tank_level_probe_word', 'tank level probe', [
                ['form', 'guided-wave radar'],
                ['manufacturer', 'VEGA'],
                ['part_number', 'VEGAFLEX 81'],
              ]),
            ],
          },
        ],
      },
      {
        // SECOND module with the SAME name — the LLM `where` "structure_containment/
        // sub_modules[0]/words[0]" would mis-resolve here if we navigated by index.
        module: 'structure_containment',
        sub_modules: [
          {
            sub_module_id: 'frame_saddles',
            words: [
              word('bolted_saddle_word', 'bolted saddle', [
                ['form', 'carbon-steel saddle'],
                ['material', 'S355'],
              ]),
            ],
          },
        ],
      },
    ],
  }
}

// ─── Synthetic critique with FOUR findings (mirrors the real CO₂ critique shape):
//     two named-part HIGH findings (correctable), one vague holistic HIGH (skip),
//     one JSON-truncation HIGH (skip — not a physical part failure). ────────────────
function makeCritique(): CritiqueReport {
  const issues: CritiqueIssue[] = [
    {
      // (1) MDPE tank — material-vs-temperature, names a …/words/N part. CORRECTABLE.
      dimension: 'engineering_plausibility',
      severity: 'high',
      confidence: 'high',
      where: 'structure_containment/sub_modules[0]/words[0]',
      issue: 'The MDPE buffer tank is specified on the 120 °C MEA-stripper loop. MDPE has a maximum service temperature of 60-80 °C and melts around 120-130 °C, so it will lose structural integrity and fail.',
      suggested_check: 'Replace the MDPE tank with a 316L stainless steel vessel rated for the 120 °C operating temperature and MEA chemical compatibility.',
    },
    {
      // (2) Screw feeder — undersized-vs-load, names a part. CORRECTABLE.
      dimension: 'brief_to_design_fidelity',
      severity: 'high',
      confidence: 'high',
      where: 'energy_conversion_transduction/sub_modules[1]/words[0]',
      issue: 'The Gericke GLD 87 screw feeder is rated for only 106 kg/h but the required continuous K2SO4 rate is 162.5 kg/h, so it is undersized and cannot deliver the demanded throughput.',
      suggested_check: 'Upsize the Gericke screw feeder to a model rated for at least 200 kg/h.',
    },
    {
      // (3) Vague holistic HIGH — no named part, hedge language. SKIP.
      dimension: 'engineering_plausibility',
      severity: 'high',
      confidence: 'high',
      where: 'whole_system',
      issue: 'The system is over-constrained; perform a detailed load-list analysis to verify the overall energy balance.',
      suggested_check: 'Carry out a detailed load-list analysis.',
    },
    {
      // (4) JSON truncation HIGH — names a where path but is NOT a physical failure mode. SKIP.
      dimension: 'internal_coherence',
      severity: 'high',
      confidence: 'high',
      where: 'structure_containment/sub_modules[0]/words[3]',
      issue: "The design JSON payload is truncated abruptly at the end of the last module ('part_num'...), resulting in invalid JSON syntax.",
      suggested_check: 'Regenerate or repair the upstream design generation pipeline.',
    },
  ]
  return {
    scores: { brief_to_design_fidelity: 7, engineering_plausibility: 6, internal_coherence: 6, part_realism: 9, honesty_signal: 9 },
    headline: 'synthetic',
    issues,
    what_worked: [],
    model: 'mock',
    latency_ms: 0,
  }
}

// ─── T1: SELECT ──────────────────────────────────────────────────────────────────────
console.log('T1: selectCorrectableFindings targets named-part findings, skips vague/JSON')
{
  const sel = selectCorrectableFindings(makeCritique())
  const wheres = sel.map((s) => s.issue.where)
  check('selects exactly the 2 named-part findings', sel.length === 2, `got ${sel.length}: ${JSON.stringify(wheres)}`)
  check('includes the MDPE tank finding', wheres.includes('structure_containment/sub_modules[0]/words[0]'))
  check('includes the screw-feeder finding', wheres.includes('energy_conversion_transduction/sub_modules[1]/words[0]'))
  check('SKIPS the vague holistic finding (whole_system)', !wheres.includes('whole_system'))
  check('SKIPS the JSON-truncation finding', !wheres.includes('structure_containment/sub_modules[0]/words[3]'))
  const mdpe = sel.find((s) => s.issue.where.includes('words[0]') && s.issue.where.startsWith('structure'))
  check('MDPE finding tagged material-vs-temperature', mdpe?.failure_mode === 'material-vs-temperature', `tag=${mdpe?.failure_mode}`)
  const feeder = sel.find((s) => s.issue.where.startsWith('energy'))
  check('feeder finding tagged undersized-vs-load', feeder?.failure_mode === 'undersized-vs-load', `tag=${feeder?.failure_mode}`)
}

// ─── T2: LOCATE by part tokens, NOT by unreliable where index ─────────────────────────
console.log('T2: locateWordForFinding resolves to the right word by part tokens')
{
  const design = makeDesign()
  const crit = makeCritique()
  const mdpeIssue = crit.issues[0]
  const loc = locateWordForFinding(design.modules, mdpeIssue)
  check('located a word for the MDPE finding', loc !== null)
  check('resolved to buffer_tank_word (NOT the level probe or saddle)', loc?.word_id === 'buffer_tank_word', `got ${loc?.word_id}`)
  check('resolved to module index 0 (the FIRST structure_containment)', loc?.module_index === 0, `got ${loc?.module_index}`)
  // A finding that names no resolvable part returns null (the vague holistic one).
  const vague = crit.issues[2]
  const vagueLoc = locateWordForFinding(design.modules, vague)
  check('vague holistic finding does NOT resolve to a word', vagueLoc === null, `got ${vagueLoc?.word_id}`)
}

// ─── T3: PARSE ────────────────────────────────────────────────────────────────────────
console.log('T3: parseCorrection restricts kinds, drops empties, handles decline/garbage')
{
  const good = parseCorrection(JSON.stringify({
    declined: false,
    rationale: 'Swapped MDPE for 316L rated to 120 °C.',
    modifiers: {
      material: '316L stainless steel',
      manufacturer: 'Forbes Group',
      part_number: 'FG-SS316L-2000',
      rating_primary: 'rated to 150 °C',
      form: '316L stainless buffer vessel',
      list_price_gbp: '4800',
      not_a_real_kind: 'should be dropped',   // not in CORRECTABLE_MODIFIER_KINDS
      capacity: '',                            // empty → dropped
    },
  }))
  check('parsed not-declined', good.declined === false)
  check('kept material', good.modifiers.material === '316L stainless steel')
  check('kept part_number', good.modifiers.part_number === 'FG-SS316L-2000')
  check('dropped unknown kind', !('not_a_real_kind' in good.modifiers))
  check('dropped empty capacity', !('capacity' in good.modifiers))
  check('all kept keys are in the allowed set', Object.keys(good.modifiers).every((k) => (CORRECTABLE_MODIFIER_KINDS as readonly string[]).includes(k)))

  const declined = parseCorrection(JSON.stringify({ declined: true, declined_reason: 'only fixable by reducing the K2SO4 target' }))
  check('declined reply → declined=true', declined.declined === true)
  check('declined reason preserved', (declined.declined_reason ?? '').includes('K2SO4'))

  const garbage = parseCorrection('the model rambled without any json')
  check('unparseable reply → declined', garbage.declined === true)

  const empty = parseCorrection(JSON.stringify({ declined: false, modifiers: {} }))
  check('no usable modifiers → treated as declined', empty.declined === true)

  // fenced json still parses
  const fenced = parseCorrection('```json\n{"declined":false,"modifiers":{"material":"316L"}}\n```')
  check('fenced json parses', fenced.declined === false && fenced.modifiers.material === '316L')
}

// ─── T4: APPLY in place ───────────────────────────────────────────────────────────────
console.log('T4: applyCorrectionToWord patches in place, one-value-per-kind, identity-locked')
{
  const design = makeDesign()
  const word = design.modules[0].sub_modules[0].words[0]   // buffer_tank_word
  const idBefore = word.id
  const ccBefore = JSON.stringify(word.content_character)
  const correction = parseCorrection(JSON.stringify({
    declined: false,
    rationale: '316L swap',
    modifiers: { material: '316L stainless steel', part_number: 'FG-SS316L-2000', rating_primary: 'rated to 150 °C', list_price_gbp: '4800' },
  }))
  const { before, after } = applyCorrectionToWord(word, correction, { issue: 'MDPE melts at 120 °C', failure_mode: 'material-vs-temperature' })
  check('before snapshot had MDPE material', before.material === 'MDPE')
  check('after material is 316L', after.material === '316L stainless steel')
  check('after part_number updated', after.part_number === 'FG-SS316L-2000')
  check('after price updated', after.list_price_gbp === '4800')
  // one value per kind
  const materialMods = word.modifier_characters.filter((m: any) => m.kind === 'material')
  check('exactly one material modifier (no duplicate)', materialMods.length === 1, `count=${materialMods.length}`)
  const pnMods = word.modifier_characters.filter((m: any) => m.kind === 'part_number')
  check('exactly one part_number modifier', pnMods.length === 1)
  // provenance stamp
  const sd = word.modifier_characters.find((m: any) => m.kind === 'source_detail')
  check('source_detail stamp added', !!sd && /Physics-Critic auto-correct/.test(sd.value))
  check('source_detail records the old material', !!sd && /MDPE/.test(sd.value))
  // identity-lock
  check('word.id untouched', word.id === idBefore)
  check('content_character untouched', JSON.stringify(word.content_character) === ccBefore)
}

// ─── helper: build a mock LLM that returns a 316L fix for the tank + a 250 kg/h feeder ──
function mockRespecLLM(): (prompt: string) => Promise<string> {
  return async (prompt: string) => {
    if (/MDPE|buffer tank|material-vs-temperature/i.test(prompt)) {
      return JSON.stringify({ declined: false, rationale: '316L rated to 150 °C', modifiers: { material: '316L stainless steel', manufacturer: 'Forbes Group', part_number: 'FG-SS316L-2000', form: '316L stainless buffer vessel', rating_primary: 'rated to 150 °C', list_price_gbp: '4800' } })
    }
    if (/feeder|Gericke|undersized/i.test(prompt)) {
      return JSON.stringify({ declined: false, rationale: 'upsized to 250 kg/h', modifiers: { manufacturer: 'Gericke', part_number: 'GLD 106', form: 'enclosed screw feeder', rating_primary: '250 kg/h', list_price_gbp: '9800' } })
    }
    return JSON.stringify({ declined: true, declined_reason: 'no rule' })
  }
}

// ─── T5: ORCHESTRATION — SHADOW does not mutate; ENABLED mutates + re-check clears ─────
console.log('T5: runPhysicsCriticAutocorrect SHADOW vs ENABLED')
{
  const brief = { constraints: { target_performance: { metrics: [{ name: 'k2so4_output_t_day', value: 3.9, unit: 't/day' }] }, max_mass_kg: 35000 } }

  // re-critique mock: once the tank's material is no longer MDPE in the working modules,
  // the MDPE finding is gone. We detect by scanning the modules the loop passes back.
  const reCritique = async (mods: any[]): Promise<CritiqueReport> => {
    const stillMdpe = JSON.stringify(mods).includes('"MDPE"')
    const issues: CritiqueIssue[] = []
    if (stillMdpe) {
      issues.push(makeCritique().issues[0])   // MDPE finding persists only if material still MDPE
    }
    // The feeder finding always clears in this mock (the loop upsized it).
    return { scores: makeCritique().scores, headline: 're-check', issues, what_worked: [], model: 'mock-recheck', latency_ms: 0 }
  }

  // SHADOW
  {
    const design = makeDesign()
    const originalJson = JSON.stringify(design.modules)
    const res = await runPhysicsCriticAutocorrect({
      modules: design.modules,
      critique: makeCritique(),
      parsedBrief: brief,
      productClass: 'co2_mineralisation',
      mode: 'shadow',
      llm: mockRespecLLM(),
      reCritique,
      maxPasses: 2,
    })
    check('SHADOW: selected the 2 named-part findings', res.selected === 2, `selected=${res.selected}`)
    check('SHADOW: did NOT mutate the shipped modules', JSON.stringify(design.modules) === originalJson)
    check('SHADOW: records carry applied=false', res.records.length > 0 && res.records.every((r) => r.applied === false))
    check('SHADOW: final_critique is the ORIGINAL (gate sees uncorrected design)', (res.final_critique?.issues.length ?? 0) === makeCritique().issues.length)
  }

  // ENABLED
  {
    const design = makeDesign()
    const res = await runPhysicsCriticAutocorrect({
      modules: design.modules,
      critique: makeCritique(),
      parsedBrief: brief,
      productClass: 'co2_mineralisation',
      mode: 'enabled',
      llm: mockRespecLLM(),
      reCritique,
      maxPasses: 2,
    })
    const tankWord = design.modules[0].sub_modules[0].words[0]
    const tankMaterial = (tankWord.modifier_characters.find((m: any) => m.kind === 'material') || {}).value
    check('ENABLED: mutated the tank word to 316L', tankMaterial === '316L stainless steel', `material=${tankMaterial}`)
    check('ENABLED: at least one record applied=true', res.records.some((r) => r.applied === true))
    check('ENABLED: the MDPE fault cleared after re-check', res.corrected >= 1, `corrected=${res.corrected}`)
    check('ENABLED: final_critique reflects post-correction (no MDPE finding left)', !(res.final_critique?.issues ?? []).some((i) => /MDPE/.test(i.issue)))
    check('ENABLED: nothing left uncorrectable', res.uncorrectable_after_passes === 0, `left=${res.uncorrectable_after_passes}`)
  }
}

// ─── Mode env mapping sanity ──────────────────────────────────────────────────────────
console.log('Env mode mapping')
{
  check('unset → shadow', physicsCriticAutocorrectModeFromEnv(undefined) === 'shadow')
  check('"0" → shadow', physicsCriticAutocorrectModeFromEnv('0') === 'shadow')
  check('"shadow" → shadow', physicsCriticAutocorrectModeFromEnv('shadow') === 'shadow')
  check('"1" → enabled', physicsCriticAutocorrectModeFromEnv('1') === 'enabled')
  check('"on" → enabled', physicsCriticAutocorrectModeFromEnv('on') === 'enabled')
}

// ─── prompt smoke (brief-pin block present) ───────────────────────────────────────────
console.log('Prompt construction')
{
  const design = makeDesign()
  const pins = buildBriefPinSummary({ constraints: { target_performance: { metrics: [{ name: 'k2so4_output_t_day', value: 3.9, unit: 't/day' }] }, max_mass_kg: 35000 } }, 'co2_mineralisation')
  check('brief pins include the target metric', pins.pinned_lines.some((l) => l.includes('k2so4_output_t_day')))
  const prompt = buildRespecPrompt({ finding: { failure_mode: 'material-vs-temperature', issue: 'MDPE melts', suggested_check: 'use 316L' }, word: design.modules[0].sub_modules[0].words[0], briefPins: pins })
  check('prompt forbids relaxing the brief', /MUST NOT RELAX/.test(prompt))
  check('prompt forbids functional substitution', /functional substitution is forbidden/i.test(prompt))
  check('prompt forbids fabricated MPNs', /fabricated MPN|fictional part/i.test(prompt))
  check('prompt embeds the current spec', /MDPE/.test(prompt))
}

  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('test harness threw:', err)
  process.exit(1)
})
