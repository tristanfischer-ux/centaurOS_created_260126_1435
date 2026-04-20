/**
 * @file money/scenarios/page.tsx — /money/scenarios (list).
 *
 * @description Named what-if plans. A scenario is a diff against the default
 * plan — stored as a `money_scenarios` row plus N `money_scenario_overrides`
 * rows pointing at `plan_line_items`. This page lists the ones that exist for
 * the current foundry and surfaces the "New scenario" CTA. Empty state is
 * centred and prominent — "Create your first scenario".
 *
 * Real fields bound today:
 *   - money_scenarios (name, question, template_source, visibility, is_default,
 *     created_at, updated_at — scoped by foundry_id, excluding archived rows)
 *   - money_scenario_overrides (count only, grouped by scenario_id — shown on
 *     each card as "N overrides")
 *
 * No runway-impact numbers are rendered on the list cards — those depend on a
 * projection engine that isn't wired. The detail page carries the same
 * honest-empty-state policy.
 *
 * @related
 *   - View:    ./scenarios-list-view.tsx
 *   - Styles:  ./scenarios-v2.css (scoped .scn2)
 *   - Mockups: MONEY-MOCKUP-NEW-SCENARIO.html, MONEY-MOCKUP-SCENARIO-DETAIL.html
 *   - Schema:  MONEY-SCHEMA.md §money_scenarios + §money_scenario_overrides
 */

import type { Metadata } from "next"

import { createClient } from "@/lib/supabase/server"
import { getFoundryIdCached } from "@/lib/supabase/foundry-context"

import { ScenariosListView, type ScenarioCardRow } from "./scenarios-list-view"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Scenarios · Money · Plan",
  description:
    "Named what-if plans — override line items against the default plan and see runway impact side-by-side.",
}

export default async function MoneyScenariosListPage(): Promise<React.ReactNode> {
  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return <NotInFoundry />
  }

  const scenarios = await loadScenarios(foundryId)
  return <ScenariosListView scenarios={scenarios} />
}

// ─── Loaders ─────────────────────────────────────────────────────────────

async function loadScenarios(foundryId: string): Promise<ScenarioCardRow[]> {
  try {
    const supabase = await createClient()
    const { data: rows, error } = await supabase
      .from("money_scenarios")
      .select(
        "id, name, question, template_source, visibility, is_default, created_at, updated_at",
      )
      .eq("foundry_id", foundryId)
      .is("archived_at", null)
      .order("is_default", { ascending: false })
      .order("updated_at", { ascending: false })

    if (error || !rows || rows.length === 0) return []

    // Fetch override counts per scenario. A second round-trip is fine here —
    // the list rarely has more than a dozen rows, and we want a real count on
    // each card rather than a fabricated "—".
    const scenarioIds = rows.map((r) => r.id)
    const overrideCounts = await loadOverrideCounts(foundryId, scenarioIds)

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      question: row.question,
      templateSource: row.template_source,
      visibility: row.visibility,
      isDefault: row.is_default,
      overrideCount: overrideCounts.get(row.id) ?? 0,
      updatedAt: row.updated_at,
      createdAt: row.created_at,
    }))
  } catch (err) {
    console.error("[MONEY-SCENARIOS-LIST] loadScenarios failed:", err)
    return []
  }
}

async function loadOverrideCounts(
  foundryId: string,
  scenarioIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (scenarioIds.length === 0) return counts
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("money_scenario_overrides")
      .select("scenario_id")
      .eq("foundry_id", foundryId)
      .is("archived_at", null)
      .in("scenario_id", scenarioIds)
    if (error || !data) return counts
    for (const row of data) {
      const sid = row.scenario_id as string
      counts.set(sid, (counts.get(sid) ?? 0) + 1)
    }
    return counts
  } catch (err) {
    console.error("[MONEY-SCENARIOS-LIST] loadOverrideCounts failed:", err)
    return counts
  }
}

// ─── Fallback ────────────────────────────────────────────────────────────

function NotInFoundry(): React.ReactElement {
  return (
    <div className="scn2">
      <div className="scn2-fallback">
        <h1>Scenarios need a foundry</h1>
        <p>
          You aren&apos;t a member of a foundry yet. Create one or accept a pending invite to start modelling what-if scenarios.
        </p>
      </div>
    </div>
  )
}
