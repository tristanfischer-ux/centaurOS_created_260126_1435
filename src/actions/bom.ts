"use server"

/**
 * @file bom.ts — Server actions for structured BOM generation and management.
 *
 * @description Expands unstructured keyParts[] from CAD Lab modules into
 * structured parts with specs, costs, and a hierarchical BOM. Uses Claude
 * to intelligently decompose parts and deduplicate shared components.
 *
 * @security All actions use withAuth for foundry-scoped access control.
 * RLS on parts/bom_lines provides defense-in-depth via cad_lab_projects
 * foundry_id subquery.
 */

import { withAuth } from "@/lib/server-action-utils"
import { sanitizeErrorMessage } from "@/lib/security/sanitize"
import type {
  StructuredPart,
  BomLine,
  BomTreeNode,
  BomGenerationResult,
  CadLabModule,
  CadLabDesignBrief,
  ManufacturingProcessType,
} from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"
import { fetchCatalogueForPrompt, extractSearchKeywords } from "./component-library"
import { detectDomainFromKeyParts } from "@/lib/cad-lab/domain-prompts"

// ─── Constants ──────────────────────────────────────────────────────

const BOM_MODEL = "claude-opus-4-6"
const BOM_MAX_TOKENS = 8192
/** Max depth for BOM tree recursion to prevent infinite loops from cyclic data */
const MAX_BOM_DEPTH = 20
/** Max length for user-provided strings interpolated into prompts */
const MAX_PROMPT_FIELD_LENGTH = 500

const VALID_PROCESSES = new Set<string>([
  "cnc", "injection_molding", "sheet_metal",
  "3d_print_fdm", "3d_print_sla", "3d_print_sls",
  "casting", "forging", "machining",
  "purchased_cots", "other",
])

// ─── Helpers ────────────────────────────────────────────────────────

/** Truncate a string to prevent prompt bloat from user input */
function truncate(s: string | undefined | null, maxLen: number): string {
  if (!s) return ""
  return s.length > maxLen ? s.slice(0, maxLen) + "…" : s
}

/**
 * Extract JSON from an AI response that may contain markdown fences or prose.
 * Finds the first { and last } to extract the JSON object.
 */
function extractJson(text: string): string {
  const trimmed = text.trim()
  // Try stripping markdown fences first
  if (trimmed.startsWith("```")) {
    const stripped = trimmed.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "")
    if (stripped.startsWith("{")) return stripped
  }
  // Find the first { and last }
  const firstBrace = trimmed.indexOf("{")
  const lastBrace = trimmed.lastIndexOf("}")
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1)
  }
  return trimmed
}

/** Validate a process value against the enum */
function validateProcess(p: unknown): ManufacturingProcessType | null {
  if (typeof p === "string" && VALID_PROCESSES.has(p)) return p as ManufacturingProcessType
  return null
}

/** Clamp a numeric value to a non-negative number, or null */
function clampPositive(n: unknown): number | null {
  if (typeof n !== "number" || isNaN(n)) return null
  return Math.max(0, n)
}

// ─── AI BOM Generation ──────────────────────────────────────────────

/**
 * Generate a structured BOM from CAD Lab modules using Claude.
 *
 * @description Sends all module keyParts, diagnostic answers, and design brief
 * to Claude which returns structured parts with specs and a hierarchical BOM.
 * Results are saved to the parts and bom_lines tables.
 *
 * SECURITY: AI response is parsed and validated BEFORE any existing data is
 * deleted, preventing data loss from malformed responses. Delete errors are
 * checked explicitly. If the insert fails after delete, old data is already
 * gone (accepted trade-off vs. transaction complexity).
 *
 * @param projectId - The cad_lab_project ID
 * @param modules - Array of CAD Lab modules with keyParts
 * @param designBrief - Optional design brief for material/process context
 * @param diagnosticAnswers - Optional diagnostic answers for spec refinement
 * @returns BomGenerationResult with parts and BOM lines
 */
