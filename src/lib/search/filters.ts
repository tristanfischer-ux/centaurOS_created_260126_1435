/**
 * Search Filter Engine
 * Handles all filtering logic for marketplace search
 */

import {
  SearchParams,
  SearchResult,
  ProviderTier,
  AppliedFilters,
  SearchFacets,
  MarketplaceCategory,
} from "@/types/search"

// ==========================================
// MAIN FILTER FUNCTION
// ==========================================

/**
 * Apply all filters to a list of search results
 */
export function applyFilters(
  results: SearchResult[],
  filters: SearchParams
): SearchResult[] {
  let filtered = [...results]

  // Apply each filter in sequence
  if (filters.category) {
    filtered = filterByCategory(filtered, filters.category)
  }

  if (filters.subcategories && filters.subcategories.length > 0) {
    filtered = filterBySubcategories(filtered, filters.subcategories)
  }

  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    filtered = filterByPriceRange(filtered, filters.minPrice, filters.maxPrice)
  }

  if (filters.minRating !== undefined) {
    filtered = filterByRating(filtered, filters.minRating)
  }

  if (filters.location) {
    filtered = filterByLocation(filtered, filters.location)
  }

  if (filters.tiers && filters.tiers.length > 0) {
    filtered = filterByTier(filtered, filters.tiers)
  }

  if (filters.availableFrom || filters.availableTo) {
    filtered = filterByAvailability(filtered, filters.availableFrom, filters.availableTo)
  }

  if (filters.skills && filters.skills.length > 0) {
    filtered = filterBySkills(filtered, filters.skills)
  }

  if (filters.certifications && filters.certifications.length > 0) {
    filtered = filterByCertifications(filtered, filters.certifications)
  }

  return filtered
}

// ==========================================
// CATEGORY FILTER
// ==========================================

/**
 * Filter results by marketplace category
 */
export function filterByCategory(
  results: SearchResult[],
  category: MarketplaceCategory
): SearchResult[] {
  return results.filter(result => result.category === category)
}

/**
 * Filter results by multiple subcategories (OR logic)
 */
export function filterBySubcategories(
  results: SearchResult[],
  subcategories: string[]
): SearchResult[] {
  const normalizedSubcategories = subcategories.map(s => s.toLowerCase())
  return results.filter(result =>
    normalizedSubcategories.includes(result.subcategory.toLowerCase())
  )
}

// ==========================================
// PRICE FILTER
// ==========================================

/**
 * Filter results by price range
 */
export function filterByPriceRange(
  results: SearchResult[],
  minPrice?: number,
  maxPrice?: number
): SearchResult[] {
  return results.filter(result => {
    const price = extractPrice(result)
    
    if (price === null) {
      // Include items without price if no filter is applied
      return minPrice === undefined && maxPrice === undefined
    }

    if (minPrice !== undefined && price < minPrice) return false
    if (maxPrice !== undefined && price > maxPrice) return false
    
    return true
  })
}

/**
 * Extract price from result (day_rate or attributes.rate)
 */
function extractPrice(result: SearchResult): number | null {
  // First check provider day_rate
  if (result.provider?.day_rate !== undefined && result.provider.day_rate !== null) {
    return result.provider.day_rate
  }

  // Then check attributes for various price fields
  const priceFields = ['rate', 'price', 'day_rate', 'hourly_rate', 'cost', 'cost_value']
  
  if (result.attributes) {
    for (const field of priceFields) {
      const value = result.attributes[field]
      if (typeof value === 'number') {
        return value
      }
      if (typeof value === 'string') {
        // Try to extract number from string like "£500/day" or "$100"
        const match = value.match(/[\d,]+\.?\d*/)
        if (match) {
          return parseFloat(match[0].replace(/,/g, ''))
        }
      }
    }
  }

  return null
}

// ==========================================
// RATING FILTER
// ==========================================

/**
 * Filter results by minimum rating
 */
