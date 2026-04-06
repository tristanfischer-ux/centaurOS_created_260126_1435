"use server"

/**
 * @file marketplace-process-discovery.ts
 *
 * @description Server action for process-based supplier discovery.
 * Groups marketplace suppliers by manufacturing process category,
 * derived from subcategory text (100% coverage) rather than
 * process_capabilities JSONB (only 10% populated).
 *
 * @security Uses admin client (service role) for cross-foundry aggregate counts.
 * Cached with 5-minute TTL via unstable_cache.
 */

import { unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"

// ─── Process Group Definitions ──────────────────────────────────────────────
// Maps subcategory strings (case-insensitive partial match) to process groups.
// Order matters: first match wins. More specific patterns go first.

export interface ProcessGroup {
    id: string
    name: string
    icon: string
    count: number
    subcategories: string[]
}

const PROCESS_GROUP_DEFINITIONS: {
    id: string
    name: string
    icon: string
    patterns: string[]
}[] = [
    {
        id: "sheet-metal",
        name: "Sheet Metal & Fabrication",
        icon: "Layers",
        patterns: [
            "sheet metal", "metal fabrication", "welding", "steel fabrication",
            "structural steel", "laser cutting", "metal stamping", "press work",
        ],
    },
    {
        id: "cnc-machining",
        name: "CNC Machining",
        icon: "Cog",
        patterns: [
            "cnc", "precision machining", "machined parts", "turning",
            "milling", "grinding machine",
        ],
    },
    {
        id: "casting",
        name: "Casting & Forging",
        icon: "Flame",
        patterns: [
            "casting", "investment casting", "die casting", "sand casting",
            "forging", "foundry",
        ],
    },
    {
        id: "moulding",
        name: "Injection Moulding & Plastics",
        icon: "Box",
        patterns: [
            "injection mould", "injection mold", "plastic injection",
            "moulding", "molding", "rotational mould", "blow mould",
            "thermoform", "extrusion",
        ],
    },
    {
        id: "additive",
        name: "3D Printing & Prototyping",
        icon: "Printer",
        patterns: [
            "3d print", "additive manufacturing", "rapid prototyping",
            "sls", "sla", "fdm", "dmls",
        ],
    },
    {
        id: "electronics",
        name: "Electronics & PCB",
        icon: "Cpu",
        patterns: [
            "electronics manufacturing", "ems", "pcb", "circuit board",
            "electronic assembly", "contract electronics",
        ],
    },
    {
        id: "surface-treatment",
        name: "Surface Treatment & Finishing",
        icon: "Paintbrush",
        patterns: [
            "surface treatment", "finishing", "powder coat", "anodis",
            "plating", "galvanis", "heat treatment", "coating",
        ],
    },
    {
        id: "composites",
        name: "Composites & Advanced Materials",
        icon: "Layers",
        patterns: [
            "composite", "carbon fibre", "carbon fiber", "fiberglass",
            "fibreglass", "resin",
        ],
    },
    {
        id: "assembly",
        name: "Assembly & Contract Manufacturing",
        icon: "Wrench",
        patterns: [
            "contract manufacturing", "assembly", "integration",
            "sub-assembly", "outsourc",
        ],
    },
    {
        id: "testing",
        name: "Testing & Quality",
        icon: "Shield",
        patterns: [
            "testing", "inspection", "quality", "calibration",
            "metrology", "ndt", "non-destructive",
        ],
    },
]

/**
 * Assigns a subcategory to a process group based on word-boundary matching.
 * Returns null if no group matches (listing will be in "Other").
 * Uses regex \b to avoid false positives like "Systems" matching "ems".
 */
function matchSubcategoryToGroup(subcategory: string): string | null {
    const lower = subcategory.toLowerCase()
    for (const group of PROCESS_GROUP_DEFINITIONS) {
        if (group.patterns.some(p => {
            // Multi-word patterns: use includes (already specific enough)
            if (p.includes(' ')) return lower.includes(p)
            // Single-word patterns: use word boundary to avoid substring false positives
            const regex = new RegExp(`\\b${p}\\b`, 'i')
            return regex.test(lower)
        })) {
            return group.id
        }
    }
    return null
}

// ─── Cached Fetch ───────────────────────────────────────────────────────────

async function fetchProcessCategoryCounts(): Promise<ProcessGroup[]> {
    const supabase = createAdminClient()

    // DECISION: Use parallel paginated fetches instead of sequential loop.
    // First get the total count, then fetch all pages in parallel.
    const { count: totalCount } = await supabase
        .from("marketplace_listings")
        .select("id", { count: "exact", head: true })
        .in("category", ["Products", "Services"])
        .eq("is_demo", false)
        .not("subcategory", "is", null)

    const subcategoryCounts: Record<string, number> = {}
    const total = totalCount ?? 0
    const pageSize = 1000
    const pageCount = Math.ceil(total / pageSize)

    // Fetch all pages in parallel (max ~14 concurrent, cached so only first hit is slow)
    const pagePromises = Array.from({ length: pageCount }, (_, i) =>
        supabase
            .from("marketplace_listings")
            .select("subcategory")
            .in("category", ["Products", "Services"])
            .eq("is_demo", false)
            .not("subcategory", "is", null)
            .range(i * pageSize, (i + 1) * pageSize - 1)
    )
    const pageResults = await Promise.all(pagePromises)

    for (const { data, error } of pageResults) {
        if (error) {
            console.error("[getProcessCategoryCounts] Page fetch failed:", error.message)
            continue
        }
        for (const row of (data ?? [])) {
            if (row.subcategory) {
                subcategoryCounts[row.subcategory] = (subcategoryCounts[row.subcategory] || 0) + 1
            }
        }
    }

    // Assign each subcategory to a process group
    const groupCounts: Record<string, { count: number; subcategories: Set<string> }> = {}
    for (const def of PROCESS_GROUP_DEFINITIONS) {
        groupCounts[def.id] = { count: 0, subcategories: new Set() }
    }

    let otherCount = 0
    const otherSubcategories = new Set<string>()

    for (const [subcategory, count] of Object.entries(subcategoryCounts)) {
        const groupId = matchSubcategoryToGroup(subcategory)
        if (groupId && groupCounts[groupId]) {
            groupCounts[groupId].count += count
            groupCounts[groupId].subcategories.add(subcategory)
        } else {
            otherCount += count
            otherSubcategories.add(subcategory)
        }
    }

    // Build result array, sorted by count descending
    const results: ProcessGroup[] = PROCESS_GROUP_DEFINITIONS
        .map(def => ({
            id: def.id,
            name: def.name,
            icon: def.icon,
            count: groupCounts[def.id]?.count ?? 0,
            subcategories: Array.from(groupCounts[def.id]?.subcategories ?? []),
        }))
        .filter(g => g.count > 0)
        .sort((a, b) => b.count - a.count)

    // Add "Other" group for uncategorised listings
    if (otherCount > 0) {
        results.push({
            id: "other",
            name: "Other Suppliers",
            icon: "MoreHorizontal",
            count: otherCount,
            subcategories: Array.from(otherSubcategories).slice(0, 20),
        })
    }

    return results
}

/**
 * Get supplier counts grouped by manufacturing process category.
 * Cached for 5 minutes. Uses admin client for cross-foundry aggregation.
 */
export const getProcessCategoryCounts = unstable_cache(
    fetchProcessCategoryCounts,
    ["marketplace-process-counts"],
    { revalidate: 300 }
)
