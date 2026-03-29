'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, GitMerge, X, ChevronDown, ChevronUp, Loader2, Package } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { applyMergeReview } from '@/actions/business-plan'
import { createProduct, generateMarketAssessment } from '@/actions/products'
import { toast } from 'sonner'
import type { MergeReviewState, ObjectiveMergeSuggestion, MergeDisposition, AnalyzedProduct } from '@/lib/business-plan-types'

// ─── Tabs ────────────────────────────────────────────────────────────

type TabId = 'objectives' | 'products'

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'objectives', label: 'Objectives' },
  { id: 'products', label: 'Products' },
]

// ─── Types ───────────────────────────────────────────────────────────

interface ProductAdoptState {
  product: AnalyzedProduct
  adopted: boolean
  creating: boolean
  created: boolean
  createdId?: string
}

interface MergeReviewDialogProps {
  open: boolean
  mergeState: MergeReviewState
  onClose: () => void
  onApplied: () => void
}

/**
 * @description Smart merge review dialog. Shows AI-suggested objectives compared
 * against existing ones, letting the user adopt, merge, or skip each suggestion.
 * Also shows extracted products with adopt toggles for creating them.
 */
export function MergeReviewDialog({ open, mergeState, onClose, onApplied }: MergeReviewDialogProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabId>('objectives')
  const [suggestions, setSuggestions] = useState(mergeState.objectiveSuggestions)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)

  // ── Products tab state ────────────────────────────────────────────
  const [productStates, setProductStates] = useState<ProductAdoptState[]>(
    (mergeState.extractedProducts ?? []).map(p => ({
      product: p,
      adopted: true, // Default to adopted
      creating: false,
      created: false,
    }))
  )

  const adopted = suggestions.filter(s => s.disposition === 'adopt').length
  const merged = suggestions.filter(s => s.disposition === 'merge').length
  const skipped = suggestions.filter(s => s.disposition === 'skip').length
  const productsToAdopt = productStates.filter(p => p.adopted && !p.created).length

  function setDisposition(id: string, disposition: MergeDisposition): void {
    setSuggestions(prev =>
      prev.map(s => s.id === id ? { ...s, disposition } : s)
    )
  }

  function toggleProductAdopt(index: number): void {
    setProductStates(prev =>
      prev.map((p, i) => i === index ? { ...p, adopted: !p.adopted } : p)
    )
  }

  async function handleApply(): Promise<void> {
    setApplying(true)

    // FLOW: Apply objectives merge first
    const finalState = { ...mergeState, objectiveSuggestions: suggestions }
    const result = await applyMergeReview(finalState)

    if (result.error) {
      setApplying(false)
      toast.error('Failed to apply changes', { description: result.error })
      return
    }

    // FLOW: Create adopted products
    let productsCreated = 0
    const updatedProductStates = [...productStates]

    for (let i = 0; i < updatedProductStates.length; i++) {
      const ps = updatedProductStates[i]
      if (!ps.adopted || ps.created) continue

      updatedProductStates[i] = { ...ps, creating: true }
      setProductStates([...updatedProductStates])

      const productResult = await createProduct({
        name: ps.product.name,
        description: ps.product.description || undefined,
        lifecycle: 'concept',
      })

      if (productResult.error) {
        updatedProductStates[i] = { ...ps, creating: false }
        console.error(`[merge-review] Failed to create product "${ps.product.name}":`, productResult.error)
      } else {
        updatedProductStates[i] = {
          ...ps,
          creating: false,
          created: true,
          createdId: productResult.data?.id,
        }
        productsCreated++

        // FLOW: Auto-trigger market assessment for adopted products
        if (productResult.data?.id) {
          generateMarketAssessment(productResult.data.id).catch((err) => {
            console.error(`[merge-review] Auto-assess failed for "${ps.product.name}":`, err)
          })
        }
      }
    }

    setProductStates(updatedProductStates)
    setApplying(false)

    // FLOW: Show appropriate success toast
    const parts: string[] = []
    if (adopted > 0) parts.push(`${adopted} new objective${adopted !== 1 ? 's' : ''}`)
    if (merged > 0) parts.push(`${merged} merged`)
    if (productsCreated > 0) parts.push(`${productsCreated} product${productsCreated !== 1 ? 's' : ''} created`)

    if (result.warnings && result.warnings.length > 0) {
      toast.warning('Strategy updated with warnings', {
        description: result.warnings.join('. '),
        duration: 8000,
      })
    } else {
      toast.success('Strategy updated', { description: parts.join(', ') + '.' })
    }

    onApplied()

    // INTENT: If products were created, navigate to products page
    if (productsCreated > 0) {
      router.push('/products')
    }
  }

  const hasProducts = productStates.length > 0

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent size="lg" className="max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Review Business Plan Suggestions</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Your business plan suggests {suggestions.length} strategic objectives
            {hasProducts ? ` and ${productStates.length} product${productStates.length !== 1 ? 's' : ''}` : ''}.
            Review each and choose how to handle it.
          </p>
        </DialogHeader>

        {/* Tab bar */}
        {hasProducts && (
          <div className="border-b border-border -mx-6 px-6">
            <div className="flex gap-0 -mb-px">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors',
                    activeTab === tab.id
                      ? 'border-international-orange text-international-orange'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                  )}
                >
                  {tab.label}
                  {tab.id === 'products' && (
                    <Badge variant="outline" size="sm" className="ml-1">
                      {productStates.length}
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Summary bar */}
        <div className="flex items-center gap-4 px-3 py-2 bg-muted/40 rounded-lg text-sm">
          <span className="flex items-center gap-1.5 text-status-success font-medium">
            <CheckCircle2 className="h-4 w-4" />
            {adopted} new
          </span>
          <span className="flex items-center gap-1.5 text-status-info font-medium">
            <GitMerge className="h-4 w-4" />
            {merged} merge
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <X className="h-4 w-4" />
            {skipped} skip
          </span>
          <span className="ml-auto text-xs text-muted-foreground">
            +{mergeState.hiringRequirements.length} hires · +{mergeState.fundingRequirements.length} funding events
            {productsToAdopt > 0 ? ` · +${productsToAdopt} product${productsToAdopt !== 1 ? 's' : ''}` : ''}
          </span>
        </div>

        <ScrollArea className="max-h-[52vh] pr-2">
          {/* Objectives tab */}
          {activeTab === 'objectives' && (
            <div className="space-y-3">
              {suggestions.map((s) => (
                <SuggestionCard
                  key={s.id}
                  suggestion={s}
                  expanded={expandedId === s.id}
                  onToggleExpand={() => setExpandedId(prev => prev === s.id ? null : s.id)}
                  onDisposition={(d) => setDisposition(s.id, d)}
                />
              ))}
            </div>
          )}

          {/* Products tab */}
          {activeTab === 'products' && (
            <div className="space-y-3">
              {productStates.length === 0 ? (
                <div className="flex flex-col items-center text-center py-8">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted mb-2">
                    <Package className="h-5 w-5 text-muted-foreground/40" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    No products were identified in this business plan.
                  </p>
                </div>
              ) : (
                productStates.map((ps, i) => (
                  <ProductCard
                    key={i}
                    state={ps}
                    onToggle={() => toggleProductAdopt(i)}
                  />
                ))
              )}
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleApply} disabled={applying}>
            {applying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Apply {adopted + merged + productsToAdopt} change{adopted + merged + productsToAdopt !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Objective Suggestion Card ───────────────────────────────────────

function SuggestionCard({
  suggestion,
  expanded,
  onToggleExpand,
  onDisposition,
}: {
  suggestion: ObjectiveMergeSuggestion
  expanded: boolean
  onToggleExpand: () => void
  onDisposition: (d: MergeDisposition) => void
}): React.JSX.Element {
  const { aiObjective, existingObjectiveTitle, disposition } = suggestion

  return (
    <div
      className={cn(
        'rounded-lg border p-4 transition-all',
        disposition === 'skip' && 'opacity-50',
        disposition === 'adopt' && 'border-status-success/40 bg-status-success-light/20',
        disposition === 'merge' && 'border-status-info/40 bg-status-info-light/20',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground text-sm">{aiObjective.title}</p>
          {aiObjective.phase && (
            <p className="text-xs text-muted-foreground mt-0.5">Phase: {aiObjective.phase}</p>
          )}
          {existingObjectiveTitle && (
            <p className="text-xs text-status-info mt-1">
              Similar to existing: &ldquo;{existingObjectiveTitle}&rdquo;
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <DispositionButton
            active={disposition === 'adopt'}
            onClick={() => onDisposition('adopt')}
            label="New"
            color="success"
          />
          {existingObjectiveTitle && (
            <DispositionButton
              active={disposition === 'merge'}
              onClick={() => onDisposition('merge')}
              label="Merge"
              color="info"
            />
          )}
          <DispositionButton
            active={disposition === 'skip'}
            onClick={() => onDisposition('skip')}
            label="Skip"
            color="neutral"
          />
          <button
            onClick={onToggleExpand}
            className="p-1 rounded text-muted-foreground hover:text-foreground"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2 border-t pt-3">
          <p className="text-sm text-muted-foreground">{aiObjective.description}</p>
          <p className="text-xs font-medium text-foreground">{aiObjective.tasks.length} tasks:</p>
          <ul className="space-y-1">
            {aiObjective.tasks.map((task, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary" className="text-[10px] shrink-0 mt-0.5">{task.role}</Badge>
                <span>{task.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── Product Card ────────────────────────────────────────────────────

function ProductCard({
  state,
  onToggle,
}: {
  state: ProductAdoptState
  onToggle: () => void
}): React.JSX.Element {
  const { product, adopted, creating, created } = state

  return (
    <div
      className={cn(
        'rounded-lg border p-4 transition-all',
        created && 'border-status-success/40 bg-status-success-light/20',
        adopted && !created && 'border-international-orange/40 bg-international-orange/5',
        !adopted && !created && 'opacity-50',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-international-orange/10 mt-0.5">
            <Package className="h-4 w-4 text-international-orange" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-foreground text-sm">{product.name}</p>
            {product.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{product.description}</p>
            )}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {product.targetMarket && (
                <Badge variant="outline" size="sm">Market: {product.targetMarket}</Badge>
              )}
              {product.revenueModel && (
                <Badge variant="outline" size="sm">{product.revenueModel}</Badge>
              )}
              {product.suggestedPrice != null && (
                <Badge variant="outline" size="sm">
                  ~{'\u00A3'}{product.suggestedPrice.toLocaleString()}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="shrink-0">
          {created ? (
            <Badge variant="success" size="sm">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Created
            </Badge>
          ) : creating ? (
            <Badge variant="info" size="sm">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Creating...
            </Badge>
          ) : (
            <button
              onClick={onToggle}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-colors border',
                adopted
                  ? 'bg-international-orange/10 text-international-orange border-international-orange/30'
                  : 'bg-transparent text-muted-foreground border-transparent hover:border-border hover:text-foreground',
              )}
            >
              {adopted ? 'Adopt' : 'Skip'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Disposition Button ──────────────────────────────────────────────

function DispositionButton({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean
  onClick: () => void
  label: string
  color: 'success' | 'info' | 'neutral'
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-2.5 py-1 rounded-md text-xs font-medium transition-colors border',
        active && color === 'success' && 'bg-status-success-light text-status-success border-status-success/30',
        active && color === 'info' && 'bg-status-info-light text-status-info border-status-info/30',
        active && color === 'neutral' && 'bg-muted text-muted-foreground border-border',
        !active && 'bg-transparent text-muted-foreground border-transparent hover:border-border hover:text-foreground'
      )}
    >
      {label}
    </button>
  )
}
