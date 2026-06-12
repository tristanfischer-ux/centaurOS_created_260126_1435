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
const INTENSIVE = /(_price|_gbp_|_temp|_frac$|_ratio$|_factor$|effectiveness|_barg$|_per_|velocity|_stages$|_ph$|_molar_ratio|_safety_factor|_score$|_days$|_yr$|density|_in_c$|_out_c$|_mol_frac$|flooding|_slope_m$|htu|ntu|_removal$|_pct$|_wt_pct$|c_ratio$|_emissivity|_loading)/
const EXTENSIVE = /(_diameter_mm$|_height_mm$|_length_mm$|_width_mm$|_m3$|_m2$|_mass_kg$|_volume|_area_m2$|_t_day$|_kmol_h$|_kg_h$|_kwh$|c_min_kw_k$|_duty_kw$|_load_kw$|machinery_kw$|_kw$)/
const isExtensive = (key: string) => EXTENSIVE.test(key) && !INTENSIVE.test(key)

// For the LITERAL scan (tool INPUTS), only the UNAMBIGUOUS extensive drivers — flows, duties,
// throughputs, currents. A hardcoded one of these CANNOT be right for a different plant size.
// Masses / diameters / volumes are deliberately EXCLUDED here: as a tool INPUT they are usually a
// fixed reference (a device's component mass, a minimum pipe bore, a max-tank LIMIT), which is
// legitimate hard-coding — flagging them is the false-positive Tristan warned about. Densities
// (rho_*, *_kg_m3), grid/carbon intensities and max_/min_ limits are excluded too.
const LITERAL_EXTENSIVE = /(_flow_kg_h$|_flow_m3_per_hour$|_flow_m3_h$|_kg_h$|_kmol_h$|_duty_kw$|_load_kw$|_throughput|steam_kg_h$|_feed_kg_h$|_kg_per_h$)/
const LITERAL_SKIP = /(rho_|_kg_m3$|density|^max_|^min_|_max_|_min_|intensity|_kgco2|carbon|_per_)/
const isLiteralExtensive = (key: string) => LITERAL_EXTENSIVE.test(key) && !INTENSIVE.test(key) && !LITERAL_SKIP.test(key)
const isWritten = (key: string, corpus: string) =>
  new RegExp('\\b' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:').test(corpus) ||
  new RegExp("set\\w*\\(\\s*['\"]" + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(corpus)

// EXTENSION (Tristan 2026-06-12): the freeze also hides in BARE LITERALS inside a tool's
// input_from_contract object — e.g. `gas_flow_kg_h: 316` calibrated for one plant size, which the
// q(c,...) scan above never sees. This is exactly what froze the CO2 absorber/stripper/reboiler.
// Scan each input_from_contract body for a bare literal assigned to an EXTENSIVE key. A value that
// DERIVES from the scale (`316 * q(c,'capture_capacity_tco2_per_day',1)`) or is a contract read
// (`q(c,'k',..)`) is NOT matched (the regex requires the number to be immediately followed by , } or
// newline). Intensive/fixed literals (density, temperatures, fractions, flooding, container/regulatory
// limits) are skipped — the SAME extensive-vs-fixed rule. Tristan: "some hard-coding is fine".
function scanToolInputLiterals(src: string): Array<{ key: string; val: string }> {
  const out: Array<{ key: string; val: string }> = []
  const seen = new Set<string>()
  const parts = src.split('input_from_contract:')
  for (let i = 1; i < parts.length; i++) {
    const body = parts[i].slice(0, 900)   // a tool input object is short; stay within it
    for (const m of body.matchAll(/([a-z_][a-z0-9_]*)\s*:\s*(-?[0-9][0-9_.]*)\s*(?:as const)?\s*[,}\n]/g)) {
      const key = m[1], val = m[2]
      if (seen.has(key)) continue
      if (Number(val) === 0) continue          // a zero literal can't be a harmful freeze (scaling 0 = no-op)
      if (!isLiteralExtensive(key)) continue   // only unambiguous flow/duty/throughput drivers
      seen.add(key); out.push({ key, val })
    }
  }
  return out
}

const corpus = gatherWriteCorpus()
const plans = readdirSync(PLAN_DIR).filter(f => f.endsWith('.ts') && !f.includes('.test.'))
const findings: Array<{ plan: string; key: string; def: string }> = []
const literalFindings: Array<{ plan: string; key: string; val: string }> = []
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
  for (const lf of scanToolInputLiterals(src)) literalFindings.push({ plan: file, key: lf.key, val: lf.val })
}

const enforceLiterals = process.argv.includes('--enforce-literals')
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ findings, literalFindings, perPlan }, null, 2))
} else {
  console.log(`\n  SIZING-SCALE AUDIT — ${plans.length} class plans scanned`)
  console.log(`  ${'-'.repeat(72)}`)
  // (A) frozen q(c,'KEY',DEFAULT) reads — the original scan (always gates).
  if (!findings.length) {
    console.log('  [reads]    PASS — no frozen EXTENSIVE q(c,…) sizing read.')
  } else {
    const byPlan: Record<string, typeof findings> = {}
    for (const f of findings) (byPlan[f.plan] ||= []).push(f)
    console.log(`  [reads]    FAIL — ${findings.length} frozen extensive q(c,…) read(s) across ${Object.keys(byPlan).length} plan(s):`)
    for (const plan of Object.keys(byPlan).sort()) {
      for (const f of byPlan[plan]) console.log(`      ✗ ${plan}  ${f.key.padEnd(38)} default=${f.def}`)
    }
  }
  // (B) bare-literal EXTENSIVE tool inputs — the new scan (the CO2-freeze pattern).
  console.log(`  ${'-'.repeat(72)}`)
  if (!literalFindings.length) {
    console.log('  [literals] PASS — no bare extensive literal in any tool input_from_contract.')
  } else {
    const byPlan: Record<string, typeof literalFindings> = {}
    for (const f of literalFindings) (byPlan[f.plan] ||= []).push(f)
    console.log(`  [literals] ${enforceLiterals ? 'FAIL' : 'FLAG'} — ${literalFindings.length} bare extensive tool-input literal(s) across ${Object.keys(byPlan).length} plan(s).`)
    console.log('             Hardcoded for one plant size; should derive from the design scale.')
    console.log('             (Intensive/fixed constants — density, temperatures, fractions, flooding,')
    console.log('             container/regulatory limits — are correctly skipped: "some hard-coding is fine".)')
    for (const plan of Object.keys(byPlan).sort((a, b) => byPlan[b].length - byPlan[a].length)) {
      console.log(`      ${plan}  (${byPlan[plan].length})`)
      for (const f of byPlan[plan]) console.log(`         ${f.key.padEnd(32)} = ${f.val}`)
    }
    if (!enforceLiterals) console.log('\n             FLAG-only by default — re-run with --enforce-literals to gate on these.')
  }
}
const fail = findings.length > 0 || (enforceLiterals && literalFindings.length > 0)
process.exit(fail ? 1 : 0)
