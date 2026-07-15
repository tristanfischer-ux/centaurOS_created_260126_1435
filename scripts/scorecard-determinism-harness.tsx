/**
 * scorecard-determinism-harness.tsx — "same brief -> same scorecard" HARD guard
 * (Tristan 2026-07-06, determinism-treadmill follow-up to drawer #86 / B3).
 *
 * THE PROPERTY UNDER TEST: the shipping FLOOR is meant to be deterministic
 * (scorecard-floor.ts computes it from DETERMINISTIC sections only — the Stage-7.5
 * physics critic and every other LLM stage are ADVISORY per the B3 doctrine, see
 * computeQualityScorecard() in serial-design-chain-v2.tsx). This harness proves it
 * empirically instead of trusting the doctrine on paper: run the SAME brief through
 * the chain TWICE (fresh out-dirs) and diff the two runs' `quality-scorecard.json`
 * (floor/mean/allPass + every NON-ADVISORY section) and `tab-scorecard.json` (the
 * Excel-facing per-tab score/status). Byte-identical on the deterministic slice =
 * PASS. Any diff is real drift and is printed in full — never papered over.
 *
 * WHY NOT DIFF THE WHOLE quality-scorecard.json: advisory sections (self_audit's
 * LLM-judged sub-scores, physics_gates' raw uncorroborated critic count — see the
 * 2026-07-06 fix marking it advisory) are PERMITTED to wobble run-to-run; that is
 * the entire point of B3 (an advisory LLM opinion must never gate, and is not
 * claimed to be reproducible). Diffing those would produce permanent, expected
 * "failures" that hide a real regression in the noise. So this harness explicitly
 * separates DETERMINISTIC fields (asserted byte-identical) from ADVISORY fields
 * (recorded, in a separate section of the report, never asserted).
 *
 * MODES:
 *   1. Fresh twin run (spends real API cost):
 *        npx tsx scripts/scorecard-determinism-harness.tsx run <brief.md> [outA] [outB]
 *      Runs `serial-design-chain-v2.tsx <brief> <outDir>` twice (sequentially, same
 *      env) then diffs. Defaults outA/outB to out/.determinism-twin-<slug>-a / -b.
 *      Respects QUALITY_LOOP_PHASE from the environment (default 3); export
 *      QUALITY_LOOP_PHASE=1 before invoking to skip Blender/drawings/render/
 *      benchmark-net and keep the twin cheap — those stages don't feed the
 *      deterministic scorecard sections audited here.
 *
 *   2. Diff two ALREADY-COMPLETED out-dirs (free, offline — e.g. re-checking a
 *      historical pair like out/fischer-codema-v56c vs out/fischer-codema-v56d,
 *      the exact "critic re-rolled 3->5 findings" pair the B3 doctrine cites):
 *        npx tsx scripts/scorecard-determinism-harness.tsx diff <outA> <outB>
 *
 * Exit 0 = deterministic slice identical. Exit 1 = drift (diff printed, never
 * silenced) or a required file was missing from one side.
 */
import { existsSync, mkdirSync, readFileSync, rmSync } from 'fs'
import { resolve } from 'path'
import { execFileSync } from 'child_process'

interface Section { name: string; score: number; defects?: string[]; advisory?: boolean }
interface QualityScorecard { floor: number; mean: number; sections: Section[]; allPass: boolean; iteration?: number }

function loadJson(path: string): any | null {
  if (!existsSync(path)) return null
  try { return JSON.parse(readFileSync(path, 'utf-8')) } catch { return null }
}

/** Deterministic-only projection of quality-scorecard.json: floor/mean/allPass +
 *  every NON-ADVISORY section's {name, score, defects}, sorted by name so the
 *  comparison is order-independent (section push order can legitimately vary — a
 *  gate that didn't fire on run A but did on run B still pushes in a different
 *  position; ordering is not semantic here, content is). */
function deterministicSlice(qs: QualityScorecard): { floor: number; mean: number; allPass: boolean; sections: Array<{ name: string; score: number; defects: string[] }> } {
  const sections = (qs.sections || [])
    .filter((s) => !s.advisory)
    .map((s) => ({ name: s.name, score: s.score, defects: [...(s.defects || [])].sort() }))
    .sort((a, b) => a.name.localeCompare(b.name))
  return { floor: qs.floor, mean: qs.mean, allPass: qs.allPass, sections }
}

/** The advisory (permitted-to-wobble) slice — recorded for visibility only. */
function advisorySlice(qs: QualityScorecard): Array<{ name: string; score: number }> {
  return (qs.sections || []).filter((s) => s.advisory).map((s) => ({ name: s.name, score: s.score })).sort((a, b) => a.name.localeCompare(b.name))
}

/** tab-scorecard.json is built by build-excel-export.py from the SAME settled
 *  state — every field it renders (score/status/target/issues/fix) is a
 *  deterministic function of state.json (see ARCHITECTURE note in build-excel-
 *  export.py: the workbook has no LLM call of its own — dossier_audit.py's
 *  corroboration layer resolves the physics critique before this ever reads it).
 *  So the WHOLE file is asserted deterministic, not split like quality-scorecard. */
function tabScorecardSlice(ts: any): Record<string, unknown> {
  const tabs = ts?.tabs && typeof ts.tabs === 'object' ? ts.tabs : {}
  const out: Record<string, unknown> = {}
  for (const name of Object.keys(tabs).sort()) {
    const t = tabs[name] || {}
    out[name] = {
      score: t.score, target: t.target, status: t.status,
      issues: Array.isArray(t.issues) ? [...t.issues].sort() : t.issues,
      fix: t.fix,
    }
  }
  return out
}

