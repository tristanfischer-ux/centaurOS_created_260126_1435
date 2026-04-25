/**
 * @file route.ts -- Intelligent Recruit Matching SSE endpoint
 *
 * @description Scores all fractional executives (People category) against the
 * company's needs profile, takes the top 20, then generates AI rationales in
 * batches of 5 via Haiku. Streams results via SSE for progressive disclosure.
 *
 * Gathers company context: function gaps, active objectives, unassigned tasks,
 * open advisory questions, and current team composition.
 *
 * @security Requires authenticated user. API keys server-side only.
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { aiGuard } from "@/lib/ai/guard"
import { calculateRecruitMatchScore } from "@/lib/recruit-match"
import type { CompanyNeedsProfile, ExecutiveProfile } from "@/lib/recruit-match"
import { logLlmUsage } from "@/lib/cost-logging/llm-usage"

export const runtime = "nodejs"
export const maxDuration = 300

// --- DeepSeek Call ------------------------------------------------------------

async function callHaiku(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 2000,
  context: { foundryId?: string; userId?: string } = {},
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY not configured")
  const { foundryId, userId } = context
  const recruitModel = "deepseek-chat"

  let response: Response
  try {
    response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: recruitModel,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    })
  } catch (err) {
    void logLlmUsage({
      action: 'recruit_match',
      modelUsed: recruitModel,
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
      action: 'recruit_match',
      modelUsed: recruitModel,
      tokensIn: 0,
      tokensOut: 0,
      status,
      errorMessage: `${response.status}: ${errText.slice(0, 200)}`,
      foundryId,
      userId,
    })
    throw new Error(`DeepSeek API error: ${response.status}`)
  }

  const data = await response.json()
  void logLlmUsage({
    action: 'recruit_match',
    modelUsed: recruitModel,
    tokensIn: data.usage?.prompt_tokens ?? 0,
    tokensOut: data.usage?.completion_tokens ?? 0,
    status: 'success',
    foundryId,
    userId,
  })
  return data.choices?.[0]?.message?.content ?? ""
}

function safeParseJSON<T>(text: string): T[] {
  try {
    const match = text.match(/\[[\s\S]*\]/)
    return match ? JSON.parse(match[0]) : []
  } catch { return [] }
}

// --- Types --------------------------------------------------------------------

interface EnrichedRecruitMatch {
  executive: {
    id: string
    name: string
    headline: string
    skills: string[]
    industries: string[]
    yearsExperience: number
    hourlyRate: number | null
    location: string | null
    rating: number
    reviewCount: number
    isVerified: boolean
    trustedByCount: number
  }
  matchScore: number
  topFactors: string[]
  rationale: string
  matchSignals: string[]
  highlightedSkills: string[]
}

interface NearMiss {
  name: string
  subcategory: string
  score: number
  reason: string
}

// --- POST Handler -------------------------------------------------------------

export async function POST(request: Request) {
  // INTENT: Suppress unused-variable lint for the request param (required by Next.js route signature)
  void request

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // SECURITY: AI cost gate — prevents free-tier users from running unlimited matching
  const guard = await aiGuard(supabase, 'recruit_match')
  if (guard.denied) return guard.response

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
        // -- Get Company Profile ------------------------------------------
        emit({ phase: "profile", message: "Loading your company profile..." })

        const { data: profile } = await supabase
          .from("profiles")
          .select("foundry_id")
          .eq("id", user.id)
          .single()

        if (!profile?.foundry_id) {
          // INTENT: Sandbox and forge-guild foundries may not have a foundry_id.
          // This is a normal state, not an error — show onboarding prompt instead of error toast.
          emit({ phase: "no_company", message: "Set up your company profile in Settings to see personalised recruit matches. You can still browse all candidates." })
          clearInterval(heartbeat)
          controller.close()
          return
        }

        const foundryId = profile.foundry_id

        // -- Parallel context queries --------------------------------------
        // INTENT: Gather all company context in parallel for speed.
        const [
          foundryResult,
          gapsResult,
          objectivesResult,
          tasksResult,
          advisoryResult,
          teamResult,
        ] = await Promise.all([
          // 1. Foundry details
          supabase
            .from("foundries")
            .select("name, stage, industry, sector, purpose_data, company_profile")
            .eq("id", foundryId)
            .single(),

          // 2. Function gaps
          supabase
            .from("foundry_function_coverage")
            .select("business_functions(name)")
            .eq("foundry_id", foundryId)
            .eq("coverage_status", "gap"),

          // 3. Active objectives (workstreams)
          supabase
            .from("objectives")
            .select("title, workstream")
            .eq("foundry_id", foundryId)
            .in("status", ["In Progress", "Not Started"])
            .eq("is_ghost", false)
            .limit(30),

          // 4. Unassigned tasks
          supabase
            .from("tasks")
            .select("title")
            .eq("foundry_id", foundryId)
            .is("assignee_id", null)
            .neq("status", "Completed")
            .limit(20),

          // 5. Open advisory questions
          supabase
            .from("advisory_questions")
            .select("title, category")
            .eq("foundry_id", foundryId)
            .eq("status", "open")
            .limit(10),

          // 6. Current team
          supabase
            .from("profiles")
            .select("headline, role")
            .eq("foundry_id", foundryId),
        ])

        const foundry = foundryResult.data
        if (!foundry) {
          // DECISION: Show a helpful message instead of a generic error when
          // the foundry doesn't exist (e.g. shared forge-guild users).
          emit({ phase: "incomplete_profile", missing: ["Company profile setup"], message: "Set up your company profile in Settings to see personalised executive matches. You can still browse all executives." })
          clearInterval(heartbeat)
          controller.close()
          return
        }

        // Check profile completeness
        const missing: string[] = []
        if (!foundry.stage) missing.push("Company stage (pre-seed, seed, Series A, etc.)")
        if (!foundry.industry && !foundry.sector) missing.push("Industry or sector")

        if (missing.length > 0) {
          emit({ phase: "incomplete_profile", missing, message: "Complete your company profile to see matched executives." })
          clearInterval(heartbeat)
          controller.close()
          return
        }

        // -- Build CompanyNeedsProfile ------------------------------------

        // INTENT: Extract function gap names from the joined business_functions table
        const functionGaps: string[] = (gapsResult.data || [])
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((row: any) => row.business_functions?.name)
          .filter(Boolean) as string[]

        // INTENT: Extract workstream strings from objectives
        const objectiveWorkstreams: string[] = (objectivesResult.data || [])
          .flatMap(obj => [obj.workstream, obj.title].filter(Boolean)) as string[]

        // INTENT: Extract keywords from unassigned task titles
        const unassignedTaskKeywords: string[] = (tasksResult.data || [])
          .map(t => t.title)
          .filter(Boolean) as string[]

        // INTENT: Extract categories from open advisory questions
        const advisoryCategories: string[] = (advisoryResult.data || [])
          .map(q => q.category)
          .filter(Boolean) as string[]

        // INTENT: Extract team roles/headlines for context
        const teamRoles: string[] = (teamResult.data || [])
          .map(p => p.headline || p.role)
          .filter(Boolean) as string[]

        const companyNeeds: CompanyNeedsProfile = {
          stage: foundry.stage,
          sector: foundry.sector || foundry.industry,
          industry: foundry.industry,
          functionGaps,
          objectiveWorkstreams,
          unassignedTaskKeywords,
          advisoryCategories,
          teamRoles,
        }

        // Build human-readable company context for AI rationale generation
        const purposeData = foundry.purpose_data as Record<string, unknown> | null
        const companyProfileData = foundry.company_profile as Record<string, unknown> | null

        const companyContext = [
          `Company: ${foundry.name}`,
          `Stage: ${foundry.stage}`,
          `Sector: ${foundry.sector || foundry.industry || "Not specified"}`,
          purposeData?.purpose ? `Purpose: ${purposeData.purpose}` : null,
          companyProfileData?.business_model ? `Business model: ${companyProfileData.business_model}` : null,
          functionGaps.length > 0 ? `Function gaps: ${functionGaps.join(", ")}` : null,
          objectiveWorkstreams.length > 0 ? `Active objectives: ${objectiveWorkstreams.slice(0, 10).join(", ")}` : null,
          unassignedTaskKeywords.length > 0 ? `Unassigned tasks: ${unassignedTaskKeywords.slice(0, 10).join(", ")}` : null,
          advisoryCategories.length > 0 ? `Open advisory areas: ${advisoryCategories.join(", ")}` : null,
          teamRoles.length > 0 ? `Current team: ${teamRoles.slice(0, 10).join(", ")}` : null,
        ].filter(Boolean).join("\n")

        // -- Score All Executives -----------------------------------------
        emit({ phase: "scoring", message: "Scoring executives against your company needs..." })

        // FLOW: Fetch all People category listings (fractional executives)
        let allExecs: ExecutiveProfile[] = []
        let offset = 0
        const pageSize = 1000

        while (true) {
          const { data, error } = await supabase
            .from("marketplace_listings")
            .select("id, title, description, subcategory, attributes, is_verified")
            .eq("category", "People")
            .eq("is_demo", false)
            .range(offset, offset + pageSize - 1)

          if (error || !data || data.length === 0) break

          allExecs = allExecs.concat(data.map(d => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const attrs = (d.attributes || {}) as Record<string, any>
            return {
              id: d.id,
              title: d.title,
              description: d.description || "",
              subcategory: d.subcategory || "",
              skills: (attrs.skills as string[]) || [],
              industries: (attrs.industries as string[]) || [],
              companyStages: (attrs.company_stages as string[]) || [],
              yearsExperience: (attrs.years_experience as number) || 0,
              rating: (attrs.rating as number) || 0,
              reviewCount: (attrs.review_count as number) || 0,
              isVerified: d.is_verified || false,
              trustedByCount: (attrs.trusted_by_count as number) || 0,
              hourlyRate: (attrs.hourly_rate as number) || null,
              location: (attrs.location as string) || null,
            }
          }))

          if (data.length < pageSize) break
          offset += pageSize
        }

        // Score each executive
        const scored = allExecs.map(exec => ({
          exec,
          breakdown: calculateRecruitMatchScore(exec, companyNeeds),
        })).sort((a, b) => b.breakdown.total - a.breakdown.total)

        const top20 = scored.slice(0, 20)
        const nearMisses: NearMiss[] = scored.slice(20, 40).map(s => {
          const b = s.breakdown
          const weaknesses: string[] = []
          if (b.gapScore === 0) weaknesses.push("No function gap coverage")
          if (b.objectiveScore === 0) weaknesses.push("No objective alignment")
          if (b.industryScore === 0) weaknesses.push("No industry/stage fit")
          if (b.trustScore < 5) weaknesses.push("Limited trust signals")
          if (b.advisoryScore === 0) weaknesses.push("No advisory relevance")

          return {
            name: s.exec.title,
            subcategory: s.exec.subcategory,
            score: b.total,
            reason: weaknesses.length > 0
              ? weaknesses.slice(0, 2).join(" · ")
              : `Score: ${b.total}/100 -- close but not in top 20`,
          }
        })

        emit({
          phase: "scored",
          totalScored: allExecs.length,
          top20Count: top20.length,
          nearMissCount: nearMisses.length,
          nearMisses: nearMisses.slice(0, 10),
        })

        // -- Generate Rationales in Batches of 5 -------------------------
        const batchSize = 5
        const batches = Math.ceil(top20.length / batchSize)

        for (let batchIdx = 0; batchIdx < batches; batchIdx++) {
          const batchStart = batchIdx * batchSize
          const batchItems = top20.slice(batchStart, batchStart + batchSize)

          emit({
            phase: "generating",
            batchNumber: batchIdx + 1,
            totalBatches: batches,
            message: `Generating insights for executives ${batchStart + 1}-${batchStart + batchItems.length}...`,
          })

          // Build executive summaries for the prompt
          const execSummaries = batchItems.map((item, i) => {
            return `[${batchStart + i + 1}] ${item.exec.title}
Subcategory: ${item.exec.subcategory || "General"}
Skills: ${item.exec.skills.slice(0, 10).join(", ") || "Not specified"}
Industries: ${item.exec.industries.join(", ") || "Not specified"}
Experience: ${item.exec.yearsExperience} years
Rating: ${item.exec.rating}/5 (${item.exec.reviewCount} reviews)${item.exec.isVerified ? " [Verified]" : ""}
Match score: ${item.breakdown.total}/100 (${item.breakdown.topFactors.join(", ")})`
          }).join("\n\n")

          // Generate rationales
          const rationalePrompt = `You are Harper, a hiring advisor at Fractional Forge. For each executive below, write 2-3 sentences explaining why they match this company. Reference actual company gaps, objectives, or challenges. Be concrete and specific. No generic advice.

## Company
${companyContext}

## Executives
${execSummaries}

Return a JSON array of ${batchItems.length} objects: [{"rationale": "...", "matchSignals": ["signal1", "signal2"], "highlightedSkills": ["skill1", "skill2"]}]
Only return the JSON array.`

          let rationales: { rationale: string; matchSignals?: string[]; highlightedSkills?: string[] }[] = []
          try {
            const result = await callHaiku(
              "Be concise, specific, and reference real company data. matchSignals should be 1-3 short phrases about why this exec fits. highlightedSkills should be 1-3 of their most relevant skills.",
              rationalePrompt,
              2000,
              { foundryId, userId: user.id },
            )
            rationales = safeParseJSON(result)
          } catch (err) {
            console.warn("[RecruitMatch] Rationale generation failed:", err)
          }

          // Assemble enriched matches
          const enrichedMatches: EnrichedRecruitMatch[] = batchItems.map((item, i) => {
            const rationaleData = rationales[i]

            return {
              executive: {
                id: item.exec.id,
                name: item.exec.title,
                headline: item.exec.subcategory || item.exec.description.slice(0, 100),
                skills: item.exec.skills,
                industries: item.exec.industries,
                yearsExperience: item.exec.yearsExperience,
                hourlyRate: item.exec.hourlyRate,
                location: item.exec.location,
                rating: item.exec.rating,
                reviewCount: item.exec.reviewCount,
                isVerified: item.exec.isVerified,
                trustedByCount: item.exec.trustedByCount,
              },
              matchScore: item.breakdown.total,
              topFactors: item.breakdown.topFactors,
              rationale: rationaleData?.rationale || `Strong ${item.breakdown.total}/100 match based on ${item.breakdown.topFactors.join(", ")}.`,
              matchSignals: rationaleData?.matchSignals || item.breakdown.topFactors,
              highlightedSkills: rationaleData?.highlightedSkills || item.exec.skills.slice(0, 3),
            }
          })

          emit({ phase: "batch", batchNumber: batchIdx + 1, matches: enrichedMatches })
        }

        emit({ phase: "complete", totalGenerated: top20.length })

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
