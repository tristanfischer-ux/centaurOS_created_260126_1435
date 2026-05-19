import { getClassPack } from '../class-packs'
import { buildReportReadinessGate, type ReportReadinessVerdict } from '../scoring/report-readiness'
import { PRODUCT_CLASSES, type ProductClass } from '../schema/types'
import { isScratchArchitectureSupported } from '../scratch/universal-modules'
import { runReportCompiler } from './run-report-compiler'

export type ProductClassSupportLevel = 'deep_scratch' | 'generic_fallback' | 'unknown_fallback'

export interface ProductClassCoverageRow {
  productClass: ProductClass
  classPackLabel: string
  probeBrief: string
  classifiedAs: ProductClass
  classificationConfidence: 'high' | 'medium' | 'low'
  supportLevel: ProductClassSupportLevel
  architectureSource: 'scratch_universal_architecture' | 'generic_class_pack_fallback'
  verdict: ReportReadinessVerdict
  ok: boolean
  moduleCount: number
  subModuleCount: number
  componentCandidateCount: number
  requiredInterfaceLinks: number
  readyForBom: boolean
  scoredSectionsAtTarget: number
  scoredSections: number
  meanScore: number | null
  blockingIssueCodes: string[]
  limitations: string[]
  nextAction: string
}

export interface ProductClassCoverageMatrix {
  generatedAt: string
  summary: {
    productClasses: number
    deepScratchClasses: number
    genericFallbackClasses: number
    unknownFallbackClasses: number
    publishableRows: number
    blockedRows: number
  }
  rows: ProductClassCoverageRow[]
}

const PROBE_BRIEFS: Record<ProductClass, string> = {
  energy_storage: 'Design a 3.5 MWh containerised BESS with 1 MW PCS, LFP cells, BMS, thermal management and fire protection.',
  vertical_farm: 'Design a compact vertical farm for leafy greens with LED grow lights, hydroponic fertigation, CO2 monitoring and airflow control.',
  heat_pump: 'Design an 8 kW thermal air-source heat pump with COP 3.5, compressor, refrigerant circuit, evaporator, condenser and monobloc enclosure.',
  ev_charger: 'Design a 150 kW DC fast EV charger with CCS2 connector, OCPP backend, ISO 15118 support and grid isolation.',
  bioreactor: 'Design a single-use mammalian-cell bioreactor with sparger, peristaltic feed pumps, sterile bags and dissolved oxygen control.',
  drone: 'Design a prosumer cinematography drone with 4K camera payload, 40 minutes endurance, brushless motors, ESCs and flight controller.',
  auv: 'Design an autonomous underwater vehicle with pressure hull, thrusters, DVL, battery pack and acoustic communications.',
  edge_ai: 'Design a 1U rack-mount edge AI inference appliance with 200 TOPS GPU module, 700 W power budget, redundant power and thermal management.',
  haps: 'Design a solar-electric high-altitude pseudo-satellite for 20 km altitude, 30 day endurance and 35 m wingspan with wing structure, solar cells, battery storage, propulsion and stratospheric communications.',
  cgm: 'Design a 14 day wear continuous glucose monitor wearable patch with 5 minute readings, MARD 9%, glucose sensing filament, adhesive skin interface, BLE radio and disposable applicator.',
  unknown: 'Design a novel hardware product with unclear operating principle and no quantified requirements yet.',
}

export async function buildProductClassCoverageMatrix(): Promise<ProductClassCoverageMatrix> {
  const rows: ProductClassCoverageRow[] = []
  for (const productClass of PRODUCT_CLASSES) {
    rows.push(await coverageRow(productClass))
  }
  return {
    generatedAt: new Date(0).toISOString(),
    summary: {
      productClasses: rows.length,
      deepScratchClasses: rows.filter(row => row.supportLevel === 'deep_scratch').length,
      genericFallbackClasses: rows.filter(row => row.supportLevel === 'generic_fallback').length,
      unknownFallbackClasses: rows.filter(row => row.supportLevel === 'unknown_fallback').length,
      publishableRows: rows.filter(row => row.verdict === 'publishable').length,
      blockedRows: rows.filter(row => row.verdict === 'blocked').length,
    },
    rows,
  }
}

