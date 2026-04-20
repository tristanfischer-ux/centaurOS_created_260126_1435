/**
 * @file money/costs/[costId]/page.tsx — /money/costs/:costId cost-detail drill.
 *
 * @description Mockup-faithful port of MONEY-MOCKUP-COST-DETAIL.html. Server
 * component that resolves a single plan_line_items row by id, then delegates
 * rendering to CostDetailView (scoped `.cd2` CSS).
 *
 * Route params:
 *   - costId:  plan_line_items.id (uuid)
 *
 * Data policy (per brief — only real Supabase data, honest empties otherwise):
 *   - Real fields bound today (from plan_line_items):
 *       name, direction, category, amount_cents, currency, frequency,
 *       effective_from, effective_to, xero_account_code, accounting_tags,
 *       owner_user_id (resolved to profile full_name), notes, source.
 *   - Xero connection status (from xero_connection) drives the "last synced"
 *     footer row on the rail — not fabricated when absent.
 *   - Everything else from the mockup (actual spend chart, assumptions rows,
 *     sensitivity table, linked objectives/tasks, audit trail, specialist
 *     levers quote, related work) renders as honest empty states because
 *     those engines / integrations have not been built.
 *   - If the row can't be loaded OR no foundry context → 404-style empty
 *     with the "connect a data source" link back to /money.
 */

import { notFound } from "next/navigation"
import type { Metadata } from "next"

import { createClient } from "@/lib/supabase/server"
import { getFoundryIdCached } from "@/lib/supabase/foundry-context"

import {
  CostDetailView,
  type CostDetailLineItem,
  type CostDetailOwner,
  type CostDetailXero,
} from "./cost-detail-view"

export const dynamic = "force-dynamic"

export async function generateMetadata(
  { params }: { params: Promise<{ costId: string }> },
): Promise<Metadata> {
  const { costId } = await params
  const foundryId = await getFoundryIdCached()
  if (!foundryId) return { title: "Cost · Money" }
  const supabase = await createClient()
  const { data } = await supabase
    .from("plan_line_items")
    .select("name")
    .eq("foundry_id", foundryId)
    .eq("id", costId)
    .maybeSingle()
  return { title: `${data?.name ?? "Cost"} · Money` }
}

// ─── Page ────────────────────────────────────────────────────────────────

export default async function MoneyCostDetailPage({
  params,
}: {
  params: Promise<{ costId: string }>
}): Promise<React.ReactNode> {
  const { costId } = await params

  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return <NoFoundryEmpty />
  }

  const supabase = await createClient()

  // ── 1. Plan line item (the cost row being drilled) ───────────────
  const { data: line, error: lineError } = await supabase
    .from("plan_line_items")
    .select(
      "id, name, direction, category, amount_cents, currency, frequency, effective_from, effective_to, probability_pct, xero_account_code, accounting_tags, owner_user_id, notes, source, created_at, updated_at",
    )
    .eq("foundry_id", foundryId)
    .eq("id", costId)
    .is("archived_at", null)
    .maybeSingle()

  if (lineError || !line) notFound()

  // ── 2. Owner display name (optional — soft-fetched) ──────────────
  const owner = await loadOwner(supabase, line.owner_user_id)

  // ── 3. Xero connection status (drives "last sync" in the rail) ──
  const xero = await loadXero(supabase, foundryId)

  const lineItem: CostDetailLineItem = {
    id: line.id,
    name: line.name,
    direction: (line.direction === "in" ? "in" : "out") as "in" | "out",
    category: line.category,
    amountCents: line.amount_cents,
    currency: line.currency ?? "GBP",
    frequency: line.frequency,
    effectiveFrom: line.effective_from,
    effectiveTo: line.effective_to ?? null,
    probabilityPct: line.probability_pct ?? 100,
    xeroAccountCode: line.xero_account_code ?? null,
    accountingTags: line.accounting_tags ?? [],
    notes: line.notes ?? null,
    source: line.source ?? "manual",
    createdAt: line.created_at,
    updatedAt: line.updated_at,
  }

  return <CostDetailView line={lineItem} owner={owner} xero={xero} />
}

// ─── Loaders ─────────────────────────────────────────────────────────────

async function loadOwner(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ownerUserId: string | null,
): Promise<CostDetailOwner | null> {
  if (!ownerUserId) return null
  try {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", ownerUserId)
      .maybeSingle()
    if (!data) return null
    return {
      id: data.id,
      name: data.full_name ?? data.email ?? "Unknown",
    }
  } catch (err) {
    console.error("[MONEY-COST-DETAIL] loadOwner failed:", err)
    return null
  }
}

async function loadXero(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foundryId: string,
): Promise<CostDetailXero> {
  try {
    const { data } = await supabase
      .from("xero_connection")
      .select("organisation_name, last_sync_at, sync_state")
      .eq("foundry_id", foundryId)
      .maybeSingle()
    if (!data) {
      return {
        connected: false,
        organisationName: null,
        lastSyncAt: null,
        syncState: null,
      }
    }
    return {
      connected: true,
      organisationName: data.organisation_name,
      lastSyncAt: data.last_sync_at,
      syncState: data.sync_state,
    }
  } catch (err) {
    console.error("[MONEY-COST-DETAIL] loadXero failed:", err)
    return {
      connected: false,
      organisationName: null,
      lastSyncAt: null,
      syncState: null,
    }
  }
}

// ─── Empty: no foundry ───────────────────────────────────────────────────

function NoFoundryEmpty(): React.ReactElement {
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
        pending invite to open this cost line.
      </p>
    </div>
  )
}
