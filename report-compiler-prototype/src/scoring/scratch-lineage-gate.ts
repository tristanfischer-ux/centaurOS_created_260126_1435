import { isScratchArchitectureSupported } from '../scratch/universal-modules'
import type { PipelineStageTrace, ProductDossier, ProvenanceRef } from '../schema/types'
import { buildBomProvenanceManifest } from '../sourcing/provenance-manifest'
import type { DepthBenchmarkModel } from './depth-benchmark'

export type ScratchLineageVerdict =
  | 'scratch_lineage_clean'
  | 'scratch_lineage_review_required'
  | 'scratch_lineage_blocked'

export type ScratchLineageArea =
  | 'architecture_source'
  | 'design_provenance_refs'
  | 'bom_candidate_provenance'
  | 'source_evidence_boundary'
  | 'chain_v2_quarantine'
  | 'benchmark_isolation'

export type ScratchLineageAreaVerdict = 'pass' | 'review' | 'blocked'

export interface ScratchLineageGateRow {
  area: ScratchLineageArea
  verdict: ScratchLineageAreaVerdict
  signal: string
  passRatio: number
  blockers: string[]
  requiredAction: string
}

export interface ScratchLineageGate {
  verdict: ScratchLineageVerdict
  summary: {
    rows: number
    passRows: number
    reviewRows: number
    blockedRows: number
    passRatio: number
    productClass: string
    scratchArchitectureSupported: boolean
    architectureSource: string
    designRefs: number
    sourceRefs: number
    forbiddenRefs: number
    forbiddenStageMentions: number
    unprovenancedBomClaims: number
    admittedSourcingEvidenceRows: number
    chainBenchmarkUsed: boolean
    benchmarkSource: string
    lineageClean: boolean
    nextAction: string | null
  }
  rows: ScratchLineageGateRow[]
  blockers: string[]
  nextActions: string[]
}

interface ProvenanceHit {
  scope: 'design' | 'architecture' | 'bom' | 'source_ledger' | 'source_evidence'
  location: string
  kind: string
  ref: string
  componentWordId?: string
}

const ALLOWED_KINDS = new Set(['brief', 'formula', 'source', 'model', 'assumption', 'class_pack'])
const FORBIDDEN_CONTENT_PATTERNS = [
  /chain[-_\s]?v2/i,
  /chain-v2-adapted/i,
  /state\.json/i,
  /bess-iter/i,
  /\biter-\d+/i,
  /parsedbrief/i,
  /modifier[_\s-]?characters?/i,
  /content[_\s-]?character/i,
]

