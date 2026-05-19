import { buildEngineeringReviewPack } from '../architecture/engineering-review-pack'
import { buildInterfaceContractMatrix } from '../architecture/interface-contracts'
import { buildVerificationEvidenceLedger } from '../architecture/verification-ledger'
import { buildEngineeringVerificationPlan } from '../architecture/verification-plan'
import type { ArchitectureReadiness, ProductDossier, SectionIssue } from '../schema/types'
import { buildComponentAllocationGate } from './component-allocation-gate'

export type SubModuleEngineeringVerdict =
  | 'submodule_engineering_ready'
  | 'submodule_engineering_review_required'
  | 'submodule_engineering_blocked'
  | 'no_submodules'

export type SubModuleEngineeringRowVerdict = 'pass' | 'review' | 'blocked'

export interface SubModuleEngineeringGateRow {
  id: string
  moduleId: string
  moduleName: string
  subModuleId: string
  subModuleName: string
  verdict: SubModuleEngineeringRowVerdict
  purposePresent: boolean
  componentWordCount: number
  interfaceCount: number
  linkedRequirementCount: number
  criticalComponentCount: number
  duplicateComponentCount: number
  carrierContractCount: number
  missingCarrierContractCount: number
  localOnlyInterfaceCount: number
  reviewQuestions: number
  acceptedReviewQuestions: number
  blockedReviewQuestions: number
  verificationActivities: number
  acceptedVerificationActivities: number
  blockedVerificationActivities: number
  criticalUnpricedLines: number
  passRatio: number
  blockers: string[]
  requiredAction: string
}

export interface SubModuleEngineeringGate {
  verdict: SubModuleEngineeringVerdict
  summary: {
    rows: number
    passRows: number
    reviewRows: number
    blockedRows: number
    passRatio: number
    componentWords: number
    linkedRequirements: number
    carrierContracts: number
    missingCarrierContracts: number
    localOnlyInterfaces: number
    reviewQuestions: number
    acceptedReviewQuestions: number
    blockedReviewQuestions: number
    verificationActivities: number
    acceptedVerificationActivities: number
    blockedVerificationActivities: number
    criticalUnpricedLines: number
  }
  rows: SubModuleEngineeringGateRow[]
  blockers: string[]
  nextActions: string[]
}

