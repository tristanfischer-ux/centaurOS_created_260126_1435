import { PipelineState } from './types';

export interface ValidationResult {
  gate: string;
  passed: boolean;
  findings: string[];
}

/**
 * Gate 1: Feasibility — is sizing feasible? No INFEASIBLE-but-emitted.
 * @param state PipelineState
 * @returns ValidationResult
 */
export function checkFeasibility(state: PipelineState): ValidationResult {
  const findings: string[] = [];
  let passed = true;

  if (state.dimensionSheet) {
    if (state.dimensionSheet.feasible === false) {
      if (
        state.modules.some(m => state.parts.some(p => p.sourceModuleId === m.id)) ||
        state.costBreakdown
      ) {
        findings.push('INFEASIBLE-but-emitted: Sizing is not feasible but parts/costs are emitted.');
        passed = false;
      }
    }
  } else {
    findings.push('Warning: No sizing done (dimensionSheet is null).');
  }

  return {
    gate: 'Feasibility',
    passed,
    findings,
  };
}

/**
 * Gate 2: Cost Reality — does cost arithmetic close? Is it within realm?
 * @param state PipelineState
 * @returns ValidationResult
 */
export function checkCostReality(state: PipelineState): ValidationResult {
  const findings: string[] = [];
  let passed = true;

  if (!state.costBreakdown) {
    findings.push('Warning: costBreakdown is null.');
  } else {
    const { unitTotalGbp, perModule } = state.costBreakdown;
    
    if (unitTotalGbp <= 0) {
      findings.push('Fail: unitTotalGbp is 0 or negative.');
      passed = false;
    }
    
    if (unitTotalGbp > 1000000) {
      findings.push('Warning: unitTotalGbp > 1,000,000 (unusual for a startup product).');
    }
    
    const sumOfModules = perModule.reduce((sum, m) => sum + m.totalGbp, 0);
    const discrepancy = Math.abs(unitTotalGbp - sumOfModules);
    const tolerance = unitTotalGbp * 0.01;
    
    if (discrepancy > tolerance) {
      findings.push(`Fail: per-module costs sum (${sumOfModules}) does not match unitTotalGbp (${unitTotalGbp}) within 1%.`);
      passed = false;
    }
  }

  return {
    gate: 'Cost Reality',
    passed,
    findings,
  };
}

/**
 * Gate 3: Completeness — does every module have parts? Does every part have a cost?
 * @param state PipelineState
 * @returns ValidationResult
 */
export function checkCompleteness(state: PipelineState): ValidationResult {
  const findings: string[] = [];
  let passed = true;

  if (state.parts.length === 0) {
    findings.push('Fail: parts array is empty.');
    passed = false;
  }

  for (const mod of state.modules) {
    const moduleParts = state.parts.filter(p => p.sourceModuleId === mod.id);
    if (moduleParts.length === 0) {
      findings.push(`Fail: module ${mod.id} has 0 parts.`);
      passed = false;
    }
  }

  for (const part of state.parts) {
    if (part.estimatedUnitCostGbp === null || part.estimatedUnitCostGbp === undefined) {
      findings.push(`Warning: part ${part.id || part.partNumber} has null/undefined estimatedUnitCostGbp.`);
    }
    if (part.massKg === null || part.massKg === undefined) {
      findings.push(`Warning: part ${part.id || part.partNumber} has null/undefined massKg.`);
    }
  }

  return {
    gate: 'Completeness',
    passed,
    findings,
  };
}

/**
 * Run all three gates
 * @param state PipelineState
 * @returns ValidationResult[]
 */
export function runAllGates(state: PipelineState): ValidationResult[] {
  return [
    checkFeasibility(state),
    checkCostReality(state),
    checkCompleteness(state),
  ];
}