export async function generateBomFromModules(
  projectId: string,
  modules: CadLabModule[],
  designBrief?: CadLabDesignBrief,
  diagnosticAnswers?: DiagnosticAnswers,
): Promise<BomGenerationResult | { error: string }> {
  return withAuth(async ({ supabase }) => {
    const start = Date.now()

    if (!modules.length) {
      return { success: false, error: "No modules to generate BOM from" }
    }

    // INTENT: Verify the project exists and belongs to this foundry (RLS handles this)
    const { data: project, error: projErr } = await supabase
      .from("cad_lab_projects")
      .select("id, subject")
      .eq("id", projectId)
      .single()

    if (projErr || !project) {
      return { success: false, error: "Project not found" }
    }

    // ── Build AI prompt (with truncated user inputs) ──

    const moduleDescriptions = modules.map((m) => {
      const diagInfo = diagnosticAnswers?.[m.id]
        ? `\nDiagnostic answers: ${JSON.stringify(diagnosticAnswers[m.id])}`
        : ""
      const massInfo = m.result?.massGrams
        ? `\nEstimated mass: ${m.result.massGrams}g`
        : ""
      const bboxInfo = m.result?.bbox
        ? `\nBounding box: ${m.result.bbox.xLen}×${m.result.bbox.yLen}×${m.result.bbox.zLen}mm`
        : ""

      // SECURITY: Truncate user-controlled strings to limit prompt injection surface
      return `## Module: ${truncate(m.name, 100)} (id: ${truncate(m.id, 50)})
Purpose: ${truncate(m.purpose, MAX_PROMPT_FIELD_LENGTH)}
Key Parts: ${m.keyParts.map((p) => truncate(p, 100)).join(", ")}
Description: ${truncate(m.description, MAX_PROMPT_FIELD_LENGTH)}${massInfo}${bboxInfo}${diagInfo}`
    }).join("\n\n")

    const briefContext = designBrief
      ? `\n\nDesign Brief:
- Use case: ${truncate(designBrief.useCase, 200) || "not specified"}
- Target process: ${truncate(designBrief.targetProcess, 100) || "not specified"}
- Target material: ${truncate(designBrief.targetMaterial, 100) || "not specified"}
- Tolerance: ${truncate(designBrief.toleranceTarget, 100) || "not specified"}
- Quantity: ${truncate(designBrief.quantityTarget, 100) || "not specified"}
- Compliance: ${truncate(designBrief.complianceNotes, 200) || "none"}`
      : ""

    // INTENT: Fetch real component catalogue to ground purchased parts in real products
    const allKeyParts = modules.flatMap((m) => m.keyParts)
    const domain = detectDomainFromKeyParts(allKeyParts)
    const keywords = await extractSearchKeywords(modules)
    const catalogueRef = await fetchCatalogueForPrompt(domain, keywords)

    const systemPrompt = `You are a manufacturing engineer creating a structured Bill of Materials (BOM) from product module decomposition data.
${catalogueRef ? `
REAL COMPONENT CATALOGUE — USE FOR PURCHASED PARTS:
${catalogueRef}

CATALOGUE RULES:
- For purchased/COTS parts, check catalogue FIRST
- If match exists: use exact manufacturer, MPN, and catalogue price for estimatedUnitCostGbp
- If no match: describe generically with specific specs
- Never invent part numbers — use real MPNs or descriptive codes
` : ""}
Your task:
1. Expand each module's keyParts into structured parts with manufacturing specifications
2. Create one assembly-level part per module (acts as parent in the BOM hierarchy)
3. Deduplicate shared parts across modules (common fasteners, bearings, connectors)
4. Mark purchased/COTS parts (standard bolts, bearings, electronics, etc.)
5. Assign part numbers using the pattern: {MODULE_PREFIX}-{SEQ} (e.g., FRAME-001, FRAME-002)
   - Assembly parts use -ASY suffix (e.g., FRAME-ASY)
   - Purchased parts use -PUR suffix (e.g., FAST-PUR-001)

For each part, estimate:
- Manufacturing process (cnc, injection_molding, sheet_metal, 3d_print_fdm, 3d_print_sla, 3d_print_sls, casting, forging, machining, purchased_cots, other)
- Material and material spec
- Surface finish
- Tolerance (default ±0.5mm for 3D printed, ±0.1mm for CNC, ±0.05mm for precision)
- Mass in kg (estimate from volume and material density; must be >= 0)
- Bounding envelope in mm (must be >= 0)
- Unit cost in GBP (rough estimate based on process and size; must be >= 0)

IMPORTANT: Do NOT create circular BOM references (e.g., part A containing part B which contains part A). Each assembly part should only appear once as a parent.

Respond with ONLY valid JSON matching this exact schema:
{
  "parts": [
    {
      "partNumber": "string",
      "name": "string",
      "description": "string",
      "sourceModuleId": "string (module id)",
      "process": "enum value",
      "material": "string",
      "materialSpec": "string",
      "finish": "string",
      "tolerance": "string",
      "massKg": number,
      "envelopeXMm": number,
      "envelopeYMm": number,
      "envelopeZMm": number,
      "estimatedUnitCostGbp": number,
      "isPurchased": boolean,
      "aiConfidence": number (0-1)
    }
  ],
  "bomLines": [
    {
      "parentPartNumber": "string (assembly part number, or null for top-level)",
      "childPartNumber": "string",
      "quantity": number,
      "referenceDesignator": "string (optional)",
      "notes": "string (optional)"
    }
  ]
}`

    const userPrompt = `Generate a structured BOM for the product "${truncate(project.subject, 200)}" with these modules:

${moduleDescriptions}${briefContext}

Create structured parts and hierarchical BOM lines. Deduplicate common fasteners and purchased components.`

    // ── Call Claude ──

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return { success: false, error: "Anthropic API key not configured" }
    }

    const Anthropic = (await import("@anthropic-ai/sdk")).default
    const client = new Anthropic({ apiKey })

    const response = await client.messages.create({
      model: BOM_MODEL,
      max_tokens: BOM_MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    })

    // Extract text response
    const textBlock = response.content.find((b) => b.type === "text")
    if (!textBlock || textBlock.type !== "text") {
      return { success: false, error: "No text response from Claude" }
    }

    // Parse JSON from response (robust extraction handles prose around JSON)
    const jsonStr = extractJson(textBlock.text)

    let parsed: {
      parts: Array<Record<string, unknown>>
      bomLines: Array<Record<string, unknown>>
    }

    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      console.error("[generateBomFromModules] Failed to parse AI response:", jsonStr.slice(0, 200))
      return { success: false, error: "Failed to parse BOM generation response" }
    }

    if (!Array.isArray(parsed.parts) || !parsed.parts.length) {
      return { success: false, error: "No parts generated" }
    }

    if (!Array.isArray(parsed.bomLines)) {
      parsed.bomLines = []
    }

    // ── Validate and sanitize AI output ──
    // SECURITY: Validate all values before inserting into DB

    const validatedParts = parsed.parts.map((p) => ({
      partNumber: truncate(String(p.partNumber ?? ""), 50),
      name: truncate(String(p.name ?? ""), 200),
      description: truncate(String(p.description ?? ""), 500) || null,
      sourceModuleId: truncate(String(p.sourceModuleId ?? ""), 50) || null,
      process: validateProcess(p.process),
      material: truncate(String(p.material ?? ""), 200) || null,
      materialSpec: truncate(String(p.materialSpec ?? ""), 200) || null,
      finish: truncate(String(p.finish ?? ""), 200) || null,
      tolerance: truncate(String(p.tolerance ?? ""), 100) || null,
      massKg: clampPositive(p.massKg),
      envelopeXMm: clampPositive(p.envelopeXMm),
      envelopeYMm: clampPositive(p.envelopeYMm),
      envelopeZMm: clampPositive(p.envelopeZMm),
      estimatedUnitCostGbp: clampPositive(p.estimatedUnitCostGbp),
      isPurchased: Boolean(p.isPurchased),
      aiConfidence: typeof p.aiConfidence === "number"
        ? Math.max(0, Math.min(1, p.aiConfidence))
        : null,
    }))

    // Check for duplicate part numbers
    const partNumbers = new Set<string>()
    for (const p of validatedParts) {
      if (!p.partNumber) {
        return { success: false, error: "AI generated a part without a part number" }
      }
      if (partNumbers.has(p.partNumber)) {
        return { success: false, error: `AI generated duplicate part number: ${p.partNumber}` }
      }
      partNumbers.add(p.partNumber)
    }

    // ── NOW safe to delete existing data (AI response validated) ──

    const { error: bomDelErr } = await supabase
      .from("bom_lines")
      .delete()
      .eq("cad_lab_project_id", projectId)

    if (bomDelErr) {
      console.error("[generateBomFromModules] Failed to delete existing BOM lines:", bomDelErr)
      return { success: false, error: "Failed to clear existing BOM data" }
    }

    const { error: partsDelErr } = await supabase
      .from("parts")
      .delete()
      .eq("cad_lab_project_id", projectId)

    if (partsDelErr) {
      console.error("[generateBomFromModules] Failed to delete existing parts:", partsDelErr)
      return { success: false, error: "Failed to clear existing parts data" }
    }

    // ── Insert parts ──

    const partsToInsert = validatedParts.map((p) => ({
      cad_lab_project_id: projectId,
      part_number: p.partNumber,
      name: p.name,
      description: p.description,
      source_module_id: p.sourceModuleId,
      process: p.process,
      material: p.material,
      material_spec: p.materialSpec,
      finish: p.finish,
      tolerance: p.tolerance,
      mass_kg: p.massKg,
      envelope_x_mm: p.envelopeXMm,
      envelope_y_mm: p.envelopeYMm,
      envelope_z_mm: p.envelopeZMm,
      estimated_unit_cost_gbp: p.estimatedUnitCostGbp,
      ai_generated: true,
      ai_confidence: p.aiConfidence,
      is_purchased: p.isPurchased,
    }))

    const { data: insertedParts, error: insertErr } = await supabase
      .from("parts")
      .insert(partsToInsert)
      .select("id, part_number")

    if (insertErr || !insertedParts) {
      console.error("[generateBomFromModules] Failed to insert parts:", insertErr)
      return { success: false, error: "Failed to save parts to database" }
    }

    // Build part_number → id lookup
    const partNumberToId = new Map<string, string>()
    for (const p of insertedParts) {
      partNumberToId.set(p.part_number, p.id)
    }

    // ── Insert BOM lines ──

    let droppedLineCount = 0
    const bomLinesToInsert = parsed.bomLines
      .map((bl, idx) => {
        const childPartNumber = String(bl.childPartNumber ?? "")
        const parentPartNumber = bl.parentPartNumber ? String(bl.parentPartNumber) : null
        const childId = partNumberToId.get(childPartNumber)
        const parentId = parentPartNumber ? partNumberToId.get(parentPartNumber) : null

        if (!childId) {
          droppedLineCount++
          console.warn(`[generateBomFromModules] Unknown child part: ${childPartNumber}`)
          return null
        }

        // SECURITY: Prevent self-referencing BOM lines
        if (parentId && parentId === childId) {
          droppedLineCount++
          console.warn(`[generateBomFromModules] Self-referencing BOM line dropped: ${childPartNumber}`)
          return null
        }

        const qty = typeof bl.quantity === "number" && bl.quantity > 0
          ? Math.round(bl.quantity)
          : 1

        return {
          cad_lab_project_id: projectId,
          parent_part_id: parentId ?? null,
          child_part_id: childId,
          quantity: qty,
          reference_designator: truncate(String(bl.referenceDesignator ?? ""), 100) || null,
          notes: truncate(String(bl.notes ?? ""), 500) || null,
          sort_order: idx,
        }
      })
      .filter((bl): bl is NonNullable<typeof bl> => bl !== null)

    if (droppedLineCount > 0) {
      console.warn(`[generateBomFromModules] Dropped ${droppedLineCount} invalid BOM lines`)
    }

    if (bomLinesToInsert.length > 0) {
      const { error: bomInsertErr } = await supabase
        .from("bom_lines")
        .insert(bomLinesToInsert)

      if (bomInsertErr) {
        console.error("[generateBomFromModules] Failed to insert BOM lines:", bomInsertErr)
        // DECISION: Parts are already inserted. Return partial success rather than
        // leaving the user with parts but no hierarchy and a confusing error.
        return { success: false, error: "Parts saved but BOM hierarchy failed. Try regenerating." }
      }
    }

    // ── Return structured result ──

    const structuredParts: StructuredPart[] = validatedParts.map((p) => ({
      id: partNumberToId.get(p.partNumber),
      partNumber: p.partNumber,
      name: p.name,
      description: p.description ?? undefined,
      sourceModuleId: p.sourceModuleId ?? undefined,
      process: p.process ?? undefined,
      material: p.material ?? undefined,
      materialSpec: p.materialSpec ?? undefined,
      finish: p.finish ?? undefined,
      tolerance: p.tolerance ?? undefined,
      massKg: p.massKg ?? undefined,
      envelopeXMm: p.envelopeXMm ?? undefined,
      envelopeYMm: p.envelopeYMm ?? undefined,
      envelopeZMm: p.envelopeZMm ?? undefined,
      estimatedUnitCostGbp: p.estimatedUnitCostGbp ?? undefined,
      aiGenerated: true,
      aiConfidence: p.aiConfidence ?? undefined,
      isPurchased: p.isPurchased,
    }))

    return {
      success: true,
      parts: structuredParts,
      bomLines: bomLinesToInsert.map((bl) => ({
        cadLabProjectId: projectId,
        parentPartId: bl.parent_part_id,
        childPartId: bl.child_part_id,
        quantity: bl.quantity,
        referenceDesignator: bl.reference_designator ?? undefined,
        notes: bl.notes ?? undefined,
        sortOrder: bl.sort_order,
      })),
      generationTimeMs: Date.now() - start,
    } satisfies BomGenerationResult
  })
}

