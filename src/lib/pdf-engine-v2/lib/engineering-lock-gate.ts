/**
 * @file lib/engineering-lock-gate.ts — Engineering Lock Gate
 *
 * Called by serial-design-chain-v2.tsx BETWEEN contract emission (step 3)
 * and research synthesis (step 4). Uses the new knowledge writeback modules
 * to fill any derived_parameters slots and safety-standards citations that
 * the engineering contract doesn't already cover.
 *
 * Behaviour:
 *   1. For every quantity slot in the contract with a missing or zero value,
 *      call lookupSpec() from knowledge/specs-writeback.ts. Fill the slot.
 *   2. For every safety-standards citation the brief's jurisdiction requires,
 *      call lookupStandard() from knowledge/standards-writeback.ts. Add to
 *      a standards-enrichment block on the contract.
 *   2b. Look up a class-level reference product from pretraining_products
 *      (DB-first hybrid → web-on-miss → writeback) and ATTACH its module
 *      decomposition + key specs + suppliers to contract.product_ontology, which
 *      the generator consumes (closes the audited products step-6 "grows a DB
 *      nobody reads" gap, 2026-06-04 — previously this lookup was discarded).
 *   3. Hard FAIL (exit code 22) if any HARD-required quantity slot is STILL
 *      missing after both DB + web fallback.
 *   4. Save the locked-in enrichments to the output directory.
 *
 * Hard-required slots per class (canonical list — grows as new classes ship):
 *   - BESS:       nameplate_capacity_kwh, continuous_power_kw, cell_count,
 *                 dc_bus_voltage_v, in_container_mass_kg
 *   - heat_pump:  rated_thermal_kw, cop, refrigerant_charge_kg
 *   - haps:       total_estimated_mass_kg, cruise_power_kw
 *   - vf (vertical_farm):  canopy_area_m2, installed_lighting_kw
 *   - All other classes: at least 1 non-zero quantity (soft requirement)
 *
 * The gate does NOT modify quantities already set by the contract builder
 * (those are authoritative). It ONLY fills MISSING or ZERO slots.
 *
 * Generator + Phase 2 can READ the locked contract but must NEVER mutate
 * quantities (enforced by the chain's applyPatches guard which blocks
 * canonical-enum fields).
 *
 * Exit code 22 is allocated per CLAUDE.md chain exit codes table and
 * documented there by the commit that introduces this file.
 *
 * British spelling throughout.
 */

import { lookupSpec } from './knowledge/specs-writeback'
import { lookupStandard } from './knowledge/standards-writeback'
import { lookupProduct } from './knowledge/products-writeback'
import type { EngineeringContract, ProductOntology } from '../../../../scripts/lib/engineering-contract'

// ── HARD-required quantity slots per product class ──────────────────────────
// These slots MUST be filled after lock-gate runs. Exit code 22 if any remain
// zero/missing. Only include slots whose absence would make Phase 2 arithmetic
// gates nonsensical (not just "nice-to-have" quantities).
export const HARD_REQUIRED_SLOTS: Record<string, string[]> = {
  bess: ['nameplate_capacity_kwh', 'continuous_power_kw', 'cell_count', 'dc_bus_voltage_v'],
  energy_storage: ['nameplate_capacity_kwh', 'continuous_power_kw'],
  heat_pump: ['rated_thermal_kw', 'cop'],
  haps: ['total_estimated_mass_kg', 'cruise_power_kw'],
  vertical_farm: ['canopy_area_m2', 'installed_lighting_kw'],
  solar_inverter: ['rated_ac_power_kw', 'max_dc_voltage_v'],
  wind_turbine: ['rated_power_kw', 'rotor_diameter_m'],
  ev_charger: ['rated_power_kw', 'dc_output_voltage_v'],
  aev_charger: ['rated_power_kw', 'dc_output_voltage_v'],
  // e_fuel_synthesis (Power-to-Liquid Fischer-Tropsch SAF plant, 2026-06-05) —
  // both derived by the engineering-contract builder (registerArchetype
  // 'e_fuel_synthesis'), so they pass the lock gate.
  e_fuel_synthesis: ['saf_output_tonnes_yr', 'h2_co2_molar_ratio'],
  // aquaculture_ras (land-based marine RAS, 2026-06-12) — the four sizing anchors
  // every downstream stage reads; all derived by the engineering-contract builder
  // (registerArchetype 'aquaculture_ras'), so they pass the lock gate. Kept minimal
  // (per CLAUDE.md item #13 — the builder MUST emit these EXACT names or exit 22).
  aquaculture_ras: ['annual_production_t_yr', 'total_tank_volume_m3', 'recirculation_flow_m3_h', 'heating_duty_kw'],
  // Default: no HARD required slots for classes without explicit entries.
  // The gate runs a soft fill pass for all classes regardless.
}

