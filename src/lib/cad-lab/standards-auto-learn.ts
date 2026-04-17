/**
 * @file standards-auto-learn.ts — Auto-generates and stores design standards for novel domains.
 *
 * INTENT: When a user asks for a product in a domain with no matching standards
 * (score < 30 for all results), this module generates 3-5 relevant standards
 * using Claude Opus and stores them in Supabase. The library grows with every
 * novel product type, benefiting all future users.
 *
 * FLOW:
 * 1. retrieveStandardsForPrompt() finds 0 matches
 * 2. generateAndStoreStandards() called in background
 * 3. Claude Opus generates structured standard references
 * 4. Standards saved to design_standards with source: "ai_auto_generated"
 * 5. Returned for immediate use in the current request
 */

import { createAdminClient } from "@/lib/supabase/admin"
import type { IndustryDomain } from "./industry-domains"
import type { DesignStandard, DesignRule } from "@/types/design-standards"

interface GeneratedStandard {
  standard_code: string
  standard_name: string
  issuing_body: string
  summary: string
  requirements_markdown: string
  design_rules: DesignRule[]
  material_specs: { allowed_materials?: string[]; prohibited_materials?: string[] }
  product_tags: string[]
  engineering_tags: string[]
  applicable_to: string[]
  region: string[]
  version: string
}

/**
 * Generates 3-5 relevant engineering standards for a product + domain,
 * stores them in Supabase, and returns them for immediate use.
 *
 * @param industryDomain - The detected industry domain
 * @param productDescription - Full product description
 * @param existingStandardCodes - Already-stored codes to avoid duplicates
 * @returns Newly created standards (or empty array if generation fails)
 */