// ─── Load BOM ───────────────────────────────────────────────────────

/**
 * Load parts and BOM lines for a project and build the tree structure.
 *
 * @param projectId - The cad_lab_project ID
 * @returns Tree of BomTreeNode[] with rolled-up costs and mass
 */
export async function loadBom(
  projectId: string,
): Promise<{ tree: BomTreeNode[]; parts: StructuredPart[] } | { error: string }> {
  return withAuth(async ({ supabase }) => {
    // Load parts
    const { data: rawParts, error: partsErr } = await supabase
      .from("parts")
      .select("*")
      .eq("cad_lab_project_id", projectId)
      .order("part_number")

    if (partsErr) {
      return { error: "Failed to load parts" }
    }

    if (!rawParts?.length) {
      return { tree: [], parts: [] }
    }

    // Load BOM lines
    const { data: rawLines, error: linesErr } = await supabase
      .from("bom_lines")
      .select("*")
      .eq("cad_lab_project_id", projectId)
      .order("sort_order")

    if (linesErr) {
      return { error: "Failed to load BOM lines" }
    }

    // Map DB rows to StructuredPart
    const parts: StructuredPart[] = rawParts.map((r) => ({
      id: r.id,
      partNumber: r.part_number,
      name: r.name,
      description: r.description ?? undefined,
      sourceModuleId: r.source_module_id ?? undefined,
      process: r.process ?? undefined,
      material: r.material ?? undefined,
      materialSpec: r.material_spec ?? undefined,
      finish: r.finish ?? undefined,
      tolerance: r.tolerance ?? undefined,
      massKg: r.mass_kg ?? undefined,
      envelopeXMm: r.envelope_x_mm ?? undefined,
      envelopeYMm: r.envelope_y_mm ?? undefined,
      envelopeZMm: r.envelope_z_mm ?? undefined,
      estimatedUnitCostGbp: r.estimated_unit_cost_gbp ?? undefined,
      stepUrl: r.step_url ?? undefined,
      stlUrl: r.stl_url ?? undefined,
      drawingUrl: r.drawing_url ?? undefined,
      aiGenerated: r.ai_generated,
      aiConfidence: r.ai_confidence ?? undefined,
      isPurchased: r.is_purchased,
    }))

    const partMap = new Map<string, StructuredPart>()
    for (const p of parts) {
      if (p.id) partMap.set(p.id, p)
    }

    // Map BOM lines
    const bomLines: BomLine[] = (rawLines ?? []).map((l) => ({
      id: l.id,
      cadLabProjectId: l.cad_lab_project_id,
      parentPartId: l.parent_part_id,
      childPartId: l.child_part_id,
      quantity: l.quantity,
      referenceDesignator: l.reference_designator ?? undefined,
      notes: l.notes ?? undefined,
      sortOrder: l.sort_order,
    }))

    // Build tree (with cycle protection)
    const tree = buildBomTree(parts, bomLines, partMap)

    return { tree, parts }
  })
}

