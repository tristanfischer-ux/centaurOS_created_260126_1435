/**
 * @file product-list-view.tsx — Client component for the /products page.
 *
 * @description Renders the product portfolio with Priya's briefing hero,
 * rich product cards (economics, status indicators, lifecycle), and
 * three clear creation flows: market idea, promote from Forge, inline
 * business plan upload.
 *
 * @related
 * - src/app/(platform)/products/page.tsx — Server component
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
  createProduct,
  createIteration,
  generateMarketAssessment,
  promoteFromCadLab,
} from '@/actions/products'
import { listCadLabProjects } from '@/actions/cad-lab-projects'
import { analyzeBusinessPlan } from '@/actions/analyze'
import { saveBusinessPlanAnalysis, buildSmartMerge } from '@/actions/business-plan'
import { extractKnowledgeFromUpload } from '@/actions/knowledge'
import { ALLOWED_EXTENSIONS, MAX_FILE_SIZE_BYTES } from '@/lib/business-plan-types'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { typography } from '@/lib/design-system'
import { toast } from 'sonner'
import {
  Hammer,
  Lightbulb,
  FileText,
  Package,
  ArrowRight,
  Loader2,
  Upload,
  Search,
  Star,
  Plus,
  TrendingUp,
} from 'lucide-react'
import type { ProductSummary, ProductLifecycle, ConvergenceStatus } from '@/types/product'
import { LIFECYCLE_LABELS } from '@/types/product'
import type { CadLabProjectSummary } from '@/actions/cad-lab-projects'

// ─── Config ──────────────────────────────────────────────────────────

const CONVERGENCE_BADGE: Record<string, { label: string; variant: 'success' | 'warning' | 'info' | 'destructive' }> = {
  improving: { label: 'Improving', variant: 'success' },
  moderate: { label: 'Moderate', variant: 'info' },
  plateauing: { label: 'Plateauing', variant: 'warning' },
  regressing: { label: 'Regressing', variant: 'destructive' },
  converged: { label: 'Converged', variant: 'info' },
}

const LIFECYCLE_VARIANT: Record<ProductLifecycle, 'default' | 'secondary' | 'success' | 'warning' | 'info' | 'brand' | 'outline'> = {
  concept: 'outline',
  researching: 'info',
  validated: 'info',
  prototyping: 'warning',
  pre_production: 'brand',
  in_market: 'success',
  deprecated: 'secondary',
}

const LIFECYCLE_ORDER: ProductLifecycle[] = [
  'concept', 'researching', 'validated', 'prototyping', 'pre_production', 'in_market',
]

// ─── Helpers ─────────────────────────────────────────────────────────

function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`
}

function formatCurrency(pence: number): string {
  if (pence >= 100_000) return `£${(pence / 100_000).toFixed(1)}k`
  return `£${(pence / 100).toFixed(0)}`
}

function formatMargin(pct: number): string {
  return `${pct.toFixed(1)}%`
}

function marginColor(pct: number): string {
  if (pct >= 40) return 'text-success'
  if (pct >= 20) return 'text-warning'
  return 'text-destructive'
}

function countByLifecycle(products: ProductSummary[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const p of products) {
    counts[p.lifecycle] = (counts[p.lifecycle] || 0) + 1
  }
  return counts
}

// ─── Props ───────────────────────────────────────────────────────────

interface ProductListViewProps {
  products: ProductSummary[]
}

// ─── Main Component ──────────────────────────────────────────────────

export function ProductListView({ products }: ProductListViewProps) {
  const router = useRouter()

  // ── State for creation flows ────────────────────────────────────
  const [marketDialogOpen, setMarketDialogOpen] = React.useState(false)
  const [forgePickerOpen, setForgePickerOpen] = React.useState(false)
  const [showPlanUpload, setShowPlanUpload] = React.useState(false)

  // ── AI Briefing ─────────────────────────────────────────────────
  const briefingContext = React.useMemo(() => {
    const counts = countByLifecycle(products)
    const parts = Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')
    return `Products: ${products.length}${parts ? ` (${parts})` : ''}`
  }, [products])

  // INTENT: Empty is a starting point, not a problem. Only escalate severity
  // when there's an actual regression to flag (e.g. a regressing iteration).
  // "warning" triggers failure-framing language in the AI briefing.
  const briefingSeverity = React.useMemo(() => {
    const hasRegressing = products.some((p) => p.latest_convergence_status === 'regressing')
    return hasRegressing ? 'warning' as const : 'success' as const
  }, [products])

  const briefing = usePageBriefing(
    () => generatePageBriefing('product-lead', briefingContext, briefingSeverity),
    briefingSeverity,
    true,
    'briefing-products',
  )

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <div className={typography.pageHeader}>
          <div className={typography.pageHeaderAccent} />
          <h1 className={typography.h1}>Products</h1>
          <Badge variant="brand" size="sm" className="ml-1 uppercase tracking-wide">
            Beta
          </Badge>
        </div>
        <p className={typography.pageSubtitle}>
          Where your designs, market research, and unit economics come together.
        </p>
      </div>

      {/* Priya briefing */}
      <SpecialistBriefingHero
        specialistId="product-lead"
        specialistName="Priya"
        specialistTitle="Product Development"
        narrative={briefing.narrative}
        fallbackMessage="I'm Priya. Each product on this page moves through five steps: concept, validate, build, launch, grow. Market assessment and competitor tracking run alongside, so the story stays honest at every stage. Start with a name and the problem you want to solve — that's enough for me to take it from there."
        isLoading={briefing.isLoading}
        loadingMessage="Reviewing your product portfolio..."
        severity={briefing.severity}
        context={{ type: 'general', title: 'Products', description: briefingContext }}
      />

      {/* Empty state or product grid */}
      {products.length === 0 ? (
        <EmptyProductState
          onMarketIdea={() => setMarketDialogOpen(true)}
          onForgePromote={() => setForgePickerOpen(true)}
          onPlanUpload={() => setShowPlanUpload(true)}
          showPlanUpload={showPlanUpload}
          router={router}
        />
      ) : (
        <div className="space-y-4">
          {/* Creation actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={() => setMarketDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              New Product
            </Button>
            <Button variant="outline" onClick={() => setForgePickerOpen(true)}>
              <Hammer className="h-4 w-4 mr-1.5" />
              Promote from Forge
            </Button>
            <Button variant="outline" onClick={() => setShowPlanUpload(!showPlanUpload)}>
              <FileText className="h-4 w-4 mr-1.5" />
              Extract from Plan
            </Button>
          </div>

          {/* Inline plan upload (toggled) */}
          {showPlanUpload && (
            <InlinePlanUpload router={router} />
          )}

          {/* Product grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      )}

      {/* Market Idea Dialog */}
      <MarketIdeaDialog
        open={marketDialogOpen}
        onOpenChange={setMarketDialogOpen}
        router={router}
      />

      {/* Forge Picker Dialog */}
      <ForgePickerDialog
        open={forgePickerOpen}
        onOpenChange={setForgePickerOpen}
        existingProjectIds={products.map((p) => p.cad_lab_project_id).filter(Boolean) as string[]}
        router={router}
      />
    </div>
  )
}

