/**
 * @file product-detail-view.tsx — Client component for product detail page.
 *
 * @description Renders the full product detail with hero image, lifecycle
 * progress indicator, linked CAD project card, and unit economics summary.
 * Tab structure is scaffolded for future phases (Market, Economics, etc).
 *
 * @related
 * - src/app/(platform)/products/[id]/page.tsx — Server component
 * - src/actions/products.ts — Server actions
 * - src/types/product.ts — Types
 */

'use client'

import * as React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { SpecialistBriefingHero } from '@/components/specialists/specialist-briefing-hero'
import { usePageBriefing } from '@/hooks/use-page-briefing'
import { generatePageBriefing } from '@/actions/specialist-page-insights'
import {
  updateProduct,
  deleteProduct,
  syncProductFinancials,
  generateMarketAssessment,
  scoreFundability,
  synthesizeProductStatus,
  generateDesignBriefFromAssessment,
  generateDesignBriefFromSuggestion,
  generateDesignBriefFromSynthesis,
  getDesignBriefs,
  convertBriefToForge,
  updateDesignBrief,
  createIteration,
  getIterationHistory,
  checkForgeCompletionAndSync,
  reviewBriefFeasibility,
} from '@/actions/products'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { typography } from '@/lib/design-system'
import { formatCurrency } from '@/types/payments'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import {
  Package,
  Pencil,
  Trash2,
  ArrowLeft,
  Hammer,
  ExternalLink,
  Check,
  Lock,
  Loader2,
  Plus,
  X,
  AlertTriangle,
  Search,
  TrendingUp,
  Lightbulb,
  Target,
  FileText,
  Send,
  ClipboardList,
  History,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  RotateCcw,
  Zap,
} from 'lucide-react'
import type { Product, ProductLifecycle, MarketAssessment, FundabilityScore, DesignBrief, ProductIteration, ProductSynthesis, IterationPareto } from '@/types/product'
import { LIFECYCLE_LABELS, LIFECYCLE_ORDER } from '@/types/product'

// ─── Lifecycle styling ──────────────────────────────────────────────

const LIFECYCLE_VARIANT: Record<ProductLifecycle, 'default' | 'secondary' | 'success' | 'warning' | 'info' | 'brand' | 'outline'> = {
  concept: 'outline',
  researching: 'info',
  validated: 'info',
  prototyping: 'warning',
  pre_production: 'brand',
  in_market: 'success',
  deprecated: 'secondary',
}

// ─── Tabs ───────────────────────────────────────────────────────────

// INTENT: Tabs are trimmed to ones that do real work. A "Financials" tab was
// listed here but rendered as locked scaffolding; it's been removed until
// the P&L and revenue-projection data deserve their own surface. Until then
// the Cash Burn page is the honest home for projections, and Economics
// covers per-unit numbers.
const TABS = [
  { id: 'overview', label: 'Overview', enabled: true },
  { id: 'market', label: 'Market', enabled: true },
  { id: 'economics', label: 'Economics', enabled: true },
  { id: 'fundability', label: 'Fundability', enabled: true },
  { id: 'history', label: 'History', enabled: true },
] as const

// ─── Convergence badge config ────────────────────────────────────────

const CONVERGENCE_CONFIG: Record<string, { label: string; variant: 'success' | 'warning' | 'info' | 'secondary' | 'destructive' }> = {
  initial: { label: 'Initial', variant: 'secondary' },
  improving: { label: 'Improving', variant: 'success' },
  moderate: { label: 'Moderate', variant: 'info' },
  plateauing: { label: 'Plateauing', variant: 'warning' },
  regressing: { label: 'Regressing', variant: 'destructive' },
  converged: { label: 'Converged', variant: 'info' },
}

const PARETO_DIMENSIONS = ['market', 'financial', 'fundability', 'manufacturing'] as const

// ─── Helpers ────────────────────────────────────────────────────────

function formatPence(pence: number): string {
  return `\u00A3${(pence / 100).toFixed(2)}`
}

// ─── Props ──────────────────────────────────────────────────────────

interface ProductDetailViewProps {
  product: Product
}

// ─── Component ──────────────────────────────────────────────────────

