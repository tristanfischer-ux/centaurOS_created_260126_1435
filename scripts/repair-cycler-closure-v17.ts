/**
 * One-shot repair: clear smeared PCB writeback on cold-v17, re-stamp exact
 * identities, run fillBlank (verified candidates), recompute design-closure.
 *
 * Run: npx tsx scripts/repair-cycler-closure-v17.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import {
  fillBlankWordMpns,
  setInstrumentDeviceContext,
} from '../src/lib/pdf-engine-v2/lib/emitter-completion'
import { stampPcbResolvedIdentitiesOntoDesign } from '../src/lib/pdf-engine-v2/lib/pcb/pcb-identity-writeback'
import { computeDesignClosure } from './lib/design-closure-gate'

const CLEAR_CIDS = new Set([
  'per_channel_linear_source_sink_stage',
  'per_channel_linear_discharge_pass_bank',
  'per_channel_charge_current_source',
  'per_channel_current_control_loop',
  'per_channel_power_heatsink',
  'finned_heatsink',
  'iec_c14_fused_inlet',
  'isolated_ac_dc_power_module',
  'per_channel_hardware_cutout',
  'per_channel_over_under_voltage_comparator_latch',
  'per_channel_overcurrent_comparator',
  'per_channel_overtemp_trip',
  'per_channel_reverse_polarity_detector',
  'per_channel_cell_holder_fixture',
  'polyfuse_resettable',
  'decoupling_capacitor',
])

async function main(): Promise<void> {
  const statePath = 'out/cell-cycler-cold-v17/state.json'
  const state = JSON.parse(readFileSync(statePath, 'utf8')) as Record<string, unknown>
  const mods =
    (state.moduleDecomposition as { modules?: unknown[] } | undefined)?.modules ??
    (state.design as { modules?: unknown[] } | undefined)?.modules
  if (!Array.isArray(mods)) throw new Error('no modules')

  let cleared = 0
  for (const m of mods) {
    const mod = m as { sub_modules?: unknown[] }
    for (const sm of mod.sub_modules || []) {
      const sub = sm as { words?: unknown[] }
      for (const w of sub.words || []) {
        const word = w as {
          content_character?: { character_id?: string }
          word_id?: string
          id?: string
          modifier_characters?: Array<Record<string, unknown>>
        }
        const cid = String(word.content_character?.character_id || '')
        if (!CLEAR_CIDS.has(cid)) continue
        const mods2 = Array.isArray(word.modifier_characters)
          ? [...word.modifier_characters]
          : []
        const pn = mods2.find((x) => x.kind === 'part_number')
        const mfr = mods2.find((x) => x.kind === 'manufacturer')
        if (pn) pn.value = 'TBD (detailed design)'
        else mods2.push({ kind: 'part_number', value: 'TBD (detailed design)' })
        if (mfr) mfr.value = ''
        else mods2.push({ kind: 'manufacturer', value: '' })
        word.modifier_characters = mods2
        cleared += 1
      }
    }
  }
  console.error(`[repair] cleared ${cleared} role(s) back to TBD`)

  const wb = stampPcbResolvedIdentitiesOntoDesign(mods, state.pcb)
  console.error(`[repair] strict writeback stamped=${wb.stamped} unmatched=${wb.unmatched}`)
  for (const d of wb.details) {
    console.error(`  · ${d.character_id} → ${d.part_number} (${d.word_id})`)
  }

  setInstrumentDeviceContext(true)
  const fill = await fillBlankWordMpns(mods as never, 'consumer_electronics', {
    dbPath: join(homedir(), '.forge-truth', 'forge-truth.db'),
    skipGenerate: true,
  })
  const filledList = fill.filled ?? []
  console.error(
    `[repair] fillBlank filled=${filledList.length} structural=${fill.skipped_structural}`,
  )
  for (const f of filledList) {
    console.error(`  · ${f.name} → ${f.manufacturer} ${f.part_number}`)
  }

  state.pcbIdentityWriteback = wb
  state.fillBlankRepair = {
    filled_count: filledList.length,
    skipped_structural: fill.skipped_structural,
    filled: filledList,
  }
  writeFileSync(statePath, JSON.stringify(state))

  const r = computeDesignClosure(state)
  console.error(
    `[repair] design-closure honesty=${r.honesty_score} fillable=${r.fillable_tbd} unbound=${r.unbound_words}`,
  )
  for (const f of r.findings.filter((x) => x.kind === 'fillable_tbd_critical_role')) {
    console.error(`  · ${f.issue.slice(0, 120)}`)
  }
  writeFileSync(
    'out/cell-cycler-cold-v17/4-design-closure.json',
    JSON.stringify(r, null, 2),
  )

  // Freshen quality-scorecard.json closure_honesty — Excel Overview/Quality
  // read this file; a stale section floors Exec Summary even when state is closed.
  const qPath = 'out/cell-cycler-cold-v17/quality-scorecard.json'
  const qsc = JSON.parse(readFileSync(qPath, 'utf8')) as {
    sections?: Array<{ name?: string; score?: number; defects?: string[]; advisory?: boolean }>
    floor?: number
    mean?: number
    deterministicFloor?: number
    deterministicMean?: number
  }
  const defects = r.findings
    .filter(
      (f) =>
        f.kind === 'fillable_tbd_critical_role' ||
        f.kind === 'unbound_multiplicity' ||
        f.kind === 'zero_dim_on_demand',
    )
    .slice(0, 12)
    .map((f) => f.issue)
  const sections = Array.isArray(qsc.sections) ? [...qsc.sections] : []
  const idx = sections.findIndex((s) => s.name === 'closure_honesty')
  const ch = {
    name: 'closure_honesty',
    score: r.honesty_score,
    defects,
    advisory: false,
  }
  if (idx >= 0) sections[idx] = { ...sections[idx], ...ch }
  else sections.push(ch)
  const det = sections.filter((s) => !s.advisory)
  const floor = det.length ? Math.min(...det.map((s) => Number(s.score ?? 10))) : 10
  const mean =
    det.length > 0
      ? Math.round((det.reduce((a, s) => a + Number(s.score ?? 0), 0) / det.length) * 10) / 10
      : 10
  qsc.sections = sections
  qsc.floor = floor
  qsc.mean = mean
  qsc.deterministicFloor = floor
  qsc.deterministicMean = mean
  writeFileSync(qPath, JSON.stringify(qsc, null, 2))
  console.error(`[repair] quality-scorecard closure_honesty=${r.honesty_score} floor=${floor}`)
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
