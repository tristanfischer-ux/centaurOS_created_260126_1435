// ── PA Stage 1 — Brief Parsing types ─────────────────────────────────────────

/** Source provenance tag for brief constraint fields.
 *  "user"    = value explicitly stated in founder text.
 *  "inferred" = value derivable from a stated fact.
 *  "missing"  = founder text is silent; value MUST be null and field listed in missing_mandatory_fields.
 */
export type BriefSourceTag = 'user' | 'inferred' | 'missing'

export interface StructuredBriefConstraintValue<T = number | null> {
  value: T
  currency?: 'GBP' | 'USD' | 'EUR'
  source: BriefSourceTag
}

export interface StructuredBriefDimensions {
  w: number | null
  d: number | null
  h: number | null
  source: BriefSourceTag
}

// BLOCKER-6 fix: flattened single shape with nullable value — no discriminated
// union needed. Matches the prompt schema (BLOCKER-4) and eliminates any-coercion
// silent drops when narrowing the former undiscriminated union.
export interface StructuredBriefPerformance {
  key_metric: string | null
  value: number | null
  unit: string | null
  source: BriefSourceTag
}

// BLOCKER-4 fix: temp values are nullable — LLM must not invent them.
export interface StructuredBriefOperatingEnvironment {
  temp_min_c: number | null
  temp_max_c: number | null
  source: BriefSourceTag
}

export interface StructuredBriefSafetyStandard {
  standard: string
  /** The standard number / code (e.g. "IEC 62619:2022"). Used by council-scorer display. */
  code?: string
  /** Source grade: A = official body, B = industry body, C = LLM-inferred. Used by council-scorer rubric. */
  source_grade?: 'A' | 'B' | 'C'
  source: 'user' | 'inferred'
}

export interface StructuredBriefAdditionalConstraint {
  description: string
  source: 'user' | 'inferred'
}

export interface StructuredBriefJSON {
  project_id: string
  product_description: string
  mission_statement: string
  target_customers: string
  why_now: string
  constraints: {
    unit_cost_ceiling: {
      value: number | null
      currency: 'GBP' | 'USD' | 'EUR'
      source: BriefSourceTag
    }
    max_mass_kg: {
      value: number | null
      source: BriefSourceTag
    }
    max_dimensions_mm: StructuredBriefDimensions
    // BLOCKER-6 fix: single flat type, no union. value is nullable — anti-invention rule.
    target_performance: StructuredBriefPerformance
    target_process: {
      value: string | null
      source: BriefSourceTag
    }
    target_material: {
      value: string | null
      source: BriefSourceTag
    }
    batch_size: {
      value: number | null
      source: BriefSourceTag
    }
    design_life: {
      value: string | null
      source: BriefSourceTag
    }
    operating_environment: StructuredBriefOperatingEnvironment
    safety_standards: StructuredBriefSafetyStandard[]
    additional_constraints: StructuredBriefAdditionalConstraint[]
  }
  missing_mandatory_fields: string[]
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
}

// ── PA Stage 3 — Research Synthesis types ────────────────────────────────────

export interface ResearchCompetitor {
  company: string
  product: string
  pricing: string
  key_specs: string
  strengths: string[]
  weaknesses: string[]
  differentiation_angle: string
}

export interface ResearchSource {
  title: string
  type: 'standard' | 'market_report' | 'datasheet' | 'competitor_spec' | 'government_policy'
  year: number
  relevance: string
  source_grade: 'A' | 'B' | 'C' | 'D' | 'E'
}

export interface ResearchSynthesis {
  market_context: string
  why_now: string
  competitors: ResearchCompetitor[]
  research_sources: ResearchSource[]
  /** Always 'E' — this is LLM-generated synthesis. Individual sources may be higher. */
  source_grade_overall: 'E'
  claims_requiring_verification: string[]
}

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
  batchSize?: number | string
  markets?: string[]
  jurisdiction?: string
  envelope?: string
  operatingTemperature?: string
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

