/**
 * @file money/raise/page.tsx — /money/raise
 *
 * @description Money V2 · Raise landing. Mockup-faithful port of
 * MONEY-MOCKUP-RAISE.html. Reads only fields that already exist in Supabase:
 *   - `investor_round` (most recent active/closing round for this foundry)
 *   - `investor_pipeline_state` (pipeline rows in that round, joined to
 *     `marketplace_listings` for firm display names — no fabricated names)
 *   - `investor_thesis` (active version, for matched-count & edit link)
 *
 * Empty-state policy (MANDATORY):
 *   - No active round → show "Create your first round" empty state + CTA to
 *     the sibling agent's `/money/raise/rounds/new` wizard.
 *   - Active round but no pipeline rows → show empty kanban columns + an
 *     "Add your first investor" CTA pointing at the investor-search surface.
 *   - We NEVER fabricate investor names. Every card either resolves to a real
 *     marketplace_listings.title or renders as "Unnamed investor" with a link
 *     to open the row.
 *
 * Scope clause (parallel sub-agent safety):
 *   - Writes ONLY to files within this `/money/raise/*` subtree and the
 *     `/money/raise/investors/[investorId]/*` detail route.
 *   - Does NOT touch `/money/raise/rounds/*` (sibling agent owns that).
 *   - Does NOT touch `/money/raise/portfolio/*`, `/money/raise/thesis/*`,
 *     `/money/raise/pitch/*`, `/cash-burn/*`, sidebar, or shared types.
 *
 * @related
 *   - View:   ./raise-view.tsx
 *   - Styles: ./raise-v2.css (scoped `.rse2`)
 *   - Mockup: MONEY-MOCKUP-RAISE.html
 *   - Schema: MONEY-SCHEMA.md §investor_round + §investor_pipeline_state
 */

import type { Metadata } from "next"
import Link from "next/link"

import { createClient } from "@/lib/supabase/server"
import { getFoundryIdCached } from "@/lib/supabase/foundry-context"

import {
    RaiseView,
    type RaiseActiveRound,
    type RaisePipelineCard,
    type RaiseThesisSummary,
    type RaiseViewProps,
} from "./raise-view"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Raise · Money",
    description:
        "Investor pipeline, active round progress, and next actions for this round.",
}

// All seven "live" pipeline stages plus "passed". Kanban renders the live
// seven; passed sits to the right. Stages must mirror the CHECK constraint
// on investor_pipeline_state.current_stage (MONEY-SCHEMA §2).
const LIVE_STAGES = [
    "target",
    "researching",
    "contacted",
    "meeting",
    "due_diligence",
    "verbal",
    "closed",
] as const

export default async function MoneyRaisePage(): Promise<React.ReactNode> {
    const foundryId = await getFoundryIdCached()
    if (!foundryId) {
        return <NotInFoundry />
    }

    const supabase = await createClient()

    // ── 1. Active round (most recent opened active/closing) ─────────
    const round = await loadActiveRound(supabase, foundryId)

    // ── 2. Pipeline cards (only if a round exists) ──────────────────
    const pipeline: RaisePipelineCard[] = round
        ? await loadPipelineCards(supabase, foundryId, round.id)
        : []

    // ── 3. Thesis summary (active version — small surface) ─────────
    const thesis = await loadThesisSummary(supabase, foundryId)

    const viewProps: RaiseViewProps = {
        round,
        pipeline,
        thesis,
    }

    return <RaiseView {...viewProps} />
}

// ─── Loaders ─────────────────────────────────────────────────────────────

