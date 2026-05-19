import { buildInterfaceGraph } from './interface-graph'
import type { ArchitectureReadiness, ProductDossier, SectionIssue } from '../schema/types'

export type ModuleReviewStatus = 'ready' | 'sourcing_blocked' | 'attention'

export interface ModuleReviewRow {
  moduleId: string
  moduleName: string
  status: ModuleReviewStatus
  subModuleCount: number
  componentCount: number
  interfaceCount: number
  requiredInterfaceEdges: number
  missingRequiredInterfaceEdges: number
  requirementIds: string[]
  sanityCheckIds: string[]
  criticalUnpricedLines: string[]
  candidateUnpricedLines: number
  issueCodes: string[]
  notes: string[]
}

export interface ModuleReviewModel {
  summary: {
    modules: number
    readyModules: number
    sourcingBlockedModules: number
    attentionModules: number
    criticalUnpricedLines: number
    issueCount: number
  }
  modules: ModuleReviewRow[]
}

export function buildModuleReview(
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
  issues: SectionIssue[],
): ModuleReviewModel {
  const graph = buildInterfaceGraph(dossier, readiness)
  const rows = dossier.architecture.modules.map(module => {
    const moduleLines = dossier.bom.lines.filter(line => line.id.startsWith(`${module.id}_`))
    const criticalUnpricedLines = moduleLines
      .filter(line => line.critical && line.unitCostGbp === null)
      .map(line => line.componentWordId)
    const candidateUnpricedLines = moduleLines.filter(line => !line.critical && line.unitCostGbp === null).length
    const requiredEdges = graph.edges.filter(edge =>
      edge.kind === 'required_interface' && (edge.from === module.id || edge.to === module.id)
    )
    const moduleIssues = issues.filter(item => item.section !== 'bom' && issueTouchesModule(item, module.id))
    const requirementIds = Array.from(new Set(dossier.requirementTrace
      .filter(trace => trace.architectureLinks.some(link => link.moduleId === module.id))
      .map(trace => trace.requirementId)))
    const sanityCheckIds = Array.from(new Set(dossier.requirementTrace
      .filter(trace => trace.architectureLinks.some(link => link.moduleId === module.id))
      .flatMap(trace => trace.engineeringSanityCheckIds)))
    const missingRequiredEdges = requiredEdges.filter(edge => !edge.present).length
    const status: ModuleReviewStatus = moduleIssues.some(item => item.severity === 'blocker' || item.severity === 'major') || missingRequiredEdges > 0
      ? 'attention'
      : criticalUnpricedLines.length > 0
        ? 'sourcing_blocked'
        : 'ready'

    return {
      moduleId: module.id,
      moduleName: module.displayName,
      status,
      subModuleCount: module.subModules.length,
      componentCount: module.subModules.reduce((sum, subModule) => sum + subModule.words.length, 0),
      interfaceCount: new Set([...module.interfaces, ...module.subModules.flatMap(subModule => subModule.interfaces)]).size,
      requiredInterfaceEdges: requiredEdges.length,
      missingRequiredInterfaceEdges: missingRequiredEdges,
      requirementIds,
      sanityCheckIds,
      criticalUnpricedLines,
      candidateUnpricedLines,
      issueCodes: moduleIssues.map(item => item.code),
      notes: notesForModule(status, criticalUnpricedLines.length, candidateUnpricedLines, moduleIssues.length),
    }
  })

  return {
    summary: {
      modules: rows.length,
      readyModules: rows.filter(row => row.status === 'ready').length,
      sourcingBlockedModules: rows.filter(row => row.status === 'sourcing_blocked').length,
      attentionModules: rows.filter(row => row.status === 'attention').length,
      criticalUnpricedLines: rows.reduce((sum, row) => sum + row.criticalUnpricedLines.length, 0),
      issueCount: rows.reduce((sum, row) => sum + row.issueCodes.length, 0),
    },
    modules: rows,
  }
}

function issueTouchesModule(issue: SectionIssue, moduleId: string): boolean {
  return Boolean(issue.path?.includes(moduleId) || issue.message.includes(moduleId))
}

function notesForModule(
  status: ModuleReviewStatus,
  criticalUnpricedLineCount: number,
  candidateUnpricedLineCount: number,
  issueCount: number,
): string[] {
  if (status === 'attention') return [`${issueCount} validator or interface issue(s) require engineering attention.`]
  if (status === 'sourcing_blocked') return [`${criticalUnpricedLineCount} critical line(s) need source-backed evidence before BoM pass.`]
  if (candidateUnpricedLineCount > 0) return [`No critical blockers; ${candidateUnpricedLineCount} candidate line(s) remain for later sourcing.`]
  return ['No open module-level blockers detected by current deterministic checks.']
}
