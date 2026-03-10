/**
 * @file supply-flow.ts — Server action for the Supply Flow fan diagram.
 *
 * @description Builds the three-tier graph (components → manufacturers → assemblers)
 * by reusing `matchCadLabModuleSuppliers()` per module and querying
 * `marketplace_listings` for assembly/fulfillment capabilities.
 */

"use server"

import { createClient } from "@/lib/supabase/server"
import { matchCadLabModuleSuppliers } from "@/actions/cad-lab-supplier-match"
import type { CadLabModuleInput } from "@/actions/cad-lab-supplier-match"
import { getToleranceMm } from "@/lib/cad-lab/diagnostic-to-technique"
import type {
  SupplyFlowNode,
  SupplyFlowEdge,
  SupplyFlowData,
} from "@/app/(platform)/the-forge/cad-lab/components/supply-flow-types"

// ─── Types ──────────────────────────────────────────────────────────

interface ModuleInput {
  id: string
  name: string
  purpose: string
  keyParts: string[]
  description?: string
}

type DiagnosticAnswers = Record<string, Record<string, string>>

// ─── Assembly keywords used to identify assembler-tier companies ────

const ASSEMBLY_KEYWORDS = [
  "assembly",
  "contract manufacturing",
  "fulfillment",
  "drop-ship",
  "dropship",
  "kitting",
  "box build",
  "system integration",
  "final assembly",
  "pcba",
  "turnkey",
]

// ─── Fallback assembler list (from seeded manufacturer data) ────────

const FALLBACK_ASSEMBLERS: SupplyFlowNode[] = [
  {
    id: "asm-cornelius",
    label: "Cornelius Electronics",
    sublabel: "PCB Assembly & Box Build",
    tier: "assembler",
    meta: { type: "Contract Manufacturer", source: "seed" },
  },
  {
    id: "asm-nemco",
    label: "Nemco",
    sublabel: "Electromechanical Assembly",
    tier: "assembler",
    meta: { type: "Contract Manufacturer", source: "seed" },
  },
  {
    id: "asm-fermionx",
    label: "FermionX",
    sublabel: "Electronics Manufacturing",
    tier: "assembler",
    meta: { type: "EMS Provider", source: "seed" },
  },
]

// ─── Action ─────────────────────────────────────────────────────────

/**
 * Builds the supply-flow graph for a set of CAD Lab modules.
 *
 * @param modules  - The modules to fan out from (left column)
 * @param diagnosticAnswers - Per-module diagnostic answers for process/material
 * @returns SupplyFlowData with nodes, edges, and project name
 */
export async function getSupplyFlowData(
  modules: ModuleInput[],
  diagnosticAnswers: DiagnosticAnswers,
): Promise<SupplyFlowData> {
  // SECURITY: Require authentication
  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return { nodes: [], edges: [], projectName: '' }
  if (modules.length > 50) return { nodes: [], edges: [], projectName: '' }

  // ── Build component nodes (left column) ──
  const componentNodes: SupplyFlowNode[] = modules.map((m) => ({
    id: `comp-${m.id}`,
    label: m.name,
    sublabel: m.purpose.length > 60 ? m.purpose.slice(0, 57) + "…" : m.purpose,
    tier: "component",
    meta: { partsCount: m.keyParts.length },
  }))

  // ── Fan out: match manufacturers per module (top 3 each) ──
  const allEdges: SupplyFlowEdge[] = []
  const mfgMap = new Map<string, SupplyFlowNode>()

  await Promise.allSettled(
    modules.map(async (mod) => {
      const diag = diagnosticAnswers[mod.id] ?? {}
      const input: CadLabModuleInput = {
        id: mod.id,
        name: mod.name,
        purpose: mod.purpose,
        keyParts: mod.keyParts,
        description: mod.description,
        process: diag.mfg_process || null,
        material: diag.material || null,
        toleranceMm: getToleranceMm(diag.tolerance),
        batchSize: diag.batch_size || null,
      }

      const matches = await matchCadLabModuleSuppliers(input)
      const top3 = matches.slice(0, 3)

      for (const match of top3) {
        const mfgId = `mfg-${match.id}`

        // Deduplicate: keep highest score, accumulate edges
        const existing = mfgMap.get(mfgId)
        if (!existing || (match.matchScore > (existing.meta?.score as number ?? 0))) {
          mfgMap.set(mfgId, {
            id: mfgId,
            label: match.name,
            sublabel: match.supplierType,
            tier: "manufacturer",
            meta: {
              score: match.matchScore,
              verified: match.isVerified,
              reasons: match.matchReasons.join(", "),
            },
          })
        }

        allEdges.push({
          fromId: `comp-${mod.id}`,
          toId: mfgId,
          label: match.matchReasons[0] ?? "",
          score: match.matchScore,
        })
      }
    }),
  )

  const manufacturerNodes = [...mfgMap.values()]

  // ── Converge: find assembler-tier companies ──
  let assemblerNodes: SupplyFlowNode[] = []

  try {
    const supabase = await createClient()

    // Query marketplace for assembly/fulfillment listings
    const { data: listings } = await supabase
      .from("marketplace_listings")
      .select("id, title, description, attributes, subcategory, is_verified")
      .in("category", ["Products", "Services"])
      .limit(100)

    if (listings && listings.length > 0) {
      const assemblers: SupplyFlowNode[] = []

      for (const listing of listings) {
        const text = `${listing.title} ${listing.description ?? ""} ${listing.subcategory ?? ""}`.toLowerCase()
        const attrsStr = listing.attributes ? JSON.stringify(listing.attributes).toLowerCase() : ""
        const combined = `${text} ${attrsStr}`

        const isAssembler = ASSEMBLY_KEYWORDS.some((kw) => combined.includes(kw))
        if (isAssembler) {
          assemblers.push({
            id: `asm-${listing.id}`,
            label: listing.title,
            sublabel: listing.subcategory ?? "Assembly",
            tier: "assembler",
            meta: {
              verified: listing.is_verified ?? false,
              source: "marketplace",
            },
          })
        }
      }

      assemblerNodes = assemblers.slice(0, 5)
    }
  } catch (err) {
    console.error("[SUPPLY-FLOW] Failed to query assemblers:", err)
  }

  // Fallback if no assemblers found
  if (assemblerNodes.length === 0) {
    assemblerNodes = FALLBACK_ASSEMBLERS
  }

  // ── Build manufacturer → assembler edges (all converge) ──
  for (const mfg of manufacturerNodes) {
    for (const asm of assemblerNodes) {
      allEdges.push({
        fromId: mfg.id,
        toId: asm.id,
      })
    }
  }

  return {
    nodes: [...componentNodes, ...manufacturerNodes, ...assemblerNodes],
    edges: allEdges,
    projectName: modules[0]?.name ?? "Project",
  }
}
