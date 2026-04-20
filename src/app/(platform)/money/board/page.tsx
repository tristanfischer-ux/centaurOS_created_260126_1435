/**
 * @file money/board/page.tsx — /money/board Board pack / Investor update.
 *
 * @description Entry point for Money Board pack. Mockup-faithful port of
 * MONEY-MOCKUP-BOARDPACK.html. Reads only real fields from Supabase —
 * active investor_round (name / target / stage counts / commit sums),
 * foundry-level currency, pipeline recipient count (investors at stages
 * meeting / due_diligence / verbal / closed), last-sent investor_update
 * row for cadence copy, and past investor_update history with recipient
 * aggregates.
 *
 * Empty-state policy (per feedback_only_real_supabase_data.md): any
 * field that can't be sourced from live data today renders an honest
 * empty line — never a fabricated specific (no seed "Ada Chen" /
 * "NimFarm" / "£312k"). The banner at the top of the view mirrors the
 * Forge V2 Export beta banner: "Exports run a dry run today".
 *
 * @related
 *   - View:   ./board-view.tsx
 *   - Styles: ./board-v2.css (scoped .bp2)
 *   - Mockup: MONEY-MOCKUP-BOARDPACK.html
 *   - Schema: MONEY-SCHEMA.md §investor_update + §investor_round
 *   - Reference impl: src/app/(platform)/the-forge-v2/projects/[id]/export/
 */

import type { Metadata } from "next"

import { createClient } from "@/lib/supabase/server"
import { getFoundryIdCached } from "@/lib/supabase/foundry-context"

import { BoardView, type BoardViewProps } from "./board-view"

export const metadata: Metadata = {
  title: "Money · Board pack",
  description:
    "Draft this month's investor update — auto-filled from Cockpit, Plan and Raise.",
}

export const dynamic = "force-dynamic"

export default async function MoneyBoardPage(): Promise<React.ReactNode> {
  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return <NotInFoundry />
  }

  const supabase = await createClient()

  // ── 1. Foundry row (name) ───────────────────────────────────────────
  const foundry = await loadFoundry(supabase, foundryId)

  // ── 2. Money settings currency (defaults to GBP) ───────────────────
  const currency = await loadCurrency(supabase, foundryId, "GBP")

  // ── 3. Active raise round + pipeline snapshot ──────────────────────
  const round = await loadActiveRound(supabase, foundryId)

  // ── 4. Recipient count — investors at meeting-or-later stages ──────
  const pipelineRecipientCount = await loadPipelineRecipientCount(supabase, foundryId)

  // ── 5. Past investor updates + last-sent timestamp ─────────────────
  const { pastUpdates, lastSentIso } = await loadPastUpdates(supabase, foundryId)

  // ── 6. Sender email from authenticated user ────────────────────────
  const senderEmail = await loadSenderEmail(supabase)

  const monthLabel = currentMonthLabel()

  const viewProps: BoardViewProps = {
    foundry: {
      id: foundryId,
      name: foundry?.name ?? "Your foundry",
    },
    monthLabel,
    currency,
    round,
    pipelineRecipientCount,
    pastUpdates,
    lastSentIso,
    senderEmail,
  }

  return <BoardView {...viewProps} />
}

// ─── Loaders ───────────────────────────────────────────────────────────

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

async function loadFoundry(
  supabase: SupabaseClient,
  foundryId: string,
): Promise<{ name: string } | null> {
  try {
    const { data, error } = await supabase
      .from("foundries")
      .select("name")
      .eq("id", foundryId)
      .maybeSingle()
    if (error || !data) return null
    return { name: data.name as string }
  } catch (err) {
    console.error("[MONEY-BOARD] loadFoundry failed:", err)
    return null
  }
}

async function loadCurrency(
  supabase: SupabaseClient,
  foundryId: string,
  fallback: string,
): Promise<string> {
  try {
    const { data, error } = await supabase
      .from("money_settings")
      .select("currency")
      .eq("foundry_id", foundryId)
      .maybeSingle()
    if (error || !data || !data.currency) return fallback
    return data.currency
  } catch (err) {
    console.error("[MONEY-BOARD] loadCurrency failed:", err)
    return fallback
  }
}

