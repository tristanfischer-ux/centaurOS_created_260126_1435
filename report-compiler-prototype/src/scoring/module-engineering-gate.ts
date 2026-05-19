import { buildEngineeringAssumptionLedger } from '../architecture/engineering-assumptions'
import { buildEngineeringCalculationLedger } from '../architecture/engineering-calculations'
import { buildEngineeringReviewPack } from '../architecture/engineering-review-pack'
import { buildInterfaceContractMatrix } from '../architecture/interface-contracts'
import type { ArchitectureReadiness, ProductDossier, SectionIssue } from '../schema/types'
import { buildComponentAllocationGate } from './component-allocation-gate'

export type ModuleEngineeringVerdict =
  | 'module_engineering_ready'
  | 'module_engineering_review_required'
  | 'module_engineering_blocked'
  | 'no_modules'

export type ModuleEngineeringRowVerdict = 'pass' | 'review' | 'blocked'

export interface ModuleEngineeringGateRow {
  moduleId: string
  moduleName: string
  verdict: ModuleEngineeringRowVerdict
  subModuleCount: number
  componentWordCount: number
  interfaceCount: number
  linkedRequirementCount: number
  requiredInterfaceContracts: number
  carrierCompleteInterfaceContracts: number
  blockedAllocationRows: number
  reviewQuestions: number
  acceptedReviewQuestions: number
  blockedReviewQuestions: number
  linkedCalculationRows: number
  assumptionReviewRows: number
  criticalBomLines: number
  unpricedCriticalLines: number
  passRatio: number
  blockers: string[]
  requiredAction: string
}

export interface ModuleEngineeringGate {
  verdict: ModuleEngineeringVerdict
  summary: {
    modules: number
    passRows: number
    reviewRows: number
    blockedRows: number
    passRatio: number
    subModules: number
    componentWords: number
    linkedRequirements: number
    requiredInterfaceContracts: number
    carrierCompleteInterfaceContracts: number
    reviewQuestions: number
    acceptedReviewQuestions: number
    blockedReviewQuestions: number
    linkedCalculationRows: number
    assumptionReviewRows: number
    criticalBomLines: number
    unpricedCriticalLines: number
    modulesWithCriticalSourcingBlocks: number
  }
  modules: ModuleEngineeringGateRow[]
  blockers: string[]
  nextActions: string[]
}

