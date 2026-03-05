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

export async function getTechniqueEnrichment(slug: string): Promise<TechniqueEnrichment | null> {
  try {
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
