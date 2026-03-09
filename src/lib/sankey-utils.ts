/**
 * @file sankey-utils.ts — Shared types, constants, and pure functions for Sankey diagrams.
 *
 * @description Extracted from supplier-procurement-flow.tsx so both the
 * Decomposition (Modules → Categories) and Allocation (Categories → Suppliers)
 * diagrams share one source of truth.
 */

import { getChartColor } from "@/lib/chart-colors"
import type { CadLabModule, AiCostEstimate } from "@/lib/cad-lab-types"
import type { CadLabSupplierMatch } from "@/actions/cad-lab-supplier-match"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"

// ─── Types ───────────────────────────────────────────────────────────

export interface PartWithCategory {
  name: string
  categoryKey: string
}

export interface ModuleNode {
  id: string
  name: string
  partCount: number
  partNames: string[]
  partsWithCategories: PartWithCategory[]
  categoryKeys: string[]
}

export interface CategoryPart {
  name: string
  moduleId: string
}

export interface CategoryNode {
  id: string
  label: string
  process: string
  material: string
  type: "buy" | "make"
  partCount: number
  /** Individual parts with module provenance */
  parts: CategoryPart[]
  /** moduleId → number of parts contributed */
  moduleContributions: Map<string, number>
}

/** Deduplicated supplier entry for a specific category, aggregated across modules */
export interface CategorySupplierEntry {
  supplierId: string
  name: string
  isVerified: boolean
  aggregateScore: number
  originalMatch: CadLabSupplierMatch
  contributingModuleIds: string[]
}

/** Deduplicated supplier with best score and aggregated module IDs */
export interface UniqueSupplier {
  id: string
  name: string
  isVerified: boolean
  bestScore: number
  moduleIds: string[]
  originalMatch: CadLabSupplierMatch
  firstModuleId: string
}

// ─── Constants ───────────────────────────────────────────────────────

export const SANKEY = {
  BAR_H_UNIT: 8,
  BAR_MIN_H: 28,
  MODULE_GAP: 14,
  BAR_W: 14,
  CAT_GAP: 12,
  SUP_GAP: 10,
  CONTENT_TOP: 8,
  PADDING_BOTTOM: 24,
  LABEL_OFFSET_RIGHT: 22,
} as const

/** Horizontal supplier bar sizing — shared by Shortlist and Costs diagrams */
export const SUPPLIER_BAR = {
  FIRST_W: 220,    // 1st choice: wider bar
  BACKUP_W: 130,   // 2nd/3rd: narrower
  MORE_W: 80,      // "+N more" chip
  BAR_H: 22,       // All bars same height
  BAR_GAP: 6,      // Horizontal gap
  BAR_R: 4,        // Border radius
  MAX_VISIBLE: 3,  // Show max 3 before collapsing
} as const

// Muted category color palette — shared by both Suppliers and Shortlist diagrams
export const CAT_COLORS = [
  "#6366f1", "#0891b2", "#059669", "#d97706", "#dc2626",
  "#7c3aed", "#2563eb", "#0d9488", "#ca8a04", "#e11d48",
] as const

/** Sort comparator: buy categories to the bottom, then by center-of-gravity */
export function sortCategoriesBuyLast(
  a: { type: string; centerOfGravity: number },
  b: { type: string; centerOfGravity: number },
): number {
  if (a.type === "buy" && b.type !== "buy") return 1
  if (a.type !== "buy" && b.type === "buy") return -1
  return a.centerOfGravity - b.centerOfGravity
}

// ─── Color helpers ───────────────────────────────────────────────────

export function moduleColorFn(index: number): string {
  return getChartColor(index, true)
}

