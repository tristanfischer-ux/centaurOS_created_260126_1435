/**
 * @file money/transactions/[txId]/page.tsx — /money/transactions/:txId drill.
 *
 * @description Mockup-faithful port of MONEY-MOCKUP-TRANSACTION-DRILL.html.
 * Server component that resolves a single xero_transaction row by id, then
 * delegates rendering to TransactionDrillView (scoped `.txd2` CSS).
 *
 * Route params:
 *   - txId:  xero_transaction.id (uuid)
 *
 * Data policy (per brief — only real Supabase data, honest empties otherwise):
 *   - Real fields bound today (from xero_transaction):
 *       transaction_date, description, vendor_name, amount_cents, currency,
 *       xero_account_code, assigned_category, category_override,
 *       category_override_by_user_id, flagged, synced_at.
 *   - If the row can't be found (or no Xero connection exists for the foundry)
 *     → render the 404-style "connect a data source" empty page instead of a
 *     404, so the "Money needs a data source" message stays visible.
 *   - The surrounding month-level variance narrative, specialist insight card,
 *     "misclassified" rollup, per-category totals across 217 transactions,
 *     suggested-action strip — those are NOT rendered as fabricated content.
 *     We show the single transaction that was clicked + honest "data source
 *     required" callouts for the cross-transaction views.
 */

import { notFound } from "next/navigation"
import type { Metadata } from "next"
import Link from "next/link"

import { createClient } from "@/lib/supabase/server"
import { getFoundryIdCached } from "@/lib/supabase/foundry-context"

import {
  TransactionDrillView,
  type TransactionDrillRow,
  type TransactionDrillXero,
} from "./transaction-drill-view"

export const dynamic = "force-dynamic"

export async function generateMetadata(
  { params }: { params: Promise<{ txId: string }> },
): Promise<Metadata> {
  const { txId } = await params
  const foundryId = await getFoundryIdCached()
  if (!foundryId) return { title: "Transaction · Money" }
  const supabase = await createClient()
  const { data } = await supabase
    .from("xero_transaction")
    .select("description")
    .eq("foundry_id", foundryId)
    .eq("id", txId)
    .maybeSingle()
  return { title: `${data?.description ?? "Transaction"} · Money` }
}

// ─── Page ────────────────────────────────────────────────────────────────

export default async function MoneyTransactionDrillPage({
  params,
}: {
  params: Promise<{ txId: string }>
}): Promise<React.ReactNode> {
  const { txId } = await params

  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return <NoFoundryEmpty />
  }

  const supabase = await createClient()

  // ── 1. Resolve the Xero connection (if any) ───────────────────────
  const xero = await loadXero(supabase, foundryId)

  // ── 2. Load the transaction row ───────────────────────────────────
  const { data: row, error } = await supabase
    .from("xero_transaction")
    .select(
      "id, transaction_date, description, vendor_name, amount_cents, currency, xero_account_code, assigned_category, category_override, flagged, synced_at",
    )
    .eq("foundry_id", foundryId)
    .eq("id", txId)
    .maybeSingle()

  // Two distinct "not populated" cases:
  //   (a) No Xero connection wired → show the connect-a-source empty instead
  //       of a 404. The founder landed here from a stale link.
  //   (b) Xero connected but row not found → 404 is correct.
  if (error || !row) {
    if (!xero.connected) {
      return <NoDataSourceEmpty />
    }
    notFound()
  }

  const drill: TransactionDrillRow = {
    id: row.id,
    transactionDate: row.transaction_date,
    description: row.description,
    vendorName: row.vendor_name ?? null,
    amountCents: row.amount_cents,
    currency: row.currency ?? "GBP",
    xeroAccountCode: row.xero_account_code,
    assignedCategory: row.assigned_category,
    categoryOverride: row.category_override ?? null,
    flagged: row.flagged ?? null,
    syncedAt: row.synced_at,
  }

  return <TransactionDrillView row={drill} xero={xero} />
}

// ─── Loaders ─────────────────────────────────────────────────────────────

async function loadXero(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foundryId: string,
): Promise<TransactionDrillXero> {
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
    console.error("[MONEY-TX-DRILL] loadXero failed:", err)
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
        pending invite to open this transaction.
      </p>
    </div>
  )
}

// ─── Empty: no data source wired ─────────────────────────────────────────

function NoDataSourceEmpty(): React.ReactElement {
  return (
    <div
      style={{
        padding: "48px 32px",
        maxWidth: 720,
        margin: "48px auto",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          margin: "0 auto 16px",
          borderRadius: "50%",
          background: "rgba(255,69,0,0.10)",
          color: "#ff4500",
          fontSize: 20,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
        }}
      >
        £
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
        No transactions imported
      </h1>
      <p
        style={{
          color: "#78716c",
          fontSize: 14,
          lineHeight: 1.6,
          maxWidth: 480,
          margin: "0 auto 20px",
        }}
      >
        Connect Xero or import a CSV first, then open any row from the plan
        variance view to drill into it.
      </p>
      <div
        style={{
          display: "inline-flex",
          gap: 10,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        <Link
          href="/money/connect"
          style={{
            display: "inline-block",
            padding: "8px 16px",
            borderRadius: 6,
            background: "#ff4500",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Connect a data source
        </Link>
        <Link
          href="/money/import"
          style={{
            display: "inline-block",
            padding: "8px 16px",
            borderRadius: 6,
            border: "1px solid #d6d3d1",
            color: "#1c1917",
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Import CSV
        </Link>
      </div>
    </div>
  )
}