export function filterByRating(
  results: SearchResult[],
  minRating: number
): SearchResult[] {
  return results.filter(result => {
    // Include unrated providers if they're new
    if (!result.provider?.rating) {
      return minRating <= 0
    }
    return result.provider.rating >= minRating
  })
}

// ==========================================
// LOCATION FILTER
// ==========================================

/**
 * Filter results by location
 * Supports partial matching and common location aliases
 */
export function filterByLocation(
  results: SearchResult[],
  location: string
): SearchResult[] {
  const normalizedLocation = normalizeLocation(location)
  
  return results.filter(result => {
    const resultLocation = extractLocation(result)
    if (!resultLocation) return false
    
    const normalizedResultLocation = normalizeLocation(resultLocation)
    
    // Check for exact match first
    if (normalizedResultLocation === normalizedLocation) return true
    
    // Check for partial match
    if (normalizedResultLocation.includes(normalizedLocation)) return true
    if (normalizedLocation.includes(normalizedResultLocation)) return true
    
    // Check for common aliases
    const locationAliases = getLocationAliases(normalizedLocation)
    return locationAliases.some(alias => 
      normalizedResultLocation.includes(alias) || alias.includes(normalizedResultLocation)
    )
  })
}

/**
 * Extract location from result attributes
 */
function extractLocation(result: SearchResult): string | null {
  if (!result.attributes) return null
  
  const locationFields = ['location', 'city', 'region', 'country', 'address']
  
  for (const field of locationFields) {
    const value = result.attributes[field]
    if (typeof value === 'string' && value.trim()) {
      return value
    }
  }
  
  return null
}

/**
 * Normalize location string for comparison
 */
function normalizeLocation(location: string): string {
  return location
    .toLowerCase()
    .trim()
    .replace(/[,.\-_]/g, ' ')
    .replace(/\s+/g, ' ')
}

/**
 * Get common aliases for a location
 */
function getLocationAliases(location: string): string[] {
  const aliases: Record<string, string[]> = {
    'uk': ['united kingdom', 'britain', 'england', 'scotland', 'wales'],
    'united kingdom': ['uk', 'britain', 'england'],
    'usa': ['united states', 'america', 'us'],
    'united states': ['usa', 'america', 'us'],
    'london': ['uk', 'united kingdom', 'england'],
    'new york': ['ny', 'nyc', 'usa'],
    'sf': ['san francisco', 'bay area'],
    'san francisco': ['sf', 'bay area'],
    'la': ['los angeles', 'california'],
    'los angeles': ['la', 'california'],
  }
  
  return aliases[location] || []
}

// ==========================================
// TIER FILTER
// ==========================================

/**
 * Filter results by provider tier (multiple allowed - OR logic)
 */
export function filterByTier(
  results: SearchResult[],
  tiers: ProviderTier[]
): SearchResult[] {
  return results.filter(result => {
    // If no provider, check if we should include based on context
    if (!result.provider) {
      // Include listings without provider only if 'standard' or no tier filter
      return tiers.includes('standard') || tiers.length === 0
    }
    return tiers.includes(result.provider.tier)
  })
}

// ==========================================
// AVAILABILITY FILTER
// ==========================================

/**
 * Filter results by date availability
 * This is a placeholder - actual implementation would query availability_slots
 */
export function filterByAvailability(
  results: SearchResult[],
  fromDate?: string,
  toDate?: string
): SearchResult[] {
  // For now, return all results
  // In production, this would filter based on availability_slots table
  if (!fromDate && !toDate) return results
  
  // Note: Full implementation requires querying availability_slots table
  // and checking for available slots within the date range
  return results.filter(result => {
    if (!result.provider_id) return true // Include non-provider listings
    
    // This is a stub - actual implementation would check availability_slots
    // For now, assume all providers are available
    return true
  })
}

// ==========================================
// SKILLS FILTER
// ==========================================

/**
 * Filter results by required skills (AND logic - all skills must match)
 */
