"use server"

/**
 * @file assembly-rfq.ts — Create marketplace RFQs from Assembly Builder designs.
 *
 * @description Bridges the Assembly Builder to the RFQ marketplace.
 * Builds a structured custom-manufacturing RFQ payload from the assembly's
 * slot/component bill of materials so users can dispatch a quote request
 * without copy/paste. No STEP files are required — the BOM and design intent
 * serve as the specification for manufacturers.
 *
 * @related
 * - Component: src/components/assembly/assembly-workbench.tsx (trigger button)
 * - Actions: src/actions/assembly-builder.ts (getAssembly, getAssemblyEnrichment)
 * - Actions: src/actions/rfq.ts (createNewRFQ)
 */

import { createNewRFQ } from "@/actions/rfq"
import { getAssembly, getAssemblyEnrichment } from "@/actions/assembly-builder"
import { createClient } from "@/lib/supabase/server"
import type { TemplateSlot, PlacedComponent } from "@/actions/assembly-builder"

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Estimates a cost range from component pricing tiers.
 * Returns null if no pricing data is available.
 */
function estimateTotalCost(
  placedComponents: PlacedComponent[],
  pricing: { component_name: string; pricing_tiers: unknown }[],
): number | null {
  let total = 0
  let found = 0

  for (const pc of placedComponents) {
    const row = pricing.find((p) => p.component_name === pc.componentName)
    if (!row) continue

    const tiers = row.pricing_tiers
    let unitPrice: number | null = null

    // pricing_tiers is typically [{ qty, unit_price }] — take the first tier as unit price
    if (Array.isArray(tiers) && tiers.length > 0) {
      const first = tiers[0] as Record<string, unknown>
      const price = first.unit_price ?? first.price ?? first.cost
      if (typeof price === "number") unitPrice = price
    } else if (typeof tiers === "number") {
      unitPrice = tiers
    }

    if (unitPrice !== null) {
      total += unitPrice * (pc.quantity ?? 1)
      found++
    }
  }

  return found > 0 ? Math.round(total * 100) / 100 : null
}

/**
 * Builds a human-readable BOM block for the RFQ description.
 */
function buildBomLines(
  slots: TemplateSlot[],
  placedComponents: PlacedComponent[],
): string[] {
  if (slots.length === 0 && placedComponents.length === 0) {
    return ["(no components defined)"]
  }

  const lines: string[] = []

  // Group placed components by slot
  const bySlot = new Map<string, PlacedComponent>()
  for (const pc of placedComponents) {
    bySlot.set(pc.slotId, pc)
  }

  if (slots.length > 0) {
    // Render slots in order, showing filled and unfilled
    for (const slot of slots) {
      const pc = bySlot.get(slot.id)
      if (pc) {
        const qty = pc.quantity > 1 ? ` × ${pc.quantity}` : ""
        lines.push(`- [${slot.label}] ${pc.componentName}${qty}`)
      } else {
        const required = slot.required ? " (required)" : ""
        lines.push(`- [${slot.label}] — not assigned${required}`)
      }
    }
  } else {
    // No slot definitions — list placed components directly
    for (const pc of placedComponents) {
      const qty = pc.quantity > 1 ? ` × ${pc.quantity}` : ""
      lines.push(`- ${pc.componentName}${qty}`)
    }
  }

  return lines
}

// ─── Main Action ──────────────────────────────────────────────────────

/**
 * Creates a marketplace RFQ from an Assembly Builder design.
 *
 * @description Fetches the assembly and its placed components, builds a
 * structured BOM description, and creates a custom-manufacturing RFQ in
 * the marketplace. The manufacturer receives the component list and design
 * context needed to quote on building the assembly.
 *
 * @param assemblyId - The `cad_assemblies.id` to create an RFQ from
 * @returns RFQ ID on success, or an error message
 *
 * @throws Nothing — errors are returned as `{ error: string }`
 *
 * @security Requires authenticated user (enforced by getAssembly via RLS)
 * @audit RFQ creation logged to public.rfqs via createNewRFQ
 */
