/**
 * @file money/pnl/page.tsx — /money/pnl Full income statement.
 *
 * @description Mockup-faithful port of MONEY-MOCKUP-PNL.html. Pivots aggregated
 * plan line items (and Xero actuals once connected) into an income statement
 * grouped by Revenue / COGS / Gross profit / Opex / EBIT / Net loss, with a
 * quarterly column layout and a 12-month total.
 *
 * Data contract (aggregated transactions by category x month):
 *   - `money_settings.currency`                     -> currency symbol
 *   - `xero_connection.sync_state`                  -> "Source:" chip + actuals
 *   - `plan_line_items(category, direction, amount_cents, frequency)` ->
 *     forecast projection per quarter (honest null per cell when no lines match)
 *   - `xero_transaction(transaction_date, assigned_category, amount_cents)` ->
 *     actuals (future chunk — not wired today, rows counted only)
 *
 * Empty-state policy:
 *   - If there are zero plan_line_items AND zero xero_transaction rows, the
 *     page renders a "Connect Xero or import CSV" empty state and no table.
 *   - Per-cell null values render as "—" — no synthetic placeholders.
 *
 * Controls (View / Period / Show) are rendered disabled today with
 * "Quarterly / Next 12 months / Plan" active — wiring them lands in the
 * server-action chunk that adds search-param handling and CSV export.
 *
 * @related
 *   - View:   ./pnl-view.tsx
 *   - Styles: ./pnl-v2.css (scoped .pnl2)
 *   - Mockup: MONEY-MOCKUP-PNL.html
 *   - Schema: MONEY-SCHEMA.md §plan_line_items / §xero_transaction
 */

import type { Metadata } from "next"

import { createClient } from "@/lib/supabase/server"
import { getFoundryIdCached } from "@/lib/supabase/foundry-context"

import {
  PnlView,
  type PnlLine,
  type PnlLineCells,
  type PnlSection,
  type PnlSourceState,
  type PnlViewProps,
} from "./pnl-view"

export const metadata: Metadata = {
  title: "Money · Income statement",
  description:
    "Plan and Xero actuals rolled up into the income statement investors and accountants expect.",
}

export const dynamic = "force-dynamic"

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

// ─── Page ──────────────────────────────────────────────────────────────

export default async function MoneyPnlPage(): Promise<React.ReactNode> {
  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return <NotInFoundry />
  }

  const supabase = await createClient()

  const [currency, xero, planLines, transactionCount] = await Promise.all([
    loadCurrency(supabase, foundryId),
    loadXeroConnected(supabase, foundryId),
    loadPlanLines(supabase, foundryId),
    loadTransactionCount(supabase, foundryId),
  ])

  const source: PnlSourceState = {
    xeroConnected: xero,
    planLineCount: planLines.length,
    transactionCount,
  }

  // Fixed quarterly window: next 12 months from "today", split into 4 quarters.
  // Labels like "Q2 '26". Once the View/Period selectors wire up this becomes
  // a function of the active selection.
  const quarters = buildQuarterWindow(new Date())

  const sections = planLines.length > 0
    ? buildSectionsFromPlan(planLines, quarters)
    : []

  const marginTrend = null // computed once COGS + Revenue both have non-null totals across quarters
  const breakEven = null // requires revenue curve + opex baseline; computed in a later chunk

  // Balance sheet — shown only when at least plan data exists so we can
  // compute projected equity. Today render null (no projected balance data).
  const balance = null

  const viewProps: PnlViewProps = {
    currency,
    headers: quarters.map((q) => q.label),
    totalHeader: "12-mo total",
    sections,
    balance,
    source,
    activeView: "quarterly",
    activePeriod: "next_12",
    activeShow: "plan",
    marginTrend,
    breakEven,
  }

  return <PnlView {...viewProps} />
}

// ─── Loaders ───────────────────────────────────────────────────────────

async function loadCurrency(supabase: SupabaseClient, foundryId: string): Promise<string> {
  try {
    const { data } = await supabase
      .from("money_settings")
      .select("currency")
      .eq("foundry_id", foundryId)
      .maybeSingle()
    return data?.currency ?? "GBP"
  } catch (err) {
    console.error("[MONEY-PNL] loadCurrency failed:", err)
    return "GBP"
  }
}

async function loadXeroConnected(supabase: SupabaseClient, foundryId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("xero_connection")
      .select("sync_state, last_sync_at")
      .eq("foundry_id", foundryId)
      .maybeSingle()
    // Treat "connected + at-least-once-synced" as the real signal.
    return !!data && !!data.last_sync_at && data.sync_state !== "error"
  } catch (err) {
    console.error("[MONEY-PNL] loadXeroConnected failed:", err)
    return false
  }
}