// ─── Empty State ─────────────────────────────────────────────────────

function EmptyProductState({
  onMarketIdea,
  onForgePromote,
  onPlanUpload,
  showPlanUpload,
  router,
}: {
  onMarketIdea: () => void
  onForgePromote: () => void
  onPlanUpload: () => void
  showPlanUpload: boolean
  router: ReturnType<typeof useRouter>
}) {
  return (
    <div className="space-y-6">
      {/* Explainer */}
      <div className="text-center py-6">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-international-orange/10 mb-4">
          <Package className="h-6 w-6 text-international-orange" />
        </div>
        <h3 className="text-lg font-display font-medium text-foreground mb-2">
          Add your first product
        </h3>
        <p className="text-sm text-muted-foreground max-w-lg mx-auto">
          A product brings together a Forge design, market research, unit economics, and the fundraising story. Completed Forge designs land here automatically. Or start from a market idea, a business plan, or an existing design below.
        </p>
      </div>

      {/* Journey ribbon — shows WHERE this page takes them */}
      <div className="flex items-center justify-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground max-w-2xl mx-auto">
        <span className="flex items-center gap-1"><Package className="h-3 w-3" /> Created</span>
        <span aria-hidden="true">→</span>
        <span className="flex items-center gap-1"><Search className="h-3 w-3" /> Market Research</span>
        <span aria-hidden="true">→</span>
        <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Unit Economics</span>
        <span aria-hidden="true">→</span>
        <span className="flex items-center gap-1"><Star className="h-3 w-3" /> Investor Ready</span>
      </div>

      {/* Three creation paths */}
      <div className="space-y-4 max-w-3xl mx-auto">
        {/* Primary: Market Idea (full width) */}
        <Card
          className="hover:-translate-y-0.5 active:scale-[0.99] duration-200 cursor-pointer border-international-orange/30"
          onClick={onMarketIdea}
          role="button"
          tabIndex={0}
          aria-label="Start with a market idea"
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onMarketIdea() } }}
        >
          <CardContent className="py-5">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-international-orange/10 flex-shrink-0">
                <Lightbulb className="h-5 w-5 text-international-orange" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">Start with an idea</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Describe your market and problem. We will create the product, run market assessment, and model economics.
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-international-orange flex-shrink-0" />
            </div>
          </CardContent>
        </Card>

        {/* Secondary: two side-by-side */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Card
            className="hover:-translate-y-0.5 active:scale-[0.99] duration-200 cursor-pointer"
            onClick={onForgePromote}
            role="button"
            tabIndex={0}
            aria-label="Promote a design from The Forge into a product"
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onForgePromote() } }}
          >
            <CardContent className="py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-international-orange/10 flex-shrink-0">
                  <Hammer className="h-4 w-4 text-international-orange" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Promote from The Forge</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Any design can become a product. Completed designs also carry across COGS and drawings.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card
            className="hover:-translate-y-0.5 active:scale-[0.99] duration-200 cursor-pointer"
            onClick={onPlanUpload}
            role="button"
            tabIndex={0}
            aria-label="Extract products from a business plan"
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPlanUpload() } }}
          >
            <CardContent className="py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-international-orange/10 flex-shrink-0">
                  <FileText className="h-4 w-4 text-international-orange" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Extract from a business plan</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Upload a PDF or DOCX. Products are extracted and created automatically.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Inline plan upload (expanded) */}
        {showPlanUpload && (
          <InlinePlanUpload router={router} />
        )}
      </div>
    </div>
  )
}

