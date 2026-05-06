// import removed
import { sanitizeText } from '../pipeline/02-sanitization';
import { HydratedProjectData } from '../types/raw-schema';

const BASE_HYDRATED: Pick<HydratedProjectData, 'modules' | 'bom' | 'suppliers' | 'regulatory' | 'brief' | 'failedCalculations' | 'unverifiedRegulatoryClaims' | 'requiredInputs' | 'nextActions' | 'batteryCalculation' | 'powerArchitecture'> = {
  brief: {
    subject: null, mission: null, useCase: null, targetCustomers: null, whyNow: null,
    unitCostCeilingGbp: null, maxMassKg: null, targetProcess: null, targetMaterial: null,
    toleranceTarget: null, quantityTarget: null, complianceNotes: null,
  },
  regulatory: [],
  modules: [],
  bom: [],
  suppliers: [],
  failedCalculations: [],
  unverifiedRegulatoryClaims: [],
  requiredInputs: [],
  nextActions: [],
  batteryCalculation: null,
  powerArchitecture: null,
};

describe('02-sanitization', () => {
  it('strips LLM telemetry lines', () => {
    const input = {
      project: { name: 'MISSING - Not found on website\nReal Project', revision: 'v1', shipped: false, foundryName: null },
      verdict: { status: 'GREEN' as const, summary: 'target provenance: website.com\nGood', fails: [], checkedConstraints: [] },
      ...BASE_HYDRATED,
    } satisfies Partial<HydratedProjectData> & Record<string, unknown>;

    const output = sanitizeText(input as unknown as HydratedProjectData);
    expect(output.project.name).toBe('Real Project');
    expect(output.verdict.summary).toBe('Good');
  });

  it('strips Markdown asterisks', () => {
    const input = {
      project: { name: '**Bold Project**', revision: 'v1', shipped: false, foundryName: null },
      verdict: { status: 'AMBER' as const, summary: 'This is *italic* and **bold**.', fails: [], checkedConstraints: [] },
      ...BASE_HYDRATED,
    } satisfies Partial<HydratedProjectData> & Record<string, unknown>;

    const output = sanitizeText(input as unknown as HydratedProjectData);
    expect(output.project.name).toBe('Bold Project');
    expect(output.verdict.summary).toBe('This is italic and bold.');
  });

  it('replaces Greek/math characters', () => {
    const input = {
      project: { name: 'Temp is 25°C', revision: 'v1', shipped: false, foundryName: null },
      verdict: { status: 'RED' as const, summary: 'Resistance is 10Ω, area is 5m²', fails: [], checkedConstraints: [] },
      ...BASE_HYDRATED,
    } satisfies Partial<HydratedProjectData> & Record<string, unknown>;

    const output = sanitizeText(input as unknown as HydratedProjectData);
    expect(output.project.name).toBe('Temp is 25degC');
    expect(output.verdict.summary).toBe('Resistance is 10ohms, area is 5m^2');
  });

  it('reverts overzealous LLM acronym expansions', () => {
    const input = {
      project: { name: 'Standard', revision: 'v1', shipped: false, foundryName: null },
      verdict: { status: 'GREEN' as const, summary: 'Complies with Deutsches Institut für Normung standards.', fails: [], checkedConstraints: [] },
      ...BASE_HYDRATED,
    } satisfies Partial<HydratedProjectData> & Record<string, unknown>;

    const output = sanitizeText(input as unknown as HydratedProjectData);
    expect(output.verdict.summary).toBe('Complies with DIN standards.');
  });

  it('strips LLM scratch-pad thoughts', () => {
    const input = {
      project: { name: 'Project', revision: 'v1', shipped: false, foundryName: null },
      verdict: { status: 'GREEN' as const, summary: 'We need to produce a single sentence summarizing the project.\nThe project is good.', fails: [], checkedConstraints: [] },
      ...BASE_HYDRATED,
    } satisfies Partial<HydratedProjectData> & Record<string, unknown>;

    const output = sanitizeText(input as unknown as HydratedProjectData);
    expect(output.verdict.summary).toBe('The project is good.');
  });

  it('recursively sanitizes arrays and objects', () => {
    const input = {
      project: { name: 'Project', revision: 'v1', shipped: false, foundryName: null },
      verdict: { status: 'GREEN' as const, summary: 'Summary', fails: [], checkedConstraints: [] },
      modules: [
        { name: '**Module 1**', massKg: 10, costGbp: 100, description: null, purpose: null, whyItMatters: null, imageUrl: null, keyParts: [], failureModes: [], unknowns: [], leadWeeks: null, mirrorOfName: null, budgetMassKg: null, leadTimeSource: null, riskMatrix: [], reviews: [] },
      ],
      bom: [
        { partNumber: 'PART-1', name: 'Part 1', material: '10Ω Resistor', sourceModuleName: null, isPurchased: false, process: null, massKg: null, estimatedUnitCostGbp: null, description: null },
      ],
      suppliers: [
        { supplier: 'Supplier °C', candidateProductSku: null, role: null, requiredCertification: null, certificationVerified: false, quoteReceived: false, priceBasis: null, moq: null, leadTimeBasis: null, ukEuSupport: false, integrationRisk: null, commercialRisk: null, sourceGrade: null, confidence: 0.9, nextAction: null },
      ],
    } satisfies Partial<HydratedProjectData> & Record<string, unknown>;

    const output = sanitizeText(input as unknown as HydratedProjectData);
    expect(output.modules[0].name).toBe('Module 1');
    expect(output.bom[0].material).toBe('10ohms Resistor');
    expect(output.suppliers[0].supplier).toBe('Supplier degC');
  });
});
