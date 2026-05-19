import { buildInterfaceGraph } from '../architecture/interface-graph'
import { buildEngineeringVerificationPlan } from '../architecture/verification-plan'
import type { ChainV2Analysis } from '../chain-v2/types'
import type { ArchitectureReadiness, BatchSectionScore, ProductDossier, SectionIssue } from '../schema/types'

export type DepthBenchmarkStatus = 'meets' | 'below' | 'not_comparable'

export interface DepthBenchmarkRow {
  id: string
  label: string
  scratchValue: number
  benchmarkValue: number
  unit: string
  ratio: number | null
  status: DepthBenchmarkStatus
  notes: string
  action: string
}

export interface DepthBenchmarkModel {
  benchmarkSource: string
  contentUsePolicy: string
  summary: {
    rows: number
    meets: number
    below: number
    notComparable: number
    averageComparableRatio: number | null
  }
  rows: DepthBenchmarkRow[]
  gaps: DepthBenchmarkRow[]
}

export function buildDepthBenchmark(
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
  issues: SectionIssue[],
  score?: BatchSectionScore,
  chainBenchmark?: ChainV2Analysis,
): DepthBenchmarkModel {
  const graph = buildInterfaceGraph(dossier, readiness)
  const verification = buildEngineeringVerificationPlan(dossier, readiness, issues)
  const pricedLineRatio = dossier.bom.lines.length === 0
    ? 0
    : dossier.bom.lines.filter(line => line.unitCostGbp !== null).length / dossier.bom.lines.length
  const sectionsAtEight = Object.values(score?.sectionScores ?? {}).filter(value => (value ?? 0) >= 8).length
  const sectionCount = Object.values(score?.sectionScores ?? {}).length
  const target = defaultTargets(dossier.productClass)
  const benchmarkSource = chainBenchmark
    ? 'chain-v2-adapted numeric analysis only'
    : 'prototype internal depth target'

  const rows: DepthBenchmarkRow[] = [
    row(
      'module_count',
      'Functional modules',
      readiness.moduleCount,
      chainBenchmark?.moduleCount ?? target.modules,
      'modules',
      'Core architecture breadth.',
      'Add missing functional modules only when the product class genuinely requires them.',
    ),
    row(
      'submodule_count',
      'Submodules',
      readiness.subModuleCount,
      chainBenchmark?.subModuleCount ?? target.subModules,
      'submodules',
      'Submodule count is a rough proxy for engineering decomposition depth.',
      'Expand thin modules with concrete sub-functions and carrier interfaces.',
    ),
    row(
      'component_word_count',
      'Component candidates',
      readiness.componentWordCount,
      chainBenchmark?.wordCount ?? target.componentWords,
      'components',
      'Component-word count is a rough proxy for BoM review surface, not sourcing quality.',
      'Add justified component candidates where submodules still hide assemblies.',
    ),
    row(
      'interface_link_volume',
      'Interface link volume',
      graph.summary.sharedInterfaceEdges + graph.summary.requiredInterfaceEdges,
      chainBenchmark ? chainBenchmark.moduleGrammarLinkCount + chainBenchmark.crossModuleLinkCount : target.interfaceLinks,
      'links',
      'Compares link volume only; chain-v2 grammar links and scratch interface edges are not semantically identical.',
      'Add interface contracts only where they clarify a real energy, material, signal, load or service path.',
    ),
    row(
      'priced_line_ratio',
      'Admitted priced-line ratio',
      round(pricedLineRatio),
      chainBenchmark?.pricedWordRatio ?? target.pricedRatio,
      'ratio',
      chainBenchmark
        ? 'Chain-v2 priced words are treated as benchmark coverage only; scratch admits prices only with explicit sourcing evidence.'
        : 'Prototype target expects most critical lines to become source-backed before publication.',
      'Use sourcing intake to admit source-backed price/manufacturer/MPN evidence; do not copy benchmark estimates.',
    ),
    row(
      'sections_at_target',
      'Sections scoring >=8',
      sectionsAtEight,
      sectionCount || target.scoredSections,
      'sections',
      'Readiness gate requires every scored section to reach the target.',
      'Clear section-specific readiness actions, especially BoM evidence.',
    ),
    row(
      'verification_activities',
      'Verification activities',
      verification.summary.activities,
      target.verificationActivities,
      'activities',
      'Scratch-only evidence workflow depth; not compared to chain-v2 content.',
      'Keep adding verification activities when new requirements, interfaces or standards are introduced.',
    ),
  ]

  const comparable = rows.filter(item => item.ratio !== null)
  return {
    benchmarkSource,
    contentUsePolicy: 'Benchmark uses aggregate counts only. Chain-v2 component names, prose, design content, prices and part numbers are not imported into the scratch generator.',
    summary: {
      rows: rows.length,
      meets: rows.filter(item => item.status === 'meets').length,
      below: rows.filter(item => item.status === 'below').length,
      notComparable: rows.filter(item => item.status === 'not_comparable').length,
      averageComparableRatio: comparable.length === 0
        ? null
        : round(comparable.reduce((sum, item) => sum + (item.ratio ?? 0), 0) / comparable.length),
    },
    rows,
    gaps: rows.filter(item => item.status === 'below'),
  }
}

