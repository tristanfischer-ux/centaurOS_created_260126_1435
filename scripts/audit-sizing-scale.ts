/**
 * audit-sizing-scale.ts — UNIVERSAL static gate: "does equipment sizing actually
 * couple to the brief's production rate, or is it frozen at a hardcoded default?"
 *
 * THE BUG CLASS (recurring — Tristan 2026-06-11 via the 2x SAF scale-up; first flagged
 * 2026-05-31 for BESS "rack_count pinned at 15, doesn't size to the energy target").
 * A class plan reads an EXTENSIVE sizing input — a quantity that physically MUST grow
 * with plant size (a vessel diameter/height, a volume, a mass, a thermal duty, a
 * throughput) — via `q(c, 'KEY', DEFAULT)`, but nothing ever WRITES `KEY`. So the read
 * always returns the hardcoded DEFAULT, the equipment is the same size at 1,000 and
 * 2,000 t/yr, and the dossier's mass + cost silently do NOT scale with production. A
 * 2x-output plant then costs ~the same as (or, with line-item variance, less than) the
 * 1x plant — physically impossible.
 *
 * This gate scans every class plan, finds `q(c,'KEY',DEFAULT)` reads, and flags a KEY
 * that is (a) EXTENSIVE (scales with size) AND (b) never written anywhere in the
 * orchestrator or the engineering-contract builder (so it's always the default).
 * INTENSIVE inputs — £/unit prices, process temperatures, dimensionless ratios/factors,
 * design pressures — are correctly constant and are NOT flagged.
 *
 * Usage:  npx tsx scripts/audit-sizing-scale.ts [--json]
 * Exit:   0 = no frozen extensive sizing input · 1 = at least one (a real scale bug).
 *
 * This is the STATIC half of the guard (catches the frozen-default freeze). The dynamic
 * half — "double the brief headline ⇒ total equipment mass ~doubles" — is the runtime
 * regression invariant; this gate is the cheap, deterministic, no-LLM first line.
 */
import { readFileSync, readdirSync } from 'fs'
import { join, resolve, basename } from 'path'

const ORCH = resolve(__dirname, 'lib/orchestrator')
const PLAN_DIR = join(ORCH, 'class-plans')

// Strip block + line comments so the scanner never matches a q(c,...) pattern that
// appears in a DOC COMMENT (e.g. "Was a frozen q(c,'key',4.0)") — that is documentation
// of a fix, not a live frozen read. Without this the gate false-positives on its own
// fix annotations. (Pragmatic: not string-literal aware, but class plans don't embed
// '//' or '/*' inside strings.)
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

// every place a quantity KEY could legitimately be SET (written), so a read of it scales
function gatherWriteCorpus(): string {
  const files: string[] = []
  const walk = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name.endsWith('.ts') && !e.name.includes('.test.')) files.push(p)
  } }
  walk(ORCH)
  const extra = resolve(__dirname, 'lib/engineering-contract.ts')
  let text = ''
  for (const f of [...files, extra]) { try { text += stripComments(readFileSync(f, 'utf-8')) } catch {} }
  return text
}

// EXTENSIVE = physically grows with plant size ⇒ a frozen default is a BUG.
// INTENSIVE = a per-unit/intrinsic property ⇒ constant is correct.
const INTENSIVE = /(_price|_gbp_|_temp|_frac$|_ratio$|_factor$|effectiveness|_barg$|_per_|velocity|_stages$|_ph$|_molar_ratio|_safety_factor|_score$|_days$|_yr$)/
const EXTENSIVE = /(_diameter_mm$|_height_mm$|_length_mm$|_width_mm$|_m3$|_m2$|_mass_kg$|_volume|_area_m2$|_t_day$|_kmol_h$|_kg_h$|_kwh$|c_min_kw_k$|_duty_kw$|_load_kw$|machinery_kw$|_kw$)/
const isExtensive = (key: string) => EXTENSIVE.test(key) && !INTENSIVE.test(key)
const isWritten = (key: string, corpus: string) =>
  new RegExp('\\b' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:').test(corpus) ||
  new RegExp("set\\w*\\(\\s*['\"]" + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(corpus)

const corpus = gatherWriteCorpus()
const plans = readdirSync(PLAN_DIR).filter(f => f.endsWith('.ts') && !f.includes('.test.'))
const findings: Array<{ plan: string; key: string; def: string }> = []
const perPlan: Record<string, { reads: number; frozenExt: number; intensiveOk: number }> = {}

for (const file of plans) {
  const src = stripComments(readFileSync(join(PLAN_DIR, file), 'utf-8'))
  const reads = [...src.matchAll(/q\(c,\s*'([a-z0-9_]+)',\s*([0-9.]+)\)/g)]
  const seen = new Set<string>()
  perPlan[file] = { reads: 0, frozenExt: 0, intensiveOk: 0 }
  for (const m of reads) {
    const key = m[1], def = m[2]
    if (seen.has(key)) continue
    seen.add(key); perPlan[file].reads++
    if (isWritten(key, corpus)) continue            // derived elsewhere → scales
    if (isExtensive(key)) { findings.push({ plan: file, key, def }); perPlan[file].frozenExt++ }
    else perPlan[file].intensiveOk++                // intensive default → fine
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ findings, perPlan }, null, 2))
} else {
  console.log(`\n  SIZING-SCALE AUDIT — ${plans.length} class plans scanned`)
  console.log(`  ${'-'.repeat(72)}`)
  if (!findings.length) {
    console.log('  PASS — no frozen EXTENSIVE sizing input found. Every size/mass/duty')
    console.log('         read either scales from the brief or is a written-derived value.')
  } else {
    const byPlan: Record<string, typeof findings> = {}
    for (const f of findings) (byPlan[f.plan] ||= []).push(f)
    for (const plan of Object.keys(byPlan).sort()) {
      console.log(`  ✗ ${plan}`)
      for (const f of byPlan[plan]) console.log(`      FROZEN  ${f.key.padEnd(40)} default=${f.def}  (extensive → must scale)`)
    }
    console.log(`  ${'-'.repeat(72)}`)
    console.log(`  FAIL — ${findings.length} frozen extensive sizing input(s) across ${Object.keys(byPlan).length} class plan(s).`)
    console.log('  Each is read from the contract with a hardcoded default that is never set,')
    console.log('  so the equipment does not scale with the brief\'s production rate. Fix: derive')
    console.log('  the value from a scaled throughput quantity (e.g. *_tonnes_yr that doubles).')
  }
}
process.exit(findings.length ? 1 : 0)