async function loadActiveRound(
  supabase: SupabaseClient,
  foundryId: string,
): Promise<BoardViewProps["round"]> {
  try {
    const { data: round, error: roundError } = await supabase
      .from("investor_round")
      .select("id, name, target_cents, currency, close_date, state")
      .eq("foundry_id", foundryId)
      .in("state", ["active", "closing"])
      .maybeSingle()
    if (roundError || !round) return null

    const { data: pipeline, error: pipelineError } = await supabase
      .from("investor_pipeline_state")
      .select("current_stage, commit_amount_cents")
      .eq("foundry_id", foundryId)
      .eq("round_id", round.id)
      .is("archived_at", null)
    if (pipelineError) {
      return {
        id: round.id as string,
        name: round.name as string,
        targetCents: (round.target_cents as number) ?? 0,
        currency: (round.currency as string) ?? "GBP",
        closeDateIso: (round.close_date as string) ?? null,
        weeksToClose: weeksFromNow(round.close_date as string | null),
        verbalCents: 0,
        closedCents: 0,
        stageCounts: emptyStageCounts(),
      }
    }

    const stageCounts = emptyStageCounts()
    let verbalCents = 0
    let closedCents = 0
    for (const row of pipeline ?? []) {
      const stage = row.current_stage as keyof typeof stageCounts
      if (stage in stageCounts) stageCounts[stage] += 1
      if (stage === "verbal") verbalCents += (row.commit_amount_cents as number) ?? 0
      if (stage === "closed") closedCents += (row.commit_amount_cents as number) ?? 0
    }

    return {
      id: round.id as string,
      name: round.name as string,
      targetCents: (round.target_cents as number) ?? 0,
      currency: (round.currency as string) ?? "GBP",
      closeDateIso: (round.close_date as string) ?? null,
      weeksToClose: weeksFromNow(round.close_date as string | null),
      verbalCents,
      closedCents,
      stageCounts,
    }
  } catch (err) {
    console.error("[MONEY-BOARD] loadActiveRound failed:", err)
    return null
  }
}

async function loadPipelineRecipientCount(
  supabase: SupabaseClient,
  foundryId: string,
): Promise<number> {
  try {
    const { count, error } = await supabase
      .from("investor_pipeline_state")
      .select("id", { count: "exact", head: true })
      .eq("foundry_id", foundryId)
      .in("current_stage", ["meeting", "due_diligence", "verbal", "closed"])
      .is("archived_at", null)
    if (error) return 0
    return count ?? 0
  } catch (err) {
    console.error("[MONEY-BOARD] loadPipelineRecipientCount failed:", err)
    return 0
  }
}

async function loadPastUpdates(
  supabase: SupabaseClient,
  foundryId: string,
): Promise<{ pastUpdates: BoardViewProps["pastUpdates"]; lastSentIso: string | null }> {
  try {
    const { data, error } = await supabase
      .from("investor_update")
      .select(
        "id, month_label, sent_at, aggregate_delivered, aggregate_opened, aggregate_replied",
      )
      .eq("foundry_id", foundryId)
      .eq("state", "sent")
      .order("sent_at", { ascending: false })
      .limit(3)
    if (error || !data) return { pastUpdates: [], lastSentIso: null }

    const pastUpdates: BoardViewProps["pastUpdates"] = data.map((row) => ({
      id: row.id as string,
      monthLabel: (row.month_label as string) ?? "—",
      recipientCount: (row.aggregate_delivered as number) ?? 0,
      openedCount: (row.aggregate_opened as number) ?? 0,
      repliedCount: (row.aggregate_replied as number) ?? 0,
    }))

    const lastSentIso = data.length > 0 ? ((data[0].sent_at as string | null) ?? null) : null

    return { pastUpdates, lastSentIso }
  } catch (err) {
    console.error("[MONEY-BOARD] loadPastUpdates failed:", err)
    return { pastUpdates: [], lastSentIso: null }
  }
}

async function loadSenderEmail(
  supabase: SupabaseClient,
): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getUser()
    if (error || !data?.user) return null
    return data.user.email ?? null
  } catch (err) {
    console.error("[MONEY-BOARD] loadSenderEmail failed:", err)
    return null
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────

function emptyStageCounts(): NonNullable<BoardViewProps["round"]>["stageCounts"] {
  return {
    target: 0,
    researching: 0,
    contacted: 0,
    meeting: 0,
    due_diligence: 0,
    verbal: 0,
    closed: 0,
    passed: 0,
  }
}

function weeksFromNow(iso: string | null): number | null {
  if (!iso) return null
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return null
  return Math.round((then - Date.now()) / (7 * 24 * 60 * 60 * 1000))
}

function currentMonthLabel(): string {
  return new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })
}

// ─── Fallback: user not in a foundry ──────────────────────────────────

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
        You aren&apos;t a member of a foundry yet. Create one or accept a pending invite to
        draft your first investor update.
      </p>
    </div>
  )
}
