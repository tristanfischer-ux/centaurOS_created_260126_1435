'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  Lightbulb,
  Search,
  X,
  ArrowRight,
  Heart,
  TrendingUp,
  Hammer,
  BookOpen,
  Clock,
  Wrench,
  DollarSign,
  Map,
  Target,
  Cpu,
  Users,
  MessageSquare,
  HelpCircle,
  ChevronDown,
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { typography } from '@/lib/design-system'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import type { Blueprint, BlueprintTemplate, UniversalSubsystem, SubsystemObjectivePack } from '@/types/blueprints'
import type { ObjectivePack } from '@/actions/packs'
import type { FoundryContext } from '@/actions/foundry-context'
import { CategoryTabs, type TabId } from './components/category-tabs'
import { PackCard } from './components/pack-card'
import { IndustrySelector } from './components/industry-selector'
import { INDUSTRY_CATEGORIES, packMatchesCategory } from './components/utils'
import { TechniquesExplorer } from '@/components/techniques'
import { ALL_TECHNIQUES } from '@/lib/manufacturing-techniques'
import { getProjectTemplates, type ProjectTemplateListItem } from '@/actions/project-templates'
import { getTutorials, type TutorialListItem } from '@/actions/tutorials'
import { getSubsystemObjectivePack } from '@/actions/universal-subsystems'
import { createAdvisoryQuestion } from '@/actions/advisory'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { UniversalSubsystemsGrid } from '@/components/blueprints/universal-subsystems-grid'
import { SubsystemDetailDialog } from '@/components/blueprints/subsystem-detail-dialog'
import { CreateSubsystemObjectiveDialog } from '@/components/blueprints/create-subsystem-objective-dialog'
import { QuestionCard, Question } from '@/components/advisory/question-card'
import { AskModal } from '@/components/advisory/ask-modal'
import { StatusLegend } from '@/components/advisory/status-legend'
import { toast } from 'sonner'
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
// Main Inspiration page component
// ---------------------------------------------------------------------------

interface TeamMember {
  id: string
  full_name: string
  role: string
  email: string
  avatar_url?: string | null
}

interface InspirationPageNewProps {
  templates?: BlueprintTemplate[]
  packs?: ObjectivePack[]
  initialSavedPackIds?: string[]
  foundryContext?: FoundryContext
  members?: TeamMember[]
  blueprints?: Blueprint[]
  universalSubsystems?: UniversalSubsystem[]
  questions?: Question[]
}

