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
  // E3 FIX (2026-05-06): detection rating (1-10) required for proper RPN.
  // Some LLM outputs omit this; PDF renderer defaults to 5 when missing.
  detection?: number
  mitigation?: string
  // E3: verification test — the specific test / analysis / inspection that
  // confirms the mitigation is effective. Reference-quality FMEA entries have
  // this; without it, RPN is just a guess.
  verificationTest?: string
  owner?: string
  residualSeverity?: number
  residualLikelihood?: number
  residualDetection?: number
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
  // E1 FIX (2026-05-06): expose the raw BOM cost (before overhead multiplier)
  // so the cost-waterfall renderer can break down assembly labour / factory
  // test / overheads / contingency explicitly rather than hiding them inside
  // a single overheadMultiplier number.
  rawBomCostGbp?: number
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
    // C2 FIX (2026-05-06): added fields to carry local-corpus enrichment
    certifications?: string[]
    processes?: string[]
    // E4 (2026-05-06): companyId lets the PDF renderer fetch a datasheet-
    // backed snippet from the page_chunks corpus for top-10 BOM parts.
    companyId?: string
    // D3 (2026-05-06): 20-tag domain taxonomy computed from the supplier's
    // description. Stage 5 uses it to re-rank matches; PDF renderer can
    // surface it for debug / audit.
    domainTags?: string[]
    // C4 (2026-05-06): process/material verification via reverse indexes.
    // - 'process+material' — supplier claims both the part's process AND material
    // - 'process' — supplier claims the process only
    // - 'material' — supplier claims the material only
    // - 'unverified' — neither matched (PDF renders in red)
    processMatch?: 'process+material' | 'process' | 'material' | 'unverified'
    // E4: 1-2 sentence excerpt from this supplier's pages mentioning the
    // part. Populated inline by Stage 5 so the PDF renderer doesn't hit
    // the corpus on its own (keeps the renderer pure / local-only).
    datasheetSnippet?: {
      text: string
      sourceUrl: string
      relevance: number
    }
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
  briefText?: string
  // BENCH-L1 (2026-05-06): persist the product-classifier output so the PDF
  // renderer can look up public benchmark bands without re-classifying.
  productClass?: string
  // A4 (2026-05-06): when a critical stage fails (research / decompose /
  // BOM / critical-gate), the orchestrator sets this so the PDF renderer
  // can show a prominent "Pipeline halted at stage X" notice instead of
  // silently producing a partial report.
  pipelineError?: {
    stage: string
    message: string
    occurredAt: string
    recoverable: boolean
  }
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
