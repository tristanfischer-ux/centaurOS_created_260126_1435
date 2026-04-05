'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { withAuth } from '@/lib/server-action-utils'
import {
  createKnowledgeNote,
  createKnowledgeLink,
  getKnowledgeDomains,
  ensureDefaultDomains,
} from '@/lib/knowledge-vault/manager'
import type { TechniqueEnrichment } from '@/types/manufacturing-techniques'
import { getTechniqueSlugs, getToleranceMm } from '@/lib/cad-lab/diagnostic-to-technique'
import { rankTechniques } from '@/lib/cad-lab/technique-recommender'
import type { TechniqueRecommendation } from '@/lib/cad-lab/technique-recommender'

/** Merged process insights from one or more technique enrichments */
export interface ProcessInsights {
  sources: string[]
  totalSupplierCount: number
  tolerances: { min_mm: number | null; max_mm: number | null; typical_mm: number | null }
  materials: Array<{ material: string; frequency: number }>
  equipment: Array<{ brand_model: string; frequency: number }>
  tips: string[]
  batchSizes: { prototype: boolean; low_volume: string | null; production: string | null }
}

export async function getTechniqueEnrichment(slug: string): Promise<TechniqueEnrichment | null> {
  try {
    // SECURITY: admin client — technique enrichments are global reference data, foundry_id not needed
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('manufacturing_technique_enrichments')
      .select('*')
      .eq('technique_slug', slug)
      .single()

    if (error || !data) return null
    return data as TechniqueEnrichment
  } catch (error) {
    console.error('Failed to get technique enrichment:', error)
    return null
  }
}

/**
 * Fetch and merge technique insights for a diagnostic process name.
 * Maps the process (e.g. "CNC Machining") to technique slugs, queries
 * enrichments, and merges data across multiple slugs.
 */
export async function getTechniqueInsightsByProcess(
  processName: string,
): Promise<ProcessInsights | null> {
  try {
    const slugs = getTechniqueSlugs(processName)
    if (slugs.length === 0) return null

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('manufacturing_technique_enrichments')
      .select('*')
      .in('technique_slug', slugs)

    if (error || !data || data.length === 0) return null

    const enrichments = data as TechniqueEnrichment[]

    // Merge tolerances — take min of mins, max of maxes, average of typicals
    const mins = enrichments.map(e => e.real_world_tolerances?.min_mm).filter((v): v is number => v != null)
    const maxes = enrichments.map(e => e.real_world_tolerances?.max_mm).filter((v): v is number => v != null)
    const typicals = enrichments.map(e => e.real_world_tolerances?.typical_mm).filter((v): v is number => v != null)

    // Merge materials — combine and sum frequencies, sort descending
    const matMap = new Map<string, number>()
    for (const e of enrichments) {
      for (const m of e.real_world_materials ?? []) {
        matMap.set(m.material, (matMap.get(m.material) ?? 0) + m.frequency)
      }
    }
    const materials = [...matMap.entries()]
      .map(([material, frequency]) => ({ material, frequency }))
      .sort((a, b) => b.frequency - a.frequency)

    // Merge equipment
    const eqMap = new Map<string, number>()
    for (const e of enrichments) {
      for (const eq of e.real_world_equipment ?? []) {
        eqMap.set(eq.brand_model, (eqMap.get(eq.brand_model) ?? 0) + eq.frequency)
      }
    }
    const equipment = [...eqMap.entries()]
      .map(([brand_model, frequency]) => ({ brand_model, frequency }))
      .sort((a, b) => b.frequency - a.frequency)

    // Merge tips — deduplicate
    const tipSet = new Set<string>()
    for (const e of enrichments) {
      for (const tip of e.tips_and_insights ?? []) {
        tipSet.add(tip)
      }
    }

    // Merge batch sizes — any prototype=true wins, take first non-null for others
    const batchSizes = {
      prototype: enrichments.some(e => e.typical_batch_sizes?.prototype),
      low_volume: enrichments.find(e => e.typical_batch_sizes?.low_volume)?.typical_batch_sizes?.low_volume ?? null,
      production: enrichments.find(e => e.typical_batch_sizes?.production)?.typical_batch_sizes?.production ?? null,
    }

    return {
      sources: enrichments.map(e => e.technique_slug),
      totalSupplierCount: enrichments.reduce((sum, e) => sum + (e.supplier_count ?? 0), 0),
      tolerances: {
        min_mm: mins.length > 0 ? Math.min(...mins) : null,
        max_mm: maxes.length > 0 ? Math.max(...maxes) : null,
        typical_mm: typicals.length > 0 ? typicals.reduce((s, v) => s + v, 0) / typicals.length : null,
      },
      materials,
      equipment,
      tips: [...tipSet],
      batchSizes,
    }
  } catch (error) {
    console.error('Failed to get technique insights:', error)
    return null
  }
}

