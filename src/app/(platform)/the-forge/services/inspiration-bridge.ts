/**
 * @file inspiration-bridge.ts — Enriches X-Ray modules with Inspiration data
 *
 * @description Connects X-Ray module data to existing Inspiration datasets:
 * 1. Manufacturing techniques: matched by materials, applications, and module purpose
 * 2. Knowledge domains: matched by discipline and module keywords
 * 3. Objective packs: matched by subsystem type for suggested next steps
 *
 * @related
 * - Manufacturing techniques: src/lib/manufacturing-techniques/data.ts
 * - Knowledge domains: knowledge_domains table
 * - Objective packs: subsystem_objective_packs table
 */

import { ALL_TECHNIQUES } from "@/lib/manufacturing-techniques/data"
import { createClient } from "@/lib/supabase/server"

import type { ModuleSpec, XRaySpec } from "./xray-schema"

// ─── Types ───────────────────────────────────────────────────────────

export interface TechniqueMatch {
  /** Technique ID from manufacturing-techniques data */
  id: string
  /** Technique name */
  name: string
  /** Why this technique was matched */
  matchReason: string
  /** Cost tier (low/medium/high/very-high) */
  costTier: string
  /** Lead time estimate */
  leadTime: string
  /** Key pros */
  pros: string[]
  /** Key cons */
  cons: string[]
}

export interface DomainMatch {
  /** Domain ID */
  id: string
  /** Domain name */
  name: string
  /** Domain description */
  description: string | null
  /** Key questions from this domain relevant to the module */
  keyQuestions: string[]
  /** Marketplace categories to search for experts */
  marketplaceCategories: string[]
  /** Supplier categories to search for vendors */
  supplierCategories: string[]
}

export interface PackSuggestion {
  /** Pack ID */
  id: string
  /** Pack title */
  title: string
  /** Pack summary */
  summary: string | null
  /** Difficulty level */
  difficulty: string | null
  /** Estimated duration */
  estimatedDuration: string | null
  /** Number of tasks in the pack */
  taskCount: number
}

export interface ModuleEnrichment {
  moduleId: string
  techniques: TechniqueMatch[]
  domains: DomainMatch[]
  suggestedPacks: PackSuggestion[]
}

// ─── Manufacturing Techniques Matching ───────────────────────────────

/**
 * Matches a module's key parts and materials against manufacturing techniques.
 *
 * @param module - The module to find techniques for
 * @param specMaterials - Top-level materials from the XRaySpec
 * @returns Ranked list of matching manufacturing techniques
 */
function matchTechniques(module: ModuleSpec, specMaterials: string[]): TechniqueMatch[] {
  const searchTerms = [
    module.name,
    module.purpose,
    ...module.keyParts,
    ...specMaterials,
  ].map((t) => t.toLowerCase())

  const scored = ALL_TECHNIQUES.map((tech) => {
    let score = 0
    const matchReasons: string[] = []

    // Match materials
    const techMaterials = tech.materials.map((m) => m.toLowerCase())
    for (const term of searchTerms) {
      for (const mat of techMaterials) {
        if (mat.includes(term) || term.includes(mat)) {
          score += 3
          matchReasons.push(`Material: ${mat}`)
        }
      }
    }

    // Match applications
    const techApps = tech.applications.map((a) => a.toLowerCase())
    for (const term of searchTerms) {
      for (const app of techApps) {
        if (app.includes(term) || term.includes(app)) {
          score += 2
          matchReasons.push(`Application: ${app}`)
        }
      }
    }

    // Match name/category
    const techName = tech.name.toLowerCase()
    const techCategory = tech.category.toLowerCase()
    for (const term of searchTerms) {
      if (techName.includes(term) || term.includes(techName)) {
        score += 4
        matchReasons.push(`Name: ${tech.name}`)
      }
      if (techCategory.includes(term)) {
        score += 1
      }
    }

    return {
      tech,
      score,
      matchReason: [...new Set(matchReasons)].slice(0, 3).join(", "),
    }
  })

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((s) => ({
      id: s.tech.id,
      name: s.tech.name,
      matchReason: s.matchReason || `Related to ${module.name}`,
      costTier: s.tech.costTier,
      leadTime: s.tech.leadTime ?? "Not specified",
      pros: s.tech.pros.slice(0, 3),
      cons: s.tech.cons.slice(0, 2),
    }))
}