export function filterBySkills(
  results: SearchResult[],
  requiredSkills: string[],
  matchAll: boolean = false
): SearchResult[] {
  const normalizedRequired = requiredSkills.map(s => s.toLowerCase())
  
  return results.filter(result => {
    const resultSkills = extractSkills(result)
    const normalizedResultSkills = resultSkills.map(s => s.toLowerCase())
    
    if (matchAll) {
      // All required skills must be present
      return normalizedRequired.every(skill =>
        normalizedResultSkills.some(rs => rs.includes(skill) || skill.includes(rs))
      )
    } else {
      // At least one skill must match (OR logic)
      return normalizedRequired.some(skill =>
        normalizedResultSkills.some(rs => rs.includes(skill) || skill.includes(rs))
      )
    }
  })
}

/**
 * Extract skills from result attributes
 */
function extractSkills(result: SearchResult): string[] {
  if (!result.attributes) return []
  
  const skillFields = ['skills', 'expertise', 'capabilities', 'specializations']
  const skills: string[] = []
  
  for (const field of skillFields) {
    const value = result.attributes[field]
    if (Array.isArray(value)) {
      skills.push(...value.filter(v => typeof v === 'string'))
    }
  }
  
  return skills
}

// ==========================================
// CERTIFICATIONS FILTER
// ==========================================

/**
 * Filter results by certifications
 */
export function filterByCertifications(
  results: SearchResult[],
  requiredCertifications: string[]
): SearchResult[] {
  const normalizedRequired = requiredCertifications.map(c => c.toLowerCase())
  
  return results.filter(result => {
    const resultCerts = extractCertifications(result)
    const normalizedResultCerts = resultCerts.map(c => c.toLowerCase())
    
    // At least one certification must match
    return normalizedRequired.some(cert =>
      normalizedResultCerts.some(rc => rc.includes(cert) || cert.includes(rc))
    )
  })
}

/**
 * Extract certifications from result attributes
 */
function extractCertifications(result: SearchResult): string[] {
  if (!result.attributes) return []
  
  const certFields = ['certifications', 'certificates', 'accreditations', 'qualifications']
  const certs: string[] = []
  
  for (const field of certFields) {
    const value = result.attributes[field]
    if (Array.isArray(value)) {
      certs.push(...value.filter(v => typeof v === 'string'))
    }
  }
  
  return certs
}

// ==========================================
// VERIFIED FILTER
// ==========================================

/**
 * Filter to show only verified listings
 */
export function filterByVerified(results: SearchResult[], verifiedOnly: boolean): SearchResult[] {
  if (!verifiedOnly) return results
  return results.filter(result => result.is_verified)
}

// ==========================================
// FACET CALCULATION
// ==========================================

/**
 * Calculate facet counts for a set of results
 * Used to show filter options with counts
 */
export function calculateFacets(results: SearchResult[]): SearchFacets {
  const facets: SearchFacets = {
    categories: {
      People: 0,
      Products: 0,
      Services: 0,
      AI: 0,
    },
    subcategories: {},
    tiers: {
      pending: 0,
      standard: 0,
      verified: 0,
      premium: 0,
    },
    priceRanges: {
      "0-50": 0,
      "50-100": 0,
      "100-250": 0,
      "250-500": 0,
      "500+": 0,
    },
    ratings: {},
    locations: {},
  }

  for (const result of results) {
    // Category counts
    if (result.category in facets.categories) {
      facets.categories[result.category]++
    }

    // Subcategory counts
    const subcategory = result.subcategory
    facets.subcategories[subcategory] = (facets.subcategories[subcategory] || 0) + 1

    // Tier counts
    const tier = result.provider?.tier || 'standard'
    facets.tiers[tier]++

    // Price range counts
    const price = extractPrice(result)
    if (price !== null) {
      if (price < 50) facets.priceRanges["0-50"]++
      else if (price < 100) facets.priceRanges["50-100"]++
      else if (price < 250) facets.priceRanges["100-250"]++
      else if (price < 500) facets.priceRanges["250-500"]++
      else facets.priceRanges["500+"]++
    }

    // Rating counts (grouped by whole number)
    const rating = result.provider?.rating
    if (rating !== null && rating !== undefined) {
      const ratingKey = `${Math.floor(rating)}+`
      facets.ratings[ratingKey] = (facets.ratings[ratingKey] || 0) + 1
    }

    // Location counts
    const location = extractLocation(result)
    if (location) {
      facets.locations[location] = (facets.locations[location] || 0) + 1
    }
  }

  return facets
}

