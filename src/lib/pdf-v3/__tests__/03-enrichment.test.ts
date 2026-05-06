import { formatAndEnrich } from '../pipeline/03-enrichment';
import { SanitizedProjectData } from '../types/render-contracts';

const BASE_SANITIZED: SanitizedProjectData = {
  project: { name: 'Test', revision: 'v1', shipped: false },
  brief: {
    subject: null, mission: null, useCase: null, targetCustomers: null, whyNow: null,
    unitCostCeilingGbp: null, maxMassKg: null, targetProcess: null, targetMaterial: null,
    toleranceTarget: null, quantityTarget: null, complianceNotes: null,
  },
  verdict: { status: 'GREEN', summary: '', fails: [], checkedConstraints: [] },
  modules: [],
  bom: [],
  suppliers: [],
  regulatory: [],
  failedCalculations: [],
  unverifiedRegulatoryClaims: [],
  requiredInputs: [],
  nextActions: [],
  batteryCalculation: null,
  powerArchitecture: null,
};

const BASE_MODULE_FIELDS = {
  description: null as string | null,
  purpose: null as string | null,
  whyItMatters: null as string | null,
  imageUrl: null as string | null,
  keyParts: [] as string[],
  failureModes: [] as string[],
  unknowns: [] as string[],
  leadWeeks: null as number | null,
  mirrorOfName: null as string | null,
  budgetMassKg: null as number | null,
  leadTimeSource: null as string | null,
  riskMatrix: [],
  reviews: [],
};

const BASE_SUPPLIER_FIELDS = {
  candidateProductSku: null as string | null,
  role: null as string | null,
  requiredCertification: null as string | null,
  certificationVerified: false as boolean,
  quoteReceived: false as boolean,
  priceBasis: null as string | null,
  moq: null as string | null,
  leadTimeBasis: null as string | null,
  ukEuSupport: false as boolean,
  integrationRisk: null as string | null,
  commercialRisk: null as string | null,
  sourceGrade: null as 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | null,
  confidence: null as number | null,
  nextAction: null as string | null,
};

