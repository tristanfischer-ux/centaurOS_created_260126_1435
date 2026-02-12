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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { toggleArtifactStar } from '@/actions/agent-artifacts'
import { ArtifactDetailDialog } from './artifact-detail-dialog'

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
  presentation: 'bg-orange-50 text-international-orange',
  checklist: 'bg-status-success-light text-status-success-dark',
}

/** Icon per content type */
const CONTENT_TYPE_ICONS: Record<ArtifactContentType, React.ElementType> = {
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
 * ArtifactsView - Interactive listing of agent artifacts.
 *
 * @description Client component that provides search, filtering, starring,
 * and card-based browsing of artifacts. Filters are applied locally on the
 * pre-fetched data to avoid server roundtrips.
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
  // Star toggle with optimistic update
  // ---------------------------------------------------------------------------
  const handleToggleStar = useCallback(
    async (e: React.MouseEvent, artifactId: string): Promise<void> => {
      // Prevent card click from firing
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
  // Selected artifact for detail dialog
  // ---------------------------------------------------------------------------
  const selectedArtifact = useMemo(
    (): AgentArtifactRow | null =>
      artifacts.find((a) => a.id === selectedArtifactId) ?? null,
    [artifacts, selectedArtifactId]
  )

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6 pt-6">
      {/* ── Toolbar: Search + Starred toggle ── */}
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

            return (
              <Card
                key={artifact.id}
                className="cursor-pointer hover:shadow-md transition-shadow border"
                onClick={() => setSelectedArtifactId(artifact.id)}
              >
                <CardContent className="pt-6">
                  <div className="space-y-3">
                    {/* Top row: badge + star */}
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
        /* ── Empty state ── */
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <Sparkles className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">
            No saved outputs yet
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            {debouncedSearch || activeTypeFilter !== 'all' || starredOnly
              ? 'No saved outputs match your current filters. Try adjusting your search or filters.'
              : 'Run an agent workflow to generate your first output. Outputs are saved automatically when workflows complete.'}
          </p>
        </div>
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
    </div>
  )
}
