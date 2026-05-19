import { getClassPack } from '../class-packs'
import type { ProductDossier } from '../schema/types'
import { buildComponentIdentityWorklist } from '../sourcing/component-identity'
import { buildBomProvenanceManifest } from '../sourcing/provenance-manifest'
import { buildSourcingWorklist } from '../sourcing/worklist'

export type ComponentCandidateVerdict =
  | 'component_candidates_ready_for_sourcing'
  | 'component_candidates_review_required'
  | 'component_candidates_blocked'
  | 'no_component_candidates'

export type ComponentCandidateArea =
  | 'candidate_presence'
  | 'candidate_identity'
  | 'quantity_basis'
  | 'critical_candidate_coverage'
  | 'duplicate_identity_review'
  | 'sourcing_worklist_alignment'
  | 'provenance_boundary'

export type ComponentCandidateAreaVerdict = 'pass' | 'review' | 'blocked'

export interface ComponentCandidateGateRow {
  area: ComponentCandidateArea
  verdict: ComponentCandidateAreaVerdict
  signal: string
  passRatio: number
  blockers: string[]
  requiredAction: string
}

export interface ComponentCandidateGate {
  verdict: ComponentCandidateVerdict
  summary: {
    rows: number
    passRows: number
    reviewRows: number
    blockedRows: number
    passRatio: number
    bomLines: number
    componentWordIds: number
    criticalBomLines: number
    requiredCriticalParts: number
    allocatedCriticalParts: number
    positiveQuantityLines: number
    candidateWorklistRows: number
    duplicateComponentGroups: number
    provenanceViolations: number
    sourceEvidenceRows: number
    readyForSourcing: boolean
    nextAction: string | null
  }
  rows: ComponentCandidateGateRow[]
  blockers: string[]
  nextActions: string[]
}

