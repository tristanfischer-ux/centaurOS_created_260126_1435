import { Database } from "./database.types"

// ==========================================
// SEARCH PARAMETERS
// ==========================================

export type MarketplaceCategory = Database["public"]["Enums"]["marketplace_category"]

export interface SearchParams {
  query?: string
  category?: MarketplaceCategory
  subcategories?: string[]
  minPrice?: number
  maxPrice?: number
  minRating?: number
  location?: string
  tiers?: ProviderTier[]
  availableFrom?: string
  availableTo?: string
  skills?: string[]
  certifications?: string[]
  sortBy?: SortOption
  sortOrder?: "asc" | "desc"
  page?: number
  limit?: number
  userId?: string // For personalization
}

// ==========================================
// SEARCH RESULTS
// ==========================================

export interface SearchResult {
  id: string
  listing_id: string
  provider_id: string | null
  title: string
  description: string | null
  category: MarketplaceCategory
  subcategory: string
  attributes: Record<string, unknown> | null
  image_url: string | null
  is_verified: boolean
  
  // Provider data (when applicable)
  provider?: {
    id: string
    tier: ProviderTier
    rating: number | null
    total_reviews: number
    response_rate: number | null
    completion_rate: number | null
    centaur_discount: number | null
    last_active: string | null
    day_rate: number | null
    currency: string
  }
  
  // Scoring breakdown
  scores: SearchScores
  totalScore: number
}

export interface SearchScores {
  relevance: number      // 30% - text match quality
  tier: number           // 20% - provider tier bonus
  rating: number         // 15% - average rating
  responseRate: number   // 15% - response rate to inquiries
  completionRate: number // 10% - order completion rate
  discount: number       // 5% - Centaur discount offered
  recency: number        // 5% - recent activity
}

export interface SearchResponse {
  results: SearchResult[]
  total: number
  page: number
  limit: number
  hasMore: boolean
  facets: SearchFacets
  query: string | null
  appliedFilters: AppliedFilters
  suggestions?: SearchSuggestion[]
}

// ==========================================
// FILTERS & FACETS
// ==========================================

export interface SearchFilters {
  categories: FilterOption[]
  subcategories: FilterOption[]
  tiers: FilterOption[]
  priceRanges: PriceRangeOption[]
  ratingOptions: FilterOption[]
  locations: FilterOption[]
  skills: FilterOption[]
  certifications: FilterOption[]
}

export interface FilterOption {
  value: string
  label: string
  count: number
}

export interface PriceRangeOption {
  min: number | null
  max: number | null
  label: string
  count: number
}

export interface AppliedFilters {
  query?: string
  category?: MarketplaceCategory
  subcategories?: string[]
  priceRange?: { min?: number; max?: number }
  minRating?: number
  location?: string
  tiers?: ProviderTier[]
  dateRange?: { from?: string; to?: string }
  skills?: string[]
  certifications?: string[]
}

export interface SearchFacets {
  categories: Record<MarketplaceCategory, number>
  subcategories: Record<string, number>
  tiers: Record<ProviderTier, number>
  priceRanges: {
    "0-50": number
    "50-100": number
    "100-250": number
    "250-500": number
    "500+": number
  }
  ratings: Record<string, number>
  locations: Record<string, number>
}

// ==========================================
// SORT OPTIONS
// ==========================================

export type SortOption = 
  | "relevance"
  | "rating_high"
  | "rating_low" 
  | "price_high"
  | "price_low"
  | "newest"
  | "most_reviews"
  | "response_time"
  | "completion_rate"

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "relevance", label: "Most Relevant" },
  { value: "rating_high", label: "Highest Rated" },
  { value: "rating_low", label: "Lowest Rated" },
  { value: "price_high", label: "Price: High to Low" },
  { value: "price_low", label: "Price: Low to High" },
  { value: "newest", label: "Newest First" },
  { value: "most_reviews", label: "Most Reviews" },
  { value: "response_time", label: "Fastest Response" },
  { value: "completion_rate", label: "Best Completion Rate" },
]

// ==========================================
// SUGGESTIONS & AUTOCOMPLETE
// ==========================================

export interface SearchSuggestion {
  id: string
  type: "query" | "category" | "provider" | "listing" | "recent" | "popular"
  text: string
  category?: MarketplaceCategory
  subcategory?: string
  count?: number
  metadata?: Record<string, unknown>
}

export interface RecentSearch {
  id: string
  user_id: string
  query: string
  filters: AppliedFilters
  results_count: number
  created_at: string
}

export interface SavedSearch {
  id: string
  user_id: string
  name: string
  query: string
  filters: AppliedFilters
  is_alert_enabled: boolean
  alert_frequency?: "daily" | "weekly" | "instant"
  last_alerted_at?: string
  created_at: string
  updated_at: string
}

