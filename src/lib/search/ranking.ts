/**
 * Search Ranking Algorithm for Marketplace
 * 
 * Scoring Weights:
 * - Relevance (text match): 30%
 * - Provider Tier: 20%
 * - Rating: 15%
 * - Response Rate: 15%
 * - Completion Rate: 10%
 * - Centaur Discount: 5%
 * - Recency: 5%
 */

import {
  SearchScores,
  SCORE_WEIGHTS,
  TIER_SCORES,
  ProviderTier,
  SearchResult,
} from "@/types/search"

// ==========================================
// RELEVANCE SCORE (30%)
// ==========================================

interface ListingData {
  title: string
  description: string | null
  subcategory: string
  attributes: Record<string, unknown> | null
}

/**
 * Calculate text relevance score using multiple matching strategies
 * Returns a score between 0 and 1
 */
export function calculateRelevanceScore(listing: ListingData, query: string): number {
  if (!query || query.trim().length === 0) {
    return 0.5 // Neutral score when no query
  }

  const normalizedQuery = query.toLowerCase().trim()
  const queryTerms = normalizedQuery.split(/\s+/).filter(t => t.length > 1)
  
  let score = 0
  let maxPossibleScore = 0

  // Title exact match (highest priority)
  const normalizedTitle = listing.title.toLowerCase()
  if (normalizedTitle === normalizedQuery) {
    score += 100
  } else if (normalizedTitle.includes(normalizedQuery)) {
    score += 80
  }
  maxPossibleScore += 100

  // Title term matches
  const titleTermMatches = queryTerms.filter(term => normalizedTitle.includes(term)).length
  score += (titleTermMatches / Math.max(queryTerms.length, 1)) * 60
  maxPossibleScore += 60

  // Description match
  if (listing.description) {
    const normalizedDesc = listing.description.toLowerCase()
    if (normalizedDesc.includes(normalizedQuery)) {
      score += 40
    }
    const descTermMatches = queryTerms.filter(term => normalizedDesc.includes(term)).length
    score += (descTermMatches / Math.max(queryTerms.length, 1)) * 30
  }
  maxPossibleScore += 70

  // Subcategory match
  if (listing.subcategory.toLowerCase().includes(normalizedQuery)) {
    score += 50
  }
  maxPossibleScore += 50

  // Attributes match (skills, expertise, capabilities, etc.)
  if (listing.attributes) {
    const attrScore = calculateAttributesScore(listing.attributes, queryTerms)
    score += attrScore * 50
    maxPossibleScore += 50
  }

  // Word boundary bonus (matches at word boundaries are more relevant)
  const wordBoundaryRegex = new RegExp(`\\b${escapeRegex(normalizedQuery)}\\b`, 'i')
  if (wordBoundaryRegex.test(listing.title)) {
    score += 20
  }
  maxPossibleScore += 20

  // Normalize to 0-1 range
  return Math.min(score / maxPossibleScore, 1)
}

/**
 * Calculate score for attributes (skills, tags, etc.)
 */
function calculateAttributesScore(
  attributes: Record<string, unknown>,
  queryTerms: string[]
): number {
  if (queryTerms.length === 0) return 0

  let matchCount = 0
  const totalTerms = queryTerms.length

  const searchableFields = [
    'skills', 'expertise', 'capabilities', 'tags', 
    'specializations', 'industries', 'technologies'
  ]

  for (const field of searchableFields) {
    const value = attributes[field]
    if (Array.isArray(value)) {
      const normalizedValues = value.map(v => 
        typeof v === 'string' ? v.toLowerCase() : ''
      )
      for (const term of queryTerms) {
        if (normalizedValues.some(v => v.includes(term))) {
          matchCount++
        }
      }
    }
  }

  // Also check string attributes
  for (const [, value] of Object.entries(attributes)) {
    if (typeof value === 'string') {
      const normalizedValue = value.toLowerCase()
      for (const term of queryTerms) {
        if (normalizedValue.includes(term)) {
          matchCount += 0.5 // Lower weight for non-array fields
        }
      }
    }
  }

  return Math.min(matchCount / totalTerms, 1)
}

// ==========================================
// TIER SCORE (20%)
// ==========================================

/**
 * Calculate tier score based on provider tier
 * Premium providers get highest scores
 */
export function calculateTierScore(tier: ProviderTier | null | undefined): number {
  if (!tier) return 0
  return TIER_SCORES[tier] ?? 0
}