export function buildComponentCandidateGate(dossier: ProductDossier): ComponentCandidateGate {
  const bomLines = dossier.bom.lines
  const pack = getClassPack(dossier.productClass)
  const identity = buildComponentIdentityWorklist(dossier.bom)
  const provenance = buildBomProvenanceManifest(dossier)
  const worklist = buildSourcingWorklist(dossier)
  const wordIndex = componentWordIndex(dossier)
  const requiredCriticalIds = pack.requiredParts
    .filter(part => part.critical)
    .map(part => normaliseId(part.label))
  const allocatedCriticalIds = new Set(bomLines.filter(line => line.critical).map(line => line.componentWordId))
  const missingCriticalIds = requiredCriticalIds.filter(id => !allocatedCriticalIds.has(id))
  const weakIdentityLines = bomLines.filter(line => {
    const word = wordIndex.get(line.componentWordId)
    return line.componentWordId.trim().length === 0
      || line.description.trim().length < 4
      || weakDescription(line.description)
      || !word?.role?.trim()
  })
  const badQuantityLines = bomLines.filter(line => line.quantity.value <= 0 || line.quantity.unit.trim().length === 0)
  const worklistRows = worklist.criticalUnpriced.length + worklist.candidateUnpriced.length
  const unpricedRows = bomLines.filter(line => line.unitCostGbp === null).length
  const provenanceViolationRows = provenance.rows.filter(row => row.status === 'provenance_violation')

  const rows: ComponentCandidateGateRow[] = [
    {
      area: 'candidate_presence',
      verdict: bomLines.length > 0 ? 'pass' : 'blocked',
      signal: `${bomLines.length} candidate BoM line(s), ${identity.summary.distinctComponentWordIds} distinct component identity key(s).`,
      passRatio: bomLines.length > 0 ? 1 : 0,
      blockers: bomLines.length > 0 ? [] : ['No component candidates were generated from the architecture.'],
      requiredAction: bomLines.length > 0
        ? 'Component candidates exist for downstream sourcing review.'
        : 'Generate concrete component candidates before sourcing or costing.',
    },
    {
      area: 'candidate_identity',
      verdict: weakIdentityLines.length === 0 ? 'pass' : 'review',
      signal: `${bomLines.length - weakIdentityLines.length}/${bomLines.length} candidate line(s) have non-generic identity, description and role context.`,
      passRatio: ratio(bomLines.length - weakIdentityLines.length, bomLines.length),
      blockers: weakIdentityLines.slice(0, 12).map(line => `${line.id}: weak candidate identity for ${line.componentWordId || 'blank id'}.`),
      requiredAction: weakIdentityLines.length === 0
        ? 'Candidate identities are specific enough for first-pass sourcing worklists.'
        : 'Rename weak component candidates and add role context before sourcing them.',
    },
    {
      area: 'quantity_basis',
      verdict: badQuantityLines.length === 0 ? 'pass' : 'blocked',
      signal: `${bomLines.length - badQuantityLines.length}/${bomLines.length} candidate line(s) have positive quantity and unit.`,
      passRatio: ratio(bomLines.length - badQuantityLines.length, bomLines.length),
      blockers: badQuantityLines.map(line => `${line.id}: quantity must be positive and unit must be present.`),
      requiredAction: badQuantityLines.length === 0
        ? 'Candidate quantities have positive values and explicit units.'
        : 'Repair candidate quantities before creating sourcing intake rows.',
    },
    {
      area: 'critical_candidate_coverage',
      verdict: missingCriticalIds.length === 0 ? 'pass' : 'blocked',
      signal: `${requiredCriticalIds.length - missingCriticalIds.length}/${requiredCriticalIds.length} class-critical part(s) are represented by candidate lines; ${bomLines.filter(line => line.critical).length} critical BoM line(s).`,
      passRatio: ratio(requiredCriticalIds.length - missingCriticalIds.length, requiredCriticalIds.length),
      blockers: missingCriticalIds.map(id => `${id}: class-critical part is missing from candidate BoM.`),
      requiredAction: missingCriticalIds.length === 0
        ? 'Class-critical parts have candidate lines before sourcing begins.'
        : 'Allocate missing class-critical parts to submodules and candidate BoM lines.',
    },
    {
      area: 'duplicate_identity_review',
      verdict: identity.summary.duplicateComponentGroups === 0 ? 'pass' : 'review',
      signal: `${identity.summary.duplicateComponentGroups} duplicate component identity group(s), ${identity.summary.duplicateCriticalComponentGroups} involving critical lines.`,
      passRatio: identity.summary.duplicateComponentGroups === 0 ? 1 : 0.5,
      blockers: identity.groups.slice(0, 12).map(group => `${group.componentWordId}: ${group.lineCount} allocations need shared-vs-separate review.`),
      requiredAction: identity.summary.duplicateComponentGroups === 0
        ? 'No duplicate component identities need sourcing review.'
        : 'Resolve whether duplicate component IDs are shared physical items or separate install locations before pricing.',
    },
    {
      area: 'sourcing_worklist_alignment',
      verdict: worklistRows === unpricedRows ? 'pass' : 'blocked',
      signal: `${worklistRows}/${unpricedRows} unpriced candidate line(s) appear in the sourcing worklist.`,
      passRatio: ratio(worklistRows, unpricedRows),
      blockers: worklistRows === unpricedRows ? [] : ['Sourcing worklist does not cover every unpriced candidate line.'],
      requiredAction: worklistRows === unpricedRows
        ? 'Every unpriced candidate line is visible in the sourcing worklist.'
        : 'Regenerate or repair the sourcing worklist before sourcing starts.',
    },
    {
      area: 'provenance_boundary',
      verdict: provenanceViolationRows.length === 0 ? 'pass' : 'blocked',
      signal: `${dossier.sources.sourcingEvidence.length} source evidence row(s), ${provenance.summary.sourceBackedClaims} source-backed claim(s), ${provenanceViolationRows.length} provenance violation(s).`,
      passRatio: provenanceViolationRows.length === 0 ? 1 : 0,
      blockers: provenanceViolationRows.slice(0, 12).map(row => `${row.lineId}/${row.field}: ${row.nextAction}`),
      requiredAction: provenanceViolationRows.length === 0
        ? 'Candidate sourcing fields remain clean unless admitted evidence supplies them.'
        : 'Remove unprovenanced supplier, manufacturer, MPN, lead-time or cost fields before sourcing admission.',
    },
  ]

  const blockedRows = rows.filter(row => row.verdict === 'blocked')
  const reviewRows = rows.filter(row => row.verdict === 'review')
  const verdict: ComponentCandidateVerdict = bomLines.length === 0
    ? 'no_component_candidates'
    : blockedRows.length > 0
      ? 'component_candidates_blocked'
      : reviewRows.length > 0 ? 'component_candidates_review_required' : 'component_candidates_ready_for_sourcing'

  return {
    verdict,
    summary: {
      rows: rows.length,
      passRows: rows.filter(row => row.verdict === 'pass').length,
      reviewRows: reviewRows.length,
      blockedRows: blockedRows.length,
      passRatio: ratio(rows.filter(row => row.verdict === 'pass').length, rows.length),
      bomLines: bomLines.length,
      componentWordIds: identity.summary.distinctComponentWordIds,
      criticalBomLines: bomLines.filter(line => line.critical).length,
      requiredCriticalParts: requiredCriticalIds.length,
      allocatedCriticalParts: requiredCriticalIds.length - missingCriticalIds.length,
      positiveQuantityLines: bomLines.length - badQuantityLines.length,
      candidateWorklistRows: worklistRows,
      duplicateComponentGroups: identity.summary.duplicateComponentGroups,
      provenanceViolations: provenanceViolationRows.length,
      sourceEvidenceRows: dossier.sources.sourcingEvidence.length,
      readyForSourcing: verdict === 'component_candidates_ready_for_sourcing',
      nextAction: rows.find(row => row.verdict === 'blocked')?.requiredAction ?? rows.find(row => row.verdict === 'review')?.requiredAction ?? null,
    },
    rows,
    blockers: blockedRows.flatMap(row => row.blockers.length > 0 ? row.blockers : [`${row.area}: ${row.signal}`]),
    nextActions: Array.from(new Set(rows.filter(row => row.verdict !== 'pass').map(row => row.requiredAction))),
  }
}

export function renderComponentCandidateGateCsv(gate: ComponentCandidateGate): string {
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

function componentWordIndex(dossier: ProductDossier): Map<string, { role: string }> {
  const words = new Map<string, { role: string }>()
  for (const module of dossier.architecture.modules) {
    for (const subModule of module.subModules) {
      for (const word of subModule.words) {
        if (!words.has(word.id)) words.set(word.id, { role: word.role })
      }
    }
  }
  return words
}

function weakDescription(description: string): boolean {
  const normalised = description.trim().toLowerCase()
  return ['component', 'module', 'system', 'assembly', 'part', 'hardware'].includes(normalised)
}

function normaliseId(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) return 1
  return Math.round((numerator / denominator) * 100) / 100
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
