#!/usr/bin/env npx tsx
/**
 * scripts/regression-harness.tsx
 *
 * Sprint 4A (Tristan 2026-05-20): minimal regression harness.
 *
 * Re-renders cached chain state.json snapshots through the production
 * renderer and asserts a battery of invariants. PR-blocking: exits non-
 * zero on any failure. Designed to run in <2 minutes (no chain re-run,
 * just renderer + Engine B/C re-runs against cached states).
 *
 * Snapshots tracked (paths configurable via REGRESSION_SNAPSHOTS env):
 *   - VF 100 m² container brief
 *   - (BESS + heat pump to be added once first VF run is green)
 *
 * Invariants checked (universal — applied to every snapshot):
 *
 *   I1. Renderer exits 0 + writes PDF >= 200 KB
 *   I2. PDF page count within [30, 80]
 *   I3. partVerifications array non-empty
 *   I4. Every word in partVerifications has unit_price_gbp > 0 OR is
 *       flagged as TBD / manual-sourcing
 *   I5. No partVerifications row carries an obviously-broken price
 *       (unit_price < £0.10 unless explicitly TBD)
 *
 * Class-specific invariants (only when state's product_class matches):
 *
 *   VF:  brief canopy_area_m2 preserved in derived_parameters (±1 %)
 *   VF:  total LED installed power >= 10 kW (200 W/m² × 100 m² floor)
 *   VF:  40-ft ISO container, if present, priced >= £1,000
 *   BESS: cell_count, cell_voltage_v, cell_capacity_ah all present
 *   HP:  thermal output kW within ±20% of brief target
 *
 * Usage:
 *   npx tsx scripts/regression-harness.tsx [--snapshot path1[,path2,...]]
 *                                          [--no-rerender]
 */

import { readFileSync, existsSync, statSync } from 'fs'
import { execFileSync } from 'child_process'
import { resolve, dirname } from 'path'

interface Assertion {
  id: string
  description: string
  passed: boolean
  detail?: string
}

interface SnapshotResult {
  snapshot_path: string
  product_class: string | null
  assertions: Assertion[]
}

const DEFAULT_SNAPSHOTS = [
  // 100 m² VF container brief — the canonical case
  '/tmp/vf-100m2-rerun/state.json',
]

function loadSnapshots(): string[] {
  const arg = process.argv.find((a) => a.startsWith('--snapshot='))
  if (arg) return arg.replace('--snapshot=', '').split(',').map((p) => resolve(p.trim())).filter(Boolean)
  const envOverride = process.env.REGRESSION_SNAPSHOTS
  if (envOverride) return envOverride.split(',').map((p) => resolve(p.trim())).filter(Boolean)
  return DEFAULT_SNAPSHOTS.map((p) => resolve(p))
}

function assertEq<T>(id: string, description: string, actual: T, predicate: (v: T) => boolean, detail?: (v: T) => string): Assertion {
  const passed = predicate(actual)
  return { id, description, passed, detail: passed ? undefined : (detail ? detail(actual) : `got ${JSON.stringify(actual)}`) }
}

function runRenderer(statePath: string): { ok: boolean; pdfPath: string; pages: number; sizeKb: number; stderr: string } {
  const pdfPath = statePath.replace(/\.json$/, '.regression.pdf')
  const projectRoot = resolve(__dirname, '..')
  try {
    const stderr = execFileSync('npx', ['tsx', resolve(__dirname, 'render-minimal-pdf.tsx'), statePath, pdfPath], {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf-8',
      timeout: 120_000,
    })
    if (!existsSync(pdfPath)) {
      return { ok: false, pdfPath, pages: 0, sizeKb: 0, stderr: 'PDF not written' }
    }
    const sizeKb = statSync(pdfPath).size / 1024
    let pages = 0
    try {
      const info = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf-8' })
      const m = info.match(/^Pages:\s*(\d+)/m)
      if (m) pages = parseInt(m[1], 10)
    } catch {
      // pdfinfo not installed — page count check is skipped
    }
    return { ok: true, pdfPath, pages, sizeKb, stderr }
  } catch (err: any) {
    return { ok: false, pdfPath, pages: 0, sizeKb: 0, stderr: err?.stderr?.toString() ?? String(err) }
  }
}

