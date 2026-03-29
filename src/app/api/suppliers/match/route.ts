/**
 * @file route.ts — Smart Supplier Matching SSE endpoint
 *
 * @description Scores all Products/Services suppliers against the founder's company
 * profile (industry, gaps, objectives, Forge projects), takes the top 50, then
 * generates AI rationales in batches of 5 via Haiku. Streams results via SSE.
 *
 * Tier-gated: Free users see 5 matches, Starter sees 20, Professional sees 50.
 *
 * FLOW: POST → SSE phases (profile → scoring → scored → generating → batch → complete)
 *
 * @security Requires authenticated user. API keys server-side only.
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { calculateSupplierMatchScore } from "@/lib/supplier-match"
import type { CompanyMatchProfile, SupplierListing } from "@/lib/supplier-match"

export const runtime = "nodejs"
export const maxDuration = 300

// ─── DeepSeek Call ───────────────────────────────────────────────

async function callHaiku(systemPrompt: string, userPrompt: string, maxTokens = 2000): Promise<string> {
  // Try DeepSeek first (cheaper), fall back to Anthropic Haiku
  const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (deepseekKey) {
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
    console.warn("[callHaiku] DeepSeek failed, falling back to Anthropic Haiku")
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

function safeParseJSON<T>(text: string): T[] {
  try {
    const match = text.match(/\[[\s\S]*\]/)
    return match ? JSON.parse(match[0]) : []
  } catch { return [] }
}

// ─── Types ──────────────────────────────────────────────────────

interface EnrichedSupplierMatch {
  supplier: {
    id: string
    name: string
    category: string
    subcategory: string
    description: string
    city: string | null
    country: string | null
    is_verified: boolean
    average_rating: number | null
    contact_email: string | null
    contact_name: string | null
    contact_phone: string | null
    contact_linkedin: string | null
  }
  matchScore: number
  topFactors: string[]
  rationale: string
}

interface NearMiss {
  name: string
  subcategory: string
  score: number
  reason: string
}

// ─── POST Handler ───────────────────────────────────────────────

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

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

        const foundryId = profile.foundry_id

        const { data: foundry } = await supabase
          .from("foundries")
          .select("name, stage, industry, sector, purpose_data, company_profile")
          .eq("id", foundryId)
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
          emit({ phase: "incomplete_profile", missing, message: "Complete your company profile to see matched suppliers." })
          clearInterval(heartbeat)
          controller.close()
          return
        }

        // ── Fetch Company Context in Parallel ────────────
        const [objectivesResult, tasksResult, gapsResult, projectsResult] = await Promise.allSettled([
          supabase
            .from("objectives")
            .select("title, description, workstream, resource_suggestions")
            .eq("foundry_id", foundryId)
            .in("status", ["In Progress", "Not Started"])
            .limit(10),
          supabase
            .from("tasks")
            .select("title, description, workstream")
            .eq("foundry_id", foundryId)
            .in("status", ["Pending", "Accepted"])
            .limit(20),
          supabase
            .from("foundry_function_coverage")
            .select("coverage_status, business_functions!inner(category, name, is_critical)")
            .eq("foundry_id", foundryId)
            .in("coverage_status", ["gap", "partial"]),
          supabase
            .from("cad_lab_projects")
            .select("name, product_overview, diagnostic_answers")
            .eq("foundry_id", foundryId)
            .order("updated_at", { ascending: false })
            .limit(5),
        ])

        // Build CompanyMatchProfile
        const processes: string[] = []
        const materials: string[] = []
        const projectDescriptions: string[] = []

        if (projectsResult.status === "fulfilled" && projectsResult.value.data) {
          for (const proj of projectsResult.value.data) {
            if (proj.product_overview) projectDescriptions.push(proj.product_overview)
            // INTENT: diagnostic_answers is Record<moduleId, { mfg_process, material, ... }>
            const diag = proj.diagnostic_answers as Record<string, Record<string, string>> | null
            if (diag) {
              for (const moduleAnswers of Object.values(diag)) {
                if (moduleAnswers.mfg_process && moduleAnswers.mfg_process !== "Other") {
                  processes.push(moduleAnswers.mfg_process)
                }
                if (moduleAnswers.material) {
                  materials.push(moduleAnswers.material)
                }
              }
            }
          }
        }

        const criticalGaps: { category: string; name: string }[] = []
        const nonCriticalGaps: { category: string; name: string }[] = []

        if (gapsResult.status === "fulfilled" && gapsResult.value.data) {
          for (const row of gapsResult.value.data) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const bf = (row as any).business_functions as { category: string; name: string; is_critical: boolean | null }
            if (bf) {
              if (bf.is_critical) {
                criticalGaps.push({ category: bf.category, name: bf.name })
              } else {
                nonCriticalGaps.push({ category: bf.category, name: bf.name })
              }
            }
          }
        }

        const objectives: string[] = []
        if (objectivesResult.status === "fulfilled" && objectivesResult.value.data) {
          for (const obj of objectivesResult.value.data) {
            objectives.push(`${obj.title} ${obj.description || ""}`.trim())
          }
        }

        const taskTitles: string[] = []
        if (tasksResult.status === "fulfilled" && tasksResult.value.data) {
          for (const task of tasksResult.value.data) {
            taskTitles.push(`${task.title} ${task.description || ""}`.trim())
          }
        }

        const companyProfile: CompanyMatchProfile = {
          industry: foundry.industry,
          sector: foundry.sector,
          stage: foundry.stage,
          processes: [...new Set(processes)],
          materials: [...new Set(materials)],
          criticalGaps,
          nonCriticalGaps,
          objectives,
          tasks: taskTitles,
          certNeeds: [],
          projectDescriptions,
        }

        // Build context string for AI rationale prompt
        const purposeData = foundry.purpose_data as Record<string, unknown> | null
        const companyProfileData = foundry.company_profile as Record<string, unknown> | null

        const companyContext = [
          `Company: ${foundry.name}`,
          `Stage: ${foundry.stage}`,
          `Industry: ${foundry.industry || foundry.sector || "Not specified"}`,
          purposeData?.purpose ? `Purpose: ${purposeData.purpose}` : null,
          companyProfileData?.business_model ? `Business model: ${companyProfileData.business_model}` : null,
          companyProfile.processes.length > 0 ? `Manufacturing needs: ${companyProfile.processes.join(", ")}` : null,
          companyProfile.materials.length > 0 ? `Materials needed: ${companyProfile.materials.join(", ")}` : null,
          criticalGaps.length > 0 ? `Critical gaps: ${criticalGaps.map(g => g.name).join(", ")}` : null,
          objectives.length > 0 ? `Key objectives: ${objectives.slice(0, 3).join("; ")}` : null,
          projectDescriptions.length > 0 ? `Forge projects: ${projectDescriptions.slice(0, 2).join("; ")}` : null,
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
        const maxVisible = isPro ? 50 : isStarter ? 20 : 5

        // ── Score All Suppliers ──────────────────────────
        emit({ phase: "scoring", message: "Scoring suppliers against your profile..." })

        let allSuppliers: SupplierListing[] = []
        let offset = 0
        const pageSize = 1000

        while (true) {
          const { data, error } = await supabase
            .from("marketplace_listings")
            .select("id, title, description, category, subcategory, industries, process_capabilities, materials, certifications, key_equipment, specialties, company_size, minimum_order, is_verified, data_quality_score, average_rating, attributes, contact_email, contact_name, contact_phone, contact_linkedin, city, country")
            .in("category", ["Products", "Services"])
            .range(offset, offset + pageSize - 1)

          if (error || !data || data.length === 0) break
          allSuppliers = allSuppliers.concat(data.map(d => ({
            id: d.id,
            title: d.title || "",
            description: d.description || "",
            category: d.category || "",
            subcategory: d.subcategory || "",
            industries: d.industries as string[] | null,
            process_capabilities: d.process_capabilities as Record<string, unknown>[] | null,
            materials: d.materials as string[] | null,
            certifications: d.certifications as string[] | null,
            key_equipment: d.key_equipment as string[] | null,
            specialties: d.specialties as string[] | null,
            company_size: d.company_size as string | null,
            minimum_order: d.minimum_order as string | null,
            is_verified: d.is_verified || false,
            data_quality_score: d.data_quality_score as number | null,
            average_rating: d.average_rating as number | null,
            attributes: d.attributes as Record<string, unknown> | null,
            contact_email: d.contact_email as string | null,
            contact_name: d.contact_name as string | null,
            contact_phone: d.contact_phone as string | null,
            contact_linkedin: d.contact_linkedin as string | null,
            city: d.city as string | null,
            country: d.country as string | null,
          })))
          if (data.length < pageSize) break
          offset += pageSize
        }

        // Score each supplier
        const scored = allSuppliers.map(supplier => ({
          supplier,
          breakdown: calculateSupplierMatchScore(supplier, companyProfile),
        })).sort((a, b) => b.breakdown.total - a.breakdown.total)

        const top50 = scored.slice(0, 50)
        // INTENT: Near-miss reasons should explain WHY the supplier ranked lower,
        // not repeat their strengths. Identify the weakest scoring dimension.
        const nearMisses: NearMiss[] = scored.slice(50, 100).map(s => {
          const b = s.breakdown
          const weaknesses: string[] = []
          if (b.industryScore === 0) weaknesses.push("No industry overlap")
          if (b.gapScore === 0) weaknesses.push("Doesn't fill identified gaps")
          if (b.manufacturingScore === 0 && companyProfile.processes.length > 0) weaknesses.push("No manufacturing fit")
          if (b.certScore === 0) weaknesses.push("Missing required certifications")
          if (b.qualityScore < 3) weaknesses.push("Limited verification data")
          if (b.stageScore === 0) weaknesses.push("Stage mismatch")

          const reason = weaknesses.length > 0
            ? weaknesses.slice(0, 2).join(" · ")
            : (b.topFactors.length > 0 ? `Partial match: ${b.topFactors[0]}` : `Score: ${b.total}/100`)

          return {
            name: s.supplier.title,
            subcategory: s.supplier.subcategory,
            score: b.total,
            reason,
          }
        })

        emit({
          phase: "scored",
          totalScored: allSuppliers.length,
          top50Count: top50.length,
          nearMissCount: nearMisses.length,
          nearMisses: nearMisses.slice(0, 20),
        })

        // ── Generate Rationales in Batches of 5 ─────────
        const batchSize = 5
        const batches = Math.ceil(Math.min(top50.length, maxVisible) / batchSize)

        for (let batchIdx = 0; batchIdx < batches; batchIdx++) {
          const batchStart = batchIdx * batchSize
          const batchItems = top50.slice(batchStart, batchStart + batchSize)

          emit({
            phase: "generating",
            batchNumber: batchIdx + 1,
            totalBatches: batches,
            message: `Generating insights for suppliers ${batchStart + 1}-${batchStart + batchItems.length}...`,
          })

          // Build supplier summaries for the prompt
          const supplierSummaries = batchItems.map((item, i) => {
            const s = item.supplier
            const caps = (s.process_capabilities ?? [])
              .map(pc => String((pc as Record<string, unknown>).process || (pc as Record<string, unknown>).name || ""))
              .filter(Boolean)
              .slice(0, 5)
            const specs = (s.specialties ?? []).slice(0, 5)
            return `[${batchStart + i + 1}] ${s.title}
Category: ${s.category} / ${s.subcategory}
Description: ${(s.description || "").slice(0, 300)}
Location: ${[s.city, s.country].filter(Boolean).join(", ") || "Not specified"}
Industries: ${(s.industries ?? []).slice(0, 5).join(", ") || "Not specified"}
Specialties: ${specs.join(", ") || "Not specified"}
Capabilities: ${caps.join(", ") || "Not specified"}
Materials: ${(s.materials ?? []).slice(0, 5).join(", ") || "Not specified"}
Certifications: ${(s.certifications ?? []).slice(0, 5).join(", ") || "Not specified"}
Match score: ${item.breakdown.total}/100 (${item.breakdown.topFactors.join(", ")})`
          }).join("\n\n")

          const rationalePrompt = `You are a procurement advisor for hardware startups. For each supplier below, write 2-3 sentences explaining why they are a good match for this company. Reference specific capabilities, certifications, materials, or industry experience that align with the company's needs. Be concrete and specific.

## Company
${companyContext}

## Suppliers
${supplierSummaries}

Return a JSON array of ${batchItems.length} objects: [{"rationale": "..."}]
Only return the JSON array.`

          let rationales: { rationale: string }[] = []
          try {
            const result = await callHaiku("Be concise, specific, and reference real supplier data.", rationalePrompt)
            rationales = safeParseJSON<{ rationale: string }>(result)
          } catch (err) {
            console.warn("[SupplierMatch] Rationale generation failed:", err)
          }

          // Assemble enriched matches
          const enrichedMatches: EnrichedSupplierMatch[] = batchItems.map((item, i) => ({
            supplier: {
              id: item.supplier.id,
              name: item.supplier.title,
              category: item.supplier.category,
              subcategory: item.supplier.subcategory,
              description: (item.supplier.description || "").slice(0, 300),
              city: item.supplier.city,
              country: item.supplier.country,
              is_verified: item.supplier.is_verified,
              average_rating: item.supplier.average_rating,
              contact_email: isStarter ? item.supplier.contact_email : null,
              contact_name: isStarter ? item.supplier.contact_name : null,
              contact_phone: isPro ? item.supplier.contact_phone : null,
              contact_linkedin: isStarter ? item.supplier.contact_linkedin : null,
            },
            matchScore: item.breakdown.total,
            topFactors: item.breakdown.topFactors,
            rationale: rationales[i]?.rationale || `Strong ${item.breakdown.total}/100 match based on ${item.breakdown.topFactors.join(", ")}.`,
          }))

          emit({ phase: "batch", batchNumber: batchIdx + 1, matches: enrichedMatches })
        }

        emit({
          phase: "complete",
          totalGenerated: Math.min(top50.length, maxVisible),
          tier,
          tierInfo: { tier, matchLimit: maxVisible, totalScored: allSuppliers.length },
        })

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
