'use client'

/**
 * MoneyMapSetupWizard — Multi-step wizard for first-time Money Map configuration.
 *
 * @description Guides users through 5 steps:
 * 1. Revenue streams — "How does your company make money?"
 * 2. Direct costs — "What does it cost to deliver?"
 * 3. Shared costs — "What costs are shared across streams?"
 * 4. Overhead — "What does your organisation cost to run?"
 * 5. Review — See the Money Map for the first time
 *
 * @component
 * @example
 * <MoneyMapSetupWizard open={isOpen} onOpenChange={setOpen} onComplete={handleComplete} />
 */

import { useState, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  PoundSterling,
  Receipt,
  Share2,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { typography } from '@/lib/design-system'

import type {
  RevenueStreamInput,
  CostItemInput,
  RevenueCategory,
  CostCategory,
  Period,
} from '@/types/money-map'
import { REVENUE_CATEGORY_LABELS, COST_CATEGORY_LABELS, PERIOD_LABELS } from '@/types/money-map'

// ============================================================
// Step definitions
// ============================================================

type StepId = 'revenue' | 'direct' | 'shared' | 'overhead' | 'review'

const STEPS: { id: StepId; title: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'revenue', title: 'Revenue', icon: PoundSterling },
  { id: 'direct', title: 'Direct Costs', icon: Receipt },
  { id: 'shared', title: 'Shared Costs', icon: Share2 },
  { id: 'overhead', title: 'Overhead', icon: Building2 },
  { id: 'review', title: 'Review', icon: CheckCircle2 },
]

// ============================================================
// Types
// ============================================================

interface WizardRevenueItem extends RevenueStreamInput {
  _key: string
}

interface WizardCostItem extends CostItemInput {
  _key: string
}

interface MoneyMapSetupWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete: (data: {
    revenueStreams: RevenueStreamInput[]
    costItems: CostItemInput[]
  }) => Promise<void>
}

// ============================================================
// Helpers
// ============================================================

let keyCounter = 0
function nextKey(): string {
  return `wizard-item-${++keyCounter}`
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(value)
}

// ============================================================
// Step Components
// ============================================================

interface StepRevenueProps {
  items: WizardRevenueItem[]
  onAdd: () => void
  onRemove: (key: string) => void
  onUpdate: (key: string, field: string, value: string | number) => void
}