// ─── Knowledge Domain Matching ───────────────────────────────────────

/**
 * Matches a module against knowledge domains from the database.
 *
 * @param module - The module to find domains for
 * @returns Relevant knowledge domains with their key questions
 */
async function matchDomains(module: ModuleSpec): Promise<DomainMatch[]> {
  const supabase = await createClient()

  // Extract keywords from module for search
  const keywords = [
    module.name,
    module.purpose,
    ...module.detail.expertQuestions.map((q) => q.discipline),
  ]

  // Query knowledge domains with text matching
  const { data: domains, error } = await supabase
    .from("knowledge_domains")
    .select("id, name, description, key_questions, marketplace_categories, supplier_categories")
    .limit(20)

  if (error || !domains) {
    console.warn("[InspirationBridge] Failed to query knowledge_domains:", error?.message)
    return []
  }

  // Score domains against module keywords
  const searchStr = keywords.join(" ").toLowerCase()

  const scored = domains.map((domain) => {
    const domainStr = `${domain.name} ${domain.description || ""}`.toLowerCase()
    let score = 0

    for (const keyword of keywords) {
      if (domainStr.includes(keyword.toLowerCase())) {
        score += 2
      }
    }

    // Check for discipline overlap
    const disciplines = module.detail.expertQuestions.map((q) => q.discipline.toLowerCase())
    if (domain.name.toLowerCase().split(" ").some((w) => disciplines.includes(w))) {
      score += 3
    }
    if (searchStr.includes(domain.name.toLowerCase())) {
      score += 3
    }

    return { domain, score }
  })

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((s) => ({
      id: s.domain.id,
      name: s.domain.name,
      description: s.domain.description,
      keyQuestions: Array.isArray(s.domain.key_questions) ? (s.domain.key_questions as string[]).slice(0, 5) : [],
      marketplaceCategories: s.domain.marketplace_categories ?? [],
      supplierCategories: s.domain.supplier_categories ?? [],
    }))
}

// ─── Objective Pack Matching ─────────────────────────────────────────

/**
 * Finds objective packs that match a module's purpose.
 *
 * @param module - The module to find packs for
 * @returns Suggested objective packs the user can adopt
 */
async function matchPacks(module: ModuleSpec): Promise<PackSuggestion[]> {
  const supabase = await createClient()

  // Search packs by title/summary overlap with module name and purpose
  const { data: packs, error } = await supabase
    .from("subsystem_objective_packs")
    .select("id, title, summary, difficulty, estimated_duration, tasks")
    .limit(20)

  if (error || !packs) {
    console.warn("[InspirationBridge] Failed to query subsystem_objective_packs:", error?.message)
    return []
  }

  const searchTerms = [module.name, module.purpose, ...module.keyParts]
    .map((t) => t.toLowerCase())

  const scored = packs.map((pack) => {
    const packStr = `${pack.title} ${pack.summary || ""}`.toLowerCase()
    let score = 0

    for (const term of searchTerms) {
      if (packStr.includes(term.toLowerCase())) {
        score += 2
      }
      // Partial word matching
      for (const word of term.split(" ")) {
        if (word.length > 3 && packStr.includes(word)) {
          score += 1
        }
      }
    }

    return { pack, score }
  })

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((s) => ({
      id: s.pack.id,
      title: s.pack.title,
      summary: s.pack.summary,
      difficulty: s.pack.difficulty,
      estimatedDuration: s.pack.estimated_duration,
      taskCount: Array.isArray(s.pack.tasks) ? s.pack.tasks.length : 0,
    }))
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Enriches all modules in an X-Ray spec with Inspiration data.
 *
 * @param spec - The full X-Ray spec with modules
 * @returns Array of enrichment data per module
 *
 * @description For each module, finds:
 * - Relevant manufacturing techniques (from static data)
 * - Matching knowledge domains (from DB)
 * - Suggested objective packs (from DB)
 */
export async function enrichModules(spec: XRaySpec): Promise<ModuleEnrichment[]> {
  const enrichments: ModuleEnrichment[] = []

  for (const mod of spec.modules) {
    const [techniques, domains, suggestedPacks] = await Promise.all([
      Promise.resolve(matchTechniques(mod, spec.materials)),
      matchDomains(mod),
      matchPacks(mod),
    ])

    enrichments.push({
      moduleId: mod.id,
      techniques,
      domains,
      suggestedPacks,
    })
  }

  return enrichments
}
