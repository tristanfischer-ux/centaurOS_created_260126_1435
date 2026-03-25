/**
 * @file design-standards.ts — Tool handler for design standards lookup.
 *
 * INTENT: Gives engineering specialists (Jian, Fang) access to the design
 * standards database during reviews. They can look up ISO/ASME/ASTM/BS EN
 * standards by code, domain, or free-text search.
 *
 * @related
 * - Server actions: src/actions/design-standards.ts
 * - Tool definition: src/lib/agents/tools/definitions.ts (TOOL_LOOKUP_STANDARD)
 * - Type: src/types/design-standards.ts
 */

import type { ToolHandler } from "./common"
import {
    getStandardByCode,
    getStandardsByDomain,
    searchStandards,
} from "@/actions/design-standards"
import type { IndustryDomain } from "@/lib/cad-lab/industry-domains"

/**
 * Handles lookup_design_standard tool calls.
 *
 * Routing logic:
 * - standard_code provided → exact code lookup (single result, full detail)
 * - domain provided → domain filter (table summary)
 * - query provided → free-text search (table summary)
 * - nothing provided → returns usage hint
 */
export const handleLookupDesignStandard: ToolHandler = async (args, _ctx) => {
    const standardCode = args.standard_code as string | undefined
    const domain = args.domain as string | undefined
    const query = args.query as string | undefined
    // VALIDATION: Clamp limit to prevent abuse (negative, zero, or absurdly large values)
    const rawLimit = Number(args.limit) || 5
    const limit = Math.max(1, Math.min(rawLimit, 50))

    // Route 1: Exact code lookup
    if (standardCode) {
        const { data, error } = await getStandardByCode(standardCode)
        if (error) return `**Design Standards — Error**\n\n${error}`
        if (!data) return `No standard found with code "${standardCode}". Try a free-text search with the \`query\` parameter.`

        return formatFullStandard(data)
    }

    // Route 2: Domain filter
    if (domain) {
        const { data, error } = await getStandardsByDomain(domain as IndustryDomain)
        if (error) return `**Design Standards — Error**\n\n${error}`
        if (!data || data.length === 0) return `No standards found for domain "${domain}".`

        const limited = data.slice(0, limit)
        return formatStandardsTable(limited, `Standards for domain: ${domain}`, data.length, limit)
    }

    // Route 3: Free-text search
    if (query) {
        const { data, error } = await searchStandards(query, limit)
        if (error) return `**Design Standards — Error**\n\n${error}`
        if (!data || data.length === 0) return `No standards found matching "${query}".`

        return formatStandardsTable(data, `Search results: "${query}"`, data.length, limit)
    }

    return "Please provide at least one of: `standard_code`, `domain`, or `query` to search the design standards database."
}

// ─── Formatting Helpers ──────────────────────────────────────────────

interface StandardLike {
    standard_code: string
    standard_name: string
    issuing_body: string
    summary: string
    design_rules?: unknown
    material_specs?: unknown
    dimensional_constraints?: unknown
    applicable_to?: string[]
    region?: string[]
}

function formatFullStandard(s: StandardLike): string {
    let md = `## ${s.standard_code} — ${s.standard_name}\n\n`
    md += `**Issuing Body:** ${s.issuing_body}\n\n`
    md += `**Summary:** ${s.summary}\n\n`

    if (s.applicable_to && s.applicable_to.length > 0) {
        md += `**Applies to:** ${s.applicable_to.join(", ")}\n\n`
    }

    if (s.region && s.region.length > 0) {
        md += `**Region:** ${s.region.join(", ")}\n\n`
    }

    // Design rules
    const rules = s.design_rules as Array<{ rule: string; category?: string }> | null
    if (rules && Array.isArray(rules) && rules.length > 0) {
        md += `### Design Rules\n\n`
        for (const rule of rules) {
            const prefix = rule.category ? `**[${rule.category}]** ` : ""
            md += `- ${prefix}${rule.rule}\n`
        }
        md += "\n"
    }

    // Material specs
    const matSpecs = s.material_specs as Record<string, unknown> | null
    if (matSpecs && typeof matSpecs === "object" && Object.keys(matSpecs).length > 0) {
        md += `### Material Specifications\n\n`
        for (const [key, value] of Object.entries(matSpecs)) {
            const label = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
            md += `- **${label}:** ${Array.isArray(value) ? value.join(", ") : String(value)}\n`
        }
        md += "\n"
    }

    // Dimensional constraints
    const dims = s.dimensional_constraints as Record<string, unknown> | null
    if (dims && typeof dims === "object" && Object.keys(dims).length > 0) {
        md += `### Dimensional Constraints\n\n`
        for (const [key, value] of Object.entries(dims)) {
            const label = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
            md += `- **${label}:** ${typeof value === "object" ? JSON.stringify(value) : String(value)}\n`
        }
        md += "\n"
    }

    return md
}

function formatStandardsTable(
    standards: StandardLike[],
    heading: string,
    totalCount: number,
    limit: number,
): string {
    let md = `## ${heading}\n\n`
    md += `| Code | Name | Body | Summary |\n|------|------|------|---------|\n`

    for (const s of standards) {
        const summary = s.summary.length > 80 ? s.summary.slice(0, 77) + "..." : s.summary
        // SECURITY: Escape pipe characters to prevent markdown table injection
        const esc = (v: string) => v.replace(/\|/g, "\\|")
        md += `| ${esc(s.standard_code)} | ${esc(s.standard_name)} | ${esc(s.issuing_body)} | ${esc(summary)} |\n`
    }

    if (totalCount > limit) {
        md += `\n*Showing ${standards.length} of ${totalCount} results. Use \`standard_code\` for full details on a specific standard.*`
    }

    return md
}