export function ProductDetailView({ product: initialProduct }: ProductDetailViewProps) {
  const router = useRouter()
  const [product, setProduct] = React.useState(initialProduct)
  const [activeTab, setActiveTab] = React.useState('overview')
  const [isEditing, setIsEditing] = React.useState(false)
  const [editDescription, setEditDescription] = React.useState(product.description || '')
  const [isSaving, setIsSaving] = React.useState(false)
  const [isDeleting, setIsDeleting] = React.useState(false)

  // ── Economics tab state ────────────────────────────────────────
  const [priceInput, setPriceInput] = React.useState(product.unit_price_pence ? String(product.unit_price_pence / 100) : '')
  const [volumeInput, setVolumeInput] = React.useState(product.target_monthly_units ? String(product.target_monthly_units) : '')

  // ── Fundability tab state ────────────────────────────────────────
  const [isScoring, setIsScoring] = React.useState(false)
  const [fundability, setFundability] = React.useState<FundabilityScore | null>(product.fundability_score)

  // ── Market tab state ─────────────────────────────────────────────
  const [isAssessing, setIsAssessing] = React.useState(false)
  const [marketDraft, setMarketDraft] = React.useState<MarketAssessment | null>(product.market_assessment)
  const [isSavingMarket, setIsSavingMarket] = React.useState(false)

  // ── Design brief state ─────────────────────────────────────────
  const [isGeneratingBrief, setIsGeneratingBrief] = React.useState(false)
  const [briefs, setBriefs] = React.useState<DesignBrief[]>([])
  const [briefsLoaded, setBriefsLoaded] = React.useState(false)

  // ── History / Synthesis state ──────────────────────────────────
  const [iterations, setIterations] = React.useState<ProductIteration[]>([])
  const [iterationsLoaded, setIterationsLoaded] = React.useState(false)
  const [synthesis, setSynthesis] = React.useState<ProductSynthesis | null>(
    (product.product_synthesis as ProductSynthesis | null) ?? null,
  )
  const [isSynthesizing, setIsSynthesizing] = React.useState(false)
  const [isStartingIteration, setIsStartingIteration] = React.useState(false)
  const [approvedImprovements, setApprovedImprovements] = React.useState<Set<string>>(new Set())
  const [iterationResult, setIterationResult] = React.useState<'celebration' | 'warning' | null>(null)
  const [iterationResultMessage, setIterationResultMessage] = React.useState<string>('')
  const [isSendingToForge, setIsSendingToForge] = React.useState(false)

  // ── Fundability → Design Brief flow state ─────────────────────────
  const [applyingSuggestionIdx, setApplyingSuggestionIdx] = React.useState<number | null>(null)
  const [suggestionBrief, setSuggestionBrief] = React.useState<DesignBrief | null>(null)
  const [showBriefReviewDialog, setShowBriefReviewDialog] = React.useState(false)
  const [isApprovingBrief, setIsApprovingBrief] = React.useState(false)
  const [maxReview, setMaxReview] = React.useState<{ review: string; feasible: boolean } | null>(null)
  const [isReviewingBrief, setIsReviewingBrief] = React.useState(false)

  // INTENT: Fetch design briefs on mount
  React.useEffect(() => {
    let cancelled = false
    async function loadBriefs() {
      const result = await getDesignBriefs(product.id)
      if (!cancelled && result.data) {
        setBriefs(result.data)
      }
      if (!cancelled) setBriefsLoaded(true)
    }
    loadBriefs()
    return () => { cancelled = true }
  }, [product.id])

  // FLOW: Check if linked Forge project has completed and auto-sync COGS
  React.useEffect(() => {
    if (!product.cad_lab_project_id) return
    let cancelled = false
    async function checkForge() {
      const result = await checkForgeCompletionAndSync(product.id)
      if (cancelled) return
      if (result.data?.synced) {
        // FLOW: COGS updated — refresh product and trigger reassessment chain
        const { getProduct } = await import('@/actions/products')
        const refreshed = await getProduct(product.id)
        if (!cancelled && refreshed.data) {
          setProduct(refreshed.data)
          toast.success(`${product.name}: COGS updated from The Forge${result.data.newCogsPence ? ` to £${(result.data.newCogsPence / 100).toFixed(2)} / unit` : ' with a new estimate'}.`)

          // FLOW: Auto-trigger fundability rescore → synthesis
          scoreFundability(product.id).then((fsResult) => {
            if (!cancelled && fsResult.data) {
              setFundability(fsResult.data)
              synthesizeProductStatus(product.id).then((synthResult) => {
                if (!cancelled && synthResult.data) setSynthesis(synthResult.data)
              }).catch(() => {})
            }
          }).catch(() => {})
        }
      }
    }
    checkForge()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id, product.cad_lab_project_id])

  // ── AI Briefing ──────────────────────────────────────────────────
  const briefingContext = React.useMemo(() => {
    const parts: string[] = [`Product: ${product.name}`, `Stage: ${product.lifecycle}`]
    if (product.unit_economics?.cogs_per_unit_pence) {
      parts.push(`COGS: ${formatPence(product.unit_economics.cogs_per_unit_pence)}`)
    }
    if (product.unit_economics?.gross_margin_pct != null) {
      parts.push(`Margin: ${product.unit_economics.gross_margin_pct.toFixed(1)}%`)
    }
    if (product.cad_lab_project_id) parts.push('Linked to CAD Lab')
    // FLOW: Include iteration progress for Priya to reference
    if (iterations.length > 0) {
      const latest = iterations[iterations.length - 1]
      parts.push(`Iteration ${latest.iteration_number} (${latest.convergence_status})`)
      if (iterations.length >= 2) {
        const first = iterations[0]
        const fp = first.pareto_scores as IterationPareto
        const lp = latest.pareto_scores as IterationPareto
        const totalImprovement = (lp.market + lp.financial + lp.fundability + lp.manufacturing)
          - (fp.market + fp.financial + fp.fundability + fp.manufacturing)
        if (totalImprovement !== 0) {
          parts.push(`Total improvement since v1: ${totalImprovement > 0 ? '+' : ''}${totalImprovement} points`)
        }
      }
    }
    if (synthesis) {
      const p = synthesis.pareto
      parts.push(`Pareto: market=${p.market}, financial=${p.financial}, fundability=${p.fundability}, manufacturing=${p.manufacturing}`)
    }
    return parts.join(', ')
  }, [product, iterations, synthesis])

  const briefingSeverity = React.useMemo(() => {
    if (product.lifecycle === 'deprecated') return 'warning' as const
    return 'success' as const
  }, [product.lifecycle])

  const briefing = usePageBriefing(
    () => generatePageBriefing('product-lead', briefingContext, briefingSeverity),
    briefingSeverity,
    true,
    `briefing-product-${product.id}`,
  )

  // INTENT: Fetch iterations when History tab is first opened
  React.useEffect(() => {
    if (activeTab !== 'history' || iterationsLoaded) return
    let cancelled = false
    async function loadIterations() {
      const result = await getIterationHistory(product.id)
      if (!cancelled && result.data) {
        setIterations(result.data)
      }
      if (!cancelled) setIterationsLoaded(true)
    }
    loadIterations()
    return () => { cancelled = true }
  }, [activeTab, iterationsLoaded, product.id])

  // ── Handlers ─────────────────────────────────────────────────────
  const handleSaveDescription = React.useCallback(async () => {
    setIsSaving(true)
    try {
      const result = await updateProduct(product.id, { description: editDescription })
      if (result.error) {
        toast.error(result.error)
      } else if (result.data) {
        setProduct(result.data)
        setIsEditing(false)
        toast.success('Description updated')
      }
    } catch {
      toast.error('Failed to save')
    } finally {
      setIsSaving(false)
    }
  }, [product.id, editDescription])

  const handleDelete = React.useCallback(async () => {
    if (!confirm(`Remove ${product.name} from your products? You can create it again later, but iteration history and linked briefs will be cleared.`)) return
    setIsDeleting(true)
    try {
      const result = await deleteProduct(product.id)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Product deleted')
        router.push('/products')
      }
    } catch {
      toast.error('Failed to delete')
    } finally {
      setIsDeleting(false)
    }
  }, [product.id, router])

  const handleSavePricing = React.useCallback(async () => {
    const price = parseFloat(priceInput)
    const volume = parseInt(volumeInput)
    if (isNaN(price) || price <= 0 || isNaN(volume) || volume <= 0) {
      toast.error('Enter a valid price and volume')
      return
    }
    setIsSaving(true)
    try {
      const result = await updateProduct(product.id, {
        unit_price_pence: Math.round(price * 100),
        target_monthly_units: volume,
      })
      if (result.error) {
        toast.error(result.error)
        return
      }
      if (result.data) setProduct(result.data)

      // INTENT: Auto-create/update Cash Burn items from product pricing
      const syncResult = await syncProductFinancials(product.id)
      if (syncResult.error) {
        toast.error(`Saved pricing, but sync failed: ${syncResult.error}`)
      } else {
        toast.success('Pricing saved & synced to Cash Burn')

        // FLOW: Auto-trigger synthesis after economics update
        synthesizeProductStatus(product.id).then((synthResult) => {
          if (synthResult.data) setSynthesis(synthResult.data)
        }).catch(() => {})
      }
    } catch {
      toast.error('Failed to save pricing')
    } finally {
      setIsSaving(false)
    }
  }, [product.id, priceInput, volumeInput])

  // ── Fundability tab handler ──────────────────────────────────────
  const handleScoreFundability = React.useCallback(async () => {
    setIsScoring(true)
    try {
      const result = await scoreFundability(product.id)
      if (result.error) {
        toast.error(result.error)
      } else if (result.data) {
        setFundability(result.data)
        toast.success('Fundability score computed')

        // FLOW: Auto-trigger synthesis after fundability scoring
        synthesizeProductStatus(product.id).then((synthResult) => {
          if (synthResult.data) {
            setSynthesis(synthResult.data)
            toast.success('Synthesis updated')
          }
        }).catch(() => {
          // Non-critical — synthesis is supplementary
        })
      }
    } catch {
      toast.error('Failed to compute fundability score')
    } finally {
      setIsScoring(false)
    }
  }, [product.id])

  // ── Fundability → Design Brief handler ─────────────────────────────

  const handleApplySuggestion = React.useCallback(async (
    suggestion: { action: string; impact_description: string },
    index: number,
  ) => {
    setApplyingSuggestionIdx(index)
    try {
      const result = await generateDesignBriefFromSuggestion(product.id, suggestion)
      if (result.error) {
        toast.error(result.error)
      } else if (result.data) {
        setSuggestionBrief(result.data)
        setShowBriefReviewDialog(true)
        setMaxReview(null)
        // INTENT: Add brief to local list so it appears immediately
        setBriefs(prev => [result.data!, ...prev])

        // FLOW: Auto-trigger Max CTO feasibility review
        setIsReviewingBrief(true)
        reviewBriefFeasibility(result.data.id).then((reviewResult) => {
          if (reviewResult.data) setMaxReview(reviewResult.data)
        }).catch(() => {}).finally(() => setIsReviewingBrief(false))
      }
    } catch {
      toast.error('Failed to generate design brief')
    } finally {
      setApplyingSuggestionIdx(null)
    }
  }, [product.id])

  const handleApproveBriefAndSendToForge = React.useCallback(async () => {
    if (!suggestionBrief) return
    setIsApprovingBrief(true)
    try {
      // FLOW: Convert brief to Forge project
      const forgeResult = await convertBriefToForge(suggestionBrief.id)
      if (forgeResult.error) {
        toast.error(forgeResult.error)
        setIsApprovingBrief(false)
        return
      }

      // FLOW: Create iteration recording the change
      const currentFundability = fundability?.overall ?? 0
      const currentMarket = product.market_assessment ? 50 : 20
      const currentFinancial = product.unit_economics?.gross_margin_pct
        ? Math.min(100, Math.round(product.unit_economics.gross_margin_pct))
        : 20
      const currentManufacturing = product.cad_lab_project_id ? 50 : 20

      const briefContent = suggestionBrief.brief_content as unknown as Record<string, unknown>
      const suggestionAction = typeof briefContent.source_context === 'string'
        ? briefContent.source_context
        : 'Applied fundability suggestion'

      await createIteration(
        product.id,
        {
          market: currentMarket,
          financial: currentFinancial,
          fundability: currentFundability,
          manufacturing: currentManufacturing,
        },
        [{ description: suggestionAction, dimension: 'fundability' }],
        suggestionAction,
      )

      setShowBriefReviewDialog(false)
      setSuggestionBrief(null)
      toast.success('Design brief approved and sent to The Forge')

      // INTENT: Navigate to the new CAD Lab project
      if (forgeResult.data?.cadLabProjectId) {
        router.push(`/the-forge/cad-lab?project=${forgeResult.data.cadLabProjectId}`)
      }
    } catch {
      toast.error('Failed to send to Forge')
    } finally {
      setIsApprovingBrief(false)
    }
  }, [suggestionBrief, product, fundability, router])

  const handleRejectBrief = React.useCallback(async () => {
    if (!suggestionBrief) return
    try {
      await updateDesignBrief(suggestionBrief.id, { status: 'rejected' })
      // INTENT: Update local brief list to reflect rejection
      setBriefs(prev => prev.map(b => b.id === suggestionBrief.id ? { ...b, status: 'rejected' as const } : b))
      toast.success('Brief rejected')
    } catch {
      toast.error('Failed to reject brief')
    }
    setShowBriefReviewDialog(false)
    setSuggestionBrief(null)
  }, [suggestionBrief])

  // ── Market tab handlers ───────────────────────────────────────────

  const handleAssessMarket = React.useCallback(async () => {
    setIsAssessing(true)
    try {
      const result = await generateMarketAssessment(product.id)
      if (result.error) {
        toast.error(result.error)
      } else if (result.data) {
        setMarketDraft(result.data)
        // INTENT: Re-fetch product to pick up lifecycle change (concept -> researching)
        const refreshed = await import('@/actions/products').then(m => m.getProduct(product.id))
        if (refreshed.data) setProduct(refreshed.data)
        toast.success(`Market assessment ready for ${product.name}. Review the TAM, competitors, and pricing, then validate or refine.`)

        // FLOW: Auto-trigger synthesis after market assessment
        synthesizeProductStatus(product.id).then((synthResult) => {
          if (synthResult.data) {
            setSynthesis(synthResult.data)
          }
        }).catch(() => {
          // Non-critical
        })
      }
    } catch {
      toast.error('Failed to generate market assessment')
    } finally {
      setIsAssessing(false)
    }
  }, [product.id])

  const handleSaveAssessment = React.useCallback(async () => {
    if (!marketDraft) return
    setIsSavingMarket(true)
    try {
      const result = await updateProduct(product.id, { market_assessment: marketDraft })
      if (result.error) {
        toast.error(result.error)
      } else if (result.data) {
        setProduct(result.data)
        toast.success(`Market assessment saved for ${product.name}.`)
      }
    } catch {
      toast.error('Failed to save assessment')
    } finally {
      setIsSavingMarket(false)
    }
  }, [product.id, marketDraft])

  // ── Design brief handlers ────────────────────────────────────────

  const handleGenerateDesignBrief = React.useCallback(async () => {
    setIsGeneratingBrief(true)
    try {
      const result = await generateDesignBriefFromAssessment(product.id)
      if (result.error) {
        toast.error(result.error)
      } else if (result.data) {
        setBriefs(prev => [result.data!, ...prev])
        toast.success('Design brief generated')
      }
    } catch {
      toast.error('Failed to generate design brief')
    } finally {
      setIsGeneratingBrief(false)
    }
  }, [product.id])

  const handleSendToForge = React.useCallback(async (briefId: string) => {
    setIsSendingToForge(true)
    try {
      const result = await convertBriefToForge(briefId)
      if (result.error) {
        toast.error(result.error)
      } else if (result.data) {
        toast.success('Design sent to The Forge')
        router.push(`/the-forge/cad-lab/${result.data.cadLabProjectId}`)
      }
    } catch {
      toast.error('Failed to send to Forge')
    } finally {
      setIsSendingToForge(false)
    }
  }, [router])

  /**
   * Updates a specific field in the market draft and marks it as founder_validated.
   */
  const updateMarketField = React.useCallback(<K extends keyof MarketAssessment>(
    field: K,
    value: MarketAssessment[K],
  ) => {
    setMarketDraft(prev => {
      if (!prev) return prev
      return {
        ...prev,
        [field]: value,
        validation_status: {
          ...prev.validation_status,
          [field]: 'founder_validated' as const,
        },
      }
    })
  }, [])

  // ── Synthesis handler ──────────────────────────────────────────────
  const handleRunSynthesis = React.useCallback(async () => {
    setIsSynthesizing(true)
    try {
      const result = await synthesizeProductStatus(product.id)
      if (result.error) {
        toast.error(result.error)
      } else if (result.data) {
        setSynthesis(result.data)
        toast.success(`Synthesis updated — all four Pareto scores refreshed for ${product.name}.`)
      }
    } catch {
      toast.error('Synthesis failed')
    } finally {
      setIsSynthesizing(false)
    }
  }, [product.id])

  // ── Toggle improvement approval ────────────────────────────────────
  const toggleImprovement = React.useCallback((improvement: string) => {
    setApprovedImprovements(prev => {
      const next = new Set(prev)
      if (next.has(improvement)) {
        next.delete(improvement)
      } else {
        next.add(improvement)
      }
      return next
    })
  }, [])

  // ── Start next iteration handler ──────────────────────────────────
  const handleStartNextIteration = React.useCallback(async () => {
    if (approvedImprovements.size === 0) {
      toast.error('Select at least one improvement to include')
      return
    }

    setIsStartingIteration(true)
    try {
      // FLOW: Generate brief from selected improvements
      const improvements = Array.from(approvedImprovements)
      const briefResult = await generateDesignBriefFromSynthesis(product.id, improvements)
      if (briefResult.error) {
        toast.error(briefResult.error)
        setIsStartingIteration(false)
        return
      }

      if (!briefResult.data) {
        toast.error('No brief generated')
        setIsStartingIteration(false)
        return
      }

      // FLOW: Convert brief to Forge project
      const forgeResult = await convertBriefToForge(briefResult.data.id)
      if (forgeResult.error) {
        toast.error(forgeResult.error)
        setIsStartingIteration(false)
        return
      }

      // FLOW: Create iteration record
      const currentPareto = synthesis?.pareto ?? { market: 0, financial: 0, fundability: 0, manufacturing: 0 }
      await createIteration(
        product.id,
        currentPareto,
        improvements.map(imp => ({ description: imp, dimension: 'synthesis' })),
        `Next iteration: ${improvements.join('; ')}`.slice(0, 500),
      )

      // INTENT: Refresh iterations list and check for celebration/warning
      const iterResult = await getIterationHistory(product.id)
      if (iterResult.data) {
        setIterations(iterResult.data)

        // FLOW: Compare latest two iterations for celebration/warning state
        if (iterResult.data.length >= 2) {
          const prev = iterResult.data[iterResult.data.length - 2].pareto_scores as IterationPareto
          const curr = iterResult.data[iterResult.data.length - 1].pareto_scores as IterationPareto
          const allImproved = PARETO_DIMENSIONS.every(d => curr[d] >= prev[d]) &&
            PARETO_DIMENSIONS.some(d => curr[d] > prev[d])
          const anyRegressed = PARETO_DIMENSIONS.some(d => curr[d] < prev[d])

          if (allImproved) {
            setIterationResult('celebration')
            setIterationResultMessage('Every dimension improved this round. Review the trade-offs and decide if another pass is worth the time.')
          } else if (anyRegressed) {
            const regressed = PARETO_DIMENSIONS.filter(d => curr[d] < prev[d])
            setIterationResult('warning')
            setIterationResultMessage(
              `${regressed.join(', ')} regressed. The last change may have introduced a trade-off. Review before proceeding.`
            )
          }
        }
      }

      setBriefs(prev => [briefResult.data!, ...prev])
      setApprovedImprovements(new Set())
      toast.success('Next iteration started — new Forge project created')

      if (forgeResult.data?.cadLabProjectId) {
        router.push(`/the-forge/cad-lab?project=${forgeResult.data.cadLabProjectId}`)
      }
    } catch {
      toast.error('Failed to start next iteration')
    } finally {
      setIsStartingIteration(false)
    }
  }, [approvedImprovements, product.id, synthesis, router])

  const lifecycleIndex = LIFECYCLE_ORDER.indexOf(product.lifecycle)

  return (
    <div className="space-y-6">
      {/* Back link + header */}
      <div>
        <Link
          href="/products"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Products
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div>
            <div className={typography.pageHeader}>
              <div className={typography.pageHeaderAccent} />
              <h1 className={typography.h1}>{product.name}</h1>
              <Badge variant={LIFECYCLE_VARIANT[product.lifecycle]} size="sm">
                {LIFECYCLE_LABELS[product.lifecycle]}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsEditing(!isEditing)}
            >
              <Pencil className="h-4 w-4 mr-1" />
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={isDeleting}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          </div>
        </div>
      </div>

      {/* Priya briefing */}
      <SpecialistBriefingHero
        specialistId="product-lead"
        specialistName="Priya"
        specialistTitle="Product Development"
        narrative={briefing.narrative}
        fallbackMessage={`Reviewing ${product.name} — currently in ${LIFECYCLE_LABELS[product.lifecycle]} stage.`}
        isLoading={briefing.isLoading}
        loadingMessage={`Analysing ${product.name}...`}
        severity={briefing.severity}
        context={{ type: 'general', title: product.name, description: briefingContext }}
      />

      {/* Tab bar — WAI-ARIA tablist with arrow-key navigation */}
      <div className="border-b border-border" role="tablist" aria-label="Product sections">
        <div className="flex gap-0 -mb-px">
          {TABS.map((tab, i) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                id={`product-tab-${tab.id}`}
                role="tab"
                aria-selected={isActive}
                aria-controls={`product-tabpanel-${tab.id}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => tab.enabled && setActiveTab(tab.id)}
                onKeyDown={(e) => {
                  if (!tab.enabled) return
                  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                    e.preventDefault()
                    const enabledTabs = TABS.filter((t) => t.enabled)
                    const currentIdx = enabledTabs.findIndex((t) => t.id === activeTab)
                    const nextIdx = e.key === 'ArrowRight'
                      ? (currentIdx + 1) % enabledTabs.length
                      : (currentIdx - 1 + enabledTabs.length) % enabledTabs.length
                    const nextTab = enabledTabs[nextIdx]
                    setActiveTab(nextTab.id)
                    // Move focus to the newly active tab so arrow nav keeps flowing.
                    document.getElementById(`product-tab-${nextTab.id}`)?.focus()
                  } else if (e.key === 'Home') {
                    e.preventDefault()
                    const first = TABS.find((t) => t.enabled)
                    if (first) { setActiveTab(first.id); document.getElementById(`product-tab-${first.id}`)?.focus() }
                  } else if (e.key === 'End') {
                    e.preventDefault()
                    const enabledTabs = TABS.filter((t) => t.enabled)
                    const last = enabledTabs[enabledTabs.length - 1]
                    if (last) { setActiveTab(last.id); document.getElementById(`product-tab-${last.id}`)?.focus() }
                  }
                }}
                disabled={!tab.enabled}
                className={`
                  inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors
                  ${isActive
                    ? 'border-international-orange text-international-orange'
                    : tab.enabled
                      ? 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                      : 'border-transparent text-muted-foreground/50 cursor-not-allowed'
                  }
                `}
              >
                {!tab.enabled && <Lock className="h-3 w-3" aria-hidden="true" />}
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab content: Overview */}
      {activeTab === 'overview' && (
        <div
          className="grid gap-6 lg:grid-cols-3"
          role="tabpanel"
          id="product-tabpanel-overview"
          aria-labelledby="product-tab-overview"
        >
          {/* Main column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Hero image */}
            {product.hero_image_url ? (
              <Card>
                <CardContent className="p-0 overflow-hidden rounded-lg">
                  <div className="relative h-64 w-full bg-muted">
                    <Image
                      src={product.hero_image_url}
                      alt={product.name}
                      fill
                      className="object-contain"
                      sizes="(max-width: 1024px) 100vw, 66vw"
                    />
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-12">
                  <div className="flex flex-col items-center text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
                      <Package className="h-6 w-6 text-muted-foreground/40" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      No hero image yet. Link a CAD Lab project to import one.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Description */}
            <Card>
              <CardHeader>
                <h3 className={typography.h3}>Description</h3>
              </CardHeader>
              <CardContent>
                {isEditing ? (
                  <div className="space-y-3">
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      className="w-full min-h-[120px] p-3 text-sm rounded-md border border-input bg-background text-foreground resize-y"
                      placeholder="Describe your product..."
                    />
                    <div className="flex items-center gap-2 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setIsEditing(false)
                          setEditDescription(product.description || '')
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSaveDescription}
                        disabled={isSaving}
                      >
                        {isSaving ? 'Saving...' : 'Save'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {product.description || 'No description yet.'}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Lifecycle progress */}
            <Card>
              <CardHeader>
                <h3 className={typography.h3}>Lifecycle</h3>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-1">
                  {LIFECYCLE_ORDER.filter(s => s !== 'deprecated').map((stage, i) => {
                    const isCurrent = stage === product.lifecycle
                    const isPast = i < lifecycleIndex && product.lifecycle !== 'deprecated'
                    return (
                      <div key={stage} className="flex-1 flex flex-col items-center gap-1.5">
                        <div
                          className={`
                            h-2 w-full rounded-full transition-colors
                            ${isCurrent ? 'bg-international-orange' : isPast ? 'bg-international-orange/30' : 'bg-muted'}
                          `}
                        />
                        <span className={`text-[10px] font-medium ${isCurrent ? 'text-international-orange' : 'text-muted-foreground'}`}>
                          {LIFECYCLE_LABELS[stage]}
                        </span>
                        {isPast && (
                          <Check className="h-3 w-3 text-international-orange/50" />
                        )}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Design Briefs section */}
            {briefsLoaded && briefs.length > 0 && (() => {
              const latest = briefs[0]
              const bc = latest.brief_content
              return (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <h3 className={typography.h3}>Design Brief</h3>
                      <Badge variant="info" size="sm">
                        {latest.status === 'sent_to_forge' ? 'Sent to Forge' : latest.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Headline numbers */}
                    <div className="grid grid-cols-2 gap-4">
                      {bc.target_cost_pence != null && (
                        <div className="p-3 rounded-md bg-muted">
                          <p className="text-xs text-muted-foreground">Target Cost</p>
                          <p className="text-lg font-semibold text-foreground">
                            {formatPence(bc.target_cost_pence)}
                          </p>
                        </div>
                      )}
                      {bc.target_weight_kg != null && (
                        <div className="p-3 rounded-md bg-muted">
                          <p className="text-xs text-muted-foreground">Target Weight</p>
                          <p className="text-lg font-semibold text-foreground">
                            {bc.target_weight_kg} kg
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Key requirements */}
                    {bc.key_requirements.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                          <ClipboardList className="h-3 w-3" />
                          Key Requirements
                        </p>
                        <ul className="space-y-1">
                          {bc.key_requirements.map((req, i) => (
                            <li key={i} className="text-sm text-foreground flex items-start gap-2">
                              <span className="text-international-orange mt-1 shrink-0">&bull;</span>
                              {req}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Materials guidance */}
                    {bc.materials_guidance.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-2">Materials Guidance</p>
                        <ul className="space-y-1">
                          {bc.materials_guidance.map((mat, i) => (
                            <li key={i} className="text-sm text-foreground flex items-start gap-2">
                              <span className="text-international-orange mt-1 shrink-0">&bull;</span>
                              {mat}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Manufacturing constraints */}
                    {bc.manufacturing_constraints.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-2">Manufacturing Constraints</p>
                        <ul className="space-y-1">
                          {bc.manufacturing_constraints.map((con, i) => (
                            <li key={i} className="text-sm text-foreground flex items-start gap-2">
                              <span className="text-muted-foreground mt-1 shrink-0">&bull;</span>
                              {con}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Design priorities */}
                    {bc.design_priorities.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-2">Design Priorities</p>
                        <ol className="space-y-1 list-decimal list-inside">
                          {bc.design_priorities.map((pri, i) => (
                            <li key={i} className="text-sm text-foreground">{pri}</li>
                          ))}
                        </ol>
                      </div>
                    )}

                    {/* Send to Forge button */}
                    {latest.status !== 'sent_to_forge' && (
                      <Button
                        onClick={() => handleSendToForge(latest.id)}
                        disabled={isSendingToForge}
                        className="w-full"
                      >
                        {isSendingToForge ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            Sending...
                          </>
                        ) : (
                          <>
                            <Send className="h-4 w-4 mr-1" />
                            Send to Forge
                          </>
                        )}
                      </Button>
                    )}

                    {latest.status === 'sent_to_forge' && latest.cad_lab_project_id && (
                      <Link
                        href={`/the-forge/cad-lab/${latest.cad_lab_project_id}`}
                        className="flex items-center justify-center gap-2 w-full p-2 text-sm font-medium text-international-orange bg-international-orange/10 rounded-md hover:bg-international-orange/20 transition-colors"
                      >
                        <Hammer className="h-4 w-4" />
                        View in The Forge
                      </Link>
                    )}
                  </CardContent>
                </Card>
              )
            })()}
          </div>

          {/* Sidebar column */}
          <div className="space-y-6">
            {/* Linked CAD Lab project */}
            {product.cad_lab_project_id && (
              <Card>
                <CardHeader>
                  <h3 className={typography.h3}>Linked Design</h3>
                </CardHeader>
                <CardContent>
                  <Link
                    href={`/the-forge/cad-lab?project=${product.cad_lab_project_id}`}
                    className="flex items-center gap-3 p-3 rounded-md bg-muted hover:bg-muted/80 transition-colors"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-international-orange/10">
                      <Hammer className="h-4 w-4 text-international-orange" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        CAD Lab Project
                      </p>
                      <p className="text-xs text-muted-foreground">
                        View in The Forge
                      </p>
                    </div>
                    <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
                  </Link>
                </CardContent>
              </Card>
            )}

            {/* Unit economics — empty state when no cost data yet */}
            {!product.unit_economics && (
              <Card>
                <CardHeader>
                  <h3 className={typography.h3}>Unit Economics</h3>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    No cost data yet. Set a unit price and target monthly units in the{' '}
                    <button
                      type="button"
                      onClick={() => setActiveTab('economics')}
                      className="text-international-orange hover:underline font-medium"
                    >
                      Economics
                    </button>{' '}
                    tab to see margins, breakeven, and revenue projections.
                    {product.cad_lab_project_id && (
                      <> COGS will sync over from The Forge once the design has cost estimates.</>
                    )}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Unit economics */}
            {product.unit_economics && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className={typography.h3}>Unit Economics</h3>
                    {product.unit_economics.last_synced_from_cad_at && (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground"
                        title={`COGS last synced from The Forge on ${new Date(product.unit_economics.last_synced_from_cad_at).toLocaleString()}`}
                      >
                        <Hammer className="h-3 w-3 text-international-orange" aria-hidden="true" />
                        Synced {formatDistanceToNow(new Date(product.unit_economics.last_synced_from_cad_at), { addSuffix: true })}
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        COGS / unit
                        {product.cad_lab_project_id && (
                          <span className="ml-1 text-[10px] uppercase tracking-wider text-international-orange">
                            from Forge
                          </span>
                        )}
                      </span>
                      <span className="text-sm font-medium text-foreground">
                        {formatPence(product.unit_economics.cogs_per_unit_pence)}
                      </span>
                    </div>

                    {product.unit_economics.selling_price_pence != null && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Selling price</span>
                        <span className="text-sm font-medium text-foreground">
                          {formatPence(product.unit_economics.selling_price_pence)}
                        </span>
                      </div>
                    )}

                    {product.unit_economics.gross_margin_pct != null && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Gross margin</span>
                        <span className="text-sm font-medium text-foreground">
                          {product.unit_economics.gross_margin_pct.toFixed(1)}%
                        </span>
                      </div>
                    )}

                    {product.unit_economics.cogs_confidence && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Confidence</span>
                        <Badge
                          variant={
                            product.unit_economics.cogs_confidence === 'high' ? 'success'
                            : product.unit_economics.cogs_confidence === 'medium' ? 'warning'
                            : 'outline'
                          }
                          size="sm"
                        >
                          {product.unit_economics.cogs_confidence}
                        </Badge>
                      </div>
                    )}

                    {/* COGS breakdown */}
                    {product.unit_economics.cogs_breakdown.length > 0 && (
                      <div className="pt-2 border-t border-border">
                        <p className="text-xs font-medium text-muted-foreground mb-2">Breakdown</p>
                        <div className="space-y-1.5">
                          {product.unit_economics.cogs_breakdown.map((item, i) => (
                            <div key={i} className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground truncate mr-2">{item.category}</span>
                              <span className="text-foreground font-medium shrink-0">
                                {formatPence(item.amount_pence)} ({item.pct}%)
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Quick stats */}
            <Card>
              <CardHeader>
                <h3 className={typography.h3}>Details</h3>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {product.unit_price_pence != null && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Unit price</span>
                      <span className="text-sm font-medium text-foreground">
                        {formatPence(product.unit_price_pence)}
                      </span>
                    </div>
                  )}
                  {product.target_monthly_units != null && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Target monthly units</span>
                      <span className="text-sm font-medium text-foreground">
                        {product.target_monthly_units.toLocaleString()}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Created</span>
                    <span className="text-sm text-foreground">
                      {new Date(product.created_at).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Tab content: Market */}
      {activeTab === 'market' && (
        <div
          className="space-y-6"
          role="tabpanel"
          id="product-tabpanel-market"
          aria-labelledby="product-tab-market"
        >
          {/* Header with action button */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Market Assessment</h2>
              <p className="text-sm text-muted-foreground">
                Research-backed market data for you to validate and refine.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {marketDraft && (
                <Button
                  onClick={handleSaveAssessment}
                  disabled={isSavingMarket}
                  variant="default"
                >
                  {isSavingMarket ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Assessment'
                  )}
                </Button>
              )}
              <Button
                onClick={handleAssessMarket}
                disabled={isAssessing}
                variant={marketDraft ? 'secondary' : 'default'}
              >
                {isAssessing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Researching...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-1" />
                    {marketDraft ? 'Re-assess Market' : 'Assess Market'}
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Staleness warning */}
          {marketDraft?.assessed_at && product.updated_at && (
            new Date(product.updated_at) > new Date(marketDraft.assessed_at)
          ) && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-warning/10 border border-warning/20">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
              <p className="text-sm text-warning">
                Product details have changed since this assessment was generated. Consider re-assessing.
              </p>
            </div>
          )}

          {!marketDraft ? (
            <Card>
              <CardContent className="py-12">
                <div className="flex flex-col items-center text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
                    <Search className="h-6 w-6 text-muted-foreground/40" />
                  </div>
                  <p className="text-sm font-medium text-foreground mb-1">No market assessment yet</p>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Run Assess Market to generate research on TAM, competitors, pricing, and opportunities you can take into your next pitch or planning session.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* TAM / SAM / SOM Card */}
              <Card>
                <CardHeader>
                  <h3 className={typography.h3}>Market Size (TAM / SAM / SOM)</h3>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    {(['tam_gbp', 'sam_gbp', 'som_gbp'] as const).map((field) => {
                      const labels = { tam_gbp: 'TAM', sam_gbp: 'SAM', som_gbp: 'SOM' }
                      const descriptions = {
                        tam_gbp: 'Total Addressable Market',
                        sam_gbp: 'Serviceable Addressable Market',
                        som_gbp: 'Serviceable Obtainable Market',
                      }
                      const status = marketDraft.validation_status[field]
                      return (
                        <div key={field} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label htmlFor={field}>{labels[field]}</Label>
                            <Badge variant={status === 'founder_validated' ? 'success' : 'warning'} size="sm">
                              {status === 'founder_validated' ? 'Validated' : 'AI Estimated'}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{descriptions[field]}</p>
                          <Input
                            id={field}
                            type="number"
                            min={0}
                            value={marketDraft[field] ?? ''}
                            onChange={(e) => {
                              const val = e.target.value === '' ? null : Number(e.target.value)
                              updateMarketField(field, val)
                            }}
                            placeholder="0"
                          />
                          {marketDraft[field] != null && (
                            <p className="text-xs text-muted-foreground">
                              {formatCurrency(marketDraft[field]!)}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Target Customer Card */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <h3 className={typography.h3}>Target Customer</h3>
                    <Badge
                      variant={marketDraft.validation_status.target_customer === 'founder_validated' ? 'success' : 'warning'}
                      size="sm"
                    >
                      {marketDraft.validation_status.target_customer === 'founder_validated' ? 'Validated' : 'AI Estimated'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <textarea
                    value={marketDraft.target_customer || ''}
                    onChange={(e) => updateMarketField('target_customer', e.target.value || null)}
                    className="w-full min-h-[80px] p-3 text-sm rounded-md border border-input bg-background text-foreground resize-y"
                    placeholder="Describe your ideal customer..."
                  />

                  {/* Customer Segments */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold text-foreground">Customer Segments</h4>
                      <Badge
                        variant={marketDraft.validation_status.customer_segments === 'founder_validated' ? 'success' : 'warning'}
                        size="sm"
                      >
                        {marketDraft.validation_status.customer_segments === 'founder_validated' ? 'Validated' : 'AI Estimated'}
                      </Badge>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Segment</th>
                            <th className="text-right py-2 px-4 font-medium text-muted-foreground">Size</th>
                            <th className="text-right py-2 px-4 font-medium text-muted-foreground">Willingness to Pay</th>
                            <th className="text-right py-2 pl-4 font-medium text-muted-foreground w-10"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {marketDraft.customer_segments.map((seg, i) => (
                            <tr key={i} className="border-b border-border last:border-0">
                              <td className="py-2 pr-4">
                                <Input
                                  value={seg.name}
                                  onChange={(e) => {
                                    const updated = [...marketDraft.customer_segments]
                                    updated[i] = { ...seg, name: e.target.value }
                                    updateMarketField('customer_segments', updated)
                                  }}
                                  className="h-8"
                                />
                              </td>
                              <td className="py-2 px-4">
                                <Input
                                  type="number"
                                  min={0}
                                  value={seg.size ?? ''}
                                  onChange={(e) => {
                                    const updated = [...marketDraft.customer_segments]
                                    updated[i] = { ...seg, size: e.target.value === '' ? null : Number(e.target.value) }
                                    updateMarketField('customer_segments', updated)
                                  }}
                                  className="h-8 text-right"
                                />
                              </td>
                              <td className="py-2 px-4">
                                <Input
                                  type="number"
                                  min={0}
                                  value={seg.willingness_to_pay ?? ''}
                                  onChange={(e) => {
                                    const updated = [...marketDraft.customer_segments]
                                    updated[i] = { ...seg, willingness_to_pay: e.target.value === '' ? null : Number(e.target.value) }
                                    updateMarketField('customer_segments', updated)
                                  }}
                                  className="h-8 text-right"
                                  placeholder="pence"
                                />
                              </td>
                              <td className="py-2 pl-4 text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    const updated = marketDraft.customer_segments.filter((_, idx) => idx !== i)
                                    updateMarketField('customer_segments', updated)
                                  }}
                                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      onClick={() => {
                        updateMarketField('customer_segments', [
                          ...marketDraft.customer_segments,
                          { name: '', size: null, willingness_to_pay: null },
                        ])
                      }}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Segment
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Competitive Landscape Card */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <h3 className={typography.h3}>Competitive Landscape</h3>
                    <Badge
                      variant={marketDraft.validation_status.competitive_landscape === 'founder_validated' ? 'success' : 'warning'}
                      size="sm"
                    >
                      {marketDraft.validation_status.competitive_landscape === 'founder_validated' ? 'Validated' : 'AI Estimated'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Competitor</th>
                          <th className="text-left py-2 px-4 font-medium text-muted-foreground">Strengths</th>
                          <th className="text-left py-2 px-4 font-medium text-muted-foreground">Weaknesses</th>
                          <th className="text-right py-2 px-4 font-medium text-muted-foreground">Price Point</th>
                          <th className="text-right py-2 pl-4 font-medium text-muted-foreground w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {marketDraft.competitive_landscape.map((comp, i) => (
                          <tr key={i} className="border-b border-border last:border-0">
                            <td className="py-2 pr-4">
                              <Input
                                value={comp.competitor}
                                onChange={(e) => {
                                  const updated = [...marketDraft.competitive_landscape]
                                  updated[i] = { ...comp, competitor: e.target.value }
                                  updateMarketField('competitive_landscape', updated)
                                }}
                                className="h-8"
                              />
                            </td>
                            <td className="py-2 px-4">
                              <Input
                                value={comp.strengths}
                                onChange={(e) => {
                                  const updated = [...marketDraft.competitive_landscape]
                                  updated[i] = { ...comp, strengths: e.target.value }
                                  updateMarketField('competitive_landscape', updated)
                                }}
                                className="h-8"
                              />
                            </td>
                            <td className="py-2 px-4">
                              <Input
                                value={comp.weaknesses}
                                onChange={(e) => {
                                  const updated = [...marketDraft.competitive_landscape]
                                  updated[i] = { ...comp, weaknesses: e.target.value }
                                  updateMarketField('competitive_landscape', updated)
                                }}
                                className="h-8"
                              />
                            </td>
                            <td className="py-2 px-4">
                              <Input
                                type="number"
                                min={0}
                                value={comp.price_point ?? ''}
                                onChange={(e) => {
                                  const updated = [...marketDraft.competitive_landscape]
                                  updated[i] = { ...comp, price_point: e.target.value === '' ? null : Number(e.target.value) }
                                  updateMarketField('competitive_landscape', updated)
                                }}
                                className="h-8 text-right"
                                placeholder="pence"
                              />
                            </td>
                            <td className="py-2 pl-4 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const updated = marketDraft.competitive_landscape.filter((_, idx) => idx !== i)
                                  updateMarketField('competitive_landscape', updated)
                                }}
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    onClick={() => {
                      updateMarketField('competitive_landscape', [
                        ...marketDraft.competitive_landscape,
                        { competitor: '', strengths: '', weaknesses: '', price_point: null },
                      ])
                    }}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Competitor
                  </Button>
                </CardContent>
              </Card>

              {/* Pricing Analysis Card */}
              {marketDraft.pricing_analysis && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <h3 className={typography.h3}>Pricing Analysis</h3>
                      <Badge
                        variant={marketDraft.validation_status.pricing_analysis === 'founder_validated' ? 'success' : 'warning'}
                        size="sm"
                      >
                        {marketDraft.validation_status.pricing_analysis === 'founder_validated' ? 'Validated' : 'AI Estimated'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <Label htmlFor="rec-price">Recommended Price (pence)</Label>
                        <Input
                          id="rec-price"
                          type="number"
                          min={0}
                          value={marketDraft.pricing_analysis.recommended_price_pence ?? ''}
                          onChange={(e) => {
                            const pa = { ...marketDraft.pricing_analysis! }
                            pa.recommended_price_pence = e.target.value === '' ? null : Number(e.target.value)
                            updateMarketField('pricing_analysis', pa)
                          }}
                        />
                        {marketDraft.pricing_analysis.recommended_price_pence != null && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatPence(marketDraft.pricing_analysis.recommended_price_pence)}
                          </p>
                        )}
                      </div>
                      <div>
                        <Label htmlFor="pricing-model">Pricing Model</Label>
                        <Input
                          id="pricing-model"
                          value={marketDraft.pricing_analysis.pricing_model ?? ''}
                          onChange={(e) => {
                            const pa = { ...marketDraft.pricing_analysis! }
                            pa.pricing_model = e.target.value || null
                            updateMarketField('pricing_analysis', pa)
                          }}
                          placeholder="e.g. One-time purchase, Subscription"
                        />
                      </div>
                      <div>
                        <Label htmlFor="price-low">Price Range Low (pence)</Label>
                        <Input
                          id="price-low"
                          type="number"
                          min={0}
                          value={marketDraft.pricing_analysis.price_range_low_pence ?? ''}
                          onChange={(e) => {
                            const pa = { ...marketDraft.pricing_analysis! }
                            pa.price_range_low_pence = e.target.value === '' ? null : Number(e.target.value)
                            updateMarketField('pricing_analysis', pa)
                          }}
                        />
                        {marketDraft.pricing_analysis.price_range_low_pence != null && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatPence(marketDraft.pricing_analysis.price_range_low_pence)}
                          </p>
                        )}
                      </div>
                      <div>
                        <Label htmlFor="price-high">Price Range High (pence)</Label>
                        <Input
                          id="price-high"
                          type="number"
                          min={0}
                          value={marketDraft.pricing_analysis.price_range_high_pence ?? ''}
                          onChange={(e) => {
                            const pa = { ...marketDraft.pricing_analysis! }
                            pa.price_range_high_pence = e.target.value === '' ? null : Number(e.target.value)
                            updateMarketField('pricing_analysis', pa)
                          }}
                        />
                        {marketDraft.pricing_analysis.price_range_high_pence != null && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatPence(marketDraft.pricing_analysis.price_range_high_pence)}
                          </p>
                        )}
                      </div>
                    </div>
                    {marketDraft.pricing_analysis.reasoning && (
                      <div className="p-3 rounded-md bg-muted">
                        <p className="text-xs font-medium text-muted-foreground mb-1">AI Reasoning</p>
                        <p className="text-sm text-foreground">{marketDraft.pricing_analysis.reasoning}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Risks & Opportunities */}
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Market Risks */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <h3 className={typography.h3}>Market Risks</h3>
                      <Badge
                        variant={marketDraft.validation_status.market_risks === 'founder_validated' ? 'success' : 'warning'}
                        size="sm"
                      >
                        {marketDraft.validation_status.market_risks === 'founder_validated' ? 'Validated' : 'AI Estimated'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {marketDraft.market_risks.map((risk, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <Input
                            value={risk}
                            onChange={(e) => {
                              const updated = [...marketDraft.market_risks]
                              updated[i] = e.target.value
                              updateMarketField('market_risks', updated)
                            }}
                            className="h-8"
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              updateMarketField('market_risks', marketDraft.market_risks.filter((_, idx) => idx !== i))
                            }}
                            className="h-8 w-8 p-0 shrink-0 text-muted-foreground hover:text-destructive"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      onClick={() => updateMarketField('market_risks', [...marketDraft.market_risks, ''])}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Risk
                    </Button>
                  </CardContent>
                </Card>

                {/* Market Opportunities */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <h3 className={typography.h3}>Market Opportunities</h3>
                      <Badge
                        variant={marketDraft.validation_status.market_opportunities === 'founder_validated' ? 'success' : 'warning'}
                        size="sm"
                      >
                        {marketDraft.validation_status.market_opportunities === 'founder_validated' ? 'Validated' : 'AI Estimated'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {marketDraft.market_opportunities.map((opp, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <Input
                            value={opp}
                            onChange={(e) => {
                              const updated = [...marketDraft.market_opportunities]
                              updated[i] = e.target.value
                              updateMarketField('market_opportunities', updated)
                            }}
                            className="h-8"
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              updateMarketField('market_opportunities', marketDraft.market_opportunities.filter((_, idx) => idx !== i))
                            }}
                            className="h-8 w-8 p-0 shrink-0 text-muted-foreground hover:text-destructive"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      onClick={() => updateMarketField('market_opportunities', [...marketDraft.market_opportunities, ''])}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Opportunity
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {/* Assessment metadata */}
              {marketDraft.assessed_at && (
                <p className="text-xs text-muted-foreground text-right">
                  Last assessed: {new Date(marketDraft.assessed_at).toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                  {marketDraft.model_used && ` | Model: ${marketDraft.model_used}`}
                </p>
              )}

              {/* Generate Design Brief CTA */}
              <Card className="border-international-orange/20 bg-international-orange/5">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold text-foreground">Ready to design?</h3>
                      <p className="text-xs text-muted-foreground">
                        Generate an engineering design brief from this market assessment to send to The Forge.
                      </p>
                    </div>
                    <Button
                      onClick={handleGenerateDesignBrief}
                      disabled={isGeneratingBrief}
                    >
                      {isGeneratingBrief ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <FileText className="h-4 w-4 mr-1" />
                          Generate Design Brief
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      {/* Tab content: Economics */}
      {activeTab === 'economics' && (
        <div
          className="space-y-6"
          role="tabpanel"
          id="product-tabpanel-economics"
          aria-labelledby="product-tab-economics"
        >
          {/* Price & Volume */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Pricing & Volume</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="unit-price">Unit Price (&pound;)</Label>
                  <Input
                    id="unit-price"
                    type="number"
                    min={0}
                    step={0.01}
                    value={priceInput}
                    onChange={(e) => setPriceInput(e.target.value)}
                    placeholder="e.g. 49.99"
                  />
                </div>
                <div>
                  <Label htmlFor="target-volume">Target Monthly Units</Label>
                  <Input
                    id="target-volume"
                    type="number"
                    min={0}
                    step={1}
                    value={volumeInput}
                    onChange={(e) => setVolumeInput(e.target.value)}
                    placeholder="e.g. 100"
                  />
                </div>
              </div>
              <Button onClick={handleSavePricing} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save & Sync to Cash Burn'}
              </Button>
            </CardContent>
          </Card>

          {/* Volume Sensitivity */}
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-sm font-semibold text-foreground mb-4">Volume Sensitivity</h3>
              {(() => {
                const unitPrice = product.unit_price_pence ?? 0
                const cogsPerUnit = product.unit_economics?.cogs_per_unit_pence ?? 0
                const targetUnits = product.target_monthly_units ?? 0

                if (!unitPrice || !targetUnits) {
                  return (
                    <p className="text-sm text-muted-foreground">
                      Set unit price and target monthly units above to see volume sensitivity.
                    </p>
                  )
                }

                const scenarios = [
                  { label: '50% volume', multiplier: 0.5 },
                  { label: '100% volume (target)', multiplier: 1 },
                  { label: '200% volume', multiplier: 2 },
                ]

                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Scenario</th>
                          <th className="text-right py-2 px-4 font-medium text-muted-foreground">Units</th>
                          <th className="text-right py-2 px-4 font-medium text-muted-foreground">Monthly Revenue</th>
                          <th className="text-right py-2 px-4 font-medium text-muted-foreground">Monthly COGS</th>
                          <th className="text-right py-2 px-4 font-medium text-muted-foreground">Monthly Gross Profit</th>
                          <th className="text-right py-2 pl-4 font-medium text-muted-foreground">Annual Gross Profit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scenarios.map((s) => {
                          const units = Math.round(targetUnits * s.multiplier)
                          const revenue = unitPrice * units
                          const cogs = cogsPerUnit * units
                          const grossProfit = revenue - cogs
                          const annualGross = grossProfit * 12

                          return (
                            <tr key={s.label} className="border-b border-border last:border-0">
                              <td className="py-2 pr-4 font-medium text-foreground">{s.label}</td>
                              <td className="text-right py-2 px-4 text-foreground">{units.toLocaleString()}</td>
                              <td className="text-right py-2 px-4 text-foreground">{formatCurrency(revenue / 100)}</td>
                              <td className="text-right py-2 px-4 text-foreground">{formatCurrency(cogs / 100)}</td>
                              <td className={`text-right py-2 px-4 font-medium ${grossProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                                {formatCurrency(grossProfit / 100)}
                              </td>
                              <td className={`text-right py-2 pl-4 font-medium ${annualGross >= 0 ? 'text-success' : 'text-destructive'}`}>
                                {formatCurrency(annualGross / 100)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              })()}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab content: Fundability */}
      {activeTab === 'fundability' && (
        <div
          className="space-y-6"
          role="tabpanel"
          id="product-tabpanel-fundability"
          aria-labelledby="product-tab-fundability"
        >
          {/* Score Overview */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h3 className={typography.h3}>Fundability Score</h3>
                <Button
                  onClick={handleScoreFundability}
                  disabled={isScoring}
                  size="sm"
                >
                  {isScoring ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      Scoring...
                    </>
                  ) : (
                    <>
                      <Target className="h-4 w-4 mr-1.5" />
                      {fundability ? 'Re-score' : 'Score Fundability'}
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {fundability ? (
                <div className="flex items-center gap-6">
                  <div className="flex flex-col items-center">
                    <span
                      className={`text-5xl font-bold tabular-nums ${
                        fundability.overall > 70 ? 'text-success'
                        : fundability.overall > 45 ? 'text-warning'
                        : 'text-destructive'
                      }`}
                    >
                      {fundability.overall}
                    </span>
                    <span className="text-xs text-muted-foreground mt-1">out of 100</span>
                  </div>
                  <div>
                    <Badge
                      variant={
                        fundability.investor_appetite === 'strong' ? 'success'
                        : fundability.investor_appetite === 'moderate' ? 'warning'
                        : 'destructive'
                      }
                      size="sm"
                    >
                      {fundability.investor_appetite === 'strong' ? 'Strong investor appetite'
                      : fundability.investor_appetite === 'moderate' ? 'Moderate investor appetite'
                      : 'Weak investor appetite'}
                    </Badge>
                    {fundability.scored_at && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Last scored {new Date(fundability.scored_at).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center text-center py-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
                    <Target className="h-6 w-6 text-muted-foreground/40" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Score this product to see how fundable it is and get improvement suggestions.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Score Breakdown */}
          {fundability && (
            <Card>
              <CardHeader>
                <h3 className={typography.h3}>Score Breakdown</h3>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { label: 'Market Size', score: fundability.market_size_score, weight: '25%' },
                    { label: 'Margin', score: fundability.margin_score, weight: '25%' },
                    { label: 'Defensibility', score: fundability.defensibility_score, weight: '20%' },
                    { label: 'Team Readiness', score: fundability.team_readiness_score, weight: '15%' },
                    { label: 'Traction', score: fundability.traction_score, weight: '15%' },
                  ].map((item) => (
                    <div key={item.label} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">
                          {item.label}
                          <span className="text-xs text-muted-foreground ml-1">({item.weight})</span>
                        </span>
                        <span
                          className={`text-sm font-semibold tabular-nums ${
                            item.score > 70 ? 'text-success'
                            : item.score > 45 ? 'text-warning'
                            : 'text-destructive'
                          }`}
                        >
                          {item.score}
                        </span>
                      </div>
                      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            item.score > 70 ? 'bg-success'
                            : item.score > 45 ? 'bg-warning'
                            : 'bg-destructive'
                          }`}
                          style={{ width: `${item.score}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Improvement Suggestions */}
          {fundability && (fundability.improvement_suggestions?.length ?? 0) > 0 && (
            <Card>
              <CardHeader>
                <h3 className={typography.h3}>Improvement Suggestions</h3>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {fundability.improvement_suggestions.map((suggestion, i) => (
                    <div key={i} className="flex gap-3 p-3 rounded-md bg-muted/50">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-international-orange/10">
                        <Lightbulb className="h-4 w-4 text-international-orange" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{suggestion.action}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{suggestion.impact_description}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" size="sm">
                            <TrendingUp className="h-3 w-3 mr-1" />
                            +{suggestion.estimated_score_lift} pts
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={applyingSuggestionIdx !== null}
                            className="text-xs h-6 px-2 text-international-orange hover:text-international-orange"
                            onClick={() => handleApplySuggestion(suggestion, i)}
                          >
                            {applyingSuggestionIdx === i ? (
                              <>
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                Generating...
                              </>
                            ) : (
                              'Apply to Design Brief'
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Tab content: History */}
      {activeTab === 'history' && (
        <div
          className="space-y-6"
          role="tabpanel"
          id="product-tabpanel-history"
          aria-labelledby="product-tab-history"
        >
          {/* Synthesis Overview */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h3 className={typography.h3}>Product Synthesis</h3>
                <Button
                  onClick={handleRunSynthesis}
                  disabled={isSynthesizing}
                  size="sm"
                >
                  {isSynthesizing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      Synthesizing...
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4 mr-1.5" />
                      {synthesis ? 'Re-synthesize' : 'Run Synthesis'}
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {synthesis ? (
                <div className="space-y-6">
                  {/* Pareto Score Bars */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-3">Pareto Scores</p>
                    <div className="space-y-3">
                      {PARETO_DIMENSIONS.map((dim) => {
                        const score = synthesis.pareto[dim]
                        return (
                          <div key={dim} className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-foreground capitalize">{dim}</span>
                              <span className={`text-sm font-bold tabular-nums ${
                                score > 70 ? 'text-success'
                                : score > 45 ? 'text-warning'
                                : 'text-destructive'
                              }`}>
                                {score}
                              </span>
                            </div>
                            <div className="h-2 rounded-full bg-muted overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  score > 70 ? 'bg-success'
                                  : score > 45 ? 'bg-warning'
                                  : 'bg-destructive'
                                }`}
                                style={{ width: `${Math.min(100, score)}%` }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Convergence Indicator */}
                  {iterations.length > 0 && (() => {
                    const latest = iterations[iterations.length - 1]
                    const config = CONVERGENCE_CONFIG[latest.convergence_status] ?? CONVERGENCE_CONFIG.initial
                    return (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Status:</span>
                        <Badge variant={config.variant} size="sm">{config.label}</Badge>
                        <span className="text-xs text-muted-foreground">
                          after {iterations.length} iteration{iterations.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    )
                  })()}

                  {/* Next Action */}
                  <div className="p-3 rounded-md bg-international-orange/5 border border-international-orange/20">
                    <p className="text-xs font-semibold text-international-orange mb-1">Next Action</p>
                    <p className="text-sm text-foreground">{synthesis.nextAction}</p>
                  </div>

                  {/* Type A Improvements (Aligned) */}
                  {synthesis.typeA.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">
                        Aligned Improvements
                        <span className="ml-1 text-success">(improve multiple dimensions)</span>
                      </p>
                      <div className="space-y-2">
                        {synthesis.typeA.map((imp, i) => (
                          <label
                            key={i}
                            className="flex items-start gap-3 p-3 rounded-md border border-border hover:border-success/40 transition-colors cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={approvedImprovements.has(imp)}
                              onChange={() => toggleImprovement(imp)}
                              className="mt-0.5 h-4 w-4 rounded border-border text-success focus:ring-success"
                            />
                            <span className="text-sm text-foreground">{imp}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Type B Improvements (Trade-offs) */}
                  {synthesis.typeB.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">
                        Trade-off Improvements
                        <span className="ml-1 text-warning">(require founder decision)</span>
                      </p>
                      <div className="space-y-2">
                        {synthesis.typeB.map((imp, i) => (
                          <label
                            key={i}
                            className="flex items-start gap-3 p-3 rounded-md border border-border hover:border-warning/40 transition-colors cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={approvedImprovements.has(imp)}
                              onChange={() => toggleImprovement(imp)}
                              className="mt-0.5 h-4 w-4 rounded border-border text-warning focus:ring-warning"
                            />
                            <span className="text-sm text-foreground">{imp}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Local Optimum Warning */}
                  {/* Product Readiness Milestone */}
                  {synthesis.pareto.market >= 70 && synthesis.pareto.financial >= 70 &&
                   synthesis.pareto.fundability >= 70 && synthesis.pareto.manufacturing >= 70 && (
                    <div className="p-4 rounded-md bg-success/10 border border-success/20">
                      <p className="text-sm font-semibold text-success mb-2">
                        <Check className="h-4 w-4 inline mr-1.5" />
                        This product is ready.
                      </p>
                      <p className="text-sm text-foreground mb-2">
                        All four Pareto dimensions exceed 70/100. Your product is profitable, manufacturable, market-validated, and investor-attractive.
                      </p>
                      <div className="grid grid-cols-4 gap-2 mb-3">
                        {PARETO_DIMENSIONS.map((dim) => (
                          <div key={dim} className="text-center">
                            <p className="text-[10px] text-muted-foreground capitalize">{dim}</p>
                            <p className="text-lg font-bold text-success tabular-nums">{synthesis.pareto[dim]}</p>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="secondary" onClick={() => router.push('/investors')}>
                          Find best-fit investors
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => router.push('/cash-burn')}>
                          Review runway
                        </Button>
                      </div>
                    </div>
                  )}

                  {synthesis.isLocalOptimum && (
                    <div className="p-3 rounded-md bg-warning/10 border border-warning/20">
                      <p className="text-sm text-foreground">
                        <AlertTriangle className="h-4 w-4 inline mr-1.5 text-warning" />
                        This product appears to be at a <strong>local optimum</strong>. All remaining improvements involve trade-offs.
                        Consider a strategic pivot or new market information to break through.
                      </p>
                    </div>
                  )}

                  {/* Start Next Iteration Button */}
                  {approvedImprovements.size > 0 && (
                    <Button
                      onClick={handleStartNextIteration}
                      disabled={isStartingIteration}
                      className="w-full"
                    >
                      {isStartingIteration ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                          Starting next iteration...
                        </>
                      ) : (
                        <>
                          <RotateCcw className="h-4 w-4 mr-1.5" />
                          Start Next Iteration ({approvedImprovements.size} improvement{approvedImprovements.size !== 1 ? 's' : ''})
                        </>
                      )}
                    </Button>
                  )}

                  {/* Celebration / Warning state */}
                  {iterationResult === 'celebration' && (
                    <div className="p-4 rounded-md bg-success/10 border border-success/20">
                      <p className="text-sm font-medium text-success mb-1">All dimensions improved!</p>
                      <p className="text-sm text-foreground">{iterationResultMessage}</p>
                    </div>
                  )}
                  {iterationResult === 'warning' && (
                    <div className="p-4 rounded-md bg-warning/10 border border-warning/20">
                      <p className="text-sm font-medium text-warning mb-1">
                        <AlertTriangle className="h-4 w-4 inline mr-1" />
                        Regression detected
                      </p>
                      <p className="text-sm text-foreground">{iterationResultMessage}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center text-center py-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
                    <Zap className="h-6 w-6 text-muted-foreground/40" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Run synthesis to see your product&apos;s Pareto scores across market, financial, fundability, and manufacturing dimensions.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Iteration Timeline */}
          <Card>
            <CardHeader>
              <h3 className={typography.h3}>Iteration History</h3>
            </CardHeader>
            <CardContent>
              {!iterationsLoaded ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : iterations.length === 0 ? (
                <div className="flex flex-col items-center text-center py-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
                    <History className="h-6 w-6 text-muted-foreground/40" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    No iterations yet. Iterations are created when you apply design briefs or start a new optimization cycle.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Iteration comparison (latest vs first) */}
                  {iterations.length >= 2 && (() => {
                    const first = iterations[0]
                    const latest = iterations[iterations.length - 1]
                    const fp = first.pareto_scores as IterationPareto
                    const lp = latest.pareto_scores as IterationPareto

                    return (
                      <div className="p-3 rounded-md bg-muted/50 mb-4">
                        <p className="text-xs font-medium text-muted-foreground mb-2">
                          Progress: Iteration {first.iteration_number} vs {latest.iteration_number}
                        </p>
                        <div className="grid grid-cols-4 gap-3">
                          {PARETO_DIMENSIONS.map((dim) => {
                            const delta = lp[dim] - fp[dim]
                            return (
                              <div key={dim} className="text-center">
                                <p className="text-xs text-muted-foreground capitalize">{dim}</p>
                                <p className={`text-sm font-bold tabular-nums ${
                                  delta > 0 ? 'text-success' : delta < 0 ? 'text-destructive' : 'text-muted-foreground'
                                }`}>
                                  {delta > 0 ? '+' : ''}{delta}
                                </p>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })()}

                  {/* Timeline entries */}
                  <div className="relative">
                    <div className="absolute left-3 top-0 bottom-0 w-px bg-border" />
                    <div className="space-y-6">
                      {[...iterations].reverse().map((iter) => {
                        const scores = iter.pareto_scores as IterationPareto
                        const config = CONVERGENCE_CONFIG[iter.convergence_status] ?? CONVERGENCE_CONFIG.initial

                        return (
                          <div key={iter.id} className="relative pl-8">
                            {/* Timeline dot */}
                            <div className={`absolute left-1.5 top-1 h-3 w-3 rounded-full border-2 border-background ${
                              iter.convergence_status === 'improving' ? 'bg-success'
                              : iter.convergence_status === 'regressing' ? 'bg-destructive'
                              : iter.convergence_status === 'converged' ? 'bg-info'
                              : 'bg-muted-foreground'
                            }`} />

                            <div className="space-y-2">
                              {/* Header */}
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-semibold text-foreground">
                                  Iteration {iter.iteration_number}
                                </span>
                                <Badge variant={config.variant} size="sm">{config.label}</Badge>
                                {iter.convergence_delta !== 0 && (
                                  <span className={`text-xs font-medium tabular-nums flex items-center gap-0.5 ${
                                    iter.convergence_delta > 0 ? 'text-success' : 'text-destructive'
                                  }`}>
                                    {iter.convergence_delta > 0 ? (
                                      <ArrowUpRight className="h-3 w-3" />
                                    ) : (
                                      <ArrowDownRight className="h-3 w-3" />
                                    )}
                                    {iter.convergence_delta > 0 ? '+' : ''}{iter.convergence_delta.toFixed(0)}
                                  </span>
                                )}
                                <span className="text-xs text-muted-foreground ml-auto">
                                  {new Date(iter.created_at).toLocaleDateString('en-GB', {
                                    day: 'numeric', month: 'short', year: 'numeric',
                                  })}
                                </span>
                              </div>

                              {/* Mini Pareto bars */}
                              <div className="grid grid-cols-4 gap-2">
                                {PARETO_DIMENSIONS.map((dim) => (
                                  <div key={dim} className="space-y-0.5">
                                    <p className="text-[10px] text-muted-foreground capitalize">{dim}</p>
                                    <div className="flex items-center gap-1">
                                      <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                                        <div
                                          className={`h-full rounded-full ${
                                            scores[dim] > 70 ? 'bg-success'
                                            : scores[dim] > 45 ? 'bg-warning'
                                            : 'bg-destructive'
                                          }`}
                                          style={{ width: `${Math.min(100, scores[dim])}%` }}
                                        />
                                      </div>
                                      <span className="text-[10px] text-muted-foreground tabular-nums w-5 text-right">
                                        {scores[dim]}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {/* Hypothesis */}
                              {iter.hypothesis && (
                                <p className="text-xs text-muted-foreground">
                                  <span className="font-medium">Hypothesis:</span> {iter.hypothesis}
                                </p>
                              )}

                              {/* Changes made */}
                              {iter.changes_made && (iter.changes_made as Array<{ description: string }>).length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {(iter.changes_made as Array<{ description: string; dimension: string }>).map((change, i) => (
                                    <Badge key={i} variant="outline" size="sm">
                                      {change.description.length > 60
                                        ? change.description.slice(0, 60) + '...'
                                        : change.description}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Brief Review Dialog (Fundability → Design Brief → Forge) ── */}
      <Dialog open={showBriefReviewDialog} onOpenChange={(open) => {
        if (!open) {
          setShowBriefReviewDialog(false)
          setSuggestionBrief(null)
        }
      }}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Review Design Brief</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Generated from your fundability improvement suggestion. Review the brief and send it to The Forge to start a new design iteration.
            </p>
          </DialogHeader>

          {suggestionBrief && (() => {
            const bc = suggestionBrief.brief_content as unknown as Record<string, unknown>
            return (
              <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
                {/* Target cost */}
                {typeof bc.target_cost_pence === 'number' && (
                  <div className="flex items-center justify-between p-3 rounded-md bg-muted">
                    <span className="text-sm text-muted-foreground">Target Cost</span>
                    <span className="text-sm font-medium text-foreground">
                      {formatPence(bc.target_cost_pence as number)}
                    </span>
                  </div>
                )}

                {/* Key requirements */}
                {Array.isArray(bc.key_requirements) && bc.key_requirements.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Key Requirements</p>
                    <ul className="space-y-1.5">
                      {(bc.key_requirements as string[]).map((req, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                          <span className="text-international-orange mt-0.5 shrink-0">&#x2022;</span>
                          {req}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Design priorities */}
                {Array.isArray(bc.design_priorities) && bc.design_priorities.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Design Priorities</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(bc.design_priorities as string[]).map((p, i) => (
                        <Badge key={i} variant="outline" size="sm">
                          {i + 1}. {p}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Manufacturing constraints */}
                {Array.isArray(bc.manufacturing_constraints) && bc.manufacturing_constraints.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Manufacturing Constraints</p>
                    <ul className="space-y-1">
                      {(bc.manufacturing_constraints as string[]).map((c, i) => (
                        <li key={i} className="text-sm text-muted-foreground">{c}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Materials guidance */}
                {Array.isArray(bc.materials_guidance) && bc.materials_guidance.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Materials Guidance</p>
                    <ul className="space-y-1">
                      {(bc.materials_guidance as string[]).map((m, i) => (
                        <li key={i} className="text-sm text-muted-foreground">{m}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Source context */}
                {typeof bc.source_context === 'string' && (
                  <div className="p-3 rounded-md bg-muted">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Context</p>
                    <p className="text-sm text-foreground">{bc.source_context}</p>
                  </div>
                )}
              </div>
            )
          })()}

          {/* Max CTO Feasibility Review */}
          {isReviewingBrief && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-muted">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Max is reviewing feasibility...</span>
            </div>
          )}
          {maxReview && (
            <div className={`p-3 rounded-md border ${
              maxReview.feasible
                ? 'bg-success/5 border-success/20'
                : 'bg-warning/5 border-warning/20'
            }`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold text-foreground">Max (CTO) Review</span>
                <Badge variant={maxReview.feasible ? 'success' : 'warning'} size="sm">
                  {maxReview.feasible ? 'Feasible' : 'Concerns'}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{maxReview.review}</p>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={handleRejectBrief}
              disabled={isApprovingBrief}
            >
              Reject
            </Button>
            <Button
              onClick={handleApproveBriefAndSendToForge}
              disabled={isApprovingBrief}
            >
              {isApprovingBrief ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  Sending to Forge...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-1.5" />
                  Approve &amp; Send to Forge
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
