/**
 * @file money/scenarios/new/page.tsx — /money/scenarios/new
 *
 * @description New scenario wizard — mockup-faithful port of
 * MONEY-MOCKUP-NEW-SCENARIO.html. Server component loads the foundry&apos;s
 * `plan_line_items` so the overrides table §03 renders real lines when they
 * exist (as rows the founder could override), and an honest "no lines
 * captured yet" empty state when it doesn't. All inputs render disabled —
 * the scenario save action wires up next round.
 *
 * Real fields bound today:
 *   - plan_line_items (name, category, direction, amount_cents, frequency,
 *     currency — scoped by foundry_id, excluding archived rows)
 *
 * Every other number (runway delta, impact tiles, Finance read) is honest
 * "—" or "wires up with projection engine" — no fabricated specifics.
 *
 * @related
 *   - View:    ./scenarios-new-view.tsx
 *   - Styles:  ../scenarios-v2.css (scoped .scn2)
 *   - Mockup:  MONEY-MOCKUP-NEW-SCENARIO.html
 *   - Schema:  MONEY-SCHEMA.md §money_scenarios + §money_scenario_overrides
 */

import type { Metadata } from "next"

import { createClient } from "@/lib/supabase/server"
import { getFoundryIdCached } from "@/lib/supabase/foundry-context"

import { ScenariosNewView, type PlanLineOption } from "./scenarios-new-view"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "New scenario · Money · Plan",
  description:
    "Create a named what-if plan. Override line items against the default plan, see runway impact, apply to Cockpit.",
}

// Soft cap on lines shown in the override picker — the mockup shows ~8 rows,
// so 50 is a generous ceiling that keeps the page snappy without fabricating.
const LINE_LIMIT = 50

export default async function MoneyNewScenarioPage(): Promise<React.ReactNode> {
  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return <NotInFoundry />
  }

  const planLines = await loadPlanLines(foundryId)
  return <ScenariosNewView planLines={planLines} />
}

// ─── Loaders ─────────────────────────────────────────────────────────────

async function loadPlanLines(foundryId: string): Promise<PlanLineOption[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("plan_line_items")
      .select("id, name, category, direction, amount_cents, frequency, currency")
      .eq("foundry_id", foundryId)
      .is("archived_at", null)
      .order("direction", { ascending: true })
      .order("amount_cents", { ascending: false })
      .limit(LINE_LIMIT)

    if (error || !data) return []
    return data.map((row) => ({
      id: row.id,
      label: row.name,
      bucket: formatBucket(row.direction, row.category),
      currentDisplay: formatAmount(
        row.amount_cents,
        row.currency,
        row.frequency,
      ),
    }))
  } catch (err) {
    console.error("[MONEY-SCENARIOS-NEW] loadPlanLines failed:", err)
    return []
  }
}

// ─── Display helpers ─────────────────────────────────────────────────────

function formatBucket(direction: string, category: string): string | null {
  const dirLabel = direction === "in" ? "Revenue" : direction === "out" ? "Cost" : null
  if (!dirLabel && !category) return null
  if (!dirLabel) return category
  if (!category) return dirLabel
  return `${dirLabel} · ${category}`
}

function formatAmount(
  cents: number,
  currency: string,
  frequency: string,
): string {
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