// === PA Stage 5 Module Decomposition ===
// Added Phase D1. Fields extend the PA Stage 5 schema. Separate from the
// legacy Module interface above — the PA path uses ModulePA; legacy path
// uses Module. Both coexist behind the PA_PIPELINE flag.

export interface ModulePAExpectedPart {
  name: string
  /**
   * Authoritative count needed for ONE finished unit assembly.
   * Derived from brief specs (energy, power, voltage, dimensions) — NOT defaulted to 1
   * unless the part is genuinely a single instance (e.g. one main controller).
   * Renamed from the legacy `quantity: string` field. Legacy consumers that read `quantity`
   * should be updated to read `quantity_per_assembly` (numeric).
   */
  quantity_per_assembly: number
  /**
   * The verbatim formula or reasoning the LLM used to derive quantity_per_assembly.
   * Examples: "3,500 kWh / 0.8 DoD × 1000 / (3.2 V × 280 Ah) = 4,880 → 4,896 (16-string aligned)"
   * Must never be a generic string like "derived from brief".
   * Optional/null when the part has a trivially obvious count (e.g. 1 container).
   */
  quantity_calculation_basis?: string | null
  /** Legacy field — kept for backwards compatibility with older LLM outputs that still emit `quantity: string`. */
  quantity?: string
  role: string
  /** LLM's best guess at a manufacturer part number (null when unknown). */
  mpn?: string | null
  /** Manufacturer name, e.g. "CATL", "Sungrow", "TE Connectivity" (null when unknown). */
  manufacturer?: string | null
  /**
   * 5-class taxonomy used for distributor/corpus routing in the BOM stage.
   * - electronic_cots  → Mouser/Digi-Key/Farnell lookup
   * - mechanical_cots  → Mouser lookup (v1; McMaster/Misumi future work)
   * - structural_fabricated → corpus supplier search
   * - oem_subsystem    → OEM estimate, manufacturer hint in PDF
   * - software_ip      → OEM estimate, no distributor lookup
   */
  part_class?: 'electronic_cots' | 'mechanical_cots' | 'structural_fabricated' | 'oem_subsystem' | 'software_ip' | null
  /** How confident the LLM is about the mpn/manufacturer. */
  confidence?: 'high' | 'medium' | 'low' | null
  /**
   * LLM-estimated per-unit market price in GBP for parts where the LLM has
   * reasonable knowledge of market price (battery cells, contactors, transformers,
   * etc.). Used as fallback unit cost when distributor lookup returns nothing and
   * verification_status is 'estimated'.
   * Set to null when the LLM does not have reliable price knowledge.
   */
  estimated_unit_price_gbp?: number | null
}

export interface ModulePAInterface {
  type: 'electrical' | 'mechanical' | 'thermal' | 'data' | 'fluid'
  connects_to: string
  description: string
}

export interface ModulePAFailureMode {
  mode: string
  /** "Unknown" is NOT acceptable per PA Stage 5 rules — validation rejects it */
  cause: string
  local_effect: string
  system_effect: string
}

export interface ModulePA extends Module {
  // PA Stage 5 additional fields
  expected_parts: ModulePAExpectedPart[]
  interfaces: ModulePAInterface[]
  failure_modes: ModulePAFailureMode[]
  open_questions: string[]
  estimated_mass_kg: number | null
  estimated_dimensions_mm: { w: number; d: number; h: number } | null
  estimated_lead_time_weeks: number
  maturity: 'CONCEPTUAL' | 'PRELIMINARY' | 'ENGINEERING'
  /** PA prompt uses why_it_matters; maps to legacy whyItMatters */
  why_it_matters?: string
  /** PA prompt uses technical_description; maps to legacy description */
  technical_description?: string
}

// === PA Stage 4 Regulatory Extraction ===
// Added Phase D1. Separate from legacy RegulatoryItem embedded in DesignBrief.
// Runs as a new stage after Research Synthesis on PA_PIPELINE=true.

