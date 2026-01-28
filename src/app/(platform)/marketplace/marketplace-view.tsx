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
import { useState, useMemo, useEffect } from "react"
import { Loader2, Store, Search, X, SlidersHorizontal, MapPin, Briefcase, GraduationCap, Bot, Factory, Zap, Shield } from "lucide-react"

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
    
    // Inline expansion state - only one card expanded at a time
    const [expandedId, setExpandedId] = useState<string | null>(null)
    
    // Universal filters
    const [subcategoryFilter, setSubcategoryFilter] = useState<string>('all')
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
        setSubcategoryFilter('all')
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
        const baseFilters = subcategoryFilter !== 'all' || locationFilter !== 'all' || searchQuery.trim() !== ''
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
    }, [activeTab, subcategoryFilter, locationFilter, searchQuery, skillFilter, minExperience, aiTypeFilter, maxCostFilter, integrationFilter, certificationFilter, technologyFilter])

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
        
        // Universal filters
        if (subcategoryFilter !== 'all') {
            filtered = filtered.filter(item => item.subcategory === subcategoryFilter)
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
    }, [currentListings, activeTab, debouncedSearchQuery, subcategoryFilter, locationFilter, skillFilter, minExperience, aiTypeFilter, maxCostFilter, integrationFilter, certificationFilter, technologyFilter])

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
                            <div className="relative flex-1 max-w-md">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    type="search"
                                    placeholder={getSearchPlaceholder()}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-9 w-full"
                                />
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
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                            <Briefcase className="h-3 w-3" /> Role Type
                                        </label>
                                        <Select value={subcategoryFilter} onValueChange={setSubcategoryFilter}>
                                            <SelectTrigger className="h-9"><SelectValue placeholder="All roles" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All roles</SelectItem>
                                                {subcategories.map(sub => <SelectItem key={sub} value={sub}>{sub}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
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
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                            <Briefcase className="h-3 w-3" /> Subcategory
                                        </label>
                                        <Select value={subcategoryFilter} onValueChange={setSubcategoryFilter}>
                                            <SelectTrigger className="h-9"><SelectValue placeholder="All" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All</SelectItem>
                                                {subcategories.map(sub => <SelectItem key={sub} value={sub}>{sub}</SelectItem>)}
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
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                            <Factory className="h-3 w-3" /> Category
                                        </label>
                                        <Select value={subcategoryFilter} onValueChange={setSubcategoryFilter}>
                                            <SelectTrigger className="h-9"><SelectValue placeholder="All categories" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All categories</SelectItem>
                                                {subcategories.map(sub => <SelectItem key={sub} value={sub}>{sub}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
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
                                {subcategoryFilter !== 'all' && (
                                    <Badge variant="secondary" className="gap-1">
                                        {subcategoryFilter}
                                        <X className="h-3 w-3 cursor-pointer" onClick={() => setSubcategoryFilter('all')} />
                                    </Badge>
                                )}
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

                    {/* Results count */}
                    <p className="text-sm text-muted-foreground mb-4">
                        Showing {getResultsLabel()}
                        {hasActiveFilters && ' (filtered)'}
                    </p>

                    {initialListings.length === 0 ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-in fade-in duration-500">
                            {filteredItems.map(item => (
                                <MarketCard
                                    key={item.id}
                                    listing={item}
                                    isSelected={selectedIds.has(item.id)}
                                    onToggleSelect={toggleSelect}
                                    expandedId={expandedId}
                                    onExpandedChange={setExpandedId}
                                />
                            ))}
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
