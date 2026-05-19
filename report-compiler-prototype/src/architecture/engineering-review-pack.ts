import { buildEngineeringAssumptionLedger, type EngineeringAssumptionRow } from './engineering-assumptions'
import { buildEngineeringCalculationLedger } from './engineering-calculations'
import { buildInterfaceContractMatrix } from './interface-contracts'
import { buildModuleReview } from './module-review'
import { buildVerificationEvidenceLedger } from './verification-ledger'
import { buildEngineeringVerificationPlan } from './verification-plan'
import type { ArchitectureReadiness, ProductDossier, SectionIssue, Severity } from '../schema/types'

export type EngineeringReviewQuestionKind =
  | 'module_allocation'
  | 'submodule_allocation'
  | 'interface_contract'
  | 'calculation_envelope'
  | 'assumption_resolution'

export type EngineeringReviewQuestionStatus =
  | 'accepted'
  | 'ready_for_review'
  | 'needs_review'
  | 'blocked'

export interface EngineeringReviewQuestion {
  id: string
  kind: EngineeringReviewQuestionKind
  priority: Severity
  status: EngineeringReviewQuestionStatus
  scope: string
  reviewerQuestion: string
  evidenceRequired: string
  acceptanceCriteria: string[]
  linkedModuleIds: string[]
  linkedSubModuleIds: string[]
  linkedComponentWordIds: string[]
  linkedRequirementIds: string[]
  linkedInterfaceIds: string[]
  linkedCalculationIds: string[]
  blockers: string[]
}

export interface EngineeringReviewPack {
  summary: {
    rows: number
    accepted: number
    readyForReview: number
    needsReview: number
    blocked: number
    moduleQuestions: number
    subModuleQuestions: number
    interfaceQuestions: number
    calculationQuestions: number
    assumptionQuestions: number
  }
  questions: EngineeringReviewQuestion[]
}

