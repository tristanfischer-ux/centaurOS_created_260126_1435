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
import {
  computeHonestShipFloor,
  computeScorecardFloor,
  type ScorecardSection,
} from '../src/lib/pdf-engine-v2/lib/scorecard-floor'

function main(): void {
  const runDir = resolve(process.argv[2] || '.')
  const statePath = resolve(runDir, 'state.json')
  const qPath = resolve(runDir, 'quality-scorecard.json')
  if (!existsSync(statePath)) throw new Error(`no state.json in ${runDir}`)
  const state = JSON.parse(readFileSync(statePath, 'utf8'))
  const r = computeDesignClosure(state)
  writeFileSync(resolve(runDir, '4-design-closure.json'), JSON.stringify(r, null, 2))
  const chIn = buildClosureHonestyFromState(state)
  state.designClosureHonesty = chIn
  writeFileSync(statePath, JSON.stringify(state))

  if (!existsSync(qPath)) {
    console.error(`[freshen-closure] no quality-scorecard.json — wrote 4-design-closure only (honesty=${r.honesty_score})`)
    return
  }
  const qsc = JSON.parse(readFileSync(qPath, 'utf8')) as {
    sections?: ScorecardSection[]
    floor?: number
    mean?: number
    deterministicFloor?: number
    deterministicMean?: number
    allPass?: boolean
    deterministicAllPass?: boolean
  }
  const sections: ScorecardSection[] = Array.isArray(qsc.sections) ? [...qsc.sections] : []
  const idx = sections.findIndex((s) => s.name === 'closure_honesty')
  const ch: ScorecardSection = {
    name: 'closure_honesty',
    score: chIn.score,
    defects: chIn.defects,
    advisory: false,
  }
  if (idx >= 0) sections[idx] = { ...sections[idx], ...ch }
  else sections.push(ch)
  // INTENT (2026-08-06): use shared floor helpers so release_readiness
  // (qualityLoopActionable=false) and advisory LLM sections do not drag Bar A.
  const { floor: deterministicFloor, mean: deterministicMean } = computeScorecardFloor(sections)
  const shipFloor = Math.max(
    1,
    Math.min(10, parseInt(process.env.QUALITY_LOOP_SHIP_FLOOR || '9', 10) || 9),
  )
  const { floor, mean, allPass } = computeHonestShipFloor(sections, shipFloor)
  qsc.sections = sections
  qsc.floor = floor
  qsc.mean = mean
  qsc.deterministicFloor = deterministicFloor
  qsc.deterministicMean = deterministicMean
  qsc.allPass = allPass
  qsc.deterministicAllPass = deterministicFloor >= shipFloor
  writeFileSync(qPath, JSON.stringify(qsc, null, 2))
  console.error(
    `[freshen-closure] honesty=${chIn.score} fillable=${chIn.fillable_tbd} scorecard_floor=${floor} deterministic_floor=${deterministicFloor}`,
  )
}

main()
