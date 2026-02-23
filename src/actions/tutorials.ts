'use server'

import { createClient } from '@/lib/supabase/server'

// ============================================================================
// TYPES
// ============================================================================

export interface TutorialListItem {
  id: string
  title: string
  slug: string
  description: string | null
  topic: string | null
  difficulty: string | null
  estimated_read_minutes: number | null
  tags: string[]
  created_at: string
}

export interface TutorialDetail {
  id: string
  title: string
  slug: string
  description: string | null
  topic: string | null
  difficulty: string | null
  estimated_read_minutes: number | null
  tags: string[]
  prerequisites: string[]
  tools_mentioned: string[]
  sections: TutorialSection[]
  common_mistakes: string[]
  further_reading: string[]
  key_takeaways: string[]
  created_at: string
}

export interface TutorialSection {
  heading: string
  content: string
  tips: string[]
}

export interface TutorialFilters {
  search?: string
  topic?: string
  difficulty?: string
  page?: number
  pageSize?: number
}

// ============================================================================
// LIST TUTORIALS
// ============================================================================

/**
 * Fetches a paginated list of tutorials with optional filtering.
 *
 * @description Queries the tutorials table with text search, topic, and
 * difficulty filtering. Returns list items (no full section content).
 *
 * @param {TutorialFilters} filters - Search, topic, difficulty, and pagination
 * @returns {Promise<{ data: TutorialListItem[]; total: number } | { error: string }>}
 *
 * @security Requires authenticated user (RLS enforces)
 */
export async function getTutorials(filters: TutorialFilters = {}): Promise<
  { data: TutorialListItem[]; total: number } | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const page = filters.page ?? 1
  const pageSize = filters.pageSize ?? 24
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('tutorials')
    .select('id, title, slug, description, topic, difficulty, estimated_read_minutes, tags, created_at', { count: 'exact' })

  if (filters.search) {
    query = query.or(
      `title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`
    )
  }

  if (filters.topic && filters.topic !== 'all') {
    query = query.eq('topic', filters.topic)
  }

  if (filters.difficulty && filters.difficulty !== 'all') {
    query = query.eq('difficulty', filters.difficulty)
  }

  query = query.order('created_at', { ascending: false }).range(from, to)

  const { data, error, count } = await query

  if (error) {
    console.error('[Tutorials] Failed to fetch tutorials:', {
      error: error.message,
      filters,
    })
    return { error: 'Failed to load tutorials' }
  }

  const items: TutorialListItem[] = (data ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    slug: t.slug,
    description: t.description,
    topic: t.topic,
    difficulty: t.difficulty,
    estimated_read_minutes: t.estimated_read_minutes,
    tags: (t.tags as string[]) ?? [],
    created_at: t.created_at,
  }))

  return { data: items, total: count ?? 0 }
}

// ============================================================================
// GET TUTORIAL DETAIL
// ============================================================================

/**
 * Fetches full detail for a single tutorial by slug.
 *
 * @param {string} slug - URL-friendly tutorial slug
 * @returns {Promise<TutorialDetail | { error: string }>}
 *
 * @security Requires authenticated user (RLS enforces)
 */
export async function getTutorialBySlug(slug: string): Promise<
  TutorialDetail | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data, error } = await supabase
    .from('tutorials')
    .select('*')
    .eq('slug', slug)
    .single()

  if (error || !data) {
    console.error('[Tutorials] Failed to fetch tutorial:', {
      slug,
      error: error?.message,
    })
    return { error: 'Tutorial not found' }
  }

  return {
    id: data.id,
    title: data.title,
    slug: data.slug,
    description: data.description,
    topic: data.topic,
    difficulty: data.difficulty,
    estimated_read_minutes: data.estimated_read_minutes,
    tags: (data.tags as string[]) ?? [],
    prerequisites: (data.prerequisites as string[]) ?? [],
    tools_mentioned: (data.tools_mentioned as string[]) ?? [],
    sections: (data.sections as unknown as TutorialSection[]) ?? [],
    common_mistakes: (data.common_mistakes as string[]) ?? [],
    further_reading: (data.further_reading as string[]) ?? [],
    key_takeaways: (data.key_takeaways as string[]) ?? [],
    created_at: data.created_at,
  }
}

// ============================================================================
// GET TUTORIAL TOPICS
// ============================================================================

/**
 * Fetches distinct topic values for filter tabs.
 *
 * @returns {Promise<{ data: string[] } | { error: string }>}
 */
export async function getTutorialTopics(): Promise<
  { data: string[] } | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data, error } = await supabase
    .from('tutorials')
    .select('topic')

  if (error) {
    console.error('[Tutorials] Failed to fetch topics:', error.message)
    return { error: 'Failed to load topics' }
  }

  const topics = [...new Set(
    (data ?? [])
      .map((d) => d.topic as string | null)
      .filter(Boolean) as string[]
  )].sort()

  return { data: topics }
}