export function buildEngineeringReviewPack(
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
  issues: SectionIssue[],
): EngineeringReviewPack {
  const moduleReview = buildModuleReview(dossier, readiness, issues)
  const contracts = buildInterfaceContractMatrix(dossier, readiness)
  const calculations = buildEngineeringCalculationLedger(dossier)
  const assumptions = buildEngineeringAssumptionLedger(dossier, readiness)
  const verificationPlan = buildEngineeringVerificationPlan(dossier, readiness, issues)
  const verificationLedger = buildVerificationEvidenceLedger(verificationPlan, dossier.sources.verificationEvidence)
  const ledgerByActivity = new Map(verificationLedger.rows.map(row => [row.activityId, row]))
  const questions: EngineeringReviewQuestion[] = []

  for (const module of dossier.architecture.modules) {
    const review = moduleReview.modules.find(row => row.moduleId === module.id)
    const activity = ledgerByActivity.get(`design_review:${module.id}`)
    const moduleStatus = acceptedOrPlannedStatus(activity?.ledgerStatus, review?.status === 'attention' ? 'blocked' : 'ready_for_review')
    questions.push({
      id: `module_allocation:${module.id}`,
      kind: 'module_allocation',
      priority: moduleStatus === 'blocked' ? 'blocker' : 'major',
      status: moduleStatus,
      scope: module.displayName,
      reviewerQuestion: `Does ${module.displayName} have the right responsibility boundary, submodule split and interface ownership for this concept?`,
      evidenceRequired: 'Named engineering reviewer sign-off, change request or deferral note against the module allocation.',
      acceptanceCriteria: [
        'Module purpose is coherent and not duplicating another module.',
        'All submodules have a clear engineering role.',
        'Required interfaces are owned by the module or explicitly delegated to submodules.',
      ],
      linkedModuleIds: [module.id],
      linkedSubModuleIds: module.subModules.map(subModule => subModule.id),
      linkedComponentWordIds: module.subModules.flatMap(subModule => subModule.words.map(word => word.id)),
      linkedRequirementIds: review?.requirementIds ?? [],
      linkedInterfaceIds: Array.from(new Set([...module.interfaces, ...module.subModules.flatMap(subModule => subModule.interfaces)])),
      linkedCalculationIds: review?.sanityCheckIds ?? [],
      blockers: review?.issueCodes ?? [],
    })

    for (const subModule of module.subModules) {
      const hasWords = subModule.words.length > 0
      const hasPurpose = subModule.purpose.trim().length > 0
      const plannedStatus: EngineeringReviewQuestionStatus = hasWords && hasPurpose ? 'ready_for_review' : 'blocked'
      const status = acceptedOrPlannedStatus(activity?.ledgerStatus, plannedStatus)
      questions.push({
        id: `submodule_allocation:${module.id}:${subModule.id}`,
        kind: 'submodule_allocation',
        priority: status === 'blocked' ? 'blocker' : 'major',
        status,
        scope: `${module.displayName} / ${subModule.name}`,
        reviewerQuestion: `Do the component candidates and interfaces assigned to ${subModule.name} make engineering sense for its stated purpose?`,
        evidenceRequired: 'Reviewer note confirming the submodule role, component allocation and any missing carriers or capacity checks.',
        acceptanceCriteria: [
          'Submodule purpose is specific enough to guide detailed design.',
          'At least one component candidate is allocated where the submodule represents physical design content.',
          'Interface declarations match the component candidates that would carry them.',
        ],
        linkedModuleIds: [module.id],
        linkedSubModuleIds: [subModule.id],
        linkedComponentWordIds: subModule.words.map(word => word.id),
        linkedRequirementIds: review?.requirementIds ?? [],
        linkedInterfaceIds: subModule.interfaces,
        linkedCalculationIds: review?.sanityCheckIds ?? [],
        blockers: [
          hasPurpose ? undefined : 'Submodule purpose is blank.',
          hasWords ? undefined : 'Submodule has no component candidates.',
        ].filter(isString),
      })
    }
  }

  for (const contract of contracts.requiredContracts) {
    const activityId = `interface_review:${contract.from.moduleId}:${contract.to.moduleId}:${contract.interfaceId}`
    const activity = ledgerByActivity.get(activityId)
    const missingCarrier = contract.from.carrierSubModules.length === 0 || contract.to.carrierSubModules.length === 0
    const plannedStatus: EngineeringReviewQuestionStatus = contract.status === 'missing'
      ? 'blocked'
      : missingCarrier ? 'needs_review' : 'ready_for_review'
    const status = acceptedOrPlannedStatus(activity?.ledgerStatus, plannedStatus)
    questions.push({
      id: `interface_contract:${contract.from.moduleId}:${contract.to.moduleId}:${contract.interfaceId}`,
      kind: 'interface_contract',
      priority: status === 'blocked' ? 'blocker' : 'major',
      status,
      scope: `${contract.from.moduleName} -> ${contract.to.moduleName} via ${contract.interfaceId}`,
      reviewerQuestion: `Is the ${contract.interfaceId} interface between ${contract.from.moduleName} and ${contract.to.moduleName} correctly owned and physically carried?`,
      evidenceRequired: 'Interface-review evidence naming both endpoint owners, carrier submodules, capacity limits and any deferred checks.',
      acceptanceCriteria: [
        'Both endpoint modules declare the interface.',
        'At least one carrier submodule is named on each endpoint.',
        'Capacity, media, protocol or mechanical constraints are identified for the next design pass.',
      ],
      linkedModuleIds: [contract.from.moduleId, contract.to.moduleId],
      linkedSubModuleIds: [
        ...contract.from.carrierSubModules.map(subModule => subModule.subModuleId),
        ...contract.to.carrierSubModules.map(subModule => subModule.subModuleId),
      ],
      linkedComponentWordIds: [
        ...contract.from.carrierSubModules.flatMap(subModule => subModule.componentWordIds),
        ...contract.to.carrierSubModules.flatMap(subModule => subModule.componentWordIds),
      ],
      linkedRequirementIds: [],
      linkedInterfaceIds: [contract.interfaceId],
      linkedCalculationIds: [],
      blockers: contract.notes,
    })
  }

  for (const calculation of calculations.rows) {
    const linkedModuleIds = moduleIdsForRequirements(dossier, calculation.linkedRequirements)
    const acceptedActivity = Array.from(ledgerByActivity.values()).find(row =>
      row.ledgerStatus === 'accepted'
      && row.evidenceKind === 'calculation'
      && linkedModuleIds.includes(row.moduleId)
    )
    const plannedStatus: EngineeringReviewQuestionStatus =
      calculation.status === 'within_envelope' ? 'ready_for_review'
        : calculation.status === 'needs_review' ? 'needs_review'
          : 'blocked'
    const status = acceptedOrPlannedStatus(acceptedActivity?.ledgerStatus, plannedStatus)
    questions.push({
      id: `calculation_envelope:${calculation.id}`,
      kind: 'calculation_envelope',
      priority: status === 'blocked' ? 'blocker' : 'major',
      status,
      scope: calculation.label,
      reviewerQuestion: `Does the ${calculation.label} calculation support the architecture envelope, or does the concept need revision?`,
      evidenceRequired: calculation.evidenceRequired,
      acceptanceCriteria: [
        'Inputs match the parsed brief or a named assumption.',
        'Formula is appropriate for a first-pass engineering screen.',
        'Reviewer either accepts the envelope, supplies corrected inputs or marks the concept for revision.',
      ],
      linkedModuleIds,
      linkedSubModuleIds: [],
      linkedComponentWordIds: [],
      linkedRequirementIds: calculation.linkedRequirements,
      linkedInterfaceIds: [],
      linkedCalculationIds: [calculation.id],
      blockers: status === 'blocked' ? [calculation.interpretation] : [],
    })
  }

  for (const assumption of assumptions.rows.filter(row => row.status !== 'brief_supported')) {
    const linkedModuleIds = Array.from(new Set([
      ...moduleIdsForRequirements(dossier, assumption.linkedRequirements),
      ...assumption.linkedComponents.flatMap(componentWordId => moduleIdsForComponent(dossier, componentWordId)),
    ]))
    const acceptedActivity = acceptedActivityForAssumption(assumption, linkedModuleIds, ledgerByActivity)
    const plannedStatus: EngineeringReviewQuestionStatus = assumption.blocksArchitecture ? 'blocked' : 'needs_review'
    const status = acceptedOrPlannedStatus(acceptedActivity?.ledgerStatus, plannedStatus)
    questions.push({
      id: `assumption_resolution:${assumption.id}`,
      kind: 'assumption_resolution',
      priority: status === 'blocked' ? 'blocker' : 'major',
      status,
      scope: assumption.scope,
      reviewerQuestion: `Can the ${assumption.scope} assumption be accepted for architecture review, or must it be replaced with evidence?`,
      evidenceRequired: assumption.evidenceRequired,
      acceptanceCriteria: [
        'Assumption is explicitly accepted, corrected or rejected by an engineering reviewer.',
        'Any rejected assumption creates a design-change action before BoM or cost review.',
        'Any sourcing-only assumption remains outside engineering sign-off until source evidence is admitted.',
      ],
      linkedModuleIds,
      linkedSubModuleIds: [],
      linkedComponentWordIds: assumption.linkedComponents,
      linkedRequirementIds: assumption.linkedRequirements,
      linkedInterfaceIds: assumption.linkedInterfaces,
      linkedCalculationIds: [],
      blockers: assumption.blocksArchitecture ? [assumption.assumption] : [],
    })
  }

  questions.sort((a, b) => {
    const priorityDelta = priorityRank(a.priority) - priorityRank(b.priority)
    if (priorityDelta !== 0) return priorityDelta
    const statusDelta = statusRank(a.status) - statusRank(b.status)
    if (statusDelta !== 0) return statusDelta
    return a.id.localeCompare(b.id)
  })

  return {
    summary: {
      rows: questions.length,
      accepted: questions.filter(row => row.status === 'accepted').length,
      readyForReview: questions.filter(row => row.status === 'ready_for_review').length,
      needsReview: questions.filter(row => row.status === 'needs_review').length,
      blocked: questions.filter(row => row.status === 'blocked').length,
      moduleQuestions: questions.filter(row => row.kind === 'module_allocation').length,
      subModuleQuestions: questions.filter(row => row.kind === 'submodule_allocation').length,
      interfaceQuestions: questions.filter(row => row.kind === 'interface_contract').length,
      calculationQuestions: questions.filter(row => row.kind === 'calculation_envelope').length,
      assumptionQuestions: questions.filter(row => row.kind === 'assumption_resolution').length,
    },
    questions,
  }
}