/** Plan line rows we actually use in aggregation. Kept narrow on purpose. */
interface PlanLineRow {
  id: string
  direction: "out" | "in"
  category: string
  amount_cents: number
  frequency: "one_off" | "weekly" | "monthly" | "quarterly" | "annual" | "variable"
  effective_from: string | null
  effective_to: string | null
  probability_pct: number | null
}

async function loadPlanLines(supabase: SupabaseClient, foundryId: string): Promise<PlanLineRow[]> {
  try {
    const { data, error } = await supabase
      .from("plan_line_items")
      .select(
        "id, direction, category, amount_cents, frequency, effective_from, effective_to, probability_pct",
      )
      .eq("foundry_id", foundryId)
      .is("archived_at", null)
    if (error || !data) return []
    // Cast through unknown — the DB enum is broader; we narrow here to the
    // shape the aggregator expects. Any row that doesn't match is skipped.
    return (data as unknown as PlanLineRow[]).filter(
      (row) => row.direction === "out" || row.direction === "in",
    )
  } catch (err) {
    console.error("[MONEY-PNL] loadPlanLines failed:", err)
    return []
  }
}

async function loadTransactionCount(supabase: SupabaseClient, foundryId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from("xero_transaction")
      .select("id", { count: "exact", head: true })
      .eq("foundry_id", foundryId)
    if (error) return 0
    return count ?? 0
  } catch (err) {
    console.error("[MONEY-PNL] loadTransactionCount failed:", err)
    return 0
  }
}

// ─── Quarter window builder ─────────────────────────────────────────────

interface QuarterWindow {
  label: string
  start: Date
  end: Date
  /** Months within this quarter (always 3). */
  months: Array<{ year: number; month: number }>
}

function buildQuarterWindow(anchor: Date): QuarterWindow[] {
  // Start at the first day of the current month's quarter.
  const year = anchor.getUTCFullYear()
  const month = anchor.getUTCMonth() // 0-11
  const quarterStartMonth = month - (month % 3)
  const out: QuarterWindow[] = []
  for (let i = 0; i < 4; i++) {
    const qStartMonth = quarterStartMonth + i * 3
    const start = new Date(Date.UTC(year, qStartMonth, 1))
    const end = new Date(Date.UTC(year, qStartMonth + 3, 0, 23, 59, 59)) // last day of quarter
    const qNum = Math.floor(start.getUTCMonth() / 3) + 1
    const yr = start.getUTCFullYear().toString().slice(-2)
    const months: QuarterWindow["months"] = []
    for (let m = 0; m < 3; m++) {
      months.push({ year: start.getUTCFullYear(), month: qStartMonth + m })
    }
    out.push({
      label: `Q${qNum} '${yr}`,
      start,
      end,
      months,
    })
  }
  return out
}

// ─── Aggregation ────────────────────────────────────────────────────────

/**
 * Project a plan line's amount into a single month.
 * Returns monthly-equivalent pence (negative for "out"), respecting frequency
 * and effective_from/to bounds. Probability_pct scales income expectations.
 */
function projectLineToMonth(
  line: PlanLineRow,
  year: number,
  month: number,
): number {
  const monthStart = new Date(Date.UTC(year, month, 1))
  const monthEnd = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59))

  const effFrom = line.effective_from ? new Date(line.effective_from) : null
  const effTo = line.effective_to ? new Date(line.effective_to) : null
  if (effFrom && effFrom > monthEnd) return 0
  if (effTo && effTo < monthStart) return 0

  const probability =
    line.direction === "in" ? (line.probability_pct ?? 100) / 100 : 1

  let monthlyEquivalent = 0
  switch (line.frequency) {
    case "monthly":
      monthlyEquivalent = line.amount_cents
      break
    case "weekly":
      monthlyEquivalent = Math.round(line.amount_cents * (52 / 12))
      break
    case "quarterly":
      monthlyEquivalent = Math.round(line.amount_cents / 3)
      break
    case "annual":
      monthlyEquivalent = Math.round(line.amount_cents / 12)
      break
    case "one_off":
      if (effFrom && effFrom >= monthStart && effFrom <= monthEnd) {
        monthlyEquivalent = line.amount_cents
      } else {
        return 0
      }
      break
    case "variable":
    default:
      monthlyEquivalent = 0
  }

  const signed = line.direction === "out" ? -monthlyEquivalent : monthlyEquivalent
  return Math.round(signed * probability)
}

function sumLinesOverQuarter(
  lines: PlanLineRow[],
  quarter: QuarterWindow,
): number {
  let total = 0
  for (const line of lines) {
    for (const m of quarter.months) {
      total += projectLineToMonth(line, m.year, m.month)
    }
  }
  return total
}