// ==========================================
// RATING SCORE (15%)
// ==========================================

interface ProviderRating {
  avgRating: number | null
  totalReviews: number
}

/**
 * Calculate rating score using Wilson score interval
 * This prevents new providers with perfect 5-star ratings from dominating
 */
export function calculateRatingScore(provider: ProviderRating | null): number {
  if (!provider || provider.avgRating === null || provider.totalReviews === 0) {
    return 0.5 // Neutral score for unrated providers
  }

  const { avgRating, totalReviews } = provider
  
  // Normalize rating to 0-1 (assuming 5-star scale)
  const normalizedRating = avgRating / 5

  // Apply Wilson lower bound for confidence
  // This penalizes providers with few reviews
  const z = 1.96 // 95% confidence
  const n = totalReviews
  const p = normalizedRating

  // Wilson score lower bound formula
  const wilsonScore = (p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)) /
    (1 + (z * z) / n)

  // Weight more heavily towards providers with more reviews
  const reviewBonus = Math.min(Math.log10(totalReviews + 1) / 3, 0.2)

  return Math.min(wilsonScore + reviewBonus, 1)
}

// ==========================================
// RESPONSE RATE SCORE (15%)
// ==========================================

/**
 * Calculate response rate score
 * Providers who respond quickly and consistently get higher scores
 */
export function calculateResponseScore(
  responseRate: number | null | undefined,
  avgResponseTimeHours: number | null | undefined
): number {
  if (responseRate === null || responseRate === undefined) {
    return 0.5 // Neutral for new providers
  }

  let score = 0

  // Response rate component (0-70% of score)
  // responseRate is assumed to be 0-100
  score += (responseRate / 100) * 0.7

  // Response time bonus (0-30% of score)
  // Faster response times get bonus
  if (avgResponseTimeHours !== null && avgResponseTimeHours !== undefined) {
    if (avgResponseTimeHours <= 1) {
      score += 0.3 // Within 1 hour
    } else if (avgResponseTimeHours <= 4) {
      score += 0.25 // Within 4 hours
    } else if (avgResponseTimeHours <= 12) {
      score += 0.2 // Within 12 hours
    } else if (avgResponseTimeHours <= 24) {
      score += 0.15 // Within 24 hours
    } else if (avgResponseTimeHours <= 48) {
      score += 0.1 // Within 48 hours
    }
    // Beyond 48 hours gets no bonus
  }

  return Math.min(score, 1)
}

// ==========================================
// COMPLETION RATE SCORE (10%)
// ==========================================

/**
 * Calculate completion rate score
 * Providers who complete orders successfully get higher scores
 */
export function calculateCompletionScore(
  completionRate: number | null | undefined,
  totalOrders: number | undefined
): number {
  if (completionRate === null || completionRate === undefined) {
    return 0.5 // Neutral for new providers
  }

  // Base score from completion rate (0-100 scale)
  let score = completionRate / 100

  // Bonus for experience (more completed orders)
  if (totalOrders !== undefined && totalOrders > 0) {
    const experienceBonus = Math.min(Math.log10(totalOrders + 1) / 4, 0.15)
    score = Math.min(score + experienceBonus, 1)
  }

  // Penalty for very low completion rates
  if (completionRate < 80) {
    score *= 0.8 // 20% penalty for below 80% completion
  }
  if (completionRate < 60) {
    score *= 0.7 // Additional penalty for below 60%
  }

  return Math.max(score, 0)
}

// ==========================================
// CENTAUR DISCOUNT SCORE (5%)
// ==========================================

/**
 * Calculate discount score
 * Providers offering better Centaur discounts get higher scores
 */
export function calculateDiscountScore(discountPercent: number | null | undefined): number {
  if (discountPercent === null || discountPercent === undefined || discountPercent <= 0) {
    return 0
  }

  // Cap discount at 50% for scoring purposes
  const cappedDiscount = Math.min(discountPercent, 50)
  
  // Linear scale: 50% discount = 1.0 score
  return cappedDiscount / 50
}

// ==========================================
// RECENCY SCORE (5%)
// ==========================================

/**
 * Calculate recency score based on last activity
 * Active providers get higher scores
 */