export function buildSubModuleEngineeringGate(
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
  issues: SectionIssue[],
): SubModuleEngineeringGate {
  const allocation = buildComponentAllocationGate(dossier)
  const contracts = buildInterfaceContractMatrix(dossier, readiness)
  const reviewPack = buildEngineeringReviewPack(dossier, readiness, issues)
  const verificationPlan = buildEngineeringVerificationPlan(dossier, readiness, issues)
  const verificationLedger = buildVerificationEvidenceLedger(verificationPlan, dossier.sources.verificationEvidence)
  const ledgerByActivity = new Map(verificationLedger.rows.map(row => [row.activityId, row]))

  const rows = dossier.architecture.modules.flatMap(module => module.subModules.map(subModule => {
    const componentWordIds = subModule.words.map(word => word.id)
    const linkedRequirementIds = unique(dossier.requirementTrace
      .filter(trace => trace.architectureLinks.some(link =>
        link.moduleId === module.id && link.subModuleId === subModule.id
      ))
      .map(trace => trace.requirementId))
    const allocationRow = allocation.subModules.find(row =>
      row.moduleId === module.id && row.subModuleId === subModule.id
    )
    const interfaceContracts = contracts.requiredContracts.filter(contract =>
      contractTouchesSubModule(module.id, subModule.id, subModule.interfaces, contract)
    )
    const missingCarrierContracts = interfaceContracts.filter(contract =>
      endpointForModule(contract, module.id)?.carrierSubModules.length === 0
    )
    const localOnlyInterfaces = subModule.interfaces.filter(interfaceId =>
      !contracts.requiredContracts.some(contract =>
        contract.interfaceId === interfaceId
        && (contract.from.moduleId === module.id || contract.to.moduleId === module.id)
      )
    )
    const reviewQuestions = reviewPack.questions.filter(question =>
      question.linkedSubModuleIds.includes(subModule.id)
      || (question.kind === 'module_allocation' && question.linkedModuleIds.includes(module.id))
    )
    const verificationActivities = verificationPlan.activities.filter(activity =>
      activityRelatesToSubModule(activity, module.id, componentWordIds, subModule.interfaces, linkedRequirementIds)
    )
    const verificationRows = verificationActivities.map(activity => ledgerByActivity.get(activity.id)).filter(isPresent)
    const criticalUnpricedLines = dossier.bom.lines.filter(line =>
      line.critical
      && line.unitCostGbp === null
      && componentWordIds.includes(line.componentWordId)
    ).length
    const purposePresent = subModule.purpose.trim().length > 0
    const blockers = [
      purposePresent ? undefined : 'Submodule purpose is blank.',
      componentWordIds.length > 0 ? undefined : 'Submodule has no component candidates.',
      allocationRow?.status === 'blocked' ? allocationRow.blockers.join(' ') : undefined,
      ...missingCarrierContracts.map(contract => `${contract.id}: interface is declared but this endpoint has no carrier submodule.`),
      ...reviewQuestions
        .filter(question => question.status === 'blocked')
        .map(question => `${question.id}: ${question.blockers.join(' ') || question.evidenceRequired}`),
      ...verificationRows
        .filter(row => row.ledgerStatus === 'rejected' || row.ledgerStatus === 'blocked_without_evidence')
        .map(row => `${row.activityId}: ${row.residualAction}`),
    ].filter(isString)
    const reviewSignals = [
      allocationRow?.status === 'review' ? allocationRow.requiredAction : undefined,
      localOnlyInterfaces.length > 0 ? `Review ${localOnlyInterfaces.length} local-only interface declaration(s): ${localOnlyInterfaces.join(', ')}.` : undefined,
      reviewQuestions.some(question => question.status !== 'accepted')
        ? `${reviewQuestions.filter(question => question.status !== 'accepted').length} engineering review question(s) await acceptance.`
        : undefined,
      verificationRows.some(row => row.ledgerStatus !== 'accepted' && row.ledgerStatus !== 'source_evidence_required')
        ? `${verificationRows.filter(row => row.ledgerStatus !== 'accepted' && row.ledgerStatus !== 'source_evidence_required').length} verification activity row(s) await accepted evidence.`
        : undefined,
      criticalUnpricedLines > 0 ? `${criticalUnpricedLines} critical component line(s) still need source-backed cost/manufacturer/MPN evidence.` : undefined,
    ].filter(isString)
    const verdict: SubModuleEngineeringRowVerdict = blockers.length > 0
      ? 'blocked'
      : reviewSignals.length > 0 ? 'review' : 'pass'

    return {
      id: `${module.id}:${subModule.id}`,
      moduleId: module.id,
      moduleName: module.displayName,
      subModuleId: subModule.id,
      subModuleName: subModule.name,
      verdict,
      purposePresent,
      componentWordCount: componentWordIds.length,
      interfaceCount: subModule.interfaces.length,
      linkedRequirementCount: linkedRequirementIds.length,
      criticalComponentCount: allocationRow?.criticalComponentWordIds.length ?? 0,
      duplicateComponentCount: allocationRow?.duplicateComponentWordIds.length ?? 0,
      carrierContractCount: interfaceContracts.length,
      missingCarrierContractCount: missingCarrierContracts.length,
      localOnlyInterfaceCount: localOnlyInterfaces.length,
      reviewQuestions: reviewQuestions.length,
      acceptedReviewQuestions: reviewQuestions.filter(question => question.status === 'accepted').length,
      blockedReviewQuestions: reviewQuestions.filter(question => question.status === 'blocked').length,
      verificationActivities: verificationRows.length,
      acceptedVerificationActivities: verificationRows.filter(row => row.ledgerStatus === 'accepted').length,
      blockedVerificationActivities: verificationRows.filter(row => row.ledgerStatus === 'rejected' || row.ledgerStatus === 'blocked_without_evidence').length,
      criticalUnpricedLines,
      passRatio: rowPassRatio({
        purposePresent,
        componentWordCount: componentWordIds.length,
        missingCarrierContracts: missingCarrierContracts.length,
        reviewQuestions: reviewQuestions.length,
        acceptedReviewQuestions: reviewQuestions.filter(question => question.status === 'accepted').length,
        verificationActivities: verificationRows.filter(row => row.ledgerStatus !== 'source_evidence_required').length,
        acceptedVerificationActivities: verificationRows.filter(row => row.ledgerStatus === 'accepted').length,
        blockers: blockers.length,
      }),
      blockers,
      requiredAction: verdict === 'blocked'
        ? 'Resolve submodule structural blockers before treating this submodule as engineering-review ready.'
        : verdict === 'review'
          ? reviewSignals.join(' ')
          : 'Submodule has no open deterministic engineering blocker.',
    } satisfies SubModuleEngineeringGateRow
  }))

  const blockedRows = rows.filter(row => row.verdict === 'blocked')
  const reviewRows = rows.filter(row => row.verdict === 'review')
  const verdict: SubModuleEngineeringVerdict = rows.length === 0
    ? 'no_submodules'
    : blockedRows.length > 0
      ? 'submodule_engineering_blocked'
      : reviewRows.length > 0 ? 'submodule_engineering_review_required' : 'submodule_engineering_ready'

  return {
    verdict,
    summary: {
      rows: rows.length,
      passRows: rows.filter(row => row.verdict === 'pass').length,
      reviewRows: reviewRows.length,
      blockedRows: blockedRows.length,
      passRatio: ratio(rows.filter(row => row.verdict === 'pass').length, rows.length),
      componentWords: rows.reduce((sum, row) => sum + row.componentWordCount, 0),
      linkedRequirements: rows.reduce((sum, row) => sum + row.linkedRequirementCount, 0),
      carrierContracts: rows.reduce((sum, row) => sum + row.carrierContractCount, 0),
      missingCarrierContracts: rows.reduce((sum, row) => sum + row.missingCarrierContractCount, 0),
      localOnlyInterfaces: rows.reduce((sum, row) => sum + row.localOnlyInterfaceCount, 0),
      reviewQuestions: rows.reduce((sum, row) => sum + row.reviewQuestions, 0),
      acceptedReviewQuestions: rows.reduce((sum, row) => sum + row.acceptedReviewQuestions, 0),
      blockedReviewQuestions: rows.reduce((sum, row) => sum + row.blockedReviewQuestions, 0),
      verificationActivities: rows.reduce((sum, row) => sum + row.verificationActivities, 0),
      acceptedVerificationActivities: rows.reduce((sum, row) => sum + row.acceptedVerificationActivities, 0),
      blockedVerificationActivities: rows.reduce((sum, row) => sum + row.blockedVerificationActivities, 0),
      criticalUnpricedLines: rows.reduce((sum, row) => sum + row.criticalUnpricedLines, 0),
    },
    rows,
    blockers: blockedRows.flatMap(row => row.blockers.map(blocker => `${row.id}: ${blocker}`)),
    nextActions: Array.from(new Set(rows.filter(row => row.verdict !== 'pass').map(row => row.requiredAction))),
  }
}

