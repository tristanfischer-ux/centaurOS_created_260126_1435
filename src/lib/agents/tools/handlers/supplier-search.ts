/**
 * @file supplier-search.ts — Supplier search tool for the VP Supply Chain specialist.
 *
 * @description Wraps searchMarketplaceListings() to let Chase search the ForgeOS
 * marketplace for suppliers by process, material, location, and certification.
 * Returns a formatted markdown table of matching suppliers with key details.
 *
 * @security Queries go through the existing marketplace search which is read-only.
 * No foundry_id filter needed — marketplace listings are public by design.
 *
 * @related
 * - Search engine: src/actions/marketplace.ts (searchMarketplaceListings)
 * - Tool definition: src/lib/agents/tools/definitions.ts (TOOL_SEARCH_SUPPLIERS)
 * - Tool registry: src/lib/agents/tools/registry.ts
 */

import { searchMarketplaceListings } from "@/actions/marketplace"
import type { ToolHandler } from "./common"

export const handleSearchSuppliers: ToolHandler = async (args) => {
    const process = args.process as string | undefined
    const material = args.material as string | undefined
    const location = args.location as string | undefined
    const certification = args.certification as string | undefined
    const verifiedOnly = args.verified_only as boolean | undefined
    const limit = Math.min(Math.max((args.limit as number) ?? 10, 1), 20)

    // Build query from structured inputs
    const queryParts: string[] = []
    if (process) queryParts.push(process)
    if (material) queryParts.push(material)
    const query = queryParts.join(" ") || undefined

    // Map process to subcategory for filtered search
    const subcategories: string[] = []
    if (process) {
        const processLower = process.toLowerCase()
        if (processLower.includes("cnc") || processLower.includes("machin")) subcategories.push("CNC Machining")
        if (processLower.includes("sheet metal") || processLower.includes("bending") || processLower.includes("laser cut")) subcategories.push("Sheet Metal")
        if (processLower.includes("injection") || processLower.includes("mould") || processLower.includes("mold")) subcategories.push("Injection Moulding")
        if (processLower.includes("3d print") || processLower.includes("additive") || processLower.includes("fdm") || processLower.includes("sls") || processLower.includes("sla")) subcategories.push("3D Printing")
        if (processLower.includes("cast")) subcategories.push("Casting")
        if (processLower.includes("stamp")) subcategories.push("Stamping")
        if (processLower.includes("weld") || processLower.includes("fabricat")) subcategories.push("Fabrication")
        if (processLower.includes("pcb") || processLower.includes("circuit")) subcategories.push("PCB Manufacturing")
        if (processLower.includes("finish") || processLower.includes("anodi") || processLower.includes("powder coat") || processLower.includes("plat")) subcategories.push("Surface Finishing")
    }

    try {
        const result = await searchMarketplaceListings({
            query,
            categories: ["Products", "Services"],
            subcategories: subcategories.length > 0 ? subcategories : undefined,
            pageSize: limit,
            sort: "relevance",
            advancedFilters: {
                verifiedOnly: verifiedOnly ?? false,
                location: location || undefined,
                certifications: certification ? [certification] : undefined,
            },
        })

        if (!result.data || result.data.length === 0) {
            const filters: string[] = []
            if (process) filters.push(`process: ${process}`)
            if (material) filters.push(`material: ${material}`)
            if (location) filters.push(`location: ${location}`)
            if (certification) filters.push(`certification: ${certification}`)
            return `## Supplier Search\n\nNo suppliers found matching: ${filters.join(", ") || "no filters"}.\n\nTotal marketplace: ${result.totalCount} listings across all categories.`
        }

        const lines: string[] = [
            `## Supplier Search Results (${result.data.length} of ${result.totalCount} total)`,
            "",
        ]

        for (const listing of result.data) {
            const attrs = (listing.attributes ?? {}) as Record<string, unknown>
            const verified = listing.is_verified ? "Verified" : listing.verification_tier || "Unverified"
            const rating = listing.average_rating ? `${listing.average_rating.toFixed(1)}/5 (${listing.review_count} reviews)` : "No reviews"
            const loc = (attrs.location as string) || (attrs.city as string) || "—"
            const certs = Array.isArray(listing.certifications) ? listing.certifications.join(", ") : "—"
            const mats = Array.isArray(listing.materials) ? listing.materials.slice(0, 5).join(", ") : "—"
            const equip = Array.isArray(listing.key_equipment) ? listing.key_equipment.slice(0, 3).join(", ") : "—"
            const leadTime = (attrs.lead_time as string) || "Not specified"
            const minOrder = (attrs.minimum_order as string) || "Not specified"

            lines.push(`### ${listing.title}`)
            lines.push(`- **Status:** ${verified} | **Rating:** ${rating}`)
            lines.push(`- **Location:** ${loc}`)
            lines.push(`- **Materials:** ${mats}`)
            lines.push(`- **Equipment:** ${equip}`)
            lines.push(`- **Certifications:** ${certs}`)
            lines.push(`- **Lead time:** ${leadTime} | **Min order:** ${minOrder}`)
            if (listing.description) {
                const desc = listing.description.length > 200 ? listing.description.slice(0, 200) + "..." : listing.description
                lines.push(`- **About:** ${desc}`)
            }
            lines.push("")
        }

        if (result.hasMore) {
            lines.push(`*Showing ${result.data.length} of ${result.totalCount} results. Refine your search for more specific matches.*`)
        }

        return lines.join("\n")
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return `## Supplier Search\n\nSearch failed: ${msg}`
    }
}
