import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { ProjectPDFDocument } from './renderer/document';
import { hydrateAndCoerce } from './pipeline/01-hydration';
import { sanitizeText } from './pipeline/02-sanitization';
import { formatAndEnrich, assembleDocumentMeta } from './pipeline/03-enrichment';
import { extractAlerts } from './pipeline/04-business-rules';
import { PdfRenderData } from './types/render-contracts';
import { PdfPipelineError } from './errors/pdf-pipeline-error';

// Mock DB Fetch
async function fetchMockData(projectId: string, supabaseClient: Record<string, unknown>): Promise<unknown> {
  return {
    project: { name: 'Test Project', revision: 'v1.0', shipped: true, foundryName: null },
    brief: {
      subject: null, mission: null, useCase: null, targetCustomers: null, whyNow: null,
      unitCostCeilingGbp: 3000, maxMassKg: null, targetProcess: null, targetMaterial: null,
      toleranceTarget: null, quantityTarget: null, complianceNotes: null,
    },
    verdict: { status: 'GREEN', summary: 'Looks good', fails: [], checkedConstraints: ['cost', 'mass'] },
    regulatory: [],
    modules: [
      {
        name: 'Battery Pack',
        massKg: 50,
        costGbp: 1500,
        description: 'Main energy storage module using lithium iron phosphate cells.',
        purpose: 'Store and deliver electrical energy to the powertrain.',
        whyItMatters: 'Battery cost dominates the bill of materials and determines vehicle range.',
        imageUrl: null,
        keyParts: ['LFP cell module', 'Battery management system', 'Thermal interface material'],
        failureModes: ['Cell thermal runaway', 'BMS firmware crash'],
        unknowns: ['Final cell supplier not confirmed'],
        leadWeeks: 12,
        mirrorOfName: null,
        budgetMassKg: 55,
        leadTimeSource: 'supplier-quote',
        riskMatrix: [
          {
            id: 'RM-1',
            hazard: 'Cell thermal runaway propagation',
            cause: 'Internal short circuit in a single cell triggering exothermic chain reaction across the pack.',
            consequence: 'Pack fire, potential vehicle loss, occupant injury risk.',
            existingControls: 'Cell-level fusing, pack-level temperature monitoring.',
            severity: 5,
            likelihood: 2,
            mitigation: 'Add ceramic separator between cell groups; implement active cooling loop.',
            owner: 'Battery engineering lead',
            residualSeverity: 4,
            residualLikelihood: 1,
          },
          {
            id: 'RM-2',
            hazard: 'BMS firmware crash during charging',
            cause: 'Stack overflow in state-of-charge estimation routine under rapid-charge conditions.',
            consequence: 'Loss of charge control; potential over-charge or over-discharge of cells.',
            existingControls: 'Watchdog timer reset.',
            severity: 3,
            likelihood: 3,
            mitigation: 'Implement redundant BMS with independent hardware cutoff.',
            owner: 'Software lead',
            residualSeverity: 2,
            residualLikelihood: 2,
          },
        ],
        reviews: [],
      },
    ],
    bom: [
      {
        partNumber: 'BAT-01',
        name: 'LFP Cell Module',
        material: 'Lithium iron phosphate',
        sourceModuleName: 'Battery Pack',
        isPurchased: true,
        process: null,
        massKg: 12.5,
        estimatedUnitCostGbp: 450,
        description: 'Prismatic LFP cells in 16S1P configuration, automotive-grade.',
      },
      {
        partNumber: 'BAT-02',
        name: 'Battery Management System',
        material: 'FR4 PCB',
        sourceModuleName: 'Battery Pack',
        isPurchased: false,
        process: 'PCB assembly',
        massKg: 0.8,
        estimatedUnitCostGbp: 120,
        description: null,
      },
    ],
    suppliers: [
      {
        name: 'Supplier A',
        matchScore: 0.95,
        hq: 'Shenzhen, China',
        websiteUrl: 'https://supplier-a.example.com',
        contactEmail: 'sales@supplier-a.example.com',
        projectSynthesis: 'Tier-one battery cell manufacturer with proven LFP chemistry and automotive qualification.',
        matchedPartNumbers: ['BAT-01'],
        moduleNames: ['Battery Pack'],
        rampRole: 'Production',
        certifications: ['ISO 9001', 'IATF 16949'],
        foundedYear: 2008,
        employeeCount: 5000,
        leadTime: '8-12 weeks',
        minimumOrder: '1000 units',
        matchReasons: [
          'ISO 9001 and IATF 16949 certified — automotive-grade manufacturing.',
          'Specialises in LFP chemistry matching the module specification.',
        ],
        description: 'Leading manufacturer of lithium iron phosphate battery cells for electric vehicles and energy storage systems.',
      },
    ],
    cost: {
      unitTotalGbp: 2100,
      ceilingGbp: 3000,
      perModule: [
        { moduleName: 'Battery Pack', totalGbp: 2100 },
      ],
    },
    auditLog: [
      {
        action: 'brief.locked',
        section: 'brief',
        createdAtIso: '2026-01-20T14:00:00Z',
        metadataSummary: 'Brief locked by founder',
      },
      {
        action: 'decomposition.completed',
        section: 'modules',
        createdAtIso: '2026-01-21T09:30:00Z',
        metadataSummary: 'Max decomposition produced 1 module',
      },
      {
        action: 'project.shipped',
        section: null,
        createdAtIso: '2026-02-01T16:45:00Z',
        metadataSummary: '',
      },
    ],
    meta: {
      generatedAtIso: new Date().toISOString(),
      createdAtIso: '2026-01-15T10:00:00Z',
      shippedAtIso: null,
      briefLockedAtIso: '2026-01-20T14:00:00Z',
      systemIllustrationUrl: null,
      interiorOverviewUrl: null,
    },
    totals: {
      moduleCount: 1,
      keyPartCount: 3,
      partRowCount: 2,
      failureModeCount: 2,
      unknownCount: 1,
      regulatoryCount: 0,
      supplierCount: 1,
      reviewCount: 0,
    },
  };
}

