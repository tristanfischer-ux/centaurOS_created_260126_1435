import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildEngineeringAssuranceMatrix, renderEngineeringAssuranceMatrixCsv } from '../architecture/engineering-assurance-matrix'
import { buildEngineeringAssumptionLedger, renderEngineeringAssumptionLedgerCsv } from '../architecture/engineering-assumptions'
import { buildEngineeringCalculationLedger, renderEngineeringCalculationLedgerCsv } from '../architecture/engineering-calculations'
import { buildEngineeringReviewPack, renderEngineeringReviewPackCsv } from '../architecture/engineering-review-pack'
import { buildInterfaceContractMatrix } from '../architecture/interface-contracts'
import { buildInterfaceGraph, renderInterfaceGraphMermaid } from '../architecture/interface-graph'
import { buildModuleReview } from '../architecture/module-review'
import { buildVerificationEvidenceLedger, renderVerificationEvidenceLedgerCsv } from '../architecture/verification-ledger'
import {
  buildVerificationIntakeTemplate,
  renderEngineeringVerificationPlanCsv,
  renderVerificationIntakeTemplateCsv,
} from '../architecture/verification-intake'
import { buildEngineeringVerificationPlan } from '../architecture/verification-plan'
import type { ChainV2Analysis } from '../chain-v2/types'
import { renderReportHtml } from '../render/report-html'
import type { ReportRunResult } from '../schema/types'
import { buildArchitectureFreezeGate, renderArchitectureFreezeGateCsv } from '../scoring/architecture-freeze-gate'
import { buildArchitectureFreezeClosurePlan, renderArchitectureFreezeClosurePlanCsv } from '../scoring/architecture-freeze-closure-plan'
import { buildClosurePlan, renderClosurePlanCsv } from '../scoring/closure-plan'
import { buildClaimEvidenceGate, renderClaimEvidenceGateCsv } from '../scoring/claim-evidence-gate'
import { buildClaimLedger, renderClaimLedgerCsv } from '../scoring/claim-ledger'
import { buildArchitectureAdmissionGate, renderArchitectureAdmissionGateCsv } from '../scoring/architecture-admission-gate'
import { buildBriefClarificationPlan, renderBriefClarificationPlanCsv } from '../scoring/brief-clarification-plan'
import { buildBriefIntakeGate, renderBriefIntakeGateCsv } from '../scoring/brief-intake-gate'
import { buildBomAdmissionGate, renderBomAdmissionGateCsv } from '../scoring/bom-admission-gate'
import { buildBomCostingGate, renderBomCostingGateCsv } from '../scoring/bom-costing-gate'
import { buildBomEvidenceClosurePlan, renderBomEvidenceClosurePlanCsv } from '../scoring/bom-evidence-closure-plan'
import { buildBomEvidenceTraceMatrix, renderBomEvidenceTraceMatrixCsv } from '../scoring/bom-evidence-trace'
import { buildComponentCandidateGate, renderComponentCandidateGateCsv } from '../scoring/component-candidate-gate'
import { buildComponentAllocationGate, renderComponentAllocationGateCsv } from '../scoring/component-allocation-gate'
import { buildDepthBenchmark, renderDepthBenchmarkCsv, type DepthBenchmarkModel } from '../scoring/depth-benchmark'
import { buildDocumentTrustGate, renderDocumentTrustGateCsv } from '../scoring/document-trust-gate'
import { buildEvidenceAcquisitionPlan, renderEvidenceAcquisitionPlanCsv } from '../scoring/evidence-acquisition-plan'
import { buildEvidenceAuthenticityGate, renderEvidenceAuthenticityGateCsv } from '../scoring/evidence-authenticity'
import { buildEvidenceReplacementPlan, renderEvidenceReplacementPlanCsv } from '../scoring/evidence-replacement-plan'
import { buildEvidenceGapRegister, renderEvidenceGapRegisterCsv } from '../scoring/evidence-gap-register'
import { buildInterfaceVerificationGate, renderInterfaceVerificationGateCsv } from '../scoring/interface-verification-gate'
import { buildModuleEngineeringGate, renderModuleEngineeringGateCsv } from '../scoring/module-engineering-gate'
import { buildPreBomEngineeringGate, renderPreBomEngineeringGateCsv } from '../scoring/pre-bom-engineering-gate'
import { buildProcurementReadinessGate, renderProcurementReadinessGateCsv } from '../scoring/procurement-readiness-gate'
import { buildReportReadinessGate, renderReportReadinessGateCsv } from '../scoring/report-readiness'
import { buildRequirementCoverageGate, renderRequirementCoverageGateCsv } from '../scoring/requirement-coverage-gate'
import { buildSectionScoreLedger, renderSectionScoreLedgerCsv } from '../scoring/score-from-issues'
import { buildSourceReferenceQualityGate, renderSourceReferenceQualityGateCsv } from '../scoring/source-reference-quality-gate'
import { buildSourcingBatchPlan, renderSourcingBatchPlanCsv } from '../scoring/sourcing-batch-plan'
import { buildSourcingAuthorizationGate, renderSourcingAuthorizationGateCsv } from '../scoring/sourcing-authorization-gate'
import { buildScratchLineageGate, renderScratchLineageGateCsv } from '../scoring/scratch-lineage-gate'
import { buildStageIntegrityGate, renderStageIntegrityGateCsv } from '../scoring/stage-integrity-gate'
import { buildSubModuleEngineeringGate, renderSubModuleEngineeringGateCsv } from '../scoring/submodule-engineering-gate'
import { buildTrustRepairPlan, renderTrustRepairPlanCsv } from '../scoring/trust-repair-plan'
import { buildComponentIdentityWorklist, renderComponentIdentityWorklistCsv } from '../sourcing/component-identity'
import { buildSourcingEvidencePack, renderSourcingEvidencePackCsv } from '../sourcing/evidence-pack'
import { buildSourcingIntakeTemplate, renderSourcingIntakeTemplateCsv } from '../sourcing/intake'
import { buildSourcingLineLedger, renderSourcingLineLedgerCsv } from '../sourcing/ledger'
import { buildBomProvenanceManifest, renderBomProvenanceManifestCsv } from '../sourcing/provenance-manifest'
import { buildSourcingWorklist } from '../sourcing/worklist'
import type { BomProvenanceManifest } from '../sourcing/provenance-manifest'
import type { EvidenceGapRegister } from '../scoring/evidence-gap-register'
import type { ReportReadinessGate } from '../scoring/report-readiness'

export interface ReportArtifactRequest {
  id: string
  title: string
  outDir: string
  result: ReportRunResult
  depthBenchmarkSource?: ChainV2Analysis
  writePdf?: boolean
}

export interface ReportArtifactSet {
  id: string
  title: string
  summary: ArtifactDashboardSummary
  htmlPath: string
  markdownPath: string
  jsonPath: string
  briefIntakeGatePath: string
  briefIntakeGateCsvPath: string
  briefClarificationPlanPath: string
  briefClarificationPlanCsvPath: string
  architectureAdmissionGatePath: string
  architectureAdmissionGateCsvPath: string
  componentCandidateGatePath: string
  componentCandidateGateCsvPath: string
  sourcingAuthorizationGatePath: string
  sourcingAuthorizationGateCsvPath: string
  bomAdmissionGatePath: string
  bomAdmissionGateCsvPath: string
  stageIntegrityGatePath: string
  stageIntegrityGateCsvPath: string
  scratchLineageGatePath: string
  scratchLineageGateCsvPath: string
  architectureFreezeGatePath: string
  architectureFreezeGateCsvPath: string
  architectureFreezeClosurePlanPath: string
  architectureFreezeClosurePlanCsvPath: string
  sourcingWorklistPath: string
  sourcingPackPath: string
  sourcingPackCsvPath: string
  sourcingLedgerPath: string
  sourcingLedgerCsvPath: string
  bomProvenanceManifestPath: string
  bomProvenanceManifestCsvPath: string
  sourceReferenceQualityGatePath: string
  sourceReferenceQualityGateCsvPath: string
  bomEvidenceTracePath: string
  bomEvidenceTraceCsvPath: string
  bomEvidenceClosurePlanPath: string
  bomEvidenceClosurePlanCsvPath: string
  sourcingBatchPlanPath: string
  sourcingBatchPlanCsvPath: string
  procurementReadinessGatePath: string
  procurementReadinessGateCsvPath: string
  bomCostingGatePath: string
  bomCostingGateCsvPath: string
  componentIdentityPath: string
  componentIdentityCsvPath: string
  sourcingIntakeTemplatePath: string
  sourcingIntakeTemplateCsvPath: string
  interfaceGraphPath: string
  interfaceGraphMermaidPath: string
  interfaceContractsPath: string
  interfaceVerificationGatePath: string
  interfaceVerificationGateCsvPath: string
  componentAllocationGatePath: string
  componentAllocationGateCsvPath: string
  subModuleEngineeringGatePath: string
  subModuleEngineeringGateCsvPath: string
  moduleEngineeringGatePath: string
  moduleEngineeringGateCsvPath: string
  moduleReviewPath: string
  engineeringReviewPackPath: string
  engineeringReviewPackCsvPath: string
  engineeringAssuranceMatrixPath: string
  engineeringAssuranceMatrixCsvPath: string
  requirementCoverageGatePath: string
  requirementCoverageGateCsvPath: string
  engineeringCalculationsPath: string
  engineeringCalculationsCsvPath: string
  engineeringAssumptionsPath: string
  engineeringAssumptionsCsvPath: string
  verificationPlanPath: string
  verificationPlanCsvPath: string
  verificationLedgerPath: string
  verificationLedgerCsvPath: string
  verificationIntakeTemplatePath: string
  verificationIntakeTemplateCsvPath: string
  readinessGatePath: string
  readinessGateCsvPath: string
  preBomEngineeringGatePath: string
  preBomEngineeringGateCsvPath: string
  evidenceGapRegisterPath: string
  evidenceGapRegisterCsvPath: string
  evidenceAcquisitionPlanPath: string
  evidenceAcquisitionPlanCsvPath: string
  closurePlanPath: string
  closurePlanCsvPath: string
  claimLedgerPath: string
  claimLedgerCsvPath: string
  claimEvidenceGatePath: string
  claimEvidenceGateCsvPath: string
  documentTrustGatePath: string
  documentTrustGateCsvPath: string
  evidenceAuthenticityGatePath: string
  evidenceAuthenticityGateCsvPath: string
  evidenceReplacementPlanPath: string
  evidenceReplacementPlanCsvPath: string
  trustRepairPlanPath: string
  trustRepairPlanCsvPath: string
  scoreLedgerPath: string
  scoreLedgerCsvPath: string
  depthBenchmarkPath: string
  depthBenchmarkCsvPath: string
  pdfPath?: string
  pdfSkippedReason?: string
}

