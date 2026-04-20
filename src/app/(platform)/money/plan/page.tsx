/**
 * @file money/plan/page.tsx — /money/plan grid landing.
 *
 * @description Entry point for the Money Plan grid. Mockup-faithful port
 * of MONEY-MOCKUP-PLAN.html. Reads only fields that exist in the current
 * schema — every line comes from `plan_line_items`; scenarios come from
 * `burn_scenarios` (legacy table carried forward by MONEY-SCHEMA §5.1
 * MIGRATE + twin strategy). When the foundry has no plan rows, the grid
 * collapses to an "Start your first plan" CTA → /money/import/csv.
 *
 * Real fields bound today:
 *   - money_settings (currency)
 *   - burn_scenarios  (id, name, is_default — mockup's scenario chips)
 *   - plan_line_items (name, direction, category, amount_cents, frequency,
 *                       probability_pct, currency, notes)
 *
 * The forecast chart, variance preview and mini-P&L render honest empty
 * states — the projection engine, variance monitor and P&L renderer
 * haven't shipped. Never fake the mockup-specific £ figures there.
 *
 * @related
 *   - View:   ./plan-view.tsx
 *   - Styles: ./plan-v2.css (scoped .pln2)
 *   - Mockup: MONEY-MOCKUP-PLAN.html
 *   - Schema: MONEY-SCHEMA.md §2 Tables — plan_line_items / burn_scenarios
 */

import type { Metadata } from "next"

import { createClient } from "@/lib/supabase/server"
import { getFoundryIdCached } from "@/lib/supabase/foundry-context"

import {
  PlanView,
  type PlanCategory,
  type PlanDirection,
  type PlanFrequency,
  type PlanLineRow,
  type PlanScenarioChip,
} from "./plan-view"

export const metadata: Metadata = {
  title: "Money · Plan",
  description:
    "Every cost and income line on one surface. Bind numbers to the active scenario; see variance and P&L one click away.",
}

export const dynamic = "force-dynamic"

const DEFAULT_CURRENCY = "GBP"

// Valid enum members per MONEY-SCHEMA §2 plan_line_items CHECK constraints.
const VALID_CATEGORIES: readonly PlanCategory[] = [
  "people",
  "premises",
  "tools",
  "materials",
  "growth",
  "other",
  "revenue",
  "grants",
  "equity",
  "loans",
]
const VALID_FREQUENCIES: readonly PlanFrequency[] = [
  "one_off",
  "weekly",
  "monthly",
  "quarterly",
  "annual",
  "variable",
]

// ─── Page ────────────────────────────────────────────────────────────────

export default async function MoneyPlanPage(): Promise<React.ReactNode> {
  const foundryId = await getFoundryIdCached()
  if (!foundryId) return <NotInFoundry />

  const supabase = await createClient()

  const currency = await loadCurrency(supabase, foundryId)
  const scenarios = await loadScenarios(supabase, foundryId)
  const activeScenarioId =
    scenarios.find((s) => s.isDefault)?.id ?? scenarios[0]?.id ?? null
  const lines = await loadPlanLines(supabase, foundryId)

  return (
    <PlanView
      currency={currency}
      scenarios={scenarios}
      activeScenarioId={activeScenarioId}
      lines={lines}
    />
  )
}

// ─── Loaders ─────────────────────────────────────────────────────────────

async function loadCurrency(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foundryId: string,
): Promise<string> {
  try {
    const { data, error } = await supabase
      .from("money_settings")
      .select("currency")
      .eq("foundry_id", foundryId)
      .maybeSingle()
    if (error || !data?.currency) return DEFAULT_CURRENCY
    return data.currency
  } catch (err) {
    console.error("[MONEY-PLAN] loadCurrency failed:", err)
    return DEFAULT_CURRENCY
  }
}

async function loadScenarios(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foundryId: string,
): Promise<PlanScenarioChip[]> {
  try {
    const { data, error } = await supabase
      .from("burn_scenarios")
      .select("id, name, is_default")
      .eq("foundry_id", foundryId)
      .order("is_default", { ascending: false })
      .order("name", { ascending: true })
    if (error || !data) return []
    return data.map((row) => ({
      id: row.id,
      name: row.name,
      isDefault: row.is_default === true,
    }))
  } catch (err) {
    console.error("[MONEY-PLAN] loadScenarios failed:", err)
    return []
  }
}

async function loadPlanLines(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foundryId: string,
): Promise<PlanLineRow[]> {
  try {
    const { data, error } = await supabase
      .from("plan_line_items")
      .select(
        "id, name, direction, category, amount_cents, frequency, probability_pct, currency, notes",
      )
      .eq("foundry_id", foundryId)
      .is("archived_at", null)
      .order("direction", { ascending: true })
      .order("category", { ascending: true })
      .order("name", { ascending: true })
    if (error || !data) return []
    return data
      .filter(
        (r) =>
          (r.direction === "out" || r.direction === "in") &&
          (VALID_CATEGORIES as readonly string[]).includes(r.category) &&
          (VALID_FREQUENCIES as readonly string[]).includes(r.frequency),
      )
      .map<PlanLineRow>((r) => {
        const frequency = r.frequency as PlanFrequency
        return {
          id: r.id,
          name: r.name,
          direction: r.direction as PlanDirection,
          category: r.category as PlanCategory,
          amountCents: r.amount_cents,
          monthlyCents: toMonthlyCents(r.amount_cents, frequency),
          frequency,
          probabilityPct: r.probability_pct ?? 100,
          currency: r.currency ?? DEFAULT_CURRENCY,
          notes: r.notes,
        }
      })
  } catch (err) {
    console.error("[MONEY-PLAN] loadPlanLines failed:", err)
    return []
  }
}

/**
 * Normalise amount_cents to a monthly-equivalent figure for the subtotal
 * column. Weekly → ×52/12; annual → ÷12; quarterly → ÷3. `one_off` and
 * `variable` are spread as the raw amount (founder's best guess — the
 * proper projection engine replaces this later).
 */
function toMonthlyCents(amountCents: number, frequency: PlanFrequency): number {
  switch (frequency) {
    case "weekly":    return Math.round(amountCents * 52 / 12)
    case "monthly":   return amountCents
    case "quarterly": return Math.round(amountCents / 3)
    case "annual":    return Math.round(amountCents / 12)
    case "one_off":
    case "variable":
    default:          return amountCents
  }
}

// ─── Fallback: user not in a foundry ────────────────────────────────────

function NotInFoundry(): React.ReactElement {
  return (
    <div
      style={{
        padding: "48px 32px",
        maxWidth: 640,
        margin: "48px auto",
        textAlign: "center",
      }}
    >
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
        Money needs a foundry
      </h1>
      <p style={{ color: "#78716c", fontSize: 14, lineHeight: 1.55 }}>
        You aren&apos;t a member of a foundry yet. Create one or accept a
        pending invite to see your Plan grid.
      </p>
    </div>
  )
}
