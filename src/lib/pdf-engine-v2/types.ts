export interface ResearchResult {
  report: string
  sources: Array<{ uri: string; title: string }>
  standardCodes?: string[]
  industryDomain?: string
  trainingDataDossier?: string
  designBrief?: DesignBrief
}

export interface DesignBrief {
  useCase: string
  targetProcess: string
  targetMaterial: string
  toleranceTarget: string
  quantityTarget: string
  complianceNotes: string
  mission?: string
  targetCustomers?: string
  whyNow?: string
  constraints?: BriefConstraints
  regulatory?: RegulatoryItem[]
  sources?: SourceCitation[]
  marketSizing?: MarketSizing
  competitors?: Competitor[]
}

export interface BriefConstraints {
  unitCostCeilingGbp?: number
  costCeilings?: Array<{ type: string; gbp: number; source: string }>
  maxMassKg?: number
  batchSize?: number
  markets?: string[]
}

export interface RegulatoryItem {
  code: string
  name: string
  summary: string
  status: string
  applicability?: string
  designImpact?: string
  evidenceRequired?: string
  ownerRole?: string
  gapAction?: string
}

export interface SourceCitation {
  title: string
  type: string
  year?: number
  publisher?: string
  relevance: string
  uri?: string
}

export interface MarketSizing {
  tamMUsd: number
  samMUsd: number
  somMUsd: number
  cagrPct: number
  cagrPeriod: string
  primarySource: string
  segments: Array<{ name: string; sizeMUsd: number; year: number; source: string }>
}

export interface Competitor {
  name: string
  countryIso?: string
  product: string
  technicalSpecs?: string
  pricing?: string
  strengths: string
  weaknesses: string
  differentiationAngle: string
}

export interface Module {
  id: string
  name: string
  purpose: string
  inputs: string[]
  outputs: string[]
  keyParts: string[]
  leadWeeks: number
  estimatedMassKg?: number
  description: string
  whyItMatters: string
  failureModes: string[]
  unknowns: string[]
  riskMatrix?: RiskRow[]
  specs?: ModuleSpecs
  mirrorOf?: string
  status: string
}

export interface ModuleSpecs {
  powerW?: number
  voltageV?: number
  currentA?: number
  pressureBar?: number
  flowLpm?: number
  torqueNm?: number
  energyKwh?: number
  capacityWh?: number
  envelopeXMm?: number
  envelopeYMm?: number
  envelopeZMm?: number
}

export interface RiskRow {
  id: string
  hazard: string
  cause?: string
  consequence?: string
  existingControls?: string
  severity: number
  likelihood: number
  mitigation?: string
  owner?: string
  residualSeverity?: number
  residualLikelihood?: number
}

export interface Part {
  id?: string
  partNumber: string
  name: string
  description?: string
  sourceModuleId?: string
  process?: string
  material?: string
  materialSpec?: string
  finish?: string
  tolerance?: string
  massKg?: number
  envelopeXMm?: number
  envelopeYMm?: number
  envelopeZMm?: number
  estimatedUnitCostGbp?: number
  isPurchased?: boolean
}

export interface BomLine {
  id?: string
  parentPartId?: string | null
  childPartId: string
  quantity: number
  referenceDesignator?: string
  notes?: string
  sortOrder?: number
}

export interface CostEstimate {
  moduleId: string
  totalPerUnit: number | null
  confidence: 'low' | 'medium' | 'high'
  assumptions: string[]
  parts?: Array<{
    name: string
    type: 'buy' | 'make'
    cost: number
    reasoning: string
    process?: string
    material?: string
  }>
  labourCost?: number | null
  labourReasoning?: string
  reasoning?: string
}

export interface CostBreakdown {
  unitTotalGbp: number
  ceilingGbp: number | null
  perModule: Array<{ moduleName: string; totalGbp: number }>
  overheadMultiplier: number
  nreTotalGbp: number
}

export interface SpecialistReview {
  specialistId: string
  specialistName: string
  verdict: 'pass' | 'warn' | 'fail'
  summary: string
  issues: Array<{
    severity: 'critical' | 'warning' | 'info'
    category: string
    message: string
    suggestion?: string
  }>
  recommendations: string[]
  reviewMarkdown: string
  reviewedAt: string
}

export interface Envelope {
  kind: string
  label: string
  interior_w_mm: number
  interior_d_mm: number
  interior_h_mm: number
  interior_floor_m2: number
  interior_volume_m3: number
}

export interface ModuleDimensions {
  w_mm: number
  d_mm: number
  h_mm: number
  floor_m2: number
  mount: string
  scaled_by: string
}

export interface DimensionSheet {
  feasible: boolean
  rules_domain: string
  envelope: Envelope
  target: Record<string, number>
  floor_budget_m2: number
  module_dimensions: Record<string, ModuleDimensions>
  conflicts: string[]
  recommendations: string[]
}

export interface SupplierMatch {
  partId: string
  partName: string
  suppliers: Array<{
    name: string
    url: string
    reason: string
    score: number
    country?: string
  }>
}

export interface SourceAttribution {
  section: string
  source: 'llm' | 'database' | 'search' | 'deterministic' | 'user'
  detail: string
}

export interface LlmAttribution {
  section: string
  model: string
  provider: string
  tokensIn?: number
  tokensOut?: number
}

export interface SectionScore {
  section: string
  score: number
  reasons: string[]
  suggestions: string[]
}

export interface PipelineState {
  projectId: string
  research: ResearchResult | null
  modules: Module[]
  dimensionSheet: DimensionSheet | null
  parts: Part[]
  bomLines: BomLine[]
  costBreakdown: CostBreakdown | null
  reviews: SpecialistReview[]
  suppliers: SupplierMatch[]
  proofreadFindings: string | null
  sourceAttributions: SourceAttribution[]
  llmAttributions: LlmAttribution[]
  sectionScores: SectionScore[]
}

export type StageName =
  | 'research'
  | 'decompose'
  | 'size_layout'
  | 'bom_cost'
  | 'suppliers'
  | 'review'
  | 'pdf'

export interface StageResult<T = unknown> {
  ok: boolean
  data?: T
  error?: string
  durationMs: number
}

export const DOMAIN_OVERHEAD: Record<string, { multiplier: number; nreRate: number }> = {
  battery_energy_storage: { multiplier: 1.5, nreRate: 0.15 },
  vertical_farm: { multiplier: 1.4, nreRate: 0.12 },
  heat_pump: { multiplier: 1.4, nreRate: 0.12 },
  consumer_electronics: { multiplier: 1.3, nreRate: 0.10 },
  aerospace: { multiplier: 1.8, nreRate: 0.20 },
  medical: { multiplier: 1.7, nreRate: 0.18 },
  automotive: { multiplier: 1.6, nreRate: 0.15 },
  industrial: { multiplier: 1.5, nreRate: 0.12 },
  default: { multiplier: 1.5, nreRate: 0.12 },
}
