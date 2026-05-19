import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { buildEngineeringAssuranceMatrix, renderEngineeringAssuranceMatrixCsv } from './architecture/engineering-assurance-matrix'
import { buildInterfaceContractMatrix } from './architecture/interface-contracts'
import { buildInterfaceGraph, renderInterfaceGraphMermaid } from './architecture/interface-graph'
import { buildModuleReview } from './architecture/module-review'
import { buildEngineeringReviewPack, renderEngineeringReviewPackCsv } from './architecture/engineering-review-pack'
import { buildEngineeringAssumptionLedger, renderEngineeringAssumptionLedgerCsv } from './architecture/engineering-assumptions'
import { buildEngineeringCalculationLedger, renderEngineeringCalculationLedgerCsv } from './architecture/engineering-calculations'
import { buildVerificationEvidenceLedger, renderVerificationEvidenceLedgerCsv } from './architecture/verification-ledger'
import {
  buildVerificationIntakeTemplate,
  renderEngineeringVerificationPlanCsv,
  renderVerificationIntakeTemplateCsv,
} from './architecture/verification-intake'
import { buildEngineeringVerificationPlan } from './architecture/verification-plan'
import type { ChainV2Analysis } from './chain-v2/types'
import { buildArtifactDashboardSummary, type ArtifactDashboardSummary } from './pipeline/report-artifacts'
import { buildProductClassCoverageMatrix, renderProductClassCoverageCsv } from './pipeline/product-class-coverage'
import { runReportCompiler } from './pipeline/run-report-compiler'
import { renderReportHtml } from './render/report-html'
import { buildArchitectureFreezeGate, renderArchitectureFreezeGateCsv } from './scoring/architecture-freeze-gate'
import { buildArchitectureFreezeClosurePlan, renderArchitectureFreezeClosurePlanCsv } from './scoring/architecture-freeze-closure-plan'
import { buildClosurePlan, renderClosurePlanCsv } from './scoring/closure-plan'
import { buildClaimEvidenceGate, renderClaimEvidenceGateCsv } from './scoring/claim-evidence-gate'
import { buildClaimLedger, renderClaimLedgerCsv } from './scoring/claim-ledger'
import { buildArchitectureAdmissionGate, renderArchitectureAdmissionGateCsv } from './scoring/architecture-admission-gate'
import { buildBriefClarificationPlan, renderBriefClarificationPlanCsv } from './scoring/brief-clarification-plan'
import { buildBriefIntakeGate, renderBriefIntakeGateCsv } from './scoring/brief-intake-gate'
import { buildBomAdmissionGate, renderBomAdmissionGateCsv } from './scoring/bom-admission-gate'
import { buildBomCostingGate, renderBomCostingGateCsv } from './scoring/bom-costing-gate'
import { buildBomEvidenceClosurePlan, renderBomEvidenceClosurePlanCsv } from './scoring/bom-evidence-closure-plan'
import { buildBomEvidenceTraceMatrix, renderBomEvidenceTraceMatrixCsv } from './scoring/bom-evidence-trace'
import { buildComponentCandidateGate, renderComponentCandidateGateCsv } from './scoring/component-candidate-gate'
import { buildComponentAllocationGate, renderComponentAllocationGateCsv } from './scoring/component-allocation-gate'
import { buildDepthBenchmark, renderDepthBenchmarkCsv } from './scoring/depth-benchmark'
import { buildDocumentTrustGate, renderDocumentTrustGateCsv } from './scoring/document-trust-gate'
import { buildEvidenceAcquisitionPlan, renderEvidenceAcquisitionPlanCsv } from './scoring/evidence-acquisition-plan'
import { buildEvidenceAuthenticityGate, renderEvidenceAuthenticityGateCsv } from './scoring/evidence-authenticity'
import { buildEvidenceReplacementPlan, renderEvidenceReplacementPlanCsv } from './scoring/evidence-replacement-plan'
import { buildEvidenceGapRegister, renderEvidenceGapRegisterCsv } from './scoring/evidence-gap-register'
import { buildInterfaceVerificationGate, renderInterfaceVerificationGateCsv } from './scoring/interface-verification-gate'
import { buildModuleEngineeringGate, renderModuleEngineeringGateCsv } from './scoring/module-engineering-gate'
import { buildPreBomEngineeringGate, renderPreBomEngineeringGateCsv } from './scoring/pre-bom-engineering-gate'
import { buildProcurementReadinessGate, renderProcurementReadinessGateCsv } from './scoring/procurement-readiness-gate'
import { buildReportReadinessGate, renderReportReadinessGateCsv } from './scoring/report-readiness'
import { buildRequirementCoverageGate, renderRequirementCoverageGateCsv } from './scoring/requirement-coverage-gate'
import { buildSectionScoreLedger, renderSectionScoreLedgerCsv } from './scoring/score-from-issues'
import { buildSourceReferenceQualityGate, renderSourceReferenceQualityGateCsv } from './scoring/source-reference-quality-gate'
import { buildSourcingBatchPlan, renderSourcingBatchPlanCsv } from './scoring/sourcing-batch-plan'
import { buildSourcingAuthorizationGate, renderSourcingAuthorizationGateCsv } from './scoring/sourcing-authorization-gate'
import { buildScratchLineageGate, renderScratchLineageGateCsv } from './scoring/scratch-lineage-gate'
import { buildStageIntegrityGate, renderStageIntegrityGateCsv } from './scoring/stage-integrity-gate'
import { buildSubModuleEngineeringGate, renderSubModuleEngineeringGateCsv } from './scoring/submodule-engineering-gate'
import { buildTrustRepairPlan, renderTrustRepairPlanCsv } from './scoring/trust-repair-plan'
import { buildSourcingEvidencePack, renderSourcingEvidencePackCsv } from './sourcing/evidence-pack'
import { buildSourcingIntakeTemplate, renderSourcingIntakeTemplateCsv } from './sourcing/intake'
import { buildSourcingLineLedger, renderSourcingLineLedgerCsv } from './sourcing/ledger'
import { buildBomProvenanceManifest, renderBomProvenanceManifestCsv } from './sourcing/provenance-manifest'
import { buildSourcingWorklist } from './sourcing/worklist'
import { buildComponentIdentityWorklist, renderComponentIdentityWorklistCsv } from './sourcing/component-identity'

