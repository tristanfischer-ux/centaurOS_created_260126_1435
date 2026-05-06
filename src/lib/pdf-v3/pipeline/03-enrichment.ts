import type {
  SanitizedProjectData,
  EnrichedProjectData,
  PdfModuleData,
  PdfSupplierEvidence,
  PdfBomData,
  PdfMeta,
  PdfTotals,
  PdfCostWaterfallData,
  PdfCostModuleEntry,
  PdfRisksModuleData,
  PdfRiskEntry,
  PdfAuditLogEntry,
  SanitizedRiskMatrixEntry,
} from '../types/render-contracts';

const GBP_FORMATTER = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 0,
});

const NULL_PLACEHOLDER = '\u2014'; // em dash

/** Round to N significant figures. */
function roundToSigFigs(value: number, sigFigs: number): number {
  return Number(value.toPrecision(sigFigs));
}

/**
 * Format a GBP currency value.
 * AACE Class 4 estimating accuracy is approximately +/-20%.
 * Values above £1,000 are rounded to 2 significant figures to
 * communicate that the figure is an estimate, not a quote.
 */
function formatCurrencyGbp(value: number | null): string {
  if (value === null) return NULL_PLACEHOLDER;
  const rounded = value > 1000 ? roundToSigFigs(value, 2) : value;
  return GBP_FORMATTER.format(rounded);
}

function formatMassKg(value: number | null): string {
  return value !== null ? `${value.toFixed(1)} kg` : NULL_PLACEHOLDER;
}

/**
 * Map a supplier match score (0-1) to a qualitative fit tier.
 * Thresholds follow AACE Class 4 conventions for supplier screening:
 *   > 0.9 = strong fit, 0.8-0.9 = conditional, below 0.8 = backup.
 */
function formatSupplierTier(score: number | null): string {
  if (score === null) return NULL_PLACEHOLDER;
  if (score > 0.9) return 'Strong Fit';
  if (score > 0.8) return 'Conditional Fit';
  return 'Backup';
}

function formatLeadWeeks(value: number | null): string {
  return value !== null ? `${value} wk` : NULL_PLACEHOLDER;
}

/**
 * Map a leadTimeSource tag to a founder-friendly provenance label.
 * Mirrors the V2 leadSourcePdfCaption convention so the PDF and the
 * workspace agree on what each tag reads as.
 */
function formatLeadTimeSource(source: string | null): string {
  switch (source) {
    case 'supplier-quote':       return 'Supplier quote';
    case 'ai-estimate':          return 'Specialist estimate';
    case 'historical-analogue':  return 'Historical analogue';
    case 'specialist-judgement': return 'Estimated';
    default:                     return 'Provenance: not yet declared';
  }
}

function computeHeadroom(unitCost: number | null, ceiling: number | null): {
  headroomFormatted: string;
  isCostOver: boolean;
} {
  if (unitCost === null || ceiling === null) {
    return { headroomFormatted: NULL_PLACEHOLDER, isCostOver: false };
  }
  const headroom = ceiling - unitCost;
  const isOver = headroom < 0;
  const formatted = `${isOver ? '\u2212' : '+'}${GBP_FORMATTER.format(Math.abs(headroom))}${isOver ? ' OVER' : ''}`;
  return { headroomFormatted: formatted, isCostOver: isOver };
}

// ---------------------------------------------------------------------------
// Risk rating computation — severity × likelihood → band + colour
// Follows HSE / IEC 61508 conventions for FMEA (1-5 scales).
// ---------------------------------------------------------------------------

function severityLabel(s: number): string {
  if (s >= 5) return 'Catastrophic';
  if (s === 4) return 'Major';
  if (s === 3) return 'Moderate';
  if (s === 2) return 'Minor';
  return 'Negligible';
}

function likelihoodLabel(l: number): string {
  if (l >= 5) return 'Frequent';
  if (l === 4) return 'Likely';
  if (l === 3) return 'Possible';
  if (l === 2) return 'Unlikely';
  return 'Rare';
}

function computeRiskBand(
  severity: number,
  likelihood: number,
): { band: string; color: string } {
  const score = severity * likelihood;
  if (score >= 16) return { band: 'critical', color: '#b91c1c' };
  if (score >= 9) return { band: 'high', color: '#b45309' };
  if (score >= 4) return { band: 'medium', color: '#a16207' };
  return { band: 'low', color: '#15803d' };
}

function formatRiskRating(severity: number, likelihood: number): string {
  const { band } = computeRiskBand(severity, likelihood);
  const score = severity * likelihood;
  return `${severityLabel(severity)} \u00D7 ${likelihoodLabel(likelihood)} \u2014 ${band} (${score})`;
}

// ---------------------------------------------------------------------------
// Format timestamp — ISO → "15 Jan 2026, 10:00"
// ---------------------------------------------------------------------------