/**
 * Build a hierarchical BomTreeNode[] from flat parts and BOM lines.
 * Includes cycle detection to prevent infinite recursion from corrupted data.
 */
function buildBomTree(
  parts: StructuredPart[],
  bomLines: BomLine[],
  partMap: Map<string, StructuredPart>,
): BomTreeNode[] {
  // Group lines by parent
  const childrenByParent = new Map<string | null, BomLine[]>()
  for (const line of bomLines) {
    const key = line.parentPartId ?? null
    const existing = childrenByParent.get(key) ?? []
    existing.push(line)
    childrenByParent.set(key, existing)
  }

  // Find all part IDs that appear as children
  const childIds = new Set(bomLines.map((l) => l.childPartId))

  // Root nodes: parts that have children but are never children themselves,
  // or parts referenced as parents in BOM lines
  const parentIds = new Set(bomLines.filter((l) => l.parentPartId).map((l) => l.parentPartId!))
  const rootParts = parts.filter((p) => p.id && parentIds.has(p.id) && !childIds.has(p.id))

  // If no hierarchy detected, treat top-level BOM lines (null parent) as roots
  if (rootParts.length === 0) {
    const topLines = childrenByParent.get(null) ?? []
    return topLines.map((line) => {
      const part = partMap.get(line.childPartId)
      if (!part) return null
      return buildNode(part, line, 0, childrenByParent, partMap, new Set())
    }).filter((n): n is BomTreeNode => n !== null)
  }

  return rootParts.map((part) =>
    buildNode(part, undefined, 0, childrenByParent, partMap, new Set())
  )
}