describe('03-enrichment — formatAndEnrich', () => {
  // ---- currency formatting ----

  it('should format costGbp as GBP currency using Intl.NumberFormat', () => {
    const input: SanitizedProjectData = {
      ...BASE_SANITIZED,
      modules: [{ name: 'Battery Pack', massKg: 10.5, costGbp: 123.45, ...BASE_MODULE_FIELDS }],
    };

    const result = formatAndEnrich(input);

    expect(result.modules[0].formattedCostGbp).toBe('£123');
  });

  it('should format costGbp with exact integer values', () => {
    const input: SanitizedProjectData = {
      ...BASE_SANITIZED,
      modules: [{ name: 'Frame', massKg: 5, costGbp: 500, ...BASE_MODULE_FIELDS }],
    };

    const result = formatAndEnrich(input);

    expect(result.modules[0].formattedCostGbp).toBe('£500');
  });

  it('should render a placeholder when costGbp is null', () => {
    const input: SanitizedProjectData = {
      ...BASE_SANITIZED,
      modules: [{ name: 'Prototype Wing', massKg: 3.2, costGbp: null, ...BASE_MODULE_FIELDS }],
    };

    const result = formatAndEnrich(input);

    expect(result.modules[0].formattedCostGbp).toBe('—');
  });

  // ---- mass formatting ----

  it('should format massKg with one decimal place and "kg" suffix', () => {
    const input: SanitizedProjectData = {
      ...BASE_SANITIZED,
      modules: [{ name: 'Motor', massKg: 4.567, costGbp: 80, ...BASE_MODULE_FIELDS }],
    };

    const result = formatAndEnrich(input);

    expect(result.modules[0].formattedMassKg).toBe('4.6 kg');
  });

  it('should render a placeholder when massKg is null', () => {
    const input: SanitizedProjectData = {
      ...BASE_SANITIZED,
      modules: [{ name: 'Controller', massKg: null, costGbp: 60, ...BASE_MODULE_FIELDS }],
    };

    const result = formatAndEnrich(input);

    expect(result.modules[0].formattedMassKg).toBe('—');
  });

  // ---- supplier pass-through ----

  it('should pass through rich supplier evidence fields', () => {
    const input: SanitizedProjectData = {
      ...BASE_SANITIZED,
      suppliers: [{
        supplier: 'Acme Ltd',
        candidateProductSku: 'BAT-100',
        role: 'Primary',
        requiredCertification: 'ISO9001',
        certificationVerified: true,
        quoteReceived: true,
        priceBasis: 'Quote',
        moq: '1000',
        leadTimeBasis: 'Standard',
        ukEuSupport: true,
        integrationRisk: 'Low',
        commercialRisk: 'Low',
        sourceGrade: 'A',
        confidence: 0.95,
        nextAction: 'Sign NDA',
      }],
    };

    const result = formatAndEnrich(input);

    expect(result.suppliers).toHaveLength(1);
    expect(result.suppliers[0].supplier).toBe('Acme Ltd');
    expect(result.suppliers[0].candidateProductSku).toBe('BAT-100');
    expect(result.suppliers[0].role).toBe('Primary');
    expect(result.suppliers[0].requiredCertification).toBe('ISO9001');
    expect(result.suppliers[0].certificationVerified).toBe(true);
    expect(result.suppliers[0].quoteReceived).toBe(true);
    expect(result.suppliers[0].priceBasis).toBe('Quote');
    expect(result.suppliers[0].moq).toBe('1000');
    expect(result.suppliers[0].leadTimeBasis).toBe('Standard');
    expect(result.suppliers[0].ukEuSupport).toBe(true);
    expect(result.suppliers[0].integrationRisk).toBe('Low');
    expect(result.suppliers[0].commercialRisk).toBe('Low');
    expect(result.suppliers[0].sourceGrade).toBe('A');
    expect(result.suppliers[0].confidence).toBe(0.95);
    expect(result.suppliers[0].nextAction).toBe('Sign NDA');
  });

  // ---- aggregate unit cost and cost ceiling ----

  it('should format unitCostGbp and costCeilingGbp as GBP currency', () => {
    const input: SanitizedProjectData = {
      ...BASE_SANITIZED,
      unitCostGbp: 1499.99,
      costCeilingGbp: 2000,
    };

    const result = formatAndEnrich(input);

    expect(result.unitCostFormatted).toBe('£1,500 ±20%');
    expect(result.costCeilingFormatted).toBe('£2,000');
  });

  it('should render placeholders when unitCostGbp and costCeilingGbp are null', () => {
    const result = formatAndEnrich(BASE_SANITIZED);

    expect(result.unitCostFormatted).toBe('—');
    expect(result.costCeilingFormatted).toBe('—');
  });

  // ---- passthrough of non-numeric fields ----

  it('should carry project and verdict through unchanged', () => {
    const input: SanitizedProjectData = {
      ...BASE_SANITIZED,
      bom: [{ partNumber: 'PN-001', name: 'Carbon Panel', material: 'Carbon Fibre', sourceModuleName: null, isPurchased: false, process: null, massKg: null, estimatedUnitCostGbp: null, description: null }],
    };

    const result = formatAndEnrich(input);

    expect(result.project).toEqual(BASE_SANITIZED.project);
    expect(result.verdict).toEqual(BASE_SANITIZED.verdict);
  });

  // ---- empty arrays ----

  it('should handle empty modules, suppliers, and bom arrays', () => {
    const result = formatAndEnrich(BASE_SANITIZED);

    expect(result.modules).toEqual([]);
    expect(result.suppliers).toEqual([]);
    expect(result.bom).toEqual([]);
  });

  // ---- multiple items ----

  it('should format every module and supplier in the array', () => {
    const input: SanitizedProjectData = {
      ...BASE_SANITIZED,
      modules: [
        { name: 'Alpha', massKg: 1, costGbp: 100, ...BASE_MODULE_FIELDS },
        { name: 'Beta', massKg: 2.5, costGbp: 250, ...BASE_MODULE_FIELDS },
        { name: 'Gamma', massKg: null, costGbp: null, ...BASE_MODULE_FIELDS },
      ],
      suppliers: [
        { ...BASE_SUPPLIER_FIELDS, supplier: 'Supplier A', confidence: 0.95 },
        { ...BASE_SUPPLIER_FIELDS, supplier: 'Supplier B', confidence: 0.42 },
      ],
    };

    const result = formatAndEnrich(input);

    expect(result.modules).toHaveLength(3);
    expect(result.modules[0].name).toBe('Alpha');
    expect(result.modules[0].formattedMassKg).toBe('1.0 kg');
    expect(result.modules[0].formattedCostGbp).toBe('£100');
    expect(result.modules[1].name).toBe('Beta');
    expect(result.modules[1].formattedMassKg).toBe('2.5 kg');
    expect(result.modules[1].formattedCostGbp).toBe('£250');
    expect(result.modules[2].name).toBe('Gamma');
    expect(result.modules[2].formattedMassKg).toBe('—');
    expect(result.modules[2].formattedCostGbp).toBe('—');

    expect(result.suppliers).toHaveLength(2);
    expect(result.suppliers[0].supplier).toBe('Supplier A');
    expect(result.suppliers[0].confidence).toBe(0.95);
    expect(result.suppliers[1].supplier).toBe('Supplier B');
    expect(result.suppliers[1].confidence).toBe(0.42);
  });

  // ---- business rule context passthrough ----

  it('should forward feasibility axes and raw cost values in businessRuleContext', () => {
    const axes = [
      { name: 'Mass', checked: true },
      { name: 'Volume', checked: false },
    ];
    const input: SanitizedProjectData = {
      ...BASE_SANITIZED,
      feasibilityAxes: axes,
      unitCostGbp: 500,
      costCeilingGbp: 600,
    };

    const result = formatAndEnrich(input);

    expect(result.businessRuleContext.feasibilityAxes).toEqual(axes);
    expect(result.businessRuleContext.unitCostRaw).toBe(500);
    expect(result.businessRuleContext.costCeilingRaw).toBe(600);
  });

  // ---- rich module fields passthrough ----

  it('should pass through rich module fields (description, purpose, keyParts, etc.)', () => {
    const input: SanitizedProjectData = {
      ...BASE_SANITIZED,
      modules: [{
        name: 'Battery Pack',
        massKg: 50,
        costGbp: 1500,
        description: 'Main energy storage module.',
        purpose: 'Store electrical energy.',
        whyItMatters: 'Cost dominates the bill of materials.',
        imageUrl: 'https://example.com/battery.png',
        keyParts: ['LFP cell', 'BMS'],
        failureModes: ['Thermal runaway'],
        unknowns: ['Cell supplier'],
        leadWeeks: 12,
        mirrorOfName: null,
        budgetMassKg: 55,
        leadTimeSource: 'supplier-quote',
        riskMatrix: [],
        reviews: [],
      }],
    };

    const result = formatAndEnrich(input);

    expect(result.modules[0].description).toBe('Main energy storage module.');
    expect(result.modules[0].purpose).toBe('Store electrical energy.');
    expect(result.modules[0].whyItMatters).toBe('Cost dominates the bill of materials.');
    expect(result.modules[0].imageUrl).toBe('https://example.com/battery.png');
    expect(result.modules[0].keyParts).toEqual(['LFP cell', 'BMS']);
    expect(result.modules[0].failureModes).toEqual(['Thermal runaway']);
    expect(result.modules[0].unknowns).toEqual(['Cell supplier']);
    expect(result.modules[0].leadWeeks).toBe(12);
    expect(result.modules[0].formattedLeadWeeks).toBe('12 wk');
    expect(result.modules[0].mirrorOfName).toBeNull();
    expect(result.modules[0].budgetMassKg).toBe(55);
    expect(result.modules[0].formattedBudgetMassKg).toBe('55.0 kg');
    expect(result.modules[0].leadTimeSource).toBe('supplier-quote');
    expect(result.modules[0].formattedLeadTimeSource).toBe('Supplier quote');
  });



  // ---- cost waterfall ----

  it('should produce cost waterfall with formatted per-module entries', () => {
    const input: SanitizedProjectData = {
      ...BASE_SANITIZED,
      unitCostGbp: 2100,
      costCeilingGbp: 3000,
      cost: {
        unitTotalGbp: 2100,
        ceilingGbp: 3000,
        perModule: [
          { moduleName: 'Battery Pack', totalGbp: 1500 },
          { moduleName: 'Motor', totalGbp: 600 },
        ],
      },
    };

    const result = formatAndEnrich(input);

    expect(result.costWaterfall.formattedUnitCost).toBe('£2,100');
    expect(result.costWaterfall.formattedCeiling).toBe('£3,000');
    expect(result.costWaterfall.formattedHeadroom).toBe('+£900');
    expect(result.costWaterfall.isOverBudget).toBe(false);
    expect(result.costWaterfall.perModule).toHaveLength(2);
    expect(result.costWaterfall.perModule[0].moduleName).toBe('Battery Pack');
    expect(result.costWaterfall.perModule[0].formattedCost).toBe('£1,500');
    expect(result.costWaterfall.perModule[0].formattedPctOfUnit).toBe('71.4%');
    expect(result.costWaterfall.perModule[1].moduleName).toBe('Motor');
    expect(result.costWaterfall.perModule[1].formattedCost).toBe('£600');
    expect(result.costWaterfall.perModule[1].formattedPctOfUnit).toBe('28.6%');
  });

  it('should flag over-budget cost waterfall', () => {
    const input: SanitizedProjectData = {
      ...BASE_SANITIZED,
      unitCostGbp: 5000,
      costCeilingGbp: 3000,
      cost: {
        unitTotalGbp: 5000,
        ceilingGbp: 3000,
        perModule: [],
      },
    };

    const result = formatAndEnrich(input);

    expect(result.costWaterfall.isOverBudget).toBe(true);
    expect(result.costWaterfall.formattedHeadroom).toContain('OVER');
  });

  it('should produce empty cost waterfall when no cost data', () => {
    const result = formatAndEnrich(BASE_SANITIZED);

    expect(result.costWaterfall.formattedUnitCost).toBe('—');
    expect(result.costWaterfall.formattedCeiling).toBe('—');
    expect(result.costWaterfall.formattedHeadroom).toBe('—');
    expect(result.costWaterfall.isOverBudget).toBe(false);
    expect(result.costWaterfall.perModule).toEqual([]);
  });

  // ---- risks register ----

  it('should compute risk ratings from risk matrix entries', () => {
    const input: SanitizedProjectData = {
      ...BASE_SANITIZED,
      modules: [{
        name: 'Battery Pack',
        massKg: 50,
        costGbp: 1500,
        ...BASE_MODULE_FIELDS,
        failureModes: ['Thermal runaway'],
        unknowns: ['Cell supplier'],
        riskMatrix: [
          {
            id: 'RM-1',
            hazard: 'Cell thermal runaway',
            cause: 'Internal short circuit',
            consequence: 'Pack fire',
            existingControls: 'Fusing',
            severity: 5,
            likelihood: 2,
            mitigation: 'Ceramic separator',
            owner: 'Battery lead',
            residualSeverity: 4,
            residualLikelihood: 1,
          },
        ],
      }],
    };

    const result = formatAndEnrich(input);

    expect(result.risks).toHaveLength(1);
    expect(result.risks[0].moduleName).toBe('Battery Pack');
    expect(result.risks[0].riskEntries).toHaveLength(1);

    const entry = result.risks[0].riskEntries[0];
    expect(entry.id).toBe('RM-1');
    expect(entry.hazard).toBe('Cell thermal runaway');
    expect(entry.cause).toBe('Internal short circuit');
    expect(entry.severity).toBe(5);
    expect(entry.likelihood).toBe(2);
    expect(entry.formattedInitialRating).toContain('Catastrophic');
    expect(entry.formattedInitialRating).toContain('Unlikely');
    expect(entry.formattedInitialRating).toContain('high');
    expect(entry.formattedInitialRating).toContain('10');
    expect(entry.initialBandColor).toBe('#b45309');
    expect(entry.formattedResidualRating).toContain('Major');
    expect(entry.formattedResidualRating).toContain('Rare');
    expect(entry.formattedResidualRating).toContain('low');
    expect(entry.formattedResidualRating).toContain('4');
    expect(entry.residualBandColor).toBe('#a16207');

    // Legacy fallback data still present
    expect(result.risks[0].failureModes).toEqual(['Thermal runaway']);
    expect(result.risks[0].unknowns).toEqual(['Cell supplier']);
  });

  it('should produce empty risk entries when no risk matrix', () => {
    const input: SanitizedProjectData = {
      ...BASE_SANITIZED,
      modules: [{
        name: 'Motor',
        massKg: 5,
        costGbp: 200,
        ...BASE_MODULE_FIELDS,
        failureModes: ['Winding failure'],
        unknowns: ['Final magnet spec'],
      }],
    };

    const result = formatAndEnrich(input);

    expect(result.risks).toHaveLength(1);
    expect(result.risks[0].moduleName).toBe('Motor');
    expect(result.risks[0].riskEntries).toEqual([]);
    expect(result.risks[0].failureModes).toEqual(['Winding failure']);
    expect(result.risks[0].unknowns).toEqual(['Final magnet spec']);
  });

  it('should produce empty risks when no modules', () => {
    const result = formatAndEnrich(BASE_SANITIZED);

    expect(result.risks).toEqual([]);
  });

  // ---- audit log ----

  it('should format audit log timestamps', () => {
    const input: SanitizedProjectData = {
      ...BASE_SANITIZED,
      auditLog: [
        {
          action: 'brief.locked',
          section: 'brief',
          createdAtIso: '2026-01-20T14:00:00Z',
          metadataSummary: 'Brief locked by founder',
        },
      ],
    };

    const result = formatAndEnrich(input);

    expect(result.auditLog).toHaveLength(1);
    expect(result.auditLog[0].action).toBe('brief.locked');
    expect(result.auditLog[0].section).toBe('brief');
    expect(result.auditLog[0].metadataSummary).toBe('Brief locked by founder');
    expect(result.auditLog[0].formattedTimestamp).toContain('20');
    expect(result.auditLog[0].formattedTimestamp).not.toBe('—');
  });

  it('should produce empty audit log when no data', () => {
    const result = formatAndEnrich(BASE_SANITIZED);

    expect(result.auditLog).toEqual([]);
  });
});
