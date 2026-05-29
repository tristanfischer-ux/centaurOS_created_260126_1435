/**
 * Payload Rating Audit — Gate 30 (exit code 30)
 *
 * Asserts in_container_mass_kg ≤ container_payload_rating_kg.
 *
 * This invariant prevents the dossier from publishing a design whose computed
 * in-container mass exceeds the stated enclosure payload rating. The bespoke
 * BESS enclosure is rated to the brief's gross-mass cap (container_payload_rating_kg
 * = brief_mass_cap_kg). A breach means either the design is heavier than the
 * enclosure can carry, or the brief's mass cap must be relaxed.
 *
 * UNIVERSAL: skips silently when container_payload_rating_kg is absent from the
 * contract (any class whose design is not containerised, or any class that has
 * not yet adopted this pattern). No BESS-only hardcodes.
 *
 * Added: 2026-05-29, council residual fix #3c
 * Exit code: 30 (next free after 29; see CLAUDE.md exit-code table)
 */

export interface PayloadRatingAuditResult {
  /** True when the gate passes (no breach, or container_payload_rating_kg absent). */
  passed: boolean
  /** Computed in-container mass (kg), or null if absent. */
  in_container_mass_kg: number | null
  /** Bespoke enclosure payload rating (kg), or null if absent (gate skipped). */
  container_payload_rating_kg: number | null
  /** Breach amount in kg (positive = breach, zero or negative = pass). */
  breach_kg: number
  /** Human-readable summary for chain logging and state.json. */
  message: string
}

/**
 * Run the payload-rating gate.
 *
 * @param quantities - The orchestratorContract.quantities map from the chain state.
 *   Each key maps to a Quantity object with a numeric `.value`.
 */
export function runPayloadRatingAudit(quantities: Record<string, any>): PayloadRatingAuditResult {
  const containerPayloadRating: number | null =
    typeof quantities?.container_payload_rating_kg?.value === 'number'
      ? (quantities.container_payload_rating_kg.value as number)
      : null

  // Universal skip: if the contract doesn't carry container_payload_rating_kg,
  // this class is not containerised (or hasn't adopted the pattern yet). Gate
  // passes unconditionally.
  if (containerPayloadRating === null) {
    return {
      passed: true,
      in_container_mass_kg: null,
      container_payload_rating_kg: null,
      breach_kg: 0,
      message: 'SKIP — container_payload_rating_kg absent; gate not applicable to this class',
    }
  }

  const inContainerMass: number | null =
    typeof quantities?.in_container_mass_kg?.value === 'number'
      ? (quantities.in_container_mass_kg.value as number)
      : null

  if (inContainerMass === null) {
    // container_payload_rating_kg present but in_container_mass_kg missing —
    // treat as pass (incomplete data; upstream gates cover missing quantities).
    return {
      passed: true,
      in_container_mass_kg: null,
      container_payload_rating_kg: containerPayloadRating,
      breach_kg: 0,
      message:
        'SKIP — in_container_mass_kg absent; cannot evaluate breach (upstream gates should catch missing quantities)',
    }
  }

  const breachKg = inContainerMass - containerPayloadRating

  if (breachKg > 0) {
    return {
      passed: false,
      in_container_mass_kg: inContainerMass,
      container_payload_rating_kg: containerPayloadRating,
      breach_kg: breachKg,
      message:
        `FAIL — in_container_mass_kg ${Math.round(inContainerMass).toLocaleString('en-GB')} kg ` +
        `EXCEEDS container_payload_rating_kg ${Math.round(containerPayloadRating).toLocaleString('en-GB')} kg ` +
        `by ${Math.round(breachKg).toLocaleString('en-GB')} kg. ` +
        `Fix: reduce in-container mass (fewer racks, lighter cooling, smaller BMS cabling) ` +
        `OR raise brief gross-mass cap (container_payload_rating_kg = brief_mass_cap_kg).`,
    }
  }

  return {
    passed: true,
    in_container_mass_kg: inContainerMass,
    container_payload_rating_kg: containerPayloadRating,
    breach_kg: breachKg,
    message:
      `PASS — in_container_mass_kg ${Math.round(inContainerMass).toLocaleString('en-GB')} kg ` +
      `≤ container_payload_rating_kg ${Math.round(containerPayloadRating).toLocaleString('en-GB')} kg ` +
      `(${Math.round(-breachKg).toLocaleString('en-GB')} kg margin)`,
  }
}
