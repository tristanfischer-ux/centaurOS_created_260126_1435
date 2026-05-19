import { buildEngineeringCalculationLedger } from '../architecture/engineering-calculations'
import { buildVerificationEvidenceLedger } from '../architecture/verification-ledger'
import { buildEngineeringVerificationPlan } from '../architecture/verification-plan'
import type { ArchitectureReadiness, ProductDossier, ProvenanceRef, SectionIssue } from '../schema/types'
import { buildBomProvenanceManifest } from '../sourcing/provenance-manifest'

export type ClaimKind =
  | 'brief_requirement'
  | 'headline_metric'
  | 'engineering_calculation'
  | 'module_allocation'
  | 'submodule_allocation'
  | 'component_candidate'
  | 'bom_source_field'
  | 'regulatory_standard'
  | 'risk_hazard'

export type ClaimBasis =
  | 'brief'
  | 'class_pack'
  | 'generated_model'
  | 'calculation'
  | 'source_evidence'
  | 'reviewer_evidence'
  | 'assumption'

export type ClaimStatus =
  | 'brief_supplied'
  | 'accepted'
  | 'source_backed'
  | 'calculated_needs_review'
  | 'generated_needs_review'
  | 'source_required'
  | 'blocked'

export interface ClaimLedgerRow {
  id: string
  kind: ClaimKind
  status: ClaimStatus
  basis: ClaimBasis
  scope: string
  claim: string
  provenanceRefs: string[]
  sourceRefs: string[]
  reviewerEvidenceRefs: string[]
  linkedRequirementIds: string[]
  linkedModuleIds: string[]
  linkedComponentWordIds: string[]
  blocksBom: boolean
  blocksPublish: boolean
  nextAction: string
}

export interface ClaimLedger {
  summary: {
    rows: number
    briefSupplied: number
    accepted: number
    sourceBacked: number
    calculatedNeedsReview: number
    generatedNeedsReview: number
    sourceRequired: number
    blocked: number
    blocksBom: number
    blocksPublish: number
  }
  rows: ClaimLedgerRow[]
}