export interface ArtifactDashboardSummary {
  productClass: string
  briefIntakeVerdict: string
  briefIntakePassRows: number
  briefIntakeRows: number
  briefIntakeRequirements: number
  briefIntakeConfidence: string
  briefClarificationVerdict: string
  briefClarificationRows: number
  briefClarificationRequiredRows: number
  briefClarificationArchitectureBlockingRows: number
  briefClarificationNextQuestion: string | null
  architectureAdmissionVerdict: string
  architectureAdmissionPassRows: number
  architectureAdmissionRows: number
  architectureAdmissionCanReview: boolean
  architectureAdmissionCanProceedToBom: boolean
  architectureAdmissionNextAction: string | null
  componentCandidateVerdict: string
  componentCandidatePassRows: number
  componentCandidateRows: number
  componentCandidateBomLines: number
  componentCandidateWorklistRows: number
  componentCandidateDuplicateGroups: number
  componentCandidateProvenanceViolations: number
  componentCandidateReadyForSourcing: boolean
  sourcingAuthorizationVerdict: string
  sourcingAuthorizationPassRows: number
  sourcingAuthorizationRows: number
  sourcingAuthorized: boolean
  sourcingAuthorizationCriticalIntakeRows: number
  sourcingAuthorizationCriticalUnpricedRows: number
  sourcingAuthorizationFullIntakeRows: number
  sourcingAuthorizationRejectedRows: number
  sourcingAuthorizationNextAction: string | null
  bomAdmissionVerdict: string
  bomAdmissionDisplayMode: string
  bomAdmissionPassRows: number
  bomAdmissionRows: number
  bomAdmissionCanRenderCandidate: boolean
  bomAdmissionCanRenderPriced: boolean
  bomAdmissionCanUseForProcurement: boolean
  bomAdmissionPricedCriticalLines: number
  bomAdmissionCriticalLines: number
  bomAdmissionNextAction: string | null
  stageIntegrityVerdict: string
  stageIntegrityPassRows: number
  stageIntegrityRows: number
  stageIntegrityOrdered: boolean
  scratchLineageVerdict: string
  scratchLineagePassRows: number
  scratchLineageRows: number
  scratchLineageForbiddenRefs: number
  scratchLineageForbiddenStageMentions: number
  scratchLineageSourceRefs: number
  scratchLineageChainBenchmarkUsed: boolean
  scratchLineageBenchmarkSource: string
  scratchLineageNextAction: string | null
  architectureFreezeVerdict: string
  architectureFreezePassRows: number
  architectureFreezeRows: number
  architectureFreezeBlockedRows: number
  architectureFreezeStructurallyReady: boolean
  architectureFreezeReviewAccepted: boolean
  architectureFreezeNextAction: string | null
  architectureFreezeClosureRows: number
  architectureFreezeClosureReadyRows: number
  architectureFreezeClosureBlockedRows: number
  architectureFreezeClosureNextRow: string | null
  architectureFreezeClosureSourcingRows: number
  architectureFreezeClosureEngineeringRows: number
  architectureFreezeClosureVerificationRows: number
  architectureFreezeClosureRevisionRows: number
  verdict: string
  preBomEngineeringVerdict: string
  preBomEngineeringPassRows: number
  preBomEngineeringRows: number
  bomCostingVerdict: string
  bomCostingPassRows: number
  bomCostingRows: number
  bomCostingProductionReadySourceRows: number
  bomCostingProtocolSourceRows: number
  sourceReferenceQualityVerdict: string
  sourceReferenceQualityPassRows: number
  sourceReferenceQualityRows: number
  sourceReferenceQualityBlockedRows: number
  sourceReferenceQualityProtocolRows: number
  sourceReferenceQualityPlaceholderRows: number
  sourceReferenceQualityCandidateExternalRows: number
  bomEvidenceTraceProductionEligibleRows: number
  bomEvidenceTraceProtocolOnlyRows: number
  bomEvidenceTraceBlockedSourceRows: number
  bomEvidenceTraceCriticalUnsourcedRows: number
  bomEvidenceTraceCanUseForProcurement: boolean
  bomEvidenceTraceNextRow: string | null
  bomEvidenceClosureRows: number
  bomEvidenceClosureReadyRows: number
  bomEvidenceClosureBlockedRows: number
  bomEvidenceClosureDeferredRows: number
  bomEvidenceClosureCollectRows: number
  bomEvidenceClosureRepairRows: number
  bomEvidenceClosureProtocolRows: number
  bomEvidenceClosureCandidateRows: number
  bomEvidenceClosureProcurementBlockingRows: number
  bomEvidenceClosureNextRow: string | null
  sourcingBatchPlanBatches: number
  sourcingBatchPlanActiveBatches: number
  sourcingBatchPlanActiveRows: number
  sourcingBatchPlanDeferredRows: number
  sourcingBatchPlanCriticalRows: number
  sourcingBatchPlanRepairRows: number
  sourcingBatchPlanProtocolRows: number
  sourcingBatchPlanNextBatch: string | null
  sourcingBatchPlanNextItem: string | null
  procurementReadinessVerdict: string
  procurementReadinessPassRows: number
  procurementReadinessRows: number
  procurementReadinessBlockedRows: number
  procurementReadinessProductionCriticalRows: number
  procurementReadinessCriticalRows: number
  procurementReadinessBlockingRows: number
  procurementReadinessCanUse: boolean
  procurementReadinessNextAction: string | null
  meanScore: number | null
  moduleCount: number
  subModuleCount: number
  componentWordCount: number
  interfaceVerificationVerdict: string
  interfaceVerificationAcceptedRows: number
  interfaceVerificationRows: number
  componentAllocationVerdict: string
  componentAllocationReadySubModules: number
  componentAllocationSubModules: number
  subModuleEngineeringVerdict: string
  subModuleEngineeringPassRows: number
  subModuleEngineeringRows: number
  subModuleEngineeringBlockedRows: number
  subModuleEngineeringAcceptedReviewQuestions: number
  subModuleEngineeringReviewQuestions: number
  subModuleEngineeringAcceptedVerification: number
  subModuleEngineeringVerification: number
  subModuleEngineeringCriticalUnpricedLines: number
  moduleEngineeringVerdict: string
  moduleEngineeringPassRows: number
  moduleEngineeringRows: number
  moduleEngineeringBlockedRows: number
  moduleEngineeringReviewQuestions: number
  moduleEngineeringAcceptedReviewQuestions: number
  unpricedCriticalLines: number
  sourceBackedClaims: number
  provenanceViolations: number
  verificationAccepted: number
  verificationEligible: number
  evidenceGaps: number
  evidenceGapBlockers: number
  engineeringReviewQuestions: number
  blockedEngineeringReviewQuestions: number
  assuranceRows: number
  blockedAssuranceRows: number
  requirementCoverageVerdict: string
  requirementCoverageRows: number
  requirementCoverageReadyRows: number
  claimRows: number
  sourceRequiredClaims: number
  acceptedClaims: number
  claimEvidenceVerdict: string
  claimEvidenceBlockedClaims: number
  trustVerdict: string
  trustBlockedRows: number
  evidenceAcquisitionRows: number
  evidenceAcquisitionSourcingRows: number
  evidenceAcquisitionVerificationRows: number
  evidenceAuthenticityVerdict: string
  protocolEvidenceRows: number
  productionReadyEvidenceRows: number
  evidenceReplacementRows: number
  evidenceReplacementBomRows: number
  trustRepairPackages: number
  nextTrustRepairPackage: string | null
  sourcingIntakeRows: number
  verificationIntakeRows: number
  engineeringReviewRows: number
  architectureRevisionRows: number
}

