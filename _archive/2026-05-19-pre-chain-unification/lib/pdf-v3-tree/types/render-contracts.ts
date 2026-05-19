// ---------------------------------------------------------------------------
// Phase 04 output — alerts generated from business rule evaluation
// ---------------------------------------------------------------------------

export interface PdfAlert {
  readonly severity: 'RED' | 'AMBER' | 'INFO';
  readonly title: string;
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Shared primitives — used across multiple pipeline phases
// ---------------------------------------------------------------------------

export type SourceTag = 'USER_PROVIDED' | 'CALCULATED' | 'SUPPLIER_QUOTED' | 'MANUFACTURER_DATASHEET' | 'DATABASE_LOOKUP' | 'WEB_RESEARCHED' | 'LLM_ESTIMATED' | 'PLACEHOLDER' | 'UNKNOWN';

export type SourceGrade = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export interface SourcedNumber {
  readonly value: number | null;
  readonly formattedValue: string;
  readonly sourceTag: SourceTag;
  readonly sourceGrade: SourceGrade;
}

export interface PdfProductClassification {
  readonly productClass: string;
  readonly technologyDomains: ReadonlyArray<string>;
  readonly hazardDomains: ReadonlyArray<string>;
  readonly manufacturingArchetype: string;
}

export interface PdfSectionMetrics {
  readonly score: number;
  readonly confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'BLOCKED';
  readonly status: 'PASS' | 'WARN' | 'FAIL' | 'BLOCKED' | 'SHOULD_NOT_HAVE_RENDERED';
  readonly failedChecks: ReadonlyArray<string>;
  readonly hardBlockers: ReadonlyArray<string>;
  readonly capsApplied: ReadonlyArray<string>;
  readonly nextCodeActions: ReadonlyArray<string>;
  readonly auditJson: string;
}

export interface PdfAttribution {
  readonly source: 'db' | 'llm';
  readonly modelName?: string;
  readonly metrics?: PdfSectionMetrics;
}

export interface PdfSectionJudgement {
  readonly dimensions?: Record<string, { readonly score: number; readonly rationale: string; readonly codingImprovement: string }>;
  readonly overallScore?: number;
  readonly summary?: string;
}

export interface PdfVerdictAttribution extends PdfAttribution {
  readonly judgement?: PdfSectionJudgement;
}

export interface PdfAttributions {
  readonly brief?: PdfAttribution;
  readonly regulatory?: PdfAttribution;
  readonly modules?: PdfAttribution;
  readonly bom?: PdfAttribution;
  readonly suppliers?: PdfAttribution;
  readonly cost?: PdfAttribution;
  readonly risks?: PdfAttribution;
  readonly auditLog?: PdfAttribution;
  readonly verdict?: PdfVerdictAttribution;
  readonly dimensionSheet?: PdfAttribution;
  readonly spatialPlan?: PdfAttribution;
}

export interface PdfBriefData {
  readonly subject: string | null;
  readonly mission: string | null;
  readonly useCase: string | null;
  readonly targetCustomers: string | null;
  readonly whyNow: string | null;
  readonly unitCostCeilingGbp: number | null;
  readonly maxMassKg: number | null;
  readonly targetProcess: string | null;
  readonly targetMaterial: string | null;
  readonly toleranceTarget: string | null;
  readonly quantityTarget: string | null;
  readonly complianceNotes: string | null;
}

export interface PdfRegulatoryData {
  readonly code: string;
  readonly status: string | null;
  readonly ownerRole: string | null;
  readonly name: string;
  readonly summary: string | null;
  readonly applicability: string | null;
  readonly designImpact: string | null;
  readonly evidenceRequired: string | null;
  readonly gapAction: string | null;
  readonly verifiedAt: string | null;
  readonly confidence: number | null;
  readonly claimType: string | null;
  readonly verificationStatus: 'VERIFIED' | 'UNVERIFIED' | null;
  readonly sourceGrade: SourceGrade | null;
}

export interface PdfProjectData {
  readonly name: string;
  readonly revision: string;
  readonly shipped: boolean;
  readonly foundryName?: string | null;
}

export interface PdfVerdictData {
  readonly status: 'GREEN' | 'AMBER' | 'RED' | 'UNREVIEWED';
  readonly summary: string;
  readonly fails: ReadonlyArray<PdfVerdictFail>;
  readonly checkedConstraints: ReadonlyArray<string>;
}

export interface PdfVerdictFail {
  readonly axis: string;
  readonly severity: 'blocker' | 'warning';
  readonly summary: string;
  readonly evidence: string;
}

export interface PdfBomData {
  readonly partNumber: string;
  readonly name: string;
  readonly material: string;
  readonly sourceModuleName: string | null;
  readonly isPurchased: boolean;
  readonly process: string | null;
  readonly massKg: number | null;
  readonly estimatedUnitCostGbp: number | null;
  /** Human-readable description of the part's function or specification. */
  readonly description: string | null;
}

export interface PdfReviewIssue {
  readonly severity: string;
  readonly category: string;
  readonly message: string;
  readonly suggestion: string | null;
}

export interface PdfReviewData {
  readonly verdict: string | null;
  readonly summary: string | null;
  readonly issues: ReadonlyArray<PdfReviewIssue>;
  readonly recommendations: ReadonlyArray<string>;
}

// ---------------------------------------------------------------------------
// Risk matrix entry — FMEA-style row per module
// ---------------------------------------------------------------------------

export interface SanitizedRiskMatrixEntry {
  readonly id: string;
  readonly hazard: string;
  readonly cause: string | null;
  readonly consequence: string | null;
  readonly existingControls: string | null;
  readonly severity: number | null;
  readonly likelihood: number | null;
  readonly mitigation: string | null;
  readonly owner: string | null;
  readonly residualSeverity: number | null;
  readonly residualLikelihood: number | null;
}

// ---------------------------------------------------------------------------
// Cost waterfall — aggregate + per-module cost data
// ---------------------------------------------------------------------------

export interface SanitizedCostModuleEntry {
  readonly moduleName: string;
  readonly totalGbp: number | null;
}

export interface SanitizedCostData {
  readonly unitTotalGbp: number | null;
  readonly ceilingGbp: number | null;
  readonly perModule: ReadonlyArray<SanitizedCostModuleEntry>;
}

// ---------------------------------------------------------------------------
// Audit log entry
// ---------------------------------------------------------------------------

export interface SanitizedAuditEntry {
  readonly action: string;
  readonly section: string | null;
  readonly createdAtIso: string;
  readonly metadataSummary: string;
}

// ---------------------------------------------------------------------------
// Phase 03 input — sanitised module / supplier shapes (numbers still numeric)
// ---------------------------------------------------------------------------

export interface SanitizedModuleData {
  readonly name: string;
  readonly massKg: number | null;
  readonly costGbp: number | null;
  readonly description: string | null;
  readonly purpose: string | null;
  readonly whyItMatters: string | null;
  readonly imageUrl: string | null;
  readonly keyParts: ReadonlyArray<string>;
  readonly failureModes: ReadonlyArray<string>;
  readonly unknowns: ReadonlyArray<string>;
  readonly leadWeeks: number | null;
  /** Slug of the module this one mirrors (e.g. "left_wing"). Null when unique. */
  readonly mirrorOfName: string | null;
  /** Budget mass in kilograms — the brief's target for this module. */
  readonly budgetMassKg: number | null;
  /** Provenance tag for the lead time (e.g. "supplier-quote", "ai-estimate"). */
  readonly leadTimeSource: string | null;
  /** Structured FMEA risk matrix. Empty when module has no risk data. */
  readonly riskMatrix?: ReadonlyArray<SanitizedRiskMatrixEntry>;
  readonly reviews: ReadonlyArray<PdfReviewData>;
}

export interface SanitizedSupplierEvidence {
  readonly supplier: string;
  readonly candidateProductSku: string | null;
  readonly role: string | null;
  readonly requiredCertification: string | null;
  readonly certificationVerified: boolean;
  readonly quoteReceived: boolean;
  readonly priceBasis: string | null;
  readonly moq: string | null;
  readonly leadTimeBasis: string | null;
  readonly ukEuSupport: boolean;
  readonly integrationRisk: string | null;
  readonly commercialRisk: string | null;
  readonly sourceGrade: SourceGrade | null;
  readonly confidence: number | null;
  readonly nextAction: string | null;
}

/** A single feasibility axis with its checked state. */
export interface FeasibilityAxis {
  readonly name: string;
  readonly checked: boolean;
}

// ---------------------------------------------------------------------------
// Reconciliation and redesign routes — carried through the pipeline
// ---------------------------------------------------------------------------

export interface ReconciliationEntry {
  readonly constraint: string;
  readonly target: string;
  readonly actual: string;
  readonly status: string;
}

export interface RedesignRoute {
  readonly action: string;
  readonly impact: string;
}

// ---------------------------------------------------------------------------
// Phase 03 input — SanitizedProjectData
// Output of Phase 02 (sanitisation). All presentation-irrelevant numbers are
// still numeric; the enrichment phase converts every one to a formatted string.
// ---------------------------------------------------------------------------

export interface SanitizedProjectData {
  readonly productClassification?: PdfProductClassification;
  readonly project: PdfProjectData;
  readonly brief: PdfBriefData;
  readonly verdict: PdfVerdictData;
  readonly modules: ReadonlyArray<SanitizedModuleData>;
  readonly bom: ReadonlyArray<PdfBomData>;
  readonly suppliers: ReadonlyArray<SanitizedSupplierEvidence>;
  readonly regulatory: ReadonlyArray<PdfRegulatoryData>;
  readonly failedCalculations: ReadonlyArray<string>;
  readonly unverifiedRegulatoryClaims: ReadonlyArray<string>;
  readonly requiredInputs: ReadonlyArray<string>;
  readonly nextActions: ReadonlyArray<string>;
  readonly batteryCalculation: any;
  readonly powerArchitecture: any;
  /** Feasibility axes for Phantom-Green detection. Absent when Phase 02 has not yet been extended. */
  readonly feasibilityAxes?: ReadonlyArray<FeasibilityAxis>;
  /** Aggregate unit cost in GBP (may be null when cost data is absent, undefined when not yet computed). */
  readonly unitCostGbp?: number | null;
  /** Target cost ceiling in GBP (may be null when no target was set, undefined when not yet computed). */
  readonly costCeilingGbp?: number | null;
  /** Cost waterfall source data — aggregate + per-module costs. */
  readonly cost?: SanitizedCostData;
  /** Project audit log entries. */
  readonly auditLog?: ReadonlyArray<SanitizedAuditEntry>;
  /** Data provenance and LLM attribution per section. */
  readonly attributions?: PdfAttributions;
  readonly dimensionSheet?: any;
  readonly spatialPlan?: any;
  readonly spatialPlanImageDataUri?: string | null;
  readonly reconciliation?: ReadonlyArray<ReconciliationEntry>;
  readonly redesignRoutes?: ReadonlyArray<RedesignRoute>;
}

// ---------------------------------------------------------------------------
// Phase 03 output — enriched module / supplier shapes (all strings)
// ---------------------------------------------------------------------------

export interface PdfModuleData {
  readonly name: string;
  readonly description: string | null;
  readonly purpose: string | null;
  readonly whyItMatters: string | null;
  readonly imageUrl: string | null;
  readonly formattedMassKg: string;
  readonly formattedCostGbp: string;
  readonly keyParts: ReadonlyArray<string>;
  readonly failureModes: ReadonlyArray<string>;
  readonly unknowns: ReadonlyArray<string>;
  readonly leadWeeks: number | null;
  readonly formattedLeadWeeks: string;
  /** Human-readable name of the mirrored module (e.g. "Left wing"). */
  readonly mirrorOfName: string | null;
  /** Budget mass in kilograms from the brief. */
  readonly budgetMassKg: number | null;
  readonly formattedBudgetMassKg: string;
  /** Provenance tag for the lead time (e.g. "supplier-quote"). */
  readonly leadTimeSource: string | null;
  /** Founder-friendly label for the lead time source. */
  readonly formattedLeadTimeSource: string;
  readonly reviews: ReadonlyArray<PdfReviewData>;
}

export interface PdfSupplierEvidence {
  readonly supplier: string;
  readonly candidateProductSku: string | null;
  readonly role: string | null;
  readonly requiredCertification: string | null;
  readonly certificationVerified: boolean;
  readonly quoteReceived: boolean;
  readonly priceBasis: string | null;
  readonly moq: string | null;
  readonly leadTimeBasis: string | null;
  readonly ukEuSupport: boolean;
  readonly integrationRisk: string | null;
  readonly commercialRisk: string | null;
  readonly sourceGrade: SourceGrade | null;
  readonly confidence: number | null;
  readonly nextAction: string | null;
}

/** Legacy supplier card data produced by the enrichment pipeline. */
export interface PdfSupplierData {
  readonly name: string;
  readonly formattedMatchScore: string;
  readonly hq: string | null;
  readonly websiteUrl: string | null;
  readonly contactEmail: string | null;
  readonly projectSynthesis: string | null;
  readonly matchedPartNumbers: ReadonlyArray<string>;
  readonly moduleNames: ReadonlyArray<string>;
  readonly rampRole: string | null;
  readonly certifications: ReadonlyArray<string>;
  readonly foundedYear: number | null;
  readonly employeeCount: number | null;
  readonly leadTime: string | null;
  readonly minimumOrder: string | null;
  readonly matchReasons: ReadonlyArray<string>;
  readonly description: string | null;
}

// ---------------------------------------------------------------------------
// Phase 03 output — cost waterfall (all strings)
// ---------------------------------------------------------------------------

export interface PdfCostModuleEntry {
  readonly moduleName: string;
  readonly formattedCost: string;
  readonly formattedPctOfUnit: string;
}

export interface PdfCostWaterfallData {
  readonly formattedUnitCost: string;
  readonly formattedCeiling: string;
  readonly formattedHeadroom: string;
  readonly isOverBudget: boolean;
  readonly perModule: ReadonlyArray<PdfCostModuleEntry>;
}

// ---------------------------------------------------------------------------
// Phase 03 output — risks register (pre-formatted ratings)
// ---------------------------------------------------------------------------

export interface PdfRiskEntry {
  readonly id: string;
  readonly hazard: string;
  readonly cause: string | null;
  readonly consequence: string | null;
  readonly existingControls: string | null;
  readonly mitigation: string | null;
  readonly owner: string | null;
  /** Raw severity value (1-5) kept for rendering border colour. */
  readonly severity: number;
  /** Raw likelihood value (1-5) kept for rendering border colour. */
  readonly likelihood: number;
  /** Pre-formatted initial rating: "Major × Possible — high (12)" */
  readonly formattedInitialRating: string;
  /** CSS colour for the initial band (e.g. "#b45309" for high). */
  readonly initialBandColor: string;
  /** Raw residual severity value (1-5) when mitigation is applied. */
  readonly residualSeverity: number | null;
  /** Raw residual likelihood value (1-5) when mitigation is applied. */
  readonly residualLikelihood: number | null;
  /** Pre-formatted residual rating, null when no residual data. */
  readonly formattedResidualRating: string | null;
  /** CSS colour for the residual band, null when no residual data. */
  readonly residualBandColor: string | null;
}

export interface PdfRisksModuleData {
  readonly moduleName: string;
  readonly riskEntries: ReadonlyArray<PdfRiskEntry>;
  readonly failureModes: ReadonlyArray<string>;
  readonly unknowns: ReadonlyArray<string>;
}

// ---------------------------------------------------------------------------
// Phase 03 output — audit log (formatted timestamps)
// ---------------------------------------------------------------------------

export interface PdfAuditLogEntry {
  readonly formattedTimestamp: string;
  readonly action: string;
  readonly section: string | null;
  readonly metadataSummary: string;
}

// ---------------------------------------------------------------------------
// Document-level metadata and totals (assembled in Phase 05)
// ---------------------------------------------------------------------------

export interface PdfMeta {
  readonly generatedAtIso: string;
  readonly createdAtIso: string | null;
  readonly shippedAtIso: string | null;
  readonly briefLockedAtIso: string | null;
  readonly systemIllustrationUrl: string | null;
  readonly interiorOverviewUrl: string | null;
  readonly unitCostFormatted: string;
  readonly costCeilingFormatted: string;
  readonly headroomFormatted: string;
  readonly isCostOver: boolean;
}

export interface PdfTotals {
  readonly moduleCount: number;
  readonly keyPartCount: number;
  readonly partRowCount: number;
  readonly failureModeCount: number;
  readonly unknownCount: number;
  readonly regulatoryCount: number;
  readonly supplierCount: number;
  readonly reviewCount: number;
}

// ---------------------------------------------------------------------------
// Phase 03 output — EnrichedProjectData
// Every field that reaches the presentation layer is a formatted string.
// A separate BusinessRuleContext carries the raw comparison values that
// Phase 04 (business rules) needs for numeric inequality checks.
// ---------------------------------------------------------------------------

/**
 * Raw numeric values carried forward for business-rule evaluation.
 * These are intentionally separated from presentation fields so that
 * EnrichedProjectData's rendered surface contains zero raw numbers.
 */
export interface BusinessRuleContext {
  readonly feasibilityAxes: ReadonlyArray<FeasibilityAxis>;
  readonly unitCostRaw: number | null;
  readonly costCeilingRaw: number | null;
}

export interface EnrichedProjectData {
  readonly productClassification?: PdfProductClassification;
  readonly project: PdfProjectData;
  readonly brief: PdfBriefData;
  readonly verdict: PdfVerdictData;
  readonly modules: ReadonlyArray<PdfModuleData>;
  readonly bom: ReadonlyArray<PdfBomData>;
  readonly suppliers: ReadonlyArray<PdfSupplierData | PdfSupplierEvidence>;
  readonly regulatory: ReadonlyArray<PdfRegulatoryData>;
  readonly failedCalculations: ReadonlyArray<string>;
  readonly unverifiedRegulatoryClaims: ReadonlyArray<string>;
  readonly requiredInputs: ReadonlyArray<string>;
  readonly nextActions: ReadonlyArray<string>;
  readonly batteryCalculation: any;
  readonly powerArchitecture: any;
  readonly unitCostFormatted: string;
  readonly costCeilingFormatted: string;
  /** Non-presentation data needed by Phase 04 business rules. */
  readonly businessRuleContext: BusinessRuleContext;
  /** Cost waterfall — pre-formatted per-module costs, headroom, percentages. */
  readonly costWaterfall: PdfCostWaterfallData;
  /** Risks register — pre-formatted risk ratings per module. */
  readonly risks: ReadonlyArray<PdfRisksModuleData>;
  /** Audit log — formatted timestamps and actions. */
  readonly auditLog: ReadonlyArray<PdfAuditLogEntry>;
  /** Data provenance and LLM attribution per section. */
  readonly attributions?: PdfAttributions;
  readonly dimensionSheet?: any;
  readonly spatialPlan?: any;
  readonly spatialPlanImageDataUri?: string | null;
  readonly reconciliation?: ReadonlyArray<ReconciliationEntry>;
  readonly redesignRoutes?: ReadonlyArray<RedesignRoute>;
}

// ---------------------------------------------------------------------------
// Final assembled render data (Phase 05 — assembly)
// ---------------------------------------------------------------------------

export interface PdfRenderData {
  readonly productClassification?: PdfProductClassification;
  readonly project: PdfProjectData;
  readonly brief: PdfBriefData;
  readonly verdict: PdfVerdictData;
  readonly alerts: ReadonlyArray<PdfAlert>;
  readonly modules: ReadonlyArray<PdfModuleData>;
  readonly bom: ReadonlyArray<PdfBomData>;
  readonly suppliers: ReadonlyArray<PdfSupplierData | PdfSupplierEvidence>;
  readonly regulatory: ReadonlyArray<PdfRegulatoryData>;
  readonly failedCalculations: ReadonlyArray<string>;
  readonly unverifiedRegulatoryClaims: ReadonlyArray<string>;
  readonly requiredInputs: ReadonlyArray<string>;
  readonly nextActions: ReadonlyArray<string>;
  readonly batteryCalculation: any;
  readonly powerArchitecture: any;
  readonly meta: PdfMeta;
  readonly totals: PdfTotals;
  /** Cost waterfall — unit cost, ceiling, headroom, per-module roll-up. */
  readonly costWaterfall: PdfCostWaterfallData;
  /** Risks register — FMEA entries and legacy failure modes per module. */
  readonly risks: ReadonlyArray<PdfRisksModuleData>;
  /** Audit log — project mutation history. */
  readonly auditLog: ReadonlyArray<PdfAuditLogEntry>;
  /** Data provenance and LLM attribution per section. */
  readonly attributions?: PdfAttributions;
  readonly dimensionSheet?: any;
  readonly spatialPlan?: any;
  readonly spatialPlanImageDataUri?: string | null;
  readonly reconciliation?: ReadonlyArray<ReconciliationEntry>;
  readonly redesignRoutes?: ReadonlyArray<RedesignRoute>;
}