/**
 * Recursively build a tree node. Uses a visited set to detect cycles
 * and a max depth guard to prevent stack overflow.
 */
function buildNode(
  part: StructuredPart,
  bomLine: BomLine | undefined,
  depth: number,
  childrenByParent: Map<string | null, BomLine[]>,
  partMap: Map<string, StructuredPart>,
  visited: Set<string>,
): BomTreeNode {
  // SECURITY: Cycle detection — if we've already visited this part, stop recursing
  if (part.id && visited.has(part.id)) {
    console.warn(`[buildBomTree] Cycle detected at part ${part.partNumber} (${part.id}), stopping recursion`)
    return { part, bomLine, children: [], depth, totalCost: 0, totalMass: 0 }
  }

  // SECURITY: Depth guard — prevent stack overflow from deeply nested BOMs
  if (depth > MAX_BOM_DEPTH) {
    console.warn(`[buildBomTree] Max depth (${MAX_BOM_DEPTH}) exceeded at part ${part.partNumber}`)
    return { part, bomLine, children: [], depth, totalCost: 0, totalMass: 0 }
  }

  // Track this part as visited for this branch
  const branchVisited = new Set(visited)
  if (part.id) branchVisited.add(part.id)

  const childLines = part.id ? (childrenByParent.get(part.id) ?? []) : []
  const children = childLines
    .map((line) => {
      const childPart = partMap.get(line.childPartId)
      if (!childPart) return null
      return buildNode(childPart, line, depth + 1, childrenByParent, partMap, branchVisited)
    })
    .filter((n): n is BomTreeNode => n !== null)

  const qty = bomLine?.quantity ?? 1
  const ownCost = (part.estimatedUnitCostGbp ?? 0) * qty
  const ownMass = (part.massKg ?? 0) * qty
  const childCost = children.reduce((s, c) => s + c.totalCost, 0)
  const childMass = children.reduce((s, c) => s + c.totalMass, 0)

  return {
    part,
    bomLine,
    children,
    depth,
    totalCost: ownCost + childCost,
    totalMass: ownMass + childMass,
  }
}