function formatTimestamp(iso: string): string {
  if (!iso) return NULL_PLACEHOLDER;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Cost waterfall formatting
// ---------------------------------------------------------------------------

function formatCostWaterfall(sanitized: SanitizedProjectData): PdfCostWaterfallData {
  const cost = sanitized.cost;
  const unitCost = cost?.unitTotalGbp ?? sanitized.unitCostGbp ?? null;
  const ceiling = cost?.ceilingGbp ?? sanitized.costCeilingGbp ?? null;
  const { headroomFormatted, isCostOver } = computeHeadroom(unitCost, ceiling);

  const perModule: PdfCostModuleEntry[] = (cost?.perModule ?? []).map((entry) => {
    let pctOfUnit: string;
    if (unitCost !== null && unitCost > 0 && entry.totalGbp !== null) {
      pctOfUnit = `${((entry.totalGbp / unitCost) * 100).toFixed(1)}%`;
    } else {
      pctOfUnit = NULL_PLACEHOLDER;
    }
    return {
      moduleName: entry.moduleName,
      formattedCost: formatCurrencyGbp(entry.totalGbp),
      formattedPctOfUnit: pctOfUnit,
    };
  });

  return {
    formattedUnitCost: formatCurrencyGbp(unitCost),
    formattedCeiling: formatCurrencyGbp(ceiling),
    formattedHeadroom: headroomFormatted,
    isOverBudget: isCostOver,
    perModule,
  };
}

// ---------------------------------------------------------------------------
// Risks register formatting
// ---------------------------------------------------------------------------

function formatRiskEntry(entry: SanitizedRiskMatrixEntry): PdfRiskEntry {
  const sev = entry.severity ?? 0;
  const lik = entry.likelihood ?? 0;
  const initial = computeRiskBand(sev, lik);

  let formattedResidualRating: string | null = null;
  let residualBandColor: string | null = null;
  if (entry.residualSeverity != null && entry.residualLikelihood != null) {
    formattedResidualRating = formatRiskRating(entry.residualSeverity, entry.residualLikelihood);
    residualBandColor = computeRiskBand(entry.residualSeverity, entry.residualLikelihood).color;
  }

  return {
    id: entry.id,
    hazard: entry.hazard,
    cause: entry.cause,
    consequence: entry.consequence,
    existingControls: entry.existingControls,
    mitigation: entry.mitigation,
    owner: entry.owner,
    severity: sev,
    likelihood: lik,
    formattedInitialRating: formatRiskRating(sev, lik),
    initialBandColor: initial.color,
    residualSeverity: entry.residualSeverity,
    residualLikelihood: entry.residualLikelihood,
    formattedResidualRating,
    residualBandColor,
  };
}

function formatRisks(sanitized: SanitizedProjectData): PdfRisksModuleData[] {
  return sanitized.modules.map((mod) => ({
    moduleName: mod.name,
    riskEntries: (mod.riskMatrix ?? []).map(formatRiskEntry),
    failureModes: mod.failureModes,
    unknowns: mod.unknowns,
  }));
}

// ---------------------------------------------------------------------------
// Audit log formatting
// ---------------------------------------------------------------------------

function formatAuditLog(sanitized: SanitizedProjectData): PdfAuditLogEntry[] {
  return (sanitized.auditLog ?? []).map((entry) => ({
    formattedTimestamp: formatTimestamp(entry.createdAtIso),
    action: entry.action,
    section: entry.section,
    metadataSummary: entry.metadataSummary,
  }));
}

// ---------------------------------------------------------------------------
// Main enrichment function
// ---------------------------------------------------------------------------

export function formatAndEnrich(sanitized: SanitizedProjectData): EnrichedProjectData {
  const modules: PdfModuleData[] = sanitized.modules.map((m) => ({
    name: m.name,
    description: m.description,
    purpose: m.purpose,
    whyItMatters: m.whyItMatters,
    imageUrl: m.imageUrl,
    formattedMassKg: formatMassKg(m.massKg),
    formattedCostGbp: formatCurrencyGbp(m.costGbp),
    keyParts: m.keyParts,
    failureModes: m.failureModes,
    unknowns: m.unknowns,
    leadWeeks: m.leadWeeks,
    formattedLeadWeeks: formatLeadWeeks(m.leadWeeks),
    mirrorOfName: m.mirrorOfName,
    budgetMassKg: m.budgetMassKg,
    formattedBudgetMassKg: formatMassKg(m.budgetMassKg),
    leadTimeSource: m.leadTimeSource,
    formattedLeadTimeSource: formatLeadTimeSource(m.leadTimeSource),
    reviews: m.reviews,
  }));

  const bom: PdfBomData[] = sanitized.bom.map((b) => ({
    partNumber: b.partNumber,
    name: b.name,
    material: b.material,
    sourceModuleName: b.sourceModuleName,
    isPurchased: b.isPurchased,
    process: b.process,
    massKg: b.massKg,
    estimatedUnitCostGbp: b.estimatedUnitCostGbp,
    description: b.description,
  }));

  const suppliers: PdfSupplierEvidence[] = sanitized.suppliers.map((s) => ({
    supplier: s.supplier,
    candidateProductSku: s.candidateProductSku,
    role: s.role,
    requiredCertification: s.requiredCertification,
    certificationVerified: s.certificationVerified,
    quoteReceived: s.quoteReceived,
    priceBasis: s.priceBasis,
    moq: s.moq,
    leadTimeBasis: s.leadTimeBasis,
    ukEuSupport: s.ukEuSupport,
    integrationRisk: s.integrationRisk,
    commercialRisk: s.commercialRisk,
    sourceGrade: s.sourceGrade,
    confidence: s.confidence,
    nextAction: s.nextAction,
  }));

  const unitCostFormatted = sanitized.unitCostGbp != null
    ? `${formatCurrencyGbp(sanitized.unitCostGbp)} \u00B120%`
    : NULL_PLACEHOLDER;
  const costCeilingFormatted = formatCurrencyGbp(sanitized.costCeilingGbp ?? null);
  const { headroomFormatted, isCostOver } = computeHeadroom(
    sanitized.unitCostGbp ?? null,
    sanitized.costCeilingGbp ?? null,
  );

  const costWaterfall = formatCostWaterfall(sanitized);
  const risks = formatRisks(sanitized);
  const auditLog = formatAuditLog(sanitized);

  return {
    project: sanitized.project,
    brief: sanitized.brief,
    verdict: sanitized.verdict,
    modules,
    bom,
    suppliers,
    regulatory: sanitized.regulatory,
    failedCalculations: sanitized.failedCalculations ?? [],
    unverifiedRegulatoryClaims: sanitized.unverifiedRegulatoryClaims ?? [],
    requiredInputs: sanitized.requiredInputs ?? [],
    nextActions: sanitized.nextActions ?? [],
    batteryCalculation: sanitized.batteryCalculation ?? null,
    powerArchitecture: sanitized.powerArchitecture ?? null,
    unitCostFormatted,
    costCeilingFormatted,
    businessRuleContext: {
      feasibilityAxes: sanitized.feasibilityAxes ?? [],
      unitCostRaw: sanitized.unitCostGbp ?? null,
      costCeilingRaw: sanitized.costCeilingGbp ?? null,
    },
    costWaterfall,
    risks,
    auditLog,
    attributions: sanitized.attributions,
    dimensionSheet: sanitized.dimensionSheet,
    spatialPlan: sanitized.spatialPlan,
    spatialPlanImageDataUri: sanitized.spatialPlanImageDataUri,
    reconciliation: sanitized.reconciliation,
    redesignRoutes: sanitized.redesignRoutes,
  };
}

/**
 * Assemble document-level metadata and totals from the enriched data.
 * Called after enrichment to build the final PdfRenderData shape.
 *
 * Totals are computed strictly from the enriched arrays so the cover-page
 * counts always match the rendered content. The rawTotals parameter is
 * accepted for backward compatibility but ignored for the totals object.
 */
export function assembleDocumentMeta(
  enriched: EnrichedProjectData,
  rawMeta?: {
    generatedAtIso?: string;
    createdAtIso?: string | null;
    shippedAtIso?: string | null;
    briefLockedAtIso?: string | null;
    systemIllustrationUrl?: string | null;
    interiorOverviewUrl?: string | null;
  },
  _rawTotals?: {
    moduleCount?: number;
    keyPartCount?: number;
    partRowCount?: number;
    failureModeCount?: number;
    unknownCount?: number;
    regulatoryCount?: number;
    supplierCount?: number;
    reviewCount?: number;
  },
): { meta: PdfMeta; totals: PdfTotals } {
  const unitCostNum = enriched.businessRuleContext.unitCostRaw;
  const ceilingNum = enriched.businessRuleContext.costCeilingRaw;
  const { headroomFormatted, isCostOver } = computeHeadroom(unitCostNum, ceilingNum);

  const meta: PdfMeta = {
    generatedAtIso: rawMeta?.generatedAtIso ?? new Date().toISOString(),
    createdAtIso: rawMeta?.createdAtIso ?? null,
    shippedAtIso: rawMeta?.shippedAtIso ?? null,
    briefLockedAtIso: rawMeta?.briefLockedAtIso ?? null,
    systemIllustrationUrl: rawMeta?.systemIllustrationUrl ?? null,
    interiorOverviewUrl: rawMeta?.interiorOverviewUrl ?? null,
    unitCostFormatted: enriched.unitCostFormatted,
    costCeilingFormatted: enriched.costCeilingFormatted,
    headroomFormatted,
    isCostOver,
  };

  // Compute totals strictly from the enriched data arrays so cover-page
  // counts always match the rendered content.
  const totals: PdfTotals = {
    moduleCount: enriched.modules.length,
    keyPartCount: 0,
    partRowCount: enriched.bom.length,
    failureModeCount: enriched.modules.reduce((acc, m) => acc + m.failureModes.length, 0),
    unknownCount: enriched.modules.reduce((acc, m) => acc + m.unknowns.length, 0),
    regulatoryCount: 0,
    supplierCount: enriched.suppliers.length,
    reviewCount: 0,
  };

  return { meta, totals };
}
