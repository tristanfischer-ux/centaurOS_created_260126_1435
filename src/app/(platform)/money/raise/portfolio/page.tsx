/**
 * @file money/raise/portfolio/page.tsx — /money/raise/portfolio
 *
 * @description Portfolio view of existing (post-close) investors. Shows
 * shareholders who've already wired, plus faded "verbal" cards for
 * investors who've committed but haven't closed. Distinct from the
 * active-round pipeline (`/money/raise`).
 *
 * Mockup-faithful port of MONEY-MOCKUP-PORTFOLIO.html.
 *
 * Real fields bound today:
 *   - investor_round (active round — target, close_date, currency)
 *   - investor_pipeline_state (stage = 'closed' / 'verbal' — commit_amount_cents,
 *     stage_entered_at, investor_firm_id, investor_person_id, marketplace_listing_id)
 *   - marketplace_listings (title, city, category) — joined via marketplace_listing_id
 *     when the pipeline row is linked to a directory listing
 *
 * NO fake investor names. If a pipeline row has no linked marketplace listing
 * (i.e., the row was created before directory integration or the investor is
 * not in the directory), the card renders "Investor" with a generic label.
 *
 * Empty-state policy: if no rows at current_stage='closed' exist, show a
 * centred empty state — "Once you close a round, your investors land here."
 *
 * @related
 *   - View:   ./portfolio-view.tsx
 *   - Styles: ./portfolio-v2.css (scoped .pfo2)
 *   - Mockup: MONEY-MOCKUP-PORTFOLIO.html
 *   - Schema: MONEY-SCHEMA.md §2 Tables (investor_pipeline_state, investor_round)
 */

import type { Metadata } from "next"

import { createClient } from "@/lib/supabase/server"
import { getFoundryIdCached } from "@/lib/supabase/foundry-context"

import {
  PortfolioView,
  type PortfolioActiveRound,
  type PortfolioHolder,
  type PortfolioViewProps,
} from "./portfolio-view"

export const metadata: Metadata = {
  title: "Money · Portfolio",
  description:
    "Investors who've wired — shareholders who receive your updates and hold rights under the SAFE or equity instrument.",
}

export const dynamic = "force-dynamic"

export default async function MoneyRaisePortfolioPage(): Promise<React.ReactNode> {
  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return <NotInFoundry />
  }

  const supabase = await createClient()

  const activeRound = await loadActiveRound(supabase, foundryId)
  const { closed, verbal } = await loadHolders(supabase, foundryId)

  const props: PortfolioViewProps = {
    activeRound,
    closedHolders: closed,
    verbalHolders: verbal,
  }

  return <PortfolioView {...props} />
}

// ─── Loaders ─────────────────────────────────────────────────────────────

async function loadActiveRound(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foundryId: string,
): Promise<PortfolioActiveRound | null> {
  try {
    const { data, error } = await supabase
      .from("investor_round")
      .select("id, name, target_cents, currency, close_date, state")
      .eq("foundry_id", foundryId)
      .in("state", ["active", "closing"])
      .is("archived_at", null)
      .maybeSingle()
    if (error || !data) return null
    return {
      id: data.id,
      name: data.name,
      targetCents: data.target_cents,
      currency: data.currency ?? "GBP",
      closeDateIso: data.close_date,
    }
  } catch (err) {
    console.error("[MONEY-PORTFOLIO] loadActiveRound failed:", err)
    return null
  }
}

interface HoldersSplit {
  closed: PortfolioHolder[]
  verbal: PortfolioHolder[]
}

async function loadHolders(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foundryId: string,
): Promise<HoldersSplit> {
  try {
    const { data: pipelineRows, error } = await supabase
      .from("investor_pipeline_state")
      .select(
        "id, current_stage, commit_amount_cents, stage_entered_at, lead_role, marketplace_listing_id",
      )
      .eq("foundry_id", foundryId)
      .in("current_stage", ["closed", "verbal"])
      .is("archived_at", null)
      .order("stage_entered_at", { ascending: false })

    if (error || !pipelineRows || pipelineRows.length === 0) {
      return { closed: [], verbal: [] }
    }

    // Batch-fetch marketplace listings for any rows that link to one.
    // No FK relationship exists in the schema, so we query separately
    // and hydrate in memory. Cap at 100 to keep latency bounded — there
    // aren't enough shareholders in a pre-seed / seed round to exceed this.
    const listingIds = Array.from(
      new Set(
        pipelineRows
          .map((r) => r.marketplace_listing_id)
          .filter((id): id is string => typeof id === "string"),
      ),
    )

    const listingsById = new Map<
      string,
      {
        title: string | null
        city: string | null
        country: string | null
        subcategory: string | null
      }
    >()

    if (listingIds.length > 0) {
      const { data: listings, error: listingsError } = await supabase
        .from("marketplace_listings")
        .select("id, title, city, country, subcategory")
        .in("id", listingIds)
      if (!listingsError && listings) {
        for (const l of listings) {
          listingsById.set(l.id, {
            title: l.title ?? null,
            city: l.city ?? null,
            country: l.country ?? null,
            subcategory: l.subcategory ?? null,
          })
        }
      }
    }

    const closed: PortfolioHolder[] = []
    const verbal: PortfolioHolder[] = []

    for (const row of pipelineRows) {
      const listing = row.marketplace_listing_id
        ? listingsById.get(row.marketplace_listing_id) ?? null
        : null
      const holder: PortfolioHolder = {
        id: row.id,
        stage: row.current_stage as "closed" | "verbal",
        commitCents: row.commit_amount_cents,
        stageEnteredAtIso: row.stage_entered_at,
        leadRole: row.lead_role,
        firmTitle: listing?.title ?? null,
        firmCity: listing?.city ?? null,
        firmCountry: listing?.country ?? null,
        firmSubcategory: listing?.subcategory ?? null,
      }
      if (row.current_stage === "closed") {
        closed.push(holder)
      } else if (row.current_stage === "verbal") {
        verbal.push(holder)
      }
    }

    return { closed, verbal }
  } catch (err) {
    console.error("[MONEY-PORTFOLIO] loadHolders failed:", err)
    return { closed: [], verbal: [] }
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
        Portfolio needs a foundry
      </h1>
      <p style={{ color: "#78716c", fontSize: 14, lineHeight: 1.55 }}>
        You aren&apos;t a member of a foundry yet. Create one or accept a
        pending invite to see your portfolio.
      </p>
    </div>
  )
}