// ─── CRUD Operations ────────────────────────────────────────────────

/**
 * Upsert a single part (create or update).
 *
 * @param projectId - The cad_lab_project ID
 * @param part - The part to save
 */
export async function savePart(
  projectId: string,
  part: StructuredPart,
): Promise<{ part: StructuredPart } | { error: string }> {
  return withAuth(async ({ supabase }) => {
    const row = {
      cad_lab_project_id: projectId,
      part_number: part.partNumber,
      name: part.name,
      description: part.description || null,
      source_module_id: part.sourceModuleId || null,
      process: part.process || null,
      material: part.material || null,
      material_spec: part.materialSpec || null,
      finish: part.finish || null,
      tolerance: part.tolerance || null,
      mass_kg: part.massKg ?? null,
      envelope_x_mm: part.envelopeXMm ?? null,
      envelope_y_mm: part.envelopeYMm ?? null,
      envelope_z_mm: part.envelopeZMm ?? null,
      estimated_unit_cost_gbp: part.estimatedUnitCostGbp ?? null,
      step_url: part.stepUrl || null,
      stl_url: part.stlUrl || null,
      drawing_url: part.drawingUrl || null,
      ai_generated: part.aiGenerated ?? false,
      ai_confidence: part.aiConfidence ?? null,
      is_purchased: part.isPurchased ?? false,
    }

    if (part.id) {
      // SECURITY: Filter by both id AND cad_lab_project_id to prevent
      // cross-project part reassignment within the same foundry
      const { data, error } = await supabase
        .from("parts")
        .update(row)
        .eq("id", part.id)
        .eq("cad_lab_project_id", projectId)
        .select("id")
        .single()

      if (error) return { error: sanitizeErrorMessage(error) }
      return { part: { ...part, id: data.id } }
    } else {
      // Insert new part
      const { data, error } = await supabase
        .from("parts")
        .insert(row)
        .select("id")
        .single()

      if (error) return { error: sanitizeErrorMessage(error) }
      return { part: { ...part, id: data.id } }
    }
  })
}

