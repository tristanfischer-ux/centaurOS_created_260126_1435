import { Part, BomLine, CostBreakdown, CostBreakdownPA, CostOverheadLine, CostReductionPath, DOMAIN_OVERHEAD, RegulatoryItem } from './types';
import { computeNreItemsFromRegulatory } from './lib/nre-from-regulatory';

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

// ── PA Stage 7b — extended cost computation ──────────────────────────────────

/**
 * PA Stage 7b variant of calculateCost().  Returns CostBreakdownPA — all the
 * legacy fields PLUS the new renderer-required fields:
 *   - overheadLines[]  — named overhead lines (assembly, test, shipping, etc.)
 *   - perModulePA[]    — per-module rows with pctOfBom + grade
 *   - nreItems[]       — individual NRE activities (one per regulatory standard)
 *   - reductionPaths[] — static cost reduction suggestions based on domain
 *   - ceilingExceededBanner — populated when unit cost > ceiling, null otherwise
 *
 * Only called when PA_PIPELINE=true.  The legacy calculateCost() is untouched.
 */
export function calculateCostPA(
  parts: Part[],
  bomLines: BomLine[] | undefined,
  domain: string,
  ceilingGbp: number | null,
  batchSize: number = 25,
  regulatory: RegulatoryItem[] = [],
): CostBreakdownPA {
  // 1. Compute the base breakdown using the existing function.
  const base = calculateCost(parts, bomLines, domain, ceilingGbp, batchSize);
  const rawBom = base.rawBomCostGbp ?? base.unitTotalGbp / (base.overheadMultiplier || 1.5);

  // 2. Build named overhead lines from the overhead multiplier.
  //    The multiplier = 1 + assembly% + test% + overhead% + contingency%.
  //    We decompose it into explicit named lines matching the BESS reference.
  //    BLOCKER-D2-1 FIX: pass unitTotalGbp so the function can validate sum.
  const overheadLines: CostOverheadLine[] = _buildOverheadLines(rawBom, base.overheadMultiplier, domain, base.unitTotalGbp);

  // 3. Build per-module rows with % of BOM and source grade.
  const totalBomForPct = base.perModule.reduce((s, m) => s + m.totalGbp, 0) || 1;
  const perModulePA = base.perModule.map(m => ({
    moduleName: m.moduleName,
    totalGbp: m.totalGbp,
    pctOfBom: Math.round((m.totalGbp / totalBomForPct) * 1000) / 10, // one decimal
    grade: 'D', // engineering estimate — matches existing cost-model grade baseline
  }));

  // 4. NRE items from regulatory matrix (Grade C — published benchmark costs).
  const nreItems = computeNreItemsFromRegulatory(regulatory, domain);

  // 5. Static cost reduction paths (domain-aware).
  const reductionPaths = _buildReductionPaths(domain, rawBom);

  // 6. Ceiling exceeded banner — only when unit cost > ceiling.
  let ceilingExceededBanner: string | null = null;
  if (ceilingGbp !== null && ceilingGbp > 0 && base.unitTotalGbp > ceilingGbp) {
    const overBy = base.unitTotalGbp - ceilingGbp;
    const overByPct = ((overBy / ceilingGbp) * 100).toFixed(1);
    ceilingExceededBanner =
      `Estimated unit cost: ${formatGbp(base.unitTotalGbp)} | ` +
      `Target ceiling: ${formatGbp(ceilingGbp)} | ` +
      `Overshoot: ${formatGbp(overBy)} (${overByPct}%). ` +
      `See Cost Reduction Paths below for options to bring the unit cost within the target ceiling.`;
  }

  return {
    ...base,
    overheadLines,
    perModulePA,
    nreItems,
    reductionPaths,
    ceilingExceededBanner,
  };
}

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * Decompose the overhead multiplier into explicit named lines.
 * The BESS reference example:
 *   BOM Total, Assembly Labour 15%, Factory Testing (flat), Shipping (flat),
 *   Overheads 8%, Contingency 10% → ESTIMATED UNIT COST
 *
 * BLOCKER-D2-1 FIX: the `multiplier` parameter was previously ignored —
 * the function used hardcoded RATE_SPEC rates and the 6 lines did not sum to
 * `unitTotalGbp`. Fix: the overhead budget above BOM is exactly
 * `unitTotalGbp - rawBomGbp`. We decompose this budget proportionally using
 * RATE_SPEC weight fractions, then assign any rounding residual to the last
 * non-BOM line so the table always reconciles. Throws if the sum diverges by
 * more than £1 after reconciliation (catches future drift).
 */