export function InspirationPageNew({
  templates = [],
  packs = [],
  initialSavedPackIds = [],
  foundryContext,
  members = [],
  blueprints = [],
  universalSubsystems = [],
  questions = [],
}: InspirationPageNewProps) {
  // Tab state
  const [activeTab, setActiveTab] = useState<TabId>('by-need')

  // Saved packs
  const [savedPackIds, setSavedPackIds] = useState<Set<string>>(
    new Set(initialSavedPackIds),
  )

  // Universal Subsystems state
  const [selectedSubsystem, setSelectedSubsystem] = useState<UniversalSubsystem | null>(null)
  const [selectedSubsystemPack, setSelectedSubsystemPack] = useState<SubsystemObjectivePack | null>(null)
  const [isSubsystemDialogOpen, setIsSubsystemDialogOpen] = useState(false)
  const [isCreateObjectiveOpen, setIsCreateObjectiveOpen] = useState(false)

  // Advisory Q&A state
  const [isQAOpen, setIsQAOpen] = useState(false)
  const [qaSearchQuery, setQaSearchQuery] = useState('')

  useEffect(() => {
    async function fetchPack() {
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

  const filteredQuestions = useMemo(() => {
    if (!qaSearchQuery.trim()) return questions
    const query = qaSearchQuery.toLowerCase()
    return questions.filter(q =>
      q.title.toLowerCase().includes(query) ||
      q.body.toLowerCase().includes(query) ||
      q.category.toLowerCase().includes(query)
    )
  }, [questions, qaSearchQuery])

  const handleAskQuestion = async (data: {
    title: string
    body: string
    category: string
    visibility: 'public' | 'foundry'
    getAiAnswer: boolean
  }) => {
    const result = await createAdvisoryQuestion({
      title: data.title,
      body: data.body,
      category: data.category,
      visibility: data.visibility === 'public' ? 'network' : 'foundry',
      getAiAnswer: data.getAiAnswer,
    })

    if (result.error) {
      toast.error(result.error)
      return { error: result.error }
    }

    toast.success(
      data.getAiAnswer
        ? 'Question submitted! AI is generating an answer...'
        : 'Question submitted successfully'
    )
    return { questionId: result.data?.id }
  }

  // "By Need" selected category
  const [selectedNeed, setSelectedNeed] = useState<string | null>(null)

  // Projects & Tutorials state (lazy-loaded on tab switch)
  const [projectTemplates, setProjectTemplates] = useState<ProjectTemplateListItem[]>([])
  const [projectsTotal, setProjectsTotal] = useState(0)
  const [projectsLoaded, setProjectsLoaded] = useState(false)
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [tutorials, setTutorials] = useState<TutorialListItem[]>([])
  const [tutorialsTotal, setTutorialsTotal] = useState(0)
  const [tutorialsLoaded, setTutorialsLoaded] = useState(false)
  const [tutorialsLoading, setTutorialsLoading] = useState(false)
  const [selectedProject, setSelectedProject] = useState<ProjectTemplateListItem | null>(null)
  const [selectedTutorial, setSelectedTutorial] = useState<TutorialListItem | null>(null)

  // Load projects when tab is selected
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

  // Load tutorials when tab is selected
  useEffect(() => {
    if (activeTab !== 'learn' || tutorialsLoaded || tutorialsLoading) return
    setTutorialsLoading(true)
    getTutorials({ pageSize: 50 }).then((result) => {
      if ('data' in result) {
        setTutorials(result.data)
        setTutorialsTotal(result.total)
      }
      setTutorialsLoaded(true)
      setTutorialsLoading(false)
    })
  }, [activeTab, tutorialsLoaded, tutorialsLoading])

  // Search & filter (for by-need tab)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [difficultyFilter, setDifficultyFilter] = useState('all')
  const [sortBy, setSortBy] = useState<
    'relevance' | 'name' | 'difficulty' | 'duration'
  >('relevance')

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => clearTimeout(t)
  }, [searchQuery])

  // Reset filters on tab change
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

  // Save toggle
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

  // All business + subsystem packs combined for "By Need"
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

  // Only show manufacturing-specific Techniques tab when industry is relevant
  const MANUFACTURING_INDUSTRIES = ['manufacturing', 'industrial', 'engineering', 'automotive', 'aerospace', 'hardware']
  const isManufacturingIndustry = ctx?.industry
    ? MANUFACTURING_INDUSTRIES.some(mi => ctx.industry!.toLowerCase().includes(mi))
    : false

  const savedPacks = useMemo(
    () => packs.filter(p => savedPackIds.has(p.id)),
    [packs, savedPackIds],
  )

  // All packs sorted by task count (most comprehensive first)
  const popularPacks = useMemo(() => {
    return [...packs]
      .sort((a, b) => (b.items?.length || 0) - (a.items?.length || 0))
  }, [packs])

  // "By Need" grouped packs
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

  // Packs for selected need, filtered
  const filteredNeedPacks = useMemo(() => {
    if (!selectedNeed) return []
    const group = needGroups.find(g => g.id === selectedNeed)
    if (!group) return []
    let filtered = group.packs

    // Text search
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase()
      filtered = filtered.filter(
        p =>
          p.title?.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q) ||
          p.items?.some(i => i.title?.toLowerCase().includes(q)),
      )
    }

    // Difficulty
    if (difficultyFilter !== 'all') {
      filtered = filtered.filter(
        p => p.difficulty?.toLowerCase() === difficultyFilter.toLowerCase(),
      )
    }

    // Sort
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
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* ================================================================== */}
      {/* Page header                                                        */}
      {/* ================================================================== */}
      <div className="pb-4 border-b border-muted">
        <div className={typography.pageHeader}>
          <div className={typography.pageHeaderAccent} />
          <h1 className={typography.h1}>
            <Lightbulb className="h-7 w-7 mr-3 inline-block text-international-orange" />
            Inspiration
          </h1>
        </div>
        <p className={cn(typography.pageSubtitle, 'mt-1')}>
          Discover what to do next. Turn ideas into objectives and tasks for your team.
        </p>
      </div>

      {/* ================================================================== */}
      {/* Product Maps summary card                                          */}
      {/* ================================================================== */}
      <Card className="bg-gradient-to-r from-orange-50 to-blue-50 border-orange-100 hover:shadow-md transition-shadow">
        <CardContent className="py-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
              <Map className="h-5 w-5 text-international-orange" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm">Product Maps</h3>
              <p className="text-xs text-muted-foreground">
                {blueprints.length > 0
                  ? `${blueprints.length} active map${blueprints.length > 1 ? 's' : ''} \u00B7 ${Math.round(blueprints.reduce((sum, b) => sum + b.coverage_score, 0) / blueprints.length)}% average coverage`
                  : 'Visualise every domain, skill, and component your product needs. Find gaps and turn them into action.'}
              </p>
            </div>
            <Button
              asChild
              size="sm"
              className="shrink-0 bg-international-orange hover:bg-international-orange/90"
            >
              <Link href="/blueprints">
                {blueprints.length > 0 ? 'View Product Maps' : 'Create Your First Map'}
                <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ================================================================== */}
      {/* Category tabs (reorganised: For You, By Need, By Industry, Popular, Saved) */}
      {/* ================================================================== */}
      <CategoryTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        byNeedCount={allFunctionalPacks.length}
        industryCount={industryCount}
        popularCount={popularPacks.length}
        savedCount={savedPackIds.size}
        techniquesCount={ALL_TECHNIQUES.length}
        projectsCount={projectsTotal}
        tutorialsCount={tutorialsTotal}
        gapCount={ctx?.gapCategories.length}
        showTechniques={isManufacturingIndustry}
      />

      {/* ================================================================== */}
      {/* BY NEED tab -- packs grouped by business function                  */}
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

          {/* Search bar */}
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

          {/* Result count */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {filteredNeedPacks.length} {filteredNeedPacks.length === 1 ? 'pack' : 'packs'}
            </span>
            {hasActiveFilters && (
              <Badge variant="secondary" className="text-xs">Filtered</Badge>
            )}
          </div>

          {/* Pack grid */}
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
      {/* BY INDUSTRY tab (auto-selects user's industry)                     */}
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
      {/* TECHNIQUES tab — Manufacturing Techniques Explorer                 */}
      {/* ================================================================== */}
      {activeTab === 'techniques' && <TechniquesExplorer />}

      {/* ================================================================== */}
      {/* PROJECTS tab — Starter project templates with BOM and steps        */}
      {/* ================================================================== */}
      {activeTab === 'projects' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Hammer className="h-5 w-5 text-chart-4" />
            <h2 className="text-lg font-semibold">Project Templates</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-5">
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
      {/* LEARN tab — Tutorials, how-tos, and safety guides                  */}
      {/* ================================================================== */}
      {activeTab === 'learn' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="h-5 w-5 text-electric-blue" />
            <h2 className="text-lg font-semibold">Tutorials &amp; Guides</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-5">
            Step-by-step tutorials, safety guides, and best practices for hardware engineering.
          </p>

          {tutorialsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-44 rounded-xl" />
              ))}
            </div>
          ) : tutorials.length === 0 ? (
            <EmptyState
              title="Tutorials are being prepared"
              description="Check back soon as new tutorials are added."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-fade-in">
              {tutorials.map((tutorial) => (
                <Card
                  key={tutorial.id}
                  className="cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 hover:border-electric-blue/30"
                  onClick={() => setSelectedTutorial(tutorial)}
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">
                        {tutorial.title}
                      </h3>
                      {tutorial.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {tutorial.description}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {tutorial.difficulty && (
                        <Badge
                          variant={
                            tutorial.difficulty === 'beginner' ? 'success' :
                            tutorial.difficulty === 'intermediate' ? 'warning' :
                            'destructive'
                          }
                          className="text-[10px]"
                        >
                          {tutorial.difficulty}
                        </Badge>
                      )}
                      {tutorial.topic && (
                        <Badge variant="secondary" className="text-[10px]">
                          {tutorial.topic}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1 border-t border-muted">
                      {tutorial.estimated_read_minutes != null && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {tutorial.estimated_read_minutes} min read
                        </span>
                      )}
                    </div>

                    {tutorial.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {tutorial.tags.slice(0, 3).map((tag, i) => (
                          <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                            {tag}
                          </span>
                        ))}
                        {tutorial.tags.length > 3 && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                            +{tutorial.tags.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Tutorial Detail Dialog */}
          <Dialog open={!!selectedTutorial} onOpenChange={(open) => !open && setSelectedTutorial(null)}>
            <DialogContent size="lg" className="max-h-[90vh] flex flex-col">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-electric-blue" />
                  {selectedTutorial?.title}
                </DialogTitle>
              </DialogHeader>
              {selectedTutorial && (
                <div className="flex-1 overflow-y-auto space-y-6 pb-4">
                  {selectedTutorial.description && (
                    <p className="text-sm text-muted-foreground">{selectedTutorial.description}</p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {selectedTutorial.difficulty && (
                      <Badge variant={
                        selectedTutorial.difficulty === 'beginner' ? 'success' :
                        selectedTutorial.difficulty === 'intermediate' ? 'warning' :
                        'destructive'
                      }>
                        {selectedTutorial.difficulty}
                      </Badge>
                    )}
                    {selectedTutorial.topic && (
                      <Badge variant="secondary">{selectedTutorial.topic}</Badge>
                    )}
                    {selectedTutorial.estimated_read_minutes != null && (
                      <Badge variant="secondary">
                        <Clock className="h-3 w-3 mr-1" />
                        {selectedTutorial.estimated_read_minutes} min read
                      </Badge>
                    )}
                  </div>

                  {selectedTutorial.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedTutorial.tags.map((tag, i) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedTutorial(null)}>
                  Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* ================================================================== */}
      {/* ALL PACKS tab                                                      */}
      {/* ================================================================== */}
      {activeTab === 'popular' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-5 w-5 text-status-success" />
            <h2 className="text-lg font-semibold">All Packs</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-5">
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

      {/* ================================================================== */}
      {/* Universal Subsystems section                                       */}
      {/* ================================================================== */}
      {universalSubsystems.length > 0 && (
        <section className="space-y-4 pt-4 border-t border-muted">
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

          <UniversalSubsystemsGrid
            subsystems={universalSubsystems}
            onSubsystemClick={handleSubsystemClick}
          />
        </section>
      )}

      {/* ================================================================== */}
      {/* Advisory Q&A section                                               */}
      {/* ================================================================== */}
      {questions.length > 0 && (
        <section className="space-y-4 pt-4 border-t border-muted">
          <Collapsible open={isQAOpen} onOpenChange={setIsQAOpen}>
            <div className="flex items-center justify-between">
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                  <div className="h-10 w-10 rounded-lg bg-violet-100 flex items-center justify-center">
                    <MessageSquare className="h-5 w-5 text-violet-600" />
                  </div>
                  <div className="text-left">
                    <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                      Advisory Q&A
                      <Badge variant="secondary" className="text-xs">
                        {questions.length} {questions.length === 1 ? 'question' : 'questions'}
                      </Badge>
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Get AI-powered insights verified by human experts
                    </p>
                  </div>
                  <ChevronDown className={cn(
                    "h-5 w-5 text-muted-foreground transition-transform ml-2",
                    isQAOpen && "rotate-180"
                  )} />
                </button>
              </CollapsibleTrigger>
              <AskModal onSubmit={handleAskQuestion} />
            </div>

            <CollapsibleContent className="mt-6 space-y-4">
              <StatusLegend className="pb-4" />

              {questions.length > 0 && (
                <div className="flex items-center gap-3">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="search"
                      placeholder="Search questions..."
                      value={qaSearchQuery}
                      onChange={(e) => setQaSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {filteredQuestions.length} {filteredQuestions.length === 1 ? 'question' : 'questions'}
                    {qaSearchQuery && ' found'}
                  </p>
                </div>
              )}

              {filteredQuestions.length === 0 ? (
                <Card className="border-2 border-dashed">
                  <CardContent className="py-12">
                    <EmptyState
                      icon={<HelpCircle className="h-12 w-12" />}
                      title={qaSearchQuery ? "No questions match your search" : "No questions yet"}
                      description={
                        qaSearchQuery
                          ? "Try adjusting your search terms."
                          : "Ask your first question to get AI-powered insights verified by experts."
                      }
                      action={
                        qaSearchQuery ? (
                          <Button variant="link" onClick={() => setQaSearchQuery('')} className="text-electric-blue">
                            Clear Search
                          </Button>
                        ) : (
                          <AskModal
                            onSubmit={handleAskQuestion}
                            trigger={
                              <Button className="gap-2">
                                <MessageSquare className="h-4 w-4" />
                                Ask a Question
                              </Button>
                            }
                          />
                        )
                      }
                    />
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredQuestions.slice(0, 6).map((question) => (
                    <QuestionCard key={question.id} question={question} />
                  ))}
                </div>
              )}

              {filteredQuestions.length > 6 && (
                <div className="text-center pt-4">
                  <p className="text-sm text-muted-foreground">
                    Showing 6 of {filteredQuestions.length} questions. Use search to find specific topics.
                  </p>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </section>
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
