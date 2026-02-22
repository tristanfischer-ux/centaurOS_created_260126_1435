'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import type { MarketplaceListing, MarketplaceSortOption } from '@/actions/marketplace'
import { searchMarketplaceListings } from '@/actions/marketplace'
import { MARKETPLACE_PAGE_SIZE } from '@/lib/marketplace-constants'
import { getTechniqueById } from '@/lib/manufacturing-techniques'
import type { ManufacturingTechnique } from '@/lib/manufacturing-techniques/types'

export type MarketplaceCategory = 'All' | 'People' | 'Products' | 'Services'
export type SortOption = 'relevance' | 'rating' | 'price_low' | 'price_high' | 'newest'

/** Map UI sort option to API sort option. */
function toApiSort(sort: SortOption): MarketplaceSortOption {
    switch (sort) {
        case 'price_low':
            return 'price_asc'
        case 'price_high':
            return 'price_desc'
        case 'rating':
            return 'rating'
        case 'newest':
            return 'newest'
        case 'relevance':
        default:
            return 'relevance'
    }
}

/** All known category definitions (People, Products, Services). */
export const ALL_CATEGORIES: { id: MarketplaceCategory; label: string; icon: string }[] = [
    { id: 'All', label: 'All', icon: 'LayoutGrid' },
    { id: 'People', label: 'People', icon: 'Users' },
    { id: 'Products', label: 'Products', icon: 'Package' },
    { id: 'Services', label: 'Services', icon: 'Wrench' },
]

/**
 * @deprecated Use ALL_CATEGORIES and derive visible categories via allowedCategories.
 */
export const CATEGORIES = ALL_CATEGORIES

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
    { value: 'relevance', label: 'Relevance' },
    { value: 'rating', label: 'Top Rated' },
    { value: 'price_low', label: 'Price: Low to High' },
    { value: 'price_high', label: 'Price: High to Low' },
    { value: 'newest', label: 'Newest' },
]

/** Content categories (excludes 'All' which is derived). */
export type ContentCategory = Exclude<MarketplaceCategory, 'All'>

interface UseMarketplaceStateProps {
    initialListings: MarketplaceListing[]
    initialTotalCount?: number
    initialHasMore?: boolean
    /** Server-side per-category totals from the initial search. */
    initialCategoryCounts?: Record<string, number>
    initialSavedIds?: string[]
    /**
     * Restrict which content categories are visible.
     * When omitted, all categories are shown (People, Products, Services).
     * When a single category is provided, the category pill row is hidden.
     * When 2+ categories are provided, an "All" pill is prepended.
     */
    allowedCategories?: ContentCategory[]
}

