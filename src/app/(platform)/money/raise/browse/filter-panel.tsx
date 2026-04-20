'use client'

/**
 * @file filter-panel.tsx
 *
 * Rich multi-facet filter panel for /money/raise/browse. All state is URL-
 * driven — this component keeps a local working copy until the user clicks
 * "Apply filters", at which point we push the new querystring and let the
 * server component re-fetch. Copy-adapted (not imported) from the legacy
 * `InvestorFilterPanel` so the browse route stays self-contained.
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ChevronUp, X, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Facet enums
// ---------------------------------------------------------------------------

/**
 * Stage enum — kebab-case slugs per the spec. The server mapper
 * (normaliseStageTag in match-score.ts) already lower-cases + strips
 * separators, so "series-a" and "series_a" both score identically against
 * `attributes.stage_focus` values like "Series A".
 */
export const STAGE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'pre-seed', label: 'Pre-seed' },
  { value: 'seed', label: 'Seed' },
  { value: 'series-a', label: 'Series A' },
  { value: 'series-b', label: 'Series B' },
  { value: 'series-c', label: 'Series C' },
  { value: 'growth', label: 'Growth / Late stage' },
]

/**
 * Sector enum — aligned with /money/raise/thesis SECTOR_OPTIONS plus a few
 * common legacy labels. Scorer does substring match both directions so
 * "saas" matches "SaaS" / "software" / "b2b saas". Keep labels Title Case
 * for display; value is lowercase for URL stability.
 */
export const SECTOR_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'climate', label: 'Climate' },
  { value: 'fintech', label: 'Fintech' },
  { value: 'hardware', label: 'Hardware' },
  { value: 'biotech', label: 'Biotech' },
  { value: 'deep-tech', label: 'Deep tech' },
  { value: 'saas', label: 'SaaS' },
  { value: 'consumer', label: 'Consumer' },
  { value: 'marketplace', label: 'Marketplace' },
  { value: 'ai-ml', label: 'AI / ML' },
  { value: 'enterprise', label: 'Enterprise' },
  { value: 'health', label: 'Health' },
  { value: 'other', label: 'Other' },
]

/**
 * Firm-type enum — matches values seen in `attributes.firm_type` across the
 * ~7.5k finance listings (investors.ts VALID_FIRM_TYPES).
 */
export const FIRM_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'VC', label: 'VC' },
  { value: 'PE', label: 'PE' },
  { value: 'Angel', label: 'Angel' },
  { value: 'Family Office', label: 'Family Office' },
  { value: 'CVC', label: 'Corporate' },
  { value: 'Accelerator', label: 'Accelerator' },
  { value: 'Other', label: 'Other' },
]

/**
 * Top-20 country ISO codes seeded for the country multi-select. Exported so
 * browse-view can render the active-filter chip labels without rehydrating.
 */