// ─── Inline Business Plan Upload ─────────────────────────────────────

function InlinePlanUpload({ router }: { router: ReturnType<typeof useRouter> }) {
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [isAnalyzing, setIsAnalyzing] = React.useState(false)
  const [extractedProducts, setExtractedProducts] = React.useState<Array<{
    name: string
    description: string
    targetMarket?: string
    revenueModel?: string
    suggestedPrice?: number
    selected: boolean
  }>>([])
  const [showReview, setShowReview] = React.useState(false)
  const [isCreating, setIsCreating] = React.useState(false)

  const handleFile = React.useCallback(async (file: File) => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext as typeof ALLOWED_EXTENSIONS[number])) {
      toast.error(`Unsupported file type "${ext}". Use PDF, DOCX, or TXT.`)
      return
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error(`File too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Max 20 MB.`)
      return
    }

    setIsAnalyzing(true)
    toast.info('Analyzing your business plan...')

    const formData = new FormData()
    formData.append('file', file)

    const result = await analyzeBusinessPlan(formData)
    if (result.error || !result.analysis) {
      setIsAnalyzing(false)
      toast.error(result.error ?? 'Analysis failed')
      return
    }

    const { analysisId, error: saveError } = await saveBusinessPlanAnalysis(result.analysis, file.name)
    if (saveError || !analysisId) {
      setIsAnalyzing(false)
      toast.error(saveError ?? 'Failed to save analysis')
      return
    }

    const { mergeState, error: mergeError } = await buildSmartMerge(result.analysis, analysisId)
    setIsAnalyzing(false)

    if (mergeError || !mergeState) {
      toast.error(mergeError ?? 'Failed to extract products')
      return
    }

    // FLOW: Fire-and-forget knowledge extraction — same pattern as Strategy page.
    // Extracted notes appear in the Knowledge Vault for all specialists.
    const extractionForm = new FormData()
    extractionForm.append('file', file)
    extractKnowledgeFromUpload(extractionForm)
      .then(({ data }) => {
        if (data && data.saved > 0) {
          toast.success(`${data.saved} knowledge note${data.saved === 1 ? '' : 's'} extracted`)
        }
      })
      .catch(() => { /* best-effort */ })

    // INTENT: Only show extracted products (not objectives/hiring/etc.)
    const products = (mergeState.extractedProducts ?? []).map((p) => ({
      ...p,
      selected: true,
    }))

    if (products.length === 0) {
      toast.info('No products found in the business plan.')
      return
    }

    setExtractedProducts(products)
    setShowReview(true)
  }, [])

  const handleCreate = React.useCallback(async () => {
    const selected = extractedProducts.filter((p) => p.selected)
    if (selected.length === 0) {
      toast.error('Select at least one product to create')
      return
    }

    setIsCreating(true)
    let created = 0
    for (const p of selected) {
      const result = await createProduct({
        name: p.name,
        description: p.description,
      })
      if (result.data) {
        created++
        // Fire-and-forget market assessment
        generateMarketAssessment(result.data.id).catch(() => {})
      }
    }

    setIsCreating(false)
    setShowReview(false)
    setExtractedProducts([])
    toast.success(`Created ${created} product${created !== 1 ? 's' : ''}`)
    router.refresh()
  }, [extractedProducts, router])

  return (
    <Card>
      <CardContent className="py-4">
        {!showReview ? (
          <div className="space-y-3">
            <div
              className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-6 px-4 cursor-pointer hover:border-international-orange/40 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const file = e.dataTransfer.files[0]
                if (file) handleFile(file)
              }}
              role="button"
              tabIndex={0}
              aria-label="Upload a business plan — PDF, DOCX, or TXT up to 20 MB"
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click() } }}
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-6 w-6 text-international-orange animate-spin" />
                  <p className="text-sm text-muted-foreground">Analyzing your business plan...</p>
                </>
              ) : (
                <>
                  <Upload className="h-6 w-6 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Drop a business plan here, or <span className="text-international-orange font-medium">browse</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground">PDF, DOCX, or TXT — max 20 MB</p>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) { handleFile(file); e.target.value = '' }
              }}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">
              Found {extractedProducts.length} product{extractedProducts.length !== 1 ? 's' : ''} in your business plan
            </p>
            {extractedProducts.map((p, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-lg border border-border p-3"
              >
                <input
                  id={`extracted-product-${i}`}
                  type="checkbox"
                  checked={p.selected}
                  aria-label={`Include "${p.name}" when creating products`}
                  onChange={() => {
                    setExtractedProducts((prev) =>
                      prev.map((item, j) =>
                        j === i ? { ...item, selected: !item.selected } : item,
                      ),
                    )
                  }}
                  className="mt-0.5 h-4 w-4 accent-international-orange"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{p.name}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{p.description}</p>
                  <div className="flex gap-2 mt-1">
                    {p.targetMarket && (
                      <Badge variant="secondary" size="sm">{p.targetMarket}</Badge>
                    )}
                    {p.suggestedPrice != null && (
                      <Badge variant="outline" size="sm">~£{p.suggestedPrice}</Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setShowReview(false); setExtractedProducts([]) }}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={isCreating || !extractedProducts.some((p) => p.selected)}
              >
                {isCreating ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Creating...</>
                ) : (
                  `Create ${extractedProducts.filter((p) => p.selected).length} Product${extractedProducts.filter((p) => p.selected).length !== 1 ? 's' : ''}`
                )}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Forge Picker Dialog ─────────────────────────────────────────────

function ForgePickerDialog({
  open,
  onOpenChange,
  existingProjectIds,
  router,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingProjectIds: string[]
  router: ReturnType<typeof useRouter>
}) {
  const [projects, setProjects] = React.useState<CadLabProjectSummary[]>([])
  const [isLoading, setIsLoading] = React.useState(false)
  const [promoting, setPromoting] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setIsLoading(true)
    listCadLabProjects().then((result) => {
      setIsLoading(false)
      if ('projects' in result) {
        // INTENT: Show ALL Forge designs (not just completed ones) — a design
        // at any stage can become a product concept. Exclude only those already
        // linked to a product. Sort: completed designs first, then by updated_at.
        const eligible = result.projects.filter(
          (p) => !existingProjectIds.includes(p.id),
        )
        // GOTCHA: project.status is the top-level column enum: draft | researched |
        // interface_ready | generated | complete. The 'rfq_created' label lives in
        // result.procurement.stage (JSONB), not status — we surface it via the
        // separate `stage` column below.
        const STAGE_ORDER: Record<string, number> = {
          generated: 0, complete: 0,
          interface_ready: 1, researched: 2, draft: 3,
        }
        eligible.sort((a, b) =>
          (STAGE_ORDER[a.status] ?? 4) - (STAGE_ORDER[b.status] ?? 4),
        )
        setProjects(eligible)
      }
    })
  }, [open, existingProjectIds])

  const handlePromote = React.useCallback(async (projectId: string) => {
    setPromoting(projectId)
    const result = await promoteFromCadLab(projectId)
    setPromoting(null)
    if ('error' in result) {
      toast.error(result.error ?? 'Failed to promote')
      return
    }
    toast.success('Design promoted to product')
    onOpenChange(false)
    if (result.data) router.push(`/products/${result.data.id}`)
  }, [onOpenChange, router])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Promote from The Forge</DialogTitle>
          <DialogDescription>
            Pick any design to turn into a product. Completed designs carry over COGS and images; earlier designs start as product concepts.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-80 overflow-y-auto py-2">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!isLoading && projects.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No designs found in The Forge. Create a design first, then come back here to promote it.
            </p>
          )}
          {projects.map((project) => {
            const isComplete = project.status === 'generated' || project.status === 'complete'
            const rfqSent = project.stage === 'rfq_created'
            const STAGE_BADGE: Record<string, { label: string; variant: 'success' | 'info' | 'warning' | 'secondary' }> = {
              draft: { label: 'Draft', variant: 'secondary' },
              researched: { label: 'Researched', variant: 'info' },
              interface_ready: { label: 'Build Ready', variant: 'info' },
              generated: { label: 'Complete', variant: 'success' },
              complete: { label: 'Complete', variant: 'success' },
            }
            // An RFQ-sent project overrides any status badge — it's the most specific signal.
            const badge = rfqSent
              ? { label: 'RFQ Sent', variant: 'success' as const }
              : (STAGE_BADGE[project.status] ?? { label: project.status, variant: 'secondary' as const })

            return (
              <div
                key={project.id}
                className="flex items-center justify-between rounded-lg border border-border p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground truncate">{project.name}</p>
                    <Badge variant={badge.variant} size="sm">{badge.label}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {project.subject || 'No description'}
                    {!isComplete && ' — will start as concept product'}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={promoting === project.id}
                  onClick={() => handlePromote(project.id)}
                >
                  {promoting === project.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Promote'
                  )}
                </Button>
              </div>
            )
          })}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Market Idea Dialog ──────────────────────────────────────────────