export interface PopularSearch {
  query: string
  category?: MarketplaceCategory
  count: number
  trending: boolean
}

// ==========================================
// PROVIDER TIERS
// ==========================================

export type ProviderTier = "pending" | "standard" | "verified" | "premium"

export const TIER_LABELS: Record<ProviderTier, string> = {
  pending: "Pending",
  standard: "Standard",
  verified: "Verified",
  premium: "Premium",
}

export const TIER_COLORS: Record<ProviderTier, string> = {
  pending: "gray",
  standard: "blue",
  verified: "green",
  premium: "amber",
}

// ==========================================
// SCORING WEIGHTS
// ==========================================

export const SCORE_WEIGHTS = {
  relevance: 0.30,      // 30%
  tier: 0.20,           // 20%
  rating: 0.15,         // 15%
  responseRate: 0.15,   // 15%
  completionRate: 0.10, // 10%
  discount: 0.05,       // 5%
  recency: 0.05,        // 5%
} as const

export const TIER_SCORES: Record<ProviderTier, number> = {
  pending: 0,
  standard: 0.4,
  verified: 0.7,
  premium: 1.0,
}

// ==========================================
// SEARCH STATE (for hooks)
// ==========================================

export interface SearchState {
  query: string
  filters: AppliedFilters
  results: SearchResult[]
  total: number
  page: number
  limit: number
  isLoading: boolean
  error: string | null
  facets: SearchFacets | null
  suggestions: SearchSuggestion[]
  recentSearches: RecentSearch[]
  savedSearches: SavedSearch[]
}

export interface SearchActions {
  setQuery: (query: string) => void
  setFilter: <K extends keyof AppliedFilters>(key: K, value: AppliedFilters[K]) => void
  clearFilter: (key: keyof AppliedFilters) => void
  clearAllFilters: () => void
  setPage: (page: number) => void
  setSort: (sort: SortOption) => void
  search: () => Promise<void>
  loadMore: () => Promise<void>
  saveSearch: (name: string) => Promise<void>
  deleteSearch: (id: string) => Promise<void>
}

// ==========================================
// URL PARAMS
// ==========================================

export interface SearchURLParams {
  q?: string
  cat?: MarketplaceCategory
  sub?: string // comma-separated
  minPrice?: string
  maxPrice?: string
  rating?: string
  loc?: string
  tier?: string // comma-separated
  from?: string
  to?: string
  sort?: SortOption
  page?: string
}

export function searchParamsToURL(params: SearchParams): URLSearchParams {
  const urlParams = new URLSearchParams()
  
  if (params.query) urlParams.set("q", params.query)
  if (params.category) urlParams.set("cat", params.category)
  if (params.subcategories?.length) urlParams.set("sub", params.subcategories.join(","))
  if (params.minPrice !== undefined) urlParams.set("minPrice", String(params.minPrice))
  if (params.maxPrice !== undefined) urlParams.set("maxPrice", String(params.maxPrice))
  if (params.minRating !== undefined) urlParams.set("rating", String(params.minRating))
  if (params.location) urlParams.set("loc", params.location)
  if (params.tiers?.length) urlParams.set("tier", params.tiers.join(","))
  if (params.availableFrom) urlParams.set("from", params.availableFrom)
  if (params.availableTo) urlParams.set("to", params.availableTo)
  if (params.sortBy) urlParams.set("sort", params.sortBy)
  if (params.page && params.page > 1) urlParams.set("page", String(params.page))
  
  return urlParams
}

export function urlToSearchParams(urlParams: URLSearchParams): SearchParams {
  const params: SearchParams = {}
  
  const q = urlParams.get("q")
  if (q) params.query = q
  
  const cat = urlParams.get("cat") as MarketplaceCategory | null
  if (cat) params.category = cat
  
  const sub = urlParams.get("sub")
  if (sub) params.subcategories = sub.split(",")
  
  const minPrice = urlParams.get("minPrice")
  if (minPrice) params.minPrice = Number(minPrice)
  
  const maxPrice = urlParams.get("maxPrice")
  if (maxPrice) params.maxPrice = Number(maxPrice)
  
  const rating = urlParams.get("rating")
  if (rating) params.minRating = Number(rating)
  
  const loc = urlParams.get("loc")
  if (loc) params.location = loc
  
  const tier = urlParams.get("tier")
  if (tier) params.tiers = tier.split(",") as ProviderTier[]
  
  const from = urlParams.get("from")
  if (from) params.availableFrom = from
  
  const to = urlParams.get("to")
  if (to) params.availableTo = to
  
  const sort = urlParams.get("sort") as SortOption | null
  if (sort) params.sortBy = sort
  
  const page = urlParams.get("page")
  if (page) params.page = Number(page)
  
  return params
}
