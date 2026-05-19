import type { ArchitectureReadiness, BatchSectionScore, PipelineStageTrace, ProductDossier, SectionIssue } from '../schema/types'
import { buildEngineeringAssuranceMatrix } from '../architecture/engineering-assurance-matrix'
import { buildInterfaceContractMatrix } from '../architecture/interface-contracts'
import { buildInterfaceGraph } from '../architecture/interface-graph'
import { buildEngineeringVerificationPlan } from '../architecture/verification-plan'
import { buildVerificationEvidenceLedger } from '../architecture/verification-ledger'
import { buildEngineeringAssumptionLedger } from '../architecture/engineering-assumptions'
import { buildEngineeringCalculationLedger } from '../architecture/engineering-calculations'
import { buildEngineeringReviewPack } from '../architecture/engineering-review-pack'
import { buildModuleReview } from '../architecture/module-review'
import { groupIssuesBySection } from '../schema/issues'
import { buildArchitectureFreezeGate } from '../scoring/architecture-freeze-gate'
import { buildArchitectureFreezeClosurePlan } from '../scoring/architecture-freeze-closure-plan'
import { buildClaimEvidenceGate } from '../scoring/claim-evidence-gate'
import { buildClaimLedger } from '../scoring/claim-ledger'
import { buildArchitectureAdmissionGate } from '../scoring/architecture-admission-gate'
import { buildBriefClarificationPlan } from '../scoring/brief-clarification-plan'
import { buildBriefIntakeGate } from '../scoring/brief-intake-gate'
import { buildBomAdmissionGate } from '../scoring/bom-admission-gate'
import { buildBomCostingGate } from '../scoring/bom-costing-gate'
import { buildBomEvidenceClosurePlan } from '../scoring/bom-evidence-closure-plan'
import { buildBomEvidenceTraceMatrix } from '../scoring/bom-evidence-trace'
import { buildComponentCandidateGate } from '../scoring/component-candidate-gate'
import { buildClosurePlan } from '../scoring/closure-plan'
import { buildComponentAllocationGate } from '../scoring/component-allocation-gate'
import { buildDocumentTrustGate } from '../scoring/document-trust-gate'
import { buildEvidenceAcquisitionPlan } from '../scoring/evidence-acquisition-plan'
import { buildEvidenceAuthenticityGate } from '../scoring/evidence-authenticity'
import { buildEvidenceReplacementPlan } from '../scoring/evidence-replacement-plan'
import type { DepthBenchmarkModel } from '../scoring/depth-benchmark'
import { buildEvidenceGapRegister } from '../scoring/evidence-gap-register'
import { buildInterfaceVerificationGate } from '../scoring/interface-verification-gate'
import { buildModuleEngineeringGate } from '../scoring/module-engineering-gate'
import { buildPreBomEngineeringGate } from '../scoring/pre-bom-engineering-gate'
import { buildProcurementReadinessGate } from '../scoring/procurement-readiness-gate'
import { buildReportReadinessGate } from '../scoring/report-readiness'
import { buildRequirementCoverageGate } from '../scoring/requirement-coverage-gate'
import { buildSectionScoreLedger } from '../scoring/score-from-issues'
import { buildSourceReferenceQualityGate } from '../scoring/source-reference-quality-gate'
import { buildSourcingBatchPlan } from '../scoring/sourcing-batch-plan'
import { buildSourcingAuthorizationGate } from '../scoring/sourcing-authorization-gate'
import { buildScratchLineageGate } from '../scoring/scratch-lineage-gate'
import { buildStageIntegrityGate } from '../scoring/stage-integrity-gate'
import { buildSubModuleEngineeringGate } from '../scoring/submodule-engineering-gate'
import { buildTrustRepairPlan } from '../scoring/trust-repair-plan'
import { buildSourcingEvidencePack } from '../sourcing/evidence-pack'
import { buildSourcingLineLedger } from '../sourcing/ledger'
import { buildBomProvenanceManifest } from '../sourcing/provenance-manifest'
import { buildSourcingWorklist } from '../sourcing/worklist'
import { buildComponentIdentityWorklist } from '../sourcing/component-identity'

