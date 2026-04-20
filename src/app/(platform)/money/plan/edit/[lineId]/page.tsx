/**
 * @file money/plan/edit/[lineId]/page.tsx — Line-item editor route.
 *
 * @description Entry point for the Plan line-item editor. Mockup-faithful
 * port of MONEY-MOCKUP-LINE-ITEM-EDITOR.html. Reads a single
 * `plan_line_items` row by id (scoped to the caller's foundry) and hands
 * it to the view. Save-back wiring ships in the next round — the view
 * renders the form in a read-only-but-visually-live state for now.
 *
 * Routes return 404 when the line doesn't exist or is owned by a different
 * foundry — RLS would already reject the query, but we double-check the
 * foundry_id match defensively.
 *
 * @related
 *   - View:   ./line-editor-view.tsx
 *   - Styles: ./line-editor-v2.css (scoped .lie2)
 *   - Mockup: MONEY-MOCKUP-LINE-ITEM-EDITOR.html
 *   - Schema: MONEY-SCHEMA.md §2 — plan_line_items
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getFoundryIdCached } from "@/lib/supabase/foundry-context"

import {
  LineEditorView,
  type EditorCategory,
  type EditorDirection,
  type EditorFrequency,
} from "./line-editor-view"

export const metadata: Metadata = {
  title: "Money · Plan · Edit line",
  description: "Edit a Plan line — name, direction, category, amount, cadence and accounting export.",
}

export const dynamic = "force-dynamic"

const VALID_CATEGORIES: readonly EditorCategory[] = [
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
const VALID_FREQUENCIES: readonly EditorFrequency[] = [
  "one_off",
  "weekly",
  "monthly",
  "quarterly",
  "annual",
  "variable",
]

interface PageProps {
  params: Promise<{ lineId: string }>
}

export default async function MoneyPlanEditPage({
  params,
}: PageProps): Promise<React.ReactNode> {
  const { lineId } = await params

  const foundryId = await getFoundryIdCached()
  if (!foundryId) return <NotInFoundry />

  const supabase = await createClient()

  const { data, error } = await supabase
    .from("plan_line_items")
    .select(
      "id, name, direction, category, amount_cents, currency, frequency, effective_from, effective_to, probability_pct, sensitivity_pct, annual_uplift_pct, vat_treatment, xero_account_code, accounting_tags, project_allocation, notes, source, created_at, updated_at, foundry_id",
    )
    .eq("id", lineId)
    .eq("foundry_id", foundryId)
    .is("archived_at", null)
    .maybeSingle()

  if (error) {
    console.error("[MONEY-PLAN-EDIT] load failed:", error)
    notFound()
  }
  if (!data) notFound()

  // Narrow enum fields defensively. Rows with out-of-spec values fall back
  // to safe defaults so the page never blows up on legacy data.
  const direction: EditorDirection =
    data.direction === "in" ? "in" : "out"
  const category: EditorCategory = (VALID_CATEGORIES as readonly string[]).includes(
    data.category,
  )
    ? (data.category as EditorCategory)
    : "other"
  const frequency: EditorFrequency = (VALID_FREQUENCIES as readonly string[]).includes(
    data.frequency,
  )
    ? (data.frequency as EditorFrequency)
    : "monthly"

  return (
    <LineEditorView
      line={{
        id: data.id,
        name: data.name,
        direction,
        category,
        amountCents: data.amount_cents,
        currency: data.currency ?? "GBP",
        frequency,
        effectiveFromIso: data.effective_from,
        effectiveToIso: data.effective_to,
        probabilityPct: data.probability_pct ?? 100,
        sensitivityPct: data.sensitivity_pct ?? 5,
        annualUpliftPct: data.annual_uplift_pct ?? 0,
        vatTreatment: data.vat_treatment ?? "standard_20",
        xeroAccountCode: data.xero_account_code,
        accountingTags: data.accounting_tags ?? [],
        projectAllocation: data.project_allocation,
        notes: data.notes,
        source: data.source ?? "manual",
        createdAtIso: data.created_at,
        updatedAtIso: data.updated_at,
      }}
    />
  )
}

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
        pending invite to edit plan lines.
      </p>
    </div>
  )
}
