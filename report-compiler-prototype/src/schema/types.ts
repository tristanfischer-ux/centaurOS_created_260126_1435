export type ProductClass =
  | 'energy_storage'
  | 'vertical_farm'
  | 'heat_pump'
  | 'ev_charger'
  | 'bioreactor'
  | 'drone'
  | 'auv'
  | 'edge_ai'
  | 'haps'
  | 'cgm'
  | 'unknown'

export const PRODUCT_CLASSES: ProductClass[] = [
  'energy_storage',
  'vertical_farm',
  'heat_pump',
  'ev_charger',
  'bioreactor',
  'drone',
  'auv',
  'edge_ai',
  'haps',
  'cgm',
  'unknown',
]

export type PdfSectionId =
  | 'cover'
  | 'executive_summary'
  | 'brief_requirements'
  | 'design_modules'
  | 'bom'
  | 'cost_analysis'
  | 'sourcing_strategy'
  | 'feasibility_notes'
  | 'risk_register'
  | 'regulatory'
  | 'sources_references'
  | 'appendix_technical'
  | 'visual_layout'

export type Confidence = 'high' | 'medium' | 'low'
export type Severity = 'blocker' | 'major' | 'minor'
export type SourceGrade = 'verified' | 'priced' | 'catalogue' | 'estimate' | 'assumption'

export interface ProvenanceRef {
  kind: 'brief' | 'formula' | 'source' | 'model' | 'assumption' | 'class_pack'
  ref: string
  quote?: string
}

export interface SourcingEvidenceRecord {
  componentWordId: string
  supplierName: string
  manufacturer?: string
  mpn?: string
  unitCostGbp: number
  leadTimeWeeks?: number
  sourceGrade: Extract<SourceGrade, 'verified' | 'priced' | 'catalogue'>
  evidence: ProvenanceRef
  retrievedAt: string
}

export type VerificationEvidenceKind =
  | 'design_review'
  | 'calculation'
  | 'interface_review'
  | 'source_evidence'
  | 'compliance_review'

export type VerificationEvidenceVerdict = 'accepted' | 'rejected' | 'deferred'

export interface VerificationEvidenceRecord {
  activityId: string
  evidenceKind: Exclude<VerificationEvidenceKind, 'source_evidence'>
  reviewerName: string
  verdict: VerificationEvidenceVerdict
  evidenceRef: string
  evidenceNote: string
  reviewedAt: string
}

export interface Quantity {
  value: number
  unit: string
  provenance: ProvenanceRef[]
}

export interface BriefRequirement {
  id: string
  label: string
  value: string | number
  unit?: string
  source: ProvenanceRef
}

export interface BriefModel {
  originalText: string
  productName: string
  requirements: BriefRequirement[]
  assumptions: string[]
}

export interface KeyMetric {
  id: string
  label: string
  value: number | string
  unit?: string
  formula?: string
  inputs?: Record<string, number>
  notes: string
  provenance: ProvenanceRef[]
  confidence: Confidence
}

export interface ComponentWord {
  id: string
  name: string
  quantity: Quantity
  role: string
  sourceGrade: SourceGrade
  provenance: ProvenanceRef[]
}

export interface SubModule {
  id: string
  name: string
  purpose: string
  words: ComponentWord[]
  interfaces: string[]
}

export interface Module {
  id: string
  displayName: string
  purpose: string
  subModules: SubModule[]
  interfaces: string[]
}

export interface ArchitectureModel {
  modules: Module[]
  crossModuleInterfaces: string[]
}

export interface ArchitectureReadiness {
  readyForBom: boolean
  moduleCount: number
  subModuleCount: number
  componentWordCount: number
  requiredInterfaceLinks: Array<{
    fromModuleId: string
    toModuleId: string
    via: string
    present: boolean
    reason: string
  }>
  blockingIssues: SectionIssue[]
}

export type PipelineStageId =
  | 'brief_parsing'
  | 'product_class_selection'
  | 'universal_module_architecture'
  | 'submodule_expansion'
  | 'interface_graph'
  | 'component_candidates'
  | 'architecture_readiness_gate'
  | 'sourcing_bom_admission'

export type PipelineStageStatus = 'passed' | 'warning' | 'blocked'

export interface PipelineStageTrace {
  id: PipelineStageId
  title: string
  status: PipelineStageStatus
  summary: string
  metrics: Record<string, string | number | boolean>
  evidence: string[]
  limitations: string[]
}