export interface RegulatoryEntry {
  standard_name: string
  /** e.g. "Edition 2 (2022)" */
  version_date: string
  /** e.g. "UK / EU", "International" */
  jurisdiction: string
  /** Engineering role responsible */
  owner: string
  status: 'not_started' | 'in_progress' | 'complete'
  claim_type: 'requirement' | 'recommendation' | 'guidance'
  /** WHY this standard applies (specific to this product, not generic restatement of scope) */
  applicability: string
  /** HOW it affects the design — specific consequences, test types, costs, scheduling constraints */
  engineering_impact: string
  /** WHAT documentation/testing is needed — exact document type and standard clause */
  evidence_required: string
  /** NEXT STEP with a verb — concrete action to close the compliance gap */
  gap_action: string
  /** Always 'C' — based on published standard text, not yet verified against design */
  source_grade: 'C'
  /** Always 'UNVERIFIED' — verification requires a compliance engineer to review the design */
  verification_status: 'UNVERIFIED'
  /** What verification would require */
  verification_note: string
}

export interface RegulatoryExtraction {
  regulatory_entries: RegulatoryEntry[]
}

// === end PA Stage 4 Regulatory Extraction ===
// === end PA Stage 5 Module Decomposition ===

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
  regime?: 'buy_electronic' | 'buy_mechanical_industrial' | 'named_manufacturer_reseller' | 'make_custom_fab' | 'service_certification'
  regimeRouterResult?: {
    regime: string
    source: 'distributor' | 'corpus' | 'registry' | 'none'
    sku?: string
    priceGbp?: number
    supplier?: string
    datasheetUrl?: string
    stockQty?: number
    leadTimeWeeks?: number
    confidence: 'HIGH' | 'MEDIUM' | 'LOW'
    notes: string
  }
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

// === PA Stage 7b Cost extended fields ===
// All optional — legacy renderer does not read these and must not crash on absent fields.

export interface CostOverheadLine {
  /** Human-readable label, e.g. "Assembly Labour (15% of BOM)" */
  label: string
  /** Amount in GBP */
  gbp: number
}

export interface NreItem {
  /** Human-readable label, e.g. "UL 9540A system-level fire test" */
  label: string
  /** Cost in GBP */
  gbp: number
  /** Duration in weeks */
  durationWeeks: number
  /** Source grade — 'C' for published industry benchmark costs */
  grade: 'A' | 'B' | 'C' | 'D' | 'E'
}

export interface CostReductionPath {
  /** Description of the cost reduction option */
  option: string
  /** Estimated saving, e.g. "~£55,000" */
  savingGbp: string
  /** Prose description of the engineering trade-off */
  tradeoff: string
  /** Feasibility assessment */
  feasible: 'Yes' | 'No' | 'Maybe' | 'At volume'
}

/**
 * CostSummary — single canonical source of truth for all cost consumers.
 *
 * Computed ONCE at the end of Stage 4 (runBomCostSuppliers) and stored on
 * PipelineState. ALL downstream consumers — cover page, cost waterfall,
 * overhead table, cost narrative, module subtotals — MUST read from this
 * object. Never recompute a BOM total downstream.
 *
 * Universal: works for any product class (BESS, drone, vertical farm, etc.).
 * The numbers come from LLM-emitted BOM line items; the structure is constant.
 */