export function buildClaimLedger(
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
  issues: SectionIssue[],
): ClaimLedger {
  const verificationPlan = buildEngineeringVerificationPlan(dossier, readiness, issues)
  const verificationLedger = buildVerificationEvidenceLedger(verificationPlan, dossier.sources.verificationEvidence)
  const acceptedDesignReviewByModule = new Map<string, string[]>()
  const acceptedCalculationByModule = new Map<string, string[]>()
  const acceptedComplianceByActivity = new Map<string, string[]>()
  for (const row of verificationLedger.rows) {
    if (row.ledgerStatus !== 'accepted') continue
    const ref = row.evidenceRef ?? row.activityId
    if (row.evidenceKind === 'design_review') {
      const refs = acceptedDesignReviewByModule.get(row.moduleId) ?? []
      refs.push(ref)
      acceptedDesignReviewByModule.set(row.moduleId, refs)
    }
    if (row.evidenceKind === 'calculation') {
      const refs = acceptedCalculationByModule.get(row.moduleId) ?? []
      refs.push(ref)
      acceptedCalculationByModule.set(row.moduleId, refs)
    }
    if (row.evidenceKind === 'compliance_review') {
      acceptedComplianceByActivity.set(row.activityId, [ref])
    }
  }

  const calculationLedger = buildEngineeringCalculationLedger(dossier)
  const bomManifest = buildBomProvenanceManifest(dossier)
  const rows: ClaimLedgerRow[] = [
    ...dossier.brief.requirements.map(requirement => ({
      id: `brief_requirement:${requirement.id}`,
      kind: 'brief_requirement' as const,
      status: 'brief_supplied' as const,
      basis: 'brief' as const,
      scope: requirement.label,
      claim: `${requirement.label} = ${requirement.value}${requirement.unit ? ` ${requirement.unit}` : ''}.`,
      provenanceRefs: provenanceLabels([requirement.source]),
      sourceRefs: [],
      reviewerEvidenceRefs: [],
      linkedRequirementIds: [requirement.id],
      linkedModuleIds: moduleIdsForRequirements(dossier, [requirement.id]),
      linkedComponentWordIds: componentIdsForRequirements(dossier, [requirement.id]),
      blocksBom: false,
      blocksPublish: false,
      nextAction: 'Confirm requirement value, tolerance and acceptance condition with the project owner.',
    })),
    ...dossier.keyMetrics.map(metric => {
      const isCostMetric = metric.id.includes('capex') || metric.id.includes('opex')
      const linkedRequirementIds = requirementsForMetric(dossier, metric.id)
      const acceptedCalculationRefs = acceptedCalculationRefsForRequirements(dossier, linkedRequirementIds, acceptedCalculationByModule)
      const sourcedCostRefs = dossier.sources.sourcingEvidence.map(record => record.evidence.ref)
      const status: ClaimStatus = isCostMetric && dossier.sourcing.admission.unpricedCriticalLines > 0
        ? 'source_required'
        : isCostMetric && sourcedCostRefs.length > 0
          ? 'source_backed'
          : acceptedCalculationRefs.length > 0 ? 'accepted' : 'calculated_needs_review'
      return {
        id: `headline_metric:${metric.id}`,
        kind: 'headline_metric' as const,
        status,
        basis: status === 'accepted'
          ? 'reviewer_evidence' as const
          : status === 'source_backed' ? 'source_evidence' as const : metric.formula ? 'calculation' as const : 'assumption' as const,
        scope: metric.label,
        claim: `${metric.label} = ${metric.value}${metric.unit ? ` ${metric.unit}` : ''}.`,
        provenanceRefs: provenanceLabels(metric.provenance),
        sourceRefs: status === 'source_backed' ? sourcedCostRefs : [],
        reviewerEvidenceRefs: acceptedCalculationRefs,
        linkedRequirementIds,
        linkedModuleIds: [],
        linkedComponentWordIds: [],
        blocksBom: isCostMetric && dossier.sourcing.admission.unpricedCriticalLines > 0,
        blocksPublish: status !== 'accepted' && status !== 'source_backed',
        nextAction: status === 'accepted' || status === 'source_backed'
          ? 'Keep accepted calculation or source evidence attached to this metric.'
          : isCostMetric
          ? 'Admit source-backed BoM costs before treating this cost metric as a claim.'
          : 'Review the formula, input values and operating envelope before treating this metric as accepted.',
      }
    }),
    ...calculationLedger.rows.map(calculation => {
      const acceptedRefs = acceptedCalculationRefsForRequirements(dossier, calculation.linkedRequirements, acceptedCalculationByModule)
      const status: ClaimStatus = calculation.status === 'outside_envelope' || calculation.status === 'blocked'
        ? 'blocked'
        : acceptedRefs.length > 0 ? 'accepted' : 'calculated_needs_review'
      return {
        id: `engineering_calculation:${calculation.id}`,
        kind: 'engineering_calculation' as const,
        status,
        basis: status === 'accepted' ? 'reviewer_evidence' as const : 'calculation' as const,
        scope: calculation.label,
        claim: `${calculation.label}: ${calculation.result === null ? 'not calculated' : `${calculation.result} ${calculation.unit}`} using ${calculation.formula}.`,
        provenanceRefs: [],
        sourceRefs: [],
        reviewerEvidenceRefs: acceptedRefs,
        linkedRequirementIds: calculation.linkedRequirements,
        linkedModuleIds: moduleIdsForRequirements(dossier, calculation.linkedRequirements),
        linkedComponentWordIds: componentIdsForRequirements(dossier, calculation.linkedRequirements),
        blocksBom: calculation.status === 'outside_envelope' || calculation.status === 'blocked',
        blocksPublish: status !== 'accepted' && calculation.status !== 'within_envelope',
        nextAction: status === 'accepted'
          ? 'Keep reviewer evidence attached to this calculation claim.'
          : calculation.evidenceRequired,
      }
    }),
    ...dossier.architecture.modules.flatMap(module => {
      const acceptedRefs = acceptedDesignReviewByModule.get(module.id) ?? []
      const status = acceptedRefs.length > 0 ? 'accepted' as const : 'generated_needs_review' as const
      return [
        {
          id: `module_allocation:${module.id}`,
          kind: 'module_allocation' as const,
          status,
          basis: acceptedRefs.length > 0 ? 'reviewer_evidence' as const : 'generated_model' as const,
          scope: module.displayName,
          claim: `${module.displayName} is a top-level functional module: ${module.purpose}`,
          provenanceRefs: [],
          sourceRefs: [],
          reviewerEvidenceRefs: acceptedRefs,
          linkedRequirementIds: requirementsForModule(dossier, module.id),
          linkedModuleIds: [module.id],
          linkedComponentWordIds: module.subModules.flatMap(subModule => subModule.words.map(word => word.id)),
          blocksBom: false,
          blocksPublish: acceptedRefs.length === 0,
          nextAction: acceptedRefs.length > 0
            ? 'Keep reviewer evidence attached to this module claim.'
            : 'Accept, correct or reject the module allocation through engineering review.',
        },
        ...module.subModules.map(subModule => ({
          id: `submodule_allocation:${module.id}:${subModule.id}`,
          kind: 'submodule_allocation' as const,
          status,
          basis: acceptedRefs.length > 0 ? 'reviewer_evidence' as const : 'generated_model' as const,
          scope: `${module.displayName} / ${subModule.name}`,
          claim: `${subModule.name} is allocated under ${module.displayName}: ${subModule.purpose}`,
          provenanceRefs: [],
          sourceRefs: [],
          reviewerEvidenceRefs: acceptedRefs,
          linkedRequirementIds: requirementsForModule(dossier, module.id),
          linkedModuleIds: [module.id],
          linkedComponentWordIds: subModule.words.map(word => word.id),
          blocksBom: false,
          blocksPublish: acceptedRefs.length === 0,
          nextAction: acceptedRefs.length > 0
            ? 'Keep reviewer evidence attached to this submodule allocation claim.'
            : 'Review component candidates and interface carriers for this submodule.',
        })),
      ]
    }),
    ...dossier.bom.lines.map(line => {
      const linkedModuleIds = modulesForComponent(dossier, line.componentWordId)
      const acceptedRefs = acceptedRefsForModules(linkedModuleIds, acceptedDesignReviewByModule)
      const sourceRefs = dossier.sources.sourcingEvidence
        .filter(record => record.componentWordId === line.componentWordId)
        .map(record => record.evidence.ref)
      const status: ClaimStatus = line.critical && line.unitCostGbp === null
        ? 'source_required'
        : acceptedRefs.length > 0 ? 'accepted' : 'generated_needs_review'
      return {
        id: `component_candidate:${line.id}`,
        kind: 'component_candidate' as const,
        status,
        basis: status === 'accepted' ? 'reviewer_evidence' as const : 'generated_model' as const,
        scope: line.description,
        claim: `${line.description} is an architecture-derived component candidate with quantity ${line.quantity.value} ${line.quantity.unit}.`,
        provenanceRefs: provenanceLabels(line.provenance),
        sourceRefs,
        reviewerEvidenceRefs: acceptedRefs,
        linkedRequirementIds: requirementsForComponent(dossier, line.componentWordId),
        linkedModuleIds,
        linkedComponentWordIds: [line.componentWordId],
        blocksBom: line.critical && line.unitCostGbp === null,
        blocksPublish: status !== 'accepted',
        nextAction: status === 'accepted'
          ? 'Keep reviewer evidence attached to this component-candidate allocation.'
          : line.critical && line.unitCostGbp === null
            ? 'Admit source-backed supplier, manufacturer, MPN, unit cost and lead-time evidence through sourcing intake.'
            : 'Review whether this is a unique physical item, shared component or separate installation instance.',
      }
    }),
    ...bomManifest.rows
      .filter(row => row.status !== 'not_claimed')
      .map(row => ({
        id: `bom_source_field:${row.lineId}:${row.field}`,
        kind: 'bom_source_field' as const,
        status: row.status === 'source_backed' ? 'source_backed' as const : row.status === 'provenance_violation' ? 'blocked' as const : 'source_required' as const,
        basis: row.status === 'source_backed' ? 'source_evidence' as const : 'assumption' as const,
        scope: `${row.description} / ${row.field}`,
        claim: row.value ? `${row.field} = ${row.value}.` : `${row.field} is required but not source-backed.`,
        provenanceRefs: [],
        sourceRefs: row.sourceRef ? [row.sourceRef] : [],
        reviewerEvidenceRefs: [],
        linkedRequirementIds: requirementsForComponent(dossier, row.componentWordId),
        linkedModuleIds: modulesForComponent(dossier, row.componentWordId),
        linkedComponentWordIds: [row.componentWordId],
        blocksBom: row.status !== 'source_backed',
        blocksPublish: row.status !== 'source_backed',
        nextAction: row.nextAction,
      })),
    ...dossier.regulatory.standards.map(standard => {
      const acceptedRefs = acceptedComplianceByActivity.get(`compliance_review:${standard.id}`) ?? []
      return {
        id: `regulatory_standard:${standard.id}`,
        kind: 'regulatory_standard' as const,
        status: acceptedRefs.length > 0 ? 'accepted' as const : 'generated_needs_review' as const,
        basis: acceptedRefs.length > 0 ? 'reviewer_evidence' as const : 'class_pack' as const,
        scope: standard.id,
        claim: `${standard.id}: ${standard.title} is relevant in ${standard.jurisdiction}.`,
        provenanceRefs: provenanceLabels(standard.provenance),
        sourceRefs: [],
        reviewerEvidenceRefs: acceptedRefs,
        linkedRequirementIds: [],
        linkedModuleIds: [],
        linkedComponentWordIds: [],
        blocksBom: false,
        blocksPublish: acceptedRefs.length === 0,
        nextAction: acceptedRefs.length > 0
          ? 'Keep compliance reviewer evidence attached to this standard.'
          : standard.evidenceRequired,
      }
    }),
    ...dossier.risks.fmea.map((risk, index) => {
      const acceptedRefs = acceptedComplianceByActivity.get(`risk_review:${index + 1}`) ?? []
      return {
        id: `risk_hazard:${index + 1}`,
        kind: 'risk_hazard' as const,
        status: acceptedRefs.length > 0 ? 'accepted' as const : 'generated_needs_review' as const,
        basis: acceptedRefs.length > 0 ? 'reviewer_evidence' as const : 'class_pack' as const,
        scope: risk.hazard,
        claim: `${risk.hazard} has provisional RPN ${risk.severity * risk.occurrence * risk.detection} with mitigation: ${risk.mitigation}`,
        provenanceRefs: [],
        sourceRefs: [],
        reviewerEvidenceRefs: acceptedRefs,
        linkedRequirementIds: [],
        linkedModuleIds: [],
        linkedComponentWordIds: [],
        blocksBom: false,
        blocksPublish: acceptedRefs.length === 0,
        nextAction: acceptedRefs.length > 0
          ? 'Keep risk reviewer evidence attached to this risk claim.'
          : 'Review severity, occurrence, detection and mitigation with a domain reviewer before publication.',
      }
    }),
  ]

  rows.sort((a, b) => {
    const statusDelta = statusRank(a.status) - statusRank(b.status)
    if (statusDelta !== 0) return statusDelta
    return a.id.localeCompare(b.id)
  })

  return {
    summary: {
      rows: rows.length,
      briefSupplied: rows.filter(row => row.status === 'brief_supplied').length,
      accepted: rows.filter(row => row.status === 'accepted').length,
      sourceBacked: rows.filter(row => row.status === 'source_backed').length,
      calculatedNeedsReview: rows.filter(row => row.status === 'calculated_needs_review').length,
      generatedNeedsReview: rows.filter(row => row.status === 'generated_needs_review').length,
      sourceRequired: rows.filter(row => row.status === 'source_required').length,
      blocked: rows.filter(row => row.status === 'blocked').length,
      blocksBom: rows.filter(row => row.blocksBom).length,
      blocksPublish: rows.filter(row => row.blocksPublish).length,
    },
    rows,
  }
}