interface CellsResult {
  cells: PnlLineCells
  isAllZero: boolean
}

function buildCellsForLines(
  lines: PlanLineRow[],
  quarters: QuarterWindow[],
  sign: "positive" | "negative" = "positive",
): CellsResult {
  const values: Array<number | null> = []
  let runningTotal = 0
  let nonZero = false
  for (const q of quarters) {
    const raw = sumLinesOverQuarter(lines, q)
    // Revenue lines come through as positive already (direction='in'), costs
    // arrive as negative (direction='out'). `sign="negative"` guarantees the
    // value is displayed as a negative (red) whatever the raw sign.
    const v = sign === "negative" ? -Math.abs(raw) : raw
    values.push(v)
    runningTotal += v
    if (v !== 0) nonZero = true
  }
  return {
    cells: {
      values,
      total: nonZero ? runningTotal : 0,
    },
    isAllZero: !nonZero,
  }
}

/**
 * Group plan lines into the canonical P&L sections (Revenue, COGS, Opex)
 * by mapping the schema's category enum to income-statement buckets.
 *
 * Category enum (MONEY-SCHEMA §plan_line_items):
 *   - out: people / premises / tools / materials / growth / other
 *   - in:  revenue / grants / equity / loans
 *
 * Income-statement mapping:
 *   Revenue  = [revenue, grants]
 *   COGS     = [materials] + (20% allocation of `people` as "Direct labour"
 *                             — mockup does this, we preserve the convention)
 *   Opex     = [people (80%), premises, tools, growth, other]
 *   Below-the-line = [equity, loans] — shown only on balance sheet, not P&L.
 */