export function buildModuleEngineeringGate(
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
  issues: SectionIssue[],
): ModuleEngineeringGate {
  const allocation = buildComponentAllocationGate(dossier)
  const contracts = buildInterfaceContractMatrix(dossier, readiness)
  const reviewPack = buildEngineeringReviewPack(dossier, readiness, issues)
  const calculations = buildEngineeringCalculationLedger(dossier)
  const assumptions = buildEngineeringAssumptionLedger(dossier, readiness)

  const rows = dossier.architecture.modules.map(module => {
    const moduleRequirementIds = new Set(dossier.requirementTrace
      .filter(trace => trace.architectureLinks.some(link => link.moduleId === module.id))
      .map(trace => trace.requirementId))
    const moduleContracts = contracts.requiredContracts.filter(contract =>
      contract.from.moduleId === module.id || contract.to.moduleId === module.id
    )
    const carrierCompleteInterfaceContracts = moduleContracts.filter(contract =>
      contract.status === 'present'
      && contract.from.carrierSubModules.length > 0
      && contract.to.carrierSubModules.length > 0
    ).length
    const allocationRows = allocation.subModules.filter(row => row.moduleId === module.id)
    const questions = reviewPack.questions.filter(question => question.linkedModuleIds.includes(module.id))
    const linkedCalculations = calculations.rows.filter(calculation =>
      calculation.linkedRequirements.some(requirementId => moduleRequirementIds.has(requirementId))
    )
    const assumptionRows = assumptions.rows.filter(assumption =>
      assumption.status !== 'brief_supported'
      && (
        assumption.linkedRequirements.some(requirementId => moduleRequirementIds.has(requirementId))
        || assumption.linkedComponents.some(componentWordId => moduleHasComponent(module, componentWordId))
        || assumption.linkedInterfaces.some(interfaceId => module.interfaces.includes(interfaceId))
      )
    )
    const bomLines = dossier.bom.lines.filter(line => line.id.startsWith(`${module.id}_`))
    const unpricedCriticalLines = bomLines.filter(line => line.critical && line.unitCostGbp === null).length
    const structuralBlockers = [
      module.subModules.length === 0 ? 'Module has no submodules.' : undefined,
      componentWordCount(module) === 0 ? 'Module has no component candidates.' : undefined,
      ...moduleContracts
        .filter(contract => contract.status === 'missing')
        .map(contract => `${contract.id}: required interface contract is missing.`),
      ...moduleContracts
        .filter(contract => contract.status === 'present' && (contract.from.carrierSubModules.length === 0 || contract.to.carrierSubModules.length === 0))
        .map(contract => `${contract.id}: required interface lacks carrier submodules on both endpoints.`),
      ...allocationRows
        .filter(row => row.status === 'blocked')
        .map(row => `${row.id}: ${row.blockers.join(' ')}`),
      ...questions
        .filter(question => question.status === 'blocked')
        .map(question => `${question.id}: ${question.blockers.join(' ') || question.evidenceRequired}`),
      ...issues
        .filter(issue => issue.section !== 'bom' && issueTouchesModule(issue, module.id) && (issue.severity === 'blocker' || issue.severity === 'major'))
        .map(issue => `${issue.code}: ${issue.message}`),
    ].filter(isString)

    const reviewSignals = [
      unpricedCriticalLines > 0 ? `${unpricedCriticalLines} critical BoM line(s) need source-backed cost evidence.` : undefined,
      questions.some(question => question.status === 'needs_review' || question.status === 'ready_for_review')
        ? `${questions.filter(question => question.status !== 'accepted').length} engineering review question(s) await acceptance.`
        : undefined,
      assumptionRows.length > 0 ? `${assumptionRows.length} assumption row(s) need review or source evidence.` : undefined,
    ].filter(isString)
    const verdict: ModuleEngineeringRowVerdict = structuralBlockers.length > 0
      ? 'blocked'
      : reviewSignals.length > 0 ? 'review' : 'pass'

    return {
      moduleId: module.id,
      moduleName: module.displayName,
      verdict,
      subModuleCount: module.subModules.length,
      componentWordCount: componentWordCount(module),
      interfaceCount: new Set([...module.interfaces, ...module.subModules.flatMap(subModule => subModule.interfaces)]).size,
      linkedRequirementCount: moduleRequirementIds.size,
      requiredInterfaceContracts: moduleContracts.length,
      carrierCompleteInterfaceContracts,
      blockedAllocationRows: allocationRows.filter(row => row.status === 'blocked').length,
      reviewQuestions: questions.length,
      acceptedReviewQuestions: questions.filter(question => question.status === 'accepted').length,
      blockedReviewQuestions: questions.filter(question => question.status === 'blocked').length,
      linkedCalculationRows: linkedCalculations.length,
      assumptionReviewRows: assumptionRows.length,
      criticalBomLines: bomLines.filter(line => line.critical).length,
      unpricedCriticalLines,
      passRatio: modulePassRatio(
        module.subModules.length,
        componentWordCount(module),
        moduleRequirementIds.size,
        moduleContracts.length,
        carrierCompleteInterfaceContracts,
        questions.length,
        questions.filter(question => question.status === 'accepted').length,
        structuralBlockers.length,
      ),
      blockers: structuralBlockers,
      requiredAction: verdict === 'blocked'
        ? 'Resolve structural module blockers before treating this module as engineering-review ready.'
        : verdict === 'review'
          ? reviewSignals.join(' ')
          : 'Module has no open deterministic engineering blocker.',
    } satisfies ModuleEngineeringGateRow
  })

  const blockedRows = rows.filter(row => row.verdict === 'blocked')
  const reviewRows = rows.filter(row => row.verdict === 'review')
  const verdict: ModuleEngineeringVerdict = rows.length === 0
    ? 'no_modules'
    : blockedRows.length > 0
      ? 'module_engineering_blocked'
      : reviewRows.length > 0 ? 'module_engineering_review_required' : 'module_engineering_ready'

  return {
    verdict,
    summary: {
      modules: rows.length,
      passRows: rows.filter(row => row.verdict === 'pass').length,
      reviewRows: reviewRows.length,
      blockedRows: blockedRows.length,
      passRatio: ratio(rows.filter(row => row.verdict === 'pass').length, rows.length),
      subModules: rows.reduce((sum, row) => sum + row.subModuleCount, 0),
      componentWords: rows.reduce((sum, row) => sum + row.componentWordCount, 0),
      linkedRequirements: rows.reduce((sum, row) => sum + row.linkedRequirementCount, 0),
      requiredInterfaceContracts: rows.reduce((sum, row) => sum + row.requiredInterfaceContracts, 0),
      carrierCompleteInterfaceContracts: rows.reduce((sum, row) => sum + row.carrierCompleteInterfaceContracts, 0),
      reviewQuestions: rows.reduce((sum, row) => sum + row.reviewQuestions, 0),
      acceptedReviewQuestions: rows.reduce((sum, row) => sum + row.acceptedReviewQuestions, 0),
      blockedReviewQuestions: rows.reduce((sum, row) => sum + row.blockedReviewQuestions, 0),
      linkedCalculationRows: rows.reduce((sum, row) => sum + row.linkedCalculationRows, 0),
      assumptionReviewRows: rows.reduce((sum, row) => sum + row.assumptionReviewRows, 0),
      criticalBomLines: rows.reduce((sum, row) => sum + row.criticalBomLines, 0),
      unpricedCriticalLines: rows.reduce((sum, row) => sum + row.unpricedCriticalLines, 0),
      modulesWithCriticalSourcingBlocks: rows.filter(row => row.unpricedCriticalLines > 0).length,
    },
    modules: rows,
    blockers: blockedRows.flatMap(row => row.blockers.length > 0 ? row.blockers.map(blocker => `${row.moduleId}: ${blocker}`) : [`${row.moduleId}: ${row.requiredAction}`]),
    nextActions: Array.from(new Set(rows.filter(row => row.verdict !== 'pass').map(row => row.requiredAction))),
  }
}