export async function writeReportArtifacts(request: ReportArtifactRequest): Promise<ReportArtifactSet> {
  await mkdir(request.outDir, { recursive: true })
  const paths = artifactPaths(request.outDir, request.id)
  const result = request.result
  const briefIntakeGate = buildBriefIntakeGate(result.dossier, result.stageTrace)
  const briefClarificationPlan = buildBriefClarificationPlan(result.dossier, result.stageTrace)
  const architectureAdmissionGate = buildArchitectureAdmissionGate(result.dossier, result.architectureReadiness, result.stageTrace)
  const componentCandidateGate = buildComponentCandidateGate(result.dossier)
  const sourcingAuthorizationGate = buildSourcingAuthorizationGate(result.dossier, result.architectureReadiness, result.stageTrace)
  const bomAdmissionGate = buildBomAdmissionGate(result.dossier, result.architectureReadiness, result.stageTrace)
  const stageIntegrityGate = buildStageIntegrityGate(result.stageTrace, result.dossier, result.architectureReadiness)
  const sourcingPack = buildSourcingEvidencePack(result.dossier)
  const sourcingLedger = buildSourcingLineLedger(result.dossier)
  const bomProvenanceManifest = buildBomProvenanceManifest(result.dossier)
  const sourceReferenceQualityGate = buildSourceReferenceQualityGate(result.dossier)
  const bomEvidenceTrace = buildBomEvidenceTraceMatrix(result.dossier)
  const bomEvidenceClosurePlan = buildBomEvidenceClosurePlan(result.dossier)
  const sourcingBatchPlan = buildSourcingBatchPlan(result.dossier)
  const bomCostingGate = buildBomCostingGate(result.dossier)
  const componentIdentity = buildComponentIdentityWorklist(result.dossier.bom)
  const sourcingIntakeTemplate = buildSourcingIntakeTemplate(result.dossier)
  const interfaceGraph = buildInterfaceGraph(result.dossier, result.architectureReadiness)
  const interfaceContracts = buildInterfaceContractMatrix(result.dossier, result.architectureReadiness)
  const interfaceVerificationGate = buildInterfaceVerificationGate(result.dossier, result.architectureReadiness, result.issues)
  const componentAllocationGate = buildComponentAllocationGate(result.dossier)
  const subModuleEngineeringGate = buildSubModuleEngineeringGate(result.dossier, result.architectureReadiness, result.issues)
  const moduleEngineeringGate = buildModuleEngineeringGate(result.dossier, result.architectureReadiness, result.issues)
  const moduleReview = buildModuleReview(result.dossier, result.architectureReadiness, result.issues)
  const engineeringReviewPack = buildEngineeringReviewPack(result.dossier, result.architectureReadiness, result.issues)
  const engineeringAssuranceMatrix = buildEngineeringAssuranceMatrix(result.dossier, result.architectureReadiness, result.issues)
  const requirementCoverageGate = buildRequirementCoverageGate(result.dossier, result.architectureReadiness, result.issues)
  const engineeringCalculations = buildEngineeringCalculationLedger(result.dossier)
  const engineeringAssumptions = buildEngineeringAssumptionLedger(result.dossier, result.architectureReadiness)
  const verificationPlan = buildEngineeringVerificationPlan(result.dossier, result.architectureReadiness, result.issues)
  const verificationLedger = buildVerificationEvidenceLedger(verificationPlan, result.dossier.sources.verificationEvidence)
  const verificationIntakeTemplate = buildVerificationIntakeTemplate(verificationPlan)
  const readinessGate = buildReportReadinessGate(result.dossier, result.architectureReadiness, result.issues, result.score)
  const preBomEngineeringGate = buildPreBomEngineeringGate(result.dossier, result.architectureReadiness, result.issues)
  const evidenceGapRegister = buildEvidenceGapRegister(result.dossier, result.architectureReadiness, result.issues, result.score)
  const evidenceAcquisitionPlan = buildEvidenceAcquisitionPlan(result.dossier, result.architectureReadiness, result.issues, result.score)
  const closurePlan = buildClosurePlan(result.dossier, result.architectureReadiness, result.issues, result.score)
  const claimLedger = buildClaimLedger(result.dossier, result.architectureReadiness, result.issues)
  const claimEvidenceGate = buildClaimEvidenceGate(result.dossier, result.architectureReadiness, result.issues)
  const documentTrustGate = buildDocumentTrustGate(result.dossier, result.architectureReadiness, result.issues, result.score)
  const evidenceAuthenticityGate = buildEvidenceAuthenticityGate(result.dossier)
  const evidenceReplacementPlan = buildEvidenceReplacementPlan(result.dossier)
  const trustRepairPlan = buildTrustRepairPlan(result.dossier, result.architectureReadiness, result.issues, result.score)
  const scoreLedger = buildSectionScoreLedger(result.issues)
  const depthBenchmark = buildDepthBenchmark(result.dossier, result.architectureReadiness, result.issues, result.score, request.depthBenchmarkSource)
  const procurementReadinessGate = buildProcurementReadinessGate(result.dossier, result.architectureReadiness, result.stageTrace, result.issues, depthBenchmark)
  const scratchLineageGate = buildScratchLineageGate(result.dossier, result.stageTrace, depthBenchmark)
  const architectureFreezeGate = buildArchitectureFreezeGate(result.dossier, result.architectureReadiness, result.stageTrace, result.issues, depthBenchmark)
  const architectureFreezeClosurePlan = buildArchitectureFreezeClosurePlan(result.dossier, result.architectureReadiness, result.stageTrace, result.issues, depthBenchmark)
  const html = renderReportHtml(result.dossier, result.issues, result.architectureReadiness, result.score, result.stageTrace, depthBenchmark)

  await writeFile(paths.htmlPath, html, 'utf8')
  await writeFile(paths.markdownPath, result.outline, 'utf8')
  await writeFile(paths.jsonPath, JSON.stringify(result, null, 2), 'utf8')
  await writeFile(paths.briefIntakeGatePath, JSON.stringify(briefIntakeGate, null, 2), 'utf8')
  await writeFile(paths.briefIntakeGateCsvPath, renderBriefIntakeGateCsv(briefIntakeGate), 'utf8')
  await writeFile(paths.briefClarificationPlanPath, JSON.stringify(briefClarificationPlan, null, 2), 'utf8')
  await writeFile(paths.briefClarificationPlanCsvPath, renderBriefClarificationPlanCsv(briefClarificationPlan), 'utf8')
  await writeFile(paths.architectureAdmissionGatePath, JSON.stringify(architectureAdmissionGate, null, 2), 'utf8')
  await writeFile(paths.architectureAdmissionGateCsvPath, renderArchitectureAdmissionGateCsv(architectureAdmissionGate), 'utf8')
  await writeFile(paths.componentCandidateGatePath, JSON.stringify(componentCandidateGate, null, 2), 'utf8')
  await writeFile(paths.componentCandidateGateCsvPath, renderComponentCandidateGateCsv(componentCandidateGate), 'utf8')
  await writeFile(paths.sourcingAuthorizationGatePath, JSON.stringify(sourcingAuthorizationGate, null, 2), 'utf8')
  await writeFile(paths.sourcingAuthorizationGateCsvPath, renderSourcingAuthorizationGateCsv(sourcingAuthorizationGate), 'utf8')
  await writeFile(paths.bomAdmissionGatePath, JSON.stringify(bomAdmissionGate, null, 2), 'utf8')
  await writeFile(paths.bomAdmissionGateCsvPath, renderBomAdmissionGateCsv(bomAdmissionGate), 'utf8')
  await writeFile(paths.stageIntegrityGatePath, JSON.stringify(stageIntegrityGate, null, 2), 'utf8')
  await writeFile(paths.stageIntegrityGateCsvPath, renderStageIntegrityGateCsv(stageIntegrityGate), 'utf8')
  await writeFile(paths.scratchLineageGatePath, JSON.stringify(scratchLineageGate, null, 2), 'utf8')
  await writeFile(paths.scratchLineageGateCsvPath, renderScratchLineageGateCsv(scratchLineageGate), 'utf8')
  await writeFile(paths.architectureFreezeGatePath, JSON.stringify(architectureFreezeGate, null, 2), 'utf8')
  await writeFile(paths.architectureFreezeGateCsvPath, renderArchitectureFreezeGateCsv(architectureFreezeGate), 'utf8')
  await writeFile(paths.architectureFreezeClosurePlanPath, JSON.stringify(architectureFreezeClosurePlan, null, 2), 'utf8')
  await writeFile(paths.architectureFreezeClosurePlanCsvPath, renderArchitectureFreezeClosurePlanCsv(architectureFreezeClosurePlan), 'utf8')
  await writeFile(paths.sourcingWorklistPath, JSON.stringify(buildSourcingWorklist(result.dossier), null, 2), 'utf8')
  await writeFile(paths.sourcingPackPath, JSON.stringify(sourcingPack, null, 2), 'utf8')
  await writeFile(paths.sourcingPackCsvPath, renderSourcingEvidencePackCsv(sourcingPack), 'utf8')
  await writeFile(paths.sourcingLedgerPath, JSON.stringify(sourcingLedger, null, 2), 'utf8')
  await writeFile(paths.sourcingLedgerCsvPath, renderSourcingLineLedgerCsv(sourcingLedger), 'utf8')
  await writeFile(paths.bomProvenanceManifestPath, JSON.stringify(bomProvenanceManifest, null, 2), 'utf8')
  await writeFile(paths.bomProvenanceManifestCsvPath, renderBomProvenanceManifestCsv(bomProvenanceManifest), 'utf8')
  await writeFile(paths.sourceReferenceQualityGatePath, JSON.stringify(sourceReferenceQualityGate, null, 2), 'utf8')
  await writeFile(paths.sourceReferenceQualityGateCsvPath, renderSourceReferenceQualityGateCsv(sourceReferenceQualityGate), 'utf8')
  await writeFile(paths.bomEvidenceTracePath, JSON.stringify(bomEvidenceTrace, null, 2), 'utf8')
  await writeFile(paths.bomEvidenceTraceCsvPath, renderBomEvidenceTraceMatrixCsv(bomEvidenceTrace), 'utf8')
  await writeFile(paths.bomEvidenceClosurePlanPath, JSON.stringify(bomEvidenceClosurePlan, null, 2), 'utf8')
  await writeFile(paths.bomEvidenceClosurePlanCsvPath, renderBomEvidenceClosurePlanCsv(bomEvidenceClosurePlan), 'utf8')
  await writeFile(paths.sourcingBatchPlanPath, JSON.stringify(sourcingBatchPlan, null, 2), 'utf8')
  await writeFile(paths.sourcingBatchPlanCsvPath, renderSourcingBatchPlanCsv(sourcingBatchPlan), 'utf8')
  await writeFile(paths.procurementReadinessGatePath, JSON.stringify(procurementReadinessGate, null, 2), 'utf8')
  await writeFile(paths.procurementReadinessGateCsvPath, renderProcurementReadinessGateCsv(procurementReadinessGate), 'utf8')
  await writeFile(paths.bomCostingGatePath, JSON.stringify(bomCostingGate, null, 2), 'utf8')
  await writeFile(paths.bomCostingGateCsvPath, renderBomCostingGateCsv(bomCostingGate), 'utf8')
  await writeFile(paths.componentIdentityPath, JSON.stringify(componentIdentity, null, 2), 'utf8')
  await writeFile(paths.componentIdentityCsvPath, renderComponentIdentityWorklistCsv(componentIdentity), 'utf8')
  await writeFile(paths.sourcingIntakeTemplatePath, JSON.stringify(sourcingIntakeTemplate, null, 2), 'utf8')
  await writeFile(paths.sourcingIntakeTemplateCsvPath, renderSourcingIntakeTemplateCsv(sourcingIntakeTemplate), 'utf8')
  await writeFile(paths.interfaceGraphPath, JSON.stringify(interfaceGraph, null, 2), 'utf8')
  await writeFile(paths.interfaceGraphMermaidPath, renderInterfaceGraphMermaid(interfaceGraph), 'utf8')
  await writeFile(paths.interfaceContractsPath, JSON.stringify(interfaceContracts, null, 2), 'utf8')
  await writeFile(paths.interfaceVerificationGatePath, JSON.stringify(interfaceVerificationGate, null, 2), 'utf8')
  await writeFile(paths.interfaceVerificationGateCsvPath, renderInterfaceVerificationGateCsv(interfaceVerificationGate), 'utf8')
  await writeFile(paths.componentAllocationGatePath, JSON.stringify(componentAllocationGate, null, 2), 'utf8')
  await writeFile(paths.componentAllocationGateCsvPath, renderComponentAllocationGateCsv(componentAllocationGate), 'utf8')
  await writeFile(paths.subModuleEngineeringGatePath, JSON.stringify(subModuleEngineeringGate, null, 2), 'utf8')
  await writeFile(paths.subModuleEngineeringGateCsvPath, renderSubModuleEngineeringGateCsv(subModuleEngineeringGate), 'utf8')
  await writeFile(paths.moduleEngineeringGatePath, JSON.stringify(moduleEngineeringGate, null, 2), 'utf8')
  await writeFile(paths.moduleEngineeringGateCsvPath, renderModuleEngineeringGateCsv(moduleEngineeringGate), 'utf8')
  await writeFile(paths.moduleReviewPath, JSON.stringify(moduleReview, null, 2), 'utf8')
  await writeFile(paths.engineeringReviewPackPath, JSON.stringify(engineeringReviewPack, null, 2), 'utf8')
  await writeFile(paths.engineeringReviewPackCsvPath, renderEngineeringReviewPackCsv(engineeringReviewPack), 'utf8')
  await writeFile(paths.engineeringAssuranceMatrixPath, JSON.stringify(engineeringAssuranceMatrix, null, 2), 'utf8')
  await writeFile(paths.engineeringAssuranceMatrixCsvPath, renderEngineeringAssuranceMatrixCsv(engineeringAssuranceMatrix), 'utf8')
  await writeFile(paths.requirementCoverageGatePath, JSON.stringify(requirementCoverageGate, null, 2), 'utf8')
  await writeFile(paths.requirementCoverageGateCsvPath, renderRequirementCoverageGateCsv(requirementCoverageGate), 'utf8')
  await writeFile(paths.engineeringCalculationsPath, JSON.stringify(engineeringCalculations, null, 2), 'utf8')
  await writeFile(paths.engineeringCalculationsCsvPath, renderEngineeringCalculationLedgerCsv(engineeringCalculations), 'utf8')
  await writeFile(paths.engineeringAssumptionsPath, JSON.stringify(engineeringAssumptions, null, 2), 'utf8')
  await writeFile(paths.engineeringAssumptionsCsvPath, renderEngineeringAssumptionLedgerCsv(engineeringAssumptions), 'utf8')
  await writeFile(paths.verificationPlanPath, JSON.stringify(verificationPlan, null, 2), 'utf8')
  await writeFile(paths.verificationPlanCsvPath, renderEngineeringVerificationPlanCsv(verificationPlan), 'utf8')
  await writeFile(paths.verificationLedgerPath, JSON.stringify(verificationLedger, null, 2), 'utf8')
  await writeFile(paths.verificationLedgerCsvPath, renderVerificationEvidenceLedgerCsv(verificationLedger), 'utf8')
  await writeFile(paths.verificationIntakeTemplatePath, JSON.stringify(verificationIntakeTemplate, null, 2), 'utf8')
  await writeFile(paths.verificationIntakeTemplateCsvPath, renderVerificationIntakeTemplateCsv(verificationIntakeTemplate), 'utf8')
  await writeFile(paths.readinessGatePath, JSON.stringify(readinessGate, null, 2), 'utf8')
  await writeFile(paths.readinessGateCsvPath, renderReportReadinessGateCsv(readinessGate), 'utf8')
  await writeFile(paths.preBomEngineeringGatePath, JSON.stringify(preBomEngineeringGate, null, 2), 'utf8')
  await writeFile(paths.preBomEngineeringGateCsvPath, renderPreBomEngineeringGateCsv(preBomEngineeringGate), 'utf8')
  await writeFile(paths.evidenceGapRegisterPath, JSON.stringify(evidenceGapRegister, null, 2), 'utf8')
  await writeFile(paths.evidenceGapRegisterCsvPath, renderEvidenceGapRegisterCsv(evidenceGapRegister), 'utf8')
  await writeFile(paths.evidenceAcquisitionPlanPath, JSON.stringify(evidenceAcquisitionPlan, null, 2), 'utf8')
  await writeFile(paths.evidenceAcquisitionPlanCsvPath, renderEvidenceAcquisitionPlanCsv(evidenceAcquisitionPlan), 'utf8')
  await writeFile(paths.closurePlanPath, JSON.stringify(closurePlan, null, 2), 'utf8')
  await writeFile(paths.closurePlanCsvPath, renderClosurePlanCsv(closurePlan), 'utf8')
  await writeFile(paths.claimLedgerPath, JSON.stringify(claimLedger, null, 2), 'utf8')
  await writeFile(paths.claimLedgerCsvPath, renderClaimLedgerCsv(claimLedger), 'utf8')
  await writeFile(paths.claimEvidenceGatePath, JSON.stringify(claimEvidenceGate, null, 2), 'utf8')
  await writeFile(paths.claimEvidenceGateCsvPath, renderClaimEvidenceGateCsv(claimEvidenceGate), 'utf8')
  await writeFile(paths.documentTrustGatePath, JSON.stringify(documentTrustGate, null, 2), 'utf8')
  await writeFile(paths.documentTrustGateCsvPath, renderDocumentTrustGateCsv(documentTrustGate), 'utf8')
  await writeFile(paths.evidenceAuthenticityGatePath, JSON.stringify(evidenceAuthenticityGate, null, 2), 'utf8')
  await writeFile(paths.evidenceAuthenticityGateCsvPath, renderEvidenceAuthenticityGateCsv(evidenceAuthenticityGate), 'utf8')
  await writeFile(paths.evidenceReplacementPlanPath, JSON.stringify(evidenceReplacementPlan, null, 2), 'utf8')
  await writeFile(paths.evidenceReplacementPlanCsvPath, renderEvidenceReplacementPlanCsv(evidenceReplacementPlan), 'utf8')
  await writeFile(paths.trustRepairPlanPath, JSON.stringify(trustRepairPlan, null, 2), 'utf8')
  await writeFile(paths.trustRepairPlanCsvPath, renderTrustRepairPlanCsv(trustRepairPlan), 'utf8')
  await writeFile(paths.scoreLedgerPath, JSON.stringify(scoreLedger, null, 2), 'utf8')
  await writeFile(paths.scoreLedgerCsvPath, renderSectionScoreLedgerCsv(scoreLedger), 'utf8')
  await writeFile(paths.depthBenchmarkPath, JSON.stringify(depthBenchmark, null, 2), 'utf8')
  await writeFile(paths.depthBenchmarkCsvPath, renderDepthBenchmarkCsv(depthBenchmark), 'utf8')

  const artifact: ReportArtifactSet = {
    id: request.id,
    title: request.title,
    summary: buildArtifactDashboardSummary(result, readinessGate, bomProvenanceManifest, evidenceGapRegister, depthBenchmark),
    ...paths,
  }
  if (request.writePdf ?? true) await writePdf(artifact)
  return artifact
}

