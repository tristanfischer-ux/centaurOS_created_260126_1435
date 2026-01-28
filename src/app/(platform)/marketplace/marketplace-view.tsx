'use client'

import { MarketplaceListing } from "@/actions/marketplace"
import { ComparisonBar } from "@/components/marketplace/comparison-bar"
import { ComparisonModal } from "@/components/marketplace/comparison-modal"
import { MarketCard } from "@/components/marketplace/market-card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CreateRFQDialog } from "./create-rfq-dialog"
import { useState, useMemo, useEffect } from "react"
import { Loader2, Store, Search, X, SlidersHorizontal, MapPin, Briefcase, GraduationCap } from "lucide-react"

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
    
    // People-specific filters
    const [subcategoryFilter, setSubcategoryFilter] = useState<string>('all')
    const [locationFilter, setLocationFilter] = useState<string>('all')
    const [skillFilter, setSkillFilter] = useState<string>('all')
    const [minExperience, setMinExperience] = useState<string>('all')

    // Debounce search query
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery)
        }, 300)

        return () => clearTimeout(timer)
    }, [searchQuery])

    // Extract unique values for filter options (only from People)
    const peopleListings = useMemo(() => 
        initialListings.filter(item => item.category === 'People'), 
        [initialListings]
    )

    const subcategories = useMemo(() => 
        [...new Set(peopleListings.map(p => p.subcategory))].sort(),
        [peopleListings]
    )

    const locations = useMemo(() => {
        const locs = peopleListings
            .map(p => p.attributes?.location)
            .filter(Boolean)
        return [...new Set(locs)].sort()
    }, [peopleListings])

    const allSkills = useMemo(() => {
        const skills = new Set<string>()
        peopleListings.forEach(p => {
            const itemSkills = p.attributes?.skills || p.attributes?.expertise || []
            itemSkills.forEach((s: string) => skills.add(s))
        })
        return [...skills].sort()
    }, [peopleListings])

    const toggleSelect = (id: string) => {
        const next = new Set(selectedIds)
        if (next.has(id)) {
            next.delete(id)
        } else {
            if (next.size >= 3) {
                return
            }
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
        setSearchQuery('')
    }

    const hasActiveFilters = subcategoryFilter !== 'all' || locationFilter !== 'all' || 
                             skillFilter !== 'all' || minExperience !== 'all' || searchQuery.trim() !== ''

    // Filter items based on active tab, search query, and filters
    const filteredItems = useMemo(() => {
        let filtered = initialListings.filter(item => item.category === activeTab)
        
        // Apply search filter - search in title, description, and attributes
        if (debouncedSearchQuery.trim()) {
            const query = debouncedSearchQuery.toLowerCase().trim()
            filtered = filtered.filter(item => {
                // Search in title and description
                if (item.title.toLowerCase().includes(query)) return true
                if (item.description?.toLowerCase().includes(query)) return true
                
                // Search in attributes
                const attrs = item.attributes || {}
                for (const value of Object.values(attrs)) {
                    if (typeof value === 'string' && value.toLowerCase().includes(query)) return true
                    if (Array.isArray(value) && value.some(v => v.toLowerCase?.().includes(query))) return true
                }
                return false
            })
        }
        
        // Apply People-specific filters
        if (activeTab === 'People') {
            if (subcategoryFilter !== 'all') {
                filtered = filtered.filter(item => item.subcategory === subcategoryFilter)
            }
            if (locationFilter !== 'all') {
                filtered = filtered.filter(item => item.attributes?.location === locationFilter)
            }
            if (skillFilter !== 'all') {
                filtered = filtered.filter(item => {
                    const skills = item.attributes?.skills || item.attributes?.expertise || []
                    return skills.includes(skillFilter)
                })
            }
            if (minExperience !== 'all') {
                const minYears = parseInt(minExperience)
                filtered = filtered.filter(item => {
                    const years = item.attributes?.years_experience || 0
                    return years >= minYears
                })
            }
        }
        
        return filtered
    }, [initialListings, activeTab, debouncedSearchQuery, subcategoryFilter, locationFilter, skillFilter, minExperience])

    const selectedItems = initialListings.filter(item => selectedIds.has(item.id))

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

                <Tabs value={activeTab} onValueChange={(val) => { setActiveTab(val); clearSelection(); clearFilters() }} className="w-full">
                    <div className="flex flex-col gap-4 mb-6">
                        {/* Search and Filter Controls */}
                        <div className="flex flex-col sm:flex-row gap-3">
                            <div className="relative flex-1 max-w-md">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    type="search"
                                    placeholder={activeTab === 'People' ? "Search by name, skill, role..." : "Search listings..."}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-9 w-full"
                                />
                            </div>
                            {activeTab === 'People' && (
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
                                            <X className="h-3 w-3 mr-1" />
                                            Clear all
                                        </Button>
                                    )}
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                    {/* Role Type */}
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                            <Briefcase className="h-3 w-3" /> Role Type
                                        </label>
                                        <Select value={subcategoryFilter} onValueChange={setSubcategoryFilter}>
                                            <SelectTrigger className="h-9">
                                                <SelectValue placeholder="All roles" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All roles</SelectItem>
                                                {subcategories.map(sub => (
                                                    <SelectItem key={sub} value={sub}>{sub}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Location */}
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                            <MapPin className="h-3 w-3" /> Location
                                        </label>
                                        <Select value={locationFilter} onValueChange={setLocationFilter}>
                                            <SelectTrigger className="h-9">
                                                <SelectValue placeholder="All locations" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All locations</SelectItem>
                                                {locations.map(loc => (
                                                    <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Skills */}
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                            <GraduationCap className="h-3 w-3" /> Skill
                                        </label>
                                        <Select value={skillFilter} onValueChange={setSkillFilter}>
                                            <SelectTrigger className="h-9">
                                                <SelectValue placeholder="Any skill" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">Any skill</SelectItem>
                                                {allSkills.map(skill => (
                                                    <SelectItem key={skill} value={skill}>{skill}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Experience */}
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-muted-foreground">Min. Experience</label>
                                        <Select value={minExperience} onValueChange={setMinExperience}>
                                            <SelectTrigger className="h-9">
                                                <SelectValue placeholder="Any experience" />
                                            </SelectTrigger>
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

                                {/* Active filter badges */}
                                {hasActiveFilters && (
                                    <div className="flex flex-wrap gap-2 pt-2">
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
                                                {minExperience}+ years exp
                                                <X className="h-3 w-3 cursor-pointer" onClick={() => setMinExperience('all')} />
                                            </Badge>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {selectedIds.size === 0 && (
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                                💡 Select up to 3 items to compare
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
                    {activeTab === 'People' && (
                        <p className="text-sm text-muted-foreground mb-4">
                            Showing {filteredItems.length} {filteredItems.length === 1 ? 'person' : 'people'}
                            {hasActiveFilters && ' (filtered)'}
                        </p>
                    )}

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
                                />
                            ))}
                        </div>
                    )}

                    {filteredItems.length === 0 && (
                        <div className="col-span-full bg-slate-100/50 rounded-xl">
                            <EmptyState
                                icon={<Store className="h-12 w-12" />}
                                title={hasActiveFilters ? "No people match your filters" : "No listings found in this category yet"}
                                description={hasActiveFilters ? "Try adjusting your filters or search terms." : "Check back later or browse other categories."}
                                action={hasActiveFilters ? (
                                    <Button variant="outline" onClick={clearFilters}>
                                        Clear filters
                                    </Button>
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
