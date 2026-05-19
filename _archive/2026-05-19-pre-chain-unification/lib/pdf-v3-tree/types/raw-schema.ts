import { z } from 'zod';

export const rawSourceTagSchema = z.enum([
  'USER_PROVIDED', 'CALCULATED', 'SUPPLIER_QUOTED', 'MANUFACTURER_DATASHEET', 
  'DATABASE_LOOKUP', 'WEB_RESEARCHED', 'LLM_ESTIMATED', 'PLACEHOLDER', 'UNKNOWN'
]);

export const rawSourceGradeSchema = z.enum(['A', 'B', 'C', 'D', 'E', 'F']);

// PostgREST numeric fields come as strings. We preprocess to safely coerce to finite numbers or null.
export const postgrestNumericSchema = z.preprocess((val) => {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  return Number.isFinite(num) ? num : null;
}, z.number().nullable());

export const rawSourcedNumberSchema = z.object({
  value: postgrestNumericSchema,
  formattedValue: z.string(),
  sourceTag: rawSourceTagSchema,
  sourceGrade: rawSourceGradeSchema,
});

export const rawProductClassificationSchema = z.object({
  productClass: z.string(),
  technologyDomains: z.array(z.string()),
  hazardDomains: z.array(z.string()),
  manufacturingArchetype: z.string(),
});

export const rawSectionMetricsSchema = z.object({
  score: z.number().min(0).max(100),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW', 'BLOCKED']),
  status: z.enum(['PASS', 'WARN', 'FAIL', 'BLOCKED', 'SHOULD_NOT_HAVE_RENDERED']),
  failedChecks: z.array(z.string()).default([]),
  hardBlockers: z.array(z.string()).default([]),
  capsApplied: z.array(z.string()).default([]),
  nextCodeActions: z.array(z.string()).default([]),
  auditJson: z.string(),
});

export const rawAttributionSchema = z.object({
  source: z.enum(['db', 'llm']),
  modelName: z.string().optional(),
  metrics: rawSectionMetricsSchema.optional(),
});

export const rawAttributionsSchema = z.object({
  brief: rawAttributionSchema.optional(),
  regulatory: rawAttributionSchema.optional(),
  modules: rawAttributionSchema.optional(),
  bom: rawAttributionSchema.optional(),
  suppliers: rawAttributionSchema.optional(),
  cost: rawAttributionSchema.optional(),
  risks: rawAttributionSchema.optional(),
  auditLog: rawAttributionSchema.optional(),
});

// ---------------------------------------------------------------------------
// Risk matrix entry — FMEA-style row
// ---------------------------------------------------------------------------

export const rawRiskMatrixEntrySchema = z.object({
  id: z.string().default(''),
  hazard: z.string().default(''),
  cause: z.string().nullable().default(null),
  consequence: z.string().nullable().default(null),
  existingControls: z.string().nullable().default(null),
  severity: postgrestNumericSchema,
  likelihood: postgrestNumericSchema,
  mitigation: z.string().nullable().default(null),
  owner: z.string().nullable().default(null),
  residualSeverity: postgrestNumericSchema,
  residualLikelihood: postgrestNumericSchema,
});

// ---------------------------------------------------------------------------
// Review and Issues (Module level)
// ---------------------------------------------------------------------------

export const rawReviewIssueSchema = z.object({
  severity: z.string().default('INFO'),
  category: z.string().default('General'),
  message: z.string().default(''),
  suggestion: z.string().nullable().default(null),
});

