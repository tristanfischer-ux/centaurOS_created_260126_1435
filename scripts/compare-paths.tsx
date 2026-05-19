#!/usr/bin/env npx tsx
/**
 * scripts/compare-paths.tsx
 *
 * Compare two state.json outputs (Path A = parallel multi-emitter anchor mode,
 * Path B = serial Flash-Lite → Grok) on arithmetic accuracy + brief coverage.
 *
 * Usage:
 *   npx tsx scripts/compare-paths.tsx <state-a.json> <state-b.json> [brief.md]
 */
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

interface ModuleSpec {
  module: string
  module_brief?: string
  overview_paragraph_en?: string
  derived_parameters?: Record<string, number | string>
  sub_modules?: Array<{ id: string; name_human?: string; words?: any[]; english_sentence?: string }>
}

interface Decomposition {
  modules: ModuleSpec[]
  cross_module_grammar_links?: any[]
  excluded_modules?: string[]
}

function num(v: any): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function checkEnergyArithmetic(m: ModuleSpec): { ok: boolean | null; details: string } {
  const dp = m.derived_parameters ?? {}
  const cells = num(dp.cell_count)
  const Ah = num(dp.cell_capacity_ah) ?? num(dp.cell_ah)
  const V = num(dp.cell_voltage_v) ?? num(dp.cell_voltage_nominal_v)
  const totalKwh = num(dp.nameplate_capacity_mwh) !== null
    ? (num(dp.nameplate_capacity_mwh) as number) * 1000
    : num(dp.capacity_kwh_total) ?? num(dp.capacity_kwh_gross) ?? num(dp.capacity_kwh) ?? null
  if (!cells || !Ah || !V || !totalKwh) return { ok: null, details: 'fields missing' }
  const product = (cells * Ah * V) / 1000
  const errPct = Math.abs(product - totalKwh) / totalKwh
  return {
    ok: errPct <= 0.02,
    details: `${cells}×${Ah}×${V}/1000 = ${product.toFixed(0)} kWh vs claimed ${totalKwh} kWh (${(errPct * 100).toFixed(1)}% off)`,
  }
}

function checkModuleCellCount(m: ModuleSpec): { ok: boolean | null; details: string } {
  const dp = m.derived_parameters ?? {}
  const cells = num(dp.cell_count)
  const modCount = num(dp.module_count) ?? num(dp.modules_count)
  const cellsPerModule = num(dp.cells_per_module)
  if (!cells || !modCount || !cellsPerModule) return { ok: null, details: 'fields missing' }
  const ok = modCount * cellsPerModule === cells
  return { ok, details: `${modCount}×${cellsPerModule} = ${modCount * cellsPerModule} vs cell_count=${cells}` }
}

function checkBriefCoverage(decomp: Decomposition, brief: string): { score: number; details: string[] } {
  const briefLower = brief.toLowerCase()
  const targets: Array<{ key: string; values: string[] }> = [
    { key: '£180,000 cost ceiling', values: ['180000', '180,000', '180k'] },
    { key: '28,000 kg mass', values: ['28000', '28,000'] },
    { key: '3.5 MWh usable', values: ['3500', '3.5'] },
    { key: '1 MW continuous', values: ['1000', '1 mw'] },
    { key: '1.25 MW peak', values: ['1250', '1.25'] },
    { key: '800 V DC bus', values: ['800'] },
    { key: '400 V AC output', values: ['400 v', '400v'] },
    { key: '6000 cycles', values: ['6000', '6,000'] },
    { key: '40-foot ISO container', values: ['12192', '12,192'] },
    { key: 'IEC 62619', values: ['iec 62619', 'iec62619'] },
    { key: 'UL 9540A', values: ['ul 9540', 'ul9540'] },
    { key: 'NFPA 855', values: ['nfpa 855'] },
    { key: 'G99 Issue 6', values: ['g99'] },
    { key: 'CATL 280 Ah', values: ['280', 'catl'] },
  ]
  const allDeclared: string[] = []
  for (const m of decomp.modules ?? []) {
    allDeclared.push(JSON.stringify(m.derived_parameters ?? {}))
    allDeclared.push(m.overview_paragraph_en ?? '')
    allDeclared.push(m.module_brief ?? '')
    for (const sm of (m.sub_modules ?? [])) allDeclared.push(sm.english_sentence ?? '')
  }
  const blob = allDeclared.join(' ').toLowerCase()
  const details: string[] = []
  let hit = 0
  for (const t of targets) {
    const present = t.values.some(v => blob.includes(v.toLowerCase()))
    if (present) hit++
    details.push(`${present ? '✓' : '✗'} ${t.key}`)
  }
  return { score: hit / targets.length, details }
}

