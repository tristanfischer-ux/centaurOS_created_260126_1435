'use server'

/**
 * Server actions for Universal Subsystems
 * 
 * @description Provides functions to fetch universal subsystems and their
 * objective packs for the Product Guidance page. These are cross-sector
 * technical domains with actionable guidance and marketplace integration.
 * 
 * @security Public read access - subsystems are educational content
 */

import { createClient } from '@/lib/supabase/server'
import type {
  UniversalSubsystem,
  SubsystemObjectivePack,
  SubsystemPrimer,
  SubsystemQuestion,
  SubsystemLearningResources,
  SubsystemObjectiveTask,
  DomainCategory,
} from '@/types/blueprints'

/**
 * Fetches all active universal subsystems
 * 
 * @description Returns all universal subsystems ordered by display_order.
 * Each subsystem includes its primer, key questions, and marketplace mappings.
 * 
 * @returns Array of universal subsystems, or empty array on error
 */
export async function getUniversalSubsystems(): Promise<UniversalSubsystem[]> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('universal_subsystems')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
  
  if (error) {
    console.error('[UniversalSubsystems] Failed to fetch subsystems:', {
      error: error.message,
      code: error.code,
    })
    return []
  }
  
  // Parse JSONB fields into typed objects
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    tagline: row.tagline ?? '',
    description: row.description ?? '',
    category: row.category as DomainCategory,
    icon_name: row.icon_name || 'Box',
    display_order: row.display_order ?? 0,
    is_active: row.is_active ?? false,
    primer: row.primer as SubsystemPrimer | null,
    key_questions: (row.key_questions || []) as unknown as SubsystemQuestion[],
    learning_resources: (row.learning_resources || {}) as SubsystemLearningResources,
    marketplace_categories: row.marketplace_categories || [],
    recommended_executive_roles: row.recommended_executive_roles || [],
    recommended_supplier_types: row.recommended_supplier_types || [],
    created_at: row.created_at,
    updated_at: row.updated_at,
  }))
}

/**
 * Fetches a single universal subsystem by slug
 * 
 * @description Returns a specific subsystem with all its details.
 * Used for the subsystem detail view.
 * 
 * @param slug - The URL-friendly slug of the subsystem
 * @returns The subsystem or null if not found
 */
export async function getUniversalSubsystemBySlug(
  slug: string
): Promise<UniversalSubsystem | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('universal_subsystems')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()
  
  if (error) {
    if (error.code !== 'PGRST116') { // Not a "not found" error
      console.error('[UniversalSubsystems] Failed to fetch subsystem:', {
        slug,
        error: error.message,
        code: error.code,
      })
    }
    return null
  }
  
  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    tagline: data.tagline ?? '',
    description: data.description ?? '',
    category: data.category as DomainCategory,
    icon_name: data.icon_name || 'Box',
    display_order: data.display_order ?? 0,
    is_active: data.is_active ?? false,
    primer: data.primer as SubsystemPrimer | null,
    key_questions: (data.key_questions || []) as unknown as SubsystemQuestion[],
    learning_resources: (data.learning_resources || {}) as SubsystemLearningResources,
    marketplace_categories: data.marketplace_categories || [],
    recommended_executive_roles: data.recommended_executive_roles || [],
    recommended_supplier_types: data.recommended_supplier_types || [],
    created_at: data.created_at,
    updated_at: data.updated_at,
  }
}

/**
 * Fetches the default objective pack for a subsystem
 * 
 * @description Returns the default objective pack with all pre-built tasks.
 * Each pack includes marketplace tasks for finding experts and suppliers.
 * 
 * @param subsystemId - The ID of the subsystem
 * @returns The objective pack or null if not found
 */
export async function getSubsystemObjectivePack(
  subsystemId: string
): Promise<SubsystemObjectivePack | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('subsystem_objective_packs')
    .select('*')
    .eq('subsystem_id', subsystemId)
    .eq('is_default', true)
    .single()
  
  if (error) {
    if (error.code !== 'PGRST116') { // Not a "not found" error
      console.error('[UniversalSubsystems] Failed to fetch objective pack:', {
        subsystemId,
        error: error.message,
        code: error.code,
      })
    }
    return null
  }
  
  return {
    id: data.id,
    subsystem_id: data.subsystem_id,
    title: data.title,
    summary: data.summary,
    extended_description: data.extended_description,
    difficulty: data.difficulty as 'beginner' | 'intermediate' | 'advanced',
    estimated_duration: data.estimated_duration,
    is_default: data.is_default ?? false,
    tasks: (data.tasks || []) as unknown as SubsystemObjectiveTask[],
    created_at: data.created_at,
    updated_at: data.updated_at,
  }
}

/**
 * Fetches subsystems grouped by category
 * 
 * @description Returns subsystems organized by their category for display
 * in a categorized grid.
 * 
 * @returns Object mapping categories to arrays of subsystems
 */
export async function getSubsystemsByCategory(): Promise<
  Record<DomainCategory, UniversalSubsystem[]>
> {
  const subsystems = await getUniversalSubsystems()
  
  const grouped: Record<DomainCategory, UniversalSubsystem[]> = {
    Electronics: [],
    Mechanical: [],
    Software: [],
    Manufacturing: [],
    Regulatory: [],
    Business: [],
    Operations: [],
  }
  
  for (const subsystem of subsystems) {
    if (grouped[subsystem.category]) {
      grouped[subsystem.category].push(subsystem)
    }
  }
  
  return grouped
}

/**
 * Searches subsystems by name or description
 * 
 * @description Performs a case-insensitive search across subsystem names,
 * taglines, and descriptions.
 * 
 * @param query - Search query string
 * @returns Matching subsystems
 */
export async function searchSubsystems(query: string): Promise<UniversalSubsystem[]> {
  if (!query || query.trim().length < 2) {
    return getUniversalSubsystems()
  }
  
  const supabase = await createClient()
  const searchTerm = `%${query.trim().toLowerCase()}%`
  
  const { data, error } = await supabase
    .from('universal_subsystems')
    .select('*')
    .eq('is_active', true)
    .or(`name.ilike.${searchTerm},tagline.ilike.${searchTerm},description.ilike.${searchTerm}`)
    .order('display_order', { ascending: true })
  
  if (error) {
    console.error('[UniversalSubsystems] Search failed:', {
      query,
      error: error.message,
    })
    return []
  }
  
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    tagline: row.tagline ?? '',
    description: row.description ?? '',
    category: row.category as DomainCategory,
    icon_name: row.icon_name || 'Box',
    display_order: row.display_order ?? 0,
    is_active: row.is_active ?? false,
    primer: row.primer as SubsystemPrimer | null,
    key_questions: (row.key_questions || []) as unknown as SubsystemQuestion[],
    learning_resources: (row.learning_resources || {}) as SubsystemLearningResources,
    marketplace_categories: row.marketplace_categories || [],
    recommended_executive_roles: row.recommended_executive_roles || [],
    recommended_supplier_types: row.recommended_supplier_types || [],
    created_at: row.created_at,
    updated_at: row.updated_at,
  }))
}