export interface BomLine {
  id: string
  componentWordId: string
  description: string
  quantity: Quantity
  unitCostGbp: number | null
  totalCostGbp: number | null
  sourceGrade: SourceGrade
  supplier?: string
  manufacturer?: string
  mpn?: string
  leadTimeWeeks?: number
  provenance: ProvenanceRef[]
  critical: boolean
}

export interface BomModel {
  lines: BomLine[]
  totalCostGbp: number
  coverage: {
    requiredPartsPresent: number
    requiredPartsTotal: number
    pricedLines: number
    totalLines: number
  }
}

export interface CostModel {
  capexGbp: number
  opexAnnualGbp: number
  nreGbp: number
  benchmarkGbp?: { low: number; high: number; source: ProvenanceRef }
  sensitivity: Array<{ driver: string; deltaPct: number; impactGbp: number }>
}

export interface SourcingModel {
  primarySuppliers: Array<{ name: string; spendGbp: number; risk: Confidence }>
  singleSourceRisks: string[]
  fallbackSuppliers: string[]
  admission: {
    status: 'not_started' | 'partial' | 'complete'
    candidateLines: number
    admittedLines: number
    unpricedLines: number
    unpricedCriticalLines: number
    rejectedRecords: Array<{ componentWordId: string; reason: string }>
  }
}

export interface RegulatoryModel {
  standards: Array<{
    id: string
    title: string
    jurisdiction: string
    evidenceRequired: string
    provenance: ProvenanceRef[]
  }>
}

export interface RiskModel {
  fmea: Array<{
    hazard: string
    severity: number
    occurrence: number
    detection: number
    mitigation: string
  }>
}

export type EngineeringSanityStatus = 'pass' | 'warn' | 'fail'

export interface EngineeringSanityCheck {
  id: string
  label: string
  status: EngineeringSanityStatus
  value: number | string
  unit?: string
  expectedRange: string
  interpretation: string
  provenance: ProvenanceRef[]
}

export type RequirementTraceStatus = 'covered' | 'partial' | 'uncovered'

export interface RequirementTraceLink {
  moduleId: string
  moduleName: string
  subModuleId?: string
  subModuleName?: string
  componentWordId?: string
  componentName?: string
  rationale: string
}

export interface RequirementTrace {
  requirementId: string
  label: string
  value: string | number
  unit?: string
  status: RequirementTraceStatus
  architectureLinks: RequirementTraceLink[]
  keyMetricIds: string[]
  engineeringSanityCheckIds: string[]
  notes: string[]
  provenance: ProvenanceRef[]
}

export interface FeasibilityModel {
  verdict: 'feasible' | 'conditional' | 'not_feasible'
  blockers: string[]
  warnings: string[]
  mitigationPlan: string[]
  engineeringSanityChecks: EngineeringSanityCheck[]
}

export interface SourceLedger {
  refs: ProvenanceRef[]
  sourcingEvidence: SourcingEvidenceRecord[]
  verificationEvidence: VerificationEvidenceRecord[]
}

export interface AuditEvent {
  timestamp: string
  stage: string
  message: string
}

export interface ProductDossier {
  id: string
  productClass: ProductClass
  brief: BriefModel
  requirementTrace: RequirementTrace[]
  keyMetrics: KeyMetric[]
  architecture: ArchitectureModel
  bom: BomModel
  cost: CostModel
  sourcing: SourcingModel
  regulatory: RegulatoryModel
  risks: RiskModel
  feasibility: FeasibilityModel
  sources: SourceLedger
  audit: AuditEvent[]
}

export interface ReportInput {
  id: string
  productClass?: ProductClass
  briefText: string
  sourcingEvidence?: SourcingEvidenceRecord[]
  verificationEvidence?: VerificationEvidenceRecord[]
}

export interface SectionIssue {
  section: PdfSectionId
  severity: Severity
  code: string
  message: string
  path?: string
  repairHint?: string
}

export interface ReportRunResult {
  ok: boolean
  dossier: ProductDossier
  architectureReadiness: ArchitectureReadiness
  stageTrace: PipelineStageTrace[]
  issues: SectionIssue[]
  outline: string
  score?: BatchSectionScore
}

export interface BatchSectionScore {
  sectionScores: Partial<Record<PdfSectionId, number>>
  mean: number
}
