import { buildDepthBenchmark, renderDepthBenchmarkCsv } from './scoring/depth-benchmark'
import { runReportCompiler } from './pipeline/run-report-compiler'
import type { ChainV2Analysis } from './chain-v2/types'

const bessBenchmark: ChainV2Analysis = {
  moduleCount: 11,
  subModuleCount: 48,
  wordCount: 241,
  moduleGrammarLinkCount: 35,
  crossModuleLinkCount: 19,
  pricedWordCount: 207,
  pricedWordRatio: 0.8589211618257261,
  estimatedBomTotalGbp: 322183.2,
  issues: [],
}

async function main(): Promise<void> {
  const bess = await runReportCompiler({
    id: 'audit-depth-benchmark-bess',
    briefText: 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.',
  })
  const farm = await runReportCompiler({
    id: 'audit-depth-benchmark-farm',
    briefText: 'Design a compact vertical farm for leafy greens using LED grow lights, hydroponic fertigation, CO2 monitoring, and a 2.4 m by 1.4 m envelope.',
  })
  const haps = await runReportCompiler({
    id: 'audit-depth-benchmark-haps',
    briefText: 'Design a solar-electric high-altitude pseudo-satellite for 20 km altitude, 30 day station-keeping endurance and 35 m wingspan with wing structure, solar cell array, MPPT power tracker, stratospheric battery pack, electric propulsion pods, flight control computer, GNSS INS navigation, communications payload, thermal insulation and recovery parachute.',
  })
  const cgm = await runReportCompiler({
    id: 'audit-depth-benchmark-cgm',
    briefText: 'Design a 14 day wear continuous glucose monitor wearable patch with 5 minute readings, MARD 9%, glucose sensing filament, enzyme reagent membrane, reference electrode, adhesive skin interface, thin-film battery, BLE radio module, protective transmitter housing, sterile barrier pouch and disposable applicator.',
  })
  const bessDepth = buildDepthBenchmark(bess.dossier, bess.architectureReadiness, bess.issues, bess.score, bessBenchmark)
  const farmDepth = buildDepthBenchmark(farm.dossier, farm.architectureReadiness, farm.issues, farm.score)
  const hapsDepth = buildDepthBenchmark(haps.dossier, haps.architectureReadiness, haps.issues, haps.score)
  const cgmDepth = buildDepthBenchmark(cgm.dossier, cgm.architectureReadiness, cgm.issues, cgm.score)
  const csv = renderDepthBenchmarkCsv(bessDepth)
  const bessRows = new Map(bessDepth.rows.map(row => [row.id, row]))

  assert(bessDepth.benchmarkSource.includes('chain-v2-adapted'), 'BESS depth benchmark should use chain-v2 numeric analysis when provided.')
  assert(bessDepth.contentUsePolicy.includes('aggregate counts only'), 'Benchmark should explicitly forbid design-content import.')
  assert(bessRows.get('module_count')?.status === 'meets', 'BESS scratch should match chain-v2 module count.')
  assert((bessRows.get('submodule_count')?.scratchValue ?? 0) >= 45, 'BESS scratch should preserve the expanded submodule depth.')
  assert((bessRows.get('component_word_count')?.scratchValue ?? 0) >= 200, 'BESS scratch should preserve the expanded component-word depth.')
  assert((bessRows.get('interface_link_volume')?.scratchValue ?? 0) >= 50, 'BESS scratch should preserve expanded interface-link volume.')
  assert(bessRows.get('submodule_count')?.status === 'below', 'BESS scratch should show submodule depth gap against chain-v2.')
  assert(bessRows.get('component_word_count')?.status === 'below', 'BESS scratch should show component-word depth gap against chain-v2.')
  assert(bessRows.get('priced_line_ratio')?.status === 'below', 'BESS scratch should show sourcing/price coverage gap.')
  assert(bessDepth.gaps.length > 0, 'BESS depth benchmark should expose gaps instead of claiming parity.')
  assert(csv.trim().split('\n').length === bessDepth.summary.rows + 1, 'Depth benchmark CSV should contain one header plus one row per benchmark dimension.')
  assert(farmDepth.benchmarkSource === 'prototype internal depth target', 'Farm should use internal depth target when no chain benchmark exists.')
  assert(hapsDepth.benchmarkSource === 'prototype internal depth target', 'HAPS should use internal depth target when no chain benchmark exists.')
  assert(hapsDepth.rows.find(row => row.id === 'module_count')?.status === 'meets', 'HAPS should meet its internal module-count target.')
  assert(hapsDepth.rows.find(row => row.id === 'component_word_count')?.status === 'meets', 'HAPS should meet its internal component-candidate target.')
  assert(cgmDepth.benchmarkSource === 'prototype internal depth target', 'CGM should use internal depth target when no chain benchmark exists.')
  assert(cgmDepth.rows.find(row => row.id === 'module_count')?.status === 'meets', 'CGM should meet its internal module-count target.')
  assert(cgmDepth.rows.find(row => row.id === 'component_word_count')?.status === 'meets', 'CGM should meet its internal component-candidate target.')

  console.log('Depth benchmark audit passed')
  console.log({
    bess: {
      benchmarkSource: bessDepth.benchmarkSource,
      meets: bessDepth.summary.meets,
      below: bessDepth.summary.below,
      averageComparableRatio: bessDepth.summary.averageComparableRatio,
      gaps: bessDepth.gaps.map(row => `${row.id}:${row.ratio}`),
    },
    farm: {
      benchmarkSource: farmDepth.benchmarkSource,
      meets: farmDepth.summary.meets,
      below: farmDepth.summary.below,
    },
    haps: {
      benchmarkSource: hapsDepth.benchmarkSource,
      meets: hapsDepth.summary.meets,
      below: hapsDepth.summary.below,
    },
    cgm: {
      benchmarkSource: cgmDepth.benchmarkSource,
      meets: cgmDepth.summary.meets,
      below: cgmDepth.summary.below,
    },
    csvRows: csv.trim().split('\n').length,
  })
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
