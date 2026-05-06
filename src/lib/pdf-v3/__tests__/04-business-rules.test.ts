import { extractAlerts } from '../pipeline/04-business-rules';
import { EnrichedProjectData, PdfAlert } from '../types/render-contracts';

const BASE_ENRICHED: EnrichedProjectData = {
  project: { name: 'Test Project', revision: 'v1.0', shipped: false, foundryName: null },
  brief: { subject: null, mission: null, useCase: null, targetCustomers: null, whyNow: null, unitCostCeilingGbp: null, maxMassKg: null, targetProcess: null, targetMaterial: null, toleranceTarget: null, quantityTarget: null, complianceNotes: null },
  regulatory: [],
  verdict: { status: 'AMBER', summary: 'Needs review', fails: [], checkedConstraints: [] },
  modules: [],
  bom: [],
  suppliers: [],
  failedCalculations: [],
  unverifiedRegulatoryClaims: [],
  requiredInputs: [],
  nextActions: [],
  batteryCalculation: null,
  powerArchitecture: null,
  unitCostFormatted: '—',
  costCeilingFormatted: '—',
  businessRuleContext: {
    feasibilityAxes: [],
    unitCostRaw: null,
    costCeilingRaw: null,
  },
  costWaterfall: {
    formattedUnitCost: '—',
    formattedCeiling: '—',
    formattedHeadroom: '—',
    isOverBudget: false,
    perModule: [],
  },
  risks: [],
  auditLog: [],
};

