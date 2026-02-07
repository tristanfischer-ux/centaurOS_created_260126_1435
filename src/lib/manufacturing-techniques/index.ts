/**
 * @file manufacturing-techniques/index.ts
 *
 * @description Public API for the manufacturing techniques data layer.
 * Re-exports types and data, plus utility functions for searching,
 * filtering, and looking up techniques by ID or category.
 */

export * from './types'
export { ALL_TECHNIQUES } from './data'

import { ALL_TECHNIQUES } from './data'
import type {
  ManufacturingTechnique,
  TechniqueCategory,
  CostTier,
  BatchSize,
  BATCH_SIZES,
} from './types'

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/** Map of technique ID → technique for O(1) lookups. */
const TECHNIQUE_MAP = new Map<string, ManufacturingTechnique>(
  ALL_TECHNIQUES.map(t => [t.id, t]),
)

/**
 * Retrieve a single technique by its unique ID.
 *
 * @param id - The technique identifier (e.g. "fdm", "cnc-milling-5axis")
 * @returns The matching technique or undefined
 */
export function getTechniqueById(id: string): ManufacturingTechnique | undefined {
  return TECHNIQUE_MAP.get(id)
}

/**
 * Retrieve all techniques belonging to a specific category.
 *
 * @param category - The category to filter by
 * @returns Array of techniques in that category
 */
export function getTechniquesByCategory(
  category: TechniqueCategory,
): ManufacturingTechnique[] {
  return ALL_TECHNIQUES.filter(t => t.category === category)
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * Search techniques by a text query (fuzzy-ish: case-insensitive substring).
 * Searches name, description, materials, and applications.
 *
 * @param query - The search string
 * @returns Array of matching techniques, ordered by relevance (name match first)
 */
export function searchTechniques(query: string): ManufacturingTechnique[] {
  if (!query.trim()) return ALL_TECHNIQUES

  const q = query.toLowerCase().trim()

  const nameMatches: ManufacturingTechnique[] = []
  const otherMatches: ManufacturingTechnique[] = []

  for (const t of ALL_TECHNIQUES) {
    if (t.name.toLowerCase().includes(q)) {
      nameMatches.push(t)
    } else if (
      t.description.toLowerCase().includes(q) ||
      t.materials.some(m => m.toLowerCase().includes(q)) ||
      t.applications.some(a => a.toLowerCase().includes(q)) ||
      t.subcategory?.toLowerCase().includes(q)
    ) {
      otherMatches.push(t)
    }
  }

  return [...nameMatches, ...otherMatches]
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

export interface TechniqueFilters {
  category?: TechniqueCategory | null
  costTier?: CostTier | null
  batchSize?: BatchSize | null
  material?: string | null
  query?: string | null
}

const BATCH_ORDER: Record<string, number> = {
  prototype: 0,
  low: 1,
  medium: 2,
  high: 3,
}

/**
 * Filter techniques by a combination of criteria.
 *
 * @param filters - The filter criteria
 * @returns Matching techniques
 */
export function filterTechniques(filters: TechniqueFilters): ManufacturingTechnique[] {
  let results = ALL_TECHNIQUES

  // Text search
  if (filters.query?.trim()) {
    results = searchTechniques(filters.query)
  }

  // Category
  if (filters.category) {
    results = results.filter(t => t.category === filters.category)
  }

  // Cost tier
  if (filters.costTier) {
    results = results.filter(t => t.costTier === filters.costTier)
  }

  // Batch size — technique must support the requested batch size
  if (filters.batchSize) {
    const requested = BATCH_ORDER[filters.batchSize] ?? 0
    results = results.filter(t => {
      const min = BATCH_ORDER[t.batchSize.min] ?? 0
      const max = BATCH_ORDER[t.batchSize.max] ?? 3
      return requested >= min && requested <= max
    })
  }

  // Material
  if (filters.material?.trim()) {
    const mat = filters.material.toLowerCase().trim()
    results = results.filter(t =>
      t.materials.some(m => m.toLowerCase().includes(mat)),
    )
  }

  return results
}

// ---------------------------------------------------------------------------
// Aggregation helpers
// ---------------------------------------------------------------------------

/**
 * Count techniques per category.
 *
 * @returns Record mapping category → count
 */
export function countByCategory(): Record<TechniqueCategory, number> {
  const counts = {} as Record<TechniqueCategory, number>
  for (const t of ALL_TECHNIQUES) {
    counts[t.category] = (counts[t.category] || 0) + 1
  }
  return counts
}

/**
 * Extract all unique materials across all techniques.
 *
 * @returns Sorted array of unique material names
 */
export function getAllMaterials(): string[] {
  const set = new Set<string>()
  for (const t of ALL_TECHNIQUES) {
    for (const m of t.materials) {
      set.add(m)
    }
  }
  return [...set].sort()
}
