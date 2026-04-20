/**
 * @file money/page.tsx — /money Cockpit landing.
 *
 * @description Entry point for Money V2. Mockup-faithful port of
 * MONEY-MOCKUP-COCKPIT.html. Reads only fields that exist in the current
 * schema — runway / actuals / KPIs / movers render as honest empty states
 * because Xero, Stripe, and Gmail integrations are not yet wired.
 *
 * Real fields bound today:
 *   - money_settings (currency, runway thresholds — seeded defaults)
 *   - xero_connection (connection status + last_sync_at — likely absent)
 *   - plan_line_items (count only — no live actuals engine yet)
 *   - investor_round (active round name / target / close_date)
 *   - investor_pipeline_state (stage counts + commit sums)
 *
 * Every other number (runway weeks, bank balance, cash-out/in, net burn,
 * movers, commitments) renders as "—" with a "Connect Xero to populate"
 * banner — no fabricated specifics.
 *
 * @related
 *   - View:   ./cockpit-view.tsx
 *   - Styles: ./cockpit-v2.css (scoped .mck2)
 *   - Mockup: MONEY-MOCKUP-COCKPIT.html
 *   - Schema: MONEY-SCHEMA.md §2 Tables
 */

import type { Metadata } from "next"

import { createClient } from "@/lib/supabase/server"
import { getFoundryIdCached } from "@/lib/supabase/foundry-context"

import {
  CockpitView,
  type CockpitRaiseSnapshot,
  type CockpitViewProps,
  type CockpitXeroSnapshot,
} from "./cockpit-view"

export const metadata: Metadata = {
  title: "Money · Cockpit",
  description:
    "Runway, burn, and raise progress at a glance. One question — am I OK? — answered in 10 seconds.",
}

export const dynamic = "force-dynamic"

// Default thresholds mirror the money_settings migration defaults (v0.3
// schema §2). Rendered when no money_settings row exists yet for this
// foundry — the row is seeded lazily on first save of any Money surface.
const DEFAULT_SETTINGS: CockpitViewProps["settings"] = {
  currency: "GBP",
  runwayDangerWeeks: 13,
  runwayHealthyWeeks: 18,
}

export default async function MoneyCockpitPage(): Promise<React.ReactNode> {
  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return <NotInFoundry />
  }

  const supabase = await createClient()

  // ── 1. Foundry settings (runway thresholds, currency) ─────────────
  const settings = await loadSettings(supabase, foundryId)

  // ── 2. Xero connection status (drives the source pill + banner) ──
  const xero = await loadXeroStatus(supabase, foundryId)

  // ── 3. Plan line-item count (honest "0 lines yet" vs "N captured") ─
  const planLineItemCount = await loadPlanLineItemCount(supabase, foundryId)

  // ── 4. Active investor round + pipeline snapshot ──────────────────
  const raise = await loadRaiseSnapshot(supabase, foundryId)

  return (
    <CockpitView
      settings={settings}
      xero={xero}
      planLineItemCount={planLineItemCount}
      raise={raise}
    />
  )
}

// ─── Loaders ─────────────────────────────────────────────────────────────

async function loadSettings(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foundryId: string,
): Promise<CockpitViewProps["settings"]> {
  try {
    const { data, error } = await supabase
      .from("money_settings")
      .select("currency, runway_danger_weeks, runway_healthy_weeks")
      .eq("foundry_id", foundryId)
      .maybeSingle()
    if (error || !data) return DEFAULT_SETTINGS
    return {
      currency: data.currency ?? DEFAULT_SETTINGS.currency,
      runwayDangerWeeks:
        data.runway_danger_weeks ?? DEFAULT_SETTINGS.runwayDangerWeeks,
      runwayHealthyWeeks:
        data.runway_healthy_weeks ?? DEFAULT_SETTINGS.runwayHealthyWeeks,
    }
  } catch (err) {
    console.error("[MONEY-COCKPIT] loadSettings failed:", err)
    return DEFAULT_SETTINGS
  }
}