export async function generateAndStoreStandards(
  industryDomain: IndustryDomain,
  productDescription: string,
  existingStandardCodes: string[],
): Promise<DesignStandard[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    console.warn("[standards-auto-learn] ANTHROPIC_API_KEY not configured, skipping")
    return []
  }

  const existingList = existingStandardCodes.length > 0
    ? `\n\nIMPORTANT: These standards are ALREADY in the database — do NOT include them:\n${existingStandardCodes.join(", ")}`
    : ""

  const systemPrompt = `You are an expert standards engineer with deep knowledge of international engineering standards across all industries.

Your task: Identify 3-5 REAL engineering standards that are relevant to the product described below. These must be genuine, published standards from recognized bodies (ISO, IEC, ANSI, ASTM, SAE, API, ABYC, FDA, BSI, DIN, EN, etc.).

For each standard, provide comprehensive engineering guidance that a CAD engineer would need to design a compliant product. Focus on requirements that affect physical design: dimensions, materials, safety factors, tolerances, test procedures.

Return ONLY valid JSON in this format:
{
  "standards": [
    {
      "standard_code": "ISO 12215-5",
      "standard_name": "Hull construction — scantlings for single-skin craft",
      "issuing_body": "ISO",
      "summary": "200-500 word summary of what the standard covers and why it matters",
      "requirements_markdown": "2000-5000 word detailed engineering guidance including specific dimensions, tolerances, material requirements, safety factors, formulas, and test procedures",
      "design_rules": [
        {"rule": "Minimum single-skin GRP panel thickness for vessels <8m LOA is 4mm", "section": "5.2.3", "criticality": "mandatory"}
      ],
      "material_specs": {"allowed_materials": ["GRP", "marine-grade aluminum 5083"], "prohibited_materials": ["mild steel without coating"]},
      "product_tags": ["boat", "hull", "vessel", "yacht"],
      "engineering_tags": ["structural", "scantlings", "laminate"],
      "applicable_to": ["recreational_vessel", "commercial_vessel"],
      "region": ["global"],
      "version": "2019"
    }
  ]
}`

  const userPrompt = `Industry domain: ${industryDomain}

Product description: ${productDescription}
${existingList}

Identify 3-5 real engineering standards relevant to this product. Focus on standards that affect physical dimensions, materials, safety, and manufacturing.`

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default
    const client = new Anthropic({ apiKey, timeout: 240_000, maxRetries: 0 })

    const response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 16384,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    })

    const text = response.content
      .filter(block => block.type === "text")
      .map(block => block.type === "text" ? block.text : "")
      .join("")

    // Parse JSON from response — find the outermost balanced braces,
    // tracking whether we're inside a JSON string to ignore braces in values
    // like {"rule": "use { brackets } for grouping"}
    const jsonStart = text.indexOf("{")
    if (jsonStart === -1) {
      console.error("[standards-auto-learn] No JSON found in response")
      return []
    }
    let depth = 0
    let jsonEnd = -1
    let inString = false
    for (let i = jsonStart; i < text.length; i++) {
      const ch = text[i]
      if (ch === '"' && text[i - 1] !== "\\") { inString = !inString; continue }
      if (inString) continue
      if (ch === "{") depth++
      else if (ch === "}") { depth--; if (depth === 0) { jsonEnd = i + 1; break } }
    }
    if (jsonEnd === -1) {
      console.error("[standards-auto-learn] Unbalanced braces in response")
      return []
    }

    let parsed: { standards: GeneratedStandard[] }
    try {
      parsed = JSON.parse(text.slice(jsonStart, jsonEnd))
    } catch {
      console.error("[standards-auto-learn] JSON parse failed")
      return []
    }
    if (!parsed.standards || !Array.isArray(parsed.standards)) {
      console.error("[standards-auto-learn] Invalid response structure")
      return []
    }

    // SECURITY: Sanitize AI-generated content to mitigate prompt injection.
    // Strip obvious instruction markers that could hijack downstream prompts.
    // DECISION: "override" alone is legitimate engineering text ("override the default tolerance").
    // Only flag it when followed by instruction-context words (above/previous/instructions/prompt).
    const INJECTION_PATTERNS = /(?:ignore|disregard|forget)\s+(?:above|previous|prior|all|the above|instructions|prompt)\b|(?:override)\s+(?:above|previous|prior|instructions|prompt)\b|(?:you are now|act as|pretend to be|your new role|system prompt|<\/?system>)/gi
    for (const s of parsed.standards) {
      // GOTCHA: Global regex is stateful — reset lastIndex before each test/replace pair
      INJECTION_PATTERNS.lastIndex = 0
      if (s.requirements_markdown && INJECTION_PATTERNS.test(s.requirements_markdown)) {
        console.warn(`[standards-auto-learn] Stripped potential prompt injection from ${s.standard_code}`)
        INJECTION_PATTERNS.lastIndex = 0
        s.requirements_markdown = s.requirements_markdown.replace(INJECTION_PATTERNS, "[REDACTED]")
      }
      INJECTION_PATTERNS.lastIndex = 0
      if (s.summary && INJECTION_PATTERNS.test(s.summary)) {
        INJECTION_PATTERNS.lastIndex = 0
        s.summary = s.summary.replace(INJECTION_PATTERNS, "[REDACTED]")
      }
    }

    // Dedup against existing
    const newStandards = parsed.standards.filter(
      s => !existingStandardCodes.includes(s.standard_code)
    )

    if (newStandards.length === 0) return []

    // Store in Supabase
    // SECURITY: admin client — design_standards is global reference data, foundry_id not needed
    const supabase = createAdminClient()
    const toInsert = newStandards.map(s => ({
      standard_code: s.standard_code,
      standard_name: s.standard_name,
      issuing_body: s.issuing_body,
      industry_domain: industryDomain,
      product_tags: s.product_tags || [],
      engineering_tags: s.engineering_tags || [],
      summary: s.summary,
      requirements_markdown: s.requirements_markdown,
      design_rules: s.design_rules || [],
      material_specs: s.material_specs || {},
      dimensional_constraints: {},
      applicable_to: s.applicable_to || [],
      region: s.region || ["global"],
      version: s.version || null,
      token_estimate: Math.ceil((s.summary.length + s.requirements_markdown.length) / 4),
      source: "ai_auto_generated",
      source_notes: `Auto-generated for product: ${productDescription.slice(0, 100)}`,
      verified: false,
    }))

    // DECISION: ignoreDuplicates: false so concurrent auto-learn calls merge cleanly
    // (second caller overwrites with same data, no race condition)
    const { data, error } = await supabase
      .from("design_standards")
      .upsert(toInsert, { onConflict: "standard_code", ignoreDuplicates: false })
      .select()

    if (error) {
      console.error("[standards-auto-learn] Supabase insert error:", error.message)
      return []
    }

    console.info(`[standards-auto-learn] Created ${data?.length ?? 0} new standards for domain: ${industryDomain}`)
    return (data ?? []) as unknown as DesignStandard[]
  } catch (err) {
    console.error("[standards-auto-learn] Generation failed:", err instanceof Error ? err.message : String(err))
    return []
  }
}
