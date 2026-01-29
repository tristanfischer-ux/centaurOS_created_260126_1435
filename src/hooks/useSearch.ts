"use client"

import { useState, useCallback, useEffect, useRef, useMemo } from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import {
  SearchParams,
  SearchResult,
  SearchResponse,
  AppliedFilters,
  SearchSuggestion,
  RecentSearch,
  SavedSearch,
  SortOption,
  MarketplaceCategory,
  ProviderTier,
  searchParamsToURL,
  urlToSearchParams,
} from "@/types/search"
import {
  searchProviders,
  getSearchFilters,
  getSavedSearches,
  getRecentSearches,
  saveSearchQuery,
  deleteSavedSearch,
  getAutocomplete,
} from "@/actions/search"

// ==========================================
// HOOK OPTIONS
// ==========================================

interface UseSearchOptions {
  /** Initial category filter */
  initialCategory?: MarketplaceCategory
  /** Number of results per page */
  pageSize?: number
  /** Debounce delay for search in ms */
  debounceMs?: number
  /** Whether to sync filters with URL */
  syncWithURL?: boolean
  /** Whether to load initial data */
  autoLoad?: boolean
}

// ==========================================
// HOOK STATE
// ==========================================

interface SearchState {
  query: string
  filters: AppliedFilters
  results: SearchResult[]
  total: number
  page: number
  hasMore: boolean
  isLoading: boolean
  isLoadingMore: boolean
  error: string | null
  suggestions: SearchSuggestion[]
  recentSearches: RecentSearch[]
  savedSearches: SavedSearch[]
  facets: SearchResponse["facets"] | null
}

// ==========================================
// MAIN HOOK
// ==========================================

