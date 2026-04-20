/**
 * @file money/raise/investors/[investorId]/page.tsx
 *
 * @description Money · Raise · Investor detail (drill-in). Mockup-faithful
 * port of MONEY-MOCKUP-INVESTOR-DETAIL.html. Every investor in the pipeline
 * gets its own page: stage stepper, relationship history, firm research
 * panel, right-rail facts, and the three action modals (Move / Pass / Log
 * touch) launched from the top bar.
 *
 * Data honesty policy:
 *   - Firm research panel, match signal, and "contacts at firm" render ONLY
 *     from real columns (marketplace_listings.title / city / country /
 *     description). Any field absent from the DB renders as "Not yet
 *     captured" — no fabricated thesis, recent-robotics-investments lists,
 *     or decision-process narratives.
 *   - Relationship history reads investor_pipeline_events for this pipeline
 *     row. Empty events list → honest "No touches logged yet" state.
 *   - Warm-intro, pre-brief, and "friction points" are surfaced only when
 *     captured in the DB.
 *
 * Scope (parallel sub-agent safety):
 *   - Writes only to this directory subtree + the two siblings
 *     (raise-view, action-modals). Does NOT touch /money/raise/rounds/*,
 *     /money/raise/portfolio/*, thesis/*, pitch/*, sidebar, or DB types.
 *
 * @related
 *   - View:   ./investor-detail-view.tsx
 *   - Styles: ./investor-detail-v2.css (scoped `.ind2`)
 *   - Modals: ../../action-modals.tsx
 *   - Mockup: MONEY-MOCKUP-INVESTOR-DETAIL.html
 *   - Schema: MONEY-SCHEMA.md §investor_pipeline_state + §investor_pipeline_events
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getFoundryIdCached } from "@/lib/supabase/foundry-context"

import {
    InvestorDetailView,
    type InvestorDetailEvent,
    type InvestorDetailFirm,
    type InvestorDetailPipelineRow,
    type InvestorDetailViewProps,
} from "./investor-detail-view"

export const dynamic = "force-dynamic"

export async function generateMetadata({
    params,
}: {
    params: Promise<{ investorId: string }>
}): Promise<Metadata> {
    const { investorId } = await params
    return {
        title: `Investor · ${investorId.slice(0, 8)}`,
    }
}

export default async function MoneyInvestorDetailPage({
    params,
}: {
    params: Promise<{ investorId: string }>
}): Promise<React.ReactNode> {
    const { investorId } = await params

    const foundryId = await getFoundryIdCached()
    if (!foundryId) notFound()

    const supabase = await createClient()

    // ── 1. Pipeline row (scoped to current foundry) ─────────────────
    const row = await loadPipelineRow(supabase, foundryId, investorId)
    if (!row) notFound()

    // ── 2. Firm snapshot (if marketplace_listing resolves) ──────────
    const firm = row.marketplaceListingId
        ? await loadFirm(supabase, row.marketplaceListingId)
        : null

    // ── 3. Relationship history (pipeline_events) ──────────────────
    const events = await loadPipelineEvents(supabase, foundryId, investorId)

    const viewProps: InvestorDetailViewProps = {
        row,
        firm,
        events,
    }

    return <InvestorDetailView {...viewProps} />
}

// ─── Loaders ─────────────────────────────────────────────────────────────

async function loadPipelineRow(
    supabase: Awaited<ReturnType<typeof createClient>>,
    foundryId: string,
    pipelineStateId: string,
): Promise<InvestorDetailPipelineRow | null> {
    try {
        const { data, error } = await supabase
            .from("investor_pipeline_state")
            .select(
                "id, current_stage, stage_entered_at, commit_amount_cents, probability_pct, lead_role, pass_reason, marketplace_listing_id, investor_firm_id, investor_person_id, warm_intro_via_user_id, match_score_cached, match_score_computed_at, round_id",
            )
            .eq("id", pipelineStateId)
            .eq("foundry_id", foundryId)
            .is("archived_at", null)
            .maybeSingle()

        if (error || !data) return null

        // Round currency is needed for display — fetch only if round_id present.
        let roundCurrency = "GBP"
        let roundName: string | null = null
        if (data.round_id) {
            const { data: round } = await supabase
                .from("investor_round")
                .select("name, currency, target_cents")
                .eq("id", data.round_id)
                .maybeSingle()
            if (round) {
                roundCurrency = round.currency ?? "GBP"
                roundName = round.name
            }
        }

        return {
            id: data.id,
            currentStage: data.current_stage,
            stageEnteredAtIso: data.stage_entered_at,
            commitCents: data.commit_amount_cents,
            probabilityPct: data.probability_pct,
            leadRole: data.lead_role,
            passReason: data.pass_reason,
            marketplaceListingId: data.marketplace_listing_id,
            investorFirmId: data.investor_firm_id,
            investorPersonId: data.investor_person_id,
            warmIntroViaUserId: data.warm_intro_via_user_id,
            matchScoreCached: data.match_score_cached,
            roundCurrency,
            roundName,
            roundId: data.round_id,
        }
    } catch (err) {
        console.error("[MONEY-RAISE-INVESTOR] loadPipelineRow failed:", err)
        return null
    }
}

async function loadFirm(
    supabase: Awaited<ReturnType<typeof createClient>>,
    listingId: string,
): Promise<InvestorDetailFirm | null> {
    try {
        const { data, error } = await supabase
            .from("marketplace_listings")
            .select(
                "id, title, city, country, country_iso, description, website_url, contact_name, contact_title, contact_email, contact_linkedin",
            )
            .eq("id", listingId)
            .maybeSingle()
        if (error || !data) return null
        return {
            id: data.id,
            title: data.title,
            city: data.city,
            country: data.country,
            countryIso: data.country_iso,
            description: data.description,
            websiteUrl: data.website_url,
            contactName: data.contact_name,
            contactTitle: data.contact_title,
            contactEmail: data.contact_email,
            contactLinkedin: data.contact_linkedin,
        }
    } catch (err) {
        console.error("[MONEY-RAISE-INVESTOR] loadFirm failed:", err)
        return null
    }
}

async function loadPipelineEvents(
    supabase: Awaited<ReturnType<typeof createClient>>,
    foundryId: string,
    pipelineStateId: string,
): Promise<InvestorDetailEvent[]> {
    try {
        const { data, error } = await supabase
            .from("investor_pipeline_events")
            .select(
                "id, event_type, from_stage, to_stage, payload, actor_user_id, backdated_to, created_at",
            )
            .eq("foundry_id", foundryId)
            .eq("pipeline_state_id", pipelineStateId)
            .order("created_at", { ascending: false })
            .limit(50)
        if (error || !data) return []
        return data.map(
            (e): InvestorDetailEvent => ({
                id: e.id,
                eventType: e.event_type,
                fromStage: e.from_stage,
                toStage: e.to_stage,
                payload: e.payload,
                actorUserId: e.actor_user_id,
                backdatedToIso: e.backdated_to,
                createdAtIso: e.created_at,
            }),
        )
    } catch (err) {
        console.error("[MONEY-RAISE-INVESTOR] loadPipelineEvents failed:", err)
        return []
    }
}

