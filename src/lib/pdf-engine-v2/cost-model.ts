import { Part, CostBreakdown, DOMAIN_OVERHEAD } from './types';

/**
 * Sum all parts in a module
 * @param parts Array of parts
 * @param moduleId The module ID to sum
 * @returns Total cost of parts in the module
 */
export function moduleCost(parts: Part[], moduleId: string): number {
  return parts
    .filter(p => p.sourceModuleId === moduleId)
    .reduce((sum, p) => sum + (p.estimatedUnitCostGbp ?? 0), 0);
}

/**
 * Calculate cost breakdown from BOM parts
 * @param parts Array of all parts in the BOM
 * @param domain The domain of the product
 * @param ceilingGbp The target cost ceiling, if any
 * @returns CostBreakdown
 */
export function calculateCost(
  parts: Part[],
  domain: string,
  ceilingGbp: number | null
): CostBreakdown {
  const domainKey = DOMAIN_OVERHEAD[domain] ? domain : 'default';
  const overhead = DOMAIN_OVERHEAD[domainKey] || DOMAIN_OVERHEAD.default;

  // Group parts by sourceModuleId
  const partsByModule = new Map<string, Part[]>();
  const moduleNames = new Map<string, string>();

  for (const part of parts) {
    const mId = part.sourceModuleId || 'unassigned';
    if (!partsByModule.has(mId)) {
      partsByModule.set(mId, []);
      moduleNames.set(mId, mId === 'unassigned' ? 'Unassigned Module' : `Module ${mId}`);
    }
    partsByModule.get(mId)!.push(part);
  }

  let unitTotalGbp = 0;
  const perModule: Array<{ moduleName: string; totalGbp: number }> = [];

  for (const [mId, moduleParts] of partsByModule.entries()) {
    // 1. sum each module's parts
    const baseModuleCost = moduleParts.reduce((sum, p) => sum + (p.estimatedUnitCostGbp ?? 0), 0);
    // 3. apply multiplier to each module total
    const totalGbp = baseModuleCost * overhead.multiplier;
    
    perModule.push({ moduleName: moduleNames.get(mId) || mId, totalGbp });
    
    // 5. unit total = sum of all module totals
    unitTotalGbp += totalGbp;
  }

  // 4. Calculate NRE
  const moduleCount = partsByModule.size;
  const nreTotalGbp = moduleCount * overhead.nreRate * 5000;

  // 6. Return CostBreakdown
  return {
    unitTotalGbp,
    ceilingGbp,
    perModule,
    overheadMultiplier: overhead.multiplier,
    nreTotalGbp,
  };
}

/**
 * Check if cost exceeds ceiling
 * @param breakdown The cost breakdown to check
 * @returns Object with exceeds flag and gap percentage, or null if no ceiling
 */
export function checkCostCeiling(breakdown: CostBreakdown): { exceeds: boolean; gapPct: number } | null {
  if (breakdown.ceilingGbp === null || breakdown.ceilingGbp === 0) return null;
  const exceeds = breakdown.unitTotalGbp > breakdown.ceilingGbp;
  const gapPct = ((breakdown.unitTotalGbp - breakdown.ceilingGbp) / breakdown.ceilingGbp) * 100;
  return { exceeds, gapPct };
}

/**
 * Format cost for display
 * @param amount Cost amount
 * @returns Formatted string (e.g. "£1,234.56")
 */
export function formatGbp(amount: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(amount);
}
