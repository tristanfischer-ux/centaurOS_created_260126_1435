import { checkFeasibility, checkCostReality, checkCompleteness, runAllGates } from './validators';
import type { PipelineState, DimensionSheet } from './types';

describe('Validators', () => {
  function makeState(overrides: Partial<PipelineState> = {}): PipelineState {
    return {
      projectId: 'test',
      research: null,
      modules: [
        { 
          id: 'mod1', 
          name: 'Test Module', 
          purpose: 'Test', 
          inputs: [], 
          outputs: [], 
          keyParts: ['Part A'], 
          leadWeeks: 4, 
          description: 'Test', 
          whyItMatters: 'Test', 
          failureModes: [], 
          unknowns: [], 
          status: 'draft' 
        },
      ],
      dimensionSheet: null,
      parts: [
        { partNumber: 'MOD1-001', name: 'Part A', sourceModuleId: 'mod1', estimatedUnitCostGbp: 50, massKg: 1 },
      ],
      bomLines: [],
      costBreakdown: { 
        unitTotalGbp: 75, 
        ceilingGbp: 100, 
        perModule: [{ moduleName: 'Test Module', totalGbp: 75 }], 
        overheadMultiplier: 1.5, 
        nreTotalGbp: 750 
      },
      reviews: [],
      suppliers: [],
      proofreadFindings: null,
      sourceAttributions: [],
      llmAttributions: [],
      sectionScores: [],
      ...overrides,
    };
  }

  describe('checkFeasibility', () => {
    it('passes when dimensionSheet is null (no sizing done = warning, not failure)', () => {
      const state = makeState({ dimensionSheet: null });
      const result = checkFeasibility(state);
      expect(result.passed).toBe(true);
      expect(result.findings).toContain('Warning: No sizing done (dimensionSheet is null).');
    });

    it('fails when dimensionSheet.feasible=false AND parts/costs exist (INFEASIBLE-but-emitted)', () => {
      const state = makeState({ 
        dimensionSheet: { feasible: false, notes: '', components: [] } as unknown as DimensionSheet 
      });
      const result = checkFeasibility(state);
      expect(result.passed).toBe(false);
      expect(result.findings[0]).toContain('INFEASIBLE-but-emitted');
    });

    it('passes when dimensionSheet.feasible=true', () => {
      const state = makeState({ 
        dimensionSheet: { feasible: true, notes: '', components: [] } as unknown as DimensionSheet 
      });
      const result = checkFeasibility(state);
      expect(result.passed).toBe(true);
      expect(result.findings.length).toBe(0);
    });
  });

  describe('checkCostReality', () => {
    it('warns when costBreakdown is null', () => {
      const state = makeState({ costBreakdown: null });
      const result = checkCostReality(state);
      expect(result.passed).toBe(true);
      expect(result.findings).toContain('Warning: costBreakdown is null.');
    });

    it('fails when unitTotalGbp is 0', () => {
      const state = makeState({ 
        costBreakdown: { 
          unitTotalGbp: 0, 
          ceilingGbp: 100, 
          perModule: [], 
          overheadMultiplier: 1.5, 
          nreTotalGbp: 0 
        } 
      });
      const result = checkCostReality(state);
      expect(result.passed).toBe(false);
      expect(result.findings).toContain('Fail: unitTotalGbp is 0 or negative.');
    });

    it('fails when per-module sum does not match unitTotalGbp within 1%', () => {
      const state = makeState({ 
        costBreakdown: { 
          unitTotalGbp: 100, // Sum of perModule is 75, difference is 25, which is > 1% of 100
          ceilingGbp: 100, 
          perModule: [{ moduleName: 'Test Module', totalGbp: 75 }], 
          overheadMultiplier: 1.5, 
          nreTotalGbp: 0 
        } 
      });
      const result = checkCostReality(state);
      expect(result.passed).toBe(false);
      expect(result.findings[0]).toContain('does not match unitTotalGbp');
    });
  });

  describe('checkCompleteness', () => {
    it('fails when parts array is empty', () => {
      const state = makeState({ parts: [] });
      const result = checkCompleteness(state);
      expect(result.passed).toBe(false);
      expect(result.findings).toContain('Fail: parts array is empty.');
    });

    it('warns when any module has 0 parts (no longer a hard fail)', () => {
      const state = makeState({ 
        modules: [
          { id: 'mod1', name: 'Mod 1', purpose: '', inputs: [], outputs: [], keyParts: [], leadWeeks: 1, description: '', whyItMatters: '', failureModes: [], unknowns: [], status: 'draft' },
          { id: 'mod2', name: 'Mod 2', purpose: '', inputs: [], outputs: [], keyParts: [], leadWeeks: 1, description: '', whyItMatters: '', failureModes: [], unknowns: [], status: 'draft' }
        ],
        parts: [
          { partNumber: 'MOD1-001', name: 'Part A', sourceModuleId: 'mod1', estimatedUnitCostGbp: 50, massKg: 1 }
        ]
      });
      const result = checkCompleteness(state);
      expect(result.passed).toBe(true);
      expect(result.findings).toContain('Warning: module mod2 has 0 parts — BOM generation may have missed this module.');
    });
  });

  describe('runAllGates', () => {
    it('runs all gates and returns results array', () => {
      const state = makeState();
      const results = runAllGates(state);
      expect(results.length).toBe(3);
      expect(results[0].gate).toBe('Feasibility');
      expect(results[1].gate).toBe('Cost Reality');
      expect(results[2].gate).toBe('Completeness');
    });
  });
});