function StepRevenue({ items, onAdd, onRemove, onUpdate }: StepRevenueProps): React.ReactElement {
  return (
    <div className="space-y-4">
      <div>
        <h3 className={typography.wizardStepTitle}>How does your company make money?</h3>
        <p className={typography.wizardStepDescription}>
          List your revenue streams — products, services, subscriptions, marketplace fees.
          Don't worry about being exact, you can adjust later.
        </p>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <div key={item._key} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="col-span-3 sm:col-span-1">
                <Input
                  value={item.name}
                  onChange={(e) => onUpdate(item._key, 'name', e.target.value)}
                  placeholder="Stream name"
                  className="text-sm"
                />
              </div>
              <div>
                <Select
                  value={item.category}
                  onValueChange={(v) => onUpdate(item._key, 'category', v)}
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(REVENUE_CATEGORY_LABELS) as [RevenueCategory, string][]).map(([val, label]) => (
                      <SelectItem key={val} value={val}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">£</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.amount || ''}
                  onChange={(e) => onUpdate(item._key, 'amount', parseFloat(e.target.value) || 0)}
                  placeholder="0"
                  className="text-sm"
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap">/mo</span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() => onRemove(item._key)}
              aria-label="Remove"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <Button variant="secondary" size="sm" onClick={onAdd}>
        <Plus className="h-3.5 w-3.5 mr-1.5" />
        Add Revenue Stream
      </Button>
    </div>
  )
}

interface StepCostsProps {
  title: string
  description: string
  items: WizardCostItem[]
  onAdd: () => void
  onRemove: (key: string) => void
  onUpdate: (key: string, field: string, value: string | number) => void
}

function StepCosts({ title, description, items, onAdd, onRemove, onUpdate }: StepCostsProps): React.ReactElement {
  return (
    <div className="space-y-4">
      <div>
        <h3 className={typography.wizardStepTitle}>{title}</h3>
        <p className={typography.wizardStepDescription}>{description}</p>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <div key={item._key} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="col-span-3 sm:col-span-1">
                <Input
                  value={item.name}
                  onChange={(e) => onUpdate(item._key, 'name', e.target.value)}
                  placeholder="Cost name"
                  className="text-sm"
                />
              </div>
              <div>
                <Select
                  value={item.category}
                  onValueChange={(v) => onUpdate(item._key, 'category', v)}
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(COST_CATEGORY_LABELS) as [CostCategory, string][]).map(([val, label]) => (
                      <SelectItem key={val} value={val}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">£</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.amount || ''}
                  onChange={(e) => onUpdate(item._key, 'amount', parseFloat(e.target.value) || 0)}
                  placeholder="0"
                  className="text-sm"
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap">/mo</span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() => onRemove(item._key)}
              aria-label="Remove"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <Button variant="secondary" size="sm" onClick={onAdd}>
        <Plus className="h-3.5 w-3.5 mr-1.5" />
        Add Cost
      </Button>
    </div>
  )
}

interface StepReviewProps {
  revenueStreams: WizardRevenueItem[]
  directCosts: WizardCostItem[]
  sharedCosts: WizardCostItem[]
  overheadCosts: WizardCostItem[]
}

function StepReview({ revenueStreams, directCosts, sharedCosts, overheadCosts }: StepReviewProps): React.ReactElement {
  const totalRevenue = revenueStreams.reduce((sum, r) => sum + (r.amount || 0), 0)
  const totalDirect = directCosts.reduce((sum, c) => sum + (c.amount || 0), 0)
  const totalShared = sharedCosts.reduce((sum, c) => sum + (c.amount || 0), 0)
  const totalOverhead = overheadCosts.reduce((sum, c) => sum + (c.amount || 0), 0)
  const totalCosts = totalDirect + totalShared + totalOverhead
  const netMargin = totalRevenue - totalCosts
  const marginPct = totalRevenue > 0 ? (netMargin / totalRevenue) * 100 : 0

  return (
    <div className="space-y-6">
      <div>
        <h3 className={typography.wizardStepTitle}>Review your Money Map</h3>
        <p className={typography.wizardStepDescription}>
          Here's a summary of what you've entered. You can always edit these later.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-4 rounded-lg bg-muted/30 border">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Revenue</p>
          <p className="text-xl font-semibold text-foreground mt-1">{formatCurrency(totalRevenue)}</p>
          <p className="text-xs text-muted-foreground">{revenueStreams.filter(r => r.name).length} streams</p>
        </div>
        <div className="p-4 rounded-lg bg-muted/30 border">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Total Costs</p>
          <p className="text-xl font-semibold text-foreground mt-1">{formatCurrency(totalCosts)}</p>
          <p className="text-xs text-muted-foreground">{[...directCosts, ...sharedCosts, ...overheadCosts].filter(c => c.name).length} items</p>
        </div>
        <div className="p-4 rounded-lg bg-muted/30 border">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Net Margin</p>
          <p className={cn(
            'text-xl font-semibold mt-1',
            netMargin >= 0 ? 'text-status-success' : 'text-destructive'
          )}>
            {formatCurrency(netMargin)}
          </p>
        </div>
        <div className="p-4 rounded-lg bg-muted/30 border">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Margin %</p>
          <p className={cn(
            'text-xl font-semibold mt-1',
            marginPct >= 0 ? 'text-status-success' : 'text-destructive'
          )}>
            {marginPct.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Breakdown */}
      <div className="space-y-3 text-sm">
        {totalDirect > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Direct Costs ({directCosts.filter(c => c.name).length})</span>
            <span className="font-medium text-foreground">{formatCurrency(totalDirect)}/mo</span>
          </div>
        )}
        {totalShared > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Shared Costs ({sharedCosts.filter(c => c.name).length})</span>
            <span className="font-medium text-foreground">{formatCurrency(totalShared)}/mo</span>
          </div>
        )}
        {totalOverhead > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Overhead ({overheadCosts.filter(c => c.name).length})</span>
            <span className="font-medium text-foreground">{formatCurrency(totalOverhead)}/mo</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// Main Wizard
// ============================================================

export function MoneyMapSetupWizard({
  open,
  onOpenChange,
  onComplete,
}: MoneyMapSetupWizardProps): React.ReactElement {
  const [currentStep, setCurrentStep] = useState<StepId>('revenue')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Revenue streams
  const [revenueItems, setRevenueItems] = useState<WizardRevenueItem[]>([
    { _key: nextKey(), name: '', category: 'other', amount: 0 },
  ])

  // Cost items by type
  const [directCosts, setDirectCosts] = useState<WizardCostItem[]>([])
  const [sharedCosts, setSharedCosts] = useState<WizardCostItem[]>([])
  const [overheadCosts, setOverheadCosts] = useState<WizardCostItem[]>([])

  const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep)
  const isFirstStep = currentStepIndex === 0
  const isLastStep = currentStepIndex === STEPS.length - 1

  // -------------------------------------------------------
  // List management helpers
  // -------------------------------------------------------
  const addRevenueItem = useCallback((): void => {
    setRevenueItems((prev) => [...prev, { _key: nextKey(), name: '', category: 'other' as RevenueCategory, amount: 0 }])
  }, [])

  const removeRevenueItem = useCallback((key: string): void => {
    setRevenueItems((prev) => prev.filter((i) => i._key !== key))
  }, [])

  const updateRevenueItem = useCallback((key: string, field: string, value: string | number): void => {
    setRevenueItems((prev) =>
      prev.map((i) => (i._key === key ? { ...i, [field]: value } : i))
    )
  }, [])

  const makeCostHandlers = (
    setter: React.Dispatch<React.SetStateAction<WizardCostItem[]>>,
    costType: 'direct' | 'indirect' | 'overhead'
  ) => ({
    add: () => setter((prev) => [...prev, { _key: nextKey(), name: '', category: 'other' as CostCategory, amount: 0, cost_type: costType }]),
    remove: (key: string) => setter((prev) => prev.filter((i) => i._key !== key)),
    update: (key: string, field: string, value: string | number) =>
      setter((prev) => prev.map((i) => (i._key === key ? { ...i, [field]: value } : i))),
  })

  const directHandlers = makeCostHandlers(setDirectCosts, 'direct')
  const sharedHandlers = makeCostHandlers(setSharedCosts, 'indirect')
  const overheadHandlers = makeCostHandlers(setOverheadCosts, 'overhead')

  // -------------------------------------------------------
  // Navigation
  // -------------------------------------------------------
  const validateStep = (): boolean => {
    setError(null)

    if (currentStep === 'revenue') {
      const validItems = revenueItems.filter((i) => i.name.trim())
      if (validItems.length === 0) {
        setError('Add at least one revenue stream')
        return false
      }
    }

    return true
  }

  const goNext = (): void => {
    if (!validateStep()) return
    if (!isLastStep) {
      setCurrentStep(STEPS[currentStepIndex + 1].id)
    }
  }

  const goBack = (): void => {
    if (!isFirstStep) {
      setError(null)
      setCurrentStep(STEPS[currentStepIndex - 1].id)
    }
  }

  const handleComplete = async (): Promise<void> => {
    if (!validateStep()) return

    setIsSaving(true)
    setError(null)

    try {
      const revenueStreams: RevenueStreamInput[] = revenueItems
        .filter((i) => i.name.trim())
        .map(({ _key, ...rest }) => rest)

      const costItems: CostItemInput[] = [
        ...directCosts.filter((c) => c.name.trim()).map(({ _key, ...rest }) => rest),
        ...sharedCosts.filter((c) => c.name.trim()).map(({ _key, ...rest }) => rest),
        ...overheadCosts.filter((c) => c.name.trim()).map(({ _key, ...rest }) => rest),
      ]

      await onComplete({ revenueStreams, costItems })
      onOpenChange(false)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to save'
      setError(message)
    } finally {
      setIsSaving(false)
    }
  }

  // -------------------------------------------------------
  // Render
  // -------------------------------------------------------
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Set Up Your Money Map</DialogTitle>
        </DialogHeader>

        {/* Visual Progress Stepper */}
        <div className="flex items-center gap-2 mb-2">
          {STEPS.map((step, index) => {
            const Icon = step.icon
            const isActive = step.id === currentStep
            const isCompleted = index < currentStepIndex

            return (
              <div key={step.id} className={cn('flex items-center gap-2 flex-1', index > 0 && 'pl-2')}>
                {index > 0 && (
                  <div
                    className={cn(
                      'h-0.5 flex-1 rounded-full transition-colors',
                      isCompleted ? 'bg-international-orange' : 'bg-muted'
                    )}
                  />
                )}
                <div
                  className={cn(
                    'flex items-center justify-center rounded-full h-8 w-8 transition-colors shrink-0',
                    isActive && 'bg-international-orange text-background',
                    isCompleted && !isActive && 'bg-orange-100 text-international-orange',
                    !isActive && !isCompleted && 'bg-muted text-muted-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
              </div>
            )
          })}
        </div>

        {/* Step labels */}
        <div className="flex items-center justify-between mb-4 px-1">
          {STEPS.map((step) => (
            <span
              key={step.id}
              className={cn(
                'text-[10px] font-medium text-center flex-1',
                step.id === currentStep ? 'text-international-orange' : 'text-muted-foreground'
              )}
            >
              {step.title}
            </span>
          ))}
        </div>

        {/* Step Content */}
        <ScrollArea className="max-h-[50vh] pr-2">
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {currentStep === 'revenue' && (
            <StepRevenue
              items={revenueItems}
              onAdd={addRevenueItem}
              onRemove={removeRevenueItem}
              onUpdate={updateRevenueItem}
            />
          )}
          {currentStep === 'direct' && (
            <StepCosts
              title="What does it cost to deliver?"
              description="Direct costs are tied to specific revenue streams — COGS, contractor pay, materials, delivery costs."
              items={directCosts}
              onAdd={directHandlers.add}
              onRemove={directHandlers.remove}
              onUpdate={directHandlers.update}
            />
          )}
          {currentStep === 'shared' && (
            <StepCosts
              title="What costs are shared across streams?"
              description="Shared costs support multiple revenue streams — marketing, sales team, technology infrastructure, AI tools."
              items={sharedCosts}
              onAdd={sharedHandlers.add}
              onRemove={sharedHandlers.remove}
              onUpdate={sharedHandlers.update}
            />
          )}
          {currentStep === 'overhead' && (
            <StepCosts
              title="What does your organisation cost to run?"
              description="Overhead that exists regardless of revenue — office rent, admin staff, accounting, insurance, software subscriptions."
              items={overheadCosts}
              onAdd={overheadHandlers.add}
              onRemove={overheadHandlers.remove}
              onUpdate={overheadHandlers.update}
            />
          )}
          {currentStep === 'review' && (
            <StepReview
              revenueStreams={revenueItems}
              directCosts={directCosts}
              sharedCosts={sharedCosts}
              overheadCosts={overheadCosts}
            />
          )}
        </ScrollArea>

        {/* Navigation Footer */}
        <DialogFooter>
          <div className="flex w-full items-center justify-between">
            <Button
              variant="secondary"
              onClick={isFirstStep ? () => onOpenChange(false) : goBack}
            >
              {isFirstStep ? 'Cancel' : (
                <>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </>
              )}
            </Button>

            {isLastStep ? (
              <Button onClick={handleComplete} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="animate-spin h-4 w-4 mr-2" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Create Money Map
                  </>
                )}
              </Button>
            ) : (
              <Button onClick={goNext}>
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