describe('04-business-rules — extractAlerts', () => {
  // ---- Phantom Green ----

  it('should emit an AMBER "Phantom Green" alert when verdict is GREEN but no feasibility axes are checked', () => {
    const input: EnrichedProjectData = {
      ...BASE_ENRICHED,
      verdict: { status: 'GREEN', summary: 'All clear', fails: [], checkedConstraints: [] },
      businessRuleContext: {
        feasibilityAxes: [
          { name: 'Mass', checked: false },
          { name: 'Volume', checked: false },
        ],
        unitCostRaw: null,
        costCeilingRaw: null,
      },
    };

    const alerts = extractAlerts(input);

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toEqual<PdfAlert>({
      severity: 'AMBER',
      title: 'Phantom Green',
      message: expect.stringContaining('no feasibility axes'),
    });
  });

  it('should NOT emit a Phantom Green alert when verdict is GREEN and at least one axis is checked', () => {
    const input: EnrichedProjectData = {
      ...BASE_ENRICHED,
      verdict: { status: 'GREEN', summary: 'All clear', fails: [], checkedConstraints: ['mass'] },
      businessRuleContext: {
        feasibilityAxes: [
          { name: 'Mass', checked: true },
          { name: 'Volume', checked: false },
        ],
        unitCostRaw: null,
        costCeilingRaw: null,
      },
    };

    const alerts = extractAlerts(input);

    expect(alerts.find((a) => a.title === 'Phantom Green')).toBeUndefined();
  });

  it('should NOT emit a Phantom Green alert when verdict is not GREEN', () => {
    const input: EnrichedProjectData = {
      ...BASE_ENRICHED,
      verdict: { status: 'AMBER', summary: 'Partial', fails: [], checkedConstraints: [] },
      businessRuleContext: {
        feasibilityAxes: [
          { name: 'Mass', checked: false },
        ],
        unitCostRaw: null,
        costCeilingRaw: null,
      },
    };

    const alerts = extractAlerts(input);

    expect(alerts.find((a) => a.title === 'Phantom Green')).toBeUndefined();
  });

  it('should emit a Phantom Green alert when verdict is GREEN and feasibility axes array is empty', () => {
    const input: EnrichedProjectData = {
      ...BASE_ENRICHED,
      verdict: { status: 'GREEN', summary: 'Looks good', fails: [], checkedConstraints: [] },
      businessRuleContext: {
        feasibilityAxes: [],
        unitCostRaw: null,
        costCeilingRaw: null,
      },
    };

    const alerts = extractAlerts(input);

    expect(alerts).toHaveLength(1);
    expect(alerts[0].title).toBe('Phantom Green');
  });

  // ---- Budget Exceeded ----

  it('should emit a RED "Budget Exceeded" alert when unit cost exceeds the cost ceiling', () => {
    const input: EnrichedProjectData = {
      ...BASE_ENRICHED,
      unitCostFormatted: '£2,500',
      costCeilingFormatted: '£2,000',
      businessRuleContext: {
        feasibilityAxes: [],
        unitCostRaw: 2500,
        costCeilingRaw: 2000,
      },
    };

    const alerts = extractAlerts(input);

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toEqual<PdfAlert>({
      severity: 'RED',
      title: 'Budget Exceeded',
      message: expect.stringContaining('£2,500'),
    });
    expect(alerts[0].message).toContain('£2,000');
  });

  it('should NOT emit a Budget Exceeded alert when unit cost is within the ceiling', () => {
    const input: EnrichedProjectData = {
      ...BASE_ENRICHED,
      unitCostFormatted: '£1,500',
      costCeilingFormatted: '£2,000',
      businessRuleContext: {
        feasibilityAxes: [],
        unitCostRaw: 1500,
        costCeilingRaw: 2000,
      },
    };

    const alerts = extractAlerts(input);

    expect(alerts.find((a) => a.title === 'Budget Exceeded')).toBeUndefined();
  });

  it('should NOT emit a Budget Exceeded alert when unit cost is null', () => {
    const input: EnrichedProjectData = {
      ...BASE_ENRICHED,
      unitCostFormatted: '—',
      costCeilingFormatted: '£2,000',
      businessRuleContext: {
        feasibilityAxes: [],
        unitCostRaw: null,
        costCeilingRaw: 2000,
      },
    };

    const alerts = extractAlerts(input);

    expect(alerts.find((a) => a.title === 'Budget Exceeded')).toBeUndefined();
  });

  it('should NOT emit a Budget Exceeded alert when cost ceiling is null', () => {
    const input: EnrichedProjectData = {
      ...BASE_ENRICHED,
      unitCostFormatted: '£2,500',
      costCeilingFormatted: '—',
      businessRuleContext: {
        feasibilityAxes: [],
        unitCostRaw: 2500,
        costCeilingRaw: null,
      },
    };

    const alerts = extractAlerts(input);

    expect(alerts.find((a) => a.title === 'Budget Exceeded')).toBeUndefined();
  });

  it('should NOT emit a Budget Exceeded alert when unit cost exactly equals the ceiling', () => {
    const input: EnrichedProjectData = {
      ...BASE_ENRICHED,
      unitCostFormatted: '£2,000',
      costCeilingFormatted: '£2,000',
      businessRuleContext: {
        feasibilityAxes: [],
        unitCostRaw: 2000,
        costCeilingRaw: 2000,
      },
    };

    const alerts = extractAlerts(input);

    expect(alerts.find((a) => a.title === 'Budget Exceeded')).toBeUndefined();
  });

  // ---- combined alerts ----

  it('should emit both Phantom Green and Budget Exceeded when both conditions hold', () => {
    const input: EnrichedProjectData = {
      ...BASE_ENRICHED,
      verdict: { status: 'GREEN', summary: 'All clear', fails: [], checkedConstraints: [] },
      unitCostFormatted: '£3,000',
      costCeilingFormatted: '£2,000',
      businessRuleContext: {
        feasibilityAxes: [
          { name: 'Mass', checked: false },
          { name: 'Cost', checked: false },
        ],
        unitCostRaw: 3000,
        costCeilingRaw: 2000,
      },
    };

    const alerts = extractAlerts(input);

    expect(alerts).toHaveLength(2);
    const titles = alerts.map((a) => a.title);
    expect(titles).toContain('Phantom Green');
    expect(titles).toContain('Budget Exceeded');
  });

  // ---- no alerts ----

  it('should return an empty array when no business rule conditions are triggered', () => {
    const input: EnrichedProjectData = {
      ...BASE_ENRICHED,
      verdict: { status: 'GREEN', summary: 'Good', fails: [], checkedConstraints: ['mass'] },
      unitCostFormatted: '£1,000',
      costCeilingFormatted: '£2,000',
      businessRuleContext: {
        feasibilityAxes: [
          { name: 'Mass', checked: true },
          { name: 'Volume', checked: true },
        ],
        unitCostRaw: 1000,
        costCeilingRaw: 2000,
      },
    };

    const alerts = extractAlerts(input);

    expect(alerts).toEqual([]);
  });
});
