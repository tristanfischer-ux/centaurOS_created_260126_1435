'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import type { MarketplaceCategory, SortOption } from '@/types/search'

/**
 * Custom hook for managing marketplace filter state.
 * Encapsulates all filter logic, URL sync, and derived state.
 * 
 * @example
 * ```tsx
 * const { filters, setters, clearFilters, hasActiveFilters, activeFilterCount } = useMarketplaceFilters()
 * ```
 */
export function useMarketplaceFilters() {
    const router = useRouter()
    const pathname = usePathname()
    const urlSearchParams = useSearchParams()

    // Active category/tab
    const [activeTab, setActiveTab] = useState<MarketplaceCategory>('People')
    
    // Search state
    const [searchQuery, setSearchQuery] = useState('')
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
    
    // View state
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
    const [showFilters, setShowFilters] = useState(false)
    const [allExpanded, setAllExpanded] = useState(false)
    const [sortBy, setSortBy] = useState<SortOption>('relevance')
    
    // Universal filters
    const [selectedSubcategories, setSelectedSubcategories] = useState<Set<string>>(new Set())
    const [locationFilter, setLocationFilter] = useState<string>('all')
    
    // People-specific filters
    const [skillFilter, setSkillFilter] = useState<string>('all')
    const [minExperience, setMinExperience] = useState<string>('all')
    
    // AI-specific filters
    const [aiTypeFilter, setAiTypeFilter] = useState<string>('all')
    const [maxCostFilter, setMaxCostFilter] = useState<string>('all')
    const [integrationFilter, setIntegrationFilter] = useState<string>('all')
    
    // Products-specific filters
    const [certificationFilter, setCertificationFilter] = useState<string>('all')
    const [technologyFilter, setTechnologyFilter] = useState<string>('all')

    // Debounce search query
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery)
        }, 300)
        return () => clearTimeout(timer)
    }, [searchQuery])

    // Sync with URL params on mount (intentionally run once)
    useEffect(() => {
        if (urlSearchParams) {
            const query = urlSearchParams.get('q')
            const category = urlSearchParams.get('cat') as MarketplaceCategory | null
            const subcategories = urlSearchParams.get('sub')
            const location = urlSearchParams.get('loc')
            const sort = urlSearchParams.get('sort') as SortOption | null

            if (query) setSearchQuery(query)
            if (category) setActiveTab(category)
            if (subcategories) setSelectedSubcategories(new Set(subcategories.split(',')))
            if (location) setLocationFilter(location)
            if (sort) setSortBy(sort)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Toggle subcategory in multi-select
    const toggleSubcategory = useCallback((sub: string) => {
        setSelectedSubcategories(prev => {
            const next = new Set(prev)
            if (next.has(sub)) {
                next.delete(sub)
            } else {
                next.add(sub)
            }
            return next
        })
    }, [])

    // Clear all filters
    const clearFilters = useCallback(() => {
        setSelectedSubcategories(new Set())
        setLocationFilter('all')
        setSkillFilter('all')
        setMinExperience('all')
        setAiTypeFilter('all')
        setMaxCostFilter('all')
        setIntegrationFilter('all')
        setCertificationFilter('all')
        setTechnologyFilter('all')
        setSearchQuery('')
    }, [])

    // Update URL with current filters
    const updateURL = useCallback(() => {
        const params = new URLSearchParams()
        if (searchQuery) params.set('q', searchQuery)
        if (activeTab && activeTab !== 'People') params.set('cat', activeTab)
        if (selectedSubcategories.size > 0) params.set('sub', Array.from(selectedSubcategories).join(','))
        if (locationFilter !== 'all') params.set('loc', locationFilter)
        if (sortBy !== 'relevance') params.set('sort', sortBy)
        
        const newURL = params.toString() ? `${pathname}?${params.toString()}` : pathname
        router.push(newURL, { scroll: false })
    }, [pathname, router, searchQuery, activeTab, selectedSubcategories, locationFilter, sortBy])

    // Check if any filters are active
    const hasActiveFilters = useMemo(() => {
        const baseFilters = selectedSubcategories.size > 0 || locationFilter !== 'all' || searchQuery.trim() !== ''
        
        if (activeTab === 'People') {
            return baseFilters || skillFilter !== 'all' || minExperience !== 'all'
        }
        if (activeTab === 'AI') {
            return baseFilters || aiTypeFilter !== 'all' || maxCostFilter !== 'all' || integrationFilter !== 'all'
        }
        if (activeTab === 'Products') {
            return baseFilters || certificationFilter !== 'all' || technologyFilter !== 'all'
        }
        return baseFilters
    }, [
        activeTab, 
        selectedSubcategories, 
        locationFilter, 
        searchQuery, 
        skillFilter, 
        minExperience, 
        aiTypeFilter, 
        maxCostFilter, 
        integrationFilter, 
        certificationFilter, 
        technologyFilter
    ])

    // Count active filters
    const activeFilterCount = useMemo(() => {
        let count = selectedSubcategories.size
        if (locationFilter !== 'all') count++
        if (searchQuery.trim()) count++
        
        if (activeTab === 'People') {
            if (skillFilter !== 'all') count++
            if (minExperience !== 'all') count++
        } else if (activeTab === 'AI') {
            if (aiTypeFilter !== 'all') count++
            if (maxCostFilter !== 'all') count++
            if (integrationFilter !== 'all') count++
        } else if (activeTab === 'Products') {
            if (certificationFilter !== 'all') count++
            if (technologyFilter !== 'all') count++
        }
        
        return count
    }, [
        activeTab,
        selectedSubcategories,
        locationFilter,
        searchQuery,
        skillFilter,
        minExperience,
        aiTypeFilter,
        maxCostFilter,
        integrationFilter,
        certificationFilter,
        technologyFilter
    ])

    // Handle tab change
    const handleTabChange = useCallback((tab: string) => {
        setActiveTab(tab as MarketplaceCategory)
        clearFilters()
        setShowFilters(false)
    }, [clearFilters])

    return {
        // State
        filters: {
            activeTab,
            searchQuery,
            debouncedSearchQuery,
            viewMode,
            showFilters,
            allExpanded,
            sortBy,
            selectedSubcategories,
            locationFilter,
            skillFilter,
            minExperience,
            aiTypeFilter,
            maxCostFilter,
            integrationFilter,
            certificationFilter,
            technologyFilter,
        },
        // Setters
        setters: {
            setActiveTab: handleTabChange,
            setSearchQuery,
            setViewMode,
            setShowFilters,
            setAllExpanded,
            setSortBy,
            setLocationFilter,
            setSkillFilter,
            setMinExperience,
            setAiTypeFilter,
            setMaxCostFilter,
            setIntegrationFilter,
            setCertificationFilter,
            setTechnologyFilter,
            toggleSubcategory,
        },
        // Actions
        clearFilters,
        updateURL,
        // Derived state
        hasActiveFilters,
        activeFilterCount,
    }
}

export type MarketplaceFiltersState = ReturnType<typeof useMarketplaceFilters>