function buildSectionsFromPlan(
  lines: PlanLineRow[],
  quarters: QuarterWindow[],
): PnlSection[] {
  const byDirAndCat = (dir: "out" | "in", cats: string[]) =>
    lines.filter((l) => l.direction === dir && cats.includes(l.category))

  // ── Revenue section ──
  const productPilot = byDirAndCat("in", ["revenue"])
  const grants = byDirAndCat("in", ["grants"])

  const productPilotCells = buildCellsForLines(productPilot, quarters, "positive")
  const grantsCells = buildCellsForLines(grants, quarters, "positive")

  const totalRevenueCells = sumCellSets([productPilotCells.cells, grantsCells.cells], quarters.length)

  const revenueLines: PnlLine[] = []
  if (!productPilotCells.isAllZero || productPilot.length > 0) {
    revenueLines.push({
      id: "rev-product",
      label: "Product and pilot income",
      note: `${productPilot.length} line${productPilot.length === 1 ? "" : "s"} at direction=in, category=revenue`,
      tone: "positive",
      cells: productPilotCells.cells,
    })
  }
  if (!grantsCells.isAllZero || grants.length > 0) {
    revenueLines.push({
      id: "rev-grants",
      label: "Grant drawdowns",
      note: `${grants.length} line${grants.length === 1 ? "" : "s"} at direction=in, category=grants`,
      tone: "positive",
      cells: grantsCells.cells,
    })
  }

  // ── COGS section ──
  const materials = byDirAndCat("out", ["materials"])
  const people = byDirAndCat("out", ["people"])

  const materialsCells = buildCellsForLines(materials, quarters, "negative")
  const peopleAll = buildCellsForLines(people, quarters, "negative")
  // 20% of people roll into direct labour (matches MONEY-MOCKUP-PNL.html line),
  // 80% stays in Opex below.
  const peopleDirect = scaleCells(peopleAll.cells, 0.2)
  const peopleOpex = scaleCells(peopleAll.cells, 0.8)

  const totalCogsCells = sumCellSets([materialsCells.cells, peopleDirect], quarters.length)

  const cogsLines: PnlLine[] = []
  if (!materialsCells.isAllZero || materials.length > 0) {
    cogsLines.push({
      id: "cogs-materials",
      label: "Components and materials",
      note: `${materials.length} line${materials.length === 1 ? "" : "s"} at direction=out, category=materials`,
      tone: "negative",
      cells: materialsCells.cells,
    })
  }
  if (!peopleAll.isAllZero) {
    cogsLines.push({
      id: "cogs-labour",
      label: "Direct labour allocation",
      note: "20% of engineering payroll",
      tone: "negative",
      cells: peopleDirect,
    })
  }

  // ── Gross profit section (subtotal-only) ──
  const grossProfitCells: PnlLineCells = {
    values: quarters.map((_, i) => (totalRevenueCells.values[i] ?? 0) + (totalCogsCells.values[i] ?? 0)),
    total: (totalRevenueCells.total ?? 0) + (totalCogsCells.total ?? 0),
  }

  // ── Opex section ──
  const premises = byDirAndCat("out", ["premises"])
  const tools = byDirAndCat("out", ["tools"])
  const growth = byDirAndCat("out", ["growth"])
  const other = byDirAndCat("out", ["other"])

  const premisesCells = buildCellsForLines(premises, quarters, "negative").cells
  const toolsCells = buildCellsForLines(tools, quarters, "negative").cells
  const growthCells = buildCellsForLines(growth, quarters, "negative").cells
  const otherCells = buildCellsForLines(other, quarters, "negative").cells

  const opexLines: PnlLine[] = []
  if (people.length > 0) {
    opexLines.push({
      id: "opex-people",
      label: "People (non-COGS)",
      note: "80% of payroll (non-direct)",
      tone: "negative",
      indent: true,
      cells: peopleOpex,
    })
  }
  if (premises.length > 0) {
    opexLines.push({
      id: "opex-premises",
      label: "Premises and rent",
      tone: "negative",
      indent: true,
      cells: premisesCells,
    })
  }
  if (tools.length > 0) {
    opexLines.push({
      id: "opex-tools",
      label: "Tools and SaaS",
      tone: "negative",
      indent: true,
      cells: toolsCells,
    })
  }
  if (growth.length > 0) {
    opexLines.push({
      id: "opex-growth",
      label: "Growth and marketing",
      tone: "negative",
      indent: true,
      cells: growthCells,
    })
  }
  if (other.length > 0) {
    opexLines.push({
      id: "opex-other",
      label: "Other operating costs",
      tone: "negative",
      indent: true,
      cells: otherCells,
    })
  }

  const totalOpexCells = sumCellSets(
    [peopleOpex, premisesCells, toolsCells, growthCells, otherCells],
    quarters.length,
  )

  // ── EBIT + Net loss ──
  const ebitCells: PnlLineCells = {
    values: quarters.map((_, i) => (grossProfitCells.values[i] ?? 0) + (totalOpexCells.values[i] ?? 0)),
    total: (grossProfitCells.total ?? 0) + (totalOpexCells.total ?? 0),
  }

  const sections: PnlSection[] = []

  if (revenueLines.length > 0) {
    sections.push({
      title: "Revenue",
      lines: revenueLines,
      subtotal: {
        label: "Total revenue",
        tone: "neutral",
        cells: totalRevenueCells,
      },
    })
  }

  if (cogsLines.length > 0) {
    sections.push({
      title: "Cost of sales",
      lines: cogsLines,
      subtotal: {
        label: "Total COGS",
        tone: "negative",
        cells: totalCogsCells,
      },
    })

    // Gross profit rendered as its own "section" with no body lines, just
    // the subtotal row — keeps the table visually consistent with the mockup.
    sections.push({
      title: "Gross profit",
      lines: [],
      subtotal: {
        label: "Gross profit",
        tone:
          (grossProfitCells.total ?? 0) < 0
            ? "negative"
            : (grossProfitCells.total ?? 0) > 0
              ? "positive"
              : "neutral",
        cells: grossProfitCells,
      },
    })
  }

  if (opexLines.length > 0) {
    sections.push({
      title: "Operating expenses",
      lines: opexLines,
      subtotal: {
        label: "Total opex",
        tone: "negative",
        cells: totalOpexCells,
      },
    })

    // Final EBIT / Net loss row — rendered as its own section so the table
    // gets the "total" styling (orange band) rather than the "sub" band.
    sections.push({
      title: "Bottom line",
      lines: [
        {
          id: "net-loss",
          label: (ebitCells.total ?? 0) < 0 ? "Net loss" : "Net profit",
          tone: (ebitCells.total ?? 0) < 0 ? "negative" : "positive",
          cells: ebitCells,
        },
      ],
      subtotal: null,
    })
  }

  return sections
}

// ─── Cell math helpers ──────────────────────────────────────────────────

function sumCellSets(sets: PnlLineCells[], columnCount: number): PnlLineCells {
  const values: Array<number | null> = Array.from({ length: columnCount }, () => 0)
  let total = 0
  for (const set of sets) {
    for (let i = 0; i < columnCount; i++) {
      values[i] = (values[i] ?? 0) + (set.values[i] ?? 0)
    }
    total += set.total ?? 0
  }
  return { values, total }
}

function scaleCells(cells: PnlLineCells, factor: number): PnlLineCells {
  return {
    values: cells.values.map((v) => (v == null ? null : Math.round(v * factor))),
    total: cells.total == null ? null : Math.round(cells.total * factor),
  }
}

// ─── Fallback ──────────────────────────────────────────────────────────

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
        You aren&apos;t a member of a foundry yet. Create one or accept a pending invite
        to see your P&amp;L.
      </p>
    </div>
  )
}