export function renderClaimLedgerCsv(ledger: ClaimLedger): string {
  const header = [
    'id',
    'kind',
    'status',
    'basis',
    'scope',
    'claim',
    'provenanceRefs',
    'sourceRefs',
    'reviewerEvidenceRefs',
    'linkedRequirementIds',
    'linkedModuleIds',
    'linkedComponentWordIds',
    'blocksBom',
    'blocksPublish',
    'nextAction',
  ]
  const rows = ledger.rows.map(row => [
    row.id,
    row.kind,
    row.status,
    row.basis,
    row.scope,
    row.claim,
    row.provenanceRefs.join('; '),
    row.sourceRefs.join('; '),
    row.reviewerEvidenceRefs.join('; '),
    row.linkedRequirementIds.join('; '),
    row.linkedModuleIds.join('; '),
    row.linkedComponentWordIds.join('; '),
    String(row.blocksBom),
    String(row.blocksPublish),
    row.nextAction,
  ])
  return [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n') + '\n'
}

function provenanceLabels(refs: ProvenanceRef[]): string[] {
  return refs.map(ref => `${ref.kind}:${ref.ref}${ref.quote ? ` "${ref.quote}"` : ''}`)
}

function requirementsForMetric(dossier: ProductDossier, metricId: string): string[] {
  return dossier.requirementTrace
    .filter(trace => trace.keyMetricIds.includes(metricId))
    .map(trace => trace.requirementId)
}

function requirementsForModule(dossier: ProductDossier, moduleId: string): string[] {
  return dossier.requirementTrace
    .filter(trace => trace.architectureLinks.some(link => link.moduleId === moduleId))
    .map(trace => trace.requirementId)
}

function requirementsForComponent(dossier: ProductDossier, componentWordId: string): string[] {
  return dossier.requirementTrace
    .filter(trace => trace.architectureLinks.some(link => link.componentWordId === componentWordId))
    .map(trace => trace.requirementId)
}

function moduleIdsForRequirements(dossier: ProductDossier, requirementIds: string[]): string[] {
  return unique(dossier.requirementTrace
    .filter(trace => requirementIds.includes(trace.requirementId))
    .flatMap(trace => trace.architectureLinks.map(link => link.moduleId)))
}

function componentIdsForRequirements(dossier: ProductDossier, requirementIds: string[]): string[] {
  return unique(dossier.requirementTrace
    .filter(trace => requirementIds.includes(trace.requirementId))
    .flatMap(trace => trace.architectureLinks.map(link => link.componentWordId).filter(isString)))
}

function modulesForComponent(dossier: ProductDossier, componentWordId: string): string[] {
  return unique(dossier.architecture.modules
    .filter(module => module.subModules.some(subModule => subModule.words.some(word => word.id === componentWordId)))
    .map(module => module.id))
}

function acceptedCalculationRefsForRequirements(
  dossier: ProductDossier,
  requirementIds: string[],
  acceptedCalculationByModule: Map<string, string[]>,
): string[] {
  return acceptedRefsForModules(moduleIdsForRequirements(dossier, requirementIds), acceptedCalculationByModule)
}

function acceptedRefsForModules(moduleIds: string[], acceptedByModule: Map<string, string[]>): string[] {
  return unique(moduleIds.flatMap(moduleId => acceptedByModule.get(moduleId) ?? []))
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values))
}

function isString(value: string | undefined): value is string {
  return typeof value === 'string'
}

function statusRank(status: ClaimStatus): number {
  if (status === 'blocked') return 0
  if (status === 'source_required') return 1
  if (status === 'generated_needs_review') return 2
  if (status === 'calculated_needs_review') return 3
  if (status === 'brief_supplied') return 4
  if (status === 'source_backed') return 5
  return 6
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