export function buildScratchLineageGate(
  dossier: ProductDossier,
  stageTrace: PipelineStageTrace[],
  depthBenchmark?: DepthBenchmarkModel,
): ScratchLineageGate {
  const scratchSupported = isScratchArchitectureSupported(dossier.productClass)
  const architectureStage = stageTrace.find(stage => stage.id === 'universal_module_architecture')
  const architectureSource = String(architectureStage?.metrics.architecture_source ?? 'unknown')
  const provenanceHits = collectProvenanceHits(dossier)
  const sourceRefs = provenanceHits.filter(hit => hit.kind === 'source')
  const designRefs = provenanceHits.filter(hit => hit.scope === 'design' || hit.scope === 'architecture')
  const invalidKindRefs = provenanceHits.filter(hit => !ALLOWED_KINDS.has(hit.kind))
  const forbiddenRefs = provenanceHits.filter(hit => hasForbiddenContent(`${hit.kind}:${hit.ref}`))
  const stageMentions = collectStageTextMentions(stageTrace)
  const forbiddenStageMentions = stageMentions.filter(text => hasForbiddenContent(text))
  const sourceBoundaryViolations = sourceRefs.filter(hit => !sourceRefIsInAdmittedBoundary(hit, dossier))
  const architectureSourceRefs = sourceRefs.filter(hit => hit.scope === 'architecture')
  const provenance = buildBomProvenanceManifest(dossier)
  const unprovenancedBomClaims = provenance.rows.filter(row => row.status === 'provenance_violation')
  const chainBenchmarkUsed = Boolean(depthBenchmark?.benchmarkSource.toLowerCase().includes('chain-v2'))
  const benchmarkPolicy = depthBenchmark?.contentUsePolicy.toLowerCase() ?? ''
  const benchmarkPolicyClean = !depthBenchmark
    || !chainBenchmarkUsed
    || (benchmarkPolicy.includes('aggregate counts') && benchmarkPolicy.includes('not imported'))

  const rows: ScratchLineageGateRow[] = [
    {
      area: 'architecture_source',
      verdict: scratchSupported && architectureSource === 'scratch_universal_architecture'
        ? 'pass'
        : dossier.productClass === 'unknown' || (scratchSupported && architectureSource !== 'scratch_universal_architecture') ? 'blocked' : 'review',
      signal: `Product class ${dossier.productClass}; architecture source ${architectureSource}; scratch grammar supported: ${scratchSupported ? 'yes' : 'no'}.`,
      passRatio: scratchSupported && architectureSource === 'scratch_universal_architecture' ? 1 : 0,
      blockers: scratchSupported && architectureSource !== 'scratch_universal_architecture'
        ? [`Expected scratch_universal_architecture but received ${architectureSource}.`]
        : dossier.productClass === 'unknown'
          ? ['Unknown product class cannot prove scratch lineage.']
          : [],
      requiredAction: scratchSupported && architectureSource === 'scratch_universal_architecture'
        ? 'Design content came from the scratch universal architecture stage.'
        : dossier.productClass === 'unknown'
          ? 'Classify the product before generating architecture content.'
          : 'Add a scratch grammar for this product class before claiming clean universal lineage.',
    },
    {
      area: 'design_provenance_refs',
      verdict: invalidKindRefs.length > 0 || forbiddenRefs.length > 0 ? 'blocked' : designRefs.length > 0 ? 'pass' : 'review',
      signal: `${provenanceHits.length} provenance ref(s); ${designRefs.length} design/architecture ref(s); ${invalidKindRefs.length} invalid kind(s); ${forbiddenRefs.length} forbidden ref(s).`,
      passRatio: ratio(provenanceHits.length - invalidKindRefs.length - forbiddenRefs.length, provenanceHits.length),
      blockers: [
        ...invalidKindRefs.slice(0, 12).map(hit => `${hit.location}: unsupported provenance kind "${hit.kind}".`),
        ...forbiddenRefs.slice(0, 12).map(hit => `${hit.location}: forbidden lineage reference "${hit.ref}".`),
      ],
      requiredAction: invalidKindRefs.length === 0 && forbiddenRefs.length === 0
        ? 'All design provenance references are in the allowed scratch provenance vocabulary.'
        : 'Replace forbidden or unsupported provenance refs with brief, class_pack, formula, model, assumption or admitted source refs.',
    },
    {
      area: 'bom_candidate_provenance',
      verdict: unprovenancedBomClaims.length > 0 ? 'blocked' : dossier.bom.lines.length > 0 ? 'pass' : 'review',
      signal: `${dossier.bom.lines.length} candidate BoM line(s); ${dossier.sources.sourcingEvidence.length} admitted source evidence row(s); ${unprovenancedBomClaims.length} unprovenanced supplier/manufacturer/MPN/cost claim(s).`,
      passRatio: unprovenancedBomClaims.length === 0 ? 1 : 0,
      blockers: unprovenancedBomClaims.slice(0, 12).map(row => `${row.lineId}/${row.field}: ${row.nextAction}`),
      requiredAction: unprovenancedBomClaims.length === 0
        ? 'Candidate BoM fields remain unpriced or explicitly source-backed.'
        : 'Clear unprovenanced BoM claims or attach admitted source evidence before rendering them as claims.',
    },
    {
      area: 'source_evidence_boundary',
      verdict: sourceBoundaryViolations.length > 0 || architectureSourceRefs.length > 0 ? 'blocked' : 'pass',
      signal: `${sourceRefs.length} source provenance ref(s); ${sourceBoundaryViolations.length} outside admitted evidence boundary; ${architectureSourceRefs.length} inside architecture content.`,
      passRatio: sourceRefs.length === 0 ? 1 : ratio(sourceRefs.length - sourceBoundaryViolations.length - architectureSourceRefs.length, sourceRefs.length),
      blockers: sourceBoundaryViolations.slice(0, 12).map(hit => `${hit.location}: source ref "${hit.ref}" is outside admitted sourcing evidence.`),
      requiredAction: sourceBoundaryViolations.length === 0 && architectureSourceRefs.length === 0
        ? 'Source refs appear only in admitted source evidence, source ledger entries or matching source-backed BoM lines.'
        : 'Move source-backed claims into sourcing evidence and keep architecture/component generation source-free.',
    },
    {
      area: 'chain_v2_quarantine',
      verdict: forbiddenRefs.length > 0 || forbiddenStageMentions.length > 0 ? 'blocked' : 'pass',
      signal: `${forbiddenRefs.length} forbidden provenance ref(s); ${forbiddenStageMentions.length} forbidden stage-trace mention(s).`,
      passRatio: forbiddenRefs.length === 0 && forbiddenStageMentions.length === 0 ? 1 : 0,
      blockers: [
        ...forbiddenRefs.slice(0, 8).map(hit => `${hit.location}: ${hit.ref}`),
        ...forbiddenStageMentions.slice(0, 8).map(text => `stage trace: ${text}`),
      ],
      requiredAction: forbiddenRefs.length === 0 && forbiddenStageMentions.length === 0
        ? 'No chain-v2/state.json/modifier lineage appears inside generated design content or stage traces.'
        : 'Remove chain-v2/state.json-derived refs from the scratch dossier; use them only in the isolated numeric benchmark.',
    },
    {
      area: 'benchmark_isolation',
      verdict: benchmarkPolicyClean ? 'pass' : 'review',
      signal: depthBenchmark
        ? `Benchmark source: ${depthBenchmark.benchmarkSource}; chain benchmark used: ${chainBenchmarkUsed ? 'yes' : 'no'}; policy: ${depthBenchmark.contentUsePolicy}`
        : 'No depth benchmark supplied for this report.',
      passRatio: benchmarkPolicyClean ? 1 : 0,
      blockers: benchmarkPolicyClean ? [] : ['Depth benchmark policy does not explicitly quarantine benchmark content to aggregate counts only.'],
      requiredAction: benchmarkPolicyClean
        ? chainBenchmarkUsed
          ? 'Chain-v2 is isolated to numeric aggregate benchmark counts; no design content import is allowed.'
          : 'Benchmark does not use chain-v2 input.'
        : 'Update the benchmark policy so comparator data cannot be treated as design content.',
    },
  ]

  const blockedRows = rows.filter(row => row.verdict === 'blocked')
  const reviewRows = rows.filter(row => row.verdict === 'review')
  const verdict: ScratchLineageVerdict = blockedRows.length > 0
    ? 'scratch_lineage_blocked'
    : reviewRows.length > 0 ? 'scratch_lineage_review_required' : 'scratch_lineage_clean'

  return {
    verdict,
    summary: {
      rows: rows.length,
      passRows: rows.filter(row => row.verdict === 'pass').length,
      reviewRows: reviewRows.length,
      blockedRows: blockedRows.length,
      passRatio: ratio(rows.filter(row => row.verdict === 'pass').length, rows.length),
      productClass: dossier.productClass,
      scratchArchitectureSupported: scratchSupported,
      architectureSource,
      designRefs: designRefs.length,
      sourceRefs: sourceRefs.length,
      forbiddenRefs: forbiddenRefs.length,
      forbiddenStageMentions: forbiddenStageMentions.length,
      unprovenancedBomClaims: unprovenancedBomClaims.length,
      admittedSourcingEvidenceRows: dossier.sources.sourcingEvidence.length,
      chainBenchmarkUsed,
      benchmarkSource: depthBenchmark?.benchmarkSource ?? 'none',
      lineageClean: blockedRows.length === 0,
      nextAction: rows.find(row => row.verdict === 'blocked')?.requiredAction ?? rows.find(row => row.verdict === 'review')?.requiredAction ?? null,
    },
    rows,
    blockers: blockedRows.flatMap(row => row.blockers.length > 0 ? row.blockers : [`${row.area}: ${row.signal}`]),
    nextActions: Array.from(new Set(rows.filter(row => row.verdict !== 'pass').map(row => row.requiredAction))),
  }
}

