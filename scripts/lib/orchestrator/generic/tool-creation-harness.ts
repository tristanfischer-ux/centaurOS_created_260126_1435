/**
 * scripts/lib/orchestrator/generic/tool-creation-harness.ts
 *
 * STANDALONE VERIFICATION HARNESS for TOOL-CREATION-ON-THE-FLY. Proves, by DOING:
 *
 *   PART A — THE SELF-TEST GATE WORKS (the #1 thing to prove, runs OFFLINE):
 *     A1. a deliberately-BROKEN tool (returns a NEGATIVE media volume) is REJECTED
 *         by the gate (its self-test, which expects a positive volume, FAILS).
 *     A2. a deliberately-BROKEN tool that returns ZERO volume is REJECTED.
 *     A3. a tool that EXITS 3 (raises) is REJECTED.
 *     A4. a CORRECT hand-written MBBR tool PASSES the gate, registers, and the
 *         bootstrap planner's catalogue then OFFERS it (wirable).
 *
 *   PART B — LIVE GENERATION (uses the real reasoner; skips cleanly if no API key):
 *     B1. ask the generator for an MBBR biofilter sizing tool for the RAS duty
 *         (tan_production_kg_per_day = 21.6, a nitrification rate → required media
 *         volume + media surface area). Show it generating the python, self-testing
 *         it, and PASSING (registered) or FAILING (rejected) — honestly.
 *
 * Run:  npx tsx scripts/lib/orchestrator/generic/tool-creation-harness.ts
 *
 * Uses a TEMP sqlite db so the run never pollutes ~/.forge-truth/forge-truth.db.
 *
 * British spelling throughout.
 */

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import './../register-all' // populate the registry so the catalogue is real
import { getTool } from '../registry'
import { buildToolCatalogue, _resetCatalogueCacheForTests } from './bootstrap-tool-plan'
import {
  runSelfTestSuite,
  generateAndRegisterTool,
  scriptBasenameForId,
  type SelfTestCase,
  type DutySpec,
} from './tool-generator'
import { GENERATED_PY_DIR, registerDynamicTool } from './dynamic-tool'