export function renderSubModuleEngineeringGateCsv(gate: SubModuleEngineeringGate): string {
  const header = [
    'id',
    'moduleId',
    'moduleName',
    'subModuleId',
    'subModuleName',
    'verdict',
    'purposePresent',
    'componentWordCount',
    'interfaceCount',
    'linkedRequirementCount',
    'criticalComponentCount',
    'duplicateComponentCount',
    'carrierContractCount',
    'missingCarrierContractCount',
    'localOnlyInterfaceCount',
    'reviewQuestions',
    'acceptedReviewQuestions',
    'blockedReviewQuestions',
    'verificationActivities',
    'acceptedVerificationActivities',
    'blockedVerificationActivities',
    'criticalUnpricedLines',
    'passRatio',
    'blockers',
    'requiredAction',
  ]
  const rows = gate.rows.map(row => [
    row.id,
    row.moduleId,
    row.moduleName,
    row.subModuleId,
    row.subModuleName,
    row.verdict,
    row.purposePresent ? 'yes' : 'no',
    String(row.componentWordCount),
    String(row.interfaceCount),
    String(row.linkedRequirementCount),
    String(row.criticalComponentCount),
    String(row.duplicateComponentCount),
    String(row.carrierContractCount),
    String(row.missingCarrierContractCount),
    String(row.localOnlyInterfaceCount),
    String(row.reviewQuestions),
    String(row.acceptedReviewQuestions),
    String(row.blockedReviewQuestions),
    String(row.verificationActivities),
    String(row.acceptedVerificationActivities),
    String(row.blockedVerificationActivities),
    String(row.criticalUnpricedLines),
    String(row.passRatio),
    row.blockers.join(' '),
    row.requiredAction,
  ])
  return [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n') + '\n'
}

type RequiredContract = ReturnType<typeof buildInterfaceContractMatrix>['requiredContracts'][number]
type VerificationActivity = ReturnType<typeof buildEngineeringVerificationPlan>['activities'][number]

function contractTouchesSubModule(
  moduleId: string,
  subModuleId: string,
  subModuleInterfaces: string[],
  contract: RequiredContract,
): boolean {
  return carrierIds(contract).includes(subModuleId)
    || (
      subModuleInterfaces.includes(contract.interfaceId)
      && (contract.from.moduleId === moduleId || contract.to.moduleId === moduleId)
    )
}

function endpointForModule(contract: RequiredContract, moduleId: string): RequiredContract['from'] | RequiredContract['to'] | undefined {
  if (contract.from.moduleId === moduleId) return contract.from
  if (contract.to.moduleId === moduleId) return contract.to
  return undefined
}

function carrierIds(contract: RequiredContract): string[] {
  return [
    ...contract.from.carrierSubModules.map(row => row.subModuleId),
    ...contract.to.carrierSubModules.map(row => row.subModuleId),
  ]
}

function activityRelatesToSubModule(
  activity: VerificationActivity,
  moduleId: string,
  componentWordIds: string[],
  interfaceIds: string[],
  requirementIds: string[],
): boolean {
  if (activity.id === `design_review:${moduleId}`) return true
  if (activity.moduleId === moduleId && activity.componentWordIds.length === 0 && activity.interfaceIds.length === 0 && activity.requirementIds.length === 0) return true
  if (activity.moduleId === moduleId && intersects(activity.requirementIds, requirementIds)) return true
  if (intersects(activity.componentWordIds, componentWordIds)) return true
  if (intersects(activity.interfaceIds, interfaceIds) && activity.moduleId.includes(moduleId)) return true
  return false
}

function rowPassRatio(input: {
  purposePresent: boolean
  componentWordCount: number
  missingCarrierContracts: number
  reviewQuestions: number
  acceptedReviewQuestions: number
  verificationActivities: number
  acceptedVerificationActivities: number
  blockers: number
}): number {
  const checks = [
    input.purposePresent,
    input.componentWordCount > 0,
    input.missingCarrierContracts === 0,
    input.reviewQuestions === 0 || input.acceptedReviewQuestions === input.reviewQuestions,
    input.verificationActivities === 0 || input.acceptedVerificationActivities === input.verificationActivities,
    input.blockers === 0,
  ]
  return ratio(checks.filter(Boolean).length, checks.length)
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b))
}

function intersects(left: string[], right: string[]): boolean {
  return left.some(value => right.includes(value))
}

function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) return 0
  return Math.round((numerator / denominator) * 10000) / 10000
}

function isString(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0
}

function isPresent<T>(value: T | undefined): value is T {
  return value !== undefined
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