const examples = [
  {
    id: 'sample-bess',
    title: 'Containerised BESS',
    briefText: 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.',
    chainBenchmarkPath: 'chain-v2-adapted/chain-v2-adapted-bess.analysis.json',
  },
  {
    id: 'sample-farm',
    title: 'Vertical Farm',
    briefText: 'Design a compact vertical farm for leafy greens using LED grow lights, hydroponic fertigation, CO2 monitoring, and a 2.4 m by 1.4 m envelope.',
  },
  {
    id: 'sample-heat-pump',
    title: 'Air-Source Heat Pump',
    briefText: 'Design an 8 kW thermal air-source heat pump with COP 3.5, inverter compressor, R290 refrigerant, outdoor evaporator coil, plate heat exchanger, hydronic circulation pump, monobloc enclosure, and defrost control.',
  },
  {
    id: 'sample-ev-charger',
    title: 'DC Fast EV Charger',
    briefText: 'Design a 150 kW DC fast EV charger with CCS2 liquid-cooled cable, OCPP backend, ISO 15118 PLC communication, MID metering, insulation monitoring, emergency stop, and outdoor cabinet.',
  },
  {
    id: 'sample-bioreactor',
    title: 'Single-Use Bioreactor',
    briefText: 'Design a 50 L single-use mammalian-cell bioreactor with sterile bag, agitation drive, sparger gas manifold, peristaltic feed pumps, dissolved oxygen control, pH sensing, temperature loop, exhaust filter and batch-record controller.',
  },
  {
    id: 'sample-auv',
    title: 'Inspection AUV',
    briefText: 'Design a 300 m depth-rated autonomous underwater vehicle with 8 hour survey endurance, pressure hull, thruster set, DVL, battery pack, acoustic modem, leak detection, forward sonar payload and recovery beacon.',
  },
  {
    id: 'sample-edge-ai',
    title: 'Edge AI Appliance',
    briefText: 'Design a 1U rack-mount edge AI inference appliance with 200 TOPS accelerator throughput, 700 W power budget, GPU module, redundant power supplies, high-speed NIC, NVMe model cache, BMC management, secure boot and front-to-back thermal management.',
  },
  {
    id: 'sample-haps',
    title: 'Solar HAPS',
    briefText: 'Design a solar-electric high-altitude pseudo-satellite for 20 km altitude, 30 day station-keeping endurance and 35 m wingspan with wing structure, solar cell array, MPPT power tracker, stratospheric battery pack, electric propulsion pods, flight control computer, GNSS INS navigation, communications payload, thermal insulation and recovery parachute.',
  },
  {
    id: 'sample-cgm',
    title: 'Continuous Glucose Monitor',
    briefText: 'Design a 14 day wear continuous glucose monitor wearable patch with 5 minute readings, MARD 9%, glucose sensing filament, enzyme reagent membrane, reference electrode, adhesive skin interface, thin-film battery, BLE radio module, protective transmitter housing, sterile barrier pouch and disposable applicator.',
  },
  {
    id: 'sample-drone',
    title: 'Cinematography Drone',
    briefText: 'Design a prosumer cinematography drone with 4K camera payload, 40 minutes flight endurance, brushless motors, ESCs, and flight controller.',
  },
]

