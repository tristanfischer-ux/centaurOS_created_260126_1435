import type {
  ArchitectureReadiness,
  PipelineStageStatus,
  PipelineStageTrace,
  ProductDossier,
  ReportInput,
} from '../schema/types'
import type { ClassificationResult } from './classify'
import type { ParsedBrief } from './parse-brief'
import { buildInterfaceGraph } from '../architecture/interface-graph'
import { isScratchArchitectureSupported } from '../scratch/universal-modules'

export function buildStageTrace(
  input: ReportInput,
  classification: ClassificationResult,
  parsed: ParsedBrief,
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
): PipelineStageTrace[] {
  const interfaceLinksPresent = readiness.requiredInterfaceLinks.filter(link => link.present).length
  const criticalLines = dossier.bom.lines.filter(line => line.critical).length
  const admittedLines = dossier.sourcing.admission.admittedLines
  const unpricedCriticalLines = dossier.sourcing.admission.unpricedCriticalLines
  const interfaceGraph = buildInterfaceGraph(dossier, readiness)
  const overrideUsed = Boolean(input.productClass && input.productClass !== 'unknown')
  const scratchSupported = isScratchArchitectureSupported(dossier.productClass)
  const requirementCoverage = {
    covered: dossier.requirementTrace.filter(trace => trace.status === 'covered').length,
    partial: dossier.requirementTrace.filter(trace => trace.status === 'partial').length,
    uncovered: dossier.requirementTrace.filter(trace => trace.status === 'uncovered').length,
  }
  const sanityCounts = {
    pass: dossier.feasibility.engineeringSanityChecks.filter(check => check.status === 'pass').length,
    warn: dossier.feasibility.engineeringSanityChecks.filter(check => check.status === 'warn').length,
    fail: dossier.feasibility.engineeringSanityChecks.filter(check => check.status === 'fail').length,
  }

  return [
    {
      id: 'brief_parsing',
      title: 'Brief Parsing',
      status: parsed.brief.requirements.length > 0 ? 'passed' : 'warning',
      summary: parsed.brief.requirements.length > 0
        ? 'Extracted quantified requirements from the user brief before design generation.'
        : 'No quantified requirements were extracted; design will lean on class defaults until the brief is richer.',
      metrics: {
        requirement_count: parsed.brief.requirements.length,
        numeric_fact_count: Object.keys(parsed.numericFacts).length,
        requirement_trace_covered: requirementCoverage.covered,
        requirement_trace_partial: requirementCoverage.partial,
        requirement_trace_uncovered: requirementCoverage.uncovered,
      },
      evidence: [
        ...parsed.brief.requirements.map(item => `${item.id}: ${item.value}${item.unit ? ` ${item.unit}` : ''}`),
        ...dossier.requirementTrace.map(trace => `${trace.requirementId}: ${trace.status}`),
      ],
      limitations: parsed.brief.requirements.length > 0
        ? ['Parsing is deterministic and currently recognises only a small set of hardware requirement patterns.']
        : ['The parser needs more patterns before this can be trusted for sparse or unusual briefs.'],
    },
    {
      id: 'product_class_selection',
      title: 'Product-Class Selection',
      status: classification.productClass === 'unknown'
        ? 'blocked'
        : classification.confidence === 'high'
          ? 'passed'
          : 'warning',
      summary: overrideUsed
        ? `Used explicit product-class override: ${classification.productClass}.`
        : `Selected ${classification.productClass} with ${classification.confidence} confidence from brief keywords.`,
      metrics: {
        selected_class: classification.productClass,
        confidence: classification.confidence,
        keyword_scores: scoreSummary(classification.scores),
      },
      evidence: Object.entries(classification.scores).map(([productClass, score]) => `${productClass}: ${score}`),
      limitations: ['Classifier is keyword based; ambiguous multi-domain briefs need an LLM or richer taxonomy pass.'],
    },
    {
      id: 'universal_module_architecture',
      title: 'Universal Module Architecture',
      status: scratchSupported ? 'passed' : 'warning',
      summary: scratchSupported
        ? `Built a ${readiness.moduleCount}-module ${dossier.productClass} architecture from the scratch universal architecture grammar.`
        : 'Built the current class-pack architecture fallback; this class still needs a deep scratch grammar.',
      metrics: {
        module_count: readiness.moduleCount,
        architecture_source: scratchSupported ? 'scratch_universal_architecture' : 'class_pack_fallback',
      },
      evidence: dossier.architecture.modules.map(module => module.displayName),
      limitations: scratchSupported
        ? ['The scratch grammar is hand-authored and deterministic; it still needs independent engineering review.']
        : ['This class has not yet been expanded to the same submodule/component depth as the supported scratch grammars.'],
    },
    {
      id: 'submodule_expansion',
      title: 'Submodule Expansion',
      status: readiness.subModuleCount >= readiness.moduleCount ? 'passed' : 'warning',
      summary: 'Expanded each module into engineering submodules with local purpose, interfaces and component candidates.',
      metrics: {
        submodule_count: readiness.subModuleCount,
        average_submodules_per_module: readiness.moduleCount === 0 ? 0 : round(readiness.subModuleCount / readiness.moduleCount),
      },
      evidence: dossier.architecture.modules.flatMap(module => module.subModules.map(sub => `${module.id}.${sub.id}`)),
      limitations: ['Submodule completeness is judged by deterministic coverage checks, not by a physics simulator.'],
    },
    {
      id: 'interface_graph',
      title: 'Interface Graph',
      status: readiness.requiredInterfaceLinks.every(link => link.present) ? 'passed' : 'blocked',
      summary: 'Checked class-required module-to-module interfaces before allowing BoM review.',
      metrics: {
        required_links: readiness.requiredInterfaceLinks.length,
        present_links: interfaceLinksPresent,
        missing_links: readiness.requiredInterfaceLinks.length - interfaceLinksPresent,
        graph_nodes: interfaceGraph.nodes.length,
        graph_edges: interfaceGraph.edges.length,
        shared_interface_edges: interfaceGraph.summary.sharedInterfaceEdges,
        missing_required_graph_edges: interfaceGraph.summary.missingRequiredInterfaceEdges,
      },
      evidence: readiness.requiredInterfaceLinks.map(link => `${link.fromModuleId} -> ${link.toModuleId} via ${link.via}: ${link.present ? 'present' : 'missing'}`),
      limitations: ['Interfaces prove allocation coverage only; they do not yet validate ratings, thermal margins or dynamic behaviour.'],
    },
    {
      id: 'component_candidates',
      title: 'Component Candidates',
      status: dossier.bom.lines.length > 0 ? 'passed' : 'blocked',
      summary: 'Converted allocated component words into a candidate BoM without supplier prices.',
      metrics: {
        candidate_lines: dossier.bom.lines.length,
        critical_candidate_lines: criticalLines,
        admitted_price_lines: admittedLines,
      },
      evidence: dossier.bom.lines.slice(0, 30).map(line => `${line.componentWordId}: ${line.description}`),
      limitations: dossier.bom.lines.length > 30
        ? [`Showing first 30 of ${dossier.bom.lines.length} component candidates in the stage trace.`]
        : [],
    },
    {
      id: 'architecture_readiness_gate',
      title: 'Architecture Readiness Gate',
      status: readiness.readyForBom ? 'passed' : 'blocked',
      summary: readiness.readyForBom
        ? 'Architecture validators found no blocker or major issue, so candidate BoM review can start.'
        : `Architecture has ${readiness.blockingIssues.length} blocker or major issue(s), so BoM review is blocked.`,
      metrics: {
        ready_for_bom: readiness.readyForBom,
        blocking_issue_count: readiness.blockingIssues.length,
        sanity_pass: sanityCounts.pass,
        sanity_warn: sanityCounts.warn,
        sanity_fail: sanityCounts.fail,
      },
      evidence: [
        ...dossier.feasibility.engineeringSanityChecks.map(check => `${check.status} ${check.label}: ${check.value}${check.unit ? ` ${check.unit}` : ''}`),
        ...readiness.blockingIssues.map(issue => `${issue.code}: ${issue.message}`),
      ],
      limitations: ['Passing this gate means deterministic architecture checks passed; it is not a certified engineering sign-off.'],
    },
    {
      id: 'sourcing_bom_admission',
      title: 'Sourcing And BoM Admission',
      status: sourcingStatus(readiness.readyForBom, unpricedCriticalLines, dossier.sourcing.admission.status),
      summary: admittedLines === 0
        ? 'No supplier, manufacturer, part number or cost claims have been admitted because no source-backed evidence was provided.'
        : `Admitted ${admittedLines} source-backed BoM line(s); remaining unpriced lines are still blocked from cost claims.`,
      metrics: {
        admission_status: dossier.sourcing.admission.status,
        candidate_lines: dossier.sourcing.admission.candidateLines,
        admitted_lines: admittedLines,
        unpriced_lines: dossier.sourcing.admission.unpricedLines,
        unpriced_critical_lines: unpricedCriticalLines,
        rejected_source_records: dossier.sourcing.admission.rejectedRecords.length,
      },
      evidence: dossier.sources.sourcingEvidence.map(record => `${record.componentWordId}: ${record.supplierName} ${record.mpn ?? ''}`.trim()),
      limitations: unpricedCriticalLines > 0
        ? [`BoM cost remains intentionally blocked until ${unpricedCriticalLines} critical candidate line(s) have explicit source evidence.`]
        : ['Cost confidence still depends on quote freshness, lead time evidence and supplier authorisation checks.'],
    },
  ]
}

function sourcingStatus(
  readyForBom: boolean,
  unpricedCriticalLines: number,
  admissionStatus: ProductDossier['sourcing']['admission']['status'],
): PipelineStageStatus {
  if (!readyForBom) return 'blocked'
  if (admissionStatus !== 'complete' || unpricedCriticalLines > 0) return 'warning'
  return 'passed'
}

function scoreSummary(scores: ClassificationResult['scores']): string {
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1])
  return entries.length > 0 ? entries.map(([name, score]) => `${name}:${score}`).join(', ') : 'none'
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}