/**
 * Upsert a single BOM line.
 *
 * @param projectId - The cad_lab_project ID
 * @param line - The BOM line to save
 */
export async function saveBomLine(
  projectId: string,
  line: BomLine,
): Promise<{ bomLine: BomLine } | { error: string }> {
  return withAuth(async ({ supabase }) => {
    // SECURITY: Prevent self-referencing BOM lines
    if (line.parentPartId && line.parentPartId === line.childPartId) {
      return { error: "A part cannot be its own parent" }
    }

    const row = {
      cad_lab_project_id: projectId,
      parent_part_id: line.parentPartId ?? null,
      child_part_id: line.childPartId,
      quantity: line.quantity,
      reference_designator: line.referenceDesignator || null,
      notes: line.notes || null,
      sort_order: line.sortOrder ?? 0,
    }

    if (line.id) {
      const { data, error } = await supabase
        .from("bom_lines")
        .update(row)
        .eq("id", line.id)
        .eq("cad_lab_project_id", projectId)
        .select("id")
        .single()

      if (error) return { error: sanitizeErrorMessage(error) }
      return { bomLine: { ...line, id: data.id } }
    } else {
      const { data, error } = await supabase
        .from("bom_lines")
        .insert(row)
        .select("id")
        .single()

      if (error) return { error: sanitizeErrorMessage(error) }
      return { bomLine: { ...line, id: data.id } }
    }
  })
}

/**
 * Delete a part and its associated BOM lines (cascade).
 *
 * @param partId - The part ID to delete
 */
export async function deletePart(
  partId: string,
): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase }) => {
    const { error } = await supabase
      .from("parts")
      .delete()
      .eq("id", partId)

    if (error) return { error: sanitizeErrorMessage(error) }
    return { success: true }
  })
}

/**
 * Delete a single BOM line.
 *
 * @param bomLineId - The BOM line ID to delete
 */
export async function deleteBomLine(
  bomLineId: string,
): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase }) => {
    const { error } = await supabase
      .from("bom_lines")
      .delete()
      .eq("id", bomLineId)

    if (error) return { error: sanitizeErrorMessage(error) }
    return { success: true }
  })
}
