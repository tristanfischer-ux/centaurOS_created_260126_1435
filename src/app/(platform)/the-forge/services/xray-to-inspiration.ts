/**
 * @file xray-to-inspiration.ts — Bridge from X-Ray modules to Inspiration content
 *
 * @description Links X-Ray module characteristics to existing Inspiration content:
 * - Module key parts → ManufacturingTechniques (78+ techniques with materials, cost tiers)
 * - Module purpose → KnowledgeDomains (hierarchical expertise areas)
 * - Full spec → BlueprintTemplates (industry-specific patterns)
 * - Module disciplines → ObjectivePacks (business/subsystem starter packs)
 *
 * CURRENT STATE: Stub with documented integration signatures.
 *
 * DECISION: Stub — real integration planned for future release.
 * Integration points documented below for reference:
 * 1. ManufacturingTechnique matching (technique.materials overlaps module.keyParts)
 * 2. KnowledgeDomain matching (domain.key_questions vs module.detail.expertQuestions)
 * 3. BlueprintTemplate matching (industry alignment)
 * 4. ObjectivePack matching (business/subsystem packs)
 *
 * @related
 * - ManufacturingTechniques: src/lib/manufacturing-techniques/ (data + index)
 * - KnowledgeDomains: src/actions/packs.ts, src/types/blueprints.ts
 * - BlueprintTemplates: src/actions/blueprints.ts
 * - ObjectivePacks: src/actions/packs.ts (fetchObjectivePacks)
 * - UsePackDialog: src/components/inspiration/ (converts packs to objectives)
 */

import type { XRaySpec, ModuleSpec } from "./xray-schema"

export interface TechniqueMatch {
  techniqueName: string
  matchReason: string
  costTier: string
  moduleId: string
}

export interface KnowledgeDomainMatch {
  domainName: string
  relevantQuestions: string[]
  moduleId: string
}

export interface InspirationSuggestions {
  techniques: TechniqueMatch[]
  knowledgeDomains: KnowledgeDomainMatch[]
  blueprintTemplateIds: string[]
  objectivePackIds: string[]
}

/**
 * Finds Inspiration content relevant to an X-Ray spec.
 *
 * @param spec - The scanned X-Ray spec
 * @returns Matched techniques, knowledge domains, blueprints, and packs
 */
export async function findInspirationForSpec(
  _spec: XRaySpec
): Promise<InspirationSuggestions> {
  // DECISION: Stub — returns empty suggestions until real matching is implemented.
  //
  // // 1. Manufacturing techniques
  // const allTechniques = getAllTechniques() // from src/lib/manufacturing-techniques/
  // const techniques = spec.modules.flatMap(m =>
  //   allTechniques
  //     .filter(t => t.materials.some(mat => m.keyParts.some(kp => kp.toLowerCase().includes(mat.toLowerCase()))))
  //     .map(t => ({ techniqueName: t.name, matchReason: `Parts: ${m.keyParts.join(', ')}`, costTier: t.costTier, moduleId: m.id }))
  // )
  //
  // // 2. Knowledge domains
  // const { data: domains } = await supabase.from('knowledge_domains').select('*')
  // const knowledgeDomains = domains.filter(d =>
  //   spec.modules.some(m => m.detail.expertQuestions.some(q => d.key_questions.some(kq => kq.includes(q.q))))
  // )
  //
  // // 3. Blueprint templates
  // const { data: blueprints } = await supabase.from('blueprint_templates').select('id, name, industry')
  // const matchedBlueprints = blueprints.filter(b => specMatchesIndustry(spec, b.industry))
  //
  // // 4. Objective packs
  // const packs = await fetchObjectivePacks()
  // const matchedPacks = packs.filter(p => p.category === 'subsystem')

  return {
    techniques: [],
    knowledgeDomains: [],
    blueprintTemplateIds: [],
    objectivePackIds: [],
  }
}

/**
 * Finds manufacturing techniques relevant to a single module.
 *
 * @param module - The module to match
 * @returns Technique matches based on key parts and materials overlap
 */
export async function findTechniquesForModule(
  _module: ModuleSpec
): Promise<TechniqueMatch[]> {
  // DECISION: Stub — real technique matching planned for future release
  return []
}