// ==========================================
// FILTER UTILITIES
// ==========================================

/**
 * Check if any filters are applied
 */
export function hasActiveFilters(filters: AppliedFilters): boolean {
  return !!(
    filters.query ||
    filters.category ||
    (filters.subcategories && filters.subcategories.length > 0) ||
    filters.priceRange?.min !== undefined ||
    filters.priceRange?.max !== undefined ||
    filters.minRating !== undefined ||
    filters.location ||
    (filters.tiers && filters.tiers.length > 0) ||
    filters.dateRange?.from ||
    filters.dateRange?.to ||
    (filters.skills && filters.skills.length > 0) ||
    (filters.certifications && filters.certifications.length > 0)
  )
}

/**
 * Get a human-readable summary of active filters
 */
export function getFilterSummary(filters: AppliedFilters): string[] {
  const summary: string[] = []

  if (filters.query) {
    summary.push(`Search: "${filters.query}"`)
  }
  if (filters.category) {
    summary.push(`Category: ${filters.category}`)
  }
  if (filters.subcategories?.length) {
    summary.push(`Types: ${filters.subcategories.join(', ')}`)
  }
  if (filters.priceRange?.min !== undefined || filters.priceRange?.max !== undefined) {
    const min = filters.priceRange?.min ?? 0
    const max = filters.priceRange?.max ?? '∞'
    summary.push(`Price: £${min} - £${max}`)
  }
  if (filters.minRating !== undefined) {
    summary.push(`Rating: ${filters.minRating}+ stars`)
  }
  if (filters.location) {
    summary.push(`Location: ${filters.location}`)
  }
  if (filters.tiers?.length) {
    summary.push(`Tier: ${filters.tiers.join(', ')}`)
  }
  if (filters.dateRange?.from || filters.dateRange?.to) {
    const from = filters.dateRange?.from ?? 'any'
    const to = filters.dateRange?.to ?? 'any'
    summary.push(`Available: ${from} to ${to}`)
  }
  if (filters.skills?.length) {
    summary.push(`Skills: ${filters.skills.join(', ')}`)
  }
  if (filters.certifications?.length) {
    summary.push(`Certifications: ${filters.certifications.join(', ')}`)
  }

  return summary
}

/**
 * Merge two filter objects, with new values taking precedence
 */
export function mergeFilters(
  existing: AppliedFilters,
  updates: Partial<AppliedFilters>
): AppliedFilters {
  return {
    ...existing,
    ...updates,
    priceRange: updates.priceRange !== undefined
      ? updates.priceRange
      : existing.priceRange,
    dateRange: updates.dateRange !== undefined
      ? updates.dateRange
      : existing.dateRange,
  }
}

/**
 * Create a clean filters object (remove undefined/empty values)
 */
export function cleanFilters(filters: AppliedFilters): AppliedFilters {
  const clean: AppliedFilters = {}

  if (filters.query?.trim()) clean.query = filters.query.trim()
  if (filters.category) clean.category = filters.category
  if (filters.subcategories?.length) clean.subcategories = filters.subcategories
  if (filters.priceRange?.min !== undefined || filters.priceRange?.max !== undefined) {
    clean.priceRange = filters.priceRange
  }
  if (filters.minRating !== undefined) clean.minRating = filters.minRating
  if (filters.location?.trim()) clean.location = filters.location.trim()
  if (filters.tiers?.length) clean.tiers = filters.tiers
  if (filters.dateRange?.from || filters.dateRange?.to) {
    clean.dateRange = filters.dateRange
  }
  if (filters.skills?.length) clean.skills = filters.skills
  if (filters.certifications?.length) clean.certifications = filters.certifications

  return clean
}