function diffValues(a: unknown, b: unknown, path: string, out: string[]): void {
  const av = JSON.stringify(a)
  const bv = JSON.stringify(b)
  if (av === bv) return
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)])
    for (const k of [...keys].sort()) diffValues((a as any)[k], (b as any)[k], path ? `${path}.${k}` : k, out)
    return
  }
  out.push(`  ${path}: A=${av} B=${bv}`)
}

function diffOutDirs(dirA: string, dirB: string): { ok: boolean; report: string } {
  const lines: string[] = []
  let ok = true

  const qsA = loadJson(resolve(dirA, 'quality-scorecard.json'))
  const qsB = loadJson(resolve(dirB, 'quality-scorecard.json'))
  if (!qsA || !qsB) {
    lines.push(`✗ quality-scorecard.json missing on ${!qsA ? 'A' : 'B'} side (${!qsA ? dirA : dirB}) — cannot verify.`)
    ok = false
  } else {
    const sliceA = deterministicSlice(qsA)
    const sliceB = deterministicSlice(qsB)
    const d: string[] = []
    diffValues(sliceA, sliceB, 'quality-scorecard[deterministic]', d)
    if (d.length > 0) { ok = false; lines.push('✗ quality-scorecard.json DETERMINISTIC slice DIFFERS:', ...d) }
    else lines.push('✓ quality-scorecard.json deterministic slice (floor/mean/allPass + non-advisory sections) byte-identical')
    lines.push(`  (advisory, permitted to wobble — A: ${JSON.stringify(advisorySlice(qsA))})`)
    lines.push(`  (advisory, permitted to wobble — B: ${JSON.stringify(advisorySlice(qsB))})`)
  }

  const tsA = loadJson(resolve(dirA, 'tab-scorecard.json'))
  const tsB = loadJson(resolve(dirB, 'tab-scorecard.json'))
  if (!tsA || !tsB) {
    lines.push(`✗ tab-scorecard.json missing on ${!tsA ? 'A' : 'B'} side (${!tsA ? dirA : dirB}) — cannot verify.`)
    ok = false
  } else {
    const d: string[] = []
    diffValues(tabScorecardSlice(tsA), tabScorecardSlice(tsB), 'tab-scorecard', d)
    if (d.length > 0) { ok = false; lines.push('✗ tab-scorecard.json DIFFERS:', ...d) }
    else lines.push('✓ tab-scorecard.json (every tab score/status/target/issues/fix) byte-identical')
  }

  // Best-effort: also run the existing design-identity determinism check (parts
  // identity + orchestrator quantities + prices) when both state.json files exist —
  // complementary evidence, not required for this harness's own pass/fail.
  const stateA = resolve(dirA, 'state.json')
  const stateB = resolve(dirB, 'state.json')
  if (existsSync(stateA) && existsSync(stateB)) {
    try {
      execFileSync('npx', ['tsx', resolve(__dirname, 'determinism-check.tsx'), stateA, stateB], { stdio: 'inherit' })
      lines.push('✓ determinism-check.tsx (design identity/quantities/prices) also PASS')
    } catch {
      lines.push('⚠ determinism-check.tsx (design identity/quantities/prices) reported drift — see output above (informational: design-level, not scorecard-level; does not fail this harness on its own)')
    }
  }

  return { ok, report: lines.join('\n') }
}

function runChainOnce(briefPath: string, outDir: string): void {
  if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir, { recursive: true })
  console.error(`\n[twin] running chain → ${outDir}`)
  execFileSync('npx', ['tsx', resolve(__dirname, 'serial-design-chain-v2.tsx'), briefPath, outDir], {
    stdio: 'inherit',
    env: process.env,
  })
}

function slugFromBrief(briefPath: string): string {
  return briefPath.replace(/^.*\//, '').replace(/\.md$/, '').replace(/[^a-z0-9_-]/gi, '-')
}

function main(): void {
  const [, , mode, a, b] = process.argv
  if (mode === 'diff') {
    if (!a || !b) { console.error('Usage: scorecard-determinism-harness.tsx diff <outDirA> <outDirB>'); process.exit(2) }
    const { ok, report } = diffOutDirs(resolve(a), resolve(b))
    console.error('\n' + report)
    console.error(ok ? '\n[determinism-harness] PASS — deterministic scorecard slice is identical.' : '\n[determinism-harness] FAIL — see diff above; trace and fix the specific source, do not paper over it.')
    process.exit(ok ? 0 : 1)
  }
  if (mode === 'run') {
    if (!a) { console.error('Usage: scorecard-determinism-harness.tsx run <brief.md> [outDirA] [outDirB]'); process.exit(2) }
    const briefPath = resolve(a)
    const slug = slugFromBrief(briefPath)
    const outA = resolve(b || resolve(__dirname, '..', 'out', `.determinism-twin-${slug}-a`))
    const outB2Arg = process.argv[5]
    const outB = resolve(outB2Arg || resolve(__dirname, '..', 'out', `.determinism-twin-${slug}-b`))
    runChainOnce(briefPath, outA)
    runChainOnce(briefPath, outB)
    const { ok, report } = diffOutDirs(outA, outB)
    console.error('\n' + report)
    console.error(ok ? '\n[determinism-harness] PASS — deterministic scorecard slice is identical.' : '\n[determinism-harness] FAIL — see diff above; trace and fix the specific source, do not paper over it.')
    process.exit(ok ? 0 : 1)
  }
  console.error('Usage:\n  scorecard-determinism-harness.tsx run <brief.md> [outDirA] [outDirB]\n  scorecard-determinism-harness.tsx diff <outDirA> <outDirB>')
  process.exit(2)
}

if (require.main === module) main()

export { deterministicSlice, advisorySlice, tabScorecardSlice, diffOutDirs }