async function loadXeroStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foundryId: string,
): Promise<CockpitXeroSnapshot> {
  try {
    const { data, error } = await supabase
      .from("xero_connection")
      .select("organisation_name, last_sync_at, sync_state")
      .eq("foundry_id", foundryId)
      .maybeSingle()
    if (error || !data) {
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
    console.error("[MONEY-COCKPIT] loadXeroStatus failed:", err)
    return {
      connected: false,
      organisationName: null,
      lastSyncAt: null,
      syncState: null,
    }
  }
}

async function loadPlanLineItemCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foundryId: string,
): Promise<number> {
  try {
    const { count, error } = await supabase
      .from("plan_line_items")
      .select("id", { count: "exact", head: true })
      .eq("foundry_id", foundryId)
      .is("archived_at", null)
    if (error) return 0
    return count ?? 0
  } catch (err) {
    console.error("[MONEY-COCKPIT] loadPlanLineItemCount failed:", err)
    return 0
  }
}

async function loadRaiseSnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foundryId: string,
): Promise<CockpitRaiseSnapshot | null> {
  try {
    // Active round — at most one per foundry (partial unique constraint).
    const { data: round, error: roundError } = await supabase
      .from("investor_round")
      .select("id, name, target_cents, currency, close_date, state")
      .eq("foundry_id", foundryId)
      .in("state", ["active", "closing"])
      .maybeSingle()
    if (roundError || !round) return null

    // Pipeline snapshot for this round (stage counts + commit sums).
    const { data: pipeline, error: pipelineError } = await supabase
      .from("investor_pipeline_state")
      .select("current_stage, commit_amount_cents")
      .eq("foundry_id", foundryId)
      .eq("round_id", round.id)
      .is("archived_at", null)
    if (pipelineError) {
      // Return the round shell — pipeline just shows zeros.
      return emptyPipelineRaise(round)
    }

    const stageCounts = {
      target: 0,
      researching: 0,
      contacted: 0,
      meeting: 0,
      due_diligence: 0,
      verbal: 0,
      closed: 0,
      passed: 0,
    }
    let verbalCents = 0
    let closedCents = 0
    for (const row of pipeline ?? []) {
      const stage = row.current_stage as keyof typeof stageCounts
      if (stage in stageCounts) stageCounts[stage] += 1
      if (stage === "verbal") verbalCents += row.commit_amount_cents ?? 0
      if (stage === "closed") closedCents += row.commit_amount_cents ?? 0
    }

    const weeksToClose =
      round.close_date != null
        ? Math.round(
            (new Date(round.close_date).getTime() - Date.now()) /
              (7 * 24 * 60 * 60 * 1000),
          )
        : null

    return {
      name: round.name,
      targetCents: round.target_cents,
      currency: round.currency ?? "GBP",
      weeksToClose,
      closeDateIso: round.close_date,
      verbalCents,
      closedCents,
      stageCounts,
    }
  } catch (err) {
    console.error("[MONEY-COCKPIT] loadRaiseSnapshot failed:", err)
    return null
  }
}

function emptyPipelineRaise(round: {
  name: string
  target_cents: number
  currency: string
  close_date: string
}): CockpitRaiseSnapshot {
  const weeksToClose = round.close_date
    ? Math.round(
        (new Date(round.close_date).getTime() - Date.now()) /
          (7 * 24 * 60 * 60 * 1000),
      )
    : null
  return {
    name: round.name,
    targetCents: round.target_cents,
    currency: round.currency ?? "GBP",
    weeksToClose,
    closeDateIso: round.close_date,
    verbalCents: 0,
    closedCents: 0,
    stageCounts: {
      target: 0,
      researching: 0,
      contacted: 0,
      meeting: 0,
      due_diligence: 0,
      verbal: 0,
      closed: 0,
      passed: 0,
    },
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
        pending invite to see your Cockpit.
      </p>
    </div>
  )
}