function _buildOverheadLines(rawBomGbp: number, multiplier: number, domain: string, unitTotalGbp: number): CostOverheadLine[] {
  // Domain-specific overhead decomposition weight ratios.
  // These determine how the overhead budget is split across the named lines.
  // They do NOT determine the amounts independently — the actual overhead
  // budget is derived from unitTotalGbp so lines always sum to the total.
  type RateSpec = { assemblyPct: number; testingFlat: number; shippingFlat: number; overheadsPct: number; contingencyPct: number };

  const RATE_SPEC: Record<string, RateSpec> = {
    battery_energy_storage: { assemblyPct: 0.15, testingFlat: 8_000, shippingFlat: 3_500, overheadsPct: 0.08, contingencyPct: 0.10 },
    heat_pump:              { assemblyPct: 0.12, testingFlat: 2_500, shippingFlat: 1_500, overheadsPct: 0.08, contingencyPct: 0.08 },
    vertical_farm:          { assemblyPct: 0.10, testingFlat: 1_500, shippingFlat: 1_000, overheadsPct: 0.07, contingencyPct: 0.07 },
    aerospace:              { assemblyPct: 0.25, testingFlat: 15_000, shippingFlat: 5_000, overheadsPct: 0.12, contingencyPct: 0.15 },
    medical:                { assemblyPct: 0.20, testingFlat: 12_000, shippingFlat: 4_000, overheadsPct: 0.10, contingencyPct: 0.12 },
    default:                { assemblyPct: 0.15, testingFlat: 5_000, shippingFlat: 2_000, overheadsPct: 0.08, contingencyPct: 0.10 },
  };

  const spec = RATE_SPEC[domain] ?? RATE_SPEC.default;

  // The total overhead above BOM is the authoritative budget.
  const overheadBudget = unitTotalGbp - rawBomGbp;

  // Compute indicative amounts from RATE_SPEC proportions (unscaled).
  const assemblyRaw = rawBomGbp * spec.assemblyPct;
  const testingRaw  = spec.testingFlat;
  const shippingRaw = spec.shippingFlat;
  const overheadsRaw = rawBomGbp * spec.overheadsPct;
  const contingencyRaw = (rawBomGbp + assemblyRaw + testingRaw + shippingRaw + overheadsRaw) * spec.contingencyPct;

  const rawSum = assemblyRaw + testingRaw + shippingRaw + overheadsRaw + contingencyRaw;

  // Scale all lines so that they sum to overheadBudget exactly.
  const scale = rawSum > 0 ? overheadBudget / rawSum : 0;

  const assemblyGbp   = Math.round(assemblyRaw   * scale);
  const testingGbp    = Math.round(testingRaw    * scale);
  const shippingGbp   = Math.round(shippingRaw   * scale);
  const overheadsGbp  = Math.round(overheadsRaw  * scale);
  // Assign any rounding residual to contingency so lines sum exactly.
  const contingencyGbp = overheadBudget - assemblyGbp - testingGbp - shippingGbp - overheadsGbp;

  const lines: CostOverheadLine[] = [
    { label: 'BOM Total', gbp: rawBomGbp },
    { label: `Assembly Labour (${Math.round(spec.assemblyPct * 100)}% of BOM)`, gbp: assemblyGbp },
    { label: 'Factory Testing', gbp: testingGbp },
    { label: 'Shipping and Logistics', gbp: shippingGbp },
    { label: `Overheads (${Math.round(spec.overheadsPct * 100)}% of BOM)`, gbp: overheadsGbp },
    { label: `Contingency (${Math.round(spec.contingencyPct * 100)}%)`, gbp: contingencyGbp },
  ];

  // Validate that lines sum to unitTotalGbp within £1 rounding tolerance.
  // Throws to surface future drift rather than silently producing a bad table.
  const lineSum = lines.reduce((s, l) => s + l.gbp, 0);
  const diff = Math.abs(lineSum - unitTotalGbp);
  if (diff > 1) {
    throw new Error(
      `_buildOverheadLines: line sum £${lineSum.toFixed(2)} diverges from unitTotalGbp £${unitTotalGbp.toFixed(2)} by £${diff.toFixed(2)} (tolerance £1). ` +
      `domain=${domain}, multiplier=${multiplier}, rawBom=${rawBomGbp.toFixed(2)}`
    );
  }

  return lines;
}