interface GeneratedDocument {
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

main().catch(error => {
  console.error(error)
  throw error
})

async function main(): Promise<void> {
  const outDir = resolve('report-compiler-prototype/out')
  await mkdir(outDir, { recursive: true })
  const generated: GeneratedDocument[] = []

  for (const example of examples) {
    const result = await runReportCompiler(example)
    const htmlPath = join(outDir, `${example.id}.html`)
    const markdownPath = join(outDir, `${example.id}.md`)
    const jsonPath = join(outDir, `${example.id}.json`)
    const briefIntakeGatePath = join(outDir, `${example.id}.brief-intake-gate.json`)
    const briefIntakeGateCsvPath = join(outDir, `${example.id}.brief-intake-gate.csv`)
    const briefClarificationPlanPath = join(outDir, `${example.id}.brief-clarification-plan.json`)
    const briefClarificationPlanCsvPath = join(outDir, `${example.id}.brief-clarification-plan.csv`)
    const architectureAdmissionGatePath = join(outDir, `${example.id}.architecture-admission-gate.json`)
    const architectureAdmissionGateCsvPath = join(outDir, `${example.id}.architecture-admission-gate.csv`)
    const componentCandidateGatePath = join(outDir, `${example.id}.component-candidate-gate.json`)
    const componentCandidateGateCsvPath = join(outDir, `${example.id}.component-candidate-gate.csv`)
    const sourcingAuthorizationGatePath = join(outDir, `${example.id}.sourcing-authorization-gate.json`)
    const sourcingAuthorizationGateCsvPath = join(outDir, `${example.id}.sourcing-authorization-gate.csv`)
    const bomAdmissionGatePath = join(outDir, `${example.id}.bom-admission-gate.json`)
    const bomAdmissionGateCsvPath = join(outDir, `${example.id}.bom-admission-gate.csv`)
    const stageIntegrityGatePath = join(outDir, `${example.id}.stage-integrity-gate.json`)
    const stageIntegrityGateCsvPath = join(outDir, `${example.id}.stage-integrity-gate.csv`)
    const scratchLineageGatePath = join(outDir, `${example.id}.scratch-lineage-gate.json`)
    const scratchLineageGateCsvPath = join(outDir, `${example.id}.scratch-lineage-gate.csv`)
    const architectureFreezeGatePath = join(outDir, `${example.id}.architecture-freeze-gate.json`)
    const architectureFreezeGateCsvPath = join(outDir, `${example.id}.architecture-freeze-gate.csv`)
    const architectureFreezeClosurePlanPath = join(outDir, `${example.id}.architecture-freeze-closure-plan.json`)
    const architectureFreezeClosurePlanCsvPath = join(outDir, `${example.id}.architecture-freeze-closure-plan.csv`)
    const sourcingWorklistPath = join(outDir, `${example.id}.sourcing-worklist.json`)
    const sourcingPackPath = join(outDir, `${example.id}.sourcing-pack.json`)
    const sourcingPackCsvPath = join(outDir, `${example.id}.sourcing-pack.csv`)
    const sourcingLedgerPath = join(outDir, `${example.id}.sourcing-ledger.json`)
    const sourcingLedgerCsvPath = join(outDir, `${example.id}.sourcing-ledger.csv`)
    const bomProvenanceManifestPath = join(outDir, `${example.id}.bom-provenance-manifest.json`)
    const bomProvenanceManifestCsvPath = join(outDir, `${example.id}.bom-provenance-manifest.csv`)
    const sourceReferenceQualityGatePath = join(outDir, `${example.id}.source-reference-quality-gate.json`)
    const sourceReferenceQualityGateCsvPath = join(outDir, `${example.id}.source-reference-quality-gate.csv`)
    const bomEvidenceTracePath = join(outDir, `${example.id}.bom-evidence-trace.json`)
    const bomEvidenceTraceCsvPath = join(outDir, `${example.id}.bom-evidence-trace.csv`)
    const bomEvidenceClosurePlanPath = join(outDir, `${example.id}.bom-evidence-closure-plan.json`)
    const bomEvidenceClosurePlanCsvPath = join(outDir, `${example.id}.bom-evidence-closure-plan.csv`)
    const sourcingBatchPlanPath = join(outDir, `${example.id}.sourcing-batch-plan.json`)
    const sourcingBatchPlanCsvPath = join(outDir, `${example.id}.sourcing-batch-plan.csv`)
    const procurementReadinessGatePath = join(outDir, `${example.id}.procurement-readiness-gate.json`)
    const procurementReadinessGateCsvPath = join(outDir, `${example.id}.procurement-readiness-gate.csv`)
    const bomCostingGatePath = join(outDir, `${example.id}.bom-costing-gate.json`)
    const bomCostingGateCsvPath = join(outDir, `${example.id}.bom-costing-gate.csv`)
    const componentIdentityPath = join(outDir, `${example.id}.component-identity.json`)
    const componentIdentityCsvPath = join(outDir, `${example.id}.component-identity.csv`)
    const sourcingIntakeTemplatePath = join(outDir, `${example.id}.sourcing-intake-template.json`)
    const sourcingIntakeTemplateCsvPath = join(outDir, `${example.id}.sourcing-intake-template.csv`)
    const interfaceGraphPath = join(outDir, `${example.id}.interface-graph.json`)
    const interfaceGraphMermaidPath = join(outDir, `${example.id}.interface-graph.mmd`)
    const interfaceContractsPath = join(outDir, `${example.id}.interface-contracts.json`)
    const interfaceVerificationGatePath = join(outDir, `${example.id}.interface-verification-gate.json`)
    const interfaceVerificationGateCsvPath = join(outDir, `${example.id}.interface-verification-gate.csv`)
    const componentAllocationGatePath = join(outDir, `${example.id}.component-allocation-gate.json`)
    const componentAllocationGateCsvPath = join(outDir, `${example.id}.component-allocation-gate.csv`)
    const subModuleEngineeringGatePath = join(outDir, `${example.id}.submodule-engineering-gate.json`)
    const subModuleEngineeringGateCsvPath = join(outDir, `${example.id}.submodule-engineering-gate.csv`)
    const moduleEngineeringGatePath = join(outDir, `${example.id}.module-engineering-gate.json`)
    const moduleEngineeringGateCsvPath = join(outDir, `${example.id}.module-engineering-gate.csv`)
    const moduleReviewPath = join(outDir, `${example.id}.module-review.json`)
    const engineeringReviewPackPath = join(outDir, `${example.id}.engineering-review-pack.json`)
    const engineeringReviewPackCsvPath = join(outDir, `${example.id}.engineering-review-pack.csv`)
    const engineeringAssuranceMatrixPath = join(outDir, `${example.id}.engineering-assurance-matrix.json`)
    const engineeringAssuranceMatrixCsvPath = join(outDir, `${example.id}.engineering-assurance-matrix.csv`)
    const requirementCoverageGatePath = join(outDir, `${example.id}.requirement-coverage-gate.json`)
    const requirementCoverageGateCsvPath = join(outDir, `${example.id}.requirement-coverage-gate.csv`)
    const engineeringCalculationsPath = join(outDir, `${example.id}.engineering-calculations.json`)
    const engineeringCalculationsCsvPath = join(outDir, `${example.id}.engineering-calculations.csv`)
    const engineeringAssumptionsPath = join(outDir, `${example.id}.engineering-assumptions.json`)
    const engineeringAssumptionsCsvPath = join(outDir, `${example.id}.engineering-assumptions.csv`)
    const verificationPlanPath = join(outDir, `${example.id}.verification-plan.json`)
    const verificationPlanCsvPath = join(outDir, `${example.id}.verification-plan.csv`)
    const verificationLedgerPath = join(outDir, `${example.id}.verification-ledger.json`)
    const verificationLedgerCsvPath = join(outDir, `${example.id}.verification-ledger.csv`)
    const verificationIntakeTemplatePath = join(outDir, `${example.id}.verification-intake-template.json`)
    const verificationIntakeTemplateCsvPath = join(outDir, `${example.id}.verification-intake-template.csv`)
    const readinessGatePath = join(outDir, `${example.id}.readiness-gate.json`)
    const readinessGateCsvPath = join(outDir, `${example.id}.readiness-gate.csv`)
    const preBomEngineeringGatePath = join(outDir, `${example.id}.pre-bom-engineering-gate.json`)
    const preBomEngineeringGateCsvPath = join(outDir, `${example.id}.pre-bom-engineering-gate.csv`)
    const evidenceGapRegisterPath = join(outDir, `${example.id}.evidence-gap-register.json`)
    const evidenceGapRegisterCsvPath = join(outDir, `${example.id}.evidence-gap-register.csv`)
    const evidenceAcquisitionPlanPath = join(outDir, `${example.id}.evidence-acquisition-plan.json`)
    const evidenceAcquisitionPlanCsvPath = join(outDir, `${example.id}.evidence-acquisition-plan.csv`)
    const closurePlanPath = join(outDir, `${example.id}.closure-plan.json`)
    const closurePlanCsvPath = join(outDir, `${example.id}.closure-plan.csv`)
    const claimLedgerPath = join(outDir, `${example.id}.claim-ledger.json`)
    const claimLedgerCsvPath = join(outDir, `${example.id}.claim-ledger.csv`)
    const claimEvidenceGatePath = join(outDir, `${example.id}.claim-evidence-gate.json`)
    const claimEvidenceGateCsvPath = join(outDir, `${example.id}.claim-evidence-gate.csv`)
    const documentTrustGatePath = join(outDir, `${example.id}.document-trust-gate.json`)
    const documentTrustGateCsvPath = join(outDir, `${example.id}.document-trust-gate.csv`)
    const evidenceAuthenticityGatePath = join(outDir, `${example.id}.evidence-authenticity-gate.json`)
    const evidenceAuthenticityGateCsvPath = join(outDir, `${example.id}.evidence-authenticity-gate.csv`)
    const evidenceReplacementPlanPath = join(outDir, `${example.id}.evidence-replacement-plan.json`)
    const evidenceReplacementPlanCsvPath = join(outDir, `${example.id}.evidence-replacement-plan.csv`)
    const trustRepairPlanPath = join(outDir, `${example.id}.trust-repair-plan.json`)
    const trustRepairPlanCsvPath = join(outDir, `${example.id}.trust-repair-plan.csv`)
    const scoreLedgerPath = join(outDir, `${example.id}.score-ledger.json`)
    const scoreLedgerCsvPath = join(outDir, `${example.id}.score-ledger.csv`)
    const depthBenchmarkPath = join(outDir, `${example.id}.depth-benchmark.json`)
    const depthBenchmarkCsvPath = join(outDir, `${example.id}.depth-benchmark.csv`)
    const sourcingPack = buildSourcingEvidencePack(result.dossier)
    const briefIntakeGate = buildBriefIntakeGate(result.dossier, result.stageTrace)
    const briefClarificationPlan = buildBriefClarificationPlan(result.dossier, result.stageTrace)
    const architectureAdmissionGate = buildArchitectureAdmissionGate(result.dossier, result.architectureReadiness, result.stageTrace)
    const componentCandidateGate = buildComponentCandidateGate(result.dossier)
    const sourcingAuthorizationGate = buildSourcingAuthorizationGate(result.dossier, result.architectureReadiness, result.stageTrace)
    const bomAdmissionGate = buildBomAdmissionGate(result.dossier, result.architectureReadiness, result.stageTrace)
    const stageIntegrityGate = buildStageIntegrityGate(result.stageTrace, result.dossier, result.architectureReadiness)
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
    const chainBenchmark = await readChainBenchmark(outDir, example.chainBenchmarkPath)
    const depthBenchmark = buildDepthBenchmark(result.dossier, result.architectureReadiness, result.issues, result.score, chainBenchmark)
    const scratchLineageGate = buildScratchLineageGate(result.dossier, result.stageTrace, depthBenchmark)
    const architectureFreezeGate = buildArchitectureFreezeGate(result.dossier, result.architectureReadiness, result.stageTrace, result.issues, depthBenchmark)
    const architectureFreezeClosurePlan = buildArchitectureFreezeClosurePlan(result.dossier, result.architectureReadiness, result.stageTrace, result.issues, depthBenchmark)
    const procurementReadinessGate = buildProcurementReadinessGate(result.dossier, result.architectureReadiness, result.stageTrace, result.issues, depthBenchmark)
    const html = renderReportHtml(result.dossier, result.issues, result.architectureReadiness, result.score, result.stageTrace, depthBenchmark)

    await writeFile(htmlPath, html, 'utf8')
    await writeFile(markdownPath, result.outline, 'utf8')
    await writeFile(jsonPath, JSON.stringify(result, null, 2), 'utf8')
    await writeFile(briefIntakeGatePath, JSON.stringify(briefIntakeGate, null, 2), 'utf8')
    await writeFile(briefIntakeGateCsvPath, renderBriefIntakeGateCsv(briefIntakeGate), 'utf8')
    await writeFile(briefClarificationPlanPath, JSON.stringify(briefClarificationPlan, null, 2), 'utf8')
    await writeFile(briefClarificationPlanCsvPath, renderBriefClarificationPlanCsv(briefClarificationPlan), 'utf8')
    await writeFile(architectureAdmissionGatePath, JSON.stringify(architectureAdmissionGate, null, 2), 'utf8')
    await writeFile(architectureAdmissionGateCsvPath, renderArchitectureAdmissionGateCsv(architectureAdmissionGate), 'utf8')
    await writeFile(componentCandidateGatePath, JSON.stringify(componentCandidateGate, null, 2), 'utf8')
    await writeFile(componentCandidateGateCsvPath, renderComponentCandidateGateCsv(componentCandidateGate), 'utf8')
    await writeFile(sourcingAuthorizationGatePath, JSON.stringify(sourcingAuthorizationGate, null, 2), 'utf8')
    await writeFile(sourcingAuthorizationGateCsvPath, renderSourcingAuthorizationGateCsv(sourcingAuthorizationGate), 'utf8')
    await writeFile(bomAdmissionGatePath, JSON.stringify(bomAdmissionGate, null, 2), 'utf8')
    await writeFile(bomAdmissionGateCsvPath, renderBomAdmissionGateCsv(bomAdmissionGate), 'utf8')
    await writeFile(stageIntegrityGatePath, JSON.stringify(stageIntegrityGate, null, 2), 'utf8')
    await writeFile(stageIntegrityGateCsvPath, renderStageIntegrityGateCsv(stageIntegrityGate), 'utf8')
    await writeFile(scratchLineageGatePath, JSON.stringify(scratchLineageGate, null, 2), 'utf8')
    await writeFile(scratchLineageGateCsvPath, renderScratchLineageGateCsv(scratchLineageGate), 'utf8')
    await writeFile(architectureFreezeGatePath, JSON.stringify(architectureFreezeGate, null, 2), 'utf8')
    await writeFile(architectureFreezeGateCsvPath, renderArchitectureFreezeGateCsv(architectureFreezeGate), 'utf8')
    await writeFile(architectureFreezeClosurePlanPath, JSON.stringify(architectureFreezeClosurePlan, null, 2), 'utf8')
    await writeFile(architectureFreezeClosurePlanCsvPath, renderArchitectureFreezeClosurePlanCsv(architectureFreezeClosurePlan), 'utf8')
    await writeFile(sourcingWorklistPath, JSON.stringify(buildSourcingWorklist(result.dossier), null, 2), 'utf8')
    await writeFile(sourcingPackPath, JSON.stringify(sourcingPack, null, 2), 'utf8')
    await writeFile(sourcingPackCsvPath, renderSourcingEvidencePackCsv(sourcingPack), 'utf8')
    await writeFile(sourcingLedgerPath, JSON.stringify(sourcingLedger, null, 2), 'utf8')
    await writeFile(sourcingLedgerCsvPath, renderSourcingLineLedgerCsv(sourcingLedger), 'utf8')
    await writeFile(bomProvenanceManifestPath, JSON.stringify(bomProvenanceManifest, null, 2), 'utf8')
    await writeFile(bomProvenanceManifestCsvPath, renderBomProvenanceManifestCsv(bomProvenanceManifest), 'utf8')
    await writeFile(sourceReferenceQualityGatePath, JSON.stringify(sourceReferenceQualityGate, null, 2), 'utf8')
    await writeFile(sourceReferenceQualityGateCsvPath, renderSourceReferenceQualityGateCsv(sourceReferenceQualityGate), 'utf8')
    await writeFile(bomEvidenceTracePath, JSON.stringify(bomEvidenceTrace, null, 2), 'utf8')
    await writeFile(bomEvidenceTraceCsvPath, renderBomEvidenceTraceMatrixCsv(bomEvidenceTrace), 'utf8')
    await writeFile(bomEvidenceClosurePlanPath, JSON.stringify(bomEvidenceClosurePlan, null, 2), 'utf8')
    await writeFile(bomEvidenceClosurePlanCsvPath, renderBomEvidenceClosurePlanCsv(bomEvidenceClosurePlan), 'utf8')
    await writeFile(sourcingBatchPlanPath, JSON.stringify(sourcingBatchPlan, null, 2), 'utf8')
    await writeFile(sourcingBatchPlanCsvPath, renderSourcingBatchPlanCsv(sourcingBatchPlan), 'utf8')
    await writeFile(procurementReadinessGatePath, JSON.stringify(procurementReadinessGate, null, 2), 'utf8')
    await writeFile(procurementReadinessGateCsvPath, renderProcurementReadinessGateCsv(procurementReadinessGate), 'utf8')
    await writeFile(bomCostingGatePath, JSON.stringify(bomCostingGate, null, 2), 'utf8')
    await writeFile(bomCostingGateCsvPath, renderBomCostingGateCsv(bomCostingGate), 'utf8')
    await writeFile(componentIdentityPath, JSON.stringify(componentIdentity, null, 2), 'utf8')
    await writeFile(componentIdentityCsvPath, renderComponentIdentityWorklistCsv(componentIdentity), 'utf8')
    await writeFile(sourcingIntakeTemplatePath, JSON.stringify(sourcingIntakeTemplate, null, 2), 'utf8')
    await writeFile(sourcingIntakeTemplateCsvPath, renderSourcingIntakeTemplateCsv(sourcingIntakeTemplate), 'utf8')
    await writeFile(interfaceGraphPath, JSON.stringify(interfaceGraph, null, 2), 'utf8')
    await writeFile(interfaceGraphMermaidPath, renderInterfaceGraphMermaid(interfaceGraph), 'utf8')
    await writeFile(interfaceContractsPath, JSON.stringify(interfaceContracts, null, 2), 'utf8')
    await writeFile(interfaceVerificationGatePath, JSON.stringify(interfaceVerificationGate, null, 2), 'utf8')
    await writeFile(interfaceVerificationGateCsvPath, renderInterfaceVerificationGateCsv(interfaceVerificationGate), 'utf8')
    await writeFile(componentAllocationGatePath, JSON.stringify(componentAllocationGate, null, 2), 'utf8')
    await writeFile(componentAllocationGateCsvPath, renderComponentAllocationGateCsv(componentAllocationGate), 'utf8')
    await writeFile(subModuleEngineeringGatePath, JSON.stringify(subModuleEngineeringGate, null, 2), 'utf8')
    await writeFile(subModuleEngineeringGateCsvPath, renderSubModuleEngineeringGateCsv(subModuleEngineeringGate), 'utf8')
    await writeFile(moduleEngineeringGatePath, JSON.stringify(moduleEngineeringGate, null, 2), 'utf8')
    await writeFile(moduleEngineeringGateCsvPath, renderModuleEngineeringGateCsv(moduleEngineeringGate), 'utf8')
    await writeFile(moduleReviewPath, JSON.stringify(moduleReview, null, 2), 'utf8')
    await writeFile(engineeringReviewPackPath, JSON.stringify(engineeringReviewPack, null, 2), 'utf8')
    await writeFile(engineeringReviewPackCsvPath, renderEngineeringReviewPackCsv(engineeringReviewPack), 'utf8')
    await writeFile(engineeringAssuranceMatrixPath, JSON.stringify(engineeringAssuranceMatrix, null, 2), 'utf8')
    await writeFile(engineeringAssuranceMatrixCsvPath, renderEngineeringAssuranceMatrixCsv(engineeringAssuranceMatrix), 'utf8')
    await writeFile(requirementCoverageGatePath, JSON.stringify(requirementCoverageGate, null, 2), 'utf8')
    await writeFile(requirementCoverageGateCsvPath, renderRequirementCoverageGateCsv(requirementCoverageGate), 'utf8')
    await writeFile(engineeringCalculationsPath, JSON.stringify(engineeringCalculations, null, 2), 'utf8')
    await writeFile(engineeringCalculationsCsvPath, renderEngineeringCalculationLedgerCsv(engineeringCalculations), 'utf8')
    await writeFile(engineeringAssumptionsPath, JSON.stringify(engineeringAssumptions, null, 2), 'utf8')
    await writeFile(engineeringAssumptionsCsvPath, renderEngineeringAssumptionLedgerCsv(engineeringAssumptions), 'utf8')
    await writeFile(verificationPlanPath, JSON.stringify(verificationPlan, null, 2), 'utf8')
    await writeFile(verificationPlanCsvPath, renderEngineeringVerificationPlanCsv(verificationPlan), 'utf8')
    await writeFile(verificationLedgerPath, JSON.stringify(verificationLedger, null, 2), 'utf8')
    await writeFile(verificationLedgerCsvPath, renderVerificationEvidenceLedgerCsv(verificationLedger), 'utf8')
    await writeFile(verificationIntakeTemplatePath, JSON.stringify(verificationIntakeTemplate, null, 2), 'utf8')
    await writeFile(verificationIntakeTemplateCsvPath, renderVerificationIntakeTemplateCsv(verificationIntakeTemplate), 'utf8')
    await writeFile(readinessGatePath, JSON.stringify(readinessGate, null, 2), 'utf8')
    await writeFile(readinessGateCsvPath, renderReportReadinessGateCsv(readinessGate), 'utf8')
    await writeFile(preBomEngineeringGatePath, JSON.stringify(preBomEngineeringGate, null, 2), 'utf8')
    await writeFile(preBomEngineeringGateCsvPath, renderPreBomEngineeringGateCsv(preBomEngineeringGate), 'utf8')
    await writeFile(evidenceGapRegisterPath, JSON.stringify(evidenceGapRegister, null, 2), 'utf8')
    await writeFile(evidenceGapRegisterCsvPath, renderEvidenceGapRegisterCsv(evidenceGapRegister), 'utf8')
    await writeFile(evidenceAcquisitionPlanPath, JSON.stringify(evidenceAcquisitionPlan, null, 2), 'utf8')
    await writeFile(evidenceAcquisitionPlanCsvPath, renderEvidenceAcquisitionPlanCsv(evidenceAcquisitionPlan), 'utf8')
    await writeFile(closurePlanPath, JSON.stringify(closurePlan, null, 2), 'utf8')
    await writeFile(closurePlanCsvPath, renderClosurePlanCsv(closurePlan), 'utf8')
    await writeFile(claimLedgerPath, JSON.stringify(claimLedger, null, 2), 'utf8')
    await writeFile(claimLedgerCsvPath, renderClaimLedgerCsv(claimLedger), 'utf8')
    await writeFile(claimEvidenceGatePath, JSON.stringify(claimEvidenceGate, null, 2), 'utf8')
    await writeFile(claimEvidenceGateCsvPath, renderClaimEvidenceGateCsv(claimEvidenceGate), 'utf8')
    await writeFile(documentTrustGatePath, JSON.stringify(documentTrustGate, null, 2), 'utf8')
    await writeFile(documentTrustGateCsvPath, renderDocumentTrustGateCsv(documentTrustGate), 'utf8')
    await writeFile(evidenceAuthenticityGatePath, JSON.stringify(evidenceAuthenticityGate, null, 2), 'utf8')
    await writeFile(evidenceAuthenticityGateCsvPath, renderEvidenceAuthenticityGateCsv(evidenceAuthenticityGate), 'utf8')
    await writeFile(evidenceReplacementPlanPath, JSON.stringify(evidenceReplacementPlan, null, 2), 'utf8')
    await writeFile(evidenceReplacementPlanCsvPath, renderEvidenceReplacementPlanCsv(evidenceReplacementPlan), 'utf8')
    await writeFile(trustRepairPlanPath, JSON.stringify(trustRepairPlan, null, 2), 'utf8')
    await writeFile(trustRepairPlanCsvPath, renderTrustRepairPlanCsv(trustRepairPlan), 'utf8')
    await writeFile(scoreLedgerPath, JSON.stringify(scoreLedger, null, 2), 'utf8')
    await writeFile(scoreLedgerCsvPath, renderSectionScoreLedgerCsv(scoreLedger), 'utf8')
    await writeFile(depthBenchmarkPath, JSON.stringify(depthBenchmark, null, 2), 'utf8')
    await writeFile(depthBenchmarkCsvPath, renderDepthBenchmarkCsv(depthBenchmark), 'utf8')

    generated.push({
      id: example.id,
      title: example.title,
      summary: buildArtifactDashboardSummary(result, readinessGate, bomProvenanceManifest, evidenceGapRegister, depthBenchmark),
      htmlPath,
      markdownPath,
      jsonPath,
      briefIntakeGatePath,
      briefIntakeGateCsvPath,
      briefClarificationPlanPath,
      briefClarificationPlanCsvPath,
      architectureAdmissionGatePath,
      architectureAdmissionGateCsvPath,
      componentCandidateGatePath,
      componentCandidateGateCsvPath,
      sourcingAuthorizationGatePath,
      sourcingAuthorizationGateCsvPath,
      bomAdmissionGatePath,
      bomAdmissionGateCsvPath,
      stageIntegrityGatePath,
      stageIntegrityGateCsvPath,
      scratchLineageGatePath,
      scratchLineageGateCsvPath,
      architectureFreezeGatePath,
      architectureFreezeGateCsvPath,
      architectureFreezeClosurePlanPath,
      architectureFreezeClosurePlanCsvPath,
      sourcingWorklistPath,
      sourcingPackPath,
      sourcingPackCsvPath,
      sourcingLedgerPath,
      sourcingLedgerCsvPath,
      bomProvenanceManifestPath,
      bomProvenanceManifestCsvPath,
      sourceReferenceQualityGatePath,
      sourceReferenceQualityGateCsvPath,
      bomEvidenceTracePath,
      bomEvidenceTraceCsvPath,
      bomEvidenceClosurePlanPath,
      bomEvidenceClosurePlanCsvPath,
      sourcingBatchPlanPath,
      sourcingBatchPlanCsvPath,
      procurementReadinessGatePath,
      procurementReadinessGateCsvPath,
      bomCostingGatePath,
      bomCostingGateCsvPath,
      componentIdentityPath,
      componentIdentityCsvPath,
      sourcingIntakeTemplatePath,
      sourcingIntakeTemplateCsvPath,
      interfaceGraphPath,
      interfaceGraphMermaidPath,
      interfaceContractsPath,
      interfaceVerificationGatePath,
      interfaceVerificationGateCsvPath,
      componentAllocationGatePath,
      componentAllocationGateCsvPath,
      subModuleEngineeringGatePath,
      subModuleEngineeringGateCsvPath,
      moduleEngineeringGatePath,
      moduleEngineeringGateCsvPath,
      moduleReviewPath,
      engineeringReviewPackPath,
      engineeringReviewPackCsvPath,
      engineeringAssuranceMatrixPath,
      engineeringAssuranceMatrixCsvPath,
      requirementCoverageGatePath,
      requirementCoverageGateCsvPath,
      engineeringCalculationsPath,
      engineeringCalculationsCsvPath,
      engineeringAssumptionsPath,
      engineeringAssumptionsCsvPath,
      verificationPlanPath,
      verificationPlanCsvPath,
      verificationLedgerPath,
      verificationLedgerCsvPath,
      verificationIntakeTemplatePath,
      verificationIntakeTemplateCsvPath,
      readinessGatePath,
      readinessGateCsvPath,
      preBomEngineeringGatePath,
      preBomEngineeringGateCsvPath,
      evidenceGapRegisterPath,
      evidenceGapRegisterCsvPath,
      evidenceAcquisitionPlanPath,
      evidenceAcquisitionPlanCsvPath,
      closurePlanPath,
      closurePlanCsvPath,
      claimLedgerPath,
      claimLedgerCsvPath,
      claimEvidenceGatePath,
      claimEvidenceGateCsvPath,
      documentTrustGatePath,
      documentTrustGateCsvPath,
      evidenceAuthenticityGatePath,
      evidenceAuthenticityGateCsvPath,
      evidenceReplacementPlanPath,
      evidenceReplacementPlanCsvPath,
      trustRepairPlanPath,
      trustRepairPlanCsvPath,
      scoreLedgerPath,
      scoreLedgerCsvPath,
      depthBenchmarkPath,
      depthBenchmarkCsvPath,
    })
  }

  const productClassCoverage = await buildProductClassCoverageMatrix()
  await writeFile(join(outDir, 'product-class-coverage.json'), JSON.stringify(productClassCoverage, null, 2), 'utf8')
  await writeFile(join(outDir, 'product-class-coverage.csv'), renderProductClassCoverageCsv(productClassCoverage), 'utf8')

  await tryWritePdfs(generated)
  await writeFile(join(outDir, 'index.html'), renderIndex(generated), 'utf8')

  console.log(`Generated ${generated.length} report document sets in ${outDir}`)
  for (const doc of generated) {
    console.log(`- ${doc.title}: ${doc.htmlPath}`)
    if (doc.pdfPath) console.log(`  PDF: ${doc.pdfPath}`)
    if (doc.pdfSkippedReason) console.log(`  PDF skipped: ${doc.pdfSkippedReason}`)
  }
}

async function tryWritePdfs(generated: GeneratedDocument[]): Promise<void> {
  let playwright: typeof import('playwright') | undefined
  try {
    playwright = await import('playwright')
  } catch (error) {
    for (const doc of generated) doc.pdfSkippedReason = describeError(error)
    return
  }

  let browser: Awaited<ReturnType<typeof playwright.chromium.launch>> | undefined
  try {
    browser = await playwright.chromium.launch({ headless: true })
    for (const doc of generated) {
      const page = await browser.newPage()
      await page.goto(`file://${doc.htmlPath}`, { waitUntil: 'networkidle' })
      const pdfPath = doc.htmlPath.replace(/\.html$/, '.pdf')
      await page.pdf({ path: pdfPath, format: 'A4', printBackground: true })
      await page.close()
      doc.pdfPath = pdfPath
    }
  } catch (error) {
    for (const doc of generated) doc.pdfSkippedReason = describeError(error)
  } finally {
    await browser?.close()
  }
}

function renderIndex(generated: GeneratedDocument[]): string {
  const dashboard = renderDashboardTable(generated)
  const links = generated.map(doc => `
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
  <title>Report Compiler Prototype Documents</title>
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
  <h1>Report Compiler Prototype Documents</h1>
  <p>Generated from the isolated prototype. Use these to inspect architecture readiness before BoM review.</p>
  <p><a href="./product-class-coverage.json">Product-class coverage matrix</a> · <a href="./product-class-coverage.csv">Coverage CSV</a></p>
  ${dashboard}
  <ul>${links}</ul>
</body>
</html>`
}

function renderDashboardTable(generated: GeneratedDocument[]): string {
  const rows = generated.map(doc => `<tr>
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

function describeError(error: unknown): string {
  return error instanceof Error ? error.message.split('\n')[0] : String(error)
}

async function readChainBenchmark(outDir: string, relativePath: string | undefined): Promise<ChainV2Analysis | undefined> {
  if (!relativePath) return undefined
  try {
    const parsed = JSON.parse(await readFile(join(outDir, relativePath), 'utf8')) as { analysis?: ChainV2Analysis }
    return parsed.analysis
  } catch {
    return undefined
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
