'use client'

import { MarketplaceListing } from "@/actions/marketplace"
import { ComparisonBar } from "@/components/marketplace/comparison-bar"
import { ComparisonModal } from "@/components/marketplace/comparison-modal"
import { MarketCard, CardSize } from "@/components/marketplace/market-card"
import { MarketplaceOnboardingModal } from "@/components/onboarding/MarketplaceOnboardingModal"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useState, useMemo, useEffect, useCallback } from "react"
import { Loader2, Store, Search, X, SlidersHorizontal, MapPin, Briefcase, GraduationCap, Bot, Factory, Zap, Shield, LayoutGrid, List, ShieldCheck, Clock, Sparkles, Users, ArrowRight, Bookmark, Star, Rows3, Square, LayoutList, Minus, AlignJustify, UserCircle, Package, Wrench, CheckCircle2, FileText, Heart, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { SearchBar, ActiveFilterBadges } from "@/components/search"
import { SaveSearchDialog } from "@/components/search/SavedSearches"
import { 
    SearchSuggestion, 
    RecentSearch, 
    PopularSearch,
    AppliedFilters,
    MarketplaceCategory,
    SortOption,
    SORT_OPTIONS,
    searchParamsToURL,
    urlToSearchParams
} from "@/types/search"
import { 
    getRecentSearches, 
    getPopularSearches, 
    saveSearchQuery,
    getAutocomplete
} from "@/actions/search"
import { getMyRFQs } from "@/actions/rfq"
import { getSavedResources, getSavedMarketplaceListings, getSavedListingIds } from "@/actions/marketplace"
import { RFQCard } from "@/components/rfq/RFQCard"
import { RFQSummary } from "@/types/rfq"

interface MarketplaceRecommendation {
    id: string
    source_type: 'advisory' | 'coverage_gap' | 'ai_suggestion' | 'manual'
    category: 'People' | 'Products' | 'Services' | 'AI'
    subcategory: string | null
    search_term: string | null
    reasoning: string | null
    priority: number
    created_at: string
}

interface TeamMember {
    id: string
    full_name: string | null
    role: string
}

interface MarketplaceViewProps {
    initialListings: MarketplaceListing[]
    recommendations?: MarketplaceRecommendation[]
    teamMembers?: TeamMember[]
    showOnboarding?: boolean
    userRole?: 'Executive' | 'Apprentice' | 'Founder' | 'AI_Agent'
    onboardingRecommendations?: MarketplaceListing[]
}

export function MarketplaceView({ 
    initialListings, 
    recommendations = [], 
    teamMembers = [],
    showOnboarding = false,
    userRole = 'Apprentice',
    onboardingRecommendations = []
}: MarketplaceViewProps) {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [isComparisonOpen, setIsComparisonOpen] = useState(false)
    const [activeTab, setActiveTab] = useState<string>('People') // Default to People
    
    // Top-level marketplace tabs state
    const [topTab, setTopTab] = useState<string>('browse')
    const [myRfqs, setMyRfqs] = useState<RFQSummary[]>([])
    const [savedResources, setSavedResources] = useState<any[]>([])
    const [savedListings, setSavedListings] = useState<MarketplaceListing[]>([])
    const [savedListingIds, setSavedListingIds] = useState<Set<string>>(new Set())
    const [isLoadingRfqs, setIsLoadingRfqs] = useState(false)
    const [isLoadingSaved, setIsLoadingSaved] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
    const [showFilters, setShowFilters] = useState(false)
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
    
    // Card size state - tracks individual card sizes and default size
    const [defaultCardSize, setDefaultCardSize] = useState<CardSize>('medium')
    const [cardSizes, setCardSizes] = useState<Record<string, CardSize>>({})
    
    // Handle individual card size changes
    const handleCardSizeChange = useCallback((id: string, size: CardSize) => {
        setCardSizes(prev => ({ ...prev, [id]: size }))
    }, [])
    
    // Set all cards to a specific size
    const setAllCardsSize = useCallback((size: CardSize) => {
        setDefaultCardSize(size)
        setCardSizes({}) // Clear individual overrides
    }, [])
    
    // Universal filters - subcategory is multi-select
    const [selectedSubcategories, setSelectedSubcategories] = useState<Set<string>>(new Set())
    const [locationFilter, setLocationFilter] = useState<string>('all')
    
    // Toggle a subcategory in the multi-select
    const toggleSubcategory = (sub: string) => {
        setSelectedSubcategories(prev => {
            const next = new Set(prev)
            if (next.has(sub)) {
                next.delete(sub)
            } else {
                next.add(sub)
            }
            return next
        })
    }
    
    // People-specific filters
    const [skillFilter, setSkillFilter] = useState<string>('all')
    const [minExperience, setMinExperience] = useState<string>('all')
    
    // AI-specific filters
    const [aiTypeFilter, setAiTypeFilter] = useState<string>('all')
    const [maxCostFilter, setMaxCostFilter] = useState<string>('all')
    const [integrationFilter, setIntegrationFilter] = useState<string>('all')
    
    // Services sub-tab filter ('all' | 'services' | 'ai')
    const [servicesSubTab, setServicesSubTab] = useState<string>('all')
    
    // Products-specific filters
    const [certificationFilter, setCertificationFilter] = useState<string>('all')
    const [technologyFilter, setTechnologyFilter] = useState<string>('all')

    // AI Search state
    const [aiSearchEnabled, setAiSearchEnabled] = useState(false)
    const [isAiSearching, setIsAiSearching] = useState(false)
    const [aiFilters, setAiFilters] = useState<{
        category?: string
        subcategory?: string
        skills?: string[]
        location?: string
        minExperience?: number
        type?: string
        maxCost?: number
        integrations?: string[]
        certifications?: string[]
        technology?: string
    } | null>(null)
    const [aiExplanation, setAiExplanation] = useState<string>('')

    // Centaur Matcher state
    const [showCentaurMatcher, setShowCentaurMatcher] = useState(false)
    const [centaurMatchLoading, setCentaurMatchLoading] = useState(false)
    const [selectedMemberId, setSelectedMemberId] = useState<string>('')
    const [centaurSuggestions, setCentaurSuggestions] = useState<{
        listingId: string
        title: string
        compatibilityScore: number
        reasoning: string
        useCases: string[]
    }[]>([])

    // Advanced search state
    const router = useRouter()
    const pathname = usePathname()
    const urlSearchParams = useSearchParams()
    const [showSuggestions, setShowSuggestions] = useState(false)
    const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([])
    const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([])
    const [popularSearches, setPopularSearches] = useState<PopularSearch[]>([])
    const [saveSearchOpen, setSaveSearchOpen] = useState(false)
    const [sortBy, setSortBy] = useState<SortOption>('relevance')

    // Load search suggestions and history
    useEffect(() => {
        const loadSearchData = async () => {
            const [recentResult, popularResult] = await Promise.all([
                getRecentSearches(),
                getPopularSearches(5, false)
            ])
            setRecentSearches(recentResult.searches)
            setPopularSearches(popularResult.searches)
        }
        loadSearchData()
    }, [])

    // Fetch autocomplete suggestions
    useEffect(() => {
        const fetchSuggestions = async () => {
            if (searchQuery.length < 2) {
                setSuggestions([])
                return
            }
            const { suggestions: newSuggestions } = await getAutocomplete(
                searchQuery, 
                activeTab as MarketplaceCategory
            )
            setSuggestions(newSuggestions.map(s => ({
                ...s,
                category: s.category as MarketplaceCategory | undefined
            })) as SearchSuggestion[])
        }
        const timer = setTimeout(fetchSuggestions, 200)
        return () => clearTimeout(timer)
    }, [searchQuery, activeTab])

    // Sync with URL params on mount
    useEffect(() => {
        if (urlSearchParams) {
            const params = urlToSearchParams(urlSearchParams)
            if (params.query) setSearchQuery(params.query)
            if (params.category) setActiveTab(params.category)
            if (params.subcategories) setSelectedSubcategories(new Set(params.subcategories))
            if (params.location) setLocationFilter(params.location)
            if (params.sortBy) setSortBy(params.sortBy)
            
            // Check for top-level tab params (from redirects)
            const tab = urlSearchParams.get('tab')
            if (tab === 'rfqs' || tab === 'my-rfqs') {
                setTopTab('rfqs')
            } else if (tab === 'saved') {
                setTopTab('saved')
            } else if (tab === 'talent') {
                // Talent redirects to browse with People category
                setTopTab('browse')
                setActiveTab('People')
            }
        }
    }, [])

    // Fetch RFQs when switching to RFQs tab
    const fetchMyRfqs = useCallback(async () => {
        setIsLoadingRfqs(true)
        try {
            const result = await getMyRFQs('buyer')
            if (!result.error) {
                setMyRfqs(result.data)
            }
        } catch (err) {
            console.error('Error fetching RFQs:', err)
        } finally {
            setIsLoadingRfqs(false)
        }
    }, [])

    // Fetch saved marketplace listings when switching to Saved tab
    const fetchSavedResources = useCallback(async () => {
        setIsLoadingSaved(true)
        try {
            const result = await getSavedMarketplaceListings()
            if (!result.error && result.data) {
                setSavedListings(result.data)
                // Also update savedListingIds set
                setSavedListingIds(new Set(result.data.map(l => l.id)))
            }
        } catch (err) {
            console.error('Error fetching saved listings:', err)
        } finally {
            setIsLoadingSaved(false)
        }
    }, [])

    // Fetch data when top tab changes
    useEffect(() => {
        if (topTab === 'rfqs' && myRfqs.length === 0) {
            fetchMyRfqs()
        } else if (topTab === 'saved' && savedListings.length === 0) {
            fetchSavedResources()
        }
    }, [topTab, myRfqs.length, savedListings.length, fetchMyRfqs, fetchSavedResources])

    // Handle save/unsave toggle from card
    const handleSaveToggle = useCallback((listingId: string, isSaved: boolean) => {
        // Update saved IDs set
        setSavedListingIds(prev => {
            const next = new Set(prev)
            if (isSaved) {
                next.add(listingId)
            } else {
                next.delete(listingId)
            }
            return next
        })
        
        // If we're on the saved tab, refetch to update the list
        if (topTab === 'saved') {
            fetchSavedResources()
        }
    }, [topTab, fetchSavedResources])

    // Handle top tab change and update URL
    const handleTopTabChange = useCallback((newTab: string) => {
        setTopTab(newTab)
        const params = new URLSearchParams(urlSearchParams?.toString() || '')
        if (newTab === 'browse') {
            params.delete('tab')
        } else {
            params.set('tab', newTab)
        }
        const newURL = params.toString() ? `${pathname}?${params.toString()}` : pathname
        router.push(newURL, { scroll: false })
    }, [pathname, router, urlSearchParams])

    // Update URL with search params
    const updateURL = useCallback((query: string, category: string) => {
        const params = new URLSearchParams()
        if (query) params.set('q', query)
        if (category && category !== 'People') params.set('cat', category)
        if (selectedSubcategories.size > 0) params.set('sub', Array.from(selectedSubcategories).join(','))
        if (locationFilter !== 'all') params.set('loc', locationFilter)
        if (sortBy !== 'relevance') params.set('sort', sortBy)
        
        const newURL = params.toString() ? `${pathname}?${params.toString()}` : pathname
        router.push(newURL, { scroll: false })
    }, [pathname, router, selectedSubcategories, locationFilter, sortBy])

    // Handle suggestion selection
    const handleSuggestionSelect = (suggestion: SearchSuggestion) => {
        setSearchQuery(suggestion.text)
        if (suggestion.category) {
            setActiveTab(suggestion.category)
        }
        setShowSuggestions(false)
    }

    // Handle recent search selection
    const handleRecentSelect = (recent: RecentSearch) => {
        setSearchQuery(recent.query)
        if (recent.filters?.category) {
            setActiveTab(recent.filters.category)
        }
        setShowSuggestions(false)
    }

    // Handle popular search selection
    const handlePopularSelect = (popular: PopularSearch) => {
        setSearchQuery(popular.query)
        if (popular.category) {
            setActiveTab(popular.category)
        }
        setShowSuggestions(false)
    }

    // Save current search
    const handleSaveSearch = async (name: string, alertEnabled: boolean, alertFrequency?: string) => {
        const filters: AppliedFilters = {
            query: searchQuery,
            category: activeTab as MarketplaceCategory,
            subcategories: Array.from(selectedSubcategories),
            location: locationFilter !== 'all' ? locationFilter : undefined,
        }
        const result = await saveSearchQuery(name, searchQuery, filters, alertEnabled, alertFrequency as any)
        if (result.success) {
            toast.success('Search saved!')
            // Reload recent searches
            const { searches } = await getRecentSearches()
            setRecentSearches(searches)
        }
        return result
    }

    // Debounce search query
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery)
        }, 300)
        return () => clearTimeout(timer)
    }, [searchQuery])

    // AI Search handler
    const handleAiSearch = useCallback(async () => {
        if (!searchQuery.trim() || searchQuery.length < 3) {
            toast.error('Please enter at least 3 characters for AI search')
            return
        }
        
        setIsAiSearching(true)
        try {
            const response = await fetch('/api/marketplace/ai-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: searchQuery })
            })
            
            const data = await response.json()
            
            if (data.success && data.filters) {
                // Apply AI-extracted filters
                const filters = data.filters
                setAiFilters(filters)
                setAiExplanation(data.explanation || '')
                
                // Switch to the AI-suggested category if provided
                if (filters.category && filters.category !== activeTab) {
                    setActiveTab(filters.category)
                }
                
                // Apply location filter
                if (filters.location) {
                    setLocationFilter(filters.location)
                }
                
                // Apply category-specific filters
                if (filters.skills?.length) {
                    setSkillFilter(filters.skills[0])
                }
                if (filters.minExperience) {
                    setMinExperience(String(filters.minExperience))
                }
                if (filters.type) {
                    setAiTypeFilter(filters.type)
                }
                if (filters.maxCost) {
                    setMaxCostFilter(String(filters.maxCost))
                }
                if (filters.integrations?.length) {
                    setIntegrationFilter(filters.integrations[0])
                }
                if (filters.certifications?.length) {
                    setCertificationFilter(filters.certifications[0])
                }
                if (filters.technology) {
                    setTechnologyFilter(filters.technology)
                }
                
                toast.success('AI filters applied')
            } else {
                toast.error(data.error || 'AI search failed')
            }
        } catch (error) {
            console.error('AI search error:', error)
            toast.error('AI search failed')
        } finally {
            setIsAiSearching(false)
        }
    }, [searchQuery, activeTab])

    // Centaur Matcher handler
    const handleCentaurMatch = useCallback(async (memberId: string) => {
        if (!memberId) return
        
        setCentaurMatchLoading(true)
        setCentaurSuggestions([])
        
        try {
            const response = await fetch('/api/marketplace/centaur-match', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ memberId })
            })
            
            const data = await response.json()
            
            if (data.suggestions) {
                setCentaurSuggestions(data.suggestions)
            } else {
                toast.error(data.error || 'Failed to get AI pairing suggestions')
            }
        } catch (error) {
            console.error('Centaur match error:', error)
            toast.error('Failed to get AI pairing suggestions')
        } finally {
            setCentaurMatchLoading(false)
        }
    }, [])

    // Clear AI filters
    const clearAiFilters = useCallback(() => {
        setAiFilters(null)
        setAiExplanation('')
        clearFilters()
    }, [])

    // Category definitions for the hero cards
    // Color scheme rationale:
    // - People: International Orange (primary brand, warm, human)
    // - Products: Slate (industrial, manufacturing, physical)
    // - Services: Electric Blue (secondary brand, tech, digital)
    const categoryCards = [
        {
            id: 'People',
            title: 'People',
            icon: UserCircle,
            color: 'bg-orange-500',
            hoverColor: 'hover:border-orange-400 hover:bg-orange-50',
            lightColor: 'bg-orange-50',
            borderColor: 'border-orange-500',
            textColor: 'text-orange-600',
            iconBg: 'bg-orange-100',
            buttonBg: 'bg-orange-500 hover:bg-orange-600',
            categories: ['People'],
            headline: 'Expert Talent On-Demand',
            description: 'Access fractional executives, specialists, and apprentices who bring deep expertise without full-time commitment. From CTOs to CAD specialists, find the exact skills you need.',
            benefits: [
                'Fractional executives with 15+ years experience',
                'Verified credentials and track records',
                'Flexible engagement: hourly, daily, or retainer',
                'Pre-vetted for quality and reliability'
            ]
        },
        {
            id: 'Products',
            title: 'Physical Products',
            icon: Package,
            color: 'bg-slate-500',
            hoverColor: 'hover:border-slate-400 hover:bg-slate-50',
            lightColor: 'bg-slate-50',
            borderColor: 'border-slate-500',
            textColor: 'text-slate-600',
            iconBg: 'bg-slate-100',
            buttonBg: 'bg-slate-500 hover:bg-slate-600',
            categories: ['Products'],
            headline: 'Manufacturing Partners',
            description: 'Connect with certified manufacturers and suppliers for physical products. From precision engineering to rapid prototyping, source quality components and finished goods.',
            benefits: [
                'ISO-certified manufacturing facilities',
                'Prototyping to full production scale',
                'Quality assurance and compliance',
                'Transparent lead times and pricing'
            ]
        },
        {
            id: 'Services',
            title: 'Services',
            icon: Wrench,
            color: 'bg-blue-500',
            hoverColor: 'hover:border-blue-400 hover:bg-blue-50',
            lightColor: 'bg-blue-50',
            borderColor: 'border-blue-500',
            textColor: 'text-blue-600',
            iconBg: 'bg-blue-100',
            buttonBg: 'bg-blue-500 hover:bg-blue-600',
            categories: ['Services', 'AI'],
            headline: 'Professional Services & AI Tools',
            description: 'From consulting and legal services to cutting-edge AI tools, access the services that accelerate your business. Includes AI agents, automation tools, and software solutions.',
            benefits: [
                'Business consulting and advisory',
                'AI tools and automation platforms',
                'Legal, finance, and HR services',
                'Integration support and training'
            ]
        }
    ]

    // Get listings for current tab (handles multi-category for Services)
    const currentListings = useMemo(() => {
        const categoryCard = categoryCards.find(c => c.id === activeTab)
        if (categoryCard) {
            return initialListings.filter(item => categoryCard.categories.includes(item.category))
        }
        return initialListings.filter(item => item.category === activeTab)
    }, [initialListings, activeTab])

    // Extract unique values for filter options
    const subcategories = useMemo(() => 
        [...new Set(currentListings.map(p => p.subcategory))].sort(),
        [currentListings]
    )

    const locations = useMemo(() => {
        const locs = currentListings
            .map(p => p.attributes?.location)
            .filter(Boolean)
        return [...new Set(locs)].sort()
    }, [currentListings])

    // People-specific options
    const allSkills = useMemo(() => {
        if (activeTab !== 'People') return []
        const skills = new Set<string>()
        currentListings.forEach(p => {
            const itemSkills = p.attributes?.skills || p.attributes?.expertise || []
            itemSkills.forEach((s: string) => skills.add(s))
        })
        return [...skills].sort()
    }, [currentListings, activeTab])

    // Services/AI-specific options
    const aiTypes = useMemo(() => {
        if (activeTab !== 'Services') return []
        return [...new Set(currentListings.map(p => p.attributes?.type).filter(Boolean))].sort()
    }, [currentListings, activeTab])

    const aiIntegrations = useMemo(() => {
        if (activeTab !== 'Services') return []
        const integrations = new Set<string>()
        currentListings.forEach(p => {
            const items = p.attributes?.integrations || []
            items.forEach((s: string) => integrations.add(s))
        })
        return [...integrations].sort()
    }, [currentListings, activeTab])

    // Products-specific options
    const certifications = useMemo(() => {
        if (activeTab !== 'Products') return []
        const certs = new Set<string>()
        currentListings.forEach(p => {
            const items = p.attributes?.certifications || []
            items.forEach((s: string) => certs.add(s))
        })
        return [...certs].sort()
    }, [currentListings, activeTab])

    const technologies = useMemo(() => {
        if (activeTab !== 'Products') return []
        return [...new Set(currentListings.map(p => p.attributes?.technology || p.attributes?.company_type).filter(Boolean))].sort()
    }, [currentListings, activeTab])

    const toggleSelect = (id: string) => {
        const next = new Set(selectedIds)
        if (next.has(id)) {
            next.delete(id)
        } else {
            if (next.size >= 3) return
            next.add(id)
        }
        setSelectedIds(next)
    }

    const clearSelection = () => setSelectedIds(new Set())
    
    const clearFilters = () => {
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
        setServicesSubTab('all')
    }

    const hasActiveFilters = useMemo(() => {
        const baseFilters = selectedSubcategories.size > 0 || locationFilter !== 'all' || searchQuery.trim() !== ''
        if (activeTab === 'People') {
            return baseFilters || skillFilter !== 'all' || minExperience !== 'all'
        }
        if (activeTab === 'Services') {
            return baseFilters || aiTypeFilter !== 'all' || maxCostFilter !== 'all' || integrationFilter !== 'all'
        }
        if (activeTab === 'Products') {
            return baseFilters || certificationFilter !== 'all' || technologyFilter !== 'all'
        }
        return baseFilters
    }, [activeTab, selectedSubcategories, locationFilter, searchQuery, skillFilter, minExperience, aiTypeFilter, maxCostFilter, integrationFilter, technologyFilter])

    // Filter items
    const filteredItems = useMemo(() => {
        let filtered = currentListings
        
        // Apply search filter
        if (debouncedSearchQuery.trim()) {
            const query = debouncedSearchQuery.toLowerCase().trim()
            filtered = filtered.filter(item => {
                if (item.title.toLowerCase().includes(query)) return true
                if (item.description?.toLowerCase().includes(query)) return true
                const attrs = item.attributes || {}
                for (const value of Object.values(attrs)) {
                    if (typeof value === 'string' && value.toLowerCase().includes(query)) return true
                    if (Array.isArray(value) && value.some(v => v.toLowerCase?.().includes(query))) return true
                }
                return false
            })
        }
        
        // Universal filters - subcategory multi-select
        if (selectedSubcategories.size > 0) {
            filtered = filtered.filter(item => selectedSubcategories.has(item.subcategory))
        }
        if (locationFilter !== 'all') {
            filtered = filtered.filter(item => item.attributes?.location === locationFilter)
        }
        
        // People-specific filters
        if (activeTab === 'People') {
            if (skillFilter !== 'all') {
                filtered = filtered.filter(item => {
                    const skills = item.attributes?.skills || item.attributes?.expertise || []
                    return skills.includes(skillFilter)
                })
            }
            if (minExperience !== 'all') {
                const minYears = parseInt(minExperience)
                filtered = filtered.filter(item => (item.attributes?.years_experience || 0) >= minYears)
            }
        }
        
        // Services/AI-specific filters
        if (activeTab === 'Services') {
            // Filter by sub-tab (All, Consulting/Services, AI Tools)
            if (servicesSubTab === 'services') {
                filtered = filtered.filter(item => item.category === 'Services')
            } else if (servicesSubTab === 'ai') {
                filtered = filtered.filter(item => item.category === 'AI')
            }
            // 'all' shows both Services and AI categories (no additional filter)
            
            if (aiTypeFilter !== 'all') {
                filtered = filtered.filter(item => item.attributes?.type === aiTypeFilter)
            }
            if (maxCostFilter !== 'all') {
                const maxCost = parseInt(maxCostFilter)
                filtered = filtered.filter(item => (item.attributes?.cost_value || 0) <= maxCost)
            }
            if (integrationFilter !== 'all') {
                filtered = filtered.filter(item => {
                    const integrations = item.attributes?.integrations || []
                    return integrations.includes(integrationFilter)
                })
            }
        }
        
        // Products-specific filters
        if (activeTab === 'Products') {
            if (certificationFilter !== 'all') {
                filtered = filtered.filter(item => {
                    const certs = item.attributes?.certifications || []
                    return certs.includes(certificationFilter)
                })
            }
            if (technologyFilter !== 'all') {
                filtered = filtered.filter(item => 
                    item.attributes?.technology === technologyFilter || 
                    item.attributes?.company_type === technologyFilter
                )
            }
        }
        
        return filtered
    }, [currentListings, activeTab, debouncedSearchQuery, selectedSubcategories, locationFilter, skillFilter, minExperience, aiTypeFilter, maxCostFilter, integrationFilter, certificationFilter, technologyFilter, servicesSubTab])

    // Load saved listing IDs for current visible items (must be after filteredItems definition)
    useEffect(() => {
        const loadSavedIds = async () => {
            const visibleIds = filteredItems.map(item => item.id)
            if (visibleIds.length > 0) {
                const ids = await getSavedListingIds(visibleIds)
                setSavedListingIds(ids)
            }
        }
        if (topTab === 'browse') {
            loadSavedIds()
        }
    }, [filteredItems, topTab])

    // Build selected items for comparison, ensuring all have valid attributes
    const selectedItems = initialListings
        .filter(item => selectedIds.has(item.id))
        .map(item => ({
            ...item,
            attributes: item.attributes || {}
        }))

    const getSearchPlaceholder = () => {
        switch (activeTab) {
            case 'People': return "Search by name, skill, role..."
            case 'Products': return "Search by company, capability, material..."
            case 'Services': return "Search services, AI tools, consulting..."
            default: return "Search listings..."
        }
    }

    const getResultsLabel = () => {
        const count = filteredItems.length
        switch (activeTab) {
            case 'People': return `${count} ${count === 1 ? 'person' : 'people'}`
            case 'Products': return `${count} ${count === 1 ? 'manufacturer' : 'manufacturers'}`
            case 'Services': return `${count} ${count === 1 ? 'service' : 'services'}`
            default: return `${count} items`
        }
    }

    const showFiltersButton = ['People', 'Products', 'Services'].includes(activeTab)
    
    // Get count for a category card (handles multi-category)
    const getCategoryCount = (categoryId: string) => {
        const card = categoryCards.find(c => c.id === categoryId)
        if (!card) return 0
        return initialListings.filter(item => card.categories.includes(item.category)).length
    }
    
    // Handle category card click
    const handleCategoryClick = (categoryId: string) => {
        if (categoryId === activeTab) return // Already selected
        setActiveTab(categoryId)
        clearSelection()
        clearFilters()
        setShowFilters(false)
    }

    return (
        <div className="space-y-6">
            {/* Marketplace Onboarding Modal for first-time users */}
            {showOnboarding && (
                <MarketplaceOnboardingModal
                    recommendations={onboardingRecommendations}
                    userRole={userRole}
                        onComplete={() => {
                            // Onboarding complete
                        }}
                />
            )}

            {/* Top-level Marketplace Tabs */}
            <Tabs value={topTab} onValueChange={handleTopTabChange} className="w-full">
                <TabsList className="mb-6 w-full max-w-md">
                    <TabsTrigger value="browse" className="flex-1 gap-2">
                        <Store className="h-4 w-4" />
                        Browse
                    </TabsTrigger>
                    <TabsTrigger value="rfqs" className="flex-1 gap-2">
                        <FileText className="h-4 w-4" />
                        My RFQs
                        {myRfqs.length > 0 && (
                            <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1.5">
                                {myRfqs.length}
                            </Badge>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="saved" className="flex-1 gap-2">
                        <Heart className="h-4 w-4" />
                        Saved
                        {savedListings.length > 0 && (
                            <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1.5">
                                {savedListings.length}
                            </Badge>
                        )}
                    </TabsTrigger>
                </TabsList>

                {/* Browse Tab - Original Marketplace Content */}
                <TabsContent value="browse" className="mt-0">
                    {/* Hero Category Cards - Rich detail about each category */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {/* People Card - International Orange (warm, human) */}
                <div 
                    onClick={() => handleCategoryClick('People')}
                    className={cn(
                        "group cursor-pointer transition-all duration-200 overflow-hidden rounded-xl border-2 bg-background",
                        activeTab === 'People'
                            ? "border-orange-500 shadow-lg bg-orange-50"
                            : "border-border shadow-sm hover:border-orange-400 hover:bg-orange-50 hover:shadow-lg hover:-translate-y-1"
                    )}
                >
                    <div className="h-2 bg-orange-500" />
                    <div className="p-5 space-y-4">
                        <div className="flex items-start justify-between">
                            <div className={cn(
                                "w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-200",
                                activeTab === 'People' ? "bg-orange-100" : "bg-muted group-hover:bg-orange-100 group-hover:scale-110"
                            )}>
                                <UserCircle className={cn(
                                    "w-6 h-6 transition-colors duration-200",
                                    activeTab === 'People' ? "text-orange-600" : "text-muted-foreground group-hover:text-orange-600"
                                )} />
                            </div>
                            <Badge variant="secondary" className={cn("text-xs font-semibold", activeTab === 'People' && "bg-orange-100 text-orange-600")}>
                                {getCategoryCount('People')} available
                            </Badge>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-foreground mb-1">People</h3>
                            <p className={cn(
                                "text-sm font-semibold transition-colors",
                                activeTab === 'People' ? "text-orange-600" : "text-muted-foreground group-hover:text-orange-600"
                            )}>
                                Expert Talent On-Demand
                            </p>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            Access fractional executives, specialists, and apprentices who bring deep expertise without full-time commitment. From CTOs to CAD specialists, find the exact skills you need.
                        </p>
                        <ul className="space-y-2">
                            {['Fractional executives with 15+ years experience', 'Verified credentials and track records', 'Flexible engagement: hourly, daily, or retainer', 'Pre-vetted for quality and reliability'].map((benefit, idx) => (
                                <li key={idx} className="flex items-start gap-2 text-sm">
                                    <CheckCircle2 className={cn("w-4 h-4 mt-0.5 shrink-0", activeTab === 'People' ? "text-orange-600" : "text-status-success")} />
                                    <span className="text-muted-foreground">{benefit}</span>
                                </li>
                            ))}
                        </ul>
                        <button className={cn(
                            "w-full flex items-center justify-between px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-200",
                            activeTab === 'People'
                                ? "bg-orange-500 hover:bg-orange-600 text-white shadow-md"
                                : "bg-muted text-muted-foreground group-hover:bg-orange-500 group-hover:text-white"
                        )}>
                            {activeTab === 'People' ? 'Browsing People' : 'Explore People'}
                            <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                        </button>
                    </div>
                </div>

                {/* Products Card - Slate (industrial, manufacturing) */}
                <div 
                    onClick={() => handleCategoryClick('Products')}
                    className={cn(
                        "group cursor-pointer transition-all duration-200 overflow-hidden rounded-xl border-2 bg-background",
                        activeTab === 'Products'
                            ? "border-slate-500 shadow-lg bg-slate-50"
                            : "border-border shadow-sm hover:border-slate-400 hover:bg-slate-50 hover:shadow-lg hover:-translate-y-1"
                    )}
                >
                    <div className="h-2 bg-slate-500" />
                    <div className="p-5 space-y-4">
                        <div className="flex items-start justify-between">
                            <div className={cn(
                                "w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-200",
                                activeTab === 'Products' ? "bg-slate-100" : "bg-muted group-hover:bg-slate-100 group-hover:scale-110"
                            )}>
                                <Package className={cn(
                                    "w-6 h-6 transition-colors duration-200",
                                    activeTab === 'Products' ? "text-slate-600" : "text-muted-foreground group-hover:text-slate-600"
                                )} />
                            </div>
                            <Badge variant="secondary" className={cn("text-xs font-semibold", activeTab === 'Products' && "bg-slate-100 text-slate-600")}>
                                {getCategoryCount('Products')} available
                            </Badge>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-foreground mb-1">Physical Products</h3>
                            <p className={cn(
                                "text-sm font-semibold transition-colors",
                                activeTab === 'Products' ? "text-slate-600" : "text-muted-foreground group-hover:text-slate-600"
                            )}>
                                Manufacturing Partners
                            </p>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            Connect with certified manufacturers and suppliers for physical products. From precision engineering to rapid prototyping, source quality components and finished goods.
                        </p>
                        <ul className="space-y-2">
                            {['ISO-certified manufacturing facilities', 'Prototyping to full production scale', 'Quality assurance and compliance', 'Transparent lead times and pricing'].map((benefit, idx) => (
                                <li key={idx} className="flex items-start gap-2 text-sm">
                                    <CheckCircle2 className={cn("w-4 h-4 mt-0.5 shrink-0", activeTab === 'Products' ? "text-slate-600" : "text-status-success")} />
                                    <span className="text-muted-foreground">{benefit}</span>
                                </li>
                            ))}
                        </ul>
                        <button className={cn(
                            "w-full flex items-center justify-between px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-200",
                            activeTab === 'Products'
                                ? "bg-slate-500 hover:bg-slate-600 text-white shadow-md"
                                : "bg-muted text-muted-foreground group-hover:bg-slate-500 group-hover:text-white"
                        )}>
                            {activeTab === 'Products' ? 'Browsing Products' : 'Explore Products'}
                            <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                        </button>
                    </div>
                </div>

                {/* Services Card - Electric Blue (tech, digital, professional) */}
                <div 
                    onClick={() => handleCategoryClick('Services')}
                    className={cn(
                        "group cursor-pointer transition-all duration-200 overflow-hidden rounded-xl border-2 bg-background",
                        activeTab === 'Services'
                            ? "border-blue-500 shadow-lg bg-blue-50"
                            : "border-border shadow-sm hover:border-blue-400 hover:bg-blue-50 hover:shadow-lg hover:-translate-y-1"
                    )}
                >
                    <div className="h-2 bg-blue-500" />
                    <div className="p-5 space-y-4">
                        <div className="flex items-start justify-between">
                            <div className={cn(
                                "w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-200",
                                activeTab === 'Services' ? "bg-blue-100" : "bg-muted group-hover:bg-blue-100 group-hover:scale-110"
                            )}>
                                <Wrench className={cn(
                                    "w-6 h-6 transition-colors duration-200",
                                    activeTab === 'Services' ? "text-blue-600" : "text-muted-foreground group-hover:text-blue-600"
                                )} />
                            </div>
                            <Badge variant="secondary" className={cn("text-xs font-semibold", activeTab === 'Services' && "bg-blue-100 text-blue-600")}>
                                {getCategoryCount('Services')} available
                            </Badge>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-foreground mb-1">Services</h3>
                            <p className={cn(
                                "text-sm font-semibold transition-colors",
                                activeTab === 'Services' ? "text-blue-600" : "text-muted-foreground group-hover:text-blue-600"
                            )}>
                                Professional Services & AI Tools
                            </p>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            From consulting and legal services to cutting-edge AI tools, access the services that accelerate your business. Includes AI agents, automation tools, and software solutions.
                        </p>
                        <ul className="space-y-2">
                            {['Business consulting and advisory', 'AI tools and automation platforms', 'Legal, finance, and HR services', 'Integration support and training'].map((benefit, idx) => (
                                <li key={idx} className="flex items-start gap-2 text-sm">
                                    <CheckCircle2 className={cn("w-4 h-4 mt-0.5 shrink-0", activeTab === 'Services' ? "text-blue-600" : "text-status-success")} />
                                    <span className="text-muted-foreground">{benefit}</span>
                                </li>
                            ))}
                        </ul>
                        <button className={cn(
                            "w-full flex items-center justify-between px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-200",
                            activeTab === 'Services'
                                ? "bg-blue-500 hover:bg-blue-600 text-white shadow-md"
                                : "bg-muted text-muted-foreground group-hover:bg-blue-500 group-hover:text-white"
                        )}>
                            {activeTab === 'Services' ? 'Browsing Services' : 'Explore Services'}
                            <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Listings Section */}
            <div className="flex flex-col gap-6">

                {/* AI Recommendations Panel */}
                {recommendations.length > 0 && (
                    <Card className="bg-gradient-to-r from-status-warning-light to-orange-50 border-status-warning">
                        <div className="p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <Sparkles className="h-5 w-5 text-status-warning" />
                                <h3 className="font-semibold text-foreground">Recommended for You</h3>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {recommendations.map((rec) => (
                                    <button
                                        key={rec.id}
                                        onClick={() => {
                                            setActiveTab(rec.category)
                                            if (rec.search_term) {
                                                setSearchQuery(rec.search_term)
                                            }
                                        }}
                                        className="flex items-center gap-2 px-3 py-2 bg-background rounded border border-status-warning hover:border-status-warning hover:shadow-sm transition-all text-left"
                                    >
                                        <div>
                                            <div className="flex items-center gap-1.5">
                                                <Badge variant="secondary" className="text-[10px] bg-status-warning-light text-status-warning-dark border-status-warning">
                                                    {rec.source_type === 'coverage_gap' ? 'Gap' : rec.source_type === 'advisory' ? 'Q&A' : 'AI'}
                                                </Badge>
                                                <span className="text-sm font-medium text-foreground">
                                                    {rec.search_term || rec.subcategory || rec.category}
                                                </span>
                                            </div>
                                            {rec.reasoning && (
                                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1 max-w-[200px]">
                                                    {rec.reasoning}
                                                </p>
                                            )}
                                        </div>
                                        <ArrowRight className="h-3 w-3 text-status-warning shrink-0" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    </Card>
                )}

                <div className="w-full">
                    <div className="flex flex-col gap-4 mb-6">
                        {/* Search and Filter Controls */}
                        <div className="flex flex-col sm:flex-row gap-3">
                            {/* Enhanced SearchBar with suggestions */}
                            <SearchBar
                                value={searchQuery}
                                onChange={setSearchQuery}
                                onSearch={() => updateURL(searchQuery, activeTab)}
                                onClear={() => { setSearchQuery(''); clearFilters() }}
                                suggestions={suggestions}
                                recentSearches={recentSearches}
                                popularSearches={popularSearches}
                                isLoading={isAiSearching}
                                placeholder={aiSearchEnabled ? "Describe what you're looking for..." : getSearchPlaceholder()}
                                showSuggestions={showSuggestions}
                                onShowSuggestionsChange={setShowSuggestions}
                                onSuggestionSelect={handleSuggestionSelect}
                                onRecentSelect={handleRecentSelect}
                                onPopularSelect={handlePopularSelect}
                                aiSearchEnabled={aiSearchEnabled}
                                onAiSearchToggle={() => {
                                    setAiSearchEnabled(!aiSearchEnabled)
                                    if (!aiSearchEnabled) {
                                        toast.info('AI Search enabled - describe what you need')
                                    }
                                }}
                                onAiSearch={handleAiSearch}
                                className="flex-1 max-w-lg"
                            />
                            
                            <div className="flex gap-2">
                                {/* Save Search Button */}
                                <SaveSearchDialog
                                    isOpen={saveSearchOpen}
                                    onOpenChange={setSaveSearchOpen}
                                    onSave={handleSaveSearch}
                                    query={searchQuery}
                                    filters={{
                                        category: activeTab as MarketplaceCategory,
                                        subcategories: Array.from(selectedSubcategories),
                                        location: locationFilter !== 'all' ? locationFilter : undefined,
                                    }}
                                >
                                    <Button
                                        variant="secondary"
                                        size="icon"
                                        title="Save this search"
                                        disabled={!searchQuery && selectedSubcategories.size === 0}
                                    >
                                        <Bookmark className="h-4 w-4" />
                                    </Button>
                                </SaveSearchDialog>

                                {/* Sort dropdown */}
                                <Select value={sortBy} onValueChange={(val) => setSortBy(val as SortOption)}>
                                    <SelectTrigger className="w-[140px]">
                                        <SelectValue placeholder="Sort by" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {SORT_OPTIONS.map((option) => (
                                            <SelectItem key={option.value} value={option.value}>
                                                {option.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

                                {showFiltersButton && (
                                    <Button 
                                        variant="secondary" 
                                        size="default"
                                        onClick={() => setShowFilters(!showFilters)}
                                        className={showFilters ? 'bg-muted' : ''}
                                    >
                                        <SlidersHorizontal className="h-4 w-4 mr-2" />
                                        Filters
                                        {hasActiveFilters && (
                                            <Badge className="ml-2 h-5 w-5 p-0 flex items-center justify-center text-[10px]">
                                                !
                                            </Badge>
                                        )}
                                    </Button>
                                )}
                            </div>
                        </div>
                        

                        {/* People Filters Panel */}
                        {activeTab === 'People' && showFilters && (
                            <div className="bg-muted rounded border border-muted p-4 space-y-4 hidden md:block">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-medium text-sm">Filter People</h3>
                                    {hasActiveFilters && (
                                        <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs">
                                            <X className="h-3 w-3 mr-1" /> Clear all
                                        </Button>
                                    )}
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                            <MapPin className="h-3 w-3" /> Location
                                        </label>
                                        <Select value={locationFilter} onValueChange={setLocationFilter}>
                                            <SelectTrigger className="h-9"><SelectValue placeholder="All locations" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All locations</SelectItem>
                                                {locations.map(loc => <SelectItem key={loc} value={loc}>{loc}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                            <GraduationCap className="h-3 w-3" /> Skill
                                        </label>
                                        <Select value={skillFilter} onValueChange={setSkillFilter}>
                                            <SelectTrigger className="h-9"><SelectValue placeholder="Any skill" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">Any skill</SelectItem>
                                                {allSkills.map(skill => <SelectItem key={skill} value={skill}>{skill}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-muted-foreground">Min. Experience</label>
                                        <Select value={minExperience} onValueChange={setMinExperience}>
                                            <SelectTrigger className="h-9"><SelectValue placeholder="Any experience" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">Any experience</SelectItem>
                                                <SelectItem value="1">1+ years</SelectItem>
                                                <SelectItem value="3">3+ years</SelectItem>
                                                <SelectItem value="5">5+ years</SelectItem>
                                                <SelectItem value="10">10+ years</SelectItem>
                                                <SelectItem value="15">15+ years</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* AI/Services Filters Panel */}
                        {activeTab === 'Services' && showFilters && (
                            <div className="bg-accent/10 rounded border border-accent/20 p-4 space-y-4 hidden md:block">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-medium text-sm">Filter AI Tools</h3>
                                    {hasActiveFilters && (
                                        <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs">
                                            <X className="h-3 w-3 mr-1" /> Clear all
                                        </Button>
                                    )}
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                            <Bot className="h-3 w-3" /> Type
                                        </label>
                                        <Select value={aiTypeFilter} onValueChange={setAiTypeFilter}>
                                            <SelectTrigger className="h-9"><SelectValue placeholder="All types" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All types</SelectItem>
                                                {aiTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                            <Zap className="h-3 w-3" /> Max Cost
                                        </label>
                                        <Select value={maxCostFilter} onValueChange={setMaxCostFilter}>
                                            <SelectTrigger className="h-9"><SelectValue placeholder="Any cost" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">Any cost</SelectItem>
                                                <SelectItem value="50">Up to £50/mo</SelectItem>
                                                <SelectItem value="100">Up to £100/mo</SelectItem>
                                                <SelectItem value="200">Up to £200/mo</SelectItem>
                                                <SelectItem value="500">Up to £500/mo</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-muted-foreground">Integration</label>
                                        <Select value={integrationFilter} onValueChange={setIntegrationFilter}>
                                            <SelectTrigger className="h-9"><SelectValue placeholder="Any integration" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">Any integration</SelectItem>
                                                {aiIntegrations.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Products Filters Panel */}
                        {activeTab === 'Products' && showFilters && (
                            <div className="bg-muted rounded border border-muted p-4 space-y-4 hidden md:block">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-medium text-sm">Filter Products & Manufacturers</h3>
                                    {hasActiveFilters && (
                                        <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs">
                                            <X className="h-3 w-3 mr-1" /> Clear all
                                        </Button>
                                    )}
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                            <MapPin className="h-3 w-3" /> Location
                                        </label>
                                        <Select value={locationFilter} onValueChange={setLocationFilter}>
                                            <SelectTrigger className="h-9"><SelectValue placeholder="All locations" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All locations</SelectItem>
                                                {locations.map(loc => <SelectItem key={loc} value={loc}>{loc}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                            <Shield className="h-3 w-3" /> Certification
                                        </label>
                                        <Select value={certificationFilter} onValueChange={setCertificationFilter}>
                                            <SelectTrigger className="h-9"><SelectValue placeholder="Any certification" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">Any certification</SelectItem>
                                                {certifications.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-muted-foreground">Technology</label>
                                        <Select value={technologyFilter} onValueChange={setTechnologyFilter}>
                                            <SelectTrigger className="h-9"><SelectValue placeholder="Any technology" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">Any technology</SelectItem>
                                                {technologies.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Active filter badges */}
                        {hasActiveFilters && (
                            <div className="flex flex-wrap gap-2">
                                {Array.from(selectedSubcategories).map(sub => (
                                    <Badge key={sub} variant="secondary" className="gap-1">
                                        {sub}
                                        <X className="h-3 w-3 cursor-pointer" onClick={() => toggleSubcategory(sub)} />
                                    </Badge>
                                ))}
                                {locationFilter !== 'all' && (
                                    <Badge variant="secondary" className="gap-1">
                                        {locationFilter}
                                        <X className="h-3 w-3 cursor-pointer" onClick={() => setLocationFilter('all')} />
                                    </Badge>
                                )}
                                {skillFilter !== 'all' && (
                                    <Badge variant="secondary" className="gap-1">
                                        {skillFilter}
                                        <X className="h-3 w-3 cursor-pointer" onClick={() => setSkillFilter('all')} />
                                    </Badge>
                                )}
                                {minExperience !== 'all' && (
                                    <Badge variant="secondary" className="gap-1">
                                        {minExperience}+ years
                                        <X className="h-3 w-3 cursor-pointer" onClick={() => setMinExperience('all')} />
                                    </Badge>
                                )}
                                {aiTypeFilter !== 'all' && (
                                    <Badge variant="secondary" className="gap-1">
                                        {aiTypeFilter}
                                        <X className="h-3 w-3 cursor-pointer" onClick={() => setAiTypeFilter('all')} />
                                    </Badge>
                                )}
                                {maxCostFilter !== 'all' && (
                                    <Badge variant="secondary" className="gap-1">
                                        Max £{maxCostFilter}/mo
                                        <X className="h-3 w-3 cursor-pointer" onClick={() => setMaxCostFilter('all')} />
                                    </Badge>
                                )}
                                {integrationFilter !== 'all' && (
                                    <Badge variant="secondary" className="gap-1">
                                        {integrationFilter}
                                        <X className="h-3 w-3 cursor-pointer" onClick={() => setIntegrationFilter('all')} />
                                    </Badge>
                                )}
                                {certificationFilter !== 'all' && (
                                    <Badge variant="secondary" className="gap-1">
                                        {certificationFilter}
                                        <X className="h-3 w-3 cursor-pointer" onClick={() => setCertificationFilter('all')} />
                                    </Badge>
                                )}
                                {technologyFilter !== 'all' && (
                                    <Badge variant="secondary" className="gap-1">
                                        {technologyFilter}
                                        <X className="h-3 w-3 cursor-pointer" onClick={() => setTechnologyFilter('all')} />
                                    </Badge>
                                )}
                            </div>
                        )}

                        {/* AI Search Explanation */}
                        {aiExplanation && (
                            <div className="bg-accent/10 border border-accent/20 rounded-lg p-3 flex items-start justify-between gap-3">
                                <div className="flex items-start gap-2">
                                    <Sparkles className="h-4 w-4 text-violet-600 mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-sm text-violet-900">{aiExplanation}</p>
                                        <p className="text-xs text-violet-600 mt-1">AI-extracted filters applied. You can modify them above.</p>
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={clearAiFilters}
                                    className="shrink-0 h-7 text-xs text-violet-600 hover:text-violet-800"
                                >
                                    <X className="h-3 w-3 mr-1" />
                                    Clear AI
                                </Button>
                            </div>
                        )}

                        {/* Sub-category tabs for Services (shows AI and Services breakdown) */}
                        {activeTab === 'Services' && (
                            <div className="overflow-x-auto -mx-2 xs:mx-0 px-2 xs:px-0 pb-1">
                                <Tabs value={servicesSubTab} onValueChange={setServicesSubTab} className="w-full">
                                    <TabsList className="inline-flex w-auto max-w-lg min-w-max">
                                        <TabsTrigger value="all" className="px-3 xs:px-4 gap-1.5">
                                            All Services
                                            <span className="text-[10px] opacity-60">({getCategoryCount('Services')})</span>
                                        </TabsTrigger>
                                        <TabsTrigger value="services" className="px-3 xs:px-4 gap-1.5">
                                            <Wrench className="w-3 h-3 mr-1" />
                                            Consulting
                                            <span className="text-[10px] opacity-60">({initialListings.filter(l => l.category === 'Services').length})</span>
                                        </TabsTrigger>
                                        <TabsTrigger value="ai" className="px-3 xs:px-4 gap-1.5">
                                            <Bot className="w-3 h-3 mr-1" />
                                            AI Tools
                                            <span className="text-[10px] opacity-60">({initialListings.filter(l => l.category === 'AI').length})</span>
                                        </TabsTrigger>
                                    </TabsList>
                                </Tabs>
                            </div>
                        )}
                    </div>

                    {/* Subcategory quick filters - multi-select pills */}
                    {subcategories.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 mb-4">
                            <span className="text-xs text-muted-foreground mr-1">Filter:</span>
                            {subcategories.map(sub => (
                                <button
                                    key={sub}
                                    onClick={() => toggleSubcategory(sub)}
                                    className={`px-3 py-1.5 text-xs font-medium rounded border transition-all ${
                                        selectedSubcategories.has(sub)
                                            ? 'bg-orange-600 text-white border-orange-600 shadow-sm'
                                            : 'bg-background text-muted-foreground border hover:border-orange-500/50 hover:bg-orange-50/50 hover:text-orange-700'
                                    }`}
                                >
                                    {sub}
                                </button>
                            ))}
                            {selectedSubcategories.size > 0 && (
                                <button
                                    onClick={() => setSelectedSubcategories(new Set())}
                                    className="px-2 py-1.5 text-xs text-muted-foreground hover:text-orange-600 flex items-center gap-1 rounded border border-transparent hover:border transition-all"
                                >
                                    <X className="h-3 w-3" />
                                    Clear
                                </button>
                            )}
                        </div>
                    )}

                    {/* Centaur Matcher - on Services tab (includes AI) */}
                    {activeTab === 'Services' && (
                        <div className="mb-6">
                            <button
                                onClick={() => setShowCentaurMatcher(!showCentaurMatcher)}
                                className="flex items-center gap-2 text-sm font-medium text-violet-700 hover:text-violet-900 mb-3"
                            >
                                <Users className="h-4 w-4" />
                                Build Your Centaur
                                <ArrowRight className={`h-4 w-4 transition-transform ${showCentaurMatcher ? 'rotate-90' : ''}`} />
                            </button>
                            
                            {showCentaurMatcher && (
                                <Card className="p-4 bg-gradient-to-r from-accent/10 to-status-info-light/50 border-accent/20">
                                    <div className="flex flex-col gap-4">
                                        <div>
                                            <h3 className="font-medium text-violet-900">Find the Perfect AI Partner</h3>
                                            <p className="text-sm text-violet-700">Select a team member to get AI-powered pairing suggestions.</p>
                                        </div>
                                        
                                        <div className="flex gap-3 items-end">
                                            <div className="flex-1 max-w-xs">
                                                <label className="text-xs font-medium text-violet-700 mb-1.5 block">Team Member</label>
                                                {teamMembers.length > 0 ? (
                                                    <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
                                                        <SelectTrigger className="bg-background">
                                                            <SelectValue placeholder="Select a team member" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {teamMembers.map((member) => (
                                                                <SelectItem key={member.id} value={member.id}>
                                                                    {member.full_name || 'Unnamed'} ({member.role})
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                ) : (
                                                    <Input
                                                        placeholder="Enter member ID"
                                                        value={selectedMemberId}
                                                        onChange={(e) => setSelectedMemberId(e.target.value)}
                                                        className="bg-background"
                                                    />
                                                )}
                                            </div>
                                            <Button
                                                onClick={() => handleCentaurMatch(selectedMemberId)}
                                                disabled={!selectedMemberId || centaurMatchLoading}
                                                className="bg-violet-600 hover:bg-violet-700"
                                            >
                                                {centaurMatchLoading ? (
                                                    <>
                                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                        Analyzing...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Sparkles className="h-4 w-4 mr-2" />
                                                        Find Matches
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                        
                                        {/* Centaur Suggestions */}
                                        {centaurSuggestions.length > 0 && (
                                            <div className="space-y-3 pt-3 border-t border-accent/20">
                                                <h4 className="text-sm font-medium text-violet-900">Recommended AI Partners</h4>
                                                {centaurSuggestions.map((suggestion, idx) => {
                                                    const listing = initialListings.find(l => l.id === suggestion.listingId)
                                                    return (
                                                        <div key={suggestion.listingId} className="bg-background rounded-lg p-3 border border-accent/20">
                                                            <div className="flex items-start justify-between gap-3">
                                                                <div className="flex-1">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-xs font-bold text-violet-600">#{idx + 1}</span>
                                                                        <h5 className="font-medium text-foreground">{suggestion.title}</h5>
                                                                        <Badge className="bg-violet-100 text-violet-700 text-xs">
                                                                            {suggestion.compatibilityScore}/10
                                                                        </Badge>
                                                                    </div>
                                                                    <p className="text-sm text-muted-foreground mt-1">{suggestion.reasoning}</p>
                                                                    {suggestion.useCases.length > 0 && (
                                                                        <div className="flex flex-wrap gap-1 mt-2">
                                                                            {suggestion.useCases.slice(0, 3).map((useCase, i) => (
                                                                                <span key={i} className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">
                                                                                    {useCase}
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                {listing && (
                                                                    <Button
                                                                        size="sm"
                                                                        variant="secondary"
                                                                        onClick={() => toggleSelect(listing.id)}
                                                                        className="shrink-0"
                                                                    >
                                                                        {selectedIds.has(listing.id) ? 'Selected' : 'Select'}
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </Card>
                            )}
                        </div>
                    )}

                    {/* Results count and view toggle */}
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-sm text-muted-foreground">
                            Showing {getResultsLabel()}
                            {hasActiveFilters && ' (filtered)'}
                        </p>
                        <div className="flex items-center gap-3">
                            {/* Card size controls - only show in grid view */}
                            {viewMode === 'grid' && (
                                <div className="bg-muted p-1 rounded-md flex items-center" title="Card detail level">
                                    <Button
                                        variant={defaultCardSize === 'small' ? 'default' : 'ghost'}
                                        size="sm"
                                        onClick={() => setAllCardsSize('small')}
                                        className={cn(
                                            "h-8 w-8 p-0",
                                            defaultCardSize === 'small' && 'shadow-sm'
                                        )}
                                        title="Compact cards"
                                    >
                                        <Minus className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant={defaultCardSize === 'medium' ? 'default' : 'ghost'}
                                        size="sm"
                                        onClick={() => setAllCardsSize('medium')}
                                        className={cn(
                                            "h-8 w-8 p-0",
                                            defaultCardSize === 'medium' && 'shadow-sm'
                                        )}
                                        title="Standard cards"
                                    >
                                        <Square className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant={defaultCardSize === 'full' ? 'default' : 'ghost'}
                                        size="sm"
                                        onClick={() => setAllCardsSize('full')}
                                        className={cn(
                                            "h-8 w-8 p-0",
                                            defaultCardSize === 'full' && 'shadow-sm'
                                        )}
                                        title="Detailed cards"
                                    >
                                        <AlignJustify className="h-4 w-4" />
                                    </Button>
                                </div>
                            )}
                            
                            {/* View mode toggle */}
                            <div className="bg-muted p-1 rounded-md flex items-center">
                                <Button
                                    variant={viewMode === 'grid' ? 'default' : 'ghost'}
                                    size="sm"
                                    onClick={() => setViewMode('grid')}
                                    className={viewMode === 'grid' ? 'shadow-sm h-8 w-8 p-0' : 'h-8 w-8 p-0'}
                                    title="Grid view"
                                >
                                    <LayoutGrid className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant={viewMode === 'list' ? 'default' : 'ghost'}
                                    size="sm"
                                    onClick={() => setViewMode('list')}
                                    className={viewMode === 'list' ? 'shadow-sm h-8 w-8 p-0' : 'h-8 w-8 p-0'}
                                    title="List view"
                                >
                                    <List className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </div>

                    {initialListings.length === 0 ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : viewMode === 'grid' ? (
                        <div className={cn(
                            "grid gap-4 xs:gap-5 fold:gap-5 lg:gap-6 animate-fade-in",
                            defaultCardSize === 'full' 
                                ? "grid-cols-1 lg:grid-cols-2" 
                                : "grid-cols-1 fold:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                        )}>
                            {filteredItems.map(item => (
                                <MarketCard
                                    key={item.id}
                                    listing={item}
                                    isSelected={selectedIds.has(item.id)}
                                    onToggleSelect={toggleSelect}
                                    size={cardSizes[item.id] || defaultCardSize}
                                    onSizeChange={handleCardSizeChange}
                                    isSaved={savedListingIds.has(item.id)}
                                    onSaveToggle={handleSaveToggle}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-3 animate-fade-in">
                            {filteredItems.map(item => {
                                const attrs = item.attributes || {}
                                const primaryMetric = attrs.rate || attrs.cost || attrs.price || null
                                return (
                                    <Card key={item.id} className="group relative p-4 border hover:border-accent hover:shadow-md transition-all">
                                        {/* Compare button - hover */}
                                        <button
                                            onClick={() => toggleSelect(item.id)}
                                            className={cn(
                                                "absolute top-4 right-4 z-10 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200",
                                                selectedIds.has(item.id)
                                                    ? "bg-orange-500 text-white shadow-md"
                                                    : "bg-card text-muted-foreground shadow-md border border-muted opacity-0 group-hover:opacity-100"
                                            )}
                                            title={selectedIds.has(item.id) ? "Remove from comparison" : "Add to comparison"}
                                        >
                                            <Users className="w-4 h-4" />
                                        </button>
                                        
                                        <div className="flex items-start gap-4">
                                            {/* Main content */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between gap-4">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
                                                                {item.subcategory}
                                                            </Badge>
                                                            {item.is_verified && (
                                                                <ShieldCheck className="w-4 h-4 text-status-success" />
                                                            )}
                                                        </div>
                                                        <h3 className="font-semibold text-foreground truncate">{item.title}</h3>
                                                        {attrs.role && (
                                                            <p className="text-sm text-muted-foreground">{attrs.role}</p>
                                                        )}
                                                    </div>
                                                    
                                                    {/* Price + CTA */}
                                                    <div className="text-right shrink-0 flex items-center gap-3">
                                                        {primaryMetric && (
                                                            <p className="font-bold text-foreground">{primaryMetric}</p>
                                                        )}
                                                        <Button size="sm" variant="default" asChild>
                                                            <a href={`/marketplace/${item.id}`}>View</a>
                                                        </Button>
                                                    </div>
                                                </div>
                                                
                                                {/* Description */}
                                                <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                                                    {item.description}
                                                </p>
                                                
                                                {/* Meta row */}
                                                <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                                                    {attrs.years_experience && (
                                                        <span className="flex items-center gap-1">
                                                            <Briefcase className="w-3 h-3" />
                                                            {attrs.years_experience} years
                                                        </span>
                                                    )}
                                                    {attrs.location && (
                                                        <span className="flex items-center gap-1">
                                                            <MapPin className="w-3 h-3" />
                                                            {attrs.location}
                                                        </span>
                                                    )}
                                                    {attrs.lead_time && (
                                                        <span className="flex items-center gap-1">
                                                            <Clock className="w-3 h-3" />
                                                            {attrs.lead_time}
                                                        </span>
                                                    )}
                                                    {(attrs.skills || attrs.expertise) && (
                                                        <div className="flex gap-1">
                                                            {(attrs.skills || attrs.expertise || []).slice(0, 3).map((skill: string, i: number) => (
                                                                <span key={i} className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                                                    {skill}
                                                                </span>
                                                            ))}
                                                            {(attrs.skills || attrs.expertise || []).length > 3 && (
                                                                <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                                                    +{(attrs.skills || attrs.expertise).length - 3}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </Card>
                                )
                            })}
                        </div>
                    )}

                    {filteredItems.length === 0 && initialListings.length > 0 && (
                        <div className="col-span-full">
                            <EmptyState
                                icon={<Store className="h-12 w-12 text-muted-foreground" />}
                                title={hasActiveFilters ? "No items match your filters" : "No listings found in this category yet"}
                                description={hasActiveFilters ? "Try adjusting your filters or search terms." : "Check back later or browse other categories."}
                                action={hasActiveFilters ? (
                                    <Button variant="secondary" onClick={clearFilters} className="border hover:border-orange-500 hover:text-orange-700">Clear filters</Button>
                                ) : undefined}
                            />
                        </div>
                    )}
                </div>
            </div>

            <ComparisonBar
                selectedItems={selectedItems}
                onClear={clearSelection}
                onCompare={() => setIsComparisonOpen(true)}
                onRemove={(id) => toggleSelect(id)}
            />

            <ComparisonModal
                open={isComparisonOpen}
                onOpenChange={setIsComparisonOpen}
                items={selectedItems}
            />
                </TabsContent>

                {/* My RFQs Tab */}
                <TabsContent value="rfqs" className="mt-0">
                    <div className="space-y-6">
                        {/* Header with refresh */}
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-2xl font-bold">My RFQs</h2>
                                <p className="text-muted-foreground">Request for Quotes you've created</p>
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={fetchMyRfqs}
                                    disabled={isLoadingRfqs}
                                >
                                    {isLoadingRfqs ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <RefreshCw className="h-4 w-4" />
                                    )}
                                    <span className="ml-2">Refresh</span>
                                </Button>
                                <Button asChild>
                                    <a href="/rfq/new">
                                        <FileText className="h-4 w-4 mr-2" />
                                        New RFQ
                                    </a>
                                </Button>
                            </div>
                        </div>

                        {/* Loading state */}
                        {isLoadingRfqs && myRfqs.length === 0 && (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                            </div>
                        )}

                        {/* Empty state */}
                        {!isLoadingRfqs && myRfqs.length === 0 && (
                            <EmptyState
                                icon={<FileText className="h-12 w-12 text-muted-foreground" />}
                                title="No RFQs yet"
                                description="Create a Request for Quote to get competitive bids from suppliers in the marketplace."
                                action={
                                    <Button asChild>
                                        <a href="/rfq/new">Create Your First RFQ</a>
                                    </Button>
                                }
                            />
                        )}

                        {/* RFQ Grid */}
                        {myRfqs.length > 0 && (
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {myRfqs.map((rfq) => (
                                    <RFQCard
                                        key={rfq.id}
                                        rfq={rfq}
                                        role="buyer"
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </TabsContent>

                {/* Saved Resources Tab */}
                <TabsContent value="saved" className="mt-0">
                    <div className="space-y-6">
                        {/* Header with refresh */}
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-2xl font-bold">Saved Listings</h2>
                                <p className="text-muted-foreground">Your favorited marketplace listings</p>
                            </div>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={fetchSavedResources}
                                disabled={isLoadingSaved}
                            >
                                {isLoadingSaved ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <RefreshCw className="h-4 w-4" />
                                )}
                                <span className="ml-2">Refresh</span>
                            </Button>
                        </div>

                        {/* Loading state */}
                        {isLoadingSaved && savedListings.length === 0 && (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                            </div>
                        )}

                        {/* Empty state */}
                        {!isLoadingSaved && savedListings.length === 0 && (
                            <EmptyState
                                icon={<Heart className="h-12 w-12 text-muted-foreground" />}
                                title="No saved listings"
                                description="Save people, products, services, and AI tools from the marketplace to access them quickly later. Click the heart icon on any listing card to save it."
                                action={
                                    <Button variant="secondary" onClick={() => handleTopTabChange('browse')}>
                                        Browse Marketplace
                                    </Button>
                                }
                            />
                        )}

                        {/* Saved Listings Grid */}
                        {savedListings.length > 0 && (
                            <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                {savedListings.map(listing => (
                                    <MarketCard
                                        key={listing.id}
                                        listing={listing}
                                        isSelected={selectedIds.has(listing.id)}
                                        onToggleSelect={toggleSelect}
                                        size={cardSizes[listing.id] || defaultCardSize}
                                        onSizeChange={handleCardSizeChange}
                                        isSaved={true}
                                        onSaveToggle={handleSaveToggle}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    )
}
