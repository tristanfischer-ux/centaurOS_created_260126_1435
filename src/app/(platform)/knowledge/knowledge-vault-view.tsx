'use client'

/**
 * KnowledgeVaultView — The organizational second brain interface.
 *
 * @description Main client component for browsing, filtering, and managing
 * knowledge notes. Shows vault stats, domain-organized notes, and supports
 * full-text search, type filtering, and specialist filtering.
 *
 * @component
 *
 * @example
 * <KnowledgeVaultView foundryId="abc" userId="123" userRole="Founder" />
 */

import React, { useState, useEffect, useCallback, useTransition, useMemo } from 'react'
import {
  Brain,
  Search,
  Filter,
  Plus,
  Pin,
  CheckCircle2,
  Eye,
  Link2,
  Sparkles,
  TrendingUp,
  Quote,
  Gavel,
  Lightbulb,
  Heart,
  GraduationCap,
  BookOpen,
  ArrowUpDown,
  X,
  ChevronDown,
  Archive,
  Loader2,
  ChevronRight,
  LayoutGrid,
  Layers,
  RefreshCw,
  CheckSquare,
  FileUp,
  Clock,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import {
  fetchKnowledgeNotes,
  fetchKnowledgeDomains,
  fetchVaultStats,
  toggleNotePin,
  toggleNoteVerified,
  archiveNote,
  rebuildAllConnections,
  batchVerifyNotes,
  batchArchiveNotes,
} from '@/actions/knowledge'
import { SpecialistInsightCard } from '@/components/specialists/specialist-insight-card'
import { usePageInsights } from '@/hooks/use-page-insights'
import { useAdvisorPanel } from '@/contexts/advisor-panel-context'
import { generateKnowledgeInsights } from '@/actions/specialist-page-insights'
import type { AgentInsight } from '@/actions/agent-insights'
import { KnowledgeNoteCard } from './knowledge-note-card'
import { KnowledgeNoteDetailDialog } from './knowledge-note-detail-dialog'
import { CreateKnowledgeNoteDialog } from './create-knowledge-note-dialog'
import { DocumentUploadZone } from './document-upload-zone'
import { KnowledgeOnboarding } from './knowledge-onboarding'
import type {
  KnowledgeNoteSummary,
  KnowledgeDomain,
  KnowledgeNoteType,
  KnowledgeSortBy,
  VaultStats,
} from '@/lib/knowledge-vault/types'

// INTENT: Static coaching insight when vault is empty — no API call needed
const EMPTY_STATE_INSIGHT: AgentInsight = {
  id: 'sage-knowledge-empty',
  foundry_id: '',
  specialist_id: 'strategist',
  insight_type: 'recommendation',
  urgency: 'informational',
  title: 'Build your knowledge vault',
  body: 'Build your knowledge vault with notes, decisions, and lessons learned. A strong institutional memory compounds over time.',
  domain_data: {},
  suggested_actions: [],
  is_read: false,
  is_dismissed: false,
  acted_on: false,
  acted_on_at: null,
  created_at: new Date().toISOString(),
  expires_at: null,
}

// ─── Note Type Icons ─────────────────────────────────────────────────

const NOTE_TYPE_ICONS: Record<KnowledgeNoteType, React.ReactNode> = {
  claim: <Quote className="h-3.5 w-3.5" />,
  decision: <Gavel className="h-3.5 w-3.5" />,
  insight: <Lightbulb className="h-3.5 w-3.5" />,
  fact: <CheckCircle2 className="h-3.5 w-3.5" />,
  preference: <Heart className="h-3.5 w-3.5" />,
  lesson: <GraduationCap className="h-3.5 w-3.5" />,
  observation: <Eye className="h-3.5 w-3.5" />,
}

const NOTE_TYPE_LABELS: Record<KnowledgeNoteType, string> = {
  claim: 'Claims',
  decision: 'Decisions',
  insight: 'Insights',
  fact: 'Facts',
  preference: 'Preferences',
  lesson: 'Lessons',
  observation: 'Observations',
}

const ALL_NOTE_TYPES: KnowledgeNoteType[] = [
  'insight', 'decision', 'claim', 'fact', 'lesson', 'observation', 'preference',
]

// ─── Sort Options ────────────────────────────────────────────────────

const SORT_OPTIONS: Array<{ value: KnowledgeSortBy; label: string }> = [
  { value: 'created_at', label: 'Newest first' },
  { value: 'updated_at', label: 'Recently updated' },
  { value: 'confidence', label: 'Highest confidence' },
  { value: 'link_count', label: 'Most connected' },
  { value: 'title', label: 'Alphabetical' },
]

// ─── Component ───────────────────────────────────────────────────────

interface KnowledgeVaultViewProps {
  /** The active foundry ID */
  foundryId: string
  /** The authenticated user ID */
  userId: string
  /** The user's role */
  userRole: string
}

export function KnowledgeVaultView({ foundryId, userId, userRole }: KnowledgeVaultViewProps) {
  // State
  const [notes, setNotes] = useState<KnowledgeNoteSummary[]>([])
  const [domains, setDomains] = useState<KnowledgeDomain[]>([])
  const [stats, setStats] = useState<VaultStats | null>(null)
  const [totalNotes, setTotalNotes] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isPending, startTransition] = useTransition()

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null)
  const [selectedTypes, setSelectedTypes] = useState<KnowledgeNoteType[]>([])
  const [sortBy, setSortBy] = useState<KnowledgeSortBy>('created_at')
  const [activeTab, setActiveTab] = useState<'all' | 'pinned' | 'unverified'>('all')
  const [hideStale, setHideStale] = useState(false)
  const [page, setPage] = useState(1)

  // View mode
  const [viewMode, setViewMode] = useState<'grid' | 'clustered'>('grid')

  // Bulk selection
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set())
  const [isRebuilding, setIsRebuilding] = useState(false)
  const [isBatchProcessing, setIsBatchProcessing] = useState(false)

  // Dialogs
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)

  // ─── Data Fetching ───────────────────────────────────────────────

  const loadNotes = useCallback(async () => {
    startTransition(async () => {
      const result = await fetchKnowledgeNotes({
        filters: {
          searchQuery: searchQuery || undefined,
          domainId: selectedDomain || undefined,
          noteTypes: selectedTypes.length > 0 ? selectedTypes : undefined,
          pinnedOnly: activeTab === 'pinned',
          verifiedOnly: false,
          includeArchived: false,
          hideStale: hideStale || undefined,
        },
        sortBy,
        sortOrder: sortBy === 'title' ? 'asc' : 'desc',
        page,
        pageSize: 24,
      })

      if (result.data) {
        setNotes(result.data.notes)
        setTotalNotes(result.data.total)
      }
    })
  }, [searchQuery, selectedDomain, selectedTypes, sortBy, activeTab, hideStale, page])

  const loadInitialData = useCallback(async () => {
    setIsLoading(true)

    const [domainsResult, statsResult] = await Promise.allSettled([
      fetchKnowledgeDomains(),
      fetchVaultStats(),
    ])

    if (domainsResult.status === 'fulfilled' && domainsResult.value.data) {
      setDomains(domainsResult.value.data)
    }
    if (statsResult.status === 'fulfilled' && statsResult.value.data) {
      setStats(statsResult.value.data)
    }

    setIsLoading(false)
  }, [])

  useEffect(() => {
    loadInitialData()
  }, [loadInitialData])

  useEffect(() => {
    if (!isLoading) {
      loadNotes()
    }
  }, [loadNotes, isLoading])

  // ─── Actions ─────────────────────────────────────────────────────

  const handlePin = async (noteId: string, pinned: boolean) => {
    await toggleNotePin(noteId, pinned)
    loadNotes()
    // Refresh stats
    const statsResult = await fetchVaultStats()
    if (statsResult.data) setStats(statsResult.data)
  }

  const handleVerify = async (noteId: string, verified: boolean) => {
    await toggleNoteVerified(noteId, verified)
    loadNotes()
    const statsResult = await fetchVaultStats()
    if (statsResult.data) setStats(statsResult.data)
  }

  const handleArchive = async (noteId: string) => {
    await archiveNote(noteId, true)
    loadNotes()
    const statsResult = await fetchVaultStats()
    if (statsResult.data) setStats(statsResult.data)
  }

  const handleNoteCreated = () => {
    setIsCreateDialogOpen(false)
    loadNotes()
    loadInitialData()
  }

  // ─── Selection Handlers ───────────────────────────────────────────

  const toggleSelection = (noteId: string) => {
    setSelectedNoteIds((prev) => {
      const next = new Set(prev)
      if (next.has(noteId)) { next.delete(noteId) } else { next.add(noteId) }
      return next
    })
  }

  const selectAll = () => { setSelectedNoteIds(new Set(notes.map((n) => n.id))) }

  const clearSelection = () => { setSelectedNoteIds(new Set()); setSelectionMode(false) }

  const handleBatchVerify = async () => {
    if (selectedNoteIds.size === 0) return
    setIsBatchProcessing(true)
    const result = await batchVerifyNotes(Array.from(selectedNoteIds))
    setIsBatchProcessing(false)
    if (result.data) { toast.success(`Verified ${result.data.count} notes`); clearSelection(); loadNotes(); loadInitialData() }
    else { toast.error(result.error ?? 'Failed to batch verify') }
  }

  const handleBatchArchive = async () => {
    if (selectedNoteIds.size === 0) return
    setIsBatchProcessing(true)
    const result = await batchArchiveNotes(Array.from(selectedNoteIds))
    setIsBatchProcessing(false)
    if (result.data) { toast.success(`Archived ${result.data.count} notes`); clearSelection(); loadNotes(); loadInitialData() }
    else { toast.error(result.error ?? 'Failed to batch archive') }
  }

  const handleRebuildConnections = async () => {
    setIsRebuilding(true)
    const result = await rebuildAllConnections()
    setIsRebuilding(false)
    if (result.data) { toast.success(`Created ${result.data.connectionsCreated} connections across ${result.data.notesProcessed} notes`); loadNotes(); loadInitialData() }
    else { toast.error(result.error ?? 'Failed to rebuild connections') }
  }

  // ─── Clustering ─────────────────────────────────────────────────

  const clusteredNotes = useMemo(() => {
    if (viewMode !== 'clustered') return null
    const clusters = new Map<string, KnowledgeNoteSummary[]>()
    for (const note of notes) {
      let group = 'Uncategorized'
      if (note.tags.length > 0) { group = note.tags[0] }
      else if (note.domain_id) { const domain = domains.find((d) => d.id === note.domain_id); if (domain) group = domain.name }
      if (!clusters.has(group)) { clusters.set(group, []) }
      clusters.get(group)!.push(note)
    }
    return Array.from(clusters.entries()).sort((a, b) => b[1].length !== a[1].length ? b[1].length - a[1].length : a[0].localeCompare(b[0]))
  }, [notes, domains, viewMode])

  const toggleTypeFilter = (type: KnowledgeNoteType) => {
    setSelectedTypes((prev) =>
      prev.includes(type)
        ? prev.filter((t) => t !== type)
        : [...prev, type]
    )
    setPage(1)
  }

  const clearFilters = () => {
    setSearchQuery('')
    setSelectedDomain(null)
    setSelectedTypes([])
    setSortBy('created_at')
    setActiveTab('all')
    setHideStale(false)
    setPage(1)
  }

  const hasActiveFilters = searchQuery || selectedDomain || selectedTypes.length > 0 || activeTab !== 'all' || hideStale

  // Sage's proactive insights
  const { openPanel } = useAdvisorPanel()
  const handleDiscuss = useCallback((specialistId: string, context: string) => {
    openPanel(specialistId, { handoffContext: context, contextLabel: 'Knowledge' })
  }, [openPanel])
  const pinnedCount = useMemo(() => notes.filter(n => n.is_pinned).length, [notes])
  const domainCoverage = useMemo(
    () => domains.map((d) => ({ name: d.name, count: d.note_count })),
    [domains],
  )
  const staleCount = stats?.staleCount ?? 0
  const { insights, dismissInsight } = usePageInsights(
    (fast) => generateKnowledgeInsights({
      noteCount: totalNotes,
      pinnedCount: pinnedCount,
      domainCoverage,
      staleCount,
    }, fast),
    totalNotes > 0,
    { cacheKey: 'sage-knowledge', emptyInsight: EMPTY_STATE_INSIGHT },
  )

  // ─── Render ──────────────────────────────────────────────────────

  if (isLoading) {
    return <KnowledgeVaultSkeleton />
  }

  const isVaultEmpty = stats?.totalNotes === 0

  return (
    <div className="space-y-8">
      {/* ── Page Header (hidden when vault is empty — onboarding has its own) ── */}
      {!isVaultEmpty && <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-1 rounded-full bg-international-orange" />
            <h1 className="text-2xl font-display font-bold tracking-tight text-foreground">
              Knowledge
            </h1>
            {stats && stats.totalNotes > 0 && (
              <Badge variant="secondary" className="font-mono text-xs">
                {stats.totalNotes} {stats.totalNotes === 1 ? 'note' : 'notes'}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1 ml-[1.625rem]">
            Everything your team has learned about your business
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {stats != null && stats.totalLinks === 0 && stats.totalNotes > 5 && (
            <Button variant="outline" size="sm" onClick={handleRebuildConnections} disabled={isRebuilding}>
              {isRebuilding ? <Loader2 className="h-4 w-4 animate-spin sm:mr-2" /> : <RefreshCw className="h-4 w-4 sm:mr-2" />}
              <span className="hidden sm:inline">{isRebuilding ? 'Rebuilding...' : 'Rebuild Connections'}</span>
            </Button>
          )}
          <DocumentUploadZone
            compact
            onExtractionComplete={() => { loadNotes(); loadInitialData() }}
          />
          <Button
            variant="default"
            onClick={() => setIsCreateDialogOpen(true)}
            aria-label="Add Knowledge"
          >
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Add Knowledge</span>
          </Button>
        </div>
      </div>
      }

      {/* ── Sage's Proactive Insights ─────────────────────────────── */}
      {insights.length > 0 && (
        <div className="space-y-3">
          {insights.map((insight) => (
            <SpecialistInsightCard
              key={insight.id}
              insight={insight}
              onDismiss={() => dismissInsight(insight.id)}
              onDiscuss={handleDiscuss}
              compact
            />
          ))}
        </div>
      )}

      {/* ── Empty State ──────────────────────────────────────────── */}
      {isVaultEmpty ? (
        <KnowledgeOnboarding onNoteCreated={() => { loadNotes(); loadInitialData() }} />
      ) : (
        <>
          {/* ── Stats Cards ───────────────────────────────────────── */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <StatCard
                label="Total Notes"
                value={stats.totalNotes}
                icon={<Brain className="h-4 w-4" />}
              />
              <StatCard
                label="Connections"
                value={stats.totalLinks}
                icon={<Link2 className="h-4 w-4" />}
              />
              <StatCard
                label="Verified"
                value={stats.verifiedCount}
                icon={<CheckCircle2 className="h-4 w-4" />}
                accent
              />
              <StatCard
                label="Needs Review"
                value={stats.unverifiedCount}
                icon={<Eye className="h-4 w-4" />}
              />
              <StatCard
                label="Stale"
                value={stats.staleCount}
                icon={<Clock className="h-4 w-4" />}
              />
              <StatCard
                label="Documents"
                value={stats.documentsProcessed}
                icon={<FileUp className="h-4 w-4" />}
              />
            </div>
          )}

          {/* ── Knowledge Health ──────────────────────────────────── */}
          {domains.length > 0 && (
            <KnowledgeHealthBar domains={domains} />
          )}

          {/* ── Filters Bar ───────────────────────────────────────── */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search knowledge..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setPage(1)
                  }}
                  className="pl-10"
                />
                {searchQuery && (
                  <button
                    onClick={() => { setSearchQuery(''); setPage(1) }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Domain filter */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2 w-full sm:w-auto sm:min-w-[140px]">
                    <Filter className="h-4 w-4" />
                    {selectedDomain
                      ? domains.find((d) => d.id === selectedDomain)?.name ?? 'Domain'
                      : 'All Domains'}
                    <ChevronDown className="h-3 w-3 ml-auto" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Filter by Domain</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => { setSelectedDomain(null); setPage(1) }}
                    className={cn('gap-2 min-h-[44px]', !selectedDomain && 'text-international-orange font-semibold')}
                  >
                    All Domains
                  </DropdownMenuItem>
                  {domains.map((domain) => (
                    <DropdownMenuItem
                      key={domain.id}
                      onClick={() => { setSelectedDomain(domain.id); setPage(1) }}
                      className={cn('gap-2 min-h-[44px]', selectedDomain === domain.id && 'text-international-orange font-semibold')}
                    >
                      {domain.name}
                      {domain.note_count > 0 && (
                        <Badge variant="secondary" className="ml-auto text-xs font-mono">
                          {domain.note_count}
                        </Badge>
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Sort */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2 w-full sm:w-auto">
                    <ArrowUpDown className="h-4 w-4" />
                    {SORT_OPTIONS.find((s) => s.value === sortBy)?.label}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {SORT_OPTIONS.map((option) => (
                    <DropdownMenuItem
                      key={option.value}
                      onClick={() => { setSortBy(option.value); setPage(1) }}
                      className={cn('gap-2 min-h-[44px]', sortBy === option.value && 'text-international-orange font-semibold')}
                    >
                      {option.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Tabs + Type filters */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as typeof activeTab); setPage(1) }}>
                <TabsList className="w-full sm:w-auto">
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="pinned">
                    <Pin className="h-3.5 w-3.5 sm:mr-1.5" />
                    <span className="hidden sm:inline">Pinned</span>
                  </TabsTrigger>
                  <TabsTrigger value="unverified">
                    <Eye className="h-3.5 w-3.5 sm:mr-1.5" />
                    <span className="hidden sm:inline">Needs Review</span>
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {/* View mode toggle */}
              <div className="flex items-center gap-1 rounded-md border border-input p-0.5">
                <button onClick={() => setViewMode('grid')} className={cn('inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors', viewMode === 'grid' ? 'bg-international-orange text-white' : 'text-muted-foreground hover:text-foreground')}>
                  <LayoutGrid className="h-3.5 w-3.5" /> Grid
                </button>
                <button onClick={() => setViewMode('clustered')} className={cn('inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors', viewMode === 'clustered' ? 'bg-international-orange text-white' : 'text-muted-foreground hover:text-foreground')}>
                  <Layers className="h-3.5 w-3.5" /> Clustered
                </button>
              </div>

              {/* Select mode toggle */}
              <Button variant={selectionMode ? 'default' : 'outline'} size="sm" onClick={() => { if (selectionMode) { clearSelection() } else { setSelectionMode(true) } }}>
                <CheckSquare className="h-3.5 w-3.5 mr-1.5" />
                {selectionMode ? 'Cancel' : 'Select'}
              </Button>

              {/* Hide stale toggle */}
              <Button
                variant={hideStale ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setHideStale((prev) => !prev); setPage(1) }}
              >
                <Clock className="h-3.5 w-3.5 mr-1.5" />
                {hideStale ? 'Showing fresh' : 'Hide stale'}
              </Button>

              <div className="flex flex-wrap gap-1.5">
                {ALL_NOTE_TYPES.map((type) => (
                  <button
                    key={type}
                    onClick={() => toggleTypeFilter(type)}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-2.5 sm:py-1 rounded-full text-xs font-medium transition-colors',
                      selectedTypes.includes(type)
                        ? 'bg-international-orange text-white'
                        : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'
                    )}
                  >
                    {NOTE_TYPE_ICONS[type]}
                    {NOTE_TYPE_LABELS[type]}
                  </button>
                ))}
              </div>

              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-auto"
                >
                  Clear all filters
                </button>
              )}
            </div>
          </div>

          {/* ── Bulk Action Bar ────────────────────────────────────── */}
          {selectionMode && selectedNoteIds.size > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted border border-border">
              <span className="text-sm font-medium text-foreground">{selectedNoteIds.size} selected</span>
              <button onClick={selectAll} className="text-xs text-international-orange hover:underline">Select all {notes.length}</button>
              <div className="flex-1" />
              <Button variant="outline" size="sm" onClick={handleBatchVerify} disabled={isBatchProcessing}>
                {isBatchProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />} Verify
              </Button>
              <Button variant="outline" size="sm" onClick={handleBatchArchive} disabled={isBatchProcessing} className="text-destructive">
                {isBatchProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Archive className="h-3.5 w-3.5 mr-1.5" />} Archive
              </Button>
            </div>
          )}

          {/* ── Notes Grid / Clustered View ────────────────────────── */}
          {isPending ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-48 w-full rounded-lg" />
              ))}
            </div>
          ) : notes.length === 0 ? (
            <div className="py-12">
              <EmptyState
                title="No notes match your filters"
                description="Try adjusting your search or filters to find what you're looking for."
                action={
                  <Button variant="secondary" onClick={clearFilters}>
                    Clear Filters
                  </Button>
                }
              />
            </div>
          ) : viewMode === 'clustered' && clusteredNotes ? (
            <>
              <div className="space-y-6">
                {clusteredNotes.map(([clusterLabel, clusterNotes]) => (
                  <ClusterSection key={clusterLabel} label={clusterLabel} count={clusterNotes.length}>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {clusterNotes.map((note) => (
                        <KnowledgeNoteCard key={note.id} note={note} domains={domains} onClick={() => setSelectedNoteId(note.id)} onPin={() => handlePin(note.id, !note.is_pinned)} onVerify={() => handleVerify(note.id, !note.is_verified)} onArchive={() => handleArchive(note.id)} selectionMode={selectionMode} isSelected={selectedNoteIds.has(note.id)} onToggleSelect={() => toggleSelection(note.id)} />
                      ))}
                    </div>
                  </ClusterSection>
                ))}
              </div>
              {totalNotes > 24 && (
                <div className="flex items-center justify-center gap-2 pt-4">
                  <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
                  <span className="text-sm text-muted-foreground">Page {page} of {Math.ceil(totalNotes / 24)}</span>
                  <Button variant="outline" size="sm" disabled={page * 24 >= totalNotes} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {notes.map((note) => (
                  <KnowledgeNoteCard key={note.id} note={note} domains={domains} onClick={() => setSelectedNoteId(note.id)} onPin={() => handlePin(note.id, !note.is_pinned)} onVerify={() => handleVerify(note.id, !note.is_verified)} onArchive={() => handleArchive(note.id)} selectionMode={selectionMode} isSelected={selectedNoteIds.has(note.id)} onToggleSelect={() => toggleSelection(note.id)} />
                ))}
              </div>
              {totalNotes > 24 && (
                <div className="flex items-center justify-center gap-2 pt-4">
                  <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
                  <span className="text-sm text-muted-foreground">Page {page} of {Math.ceil(totalNotes / 24)}</span>
                  <Button variant="outline" size="sm" disabled={page * 24 >= totalNotes} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── Dialogs ───────────────────────────────────────────────── */}
      {selectedNoteId && (
        <KnowledgeNoteDetailDialog
          noteId={selectedNoteId}
          open={!!selectedNoteId}
          onOpenChange={(open) => { if (!open) setSelectedNoteId(null) }}
          onPin={handlePin}
          onVerify={handleVerify}
          onArchive={handleArchive}
          onUpdate={() => { loadNotes(); loadInitialData() }}
          userId={userId}
        />
      )}

      <CreateKnowledgeNoteDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        domains={domains}
        onCreated={handleNoteCreated}
      />
    </div>
  )
}

// ─── Cluster Section ────────────────────────────────────────────────

function ClusterSection({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  const [isExpanded, setIsExpanded] = useState(true)
  return (
    <div className="space-y-3">
      <button onClick={() => setIsExpanded(!isExpanded)} className="flex items-center gap-2 w-full text-left group">
        <ChevronRight className={cn('h-4 w-4 text-muted-foreground transition-transform duration-200', isExpanded && 'rotate-90')} />
        <h3 className="text-sm font-semibold text-foreground">{label}</h3>
        <Badge variant="secondary" className="text-xs font-mono">{count}</Badge>
      </button>
      {isExpanded && <div className="pl-6">{children}</div>}
    </div>
  )
}

// ─── Stat Card ─────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string
  value: number
  icon: React.ReactNode
  accent?: boolean
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={cn(
              'text-2xl font-bold font-mono',
              accent ? 'text-international-orange' : 'text-foreground'
            )}>
              {value}
            </p>
          </div>
          <div className={cn(
            'flex items-center justify-center h-10 w-10 rounded-full',
            accent ? 'bg-orange-50 text-international-orange' : 'bg-muted text-muted-foreground'
          )}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Knowledge Health Bar ──────────────────────────────────────────

function KnowledgeHealthBar({ domains }: { domains: KnowledgeDomain[] }) {
  const maxCount = Math.max(1, ...domains.map((d) => d.note_count))
  const emptyDomains = domains.filter((d) => d.note_count === 0)
  const strongestDomain = domains.reduce((a, b) => (a.note_count >= b.note_count ? a : b), domains[0])

  // INTENT: Build a contextual suggestion for the user based on coverage gaps
  let suggestion = ''
  if (emptyDomains.length > 0 && strongestDomain.note_count > 0) {
    const emptyNames = emptyDomains.slice(0, 2).map((d) => d.name).join(' and ')
    suggestion = `${strongestDomain.name} has ${strongestDomain.note_count} ${strongestDomain.note_count === 1 ? 'note' : 'notes'}, but ${emptyNames} ${emptyDomains.length === 1 ? 'is' : 'are'} empty — consider uploading relevant documents.`
  } else if (emptyDomains.length === 0) {
    suggestion = 'All domains have coverage — keep building depth in each area.'
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Domain Coverage</h3>
        </div>
        <div className="space-y-2">
          {domains.map((domain) => {
            const pct = Math.max(2, (domain.note_count / maxCount) * 100)
            const barColor =
              domain.note_count >= 5
                ? 'bg-success'
                : domain.note_count >= 1
                  ? 'bg-warning'
                  : 'bg-destructive/30'
            return (
              <div key={domain.id} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-24 truncate shrink-0">
                  {domain.name}
                </span>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all duration-500', barColor)}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs font-mono text-muted-foreground w-8 text-right shrink-0">
                  {domain.note_count}
                </span>
              </div>
            )
          })}
        </div>
        {suggestion && (
          <p className="text-xs text-muted-foreground leading-relaxed">{suggestion}</p>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Loading Skeleton ──────────────────────────────────────────────

function KnowledgeVaultSkeleton() {
  return (
    <div className="space-y-8">
      {/* Header skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64 sm:w-72" />
        </div>
        <Skeleton className="h-10 w-36" />
      </div>

      {/* Stats skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>

      {/* Filter skeleton */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 w-full sm:w-36" />
        <Skeleton className="h-10 w-full sm:w-36" />
      </div>

      {/* Notes skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-48 w-full rounded-lg" />
        ))}
      </div>
    </div>
  )
}
