'use server'

import { createClient } from '@/lib/supabase/server'

// ============================================================================
// TYPES
// ============================================================================

export interface ProjectTemplateListItem {
  id: string
  title: string
  slug: string
  description: string | null
  difficulty: string | null
  estimated_hours: number | null
  estimated_cost_usd: number | null
  category: string | null
  tags: string[]
  tools_required: string[]
  skills_required: string[]
  step_count: number
  bom_count: number
  created_at: string
}

export interface ProjectTemplateDetail {
  id: string
  title: string
  slug: string
  description: string | null
  difficulty: string | null
  estimated_hours: number | null
  estimated_cost_usd: number | null
  category: string | null
  tags: string[]
  tools_required: string[]
  skills_required: string[]
  bom: BomItem[]
  steps: ProjectStep[]
  safety_warnings: string[]
  references: string[]
  created_at: string
}

export interface BomItem {
  name: string
  quantity: number
  estimated_cost_usd: number | null
  source: string | null
  notes: string | null
}

export interface ProjectStep {
  step_number: number
  title: string
  description: string
  duration_minutes: number | null
  tips: string | null
}

export interface ProjectTemplateFilters {
  search?: string
  category?: string
  difficulty?: string
  page?: number
  pageSize?: number
}

// ============================================================================
// LIST PROJECT TEMPLATES
// ============================================================================

/**
 * Fetches a paginated list of project templates with optional filtering.
 *
 * @description Queries the project_templates table with text search, category,
 * and difficulty filtering. Returns list items with step/bom counts.
 *
 * @param {ProjectTemplateFilters} filters - Search, category, difficulty, pagination
 * @returns {Promise<{ data: ProjectTemplateListItem[]; total: number } | { error: string }>}
 *
 * @security Requires authenticated user (RLS enforces)
 */
export async function getProjectTemplates(filters: ProjectTemplateFilters = {}): Promise<
  { data: ProjectTemplateListItem[]; total: number } | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const page = filters.page ?? 1
  const pageSize = filters.pageSize ?? 24
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('project_templates')
    .select('*', { count: 'exact' })

  if (filters.search) {
    query = query.or(
      `title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`
    )
  }

  if (filters.category && filters.category !== 'all') {
    query = query.eq('category', filters.category)
  }

  if (filters.difficulty && filters.difficulty !== 'all') {
    query = query.eq('difficulty', filters.difficulty)
  }

  query = query.order('created_at', { ascending: false }).range(from, to)

  const { data, error, count } = await query

  if (error) {
    console.error('[ProjectTemplates] Failed to fetch templates:', {
      error: error.message,
      filters,
    })
    return { error: 'Failed to load project templates' }
  }

  const items: ProjectTemplateListItem[] = (data ?? []).map((t) => {
    const steps = t.steps as unknown[] | null
    const bom = t.bom as unknown[] | null
    return {
      id: t.id,
      title: t.title,
      slug: t.slug,
      description: t.description,
      difficulty: t.difficulty,
      estimated_hours: t.estimated_hours ? Number(t.estimated_hours) : null,
      estimated_cost_usd: t.estimated_cost_usd ? Number(t.estimated_cost_usd) : null,
      category: t.category,
      tags: (t.tags as string[]) ?? [],
      tools_required: (t.tools_required as string[]) ?? [],
      skills_required: (t.skills_required as string[]) ?? [],
      step_count: Array.isArray(steps) ? steps.length : 0,
      bom_count: Array.isArray(bom) ? bom.length : 0,
      created_at: t.created_at,
    }
  })

  return { data: items, total: count ?? 0 }
}

// ============================================================================
// GET PROJECT TEMPLATE DETAIL
// ============================================================================

/**
 * Fetches full detail for a single project template by slug.
 *
 * @param {string} slug - URL-friendly template slug
 * @returns {Promise<ProjectTemplateDetail | { error: string }>}
 *
 * @security Requires authenticated user (RLS enforces)
 */
export async function getProjectTemplateBySlug(slug: string): Promise<
  ProjectTemplateDetail | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data, error } = await supabase
    .from('project_templates')
    .select('*')
    .eq('slug', slug)
    .single()

  if (error || !data) {
    console.error('[ProjectTemplates] Failed to fetch template:', {
      slug,
      error: error?.message,
    })
    return { error: 'Project template not found' }
  }

  return {
    id: data.id,
    title: data.title,
    slug: data.slug,
    description: data.description,
    difficulty: data.difficulty,
    estimated_hours: data.estimated_hours ? Number(data.estimated_hours) : null,
    estimated_cost_usd: data.estimated_cost_usd ? Number(data.estimated_cost_usd) : null,
    category: data.category,
    tags: (data.tags as string[]) ?? [],
    tools_required: (data.tools_required as string[]) ?? [],
    skills_required: (data.skills_required as string[]) ?? [],
    bom: (data.bom as unknown as BomItem[]) ?? [],
    steps: (data.steps as unknown as ProjectStep[]) ?? [],
    safety_warnings: (data.safety_warnings as string[]) ?? [],
    references: (data.references as string[]) ?? [],
    created_at: data.created_at,
  }
}

// ============================================================================
// GET PROJECT TEMPLATE CATEGORIES
// ============================================================================

/**
 * Fetches distinct category values for filter tabs.
 *
 * @returns {Promise<{ data: string[] } | { error: string }>}
 */
export async function getProjectTemplateCategories(): Promise<
  { data: string[] } | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data, error } = await supabase
    .from('project_templates')
    .select('category')

  if (error) {
    console.error('[ProjectTemplates] Failed to fetch categories:', error.message)
    return { error: 'Failed to load categories' }
  }

  const categories = [...new Set(
    (data ?? [])
      .map((d) => d.category as string | null)
      .filter(Boolean) as string[]
  )].sort()

  return { data: categories }
}
