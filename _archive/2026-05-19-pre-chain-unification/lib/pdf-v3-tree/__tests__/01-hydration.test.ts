import { hydrateAndCoerce } from '../pipeline/01-hydration';
import { PdfPipelineError } from '../errors/pdf-pipeline-error';

describe('01-hydration', () => {
  it('should coerce stringified PostgREST numeric fields to finite numbers', () => {
    const rawDbObject = {
      project: {
        name: 'Test Project',
      },
      brief: {
        unitCostCeilingGbp: '1000',
        maxMassKg: '100',
      },
      verdict: {
        status: 'GREEN',
      },
      modules: [
        {
          name: 'Module 1',
          massKg: '10.500',
          costGbp: '123.45',
        },
        {
          name: 'Module 2',
          massKg: 'invalid', // should become null
          costGbp: null,
        }
      ],
      // Missing optional fields: bom, suppliers
    };

    const hydrated = hydrateAndCoerce(rawDbObject);

    expect(hydrated.project.name).toBe('Test Project');
    expect(hydrated.project.revision).toBe('v1.0'); // defaults
    expect(hydrated.project.shipped).toBe(false);

    expect(hydrated.verdict.status).toBe('GREEN');
    expect(hydrated.verdict.fails).toEqual([]);
    expect(hydrated.verdict.checkedConstraints).toEqual([]);

    expect(hydrated.modules).toHaveLength(2);
    expect(hydrated.modules[0].massKg).toBe(10.5);
    expect(hydrated.modules[0].costGbp).toBe(123.45);
    // New fields should have default values
    expect(hydrated.modules[0].description).toBeNull();
    expect(hydrated.modules[0].purpose).toBeNull();
    expect(hydrated.modules[0].imageUrl).toBeNull();
    expect(hydrated.modules[0].keyParts).toEqual([]);
    expect(hydrated.modules[0].failureModes).toEqual([]);
    expect(hydrated.modules[0].unknowns).toEqual([]);
    
    expect(hydrated.modules[1].massKg).toBeNull();
    expect(hydrated.modules[1].costGbp).toBeNull();

    expect(hydrated.bom).toEqual([]);
    expect(hydrated.suppliers).toEqual([]);
  });

  it('should coerce stringified BOM numeric fields', () => {
    const rawDbObject = {
      project: { name: 'Test Project' },
      brief: {
        unitCostCeilingGbp: '1000',
        maxMassKg: '100',
      },
      verdict: { status: 'AMBER' },
      modules: [],
      bom: [
        {
          partNumber: 'BAT-01',
          name: 'Battery Cell',
          material: 'Lithium',
          massKg: '12.500',
          estimatedUnitCostGbp: '450.00',
        },
      ],
      suppliers: [],
    };

    const hydrated = hydrateAndCoerce(rawDbObject);

    expect(hydrated.bom).toHaveLength(1);
    expect(hydrated.bom[0].partNumber).toBe('BAT-01');
    expect(hydrated.bom[0].name).toBe('Battery Cell');
    expect(hydrated.bom[0].massKg).toBe(12.5);
    expect(hydrated.bom[0].estimatedUnitCostGbp).toBe(450);
    expect(hydrated.bom[0].isPurchased).toBe(false); // default
    expect(hydrated.bom[0].sourceModuleName).toBeNull(); // default
  });

  it('should coerce stringified supplier numeric fields', () => {
    const rawDbObject = {
      project: { name: 'Test Project' },
      brief: {
        unitCostCeilingGbp: '1000',
        maxMassKg: '100',
      },
      verdict: { status: 'GREEN' },
      modules: [],
      bom: [],
      suppliers: [
        {
          supplier: 'Acme Ltd',
          candidateProductSku: 'SKU-123',
          role: 'Primary',
          requiredCertification: 'ISO9001',
          certificationVerified: true,
          quoteReceived: false,
          priceBasis: 'Estimated',
          moq: '100',
          leadTimeBasis: 'Standard',
          ukEuSupport: true,
          integrationRisk: 'Low',
          commercialRisk: 'Medium',
          sourceGrade: 'A',
          confidence: '0.95',
          nextAction: 'Contact',
        },
      ],
    };

    const hydrated = hydrateAndCoerce(rawDbObject);

    expect(hydrated.suppliers).toHaveLength(1);
    expect(hydrated.suppliers[0].supplier).toBe('Acme Ltd');
    expect(hydrated.suppliers[0].candidateProductSku).toBe('SKU-123');
    expect(hydrated.suppliers[0].role).toBe('Primary');
    expect(hydrated.suppliers[0].requiredCertification).toBe('ISO9001');
    expect(hydrated.suppliers[0].certificationVerified).toBe(true);
    expect(hydrated.suppliers[0].quoteReceived).toBe(false);
    expect(hydrated.suppliers[0].priceBasis).toBe('Estimated');
    expect(hydrated.suppliers[0].moq).toBe('100');
    expect(hydrated.suppliers[0].leadTimeBasis).toBe('Standard');
    expect(hydrated.suppliers[0].ukEuSupport).toBe(true);
    expect(hydrated.suppliers[0].integrationRisk).toBe('Low');
    expect(hydrated.suppliers[0].commercialRisk).toBe('Medium');
    expect(hydrated.suppliers[0].sourceGrade).toBe('A');
    expect(hydrated.suppliers[0].confidence).toBe(0.95);
    expect(hydrated.suppliers[0].nextAction).toBe('Contact');
  });

  it('should throw PdfPipelineError when critical data is missing', () => {
    const rawDbObject = {
      // missing project
    };

    expect(() => hydrateAndCoerce(rawDbObject)).toThrow(PdfPipelineError);
    expect(() => hydrateAndCoerce(rawDbObject)).toThrow(/Hydration failed/);
  });
});