export async function createAssemblyRfqAction(
  assemblyId: string,
): Promise<{ rfqId: string } | { error: string }> {
  if (!assemblyId?.trim()) {
    return { error: "Assembly ID is required." }
  }

  // ── Fetch assembly ──────────────────────────────────────────────────
  const assemblyResult = await getAssembly(assemblyId)
  if ("error" in assemblyResult) {
    console.error("[assembly-rfq] Failed to fetch assembly:", {
      assemblyId,
      error: assemblyResult.error,
    })
    return { error: assemblyResult.error }
  }

  const assembly = assemblyResult
  const { slots, placedComponents } = assembly

  // ── Readiness gate ──────────────────────────────────────────────────
  // Must have at least one placed component
  if (placedComponents.length === 0) {
    return { error: "Add at least one component before creating an RFQ." }
  }

  // All required slots must be filled
  const requiredSlots = slots.filter((s) => s.required)
  const filledRequiredSlotIds = new Set(placedComponents.map((pc) => pc.slotId))
  const unfilledRequired = requiredSlots.filter((s) => !filledRequiredSlotIds.has(s.id))

  if (unfilledRequired.length > 0) {
    const names = unfilledRequired.map((s) => s.label).join(", ")
    return {
      error: `Fill all required slots before creating an RFQ. Missing: ${names}`,
    }
  }

  // ── Fetch pricing enrichment ────────────────────────────────────────
  const componentNames = [...new Set(placedComponents.map((pc) => pc.componentName))]
  const enrichmentResult = await getAssemblyEnrichment(componentNames)
  const pricing = "error" in enrichmentResult ? [] : enrichmentResult.pricing

  // ── Build description ───────────────────────────────────────────────
  const estimatedCost = estimateTotalCost(placedComponents, pricing)
  const bomLines = buildBomLines(slots, placedComponents)

  const filledCount = placedComponents.length
  const totalSlotCount = slots.length
  const certCount = "error" in enrichmentResult ? 0 : enrichmentResult.certifications.length

  const descriptionLines = [
    `${assembly.name}`,
    "─────────────",
    ...(assembly.description?.trim()
      ? [assembly.description.trim(), ""]
      : []),
    "Bill of Materials:",
    ...bomLines,
    "",
    `Components: ${filledCount}${totalSlotCount > 0 ? ` / ${totalSlotCount} slots` : ""}`,
    ...(estimatedCost !== null
      ? [`Estimated cost: $${estimatedCost.toLocaleString()}`]
      : []),
    ...(certCount > 0
      ? [`Certifications on file: ${certCount} component(s) have certification data`]
      : []),
    "",
    "Manufacturer should quote for assembly fabrication based on the component",
    "list above. Contact buyer to discuss tolerances, materials, and quantities.",
  ]

  // ── Create RFQ ──────────────────────────────────────────────────────
  const rfqResult = await createNewRFQ({
    title: `${assembly.name} — Manufacturing RFQ`,
    rfq_type: "custom",
    category: "Custom Manufacturing",
    specifications: {
      description: descriptionLines.join("\n"),
      quantity: 1,
      unit: "assembly",
      custom_fields: {
        source: "the-forge-assembly-builder",
        assembly_id: assemblyId,
        assembly_name: assembly.name,
        component_count: filledCount,
        slot_count: totalSlotCount,
        estimated_cost: estimatedCost,
        certification_count: certCount,
        template_id: assembly.templateId ?? null,
      },
    },
  })

  if (rfqResult.error || !rfqResult.data?.id) {
    console.error("[assembly-rfq] createNewRFQ failed:", {
      assemblyId,
      error: rfqResult.error,
    })
    return { error: rfqResult.error || "Failed to create RFQ from assembly." }
  }

  const rfqId = rfqResult.data.id

  // Persist rfq_id on the assembly so "View RFQ" survives navigation
  const supabase = await createClient()
  const { error: updateError } = await supabase
    .from("cad_assemblies")
    .update({ rfq_id: rfqId, updated_at: new Date().toISOString() })
    .eq("id", assemblyId)

  if (updateError) {
    console.warn("[assembly-rfq] Failed to link RFQ to assembly:", {
      assemblyId,
      rfqId,
      error: updateError.message,
    })
    // RFQ was created; still return success
  }

  return { rfqId }
}