function proseDetail(decomp: Decomposition): { avgSentenceCount: number; avgChars: number } {
  let totalSent = 0
  let totalChars = 0
  let n = 0
  for (const m of decomp.modules ?? []) {
    const o = m.overview_paragraph_en ?? ''
    if (o.length > 0) {
      totalSent += (o.match(/[.!?]+/g) ?? []).length
      totalChars += o.length
      n++
    }
  }
  return { avgSentenceCount: n ? totalSent / n : 0, avgChars: n ? totalChars / n : 0 }
}

function reportPath(label: string, statePath: string, brief: string) {
  if (!existsSync(statePath)) {
    console.log(`\n=== ${label} ===\n  state.json missing: ${statePath}`)
    return
  }
  const s = JSON.parse(readFileSync(statePath, 'utf-8'))
  const decomp: Decomposition = s.moduleDecomposition
  if (!decomp || !decomp.modules) {
    console.log(`\n=== ${label} ===\n  moduleDecomposition missing or empty`)
    return
  }
  console.log(`\n=== ${label} (${statePath}) ===`)
  console.log(`Modules: ${decomp.modules.length}`)
  console.log()

  // Arithmetic per module
  console.log('Per-module arithmetic checks:')
  let energyPass = 0, energyFail = 0, energyNa = 0
  let cellPass = 0, cellFail = 0, cellNa = 0
  for (const m of decomp.modules) {
    const e = checkEnergyArithmetic(m)
    const c = checkModuleCellCount(m)
    if (e.ok === true) energyPass++
    else if (e.ok === false) energyFail++
    else energyNa++
    if (c.ok === true) cellPass++
    else if (c.ok === false) cellFail++
    else cellNa++
    const eIcon = e.ok === true ? '✓' : e.ok === false ? '✗' : '–'
    const cIcon = c.ok === true ? '✓' : c.ok === false ? '✗' : '–'
    if (e.ok !== null || c.ok !== null) {
      console.log(`  ${m.module.padEnd(35)} energy:${eIcon} ${e.details} | mod×cells:${cIcon} ${c.details}`)
    }
  }
  console.log()
  console.log(`Arithmetic summary: energy ${energyPass}/${energyPass + energyFail} pass (${energyNa} N/A), mod×cells ${cellPass}/${cellPass + cellFail} pass (${cellNa} N/A)`)
  console.log()

  const cov = checkBriefCoverage(decomp, brief)
  console.log(`Brief coverage: ${(cov.score * 100).toFixed(0)}% (${Math.round(cov.score * 14)}/14 constraints)`)
  for (const d of cov.details) console.log('  ' + d)
  console.log()

  const detail = proseDetail(decomp)
  console.log(`Prose detail: ${detail.avgSentenceCount.toFixed(1)} sentences avg, ${detail.avgChars.toFixed(0)} chars avg`)

  // Overall verdict
  const arithPct = (energyPass + cellPass) / Math.max(1, energyPass + energyFail + cellPass + cellFail)
  const overall = arithPct * 0.5 + cov.score * 0.3 + Math.min(detail.avgSentenceCount / 6, 1) * 0.2
  console.log()
  console.log(`Composite score: ${(overall * 100).toFixed(0)} / 100 (arith ${(arithPct * 100).toFixed(0)} weight 50, brief ${(cov.score * 100).toFixed(0)} weight 30, detail ${Math.min(detail.avgSentenceCount / 6, 1).toFixed(2)} weight 20)`)
}

const args = process.argv.slice(2)
if (args.length < 2) {
  console.error('Usage: compare-paths.tsx <state-a.json> <state-b.json> [brief.md]')
  process.exit(1)
}
const briefPath = args[2] ?? resolve(process.cwd(), 'src/lib/pdf-engine-v2/briefs/baseline-10/09-bess-container.md')
const brief = existsSync(briefPath) ? readFileSync(briefPath, 'utf-8') : ''
reportPath('PATH A — parallel multi-emitter anchor mode', resolve(args[0]), brief)
reportPath('PATH B — serial Flash-Lite → Grok 4.3', resolve(args[1]), brief)
