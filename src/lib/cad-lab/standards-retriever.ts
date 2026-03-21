/**
 * @file standards-retriever.ts — Retrieves, scores, and budget-packs design standards for prompt injection.
 *
 * INTENT: Queries Supabase for relevant standards, scores them, and packs the
 * highest-scoring ones into a formatted prompt section that fits within the
 * allocated token budget (default 200K tokens of the 1M context window).
 */

import { createAdminClient } from "@/lib/supabase/admin"
import type { DesignStandard, StandardsRecommendation } from "@/types/design-standards"
import type { IndustryDomain } from "./industry-domains"
import { extractProductKeywords } from "./industry-domains"
import { rankStandards } from "./standards-recommender"

export interface StandardsPromptResult {
  /** Formatted markdown to inject into the prompt */
  content: string
  /** Total tokens consumed by the standards content */
  tokensUsed: number
  /** Standard codes included */
  standardCodes: string[]
  /** Number of standards matched (before budget trimming) */
  totalMatched: number
}

/**
 * Retrieves and formats design standards for prompt injection.
 *
 * @param industryDomain - Detected industry domain
 * @param productDescription - Full product description text
 * @param keyParts - Key parts/components mentioned
 * @param materials - Materials mentioned
 * @param maxTokenBudget - Maximum tokens to allocate (default 200K)
 * @param detail - "summary" for lightweight injection, "full" for complete requirements
 * @returns Formatted prompt content + metadata
 */
export async function retrieveStandardsForPrompt(
  industryDomain: IndustryDomain,
  productDescription: string,
  keyParts: string[] = [],
  materials: string[] = [],
  maxTokenBudget: number = 200_000,
  detail: "summary" | "full" = "full",
): Promise<StandardsPromptResult> {
  const supabase = createAdminClient()

  // Query standards for this domain (GIN index on product_tags handles fast matching)
  const { data: standards, error } = await supabase
    .from("design_standards")
    .select("*")
    .eq("industry_domain", industryDomain)
    .is("superseded_by", null)

  if (error || !standards || standards.length === 0) {
    return { content: "", tokensUsed: 0, standardCodes: [], totalMatched: 0 }
  }

  // Extract keywords from description + key parts for scoring
  const productKeywords = [
    ...extractProductKeywords(productDescription),
    ...keyParts.map(p => p.toLowerCase()),
  ]
  const engineeringKeywords = extractProductKeywords(
    keyParts.join(" ") + " " + materials.join(" ")
  )

  // Score and rank
  const ranked = rankStandards(
    standards as unknown as DesignStandard[],
    industryDomain,
    productKeywords,
    engineeringKeywords,
    materials,
  )

  if (ranked.length === 0) {
    return { content: "", tokensUsed: 0, standardCodes: [], totalMatched: 0 }
  }

  // Budget-pack: greedily add standards until budget exhausted
  // Always include at least the top-1 standard even if over budget
  const selected: StandardsRecommendation[] = []
  let tokensUsed = 0

  for (const rec of ranked) {
    const tokenCost = detail === "summary"
      ? Math.ceil(rec.summary.length / 4)
      : rec.tokenEstimate || Math.ceil(rec.requirementsMarkdown.length / 4)

    if (selected.length > 0 && tokensUsed + tokenCost > maxTokenBudget) break
    selected.push(rec)
    tokensUsed += tokenCost
  }

  if (selected.length === 0) {
    return { content: "", tokensUsed: 0, standardCodes: [], totalMatched: ranked.length }
  }

  // Format for prompt injection
  const content = formatStandardsForPrompt(selected, detail)

  return {
    content,
    tokensUsed,
    standardCodes: selected.map(s => s.standardCode),
    totalMatched: ranked.length,
  }
}

function formatStandardsForPrompt(
  standards: StandardsRecommendation[],
  detail: "summary" | "full",
): string {
  const header = detail === "full"
    ? `=== DESIGN STANDARDS (MANDATORY COMPLIANCE) ===
Your CadQuery model MUST conform to these engineering standards. Specific dimensional
and material constraints from these standards override any conflicting assumptions.\n`
    : `=== APPLICABLE DESIGN STANDARDS ===
The following standards are relevant to this product. Reference them in your analysis.\n`

  const sections = standards.map((s, i) => {
    const heading = `${i + 1}. ${s.standardCode} — ${s.standardName} (${s.issuingBody})`

    if (detail === "summary") {
      return `${heading}\n   ${s.summary}`
    }

    // Full detail: requirements + design rules
    let section = `--- ${s.standardCode}: ${s.standardName} (${s.issuingBody}) ---\n\n`
    section += s.requirementsMarkdown + "\n"

    if (s.designRules.length > 0) {
      section += "\nDesign Rules:\n"
      for (const rule of s.designRules) {
        section += `- [${rule.criticality}] Section ${rule.section}: ${rule.rule}\n`
      }
    }

    return section
  })

  return header + "\n" + sections.join("\n\n")
}