export function renderProductClassCoverageCsv(matrix: ProductClassCoverageMatrix): string {
  const header = [
    'productClass',
    'classPackLabel',
    'classifiedAs',
    'classificationConfidence',
    'supportLevel',
    'architectureSource',
    'verdict',
    'ok',
    'moduleCount',
    'subModuleCount',
    'componentCandidateCount',
    'requiredInterfaceLinks',
    'readyForBom',
    'scoredSectionsAtTarget',
    'scoredSections',
    'meanScore',
    'blockingIssueCodes',
    'limitations',
    'nextAction',
  ]
  const rows = matrix.rows.map(row => [
    row.productClass,
    row.classPackLabel,
    row.classifiedAs,
    row.classificationConfidence,
    row.supportLevel,
    row.architectureSource,
    row.verdict,
    String(row.ok),
    String(row.moduleCount),
    String(row.subModuleCount),
    String(row.componentCandidateCount),
    String(row.requiredInterfaceLinks),
    String(row.readyForBom),
    String(row.scoredSectionsAtTarget),
    String(row.scoredSections),
    row.meanScore === null ? '' : String(row.meanScore),
    row.blockingIssueCodes.join('; '),
    row.limitations.join('; '),
    row.nextAction,
  ])
  return [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n') + '\n'
}

async function coverageRow(productClass: ProductClass): Promise<ProductClassCoverageRow> {
  const result = await runReportCompiler({
    id: `coverage-${productClass}`,
    productClass: productClass === 'unknown' ? undefined : productClass,
    briefText: PROBE_BRIEFS[productClass],
  })
  const gate = buildReportReadinessGate(result.dossier, result.architectureReadiness, result.issues, result.score)
  const scratchSupported = isScratchArchitectureSupported(result.dossier.productClass)
  const supportLevel = productClass === 'unknown'
    ? 'unknown_fallback'
    : scratchSupported
      ? 'deep_scratch'
      : 'generic_fallback'
  const blockingIssueCodes = result.issues
    .filter(issue => issue.severity === 'blocker' || issue.severity === 'major')
    .map(issue => `${issue.section}/${issue.code}`)

  return {
    productClass,
    classPackLabel: getClassPack(result.dossier.productClass).label,
    probeBrief: PROBE_BRIEFS[productClass],
    classifiedAs: result.dossier.productClass,
    classificationConfidence: classificationConfidenceFromTrace(result),
    supportLevel,
    architectureSource: scratchSupported ? 'scratch_universal_architecture' : 'generic_class_pack_fallback',
    verdict: gate.verdict,
    ok: result.ok,
    moduleCount: result.architectureReadiness.moduleCount,
    subModuleCount: result.architectureReadiness.subModuleCount,
    componentCandidateCount: result.architectureReadiness.componentWordCount,
    requiredInterfaceLinks: result.architectureReadiness.requiredInterfaceLinks.length,
    readyForBom: result.architectureReadiness.readyForBom,
    scoredSectionsAtTarget: gate.summary.sectionsAtOrAboveTarget,
    scoredSections: gate.summary.sections,
    meanScore: gate.summary.meanScore,
    blockingIssueCodes,
    limitations: limitationsForSupport(supportLevel),
    nextAction: nextActionForSupport(supportLevel),
  }
}

function limitationsForSupport(supportLevel: ProductClassSupportLevel): string[] {
  if (supportLevel === 'deep_scratch') {
    return ['Deep deterministic grammar exists, but engineering evidence and sourcing evidence are still required before publication.']
  }
  if (supportLevel === 'generic_fallback') {
    return ['Classification exists, but this class currently uses the generic fallback architecture and is blocked from publishable/design-ready status.']
  }
  return ['Unknown briefs use a generic placeholder only and are blocked until classification and a class grammar are available.']
}

function nextActionForSupport(supportLevel: ProductClassSupportLevel): string {
  if (supportLevel === 'deep_scratch') return 'Continue evidence intake, source-backed BoM admission and class-specific depth improvements.'
  if (supportLevel === 'generic_fallback') return 'Implement a class-specific scratch grammar with modules, submodules, interface rules and critical component candidates.'
  return 'Improve classification or request a more specific brief before generating design content.'
}

function classificationConfidenceFromTrace(
  result: Awaited<ReturnType<typeof runReportCompiler>>,
): ProductClassCoverageRow['classificationConfidence'] {
  const value = result.stageTrace.find(stage => stage.id === 'product_class_selection')?.metrics.confidence
  return value === 'high' || value === 'medium' || value === 'low' ? value : 'low'
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