async function loadActiveRound(
    supabase: Awaited<ReturnType<typeof createClient>>,
    foundryId: string,
): Promise<RaiseActiveRound | null> {
    try {
        const { data, error } = await supabase
            .from("investor_round")
            .select(
                "id, name, stage, target_cents, currency, close_date, instrument, cap_cents, discount_pct, state, opened_at",
            )
            .eq("foundry_id", foundryId)
            .in("state", ["active", "closing"])
            .order("opened_at", { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle()
        if (error || !data) return null
        return {
            id: data.id,
            name: data.name,
            stage: data.stage,
            targetCents: data.target_cents,
            currency: data.currency ?? "GBP",
            closeDateIso: data.close_date,
            instrument: data.instrument,
            capCents: data.cap_cents,
            discountPct: data.discount_pct,
            state: data.state,
        }
    } catch (err) {
        console.error("[MONEY-RAISE] loadActiveRound failed:", err)
        return null
    }
}

async function loadPipelineCards(
    supabase: Awaited<ReturnType<typeof createClient>>,
    foundryId: string,
    roundId: string,
): Promise<RaisePipelineCard[]> {
    try {
        const { data: rows, error } = await supabase
            .from("investor_pipeline_state")
            .select(
                "id, current_stage, commit_amount_cents, stage_entered_at, probability_pct, lead_role, marketplace_listing_id, match_score_cached",
            )
            .eq("foundry_id", foundryId)
            .eq("round_id", roundId)
            .is("archived_at", null)
            .order("stage_entered_at", { ascending: false, nullsFirst: false })

        if (error || !rows || rows.length === 0) return []

        // Resolve firm names from marketplace_listings where available. We
        // only pull columns needed for card display — no seed/fabricated fields.
        const listingIds = rows
            .map((r) => r.marketplace_listing_id)
            .filter((x): x is string => typeof x === "string" && x.length > 0)

        const listingById = new Map<
            string,
            { title: string; city: string | null; country: string | null }
        >()
        if (listingIds.length > 0) {
            const { data: listings } = await supabase
                .from("marketplace_listings")
                .select("id, title, city, country")
                .in("id", listingIds)
            if (listings) {
                for (const l of listings) {
                    listingById.set(l.id, {
                        title: l.title,
                        city: l.city,
                        country: l.country,
                    })
                }
            }
        }

        return rows
            .filter((r) =>
                (LIVE_STAGES as readonly string[]).includes(r.current_stage) ||
                r.current_stage === "passed",
            )
            .map((r): RaisePipelineCard => {
                const listing = r.marketplace_listing_id
                    ? listingById.get(r.marketplace_listing_id) ?? null
                    : null
                return {
                    id: r.id,
                    stage: r.current_stage,
                    firmName: listing?.title ?? null,
                    firmLocation:
                        listing
                            ? [listing.city, listing.country]
                                  .filter(Boolean)
                                  .join(" · ") || null
                            : null,
                    commitCents: r.commit_amount_cents,
                    probabilityPct: r.probability_pct,
                    leadRole: r.lead_role,
                    stageEnteredAtIso: r.stage_entered_at,
                    matchScoreCached: r.match_score_cached,
                }
            })
    } catch (err) {
        console.error("[MONEY-RAISE] loadPipelineCards failed:", err)
        return []
    }
}

async function loadThesisSummary(
    supabase: Awaited<ReturnType<typeof createClient>>,
    foundryId: string,
): Promise<RaiseThesisSummary | null> {
    try {
        const { data, error } = await supabase
            .from("investor_thesis")
            .select("id, version, stage_tags, sector_tags, geography")
            .eq("foundry_id", foundryId)
            .is("archived_at", null)
            .order("version", { ascending: false })
            .limit(1)
            .maybeSingle()
        if (error || !data) return null
        return {
            id: data.id,
            version: data.version,
            stageTags: data.stage_tags ?? [],
            sectorTags: data.sector_tags ?? [],
            geography: data.geography ?? [],
        }
    } catch (err) {
        console.error("[MONEY-RAISE] loadThesisSummary failed:", err)
        return null
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
                Raise needs a foundry
            </h1>
            <p style={{ color: "#78716c", fontSize: 14, lineHeight: 1.55 }}>
                You aren&apos;t a member of a foundry yet. Create one or accept a
                pending invite to start tracking investors.
            </p>
            <Link
                href="/today"
                style={{
                    display: "inline-block",
                    marginTop: 18,
                    padding: "8px 16px",
                    border: "1px solid #d6d3d1",
                    borderRadius: 7,
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#1c1917",
                    textDecoration: "none",
                }}
            >
                Back to Today
            </Link>
        </div>
    )
}