export function buildArtifactDashboardSummary(
  result: ReportRunResult,
  readinessGate: ReportReadinessGate,
  bomProvenanceManifest: BomProvenanceManifest,
  evidenceGapRegister: EvidenceGapRegister,
  depthBenchmark?: DepthBenchmarkModel,
): ArtifactDashboardSummary {
  const engineeringReviewPack = buildEngineeringReviewPack(result.dossier, result.architectureReadiness, result.issues)
  const engineeringAssuranceMatrix = buildEngineeringAssuranceMatrix(result.dossier, result.architectureReadiness, result.issues)
  const briefIntakeGate = buildBriefIntakeGate(result.dossier, result.stageTrace)
  const briefClarificationPlan = buildBriefClarificationPlan(result.dossier, result.stageTrace)
  const architectureAdmissionGate = buildArchitectureAdmissionGate(result.dossier, result.architectureReadiness, result.stageTrace)
  const componentCandidateGate = buildComponentCandidateGate(result.dossier)
  const sourcingAuthorizationGate = buildSourcingAuthorizationGate(result.dossier, result.architectureReadiness, result.stageTrace)
  const bomAdmissionGate = buildBomAdmissionGate(result.dossier, result.architectureReadiness, result.stageTrace)
  const stageIntegrityGate = buildStageIntegrityGate(result.stageTrace, result.dossier, result.architectureReadiness)
  const preBomEngineeringGate = buildPreBomEngineeringGate(result.dossier, result.architectureReadiness, result.issues)
  const requirementCoverageGate = buildRequirementCoverageGate(result.dossier, result.architectureReadiness, result.issues)
  const bomCostingGate = buildBomCostingGate(result.dossier)
  const sourceReferenceQualityGate = buildSourceReferenceQualityGate(result.dossier)
  const bomEvidenceTrace = buildBomEvidenceTraceMatrix(result.dossier)
  const bomEvidenceClosurePlan = buildBomEvidenceClosurePlan(result.dossier)
  const sourcingBatchPlan = buildSourcingBatchPlan(result.dossier)
  const procurementReadinessGate = buildProcurementReadinessGate(result.dossier, result.architectureReadiness, result.stageTrace, result.issues, depthBenchmark)
  const interfaceVerificationGate = buildInterfaceVerificationGate(result.dossier, result.architectureReadiness, result.issues)
  const componentAllocationGate = buildComponentAllocationGate(result.dossier)
  const subModuleEngineeringGate = buildSubModuleEngineeringGate(result.dossier, result.architectureReadiness, result.issues)
  const moduleEngineeringGate = buildModuleEngineeringGate(result.dossier, result.architectureReadiness, result.issues)
  const claimLedger = buildClaimLedger(result.dossier, result.architectureReadiness, result.issues)
  const claimEvidenceGate = buildClaimEvidenceGate(result.dossier, result.architectureReadiness, result.issues)
  const documentTrustGate = buildDocumentTrustGate(result.dossier, result.architectureReadiness, result.issues, result.score)
  const evidenceAcquisitionPlan = buildEvidenceAcquisitionPlan(result.dossier, result.architectureReadiness, result.issues, result.score)
  const evidenceAuthenticityGate = buildEvidenceAuthenticityGate(result.dossier)
  const evidenceReplacementPlan = buildEvidenceReplacementPlan(result.dossier)
  const trustRepairPlan = buildTrustRepairPlan(result.dossier, result.architectureReadiness, result.issues, result.score)
  const scratchLineageGate = buildScratchLineageGate(result.dossier, result.stageTrace, depthBenchmark)
  const architectureFreezeGate = buildArchitectureFreezeGate(result.dossier, result.architectureReadiness, result.stageTrace, result.issues, depthBenchmark)
  const architectureFreezeClosurePlan = buildArchitectureFreezeClosurePlan(result.dossier, result.architectureReadiness, result.stageTrace, result.issues, depthBenchmark)
  return {
    productClass: result.dossier.productClass,
    briefIntakeVerdict: briefIntakeGate.verdict,
    briefIntakePassRows: briefIntakeGate.summary.passRows,
    briefIntakeRows: briefIntakeGate.summary.rows,
    briefIntakeRequirements: briefIntakeGate.summary.extractedRequirements,
    briefIntakeConfidence: briefIntakeGate.summary.classificationConfidence,
    briefClarificationVerdict: briefClarificationPlan.verdict,
    briefClarificationRows: briefClarificationPlan.summary.rows,
    briefClarificationRequiredRows: briefClarificationPlan.summary.requiredRows,
    briefClarificationArchitectureBlockingRows: briefClarificationPlan.summary.architectureBlockingRows,
    briefClarificationNextQuestion: briefClarificationPlan.summary.nextQuestionId,
    architectureAdmissionVerdict: architectureAdmissionGate.verdict,
    architectureAdmissionPassRows: architectureAdmissionGate.summary.passRows,
    architectureAdmissionRows: architectureAdmissionGate.summary.rows,
    architectureAdmissionCanReview: architectureAdmissionGate.summary.architectureCanBeUsedForReview,
    architectureAdmissionCanProceedToBom: architectureAdmissionGate.summary.architectureCanProceedToBom,
    architectureAdmissionNextAction: architectureAdmissionGate.summary.nextAction,
    componentCandidateVerdict: componentCandidateGate.verdict,
    componentCandidatePassRows: componentCandidateGate.summary.passRows,
    componentCandidateRows: componentCandidateGate.summary.rows,
    componentCandidateBomLines: componentCandidateGate.summary.bomLines,
    componentCandidateWorklistRows: componentCandidateGate.summary.candidateWorklistRows,
    componentCandidateDuplicateGroups: componentCandidateGate.summary.duplicateComponentGroups,
    componentCandidateProvenanceViolations: componentCandidateGate.summary.provenanceViolations,
    componentCandidateReadyForSourcing: componentCandidateGate.summary.readyForSourcing,
    sourcingAuthorizationVerdict: sourcingAuthorizationGate.verdict,
    sourcingAuthorizationPassRows: sourcingAuthorizationGate.summary.passRows,
    sourcingAuthorizationRows: sourcingAuthorizationGate.summary.rows,
    sourcingAuthorized: sourcingAuthorizationGate.summary.sourcingAuthorized,
    sourcingAuthorizationCriticalIntakeRows: sourcingAuthorizationGate.summary.criticalIntakeRows,
    sourcingAuthorizationCriticalUnpricedRows: sourcingAuthorizationGate.summary.criticalUnpricedRows,
    sourcingAuthorizationFullIntakeRows: sourcingAuthorizationGate.summary.fullIntakeRows,
    sourcingAuthorizationRejectedRows: sourcingAuthorizationGate.summary.rejectedSourcingEvidenceRows,
    sourcingAuthorizationNextAction: sourcingAuthorizationGate.summary.nextAction,
    bomAdmissionVerdict: bomAdmissionGate.verdict,
    bomAdmissionDisplayMode: bomAdmissionGate.summary.displayMode,
    bomAdmissionPassRows: bomAdmissionGate.summary.passRows,
    bomAdmissionRows: bomAdmissionGate.summary.rows,
    bomAdmissionCanRenderCandidate: bomAdmissionGate.summary.canRenderCandidateBom,
    bomAdmissionCanRenderPriced: bomAdmissionGate.summary.canRenderPricedBom,
    bomAdmissionCanUseForProcurement: bomAdmissionGate.summary.canUseForProcurement,
    bomAdmissionPricedCriticalLines: bomAdmissionGate.summary.pricedCriticalLines,
    bomAdmissionCriticalLines: bomAdmissionGate.summary.criticalBomLines,
    bomAdmissionNextAction: bomAdmissionGate.summary.nextAction,
    stageIntegrityVerdict: stageIntegrityGate.verdict,
    stageIntegrityPassRows: stageIntegrityGate.summary.passRows,
    stageIntegrityRows: stageIntegrityGate.summary.rows,
    stageIntegrityOrdered: stageIntegrityGate.summary.orderedStages,
    scratchLineageVerdict: scratchLineageGate.verdict,
    scratchLineagePassRows: scratchLineageGate.summary.passRows,
    scratchLineageRows: scratchLineageGate.summary.rows,
    scratchLineageForbiddenRefs: scratchLineageGate.summary.forbiddenRefs,
    scratchLineageForbiddenStageMentions: scratchLineageGate.summary.forbiddenStageMentions,
    scratchLineageSourceRefs: scratchLineageGate.summary.sourceRefs,
    scratchLineageChainBenchmarkUsed: scratchLineageGate.summary.chainBenchmarkUsed,
    scratchLineageBenchmarkSource: scratchLineageGate.summary.benchmarkSource,
    scratchLineageNextAction: scratchLineageGate.summary.nextAction,
    architectureFreezeVerdict: architectureFreezeGate.verdict,
    architectureFreezePassRows: architectureFreezeGate.summary.passRows,
    architectureFreezeRows: architectureFreezeGate.summary.rows,
    architectureFreezeBlockedRows: architectureFreezeGate.summary.blockedRows,
    architectureFreezeStructurallyReady: architectureFreezeGate.summary.structurallyReadyForSourcing,
    architectureFreezeReviewAccepted: architectureFreezeGate.summary.independentReviewAccepted,
    architectureFreezeNextAction: architectureFreezeGate.summary.nextAction,
    architectureFreezeClosureRows: architectureFreezeClosurePlan.summary.rows,
    architectureFreezeClosureReadyRows: architectureFreezeClosurePlan.summary.readyRows,
    architectureFreezeClosureBlockedRows: architectureFreezeClosurePlan.summary.blockedRows,
    architectureFreezeClosureNextRow: architectureFreezeClosurePlan.summary.nextRowId,
    architectureFreezeClosureSourcingRows: architectureFreezeClosurePlan.summary.sourcingIntakeRows,
    architectureFreezeClosureEngineeringRows: architectureFreezeClosurePlan.summary.engineeringReviewRows,
    architectureFreezeClosureVerificationRows: architectureFreezeClosurePlan.summary.verificationIntakeRows,
    architectureFreezeClosureRevisionRows: architectureFreezeClosurePlan.summary.architectureRevisionRows,
    verdict: readinessGate.verdict,
    preBomEngineeringVerdict: preBomEngineeringGate.verdict,
    preBomEngineeringPassRows: preBomEngineeringGate.summary.passRows,
    preBomEngineeringRows: preBomEngineeringGate.summary.rows,
    bomCostingVerdict: bomCostingGate.verdict,
    bomCostingPassRows: bomCostingGate.summary.passRows,
    bomCostingRows: bomCostingGate.summary.rows,
    bomCostingProductionReadySourceRows: bomCostingGate.summary.productionReadySourcingEvidenceRows,
    bomCostingProtocolSourceRows: bomCostingGate.summary.protocolSourcingEvidenceRows,
    sourceReferenceQualityVerdict: sourceReferenceQualityGate.verdict,
    sourceReferenceQualityPassRows: sourceReferenceQualityGate.summary.passRows,
    sourceReferenceQualityRows: sourceReferenceQualityGate.summary.rows,
    sourceReferenceQualityBlockedRows: sourceReferenceQualityGate.summary.blockedRows,
    sourceReferenceQualityProtocolRows: sourceReferenceQualityGate.summary.protocolFixtureRows,
    sourceReferenceQualityPlaceholderRows: sourceReferenceQualityGate.summary.placeholderUrlRows,
    sourceReferenceQualityCandidateExternalRows: sourceReferenceQualityGate.summary.candidateExternalUrlRows,
    bomEvidenceTraceProductionEligibleRows: bomEvidenceTrace.summary.productionEligibleRows,
    bomEvidenceTraceProtocolOnlyRows: bomEvidenceTrace.summary.protocolOnlyRows,
    bomEvidenceTraceBlockedSourceRows: bomEvidenceTrace.summary.sourceReferenceBlockedRows,
    bomEvidenceTraceCriticalUnsourcedRows: bomEvidenceTrace.summary.criticalUnsourcedRows,
    bomEvidenceTraceCanUseForProcurement: bomEvidenceTrace.summary.canUseForProcurement,
    bomEvidenceTraceNextRow: bomEvidenceTrace.summary.nextRowId,
    bomEvidenceClosureRows: bomEvidenceClosurePlan.summary.closureRows,
    bomEvidenceClosureReadyRows: bomEvidenceClosurePlan.summary.readyRows,
    bomEvidenceClosureBlockedRows: bomEvidenceClosurePlan.summary.blockedRows,
    bomEvidenceClosureDeferredRows: bomEvidenceClosurePlan.summary.deferredRows,
    bomEvidenceClosureCollectRows: bomEvidenceClosurePlan.summary.collectSourceRows,
    bomEvidenceClosureRepairRows: bomEvidenceClosurePlan.summary.repairReferenceRows + bomEvidenceClosurePlan.summary.repairRejectedRows,
    bomEvidenceClosureProtocolRows: bomEvidenceClosurePlan.summary.replaceProtocolRows,
    bomEvidenceClosureCandidateRows: bomEvidenceClosurePlan.summary.deferCandidateRows,
    bomEvidenceClosureProcurementBlockingRows: bomEvidenceClosurePlan.summary.procurementBlockingRows,
    bomEvidenceClosureNextRow: bomEvidenceClosurePlan.summary.nextRowId,
    sourcingBatchPlanBatches: sourcingBatchPlan.summary.batches,
    sourcingBatchPlanActiveBatches: sourcingBatchPlan.summary.activeBatches,
    sourcingBatchPlanActiveRows: sourcingBatchPlan.summary.activeRows,
    sourcingBatchPlanDeferredRows: sourcingBatchPlan.summary.deferredRows,
    sourcingBatchPlanCriticalRows: sourcingBatchPlan.summary.criticalSourceRows,
    sourcingBatchPlanRepairRows: sourcingBatchPlan.summary.repairRows,
    sourcingBatchPlanProtocolRows: sourcingBatchPlan.summary.protocolReplacementRows,
    sourcingBatchPlanNextBatch: sourcingBatchPlan.summary.nextBatchId,
    sourcingBatchPlanNextItem: sourcingBatchPlan.summary.nextItemId,
    procurementReadinessVerdict: procurementReadinessGate.verdict,
    procurementReadinessPassRows: procurementReadinessGate.summary.passRows,
    procurementReadinessRows: procurementReadinessGate.summary.rows,
    procurementReadinessBlockedRows: procurementReadinessGate.summary.blockedRows,
    procurementReadinessProductionCriticalRows: procurementReadinessGate.summary.productionEligibleCriticalRows,
    procurementReadinessCriticalRows: procurementReadinessGate.summary.criticalRows,
    procurementReadinessBlockingRows: procurementReadinessGate.summary.procurementBlockingRows,
    procurementReadinessCanUse: procurementReadinessGate.summary.canUseForProcurement,
    procurementReadinessNextAction: procurementReadinessGate.summary.nextAction,
    meanScore: readinessGate.summary.meanScore,
    moduleCount: result.architectureReadiness.moduleCount,
    subModuleCount: result.architectureReadiness.subModuleCount,
    componentWordCount: result.architectureReadiness.componentWordCount,
    interfaceVerificationVerdict: interfaceVerificationGate.verdict,
    interfaceVerificationAcceptedRows: interfaceVerificationGate.summary.acceptedRows,
    interfaceVerificationRows: interfaceVerificationGate.summary.rows,
    componentAllocationVerdict: componentAllocationGate.verdict,
    componentAllocationReadySubModules: componentAllocationGate.summary.readySubModules,
    componentAllocationSubModules: componentAllocationGate.summary.subModules,
    subModuleEngineeringVerdict: subModuleEngineeringGate.verdict,
    subModuleEngineeringPassRows: subModuleEngineeringGate.summary.passRows,
    subModuleEngineeringRows: subModuleEngineeringGate.summary.rows,
    subModuleEngineeringBlockedRows: subModuleEngineeringGate.summary.blockedRows,
    subModuleEngineeringAcceptedReviewQuestions: subModuleEngineeringGate.summary.acceptedReviewQuestions,
    subModuleEngineeringReviewQuestions: subModuleEngineeringGate.summary.reviewQuestions,
    subModuleEngineeringAcceptedVerification: subModuleEngineeringGate.summary.acceptedVerificationActivities,
    subModuleEngineeringVerification: subModuleEngineeringGate.summary.verificationActivities,
    subModuleEngineeringCriticalUnpricedLines: subModuleEngineeringGate.summary.criticalUnpricedLines,
    moduleEngineeringVerdict: moduleEngineeringGate.verdict,
    moduleEngineeringPassRows: moduleEngineeringGate.summary.passRows,
    moduleEngineeringRows: moduleEngineeringGate.summary.modules,
    moduleEngineeringBlockedRows: moduleEngineeringGate.summary.blockedRows,
    moduleEngineeringReviewQuestions: moduleEngineeringGate.summary.reviewQuestions,
    moduleEngineeringAcceptedReviewQuestions: moduleEngineeringGate.summary.acceptedReviewQuestions,
    unpricedCriticalLines: readinessGate.summary.unpricedCriticalLines,
    sourceBackedClaims: bomProvenanceManifest.summary.sourceBackedClaims,
    provenanceViolations: bomProvenanceManifest.summary.provenanceViolations,
    verificationAccepted: readinessGate.summary.verificationAcceptedActivities,
    verificationEligible: readinessGate.summary.verificationEvidenceEligibleActivities,
    evidenceGaps: evidenceGapRegister.summary.rows,
    evidenceGapBlockers: evidenceGapRegister.summary.blockers,
    engineeringReviewQuestions: engineeringReviewPack.summary.rows,
    blockedEngineeringReviewQuestions: engineeringReviewPack.summary.blocked,
    assuranceRows: engineeringAssuranceMatrix.summary.rows,
    blockedAssuranceRows: engineeringAssuranceMatrix.summary.blocked,
    requirementCoverageVerdict: requirementCoverageGate.verdict,
    requirementCoverageRows: requirementCoverageGate.summary.rows,
    requirementCoverageReadyRows: requirementCoverageGate.summary.acceptedEvidenceRows + requirementCoverageGate.summary.reviewReadyRows,
    claimRows: claimLedger.summary.rows,
    sourceRequiredClaims: claimLedger.summary.sourceRequired,
    acceptedClaims: claimLedger.summary.accepted + claimLedger.summary.sourceBacked,
    claimEvidenceVerdict: claimEvidenceGate.verdict,
    claimEvidenceBlockedClaims: claimEvidenceGate.summary.blockedClaims,
    trustVerdict: documentTrustGate.verdict,
    trustBlockedRows: documentTrustGate.summary.blockedRows,
    evidenceAcquisitionRows: evidenceAcquisitionPlan.summary.rows,
    evidenceAcquisitionSourcingRows: evidenceAcquisitionPlan.summary.sourcingRows,
    evidenceAcquisitionVerificationRows: evidenceAcquisitionPlan.summary.verificationRows,
    evidenceAuthenticityVerdict: evidenceAuthenticityGate.verdict,
    protocolEvidenceRows: evidenceAuthenticityGate.summary.protocolFixtureRows,
    productionReadyEvidenceRows: evidenceAuthenticityGate.summary.productionReadyRows,
    evidenceReplacementRows: evidenceReplacementPlan.summary.rows,
    evidenceReplacementBomRows: evidenceReplacementPlan.summary.blocksBomRows,
    trustRepairPackages: trustRepairPlan.summary.packages,
    nextTrustRepairPackage: trustRepairPlan.summary.nextPackage,
    sourcingIntakeRows: evidenceGapRegister.summary.sourcingIntakeRows,
    verificationIntakeRows: evidenceGapRegister.summary.verificationIntakeRows,
    engineeringReviewRows: evidenceGapRegister.summary.engineeringReviewRows,
    architectureRevisionRows: evidenceGapRegister.summary.architectureRevisionRows,
  }
}

