'use client'

import { MarketplaceListing } from "@/actions/marketplace"
import { ComparisonBar } from "@/components/marketplace/comparison-bar"
import { ComparisonModal } from "@/components/marketplace/comparison-modal"
import { MarketCard } from "@/components/marketplace/market-card"
import { MarketplaceOnboardingModal } from "@/components/onboarding/MarketplaceOnboardingModal"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useState, useMemo, useEffect, useCallback } from "react"
import { Loader2, Store, Search, X, SlidersHorizontal, MapPin, Briefcase, GraduationCap, Bot, Factory, Zap, Shield, LayoutGrid, List, ShieldCheck, Clock, Sparkles, Users, ArrowRight, Bookmark, Star } from "lucide-react"
import { toast } from "sonner"
import { Card } from "@/components/ui/card"
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
    const [activeTab, setActiveTab] = useState("People")
    const [searchQuery, setSearchQuery] = useState('')
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
    const [showFilters, setShowFilters] = useState(false)
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
    
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
        }
    }, [])

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

    // Get listings for current tab
    const currentListings = useMemo(() => 
        initialListings.filter(item => item.category === activeTab), 
        [initialListings, activeTab]
    )

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

    // AI-specific options
    const aiTypes = useMemo(() => {
        if (activeTab !== 'AI') return []
        return [...new Set(currentListings.map(p => p.attributes?.type).filter(Boolean))].sort()
    }, [currentListings, activeTab])

    const aiIntegrations = useMemo(() => {
        if (activeTab !== 'AI') return []
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
    }

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
    }, [activeTab, selectedSubcategories, locationFilter, searchQuery, skillFilter, minExperience, aiTypeFilter, maxCostFilter, integrationFilter, certificationFilter, technologyFilter])

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
        
        // AI-specific filters
        if (activeTab === 'AI') {
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
    }, [currentListings, activeTab, debouncedSearchQuery, selectedSubcategories, locationFilter, skillFilter, minExperience, aiTypeFilter, maxCostFilter, integrationFilter, certificationFilter, technologyFilter])

    const selectedItems = initialListings.filter(item => selectedIds.has(item.id))

    const getSearchPlaceholder = () => {
        switch (activeTab) {
            case 'People': return "Search by name, skill, role..."
            case 'AI': return "Search by name, function, integration..."
            case 'Products': return "Search by company, capability, material..."
            case 'Services': return "Search services..."
            default: return "Search listings..."
        }
    }

    const getResultsLabel = () => {
        const count = filteredItems.length
        switch (activeTab) {
            case 'People': return `${count} ${count === 1 ? 'person' : 'people'}`
            case 'AI': return `${count} AI ${count === 1 ? 'tool' : 'tools'}`
            case 'Products': return `${count} ${count === 1 ? 'listing' : 'listings'}`
            case 'Services': return `${count} ${count === 1 ? 'service' : 'services'}`
            default: return `${count} items`
        }
    }

    const showFiltersButton = ['People', 'AI', 'Products'].includes(activeTab)

    return (
        <div className="space-y-6">
            {/* Marketplace Onboarding Modal for first-time users */}
            {showOnboarding && (
                <MarketplaceOnboardingModal
                    recommendations={onboardingRecommendations}
                    userRole={userRole}
                    onComplete={() => {
                        console.log('Marketplace onboarding completed!')
                    }}
                />
            )}

            <div className="flex flex-col gap-6">

                {/* AI Recommendations Panel */}
                {recommendations.length > 0 && (
                    <Card className="bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200">
                        <div className="p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <Sparkles className="h-5 w-5 text-amber-600" />
                                <h3 className="font-semibold text-amber-900">Recommended for You</h3>
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
                                        className="flex items-center gap-2 px-3 py-2 bg-background rounded border border-amber-200 hover:border-amber-400 hover:shadow-sm transition-all text-left"
                                    >
                                        <div>
                                            <div className="flex items-center gap-1.5">
                                                <Badge variant="secondary" className="text-[10px] bg-amber-100 text-amber-700 border-amber-300">
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
                                        <ArrowRight className="h-3 w-3 text-amber-600 shrink-0" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    </Card>
                )}

                <Tabs value={activeTab} onValueChange={(val) => { setActiveTab(val); clearSelection(); clearFilters(); setShowFilters(false); updateURL(searchQuery, val) }} className="w-full">
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
                            <div className="bg-muted rounded border border p-4 space-y-4 hidden md:block">
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

                        {/* AI Filters Panel */}
                        {activeTab === 'AI' && showFilters && (
                            <div className="bg-violet-50 rounded border border-violet-200 p-4 space-y-4 hidden md:block">
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
                            <div className="bg-muted rounded border border p-4 space-y-4 hidden md:block">
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
                            <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 flex items-start justify-between gap-3">
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

                        {/* Tabs with counts - scrollable on ultra-narrow, grid on wider */}
                        <div className="overflow-x-auto -mx-2 xs:mx-0 px-2 xs:px-0 pb-1">
                            <TabsList className="inline-flex xs:grid w-auto xs:w-full max-w-lg xs:grid-cols-4 min-w-max xs:min-w-0">
                                <TabsTrigger value="People" className="px-3 xs:px-4 gap-1.5">
                                    People
                                    <span className="text-[10px] opacity-60">({initialListings.filter(l => l.category === 'People').length})</span>
                                </TabsTrigger>
                                <TabsTrigger value="Products" className="px-3 xs:px-4 gap-1.5">
                                    Products
                                    <span className="text-[10px] opacity-60">({initialListings.filter(l => l.category === 'Products').length})</span>
                                </TabsTrigger>
                                <TabsTrigger value="Services" className="px-3 xs:px-4 gap-1.5">
                                    Services
                                    <span className="text-[10px] opacity-60">({initialListings.filter(l => l.category === 'Services').length})</span>
                                </TabsTrigger>
                                <TabsTrigger value="AI" className="px-3 xs:px-4 gap-1.5">
                                    AI
                                    <span className="text-[10px] opacity-60">({initialListings.filter(l => l.category === 'AI').length})</span>
                                </TabsTrigger>
                            </TabsList>
                        </div>
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

                    {/* Centaur Matcher - only on AI tab */}
                    {activeTab === 'AI' && (
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
                                <Card className="p-4 bg-gradient-to-r from-violet-50 to-indigo-50 border-violet-200">
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
                                            <div className="space-y-3 pt-3 border-t border-violet-200">
                                                <h4 className="text-sm font-medium text-violet-900">Recommended AI Partners</h4>
                                                {centaurSuggestions.map((suggestion, idx) => {
                                                    const listing = initialListings.find(l => l.id === suggestion.listingId)
                                                    return (
                                                        <div key={suggestion.listingId} className="bg-background rounded-lg p-3 border border-violet-100">
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
                        <div className="flex items-center gap-2">
                            <div className="bg-muted p-1 rounded-md flex items-center">
                                <Button
                                    variant={viewMode === 'grid' ? 'default' : 'ghost'}
                                    size="sm"
                                    onClick={() => setViewMode('grid')}
                                    className={viewMode === 'grid' ? 'shadow-sm h-8 w-8 p-0' : 'h-8 w-8 p-0'}
                                >
                                    <LayoutGrid className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant={viewMode === 'list' ? 'default' : 'ghost'}
                                    size="sm"
                                    onClick={() => setViewMode('list')}
                                    className={viewMode === 'list' ? 'shadow-sm h-8 w-8 p-0' : 'h-8 w-8 p-0'}
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
                        <div className="grid grid-cols-1 fold:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 xs:gap-5 fold:gap-5 lg:gap-6 animate-fade-in">
                            {filteredItems.map(item => (
                                <MarketCard
                                    key={item.id}
                                    listing={item}
                                    isSelected={selectedIds.has(item.id)}
                                    onToggleSelect={toggleSelect}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-3 animate-fade-in">
                            {filteredItems.map(item => {
                                const attrs = item.attributes || {}
                                const primaryMetric = attrs.rate || attrs.cost || attrs.price || null
                                return (
<<<<<<< HEAD
                                    <Card key={item.id} className="group relative p-4 border-slate-200 hover:border-orange-300 hover:shadow-md transition-all">
                                        {/* Compare button - hover */}
                                        <button
                                            onClick={() => toggleSelect(item.id)}
                                            className={cn(
                                                "absolute top-4 right-4 z-10 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200",
                                                selectedIds.has(item.id)
                                                    ? "bg-orange-500 text-white shadow-md"
                                                    : "bg-white/90 text-slate-600 shadow-md border border-slate-200 opacity-0 group-hover:opacity-100"
                                            )}
                                            title={selectedIds.has(item.id) ? "Remove from comparison" : "Add to comparison"}
                                        >
                                            <Users className="w-4 h-4" />
                                        </button>
                                        
=======
                                    <Card key={item.id} className="p-4 border hover:border-orange-200 hover:shadow-sm transition-all">
>>>>>>> feat/design-consistency
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
                                                                <ShieldCheck className="w-4 h-4 text-emerald-600" />
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
                                                                <span key={i} className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                                                    {skill}
                                                                </span>
                                                            ))}
                                                            {(attrs.skills || attrs.expertise || []).length > 3 && (
                                                                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
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
                                icon={<Store className="h-12 w-12 text-slate-300" />}
                                title={hasActiveFilters ? "No items match your filters" : "No listings found in this category yet"}
                                description={hasActiveFilters ? "Try adjusting your filters or search terms." : "Check back later or browse other categories."}
                                action={hasActiveFilters ? (
                                    <Button variant="secondary" onClick={clearFilters} className="border hover:border-orange-500 hover:text-orange-700">Clear filters</Button>
                                ) : undefined}
                            />
                        </div>
                    )}
                </Tabs>
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
        </div>
    )
}