// ── small assert helpers ────────────────────────────────────────────────────
let PASS = 0
let FAIL = 0
function check(label: string, cond: boolean, detail = ''): void {
  if (cond) { PASS++; console.log(`  ✓ ${label}`) }
  else { FAIL++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`) }
}

// ── canned python tools (hand-written, to exercise the gate OFFLINE) ─────────

// A CORRECT MBBR biofilter sizing tool: media volume from the nitrification rate.
//   required_media_volume_m3 = TAN_load(g/day) / SARR(g N / m^2 / day) / SSA(m^2/m^3)
//   media_surface_area_m2     = required_media_volume_m3 * SSA
// (Moving-Bed Biofilm Reactor design — Rusten et al. 2006; SARR = surface area
//  removal rate; SSA = specific surface area of the carrier.)
const CORRECT_MBBR = `#!/usr/bin/env python3
import json, math, sys, time

def compute(payload):
    tan_kg_day = float(payload.get("tan_production_kg_per_day", 0.0))
    sarr = float(payload.get("nitrification_rate_g_n_m2_day", 0.0))   # g N / m2 / day
    ssa = float(payload.get("media_specific_surface_area_m2_m3", 500.0))  # m2/m3
    fill = float(payload.get("fill_fraction", 0.5))
    if tan_kg_day <= 0: raise ValueError("tan_production_kg_per_day must be > 0")
    if sarr <= 0: raise ValueError("nitrification_rate must be > 0")
    if ssa <= 0: raise ValueError("media_specific_surface_area must be > 0")
    tan_g_day = tan_kg_day * 1000.0
    area_needed_m2 = tan_g_day / sarr
    media_volume_m3 = area_needed_m2 / ssa
    reactor_volume_m3 = media_volume_m3 / max(0.1, min(0.7, fill))
    worked = [{
        "label": "Required carrier media volume",
        "formula": "V = (TAN_load_g_day / SARR) / SSA",
        "substitution": f"({tan_g_day:.0f} / {sarr}) / {ssa}",
        "result": round(media_volume_m3, 4), "result_unit": "m3",
    }]
    return {
        "required_media_volume_m3": round(media_volume_m3, 4),
        "media_surface_area_m2": round(area_needed_m2, 2),
        "reactor_volume_m3": round(reactor_volume_m3, 4),
        "worked": worked,
    }

def main():
    t = time.time()
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        json.dump({"error": f"JSON parse: {exc}"}, sys.stdout); return 2
    try:
        out = compute(payload)
        out.setdefault("_meta", {})["wall_time_s"] = round(time.time() - t, 4)
    except Exception as exc:
        json.dump({"error": f"{type(exc).__name__}: {exc}"}, sys.stdout); return 3
    json.dump(out, sys.stdout); return 0

if __name__ == "__main__":
    sys.exit(main())
`

// BROKEN #1: returns a NEGATIVE media volume (sign bug). A correct tool can never
// produce a negative physical volume — the self-test (expecting a positive range)
// MUST catch this.
const BROKEN_NEGATIVE = CORRECT_MBBR.replace(
    '"required_media_volume_m3": round(media_volume_m3, 4),',
    '"required_media_volume_m3": round(-media_volume_m3, 4),  # DELIBERATE BUG',
)

// BROKEN #2: returns ZERO media volume (collapsed maths).
const BROKEN_ZERO = CORRECT_MBBR.replace(
    '"required_media_volume_m3": round(media_volume_m3, 4),',
    '"required_media_volume_m3": 0.0,  # DELIBERATE BUG',
)

// BROKEN #3: crashes (exit 3) — divides by a hard zero.
const BROKEN_CRASH = CORRECT_MBBR.replace(
    'media_volume_m3 = area_needed_m2 / ssa',
    'media_volume_m3 = area_needed_m2 / 0.0  # DELIBERATE CRASH',
)

// The MBBR self-test suite (what a correct tool MUST satisfy). Two operating
// points. required_media_volume_m3 must be POSITIVE and engineering-plausible.
//   case 1: 21.6 kg/day TAN, SARR 0.5 g/m2/day, SSA 500 m2/m3
//           → area = 21600/0.5 = 43,200 m2 ; vol = 43200/500 = 86.4 m3
//   case 2: 5 kg/day TAN, SARR 0.6, SSA 600 → area 8333 m2 ; vol 13.9 m3
const MBBR_TESTS: SelfTestCase[] = [
  {
    inputs: { tan_production_kg_per_day: 21.6, nitrification_rate_g_n_m2_day: 0.5, media_specific_surface_area_m2_m3: 500, fill_fraction: 0.5 },
    expect: { required_media_volume_m3: [60, 120], media_surface_area_m2: [30000, 60000] },
    note: 'RAS duty: 21.6 kg/day TAN, SARR 0.5, SSA 500',
  },
  {
    inputs: { tan_production_kg_per_day: 5, nitrification_rate_g_n_m2_day: 0.6, media_specific_surface_area_m2_m3: 600, fill_fraction: 0.5 },
    expect: { required_media_volume_m3: [10, 20], media_surface_area_m2: [6000, 12000] },
    note: 'smaller load: 5 kg/day TAN, SARR 0.6, SSA 600',
  },
]
const MBBR_REQUIRED_OUTPUTS = ['required_media_volume_m3', 'media_surface_area_m2']

function writeCanned(id: string, src: string): string {
  const path = resolve(GENERATED_PY_DIR, `${scriptBasenameForId(id)}.py`)
  writeFileSync(path, src, 'utf-8')
  return path
}

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log(' TOOL-CREATION-ON-THE-FLY — verification harness')
  console.log('═══════════════════════════════════════════════════════════════════\n')

  // ───────── PART A — THE SELF-TEST GATE (offline, deterministic) ─────────
  console.log('PART A — SELF-TEST GATE (the load-bearing proof; runs offline)\n')

  // A1 — broken (negative volume) is REJECTED.
  {
    const path = writeCanned('mbbrbroken-neg:sizing', BROKEN_NEGATIVE)
    const report = runSelfTestSuite(path, MBBR_TESTS, MBBR_REQUIRED_OUTPUTS)
    check('A1 broken tool returning a NEGATIVE volume is REJECTED by the gate', report.passed === false)
    const c1 = report.cases[0]
    check('A1 failure reason names the out-of-range negative', !!c1 && /OUT OF RANGE|non-finite|negative/i.test(c1.reason),
      c1 ? c1.reason : 'no case')
    console.log(`     gate said: ${report.failure_digest.split('\n')[1]?.trim() ?? report.failure_digest}\n`)
  }

  // A2 — broken (zero volume) is REJECTED.
  {
    const path = writeCanned('mbbrbroken-zero:sizing', BROKEN_ZERO)
    const report = runSelfTestSuite(path, MBBR_TESTS, MBBR_REQUIRED_OUTPUTS)
    check('A2 broken tool returning ZERO volume is REJECTED by the gate', report.passed === false)
    console.log(`     gate said: ${report.failure_digest.split('\n')[1]?.trim() ?? report.failure_digest}\n`)
  }

  // A3 — crashing tool (exit 3) is REJECTED.
  {
    const path = writeCanned('mbbrbroken-crash:sizing', BROKEN_CRASH)
    const report = runSelfTestSuite(path, MBBR_TESTS, MBBR_REQUIRED_OUTPUTS)
    check('A3 tool that EXITS 3 (raises) is REJECTED by the gate', report.passed === false)
    const c1 = report.cases[0]
    check('A3 failure reason names the non-zero exit', !!c1 && /exit\s*3|non-zero exit|error field/i.test(c1.reason),
      c1 ? c1.reason : 'no case')
    console.log(`     gate said: ${report.cases[0]?.reason ?? '(no case)'}\n`)
  }

  // A4 — CORRECT tool PASSES, registers, and is then OFFERED by the catalogue.
  {
    const id = 'mbbr:biofilter-sizing'
    const path = writeCanned(id, CORRECT_MBBR)
    const report = runSelfTestSuite(path, MBBR_TESTS, MBBR_REQUIRED_OUTPUTS)
    check('A4 CORRECT MBBR tool PASSES the self-test gate', report.passed === true,
      report.passed ? '' : report.failure_digest)
    if (report.passed) {
      const c0 = report.cases[0].output
      console.log(`     case 1 computed: required_media_volume_m3=${c0?.required_media_volume_m3}, media_surface_area_m2=${c0?.media_surface_area_m2} (expected ~86.4 m3, ~43,200 m2)`)
      // register it the way the chain does, then confirm the planner catalogue sees it.
      const reg = registerDynamicTool({
        id, name: 'MBBR Biofilter Sizing', scriptPath: path,
        inputKeys: ['tan_production_kg_per_day', 'nitrification_rate_g_n_m2_day', 'media_specific_surface_area_m2_m3', 'fill_fraction'],
        outputKeys: MBBR_REQUIRED_OUTPUTS.concat('reactor_volume_m3'),
        domain: 'process',
      })
      check('A4 a PASSED tool registers into the live registry', reg.ok && !!getTool(id), reg.error ?? '')
      _resetCatalogueCacheForTests()
      const cat = buildToolCatalogue()
      const entry = cat.find(c => c.tool_id === id)
      check('A4 the bootstrap planner CATALOGUE now offers the registered tool (wirable)', !!entry)
      check('A4 the catalogue exposes its REAL computed output fields', !!entry && entry.output_fields.includes('required_media_volume_m3'),
        entry ? entry.output_fields.join(',') : 'no entry')
    }
    console.log('')
  }

  // ───────── PART B — LIVE GENERATION (real reasoner; skips if no key) ─────────
  console.log('PART B — LIVE GENERATION via the reasoner (MBBR for the RAS duty)\n')
  if (!process.env.OPENROUTER_API_KEY) {
    console.log('  ⚠ OPENROUTER_API_KEY not set — skipping the live generation leg.')
    console.log('    (Part A already proved the gate; Part B proves the end-to-end generate→self-test→register.)\n')
  } else {
    const tmpDir = mkdtempSync(resolve(tmpdir(), 'forge-toolgen-'))
    const tmpDb = resolve(tmpDir, 'generated-tools-test.db')
    const duty: DutySpec = {
      tool_id: 'mbbr-generated:biofilter-sizing',
      name: 'MBBR Biofilter Sizing (generated)',
      purpose: 'Size the moving-bed biofilm reactor (MBBR) biofilter for a recirculating aquaculture system from the ammonia (TAN) production load and the carrier nitrification rate.',
      physics_description:
        'Moving-Bed Biofilm Reactor (MBBR) nitrification sizing (Rusten et al. 2006). The total ' +
        'ammonia-nitrogen (TAN) load to remove (kg N/day) divided by the carrier Surface Area ' +
        'Removal Rate SARR (g N per m^2 of biofilm per day) gives the required protected biofilm ' +
        'surface area (m^2): A = TAN_load_g_per_day / SARR. The required carrier MEDIA VOLUME (m^3) ' +
        'is that area divided by the carrier Specific Surface Area SSA (m^2/m^3): V_media = A / SSA. ' +
        'The reactor tank volume is V_media / fill_fraction (carrier fill 40-70 %). Convert kg to g ' +
        '(x1000). Validate all inputs > 0.',
      domain: 'process',
      available_input_keys: [
        { name: 'tan_production_kg_per_day', unit: 'kg/day', family: 'massflow' },
        { name: 'nitrification_rate_g_n_m2_day', unit: 'g/m2/day', family: 'other' },
        { name: 'media_specific_surface_area_m2_m3', unit: 'm2/m3', family: 'other' },
        { name: 'fill_fraction', unit: '-', family: 'dimensionless' },
      ],
      required_output_keys: [
        { name: 'required_media_volume_m3', unit: 'm3', family: 'volume' },
        { name: 'media_surface_area_m2', unit: 'm2', family: 'area' },
      ],
    }
    console.log(`  Requesting generation of "${duty.tool_id}" for the RAS duty (tan_production_kg_per_day=21.6)…`)
    try {
      const result = await generateAndRegisterTool(duty, { register: true, dbPath: tmpDb })
      if (result.ok) {
        console.log(`  ✓ B1 generated + SELF-TEST-PASSED in ${result.attempts} attempt(s); registered=${result.registered}, reused=${result.reused}`)
        console.log(`     output keys: ${result.output_keys.join(', ')}`)
        console.log(`     script: ${result.script_path}`)
        // Show what the generated tool computes on the headline RAS input.
        const sample = runSelfTestSuite(result.script_path, MBBR_TESTS, MBBR_REQUIRED_OUTPUTS)
        const out = sample.cases[0]?.output
        console.log(`     on tan=21.6 kg/day: required_media_volume_m3=${out?.required_media_volume_m3}, media_surface_area_m2=${out?.media_surface_area_m2}`)
        check('B1 the GENERATED tool passes the same independent MBBR self-test', sample.passed === true,
          sample.passed ? '' : sample.failure_digest)
        check('B1 the generated tool is registered + offered by the planner catalogue',
          !!getTool(duty.tool_id))
      } else {
        console.log(`  ⚠ B1 generation did NOT pass the gate (stage=${result.stage}, attempts=${result.attempts}).`)
        console.log(`     This is the FAIL-SAFE path: the tool was REJECTED, not used.`)
        if (result.self_test) console.log(`     last self-test digest:\n${result.self_test.failure_digest}`)
        console.log(`     error: ${result.error}`)
        check('B1 a tool that could not prove itself is NOT registered (rejected)', !getTool(duty.tool_id))
      }
    } catch (err) {
      console.log(`  ⚠ B1 live generation threw (network/model): ${(err as Error).message} — Part A already proves the gate.`)
    } finally {
      try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* no-op */ }
    }
    console.log('')
  }

  // ───────── summary ─────────
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log(` RESULT: ${PASS} checks passed, ${FAIL} failed`)
  console.log('═══════════════════════════════════════════════════════════════════')
  // Clean up the canned broken scripts (leave the correct MBBR for inspection).
  for (const id of ['mbbrbroken-neg:sizing', 'mbbrbroken-zero:sizing', 'mbbrbroken-crash:sizing']) {
    try { rmSync(resolve(GENERATED_PY_DIR, `${scriptBasenameForId(id)}.py`), { force: true }) } catch { /* no-op */ }
  }
  process.exit(FAIL === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('harness crashed:', err)
  process.exit(2)
})