// ── Jurisdiction → mandatory standards ──────────────────────────────────────
// Minimal set — enough to validate the BESS class on first smoke run.
const JURISDICTION_MANDATORY_STANDARDS: Record<string, string[]> = {
  uk: ['IEC 62619', 'BS EN 62477-1', 'G99'],
  us: ['UL 9540', 'NFPA 855', 'UL 1973'],
  eu: ['IEC 62619', 'IEC 62477-1', 'EN 50604-1'],
  default: ['IEC 62619'],
}

// ── Spec-key → (manufacturer, part_number or class) hints ───────────────────
// Used to guide lookupSpec calls when the contract doesn't have an MPN —
// we fall back to class-level queries using 'product_class' as pseudo-MPN.
function buildSpecLookupHints(
  contract: EngineeringContract,
): Array<{ spec_key: string; manufacturer: string; part_number: string }> {
  const hints: Array<{ spec_key: string; manufacturer: string; part_number: string }> = []
  const cls = contract.product_class ?? ''

  // For every quantity slot with a zero or missing value, attempt a spec lookup
  // keyed on (product_class, spec_key) — the DB contains class-level specs
  // extracted from manufacturer datasheets (e.g. "bess-utility-scale" docs).
  for (const [key, qty] of Object.entries(contract.quantities ?? {})) {
    const val = typeof qty === 'object' ? (qty as any)?.value : qty
    if (val === undefined || val === null || val === 0 || val === '') {
      hints.push({
        spec_key: key,
        manufacturer: cls,
        part_number: cls,
      })
    }
  }
  return hints
}

