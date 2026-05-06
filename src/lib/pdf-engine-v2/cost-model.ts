import { Part, BomLine, CostBreakdown, DOMAIN_OVERHEAD } from './types';

// B1b FIX (2026-05-06): base NRE per module by product domain. Previous
// 5000/module default was absurdly low (8 modules × 0.15 × £5,000 = £6,000
// total for a BESS, whereas the reference report breaks down £355k of NRE:
// UL 9540A £100k + G99 £60k + IEC 62619 £40k + firmware £35k + tooling £25k).
// These values are still approximations but at least put the headline in the
// right order of magnitude pending the proper regulatory-cost E2 work.
const BASE_NRE_PER_MODULE_GBP: Record<string, number> = {
  battery_energy_storage: 20000, // heavy regulatory: UL 9540A, G99, IEC 62619
  heat_pump: 8000,               // EN 378 + PED + MCS
  vertical_farm: 3000,           // lighter regulatory
  aerospace: 40000,              // AS9100 + DO-160 etc.
  medical: 30000,                // MDR / 510(k)
  vehicle: 25000,                // ECE regulations + crash
  default: 5000,
}

/**
 * Sum all parts in a module, counting BOM line quantities. Returns the
 * rolled cost (qty × unit cost) for parts whose sourceModuleId matches.
 */
export function moduleCost(
  parts: Part[],
  bomLines: BomLine[] | undefined,
  moduleId: string,
): number {
  return parts
    .filter(p => p.sourceModuleId === moduleId)
    .reduce((sum, p) => {
      const qty = resolveQuantity(p, bomLines)
      return sum + (p.estimatedUnitCostGbp ?? 0) * qty
    }, 0);
}

/**
 * Look up the quantity of a part from the BOM lines. Falls back to 1 when
 * no bomLine references the part. This is the single source of truth for
 * part quantity across cost rollup, module subtotal, and PDF rendering.
 */
export function resolveQuantity(part: Part, bomLines: BomLine[] | undefined): number {
  if (!bomLines || bomLines.length === 0) return 1
  let total = 0
  for (const bl of bomLines) {
    if (bl.childPartId === part.partNumber || bl.childPartId === part.id) {
      total += bl.quantity || 0
    }
  }
  return total > 0 ? total : 1
}

/**
 * Calculate cost breakdown from BOM parts + BOM lines (for quantities).
 */
export function calculateCost(
  parts: Part[],
  bomLines: BomLine[] | undefined,
  domain: string,
  ceilingGbp: number | null,
  batchSize: number = 25,
): CostBreakdown {
  const domainKey = DOMAIN_OVERHEAD[domain] ? domain : 'default';
  const overhead = DOMAIN_OVERHEAD[domainKey] || DOMAIN_OVERHEAD.default;
  const baseNre = BASE_NRE_PER_MODULE_GBP[domainKey] || BASE_NRE_PER_MODULE_GBP.default;

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
  let rawBomCostGbp = 0;
  const perModule: Array<{ moduleName: string; totalGbp: number }> = [];

  for (const [mId, moduleParts] of partsByModule.entries()) {
    // Sum each module's parts counting BOM quantity.
    const baseModuleCost = moduleParts.reduce((sum, p) => {
      const qty = resolveQuantity(p, bomLines)
      return sum + (p.estimatedUnitCostGbp ?? 0) * qty
    }, 0);
    // Apply overhead multiplier (labour, assembly, test, factory cost)
    const totalGbp = baseModuleCost * overhead.multiplier;

    perModule.push({ moduleName: moduleNames.get(mId) || mId, totalGbp });

    rawBomCostGbp += baseModuleCost
    unitTotalGbp += totalGbp;
  }

  // NRE: domain-aware base per module, amortised over the batch.
  const moduleCount = partsByModule.size;
  const nreTotalGbp = moduleCount * baseNre;

  return {
    unitTotalGbp,
    rawBomCostGbp,
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
