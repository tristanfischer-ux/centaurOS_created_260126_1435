'use client'

import { MarketplaceListing } from "@/actions/marketplace"
import { ComparisonBar } from "@/components/marketplace/comparison-bar"
import { ComparisonModal } from "@/components/marketplace/comparison-modal"
import { MarketCard } from "@/components/marketplace/market-card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CreateRFQDialog } from "./create-rfq-dialog"
import { useState, useMemo, useEffect, useCallback } from "react"
import { Loader2, Store, Search, X, SlidersHorizontal, MapPin, Briefcase, GraduationCap, Bot, Factory, Zap, Shield, LayoutGrid, List, ShieldCheck, Clock, Sparkles, Users, ArrowRight } from "lucide-react"
import { toast } from "sonner"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"

interface MarketplaceViewProps {
    initialListings: MarketplaceListing[]
}

export function MarketplaceView({ initialListings }: MarketplaceViewProps) {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [isComparisonOpen, setIsComparisonOpen] = useState(false)
    const [activeTab, setActiveTab] = useState("People")
    const [searchQuery, setSearchQuery] = useState('')
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
    const [showFilters, setShowFilters] = useState(false)
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
    
    // Global expansion state - all cards expand/collapse together
    const [allExpanded, setAllExpanded] = useState(false)
    
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
        <div className="container mx-auto py-8">
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-2">
                            <h1 className="text-3xl font-bold tracking-tight">Centaur Marketplace</h1>
                            <p className="text-muted-foreground">Access global expertise, industrial capacity, and autonomous agents.</p>
                        </div>
                        <CreateRFQDialog />
                    </div>
                </div>

                <Tabs value={activeTab} onValueChange={(val) => { setActiveTab(val); clearSelection(); clearFilters(); setShowFilters(false) }} className="w-full">
                    <div className="flex flex-col gap-4 mb-6">
                        {/* Search and Filter Controls */}
                        <div className="flex flex-col sm:flex-row gap-3">
                            <div className="relative flex-1 max-w-md flex gap-2">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        type="search"
                                        placeholder={aiSearchEnabled ? "Describe what you're looking for..." : getSearchPlaceholder()}
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && aiSearchEnabled) {
                                                e.preventDefault()
                                                handleAiSearch()
                                            }
                                        }}
                                        className="pl-9 w-full"
                                    />
                                </div>
                                <Button
                                    variant={aiSearchEnabled ? "default" : "outline"}
                                    size="icon"
                                    onClick={() => {
                                        if (aiSearchEnabled && searchQuery.trim()) {
                                            handleAiSearch()
                                        } else {
                                            setAiSearchEnabled(!aiSearchEnabled)
                                            if (!aiSearchEnabled) {
                                                toast.info('AI Search enabled - describe what you need')
                                            }
                                        }
                                    }}
                                    disabled={isAiSearching}
                                    title={aiSearchEnabled ? "Search with AI" : "Enable AI Search"}
                                    className={aiSearchEnabled ? "bg-violet-600 hover:bg-violet-700" : ""}
                                >
                                    {isAiSearching ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Sparkles className="h-4 w-4" />
                                    )}
                                </Button>
                            </div>
                            {showFiltersButton && (
                                <Button 
                                    variant="outline" 
                                    size="default"
                                    onClick={() => setShowFilters(!showFilters)}
                                    className={showFilters ? 'bg-slate-100' : ''}
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

                        {/* People Filters Panel */}
                        {activeTab === 'People' && showFilters && (
                            <div className="bg-slate-50 rounded-lg p-4 space-y-4">
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
                            <div className="bg-violet-50 rounded-lg p-4 space-y-4">
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
                            <div className="bg-slate-100 rounded-lg p-4 space-y-4">
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

                        {selectedIds.size === 0 && (
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                                Select up to 3 items to compare
                            </p>
                        )}
                        <TabsList className="grid w-full max-w-md grid-cols-4">
                            <TabsTrigger value="People">People</TabsTrigger>
                            <TabsTrigger value="Products">Products</TabsTrigger>
                            <TabsTrigger value="Services">Services</TabsTrigger>
                            <TabsTrigger value="AI">AI</TabsTrigger>
                        </TabsList>
                    </div>

                    {/* Subcategory quick filters - multi-select pills */}
                    {subcategories.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 mb-4">
                            <span className="text-xs text-muted-foreground mr-1">Filter:</span>
                            {subcategories.map(sub => (
                                <button
                                    key={sub}
                                    onClick={() => toggleSubcategory(sub)}
                                    className={`px-3 py-1.5 text-xs font-medium transition-all ${
                                        selectedSubcategories.has(sub)
                                            ? 'bg-international-orange text-white'
                                            : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                                    }`}
                                >
                                    {sub}
                                </button>
                            ))}
                            {selectedSubcategories.size > 0 && (
                                <button
                                    onClick={() => setSelectedSubcategories(new Set())}
                                    className="px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
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
                                                <Input
                                                    placeholder="Enter member ID (from team page)"
                                                    value={selectedMemberId}
                                                    onChange={(e) => setSelectedMemberId(e.target.value)}
                                                    className="bg-white"
                                                />
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
                                                        <div key={suggestion.listingId} className="bg-white rounded-lg p-3 border border-violet-100">
                                                            <div className="flex items-start justify-between gap-3">
                                                                <div className="flex-1">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-xs font-bold text-violet-600">#{idx + 1}</span>
                                                                        <h5 className="font-medium text-slate-900">{suggestion.title}</h5>
                                                                        <Badge className="bg-violet-100 text-violet-700 text-xs">
                                                                            {suggestion.compatibilityScore}/10
                                                                        </Badge>
                                                                    </div>
                                                                    <p className="text-sm text-slate-600 mt-1">{suggestion.reasoning}</p>
                                                                    {suggestion.useCases.length > 0 && (
                                                                        <div className="flex flex-wrap gap-1 mt-2">
                                                                            {suggestion.useCases.slice(0, 3).map((useCase, i) => (
                                                                                <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                                                                                    {useCase}
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                {listing && (
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
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

                    {/* Results count, view toggle, and expand all */}
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-sm text-muted-foreground">
                            Showing {getResultsLabel()}
                            {hasActiveFilters && ' (filtered)'}
                        </p>
                        <div className="flex items-center gap-2">
                            {viewMode === 'grid' && filteredItems.length > 0 && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setAllExpanded(!allExpanded)}
                                    className="text-xs text-muted-foreground hover:text-foreground"
                                >
                                    {allExpanded ? 'Collapse All' : 'Expand All'}
                                </Button>
                            )}
                            <div className="bg-muted p-1 flex items-center">
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
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-in fade-in duration-500">
                            {filteredItems.map(item => (
                                <MarketCard
                                    key={item.id}
                                    listing={item}
                                    isSelected={selectedIds.has(item.id)}
                                    onToggleSelect={toggleSelect}
                                    isExpanded={allExpanded}
                                    onToggleExpandAll={() => setAllExpanded(!allExpanded)}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-3 animate-in fade-in duration-500">
                            {filteredItems.map(item => {
                                const attrs = item.attributes || {}
                                return (
                                    <Card key={item.id} className="p-4 hover:shadow-md transition-shadow">
                                        <div className="flex items-start gap-4">
                                            {/* Checkbox */}
                                            <Checkbox
                                                checked={selectedIds.has(item.id)}
                                                onCheckedChange={() => toggleSelect(item.id)}
                                                className="mt-1"
                                            />
                                            
                                            {/* Main content */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between gap-4">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
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
                                                    
                                                    {/* Key metrics */}
                                                    <div className="text-right shrink-0">
                                                        {attrs.rate && (
                                                            <p className="font-semibold text-foreground">{attrs.rate}</p>
                                                        )}
                                                        {attrs.cost && (
                                                            <p className="font-semibold text-foreground">{attrs.cost}</p>
                                                        )}
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
                                                                <span key={i} className="px-2 py-0.5 bg-muted text-muted-foreground">
                                                                    {skill}
                                                                </span>
                                                            ))}
                                                            {(attrs.skills || attrs.expertise || []).length > 3 && (
                                                                <span className="px-2 py-0.5 bg-muted text-muted-foreground">
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
                        <div className="col-span-full bg-slate-100/50 rounded-xl">
                            <EmptyState
                                icon={<Store className="h-12 w-12" />}
                                title={hasActiveFilters ? "No items match your filters" : "No listings found in this category yet"}
                                description={hasActiveFilters ? "Try adjusting your filters or search terms." : "Check back later or browse other categories."}
                                action={hasActiveFilters ? (
                                    <Button variant="outline" onClick={clearFilters}>Clear filters</Button>
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