export function renderDepthBenchmarkCsv(benchmark: DepthBenchmarkModel): string {
  const header = [
    'id',
    'label',
    'scratchValue',
    'benchmarkValue',
    'unit',
    'ratio',
    'status',
    'notes',
    'action',
  ]
  const rows = benchmark.rows.map(row => [
    row.id,
    row.label,
    String(row.scratchValue),
    String(row.benchmarkValue),
    row.unit,
    row.ratio === null ? '' : String(row.ratio),
    row.status,
    row.notes,
    row.action,
  ])
  return [header, ...rows].map(values => values.map(csvEscape).join(',')).join('\n') + '\n'
}

function row(
  id: string,
  label: string,
  scratchValue: number,
  benchmarkValue: number,
  unit: string,
  notes: string,
  action: string,
): DepthBenchmarkRow {
  const ratio = benchmarkValue <= 0 ? null : round(scratchValue / benchmarkValue)
  return {
    id,
    label,
    scratchValue: round(scratchValue),
    benchmarkValue: round(benchmarkValue),
    unit,
    ratio,
    status: ratio === null ? 'not_comparable' : ratio >= 1 ? 'meets' : 'below',
    notes,
    action,
  }
}

function defaultTargets(productClass: ProductDossier['productClass']): {
  modules: number
  subModules: number
  componentWords: number
  interfaceLinks: number
  pricedRatio: number
  scoredSections: number
  verificationActivities: number
} {
  if (productClass === 'energy_storage') {
    return { modules: 10, subModules: 40, componentWords: 200, interfaceLinks: 45, pricedRatio: 0.8, scoredSections: 6, verificationActivities: 24 }
  }
  if (productClass === 'vertical_farm') {
    return { modules: 9, subModules: 30, componentWords: 140, interfaceLinks: 30, pricedRatio: 0.75, scoredSections: 6, verificationActivities: 20 }
  }
  if (productClass === 'heat_pump') {
    return { modules: 9, subModules: 27, componentWords: 108, interfaceLinks: 34, pricedRatio: 0.75, scoredSections: 6, verificationActivities: 20 }
  }
  if (productClass === 'ev_charger') {
    return { modules: 9, subModules: 27, componentWords: 108, interfaceLinks: 34, pricedRatio: 0.75, scoredSections: 6, verificationActivities: 20 }
  }
  if (productClass === 'bioreactor') {
    return { modules: 9, subModules: 27, componentWords: 108, interfaceLinks: 36, pricedRatio: 0.75, scoredSections: 6, verificationActivities: 22 }
  }
  if (productClass === 'auv') {
    return { modules: 9, subModules: 27, componentWords: 108, interfaceLinks: 34, pricedRatio: 0.75, scoredSections: 6, verificationActivities: 22 }
  }
  if (productClass === 'edge_ai') {
    return { modules: 10, subModules: 30, componentWords: 120, interfaceLinks: 36, pricedRatio: 0.75, scoredSections: 6, verificationActivities: 24 }
  }
  if (productClass === 'haps') {
    return { modules: 11, subModules: 33, componentWords: 132, interfaceLinks: 40, pricedRatio: 0.75, scoredSections: 6, verificationActivities: 26 }
  }
  if (productClass === 'cgm') {
    return { modules: 10, subModules: 30, componentWords: 120, interfaceLinks: 38, pricedRatio: 0.75, scoredSections: 6, verificationActivities: 26 }
  }
  if (productClass === 'drone') {
    return { modules: 9, subModules: 30, componentWords: 130, interfaceLinks: 28, pricedRatio: 0.75, scoredSections: 6, verificationActivities: 20 }
  }
  return { modules: 8, subModules: 24, componentWords: 100, interfaceLinks: 20, pricedRatio: 0.75, scoredSections: 6, verificationActivities: 16 }
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
