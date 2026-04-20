/**
 * @file money/scenarios/[scenarioId]/page.tsx — /money/scenarios/:id
 *
 * @description Scenario detail — mockup-faithful port of
 * MONEY-MOCKUP-SCENARIO-DETAIL.html. One scenario per page: the question it
 * answers, the parameters, the list of overrides against the default plan.
 * Runway-comparison chart renders as an honest placeholder until the
 * projection engine is wired.
 *
 * Real fields bound today:
 *   - money_scenarios (name, question, visibility, is_default, template_source,
 *     revenue_delay_weeks, cost_delay_weeks, revenue_growth_pct,
 *     opening_balance_cents, currency via money_settings, created_at,
 *     updated_at)
 *   - money_scenario_overrides (line_item_id, override_amount_cents,
 *     override_frequency, override_probability_pct, note — joined against
 *     plan_line_items for line name + bucket)
 *
 * Notes-404:
 *   - Returns notFound() when the scenario doesn't exist, is archived, or
 *     belongs to a different foundry.
 *
 * @related
 *   - View:    ./scenarios-detail-view.tsx
 *   - Styles:  ../scenarios-v2.css (scoped .scn2)
 *   - Mockup:  MONEY-MOCKUP-SCENARIO-DETAIL.html
 *   - Schema:  MONEY-SCHEMA.md §money_scenarios + §money_scenario_overrides
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getFoundryIdCached } from "@/lib/supabase/foundry-context"

import {
  ScenariosDetailView,
  type ScenarioDetail,
  type ScenarioOverrideRow,
} from "./scenarios-detail-view"

export const dynamic = "force-dynamic"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ scenarioId: string }>
}): Promise<Metadata> {
  const { scenarioId } = await params
  const foundryId = await getFoundryIdCached()
  if (!foundryId) return { title: "Scenario · Money" }

  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from("money_scenarios")
      .select("name")
      .eq("id", scenarioId)
      .eq("foundry_id", foundryId)
      .is("archived_at", null)
      .maybeSingle()
    if (data?.name) return { title: `${data.name} · Money · Plan` }
  } catch {
    // Fall through to default title.
  }
  return { title: "Scenario · Money · Plan" }
}

export default async function MoneyScenarioDetailPage({
  params,
}: {
  params: Promise<{ scenarioId: string }>
}): Promise<React.ReactNode> {
  const { scenarioId } = await params

  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return <NotInFoundry />
  }

  const supabase = await createClient()

  const scenario = await loadScenario(supabase, foundryId, scenarioId)
  if (!scenario) {
    notFound()
  }

  const overrides = await loadOverrides(supabase, foundryId, scenarioId)

  return <ScenariosDetailView scenario={scenario} overrides={overrides} />
}

// ─── Loaders ─────────────────────────────────────────────────────────────

async function loadScenario(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foundryId: string,
  scenarioId: string,
): Promise<ScenarioDetail | null> {
  try {
    const { data: row, error } = await supabase
      .from("money_scenarios")
      .select(
        "id, name, question, visibility, is_default, template_source, revenue_delay_weeks, cost_delay_weeks, revenue_growth_pct, opening_balance_cents, created_at, updated_at",
      )
      .eq("id", scenarioId)
      .eq("foundry_id", foundryId)
      .is("archived_at", null)
      .maybeSingle()
    if (error || !row) return null

    // Currency is not on the scenario row — it belongs to money_settings.
    // Resolve with a single maybeSingle read, default to GBP when absent.
    const { data: settings } = await supabase
      .from("money_settings")
      .select("currency")
      .eq("foundry_id", foundryId)
      .maybeSingle()

    return {
      id: row.id,
      name: row.name,
      question: row.question,
      visibility: row.visibility,
      isDefault: row.is_default,
      templateSource: row.template_source,
      revenueDelayWeeks: row.revenue_delay_weeks,
      costDelayWeeks: row.cost_delay_weeks,
      revenueGrowthPct: row.revenue_growth_pct,
      openingBalanceCents: row.opening_balance_cents,
      currency: settings?.currency ?? "GBP",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  } catch (err) {
    console.error("[MONEY-SCENARIO-DETAIL] loadScenario failed:", err)
    return null
  }
}

async function loadOverrides(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foundryId: string,
  scenarioId: string,
): Promise<ScenarioOverrideRow[]> {
  try {
    const { data, error } = await supabase
      .from("money_scenario_overrides")
      .select(
        "id, line_item_id, override_amount_cents, override_frequency, override_probability_pct, note, line_item:plan_line_items(name, category, direction, amount_cents, frequency, currency)",
      )
      .eq("scenario_id", scenarioId)
      .eq("foundry_id", foundryId)
      .is("archived_at", null)
    if (error || !data) return []

    return data.map((row) => {
      const line = row.line_item as
        | {
            name: string
            category: string
            direction: string
            amount_cents: number
            frequency: string
            currency: string
          }
        | null

      const lineName = line?.name ?? "Line item removed"
      const bucket = line ? formatBucket(line.direction, line.category) : null
      const currency = line?.currency ?? "GBP"

      const currentDisplay = line
        ? formatAmount(line.amount_cents, currency, line.frequency)
        : "—"
      const overrideDisplay =
        row.override_amount_cents != null
          ? formatAmount(
              row.override_amount_cents,
              currency,
              row.override_frequency ?? line?.frequency ?? "monthly",
            )
          : row.override_probability_pct != null
            ? `${row.override_probability_pct}% probability`
            : "—"

      return {
        id: row.id,
        lineName,
        lineBucket: bucket,
        currentDisplay,
        overrideDisplay,
        note: row.note,
      }
    })
  } catch (err) {
    console.error("[MONEY-SCENARIO-DETAIL] loadOverrides failed:", err)
    return []
  }
}

// ─── Display helpers ────────────────────────────────────────────────────

function formatBucket(direction: string, category: string): string | null {
  const dirLabel = direction === "in" ? "Revenue" : direction === "out" ? "Cost" : null
  if (!dirLabel && !category) return null
  if (!dirLabel) return category
  if (!category) return dirLabel
  return `${dirLabel} · ${category}`
}

function formatAmount(cents: number, currency: string, frequency: string): string {
  const major = cents / 100
  const symbol = currency === "GBP" ? "£" : currency === "USD" ? "$" : currency === "EUR" ? "€" : ""
  const formatted = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(major)
  const freqLabel = shortFrequency(frequency)
  return freqLabel ? `${symbol}${formatted}${freqLabel}` : `${symbol}${formatted}`
}

function shortFrequency(freq: string): string {
  switch (freq) {
    case "monthly":
      return "/mo"
    case "weekly":
      return "/wk"
    case "quarterly":
      return "/qtr"
    case "annual":
    case "annually":
    case "yearly":
      return "/yr"
    case "one_off":
    case "one-off":
    case "once":
      return ""
    default:
      return ""
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
