import type { ArchitectureReadiness, PipelineStageTrace, ProductDossier, SectionIssue } from '../schema/types'
import { groupIssuesBySection } from '../schema/issues'

export function renderReportOutline(
  dossier: ProductDossier,
  issues: SectionIssue[],
  architectureReadiness?: ArchitectureReadiness,
  stageTrace: PipelineStageTrace[] = [],
): string {
  const bySection = groupIssuesBySection(issues)
  const lines: string[] = []
  lines.push(`# ${dossier.brief.productName}`)
  lines.push('')
  lines.push(`Class: ${dossier.productClass}`)
  lines.push(`Verdict: ${dossier.feasibility.verdict}`)
  lines.push('')
  lines.push('## Requirement Traceability')
  if (dossier.requirementTrace.length === 0) {
    lines.push('- No requirement trace rows generated.')
  }
  for (const trace of dossier.requirementTrace) {
    const evaluators = [
      ...trace.keyMetricIds.map(id => `metric:${id}`),
      ...trace.engineeringSanityCheckIds.map(id => `sanity:${id}`),
    ].join(', ') || 'no evaluators'
    lines.push(`- ${trace.status.toUpperCase()} ${trace.label}: ${trace.value}${trace.unit ? ` ${trace.unit}` : ''} -> ${trace.architectureLinks.map(link => link.moduleName).join(', ') || 'no architecture coverage'}; ${evaluators}`)
  }
  lines.push('')
  lines.push('## Headline Metrics')
  for (const metric of dossier.keyMetrics) {
    lines.push(`- ${metric.label}: ${metric.value}${metric.unit ? ` ${metric.unit}` : ''} (${metric.confidence})`)
  }
  lines.push('')
  lines.push('## Engineering Sanity Checks')
  for (const check of dossier.feasibility.engineeringSanityChecks) {
    lines.push(`- ${check.status.toUpperCase()} ${check.label}: ${check.value}${check.unit ? ` ${check.unit}` : ''} (${check.expectedRange})`)
    lines.push(`  ${check.interpretation}`)
  }
  if (dossier.feasibility.engineeringSanityChecks.length === 0) lines.push('- None')
  lines.push('')
  lines.push('## Compiler Stage Trace')
  if (stageTrace.length === 0) {
    lines.push('- No compiler stage trace recorded.')
  }
  for (const stage of stageTrace) {
    lines.push(`- ${stage.status.toUpperCase()} ${stage.title}: ${stage.summary}`)
  }
  lines.push('')
  lines.push('## Architecture')
  if (architectureReadiness) {
    lines.push(`Readiness for BoM: ${architectureReadiness.readyForBom ? 'ready' : 'blocked'}`)
    lines.push(`Coverage: ${architectureReadiness.moduleCount} modules, ${architectureReadiness.subModuleCount} sub-modules, ${architectureReadiness.componentWordCount} component words`)
    if (architectureReadiness.requiredInterfaceLinks.length > 0) {
      lines.push('Required interface links:')
      for (const link of architectureReadiness.requiredInterfaceLinks) {
        lines.push(`- ${link.present ? 'OK' : 'MISSING'} ${link.fromModuleId} -> ${link.toModuleId} via ${link.via}`)
      }
    }
    lines.push('')
  }
  for (const module of dossier.architecture.modules) {
    lines.push(`- ${module.displayName}: ${module.purpose}`)
    lines.push(`  Interfaces: ${module.interfaces.join(', ') || 'none'}`)
    for (const sub of module.subModules) {
      const words = sub.words.map(word => word.name).join(', ') || 'none'
      lines.push(`  - ${sub.name}: ${sub.purpose}`)
      lines.push(`    Components: ${words}`)
      lines.push(`    Interfaces: ${sub.interfaces.join(', ') || 'none'}`)
    }
  }
  lines.push('')
  lines.push('## BoM')
  lines.push(`Total: £${dossier.bom.totalCostGbp.toLocaleString('en-GB')}`)
  for (const line of dossier.bom.lines) {
    lines.push(`- ${line.quantity.value} ${line.quantity.unit} × ${line.description}: £${line.totalCostGbp?.toLocaleString('en-GB') ?? 'unpriced'}`)
  }
  lines.push('')
  lines.push('## Section Issues')
  if (issues.length === 0) lines.push('- None')
  for (const [section, sectionIssues] of Object.entries(bySection)) {
    lines.push(`- ${section}: ${sectionIssues.map(i => `${i.severity}/${i.code}`).join(', ')}`)
  }
  return lines.join('\n')
}
