'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { formatDistanceToNow } from 'date-fns'
import {
  Search,
  Star,
  FileText,
  Mail,
  BarChart3,
  Presentation,
  CheckSquare,
  Sparkles,
  X,
  Trash2,
  CheckCheck,
  MoreVertical,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { toggleArtifactStar, deleteArtifact, deleteArtifacts } from '@/actions/agent-artifacts'
import { ArtifactDetailDialog } from './artifact-detail-dialog'
import { EmptyState } from '@/components/ui/empty-state'

import type { AgentArtifactRow, ArtifactContentType } from '@/actions/agent-artifacts'

// ============================================================================
// CONSTANTS
// ============================================================================

const DEBOUNCE_MS = 300
const PREVIEW_CHAR_LIMIT = 150

/** Content type filter options displayed as pills */
const CONTENT_TYPE_FILTERS: { label: string; value: ArtifactContentType | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Documents', value: 'document' },
  { label: 'Emails', value: 'email' },
  { label: 'Reports', value: 'report' },
  { label: 'Presentations', value: 'presentation' },
  { label: 'Checklists', value: 'checklist' },
]

/** Badge styling per content type using semantic tokens */
const CONTENT_TYPE_BADGE_STYLES: Record<ArtifactContentType, string> = {
  document: 'bg-muted text-foreground',
  email: 'bg-status-info-light text-status-info-dark',
  report: 'bg-status-warning-light text-status-warning-dark',
  presentation: 'bg-status-warning-light text-status-warning-dark',
  checklist: 'bg-status-success-light text-status-success-dark',
}

/** Icon per content type */
const CONTENT_TYPE_ICONS: Record<ArtifactContentType, React.ComponentType<{ className?: string }>> = {
  document: FileText,
  email: Mail,
  report: BarChart3,
  presentation: Presentation,
  checklist: CheckSquare,
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Extract workflow name from artifact metadata.
 *
 * @param metadata - Artifact metadata record
 * @returns Workflow name string or null
 */
function getWorkflowName(metadata: Record<string, unknown>): string | null {
  if (typeof metadata?.workflowName === 'string' && metadata.workflowName.trim()) {
    return metadata.workflowName.trim()
  }
  return null
}

/**
 * Truncate content to a preview snippet.
 *
 * @param content - Full content string
 * @param limit - Max characters
 * @returns Truncated string with ellipsis if needed
 */
function truncateContent(content: string, limit: number): string {
  if (content.length <= limit) return content
  return content.slice(0, limit).trimEnd() + '...'
}

// ============================================================================
// COMPONENT
// ============================================================================

interface ArtifactsViewProps {
  /** Pre-fetched artifacts from the server component */
  artifacts: AgentArtifactRow[]
}

/**
 * ArtifactsView - Interactive listing of agent artifacts with selection and deletion.
 *
 * @description Client component that provides search, filtering, starring,
 * individual and bulk deletion, and card-based browsing of artifacts.
 * Filters are applied locally on the pre-fetched data to avoid server roundtrips.
 *
 * @component
 *
 * @example
 * <ArtifactsView artifacts={artifacts} />
 */
export function ArtifactsView({ artifacts: initialArtifacts }: ArtifactsViewProps): React.JSX.Element {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const [artifacts, setArtifacts] = useState<AgentArtifactRow[]>(initialArtifacts)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [activeTypeFilter, setActiveTypeFilter] = useState<ArtifactContentType | 'all'>('all')
  const [starredOnly, setStarredOnly] = useState(false)
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null)

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isSelectionMode, setIsSelectionMode] = useState(false)

  // Delete confirmation state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([])
  const [isDeleting, setIsDeleting] = useState(false)

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ---------------------------------------------------------------------------
  // Debounced search
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery)
    }, DEBOUNCE_MS)

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [searchQuery])

  // ---------------------------------------------------------------------------
  // Sync with prop changes (e.g. revalidation)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    setArtifacts(initialArtifacts)
  }, [initialArtifacts])

  // ---------------------------------------------------------------------------
  // Exit selection mode when no items are selected
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (isSelectionMode && selectedIds.size === 0) {
      // Keep selection mode active — user toggled it on intentionally
    }
  }, [isSelectionMode, selectedIds.size])

  // ---------------------------------------------------------------------------
  // Filtered artifacts
  // ---------------------------------------------------------------------------
  const filteredArtifacts = useMemo((): AgentArtifactRow[] => {
    let result = artifacts

    // Content type filter
    if (activeTypeFilter !== 'all') {
      result = result.filter((a) => a.content_type === activeTypeFilter)
    }

    // Starred filter
    if (starredOnly) {
      result = result.filter((a) => a.is_starred)
    }

    // Search filter (title + content)
    if (debouncedSearch.trim()) {
      const query = debouncedSearch.toLowerCase()
      result = result.filter(
        (a) =>
          a.title.toLowerCase().includes(query) ||
          a.content.toLowerCase().includes(query)
      )
    }

    return result
  }, [artifacts, activeTypeFilter, starredOnly, debouncedSearch])

  // ---------------------------------------------------------------------------
  // Derived: how many of the currently visible items are selected
  // ---------------------------------------------------------------------------
  const filteredIds = useMemo(() => new Set(filteredArtifacts.map((a) => a.id)), [filteredArtifacts])
  const visibleSelectedCount = useMemo(
    () => [...selectedIds].filter((id) => filteredIds.has(id)).length,
    [selectedIds, filteredIds]
  )
  const isAllVisibleSelected = filteredArtifacts.length > 0 && visibleSelectedCount === filteredArtifacts.length

  // ---------------------------------------------------------------------------
  // Star toggle with optimistic update
  // ---------------------------------------------------------------------------
  const handleToggleStar = useCallback(
    async (e: React.MouseEvent, artifactId: string): Promise<void> => {
      e.stopPropagation()

      // Optimistic update
      setArtifacts((prev) =>
        prev.map((a) =>
          a.id === artifactId ? { ...a, is_starred: !a.is_starred } : a
        )
      )

      const { isStarred, error } = await toggleArtifactStar(artifactId)

      if (error) {
        // Revert optimistic update
        setArtifacts((prev) =>
          prev.map((a) =>
            a.id === artifactId ? { ...a, is_starred: !isStarred } : a
          )
        )
        toast.error('Failed to update star')
      }
    },
    []
  )

  // ---------------------------------------------------------------------------
  // Clear search
  // ---------------------------------------------------------------------------
  const handleClearSearch = useCallback((): void => {
    setSearchQuery('')
    setDebouncedSearch('')
  }, [])

  // ---------------------------------------------------------------------------
  // Selection handlers
  // ---------------------------------------------------------------------------
  const handleToggleSelection = useCallback((artifactId: string): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(artifactId)) {
        next.delete(artifactId)
      } else {
        next.add(artifactId)
      }
      return next
    })
  }, [])

  const handleSelectAll = useCallback((): void => {
    if (isAllVisibleSelected) {
      // Deselect all visible
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const a of filteredArtifacts) {
          next.delete(a.id)
        }
        return next
      })
    } else {
      // Select all visible
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const a of filteredArtifacts) {
          next.add(a.id)
        }
        return next
      })
    }
  }, [isAllVisibleSelected, filteredArtifacts])

  const handleExitSelectionMode = useCallback((): void => {
    setIsSelectionMode(false)
    setSelectedIds(new Set())
  }, [])

  const handleEnterSelectionMode = useCallback((): void => {
    setIsSelectionMode(true)
  }, [])

  // ---------------------------------------------------------------------------
  // Delete handlers
  // ---------------------------------------------------------------------------

  /**
   * Prompt confirmation before deleting one or more artifacts.
   */
  const handleRequestDelete = useCallback((ids: string[]): void => {
    setPendingDeleteIds(ids)
    setDeleteConfirmOpen(true)
  }, [])

  /**
   * Execute the confirmed deletion.
   */
  const handleConfirmDelete = useCallback(async (): Promise<void> => {
    if (pendingDeleteIds.length === 0) return

    setIsDeleting(true)

    try {
      if (pendingDeleteIds.length === 1) {
        // Single delete
        const { error } = await deleteArtifact(pendingDeleteIds[0])
        if (error) {
          toast.error('Failed to delete deliverable')
          return
        }
        toast.success('Deliverable deleted')
      } else {
        // Bulk delete
        const { deletedCount, error } = await deleteArtifacts(pendingDeleteIds)
        if (error) {
          toast.error('Failed to delete deliverables')
          return
        }
        toast.success(`${deletedCount} deliverable${deletedCount === 1 ? '' : 's'} deleted`)
      }

      // Remove from local state
      setArtifacts((prev) => prev.filter((a) => !pendingDeleteIds.includes(a.id)))

      // Clean up selection
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const id of pendingDeleteIds) {
          next.delete(id)
        }
        return next
      })

      // If we deleted everything that was selected, exit selection mode
      if (pendingDeleteIds.length === selectedIds.size) {
        setIsSelectionMode(false)
      }
    } catch (err) {
      console.error('[ArtifactsView] Delete failed:', err instanceof Error ? err.message : 'Unknown error')
      toast.error('Something went wrong while deleting')
    } finally {
      setIsDeleting(false)
      setDeleteConfirmOpen(false)
      setPendingDeleteIds([])
    }
  }, [pendingDeleteIds, selectedIds.size])

  // ---------------------------------------------------------------------------
  // Selected artifact for detail dialog
  // ---------------------------------------------------------------------------
  const selectedArtifact = useMemo(
    (): AgentArtifactRow | null =>
      artifacts.find((a) => a.id === selectedArtifactId) ?? null,
    [artifacts, selectedArtifactId]
  )

  // ---------------------------------------------------------------------------
  // Delete confirmation text
  // ---------------------------------------------------------------------------
  const deleteConfirmText = useMemo((): { title: string; description: string } => {
    const count = pendingDeleteIds.length
    if (count === 1) {
      const artifact = artifacts.find((a) => a.id === pendingDeleteIds[0])
      return {
        title: 'Delete deliverable?',
        description: artifact
          ? `"${artifact.title}" will be permanently deleted. This action cannot be undone.`
          : 'This deliverable will be permanently deleted. This action cannot be undone.',
      }
    }
    return {
      title: `Delete ${count} deliverables?`,
      description: `${count} deliverables will be permanently deleted. This action cannot be undone.`,
    }
  }, [pendingDeleteIds, artifacts])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6 pt-6">
      {/* ── Toolbar: Search + Actions ── */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search saved outputs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-10"
            aria-label="Search saved outputs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!isSelectionMode ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleEnterSelectionMode}
              className="shrink-0"
              aria-label="Select deliverables"
            >
              <CheckCheck className="h-4 w-4 mr-2" />
              Select
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExitSelectionMode}
              className="shrink-0"
            >
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          )}

          <Button
            variant={starredOnly ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStarredOnly((prev) => !prev)}
            className="shrink-0"
            aria-pressed={starredOnly}
          >
            <Star className={cn('h-4 w-4 mr-2', starredOnly && 'fill-current')} />
            Starred
          </Button>
        </div>
      </div>

      {/* ── Selection toolbar (visible when items are selected) ── */}
      {isSelectionMode && (
        <div className="flex items-center gap-4 rounded-lg bg-muted px-4 py-3">
          <Checkbox
            checked={isAllVisibleSelected}
            onCheckedChange={handleSelectAll}
            aria-label={isAllVisibleSelected ? 'Deselect all' : 'Select all'}
          />
          <span className="text-sm font-medium text-foreground">
            {visibleSelectedCount > 0
              ? `${visibleSelectedCount} selected`
              : 'Select items'}
          </span>

          {visibleSelectedCount > 0 && (
            <>
              <div className="h-4 w-px bg-border" />
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleRequestDelete([...selectedIds].filter((id) => filteredIds.has(id)))}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete {visibleSelectedCount > 1 ? `(${visibleSelectedCount})` : ''}
              </Button>
            </>
          )}
        </div>
      )}

      {/* ── Content type filter pills ── */}
      <div className="flex flex-wrap items-center gap-2">
        {CONTENT_TYPE_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => setActiveTypeFilter(filter.value)}
            className={cn(
              'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
              activeTypeFilter === filter.value
                ? 'bg-international-orange text-white'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            )}
            aria-pressed={activeTypeFilter === filter.value}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* ── Artifact grid ── */}
      {filteredArtifacts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredArtifacts.map((artifact) => {
            const Icon = CONTENT_TYPE_ICONS[artifact.content_type] ?? FileText
            const workflowName = getWorkflowName(artifact.metadata)
            const isSelected = selectedIds.has(artifact.id)

            return (
              <Card
                key={artifact.id}
                role="button"
                tabIndex={0}
                className={cn(
                  'cursor-pointer transition-all border relative group',
                  isSelected
                    ? 'ring-2 ring-international-orange shadow-md'
                    : 'hover:shadow-md'
                )}
                onClick={() => {
                  if (isSelectionMode) {
                    handleToggleSelection(artifact.id)
                  } else {
                    setSelectedArtifactId(artifact.id)
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    if (isSelectionMode) {
                      handleToggleSelection(artifact.id)
                    } else {
                      setSelectedArtifactId(artifact.id)
                    }
                  }
                }}
                aria-label={isSelectionMode ? `Select ${artifact.title}` : `View ${artifact.title}`}
                aria-selected={isSelected}
              >
                {/* Selection checkbox overlay */}
                {isSelectionMode && (
                  <div className="absolute top-3 left-3 z-10">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => handleToggleSelection(artifact.id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select ${artifact.title}`}
                    />
                  </div>
                )}

                <CardContent className={cn('pt-6', isSelectionMode && 'pl-10')}>
                  <div className="space-y-3">
                    {/* Top row: badge + actions */}
                    <div className="flex items-start justify-between gap-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          'border-0 text-xs font-medium',
                          CONTENT_TYPE_BADGE_STYLES[artifact.content_type]
                        )}
                      >
                        <Icon className="h-3 w-3 mr-1" />
                        {artifact.content_type}
                      </Badge>

                      <div className="flex items-center gap-1">
                        {/* Star button */}
                        <button
                          type="button"
                          onClick={(e) => handleToggleStar(e, artifact.id)}
                          className="shrink-0 p-1 rounded-md hover:bg-muted transition-colors"
                          aria-label={artifact.is_starred ? 'Remove from starred' : 'Add to starred'}
                        >
                          <Star
                            className={cn(
                              'h-4 w-4',
                              artifact.is_starred
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-muted-foreground'
                            )}
                          />
                        </button>

                        {/* More actions menu (individual delete) */}
                        {!isSelectionMode && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                onClick={(e) => e.stopPropagation()}
                                className="shrink-0 p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md hover:bg-muted transition-colors sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"
                                aria-label="More actions"
                              >
                                <MoreVertical className="h-4 w-4 text-muted-foreground" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleRequestDelete([artifact.id])
                                }}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>

                    {/* Title */}
                    <h3 className="text-sm font-semibold text-foreground line-clamp-2">
                      {artifact.title}
                    </h3>

                    {/* Preview snippet */}
                    <p className="text-xs text-muted-foreground line-clamp-3">
                      {truncateContent(artifact.content, PREVIEW_CHAR_LIMIT)}
                    </p>

                    {/* Footer: workflow name + date */}
                    <div className="flex items-center justify-between gap-2 pt-1">
                      {workflowName ? (
                        <span className="text-xs text-muted-foreground truncate max-w-[60%]">
                          {workflowName}
                        </span>
                      ) : (
                        <span />
                      )}
                      <time
                        className="text-xs text-muted-foreground shrink-0"
                        dateTime={artifact.created_at}
                      >
                        {formatDistanceToNow(new Date(artifact.created_at), {
                          addSuffix: true,
                        })}
                      </time>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : (
        <EmptyState
          icon={<Sparkles className="h-8 w-8" />}
          title="No saved outputs yet"
          description={
            debouncedSearch || activeTypeFilter !== 'all' || starredOnly
              ? 'No saved outputs match your current filters. Try adjusting your search or filters.'
              : 'Run an agent workflow to generate your first output. Outputs are saved automatically when workflows complete.'
          }
        />
      )}

      {/* ── Detail dialog ── */}
      <ArtifactDetailDialog
        open={!!selectedArtifactId}
        onOpenChange={(open) => { if (!open) setSelectedArtifactId(null) }}
        artifact={selectedArtifact}
        onUpdate={(updated) => {
          setArtifacts((prev) => prev.map((a) => a.id === updated.id ? updated : a))
        }}
        onDelete={(id) => {
          setArtifacts((prev) => prev.filter((a) => a.id !== id))
          setSelectedArtifactId(null)
        }}
      />

      {/* ── Delete confirmation dialog ── */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteConfirmText.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirmText.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