export function useMarketplaceState({
    initialListings,
    initialTotalCount = 0,
    initialHasMore = false,
    initialCategoryCounts,
    initialSavedIds = [],
    allowedCategories,
}: UseMarketplaceStateProps) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const allowedCategoriesKey = allowedCategories ? allowedCategories.join(',') : ''
    const stableAllowedCategories = useMemo(
        () => allowedCategories,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [allowedCategoriesKey]
    )

    const visibleCategories = useMemo(() => {
        if (!stableAllowedCategories || stableAllowedCategories.length === 0) {
            return ALL_CATEGORIES
        }
        const allowed = ALL_CATEGORIES.filter(
            c => c.id !== 'All' && stableAllowedCategories.includes(c.id as ContentCategory)
        )
        if (allowed.length >= 2) {
            const allEntry = ALL_CATEGORIES.find(c => c.id === 'All')!
            return [allEntry, ...allowed]
        }
        return allowed
    }, [stableAllowedCategories])

    const defaultCategory: MarketplaceCategory = useMemo(() => {
        if (visibleCategories.length === 1) return visibleCategories[0].id
        return 'All'
    }, [visibleCategories])

    const [activeCategory, setActiveCategory] = useState<MarketplaceCategory>(
        (searchParams?.get('cat') as MarketplaceCategory) || defaultCategory
    )
    const [searchQuery, setSearchQuery] = useState(searchParams?.get('q') || '')
    const [debouncedQuery, setDebouncedQuery] = useState(searchQuery)
    const [sortBy, setSortBy] = useState<SortOption>('relevance')
    const [savedIds, setSavedIds] = useState<Set<string>>(new Set(initialSavedIds))
    const [selectedSubcategories, setSelectedSubcategories] = useState<Set<string>>(new Set())
    const [showFilters, setShowFilters] = useState(false)
    const [selectedListing, setSelectedListing] = useState<MarketplaceListing | null>(null)
    /** When set, shows "AI interpreted" badge with this explanation. Cleared when user changes filters. */
    const [aiInterpretation, setAIInterpretation] = useState<string | null>(null)

    // Server-driven listing state
    const [listings, setListings] = useState<MarketplaceListing[]>(initialListings)
    const [totalCount, setTotalCount] = useState(initialTotalCount)
    const [hasMore, setHasMore] = useState(initialHasMore)
    const [serverCategoryCounts, setServerCategoryCounts] = useState<Record<string, number>>(initialCategoryCounts ?? {})
    const [currentPage, setCurrentPage] = useState(1)
    const [isLoading, setIsLoading] = useState(false)
    const [isLoadingMore, setIsLoadingMore] = useState(false)
    const fetchAbortRef = useRef<AbortController | null>(null)

    const techniqueSlug = searchParams?.get('technique') || null
    const activeTechnique: ManufacturingTechnique | null = useMemo(() => {
        if (!techniqueSlug) return null
        return getTechniqueById(techniqueSlug) ?? null
    }, [techniqueSlug])

    const isInitialMount = useRef(true)

    useEffect(() => {
        setListings(initialListings)
        setTotalCount(initialTotalCount ?? 0)
        setHasMore(initialHasMore ?? false)
        if (initialCategoryCounts) setServerCategoryCounts(initialCategoryCounts)
        setCurrentPage(1)
    }, [initialListings, initialTotalCount, initialHasMore, initialCategoryCounts])

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300)
        return () => clearTimeout(timer)
    }, [searchQuery])

    // Refetch first page when search/filter/sort change (skip initial mount to avoid double-fetch)
    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false
            return
        }
        fetchPage(1, false)
    }, [debouncedQuery, activeCategory, sortBy, selectedSubcategories]) // eslint-disable-line react-hooks/exhaustive-deps

    const updateURL = useCallback((query: string, category: MarketplaceCategory) => {
        const params = new URLSearchParams()
        if (query) params.set('q', query)
        if (category !== 'All') params.set('cat', category)
        const newURL = params.toString() ? `${pathname}?${params.toString()}` : pathname
        router.push(newURL, { scroll: false })
    }, [pathname, router])

    useEffect(() => {
        updateURL(debouncedQuery, activeCategory)
    }, [debouncedQuery]) // eslint-disable-line react-hooks/exhaustive-deps

    const buildSearchParams = useCallback(
        (page: number) => {
            const categories =
                stableAllowedCategories && stableAllowedCategories.length > 0
                    ? stableAllowedCategories
                    : undefined
            const category =
                activeCategory !== 'All' ? (activeCategory as string) : undefined
            return {
                query: debouncedQuery.trim() || undefined,
                categories: category ? undefined : categories,
                category,
                subcategories:
                    selectedSubcategories.size > 0
                        ? Array.from(selectedSubcategories)
                        : undefined,
                sort: toApiSort(sortBy),
                page,
                pageSize: MARKETPLACE_PAGE_SIZE,
            }
        },
        [
            stableAllowedCategories,
            activeCategory,
            debouncedQuery,
            selectedSubcategories,
            sortBy,
        ]
    )

    const fetchPage = useCallback(
        async (page: number, append: boolean) => {
            if (fetchAbortRef.current) {
                fetchAbortRef.current.abort()
            }
            fetchAbortRef.current = new AbortController()
            const params = buildSearchParams(page)
            if (append) {
                setIsLoadingMore(true)
            } else {
                setIsLoading(true)
            }
            try {
                const result = await searchMarketplaceListings(params)
                if (append) {
                    setListings(prev => [...prev, ...result.data])
                } else {
                    setListings(result.data)
                }
                setTotalCount(result.totalCount)
                setHasMore(result.hasMore)
                if (result.categoryCounts) setServerCategoryCounts(result.categoryCounts)
                setCurrentPage(page)
            } catch (err) {
                console.error('[Marketplace] searchMarketplaceListings failed:', err)
                if (!append) {
                    setListings([])
                    setTotalCount(0)
                    setHasMore(false)
                }
            } finally {
                setIsLoading(false)
                setIsLoadingMore(false)
                fetchAbortRef.current = null
            }
        },
        [buildSearchParams]
    )

    useEffect(() => {
        if (currentPage === 1 && listings === initialListings && !debouncedQuery && activeCategory === defaultCategory && selectedSubcategories.size === 0) {
            return
        }
        fetchPage(1, false)
    }, [debouncedQuery, activeCategory, sortBy, selectedSubcategories]) // eslint-disable-line react-hooks/exhaustive-deps

    const loadMore = useCallback(() => {
        if (isLoadingMore || !hasMore) return
        fetchPage(currentPage + 1, true)
    }, [currentPage, hasMore, isLoadingMore, fetchPage])

    const handleCategoryChange = useCallback(
        (cat: MarketplaceCategory) => {
            setActiveCategory(cat)
            setSelectedSubcategories(new Set())
            setShowFilters(cat !== 'All')
            setAIInterpretation(null)
            updateURL(searchQuery, cat)
        },
        [searchQuery, updateURL]
    )

    const toggleSubcategory = useCallback((sub: string) => {
        setAIInterpretation(null)
        setSelectedSubcategories(prev => {
            const next = new Set(prev)
            if (next.has(sub)) next.delete(sub)
            else next.add(sub)
            return next
        })
    }, [])

    /** Apply filters extracted by AI search; refetch is triggered by effect. */
    const applyAIFilters = useCallback(
        (params: { category?: ContentCategory; subcategory?: string; explanation?: string }) => {
            if (params.category) setActiveCategory(params.category)
            if (params.subcategory != null) {
                setSelectedSubcategories(new Set([params.subcategory]))
                setShowFilters(true)
            }
            setAIInterpretation(params.explanation ?? null)
        },
        []
    )

    const clearAIInterpretation = useCallback(() => setAIInterpretation(null), [])

    const toggleSaved = useCallback((id: string) => {
        setSavedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }, [])

    const clearFilters = useCallback(() => {
        setSearchQuery('')
        setSelectedSubcategories(new Set())
        setSortBy('relevance')
        setAIInterpretation(null)
        if (techniqueSlug) {
            const params = new URLSearchParams(searchParams?.toString() || '')
            params.delete('technique')
            const newURL = params.toString() ? `${pathname}?${params.toString()}` : pathname
            router.push(newURL, { scroll: false })
        }
    }, [techniqueSlug, searchParams, pathname, router])

    const hasActiveFilters = useMemo(
        () =>
            debouncedQuery.trim() !== '' ||
            selectedSubcategories.size > 0 ||
            sortBy !== 'relevance' ||
            activeTechnique !== null,
        [debouncedQuery, selectedSubcategories.size, sortBy, activeTechnique]
    )

    const filteredListings = useMemo(() => {
        let result = listings
        if (activeTechnique) {
            const keywords = [
                activeTechnique.name.toLowerCase(),
                activeTechnique.slug.toLowerCase(),
                ...(activeTechnique.subcategory
                    ? [activeTechnique.subcategory.toLowerCase()]
                    : []),
            ]
            result = result.filter(l => {
                const title = l.title.toLowerCase()
                const desc = l.description?.toLowerCase() || ''
                const sub = l.subcategory?.toLowerCase() || ''
                const attrs = l.attributes || {}
                const tags: string[] = (attrs.tags || []).map((t: string) => t.toLowerCase())
                const capabilities: string[] = (
                    attrs.capabilities || attrs.techniques || []
                ).map((c: string) => c.toLowerCase())
                return keywords.some(
                    kw =>
                        title.includes(kw) ||
                        desc.includes(kw) ||
                        sub.includes(kw) ||
                        tags.some(t => t.includes(kw)) ||
                        capabilities.some(c => c.includes(kw))
                )
            })
        }
        return result
    }, [listings, activeTechnique])

    const availableSubcategories = useMemo(() => {
        const catListings =
            activeCategory === 'All'
                ? listings
                : listings.filter(l => l.category === activeCategory)
        return [...new Set(catListings.map(l => l.subcategory))].sort()
    }, [listings, activeCategory])

    // INTENT: Use server-provided per-category totals so pills show real counts,
    // not just the count from the loaded page. "All" is the sum of individual categories.
    const categoryCounts = useMemo(() => {
        const allTotal = Object.values(serverCategoryCounts).reduce((sum, n) => sum + n, 0)
        return { All: allTotal, ...serverCategoryCounts }
    }, [serverCategoryCounts])

    const clearTechniqueFilter = useCallback(() => {
        const params = new URLSearchParams(searchParams?.toString() || '')
        params.delete('technique')
        const newURL = params.toString() ? `${pathname}?${params.toString()}` : pathname
        router.push(newURL, { scroll: false })
    }, [searchParams, pathname, router])

    const setSortByAndRefetch = useCallback((sort: SortOption) => {
        setSortBy(sort)
    }, [])

    return {
        activeCategory,
        searchQuery,
        debouncedQuery,
        sortBy,
        savedIds,
        selectedSubcategories,
        showFilters,
        selectedListing,
        activeTechnique,
        filteredListings,
        availableSubcategories,
        categoryCounts,
        hasActiveFilters,
        visibleCategories,
        totalCount,
        hasMore,
        isLoading,
        isLoadingMore,
        loadMore,
        handleCategoryChange,
        setSearchQuery,
        setSortBy: setSortByAndRefetch,
        toggleSaved,
        toggleSubcategory,
        setShowFilters,
        setSelectedListing,
        clearFilters,
        clearTechniqueFilter,
        aiInterpretation,
        applyAIFilters,
        clearAIInterpretation,
    }
}