/** Convert an HSL chart color to an rgba with alpha for flow ribbons */
export function flowFill(hslColor: string, alpha: number): string {
  const m = hslColor.match(/hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)/)
  if (!m) return `rgba(120,120,120,${alpha})`
  const h = +m[1], s = +m[2], l = +m[3]
  const c = (1 - Math.abs(2 * l / 100 - 1)) * (s / 100)
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m2 = l / 100 - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x }
  else if (h < 120) { r = x; g = c }
  else if (h < 180) { g = c; b = x }
  else if (h < 240) { g = x; b = c }
  else if (h < 300) { r = x; b = c }
  else { r = c; b = x }
  return `rgba(${Math.round((r + m2) * 255)},${Math.round((g + m2) * 255)},${Math.round((b + m2) * 255)},${alpha})`
}

// ─── Sankey flow path ────────────────────────────────────────────────

export function flowPath(
  x1: number, y1t: number, y1b: number,
  x2: number, y2t: number, y2b: number,
): string {
  const mx = (x1 + x2) / 2
  return [
    `M ${x1} ${y1t}`,
    `C ${mx} ${y1t}, ${mx} ${y2t}, ${x2} ${y2t}`,
    `L ${x2} ${y2b}`,
    `C ${mx} ${y2b}, ${mx} ${y1b}, ${x1} ${y1b}`,
    "Z",
  ].join(" ")
}

// ─── Truncate text ───────────────────────────────────────────────────

export function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "\u2026" : s
}

// ─── Build unique suppliers from matches map ─────────────────────────

export function buildUniqueSuppliers(
  supplierMatches: Map<string, CadLabSupplierMatch[]>,
): UniqueSupplier[] {
  const map = new Map<string, UniqueSupplier>()

  for (const [moduleId, matches] of supplierMatches) {
    for (const match of matches) {
      const existing = map.get(match.id)
      if (existing) {
        if (match.matchScore > existing.bestScore) {
          existing.bestScore = match.matchScore
          existing.originalMatch = match
        }
        if (!existing.moduleIds.includes(moduleId)) {
          existing.moduleIds.push(moduleId)
        }
      } else {
        map.set(match.id, {
          id: match.id,
          name: match.name,
          isVerified: match.isVerified,
          bestScore: match.matchScore,
          moduleIds: [moduleId],
          originalMatch: match,
          firstModuleId: moduleId,
        })
      }
    }
  }

  return [...map.values()].sort((a, b) => b.bestScore - a.bestScore)
}

// ─── Part classification ─────────────────────────────────────────────

// INTENT: Deterministic two-pass classification for keyParts and AI estimate parts.
// Make indicators take PRIORITY over buy keywords to prevent false positives
// on compound names like "motor mount bracket" or "sensor housing".

const MAKE_INDICATORS = /\b(machined|cnc.machined|milled|turned|welded|fabricated|cast|moulded|molded|printed|forged|bent|formed|stamped|extruded|laser.cut|anodized|anodised|powder.coated|bracket|housing|frame|plate|enclosure|chassis|baseplate|panel|structure|duct|manifold|fixture|shell|body|cavity|guard|tray|channel|spar|strut|rib|bulkhead|tank|rudder|blade|nozzle|impeller|exhaust|piping|keel|hull|mast|boom|foil|fin|canopy|fairing|cowl|shroud|baffle|pedestal|mount|flange|collar|sleeve|weldment|tube|pipe)s?\b/i

const BUY_KEYWORDS = /\b(motor|servo|stepper|sensor|switch|batter(?:y|ies)|power suppl(?:y|ies)|microcontroller|pcb|arduino|raspberry|cable|connector|bearing|linear rail|lead screw|belt|pulley|gear|fastener|bolt|screw|nut|washer|seal|o-ring|spring|fan|pump|valve|display|led|camera|encoder|driver|esc|fuse|relay|capacitor|resistor|transistor|diode|regulator|thermostat|gauge|meter|indicator|antenna|transponder|gps|transducer|solenoid|actuator|contactor|breaker|terminal|epirb|vhf|radar|anemometer|compass|standoff|isolator|bushing|grommet|hose|fitting|rivet|pin|dowel|circlip|shim|gasket|filter)s?\b/i

