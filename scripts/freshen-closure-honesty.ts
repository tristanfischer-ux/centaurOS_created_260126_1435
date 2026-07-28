/**
 * Freshen quality-scorecard.json closure_honesty from live state.json.
 *
 * INTENT: Excel Overview / Quality / Exec Summary floor on a stale
 * closure_honesty section even after design words were filled. Recompute
 * Gate-40 honesty from the current design tree before the workbook builds.
 *
 * Run: npx tsx scripts/freshen-closure-honesty.ts <run_dir>
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  buildClosureHonestyFromState,
  computeDesignClosure,
} from './lib/design-closure-gate'

function main(): void {
  const runDir = resolve(process.argv[2] || '.')
  const statePath = resolve(runDir, 'state.json')
  const qPath = resolve(runDir, 'quality-scorecard.json')
  if (!existsSync(statePath)) throw new Error(`no state.json in ${runDir}`)
  const state = JSON.parse(readFileSync(statePath, 'utf8'))
  const r = computeDesignClosure(state)
  writeFileSync(resolve(runDir, '4-design-closure.json'), JSON.stringify(r, null, 2))

  if (!existsSync(qPath)) {
    console.error(`[freshen-closure] no quality-scorecard.json — wrote 4-design-closure only (honesty=${r.honesty_score})`)
    return
  }
  const chIn = buildClosureHonestyFromState(state)
  const qsc = JSON.parse(readFileSync(qPath, 'utf8')) as {
    sections?: Array<{ name?: string; score?: number; defects?: string[]; advisory?: boolean }>
    floor?: number
    mean?: number
    deterministicFloor?: number
    deterministicMean?: number
    allPass?: boolean
    deterministicAllPass?: boolean
  }
  const sections = Array.isArray(qsc.sections) ? [...qsc.sections] : []
  const idx = sections.findIndex((s) => s.name === 'closure_honesty')
  const ch = {
    name: 'closure_honesty',
    score: chIn.score,
    defects: chIn.defects,
    advisory: false as const,
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
  qsc.allPass = floor >= 8
  qsc.deterministicAllPass = floor >= 8
  writeFileSync(qPath, JSON.stringify(qsc, null, 2))
  console.error(
    `[freshen-closure] honesty=${chIn.score} fillable=${chIn.fillable_tbd} scorecard_floor=${floor}`,
  )
}

main()