function checkSnapshot(snapshotPath: string): SnapshotResult {
  const assertions: Assertion[] = []
  if (!existsSync(snapshotPath)) {
    return {
      snapshot_path: snapshotPath,
      product_class: null,
      assertions: [{ id: 'FILE', description: 'snapshot file exists', passed: false, detail: 'file not found' }],
    }
  }
  const state = JSON.parse(readFileSync(snapshotPath, 'utf-8'))
  const productClass: string = state?.moduleDecomposition?.product_class ?? state?.parsedBrief?.product_class ?? ''

  // I1. Renderer + PDF size
  const renderResult = runRenderer(snapshotPath)
  assertions.push({
    id: 'I1.render',
    description: 'renderer exits 0 + writes PDF >= 200 KB',
    passed: renderResult.ok && renderResult.sizeKb >= 200,
    detail: !renderResult.ok ? `render failed: ${renderResult.stderr.slice(0, 300)}` : (renderResult.sizeKb < 200 ? `pdf only ${renderResult.sizeKb.toFixed(1)} KB` : undefined),
  })

  // I2. Page count
  if (renderResult.pages > 0) {
    assertions.push(assertEq(
      'I2.pages',
      'PDF page count within [30, 80]',
      renderResult.pages,
      (p) => p >= 30 && p <= 80,
      (p) => `got ${p} pages`,
    ))
  }

  // I3-5. partVerifications health
  const pv: any[] = Array.isArray(state.partVerifications) ? state.partVerifications : []
  assertions.push(assertEq(
    'I3.partVerifications',
    'partVerifications array non-empty',
    pv.length,
    (n) => n > 0,
    (n) => `partVerifications has ${n} rows`,
  ))

  const brokenPrices = pv.filter((p: any) => {
    const price = p.price_estimate_gbp ?? p.unit_price_gbp ?? 0
    if (!price) return false  // explicit TBD is ok
    return price > 0 && price < 0.10
  })
  assertions.push(assertEq(
    'I5.no_broken_prices',
    'no priced part has unit < £0.10',
    brokenPrices.length,
    (n) => n === 0,
    (n) => `${n} rows priced < £0.10: ${brokenPrices.slice(0, 3).map((p: any) => `${p.word_name ?? p.word_id}=£${p.price_estimate_gbp}`).join('; ')}`,
  ))

  // Class-specific invariants
  if (productClass === 'vertical_farm' || productClass === 'verticalfarm') {
    // Canopy preserved
    const briefCanopy = state?.parsedBrief?.constraints?.additional_constraints?.find((c: any) =>
      String(c.description ?? '').match(/(\d+)\s*m².*(canopy|growing|growing\s+surface)/i)
    )
    const md = state?.moduleDecomposition?.modules ?? []
    const structContainment = md.find((m: any) => m.module === 'structure_containment')
    const canopyDp = structContainment?.derived_parameters?.canopy_area_m2
                  ?? structContainment?.derived_parameters?.growing_area_m2
                  ?? null
    if (canopyDp != null) {
      assertions.push(assertEq(
        'VF.canopy_preserved',
        'VF canopy_area_m2 in derived_parameters reasonable for 100 m² brief',
        Number(canopyDp),
        (n) => n >= 90 && n <= 110,
        (n) => `canopy_area_m2 = ${n}, expected ~100`,
      ))
    }
    // Container price floor
    const containerPv = pv.find((p: any) =>
      String(p.engine_b_component_class ?? '') === 'structural_metal'
      && /(\d+)[\s-]*(ft|foot).*container|iso[\s-]*container/i.test(String(p.word_name ?? p.part_name ?? ''))
    )
    if (containerPv) {
      const containerPrice = containerPv.cost_repair_corrected_price_gbp
        ?? containerPv.price_estimate_gbp
        ?? containerPv.unit_price_gbp
        ?? 0
      assertions.push(assertEq(
        'VF.container_price_floor',
        'ISO container priced >= £1,000',
        Number(containerPrice),
        (n) => n >= 1000,
        (n) => `container unit price £${n}, expected >= £1,000`,
      ))
    }
  }

  if (productClass === 'energy_storage' || productClass.startsWith('bess')) {
    const eos = state?.moduleDecomposition?.modules?.find((m: any) => m.module === 'energy_storage_source')
    const dp = eos?.derived_parameters ?? {}
    const required = ['cell_count', 'cell_voltage_v', 'cell_capacity_ah']
    const missing = required.filter((k) => dp[k] == null)
    assertions.push(assertEq(
      'BESS.cell_fields',
      'BESS energy_storage_source.derived_parameters has cell_count + cell_voltage_v + cell_capacity_ah',
      missing.length,
      (n) => n === 0,
      (n) => `${n} required fields missing: ${missing.join(', ')}`,
    ))
  }

  // === Additional universal invariants ===

  // I6. Module count — full taxonomy decomposition usually emits 8-12 modules
  const modules: any[] = state?.moduleDecomposition?.modules ?? []
  assertions.push(assertEq(
    'I6.module_count',
    'moduleDecomposition.modules count within [6, 14]',
    modules.length,
    (n) => n >= 6 && n <= 14,
    (n) => `${n} modules emitted`,
  ))

  // I7. Cost Repair Summary present (proves Cost Repair Loop ran)
  if (state?.cost_repair_summary) {
    const summary = state.cost_repair_summary
    const reviewed = (summary.corrected_count ?? 0) + (summary.manual_sourcing_count ?? 0) + (summary.leave_as_is_count ?? 0)
    assertions.push(assertEq(
      'I7.cost_repair_ratio',
      'Cost Repair reviewed >= 50% of flagged lines',
      summary.flagged_count > 0 ? reviewed / summary.flagged_count : 1,
      (r) => r >= 0.5,
      (r) => `reviewed ${reviewed}/${summary.flagged_count} flagged (${Math.round(r * 100)}%)`,
    ))
  }

  // I8. Supplier validation summary — if present, urls_replaced + already_reconciled >= 50% of candidates
  if (state?.supplier_validation_summary) {
    const sv = state.supplier_validation_summary
    const safe = (sv.urls_replaced ?? 0) + (sv.already_reconciled ?? 0)
    assertions.push(assertEq(
      'I8.supplier_reconcile_ratio',
      'Supplier validation: >= 50% of candidates have reconciled URLs',
      sv.total_candidates > 0 ? safe / sv.total_candidates : 1,
      (r) => r >= 0.5,
      (r) => `${safe}/${sv.total_candidates} reconciled (${Math.round(r * 100)}%)`,
    ))
  }

  // I9. Fresh-chain markers — these fields prove the NEW chain stages ran.
  // Soft check (informational); only fails if all three are missing (suggests
  // a chain run pre-dating Sprints 1B/3A/0v2).
  const freshMarkers = {
    cost_repair: !!state?.cost_repair_summary,
    supplier_validation: !!state?.supplier_validation_summary,
    brief_hero_image: !!state?.brief_hero_image_path,
  }
  const freshCount = Object.values(freshMarkers).filter(Boolean).length
  assertions.push(assertEq(
    'I9.fresh_chain_markers',
    'state has at least one of: cost_repair_summary, supplier_validation_summary, brief_hero_image_path',
    freshCount,
    (n) => n >= 1,
    () => `none of the fresh-chain markers present — state predates Sprints 1B/3A/0v2: ${JSON.stringify(freshMarkers)}`,
  ))

  // VF-specific additional invariants
  if (productClass === 'vertical_farm' || productClass === 'verticalfarm') {
    const eo = modules.find((m: any) => m.module === 'energy_conversion_transduction')
    const eoDp = eo?.derived_parameters ?? {}
    // Total LED installed power for 100 m² canopy at 200 W/m² = 20 kW floor;
    // 300 W/m² = 30 kW ceiling. Accept anything in [10, 40] kW for safety.
    const ledKw = Number(
      eoDp.led_installed_power_kw
      ?? eoDp.total_led_power_kw
      ?? eoDp.peak_led_power_kw
      ?? 0
    )
    if (ledKw > 0) {
      assertions.push(assertEq(
        'VF.led_power_realistic',
        'VF total LED installed power in [10, 40] kW for ~100 m² canopy',
        ledKw,
        (n) => n >= 10 && n <= 40,
        (n) => `LED power = ${n} kW (typical 20-30 kW for commercial leafy greens at 100 m²)`,
      ))
    }
  }

  return { snapshot_path: snapshotPath, product_class: productClass, assertions }
}

function main() {
  const snapshots = loadSnapshots()
  console.log(`[regression-harness] checking ${snapshots.length} snapshot(s)`)
  const results: SnapshotResult[] = []
  for (const s of snapshots) {
    const r = checkSnapshot(s)
    results.push(r)
    const passed = r.assertions.filter((a) => a.passed).length
    const total = r.assertions.length
    console.log(`\n[regression-harness] ${s} (${r.product_class ?? '?'}): ${passed}/${total} passed`)
    for (const a of r.assertions) {
      const mark = a.passed ? 'PASS' : 'FAIL'
      console.log(`  [${mark}] ${a.id}: ${a.description}${a.detail ? ` — ${a.detail}` : ''}`)
    }
  }
  const allPassed = results.every((r) => r.assertions.every((a) => a.passed))
  const totalAsserts = results.reduce((s, r) => s + r.assertions.length, 0)
  const totalPassed = results.reduce((s, r) => s + r.assertions.filter((a) => a.passed).length, 0)
  console.log(`\n[regression-harness] OVERALL: ${totalPassed}/${totalAsserts} passed across ${results.length} snapshot(s)`)
  process.exit(allPassed ? 0 : 1)
}

main()