export const rawReviewSchema = z.object({
  verdict: z.string().nullable().default(null),
  summary: z.string().nullable().default(null),
  issues: z.array(rawReviewIssueSchema).default([]),
  recommendations: z.array(z.string()).default([]),
});

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const rawModuleSchema = z.object({
  name: z.string().min(1, 'Module name is required'),
  massKg: postgrestNumericSchema,
  costGbp: postgrestNumericSchema,
  description: z.string().nullable().default(null),
  purpose: z.string().nullable().default(null),
  whyItMatters: z.string().nullable().default(null),
  imageUrl: z.string().nullable().default(null),
  keyParts: z.array(z.string()).default([]),
  failureModes: z.array(z.string()).default([]),
  unknowns: z.array(z.string()).default([]),
  leadWeeks: postgrestNumericSchema,
  mirrorOfName: z.string().nullable().default(null),
  budgetMassKg: postgrestNumericSchema,
  leadTimeSource: z.string().nullable().default(null),
  riskMatrix: z.array(rawRiskMatrixEntrySchema).default([]),
  reviews: z.array(rawReviewSchema).default([]),
});

// ---------------------------------------------------------------------------
// BOM row
// ---------------------------------------------------------------------------

export const rawBomSchema = z.object({
  partNumber: z.string().default('Unknown'),
  name: z.string().default('Unknown'),
  material: z.string().default('Unknown'),
  sourceModuleName: z.string().nullable().default(null),
  isPurchased: z.boolean().default(false),
  process: z.string().nullable().default(null),
  massKg: postgrestNumericSchema,
  estimatedUnitCostGbp: postgrestNumericSchema,
  description: z.string().nullable().default(null),
});

// ---------------------------------------------------------------------------
// Supplier Evidence
// ---------------------------------------------------------------------------

export const rawSupplierEvidenceSchema = z.object({
  supplier: z.string().min(1, 'Supplier name is required'),
  candidateProductSku: z.string().nullable().default(null),
  role: z.string().nullable().default(null),
  requiredCertification: z.string().nullable().default(null),
  certificationVerified: z.boolean().default(false),
  quoteReceived: z.boolean().default(false),
  priceBasis: z.string().nullable().default(null),
  moq: z.string().nullable().default(null),
  leadTimeBasis: z.string().nullable().default(null),
  ukEuSupport: z.boolean().default(false),
  integrationRisk: z.string().nullable().default(null),
  commercialRisk: z.string().nullable().default(null),
  sourceGrade: rawSourceGradeSchema.nullable().default(null),
  confidence: postgrestNumericSchema,
  nextAction: z.string().nullable().default(null),
});

// ---------------------------------------------------------------------------
// Brief
// ---------------------------------------------------------------------------

export const rawBriefSchema = z.object({
  subject: z.string().nullable().default(null),
  mission: z.string().nullable().default(null),
  useCase: z.string().nullable().default(null),
  targetCustomers: z.string().nullable().default(null),
  whyNow: z.string().nullable().default(null),
  unitCostCeilingGbp: postgrestNumericSchema,
  maxMassKg: postgrestNumericSchema,
  targetProcess: z.string().nullable().default(null),
  targetMaterial: z.string().nullable().default(null),
  toleranceTarget: z.string().nullable().default(null),
  quantityTarget: z.string().nullable().default(null),
  complianceNotes: z.string().nullable().default(null),
});

// ---------------------------------------------------------------------------
// Regulatory
// ---------------------------------------------------------------------------

export const rawRegulatorySchema = z.object({
  code: z.string().default(''),
  status: z.string().nullable().default(null),
  ownerRole: z.string().nullable().default(null),
  name: z.string().default(''),
  summary: z.string().nullable().default(null),
  applicability: z.string().nullable().default(null),
  designImpact: z.string().nullable().default(null),
  evidenceRequired: z.string().nullable().default(null),
  gapAction: z.string().nullable().default(null),
  verifiedAt: z.string().nullable().default(null),
  confidence: postgrestNumericSchema,
  claimType: z.string().nullable().default(null),
  verificationStatus: z.enum(['VERIFIED', 'UNVERIFIED']).nullable().default(null),
  sourceGrade: rawSourceGradeSchema.nullable().default(null),
});

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

export const rawVerdictFailSchema = z.object({
  axis: z.string(),
  severity: z.enum(['blocker', 'warning']),
  summary: z.string(),
  evidence: z.string().default(''),
});

export const rawProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  revision: z.string().default('v1.0'),
  shipped: z.boolean().default(false),
  foundryName: z.string().nullable().default(null),
});

