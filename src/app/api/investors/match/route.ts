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
import { getTextProvider } from "@/lib/ai-providers/registry"
import type { AIProviderId } from "@/lib/ai-providers/types"
import { calculateMatchScore } from "@/lib/investor-match"
import type { FoundryProfile } from "@/lib/investor-match"
import type { InvestorFirm } from "@/actions/investors"

export const runtime = "nodejs"
export const maxDuration = 300

// ─── Haiku Call ─────────────────────────────────────────────────

function resolveApiKey(providerId: AIProviderId): string {
  const envMap: Partial<Record<AIProviderId, string>> = {
    anthropic: process.env.ANTHROPIC_API_KEY?.trim(),
  }
  const key = envMap[providerId]
  if (!key) throw new Error(`API key not configured for: ${providerId}`)
  return key
}

async function callHaiku(systemPrompt: string, userPrompt: string, maxTokens = 2000): Promise<string> {
  const streamFn = getTextProvider("anthropic")
  if (!streamFn) throw new Error("Anthropic provider not available")
  const apiKey = resolveApiKey("anthropic")
  let output = ""
  await new Promise<void>((resolve, reject) => {
    streamFn({
      apiKey, modelId: "claude-haiku-4-5", systemPrompt, userPrompt, maxTokens,
      onChunk: (t) => { output += t },
      onDone: () => resolve(),
      onError: (e) => reject(new Error(e)),
    }).catch(reject)
  })
  return output
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

  // ── Check for cached results (< 7 days old) ──────────────
  const { data: profileData } = await supabase.from("profiles").select("foundry_id").eq("id", user.id).single()
  const foundryId = profileData?.foundry_id

  if (foundryId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cached } = await (supabase as any)
      .from("report_snapshots")
      .select("report_data, generated_at")
      .eq("foundry_id", foundryId)
      .eq("report_type", "investor-match")
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (cached?.report_data && cached.generated_at) {
      const cacheAge = Date.now() - new Date(cached.generated_at).getTime()
      const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000
      if (cacheAge < SEVEN_DAYS) {
        // Return cached results as JSON (no SSE needed)
        return NextResponse.json({ cached: true, ...cached.report_data })
      }
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
          emit({ phase: "error", message: "No company found. Please set up your company first." })
          return
        }

        const { data: foundry } = await supabase
          .from("foundries")
          .select("name, stage, industry, sector, purpose_data, company_profile")
          .eq("id", profile.foundry_id)
          .single()

        if (!foundry) {
          emit({ phase: "error", message: "Company not found." })
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

        // ── Get Tier Access ──────────────────────────────
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: subscription } = await (supabase as any)
          .from("user_subscriptions")
          .select("tier, status")
          .eq("user_id", user.id)
          .in("status", ["active", "trialing"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()

        const tier = subscription?.tier || "free"
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

          // Fetch contacts for paid tiers
          const contactsByListing: Record<string, { name: string; title: string; email?: string; linkedin?: string }[]> = {}
          if (isStarter) {
            const listingIds = batchItems.map(item => item.firm.id)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: contacts } = await (supabase as any)
              .from("vc_pe_contacts")
              .select("listing_id, full_name, title, seniority, email, linkedin_url, is_decision_maker")
              .in("listing_id", listingIds)
              .eq("seniority", "partner")
              .order("is_decision_maker", { ascending: false })

            if (contacts) {
              for (const c of contacts) {
                if (!contactsByListing[c.listing_id]) contactsByListing[c.listing_id] = []
                contactsByListing[c.listing_id].push({
                  name: c.full_name,
                  title: c.title,
                  email: isPro ? c.email : undefined,
                  linkedin: c.linkedin_url,
                })
              }
            }
          }

          // Generate partner rationale + draft emails for Professional
          let partnerRationales: { partnerRationale?: string; emailSubject?: string; emailBody?: string }[] = []
          if (isPro && Object.keys(contactsByListing).length > 0) {
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
              const result = await callHaiku("Write concise, personalised outreach.", partnerPrompt, 3000)
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

        emit({ phase: "complete", totalGenerated: Math.min(top50.length, maxVisible), tier })

        // ── Cache results (fire-and-forget) ──────────────
        if (foundryId) {
          const cacheData = {
            matches: allEnrichedMatches,
            nearMisses: nearMisses.slice(0, 20),
            totalScored: allInvestors.length,
            tier,
            generatedAt: new Date().toISOString(),
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(supabase as any).from("report_snapshots").upsert({
            id: `investor-match-${foundryId}`,
            report_type: "investor-match",
            report_date: new Date().toISOString().slice(0, 10),
            summary_text: `Investor matches for ${foundry?.name || "company"}`,
            report_data: cacheData,
            foundry_id: foundryId,
            profile_id: user.id,
          }, { onConflict: "id" }).then(({ error: cacheErr }: { error: { message: string } | null }) => {
            if (cacheErr) console.warn("[InvestorMatch] Cache save failed:", cacheErr.message)
          })
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
