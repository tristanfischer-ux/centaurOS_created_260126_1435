'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import type { MarketplaceListing } from '@/actions/marketplace'
import { getTechniqueById } from '@/lib/manufacturing-techniques'
import type { ManufacturingTechnique } from '@/lib/manufacturing-techniques/types'

export type MarketplaceCategory = 'All' | 'People' | 'Products' | 'Services'
export type SortOption = 'relevance' | 'rating' | 'price_low' | 'price_high' | 'newest'

export const CATEGORIES: { id: MarketplaceCategory; label: string; icon: string }[] = [
    { id: 'All', label: 'All', icon: 'LayoutGrid' },
    { id: 'People', label: 'People', icon: 'Users' },
    { id: 'Products', label: 'Products', icon: 'Package' },
    { id: 'Services', label: 'Services', icon: 'Wrench' },
]

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
    { value: 'relevance', label: 'Relevance' },
    { value: 'rating', label: 'Top Rated' },
    { value: 'price_low', label: 'Price: Low to High' },
    { value: 'price_high', label: 'Price: High to Low' },
    { value: 'newest', label: 'Newest' },
]

interface UseMarketplaceStateProps {
    initialListings: MarketplaceListing[]
    initialSavedIds: string[]
}

export function useMarketplaceState({ initialListings, initialSavedIds }: UseMarketplaceStateProps) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    // Core state
    const [activeCategory, setActiveCategory] = useState<MarketplaceCategory>(
        (searchParams?.get('cat') as MarketplaceCategory) || 'All'
    )
    const [searchQuery, setSearchQuery] = useState(searchParams?.get('q') || '')
    const [debouncedQuery, setDebouncedQuery] = useState(searchQuery)
    const [sortBy, setSortBy] = useState<SortOption>('relevance')
    const [savedIds, setSavedIds] = useState<Set<string>>(new Set(initialSavedIds))

    // Filter state
    const [selectedSubcategories, setSelectedSubcategories] = useState<Set<string>>(new Set())
    const [showFilters, setShowFilters] = useState(false)

    // Technique filter: when arriving from Techniques Explorer via ?technique=slug
    const techniqueSlug = searchParams?.get('technique') || null
    const activeTechnique: ManufacturingTechnique | null = useMemo(() => {
        if (!techniqueSlug) return null
        // Look up by slug (which matches the id in most cases)
        return getTechniqueById(techniqueSlug) ?? null
    }, [techniqueSlug])

    // Detail dialog
    const [selectedListing, setSelectedListing] = useState<MarketplaceListing | null>(null)

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300)
        return () => clearTimeout(timer)
    }, [searchQuery])

    // Update URL when key params change
    const updateURL = useCallback((query: string, category: MarketplaceCategory) => {
        const params = new URLSearchParams()
        if (query) params.set('q', query)
        if (category !== 'All') params.set('cat', category)
        const newURL = params.toString() ? `${pathname}?${params.toString()}` : pathname
        router.push(newURL, { scroll: false })
    }, [pathname, router])

    // Category change handler — auto-expands filters for non-All categories
    const handleCategoryChange = useCallback((cat: MarketplaceCategory) => {
        setActiveCategory(cat)
        setSelectedSubcategories(new Set())
        // Auto-show filter panel when selecting a specific category so users
        // can immediately refine by subcategory (replaces the former CategoryGuide)
        if (cat !== 'All') {
            setShowFilters(true)
        } else {
            setShowFilters(false)
        }
        updateURL(searchQuery, cat)
    }, [searchQuery, updateURL])

    // Toggle subcategory
    const toggleSubcategory = useCallback((sub: string) => {
        setSelectedSubcategories(prev => {
            const next = new Set(prev)
            if (next.has(sub)) next.delete(sub)
            else next.add(sub)
            return next
        })
    }, [])

    // Save/unsave toggle
    const toggleSaved = useCallback((id: string) => {
        setSavedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }, [])

    // Clear all filters
    const clearFilters = useCallback(() => {
        setSearchQuery('')
        setSelectedSubcategories(new Set())
        setSortBy('relevance')
    }, [])

    // Check if any filters are active
    const hasActiveFilters = useMemo(() => {
        return debouncedQuery.trim() !== '' || selectedSubcategories.size > 0 || sortBy !== 'relevance' || activeTechnique !== null
    }, [debouncedQuery, selectedSubcategories, sortBy, activeTechnique])

    // Exclude AI listings from browsing (kept in DB for future use)
    const browseListings = useMemo(
        () => initialListings.filter(l => l.category !== 'AI'),
        [initialListings]
    )

    // Filter and sort listings
    const filteredListings = useMemo(() => {
        let filtered = browseListings

        // Category filter
        if (activeCategory !== 'All') {
            filtered = filtered.filter(l => l.category === activeCategory)
        }

        // Subcategory filter
        if (selectedSubcategories.size > 0) {
            filtered = filtered.filter(l => selectedSubcategories.has(l.subcategory))
        }

        // Technique filter: when arriving from Techniques Explorer
        if (activeTechnique) {
            const keywords = [
                activeTechnique.name.toLowerCase(),
                activeTechnique.slug.toLowerCase(),
                ...(activeTechnique.subcategory
                    ? [activeTechnique.subcategory.toLowerCase()]
                    : []),
            ]
            filtered = filtered.filter(l => {
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
                        capabilities.some(c => c.includes(kw)),
                )
            })
        }

        // Search filter
        if (debouncedQuery.trim()) {
            const q = debouncedQuery.toLowerCase().trim()
            filtered = filtered.filter(l => {
                if (l.title.toLowerCase().includes(q)) return true
                if (l.description?.toLowerCase().includes(q)) return true
                const attrs = l.attributes || {}
                const skills = attrs.skills || attrs.expertise || []
                if (skills.some((s: string) => s.toLowerCase().includes(q))) return true
                if (l.subcategory?.toLowerCase().includes(q)) return true
                return false
            })
        }

        // Sort
        switch (sortBy) {
            case 'rating':
                filtered = [...filtered].sort((a, b) =>
                    (b.attributes?.rating_average || 0) - (a.attributes?.rating_average || 0)
                )
                break
            case 'price_low':
                filtered = [...filtered].sort((a, b) =>
                    getNumericPrice(a) - getNumericPrice(b)
                )
                break
            case 'price_high':
                filtered = [...filtered].sort((a, b) =>
                    getNumericPrice(b) - getNumericPrice(a)
                )
                break
            case 'newest':
                // Already sorted by the server
                break
            case 'relevance':
            default:
                // Verified first (server default), then by search relevance
                break
        }

        return filtered
    }, [browseListings, activeCategory, selectedSubcategories, debouncedQuery, sortBy, activeTechnique])

    // Available subcategories for current category
    const availableSubcategories = useMemo(() => {
        const catListings = activeCategory === 'All'
            ? browseListings
            : browseListings.filter(l => l.category === activeCategory)
        return [...new Set(catListings.map(l => l.subcategory))].sort()
    }, [browseListings, activeCategory])

    // Category counts
    const categoryCounts = useMemo(() => {
        const counts: Record<string, number> = { All: browseListings.length }
        for (const listing of browseListings) {
            counts[listing.category] = (counts[listing.category] || 0) + 1
        }
        return counts
    }, [browseListings])

    // Clear technique filter by navigating without the param
    const clearTechniqueFilter = useCallback(() => {
        const params = new URLSearchParams(searchParams?.toString() || '')
        params.delete('technique')
        const newURL = params.toString() ? `${pathname}?${params.toString()}` : pathname
        router.push(newURL, { scroll: false })
    }, [searchParams, pathname, router])

    return {
        // State
        activeCategory,
        searchQuery,
        debouncedQuery,
        sortBy,
        savedIds,
        selectedSubcategories,
        showFilters,
        selectedListing,
        activeTechnique,

        // Computed
        filteredListings,
        availableSubcategories,
        categoryCounts,
        hasActiveFilters,

        // Actions
        handleCategoryChange,
        setSearchQuery,
        setSortBy,
        toggleSaved,
        toggleSubcategory,
        setShowFilters,
        setSelectedListing,
        clearFilters,
        clearTechniqueFilter,
    }
}

/** Extract a numeric price from listing attributes for sorting */
function getNumericPrice(listing: MarketplaceListing): number {
    const attrs = listing.attributes || {}
    const priceStr = attrs.rate || attrs.cost || attrs.price || attrs.day_rate || ''
    const match = String(priceStr).match(/[\d,]+/)
    if (match) return parseInt(match[0].replace(/,/g, ''), 10)
    return 999999 // No price = sort to end
}