export function renderScratchLineageGateCsv(gate: ScratchLineageGate): string {
  const header = [
    'area',
    'verdict',
    'signal',
    'passRatio',
    'blockers',
    'requiredAction',
  ]
  const rows = gate.rows.map(row => [
    row.area,
    row.verdict,
    row.signal,
    String(row.passRatio),
    row.blockers.join(' '),
    row.requiredAction,
  ])
  return [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n') + '\n'
}

function collectProvenanceHits(dossier: ProductDossier): ProvenanceHit[] {
  const hits: ProvenanceHit[] = []
  const add = (
    scope: ProvenanceHit['scope'],
    location: string,
    refs: ProvenanceRef[] | ProvenanceRef | undefined,
    componentWordId?: string,
  ): void => {
    const list = Array.isArray(refs) ? refs : refs ? [refs] : []
    for (const ref of list) hits.push({ scope, location, kind: ref.kind, ref: ref.ref, componentWordId })
  }

  for (const requirement of dossier.brief.requirements) add('design', `brief.requirements.${requirement.id}.source`, requirement.source)
  for (const metric of dossier.keyMetrics) add('design', `keyMetrics.${metric.id}.provenance`, metric.provenance)
  for (const trace of dossier.requirementTrace) add('design', `requirementTrace.${trace.requirementId}.provenance`, trace.provenance)
  for (const standard of dossier.regulatory.standards) add('design', `regulatory.standards.${standard.id}.provenance`, standard.provenance)
  for (const check of dossier.feasibility.engineeringSanityChecks) add('design', `feasibility.engineeringSanityChecks.${check.id}.provenance`, check.provenance)
  add('design', 'cost.benchmarkGbp.source', dossier.cost.benchmarkGbp?.source)

  for (const module of dossier.architecture.modules) {
    for (const subModule of module.subModules) {
      for (const word of subModule.words) {
        const base = `architecture.modules.${module.id}.subModules.${subModule.id}.words.${word.id}`
        add('architecture', `${base}.provenance`, word.provenance, word.id)
        add('architecture', `${base}.quantity.provenance`, word.quantity.provenance, word.id)
      }
    }
  }

  for (const line of dossier.bom.lines) {
    add('bom', `bom.lines.${line.id}.provenance`, line.provenance, line.componentWordId)
    add('bom', `bom.lines.${line.id}.quantity.provenance`, line.quantity.provenance, line.componentWordId)
  }

  add('source_ledger', 'sources.refs', dossier.sources.refs)
  for (const record of dossier.sources.sourcingEvidence) {
    add('source_evidence', `sources.sourcingEvidence.${record.componentWordId}.evidence`, record.evidence, record.componentWordId)
  }

  return hits
}

function sourceRefIsInAdmittedBoundary(hit: ProvenanceHit, dossier: ProductDossier): boolean {
  if (hit.scope === 'source_evidence') return true
  const matchingEvidence = dossier.sources.sourcingEvidence.filter(record => record.evidence.ref === hit.ref)
  if (hit.scope === 'source_ledger') return matchingEvidence.length > 0
  if (hit.scope !== 'bom') return false
  return matchingEvidence.some(record => record.componentWordId === hit.componentWordId)
}

function collectStageTextMentions(stageTrace: PipelineStageTrace[]): string[] {
  return stageTrace.flatMap(stage => [
    stage.id,
    stage.title,
    stage.summary,
    ...Object.entries(stage.metrics).map(([key, value]) => `${key}: ${String(value)}`),
    ...stage.evidence,
    ...stage.limitations,
  ])
}

function hasForbiddenContent(value: string): boolean {
  return FORBIDDEN_CONTENT_PATTERNS.some(pattern => pattern.test(value))
}

function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) return 1
  return Math.round((numerator / denominator) * 100) / 100
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