export function calculateRecencyScore(lastActiveDate: string | null | undefined): number {
  if (!lastActiveDate) {
    return 0.3 // Low score for unknown activity
  }

  const lastActive = new Date(lastActiveDate)
  const now = new Date()
  const daysSinceActive = (now.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24)

  // Score decay based on days since last active
  if (daysSinceActive <= 1) return 1.0    // Active today
  if (daysSinceActive <= 3) return 0.9    // Active within 3 days
  if (daysSinceActive <= 7) return 0.8    // Active this week
  if (daysSinceActive <= 14) return 0.7   // Active within 2 weeks
  if (daysSinceActive <= 30) return 0.5   // Active this month
  if (daysSinceActive <= 60) return 0.3   // Active within 2 months
  if (daysSinceActive <= 90) return 0.2   // Active within 3 months
  return 0.1                               // Inactive for 3+ months
}

// ==========================================
// COMBINED SCORING
// ==========================================

/**
 * Combine all individual scores using weighted formula
 */
export function combineScores(scores: SearchScores): number {
  return (
    scores.relevance * SCORE_WEIGHTS.relevance +
    scores.tier * SCORE_WEIGHTS.tier +
    scores.rating * SCORE_WEIGHTS.rating +
    scores.responseRate * SCORE_WEIGHTS.responseRate +
    scores.completionRate * SCORE_WEIGHTS.completionRate +
    scores.discount * SCORE_WEIGHTS.discount +
    scores.recency * SCORE_WEIGHTS.recency
  )
}

/**
 * Calculate all scores for a listing/provider combination
 */
export interface ScoringInput {
  listing: ListingData
  query: string
  provider?: {
    tier?: ProviderTier | null
    avgRating?: number | null
    totalReviews?: number
    responseRate?: number | null
    avgResponseTimeHours?: number | null
    completionRate?: number | null
    totalOrders?: number
    centaurDiscount?: number | null
    lastActive?: string | null
  }
}

export function calculateAllScores(input: ScoringInput): {
  scores: SearchScores
  totalScore: number
} {
  const scores: SearchScores = {
    relevance: calculateRelevanceScore(input.listing, input.query),
    tier: calculateTierScore(input.provider?.tier),
    rating: calculateRatingScore(
      input.provider?.avgRating !== undefined && input.provider?.totalReviews !== undefined
        ? { avgRating: input.provider.avgRating, totalReviews: input.provider.totalReviews }
        : null
    ),
    responseRate: calculateResponseScore(
      input.provider?.responseRate,
      input.provider?.avgResponseTimeHours
    ),
    completionRate: calculateCompletionScore(
      input.provider?.completionRate,
      input.provider?.totalOrders
    ),
    discount: calculateDiscountScore(input.provider?.centaurDiscount),
    recency: calculateRecencyScore(input.provider?.lastActive),
  }

  return {
    scores,
    totalScore: combineScores(scores),
  }
}

/**
 * Sort search results by their total score
 */
export function sortByScore(results: SearchResult[]): SearchResult[] {
  return [...results].sort((a, b) => b.totalScore - a.totalScore)
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Boost score for exact phrase matches
 */
export function boostExactMatch(baseScore: number, text: string, query: string): number {
  const normalizedText = text.toLowerCase()
  const normalizedQuery = query.toLowerCase().trim()
  
  if (normalizedText === normalizedQuery) {
    return Math.min(baseScore * 1.5, 1) // 50% boost for exact match
  }
  
  if (normalizedText.startsWith(normalizedQuery)) {
    return Math.min(baseScore * 1.3, 1) // 30% boost for prefix match
  }
  
  return baseScore
}

/**
 * Calculate fuzzy match score for typo tolerance
 */
export function calculateFuzzyScore(text: string, query: string): number {
  const normalizedText = text.toLowerCase()
  const normalizedQuery = query.toLowerCase()
  
  // Simple Levenshtein-based fuzzy matching
  const distance = levenshteinDistance(normalizedText, normalizedQuery)
  const maxLength = Math.max(normalizedText.length, normalizedQuery.length)
  
  if (maxLength === 0) return 1
  
  const similarity = 1 - distance / maxLength
  
  // Only return positive scores for relatively close matches
  return similarity > 0.6 ? similarity : 0
}

function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length
  const n = str2.length
  
  // Create matrix
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0))
  
  // Initialize
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  
  // Fill matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1]
      } else {
        dp[i][j] = 1 + Math.min(
          dp[i - 1][j],     // deletion
          dp[i][j - 1],     // insertion
          dp[i - 1][j - 1]  // substitution
        )
      }
    }
  }
  
  return dp[m][n]
}
