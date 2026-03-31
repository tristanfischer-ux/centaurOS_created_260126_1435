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
import { calculateMatchScore } from "@/lib/investor-match"
import type { FoundryProfile } from "@/lib/investor-match"
import type { InvestorFirm } from "@/actions/investors"

export const runtime = "nodejs"
export const maxDuration = 300

// ─── AI Call (DeepSeek first, Anthropic Haiku fallback) ─────────

async function callHaiku(systemPrompt: string, userPrompt: string, maxTokens = 2000): Promise<string> {
  // Try DeepSeek first (cheaper)
  const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (deepseekKey) {
    try {
      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${deepseekKey}` },
        body: JSON.stringify({
          model: "deepseek-chat",
          max_tokens: maxTokens,
          messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        }),
      })
      if (response.ok) {
        const data = await response.json()
        return data.choices?.[0]?.message?.content ?? ""
      }
      console.warn(JSON.stringify({ level: "warn", event: "ai_provider_fallback", feature: "investor_match", primaryProvider: "deepseek", fallbackProvider: "anthropic-haiku", reason: `HTTP ${response.status}`, timestamp: new Date().toISOString() }))
    } catch (err) {
      console.warn(JSON.stringify({ level: "warn", event: "ai_provider_fallback", feature: "investor_match", primaryProvider: "deepseek", fallbackProvider: "anthropic-haiku", reason: err instanceof Error ? err.message : "unknown", timestamp: new Date().toISOString() }))
    }
  }

  // Fallback: Anthropic Haiku
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!anthropicKey) throw new Error("No AI API key configured (DEEPSEEK_API_KEY or ANTHROPIC_API_KEY)")

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  })

  if (!response.ok) throw new Error(`Anthropic API error: ${response.status}`)
  const data = await response.json()
  return (data.content?.[0]?.text ?? "").trim()
}

// INTENT: Opus for high-quality draft emails — the most important user-facing content.
// Rationales stay on Haiku (shorter, less critical). Opus produces substantially
// better cold emails with more natural tone and specific portfolio references.
async function callOpus(systemPrompt: string, userPrompt: string, maxTokens = 4000): Promise<string> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY not configured")

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-20250514",
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  })

  if (!response.ok) {
    // Fallback to Haiku if Opus fails
    console.warn("[InvestorMatch] Opus failed, falling back to Haiku")
    return callHaiku(systemPrompt, userPrompt, maxTokens)
  }
  const data = await response.json()
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
          .select("foundry_id")
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
        const companyContext = [
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
            const result = await callHaiku("Be concise, specific, and reference real data.", rationalePrompt)
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
            const partnerPrompt = `For each investor, write: (1) why this specific partner is the right person (reference their investments), (2) a personalised cold email subject line, (3) a 3-paragraph cold email body referencing the partner's portfolio and how this company fits.

## Company
${companyContext}

## Investors + Partners
${batchItems.map((item, i) => {
  const contact = contactsByListing[item.firm.id]?.[0]
  return `[${i + 1}] ${item.firm.title} — Partner: ${contact?.name || "Unknown"} (${contact?.title || ""})
Thesis: ${(item.firm.attributes?.investment_thesis as string) || "N/A"}
Portfolio: ${(item.firm.attributes?.notable_portfolio as string[])?.slice(0, 3).join(", ") || "N/A"}`
}).join("\n\n")}

Return a JSON array of ${batchItems.length} objects: [{"partnerRationale": "...", "emailSubject": "...", "emailBody": "..."}]
Only return the JSON array.`

            try {
              const result = await callOpus("Write concise, personalised outreach. Be specific about the investor's portfolio and thesis. Reference real companies they've backed.", partnerPrompt, 4000)
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