export function renderReportArtifactIndex(artifacts: ReportArtifactSet[], heading = 'Report Compiler Prototype Documents'): string {
  const dashboard = renderDashboardTable(artifacts)
  const links = artifacts.map(doc => `
    <li>
      <a href="./${doc.id}.html">${escapeHtml(doc.title)} HTML report</a>
      ${doc.pdfPath ? ` · <a href="./${doc.id}.pdf">PDF</a>` : ''}
      · <a href="./${doc.id}.json">JSON state</a>
      · <a href="./${doc.id}.brief-intake-gate.json">Brief intake</a>
      · <a href="./${doc.id}.brief-intake-gate.csv">Brief intake CSV</a>
      · <a href="./${doc.id}.brief-clarification-plan.json">Brief clarification plan</a>
      · <a href="./${doc.id}.brief-clarification-plan.csv">Clarification CSV</a>
      · <a href="./${doc.id}.architecture-admission-gate.json">Architecture admission gate</a>
      · <a href="./${doc.id}.architecture-admission-gate.csv">Architecture admission CSV</a>
      · <a href="./${doc.id}.component-candidate-gate.json">Component candidate gate</a>
      · <a href="./${doc.id}.component-candidate-gate.csv">Component candidate CSV</a>
      · <a href="./${doc.id}.sourcing-authorization-gate.json">Sourcing authorization gate</a>
      · <a href="./${doc.id}.sourcing-authorization-gate.csv">Sourcing authorization CSV</a>
      · <a href="./${doc.id}.bom-admission-gate.json">BoM admission gate</a>
      · <a href="./${doc.id}.bom-admission-gate.csv">BoM admission CSV</a>
      · <a href="./${doc.id}.stage-integrity-gate.json">Stage integrity</a>
      · <a href="./${doc.id}.stage-integrity-gate.csv">Stage integrity CSV</a>
      · <a href="./${doc.id}.scratch-lineage-gate.json">Scratch lineage</a>
      · <a href="./${doc.id}.scratch-lineage-gate.csv">Scratch lineage CSV</a>
      · <a href="./${doc.id}.architecture-freeze-gate.json">Architecture freeze</a>
      · <a href="./${doc.id}.architecture-freeze-gate.csv">Architecture freeze CSV</a>
      · <a href="./${doc.id}.architecture-freeze-closure-plan.json">Freeze closure plan</a>
      · <a href="./${doc.id}.architecture-freeze-closure-plan.csv">Freeze closure CSV</a>
      · <a href="./${doc.id}.sourcing-worklist.json">Sourcing worklist</a>
      · <a href="./${doc.id}.sourcing-pack.json">Sourcing pack</a>
      · <a href="./${doc.id}.sourcing-pack.csv">Sourcing CSV</a>
      · <a href="./${doc.id}.sourcing-ledger.json">Sourcing ledger</a>
      · <a href="./${doc.id}.sourcing-ledger.csv">Sourcing ledger CSV</a>
      · <a href="./${doc.id}.bom-provenance-manifest.json">BoM provenance</a>
      · <a href="./${doc.id}.bom-provenance-manifest.csv">BoM provenance CSV</a>
      · <a href="./${doc.id}.source-reference-quality-gate.json">Source reference quality</a>
      · <a href="./${doc.id}.source-reference-quality-gate.csv">Source reference CSV</a>
      · <a href="./${doc.id}.bom-evidence-trace.json">BoM evidence trace</a>
      · <a href="./${doc.id}.bom-evidence-trace.csv">BoM trace CSV</a>
      · <a href="./${doc.id}.bom-evidence-closure-plan.json">BoM evidence closure</a>
      · <a href="./${doc.id}.bom-evidence-closure-plan.csv">BoM closure CSV</a>
      · <a href="./${doc.id}.sourcing-batch-plan.json">Sourcing batch plan</a>
      · <a href="./${doc.id}.sourcing-batch-plan.csv">Sourcing batch CSV</a>
      · <a href="./${doc.id}.procurement-readiness-gate.json">Procurement readiness gate</a>
      · <a href="./${doc.id}.procurement-readiness-gate.csv">Procurement readiness CSV</a>
      · <a href="./${doc.id}.bom-costing-gate.json">BoM costing gate</a>
      · <a href="./${doc.id}.bom-costing-gate.csv">BoM costing CSV</a>
      · <a href="./${doc.id}.component-identity.json">Component identity</a>
      · <a href="./${doc.id}.component-identity.csv">Component identity CSV</a>
      · <a href="./${doc.id}.sourcing-intake-template.json">Intake template</a>
      · <a href="./${doc.id}.sourcing-intake-template.csv">Intake CSV</a>
      · <a href="./${doc.id}.interface-graph.json">Interface graph</a>
      · <a href="./${doc.id}.interface-graph.mmd">Mermaid graph</a>
      · <a href="./${doc.id}.interface-contracts.json">Interface contracts</a>
      · <a href="./${doc.id}.interface-verification-gate.json">Interface verification gate</a>
      · <a href="./${doc.id}.interface-verification-gate.csv">Interface verification CSV</a>
      · <a href="./${doc.id}.component-allocation-gate.json">Component allocation gate</a>
      · <a href="./${doc.id}.component-allocation-gate.csv">Component allocation CSV</a>
      · <a href="./${doc.id}.submodule-engineering-gate.json">Submodule engineering gate</a>
      · <a href="./${doc.id}.submodule-engineering-gate.csv">Submodule engineering CSV</a>
      · <a href="./${doc.id}.module-engineering-gate.json">Module engineering gate</a>
      · <a href="./${doc.id}.module-engineering-gate.csv">Module engineering CSV</a>
      · <a href="./${doc.id}.module-review.json">Module review</a>
      · <a href="./${doc.id}.engineering-review-pack.json">Engineering review pack</a>
      · <a href="./${doc.id}.engineering-review-pack.csv">Review pack CSV</a>
      · <a href="./${doc.id}.engineering-assurance-matrix.json">Assurance matrix</a>
      · <a href="./${doc.id}.engineering-assurance-matrix.csv">Assurance CSV</a>
      · <a href="./${doc.id}.requirement-coverage-gate.json">Requirement coverage gate</a>
      · <a href="./${doc.id}.requirement-coverage-gate.csv">Requirement coverage CSV</a>
      · <a href="./${doc.id}.engineering-calculations.json">Engineering calculations</a>
      · <a href="./${doc.id}.engineering-calculations.csv">Calculations CSV</a>
      · <a href="./${doc.id}.engineering-assumptions.json">Engineering assumptions</a>
      · <a href="./${doc.id}.engineering-assumptions.csv">Assumptions CSV</a>
      · <a href="./${doc.id}.verification-plan.json">Verification plan</a>
      · <a href="./${doc.id}.verification-plan.csv">Verification CSV</a>
      · <a href="./${doc.id}.verification-ledger.json">Verification ledger</a>
      · <a href="./${doc.id}.verification-ledger.csv">Verification ledger CSV</a>
      · <a href="./${doc.id}.verification-intake-template.json">Verification intake</a>
      · <a href="./${doc.id}.verification-intake-template.csv">Verification intake CSV</a>
      · <a href="./${doc.id}.readiness-gate.json">Readiness gate</a>
      · <a href="./${doc.id}.readiness-gate.csv">Readiness CSV</a>
      · <a href="./${doc.id}.pre-bom-engineering-gate.json">Pre-BoM engineering gate</a>
      · <a href="./${doc.id}.pre-bom-engineering-gate.csv">Pre-BoM engineering CSV</a>
      · <a href="./${doc.id}.evidence-gap-register.json">Evidence gaps</a>
      · <a href="./${doc.id}.evidence-gap-register.csv">Evidence gaps CSV</a>
      · <a href="./${doc.id}.evidence-acquisition-plan.json">Evidence acquisition plan</a>
      · <a href="./${doc.id}.evidence-acquisition-plan.csv">Acquisition CSV</a>
      · <a href="./${doc.id}.closure-plan.json">Closure plan</a>
      · <a href="./${doc.id}.closure-plan.csv">Closure CSV</a>
      · <a href="./${doc.id}.claim-ledger.json">Claim ledger</a>
      · <a href="./${doc.id}.claim-ledger.csv">Claim CSV</a>
      · <a href="./${doc.id}.claim-evidence-gate.json">Claim evidence gate</a>
      · <a href="./${doc.id}.claim-evidence-gate.csv">Claim gate CSV</a>
      · <a href="./${doc.id}.document-trust-gate.json">Document trust gate</a>
      · <a href="./${doc.id}.document-trust-gate.csv">Trust gate CSV</a>
      · <a href="./${doc.id}.evidence-authenticity-gate.json">Evidence authenticity</a>
      · <a href="./${doc.id}.evidence-authenticity-gate.csv">Authenticity CSV</a>
      · <a href="./${doc.id}.evidence-replacement-plan.json">Evidence replacement plan</a>
      · <a href="./${doc.id}.evidence-replacement-plan.csv">Replacement CSV</a>
      · <a href="./${doc.id}.trust-repair-plan.json">Trust repair plan</a>
      · <a href="./${doc.id}.trust-repair-plan.csv">Trust repair CSV</a>
      · <a href="./${doc.id}.score-ledger.json">Score ledger</a>
      · <a href="./${doc.id}.score-ledger.csv">Score ledger CSV</a>
      · <a href="./${doc.id}.depth-benchmark.json">Depth benchmark</a>
      · <a href="./${doc.id}.depth-benchmark.csv">Depth CSV</a>
    </li>
  `).join('')
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(heading)}</title>
  <style>
    body { font: 16px/1.5 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 40px; color: #172026; }
    h1 { font-size: 28px; letter-spacing: 0; }
    table { width: 100%; border-collapse: collapse; margin: 18px 0; table-layout: fixed; }
    th, td { border-bottom: 1px solid #d9e0e7; padding: 7px 8px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
    th { background: #f4f7f9; }
    .ready { color: #20633b; font-weight: 700; }
    .warning { color: #9a4b00; font-weight: 700; }
    .blocked { color: #a32626; font-weight: 700; }
    li { margin: 8px 0; }
  </style>
</head>
<body>
  <h1>${escapeHtml(heading)}</h1>
  <p>Generated from the isolated prototype. Use these to inspect architecture readiness before BoM review.</p>
  ${dashboard}
  <ul>${links}</ul>
</body>
</html>`
}

function renderDashboardTable(artifacts: ReportArtifactSet[]): string {
  const rows = artifacts.map(doc => `<tr>
    <td><a href="./${doc.id}.html">${escapeHtml(doc.title)}</a></td>
    <td>${escapeHtml(doc.summary.productClass)}</td>
    <td>${renderVerdict(doc.summary.briefIntakeVerdict)}<br>${doc.summary.briefIntakePassRows}/${doc.summary.briefIntakeRows} pass<br>${doc.summary.briefIntakeRequirements} req, ${escapeHtml(doc.summary.briefIntakeConfidence)}</td>
    <td>${renderVerdict(doc.summary.briefClarificationVerdict)}<br>${doc.summary.briefClarificationRows} questions<br>${doc.summary.briefClarificationRequiredRows} required, ${doc.summary.briefClarificationArchitectureBlockingRows} blocking<br>${escapeHtml(doc.summary.briefClarificationNextQuestion ?? 'none')}</td>
    <td>${renderVerdict(doc.summary.architectureAdmissionVerdict)}<br>${doc.summary.architectureAdmissionPassRows}/${doc.summary.architectureAdmissionRows} pass<br>review ${doc.summary.architectureAdmissionCanReview ? 'yes' : 'no'}, BoM ${doc.summary.architectureAdmissionCanProceedToBom ? 'yes' : 'no'}<br>${escapeHtml(doc.summary.architectureAdmissionNextAction ?? 'none')}</td>
    <td>${renderVerdict(doc.summary.componentCandidateVerdict)}<br>${doc.summary.componentCandidatePassRows}/${doc.summary.componentCandidateRows} pass<br>${doc.summary.componentCandidateBomLines} lines, ${doc.summary.componentCandidateWorklistRows} worklist<br>${doc.summary.componentCandidateDuplicateGroups} dup, ${doc.summary.componentCandidateProvenanceViolations} prov<br>sourcing ${doc.summary.componentCandidateReadyForSourcing ? 'yes' : 'no'}</td>
    <td>${renderVerdict(doc.summary.sourcingAuthorizationVerdict)}<br>${doc.summary.sourcingAuthorizationPassRows}/${doc.summary.sourcingAuthorizationRows} pass<br>authorized ${doc.summary.sourcingAuthorized ? 'yes' : 'no'}<br>critical ${doc.summary.sourcingAuthorizationCriticalIntakeRows}/${doc.summary.sourcingAuthorizationCriticalUnpricedRows}; full ${doc.summary.sourcingAuthorizationFullIntakeRows}<br>${doc.summary.sourcingAuthorizationRejectedRows} rejected<br>${escapeHtml(doc.summary.sourcingAuthorizationNextAction ?? 'none')}</td>
    <td>${renderVerdict(doc.summary.bomAdmissionVerdict)}<br>${escapeHtml(doc.summary.bomAdmissionDisplayMode)}<br>${doc.summary.bomAdmissionPassRows}/${doc.summary.bomAdmissionRows} pass<br>critical ${doc.summary.bomAdmissionPricedCriticalLines}/${doc.summary.bomAdmissionCriticalLines}<br>candidate ${doc.summary.bomAdmissionCanRenderCandidate ? 'yes' : 'no'}, priced ${doc.summary.bomAdmissionCanRenderPriced ? 'yes' : 'no'}<br>procurement ${doc.summary.bomAdmissionCanUseForProcurement ? 'yes' : 'no'}<br>${escapeHtml(doc.summary.bomAdmissionNextAction ?? 'none')}</td>
    <td>${renderVerdict(doc.summary.stageIntegrityVerdict)}<br>${doc.summary.stageIntegrityPassRows}/${doc.summary.stageIntegrityRows} pass<br>ordered ${doc.summary.stageIntegrityOrdered ? 'yes' : 'no'}</td>
    <td>${renderVerdict(doc.summary.scratchLineageVerdict)}<br>${doc.summary.scratchLineagePassRows}/${doc.summary.scratchLineageRows} pass<br>${doc.summary.scratchLineageForbiddenRefs} bad refs, ${doc.summary.scratchLineageForbiddenStageMentions} bad trace<br>chain-v2 benchmark ${doc.summary.scratchLineageChainBenchmarkUsed ? 'yes' : 'no'}<br>${escapeHtml(doc.summary.scratchLineageNextAction ?? 'none')}</td>
    <td>${renderVerdict(doc.summary.architectureFreezeVerdict)}<br>${doc.summary.architectureFreezePassRows}/${doc.summary.architectureFreezeRows} pass<br>${doc.summary.architectureFreezeBlockedRows} blocked<br>structural sourcing ${doc.summary.architectureFreezeStructurallyReady ? 'yes' : 'no'}<br>review accepted ${doc.summary.architectureFreezeReviewAccepted ? 'yes' : 'no'}<br>${escapeHtml(doc.summary.architectureFreezeNextAction ?? 'none')}</td>
    <td>${doc.summary.architectureFreezeClosureRows}<br>${doc.summary.architectureFreezeClosureReadyRows} ready, ${doc.summary.architectureFreezeClosureBlockedRows} blocked<br>S/E/V/R ${doc.summary.architectureFreezeClosureSourcingRows}/${doc.summary.architectureFreezeClosureEngineeringRows}/${doc.summary.architectureFreezeClosureVerificationRows}/${doc.summary.architectureFreezeClosureRevisionRows}<br>${escapeHtml(doc.summary.architectureFreezeClosureNextRow ?? 'none')}</td>
    <td>${renderVerdict(doc.summary.verdict)}</td>
    <td>${renderVerdict(doc.summary.preBomEngineeringVerdict)}<br>${doc.summary.preBomEngineeringPassRows}/${doc.summary.preBomEngineeringRows} pass</td>
    <td>${renderVerdict(doc.summary.bomCostingVerdict)}<br>${doc.summary.bomCostingPassRows}/${doc.summary.bomCostingRows} pass<br>${doc.summary.bomCostingProductionReadySourceRows} prod, ${doc.summary.bomCostingProtocolSourceRows} protocol</td>
    <td>${renderVerdict(doc.summary.sourceReferenceQualityVerdict)}<br>${doc.summary.sourceReferenceQualityPassRows}/${doc.summary.sourceReferenceQualityRows} pass<br>${doc.summary.sourceReferenceQualityBlockedRows} blocked<br>${doc.summary.sourceReferenceQualityProtocolRows} protocol, ${doc.summary.sourceReferenceQualityPlaceholderRows} placeholder<br>${doc.summary.sourceReferenceQualityCandidateExternalRows} external</td>
    <td>${doc.summary.bomEvidenceTraceProductionEligibleRows} prod eligible<br>${doc.summary.bomEvidenceTraceProtocolOnlyRows} protocol<br>${doc.summary.bomEvidenceTraceBlockedSourceRows} source blocked<br>${doc.summary.bomEvidenceTraceCriticalUnsourcedRows} critical unsourced<br>procurement ${doc.summary.bomEvidenceTraceCanUseForProcurement ? 'yes' : 'no'}<br>${escapeHtml(doc.summary.bomEvidenceTraceNextRow ?? 'none')}</td>
    <td>${doc.summary.bomEvidenceClosureRows} rows<br>${doc.summary.bomEvidenceClosureReadyRows} ready, ${doc.summary.bomEvidenceClosureBlockedRows} blocked, ${doc.summary.bomEvidenceClosureDeferredRows} deferred<br>${doc.summary.bomEvidenceClosureCollectRows} collect, ${doc.summary.bomEvidenceClosureRepairRows} repair, ${doc.summary.bomEvidenceClosureProtocolRows} protocol<br>${doc.summary.bomEvidenceClosureCandidateRows} candidate defers<br>${doc.summary.bomEvidenceClosureProcurementBlockingRows} procurement blockers<br>${escapeHtml(doc.summary.bomEvidenceClosureNextRow ?? 'none')}</td>
    <td>${doc.summary.sourcingBatchPlanBatches} batches<br>${doc.summary.sourcingBatchPlanActiveBatches} active, ${doc.summary.sourcingBatchPlanActiveRows} active rows<br>${doc.summary.sourcingBatchPlanCriticalRows} critical, ${doc.summary.sourcingBatchPlanRepairRows} repair, ${doc.summary.sourcingBatchPlanProtocolRows} protocol<br>${doc.summary.sourcingBatchPlanDeferredRows} deferred rows<br>${escapeHtml(doc.summary.sourcingBatchPlanNextBatch ?? 'none')}<br>${escapeHtml(doc.summary.sourcingBatchPlanNextItem ?? 'none')}</td>
    <td>${renderVerdict(doc.summary.procurementReadinessVerdict)}<br>${doc.summary.procurementReadinessPassRows}/${doc.summary.procurementReadinessRows} pass<br>${doc.summary.procurementReadinessBlockedRows} blocked<br>critical ${doc.summary.procurementReadinessProductionCriticalRows}/${doc.summary.procurementReadinessCriticalRows}<br>${doc.summary.procurementReadinessBlockingRows} procurement blockers<br>use ${doc.summary.procurementReadinessCanUse ? 'yes' : 'no'}<br>${escapeHtml(doc.summary.procurementReadinessNextAction ?? 'none')}</td>
    <td>${doc.summary.meanScore ?? 'n/a'}</td>
    <td>${doc.summary.moduleCount}/${doc.summary.subModuleCount}/${doc.summary.componentWordCount}</td>
    <td>${renderVerdict(doc.summary.interfaceVerificationVerdict)}<br>${doc.summary.interfaceVerificationAcceptedRows}/${doc.summary.interfaceVerificationRows} accepted</td>
    <td>${renderVerdict(doc.summary.componentAllocationVerdict)}<br>${doc.summary.componentAllocationReadySubModules}/${doc.summary.componentAllocationSubModules} ready</td>
    <td>${renderVerdict(doc.summary.subModuleEngineeringVerdict)}<br>${doc.summary.subModuleEngineeringPassRows}/${doc.summary.subModuleEngineeringRows} pass<br>${doc.summary.subModuleEngineeringBlockedRows} blocked<br>${doc.summary.subModuleEngineeringAcceptedReviewQuestions}/${doc.summary.subModuleEngineeringReviewQuestions} review Qs<br>${doc.summary.subModuleEngineeringAcceptedVerification}/${doc.summary.subModuleEngineeringVerification} verification<br>${doc.summary.subModuleEngineeringCriticalUnpricedLines} critical unpriced</td>
    <td>${renderVerdict(doc.summary.moduleEngineeringVerdict)}<br>${doc.summary.moduleEngineeringPassRows}/${doc.summary.moduleEngineeringRows} pass<br>${doc.summary.moduleEngineeringAcceptedReviewQuestions}/${doc.summary.moduleEngineeringReviewQuestions} review Qs</td>
    <td>${doc.summary.unpricedCriticalLines}</td>
    <td>${doc.summary.sourceBackedClaims}</td>
    <td>${doc.summary.provenanceViolations}</td>
    <td>${doc.summary.verificationAccepted}/${doc.summary.verificationEligible}</td>
    <td>${doc.summary.engineeringReviewQuestions} (${doc.summary.blockedEngineeringReviewQuestions} blocked)</td>
    <td>${doc.summary.assuranceRows} (${doc.summary.blockedAssuranceRows} blocked)</td>
    <td>${renderVerdict(doc.summary.requirementCoverageVerdict)}<br>${doc.summary.requirementCoverageReadyRows}/${doc.summary.requirementCoverageRows} ready/accepted</td>
    <td>${doc.summary.claimRows} (${doc.summary.acceptedClaims} accepted/source, ${doc.summary.sourceRequiredClaims} source req.)</td>
    <td>${renderVerdict(doc.summary.claimEvidenceVerdict)}<br>${doc.summary.claimEvidenceBlockedClaims} blocked claims</td>
    <td>${renderVerdict(doc.summary.trustVerdict)}<br>${doc.summary.trustBlockedRows} blocked areas</td>
    <td>${doc.summary.evidenceAcquisitionRows}<br>${doc.summary.evidenceAcquisitionSourcingRows} sourcing, ${doc.summary.evidenceAcquisitionVerificationRows} verification</td>
    <td>${renderVerdict(doc.summary.evidenceAuthenticityVerdict)}<br>${doc.summary.productionReadyEvidenceRows} production, ${doc.summary.protocolEvidenceRows} protocol</td>
    <td>${doc.summary.evidenceReplacementRows}<br>${doc.summary.evidenceReplacementBomRows} BoM-blocking</td>
    <td>${doc.summary.nextTrustRepairPackage ?? 'none'}<br>${doc.summary.trustRepairPackages} package(s)</td>
    <td>${doc.summary.evidenceGaps} (${doc.summary.evidenceGapBlockers} blockers)</td>
    <td>${doc.summary.sourcingIntakeRows}/${doc.summary.verificationIntakeRows}/${doc.summary.engineeringReviewRows}/${doc.summary.architectureRevisionRows}</td>
  </tr>`).join('')
  return `<table>
    <thead><tr><th>Report</th><th>Class</th><th>Brief Intake</th><th>Brief Clarification</th><th>Architecture Admission</th><th>Component Candidates</th><th>Sourcing Authorization</th><th>BoM Admission</th><th>Stage Integrity</th><th>Scratch Lineage</th><th>Architecture Freeze</th><th>Freeze Closure</th><th>Verdict</th><th>Pre-BoM Eng</th><th>BoM Costing</th><th>Source Refs</th><th>BoM Trace</th><th>BoM Closure</th><th>Sourcing Batches</th><th>Procurement</th><th>Score</th><th>Modules/Subs/Components</th><th>Interfaces</th><th>Component Allocation</th><th>Submodule Eng</th><th>Module Eng</th><th>Critical Unpriced</th><th>Source-backed Claims</th><th>Provenance Violations</th><th>Verification</th><th>Eng Review</th><th>Assurance</th><th>Req Coverage</th><th>Claims</th><th>Claim Gate</th><th>Trust Gate</th><th>Acquisition Rows</th><th>Evidence Authenticity</th><th>Replacement Rows</th><th>Repair Plan</th><th>Evidence Gaps</th><th>S/V/E/A Queues</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p>S/V/E/A queues = sourcing intake / verification intake / engineering review / architecture revision.</p>`
}

function renderVerdict(verdict: string): string {
  const klass = verdict === 'publishable'
    || verdict === 'claim_evidence_complete'
    || verdict === 'production_ready'
    || verdict === 'accepted_evidence'
    || verdict === 'coverage_review_ready'
    || verdict === 'accepted_interfaces'
    || verdict === 'interface_review_ready'
    || verdict === 'allocation_ready'
    || verdict === 'engineering_accepted'
    || verdict === 'engineering_review_ready'
    || verdict === 'costing_ready'
    || verdict === 'stage_trace_accepted'
    || verdict === 'module_engineering_ready'
    || verdict === 'submodule_engineering_ready'
    || verdict === 'brief_ready_for_architecture'
    || verdict === 'no_clarification_needed'
    || verdict === 'architecture_generation_admitted'
    || verdict === 'component_candidates_ready_for_sourcing'
    || verdict === 'sourcing_authorized'
    || verdict === 'candidate_bom_authorized'
    || verdict === 'critical_bom_admitted'
    || verdict === 'scratch_lineage_clean'
    || verdict === 'architecture_frozen_for_sourcing'
    || verdict === 'source_quality_ready'
    || verdict === 'procurement_ready'
    ? 'ready'
    : verdict === 'blocked' || verdict.includes('blocked') || verdict === 'not_reviewable' || verdict === 'costing_not_started' || verdict === 'no_sourcing_evidence' || verdict === 'procurement_not_started' || verdict === 'no_submodules' || verdict === 'clarification_required' || verdict === 'no_brief' || verdict === 'no_architecture_trace' || verdict === 'no_component_candidates' || verdict === 'sourcing_authorization_blocked' || verdict === 'bom_admission_blocked' ? 'blocked' : 'warning'
  return `<span class="${klass}">${escapeHtml(verdict)}</span>`
}

function artifactPaths(outDir: string, id: string): Omit<ReportArtifactSet, 'id' | 'title' | 'summary' | 'pdfPath' | 'pdfSkippedReason'> {
  return {
    htmlPath: join(outDir, `${id}.html`),
    markdownPath: join(outDir, `${id}.md`),
    jsonPath: join(outDir, `${id}.json`),
    briefIntakeGatePath: join(outDir, `${id}.brief-intake-gate.json`),
    briefIntakeGateCsvPath: join(outDir, `${id}.brief-intake-gate.csv`),
    briefClarificationPlanPath: join(outDir, `${id}.brief-clarification-plan.json`),
    briefClarificationPlanCsvPath: join(outDir, `${id}.brief-clarification-plan.csv`),
    architectureAdmissionGatePath: join(outDir, `${id}.architecture-admission-gate.json`),
    architectureAdmissionGateCsvPath: join(outDir, `${id}.architecture-admission-gate.csv`),
    componentCandidateGatePath: join(outDir, `${id}.component-candidate-gate.json`),
    componentCandidateGateCsvPath: join(outDir, `${id}.component-candidate-gate.csv`),
    sourcingAuthorizationGatePath: join(outDir, `${id}.sourcing-authorization-gate.json`),
    sourcingAuthorizationGateCsvPath: join(outDir, `${id}.sourcing-authorization-gate.csv`),
    bomAdmissionGatePath: join(outDir, `${id}.bom-admission-gate.json`),
    bomAdmissionGateCsvPath: join(outDir, `${id}.bom-admission-gate.csv`),
    stageIntegrityGatePath: join(outDir, `${id}.stage-integrity-gate.json`),
    stageIntegrityGateCsvPath: join(outDir, `${id}.stage-integrity-gate.csv`),
    scratchLineageGatePath: join(outDir, `${id}.scratch-lineage-gate.json`),
    scratchLineageGateCsvPath: join(outDir, `${id}.scratch-lineage-gate.csv`),
    architectureFreezeGatePath: join(outDir, `${id}.architecture-freeze-gate.json`),
    architectureFreezeGateCsvPath: join(outDir, `${id}.architecture-freeze-gate.csv`),
    architectureFreezeClosurePlanPath: join(outDir, `${id}.architecture-freeze-closure-plan.json`),
    architectureFreezeClosurePlanCsvPath: join(outDir, `${id}.architecture-freeze-closure-plan.csv`),
    sourcingWorklistPath: join(outDir, `${id}.sourcing-worklist.json`),
    sourcingPackPath: join(outDir, `${id}.sourcing-pack.json`),
    sourcingPackCsvPath: join(outDir, `${id}.sourcing-pack.csv`),
    sourcingLedgerPath: join(outDir, `${id}.sourcing-ledger.json`),
    sourcingLedgerCsvPath: join(outDir, `${id}.sourcing-ledger.csv`),
    bomProvenanceManifestPath: join(outDir, `${id}.bom-provenance-manifest.json`),
    bomProvenanceManifestCsvPath: join(outDir, `${id}.bom-provenance-manifest.csv`),
    sourceReferenceQualityGatePath: join(outDir, `${id}.source-reference-quality-gate.json`),
    sourceReferenceQualityGateCsvPath: join(outDir, `${id}.source-reference-quality-gate.csv`),
    bomEvidenceTracePath: join(outDir, `${id}.bom-evidence-trace.json`),
    bomEvidenceTraceCsvPath: join(outDir, `${id}.bom-evidence-trace.csv`),
    bomEvidenceClosurePlanPath: join(outDir, `${id}.bom-evidence-closure-plan.json`),
    bomEvidenceClosurePlanCsvPath: join(outDir, `${id}.bom-evidence-closure-plan.csv`),
    sourcingBatchPlanPath: join(outDir, `${id}.sourcing-batch-plan.json`),
    sourcingBatchPlanCsvPath: join(outDir, `${id}.sourcing-batch-plan.csv`),
    procurementReadinessGatePath: join(outDir, `${id}.procurement-readiness-gate.json`),
    procurementReadinessGateCsvPath: join(outDir, `${id}.procurement-readiness-gate.csv`),
    bomCostingGatePath: join(outDir, `${id}.bom-costing-gate.json`),
    bomCostingGateCsvPath: join(outDir, `${id}.bom-costing-gate.csv`),
    componentIdentityPath: join(outDir, `${id}.component-identity.json`),
    componentIdentityCsvPath: join(outDir, `${id}.component-identity.csv`),
    sourcingIntakeTemplatePath: join(outDir, `${id}.sourcing-intake-template.json`),
    sourcingIntakeTemplateCsvPath: join(outDir, `${id}.sourcing-intake-template.csv`),
    interfaceGraphPath: join(outDir, `${id}.interface-graph.json`),
    interfaceGraphMermaidPath: join(outDir, `${id}.interface-graph.mmd`),
    interfaceContractsPath: join(outDir, `${id}.interface-contracts.json`),
    interfaceVerificationGatePath: join(outDir, `${id}.interface-verification-gate.json`),
    interfaceVerificationGateCsvPath: join(outDir, `${id}.interface-verification-gate.csv`),
    componentAllocationGatePath: join(outDir, `${id}.component-allocation-gate.json`),
    componentAllocationGateCsvPath: join(outDir, `${id}.component-allocation-gate.csv`),
    subModuleEngineeringGatePath: join(outDir, `${id}.submodule-engineering-gate.json`),
    subModuleEngineeringGateCsvPath: join(outDir, `${id}.submodule-engineering-gate.csv`),
    moduleEngineeringGatePath: join(outDir, `${id}.module-engineering-gate.json`),
    moduleEngineeringGateCsvPath: join(outDir, `${id}.module-engineering-gate.csv`),
    moduleReviewPath: join(outDir, `${id}.module-review.json`),
    engineeringReviewPackPath: join(outDir, `${id}.engineering-review-pack.json`),
    engineeringReviewPackCsvPath: join(outDir, `${id}.engineering-review-pack.csv`),
    engineeringAssuranceMatrixPath: join(outDir, `${id}.engineering-assurance-matrix.json`),
    engineeringAssuranceMatrixCsvPath: join(outDir, `${id}.engineering-assurance-matrix.csv`),
    requirementCoverageGatePath: join(outDir, `${id}.requirement-coverage-gate.json`),
    requirementCoverageGateCsvPath: join(outDir, `${id}.requirement-coverage-gate.csv`),
    engineeringCalculationsPath: join(outDir, `${id}.engineering-calculations.json`),
    engineeringCalculationsCsvPath: join(outDir, `${id}.engineering-calculations.csv`),
    engineeringAssumptionsPath: join(outDir, `${id}.engineering-assumptions.json`),
    engineeringAssumptionsCsvPath: join(outDir, `${id}.engineering-assumptions.csv`),
    verificationPlanPath: join(outDir, `${id}.verification-plan.json`),
    verificationPlanCsvPath: join(outDir, `${id}.verification-plan.csv`),
    verificationLedgerPath: join(outDir, `${id}.verification-ledger.json`),
    verificationLedgerCsvPath: join(outDir, `${id}.verification-ledger.csv`),
    verificationIntakeTemplatePath: join(outDir, `${id}.verification-intake-template.json`),
    verificationIntakeTemplateCsvPath: join(outDir, `${id}.verification-intake-template.csv`),
    readinessGatePath: join(outDir, `${id}.readiness-gate.json`),
    readinessGateCsvPath: join(outDir, `${id}.readiness-gate.csv`),
    preBomEngineeringGatePath: join(outDir, `${id}.pre-bom-engineering-gate.json`),
    preBomEngineeringGateCsvPath: join(outDir, `${id}.pre-bom-engineering-gate.csv`),
    evidenceGapRegisterPath: join(outDir, `${id}.evidence-gap-register.json`),
    evidenceGapRegisterCsvPath: join(outDir, `${id}.evidence-gap-register.csv`),
    evidenceAcquisitionPlanPath: join(outDir, `${id}.evidence-acquisition-plan.json`),
    evidenceAcquisitionPlanCsvPath: join(outDir, `${id}.evidence-acquisition-plan.csv`),
    closurePlanPath: join(outDir, `${id}.closure-plan.json`),
    closurePlanCsvPath: join(outDir, `${id}.closure-plan.csv`),
    claimLedgerPath: join(outDir, `${id}.claim-ledger.json`),
    claimLedgerCsvPath: join(outDir, `${id}.claim-ledger.csv`),
    claimEvidenceGatePath: join(outDir, `${id}.claim-evidence-gate.json`),
    claimEvidenceGateCsvPath: join(outDir, `${id}.claim-evidence-gate.csv`),
    documentTrustGatePath: join(outDir, `${id}.document-trust-gate.json`),
    documentTrustGateCsvPath: join(outDir, `${id}.document-trust-gate.csv`),
    evidenceAuthenticityGatePath: join(outDir, `${id}.evidence-authenticity-gate.json`),
    evidenceAuthenticityGateCsvPath: join(outDir, `${id}.evidence-authenticity-gate.csv`),
    evidenceReplacementPlanPath: join(outDir, `${id}.evidence-replacement-plan.json`),
    evidenceReplacementPlanCsvPath: join(outDir, `${id}.evidence-replacement-plan.csv`),
    trustRepairPlanPath: join(outDir, `${id}.trust-repair-plan.json`),
    trustRepairPlanCsvPath: join(outDir, `${id}.trust-repair-plan.csv`),
    scoreLedgerPath: join(outDir, `${id}.score-ledger.json`),
    scoreLedgerCsvPath: join(outDir, `${id}.score-ledger.csv`),
    depthBenchmarkPath: join(outDir, `${id}.depth-benchmark.json`),
    depthBenchmarkCsvPath: join(outDir, `${id}.depth-benchmark.csv`),
  }
}

async function writePdf(artifact: ReportArtifactSet): Promise<void> {
  let playwright: typeof import('playwright') | undefined
  try {
    playwright = await import('playwright')
  } catch (error) {
    artifact.pdfSkippedReason = describeError(error)
    return
  }

  let browser: Awaited<ReturnType<typeof playwright.chromium.launch>> | undefined
  try {
    browser = await playwright.chromium.launch({ headless: true })
    const page = await browser.newPage()
    await page.goto(`file://${artifact.htmlPath}`, { waitUntil: 'networkidle' })
    const pdfPath = artifact.htmlPath.replace(/\.html$/, '.pdf')
    await page.pdf({ path: pdfPath, format: 'A4', printBackground: true })
    await page.close()
    artifact.pdfPath = pdfPath
  } catch (error) {
    artifact.pdfSkippedReason = describeError(error)
  } finally {
    await browser?.close()
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message.split('\n')[0] : String(error)
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
