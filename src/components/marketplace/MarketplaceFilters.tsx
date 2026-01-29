'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger, SheetFooter } from '@/components/ui/sheet'
import { X, SlidersHorizontal, MapPin, GraduationCap, Bot, Zap, Shield } from 'lucide-react'

interface MarketplaceFiltersProps {
    activeTab: string
    // Filter values
    locationFilter: string
    setLocationFilter: (value: string) => void
    skillFilter: string
    setSkillFilter: (value: string) => void
    minExperience: string
    setMinExperience: (value: string) => void
    aiTypeFilter: string
    setAiTypeFilter: (value: string) => void
    maxCostFilter: string
    setMaxCostFilter: (value: string) => void
    integrationFilter: string
    setIntegrationFilter: (value: string) => void
    certificationFilter: string
    setCertificationFilter: (value: string) => void
    technologyFilter: string
    setTechnologyFilter: (value: string) => void
    // Options
    locations: string[]
    allSkills: string[]
    aiTypes: string[]
    aiIntegrations: string[]
    certifications: string[]
    technologies: string[]
    // Actions
    clearFilters: () => void
    hasActiveFilters: boolean
    activeFilterCount: number
}

export function MarketplaceFilters({
    activeTab,
    locationFilter,
    setLocationFilter,
    skillFilter,
    setSkillFilter,
    minExperience,
    setMinExperience,
    aiTypeFilter,
    setAiTypeFilter,
    maxCostFilter,
    setMaxCostFilter,
    integrationFilter,
    setIntegrationFilter,
    certificationFilter,
    setCertificationFilter,
    technologyFilter,
    setTechnologyFilter,
    locations,
    allSkills,
    aiTypes,
    aiIntegrations,
    certifications,
    technologies,
    clearFilters,
    hasActiveFilters,
    activeFilterCount,
}: MarketplaceFiltersProps) {
    const [isOpen, setIsOpen] = useState(false)

    const showFiltersButton = ['People', 'AI', 'Products'].includes(activeTab)

    if (!showFiltersButton) return null

    const renderFilters = () => {
        if (activeTab === 'People') {
            return (
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> Location
                        </label>
                        <Select value={locationFilter} onValueChange={setLocationFilter}>
                            <SelectTrigger><SelectValue placeholder="All locations" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All locations</SelectItem>
                                {locations.map(loc => <SelectItem key={loc} value={loc}>{loc}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                            <GraduationCap className="h-3 w-3" /> Skill
                        </label>
                        <Select value={skillFilter} onValueChange={setSkillFilter}>
                            <SelectTrigger><SelectValue placeholder="Any skill" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Any skill</SelectItem>
                                {allSkills.map(skill => <SelectItem key={skill} value={skill}>{skill}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-muted-foreground">Min. Experience</label>
                        <Select value={minExperience} onValueChange={setMinExperience}>
                            <SelectTrigger><SelectValue placeholder="Any experience" /></SelectTrigger>
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
            )
        }

        if (activeTab === 'AI') {
            return (
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                            <Bot className="h-3 w-3" /> Type
                        </label>
                        <Select value={aiTypeFilter} onValueChange={setAiTypeFilter}>
                            <SelectTrigger><SelectValue placeholder="All types" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All types</SelectItem>
                                {aiTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                            <Zap className="h-3 w-3" /> Max Cost
                        </label>
                        <Select value={maxCostFilter} onValueChange={setMaxCostFilter}>
                            <SelectTrigger><SelectValue placeholder="Any cost" /></SelectTrigger>
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
                        <label className="text-sm font-medium text-muted-foreground">Integration</label>
                        <Select value={integrationFilter} onValueChange={setIntegrationFilter}>
                            <SelectTrigger><SelectValue placeholder="Any integration" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Any integration</SelectItem>
                                {aiIntegrations.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            )
        }

        if (activeTab === 'Products') {
            return (
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> Location
                        </label>
                        <Select value={locationFilter} onValueChange={setLocationFilter}>
                            <SelectTrigger><SelectValue placeholder="All locations" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All locations</SelectItem>
                                {locations.map(loc => <SelectItem key={loc} value={loc}>{loc}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                            <Shield className="h-3 w-3" /> Certification
                        </label>
                        <Select value={certificationFilter} onValueChange={setCertificationFilter}>
                            <SelectTrigger><SelectValue placeholder="Any certification" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Any certification</SelectItem>
                                {certifications.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-muted-foreground">Technology</label>
                        <Select value={technologyFilter} onValueChange={setTechnologyFilter}>
                            <SelectTrigger><SelectValue placeholder="Any technology" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Any technology</SelectItem>
                                {technologies.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            )
        }

        return null
    }

    return (
        <>
            {/* Mobile: Sheet Trigger */}
            <div className="md:hidden">
                <Sheet open={isOpen} onOpenChange={setIsOpen}>
                    <SheetTrigger asChild>
                        <Button variant="secondary" size="default" className="relative">
                            <SlidersHorizontal className="h-4 w-4 mr-2" />
                            Filters
                            {activeFilterCount > 0 && (
                                <Badge className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-[10px]">
                                    {activeFilterCount}
                                </Badge>
                            )}
                        </Button>
                    </SheetTrigger>
                    <SheetContent side="bottom" className="h-[80vh]">
                        <SheetHeader>
                            <SheetTitle>Filter {activeTab}</SheetTitle>
                            <SheetDescription>
                                Narrow down your search results
                            </SheetDescription>
                        </SheetHeader>
                        <div className="py-6 overflow-y-auto">
                            {renderFilters()}
                        </div>
                        <SheetFooter className="flex-row gap-2">
                            {hasActiveFilters && (
                                <Button 
                                    variant="secondary" 
                                    onClick={() => { clearFilters(); setIsOpen(false); }} 
                                    className="flex-1"
                                >
                                    <X className="h-4 w-4 mr-1" /> Clear all
                                </Button>
                            )}
                            <Button onClick={() => setIsOpen(false)} className="flex-1">
                                Apply Filters
                            </Button>
                        </SheetFooter>
                    </SheetContent>
                </Sheet>
            </div>

            {/* Desktop: Inline button (existing behavior controlled by parent) */}
            <div className="hidden md:block">
                <Button 
                    variant="secondary" 
                    size="default"
                    className="relative"
                >
                    <SlidersHorizontal className="h-4 w-4 mr-2" />
                    Filters
                    {activeFilterCount > 0 && (
                        <Badge className="ml-2 h-5 w-5 p-0 flex items-center justify-center text-[10px]">
                            {activeFilterCount}
                        </Badge>
                    )}
                </Button>
            </div>
        </>
    )
}