const PROCESS_PATTERNS: [RegExp, string][] = [
  [/\b(cnc.machin\w*|milled|turned|lathe)\b/i, "CNC Machining"],
  [/\b(weld\w*|tig.weld\w*|mig.weld\w*)\b/i, "Welding"],
  [/\b(sheet.metal|laser.cut\w*|bent|fold\w*|punch\w*|stamp\w*)\b/i, "Sheet Metal"],
  [/\b(injection.mould\w*|injection.mold\w*)\b/i, "Injection Moulding"],
  [/\b(3d.print\w*|fdm|sla|sls)\b/i, "3D Printing"],
  [/\b(cast(?:ing)?|die.cast\w*)\b/i, "Casting"],
  [/\b(composite|carbon.fib\w*|fibre.glass|fiber.glass|layup)\b/i, "Composites"],
  [/\b(extrud\w*|extrusion)\b/i, "Extrusion"],
]

const MATERIAL_PATTERNS: [RegExp, string][] = [
  [/\b(6061|alumini?um alloy)\b/i, "Aluminum 6061"],
  [/\b(mild steel|carbon steel)\b/i, "Mild Steel"],
  [/\b(stainless|304|316)\b/i, "Stainless Steel"],
  [/\b(abs)\b/i, "ABS"],
  [/\b(nylon|pa6|pa66)\b/i, "Nylon"],
  [/\b(tpu|rubber)\b/i, "TPU/Rubber"],
  [/\b(brass)\b/i, "Brass"],
  [/\b(titanium)\b/i, "Titanium"],
  [/\b(polycarbonate|pc)\b/i, "Polycarbonate"],
]

function classifyPart(
  name: string,
  fallbackProcess: string,
  fallbackMaterial: string,
): { type: "buy" | "make"; process: string; material: string; explicit: boolean } {
  // Make indicators take priority — prevents false positives
  const isMake = MAKE_INDICATORS.test(name)
  if (!isMake && BUY_KEYWORDS.test(name)) {
    return { type: "buy", process: "Buy", material: "Off-the-shelf", explicit: true }
  }
  // Detect actual process from text (instead of blindly using module diagnostic)
  let process = fallbackProcess
  for (const [re, label] of PROCESS_PATTERNS) {
    if (re.test(name)) { process = label; break }
  }
  // Detect actual material from text
  let material = fallbackMaterial
  for (const [re, label] of MATERIAL_PATTERNS) {
    if (re.test(name)) { material = label; break }
  }
  return { type: "make", process, material, explicit: isMake }
}

// ─── Build Sankey data ───────────────────────────────────────────────

