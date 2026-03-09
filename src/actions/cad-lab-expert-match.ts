"use server"

/**
 * @file cad-lab-expert-match.ts — Match fractional executives to CAD Lab projects.
 *
 * @description Fetches public directory experts and scores them against the
 * project's manufacturing processes and materials. Used by the Executive Review
 * tab on both Specify and Source pages.
 *
 * Scoring (max 100):
 * - Specialization overlap with project processes/materials (0–50pts)
 * - Role weighting: design context favours CTO/CPO, sourcing context favours COO/CPO (0–40pts)
 * - Baseline: verified + experienced (0–10pts)
 */

import { getDirectoryExperts } from "@/actions/directory"
import type { DirectoryExpert } from "@/lib/directory/types"

export interface MatchedExpert {
  expert: DirectoryExpert
  matchScore: number
  matchReasons: string[]
}

// INTENT: Role keywords that signal relevance for design vs sourcing contexts.
const DESIGN_ROLE_KEYWORDS = ["cto", "chief technology", "engineering", "design", "product", "cpo", "chief product"]
const SOURCING_ROLE_KEYWORDS = ["coo", "chief operating", "supply chain", "procurement", "operations", "cpo", "chief product"]

/**
 * Matches directory experts against a project's manufacturing profile.
 *
 * @param params.processes - Manufacturing processes used (e.g., "CNC Machining", "Sheet Metal")
 * @param params.materials - Materials specified (e.g., "Aluminum 6061", "Stainless Steel")
 * @param params.context - "design" weights CTO/CPO roles; "sourcing" weights COO/CPO roles
 * @returns Scored and sorted list of matched experts
 */
export async function matchProjectExperts(params: {
  processes: string[]
  materials: string[]
  context: "design" | "sourcing"
}): Promise<{ experts: MatchedExpert[] }> {
  const { processes, materials, context } = params

  // Fetch a broad set of experts to score against
  const { experts: allExperts } = await getDirectoryExperts({ limit: 50 })

  if (allExperts.length === 0) {
    return { experts: [] }
  }

  const processLower = processes.map((p) => p.toLowerCase())
  const materialLower = materials.map((m) => m.toLowerCase())
  const roleKeywords = context === "design" ? DESIGN_ROLE_KEYWORDS : SOURCING_ROLE_KEYWORDS

  const scored: MatchedExpert[] = []

  for (const expert of allExperts) {
    let score = 0
    const reasons: string[] = []

    // ── Specialization overlap (max 50pts) ──
    const specsLower = expert.specializations.map((s) => s.toLowerCase())

    for (const proc of processLower) {
      const match = specsLower.find(
        (s) => s.includes(proc) || proc.includes(s.split(" ")[0]),
      )
      if (match) {
        score += 15
        reasons.push(`Specializes in ${proc}`)
      }
    }

    for (const mat of materialLower) {
      const match = specsLower.find(
        (s) => s.includes(mat.split(" ")[0]) || mat.includes(s.split(" ")[0]),
      )
      if (match) {
        score += 10
        reasons.push(`Experience with ${mat}`)
      }
    }

    // Cap specialization score at 50
    score = Math.min(score, 50)

    // ── Role relevance (max 40pts) ──
    const headline = (expert.headline ?? "").toLowerCase()
    const bio = (expert.bio ?? "").toLowerCase()
    const combined = `${headline} ${bio}`

    for (const keyword of roleKeywords) {
      if (combined.includes(keyword)) {
        score += 40
        reasons.push(`Relevant role for ${context} review`)
        break // INTENT: Only count role once
      }
    }

    // ── Baseline for verified experts with experience (max 10pts) ──
    if (expert.is_verified) {
      score += 5
      reasons.push("Verified expert")
    }
    if (expert.years_experience && expert.years_experience >= 10) {
      score += 5
      reasons.push(`${expert.years_experience}+ years experience`)
    }

    if (reasons.length > 0) {
      scored.push({ expert, matchScore: Math.min(score, 100), matchReasons: reasons })
    }
  }

  // Sort by score descending, take top 12
  scored.sort((a, b) => b.matchScore - a.matchScore)

  return { experts: scored.slice(0, 12) }
}
