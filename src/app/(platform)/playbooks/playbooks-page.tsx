'use client'

// INTENT: The Playbooks page is the action-oriented half of what was previously
// the Inspiration page. Everything here leads to creating objectives and tasks.
// Knowledge/reference content (Techniques, Tutorials, Q&A) moved to /learn.

import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  Search,
  X,
  ArrowRight,
  Heart,
  TrendingUp,
  Hammer,
  Clock,
  Wrench,
  DollarSign,
  Target,
  Cpu,
  Lightbulb,
  Users,
  Layers,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { typography } from '@/lib/design-system'
import { cn } from '@/lib/utils'
import type { BlueprintTemplate, UniversalSubsystem, SubsystemObjectivePack } from '@/types/blueprints'
import type { ObjectivePack } from '@/actions/packs'
import type { FoundryContext } from '@/actions/foundry-context'
import { PackCard } from './components/pack-card'
import { IndustrySelector } from './components/industry-selector'
import { INDUSTRY_CATEGORIES, packMatchesCategory } from './components/utils'
import { getProjectTemplates, type ProjectTemplateListItem } from '@/actions/project-templates'
import { getSubsystemObjectivePack } from '@/actions/universal-subsystems'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { UniversalSubsystemsGrid } from '@/components/blueprints/universal-subsystems-grid'
import { SubsystemDetailDialog } from '@/components/blueprints/subsystem-detail-dialog'
import { CreateSubsystemObjectiveDialog } from '@/components/blueprints/create-subsystem-objective-dialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

// ---------------------------------------------------------------------------
// "By Need" tab: packs grouped by business function category
// ---------------------------------------------------------------------------

const NEED_CATEGORIES = [
  { id: 'sales', label: 'Sales & Growth' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'finance', label: 'Finance' },
  { id: 'legal', label: 'Legal & Compliance' },
  { id: 'hr', label: 'People & HR' },
  { id: 'operations', label: 'Operations' },
  { id: 'product', label: 'Product' },
  { id: 'engineering', label: 'Engineering' },
  { id: 'security', label: 'Security' },
  { id: 'startup', label: 'Startup Foundations' },
  { id: 'fundraising', label: 'Fundraising' },
  { id: 'infrastructure', label: 'Infrastructure' },
] as const

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

export type PlaybookTabId = 'by-need' | 'by-industry' | 'projects' | 'subsystems' | 'popular' | 'saved'