export async function generateAndStorePdfV3(projectId: string, supabaseClient: Record<string, unknown>): Promise<void> {
  const raw = await fetchMockData(projectId, supabaseClient);

  const hydrated = hydrateAndCoerce(raw);
  const sanitized = sanitizeText(hydrated);
  const enriched = formatAndEnrich(sanitized);
  const alerts = extractAlerts(enriched);

  const { meta, totals } = assembleDocumentMeta(
    enriched,
    hydrated.meta ?? undefined,
    hydrated.totals ?? undefined,
  );

  const renderData: PdfRenderData = {
    project: enriched.project,
    brief: enriched.brief,
    verdict: enriched.verdict,
    alerts,
    modules: enriched.modules,
    bom: enriched.bom,
    suppliers: enriched.suppliers,
    regulatory: enriched.regulatory,
    failedCalculations: enriched.failedCalculations,
    unverifiedRegulatoryClaims: enriched.unverifiedRegulatoryClaims,
    requiredInputs: enriched.requiredInputs,
    nextActions: enriched.nextActions,
    batteryCalculation: enriched.batteryCalculation,
    powerArchitecture: enriched.powerArchitecture,
    meta,
    totals,
    costWaterfall: enriched.costWaterfall,
    risks: enriched.risks,
    auditLog: enriched.auditLog,
    attributions: enriched.attributions,
    dimensionSheet: enriched.dimensionSheet,
    spatialPlan: enriched.spatialPlan,
    spatialPlanImageDataUri: enriched.spatialPlanImageDataUri,
    reconciliation: enriched.reconciliation,
    redesignRoutes: enriched.redesignRoutes,
  };

  const buffer = await renderToBuffer(React.createElement(ProjectPDFDocument as any, { data: renderData }) as any);

  // Mock storage upload
  console.log(`Uploaded buffer of size ${buffer.length} for project ${projectId}`);

  // Strict audit log error handling
  const { error } = await (supabaseClient as any).from('report_downloads').insert({ project_id: projectId });
  if (error) {
    throw new PdfPipelineError('Failed to write to report_downloads audit log', error);
  }
}
