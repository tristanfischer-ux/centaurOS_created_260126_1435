/**
 * scripts/lib/orchestrator/sizing-families/battery.ts
 *
 * BATTERY family — PORT of the legacy generic/sizing.ts single family to the
 * E2 plug-in shape, with a BYTE-IDENTICAL guarantee on the Exp-A BESS path.
 *
 * The rule table is IMPORTED from generic/sizing.ts (single source of truth —
 * no drift between the legacy oracle and this plugin). The plugin's size()
 * runs the SAME scan (rule-engine.ts replicates the legacy loop) and the
 * registry merge uses the SAME mergeMods, so old-vs-new output is identical
 * byte for byte. Proven by `scripts/test-sizing-families.tsx` section A and
 * harness invariant `UNIVERSAL.sizing_family_battery_port_byte_identical`.
 *
 * requiredQuantities is EMPTY by design: the legacy BATTERY rules use the
 * never-invent per-rule skip (a rule emits nothing when its source quantity
 * is absent), and declaring hard requirements here would change behaviour on
 * sparse contracts and break the byte-identity regression. Tightening the
 * battery boundary (e.g. hard-requiring cell_count) is a follow-up AFTER the
 * registry path has soaked a chain run.
 *
 * British spelling throughout.
 */

import type { ContractInProgress } from '../types'
import { BATTERY, FAMILY_OF, flattenParams } from '../generic/sizing'
import { scanWordsAgainstRules } from './rule-engine'
import { registerSizingFamily } from './registry'
import type { EnvelopeVectorLike, SizableModule, SizingDelta, SizingFamilyPlugin } from './types'

const VERSION = '1.0.0'
const PROVENANCE = `family-plugin:battery@${VERSION}`

export const BATTERY_FAMILY: SizingFamilyPlugin = {
  family: 'battery',
  version: VERSION,
  runs_after: [],
  overrides: [],

  // 1.0 — exact class-slug membership in the legacy FAMILY_OF battery map
  //       (bess / ess / residential_ess / marine_ess / second-life / vehicle pack).
  // 0.75 — envelope-vector domain signal ('battery' / 'electrochemical').
  appliesTo(envelopeVector: EnvelopeVectorLike | null | undefined, classSlug: string): number {
    if (FAMILY_OF[classSlug] === 'battery') return 1.0
    const domains = envelopeVector?.domains ?? []
    if (domains.some((d) => /batter|electrochem/i.test(String(d)))) return 0.75
    return 0
  },

  requiredQuantities: [],

  size(modules: ReadonlyArray<SizableModule>, contract: ContractInProgress): SizingDelta {
    const params = flattenParams(contract)
    const modifier_writes = scanWordsAgainstRules(
      modules,
      BATTERY,
      params,
      PROVENANCE,
      'legacy BATTERY ruleset: every value sourced from the engineering contract’s computed quantities (PyBaMM/ngspice/pandapower outputs); see generic/sizing.ts rule comments',
    )
    return {
      family: 'battery',
      version: VERSION,
      provenance: PROVENANCE,
      modifier_writes,
      quantity_writes: [],
      derived_parameter_writes: [],
      notes: modifier_writes.length > 0 ? [`battery family sized ${modifier_writes.length} word(s) from contract physics`] : [],
    }
  },
}

registerSizingFamily(BATTERY_FAMILY)