export function renderEngineeringReviewPackCsv(pack: EngineeringReviewPack): string {
  const header = [
    'id',
    'kind',
    'priority',
    'status',
    'scope',
    'reviewerQuestion',
    'evidenceRequired',
    'acceptanceCriteria',
    'linkedModuleIds',
    'linkedSubModuleIds',
    'linkedComponentWordIds',
    'linkedRequirementIds',
    'linkedInterfaceIds',
    'linkedCalculationIds',
    'blockers',
  ]
  const rows = pack.questions.map(question => [
    question.id,
    question.kind,
    question.priority,
    question.status,
    question.scope,
    question.reviewerQuestion,
    question.evidenceRequired,
    question.acceptanceCriteria.join(' '),
    question.linkedModuleIds.join('; '),
    question.linkedSubModuleIds.join('; '),
    question.linkedComponentWordIds.join('; '),
    question.linkedRequirementIds.join('; '),
    question.linkedInterfaceIds.join('; '),
    question.linkedCalculationIds.join('; '),
    question.blockers.join(' '),
  ])
  return [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n') + '\n'
}

function acceptedOrPlannedStatus(
  ledgerStatus: string | undefined,
  plannedStatus: EngineeringReviewQuestionStatus,
): EngineeringReviewQuestionStatus {
  if (ledgerStatus === 'accepted') return 'accepted'
  if (ledgerStatus === 'rejected' || ledgerStatus === 'blocked_without_evidence') return 'blocked'
  if (ledgerStatus === 'deferred') return 'needs_review'
  return plannedStatus
}

function acceptedActivityForAssumption(
  assumption: EngineeringAssumptionRow,
  linkedModuleIds: string[],
  ledgerByActivity: Map<string, ReturnType<typeof buildVerificationEvidenceLedger>['rows'][number]>,
): ReturnType<typeof buildVerificationEvidenceLedger>['rows'][number] | undefined {
  if (assumption.category === 'derived_metric' || assumption.category === 'sanity_envelope') {
    return Array.from(ledgerByActivity.values()).find(row =>
      row.ledgerStatus === 'accepted'
      && row.evidenceKind === 'calculation'
      && linkedModuleIds.includes(row.moduleId)
    )
  }
  if (assumption.category === 'interface_closure') {
    return Array.from(ledgerByActivity.values()).find(row =>
      row.ledgerStatus === 'accepted'
      && row.evidenceKind === 'interface_review'
      && assumption.linkedInterfaces.some(interfaceId => row.activityId.endsWith(`:${interfaceId}`))
    )
  }
  if (assumption.category === 'compliance_evidence') {
    const row = ledgerByActivity.get(`compliance_review:${assumption.scope}`)
    return row?.ledgerStatus === 'accepted' ? row : undefined
  }
  if (assumption.category === 'critical_component') {
    return Array.from(ledgerByActivity.values()).find(row =>
      row.ledgerStatus === 'accepted'
      && row.evidenceKind === 'design_review'
      && linkedModuleIds.includes(row.moduleId)
    )
  }
  return undefined
}

function moduleIdsForRequirements(dossier: ProductDossier, requirementIds: string[]): string[] {
  return Array.from(new Set(dossier.requirementTrace
    .filter(trace => requirementIds.includes(trace.requirementId))
    .flatMap(trace => trace.architectureLinks.map(link => link.moduleId))))
}

function moduleIdsForComponent(dossier: ProductDossier, componentWordId: string): string[] {
  return dossier.architecture.modules
    .filter(module => module.subModules.some(subModule => subModule.words.some(word => word.id === componentWordId)))
    .map(module => module.id)
}

function priorityRank(priority: Severity): number {
  if (priority === 'blocker') return 0
  if (priority === 'major') return 1
  return 2
}

function statusRank(status: EngineeringReviewQuestionStatus): number {
  if (status === 'blocked') return 0
  if (status === 'needs_review') return 1
  if (status === 'ready_for_review') return 2
  return 3
}

function isString(value: string | undefined): value is string {
  return typeof value === 'string'
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