/**
 * Recommend manufacturing techniques based on material, tolerance, and batch size.
 * Fetches all enrichments, scores each, returns top 5.
 */
export async function getProcessRecommendations(
  material: string | null,
  toleranceMm: number | null,
  batchSize: string | null,
): Promise<TechniqueRecommendation[]> {
  try {
    const enrichments = await getAllTechniqueEnrichments()
    if (enrichments.length === 0) return []
    return rankTechniques(enrichments, material, toleranceMm, batchSize, 5)
  } catch (error) {
    console.error('Failed to get process recommendations:', error)
    return []
  }
}

export async function getAllTechniqueEnrichments(): Promise<TechniqueEnrichment[]> {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('manufacturing_technique_enrichments')
      .select('*')
      .order('supplier_count', { ascending: false })

    if (error || !data) return []
    return data as TechniqueEnrichment[]
  } catch (error) {
    console.error('Failed to get technique enrichments:', error)
    return []
  }
}

/**
 * Sync technique enrichments into the Knowledge Vault as notes in the Technology domain.
 * Creates one knowledge_note per enrichment with proper tags and links between related notes.
 * Requires authenticated user context (foundry-scoped).
 */
export async function syncEnrichmentsToKnowledgeVault() {
  return withAuth(async ({ foundryId }) => {
    try {
      const enrichments = await getAllTechniqueEnrichments()
      if (enrichments.length === 0) {
        return { success: true as const, synced: 0, message: 'No enrichments to sync' }
      }

      // Ensure Technology domain exists
      await ensureDefaultDomains(foundryId)
      const domains = await getKnowledgeDomains(foundryId)
      const techDomain = domains.find(d => d.slug === 'technology')

      const noteIds: Record<string, string> = {}
      let synced = 0

      for (const enrichment of enrichments) {
        if (!enrichment.article_markdown) continue

        const slugReadable = enrichment.technique_slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        const title = `${slugReadable} — Real-World Technique Knowledge`

        const note = await createKnowledgeNote(foundryId, {
          title,
          content: enrichment.article_markdown,
          description: `Aggregated manufacturing technique knowledge from ${enrichment.supplier_count} suppliers`,
          note_type: 'fact',
          domain_id: techDomain?.id ?? null,
          source_specialist: 'nightshift',
          confidence: 0.8,
          tags: ['manufacturing', 'techniques', enrichment.technique_slug, 'nightshift'],
          extraction_metadata: {
            technique_slug: enrichment.technique_slug,
            supplier_count: enrichment.supplier_count,
            source: 'nightshift_aggregation',
          },
        })

        if (note) {
          noteIds[enrichment.technique_slug] = note.id
          synced++
        }
      }

      // Link related technique notes
      const slugs = Object.keys(noteIds)
      for (let i = 0; i < slugs.length; i++) {
        for (let j = i + 1; j < slugs.length; j++) {
          // Link techniques in the same category (prefix match)
          const a = slugs[i]
          const b = slugs[j]
          const categoryA = a.split('-')[0]
          const categoryB = b.split('-')[0]
          if (categoryA === categoryB) {
            await createKnowledgeLink(
              foundryId,
              noteIds[a],
              noteIds[b],
              'related',
              `Both are ${categoryA} techniques`,
              'system'
            )
          }
        }
      }

      return { success: true as const, synced, total: enrichments.length }
    } catch (error) {
      console.error('Failed to sync enrichments to Knowledge Vault:', error)
      return { error: 'Failed to sync enrichments to Knowledge Vault' }
    }
  })
}