/**
 * Domain-aware cost reduction suggestions.
 * Returns at least 3 paths — the renderer displays them in the Cost section.
 */
function _buildReductionPaths(domain: string, rawBomGbp: number): CostReductionPath[] {
  type PathDef = Omit<CostReductionPath, 'savingGbp'> & { savingFraction: number };

  const PATHS: Record<string, PathDef[]> = {
    battery_energy_storage: [
      { option: 'Switch cell chemistry to CATL LFP Grade B cells at volume', savingFraction: 0.15, tradeoff: 'Slightly lower cycle life (3,500 vs 4,000 cycles). Acceptable for C&I grid dispatch.', feasible: 'At volume' },
      { option: 'Consolidate BMS and PCS into a single integrated unit (BESS-in-a-box)', savingFraction: 0.12, tradeoff: 'Reduces BOM by eliminating inter-module cabling and separate housings. Integration complexity increases.', feasible: 'Maybe' },
      { option: 'Increase batch size from 25 to 100 units to unlock volume pricing', savingFraction: 0.18, tradeoff: 'Requires committed purchase order and warehouse space. Lead time increases to 16 weeks.', feasible: 'At volume' },
      { option: 'Outsource thermal management to third-party supplier instead of custom design', savingFraction: 0.08, tradeoff: 'Reduces custom tooling NRE. Limits differentiation on thermal performance.', feasible: 'Yes' },
    ],
    heat_pump: [
      { option: 'Use R290 scroll compressor from Panasonic instead of custom compressor', savingFraction: 0.20, tradeoff: 'Standard compressor limits custom COP tuning. Off-the-shelf saves NRE on refrigerant circuit qualification.', feasible: 'Yes' },
      { option: 'Increase production volume to 500 units/year for OEM pricing', savingFraction: 0.15, tradeoff: 'Requires confirmed demand. Reduces unit cost significantly on all major components.', feasible: 'At volume' },
      { option: 'Source hydronic components from Poland instead of Germany (EN certified)', savingFraction: 0.10, tradeoff: 'Same EN 378 certification. Lead time may increase by 2–4 weeks.', feasible: 'Yes' },
    ],
    vertical_farm: [
      { option: 'Standardise lighting to a single LED module type across all growth tiers', savingFraction: 0.12, tradeoff: 'Reduces SKU count but limits spectrum tuning by crop type.', feasible: 'Yes' },
      { option: 'Use commodity racking (standard pallet racking with grow-tray adapters)', savingFraction: 0.15, tradeoff: 'Lower initial cost. Structural loads must be re-verified for dynamic irrigation weight.', feasible: 'Maybe' },
      { option: 'Centralise nutrient dosing rather than per-tier dosing', savingFraction: 0.08, tradeoff: 'Reduces pump and sensor count. Requires homogeneous crop species across tiers.', feasible: 'Yes' },
    ],
    default: [
      { option: 'Consolidate sub-assemblies to reduce part count and assembly time', savingFraction: 0.10, tradeoff: 'Requires design-for-manufacturing review. May increase lead time for integration testing.', feasible: 'Maybe' },
      { option: 'Increase batch size to qualify for volume pricing tiers', savingFraction: 0.15, tradeoff: 'Requires committed purchase orders. Improves cost but increases inventory risk.', feasible: 'At volume' },
      { option: 'Source equivalent components from lower-cost certified suppliers', savingFraction: 0.08, tradeoff: 'Qualification testing required for each alternative supplier. Schedule risk of 4–8 weeks.', feasible: 'Maybe' },
    ],
  };

  // BLOCKER-D2-2 FIX: replaced `Math.round(rawBomGbp * savingFraction / 100) * 100`
  // which rounded to nearest £100 (divides by 100 BEFORE multiplying back).
  // For rawBom=£247,800 and savingFraction=0.05, old formula gives £12,400 (£100
  // precision) instead of the correct £12,390.00. New formula:
  //   Math.round(rawBomGbp * savingFraction * 100) / 100
  // multiplies first (preserves pence) then divides last (rounds to penny).
  const paths = (PATHS[domain] ?? PATHS.default).map(({ savingFraction, ...rest }): CostReductionPath => ({
    ...rest,
    savingGbp: `~${formatGbp(Math.round(rawBomGbp * savingFraction * 100) / 100)}`,
  }));

  return paths;
}