export interface CostSummary {
  /** Sum of all BOM line item totals: unitCostGbp × quantity, raw (no overhead). */
  bomTotal: number
  /** bomTotal × (overheadMultiplier - 1) — the markup above raw BOM. */
  assemblyCost: number
  /** bomTotal × overheadMultiplier — the fully-loaded unit cost. */
  finalUnitCost: number
  /** The overhead multiplier applied (e.g. 1.5). */
  overheadMultiplier: number
  /** NRE total for this product (certification, tooling, test). */
  nreTotal: number
  /** Brief ceiling in GBP, or null when the brief has no cost ceiling. */
  ceilingCost: number | null
  /** finalUnitCost − ceilingCost. Negative = over budget. */
  varianceVsCeiling: number | null
  /** True when finalUnitCost > ceilingCost. */
  isOverBudget: boolean
  /** Per-module BOM subtotals (raw, pre-overhead). moduleId → GBP. */
  byModule: Record<string, { moduleName: string; rawGbp: number; pctOfBom: number }>
  /** Top cost drivers (top 5 BOM lines by extended cost, descending). */
  topDrivers: Array<{ partName: string; pct: number; totalGbp: number; costSource: string }>
  /** Split of buy (distributor-quoted), buy (estimated), make costs within bomTotal. */
  buyDistributorGbp: number
  buyEstimatedGbp: number
  makeEstimatedGbp: number
  /** Fraction of bomTotal backed by real distributor prices (0–1). */
  quotedCostFraction: number
  /** Percentage by which finalUnitCost exceeds ceilingCost, or null. */
  overBudgetPct: number | null
}

/** Extends CostBreakdown with PA Stage 7b fields for the BESS-style renderer. */
export interface CostBreakdownPA extends CostBreakdown {
  /** Explicit named overhead lines (assembly, test, shipping, overheads, contingency) */
  overheadLines?: CostOverheadLine[]
  /** Per-module perModule array extended with pctOfBom and grade */
  perModulePA?: Array<{ moduleName: string; totalGbp: number; pctOfBom: number; grade: string }>
  /** Named NRE activities (one per regulatory standard that requires testing) */
  nreItems?: NreItem[]
  /** Cost reduction options for the renderer */
  reductionPaths?: CostReductionPath[]
  /** Populated when unit cost exceeds the brief ceiling; null/absent when within ceiling */
  ceilingExceededBanner?: string | null
}
// === end PA Stage 7b Cost extended fields ===

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

// === PA Stage 7a Sizing extended fields ===
// All optional — legacy renderer does not read these and must not crash on absent fields.

export interface SizingZone {
  /** e.g. "Battery Zone", "BMS Zone", "Power Electronics Zone" */
  name: string
  /** Zone length in mm */
  lengthMm: number
  /** Zone volume in m³ */
  volumeM3: number
  /** Allocated mass in kg */
  massKg: number
  /** Prose list of what lives in the zone, e.g. "8× CATL 280Ah rack modules" */
  contents: string
}

/** Extends DimensionSheet with PA Stage 7a fields for the BESS-style renderer. */
export interface DimensionSheetPA extends DimensionSheet {
  /** Named zones with length, volume, mass, and contents — surfaced from iso_container_layout */
  zones?: SizingZone[]
  /**
   * Volume utilisation as a percentage, e.g. 92.
   * BLOCKER-D2-5 FIX: null when interior_volume_m3 is unavailable (prevents
   * bogus 100% from the former `|| 1` fallback). Renderer must treat null as
   * "unavailable" rather than 0% or 100%.
   */
  volumeUtilisationPct?: number | null
  /** Mass utilisation as a percentage, e.g. 96 */
  massUtilisationPct?: number
  /** Outer container envelope */
  externalDimensionsMm?: { w: number; d: number; h: number }
  /** Inner usable envelope after insulation / structural clearances */
  internalDimensionsMm?: { w: number; d: number; h: number }
  /** Container tare mass in kg */
  tareMassKg?: number
  /** Max payload = total mass budget minus tare */
  availablePayloadMassKg?: number
  /** Prose description of aisles, cable routes, and access clearances */
  clearanceNotes?: string
  /** Tight-margin warning text for ActionCallout, or null when margin is acceptable */
  massMarginNote?: string | null
}
// === end PA Stage 7a Sizing extended fields ===

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

export interface ResearchConstraints {
  benchmarkPrices: Array<{ product: string; price: number; source: string }>
  materialCosts: Array<{ material: string; costPerKg: number; source: string }>
  regulatoryCosts: Array<{ standard: string; costGbp: number; weeks: number }>
  competitorSpecs: Array<{ name: string; mass?: number; cost?: number; keySpecs: string[] }>
}