function MarketIdeaDialog({
  open,
  onOpenChange,
  router,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  router: ReturnType<typeof useRouter>
}) {
  const [marketDescription, setMarketDescription] = React.useState('')
  const [problem, setProblem] = React.useState('')
  const [industry, setIndustry] = React.useState('')
  const [isCreating, setIsCreating] = React.useState(false)

  const handleSubmit = React.useCallback(async () => {
    if (!marketDescription.trim() || !problem.trim()) {
      toast.error('Please fill in target market and problem')
      return
    }
    setIsCreating(true)
    try {
      const productName = industry.trim()
        ? `${industry.trim()} Product`
        : 'Market Opportunity Product'
      const description = `${marketDescription.trim()}\n\nProblem: ${problem.trim()}`

      const result = await createProduct({ name: productName, description })
      if (result.error) { toast.error(result.error); return }
      if (!result.data) { toast.error('Failed to create product'); return }

      await createIteration(
        result.data.id,
        { market: 0, financial: 0, fundability: 0, manufacturing: 0 },
        [],
        'Initial product from market opportunity',
      )

      toast.success('Product created — running market assessment...')
      onOpenChange(false)
      generateMarketAssessment(result.data.id).catch(() => {})
      router.push(`/products/${result.data.id}`)
    } catch {
      toast.error('Failed to create product')
    } finally {
      setIsCreating(false)
    }
  }, [marketDescription, problem, industry, router, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start with a Market Idea</DialogTitle>
          <DialogDescription>
            Describe your market opportunity. We will create the product, research the market, and start modelling economics.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="market-description">
              Describe your target market <span className="text-destructive">*</span>
            </Label>
            <textarea
              id="market-description"
              value={marketDescription}
              onChange={(e) => setMarketDescription(e.target.value)}
              className="w-full min-h-[80px] p-3 text-sm rounded-md border border-input bg-background text-foreground resize-y"
              placeholder="e.g. Small UK manufacturers who need affordable quality inspection tools..."
              aria-required="true"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="market-problem">
              What problem does your product solve? <span className="text-destructive">*</span>
            </Label>
            <textarea
              id="market-problem"
              value={problem}
              onChange={(e) => setProblem(e.target.value)}
              className="w-full min-h-[80px] p-3 text-sm rounded-md border border-input bg-background text-foreground resize-y"
              placeholder="e.g. Current solutions cost 10x more and require specialist training..."
              aria-required="true"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="market-industry">What industry?</Label>
            <Input
              id="market-industry"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="e.g. Manufacturing, Healthcare, Agriculture..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isCreating}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isCreating || !marketDescription.trim() || !problem.trim()}>
            {isCreating ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Creating...</>
            ) : (
              'Create Product'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Product Card ────────────────────────────────────────────────────

function ProductCard({ product }: { product: ProductSummary }) {
  const monthlyRevenue =
    product.unit_price_pence != null && product.target_monthly_units != null
      ? product.unit_price_pence * product.target_monthly_units
      : null

  const lifecycleProgress = LIFECYCLE_ORDER.indexOf(product.lifecycle)
  const lifecycleMax = LIFECYCLE_ORDER.length - 1

  return (
    <Link href={`/products/${product.id}`}>
      <Card className="hover:-translate-y-0.5 active:scale-[0.99] duration-200 cursor-pointer h-full">
        {/* Hero image */}
        {product.hero_image_url ? (
          <div className="relative h-36 w-full overflow-hidden rounded-t-lg bg-muted">
            <Image
              src={product.hero_image_url}
              alt={product.name}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
          </div>
        ) : (
          <div className="h-20 w-full rounded-t-lg bg-muted flex items-center justify-center">
            <Package className="h-8 w-8 text-muted-foreground/30" />
          </div>
        )}

        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-medium text-foreground line-clamp-1">
              {product.name}
            </h3>
            <Badge variant={LIFECYCLE_VARIANT[product.lifecycle]} size="sm">
              {LIFECYCLE_LABELS[product.lifecycle]}
            </Badge>
          </div>

          {/* Lifecycle progress bar */}
          {product.lifecycle !== 'deprecated' && lifecycleProgress >= 0 && (
            <div className="flex gap-0.5 mt-1.5">
              {LIFECYCLE_ORDER.map((stage, i) => (
                <div
                  key={stage}
                  className={`h-1 flex-1 rounded-full ${
                    i <= lifecycleProgress
                      ? 'bg-international-orange'
                      : 'bg-muted'
                  }`}
                />
              ))}
            </div>
          )}
        </CardHeader>

        <CardContent className="pt-0 space-y-2">
          {product.description && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {product.description}
            </p>
          )}

          {/* Economics row */}
          <div className="flex items-center gap-3 text-xs flex-wrap">
            {product.cogs_per_unit != null && (
              <span className="text-muted-foreground">
                {/* GOTCHA: ProductSummary.cogs_per_unit is pounds (see products.ts mapper L128); formatPence takes pence, so * 100. */}
                COGS <span className="text-foreground font-medium">{formatPence(product.cogs_per_unit * 100)}</span>
              </span>
            )}
            {product.gross_margin_pct != null && (
              <span className="text-muted-foreground">
                Margin <span className={`font-medium ${marginColor(product.gross_margin_pct)}`}>{formatMargin(product.gross_margin_pct)}</span>
              </span>
            )}
            {monthlyRevenue != null && monthlyRevenue > 0 && (
              <span className="text-muted-foreground">
                Rev <span className="text-foreground font-medium">{formatCurrency(monthlyRevenue)}/mo</span>
              </span>
            )}
          </div>

          {/* Status indicators + convergence */}
          <div className="flex items-center gap-2">
            {/* Status dots */}
            <div className="flex items-center gap-1.5" title="Design linked / Market data / Fundability scored">
              <Hammer className={`h-3 w-3 ${product.cad_lab_project_id ? 'text-international-orange' : 'text-muted-foreground/30'}`} />
              <Search className={`h-3 w-3 ${product.has_market_assessment ? 'text-international-orange' : 'text-muted-foreground/30'}`} />
              <Star className={`h-3 w-3 ${product.has_fundability_score ? 'text-international-orange' : 'text-muted-foreground/30'}`} />
            </div>

            {/* Convergence badge */}
            {product.latest_convergence_status && CONVERGENCE_BADGE[product.latest_convergence_status] && (
              <Badge variant={CONVERGENCE_BADGE[product.latest_convergence_status].variant} size="sm" className="ml-auto">
                {CONVERGENCE_BADGE[product.latest_convergence_status].label}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
