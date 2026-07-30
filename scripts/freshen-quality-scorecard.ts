/**
 * Freshen quality-scorecard.json from live delivered artefacts.
 *
 * INTENT: drawing_gates and design_narrative can freeze mid-loop scores while
 * drawing-gates.json is ALL-PASS and briefOverviewProse was filled later.
 * Executive Summary / Quality & Audit mirror the on-disk scorecard floor.
 *
 * Run: npx tsx scripts/freshen-quality-scorecard.ts <run_dir>
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  buildDesignNarrativeSection,
  buildDrawingGatesSection,
  computeHonestShipFloor,
  computeScorecardFloor,
  dedupeScorecardSections,
  type ScorecardSection,
} from '../src/lib/pdf-engine-v2/lib/scorecard-floor'

type JsonRecord = Record<string, unknown>

function loadJson(path: string): JsonRecord | null {
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf8')) as JsonRecord
}

function moduleOverviews(state: JsonRecord): string[] {
  const md = state.moduleDecomposition as JsonRecord | undefined
  const mods = Array.isArray(md?.modules) ? (md!.modules as JsonRecord[]) : []
  return mods.map((m) =>
    String(m.overview_paragraph_en ?? m.module_brief ?? m.overview ?? '').trim(),
  )
}

function freshenSections(
  state: JsonRecord,
  runDir: string,
  existing: ScorecardSection[],
): ScorecardSection[] {
  const prose = (state.briefOverviewProse as JsonRecord | undefined) ?? {}
  const mission =
    String(prose.mission_statement ?? prose.mission ?? '').trim()
    || String((state.parsedBrief as JsonRecord | undefined)?.mission_statement ?? '').trim()
  const whyNow = String(prose.why_now ?? '').trim()

  const dgFile = loadJson(resolve(runDir, 'drawing-gates.json'))
  const dgState = (state.drawingGates as JsonRecord | undefined) ?? {}
  const dgSource = dgFile ?? dgState
  const drawingGates = buildDrawingGatesSection({
    allPass: dgSource.all_pass === true,
    nFailing: Number(dgSource.n_failing ?? 0),
  })

  const designNarrative = buildDesignNarrativeSection({
    missionStatement: mission,
    whyNow,
    moduleOverviews: moduleOverviews(state),
  })

  const byName = new Map<string, ScorecardSection>()
  for (const s of existing) {
    byName.set(s.name, s)
  }
  byName.set('drawing_gates', drawingGates)
  byName.set('design_narrative', designNarrative)

  return dedupeScorecardSections(Array.from(byName.values()))
}

function main(): void {
  const runDir = resolve(process.argv[2] || '.')
  const statePath = resolve(runDir, 'state.json')
  const qPath = resolve(runDir, 'quality-scorecard.json')
  if (!existsSync(statePath)) throw new Error(`no state.json in ${runDir}`)
  if (!existsSync(qPath)) throw new Error(`no quality-scorecard.json in ${runDir}`)

  const state = loadJson(statePath)!
  const qsc = loadJson(qPath) as {
    sections?: ScorecardSection[]
    floor?: number
    mean?: number
    deterministicFloor?: number
    deterministicMean?: number
    allPass?: boolean
    deterministicAllPass?: boolean
    iteration?: number
  }

  const beforeFloor = Number(qsc.floor ?? 0)
  const beforeDg = (qsc.sections ?? []).find((s) => s.name === 'drawing_gates')
  const beforeDn = (qsc.sections ?? []).find((s) => s.name === 'design_narrative')

  const sections = freshenSections(state, runDir, qsc.sections ?? [])
  const shipFloor = Math.max(
    1,
    Math.min(10, parseInt(process.env.QUALITY_LOOP_SHIP_FLOOR || '9', 10) || 9),
  )
  const { floor: deterministicFloor, mean: deterministicMean } = computeScorecardFloor(sections)
  const { floor, mean, allPass } = computeHonestShipFloor(sections, shipFloor)

  qsc.sections = sections
  qsc.floor = floor
  qsc.mean = mean
  qsc.deterministicFloor = deterministicFloor
  qsc.deterministicMean = deterministicMean
  qsc.allPass = allPass
  qsc.deterministicAllPass = deterministicFloor >= shipFloor

  writeFileSync(qPath, JSON.stringify(qsc, null, 2))

  const afterDg = sections.find((s) => s.name === 'drawing_gates')
  const afterDn = sections.find((s) => s.name === 'design_narrative')

  console.error(
    `[freshen-scorecard] floor ${beforeFloor}→${floor} det=${deterministicFloor} `
    + `drawing_gates ${beforeDg?.score ?? '—'}→${afterDg?.score ?? '—'} `
    + `design_narrative ${beforeDn?.score ?? '—'}→${afterDn?.score ?? '—'}`,
  )
}

main()