export function renderReportHtml(
  dossier: ProductDossier,
  issues: SectionIssue[],
  readiness: ArchitectureReadiness,
  score?: BatchSectionScore,
  stageTrace: PipelineStageTrace[] = [],
  depthBenchmark?: DepthBenchmarkModel,
): string {
  const issueGroups = groupIssuesBySection(issues)
  const bomBlocked = !readiness.readyForBom
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(dossier.brief.productName)}</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #172026;
      --muted: #5d6872;
      --line: #d9e0e7;
      --band: #f4f7f9;
      --accent: #0f6b63;
      --warn: #9a4b00;
      --bad: #a32626;
      --ok: #20633b;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--ink);
      background: white;
    }
    main { width: min(1120px, calc(100% - 48px)); margin: 0 auto; padding: 36px 0 56px; }
    header { border-bottom: 2px solid var(--ink); padding-bottom: 20px; margin-bottom: 24px; }
    h1 { font-size: 30px; line-height: 1.15; margin: 0 0 12px; letter-spacing: 0; }
    h2 { font-size: 18px; margin: 30px 0 10px; border-bottom: 1px solid var(--line); padding-bottom: 6px; letter-spacing: 0; }
    h3 { font-size: 14px; margin: 18px 0 6px; letter-spacing: 0; }
    p { margin: 0 0 10px; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0 18px; table-layout: fixed; }
    th, td { border-bottom: 1px solid var(--line); padding: 8px 9px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
    th { background: var(--band); font-weight: 700; }
    .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
    .metric { border: 1px solid var(--line); padding: 10px; background: var(--band); }
    .metric b { display: block; font-size: 18px; margin-top: 4px; }
    .status { display: inline-block; padding: 2px 7px; border: 1px solid var(--line); font-weight: 700; }
    .ready { color: var(--ok); border-color: var(--ok); }
    .blocked { color: var(--bad); border-color: var(--bad); }
    .warning-status { color: var(--warn); border-color: var(--warn); }
    .note { color: var(--muted); }
    .issue { color: var(--bad); }
    .warning { color: var(--warn); }
    .module { border-top: 1px solid var(--line); padding: 12px 0; }
    .submodule { margin: 8px 0 0 18px; }
    .pill { display: inline-block; border: 1px solid var(--line); padding: 1px 6px; margin: 2px 4px 2px 0; background: #fff; }
    .blocked-panel { border: 1px solid var(--bad); padding: 12px; margin: 10px 0 18px; }
    @media print {
      body { font-size: 11px; }
      main { width: auto; padding: 18px 22px; }
      h2 { break-after: avoid; }
      table, .module, .blocked-panel { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>${escapeHtml(dossier.brief.productName)}</h1>
      <div class="meta">
        <div class="metric">Class<b>${escapeHtml(dossier.productClass)}</b></div>
        <div class="metric">Feasibility<b>${escapeHtml(dossier.feasibility.verdict)}</b></div>
        <div class="metric">BoM Readiness<b>${readiness.readyForBom ? 'Ready' : 'Blocked'}</b></div>
        <div class="metric">Score<b>${score ? score.mean.toFixed(1) : 'n/a'}</b></div>
      </div>
    </header>

    <section>
      <h2>Executive Summary</h2>
      ${renderMetricTable(dossier)}
      ${renderBriefIntakeGate(dossier, stageTrace)}
      ${renderBriefClarificationPlan(dossier, stageTrace)}
      ${renderArchitectureAdmissionGate(dossier, readiness, stageTrace)}
      ${renderStageIntegrityGate(stageTrace, dossier, readiness)}
      ${renderScratchLineageGate(dossier, stageTrace, depthBenchmark)}
      ${renderArchitectureFreezeGate(dossier, readiness, stageTrace, issues, depthBenchmark)}
      ${renderArchitectureFreezeClosurePlan(dossier, readiness, stageTrace, issues, depthBenchmark)}
      ${renderComponentCandidateGate(dossier)}
      ${renderSourcingAuthorizationGate(dossier, readiness, stageTrace)}
      ${renderBomAdmissionGate(dossier, readiness, stageTrace)}
      ${renderReportReadiness(dossier, readiness, issues, score)}
      ${renderPreBomEngineeringGate(dossier, readiness, issues)}
      ${renderBomCostingGate(dossier)}
      ${renderEvidenceAcquisitionPlan(dossier, readiness, issues, score)}
      ${renderDocumentTrustGate(dossier, readiness, issues, score)}
      ${renderEvidenceAuthenticityGate(dossier)}
      ${renderEvidenceReplacementPlan(dossier)}
      ${renderTrustRepairPlan(dossier, readiness, issues, score)}
      ${renderClaimLedger(dossier, readiness, issues)}
      ${renderClaimEvidenceGate(dossier, readiness, issues)}
      ${renderEvidenceGapRegister(dossier, readiness, issues, score)}
      ${renderClosurePlan(dossier, readiness, issues, score)}
      ${depthBenchmark ? renderDepthBenchmark(depthBenchmark) : ''}
    </section>

    <section>
      <h2>Brief Requirements</h2>
      <p>${escapeHtml(dossier.brief.originalText)}</p>
      ${renderRequirements(dossier)}
      ${renderRequirementTrace(dossier)}
      ${renderRequirementCoverageGate(dossier, readiness, issues)}
      ${renderEngineeringAssuranceMatrix(dossier, readiness, issues)}
    </section>

    <section>
      <h2>Compiler Stage Trace</h2>
      ${renderStageTrace(stageTrace)}
    </section>

    <section>
      <h2>Engineering Architecture Review</h2>
      <p><span class="status ${readiness.readyForBom ? 'ready' : 'blocked'}">${readiness.readyForBom ? 'Ready for BoM review' : 'Blocked before BoM review'}</span></p>
      <p class="note">${readiness.moduleCount} modules, ${readiness.subModuleCount} sub-modules, ${readiness.componentWordCount} allocated component words.</p>
      ${renderInterfaceLinks(readiness)}
      ${renderInterfaceGraphSummary(dossier, readiness)}
      ${renderInterfaceContractMatrix(dossier, readiness)}
      ${renderInterfaceVerificationGate(dossier, readiness, issues)}
      ${renderComponentAllocationGate(dossier)}
      ${renderSubModuleEngineeringGate(dossier, readiness, issues)}
      ${renderModuleEngineeringGate(dossier, readiness, issues)}
      ${renderModuleReview(dossier, readiness, issues)}
      ${renderEngineeringReviewPack(dossier, readiness, issues)}
      ${renderEngineeringSanityChecks(dossier)}
      ${renderEngineeringCalculationLedger(dossier)}
      ${renderEngineeringAssumptionLedger(dossier, readiness)}
      ${renderEngineeringVerificationPlan(dossier, readiness, issues)}
      ${renderArchitecture(dossier)}
    </section>

    <section>
      <h2>Bill of Materials</h2>
      ${bomBlocked ? renderBomBlocked(readiness) : renderBomTable(dossier)}
    </section>

    <section>
      <h2>Cost And Sourcing</h2>
      ${renderSourcingAdmission(dossier)}
      ${renderSourcingLineLedger(dossier)}
      ${renderBomProvenanceManifest(dossier)}
      ${renderSourceReferenceQualityGate(dossier)}
      ${renderBomEvidenceTraceMatrix(dossier)}
      ${renderBomEvidenceClosurePlan(dossier)}
      ${renderSourcingBatchPlan(dossier)}
      ${renderProcurementReadinessGate(dossier, readiness, stageTrace, issues, depthBenchmark)}
      ${renderSourcingEvidencePack(dossier)}
      ${renderCostTable(dossier)}
      ${renderSupplierTable(dossier)}
    </section>

    <section>
      <h2>Regulatory And Risk</h2>
      ${renderStandardsTable(dossier)}
      ${renderRiskTable(dossier)}
    </section>

    <section>
      <h2>Section Issues And Score</h2>
      ${renderIssues(issueGroups)}
      ${renderScore(issues, score)}
    </section>
  </main>
</body>
</html>`
}

function renderStageTrace(stageTrace: PipelineStageTrace[]): string {
  if (stageTrace.length === 0) return '<p class="note">No compiler stage trace recorded.</p>'
  const rows = stageTrace.map(stage => {
    const metrics = Object.entries(stage.metrics)
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join('; ')
    const evidence = stage.evidence.length === 0
      ? 'none'
      : stage.evidence.slice(0, 6).join('; ') + (stage.evidence.length > 6 ? `; plus ${stage.evidence.length - 6} more` : '')
    const limitations = stage.limitations.length === 0 ? 'none' : stage.limitations.join('; ')
    return `<tr>
      <td>${escapeHtml(stage.title)}</td>
      <td>${renderStageStatus(stage.status)}</td>
      <td>${escapeHtml(stage.summary)}</td>
      <td>${escapeHtml(metrics)}</td>
      <td>${escapeHtml(evidence)}</td>
      <td>${escapeHtml(limitations)}</td>
    </tr>`
  }).join('')
  return `<table><thead><tr><th>Stage</th><th>Status</th><th>Summary</th><th>Metrics</th><th>Evidence</th><th>Limitations</th></tr></thead><tbody>${rows}</tbody></table>`
}

function renderStageStatus(status: PipelineStageTrace['status']): string {
  if (status === 'passed') return '<span class="status ready">passed</span>'
  if (status === 'blocked') return '<span class="status blocked">blocked</span>'
  return '<span class="status warning-status">warning</span>'
}

function renderMetricTable(dossier: ProductDossier): string {
  const rows = dossier.keyMetrics.map(metric => `<tr><td>${escapeHtml(metric.label)}</td><td>${escapeHtml(String(metric.value))}</td><td>${escapeHtml(metric.unit ?? '')}</td><td>${escapeHtml(metric.confidence)}</td><td>${escapeHtml(metric.notes)}</td></tr>`).join('')
  return `<table><thead><tr><th>Metric</th><th>Value</th><th>Unit</th><th>Confidence</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table>`
}

function renderBriefIntakeGate(dossier: ProductDossier, stageTrace: PipelineStageTrace[]): string {
  const gate = buildBriefIntakeGate(dossier, stageTrace)
  const rows = gate.rows.map(row => `<tr>
    <td>${escapeHtml(row.area)}</td>
    <td>${renderBriefIntakeAreaVerdict(row.verdict)}</td>
    <td>${row.passRatio}</td>
    <td>${escapeHtml(row.signal)}</td>
    <td>${escapeHtml(row.blockers.join(' ') || 'none')}</td>
    <td>${escapeHtml(row.requiredAction)}</td>
  </tr>`).join('')
  return `<h3>Brief Intake Gate</h3>
    <p><span class="status ${gate.verdict === 'brief_ready_for_architecture' ? 'ready' : gate.verdict === 'brief_intake_blocked' || gate.verdict === 'no_brief' ? 'blocked' : 'warning-status'}">${escapeHtml(gate.verdict)}</span></p>
    <p class="note">${gate.summary.passRows}/${gate.summary.rows} intake areas pass; ${gate.summary.reviewRows} review, ${gate.summary.blockedRows} blocked. Class ${escapeHtml(gate.summary.productClass)} (${escapeHtml(gate.summary.classificationConfidence)}); requirements ${gate.summary.extractedRequirements}; numeric facts ${gate.summary.numericFacts}; requirement trace ${gate.summary.coveredRequirements}/${gate.summary.extractedRequirements} covered; scratch grammar ${gate.summary.scratchArchitectureSupported ? 'yes' : 'no'}.</p>
    <table><thead><tr><th>Area</th><th>Verdict</th><th>Pass Ratio</th><th>Signal</th><th>Blockers</th><th>Required Action</th></tr></thead><tbody>${rows}</tbody></table>`
}

function renderBriefIntakeAreaVerdict(verdict: ReturnType<typeof buildBriefIntakeGate>['rows'][number]['verdict']): string {
  if (verdict === 'pass') return '<span class="status ready">pass</span>'
  if (verdict === 'blocked') return '<span class="status blocked">blocked</span>'
  return '<span class="status warning-status">review</span>'
}

function renderBriefClarificationPlan(dossier: ProductDossier, stageTrace: PipelineStageTrace[]): string {
  const plan = buildBriefClarificationPlan(dossier, stageTrace)
  if (plan.questions.length === 0) {
    return `<h3>Brief Clarification Plan</h3>
      <p><span class="status ready">${escapeHtml(plan.verdict)}</span></p>
      <p class="ready">No clarification questions are needed before scratch architecture generation.</p>`
  }
  const rows = plan.questions.map(row => `<tr>
    <td>${row.sequence}</td>
    <td>${escapeHtml(row.kind)}</td>
    <td>${escapeHtml(row.priority)}</td>
    <td>${escapeHtml(row.status)}</td>
    <td>${escapeHtml(row.question)}</td>
    <td>${escapeHtml(row.expectedAnswerFormat)}</td>
    <td>${escapeHtml(row.exampleAnswer)}</td>
    <td>${row.blocksArchitecture ? '<span class="status blocked">yes</span>' : 'no'}</td>
  </tr>`).join('')
  return `<h3>Brief Clarification Plan</h3>
    <p><span class="status ${plan.verdict === 'clarification_required' ? 'blocked' : 'warning-status'}">${escapeHtml(plan.verdict)}</span></p>
    <p class="note">${plan.summary.rows} clarification question(s): ${plan.summary.requiredRows} required, ${plan.summary.recommendedRows} recommended, ${plan.summary.optionalRows} optional. Architecture blockers ${plan.summary.architectureBlockingRows}. Next question: ${escapeHtml(plan.summary.nextQuestionId ?? 'none')}.</p>
    <table><thead><tr><th>#</th><th>Kind</th><th>Priority</th><th>Status</th><th>Question</th><th>Expected Answer</th><th>Example</th><th>Blocks Architecture</th></tr></thead><tbody>${rows}</tbody></table>`
}

function renderArchitectureAdmissionGate(
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
  stageTrace: PipelineStageTrace[],
): string {
  const gate = buildArchitectureAdmissionGate(dossier, readiness, stageTrace)
  const rows = gate.rows.map(row => `<tr>
    <td>${escapeHtml(row.area)}</td>
    <td>${renderArchitectureAdmissionAreaVerdict(row.verdict)}</td>
    <td>${row.passRatio}</td>
    <td>${escapeHtml(row.signal)}</td>
    <td>${escapeHtml(row.blockers.slice(0, 4).join(' ') || 'none')}${row.blockers.length > 4 ? ` plus ${row.blockers.length - 4} more` : ''}</td>
    <td>${escapeHtml(row.requiredAction)}</td>
  </tr>`).join('')
  return `<h3>Architecture Admission Gate</h3>
    <p><span class="status ${gate.verdict === 'architecture_generation_admitted' ? 'ready' : gate.verdict === 'architecture_generation_blocked' || gate.verdict === 'no_architecture_trace' ? 'blocked' : 'warning-status'}">${escapeHtml(gate.verdict)}</span></p>
    <p class="note">${gate.summary.passRows}/${gate.summary.rows} admission areas pass; ${gate.summary.reviewRows} review, ${gate.summary.blockedRows} blocked. Can use for review: ${gate.summary.architectureCanBeUsedForReview ? 'yes' : 'no'}; can proceed to BoM: ${gate.summary.architectureCanProceedToBom ? 'yes' : 'no'}. Source ${escapeHtml(gate.summary.architectureSource)}; next action: ${escapeHtml(gate.summary.nextAction ?? 'none')}.</p>
    <table><thead><tr><th>Area</th><th>Verdict</th><th>Pass Ratio</th><th>Signal</th><th>Blockers</th><th>Required Action</th></tr></thead><tbody>${rows}</tbody></table>`
}

function renderArchitectureAdmissionAreaVerdict(verdict: ReturnType<typeof buildArchitectureAdmissionGate>['rows'][number]['verdict']): string {
  if (verdict === 'pass') return '<span class="status ready">pass</span>'
  if (verdict === 'blocked') return '<span class="status blocked">blocked</span>'
  return '<span class="status warning-status">review</span>'
}

function renderStageIntegrityGate(
  stageTrace: PipelineStageTrace[],
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
): string {
  const gate = buildStageIntegrityGate(stageTrace, dossier, readiness)
  const rows = gate.rows.map(row => `<tr>
    <td>${escapeHtml(row.area)}</td>
    <td>${renderStageIntegrityAreaVerdict(row.verdict)}</td>
    <td>${row.passRatio}</td>
    <td>${escapeHtml(row.signal)}</td>
    <td>${escapeHtml(row.blockers.slice(0, 5).join(' ') || 'none')}${row.blockers.length > 5 ? ` plus ${row.blockers.length - 5} more` : ''}</td>
    <td>${escapeHtml(row.requiredAction)}</td>
  </tr>`).join('')
  return `<h3>Stage Integrity Gate</h3>
    <p><span class="status ${gate.verdict === 'stage_trace_accepted' ? 'ready' : gate.verdict === 'stage_trace_blocked' || gate.verdict === 'no_stage_trace' ? 'blocked' : 'warning-status'}">${escapeHtml(gate.verdict)}</span></p>
    <p class="note">${gate.summary.passRows}/${gate.summary.rows} stage-integrity areas pass; ${gate.summary.reviewRows} review, ${gate.summary.blockedRows} blocked. Stages ${gate.summary.presentStages}/${gate.summary.expectedStages}; ordered: ${gate.summary.orderedStages ? 'yes' : 'no'}; architecture source ${escapeHtml(gate.summary.architectureSource)}; admitted priced lines ${gate.summary.admittedPricedLines}; provenance violations ${gate.summary.provenanceViolations}.</p>
    <table><thead><tr><th>Area</th><th>Verdict</th><th>Pass Ratio</th><th>Signal</th><th>Blockers</th><th>Required Action</th></tr></thead><tbody>${rows}</tbody></table>`
}

function renderStageIntegrityAreaVerdict(verdict: ReturnType<typeof buildStageIntegrityGate>['rows'][number]['verdict']): string {
  if (verdict === 'pass') return '<span class="status ready">pass</span>'
  if (verdict === 'blocked') return '<span class="status blocked">blocked</span>'
  return '<span class="status warning-status">review</span>'
}

function renderScratchLineageGate(
  dossier: ProductDossier,
  stageTrace: PipelineStageTrace[],
  depthBenchmark?: DepthBenchmarkModel,
): string {
  const gate = buildScratchLineageGate(dossier, stageTrace, depthBenchmark)
  const rows = gate.rows.map(row => `<tr>
    <td>${escapeHtml(row.area)}</td>
    <td>${renderScratchLineageAreaVerdict(row.verdict)}</td>
    <td>${row.passRatio}</td>
    <td>${escapeHtml(row.signal)}</td>
    <td>${escapeHtml(row.blockers.slice(0, 5).join(' ') || 'none')}${row.blockers.length > 5 ? ` plus ${row.blockers.length - 5} more` : ''}</td>
    <td>${escapeHtml(row.requiredAction)}</td>
  </tr>`).join('')
  return `<h3>Scratch Lineage Gate</h3>
    <p><span class="status ${gate.verdict === 'scratch_lineage_clean' ? 'ready' : gate.verdict === 'scratch_lineage_blocked' ? 'blocked' : 'warning-status'}">${escapeHtml(gate.verdict)}</span></p>
    <p class="note">${gate.summary.passRows}/${gate.summary.rows} lineage areas pass; ${gate.summary.reviewRows} review, ${gate.summary.blockedRows} blocked. Architecture source ${escapeHtml(gate.summary.architectureSource)}; design refs ${gate.summary.designRefs}; source refs ${gate.summary.sourceRefs}; forbidden refs ${gate.summary.forbiddenRefs}; forbidden stage mentions ${gate.summary.forbiddenStageMentions}; chain-v2 benchmark ${gate.summary.chainBenchmarkUsed ? 'yes' : 'no'} (${escapeHtml(gate.summary.benchmarkSource)}).</p>
    <table><thead><tr><th>Area</th><th>Verdict</th><th>Pass Ratio</th><th>Signal</th><th>Blockers</th><th>Required Action</th></tr></thead><tbody>${rows}</tbody></table>`
}

function renderScratchLineageAreaVerdict(verdict: ReturnType<typeof buildScratchLineageGate>['rows'][number]['verdict']): string {
  if (verdict === 'pass') return '<span class="status ready">pass</span>'
  if (verdict === 'blocked') return '<span class="status blocked">blocked</span>'
  return '<span class="status warning-status">review</span>'
}

function renderArchitectureFreezeGate(
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
  stageTrace: PipelineStageTrace[],
  issues: SectionIssue[],
  depthBenchmark?: DepthBenchmarkModel,
): string {
  const gate = buildArchitectureFreezeGate(dossier, readiness, stageTrace, issues, depthBenchmark)
  const rows = gate.rows.map(row => `<tr>
    <td>${escapeHtml(row.area)}</td>
    <td>${renderArchitectureFreezeAreaVerdict(row.verdict)}</td>
    <td>${row.passRatio}</td>
    <td>${escapeHtml(row.signal)}</td>
    <td>${escapeHtml(row.blockers.slice(0, 5).join(' ') || 'none')}${row.blockers.length > 5 ? ` plus ${row.blockers.length - 5} more` : ''}</td>
    <td>${escapeHtml(row.requiredAction)}</td>
  </tr>`).join('')
  return `<h3>Architecture Freeze Gate</h3>
    <p><span class="status ${gate.verdict === 'architecture_frozen_for_sourcing' ? 'ready' : gate.verdict === 'architecture_freeze_blocked' || gate.verdict === 'no_architecture' ? 'blocked' : 'warning-status'}">${escapeHtml(gate.verdict)}</span></p>
    <p class="note">${gate.summary.passRows}/${gate.summary.rows} freeze areas pass; ${gate.summary.reviewRows} review, ${gate.summary.blockedRows} blocked. Modules/submodules/components ${gate.summary.modules}/${gate.summary.subModules}/${gate.summary.componentWords}. Structurally ready for sourcing ${gate.summary.structurallyReadyForSourcing ? 'yes' : 'no'}; independent review accepted ${gate.summary.independentReviewAccepted ? 'yes' : 'no'}. Module engineering ${escapeHtml(gate.summary.moduleEngineeringVerdict)}; interfaces ${escapeHtml(gate.summary.interfaceVerificationVerdict)}; requirements ${escapeHtml(gate.summary.requirementCoverageVerdict)}; next action: ${escapeHtml(gate.summary.nextAction ?? 'none')}.</p>
    <table><thead><tr><th>Area</th><th>Verdict</th><th>Pass Ratio</th><th>Signal</th><th>Blockers</th><th>Required Action</th></tr></thead><tbody>${rows}</tbody></table>`
}

function renderArchitectureFreezeAreaVerdict(verdict: ReturnType<typeof buildArchitectureFreezeGate>['rows'][number]['verdict']): string {
  if (verdict === 'pass') return '<span class="status ready">pass</span>'
  if (verdict === 'blocked') return '<span class="status blocked">blocked</span>'
  return '<span class="status warning-status">review</span>'
}

function renderArchitectureFreezeClosurePlan(
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
  stageTrace: PipelineStageTrace[],
  issues: SectionIssue[],
  depthBenchmark?: DepthBenchmarkModel,
): string {
  const plan = buildArchitectureFreezeClosurePlan(dossier, readiness, stageTrace, issues, depthBenchmark)
  if (plan.rows.length === 0) {
    return `<h3>Architecture Freeze Closure Plan</h3>
      <p><span class="status ready">no_open_freeze_closure_rows</span></p>
      <p class="ready">Architecture freeze has no open closure rows.</p>`
  }
  const rows = plan.rows.map(row => `<tr>
    <td>${row.sequence}</td>
    <td>${escapeHtml(row.area)}</td>
    <td>${escapeHtml(row.closurePath)}</td>
    <td>${escapeHtml(row.priority)}</td>
    <td>${row.status === 'ready_for_intake' ? '<span class="status warning-status">ready</span>' : '<span class="status blocked">blocked</span>'}</td>
    <td>${escapeHtml(row.requiredEvidence)}</td>
    <td>${escapeHtml(row.acceptanceCriteria.join(' '))}</td>
    <td>${escapeHtml(row.inputArtifacts.join('; '))}</td>
  </tr>`).join('')
  return `<h3>Architecture Freeze Closure Plan</h3>
    <p><span class="status warning-status">${escapeHtml(plan.summary.freezeVerdict)}</span></p>
    <p class="note">${plan.summary.rows} closure row(s): ${plan.summary.readyRows} ready, ${plan.summary.blockedRows} blocked. Queues S/E/V/R ${plan.summary.sourcingIntakeRows}/${plan.summary.engineeringReviewRows}/${plan.summary.verificationIntakeRows}/${plan.summary.architectureRevisionRows}; next row ${escapeHtml(plan.summary.nextRowId ?? 'none')}. Structurally ready for sourcing ${plan.summary.structurallyReadyForSourcing ? 'yes' : 'no'}; independent review accepted ${plan.summary.independentReviewAccepted ? 'yes' : 'no'}.</p>
    <table><thead><tr><th>#</th><th>Area</th><th>Queue</th><th>Priority</th><th>Status</th><th>Required Evidence</th><th>Acceptance Criteria</th><th>Input Artifacts</th></tr></thead><tbody>${rows}</tbody></table>`
}

function renderComponentCandidateGate(dossier: ProductDossier): string {
  const gate = buildComponentCandidateGate(dossier)
  const rows = gate.rows.map(row => `<tr>
    <td>${escapeHtml(row.area)}</td>
    <td>${renderComponentCandidateAreaVerdict(row.verdict)}</td>
    <td>${row.passRatio}</td>
    <td>${escapeHtml(row.signal)}</td>
    <td>${escapeHtml(row.blockers.slice(0, 4).join(' ') || 'none')}${row.blockers.length > 4 ? ` plus ${row.blockers.length - 4} more` : ''}</td>
    <td>${escapeHtml(row.requiredAction)}</td>
  </tr>`).join('')
  return `<h3>Component Candidate Gate</h3>
    <p><span class="status ${gate.verdict === 'component_candidates_ready_for_sourcing' ? 'ready' : gate.verdict === 'component_candidates_blocked' || gate.verdict === 'no_component_candidates' ? 'blocked' : 'warning-status'}">${escapeHtml(gate.verdict)}</span></p>
    <p class="note">${gate.summary.passRows}/${gate.summary.rows} candidate areas pass; ${gate.summary.reviewRows} review, ${gate.summary.blockedRows} blocked. Candidate lines ${gate.summary.bomLines}; critical ${gate.summary.allocatedCriticalParts}/${gate.summary.requiredCriticalParts}; worklist rows ${gate.summary.candidateWorklistRows}; duplicate groups ${gate.summary.duplicateComponentGroups}; provenance violations ${gate.summary.provenanceViolations}; ready for sourcing ${gate.summary.readyForSourcing ? 'yes' : 'no'}.</p>
    <table><thead><tr><th>Area</th><th>Verdict</th><th>Pass Ratio</th><th>Signal</th><th>Blockers</th><th>Required Action</th></tr></thead><tbody>${rows}</tbody></table>`
}

function renderComponentCandidateAreaVerdict(verdict: ReturnType<typeof buildComponentCandidateGate>['rows'][number]['verdict']): string {
  if (verdict === 'pass') return '<span class="status ready">pass</span>'
  if (verdict === 'blocked') return '<span class="status blocked">blocked</span>'
  return '<span class="status warning-status">review</span>'
}

function renderSourcingAuthorizationGate(
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
  stageTrace: PipelineStageTrace[],
): string {
  const gate = buildSourcingAuthorizationGate(dossier, readiness, stageTrace)
  const rows = gate.rows.map(row => `<tr>
    <td>${escapeHtml(row.area)}</td>
    <td>${renderSourcingAuthorizationAreaVerdict(row.verdict)}</td>
    <td>${row.passRatio}</td>
    <td>${escapeHtml(row.signal)}</td>
    <td>${escapeHtml(row.blockers.slice(0, 4).join(' ') || 'none')}${row.blockers.length > 4 ? ` plus ${row.blockers.length - 4} more` : ''}</td>
    <td>${escapeHtml(row.requiredAction)}</td>
  </tr>`).join('')
  return `<h3>Sourcing Authorization Gate</h3>
    <p><span class="status ${gate.verdict === 'sourcing_authorized' ? 'ready' : gate.verdict === 'sourcing_authorization_blocked' ? 'blocked' : 'warning-status'}">${escapeHtml(gate.verdict)}</span></p>
    <p class="note">${gate.summary.passRows}/${gate.summary.rows} sourcing-authorization areas pass; ${gate.summary.reviewRows} review, ${gate.summary.blockedRows} blocked. Critical intake ${gate.summary.criticalIntakeRows}/${gate.summary.criticalUnpricedRows}; full intake ${gate.summary.fullIntakeRows}/${gate.summary.criticalUnpricedRows + gate.summary.candidateUnpricedRows}; admitted evidence ${gate.summary.admittedSourcingEvidenceRows}; rejected evidence ${gate.summary.rejectedSourcingEvidenceRows}; provenance violations ${gate.summary.provenanceViolations}; authorized ${gate.summary.sourcingAuthorized ? 'yes' : 'no'}.</p>
    <table><thead><tr><th>Area</th><th>Verdict</th><th>Pass Ratio</th><th>Signal</th><th>Blockers</th><th>Required Action</th></tr></thead><tbody>${rows}</tbody></table>`
}

function renderSourcingAuthorizationAreaVerdict(verdict: ReturnType<typeof buildSourcingAuthorizationGate>['rows'][number]['verdict']): string {
  if (verdict === 'pass') return '<span class="status ready">pass</span>'
  if (verdict === 'blocked') return '<span class="status blocked">blocked</span>'
  return '<span class="status warning-status">review</span>'
}

function renderBomAdmissionGate(
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
  stageTrace: PipelineStageTrace[],
): string {
  const gate = buildBomAdmissionGate(dossier, readiness, stageTrace)
  const rows = gate.rows.map(row => `<tr>
    <td>${escapeHtml(row.area)}</td>
    <td>${renderBomAdmissionAreaVerdict(row.verdict)}</td>
    <td>${row.passRatio}</td>
    <td>${escapeHtml(row.signal)}</td>
    <td>${escapeHtml(row.blockers.slice(0, 4).join(' ') || 'none')}${row.blockers.length > 4 ? ` plus ${row.blockers.length - 4} more` : ''}</td>
    <td>${escapeHtml(row.requiredAction)}</td>
  </tr>`).join('')
  return `<h3>BoM Admission Gate</h3>
    <p><span class="status ${gate.verdict === 'critical_bom_admitted' || gate.verdict === 'candidate_bom_authorized' ? 'ready' : gate.verdict === 'bom_admission_blocked' ? 'blocked' : 'warning-status'}">${escapeHtml(gate.verdict)}</span></p>
    <p class="note">Display mode ${escapeHtml(gate.summary.displayMode)}. ${gate.summary.passRows}/${gate.summary.rows} BoM-admission areas pass; ${gate.summary.reviewRows} review, ${gate.summary.blockedRows} blocked. Critical priced ${gate.summary.pricedCriticalLines}/${gate.summary.criticalBomLines}; source-backed claims ${gate.summary.sourceBackedClaims}; provenance violations ${gate.summary.provenanceViolations}. Candidate BoM ${gate.summary.canRenderCandidateBom ? 'yes' : 'no'}; priced BoM ${gate.summary.canRenderPricedBom ? 'yes' : 'no'}; procurement use ${gate.summary.canUseForProcurement ? 'yes' : 'no'}.</p>
    <table><thead><tr><th>Area</th><th>Verdict</th><th>Pass Ratio</th><th>Signal</th><th>Blockers</th><th>Required Action</th></tr></thead><tbody>${rows}</tbody></table>`
}

function renderBomAdmissionAreaVerdict(verdict: ReturnType<typeof buildBomAdmissionGate>['rows'][number]['verdict']): string {
  if (verdict === 'pass') return '<span class="status ready">pass</span>'
  if (verdict === 'blocked') return '<span class="status blocked">blocked</span>'
  return '<span class="status warning-status">review</span>'
}

function renderReportReadiness(
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
  issues: SectionIssue[],
  score?: BatchSectionScore,
): string {
  const gate = buildReportReadinessGate(dossier, readiness, issues, score)
  const sectionRows = gate.sections.map(section => `<tr>
    <td>${escapeHtml(section.section)}</td>
    <td>${section.score ?? 'n/a'}</td>
    <td>${section.passesTarget ? '<span class="status ready">pass</span>' : '<span class="status blocked">below target</span>'}</td>
    <td>${section.blockerCount}/${section.majorCount}/${section.minorCount}</td>
    <td>${escapeHtml(section.actions.join(' '))}</td>
  </tr>`).join('')
  const blockers = gate.promotionBlockers.length === 0
    ? '<p class="ready">No deterministic promotion blockers.</p>'
    : `<ul>${gate.promotionBlockers.map(item => `<li class="issue">${escapeHtml(item)}</li>`).join('')}</ul>`
  return `<h3>Report Readiness Gate</h3>
    <p><span class="status ${gate.verdict === 'publishable' ? 'ready' : gate.verdict === 'architecture_review_ready' ? 'warning-status' : 'blocked'}">${escapeHtml(gate.verdict)}</span></p>
    <p class="note">${gate.summary.sectionsAtOrAboveTarget}/${gate.summary.sections} sections at or above ${gate.targetSectionScore}. Mean score ${gate.summary.meanScore ?? 'n/a'}. Architecture ready: ${gate.summary.architectureReadyForBom ? 'yes' : 'no'}. Critical unpriced lines: ${gate.summary.unpricedCriticalLines}. Verification accepted: ${gate.summary.verificationAcceptedActivities}/${gate.summary.verificationEvidenceEligibleActivities}; unaccepted: ${gate.summary.verificationUnacceptedActivities}. Verification acceptance ratio: ${gate.summary.verificationAcceptanceRatio}.</p>
    ${blockers}
    <table><thead><tr><th>Section</th><th>Score</th><th>Target</th><th>B/M/m Issues</th><th>Action</th></tr></thead><tbody>${sectionRows}</tbody></table>`
}

function renderPreBomEngineeringGate(
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
  issues: SectionIssue[],
): string {
  const gate = buildPreBomEngineeringGate(dossier, readiness, issues)
  const rows = gate.rows.map(row => `<tr>
    <td>${escapeHtml(row.area)}</td>
    <td>${renderPreBomAreaVerdict(row.verdict)}</td>
    <td>${row.passRatio}</td>
    <td>${escapeHtml(row.signal)}</td>
    <td>${escapeHtml(row.blockers.slice(0, 4).join(' ') || 'none')}${row.blockers.length > 4 ? ` plus ${row.blockers.length - 4} more` : ''}</td>
    <td>${escapeHtml(row.requiredAction)}</td>
  </tr>`).join('')
  return `<h3>Pre-BoM Engineering Gate</h3>
    <p><span class="status ${gate.verdict === 'engineering_accepted' || gate.verdict === 'engineering_review_ready' ? 'ready' : 'blocked'}">${escapeHtml(gate.verdict)}</span></p>
    <p class="note">${gate.summary.passRows}/${gate.summary.rows} areas pass; ${gate.summary.reviewRows} review, ${gate.summary.blockedRows} blocked. Modules/submodules/components: ${gate.summary.modules}/${gate.summary.subModules}/${gate.summary.componentWords}. Calculations within envelope ${gate.summary.calculationsWithinEnvelope}/${gate.summary.calculationRows}; calculation blockers ${gate.summary.calculationBlockers}. Assumption review rows ${gate.summary.assumptionsNeedingReview}; architecture blockers ${gate.summary.assumptionArchitectureBlockers}.</p>
    <table><thead><tr><th>Area</th><th>Verdict</th><th>Pass Ratio</th><th>Signal</th><th>Blockers</th><th>Required Action</th></tr></thead><tbody>${rows}</tbody></table>`
}

function renderPreBomAreaVerdict(verdict: ReturnType<typeof buildPreBomEngineeringGate>['rows'][number]['verdict']): string {
  if (verdict === 'pass') return '<span class="status ready">pass</span>'
  if (verdict === 'blocked') return '<span class="status blocked">blocked</span>'
  return '<span class="status warning-status">review</span>'
}

function renderBomCostingGate(dossier: ProductDossier): string {
  const gate = buildBomCostingGate(dossier)
  const rows = gate.rows.map(row => `<tr>
    <td>${escapeHtml(row.area)}</td>
    <td>${renderBomCostingAreaVerdict(row.verdict)}</td>
    <td>${row.passRatio}</td>
    <td>${escapeHtml(row.signal)}</td>
    <td>${escapeHtml(row.blockers.slice(0, 5).join(' ') || 'none')}${row.blockers.length > 5 ? ` plus ${row.blockers.length - 5} more` : ''}</td>
    <td>${escapeHtml(row.requiredAction)}</td>
  </tr>`).join('')
  return `<h3>BoM Costing Gate</h3>
    <p><span class="status ${gate.verdict === 'costing_ready' ? 'ready' : gate.verdict === 'costing_blocked' || gate.verdict === 'costing_not_started' ? 'blocked' : 'warning-status'}">${escapeHtml(gate.verdict)}</span></p>
    <p class="note">${gate.summary.passRows}/${gate.summary.rows} costing areas pass; ${gate.summary.reviewRows} review, ${gate.summary.blockedRows} blocked. Critical priced lines ${gate.summary.pricedCriticalLines}/${gate.summary.criticalBomLines}; unpriced critical lines ${gate.summary.unpricedCriticalLines}. Source-backed claims ${gate.summary.sourceBackedClaims}; provenance violations ${gate.summary.provenanceViolations}; sourcing evidence ${gate.summary.productionReadySourcingEvidenceRows}/${gate.summary.sourcingEvidenceRows} production-ready, ${gate.summary.protocolSourcingEvidenceRows} protocol. Source quality: ${escapeHtml(gate.summary.sourceQualityVerdict)} (${gate.summary.sourceQualityPassRows}/${gate.summary.sourceQualityRows} pass, ${gate.summary.placeholderSourceRows} placeholder URL, ${gate.summary.quoteAnchoredSourceRows} quote-anchored). BoM total ${formatGbp(gate.summary.bomTotalCostGbp)}; CAPEX ${formatGbp(gate.summary.capexGbp)}.</p>
    <table><thead><tr><th>Area</th><th>Verdict</th><th>Pass Ratio</th><th>Signal</th><th>Blockers</th><th>Required Action</th></tr></thead><tbody>${rows}</tbody></table>`
}

function renderBomCostingAreaVerdict(verdict: ReturnType<typeof buildBomCostingGate>['rows'][number]['verdict']): string {
  if (verdict === 'pass') return '<span class="status ready">pass</span>'
  if (verdict === 'blocked') return '<span class="status blocked">blocked</span>'
  return '<span class="status warning-status">review</span>'
}

function renderModuleEngineeringGate(
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
  issues: SectionIssue[],
): string {
  const gate = buildModuleEngineeringGate(dossier, readiness, issues)
  const rows = gate.modules.map(row => `<tr>
    <td>${escapeHtml(row.moduleName)}</td>
    <td>${renderModuleEngineeringRowVerdict(row.verdict)}</td>
    <td>${row.subModuleCount}</td>
    <td>${row.componentWordCount}</td>
    <td>${row.linkedRequirementCount}</td>
    <td>${row.carrierCompleteInterfaceContracts}/${row.requiredInterfaceContracts}</td>
    <td>${row.acceptedReviewQuestions}/${row.reviewQuestions}</td>
    <td>${row.unpricedCriticalLines}</td>
    <td>${row.passRatio}</td>
    <td>${escapeHtml(row.requiredAction)}</td>
  </tr>`).join('')
  return `<h3>Module Engineering Gate</h3>
    <p><span class="status ${gate.verdict === 'module_engineering_ready' ? 'ready' : gate.verdict === 'module_engineering_blocked' || gate.verdict === 'no_modules' ? 'blocked' : 'warning-status'}">${escapeHtml(gate.verdict)}</span></p>
    <p class="note">${gate.summary.passRows}/${gate.summary.modules} modules pass; ${gate.summary.reviewRows} review, ${gate.summary.blockedRows} blocked. Submodules/components: ${gate.summary.subModules}/${gate.summary.componentWords}. Interface carriers ${gate.summary.carrierCompleteInterfaceContracts}/${gate.summary.requiredInterfaceContracts}; review questions accepted ${gate.summary.acceptedReviewQuestions}/${gate.summary.reviewQuestions}; critical unpriced lines ${gate.summary.unpricedCriticalLines} across ${gate.summary.modulesWithCriticalSourcingBlocks} module(s).</p>
    <table><thead><tr><th>Module</th><th>Verdict</th><th>Submodules</th><th>Components</th><th>Req Links</th><th>Interfaces</th><th>Review Qs</th><th>Critical Unpriced</th><th>Pass Ratio</th><th>Required Action</th></tr></thead><tbody>${rows}</tbody></table>`
}

function renderModuleEngineeringRowVerdict(verdict: ReturnType<typeof buildModuleEngineeringGate>['modules'][number]['verdict']): string {
  if (verdict === 'pass') return '<span class="status ready">pass</span>'
  if (verdict === 'blocked') return '<span class="status blocked">blocked</span>'
  return '<span class="status warning-status">review</span>'
}

function renderClaimLedger(dossier: ProductDossier, readiness: ArchitectureReadiness, issues: SectionIssue[]): string {
  const ledger = buildClaimLedger(dossier, readiness, issues)
  const rows = ledger.rows.slice(0, 70).map(row => `<tr>
    <td>${escapeHtml(row.kind)}</td>
    <td>${renderClaimStatus(row.status)}</td>
    <td>${escapeHtml(row.basis)}</td>
    <td>${escapeHtml(row.scope)}</td>
    <td>${escapeHtml(row.claim)}</td>
    <td>${escapeHtml(row.provenanceRefs.concat(row.sourceRefs, row.reviewerEvidenceRefs).join('; ') || 'none')}</td>
    <td>${row.blocksBom ? '<span class="status blocked">yes</span>' : 'no'}</td>
    <td>${row.blocksPublish ? '<span class="status blocked">yes</span>' : 'no'}</td>
    <td>${escapeHtml(row.nextAction)}</td>
  </tr>`).join('')
  const omitted = ledger.rows.length > 70 ? `<p class="note">Showing first 70 of ${ledger.rows.length} claims; export CSV for the full claim ledger.</p>` : ''
  return `<h3>Claim Ledger</h3>
    <p class="note">${ledger.summary.rows} claims: ${ledger.summary.briefSupplied} brief-supplied, ${ledger.summary.accepted} reviewer-accepted, ${ledger.summary.sourceBacked} source-backed, ${ledger.summary.calculatedNeedsReview} calculated needing review, ${ledger.summary.generatedNeedsReview} generated needing review, ${ledger.summary.sourceRequired} source-required, ${ledger.summary.blocked} blocked. Blocking: ${ledger.summary.blocksBom} BoM, ${ledger.summary.blocksPublish} publishable.</p>
    <table><thead><tr><th>Kind</th><th>Status</th><th>Basis</th><th>Scope</th><th>Claim</th><th>Evidence Refs</th><th>Blocks BoM</th><th>Blocks Publish</th><th>Next Action</th></tr></thead><tbody>${rows}</tbody></table>
    ${omitted}`
}

function renderClaimStatus(status: ReturnType<typeof buildClaimLedger>['rows'][number]['status']): string {
  if (status === 'accepted' || status === 'source_backed' || status === 'brief_supplied') return `<span class="status ready">${escapeHtml(status)}</span>`
  if (status === 'blocked' || status === 'source_required') return `<span class="status blocked">${escapeHtml(status)}</span>`
  return `<span class="status warning-status">${escapeHtml(status)}</span>`
}

function renderClaimEvidenceGate(dossier: ProductDossier, readiness: ArchitectureReadiness, issues: SectionIssue[]): string {
  const gate = buildClaimEvidenceGate(dossier, readiness, issues)
  const rows = gate.rows.map(row => `<tr>
    <td>${escapeHtml(row.area)}</td>
    <td>${renderClaimEvidenceVerdict(row.verdict)}</td>
    <td>${row.rows}</td>
    <td>${row.passedClaims}</td>
    <td>${row.reviewRequiredClaims}</td>
    <td>${row.blockedClaims}</td>
    <td>${row.sourceRequiredClaims}</td>
    <td>${row.bomBlockingClaims}</td>
    <td>${row.publishBlockingClaims}</td>
    <td>${row.passRatio}</td>
    <td>${escapeHtml(row.requiredAction)}</td>
  </tr>`).join('')
  const blockers = gate.promotionBlockers.length === 0
    ? '<p class="ready">No claim-evidence promotion blockers.</p>'
    : `<ul>${gate.promotionBlockers.map(blocker => `<li class="issue">${escapeHtml(blocker)}</li>`).join('')}</ul>`
  return `<h3>Claim Evidence Gate</h3>
    <p><span class="status ${gate.verdict === 'claim_evidence_complete' ? 'ready' : gate.verdict === 'evidence_blocked' ? 'blocked' : 'warning-status'}">${escapeHtml(gate.verdict)}</span></p>
    <p class="note">${gate.summary.passedClaims}/${gate.summary.claimRows} claims pass by being brief-supplied, source-backed or reviewer-accepted. ${gate.summary.blockedClaims} blocked/source-required claims, ${gate.summary.reviewRequiredClaims} review-required claims. Claim pass ratio ${gate.summary.passRatio}. Blocking: ${gate.summary.bomBlockingClaims} BoM, ${gate.summary.publishBlockingClaims} publishable.</p>
    ${blockers}
    <table><thead><tr><th>Area</th><th>Verdict</th><th>Claims</th><th>Passed</th><th>Review Req.</th><th>Blocked</th><th>Source Req.</th><th>Blocks BoM</th><th>Blocks Publish</th><th>Pass Ratio</th><th>Required Action</th></tr></thead><tbody>${rows}</tbody></table>`
}

function renderClaimEvidenceVerdict(verdict: ReturnType<typeof buildClaimEvidenceGate>['rows'][number]['verdict']): string {
  if (verdict === 'claim_evidence_complete') return '<span class="status ready">complete</span>'
  if (verdict === 'evidence_blocked') return '<span class="status blocked">blocked</span>'
  return '<span class="status warning-status">review</span>'
}

function renderDocumentTrustGate(
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
  issues: SectionIssue[],
  score?: BatchSectionScore,
): string {
  const gate = buildDocumentTrustGate(dossier, readiness, issues, score)
  const rows = gate.rows.map(row => `<tr>
    <td>${escapeHtml(row.area)}</td>
    <td>${renderDocumentTrustAreaVerdict(row.verdict)}</td>
    <td>${row.passRatio}</td>
    <td>${escapeHtml(row.signal)}</td>
    <td>${escapeHtml(row.blockers.slice(0, 5).join(' ') || 'none')}${row.blockers.length > 5 ? ` plus ${row.blockers.length - 5} more` : ''}</td>
    <td>${escapeHtml(row.requiredAction)}</td>
  </tr>`).join('')
  const blockers = gate.promotionBlockers.length === 0
    ? '<p class="ready">No document-trust blockers.</p>'
    : `<ul>${gate.promotionBlockers.slice(0, 12).map(blocker => `<li class="issue">${escapeHtml(blocker)}</li>`).join('')}</ul>`
  return `<h3>Document Trust Gate</h3>
    <p><span class="status ${gate.verdict === 'publishable_trusted' ? 'ready' : gate.verdict === 'evidence_blocked' || gate.verdict === 'not_reviewable' ? 'blocked' : 'warning-status'}">${escapeHtml(gate.verdict)}</span></p>
    <p class="note">${gate.summary.passRows}/${gate.summary.rows} trust areas pass; ${gate.summary.reviewRows} review, ${gate.summary.blockedRows} blocked. Architecture ready: ${gate.summary.architectureReady ? 'yes' : 'no'}. Claim gate: ${escapeHtml(gate.summary.claimEvidenceVerdict)}. Reviewer evidence ${gate.summary.reviewerAcceptedActivities}/${gate.summary.reviewerEligibleActivities}. Source-backed BoM claims ${gate.summary.sourceBackedBomClaims}; critical missing BoM claims ${gate.summary.criticalMissingBomClaims}; provenance violations ${gate.summary.provenanceViolations}. Evidence authenticity: ${escapeHtml(gate.summary.evidenceAuthenticityVerdict)} (${gate.summary.productionReadyEvidenceRows}/${gate.summary.evidenceRows} production-ready, ${gate.summary.protocolEvidenceRows} protocol).</p>
    ${blockers}
    <table><thead><tr><th>Area</th><th>Verdict</th><th>Pass Ratio</th><th>Signal</th><th>Blockers</th><th>Required Action</th></tr></thead><tbody>${rows}</tbody></table>`
}

function renderEvidenceAuthenticityGate(dossier: ProductDossier): string {
  const gate = buildEvidenceAuthenticityGate(dossier)
  const rows = gate.rows.slice(0, 80).map(row => `<tr>
    <td>${escapeHtml(row.kind)}</td>
    <td>${escapeHtml(row.subjectId)}</td>
    <td>${escapeHtml(row.referenceClass)}</td>
    <td>${renderEvidenceAuthenticityStatus(row.status)}</td>
    <td>${escapeHtml(row.ref)}</td>
    <td>${escapeHtml(row.reason)}</td>
    <td>${escapeHtml(row.requiredAction)}</td>
  </tr>`).join('')
  const omitted = gate.rows.length > 80 ? `<p class="note">Showing first 80 of ${gate.rows.length} evidence-authenticity rows; export CSV for the full ledger.</p>` : ''
  return `<h3>Evidence Authenticity Gate</h3>
    <p><span class="status ${gate.verdict === 'production_ready' ? 'ready' : gate.verdict === 'no_evidence' ? 'blocked' : 'warning-status'}">${escapeHtml(gate.verdict)}</span></p>
    <p class="note">${gate.summary.productionReadyRows}/${gate.summary.rows} evidence rows are production-ready. Protocol fixtures ${gate.summary.protocolFixtureRows}; review-required ${gate.summary.reviewRequiredRows}; missing metadata ${gate.summary.missingMetadataRows}. External URLs ${gate.summary.externalUrlRows}; internal references ${gate.summary.internalReferenceRows}; local files ${gate.summary.localFileRows}; unknown references ${gate.summary.unknownReferenceRows}.</p>
    <table><thead><tr><th>Kind</th><th>Subject</th><th>Reference Class</th><th>Status</th><th>Ref</th><th>Reason</th><th>Required Action</th></tr></thead><tbody>${rows}</tbody></table>
    ${omitted}`
}

function renderEvidenceAuthenticityStatus(status: ReturnType<typeof buildEvidenceAuthenticityGate>['rows'][number]['status']): string {
  if (status === 'accepted_production_evidence') return '<span class="status ready">production</span>'
  if (status === 'missing_metadata') return '<span class="status blocked">missing metadata</span>'
  return `<span class="status warning-status">${escapeHtml(status)}</span>`
}

function renderEvidenceAcquisitionPlan(
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
  issues: SectionIssue[],
  score?: BatchSectionScore,
): string {
  const plan = buildEvidenceAcquisitionPlan(dossier, readiness, issues, score)
  if (plan.rows.length === 0) return '<h3>Evidence Acquisition Plan</h3><p class="ready">No missing sourcing or reviewer evidence acquisition rows remain.</p>'
  const rows = plan.rows.slice(0, 80).map(row => `<tr>
    <td>${row.sequence}</td>
    <td>${escapeHtml(row.kind)}</td>
    <td>${escapeHtml(row.priority)}</td>
    <td>${escapeHtml(row.status)}</td>
    <td>${escapeHtml(row.subjectId)}</td>
    <td>${escapeHtml(row.acquisitionTarget)}</td>
    <td>${escapeHtml(row.requiredFields.join('; '))}</td>
    <td>${escapeHtml(row.disallowedEvidence.join('; '))}</td>
    <td>${row.blocksBom ? '<span class="status blocked">yes</span>' : 'no'}</td>
  </tr>`).join('')
  const omitted = plan.rows.length > 80 ? `<p class="note">Showing first 80 of ${plan.rows.length} acquisition rows; export CSV for the full acquisition plan.</p>` : ''
  return `<h3>Evidence Acquisition Plan</h3>
    <p class="note">${plan.summary.rows} missing-evidence row(s): ${plan.summary.sourcingRows} sourcing, ${plan.summary.verificationRows} verification. Ready ${plan.summary.readyRows}; blocked ${plan.summary.blockedRows}. Blocks BoM ${plan.summary.bomBlockingRows}; blocks publish ${plan.summary.publishBlockingRows}. Next row: ${escapeHtml(plan.summary.nextRowId ?? 'none')}.</p>
    <table><thead><tr><th>#</th><th>Kind</th><th>Priority</th><th>Status</th><th>Subject</th><th>Target</th><th>Required Fields</th><th>Disallowed Evidence</th><th>Blocks BoM</th></tr></thead><tbody>${rows}</tbody></table>
    ${omitted}`
}

function renderEvidenceReplacementPlan(dossier: ProductDossier): string {
  const plan = buildEvidenceReplacementPlan(dossier)
  if (plan.rows.length === 0) {
    return `<h3>Evidence Replacement Plan</h3>
      <p class="ready">No evidence replacement rows remain for the current authenticity verdict: ${escapeHtml(plan.summary.authenticityVerdict)}.</p>`
  }
  const rows = plan.rows.slice(0, 80).map(row => `<tr>
    <td>${row.sequence}</td>
    <td>${escapeHtml(row.kind)}</td>
    <td>${escapeHtml(row.subjectId)}</td>
    <td>${escapeHtml(row.currentStatus)}</td>
    <td>${escapeHtml(row.replacementTarget)}</td>
    <td>${escapeHtml(row.acceptedReferenceClasses.join('; '))}</td>
    <td>${escapeHtml(row.requiredFields.join('; '))}</td>
    <td>${row.blocksBom ? '<span class="status blocked">yes</span>' : 'no'}</td>
    <td>${escapeHtml(row.action)}</td>
  </tr>`).join('')
  const omitted = plan.rows.length > 80 ? `<p class="note">Showing first 80 of ${plan.rows.length} replacement rows; export CSV for the full worklist.</p>` : ''
  return `<h3>Evidence Replacement Plan</h3>
    <p class="note">${plan.summary.rows} replacement row(s): ${plan.summary.sourcingRows} sourcing, ${plan.summary.verificationRows} verification. Protocol ${plan.summary.protocolRows}; review-required ${plan.summary.reviewRequiredRows}; missing metadata ${plan.summary.missingMetadataRows}. Blocks BoM ${plan.summary.blocksBomRows}; blocks publish ${plan.summary.blocksPublishRows}. Next row: ${escapeHtml(plan.summary.nextRowId ?? 'none')}.</p>
    <table><thead><tr><th>#</th><th>Kind</th><th>Subject</th><th>Current Status</th><th>Replacement Target</th><th>Accepted Classes</th><th>Required Fields</th><th>Blocks BoM</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table>
    ${omitted}`
}

function renderDocumentTrustAreaVerdict(verdict: ReturnType<typeof buildDocumentTrustGate>['rows'][number]['verdict']): string {
  if (verdict === 'pass') return '<span class="status ready">pass</span>'
  if (verdict === 'blocked') return '<span class="status blocked">blocked</span>'
  return '<span class="status warning-status">review</span>'
}

function renderTrustRepairPlan(
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
  issues: SectionIssue[],
  score?: BatchSectionScore,
): string {
  const plan = buildTrustRepairPlan(dossier, readiness, issues, score)
  if (plan.packages.length === 0) return '<h3>Trust Repair Plan</h3><p class="ready">No trust repair packages remain.</p>'
  const rows = plan.packages.map(item => `<tr>
    <td>${item.sequence}</td>
    <td>${escapeHtml(item.title)}</td>
    <td>${renderRepairPackageStatus(item.status)}</td>
    <td>${escapeHtml(item.gateAreas.join('; ') || 'closure only')}</td>
    <td>${item.closureRows}</td>
    <td>${item.trustBlockers}</td>
    <td>${escapeHtml(item.requiredInputs.join(' '))}</td>
    <td>${escapeHtml(item.sourceArtifacts.join('; '))}</td>
    <td>${escapeHtml(item.exitCriteria.join(' '))}</td>
  </tr>`).join('')
  return `<h3>Trust Repair Plan</h3>
    <p class="note">${plan.summary.packages} package(s): ${plan.summary.readyPackages} ready, ${plan.summary.waitingPackages} waiting. Next package: ${escapeHtml(plan.summary.nextPackage ?? 'none')}. Closure rows ${plan.summary.closureRows}; trust blockers ${plan.summary.trustBlockers}. Trust verdict: ${escapeHtml(plan.summary.trustVerdict)}.</p>
    <table><thead><tr><th>#</th><th>Package</th><th>Status</th><th>Gate Areas</th><th>Closure Rows</th><th>Trust Blockers</th><th>Required Inputs</th><th>Source Artifacts</th><th>Exit Criteria</th></tr></thead><tbody>${rows}</tbody></table>`
}

function renderRepairPackageStatus(status: ReturnType<typeof buildTrustRepairPlan>['packages'][number]['status']): string {
  if (status === 'ready') return '<span class="status warning-status">ready</span>'
  return '<span class="status blocked">waiting</span>'
}

function renderEvidenceGapRegister(
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
  issues: SectionIssue[],
  score?: BatchSectionScore,
): string {
  const register = buildEvidenceGapRegister(dossier, readiness, issues, score)
  const rows = register.rows.slice(0, 70).map(row => `<tr>
    <td>${escapeHtml(row.kind)}</td>
    <td>${escapeHtml(row.priority)}</td>
    <td>${renderEvidenceGapStatus(row.status)}</td>
    <td>${escapeHtml(row.scope)}</td>
    <td>${escapeHtml(row.issue)}</td>
    <td>${escapeHtml(row.closurePath)}</td>
    <td>${escapeHtml(row.blocks.join('; '))}</td>
    <td>${escapeHtml(row.requiredEvidence)}</td>
  </tr>`).join('')
  const omitted = register.rows.length > 70 ? `<p class="note">Showing first 70 of ${register.rows.length} evidence gaps; export CSV for the full closure queue.</p>` : ''
  return `<h3>Evidence Gap Register</h3>
    <p class="note">${register.summary.rows} open evidence gaps: ${register.summary.blockers} blockers, ${register.summary.majors} major, ${register.summary.minors} minor. Closure paths: ${register.summary.sourcingIntakeRows} sourcing intake, ${register.summary.verificationIntakeRows} verification intake, ${register.summary.engineeringReviewRows} engineering review, ${register.summary.architectureRevisionRows} architecture revision. Blocking rows: architecture ${register.summary.architectureBlockingRows}, BoM ${register.summary.bomBlockingRows}, publishable ${register.summary.publishBlockingRows}.</p>
    <table><thead><tr><th>Kind</th><th>Priority</th><th>Status</th><th>Scope</th><th>Gap</th><th>Closure Path</th><th>Blocks</th><th>Required Evidence</th></tr></thead><tbody>${rows}</tbody></table>
    ${omitted}`
}

function renderClosurePlan(
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
  issues: SectionIssue[],
  score?: BatchSectionScore,
): string {
  const plan = buildClosurePlan(dossier, readiness, issues, score)
  if (plan.phases.length === 0) return '<h3>Closure Plan</h3><p class="ready">No open closure phases remain.</p>'
  const rows = plan.phases.map(phase => `<tr>
    <td>${phase.sequence}</td>
    <td>${escapeHtml(phase.title)}</td>
    <td>${phase.rowCount}</td>
    <td>${phase.blockerCount}/${phase.majorCount}/${phase.minorCount}</td>
    <td>${escapeHtml(phase.blocks.join('; '))}</td>
    <td>${escapeHtml(phase.rationale)}</td>
    <td>${escapeHtml(phase.exitCriteria.join(' '))}</td>
    <td>${escapeHtml(phase.topRows.map(row => row.id).slice(0, 8).join('; '))}${phase.topRows.length > 8 ? `; plus ${phase.topRows.length - 8} more` : ''}</td>
  </tr>`).join('')
  return `<h3>Closure Plan</h3>
    <p class="note">${plan.summary.phases} active phases. Next phase: ${escapeHtml(plan.summary.nextPhase ?? 'none')}. Rows by phase: architecture ${plan.summary.architectureRevisionRows}, sourcing ${plan.summary.sourcingIntakeRows}, engineering ${plan.summary.engineeringReviewRows}, verification ${plan.summary.verificationIntakeRows}, score repair ${plan.summary.scoreRepairRows}.</p>
    <table><thead><tr><th>#</th><th>Phase</th><th>Rows</th><th>B/M/m</th><th>Blocks</th><th>Rationale</th><th>Exit Criteria</th><th>Top Gap IDs</th></tr></thead><tbody>${rows}</tbody></table>`
}

function renderEvidenceGapStatus(status: ReturnType<typeof buildEvidenceGapRegister>['rows'][number]['status']): string {
  if (status === 'blocked') return '<span class="status blocked">blocked</span>'
  if (status === 'ready_for_intake') return '<span class="status warning-status">ready for intake</span>'
  if (status === 'needs_review') return '<span class="status warning-status">needs review</span>'
  return '<span class="status warning-status">open</span>'
}

function renderDepthBenchmark(benchmark: DepthBenchmarkModel): string {
  const rows = benchmark.rows.map(row => `<tr>
    <td>${escapeHtml(row.label)}</td>
    <td>${row.scratchValue} ${escapeHtml(row.unit)}</td>
    <td>${row.benchmarkValue} ${escapeHtml(row.unit)}</td>
    <td>${row.ratio ?? 'n/a'}</td>
    <td>${renderBenchmarkStatus(row.status)}</td>
    <td>${escapeHtml(row.notes)}</td>
    <td>${escapeHtml(row.action)}</td>
  </tr>`).join('')
  return `<h3>Depth Benchmark</h3>
    <p class="note">${escapeHtml(benchmark.benchmarkSource)}. ${escapeHtml(benchmark.contentUsePolicy)}</p>
    <p class="note">${benchmark.summary.meets} meeting benchmark, ${benchmark.summary.below} below benchmark, average comparable ratio ${benchmark.summary.averageComparableRatio ?? 'n/a'}.</p>
    <table><thead><tr><th>Dimension</th><th>Scratch</th><th>Benchmark</th><th>Ratio</th><th>Status</th><th>Notes</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table>`
}

function renderBenchmarkStatus(status: DepthBenchmarkModel['rows'][number]['status']): string {
  if (status === 'meets') return '<span class="status ready">meets</span>'
  if (status === 'below') return '<span class="status warning-status">below</span>'
  return '<span class="status warning-status">n/a</span>'
}

function renderRequirements(dossier: ProductDossier): string {
  if (dossier.brief.requirements.length === 0) return '<p class="note">No numeric requirements were parsed from the brief.</p>'
  const rows = dossier.brief.requirements.map(req => `<tr><td>${escapeHtml(req.label)}</td><td>${escapeHtml(String(req.value))}</td><td>${escapeHtml(req.unit ?? '')}</td></tr>`).join('')
  return `<table><thead><tr><th>Requirement</th><th>Value</th><th>Unit</th></tr></thead><tbody>${rows}</tbody></table>`
}

function renderRequirementTrace(dossier: ProductDossier): string {
  if (dossier.requirementTrace.length === 0) return '<p class="note">No requirement trace rows generated.</p>'
  const rows = dossier.requirementTrace.map(trace => {
    const architecture = trace.architectureLinks
      .map(link => `${link.moduleName}${link.subModuleName ? ` / ${link.subModuleName}` : ''}`)
      .join('; ') || 'none'
    const evaluators = [
      ...trace.keyMetricIds.map(id => `metric:${id}`),
      ...trace.engineeringSanityCheckIds.map(id => `sanity:${id}`),
    ].join('; ') || 'none'
    return `<tr>
      <td>${escapeHtml(trace.label)}</td>
      <td>${renderTraceStatus(trace.status)}</td>
      <td>${escapeHtml(String(trace.value))}${trace.unit ? ` ${escapeHtml(trace.unit)}` : ''}</td>
      <td>${escapeHtml(architecture)}</td>
      <td>${escapeHtml(evaluators)}</td>
      <td>${escapeHtml(trace.notes.join(' '))}</td>
    </tr>`
  }).join('')
  return `<h3>Requirement Traceability</h3><table><thead><tr><th>Requirement</th><th>Status</th><th>Value</th><th>Architecture Coverage</th><th>Evaluators</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table>`
}

function renderEngineeringAssuranceMatrix(dossier: ProductDossier, readiness: ArchitectureReadiness, issues: SectionIssue[]): string {
  const matrix = buildEngineeringAssuranceMatrix(dossier, readiness, issues)
  if (matrix.rows.length === 0) return '<h3>Engineering Assurance Matrix</h3><p class="warning">No requirements are available for assurance tracing.</p>'
  const rows = matrix.rows.map(row => `<tr>
    <td>${escapeHtml(row.label)}</td>
    <td>${renderAssuranceStatus(row.overallStatus)}</td>
    <td>${renderTraceStatus(row.architectureCoverage)}</td>
    <td>${escapeHtml(row.architectureModuleNames.join('; ') || 'none')}</td>
    <td>${escapeHtml(row.calculationIds.join('; ') || 'none')}</td>
    <td>${escapeHtml(row.reviewQuestionIds.slice(0, 5).join('; ') || 'none')}${row.reviewQuestionIds.length > 5 ? `; plus ${row.reviewQuestionIds.length - 5} more` : ''}</td>
    <td>${escapeHtml(row.verificationStatuses.join('; ') || 'none')}</td>
    <td>${escapeHtml(row.blockers.join(' ') || 'none')}</td>
    <td>${escapeHtml(row.nextAction)}</td>
  </tr>`).join('')
  return `<h3>Engineering Assurance Matrix</h3>
    <p class="note">${matrix.summary.rows} requirements: ${matrix.summary.accepted} accepted, ${matrix.summary.readyForReview} ready, ${matrix.summary.needsReview} needing review, ${matrix.summary.blocked} blocked, ${matrix.summary.unlinked} unlinked. ${matrix.summary.rowsWithCalculations} have calculation links, ${matrix.summary.rowsWithReviewQuestions} have review questions, ${matrix.summary.rowsWithAcceptedVerification} have accepted verification evidence.</p>
    <table><thead><tr><th>Requirement</th><th>Overall</th><th>Architecture</th><th>Modules</th><th>Calculations</th><th>Review Questions</th><th>Verification</th><th>Blockers</th><th>Next Action</th></tr></thead><tbody>${rows}</tbody></table>`
}

function renderRequirementCoverageGate(dossier: ProductDossier, readiness: ArchitectureReadiness, issues: SectionIssue[]): string {
  const gate = buildRequirementCoverageGate(dossier, readiness, issues)
  if (gate.rows.length === 0) return '<h3>Requirement Coverage Gate</h3><p class="warning">No parsed requirements are available for coverage gating.</p>'
  const rows = gate.rows.map(row => `<tr>
    <td>${escapeHtml(row.label)}</td>
    <td>${renderCoverageStatus(row.status)}</td>
    <td>${escapeHtml(row.presentSignals.join('; ') || 'none')}</td>
    <td>${escapeHtml(row.missingSignals.join('; ') || 'none')}</td>
    <td>${escapeHtml(row.architectureModuleIds.join('; ') || 'none')}</td>
    <td>${escapeHtml(row.verificationActivityIds.join('; ') || 'none')}</td>
    <td>${escapeHtml(row.requiredAction)}</td>
  </tr>`).join('')
  return `<h3>Requirement Coverage Gate</h3>
    <p><span class="status ${gate.verdict === 'coverage_blocked' || gate.verdict === 'no_requirements' ? 'blocked' : gate.verdict === 'accepted_evidence' ? 'ready' : 'warning-status'}">${escapeHtml(gate.verdict)}</span></p>
    <p class="note">${gate.summary.rows} requirement row(s): ${gate.summary.acceptedEvidenceRows} accepted with evidence, ${gate.summary.reviewReadyRows} coverage-ready, ${gate.summary.needsReviewRows} needing review, ${gate.summary.blockedRows} blocked, ${gate.summary.unlinkedRows} unlinked. Structural coverage ratio ${gate.summary.structuralCoverageRatio}; accepted evidence ratio ${gate.summary.acceptedEvidenceRatio}.</p>
    <table><thead><tr><th>Requirement</th><th>Status</th><th>Present Signals</th><th>Missing Signals</th><th>Modules</th><th>Verification Activities</th><th>Required Action</th></tr></thead><tbody>${rows}</tbody></table>`
}

function renderCoverageStatus(status: ReturnType<typeof buildRequirementCoverageGate>['rows'][number]['status']): string {
  if (status === 'accepted_evidence') return '<span class="status ready">accepted</span>'
  if (status === 'covered_review_ready') return '<span class="status ready">review ready</span>'
  if (status === 'blocked' || status === 'unlinked') return `<span class="status blocked">${escapeHtml(status)}</span>`
  return `<span class="status warning-status">${escapeHtml(status)}</span>`
}

function renderAssuranceStatus(status: ReturnType<typeof buildEngineeringAssuranceMatrix>['rows'][number]['overallStatus']): string {
  if (status === 'accepted') return '<span class="status ready">accepted</span>'
  if (status === 'ready_for_review') return '<span class="status ready">ready</span>'
  if (status === 'blocked') return '<span class="status blocked">blocked</span>'
  if (status === 'unlinked') return '<span class="status blocked">unlinked</span>'
  return '<span class="status warning-status">needs review</span>'
}

function renderTraceStatus(status: ProductDossier['requirementTrace'][number]['status']): string {
  if (status === 'covered') return '<span class="status ready">covered</span>'
  if (status === 'uncovered') return '<span class="status blocked">uncovered</span>'
  return '<span class="status warning-status">partial</span>'
}

function renderInterfaceLinks(readiness: ArchitectureReadiness): string {
  if (readiness.requiredInterfaceLinks.length === 0) return '<p class="note">No class-specific interface links have been defined yet.</p>'
  const rows = readiness.requiredInterfaceLinks.map(link => `<tr><td>${escapeHtml(link.fromModuleId)}</td><td>${escapeHtml(link.toModuleId)}</td><td>${escapeHtml(link.via)}</td><td>${link.present ? '<span class="ready">OK</span>' : '<span class="issue">Missing</span>'}</td><td>${escapeHtml(link.reason)}</td></tr>`).join('')
  return `<table><thead><tr><th>From</th><th>To</th><th>Interface</th><th>Status</th><th>Engineering Reason</th></tr></thead><tbody>${rows}</tbody></table>`
}

function renderInterfaceGraphSummary(dossier: ProductDossier, readiness: ArchitectureReadiness): string {
  const graph = buildInterfaceGraph(dossier, readiness)
  return `<h3>Interface Graph Summary</h3>
    <table><thead><tr><th>Module Nodes</th><th>Submodule Nodes</th><th>Shared Interface Edges</th><th>Required Edges</th><th>Missing Required Edges</th></tr></thead>
    <tbody><tr><td>${graph.summary.moduleNodes}</td><td>${graph.summary.subModuleNodes}</td><td>${graph.summary.sharedInterfaceEdges}</td><td>${graph.summary.requiredInterfaceEdges}</td><td>${graph.summary.missingRequiredInterfaceEdges}</td></tr></tbody></table>`
}

function renderInterfaceContractMatrix(dossier: ProductDossier, readiness: ArchitectureReadiness): string {
  const matrix = buildInterfaceContractMatrix(dossier, readiness)
  const requiredRows = matrix.requiredContracts.map(contract => `<tr>
    <td>${escapeHtml(contract.interfaceId)}</td>
    <td>${escapeHtml(contract.from.moduleName)}</td>
    <td>${escapeHtml(carrierNames(contract.from.carrierSubModules))}</td>
    <td>${escapeHtml(contract.to.moduleName)}</td>
    <td>${escapeHtml(carrierNames(contract.to.carrierSubModules))}</td>
    <td>${contract.status === 'present' ? '<span class="status ready">present</span>' : '<span class="status blocked">missing</span>'}</td>
    <td>${escapeHtml(contract.engineeringReason)}</td>
    <td>${escapeHtml(contract.notes.join(' '))}</td>
  </tr>`).join('')
  const localOnly = matrix.sharedInterfaces
    .filter(row => row.status === 'local_only')
    .slice(0, 8)
    .map(row => `${row.interfaceId} (${row.moduleNames.join(', ')})`)
  const localOnlyNote = localOnly.length === 0
    ? 'No local-only interface declarations in the current cross-module index.'
    : `Local-only declarations to review later: ${localOnly.join('; ')}${matrix.summary.localOnlyInterfaces > localOnly.length ? `; plus ${matrix.summary.localOnlyInterfaces - localOnly.length} more` : ''}.`
  return `<h3>Interface Contract Matrix</h3>
    <p class="note">${matrix.summary.presentContracts}/${matrix.summary.requiredContracts} required contracts present. ${matrix.summary.sharedInterfaces} shared interface families, ${matrix.summary.localOnlyInterfaces} local-only declarations.</p>
    <table><thead><tr><th>Interface</th><th>From Module</th><th>From Carrier</th><th>To Module</th><th>To Carrier</th><th>Status</th><th>Reason</th><th>Notes</th></tr></thead><tbody>${requiredRows}</tbody></table>
    <p class="note">${escapeHtml(localOnlyNote)}</p>`
}

function renderInterfaceVerificationGate(dossier: ProductDossier, readiness: ArchitectureReadiness, issues: SectionIssue[]): string {
  const gate = buildInterfaceVerificationGate(dossier, readiness, issues)
  if (gate.rows.length === 0) return '<h3>Interface Verification Gate</h3><p class="warning">No required interface contracts are available for verification gating.</p>'
  const rows = gate.rows.map(row => `<tr>
    <td>${escapeHtml(row.interfaceId)}</td>
    <td>${escapeHtml(row.fromModuleName)}</td>
    <td>${escapeHtml(row.toModuleName)}</td>
    <td>${escapeHtml(row.carrierStatus)}</td>
    <td>${escapeHtml(row.verificationActivityId ?? 'none')}</td>
    <td>${escapeHtml(row.ledgerStatus ?? 'none')}</td>
    <td>${renderInterfaceVerificationStatus(row.status)}</td>
    <td>${escapeHtml(row.requiredAction)}</td>
  </tr>`).join('')
  return `<h3>Interface Verification Gate</h3>
    <p><span class="status ${gate.verdict === 'accepted_interfaces' || gate.verdict === 'interface_review_ready' ? 'ready' : gate.verdict === 'interface_blocked' || gate.verdict === 'no_required_interfaces' ? 'blocked' : 'warning-status'}">${escapeHtml(gate.verdict)}</span></p>
    <p class="note">${gate.summary.rows} required interface row(s): ${gate.summary.acceptedRows} accepted, ${gate.summary.reviewReadyRows} review-ready, ${gate.summary.pendingEvidenceRows} pending evidence, ${gate.summary.deferredRows} deferred, ${gate.summary.blockedRows} blocked. Structural pass ratio ${gate.summary.structuralPassRatio}; accepted evidence ratio ${gate.summary.acceptedEvidenceRatio}.</p>
    <table><thead><tr><th>Interface</th><th>From</th><th>To</th><th>Carrier Status</th><th>Verification Activity</th><th>Ledger</th><th>Status</th><th>Required Action</th></tr></thead><tbody>${rows}</tbody></table>`
}

function renderInterfaceVerificationStatus(status: ReturnType<typeof buildInterfaceVerificationGate>['rows'][number]['status']): string {
  if (status === 'accepted' || status === 'review_ready') return `<span class="status ready">${escapeHtml(status)}</span>`
  if (status === 'blocked') return '<span class="status blocked">blocked</span>'
  return `<span class="status warning-status">${escapeHtml(status)}</span>`
}

function renderComponentAllocationGate(dossier: ProductDossier): string {
  const gate = buildComponentAllocationGate(dossier)
  if (gate.subModules.length === 0) return '<h3>Component Allocation Gate</h3><p class="warning">No submodules are available for component allocation gating.</p>'
  const rows = gate.subModules.slice(0, 90).map(row => `<tr>
    <td>${escapeHtml(row.moduleName)}</td>
    <td>${escapeHtml(row.subModuleName)}</td>
    <td>${renderComponentAllocationStatus(row.status)}</td>
    <td>${row.componentCount}</td>
    <td>${escapeHtml(row.interfaces.join('; ') || 'none')}</td>
    <td>${escapeHtml(row.criticalComponentWordIds.join('; ') || 'none')}</td>
    <td>${escapeHtml(row.duplicateComponentWordIds.join('; ') || 'none')}</td>
    <td>${escapeHtml(row.requiredAction)}</td>
  </tr>`).join('')
  const omitted = gate.subModules.length > 90 ? `<p class="note">Showing first 90 of ${gate.subModules.length} submodule allocation rows; export CSV for the full gate.</p>` : ''
  return `<h3>Component Allocation Gate</h3>
    <p><span class="status ${gate.verdict === 'allocation_ready' ? 'ready' : gate.verdict === 'allocation_blocked' || gate.verdict === 'no_components' ? 'blocked' : 'warning-status'}">${escapeHtml(gate.verdict)}</span></p>
    <p class="note">${gate.summary.readySubModules}/${gate.summary.subModules} submodules ready; ${gate.summary.reviewSubModules} review, ${gate.summary.blockedSubModules} blocked. Component words ${gate.summary.componentWords}; critical parts ${gate.summary.allocatedCriticalParts}/${gate.summary.requiredCriticalParts}; duplicate groups ${gate.summary.duplicateComponentGroups}. Allocation ratio ${gate.summary.allocationRatio}; critical allocation ratio ${gate.summary.criticalAllocationRatio}.</p>
    <table><thead><tr><th>Module</th><th>Submodule</th><th>Status</th><th>Components</th><th>Interfaces</th><th>Critical Components</th><th>Duplicate IDs</th><th>Required Action</th></tr></thead><tbody>${rows}</tbody></table>
    ${omitted}`
}

function renderComponentAllocationStatus(status: ReturnType<typeof buildComponentAllocationGate>['subModules'][number]['status']): string {
  if (status === 'ready') return '<span class="status ready">ready</span>'
  if (status === 'blocked') return '<span class="status blocked">blocked</span>'
  return '<span class="status warning-status">review</span>'
}

function renderSubModuleEngineeringGate(
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
  issues: SectionIssue[],
): string {
  const gate = buildSubModuleEngineeringGate(dossier, readiness, issues)
  if (gate.rows.length === 0) return '<h3>Submodule Engineering Gate</h3><p class="warning">No submodules are available for engineering acceptance.</p>'
  const rows = gate.rows.slice(0, 90).map(row => `<tr>
    <td>${escapeHtml(row.moduleName)}</td>
    <td>${escapeHtml(row.subModuleName)}</td>
    <td>${renderSubModuleEngineeringRowVerdict(row.verdict)}</td>
    <td>${row.componentWordCount}</td>
    <td>${row.interfaceCount}</td>
    <td>${row.linkedRequirementCount}</td>
    <td>${row.carrierContractCount - row.missingCarrierContractCount}/${row.carrierContractCount}</td>
    <td>${row.acceptedReviewQuestions}/${row.reviewQuestions}</td>
    <td>${row.acceptedVerificationActivities}/${row.verificationActivities}</td>
    <td>${row.criticalUnpricedLines}</td>
    <td>${row.passRatio}</td>
    <td>${escapeHtml(row.requiredAction)}</td>
  </tr>`).join('')
  const omitted = gate.rows.length > 90 ? `<p class="note">Showing first 90 of ${gate.rows.length} submodule rows; export CSV for the full gate.</p>` : ''
  return `<h3>Submodule Engineering Gate</h3>
    <p><span class="status ${gate.verdict === 'submodule_engineering_ready' ? 'ready' : gate.verdict === 'submodule_engineering_blocked' || gate.verdict === 'no_submodules' ? 'blocked' : 'warning-status'}">${escapeHtml(gate.verdict)}</span></p>
    <p class="note">${gate.summary.passRows}/${gate.summary.rows} submodules pass; ${gate.summary.reviewRows} review, ${gate.summary.blockedRows} blocked. Component words ${gate.summary.componentWords}; linked requirements ${gate.summary.linkedRequirements}; carrier contracts ${gate.summary.carrierContracts - gate.summary.missingCarrierContracts}/${gate.summary.carrierContracts}; local-only interfaces ${gate.summary.localOnlyInterfaces}. Review questions accepted ${gate.summary.acceptedReviewQuestions}/${gate.summary.reviewQuestions}; verification accepted ${gate.summary.acceptedVerificationActivities}/${gate.summary.verificationActivities}; critical unpriced lines ${gate.summary.criticalUnpricedLines}.</p>
    <table><thead><tr><th>Module</th><th>Submodule</th><th>Verdict</th><th>Components</th><th>Interfaces</th><th>Req Links</th><th>Carrier Contracts</th><th>Review Qs</th><th>Verification</th><th>Critical Unpriced</th><th>Pass Ratio</th><th>Required Action</th></tr></thead><tbody>${rows}</tbody></table>
    ${omitted}`
}

function renderSubModuleEngineeringRowVerdict(verdict: ReturnType<typeof buildSubModuleEngineeringGate>['rows'][number]['verdict']): string {
  if (verdict === 'pass') return '<span class="status ready">pass</span>'
  if (verdict === 'blocked') return '<span class="status blocked">blocked</span>'
  return '<span class="status warning-status">review</span>'
}

function carrierNames(carriers: Array<{ subModuleName: string }>): string {
  if (carriers.length === 0) return 'module-level only'
  return carriers.map(carrier => carrier.subModuleName).join('; ')
}

function renderModuleReview(dossier: ProductDossier, readiness: ArchitectureReadiness, issues: SectionIssue[]): string {
  const review = buildModuleReview(dossier, readiness, issues)
  const rows = review.modules.map(module => `<tr>
    <td>${escapeHtml(module.moduleName)}</td>
    <td>${renderModuleReviewStatus(module.status)}</td>
    <td>${module.subModuleCount}</td>
    <td>${module.componentCount}</td>
    <td>${module.requiredInterfaceEdges - module.missingRequiredInterfaceEdges}/${module.requiredInterfaceEdges}</td>
    <td>${escapeHtml(module.requirementIds.join('; ') || 'none')}</td>
    <td>${escapeHtml(module.criticalUnpricedLines.join('; ') || 'none')}</td>
    <td>${escapeHtml(module.notes.join(' '))}</td>
  </tr>`).join('')
  return `<h3>Module Review Roll-Up</h3>
    <p class="note">${review.summary.readyModules} ready, ${review.summary.sourcingBlockedModules} sourcing-blocked, ${review.summary.attentionModules} needing attention.</p>
    <table><thead><tr><th>Module</th><th>Status</th><th>Submodules</th><th>Components</th><th>Required Edges</th><th>Requirements</th><th>Critical Sourcing Blockers</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table>`
}

function renderModuleReviewStatus(status: ReturnType<typeof buildModuleReview>['modules'][number]['status']): string {
  if (status === 'ready') return '<span class="status ready">ready</span>'
  if (status === 'attention') return '<span class="status blocked">attention</span>'
  return '<span class="status warning-status">sourcing</span>'
}

function renderEngineeringReviewPack(dossier: ProductDossier, readiness: ArchitectureReadiness, issues: SectionIssue[]): string {
  const pack = buildEngineeringReviewPack(dossier, readiness, issues)
  const rows = pack.questions.slice(0, 70).map(question => `<tr>
    <td>${escapeHtml(question.kind)}</td>
    <td>${escapeHtml(question.priority)}</td>
    <td>${renderEngineeringReviewQuestionStatus(question.status)}</td>
    <td>${escapeHtml(question.scope)}</td>
    <td>${escapeHtml(question.reviewerQuestion)}</td>
    <td>${escapeHtml(question.evidenceRequired)}</td>
    <td>${escapeHtml(question.linkedModuleIds.join('; ') || 'none')}</td>
    <td>${escapeHtml(question.linkedInterfaceIds.join('; ') || 'none')}</td>
    <td>${escapeHtml(question.linkedCalculationIds.join('; ') || 'none')}</td>
    <td>${escapeHtml(question.blockers.join(' ') || 'none')}</td>
  </tr>`).join('')
  const omitted = pack.questions.length > 70 ? `<p class="note">Showing first 70 of ${pack.questions.length} engineering review questions; export CSV for the full pack.</p>` : ''
  return `<h3>Engineering Review Pack</h3>
    <p class="note">${pack.summary.rows} reviewer questions: ${pack.summary.accepted} accepted, ${pack.summary.readyForReview} ready, ${pack.summary.needsReview} needing review, ${pack.summary.blocked} blocked. Coverage: ${pack.summary.moduleQuestions} modules, ${pack.summary.subModuleQuestions} submodules, ${pack.summary.interfaceQuestions} interfaces, ${pack.summary.calculationQuestions} calculations, ${pack.summary.assumptionQuestions} assumptions.</p>
    <table><thead><tr><th>Kind</th><th>Priority</th><th>Status</th><th>Scope</th><th>Reviewer Question</th><th>Evidence Required</th><th>Modules</th><th>Interfaces</th><th>Calculations</th><th>Blockers</th></tr></thead><tbody>${rows}</tbody></table>
    ${omitted}`
}

function renderEngineeringReviewQuestionStatus(status: ReturnType<typeof buildEngineeringReviewPack>['questions'][number]['status']): string {
  if (status === 'accepted') return '<span class="status ready">accepted</span>'
  if (status === 'ready_for_review') return '<span class="status ready">ready</span>'
  if (status === 'blocked') return '<span class="status blocked">blocked</span>'
  return '<span class="status warning-status">needs review</span>'
}

function renderEngineeringSanityChecks(dossier: ProductDossier): string {
  const checks = dossier.feasibility.engineeringSanityChecks
  if (checks.length === 0) return '<p class="warning">No engineering sanity checks have been run.</p>'
  const rows = checks.map(check => `<tr>
    <td>${escapeHtml(check.label)}</td>
    <td>${renderSanityStatus(check.status)}</td>
    <td>${escapeHtml(String(check.value))}${check.unit ? ` ${escapeHtml(check.unit)}` : ''}</td>
    <td>${escapeHtml(check.expectedRange)}</td>
    <td>${escapeHtml(check.interpretation)}</td>
  </tr>`).join('')
  return `<h3>Engineering Sanity Checks</h3><table><thead><tr><th>Check</th><th>Status</th><th>Value</th><th>Expected</th><th>Interpretation</th></tr></thead><tbody>${rows}</tbody></table>`
}

function renderEngineeringCalculationLedger(dossier: ProductDossier): string {
  const ledger = buildEngineeringCalculationLedger(dossier)
  if (ledger.rows.length === 0) return '<h3>Engineering Calculation Ledger</h3><p class="warning">No class-specific engineering calculations are implemented for this product class yet.</p>'
  const rows = ledger.rows.map(row => `<tr>
    <td>${escapeHtml(row.label)}</td>
    <td>${renderCalculationStatus(row.status)}</td>
    <td>${escapeHtml(row.formula)}</td>
    <td>${row.result === null ? 'n/a' : `${row.result} ${escapeHtml(row.unit)}`}</td>
    <td>${escapeHtml(row.envelope)}</td>
    <td>${escapeHtml(row.interpretation)}</td>
    <td>${escapeHtml(row.evidenceRequired)}</td>
  </tr>`).join('')
  return `<h3>Engineering Calculation Ledger</h3>
    <p class="note">${ledger.summary.rows} calculations: ${ledger.summary.withinEnvelope} within deterministic envelope, ${ledger.summary.needsReview} needing engineering review, ${ledger.summary.outsideEnvelope} outside envelope, ${ledger.summary.blocked} blocked by missing inputs. These are arithmetic gates, not proof of real-world performance.</p>
    <table><thead><tr><th>Calculation</th><th>Status</th><th>Formula</th><th>Result</th><th>Envelope</th><th>Interpretation</th><th>Evidence Required</th></tr></thead><tbody>${rows}</tbody></table>`
}

function renderCalculationStatus(status: ReturnType<typeof buildEngineeringCalculationLedger>['rows'][number]['status']): string {
  if (status === 'within_envelope') return '<span class="status ready">within envelope</span>'
  if (status === 'outside_envelope') return '<span class="status blocked">outside envelope</span>'
  if (status === 'blocked') return '<span class="status blocked">blocked</span>'
  return '<span class="status warning-status">needs review</span>'
}

function renderEngineeringAssumptionLedger(dossier: ProductDossier, readiness: ArchitectureReadiness): string {
  const ledger = buildEngineeringAssumptionLedger(dossier, readiness)
  const rows = ledger.rows.slice(0, 60).map(row => `<tr>
    <td>${escapeHtml(row.scope)}</td>
    <td>${escapeHtml(row.category)}</td>
    <td>${renderAssumptionStatus(row.status)}</td>
    <td>${row.blocksArchitecture ? '<span class="status blocked">yes</span>' : 'no'}</td>
    <td>${row.blocksBom ? '<span class="status blocked">yes</span>' : 'no'}</td>
    <td>${escapeHtml(row.assumption)}</td>
    <td>${escapeHtml(row.evidenceRequired)}</td>
  </tr>`).join('')
  const omitted = ledger.rows.length > 60 ? `<p class="note">Showing first 60 of ${ledger.rows.length} assumption rows; export CSV for the full ledger.</p>` : ''
  return `<h3>Engineering Assumption Ledger</h3>
    <p class="note">${ledger.summary.rows} assumptions: ${ledger.summary.briefSupported} brief-supported, ${ledger.summary.modelPresent} model-present, ${ledger.summary.reviewRequired} needing engineering review, ${ledger.summary.sourceRequired} needing source evidence, ${ledger.summary.blocked} blocked. Architecture blockers ${ledger.summary.architectureBlockers}; BoM blockers ${ledger.summary.bomBlockers}.</p>
    <table><thead><tr><th>Scope</th><th>Category</th><th>Status</th><th>Blocks Architecture</th><th>Blocks BoM</th><th>Assumption</th><th>Evidence Required</th></tr></thead><tbody>${rows}</tbody></table>
    ${omitted}`
}

function renderAssumptionStatus(status: ReturnType<typeof buildEngineeringAssumptionLedger>['rows'][number]['status']): string {
  if (status === 'blocked') return '<span class="status blocked">blocked</span>'
  if (status === 'source_required') return '<span class="status blocked">source required</span>'
  if (status === 'review_required') return '<span class="status warning-status">review required</span>'
  if (status === 'model_present') return '<span class="status warning-status">model present</span>'
  return '<span class="status warning-status">brief supported</span>'
}

function renderEngineeringVerificationPlan(dossier: ProductDossier, readiness: ArchitectureReadiness, issues: SectionIssue[]): string {
  const plan = buildEngineeringVerificationPlan(dossier, readiness, issues)
  const ledger = buildVerificationEvidenceLedger(plan, dossier.sources.verificationEvidence)
  const rows = plan.activities.map(activity => `<tr>
    <td>${escapeHtml(activity.activity)}</td>
    <td>${renderVerificationStatus(activity.status)}</td>
    <td>${escapeHtml(activity.evidenceKind)}</td>
    <td>${escapeHtml(activity.moduleName)}</td>
    <td>${escapeHtml(activity.requirementIds.join('; ') || 'none')}</td>
    <td>${escapeHtml(activity.interfaceIds.join('; ') || 'none')}</td>
    <td>${escapeHtml(activity.componentWordIds.slice(0, 8).join('; ') || 'none')}${activity.componentWordIds.length > 8 ? `; plus ${activity.componentWordIds.length - 8} more` : ''}</td>
    <td>${escapeHtml(activity.acceptanceCriteria.join(' '))}</td>
    <td>${escapeHtml(activity.blockers.join(' ') || 'none')}</td>
  </tr>`).join('')
  return `<h3>Engineering Verification Plan</h3>
    <p class="note">${plan.summary.activities} activities: ${plan.summary.readyForReview} ready for review, ${plan.summary.open} open, ${plan.summary.blocked} blocked.</p>
    <table><thead><tr><th>Activity</th><th>Status</th><th>Evidence</th><th>Scope</th><th>Requirements</th><th>Interfaces</th><th>Components</th><th>Acceptance Criteria</th><th>Blockers</th></tr></thead><tbody>${rows}</tbody></table>
    ${renderVerificationEvidenceLedger(ledger)}`
}

function renderVerificationStatus(status: ReturnType<typeof buildEngineeringVerificationPlan>['activities'][number]['status']): string {
  if (status === 'ready_for_review') return '<span class="status ready">ready</span>'
  if (status === 'blocked') return '<span class="status blocked">blocked</span>'
  return '<span class="status warning-status">open</span>'
}

function renderVerificationEvidenceLedger(ledger: ReturnType<typeof buildVerificationEvidenceLedger>): string {
  const rows = ledger.rows.map(row => `<tr>
    <td>${escapeHtml(row.activity)}</td>
    <td>${renderLedgerStatus(row.ledgerStatus)}</td>
    <td>${escapeHtml(row.evidenceKind)}</td>
    <td>${escapeHtml(row.reviewerName ?? '')}</td>
    <td>${escapeHtml(row.evidenceRef ?? '')}</td>
    <td>${escapeHtml(row.residualAction)}</td>
  </tr>`).join('')
  return `<h3>Verification Evidence Ledger</h3>
    <p class="note">${ledger.summary.accepted} accepted, ${ledger.summary.rejected} rejected, ${ledger.summary.deferred} deferred, ${ledger.summary.pending} pending, ${ledger.summary.blockedWithoutEvidence} blocked without evidence. Review coverage ${ledger.summary.reviewCoverageRatio}; acceptance ratio ${ledger.summary.acceptanceRatio}. Source-evidence activities remain in sourcing intake.</p>
    <table><thead><tr><th>Activity</th><th>Ledger Status</th><th>Evidence Kind</th><th>Reviewer</th><th>Evidence Ref</th><th>Residual Action</th></tr></thead><tbody>${rows}</tbody></table>`
}

function renderLedgerStatus(status: ReturnType<typeof buildVerificationEvidenceLedger>['rows'][number]['ledgerStatus']): string {
  if (status === 'accepted') return '<span class="status ready">accepted</span>'
  if (status === 'rejected' || status === 'blocked_without_evidence') return '<span class="status blocked">' + escapeHtml(status) + '</span>'
  if (status === 'source_evidence_required') return '<span class="status warning-status">source required</span>'
  return '<span class="status warning-status">' + escapeHtml(status) + '</span>'
}

function renderSanityStatus(status: ProductDossier['feasibility']['engineeringSanityChecks'][number]['status']): string {
  if (status === 'pass') return '<span class="status ready">pass</span>'
  if (status === 'fail') return '<span class="status blocked">fail</span>'
  return '<span class="status warning-status">warn</span>'
}

function renderArchitecture(dossier: ProductDossier): string {
  return dossier.architecture.modules.map(module => `
    <div class="module">
      <h3>${escapeHtml(module.displayName)}</h3>
      <p>${escapeHtml(module.purpose)}</p>
      <p>${module.interfaces.map(value => `<span class="pill">${escapeHtml(value)}</span>`).join('')}</p>
      ${module.subModules.map(sub => `
        <div class="submodule">
          <b>${escapeHtml(sub.name)}</b>
          <p>${escapeHtml(sub.purpose)}</p>
          <p class="note">Components: ${escapeHtml(sub.words.map(word => word.name).join(', ') || 'none')}</p>
        </div>
      `).join('')}
    </div>
  `).join('')
}

function renderBomBlocked(readiness: ArchitectureReadiness): string {
  const items = readiness.blockingIssues.map(item => `<li>${escapeHtml(item.severity)} / ${escapeHtml(item.code)}: ${escapeHtml(item.message)}</li>`).join('')
  return `<div class="blocked-panel"><b>BoM review is blocked by architecture readiness.</b><ul>${items}</ul></div>`
}

function renderBomTable(dossier: ProductDossier): string {
  const priced = dossier.bom.lines.filter(line => line.unitCostGbp !== null).length
  const pricingNote = priced === 0
    ? '<p class="warning"><b>Pricing status:</b> architecture-derived candidate BoM only. Costs, suppliers, manufacturers and part numbers have not been independently sourced.</p>'
    : '<p class="warning"><b>Pricing status:</b> early estimate. Verify supplier, manufacturer, part number, lead time and cost before procurement use.</p>'
  const rows = dossier.bom.lines.map(line => `<tr><td>${escapeHtml(line.description)}</td><td>${line.quantity.value}</td><td>${escapeHtml(line.quantity.unit)}</td><td>${formatGbp(line.unitCostGbp)}</td><td>${formatGbp(line.totalCostGbp)}</td><td>${escapeHtml(line.supplier ?? '')}</td><td>${escapeHtml(line.manufacturer ?? '')}</td><td>${escapeHtml(line.mpn ?? '')}</td><td>${line.leadTimeWeeks ?? ''}</td></tr>`).join('')
  return `${pricingNote}<p>Total CAPEX BoM: <b>${formatGbp(dossier.bom.totalCostGbp)}</b></p><table><thead><tr><th>Line</th><th>Qty</th><th>Unit</th><th>Unit Cost</th><th>Total</th><th>Supplier</th><th>Manufacturer</th><th>MPN</th><th>Lead Time</th></tr></thead><tbody>${rows}</tbody></table>`
}

function renderCostTable(dossier: ProductDossier): string {
  const note = dossier.cost.capexGbp === 0
    ? '<p class="warning"><b>Cost model status:</b> pending sourcing. Architecture is being reviewed before cost claims are admitted.</p>'
    : ''
  const rows = [
    ['CAPEX', dossier.cost.capexGbp],
    ['Annual OPEX', dossier.cost.opexAnnualGbp],
    ['NRE', dossier.cost.nreGbp],
  ].map(([label, value]) => `<tr><td>${escapeHtml(String(label))}</td><td>${formatGbp(Number(value))}</td></tr>`).join('')
  return `${note}<table><thead><tr><th>Cost Bucket</th><th>Estimate</th></tr></thead><tbody>${rows}</tbody></table>`
}

function renderSourcingAdmission(dossier: ProductDossier): string {
  const admission = dossier.sourcing.admission
  const worklist = buildSourcingWorklist(dossier)
  const rejected = admission.rejectedRecords.length === 0
    ? '<p class="note">No rejected source records.</p>'
    : `<table><thead><tr><th>Component</th><th>Reason</th></tr></thead><tbody>${admission.rejectedRecords.map(record => `<tr><td>${escapeHtml(record.componentWordId)}</td><td>${escapeHtml(record.reason)}</td></tr>`).join('')}</tbody></table>`
  const criticalRows = worklist.criticalUnpriced.length === 0
    ? '<p class="ready">No critical sourcing blockers.</p>'
    : `<table><thead><tr><th>Component</th><th>Qty</th><th>Reason</th></tr></thead><tbody>${worklist.criticalUnpriced.map(item => `<tr><td>${escapeHtml(item.description)}</td><td>${item.quantity} ${escapeHtml(item.unit)}</td><td>${escapeHtml(item.reason)}</td></tr>`).join('')}</tbody></table>`
  return `<h3>Sourcing Admission</h3>
    <table>
      <thead><tr><th>Status</th><th>Candidate Lines</th><th>Admitted Prices</th><th>Unpriced Lines</th><th>Unpriced Critical Lines</th></tr></thead>
      <tbody><tr><td>${escapeHtml(admission.status)}</td><td>${admission.candidateLines}</td><td>${admission.admittedLines}</td><td>${admission.unpricedLines}</td><td>${admission.unpricedCriticalLines}</td></tr></tbody>
    </table>
    <h3>Critical Sourcing Worklist</h3>
    ${criticalRows}
    ${rejected}`
}

function renderSourcingLineLedger(dossier: ProductDossier): string {
  const ledger = buildSourcingLineLedger(dossier)
  const identityWorklist = buildComponentIdentityWorklist(dossier.bom)
  const duplicateNote = renderComponentIdentityWorklist(identityWorklist)
  const rows = ledger.rows.slice(0, 40).map(row => `<tr>
    <td>${escapeHtml(row.description)}</td>
    <td>${renderSourcingLedgerStatus(row.ledgerStatus)}</td>
    <td>${row.duplicateResolution === 'canonical_review_required' ? `<span class="status warning-status">${row.duplicateGroupSize} allocations</span>` : '<span class="status ready">unique</span>'}</td>
    <td>${escapeHtml(row.priority)}</td>
    <td>${formatGbp(row.unitCostGbp)}</td>
    <td>${escapeHtml(row.supplier ?? '')}</td>
    <td>${escapeHtml(row.manufacturer ?? '')}</td>
    <td>${escapeHtml(row.mpn ?? '')}</td>
    <td>${escapeHtml(row.evidenceRef ?? '')}</td>
    <td>${escapeHtml(row.nextAction)}</td>
  </tr>`).join('')
  const omitted = ledger.rows.length > 40 ? `<p class="note">Showing first 40 of ${ledger.rows.length} ledger rows; export CSV for the full line-by-line ledger.</p>` : ''
  return `<h3>BoM Sourcing Ledger</h3>
    <p class="note">${ledger.summary.admittedPricedLines}/${ledger.summary.bomLines} priced lines admitted. Critical coverage ${ledger.summary.criticalPricedLines}/${ledger.summary.criticalLines}. Rejected evidence records: ${ledger.summary.rejectedEvidenceRecords}. Cost/manufacturer/MPN fields stay blank until evidence is admitted.</p>
    ${duplicateNote}
    <table><thead><tr><th>Line</th><th>Status</th><th>Duplicate</th><th>Priority</th><th>Unit Cost</th><th>Supplier</th><th>Manufacturer</th><th>MPN</th><th>Evidence Ref</th><th>Next Action</th></tr></thead><tbody>${rows}</tbody></table>
    ${omitted}`
}

function renderBomProvenanceManifest(dossier: ProductDossier): string {
  const manifest = buildBomProvenanceManifest(dossier)
  const rows = manifest.rows
    .filter(row => row.status !== 'not_claimed')
    .slice(0, 50)
    .map(row => `<tr>
      <td>${escapeHtml(row.description)}</td>
      <td>${escapeHtml(row.field)}</td>
      <td>${renderBomClaimStatus(row.status)}</td>
      <td>${escapeHtml(row.value)}</td>
      <td>${escapeHtml(row.sourceRef ?? '')}</td>
      <td>${escapeHtml(row.nextAction)}</td>
    </tr>`).join('')
  const body = rows || '<tr><td colspan="6" class="note">No source-backed or missing-source claims are currently present.</td></tr>'
  return `<h3>BoM Provenance Manifest</h3>
    <p class="note">${manifest.summary.sourceBackedClaims} source-backed claims, ${manifest.summary.missingSourceClaims} missing-source claims, ${manifest.summary.provenanceViolations} provenance violations. Critical missing-source claims: ${manifest.summary.criticalMissingSourceClaims}. Supplier, manufacturer, MPN and cost fields must appear here with source refs before procurement use.</p>
    <table><thead><tr><th>Line</th><th>Claim Field</th><th>Status</th><th>Value</th><th>Source Ref</th><th>Next Action</th></tr></thead><tbody>${body}</tbody></table>`
}

function renderSourceReferenceQualityGate(dossier: ProductDossier): string {
  const gate = buildSourceReferenceQualityGate(dossier)
  if (gate.summary.rows === 0) {
    return `<h3>Source Reference Quality Gate</h3>
      <p class="blocked-panel"><b>No sourcing evidence references have been admitted.</b> Manufacturer, MPN and cost fields must remain blank until source-backed evidence is admitted through sourcing intake.</p>`
  }
  const rows = gate.rows.slice(0, 40).map(row => `<tr>
    <td>${escapeHtml(row.componentWordId)}</td>
    <td>${renderSourceReferenceQualityStatus(row.status)}</td>
    <td>${escapeHtml(row.referenceClass)}</td>
    <td>${escapeHtml(row.supplierName)}</td>
    <td>${escapeHtml(row.manufacturer ?? '')}</td>
    <td>${escapeHtml(row.mpn ?? '')}</td>
    <td>${escapeHtml(row.ref)}</td>
    <td>${row.hasHttps ? 'yes' : 'no'}</td>
    <td>${row.quoteAnchoredToManufacturerOrMpn ? 'yes' : 'no'}</td>
    <td>${row.timestampFresh ? 'yes' : 'no'}</td>
    <td>${escapeHtml(row.requiredAction)}</td>
  </tr>`).join('')
  const omitted = gate.rows.length > 40 ? `<p class="note">Showing first 40 of ${gate.rows.length} source-reference rows; export CSV for the full gate.</p>` : ''
  return `<h3>Source Reference Quality Gate</h3>
    <p class="note">${gate.summary.passRows}/${gate.summary.rows} source reference row(s) pass; ${gate.summary.reviewRows} review, ${gate.summary.blockedRows} blocked. External refs ${gate.summary.candidateExternalUrlRows}, protocol fixtures ${gate.summary.protocolFixtureRows}, placeholder URLs ${gate.summary.placeholderUrlRows}. Quote anchored ${gate.summary.quoteAnchoredRows}; fresh timestamps ${gate.summary.freshTimestampRows}. Verdict: ${escapeHtml(gate.verdict)}.</p>
    <table><thead><tr><th>Component</th><th>Status</th><th>Class</th><th>Supplier</th><th>Manufacturer</th><th>MPN</th><th>Ref</th><th>HTTPS</th><th>Quote Anchored</th><th>Fresh</th><th>Required Action</th></tr></thead><tbody>${rows}</tbody></table>
    ${omitted}`
}

function renderBomClaimStatus(status: ReturnType<typeof buildBomProvenanceManifest>['rows'][number]['status']): string {
  if (status === 'source_backed') return '<span class="status ready">source backed</span>'
  if (status === 'provenance_violation') return '<span class="status blocked">violation</span>'
  if (status === 'missing_source') return '<span class="status blocked">missing source</span>'
  return '<span class="status warning-status">not claimed</span>'
}

function renderSourceReferenceQualityStatus(status: ReturnType<typeof buildSourceReferenceQualityGate>['rows'][number]['status']): string {
  if (status === 'pass') return '<span class="status ready">pass</span>'
  if (status === 'review') return '<span class="status warning-status">review</span>'
  return '<span class="status blocked">blocked</span>'
}

function renderBomEvidenceTraceMatrix(dossier: ProductDossier): string {
  const matrix = buildBomEvidenceTraceMatrix(dossier)
  const rows = matrix.rows.slice(0, 50).map(row => `<tr>
    <td>${escapeHtml(row.description)}</td>
    <td>${renderBomEvidenceTraceStatus(row.traceStatus)}</td>
    <td>${escapeHtml(row.priority)}</td>
    <td>${formatGbp(row.unitCostGbp)}</td>
    <td>${escapeHtml(row.sourceReferenceStatus ?? '')}</td>
    <td>${escapeHtml(row.sourceReferenceClass ?? '')}</td>
    <td>${row.sourceBackedRequiredClaims}/4</td>
    <td>${row.canDisplayPricedReview ? 'yes' : 'no'}</td>
    <td>${row.canUseForProcurement ? 'yes' : 'no'}</td>
    <td>${escapeHtml(row.requiredAction)}</td>
  </tr>`).join('')
  const omitted = matrix.rows.length > 50 ? `<p class="note">Showing first 50 of ${matrix.rows.length} BoM trace rows; export CSV for the full trace.</p>` : ''
  return `<h3>BoM Evidence Trace Matrix</h3>
    <p class="note">${matrix.summary.productionEligibleRows}/${matrix.summary.lines} BoM row(s) are production-eligible; ${matrix.summary.protocolOnlyRows} protocol-only, ${matrix.summary.sourceReferenceBlockedRows} source-reference blocked, ${matrix.summary.criticalUnsourcedRows} critical unsourced. Priced-review rows ${matrix.summary.pricedReviewRows}; procurement use ${matrix.summary.canUseForProcurement ? 'yes' : 'no'}; next row ${escapeHtml(matrix.summary.nextRowId ?? 'none')}.</p>
    <table><thead><tr><th>Line</th><th>Trace Status</th><th>Priority</th><th>Unit Cost</th><th>Source Status</th><th>Source Class</th><th>Required Claims</th><th>Priced Review</th><th>Procurement</th><th>Required Action</th></tr></thead><tbody>${rows}</tbody></table>
    ${omitted}`
}

function renderBomEvidenceTraceStatus(status: ReturnType<typeof buildBomEvidenceTraceMatrix>['rows'][number]['traceStatus']): string {
  if (status === 'production_eligible') return '<span class="status ready">production eligible</span>'
  if (status === 'candidate_only' || status === 'protocol_only' || status === 'source_admitted_needs_reference_review') return `<span class="status warning-status">${escapeHtml(status.replaceAll('_', ' '))}</span>`
  return `<span class="status blocked">${escapeHtml(status.replaceAll('_', ' '))}</span>`
}

function renderBomEvidenceClosurePlan(dossier: ProductDossier): string {
  const plan = buildBomEvidenceClosurePlan(dossier)
  if (plan.rows.length === 0) return '<h3>BoM Evidence Closure Plan</h3><p class="ready">Every BoM evidence trace row is production-eligible.</p>'
  const rows = plan.rows.slice(0, 50).map(row => `<tr>
    <td>${row.sequence}</td>
    <td>${escapeHtml(row.description)}</td>
    <td>${renderBomEvidenceClosureStatus(row.status)}</td>
    <td>${escapeHtml(row.priority)}</td>
    <td>${escapeHtml(row.action.replaceAll('_', ' '))}</td>
    <td>${escapeHtml(row.traceStatus.replaceAll('_', ' '))}</td>
    <td>${escapeHtml(row.requiredEvidence.slice(0, 5).join('; '))}</td>
    <td>${row.blocksPricedReview ? 'yes' : 'no'}</td>
    <td>${row.blocksProcurement ? 'yes' : 'no'}</td>
    <td>${escapeHtml(row.requiredAction)}</td>
  </tr>`).join('')
  const omitted = plan.rows.length > 50 ? `<p class="note">Showing first 50 of ${plan.rows.length} BoM closure rows; export CSV for the full queue.</p>` : ''
  return `<h3>BoM Evidence Closure Plan</h3>
    <p class="note">${plan.summary.closureRows} closure row(s): ${plan.summary.readyRows} ready, ${plan.summary.blockedRows} blocked, ${plan.summary.deferredRows} deferred. Actions: ${plan.summary.collectSourceRows} collect source, ${plan.summary.repairReferenceRows + plan.summary.repairRejectedRows} repair, ${plan.summary.replaceProtocolRows} replace protocol, ${plan.summary.deferCandidateRows} candidate deferrals. Procurement blockers ${plan.summary.procurementBlockingRows}; priced-review blockers ${plan.summary.pricedReviewBlockingRows}; next row ${escapeHtml(plan.summary.nextRowId ?? 'none')}.</p>
    <table><thead><tr><th>#</th><th>Line</th><th>Status</th><th>Priority</th><th>Action</th><th>Trace Status</th><th>Required Evidence</th><th>Blocks Priced Review</th><th>Blocks Procurement</th><th>Required Action</th></tr></thead><tbody>${rows}</tbody></table>
    ${omitted}`
}

function renderBomEvidenceClosureStatus(status: ReturnType<typeof buildBomEvidenceClosurePlan>['rows'][number]['status']): string {
  if (status === 'ready') return '<span class="status ready">ready</span>'
  if (status === 'deferred') return '<span class="status warning-status">deferred</span>'
  return '<span class="status blocked">blocked</span>'
}

function renderSourcingBatchPlan(dossier: ProductDossier): string {
  const plan = buildSourcingBatchPlan(dossier)
  if (plan.batches.length === 0) return '<h3>Sourcing Batch Plan</h3><p class="ready">No sourcing batches remain open.</p>'
  const rows = plan.batches.flatMap(batch => batch.items.slice(0, 12).map(item => `<tr>
    <td>${batch.sequence}</td>
    <td>${escapeHtml(batch.title)}</td>
    <td>${renderSourcingBatchStatus(batch.status)}</td>
    <td>${escapeHtml(item.priority)}</td>
    <td>${escapeHtml(item.description)}</td>
    <td>${escapeHtml(item.searchTerms.slice(0, 3).join('; '))}</td>
    <td>${escapeHtml(item.requiredEvidence.slice(0, 5).join('; '))}</td>
    <td>${item.blocksProcurement ? 'yes' : 'no'}</td>
    <td>${escapeHtml(item.targetOutcome)}</td>
  </tr>`)).join('')
  return `<h3>Sourcing Batch Plan</h3>
    <p class="note">${plan.summary.batches} batch(es): ${plan.summary.activeBatches} active, ${plan.summary.waitingBatches} waiting, ${plan.summary.deferredBatches} deferred. Active rows ${plan.summary.activeRows}; deferred rows ${plan.summary.deferredRows}. Critical source rows ${plan.summary.criticalSourceRows}; repair rows ${plan.summary.repairRows}; protocol replacements ${plan.summary.protocolReplacementRows}. Next batch ${escapeHtml(plan.summary.nextBatchId ?? 'none')}; next item ${escapeHtml(plan.summary.nextItemId ?? 'none')}.</p>
    <table><thead><tr><th>#</th><th>Batch</th><th>Status</th><th>Priority</th><th>Line</th><th>Search Starts</th><th>Required Evidence</th><th>Blocks Procurement</th><th>Target Outcome</th></tr></thead><tbody>${rows}</tbody></table>`
}

function renderSourcingBatchStatus(status: ReturnType<typeof buildSourcingBatchPlan>['batches'][number]['status']): string {
  if (status === 'active') return '<span class="status ready">active</span>'
  if (status === 'deferred') return '<span class="status warning-status">deferred</span>'
  return '<span class="status blocked">waiting</span>'
}

function renderProcurementReadinessGate(
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
  stageTrace: PipelineStageTrace[],
  issues: SectionIssue[],
  depthBenchmark?: DepthBenchmarkModel,
): string {
  const gate = buildProcurementReadinessGate(dossier, readiness, stageTrace, issues, depthBenchmark)
  const rows = gate.rows.map(row => `<tr>
    <td>${escapeHtml(row.area.replaceAll('_', ' '))}</td>
    <td>${renderProcurementReadinessAreaVerdict(row.verdict)}</td>
    <td>${row.passRatio}</td>
    <td>${escapeHtml(row.signal)}</td>
    <td>${escapeHtml(row.blockers.slice(0, 5).join(' ') || 'none')}${row.blockers.length > 5 ? ` plus ${row.blockers.length - 5} more` : ''}</td>
    <td>${escapeHtml(row.requiredAction)}</td>
  </tr>`).join('')
  return `<h3>Procurement Readiness Gate</h3>
    <p><span class="status ${gate.verdict === 'procurement_ready' ? 'ready' : gate.verdict === 'procurement_blocked' || gate.verdict === 'procurement_not_started' ? 'blocked' : 'warning-status'}">${escapeHtml(gate.verdict)}</span></p>
    <p class="note">${gate.summary.passRows}/${gate.summary.rows} procurement areas pass; ${gate.summary.reviewRows} review, ${gate.summary.blockedRows} blocked. Critical production-eligible BoM rows ${gate.summary.productionEligibleCriticalRows}/${gate.summary.criticalRows}; procurement-blocking closure rows ${gate.summary.procurementBlockingRows}; active sourcing rows ${gate.summary.activeSourcingBatchRows}; deferred sourcing rows ${gate.summary.deferredSourcingBatchRows}. Source quality ${escapeHtml(gate.summary.sourceQualityVerdict)}; evidence authenticity ${escapeHtml(gate.summary.evidenceAuthenticityVerdict)}; costing ${escapeHtml(gate.summary.bomCostingVerdict)}; BoM admission ${escapeHtml(gate.summary.bomAdmissionVerdict)}. Can use for procurement: ${gate.summary.canUseForProcurement ? 'yes' : 'no'}. Next action: ${escapeHtml(gate.summary.nextAction ?? 'none')}.</p>
    <table><thead><tr><th>Area</th><th>Verdict</th><th>Pass Ratio</th><th>Signal</th><th>Blockers</th><th>Required Action</th></tr></thead><tbody>${rows}</tbody></table>`
}

function renderProcurementReadinessAreaVerdict(verdict: ReturnType<typeof buildProcurementReadinessGate>['rows'][number]['verdict']): string {
  if (verdict === 'pass') return '<span class="status ready">pass</span>'
  if (verdict === 'blocked') return '<span class="status blocked">blocked</span>'
  return '<span class="status warning-status">review</span>'
}

function renderComponentIdentityWorklist(worklist: ReturnType<typeof buildComponentIdentityWorklist>): string {
  if (worklist.summary.duplicateComponentGroups === 0) return '<p class="ready">Component identity check: no duplicate componentWordId groups detected.</p>'
  const rows = worklist.groups.map(group => `<tr>
    <td>${escapeHtml(group.componentWordId)}</td>
    <td>${group.lineCount}</td>
    <td>${group.criticalLineIds.length}</td>
    <td>${escapeHtml(group.descriptions.join('; '))}</td>
    <td>${escapeHtml(group.quantityByUnit.map(item => `${item.quantity} ${item.unit}`).join('; '))}</td>
    <td>${escapeHtml(group.recommendation)}</td>
  </tr>`).join('')
  return `<p class="warning"><b>Component identity check:</b> ${worklist.summary.duplicateComponentGroups} canonical component IDs appear across ${worklist.summary.duplicateAllocatedLines} allocated lines. Resolve these before sourcing or deduplicating costs.</p>
    <table><thead><tr><th>Component ID</th><th>Allocated Lines</th><th>Critical Lines</th><th>Description</th><th>Total Quantity</th><th>Review Action</th></tr></thead><tbody>${rows}</tbody></table>`
}

function renderSourcingLedgerStatus(status: ReturnType<typeof buildSourcingLineLedger>['rows'][number]['ledgerStatus']): string {
  if (status === 'admitted_priced') return '<span class="status ready">admitted</span>'
  if (status === 'rejected_evidence') return '<span class="status blocked">rejected</span>'
  if (status === 'critical_unpriced') return '<span class="status blocked">critical unpriced</span>'
  return '<span class="status warning-status">candidate unpriced</span>'
}

function renderSourcingEvidencePack(dossier: ProductDossier): string {
  const pack = buildSourcingEvidencePack(dossier)
  if (pack.criticalPackets.length === 0) return '<h3>Sourcing Evidence Pack</h3><p class="ready">No critical evidence packets remain open.</p>'
  const rows = pack.criticalPackets.map(packet => `<tr>
    <td>${escapeHtml(packet.description)}</td>
    <td>${packet.quantity} ${escapeHtml(packet.unit)}</td>
    <td>${escapeHtml(packet.searchTerms.slice(0, 3).join('; '))}</td>
    <td>${escapeHtml(packet.requiredEvidenceFields.join('; '))}</td>
    <td>${escapeHtml(packet.acceptanceCriteria.slice(0, 3).join(' '))}</td>
  </tr>`).join('')
  return `<h3>Sourcing Evidence Pack</h3>
    <p class="warning">Evidence packets request source data only. They do not admit supplier, manufacturer, MPN or cost claims.</p>
    <table><thead><tr><th>Critical Line</th><th>Qty</th><th>Search Starts</th><th>Required Fields</th><th>Acceptance Criteria</th></tr></thead><tbody>${rows}</tbody></table>`
}

function renderSupplierTable(dossier: ProductDossier): string {
  if (dossier.sourcing.primarySuppliers.length === 0) {
    return '<p class="note">No admitted supplier spend yet. Supplier rows appear only after source-backed evidence records are admitted.</p>'
  }
  const rows = dossier.sourcing.primarySuppliers.map(supplier => `<tr><td>${escapeHtml(supplier.name)}</td><td>${formatGbp(supplier.spendGbp)}</td><td>${escapeHtml(supplier.risk)}</td></tr>`).join('')
  return `<table><thead><tr><th>Supplier Path</th><th>Spend</th><th>Risk</th></tr></thead><tbody>${rows}</tbody></table>`
}

function renderStandardsTable(dossier: ProductDossier): string {
  const rows = dossier.regulatory.standards.map(item => `<tr><td>${escapeHtml(item.id)}</td><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.jurisdiction)}</td><td>${escapeHtml(item.evidenceRequired)}</td></tr>`).join('')
  return `<table><thead><tr><th>Standard</th><th>Title</th><th>Jurisdiction</th><th>Evidence Required</th></tr></thead><tbody>${rows}</tbody></table>`
}

function renderRiskTable(dossier: ProductDossier): string {
  const rows = dossier.risks.fmea.map(item => `<tr><td>${escapeHtml(item.hazard)}</td><td>${item.severity}</td><td>${item.occurrence}</td><td>${item.detection}</td><td>${item.severity * item.occurrence * item.detection}</td><td>${escapeHtml(item.mitigation)}</td></tr>`).join('')
  return `<table><thead><tr><th>Hazard</th><th>S</th><th>O</th><th>D</th><th>RPN</th><th>Mitigation</th></tr></thead><tbody>${rows}</tbody></table>`
}

function renderIssues(groups: Record<string, SectionIssue[]>): string {
  const entries = Object.entries(groups)
  if (entries.length === 0) return '<p class="ready">No section issues found by current deterministic validators.</p>'
  return entries.map(([section, sectionIssues]) => `<h3>${escapeHtml(section)}</h3><ul>${sectionIssues.map(item => `<li class="${item.severity === 'minor' ? 'warning' : 'issue'}">${escapeHtml(item.severity)} / ${escapeHtml(item.code)}: ${escapeHtml(item.message)}</li>`).join('')}</ul>`).join('')
}

function renderScore(issues: SectionIssue[], score?: BatchSectionScore): string {
  if (!score) return '<p class="note">No score available.</p>'
  const ledger = buildSectionScoreLedger(issues)
  const rows = ledger.rows.map(row => `<tr>
    <td>${escapeHtml(row.section)}</td>
    <td>${row.baseScore}</td>
    <td>${row.blockerCount}/${row.majorCount}/${row.minorCount}</td>
    <td>-${row.totalDeduction}</td>
    <td>${row.finalScore}</td>
    <td>${row.passesTarget ? '<span class="status ready">pass</span>' : '<span class="status blocked">below target</span>'}</td>
    <td>${escapeHtml(row.issueDeductions.map(issue => `${issue.severity}/${issue.code} (-${issue.deduction})`).join('; ') || 'none')}</td>
    <td>${escapeHtml(row.rationale)}</td>
  </tr>`).join('')
  return `<h3>Section Score Ledger</h3>
    <p class="note">Rule: start at ${ledger.rule.baseScore}, subtract ${ledger.rule.blockerDeduction} per blocker, ${ledger.rule.majorDeduction} per major, ${ledger.rule.minorDeduction} per minor, floor at ${ledger.rule.floorScore}. Mean score ${score.mean}. ${escapeHtml(ledger.rule.limitation)}</p>
    <table><thead><tr><th>Section</th><th>Base</th><th>B/M/m Issues</th><th>Deduction</th><th>Final</th><th>Target</th><th>Issue Deductions</th><th>Rationale</th></tr></thead><tbody>${rows}<tr><th>Mean</th><th colspan="7">${score.mean}</th></tr></tbody></table>`
}

function formatGbp(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'unpriced'
  return `£${Math.round(value).toLocaleString('en-GB')}`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