export function renderModuleEngineeringGateCsv(gate: ModuleEngineeringGate): string {
  const header = [
    'moduleId',
    'moduleName',
    'verdict',
    'subModuleCount',
    'componentWordCount',
    'interfaceCount',
    'linkedRequirementCount',
    'requiredInterfaceContracts',
    'carrierCompleteInterfaceContracts',
    'blockedAllocationRows',
    'reviewQuestions',
    'acceptedReviewQuestions',
    'blockedReviewQuestions',
    'linkedCalculationRows',
    'assumptionReviewRows',
    'criticalBomLines',
    'unpricedCriticalLines',
    'passRatio',
    'blockers',
    'requiredAction',
  ]
  const rows = gate.modules.map(row => [
    row.moduleId,
    row.moduleName,
    row.verdict,
    String(row.subModuleCount),
    String(row.componentWordCount),
    String(row.interfaceCount),
    String(row.linkedRequirementCount),
    String(row.requiredInterfaceContracts),
    String(row.carrierCompleteInterfaceContracts),
    String(row.blockedAllocationRows),
    String(row.reviewQuestions),
    String(row.acceptedReviewQuestions),
    String(row.blockedReviewQuestions),
    String(row.linkedCalculationRows),
    String(row.assumptionReviewRows),
    String(row.criticalBomLines),
    String(row.unpricedCriticalLines),
    String(row.passRatio),
    row.blockers.join(' '),
    row.requiredAction,
  ])
  return [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n') + '\n'
}

function moduleHasComponent(
  module: ProductDossier['architecture']['modules'][number],
  componentWordId: string,
): boolean {
  return module.subModules.some(subModule => subModule.words.some(word => word.id === componentWordId))
}

function componentWordCount(module: ProductDossier['architecture']['modules'][number]): number {
  return module.subModules.reduce((sum, subModule) => sum + subModule.words.length, 0)
}

function issueTouchesModule(issue: SectionIssue, moduleId: string): boolean {
  return Boolean(issue.path?.includes(moduleId) || issue.message.includes(moduleId))
}

function modulePassRatio(
  subModuleCount: number,
  componentWords: number,
  linkedRequirements: number,
  requiredContracts: number,
  carrierCompleteContracts: number,
  reviewQuestions: number,
  acceptedReviewQuestions: number,
  structuralBlockers: number,
): number {
  const checks = [
    subModuleCount > 0,
    componentWords > 0,
    linkedRequirements > 0,
    requiredContracts === 0 || carrierCompleteContracts === requiredContracts,
    reviewQuestions > 0,
    reviewQuestions === 0 || acceptedReviewQuestions === reviewQuestions,
    structuralBlockers === 0,
  ]
  return ratio(checks.filter(Boolean).length, checks.length)
}

function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) return 0
  return Math.round((numerator / denominator) * 100) / 100
}

function isString(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
