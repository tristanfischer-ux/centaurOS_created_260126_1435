/**
 * Money · scenario.ts — scenario application helpers.
 *
 * Thin layer over `runway.applyOverrides` that adds convenience shaping
 * for the Plan + Cockpit surfaces. Pure functions; server actions pull
 * the scenario + overrides rows and pass them in.
 *
 * V1 scope: overrides are simple diffs per MONEY-SCHEMA §1 ambiguity
 * resolution #2. Formulas / triggers / global-params were explicitly cut
 * per V1 explicit-cuts list (MONEY-MOCKUP-GAP-AUDIT.html §4).
 */

import {
  applyOverrides,
  projectRunway,
  type PlanLineItemRow,
  type ScenarioOverrideRow,
  type RunwayProjection,
} from './runway'

export type ScenarioRow = {
  id: string
  name: string
  question: string | null
  is_default: boolean
}

export type ScenarioCompareInput = {
  lines: PlanLineItemRow[]
  openingBalanceCents: number
  asOfDate: Date
  weeks: number
  scenarios: Array<{
    scenario: ScenarioRow
    overrides: ScenarioOverrideRow[]
  }>
}

export type ScenarioComparison = {
  scenarioId: string
  scenarioName: string
  projection: RunwayProjection
  runwayWeeks: number | null
  monthlyBurnCents: number
  deltaFromBaselineWeeks: number | null
}

/**
 * Run the same plan through multiple scenarios and return runway + burn for
 * each. The first scenario in the array is the baseline for delta
 * computation. If scenarios is empty, returns an empty comparison array.
 */
export function compareScenarios(
  input: ScenarioCompareInput,
): ScenarioComparison[] {
  if (input.scenarios.length === 0) return []

  const results: ScenarioComparison[] = input.scenarios.map((entry) => {
    const projection = projectRunway({
      asOfDate: input.asOfDate,
      openingBalanceCents: input.openingBalanceCents,
      weeks: input.weeks,
      lines: input.lines,
      overrides: entry.overrides,
    })
    return {
      scenarioId: entry.scenario.id,
      scenarioName: entry.scenario.name,
      projection,
      runwayWeeks: projection.runwayWeeks,
      monthlyBurnCents: projection.monthlyBurnCents,
      deltaFromBaselineWeeks: null,
    }
  })

  // Compute delta vs baseline (first entry).
  const baselineWeeks = results[0].runwayWeeks
  for (let i = 1; i < results.length; i++) {
    const cur = results[i].runwayWeeks
    if (baselineWeeks !== null && cur !== null) {
      results[i].deltaFromBaselineWeeks = cur - baselineWeeks
    }
  }

  return results
}

/**
 * Produce the "effective lines" used by Plan grid when a scenario is
 * selected in the UI. The Plan grid shows base lines when no scenario is
 * active, and the scenario-overlaid lines when one is selected — same data
 * shape either way.
 */
export function effectiveLinesForScenario(
  lines: PlanLineItemRow[],
  overrides: ScenarioOverrideRow[] | undefined,
): PlanLineItemRow[] {
  return applyOverrides(lines, overrides)
}