export const COUNTRY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'GB', label: 'United Kingdom' },
  { value: 'US', label: 'United States' },
  { value: 'CA', label: 'Canada' },
  { value: 'DE', label: 'Germany' },
  { value: 'FR', label: 'France' },
  { value: 'NL', label: 'Netherlands' },
  { value: 'SG', label: 'Singapore' },
  { value: 'AU', label: 'Australia' },
  { value: 'IE', label: 'Ireland' },
  { value: 'IN', label: 'India' },
  { value: 'CN', label: 'China' },
  { value: 'JP', label: 'Japan' },
  { value: 'SE', label: 'Sweden' },
  { value: 'CH', label: 'Switzerland' },
  { value: 'ES', label: 'Spain' },
  { value: 'IT', label: 'Italy' },
  { value: 'BE', label: 'Belgium' },
  { value: 'DK', label: 'Denmark' },
  { value: 'FI', label: 'Finland' },
  { value: 'NO', label: 'Norway' },
]

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BrowseFilterDraft = {
  subcategory: string[]
  country: string[]
  stage: string[]
  sector: string[]
  firm_type: string[]
  cheque_min: number | null
  cheque_max: number | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a querystring from `q` + `sort` + the filter draft. Omits empties. */
export function buildBrowseQuery(args: {
  q: string
  sort: string
  filters: BrowseFilterDraft
  page?: number
}): string {
  const { q, sort, filters, page } = args
  const params = new URLSearchParams()
  if (q.trim()) params.set('q', q.trim())
  if (sort && sort !== 'match') params.set('sort', sort)
  if (filters.subcategory.length > 0) {
    for (const v of filters.subcategory) params.append('subcategory', v)
  }
  if (filters.country.length > 0) {
    for (const v of filters.country) params.append('country', v)
  }
  if (filters.stage.length > 0) {
    for (const v of filters.stage) params.append('stage', v)
  }
  if (filters.sector.length > 0) {
    for (const v of filters.sector) params.append('sector', v)
  }
  if (filters.firm_type.length > 0) {
    for (const v of filters.firm_type) params.append('firm_type', v)
  }
  if (filters.cheque_min != null && filters.cheque_min > 0) {
    params.set('cheque_min', String(filters.cheque_min))
  }
  if (filters.cheque_max != null && filters.cheque_max > 0) {
    params.set('cheque_max', String(filters.cheque_max))
  }
  if (page && page > 1) params.set('page', String(page))
  return params.toString()
}

export function emptyDraft(): BrowseFilterDraft {
  return {
    subcategory: [],
    country: [],
    stage: [],
    sector: [],
    firm_type: [],
    cheque_min: null,
    cheque_max: null,
  }
}

function countActive(f: BrowseFilterDraft): number {
  return (
    f.subcategory.length +
    f.country.length +
    f.stage.length +
    f.sector.length +
    f.firm_type.length +
    (f.cheque_min != null && f.cheque_min > 0 ? 1 : 0) +
    (f.cheque_max != null && f.cheque_max > 0 ? 1 : 0)
  )
}

// ---------------------------------------------------------------------------
// Checkbox group
// ---------------------------------------------------------------------------

function FacetGroup({
  title,
  options,
  selected,
  onToggle,
  idPrefix,
}: {
  title: string
  options: Array<{ value: string; label: string }>
  selected: string[]
  onToggle: (value: string) => void
  idPrefix: string
}) {
  const [expanded, setExpanded] = useState(true)
  const selectedCount = selected.length
  return (
    <section className="space-y-2 border-b border-border pb-4 last:border-b-0 last:pb-0">
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center justify-between text-left"
        aria-expanded={expanded}
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
          {selectedCount > 0 && (
            <span className="ml-2 text-international-orange">({selectedCount})</span>
          )}
        </span>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
      {expanded && (
        <div className="space-y-1.5 pt-1">
          {options.map((opt) => {
            const id = `${idPrefix}-${opt.value}`
            const checked = selected.includes(opt.value)
            return (
              <div key={opt.value} className="flex items-center gap-2">
                <Checkbox
                  id={id}
                  checked={checked}
                  onCheckedChange={() => onToggle(opt.value)}
                />
                <Label
                  htmlFor={id}
                  className="cursor-pointer text-sm font-normal leading-tight"
                >
                  {opt.label}
                </Label>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// FilterPanel
// ---------------------------------------------------------------------------

export function FilterPanel({
  initialFilters,
  subcategories,
  currentQuery,
  currentSort,
}: {
  initialFilters: BrowseFilterDraft
  subcategories: readonly string[]
  currentQuery: string
  currentSort: string
}) {
  const router = useRouter()
  const [draft, setDraft] = useState<BrowseFilterDraft>(initialFilters)

  const activeCount = useMemo(() => countActive(draft), [draft])

  const subcategoryOptions = useMemo(
    () => subcategories.map((s) => ({ value: s, label: s })),
    [subcategories],
  )

  const toggle = (key: keyof BrowseFilterDraft, value: string) => {
    setDraft((prev) => {
      const current = prev[key] as string[]
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value]
      return { ...prev, [key]: next }
    })
  }

  const setCheque = (which: 'cheque_min' | 'cheque_max', raw: string) => {
    const n = raw === '' ? null : Math.max(0, Math.floor(Number(raw)))
    setDraft((prev) => ({
      ...prev,
      [which]: n != null && Number.isFinite(n) && n > 0 ? n : null,
    }))
  }

  const apply = () => {
    const qs = buildBrowseQuery({
      q: currentQuery,
      sort: currentSort,
      filters: draft,
      page: 1,
    })
    router.push(`/money/raise/browse${qs ? `?${qs}` : ''}`)
  }

  const clear = () => {
    const fresh = emptyDraft()
    setDraft(fresh)
    const qs = buildBrowseQuery({
      q: currentQuery,
      sort: currentSort,
      filters: fresh,
      page: 1,
    })
    router.push(`/money/raise/browse${qs ? `?${qs}` : ''}`)
  }

  return (
    <aside
      aria-label="Investor filters"
      className="space-y-4 rounded-lg border border-border bg-card p-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <SlidersHorizontal className="h-4 w-4" />
          Filters
        </h2>
        {activeCount > 0 && (
          <Badge variant="secondary" size="sm">
            {activeCount} active
          </Badge>
        )}
      </div>

      <div className="space-y-4">
        <FacetGroup
          title="Type"
          idPrefix="facet-subcategory"
          options={subcategoryOptions}
          selected={draft.subcategory}
          onToggle={(v) => toggle('subcategory', v)}
        />
        <FacetGroup
          title="Firm type"
          idPrefix="facet-firm-type"
          options={FIRM_TYPE_OPTIONS}
          selected={draft.firm_type}
          onToggle={(v) => toggle('firm_type', v)}
        />
        <FacetGroup
          title="Stage"
          idPrefix="facet-stage"
          options={STAGE_OPTIONS}
          selected={draft.stage}
          onToggle={(v) => toggle('stage', v)}
        />
        <FacetGroup
          title="Sector"
          idPrefix="facet-sector"
          options={SECTOR_OPTIONS}
          selected={draft.sector}
          onToggle={(v) => toggle('sector', v)}
        />
        <FacetGroup
          title="Country"
          idPrefix="facet-country"
          options={COUNTRY_OPTIONS}
          selected={draft.country}
          onToggle={(v) => toggle('country', v)}
        />
        <section className="space-y-2 border-b border-border pb-4 last:border-b-0 last:pb-0">
          <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Cheque (£)
          </span>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="cheque-min" className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Min
              </Label>
              <Input
                id="cheque-min"
                type="number"
                min={0}
                step={1000}
                value={draft.cheque_min ?? ''}
                onChange={(e) => setCheque('cheque_min', e.target.value)}
                placeholder="250000"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="cheque-max" className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Max
              </Label>
              <Input
                id="cheque-max"
                type="number"
                min={0}
                step={1000}
                value={draft.cheque_max ?? ''}
                onChange={(e) => setCheque('cheque_max', e.target.value)}
                placeholder="5000000"
                className="mt-1"
              />
            </div>
          </div>
        </section>
      </div>

      <div className="flex items-center gap-2 pt-2">
        <Button
          type="button"
          onClick={apply}
          className={cn(
            'flex-1 bg-international-orange hover:bg-international-orange/90',
          )}
        >
          Apply filters
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={clear}
          disabled={activeCount === 0}
          aria-label="Clear all filters"
        >
          <X className="h-4 w-4" />
          Clear
        </Button>
      </div>
    </aside>
  )
}
