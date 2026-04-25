/**
 * @file route.ts — Intelligent Investor Matching SSE endpoint
 *
 * @description Scores all investors against the founder's company profile,
 * takes the top 50, then generates AI rationales in batches of 5 via Haiku.
 * Streams results via SSE for progressive disclosure.
 *
 * Tier-gated: Free users see 5 investors, Starter sees 50 with contacts,
 * Professional sees 50 + partner rationale + draft emails.
 *
 * @security Requires authenticated user. API keys server-side only.
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { aiGuard } from "@/lib/ai/guard"
import { calculateMatchScore } from "@/lib/investor-match"
import type { FoundryProfile } from "@/lib/investor-match"
import type { InvestorFirm } from "@/actions/investors"
import { logLlmUsage } from "@/lib/cost-logging/llm-usage"

export const runtime = "nodejs"
export const maxDuration = 300

// ─── AI Call (DeepSeek first, Anthropic Haiku fallback) ─────────

async function callHaiku(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 2000,
  context: { foundryId?: string; userId?: string } = {},
): Promise<string> {
  const { foundryId, userId } = context
  // Try DeepSeek first (cheaper)
  const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (deepseekKey) {
    const deepseekModel = "deepseek-chat"
    try {
      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${deepseekKey}` },
        body: JSON.stringify({
          model: deepseekModel,
          max_tokens: maxTokens,
          messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        }),
      })
      if (response.ok) {
        const data = await response.json()
        void logLlmUsage({
          action: 'investor_match',
          modelUsed: deepseekModel,
          tokensIn: data.usage?.prompt_tokens ?? 0,
          tokensOut: data.usage?.completion_tokens ?? 0,
          status: 'success',
          foundryId,
          userId,
        })
        return data.choices?.[0]?.message?.content ?? ""
      }
      const errText = await response.text().catch(() => '')
      const ds_status: 'rate_limited' | 'timeout' | 'error' =
        response.status === 429 || response.status === 529 ? 'rate_limited' :
        response.status === 408 || response.status === 504 ? 'timeout' :
        'error'
      void logLlmUsage({
        action: 'investor_match',
        modelUsed: deepseekModel,
        tokensIn: 0,
        tokensOut: 0,
        status: ds_status,
        errorMessage: `${response.status}: ${errText.slice(0, 200)}`,
        foundryId,
        userId,
      })
      console.warn(JSON.stringify({ level: "warn", event: "ai_provider_fallback", feature: "investor_match", primaryProvider: "deepseek", fallbackProvider: "anthropic-haiku", reason: `HTTP ${response.status}`, timestamp: new Date().toISOString() }))
    } catch (err) {
      void logLlmUsage({
        action: 'investor_match',
        modelUsed: deepseekModel,
        tokensIn: 0,
        tokensOut: 0,
        status: 'error',
        errorMessage: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
        foundryId,
        userId,
      })
      console.warn(JSON.stringify({ level: "warn", event: "ai_provider_fallback", feature: "investor_match", primaryProvider: "deepseek", fallbackProvider: "anthropic-haiku", reason: err instanceof Error ? err.message : "unknown", timestamp: new Date().toISOString() }))
    }
  }

  // Fallback: Anthropic Haiku
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!anthropicKey) throw new Error("No AI API key configured (DEEPSEEK_API_KEY or ANTHROPIC_API_KEY)")

  const anthropicModel = "claude-haiku-4-5-20251001"
  let response: Response
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: anthropicModel,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    })
  } catch (err) {
    void logLlmUsage({
      action: 'investor_match',
      modelUsed: anthropicModel,
      tokensIn: 0,
      tokensOut: 0,
      status: 'error',
      errorMessage: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
      foundryId,
      userId,
    })
    throw err
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    const status: 'rate_limited' | 'timeout' | 'error' =
      response.status === 429 || response.status === 529 ? 'rate_limited' :
      response.status === 408 || response.status === 504 ? 'timeout' :
      'error'
    void logLlmUsage({
      action: 'investor_match',
      modelUsed: anthropicModel,
      tokensIn: 0,
      tokensOut: 0,
      status,
      errorMessage: `${response.status}: ${errText.slice(0, 200)}`,
      foundryId,
      userId,
    })
    throw new Error(`Anthropic API error: ${response.status}`)
  }
  const data = await response.json()
  void logLlmUsage({
    action: 'investor_match',
    modelUsed: anthropicModel,
    tokensIn: data.usage?.input_tokens ?? 0,
    tokensOut: data.usage?.output_tokens ?? 0,
    status: 'success',
    foundryId,
    userId,
  })
  return (data.content?.[0]?.text ?? "").trim()
}

// INTENT: Opus for high-quality draft emails — the most important user-facing content.
// Rationales stay on Haiku (shorter, less critical). Opus produces substantially
// better cold emails with more natural tone and specific portfolio references.
async function callOpus(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 4000,
  context: { foundryId?: string; userId?: string } = {},
): Promise<string> {
  const { foundryId, userId } = context
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY not configured")

  const opusModel = "claude-opus-4-20250514"
  let response: Response
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: opusModel,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    })
  } catch (err) {
    void logLlmUsage({
      action: 'investor_match',
      modelUsed: opusModel,
      tokensIn: 0,
      tokensOut: 0,
      status: 'error',
      errorMessage: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
      foundryId,
      userId,
    })
    throw err
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    const status: 'rate_limited' | 'timeout' | 'error' =
      response.status === 429 || response.status === 529 ? 'rate_limited' :
      response.status === 408 || response.status === 504 ? 'timeout' :
      'error'
    void logLlmUsage({
      action: 'investor_match',
      modelUsed: opusModel,
      tokensIn: 0,
      tokensOut: 0,
      status,
      errorMessage: `${response.status}: ${errText.slice(0, 200)}`,
      foundryId,
      userId,
    })
    // Fallback to Haiku if Opus fails
    console.warn("[InvestorMatch] Opus failed, falling back to Haiku")
    return callHaiku(systemPrompt, userPrompt, maxTokens, context)
  }
  const data = await response.json()
  void logLlmUsage({
    action: 'investor_match',
    modelUsed: opusModel,
    tokensIn: data.usage?.input_tokens ?? 0,
    tokensOut: data.usage?.output_tokens ?? 0,
    status: 'success',
    foundryId,
    userId,
  })
  return (data.content?.[0]?.text ?? "").trim()
}

function safeParseJSON<T>(text: string): T[] {
  try {
    const match = text.match(/\[[\s\S]*\]/)
    return match ? JSON.parse(match[0]) : []
  } catch { return [] }
}

// ─── Types ──────────────────────────────────────────────────────

interface EnrichedMatch {
  investor: {
    id: string
    name: string
    type: string
    stageFocus: string[]
    sectors: string[]
    fundSize: number | null
    chequeRange: { min: number; max: number } | null
    thesis: string
    portfolio: string[]
  }
  matchScore: number
  topFactors: string[]
  rationale: string
  partner?: {
    name: string
    title: string
    email?: string
    linkedin?: string
    rationale?: string
  }
  draftEmail?: {
    subject: string
    body: string
  }
}

interface NearMiss {
  name: string
  type: string
  score: number
  reason: string
}

// ─── POST Handler ───────────────────────────────────────────────

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // SECURITY: AI cost gate — prevents free-tier users from running unlimited matching
  const guard = await aiGuard(supabase, 'investor_match')
  if (guard.denied) return guard.response

  // ── Check for cached results ──────────────
  // INTENT: Use active_foundry_id (current workspace) not foundry_id (primary)
  const { data: profileData } = await supabase.from("profiles").select("foundry_id, active_foundry_id").eq("id", user.id).single()
  const foundryId = profileData?.active_foundry_id || profileData?.foundry_id

  // SECURITY: Check tier early — free users ALWAYS get cached results (no regeneration).
  // INTENT: Use the FOUNDRY OWNER's subscription (same as sidebar credits bar).
  // Team members inherit the foundry's tier — a founder on Enterprise means
  // all team members in that foundry get Enterprise features.
  let earlyTier = "free"
  if (foundryId) {
    try {
      const adminDb = createAdminClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: foundry } = await (adminDb as any)
        .from("foundries")
        .select("owner_id")
        .eq("id", foundryId)
        .single()

      if (foundry?.owner_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: ownerSub } = await (adminDb as any)
          .from("user_subscriptions")
          .select("tier")
          .eq("user_id", foundry.owner_id)
          .in("status", ["active", "trialing"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()

        if (ownerSub?.tier) earlyTier = ownerSub.tier
      }
    } catch {
      // Fall through with free tier
    }
  }
  const isFreeUser = earlyTier === "free"

  if (foundryId) {
    // INTENT: Use admin client for cache read — RLS SELECT policy may not
    // match active_foundry_id and would miss valid cache entries.
    try {
      const adminDb = createAdminClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: cacheRow } = await (adminDb as any)
        .from("report_snapshots")
        .select("report_data, generated_at")
        .eq("foundry_id", foundryId)
        .eq("report_type", "investor-match")
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (cacheRow?.report_data && cacheRow.generated_at) {
        const cacheAge = Date.now() - new Date(cacheRow.generated_at).getTime()
        // SECURITY: Free users get cache indefinitely (30 days) — no regeneration.
        // Paid users get 7-day cache that can be refreshed via button.
        const cacheTTL = isFreeUser ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000
        if (cacheAge < cacheTTL) {
          return NextResponse.json({ cached: true, ...cacheRow.report_data })
        }
      }
    } catch {
      // Admin client unavailable — fall through to fresh generation
    }
  }

  const encoder = new TextEncoder()

  const readable = new ReadableStream({
    async start(controller) {
      const emit = (data: Record<string, unknown>) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)) }
        catch { /* stream closed */ }
      }

      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(": keepalive\n\n")) }
        catch { clearInterval(heartbeat) }
      }, 15_000)

      try {
        // ── Get Company Profile ──────────────────────────
        emit({ phase: "profile", message: "Loading your company profile..." })

        const { data: profile } = await supabase
          .from("profiles")
          .select("foundry_id, full_name, role")
          .eq("id", user.id)
          .single()

        if (!profile?.foundry_id) {
          // INTENT: Sandbox and forge-guild foundries may not have a foundry_id.
          // This is a normal state, not an error — show onboarding prompt instead of error toast.
          emit({ phase: "no_company", message: "Set up your company profile in Settings to see personalised investor matches. You can still browse all investors." })
          clearInterval(heartbeat)
          controller.close()
          return
        }

        const { data: foundry } = await supabase
          .from("foundries")
          .select("name, stage, industry, sector, purpose_data, company_profile")
          .eq("id", profile.foundry_id)
          .maybeSingle()

        if (!foundry) {
          // DECISION: Show a helpful message instead of a generic error when
          // the foundry doesn't exist (e.g. shared forge-guild users).
          emit({ phase: "incomplete_profile", missing: ["Company profile setup"], message: "Set up your company profile in Settings to see personalised investor matches. You can still browse all investors." })
          clearInterval(heartbeat)
          controller.close()
          return
        }

        // Check profile completeness
        const missing: string[] = []
        if (!foundry.stage) missing.push("Company stage (pre-seed, seed, Series A, etc.)")
        if (!foundry.industry && !foundry.sector) missing.push("Industry or sector")

        if (missing.length > 0) {
          emit({ phase: "incomplete_profile", missing, message: "Complete your company profile to see matched investors." })
          clearInterval(heartbeat)
          controller.close()
          return
        }

        const purposeData = foundry.purpose_data as Record<string, unknown> | null
        const companyProfileData = foundry.company_profile as Record<string, unknown> | null

        // INTENT: Extract keywords from business plan, purpose, and profile data
        // so the scoring can match against investor thesis/portfolio text.
        const businessKeywords: string[] = []
        const keywordSources = [
          purposeData?.purpose as string,
          purposeData?.mission as string,
          (purposeData?.questionnaire as Record<string, string>)?.problemSolved,
          (purposeData?.questionnaire as Record<string, string>)?.uniqueValue,
          companyProfileData?.business_model as string,
          foundry.name,
        ].filter(Boolean)
        for (const source of keywordSources) {
          if (source) {
            const words = source.toLowerCase().split(/\W+/).filter(w => w.length > 4)
            businessKeywords.push(...words)
          }
        }
        // Deduplicate
        const uniqueKeywords = [...new Set(businessKeywords)].slice(0, 30)

        const companyProfile: FoundryProfile = {
          stage: foundry.stage,
          sector: foundry.sector || foundry.industry,
          industry: foundry.industry,
          businessKeywords: uniqueKeywords,
        }
        // INTENT: Include founder's name so the email can open with "I'm [Name], [role] of [Company]"
        const founderName = profile?.full_name || "the founder"
        const founderRole = profile?.role === 'Founder' ? 'CEO & Founder' : profile?.role === 'Executive' ? 'Co-Founder' : 'Founder'

        const companyContext = [
          `Founder writing the email: ${founderName}, ${founderRole} of ${foundry.name}`,
          `Company: ${foundry.name}`,
          `Stage: ${foundry.stage}`,
          `Sector: ${foundry.sector || foundry.industry || "Not specified"}`,
          purposeData?.purpose ? `Purpose: ${purposeData.purpose}` : null,
          companyProfileData?.business_model ? `Business model: ${companyProfileData.business_model}` : null,
          companyProfileData?.revenue_range ? `Revenue: ${companyProfileData.revenue_range}` : null,
          companyProfileData?.funding_status ? `Funding status: ${companyProfileData.funding_status}` : null,
        ].filter(Boolean).join("\n")

        // INTENT: Use earlyTier from the cache check (single source of truth for tier).
        // Avoids duplicate subscription query and ensures batch count matches cache TTL.
        const tier = earlyTier
        const isPro = tier === "professional" || tier === "enterprise"
        const isStarter = tier === "starter" || isPro
        const maxVisible = isStarter ? 50 : 5

        // ── Score All Investors ──────────────────────────
        emit({ phase: "scoring", message: "Scoring investors against your profile..." })

        // Fetch investor listings — capped at 10K to prevent OOM on serverless
        let allInvestors: InvestorFirm[] = []
        let offset = 0
        const pageSize = 1000
        const MAX_INVESTORS = 10_000

        while (allInvestors.length < MAX_INVESTORS) {
          const { data, error } = await supabase
            .from("marketplace_listings")
            .select("id, title, description, subcategory, attributes, is_verified")
            .eq("category", "Finance")
            .range(offset, offset + pageSize - 1)

          if (error || !data || data.length === 0) break
          allInvestors = allInvestors.concat(data.map(d => ({
            id: d.id,
            title: d.title,
            description: d.description || "",
            subcategory: d.subcategory || "",
            attributes: (d.attributes || {}) as InvestorFirm["attributes"],
            is_verified: d.is_verified || false,
          })))
          if (data.length < pageSize) break
          offset += pageSize
        }

        // Score each investor
        const scored = allInvestors.map(firm => ({
          firm,
          breakdown: calculateMatchScore(firm, companyProfile),
        })).sort((a, b) => b.breakdown.total - a.breakdown.total)

        const top50 = scored.slice(0, 50)
        const nearMisses: NearMiss[] = scored.slice(50, 100).map(s => {
          // Generate specific rejection reason based on weakest scoring factors
          const b = s.breakdown
          const weaknesses: string[] = []
          if (b.stageScore === 0) weaknesses.push("Stage mismatch")
          if (b.sectorScore === 0) weaknesses.push("No sector overlap")
          if (b.chequeScore === 0) weaknesses.push("Cheque range doesn't fit")
          if (b.geoScore === 0) weaknesses.push("No UK/relevant geo focus")
          if (b.activeScore === 0) weaknesses.push("Not actively deploying")

          return {
            name: s.firm.title,
            type: (s.firm.attributes?.firm_type as string) || "Unknown",
            score: b.total,
            reason: weaknesses.length > 0
              ? weaknesses.slice(0, 2).join(" · ")
              : `Score: ${b.total}/100 — close but not in top 50`,
          }
        })

        emit({
          phase: "scored",
          totalScored: allInvestors.length,
          top50Count: top50.length,
          nearMissCount: nearMisses.length,
          nearMisses: nearMisses.slice(0, 20),
        })

        // ── Generate Rationales in Batches of 5 ─────────
        const allEnrichedMatches: EnrichedMatch[] = []
        const batchSize = 5
        const batches = Math.ceil(Math.min(top50.length, maxVisible) / batchSize)

        for (let batchIdx = 0; batchIdx < batches; batchIdx++) {
          const batchStart = batchIdx * batchSize
          const batchItems = top50.slice(batchStart, batchStart + batchSize)

          emit({ phase: "generating", batchNumber: batchIdx + 1, totalBatches: batches, message: `Generating insights for investors ${batchStart + 1}-${batchStart + batchItems.length}...` })

          // Build investor summaries for the prompt
          const investorSummaries = batchItems.map((item, i) => {
            const attrs = item.firm.attributes || {}
            return `[${batchStart + i + 1}] ${item.firm.title}
Type: ${attrs.firm_type || "Unknown"}
Thesis: ${attrs.investment_thesis || "Not available"}
Stage focus: ${(attrs.stage_focus as string[])?.join(", ") || "Not specified"}
Sectors: ${(attrs.sectors as string[])?.join(", ") || "Not specified"}
Portfolio: ${(attrs.notable_portfolio as string[])?.slice(0, 5).join(", ") || "Not available"}
Cheque: ${attrs.cheque_range_gbp ? `£${(attrs.cheque_range_gbp as { min: number; max: number }).min?.toLocaleString()}-£${(attrs.cheque_range_gbp as { min: number; max: number }).max?.toLocaleString()}` : "Not specified"}
Match score: ${item.breakdown.total}/100 (${item.breakdown.topFactors.join(", ")})`
          }).join("\n\n")

          // Generate rationales
          const rationalePrompt = `You are a fundraising advisor. For each investor below, write 2-3 sentences explaining why they are a good match for this company. Reference specific aspects of their thesis, portfolio, or stage focus that align. Be concrete — mention company names from their portfolio if relevant.

## Company
${companyContext}

## Investors
${investorSummaries}

Return a JSON array of ${batchItems.length} objects: [{"rationale": "..."}]
Only return the JSON array.`

          let rationales: { rationale: string }[] = []
          try {
            const result = await callHaiku(
              "Be concise, specific, and reference real data.",
              rationalePrompt,
              2000,
              { foundryId: foundryId ?? undefined, userId: user.id },
            )
            rationales = safeParseJSON<{ rationale: string }>(result)
          } catch (err) {
            console.warn("[InvestorMatch] Rationale generation failed:", err)
          }

          // INTENT: Fetch contacts for ALL tiers — free users see partner name/title
          // on first 5 matches (enticing preview). Emails only shown to Pro users.
          const contactsByListing: Record<string, { name: string; title: string; email?: string; linkedin?: string }[]> = {}
          {
            const listingIds = batchItems.map(item => item.firm.id)
            // INTENT: Fetch senior contacts — seniority field is inconsistent
            // (null, 'partner', 'managing_director', etc.) so we fetch all contacts
            // for the batch and filter client-side by title keywords.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: contacts } = await (supabase as any)
              .from("vc_pe_contacts")
              .select("listing_id, full_name, title, seniority, email, linkedin_url, is_decision_maker")
              .in("listing_id", listingIds)
              .order("is_decision_maker", { ascending: false })
              .limit(50)

            if (contacts) {
              // INTENT: Prioritise partners and decision-makers, limit to 2 per firm
              const seniorKeywords = ['partner', 'managing', 'director', 'principal', 'founder', 'ceo', 'head']
              for (const c of contacts) {
                const titleLower = (c.title || '').toLowerCase() + ' ' + (c.seniority || '').toLowerCase()
                const isSenior = c.is_decision_maker || seniorKeywords.some(kw => titleLower.includes(kw))
                if (!isSenior) continue
                if (!contactsByListing[c.listing_id]) contactsByListing[c.listing_id] = []
                if (contactsByListing[c.listing_id].length >= 2) continue // Max 2 contacts per firm
                contactsByListing[c.listing_id].push({
                  name: c.full_name,
                  title: c.title,
                  email: c.email || undefined,
                  linkedin: c.linkedin_url,
                })
              }
            }
          }

          // INTENT: Generate partner rationale + draft emails for ALL visible matches.
          // This is the most compelling content — shows the user exactly what they'd say
          // to each investor. Previously gated behind isPro, now available for all
          // visible matches (free tier sees 5 with full outreach content).
          let partnerRationales: { partnerRationale?: string; emailSubject?: string; emailBody?: string }[] = []
          if (Object.keys(contactsByListing).length > 0) {
            const emailSystemPrompt = `You write cold outreach emails from startup founders to investors. Direct, substantive, personal.

STRUCTURE (strictly follow this order):

1. SUBJECT LINE: About what the company does. Not the investor. Specific and concrete.

2. GREETING: "Dear [FirstName]," (or "Dear [Firm] Team," if name unknown)

3. OPENING (1-2 sentences): Introduce the PERSON writing — their name, role, and one credibility point. The reader needs to know within the first sentence who is writing and why it's worth continuing. Example: "I'm [Name], CEO of [Company]. We've [concrete achievement — e.g. completed successful test flights / secured 3 institutional partners / built proprietary recovery technology]."

4. THE COMPANY (2-3 sentences): What you've built, what it does, what you're looking for. Be specific with numbers — cost reduction percentages, market size, unit economics. These are facts about YOUR company so state them confidently.

5. WHY THIS INVESTOR (2-3 sentences): Why you're reaching out to THEM specifically. CRITICAL: hedge everything about the investor. Use "From what I've been reading..." / "I think I'm correct in saying..." / "If I understand correctly...". Never assert facts about their portfolio, thesis, or strategy — our data may be wrong or stale.

6. THE ASK (2 sentences): Request a specific meeting — "Would you have 20 minutes in the next two weeks?" or "Could we arrange a brief call this month?" Give a concrete timeframe.

7. THE REFERRAL (1 sentence): "If this isn't the right fit for you, I'd be very grateful if you could point me toward anyone in your network who might be interested."

8. SIGN-OFF: "Best regards,"

ABSOLUTE RULES:
- First sentence: who is the PERSON writing. Not the company name alone.
- The ONLY facts you can assert confidently are about YOUR OWN company.
- NEVER assert facts about the investor — not their thesis, not their portfolio companies, not their sectors, not their fund size. Always hedge.
- No flattery. No "I admire..." No "I've been following..."
- Each paragraph: 2-3 sentences maximum.
- If partner name is unknown, address to "[Firm] Team"`

            const partnerPrompt = `Write outreach emails for this company to these investors.

## Company
${companyContext}

## Investors + Partners
${batchItems.map((item, i) => {
  const contact = contactsByListing[item.firm.id]?.[0]
  return `[${i + 1}] ${item.firm.title} — Contact: ${contact?.name || "Unknown"} (${contact?.title || ""})
Thesis: ${(item.firm.attributes?.investment_thesis as string) || "N/A"}
Portfolio: ${(item.firm.attributes?.notable_portfolio as string[])?.slice(0, 5).join(", ") || "N/A"}
Sectors: ${(item.firm.attributes?.sectors as string[])?.slice(0, 3).join(", ") || "N/A"}
Stage: ${(item.firm.attributes?.stage_focus as string[])?.join(", ") || "N/A"}`
}).join("\n\n")}

Return a JSON array of ${batchItems.length} objects: [{"partnerRationale": "1-2 sentence reason why this specific person is the right contact", "emailSubject": "specific subject line about our product", "emailBody": "3-paragraph email following the structure rules exactly"}]
Only return the JSON array, no markdown.`

            try {
              const result = await callOpus(emailSystemPrompt, partnerPrompt, 4000, { foundryId: foundryId ?? undefined, userId: user.id })
              partnerRationales = safeParseJSON(result)
            } catch (err) {
              console.warn("[InvestorMatch] Partner/email generation failed:", err)
            }
          }

          // Assemble enriched matches
          const enrichedMatches: EnrichedMatch[] = batchItems.map((item, i) => {
            const attrs = item.firm.attributes || {}
            const contact = contactsByListing[item.firm.id]?.[0]
            const partnerData = partnerRationales[i]

            return {
              investor: {
                id: item.firm.id,
                name: item.firm.title,
                type: (attrs.firm_type as string) || "Unknown",
                stageFocus: (attrs.stage_focus as string[]) || [],
                sectors: (attrs.sectors as string[]) || [],
                fundSize: (attrs.fund_size_gbp as number) || null,
                chequeRange: (attrs.cheque_range_gbp as { min: number; max: number }) || null,
                thesis: (attrs.investment_thesis as string) || "",
                portfolio: (attrs.notable_portfolio as string[]) || [],
                geo: (attrs.geo_focus as string[]) || [],
                website: (attrs.website_url as string) || null,
              },
              matchScore: item.breakdown.total,
              topFactors: item.breakdown.topFactors,
              pillars: item.breakdown.pillars,
              rationale: rationales[i]?.rationale || `Strong ${item.breakdown.total}/100 match based on ${item.breakdown.topFactors.join(", ")}.`,
              partner: contact ? {
                name: contact.name,
                title: contact.title,
                email: contact.email,
                linkedin: contact.linkedin,
                rationale: partnerData?.partnerRationale,
              } : undefined,
              draftEmail: partnerData?.emailSubject ? {
                subject: partnerData.emailSubject,
                body: partnerData.emailBody || "",
              } : undefined,
            }
          })

          allEnrichedMatches.push(...enrichedMatches)
          emit({ phase: "batch", batchNumber: batchIdx + 1, matches: enrichedMatches })
        }

        // FLOW: Build summary stats for hidden matches (free-tier paywall)
        const hiddenInvestors = top50.slice(maxVisible)
        const hiddenMatchSummary = hiddenInvestors.length > 0 ? {
          count: hiddenInvestors.length,
          sectorMatchCount: hiddenInvestors.filter(s => s.breakdown.sectorScore > 0).length,
          activeDeployingCount: hiddenInvestors.filter(s => s.breakdown.activeScore > 0).length,
          stageMatchCount: hiddenInvestors.filter(s => s.breakdown.stageScore >= 12).length,
          avgScore: Math.round(hiddenInvestors.reduce((sum, s) => sum + s.breakdown.total, 0) / hiddenInvestors.length),
          topScore: Math.max(...hiddenInvestors.map(s => s.breakdown.total)),
        } : null

        emit({
          phase: "complete",
          totalGenerated: Math.min(top50.length, maxVisible),
          tier,
          tierInfo: { tier, matchLimit: maxVisible },
          hiddenMatchSummary,
        })

        // ── Cache results (fire-and-forget) ──────────────
        if (foundryId) {
          const cacheData = {
            matches: allEnrichedMatches,
            nearMisses: nearMisses.slice(0, 20),
            totalScored: allInvestors.length,
            tier,
            generatedAt: new Date().toISOString(),
          }
          // INTENT: Cache via admin client (bypasses RLS — no UPDATE/DELETE
          // policies exist on report_snapshots, and INSERT policy may not match
          // active_foundry_id). Delete stale + insert fresh. Fire-and-forget.
          try {
            const adminDb = createAdminClient()
            await adminDb.from("report_snapshots")
              .delete()
              .eq("foundry_id", foundryId)
              .eq("report_type", "investor-match")

            const { error: cacheErr } = await adminDb.from("report_snapshots").insert({
              report_type: "investor-match",
              report_date: new Date().toISOString().slice(0, 10),
              summary_text: `Investor matches for ${foundry?.name || "company"}`,
              report_data: cacheData,
              foundry_id: foundryId,
              profile_id: user.id,
            })
            if (cacheErr) console.warn("[InvestorMatch] Cache save failed:", cacheErr.message)
          } catch (cacheEx) {
            console.warn("[InvestorMatch] Cache save error:", cacheEx)
          }
        }

      } catch (err) {
        emit({ phase: "error", message: err instanceof Error ? err.message : "Matching failed" })
      } finally {
        clearInterval(heartbeat)
        try { controller.close() } catch { /* already closed */ }
      }
    },
  })

  return new Response(readable, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
  })
}
