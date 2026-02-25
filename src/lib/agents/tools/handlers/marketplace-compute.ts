/**
 * @file marketplace-compute.ts — Marketplace & outreach computation tools.
 *
 * @description Provides real computation tools for supplier scoring and
 * outreach campaign performance analysis. Queries actual data from supplier
 * reviews, orders, and outreach emails to produce computed metrics.
 *
 * INTENT: When the sales lead says "this supplier has a 4.2 rating", that
 * should come from actual reviews. When marketing says "open rate is 35%",
 * that should come from real email tracking data.
 *
 * @security All queries filter by foundry_id. Read-only.
 *
 * @related
 * - Marketplace handler: src/lib/agents/tools/handlers/marketplace.ts
 * - Tool definitions: src/lib/agents/tools/definitions.ts
 */

import { createAdminClient } from "@/lib/supabase/admin"
import type { ToolHandler } from "./common"

// ─── score_suppliers ────────────────────────────────────────────────

/**
 * Scores and ranks suppliers based on actual review data and order history.
 * Uses a weighted composite score: rating (40%), recommendation rate (30%),
 * review volume (30%).
 */
export const handleScoreSuppliers: ToolHandler = async (args, ctx) => {
    const category = args.category as string | undefined
    const limit = Math.min(Math.max((args.limit as number) ?? 20, 1), 100)
    const supabase = createAdminClient()

    // Fetch supplier reviews
    let reviewQuery = supabase
        .from("supplier_reviews")
        .select("supplier_id, rating, would_recommend, order_value_range, verified_purchase")
        .eq("foundry_id", ctx.foundryId)

    if (category) {
        reviewQuery = reviewQuery.eq("category", category)
    }

    const { data: reviews, error: reviewError } = await reviewQuery.limit(500)

    if (reviewError) {
        return `## Supplier Scoring\n\nError fetching reviews: ${reviewError.message}`
    }

    if (!reviews || reviews.length === 0) {
        return "## Supplier Scoring\n\nNo supplier reviews found. Reviews are needed to score suppliers."
    }

    // Aggregate per supplier
    const supplierStats: Record<string, {
        ratings: number[]
        recommendations: number
        totalReviews: number
        verifiedCount: number
    }> = {}

    for (const r of reviews) {
        if (!supplierStats[r.supplier_id]) {
            supplierStats[r.supplier_id] = { ratings: [], recommendations: 0, totalReviews: 0, verifiedCount: 0 }
        }
        const s = supplierStats[r.supplier_id]
        s.ratings.push(r.rating)
        s.totalReviews++
        if (r.would_recommend) s.recommendations++
        if (r.verified_purchase) s.verifiedCount++
    }

    // Fetch supplier profiles for names
    // SECURITY: Filter by foundry_id to prevent cross-tenant data leakage
    const supplierIds = Object.keys(supplierStats)
    const { data: suppliers } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, company_name")
        .eq("foundry_id", ctx.foundryId)
        .in("id", supplierIds.slice(0, 50))

    const nameMap = new Map(
        (suppliers ?? []).map((s) => [
            s.id,
            s.company_name || `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() || "Unknown",
        ]),
    )

    // Compute composite scores
    const maxReviews = Math.max(...Object.values(supplierStats).map((s) => s.totalReviews))

    const scored = Object.entries(supplierStats).map(([supplierId, stats]) => {
        const avgRating = stats.ratings.reduce((a, b) => a + b, 0) / stats.ratings.length
        const recRate = stats.totalReviews > 0 ? stats.recommendations / stats.totalReviews : 0
        const volumeScore = maxReviews > 0 ? stats.totalReviews / maxReviews : 0

        // Weighted composite: rating (40%), recommendation rate (30%), review volume (30%)
        const composite = (avgRating / 5) * 0.4 + recRate * 0.3 + volumeScore * 0.3

        return {
            supplierId,
            name: nameMap.get(supplierId) ?? "Unknown",
            avgRating: Math.round(avgRating * 100) / 100,
            recRate: Math.round(recRate * 100),
            totalReviews: stats.totalReviews,
            verifiedCount: stats.verifiedCount,
            composite: Math.round(composite * 100),
        }
    }).sort((a, b) => b.composite - a.composite)

    let md = `## Supplier Scoring\n\n`
    md += `**${scored.length} suppliers** scored from **${reviews.length} reviews**\n\n`

    md += `| Rank | Supplier | Score | Avg Rating | Recommend % | Reviews | Verified |\n`
    md += `|------|----------|-------|------------|------------|---------|----------|\n`

    for (let i = 0; i < Math.min(scored.length, limit); i++) {
        const s = scored[i]
        md += `| ${i + 1} | ${s.name} | ${s.composite}/100 | ${s.avgRating}/5 | ${s.recRate}% | ${s.totalReviews} | ${s.verifiedCount} |\n`
    }
    md += "\n"

    md += `### Scoring Methodology\n\n`
    md += `- **Rating weight:** 40% (average star rating normalized to 0-1)\n`
    md += `- **Recommendation weight:** 30% (% of reviewers who would recommend)\n`
    md += `- **Volume weight:** 30% (review count relative to most-reviewed supplier)\n`
    md += "\n"

    // Chart: top 10 suppliers
    const chartData = scored.slice(0, 10).map((s) => ({
        label: s.name.length > 15 ? s.name.slice(0, 15) + "…" : s.name,
        value: s.composite,
    }))
    md += `\n<!-- CHART ${JSON.stringify({
        type: "bar",
        title: "Top Suppliers by Composite Score",
        data: chartData,
        xLabel: "Supplier",
        yLabel: "Score (0-100)",
    })} -->`

    return md
}

// ─── analyze_outreach_performance ───────────────────────────────────

/**
 * Analyzes outreach campaign performance from actual email tracking data.
 * Computes open rates, reply rates, conversion funnels, and identifies
 * best-performing campaigns and subject lines.
 */
export const handleAnalyzeOutreachPerformance: ToolHandler = async (args, ctx) => {
    const campaignId = args.campaign_id as string | undefined
    const supabase = createAdminClient()

    // Fetch campaigns
    let campaignQuery = supabase
        .from("outreach_campaigns")
        .select("id, name, status, sequence_length, tone, created_at")
        .eq("foundry_id", ctx.foundryId)

    if (campaignId) {
        campaignQuery = campaignQuery.eq("id", campaignId)
    }

    const { data: campaigns, error: campaignError } = await campaignQuery.order("created_at", { ascending: false }).limit(20)

    if (campaignError) {
        return `## Outreach Performance\n\nError fetching campaigns: ${campaignError.message}`
    }

    if (!campaigns || campaigns.length === 0) {
        return "## Outreach Performance\n\nNo campaigns found."
    }

    const campaignIds = campaigns.map((c) => c.id)

    // Fetch emails for these campaigns
    const { data: emails, error: emailError } = await supabase
        .from("outreach_emails")
        .select("id, campaign_id, status, sequence_position, sent_at, opened_at, replied_at, subject")
        .eq("foundry_id", ctx.foundryId)
        .in("campaign_id", campaignIds)
        .limit(1000)

    if (emailError) {
        return `## Outreach Performance\n\nError fetching emails: ${emailError.message}`
    }

    // Fetch contacts for scoring distribution
    const { data: contacts } = await supabase
        .from("outreach_contacts")
        .select("id, campaign_id, score, status")
        .eq("foundry_id", ctx.foundryId)
        .in("campaign_id", campaignIds)
        .limit(500)

    const allEmails = emails ?? []
    const allContacts = contacts ?? []

    if (allEmails.length === 0) {
        return "## Outreach Performance\n\nNo emails found for the selected campaigns. Generate and send emails first."
    }

    // Overall metrics
    const sent = allEmails.filter((e) => e.sent_at)
    const opened = allEmails.filter((e) => e.opened_at)
    const replied = allEmails.filter((e) => e.replied_at)

    const openRate = sent.length > 0 ? (opened.length / sent.length) * 100 : 0
    const replyRate = sent.length > 0 ? (replied.length / sent.length) * 100 : 0

    let md = `## Outreach Performance Analysis\n\n`
    md += `### Overall Metrics\n\n`
    md += `| Metric | Value |\n|--------|-------|\n`
    md += `| Total emails | ${allEmails.length} |\n`
    md += `| Sent | ${sent.length} |\n`
    md += `| Opened | ${opened.length} (${openRate.toFixed(1)}%) |\n`
    md += `| Replied | ${replied.length} (${replyRate.toFixed(1)}%) |\n`
    md += `| Total contacts | ${allContacts.length} |\n`
    md += "\n"

    // Per-campaign breakdown
    md += `### Campaign Performance\n\n`
    md += `| Campaign | Status | Sent | Open Rate | Reply Rate |\n`
    md += `|----------|--------|------|-----------|------------|\n`

    for (const c of campaigns) {
        const cEmails = allEmails.filter((e) => e.campaign_id === c.id)
        const cSent = cEmails.filter((e) => e.sent_at).length
        const cOpened = cEmails.filter((e) => e.opened_at).length
        const cReplied = cEmails.filter((e) => e.replied_at).length
        const cOpenRate = cSent > 0 ? ((cOpened / cSent) * 100).toFixed(1) : "—"
        const cReplyRate = cSent > 0 ? ((cReplied / cSent) * 100).toFixed(1) : "—"

        md += `| ${c.name} | ${c.status} | ${cSent} | ${cOpenRate}% | ${cReplyRate}% |\n`
    }
    md += "\n"

    // Performance by sequence position (which email in the sequence performs best?)
    const byPosition: Record<number, { sent: number; opened: number; replied: number }> = {}
    for (const e of allEmails) {
        const pos = e.sequence_position ?? 1
        if (!byPosition[pos]) byPosition[pos] = { sent: 0, opened: 0, replied: 0 }
        if (e.sent_at) byPosition[pos].sent++
        if (e.opened_at) byPosition[pos].opened++
        if (e.replied_at) byPosition[pos].replied++
    }

    const positions = Object.keys(byPosition).map(Number).sort((a, b) => a - b)
    if (positions.length > 1) {
        md += `### Performance by Sequence Position\n\n`
        md += `| Position | Sent | Open Rate | Reply Rate |\n`
        md += `|----------|------|-----------|------------|\n`
        for (const pos of positions) {
            const p = byPosition[pos]
            const oRate = p.sent > 0 ? ((p.opened / p.sent) * 100).toFixed(1) : "—"
            const rRate = p.sent > 0 ? ((p.replied / p.sent) * 100).toFixed(1) : "—"
            md += `| Email ${pos} | ${p.sent} | ${oRate}% | ${rRate}% |\n`
        }
        md += "\n"
    }

    // Contact score distribution
    const scoredContacts = allContacts.filter((c) => c.score != null)
    if (scoredContacts.length > 0) {
        const scores = scoredContacts.map((c) => c.score!)
        const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length
        const buckets = { high: 0, medium: 0, low: 0 }
        for (const s of scores) {
            if (s >= 70) buckets.high++
            else if (s >= 40) buckets.medium++
            else buckets.low++
        }

        md += `### Contact Quality\n\n`
        md += `| Metric | Value |\n|--------|-------|\n`
        md += `| Average contact score | ${avgScore.toFixed(1)}/100 |\n`
        md += `| High quality (70+) | ${buckets.high} (${((buckets.high / scoredContacts.length) * 100).toFixed(0)}%) |\n`
        md += `| Medium (40-69) | ${buckets.medium} (${((buckets.medium / scoredContacts.length) * 100).toFixed(0)}%) |\n`
        md += `| Low (<40) | ${buckets.low} (${((buckets.low / scoredContacts.length) * 100).toFixed(0)}%) |\n`
        md += "\n"
    }

    // Chart: open and reply rates by campaign
    const chartData = campaigns.map((c) => {
        const cEmails = allEmails.filter((e) => e.campaign_id === c.id)
        const cSent = cEmails.filter((e) => e.sent_at).length
        const cOpened = cEmails.filter((e) => e.opened_at).length
        const cReplied = cEmails.filter((e) => e.replied_at).length
        return {
            label: c.name.length > 20 ? c.name.slice(0, 20) + "…" : c.name,
            value: cSent > 0 ? Math.round((cOpened / cSent) * 100) : 0,
            value2: cSent > 0 ? Math.round((cReplied / cSent) * 100) : 0,
        }
    })
    md += `\n<!-- CHART ${JSON.stringify({
        type: "bar",
        title: "Campaign Performance",
        data: chartData,
        xLabel: "Campaign",
        yLabel: "Rate (%)",
        seriesName: "Open Rate",
        series2Name: "Reply Rate",
    })} -->`

    return md
}
