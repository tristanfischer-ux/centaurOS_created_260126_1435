'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useSearchParams, usePathname } from 'next/navigation'
import type { MarketplaceListing, MarketplaceSortOption, AdvancedFilters } from '@/actions/marketplace'
import { searchMarketplaceListings } from '@/actions/marketplace'
import { MARKETPLACE_PAGE_SIZE } from '@/lib/marketplace-constants'
import { safeParseAttributes, safeStringArray, deriveRegion, type MarketplaceRegion } from '@/lib/marketplace-utils'
import { extractPostcode, deriveRegionFromPostcode, deriveRegionFromKeywords } from '@/lib/postcode-utils'
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
    /**
     * Optional transform applied to listings after each server fetch.
     * Used by Recruits to enrich People listings with trustData on page 2+.
     */
    postFetchTransform?: (listings: MarketplaceListing[]) => Promise<MarketplaceListing[]>
}

export function useMarketplaceState({
    initialListings,
    initialTotalCount = 0,
    initialHasMore = false,
    initialCategoryCounts,
    initialSavedIds = [],
    allowedCategories,
    postFetchTransform,
}: UseMarketplaceStateProps) {
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
    // INTENT: Pre-populate subcategory filter from URL params so the process
    // discovery grid links (?subcategory=X|Y|Z) work on page load.
    // Uses pipe delimiter to avoid breaking on subcategory names with commas.
    const [selectedSubcategories, setSelectedSubcategories] = useState<Set<string>>(() => {
        const param = searchParams?.get('subcategory')
        if (param) return new Set(param.split('|').map(s => s.trim()).filter(Boolean))
        return new Set<string>()
    })
    const [showFilters, setShowFilters] = useState(false)
    const [selectedListing, setSelectedListing] = useState<MarketplaceListing | null>(null)
    /** When set, shows "AI interpreted" badge with this explanation. Cleared when user changes filters. */
    const [aiInterpretation, setAIInterpretation] = useState<string | null>(null)
    const [selectedRegion, setSelectedRegion] = useState<MarketplaceRegion>('All Regions')
    const [selectedSubRegions, setSelectedSubRegions] = useState<string[]>([])

    // Advanced filter state
    const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>(() => {
        const initial: AdvancedFilters = {}
        if (searchParams?.get('v') === '1') initial.verifiedOnly = true
        const mr = searchParams?.get('mr')
        if (mr) initial.minRating = Number(mr)
        const exp = searchParams?.get('exp')
        if (exp) initial.minExperience = Number(exp)
        const loc = searchParams?.get('loc')
        if (loc) initial.location = loc
        const avail = searchParams?.get('avail')
        if (avail) initial.availability = avail
        const sk = searchParams?.get('sk')
        if (sk) initial.skills = sk.split(',').filter(Boolean)
        const rmin = searchParams?.get('rmin')
        if (rmin) initial.minRate = Number(rmin)
        const rmax = searchParams?.get('rmax')
        if (rmax) initial.maxRate = Number(rmax)
        const ct = searchParams?.get('ct')
        if (ct) initial.companyTypes = ct.split(',').filter(Boolean)
        const cs = searchParams?.get('cs')
        if (cs) initial.companySizes = cs.split(',').filter(Boolean)
        const ind = searchParams?.get('ind')
        if (ind) initial.industries = ind.split(',').filter(Boolean)
        const cert = searchParams?.get('cert')
        if (cert) initial.certifications = cert.split(',').filter(Boolean)
        return initial
    })

    const updateAdvancedFilter = useCallback(<K extends keyof AdvancedFilters>(key: K, value: AdvancedFilters[K]) => {
        setAdvancedFilters(prev => {
            const next = { ...prev }
            if (value === undefined || value === null || value === '' || value === false || (Array.isArray(value) && value.length === 0)) {
                delete next[key]
            } else {
                next[key] = value
            }
            return next
        })
        setAIInterpretation(null)
    }, [])

    const removeAdvancedFilter = useCallback((key: keyof AdvancedFilters) => {
        setAdvancedFilters(prev => {
            const next = { ...prev }
            delete next[key]
            return next
        })
    }, [])

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
        const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300)
        return () => clearTimeout(timer)
    }, [searchQuery])

    // Refetch first page when search/filter/sort change.
    // On initial mount, skip only when no URL params are present — the server
    // already returned the correct default results. When URL params exist
    // (e.g. bookmarked ?q=Pack+Chlb), the server returned cached defaults
    // so the client must fetch param-specific results.
    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false
            const hasUrlFilters =
                debouncedQuery.trim() !== '' ||
                activeCategory !== defaultCategory ||
                Object.keys(advancedFilters).length > 0 ||
                selectedSubcategories.size > 0
            if (!hasUrlFilters) return
        }
        fetchPage(1, false)
    }, [debouncedQuery, activeCategory, sortBy, selectedSubcategories, advancedFilters]) // eslint-disable-line react-hooks/exhaustive-deps

    const updateURL = useCallback((query: string, category: MarketplaceCategory, filters?: AdvancedFilters) => {
        const p = new URLSearchParams()
        if (query) p.set('q', query)
        if (category !== 'All') p.set('cat', category)
        const f = filters ?? advancedFilters
        if (f.verifiedOnly) p.set('v', '1')
        if (f.minRating != null) p.set('mr', String(f.minRating))
        if (f.minExperience != null) p.set('exp', String(f.minExperience))
        if (f.location) p.set('loc', f.location)
        if (f.availability) p.set('avail', f.availability)
        if (f.skills && f.skills.length > 0) p.set('sk', f.skills.join(','))
        if (f.minRate != null) p.set('rmin', String(f.minRate))
        if (f.maxRate != null) p.set('rmax', String(f.maxRate))
        if (f.companyTypes && f.companyTypes.length > 0) p.set('ct', f.companyTypes.join(','))
        if (f.companySizes && f.companySizes.length > 0) p.set('cs', f.companySizes.join(','))
        if (f.industries && f.industries.length > 0) p.set('ind', f.industries.join(','))
        if (f.certifications && f.certifications.length > 0) p.set('cert', f.certifications.join(','))
        const newURL = p.toString() ? `${pathname}?${p.toString()}` : pathname
        window.history.replaceState(null, '', newURL)
    }, [pathname, advancedFilters])

    useEffect(() => {
        updateURL(debouncedQuery, activeCategory, advancedFilters)
    }, [debouncedQuery, advancedFilters]) // eslint-disable-line react-hooks/exhaustive-deps

    const buildSearchParams = useCallback(
        (page: number) => {
            const categories =
                stableAllowedCategories && stableAllowedCategories.length > 0
                    ? stableAllowedCategories
                    : undefined
            const category =
                activeCategory !== 'All' ? (activeCategory as string) : undefined
            // Only include advancedFilters if at least one key is set
            const hasAdvanced = Object.keys(advancedFilters).length > 0
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
                advancedFilters: hasAdvanced ? advancedFilters : undefined,
            }
        },
        [
            stableAllowedCategories,
            activeCategory,
            debouncedQuery,
            selectedSubcategories,
            sortBy,
            advancedFilters,
        ]
    )

    // Ref to keep fetchPage dependency array stable while allowing transform updates
    const postFetchTransformRef = useRef(postFetchTransform)
    postFetchTransformRef.current = postFetchTransform

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
                // Apply optional transform (e.g. People trust data enrichment)
                const data = postFetchTransformRef.current
                    ? await postFetchTransformRef.current(result.data)
                    : result.data
                if (append) {
                    setListings(prev => [...prev, ...data])
                } else {
                    setListings(data)
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

    // Fix 1: Removed duplicate useEffect that shared the same dependency array

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

    const toggleSubRegion = useCallback((region: string) => {
        setSelectedSubRegions(prev =>
            prev.includes(region) ? prev.filter(r => r !== region) : [...prev, region]
        )
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
        setSelectedRegion('All Regions')
        setSelectedSubRegions([])
        setAdvancedFilters({})
        if (techniqueSlug) {
            const params = new URLSearchParams(searchParams?.toString() || '')
            params.delete('technique')
            const newURL = params.toString() ? `${pathname}?${params.toString()}` : pathname
            window.history.replaceState(null, '', newURL)
        }
    }, [techniqueSlug, searchParams, pathname])

    const advancedFilterCount = useMemo(() => Object.keys(advancedFilters).length, [advancedFilters])

    const hasActiveFilters = useMemo(
        () =>
            debouncedQuery.trim() !== '' ||
            selectedSubcategories.size > 0 ||
            sortBy !== 'relevance' ||
            activeTechnique !== null ||
            selectedRegion !== 'All Regions' ||
            selectedSubRegions.length > 0 ||
            advancedFilterCount > 0,
        [debouncedQuery, selectedSubcategories.size, sortBy, activeTechnique, selectedRegion, selectedSubRegions.length, advancedFilterCount]
    )

    const activeFilterCount = useMemo(() => {
        let count = 0
        if (selectedSubcategories.size > 0) count += selectedSubcategories.size
        count += advancedFilterCount
        return count
    }, [selectedSubcategories.size, advancedFilterCount])

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
                const attrs = safeParseAttributes(l.attributes)
                const tags = safeStringArray(attrs.tags).map((t) => t.toLowerCase())
                const capabilities = safeStringArray(attrs.capabilities || attrs.techniques).map((c) => c.toLowerCase())
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
        // Client-side region filtering (broad: UK / Europe / Global)
        if (selectedRegion !== 'All Regions') {
            result = result.filter(l => {
                const attrs = safeParseAttributes(l.attributes)
                const region = deriveRegion(attrs)
                return region === selectedRegion
            })
        }
        // Client-side sub-region filtering (chart-clicked: London, South East, etc.)
        if (selectedSubRegions.length > 0) {
            result = result.filter(l => {
                const attrs = safeParseAttributes(l.attributes)
                const address = (attrs.ch_registered_address ?? attrs.location ?? attrs.headquarters) as string | undefined
                if (!address) return false
                const postcode = extractPostcode(address)
                let subRegion = postcode ? deriveRegionFromPostcode(postcode) : null
                if (!subRegion) subRegion = deriveRegionFromKeywords(address)
                return subRegion ? selectedSubRegions.includes(subRegion) : false
            })
        }
        return result
    }, [listings, activeTechnique, selectedRegion, selectedSubRegions])

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
        window.history.replaceState(null, '', newURL)
    }, [searchParams, pathname])

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
        activeFilterCount,
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
        selectedRegion,
        setSelectedRegion,
        selectedSubRegions,
        toggleSubRegion,
        aiInterpretation,
        applyAIFilters,
        clearAIInterpretation,
        advancedFilters,
        updateAdvancedFilter,
        removeAdvancedFilter,
    }
}