interface Tab {
  id: PlaybookTabId
  label: string
  icon: React.ElementType
  count?: number
  activeClasses: string
  iconColor: string
  group: 'discover' | 'utility'
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface TeamMember {
  id: string
  full_name: string
  role: string
  email: string
  avatar_url?: string | null
}

interface PlaybooksPageProps {
  templates?: BlueprintTemplate[]
  packs?: ObjectivePack[]
  initialSavedPackIds?: string[]
  foundryContext?: FoundryContext
  members?: TeamMember[]
  universalSubsystems?: UniversalSubsystem[]
  /** When true, hides the standalone page header (used when embedded below objectives) */
  embedded?: boolean
}

export function PlaybooksPage({
  templates = [],
  packs = [],
  initialSavedPackIds = [],
  foundryContext,
  members = [],
  universalSubsystems = [],
  embedded = false,
}: PlaybooksPageProps) {
  const [activeTab, setActiveTab] = useState<PlaybookTabId>('by-need')

  // Saved packs
  const [savedPackIds, setSavedPackIds] = useState<Set<string>>(
    new Set(initialSavedPackIds),
  )

  // Universal Subsystems state
  const [selectedSubsystem, setSelectedSubsystem] = useState<UniversalSubsystem | null>(null)
  const [selectedSubsystemPack, setSelectedSubsystemPack] = useState<SubsystemObjectivePack | null>(null)
  const [isSubsystemDialogOpen, setIsSubsystemDialogOpen] = useState(false)
  const [isCreateObjectiveOpen, setIsCreateObjectiveOpen] = useState(false)

  useEffect(() => {
    async function fetchPack(): Promise<void> {
      if (selectedSubsystem) {
        const pack = await getSubsystemObjectivePack(selectedSubsystem.id)
        setSelectedSubsystemPack(pack)
      } else {
        setSelectedSubsystemPack(null)
      }
    }
    fetchPack()
  }, [selectedSubsystem])

  const handleSubsystemClick = useCallback((subsystem: UniversalSubsystem) => {
    setSelectedSubsystem(subsystem)
    setIsSubsystemDialogOpen(true)
  }, [])

  const handleCreateObjective = useCallback((subsystem: UniversalSubsystem, pack: SubsystemObjectivePack) => {
    setSelectedSubsystem(subsystem)
    setSelectedSubsystemPack(pack)
    setIsSubsystemDialogOpen(false)
    setIsCreateObjectiveOpen(true)
  }, [])

  // "By Need" selected category
  const [selectedNeed, setSelectedNeed] = useState<string | null>(null)

  // Projects state (lazy-loaded on tab switch)
  const [projectTemplates, setProjectTemplates] = useState<ProjectTemplateListItem[]>([])
  const [projectsTotal, setProjectsTotal] = useState(0)
  const [projectsLoaded, setProjectsLoaded] = useState(false)
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [selectedProject, setSelectedProject] = useState<ProjectTemplateListItem | null>(null)

  useEffect(() => {
    if (activeTab !== 'projects' || projectsLoaded || projectsLoading) return
    setProjectsLoading(true)
    getProjectTemplates({ pageSize: 50 }).then((result) => {
      if ('data' in result) {
        setProjectTemplates(result.data)
        setProjectsTotal(result.total)
      }
      setProjectsLoaded(true)
      setProjectsLoading(false)
    })
  }, [activeTab, projectsLoaded, projectsLoading])

  // Search & filter (for by-need tab)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [difficultyFilter, setDifficultyFilter] = useState('all')
  const [sortBy, setSortBy] = useState<
    'relevance' | 'name' | 'difficulty' | 'duration'
  >('relevance')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => clearTimeout(t)
  }, [searchQuery])

  const clearFilters = useCallback(() => {
    setSearchQuery('')
    setDebouncedSearch('')
    setDifficultyFilter('all')
    setSortBy('relevance')
  }, [])

  useEffect(() => {
    clearFilters()
    setSelectedNeed(null)
  }, [activeTab, clearFilters])

  const handleSaveToggle = useCallback((packId: string, isSaved: boolean) => {
    setSavedPackIds(prev => {
      const next = new Set(prev)
      if (isSaved) {
        next.add(packId)
      } else {
        next.delete(packId)
      }
      return next
    })
  }, [])

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  const allFunctionalPacks = useMemo(
    () => packs.filter(p =>
      packMatchesCategory(p, 'business') || packMatchesCategory(p, 'subsystems')
    ),
    [packs],
  )

  const industryCount = useMemo(
    () => templates.filter(t => INDUSTRY_CATEGORIES.has(t.product_category)).length,
    [templates],
  )

  const ctx = foundryContext || null

  const savedPacks = useMemo(
    () => packs.filter(p => savedPackIds.has(p.id)),
    [packs, savedPackIds],
  )

  const popularPacks = useMemo(() => {
    return [...packs]
      .sort((a, b) => (b.items?.length || 0) - (a.items?.length || 0))
  }, [packs])

  const needGroups = useMemo(() => {
    return NEED_CATEGORIES
      .map(nc => ({
        ...nc,
        packs: allFunctionalPacks.filter(p => {
          const cat = p.category?.toLowerCase() || ''
          return cat.includes(nc.id)
        }),
        hasGap: ctx?.gapCategories.some(gc =>
          gc.toLowerCase().replace(/[& ]/g, '').includes(nc.id) ||
          nc.id.includes(gc.toLowerCase().replace(/[& ]/g, ''))
        ) || false,
      }))
      .filter(g => g.packs.length > 0)
  }, [allFunctionalPacks, ctx])

  const filteredNeedPacks = useMemo(() => {
    if (!selectedNeed) return []
    const group = needGroups.find(g => g.id === selectedNeed)
    if (!group) return []
    let filtered = group.packs

    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase()
      filtered = filtered.filter(
        p =>
          p.title?.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q) ||
          p.items?.some(i => i.title?.toLowerCase().includes(q)),
      )
    }

    if (difficultyFilter !== 'all') {
      filtered = filtered.filter(
        p => p.difficulty?.toLowerCase() === difficultyFilter.toLowerCase(),
      )
    }

    const sorted = [...filtered]
    switch (sortBy) {
      case 'name':
        sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
        break
      case 'difficulty': {
        const order: Record<string, number> = { Easy: 1, Medium: 2, Hard: 3 }
        sorted.sort(
          (a, b) =>
            (order[a.difficulty || ''] || 2) - (order[b.difficulty || ''] || 2),
        )
        break
      }
      case 'duration':
        sorted.sort((a, b) => {
          const n = (s: string | null | undefined) => {
            const m = s?.match(/(\d+)/)
            return m ? parseInt(m[1]) : 999
          }
          return n(a.estimated_duration) - n(b.estimated_duration)
        })
        break
    }
    return sorted
  }, [selectedNeed, needGroups, debouncedSearch, difficultyFilter, sortBy])

  const availableDifficulties = useMemo(
    () => [...new Set(packs.map(p => p.difficulty).filter(Boolean))] as string[],
    [packs],
  )
  const hasActiveFilters = searchQuery.trim() !== '' || difficultyFilter !== 'all'

  // ---------------------------------------------------------------------------
  // Tab config
  // ---------------------------------------------------------------------------

  const gapCount = ctx?.gapCategories?.length || 0

  const tabs: Tab[] = useMemo(() => [
    {
      id: 'by-need',
      label: 'By Need',
      icon: Target,
      count: gapCount > 0 ? gapCount : allFunctionalPacks.length,
      iconColor: 'text-electric-blue',
      activeClasses: 'bg-electric-blue/10 text-electric-blue border-electric-blue',
      group: 'discover',
    },
    {
      id: 'by-industry',
      label: 'By Industry',
      icon: Layers,
      count: industryCount,
      iconColor: 'text-chart-5',
      activeClasses: 'bg-chart-5/10 text-chart-5 border-chart-5',
      group: 'discover',
    },
    {
      id: 'projects',
      label: 'Projects',
      icon: Hammer,
      count: projectsTotal,
      iconColor: 'text-chart-4',
      activeClasses: 'bg-chart-4/10 text-chart-4 border-chart-4',
      group: 'discover',
    },
    {
      id: 'subsystems',
      label: 'Subsystems',
      icon: Cpu,
      count: universalSubsystems.length,
      iconColor: 'text-international-orange',
      activeClasses: 'bg-international-orange/10 text-international-orange border-international-orange',
      group: 'discover',
    },
    {
      id: 'popular',
      label: 'All Packs',
      icon: TrendingUp,
      count: popularPacks.length,
      iconColor: 'text-status-success',
      activeClasses: 'bg-status-success-light text-status-success-dark border-status-success',
      group: 'utility',
    },
    {
      id: 'saved',
      label: 'Saved',
      icon: Heart,
      count: savedPackIds.size,
      iconColor: 'text-muted-foreground',
      activeClasses: 'bg-international-orange/10 text-international-orange border-international-orange',
      group: 'utility',
    },
  ], [gapCount, allFunctionalPacks.length, industryCount, projectsTotal, universalSubsystems.length, popularPacks.length, savedPackIds.size])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Page header — hidden when embedded below objectives */}
      {!embedded && (
        <div className="pb-4 border-b border-muted">
          <div className={typography.pageHeader}>
            <div className={typography.pageHeaderAccent} />
            <h1 className={typography.h1}>
              <Lightbulb className="h-7 w-7 mr-3 inline-block text-international-orange" />
              Playbooks
            </h1>
          </div>
          <p className={cn(typography.pageSubtitle, 'mt-1')}>
            Find pre-built plans and turn them into objectives and tasks for your team.
          </p>
        </div>
      )}

      {/* Tab bar with visual grouping */}
      <div className="flex flex-wrap items-center gap-2" role="tablist">
        {tabs.map((tab, index) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          const prevTab = tabs[index - 1]
          const showSeparator = prevTab && prevTab.group === 'discover' && tab.group === 'utility'

          return (
            <div key={tab.id} className="flex items-center gap-2">
              {showSeparator && (
                <div className="h-6 w-px bg-border mx-1" />
              )}
              <button
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium',
                  'border transition-all duration-200 select-none',
                  isActive
                    ? cn(tab.activeClasses, 'shadow-sm')
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted',
                )}
              >
                <Icon className={cn('h-4 w-4', !isActive && tab.iconColor)} />
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span
                    className={cn(
                      'text-xs tabular-nums px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center',
                      isActive ? 'bg-white/60' : 'bg-muted',
                    )}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            </div>
          )
        })}
      </div>

      {/* ================================================================== */}
      {/* BY NEED tab                                                        */}
      {/* ================================================================== */}
      {activeTab === 'by-need' && !selectedNeed && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Select a business function to explore relevant objective packs.
            {ctx?.gapCategories && ctx.gapCategories.length > 0 && (
              <> Categories with <Badge variant="secondary" className="text-[10px] mx-1 bg-status-warning-light text-status-warning-dark">gaps</Badge> are areas where you have coverage gaps.</>
            )}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {needGroups.map(group => (
              <Card
                key={group.id}
                className={cn(
                  'cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-200',
                  group.hasGap
                    ? 'border-status-warning/40 hover:border-status-warning'
                    : 'hover:border-electric-blue/40',
                )}
                onClick={() => setSelectedNeed(group.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-sm">{group.label}</h3>
                    <div className="flex items-center gap-1.5">
                      {group.hasGap && (
                        <Badge variant="secondary" className="text-[9px] bg-status-warning-light text-status-warning-dark">
                          Gap
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-[10px]">
                        {group.packs.length} {group.packs.length === 1 ? 'pack' : 'packs'}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {group.packs.slice(0, 3).map(p => p.title).join(', ')}
                    {group.packs.length > 3 ? ` +${group.packs.length - 3} more` : ''}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* By Need -- selected category with search/filter */}
      {activeTab === 'by-need' && selectedNeed && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedNeed(null)}
              className="-ml-2"
            >
              <ArrowRight className="h-4 w-4 mr-1 rotate-180" />
              All Needs
            </Button>
            <div className="h-4 w-px bg-border" />
            <h3 className="font-semibold">
              {needGroups.find(g => g.id === selectedNeed)?.label}
            </h3>
            {needGroups.find(g => g.id === selectedNeed)?.hasGap && (
              <Badge variant="secondary" className="text-[9px] bg-status-warning-light text-status-warning-dark">
                Coverage Gap
              </Badge>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-lg">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search packs..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-10 pr-10"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Select value={sortBy} onValueChange={v => setSortBy(v as typeof sortBy)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="relevance">Relevant</SelectItem>
                  <SelectItem value="name">Name A-Z</SelectItem>
                  <SelectItem value="difficulty">Difficulty</SelectItem>
                  <SelectItem value="duration">Duration</SelectItem>
                </SelectContent>
              </Select>
              <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Difficulty" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All levels</SelectItem>
                  {availableDifficulties.map(d => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs gap-1">
                  <X className="h-3 w-3" /> Clear
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {filteredNeedPacks.length} {filteredNeedPacks.length === 1 ? 'pack' : 'packs'}
            </span>
            {hasActiveFilters && (
              <Badge variant="secondary" className="text-xs">Filtered</Badge>
            )}
          </div>

          {filteredNeedPacks.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <Search className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                <h3 className="text-base font-semibold mb-1">No packs found</h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-3">
                  {hasActiveFilters
                    ? 'Try adjusting your search or filters.'
                    : 'No packs available in this category yet.'}
                </p>
                {hasActiveFilters && (
                  <Button variant="outline" size="sm" onClick={clearFilters} className="gap-1.5">
                    <X className="h-3.5 w-3.5" /> Clear filters
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-fade-in">
              {filteredNeedPacks.map(pack => (
                <PackCard
                  key={pack.id}
                  pack={pack}
                  isSaved={savedPackIds.has(pack.id)}
                  onSaveToggle={handleSaveToggle}
                  members={members}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* BY INDUSTRY tab                                                    */}
      {/* ================================================================== */}
      {activeTab === 'by-industry' && (
        <IndustrySelector
          templates={templates}
          savedPackIds={savedPackIds}
          onSaveToggle={handleSaveToggle}
          defaultIndustry={ctx?.industry || undefined}
          members={members}
        />
      )}

      {/* ================================================================== */}
      {/* PROJECTS tab                                                       */}
      {/* ================================================================== */}
      {activeTab === 'projects' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Complete starter projects with bill of materials, step-by-step instructions, and cost estimates.
          </p>

          {projectsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-48 rounded-xl" />
              ))}
            </div>
          ) : projectTemplates.length === 0 ? (
            <EmptyState
              title="Project templates are being prepared"
              description="Check back soon as new project templates are added."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-fade-in">
              {projectTemplates.map((project) => (
                <Card
                  key={project.id}
                  className="cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 hover:border-international-orange/30"
                  onClick={() => setSelectedProject(project)}
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">
                        {project.title}
                      </h3>
                      {project.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {project.description}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {project.difficulty && (
                        <Badge
                          variant={
                            project.difficulty === 'beginner' ? 'success' :
                            project.difficulty === 'intermediate' ? 'warning' :
                            'destructive'
                          }
                          className="text-[10px]"
                        >
                          {project.difficulty}
                        </Badge>
                      )}
                      {project.category && (
                        <Badge variant="secondary" className="text-[10px]">
                          {project.category}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1 border-t border-muted">
                      {project.estimated_hours != null && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {project.estimated_hours}h
                        </span>
                      )}
                      {project.estimated_cost_usd != null && (
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          ${project.estimated_cost_usd}
                        </span>
                      )}
                      {project.step_count > 0 && (
                        <span>{project.step_count} steps</span>
                      )}
                      {project.bom_count > 0 && (
                        <span>{project.bom_count} parts</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Project Detail Dialog */}
          <Dialog open={!!selectedProject} onOpenChange={(open) => !open && setSelectedProject(null)}>
            <DialogContent size="lg" className="max-h-[90vh] flex flex-col">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Hammer className="h-5 w-5 text-chart-4" />
                  {selectedProject?.title}
                </DialogTitle>
              </DialogHeader>
              {selectedProject && (
                <div className="flex-1 overflow-y-auto space-y-6 pb-4">
                  {selectedProject.description && (
                    <p className="text-sm text-muted-foreground">{selectedProject.description}</p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {selectedProject.difficulty && (
                      <Badge variant={
                        selectedProject.difficulty === 'beginner' ? 'success' :
                        selectedProject.difficulty === 'intermediate' ? 'warning' :
                        'destructive'
                      }>
                        {selectedProject.difficulty}
                      </Badge>
                    )}
                    {selectedProject.estimated_hours != null && (
                      <Badge variant="secondary">
                        <Clock className="h-3 w-3 mr-1" />
                        {selectedProject.estimated_hours} hours
                      </Badge>
                    )}
                    {selectedProject.estimated_cost_usd != null && (
                      <Badge variant="secondary">
                        <DollarSign className="h-3 w-3 mr-1" />
                        ${selectedProject.estimated_cost_usd} estimated
                      </Badge>
                    )}
                  </div>

                  {selectedProject.tools_required.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-foreground mb-2">Tools Required</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedProject.tools_required.map((tool, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            <Wrench className="h-3 w-3 mr-1" />
                            {tool}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedProject.skills_required.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-foreground mb-2">Skills Required</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedProject.skills_required.map((skill, i) => (
                          <Badge key={i} variant="outline" className="text-xs">{skill}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedProject.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedProject.tags.map((tag, i) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedProject(null)}>
                  Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* ================================================================== */}
      {/* SUBSYSTEMS tab                                                     */}
      {/* ================================================================== */}
      {activeTab === 'subsystems' && (
        <div className="space-y-4">
          <Card className="bg-gradient-to-r from-orange-50 to-background border-orange-100">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-orange-100 rounded-xl shrink-0">
                  <Cpu className="h-6 w-6 text-international-orange" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground mb-1">Universal Subsystems</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Technical domains that apply to any hardware or software product. Get detailed guidance,
                    key questions to answer, and create objectives with pre-built tasks.
                  </p>
                  <div className="flex flex-wrap gap-3 text-xs">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Target className="h-3.5 w-3.5 text-international-orange" />
                      <span>Create objectives with 5-6 pre-built tasks</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Users className="h-3.5 w-3.5 text-electric-blue" />
                      <span>Auto-includes marketplace discovery tasks</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Lightbulb className="h-3.5 w-3.5 text-status-success" />
                      <span>Detailed primers &amp; key questions</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {universalSubsystems.length > 0 ? (
            <UniversalSubsystemsGrid
              subsystems={universalSubsystems}
              onSubsystemClick={handleSubsystemClick}
            />
          ) : (
            <EmptyState
              title="No subsystems available"
              description="Universal subsystems will appear here once configured."
            />
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* ALL PACKS tab                                                      */}
      {/* ================================================================== */}
      {activeTab === 'popular' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Browse all available objective packs, sorted by comprehensiveness.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-fade-in">
            {popularPacks.map(pack => (
              <PackCard
                key={pack.id}
                pack={pack}
                isSaved={savedPackIds.has(pack.id)}
                onSaveToggle={handleSaveToggle}
                members={members}
              />
            ))}
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* SAVED tab                                                          */}
      {/* ================================================================== */}
      {activeTab === 'saved' && (
        <>
          {savedPacks.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <Heart className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                <h3 className="text-base font-semibold mb-1">No saved packs yet</h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  Click the heart icon on any pack to save it for later.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-fade-in">
              {savedPacks.map(pack => (
                <PackCard
                  key={pack.id}
                  pack={pack}
                  isSaved={true}
                  onSaveToggle={handleSaveToggle}
                  members={members}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Subsystem dialogs */}
      <SubsystemDetailDialog
        subsystem={selectedSubsystem}
        objectivePack={selectedSubsystemPack}
        open={isSubsystemDialogOpen}
        onOpenChange={setIsSubsystemDialogOpen}
        onCreateObjective={handleCreateObjective}
      />
      <CreateSubsystemObjectiveDialog
        subsystem={selectedSubsystem}
        objectivePack={selectedSubsystemPack}
        open={isCreateObjectiveOpen}
        onOpenChange={setIsCreateObjectiveOpen}
      />
    </div>
  )
}