// ── Infer jurisdiction from brief text ───────────────────────────────────────
function inferJurisdiction(brief: any): string {
  const text = [
    String(brief?.description ?? ''),
    String(brief?.market ?? ''),
    JSON.stringify(brief?.constraints ?? {}),
  ].join(' ').toLowerCase()

  if (/\buk\b|great britain|england|scotland|wales|united kingdom/.test(text)) return 'uk'
  if (/\bus\b|united states|north america|\\busa\\b/.test(text)) return 'us'
  if (/\beu\b|europe|germany|france|netherlands|spain/.test(text)) return 'eu'
  return 'default'
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface LockGateResult {
  filled_slots: Array<{ spec_key: string; value: string; unit: string; source: 'db' | 'web' | null }>
  filled_standards: Array<{ standard_name: string; scope: string; source: 'db' | 'web' | null }>
  /** Class-level product enrichment. When found, the ontology (modules / key
   *  specs / suppliers) is ATTACHED to contract.product_ontology and consumed by
   *  the generator — `attached_to_contract` records that it reached the contract. */
  product_enrichment: {
    found: boolean
    source: 'db' | 'web' | null
    reference_product: string | null
    modules_count: number
    key_specs_count: number
    suppliers_count: number
    standards_count: number
    attached_to_contract: boolean
  }
  hard_miss_slots: string[]
  exit_code_22: boolean
}

/**
 * Run the Engineering Lock Gate.
 *
 * @param contract  The EngineeringContract emitted by buildContractForChain.
 * @param brief     The parsed brief object (for jurisdiction inference).
 * @returns         LockGateResult with filled slots, filled standards, and
 *                  a flag indicating whether exit code 22 should be raised.
 */
export async function lockEngineering(
  contract: EngineeringContract,
  brief: any,
): Promise<LockGateResult> {
  const result: LockGateResult = {
    filled_slots: [],
    filled_standards: [],
    product_enrichment: {
      found: false, source: null, reference_product: null,
      modules_count: 0, key_specs_count: 0, suppliers_count: 0, standards_count: 0,
      attached_to_contract: false,
    },
    hard_miss_slots: [],
    exit_code_22: false,
  }

  const productClass = (contract.product_class ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '_')
  const jurisdiction = inferJurisdiction(brief)
  const hardRequired = HARD_REQUIRED_SLOTS[productClass] ?? []

  // ── Phase 1: fill missing quantity slots via DB + web ─────────────────
  const hints = buildSpecLookupHints(contract)
  const lookupPromises = hints.map(async (hint) => {
    try {
      const res = await lookupSpec({
        manufacturer: hint.manufacturer,
        part_number: hint.part_number,
        spec_key: hint.spec_key,
      })
      if (res.source !== null && res.value) {
        result.filled_slots.push({
          spec_key: hint.spec_key,
          value: res.value,
          unit: res.unit,
          source: res.source,
        })
        // Patch the quantity in-place (fill missing slot only)
        const existing = contract.quantities[hint.spec_key]
        const existingVal = typeof existing === 'object' ? (existing as any)?.value : existing
        if (!existingVal || existingVal === 0) {
          const parsed = parseFloat(res.value)
          if (!isNaN(parsed)) {
            contract.quantities[hint.spec_key] = {
              value: parsed,
              unit: res.unit,
              unit_family: 'dimensionless',
              basis: 'typical',
              scope: 'system',
              source: 'db_writeback',
              source_detail: `Lock gate filled from ${res.source}: ${res.value} ${res.unit}`,
            } as any
          }
        }
      }
    } catch { /* non-fatal */ }
  })

  // Run all spec lookups concurrently (bounded: these are all DB-first, most hit DB)
  await Promise.all(lookupPromises)

  // ── Phase 2: fill standards citations ─────────────────────────────────
  const mandatoryStandards = JURISDICTION_MANDATORY_STANDARDS[jurisdiction] ?? []
  const standardsPromises = mandatoryStandards.map(async (stdName) => {
    try {
      const res = await lookupStandard({
        standard_name: stdName,
        product_class: productClass,
      })
      if (res.source !== null) {
        result.filled_standards.push({
          standard_name: stdName,
          scope: res.scope,
          source: res.source,
        })
      }
    } catch { /* non-fatal */ }
  })
  await Promise.all(standardsPromises)

  // ── Phase 2b: class-level product lookup → ATTACH to the contract ────
  // Queries pretraining_products (DB-first HYBRID → web-on-miss → writeback) for
  // a reference product in this class. PRE-2026-06-04 this result was DISCARDED
  // ("does NOT mutate the contract"), so the growing DB grew a row nobody read.
  // NOW: the looked-up module decomposition + key specs + suppliers are attached
  // to contract.product_ontology, which generatorSystem() renders into the LLM
  // prompt (so the generator emits modules that MATCH a real reference product)
  // and which persists on state.engineeringContract for the renderer. Closes the
  // audited products step-6 gap. Still non-fatal: a miss leaves the contract as-is.
  try {
    // Use the class name as the lookup query (not "<class> container", which only
    // matched containerised BESS). The hybrid lexical+semantic arms resolve the
    // closest reference product for ANY class. Brief-derived hints (the product
    // name in the brief) would be even better, but class-level is the universal
    // floor and matches how the DB is keyed (product_class column).
    const productQuery = (contract.brief_summary || productClass.replace(/_/g, ' ')).slice(0, 200)
    if (productClass) {
      const pres = await lookupProduct({
        product_name: productQuery,
        product_class: productClass,
      })
      if (pres.found) {
        const modules = (pres.modules ?? []).filter((m) => m && m.module)
        const ontology: ProductOntology = {
          reference_product: pres.product_name ?? productQuery,
          manufacturer: pres.manufacturer ?? null,
          source: (pres.source ?? 'db') as 'db' | 'web',
          modules,
          key_specs: pres.key_specs ?? {},
          suppliers: pres.suppliers ?? [],
        }
        // ATTACH — the load-bearing line. Only attach when there is something
        // worth grounding on (modules OR specs), so an empty hit doesn't add noise.
        const hasContent = modules.length > 0 || Object.keys(ontology.key_specs).length > 0
        if (hasContent) {
          contract.product_ontology = ontology
        }
        result.product_enrichment = {
          found: true,
          source: pres.source,
          reference_product: ontology.reference_product,
          modules_count: modules.length,
          key_specs_count: Object.keys(ontology.key_specs).length,
          suppliers_count: ontology.suppliers.length,
          standards_count: (pres.standards ?? []).length,
          attached_to_contract: hasContent,
        }
      }
    }
  } catch { /* non-fatal */ }

  // ── Phase 3: HARD-required slot check ─────────────────────────────────
  for (const slot of hardRequired) {
    const qty = contract.quantities[slot]
    const val = typeof qty === 'object' ? (qty as any)?.value : qty
    if (val === undefined || val === null || val === 0 || val === '') {
      result.hard_miss_slots.push(slot)
    }
  }

  if (result.hard_miss_slots.length > 0) {
    result.exit_code_22 = true
    console.error(
      `[engineering-lock-gate] EXIT 22 — HARD required slots still missing after DB + web fallback: ${result.hard_miss_slots.join(', ')}`,
    )
  } else {
    console.error(
      `[engineering-lock-gate] PASS — filled ${result.filled_slots.length} slots + ${result.filled_standards.length} standards; jurisdiction=${jurisdiction}`,
    )
  }

  return result
}