// === PA Stage 9 Report Type Router ===
// Added Phase F. ReportType and ReportTypeRouterResult are defined in
// report-type-router.ts and re-exported here so consumers only need one import.

export type { ReportType, ReportTypeRouterResult } from './report-type-router'

// === end PA Stage 9 Report Type Router ===

export interface PipelineState {
  projectId: string
  briefText?: string
  generatedBrief?: {
    briefText: string
    fields: {
      projectName: string
      purpose: string
      objectives: string[]
      requirements: string[]
      constraints: string[]
      inScope: string
      outOfScope: string[]
      successCriteria: string[]
      costCeiling: number | null
      maxMass: number | null
      productionVolume: string | null
      jurisdiction: string | null
      envelope: string | null
      operatingTemp: string | null
      standards: string[]
    }
  }
  briefExpansion?: {
    originalBrief: string
    expandedFields: Record<string, unknown>
    inferredAssumptions: Array<{ field: string; value: unknown; confidence: 'HIGH' | 'MEDIUM' | 'LOW'; reasoning: string }>
    assumptions: string[]
    canProceed: boolean
  }
  /** PA path only: structured brief output from runBriefParsing() */
  parsedBrief?: StructuredBriefJSON
  /** PA path only (Phase B+): structured research synthesis from runResearchSynthesis() */
  researchSynthesis?: ResearchSynthesis
  /** PA path only (Phase D1+): structured regulatory extraction from runRegulatoryExtraction() */
  regulatoryExtraction?: RegulatoryExtraction
  /** PA path only (Phase F+): resolved report type from PA Stage 9 Router */
  reportType?: import('./report-type-router').ReportType
  /**
   * PA path only (Phase F+): full result from PA Stage 9 Router.
   * F-8 fix: typed field replaces the `(state as any).reportTypeRouterResult` cast
   * that previously bypassed the type system.
   */
  reportTypeRouterResult?: import('./report-type-router').ReportTypeRouterResult
  productClass?: string
  /**
   * Radical Phase 1 only — populated when RADICAL_PHASE_1_TREE_OUTPUT=true.
   * The LLM-emitted Radical tree for this product, validated against the seed
   * library. Consumed by Phase 0 vertical slice when RADICAL_PHASE_0_SLICE=true.
   * Does NOT replace state.modules — both coexist during the migration.
   * Any UNKNOWN_RADICAL nodes are tracked in radicalTreeUnknowns.
   */
  radicalTree?: import('./radical/schema.js').RadicalTree
  /**
   * UNKNOWN_RADICAL placeholders found in the LLM-emitted tree.
   * Each entry is the archetypeId string emitted by the LLM, e.g.
   * "<UNKNOWN_RADICAL>: 15-year UV-resistant polymer foam insulation panel".
   * Empty array = all archetypes resolved from library.
   */
  radicalTreeUnknowns?: string[]
  /**
   * Phase 2 — Resolved Radical Tree.
   * Populated when RADICAL_PHASE_2_RESOLUTION=true.
   * Same tree shape as radicalTree but each leaf CompositionNode carries a
   * `resolution` annotation: mpn, manufacturer, unit_price_gbp, lead_weeks,
   * verification_grade, source.
   *
   * Strictly additive — does NOT replace state.modules or state.bomLines.
   * Phase 5 renderer will eventually consume this; Phase 7 cuts over.
   */
  resolvedRadicalTree?: import('./stages/4b-radical-resolution.js').ResolvedRadicalTree
  /**
   * Phase 3 — Radical Cost Summary.
   * Populated when RADICAL_PHASE_3_COSTROLLUP=true AND resolvedRadicalTree exists.
   * Same shape as CostSummary but computed by walking the resolved tree with
   * per-level assembly markups (character 15%, word 20%, sentence 25%).
   *
   * COEXISTS alongside state.costSummary during the migration.
   * Phase 7 cutover will make this the canonical SoT.
   * Renderer (Phase 5) reads radicalCostSummary when RADICAL_PHASE_3_COSTROLLUP=true.
   */
  radicalCostSummary?: import('./stages/4c-radical-cost-rollup.js').RadicalCostSummary
  /**
   * Iter 3 — Stage 1.5 module decomposition output.
   * Populated when RADICAL_PHASE_3_PER_MODULE=true and Stage 1.5 succeeded.
   * Contains the 12-universal-modules catalog with sub_modules, grammar_links
   * (intra-module), and cross_module_grammar_links (inter-module). Drives the
   * §2.5 module connection map and §3/§4 sub-module rendering in the PDF.
   */
  moduleDecomposition?: import('./types/module-decomposition.js').ModuleDecomposition
  /**
   * Piece 1E (2026-05-12) — Natural-language layer derived deterministically
   * from moduleDecomposition. Per-module paragraph (EN + RAD), grammar trace,
   * per-sub-module sentence pairs (EN + RAD interlinear). Drives the §4.5 PDF
   * Sentence + Paragraph view renderer page. NO LLM calls — pure transformation
   * from Stage 1.5's structured output via radical/sentence-generator.ts.
   */
  naturalLanguageLayer?: import('./radical/sentence-generator.js').NaturalLanguageLayer
  /**
   * Piece 1G (2026-05-12) — LLM-augmented brief overview prose.
   * Generated from parsedBrief + researchSynthesis at pipeline-end. Four
   * blocks: overview_and_context (2 paras), mission_statement, target_customers,
   * why_now. Drives the prose-rich §3 Brief and Requirements PDF page.
   */
  briefOverviewProse?: import('./radical/brief-overview-llm.js').BriefOverviewProse
  /**
   * Piece 1H (2026-05-12) — LLM-augmented regulatory standard-by-standard prose.
   * Generated from regulatoryExtraction at pipeline-end. Four prose blocks per
   * standard: applicability, engineering_impact, evidence_required, gap_action.
   * Drives the §Regulatory and Compliance Posture PDF page.
   * Non-fatal: renderer shows a placeholder when absent.
   */
  regulatoryProse?: import('./radical/regulatory-prose-llm.js').RegulatoryProseLayer
  /**
   * Piece 1I (2026-05-12) — LLM-augmented FMEA risk-by-risk prose.
   * Generated from state.fmea (RiskRow[]) at pipeline-end. Four prose blocks per
   * risk: hazard, root_cause, mitigation, detection. Top 20 risks by S×O descending.
   * Drives the §Risk Register prose PDF page.
   * Non-fatal: renderer shows a placeholder when absent.
   */
  fmeaRiskProse?: import('./radical/fmea-risk-llm.js').FmeaRiskProseLayer
  /**
   * Phase 4 — Grammar Verdicts.
   * Populated when RADICAL_PHASE_4_GRAMMAR=true AND resolvedRadicalTree exists.
   * Contains one GrammarVerdict per rule fired, plus overall_verdict and
   * relaxation_summary from the constraint optimiser.
   *
   * COEXISTS alongside the existing feasibility gate — strictly additive.
   * Phase 5 renderer reads grammarVerdicts to render inline WARN/BLOCK callouts.
   * Phase 7 cutover integrates grammar into the feasibility gate proper.
   */
  grammarVerdicts?: import('./stages/4d-radical-grammar.js').GrammarPassState
  pipelineError?: {
    stage: string
    message: string
    occurredAt: string
    recoverable: boolean
  }
  research: ResearchResult | null
  researchConstraints?: ResearchConstraints
  modules: Module[]
  dimensionSheet: DimensionSheet | null
  parts: Part[]
  bomLines: BomLine[]
  costBreakdown: CostBreakdown | null
  /**
   * Canonical cost source of truth — computed ONCE by Stage 4 (runBomCostSuppliers).
   * ALL downstream consumers (cover page, cost waterfall, overhead table, narrative,
   * module subtotals) MUST read from this. Never recompute BOM totals downstream.
   * Optional so legacy v1 pipeline and partial-state renders do not crash.
   */
  costSummary?: CostSummary
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
