'use client'

import { useEffect, useState, useCallback, useTransition } from 'react'
import { ArrowLeft, Search, Package, SlidersHorizontal } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { typography, spacing } from '@/lib/design-system'
import { cn } from '@/lib/utils'
import { ComponentCard } from '@/components/forge/component-card'
import { ComponentDetailDialog } from '@/components/forge/component-detail-dialog'
import {
  getComponents,
  getComponentCategories,
  type ComponentListItem,
  type ComponentFilters,
} from '@/actions/component-library'

type SortOption = NonNullable<ComponentFilters['sortBy']>

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'name', label: 'Name A–Z' },
  { value: 'price_asc', label: 'Price: Low → High' },
  { value: 'price_desc', label: 'Price: High → Low' },
  { value: 'rating', label: 'Highest Rated' },
  { value: 'compat', label: 'Most Compatible' },
]

/**
 * Component Library page - Browse all components with enrichment data.
 *
 * @description Central catalogue page following the Marketplace pattern:
 * search + category tabs + sort + card grid + detail dialog.
 * Joins component_catalogue with pricing, certifications, reviews,
 * and compatibility data.
 */
export default function ComponentLibraryPage() {
  const [components, setComponents] = useState<ComponentListItem[]>([])
  const [total, setTotal] = useState(0)
  const [categories, setCategories] = useState<string[]>([])
  const [isLoading, startTransition] = useTransition()

  // Filter state
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [sortBy, setSortBy] = useState<SortOption>('name')
  const [page, setPage] = useState(1)
  const pageSize = 24

  // Detail dialog state
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  const loadComponents = useCallback(() => {
    startTransition(async () => {
      const result = await getComponents({
        search: debouncedSearch || undefined,
        category: activeCategory !== 'all' ? activeCategory : undefined,
        sortBy,
        page,
        pageSize,
      })
      if ('data' in result) {
        setComponents(result.data)
        setTotal(result.total)
      }
    })
  }, [debouncedSearch, activeCategory, sortBy, page])

  useEffect(() => {
    loadComponents()
  }, [loadComponents])

  // Load categories once
  useEffect(() => {
    async function load() {
      const result = await getComponentCategories()
      if ('data' in result) {
        setCategories(result.data)
      }
    }
    load()
  }, [])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, activeCategory, sortBy])

  function handleCardClick(component: ComponentListItem) {
    setSelectedId(component.id)
    setSelectedName(component.name)
    setIsDialogOpen(true)
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className={spacing.section}>
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="min-w-0 flex-1">
          <div className={typography.pageHeader}>
            <div className={typography.pageHeaderAccent} />
            <h1 className={typography.h1}>Component Library</h1>
          </div>
          <p className={typography.pageSubtitle}>
            Browse components with pricing, certifications, and compatibility data
          </p>
        </div>
        <Button variant="ghost" asChild>
          <Link href="/the-forge">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Forge
          </Link>
        </Button>
      </div>

      {/* Toolbar */}
      <div className="space-y-3">
        {/* Category tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveCategory('all')}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
              activeCategory === 'all'
                ? 'bg-international-orange text-white'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            All
            <span className="ml-1 opacity-75">({total})</span>
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors capitalize',
                activeCategory === cat
                  ? 'bg-international-orange text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {cat.replace(/_/g, ' ')}
            </button>
          ))}
        </div>

        {/* Search + Sort */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search components..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select
            value={sortBy ?? 'name'}
            onValueChange={(value) => setSortBy(value as SortOption)}
          >
            <SelectTrigger className="w-[180px]" aria-label="Sort by">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {total} component{total !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : components.length === 0 ? (
        <EmptyState
          title={debouncedSearch || activeCategory !== 'all'
            ? 'No components match your filters'
            : 'Component library is being populated'
          }
          description={debouncedSearch || activeCategory !== 'all'
            ? 'Try different keywords or reset your filters.'
            : 'Check back soon as components are being added.'
          }
          action={
            (debouncedSearch || activeCategory !== 'all') ? (
              <Button
                variant="outline"
                onClick={() => {
                  setSearch('')
                  setActiveCategory('all')
                }}
              >
                Reset Filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {components.map((comp) => (
              <ComponentCard
                key={comp.id}
                component={comp}
                onClick={() => handleCardClick(comp)}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}

      {/* Detail Dialog */}
      <ComponentDetailDialog
        componentId={selectedId}
        componentName={selectedName}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
      />
    </div>
  )
}