export function useSearch(options: UseSearchOptions = {}) {
  const {
    initialCategory,
    pageSize = 20,
    debounceMs = 300,
    syncWithURL = true,
    autoLoad = true,
  } = options

  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Parse initial state from URL if syncing
  const initialState = useMemo(() => {
    if (syncWithURL && searchParams) {
      const urlParams = urlToSearchParams(searchParams)
      return {
        query: urlParams.query || "",
        filters: {
          query: urlParams.query,
          category: urlParams.category || initialCategory,
          subcategories: urlParams.subcategories,
          priceRange: urlParams.minPrice !== undefined || urlParams.maxPrice !== undefined
            ? { min: urlParams.minPrice, max: urlParams.maxPrice }
            : undefined,
          minRating: urlParams.minRating,
          location: urlParams.location,
          tiers: urlParams.tiers,
        } as AppliedFilters,
        page: urlParams.page || 1,
      }
    }
    return {
      query: "",
      filters: { category: initialCategory } as AppliedFilters,
      page: 1,
    }
  }, [searchParams, syncWithURL, initialCategory])

  // State
  const [state, setState] = useState<SearchState>({
    query: initialState.query,
    filters: initialState.filters,
    results: [],
    total: 0,
    page: initialState.page,
    hasMore: false,
    isLoading: false,
    isLoadingMore: false,
    error: null,
    suggestions: [],
    recentSearches: [],
    savedSearches: [],
    facets: null,
  })

  const [sortBy, setSortBy] = useState<SortOption>("relevance")
  const [showSuggestions, setShowSuggestions] = useState(false)

  // Refs for debouncing
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const suggestionsTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // ==========================================
  // URL SYNC
  // ==========================================

  const updateURL = useCallback((params: SearchParams) => {
    if (!syncWithURL) return

    const urlParams = searchParamsToURL(params)
    const newURL = `${pathname}?${urlParams.toString()}`
    
    // Only update if URL actually changed
    const currentURL = `${pathname}?${searchParams?.toString() || ""}`
    if (newURL !== currentURL) {
      router.push(newURL, { scroll: false })
    }
  }, [syncWithURL, pathname, searchParams, router])

  // ==========================================
  // SEARCH EXECUTION
  // ==========================================

  const executeSearch = useCallback(async (params: SearchParams, append: boolean = false) => {
    setState(prev => ({
      ...prev,
      isLoading: !append,
      isLoadingMore: append,
      error: null,
    }))

    try {
      const response = await searchProviders({
        ...params,
        limit: pageSize,
        sortBy,
      })

      setState(prev => ({
        ...prev,
        results: append ? [...prev.results, ...response.results] : response.results,
        total: response.total,
        page: params.page || 1,
        hasMore: response.hasMore,
        isLoading: false,
        isLoadingMore: false,
        facets: response.facets,
        suggestions: response.suggestions || [],
      }))

      // Update URL
      updateURL(params)

      return response
    } catch (err) {
      console.error("Search error:", err)
      setState(prev => ({
        ...prev,
        isLoading: false,
        isLoadingMore: false,
        error: "Search failed. Please try again.",
      }))
      return null
    }
  }, [pageSize, sortBy, updateURL])

  // Debounced search
  const search = useCallback((query?: string) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    const searchQuery = query !== undefined ? query : state.query

    searchTimeoutRef.current = setTimeout(() => {
      const params: SearchParams = {
        query: searchQuery || undefined,
        category: state.filters.category,
        subcategories: state.filters.subcategories,
        minPrice: state.filters.priceRange?.min,
        maxPrice: state.filters.priceRange?.max,
        minRating: state.filters.minRating,
        location: state.filters.location,
        tiers: state.filters.tiers,
        skills: state.filters.skills,
        certifications: state.filters.certifications,
        page: 1,
      }
      executeSearch(params)
    }, debounceMs)
  }, [state.query, state.filters, debounceMs, executeSearch])

  // ==========================================
  // QUERY MANAGEMENT
  // ==========================================

  const setQuery = useCallback((query: string) => {
    setState(prev => ({
      ...prev,
      query,
      filters: { ...prev.filters, query },
    }))
    search(query)
  }, [search])

  const clearQuery = useCallback(() => {
    setState(prev => ({
      ...prev,
      query: "",
      filters: { ...prev.filters, query: undefined },
    }))
    search("")
  }, [search])

  // ==========================================
  // FILTER MANAGEMENT
  // ==========================================

  const setFilter = useCallback(<K extends keyof AppliedFilters>(
    key: K,
    value: AppliedFilters[K]
  ) => {
    setState(prev => ({
      ...prev,
      filters: { ...prev.filters, [key]: value },
    }))
  }, [])

  const clearFilter = useCallback((key: keyof AppliedFilters) => {
    setState(prev => {
      const newFilters = { ...prev.filters }
      delete newFilters[key]
      return { ...prev, filters: newFilters }
    })
  }, [])

  const clearAllFilters = useCallback(() => {
    setState(prev => ({
      ...prev,
      query: "",
      filters: { category: prev.filters.category }, // Keep category
    }))
    search("")
  }, [search])

  const applyFilters = useCallback(() => {
    search()
  }, [search])

  // Convenience filter setters
  const setCategory = useCallback((category: MarketplaceCategory | undefined) => {
    setState(prev => ({
      ...prev,
      filters: { ...prev.filters, category },
    }))
    search()
  }, [search])

  const setSubcategories = useCallback((subcategories: string[]) => {
    setFilter("subcategories", subcategories.length > 0 ? subcategories : undefined)
  }, [setFilter])

  const setPriceRange = useCallback((min?: number, max?: number) => {
    setFilter("priceRange", min !== undefined || max !== undefined ? { min, max } : undefined)
  }, [setFilter])

  const setRating = useCallback((minRating?: number) => {
    setFilter("minRating", minRating)
  }, [setFilter])

  const setLocation = useCallback((location?: string) => {
    setFilter("location", location || undefined)
  }, [setFilter])

  const setTiers = useCallback((tiers: ProviderTier[]) => {
    setFilter("tiers", tiers.length > 0 ? tiers : undefined)
  }, [setFilter])

  const setSkills = useCallback((skills: string[]) => {
    setFilter("skills", skills.length > 0 ? skills : undefined)
  }, [setFilter])

  // ==========================================
  // PAGINATION
  // ==========================================

  const setPage = useCallback((page: number) => {
    const params: SearchParams = {
      query: state.query || undefined,
      category: state.filters.category,
      subcategories: state.filters.subcategories,
      minPrice: state.filters.priceRange?.min,
      maxPrice: state.filters.priceRange?.max,
      minRating: state.filters.minRating,
      location: state.filters.location,
      tiers: state.filters.tiers,
      skills: state.filters.skills,
      certifications: state.filters.certifications,
      page,
    }
    executeSearch(params)
  }, [state.query, state.filters, executeSearch])

  const loadMore = useCallback(() => {
    if (state.isLoadingMore || !state.hasMore) return

    const params: SearchParams = {
      query: state.query || undefined,
      category: state.filters.category,
      subcategories: state.filters.subcategories,
      minPrice: state.filters.priceRange?.min,
      maxPrice: state.filters.priceRange?.max,
      minRating: state.filters.minRating,
      location: state.filters.location,
      tiers: state.filters.tiers,
      skills: state.filters.skills,
      certifications: state.filters.certifications,
      page: state.page + 1,
    }
    executeSearch(params, true)
  }, [state, executeSearch])

  // ==========================================
  // SORTING
  // ==========================================

  const setSort = useCallback((sort: SortOption) => {
    setSortBy(sort)
    // Re-execute search with new sort
    const params: SearchParams = {
      query: state.query || undefined,
      category: state.filters.category,
      subcategories: state.filters.subcategories,
      minPrice: state.filters.priceRange?.min,
      maxPrice: state.filters.priceRange?.max,
      minRating: state.filters.minRating,
      location: state.filters.location,
      tiers: state.filters.tiers,
      skills: state.filters.skills,
      certifications: state.filters.certifications,
      sortBy: sort,
      page: 1,
    }
    executeSearch(params)
  }, [state.query, state.filters, executeSearch])

  // ==========================================
  // SUGGESTIONS
  // ==========================================

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 2) {
      setState(prev => ({ ...prev, suggestions: [] }))
      return
    }

    if (suggestionsTimeoutRef.current) {
      clearTimeout(suggestionsTimeoutRef.current)
    }

    suggestionsTimeoutRef.current = setTimeout(async () => {
      const { suggestions } = await getAutocomplete(query, state.filters.category)
      setState(prev => ({
        ...prev,
        suggestions: suggestions.map(s => ({
          ...s,
          category: s.category as MarketplaceCategory | undefined,
        })) as SearchSuggestion[],
      }))
    }, 150)
  }, [state.filters.category])

  // ==========================================
  // SAVED SEARCHES
  // ==========================================

  const loadSavedSearches = useCallback(async () => {
    const [savedResult, recentResult] = await Promise.all([
      getSavedSearches(),
      getRecentSearches(),
    ])

    setState(prev => ({
      ...prev,
      savedSearches: savedResult.searches,
      recentSearches: recentResult.searches,
    }))
  }, [])

  const saveCurrentSearch = useCallback(async (name: string) => {
    if (!state.query && Object.keys(state.filters).length <= 1) {
      return { success: false, error: "Nothing to save" }
    }

    const result = await saveSearchQuery(name, state.query, state.filters)
    
    if (result.success) {
      loadSavedSearches()
    }

    return result
  }, [state.query, state.filters, loadSavedSearches])

  const deleteSaved = useCallback(async (searchId: string) => {
    const result = await deleteSavedSearch(searchId)
    
    if (result.success) {
      loadSavedSearches()
    }

    return result
  }, [loadSavedSearches])

  const runSavedSearch = useCallback((savedSearch: SavedSearch) => {
    setState(prev => ({
      ...prev,
      query: savedSearch.query || "",
      filters: savedSearch.filters,
    }))
    search(savedSearch.query || "")
  }, [search])

  const runRecentSearch = useCallback((recentSearch: RecentSearch) => {
    setState(prev => ({
      ...prev,
      query: recentSearch.query,
      filters: recentSearch.filters,
    }))
    search(recentSearch.query)
  }, [search])

  // ==========================================
  // EFFECTS
  // ==========================================

  // Load initial data on mount
  useEffect(() => {
    if (!autoLoad) return
    
    // Use a flag to prevent running on every render
    let mounted = true
    
    const loadInitialData = async () => {
      if (!mounted) return
      
      // Load search results
      await executeSearch({
        query: initialState.query || undefined,
        category: initialState.filters.category,
        page: initialState.page,
      })
      
      // Load saved searches
      if (mounted) {
        await loadSavedSearches()
      }
    }
    
    loadInitialData()
    
    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run once on mount

  // Cleanup timeouts
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
      if (suggestionsTimeoutRef.current) {
        clearTimeout(suggestionsTimeoutRef.current)
      }
    }
  }, [])

  // ==========================================
  // COMPUTED VALUES
  // ==========================================

  const hasActiveFilters = useMemo(() => {
    const { query: filterQuery, category: _category, ...otherFilters } = state.filters
    return !!(
      filterQuery ||
      Object.values(otherFilters).some(v => 
        v !== undefined && 
        (Array.isArray(v) ? v.length > 0 : true)
      )
    )
  }, [state.filters])

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (state.filters.query) count++
    if (state.filters.subcategories?.length) count++
    if (state.filters.priceRange?.min !== undefined || state.filters.priceRange?.max !== undefined) count++
    if (state.filters.minRating !== undefined) count++
    if (state.filters.location) count++
    if (state.filters.tiers?.length) count++
    if (state.filters.skills?.length) count++
    if (state.filters.certifications?.length) count++
    return count
  }, [state.filters])

  // ==========================================
  // RETURN
  // ==========================================

  return {
    // State
    query: state.query,
    filters: state.filters,
    results: state.results,
    total: state.total,
    page: state.page,
    hasMore: state.hasMore,
    isLoading: state.isLoading,
    isLoadingMore: state.isLoadingMore,
    error: state.error,
    suggestions: state.suggestions,
    recentSearches: state.recentSearches,
    savedSearches: state.savedSearches,
    facets: state.facets,
    sortBy,
    showSuggestions,
    hasActiveFilters,
    activeFilterCount,

    // Query actions
    setQuery,
    clearQuery,
    search,

    // Filter actions
    setFilter,
    clearFilter,
    clearAllFilters,
    applyFilters,
    setCategory,
    setSubcategories,
    setPriceRange,
    setRating,
    setLocation,
    setTiers,
    setSkills,

    // Pagination
    setPage,
    loadMore,

    // Sorting
    setSort,

    // Suggestions
    fetchSuggestions,
    setShowSuggestions,

    // Saved searches
    saveCurrentSearch,
    deleteSaved,
    runSavedSearch,
    runRecentSearch,
    loadSavedSearches,
  }
}

// ==========================================
// SIMPLIFIED HOOKS
// ==========================================

/**
 * Simple search hook for basic use cases
 */
export function useSimpleSearch(category?: MarketplaceCategory) {
  const {
    query,
    setQuery,
    results,
    isLoading,
    search,
  } = useSearch({
    initialCategory: category,
    syncWithURL: false,
  })

  return {
    query,
    setQuery,
    results,
    isLoading,
    search,
  }
}

/**
 * Hook for just getting filter options
 */
export function useSearchFilters(filterCategory?: MarketplaceCategory) {
  const [filters, setFilters] = useState<Awaited<ReturnType<typeof getSearchFilters>>["filters"] | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    
    const loadFilters = async () => {
      if (!mounted) return
      const { filters: loadedFilters } = await getSearchFilters(filterCategory)
      if (mounted) {
        setFilters(loadedFilters)
        setIsLoading(false)
      }
    }
    
    setIsLoading(true)
    loadFilters()
    
    return () => {
      mounted = false
    }
  }, [filterCategory])

  return { filters, isLoading }
}