export const rawVerdictSchema = z.object({
  status: z.enum(['GREEN', 'AMBER', 'RED', 'UNREVIEWED']).default('UNREVIEWED'),
  summary: z.string().default('No summary provided'),
  fails: z.array(rawVerdictFailSchema).default([]),
  checkedConstraints: z.array(z.string()).default([]),
});

// ---------------------------------------------------------------------------
// Cost waterfall — aggregate + per-module
// ---------------------------------------------------------------------------

export const rawCostModuleSchema = z.object({
  moduleName: z.string().default('Unknown'),
  totalGbp: postgrestNumericSchema,
});

export const rawCostSchema = z.object({
  unitTotalGbp: postgrestNumericSchema,
  ceilingGbp: postgrestNumericSchema,
  perModule: z.array(rawCostModuleSchema).default([]),
});

// ---------------------------------------------------------------------------
// Audit log entry
// ---------------------------------------------------------------------------

export const rawAuditEntrySchema = z.object({
  action: z.string().default('Unknown action'),
  section: z.string().nullable().default(null),
  createdAtIso: z.string().default(''),
  metadataSummary: z.string().default(''),
});

// ---------------------------------------------------------------------------
// Reconciliation and redesign routes
// ---------------------------------------------------------------------------

export const rawReconciliationEntrySchema = z.object({
  constraint: z.string().default(''),
  target: z.string().default(''),
  actual: z.string().default(''),
  status: z.string().default(''),
});

export const rawRedesignRouteSchema = z.object({
  action: z.string().default(''),
  impact: z.string().default(''),
});

// ---------------------------------------------------------------------------
// Meta and totals
// ---------------------------------------------------------------------------

export const rawMetaSchema = z.object({
  generatedAtIso: z.string().default(new Date().toISOString()),
  createdAtIso: z.string().nullable().default(null),
  shippedAtIso: z.string().nullable().default(null),
  briefLockedAtIso: z.string().nullable().default(null),
  systemIllustrationUrl: z.string().nullable().default(null),
  interiorOverviewUrl: z.string().nullable().default(null),
});

export const rawTotalsSchema = z.object({
  moduleCount: z.number().default(0),
  keyPartCount: z.number().default(0),
  partRowCount: z.number().default(0),
  failureModeCount: z.number().default(0),
  unknownCount: z.number().default(0),
  regulatoryCount: z.number().default(0),
  supplierCount: z.number().default(0),
  reviewCount: z.number().default(0),
});

// ---------------------------------------------------------------------------
// Top-level document schema
// ---------------------------------------------------------------------------

export const rawPdfDataSchema = z.object({
  productClassification: rawProductClassificationSchema.optional(),
  project: rawProjectSchema,
  brief: rawBriefSchema,
  verdict: rawVerdictSchema,
  modules: z.array(rawModuleSchema).default([]),
  bom: z.array(rawBomSchema).default([]),
  suppliers: z.array(rawSupplierEvidenceSchema).default([]),
  regulatory: z.array(rawRegulatorySchema).default([]),
  failedCalculations: z.array(z.string()).default([]),
  unverifiedRegulatoryClaims: z.array(z.string()).default([]),
  requiredInputs: z.array(z.string()).default([]),
  nextActions: z.array(z.string()).default([]),
  batteryCalculation: z.any().nullable().default(null),
  powerArchitecture: z.any().nullable().default(null),
  meta: rawMetaSchema.optional(),
  totals: rawTotalsSchema.optional(),
  cost: rawCostSchema.optional(),
  auditLog: z.array(rawAuditEntrySchema).default([]),
  attributions: rawAttributionsSchema.optional(),
  dimensionSheet: z.any().nullable().default(null),
  spatialPlan: z.any().nullable().default(null),
  spatialPlanImageDataUri: z.string().nullable().default(null),
  reconciliation: z.array(rawReconciliationEntrySchema).default([]),
  redesignRoutes: z.array(rawRedesignRouteSchema).default([]),
});

export type HydratedProjectData = z.infer<typeof rawPdfDataSchema>;