export function buildSankeyData(
  modules: CadLabModule[],
  diagnosticAnswers: DiagnosticAnswers | undefined,
  aiCostEstimates: Record<string, AiCostEstimate> | undefined,
): { moduleNodes: ModuleNode[]; categories: CategoryNode[]; totalParts: number } {
  const moduleNodes: ModuleNode[] = []
  const catMap = new Map<string, CategoryNode>()
  let totalParts = 0

  for (const mod of modules) {
    const diag = diagnosticAnswers?.[mod.id]
    const costEstimate = aiCostEstimates?.[mod.id]
    const hasParts = costEstimate?.parts && costEstimate.parts.length > 0

    const node: ModuleNode = {
      id: mod.id,
      name: mod.name,
      partCount: 0,
      partNames: [],
      partsWithCategories: [],
      categoryKeys: [],
    }

    const catKeysSet = new Set<string>()

    if (hasParts) {
      for (const part of costEstimate.parts!) {
        // Safety net: explicit keyword detection overrides AI classification in BOTH directions
        const cls = classifyPart(part.name, diag?.mfg_process || "Unknown Process", diag?.material || "Unknown Material")
        const effectiveType = cls.explicit ? cls.type : part.type
        const process = effectiveType === "buy" ? "Buy" : (part.process || cls.process)
        const material = effectiveType === "buy" ? "Off-the-shelf" : (part.material || cls.material)
        const catKey = `${process}-${material}-${effectiveType}`.toLowerCase().replace(/\s+/g, "_")

        node.partNames.push(part.name)
        node.partsWithCategories.push({ name: part.name, categoryKey: catKey })
        catKeysSet.add(catKey)

        let cat = catMap.get(catKey)
        if (!cat) {
          const label = effectiveType === "buy"
            ? "Buy \u00b7 Off-the-shelf"
            : `${process} \u00b7 ${material}`
          cat = { id: catKey, label, process, material, type: effectiveType, partCount: 0, parts: [], moduleContributions: new Map() }
          catMap.set(catKey, cat)
        }
        cat.parts.push({ name: part.name, moduleId: mod.id })
        cat.partCount++
        cat.moduleContributions.set(mod.id, (cat.moduleContributions.get(mod.id) ?? 0) + 1)
      }
      node.partCount = costEstimate.parts!.length
    } else {
      // Fallback: classify each keyPart individually via deterministic keywords
      const fallbackProcess = diag?.mfg_process ?? "Unknown Process"
      const fallbackMaterial = diag?.material ?? "Unknown Material"

      for (const kp of mod.keyParts) {
        const cls = classifyPart(kp, fallbackProcess, fallbackMaterial)
        const catKey = `${cls.process}-${cls.material}-${cls.type}`.toLowerCase().replace(/\s+/g, "_")

        node.partNames.push(kp)
        node.partsWithCategories.push({ name: kp, categoryKey: catKey })
        catKeysSet.add(catKey)

        let cat = catMap.get(catKey)
        if (!cat) {
          const label = cls.type === "buy"
            ? "Buy \u00b7 Off-the-shelf"
            : `${cls.process} \u00b7 ${cls.material}`
          cat = { id: catKey, label, process: cls.process, material: cls.material, type: cls.type, partCount: 0, parts: [], moduleContributions: new Map() }
          catMap.set(catKey, cat)
        }
        cat.parts.push({ name: kp, moduleId: mod.id })
        cat.partCount++
        cat.moduleContributions.set(mod.id, (cat.moduleContributions.get(mod.id) ?? 0) + 1)
      }
      node.partCount = mod.keyParts.length
    }

    node.categoryKeys = [...catKeysSet]
    totalParts += node.partCount
    moduleNodes.push(node)
  }

  return { moduleNodes, categories: [...catMap.values()], totalParts }
}

// ─── Build per-category supplier rankings ────────────────────────────

/**
 * Aggregates suppliers across modules per category. For each category, finds all
 * modules that contribute parts, collects their matched suppliers, deduplicates
 * (keeping best score), and sorts by score descending.
 */
export function buildPerCategorySuppliers(
  categories: CategoryNode[],
  supplierMatches: Map<string, CadLabSupplierMatch[]>,
): Map<string, CategorySupplierEntry[]> {
  const result = new Map<string, CategorySupplierEntry[]>()

  for (const cat of categories) {
    if (cat.type === "buy") continue

    const supMap = new Map<string, CategorySupplierEntry>()

    for (const [moduleId, count] of cat.moduleContributions) {
      const matches = supplierMatches.get(moduleId)
      if (!matches) continue

      for (const match of matches) {
        const existing = supMap.get(match.id)
        if (existing) {
          if (match.matchScore > existing.aggregateScore) {
            existing.aggregateScore = match.matchScore
            existing.originalMatch = match
          }
          if (!existing.contributingModuleIds.includes(moduleId)) {
            existing.contributingModuleIds.push(moduleId)
          }
        } else {
          supMap.set(match.id, {
            supplierId: match.id,
            name: match.name,
            isVerified: match.isVerified,
            aggregateScore: match.matchScore,
            originalMatch: match,
            contributingModuleIds: [moduleId],
          })
        }
      }
    }

    const sorted = [...supMap.values()].sort((a, b) => b.aggregateScore - a.aggregateScore)
    result.set(cat.id, sorted)
  }

  return result
}
