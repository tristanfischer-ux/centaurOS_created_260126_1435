'use client'

/**
 * CashInSetupWizard — Quick setup wizard for bulk-adding income items.
 *
 * @description 3-step wizard:
 * 1. Revenue Streams — dynamic rows (revenue is company-specific)
 * 2. Other Funding — toggleable categories (loan, equity, grant, other)
 * 3. Review — summary with weighted totals, submit
 *
 * Amounts entered in pounds, converted to pence for the server action.
 */

import { useState, useCallback, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  PoundSterling,
  Landmark,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { typography } from '@/lib/design-system'
import { WizardStepper, useWizardSteps } from '@/components/ui/wizard-stepper'
import type { WizardStep } from '@/components/ui/wizard-stepper'
import { formatCurrency } from '@/types/payments'
import type { CashInItem, CreateCashInInput, Frequency, CashInSourceType } from '@/types/cash-burn'

// ============================================================
// Step definitions
// ============================================================

const STEPS: WizardStep[] = [
  { id: 'revenue', title: 'Revenue Streams', icon: PoundSterling },
  { id: 'funding', title: 'Other Funding', icon: Landmark },
  { id: 'review', title: 'Review', icon: CheckCircle2 },
]

// ============================================================
// Constants
// ============================================================

const FREQUENCY_OPTIONS: { value: Frequency; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'annual', label: 'Annual' },
  { value: 'one_time', label: 'One-time' },
]

interface FundingPreset {
  key: string
  sourceType: CashInSourceType
  defaultName: string
  defaultFrequency: Frequency
  defaultProbability: number
}

const FUNDING_PRESETS: FundingPreset[] = [
  { key: 'loan', sourceType: 'loan', defaultName: 'Loan', defaultFrequency: 'one_time', defaultProbability: 100 },
  { key: 'equity', sourceType: 'equity', defaultName: 'Equity Investment', defaultFrequency: 'one_time', defaultProbability: 100 },
  { key: 'grant', sourceType: 'government_grant', defaultName: 'Government Grant', defaultFrequency: 'one_time', defaultProbability: 80 },
  { key: 'other', sourceType: 'other', defaultName: 'Other', defaultFrequency: 'one_time', defaultProbability: 100 },
]

// ============================================================
// Row types
// ============================================================

interface RevenueRow {
  _key: string
  name: string
  amountPounds: string
  frequency: Frequency
  probabilityPct: number
}

interface FundingRow {
  key: string
  enabled: boolean
  name: string
  sourceType: CashInSourceType
  amountPounds: string
  frequency: Frequency
  probabilityPct: number
}

// ============================================================
// Helpers
// ============================================================

let revenueKeyCounter = 0
function nextRevenueKey(): string {
  return `rev-${++revenueKeyCounter}`
}

function getAmountPence(amountPounds: string): number {
  const parsed = parseFloat(amountPounds)
  if (isNaN(parsed) || parsed < 0) return 0
  return Math.round(parsed * 100)
}

function weeklyPence(amountPounds: string, frequency: Frequency): number {
  const pence = getAmountPence(amountPounds)
  if (pence === 0) return 0
  switch (frequency) {
    case 'weekly': return pence
    case 'monthly': return Math.round(pence * 12 / 52)
    case 'annual': return Math.round(pence / 52)
    case 'one_time': return pence
  }
}

function weightedWeekly(amountPounds: string, frequency: Frequency, probabilityPct: number): number {
  return Math.round(weeklyPence(amountPounds, frequency) * probabilityPct / 100)
}

function freqLabel(f: Frequency): string {
  switch (f) {
    case 'weekly': return 'wk'
    case 'monthly': return 'mo'
    case 'annual': return 'yr'
    case 'one_time': return 'once'
  }
}

// ============================================================
// Types
// ============================================================

interface CashInSetupWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete: (items: CashInItem[]) => void
  existingItemCount: number
}

// ============================================================
// Step Components
// ============================================================

interface StepRevenueProps {
  rows: RevenueRow[]
  onAdd: () => void
  onRemove: (key: string) => void
  onUpdate: (key: string, field: keyof RevenueRow, value: string | number) => void
}

function StepRevenue({ rows, onAdd, onRemove, onUpdate }: StepRevenueProps) {
  const weeklyTotal = rows.reduce((sum, r) => sum + weightedWeekly(r.amountPounds, r.frequency, r.probabilityPct), 0)

  return (
    <div className="space-y-4">
      <div>
        <h3 className={typography.wizardStepTitle}>How does money come in?</h3>
        <p className={cn(typography.wizardStepDescription, 'mt-1')}>
          List your revenue streams — products, services, subscriptions, consulting.
          Adjust probability if revenue isn&apos;t guaranteed.
        </p>
      </div>

      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row._key} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
            <input
              type="text"
              value={row.name}
              onChange={(e) => onUpdate(row._key, 'name', e.target.value)}
              placeholder="Revenue stream name"
              className="flex-1 min-w-0 h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-sm text-muted-foreground">&pound;</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={row.amountPounds}
                onChange={(e) => onUpdate(row._key, 'amountPounds', e.target.value)}
                placeholder="0"
                className="w-24 h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <select
              value={row.frequency}
              onChange={(e) => onUpdate(row._key, 'frequency', e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring shrink-0"
            >
              {FREQUENCY_OPTIONS.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
            <div className="flex items-center gap-1 shrink-0 w-20">
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={row.probabilityPct}
                onChange={(e) => onUpdate(row._key, 'probabilityPct', Number(e.target.value))}
                className="w-12 accent-international-orange"
                aria-label="Probability"
              />
              <span className="text-xs text-muted-foreground w-8 text-right">{row.probabilityPct}%</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
              onClick={() => onRemove(row._key)}
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

      {/* Running total */}
      <div className="flex justify-between items-center pt-2 border-t border-border">
        <span className="text-sm text-muted-foreground">
          {rows.length} stream{rows.length !== 1 ? 's' : ''}
        </span>
        <span className="text-sm font-medium text-foreground">
          {formatCurrency(weeklyTotal)}/wk (weighted)
        </span>
      </div>
    </div>
  )
}

interface StepFundingProps {
  rows: FundingRow[]
  onToggle: (key: string) => void
  onUpdate: (key: string, field: keyof FundingRow, value: string | number) => void
}

function StepFunding({ rows, onToggle, onUpdate }: StepFundingProps) {
  const enabledRows = rows.filter(r => r.enabled)
  const weeklyTotal = enabledRows.reduce((sum, r) => sum + weightedWeekly(r.amountPounds, r.frequency, r.probabilityPct), 0)

  return (
    <div className="space-y-4">
      <div>
        <h3 className={typography.wizardStepTitle}>Any other funding sources?</h3>
        <p className={cn(typography.wizardStepDescription, 'mt-1')}>
          Check any that apply — loans, investment, grants. Adjust probability for uncertain funding.
        </p>
      </div>

      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.key}
            className={cn(
              'flex items-center gap-3 p-3 rounded-lg border transition-colors',
              row.enabled ? 'bg-muted/30 border-border' : 'bg-muted/10 border-transparent opacity-60'
            )}
          >
            <input
              type="checkbox"
              checked={row.enabled}
              onChange={() => onToggle(row.key)}
              className="h-4 w-4 rounded accent-international-orange shrink-0"
              aria-label={`Include ${row.name}`}
            />
            <input
              type="text"
              value={row.name}
              onChange={(e) => onUpdate(row.key, 'name', e.target.value)}
              disabled={!row.enabled}
              className="flex-1 min-w-0 h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-sm text-muted-foreground">&pound;</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={row.amountPounds}
                onChange={(e) => onUpdate(row.key, 'amountPounds', e.target.value)}
                disabled={!row.enabled}
                placeholder="0"
                className="w-24 h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <select
              value={row.frequency}
              onChange={(e) => onUpdate(row.key, 'frequency', e.target.value)}
              disabled={!row.enabled}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-ring shrink-0"
            >
              {FREQUENCY_OPTIONS.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
            <div className="flex items-center gap-1 shrink-0 w-20">
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={row.probabilityPct}
                onChange={(e) => onUpdate(row.key, 'probabilityPct', Number(e.target.value))}
                disabled={!row.enabled}
                className="w-12 accent-international-orange disabled:opacity-50"
                aria-label="Probability"
              />
              <span className="text-xs text-muted-foreground w-8 text-right">{row.probabilityPct}%</span>
            </div>
          </div>
        ))}
      </div>

      {/* Running total */}
      <div className="flex justify-between items-center pt-2 border-t border-border">
        <span className="text-sm text-muted-foreground">
          {enabledRows.length} source{enabledRows.length !== 1 ? 's' : ''} selected
        </span>
        <span className="text-sm font-medium text-foreground">
          {formatCurrency(weeklyTotal)}/wk (weighted)
        </span>
      </div>
    </div>
  )
}

interface StepReviewProps {
  revenueRows: RevenueRow[]
  fundingRows: FundingRow[]
}

function StepReview({ revenueRows, fundingRows }: StepReviewProps) {
  const validRevenue = revenueRows.filter(r => r.name.trim() && getAmountPence(r.amountPounds) > 0)
  const validFunding = fundingRows.filter(r => r.enabled && getAmountPence(r.amountPounds) > 0)

  const weeklyRevenue = validRevenue.reduce((sum, r) => sum + weightedWeekly(r.amountPounds, r.frequency, r.probabilityPct), 0)
  const weeklyFunding = validFunding.reduce((sum, r) => sum + weightedWeekly(r.amountPounds, r.frequency, r.probabilityPct), 0)
  const weeklyTotal = weeklyRevenue + weeklyFunding

  const totalItems = validRevenue.length + validFunding.length

  return (
    <div className="space-y-6">
      <div>
        <h3 className={typography.wizardStepTitle}>Review your income items</h3>
        <p className={cn(typography.wizardStepDescription, 'mt-1')}>
          Here&apos;s a summary of what you&apos;re about to create. You can always edit individual items later.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 rounded-lg bg-muted/30 border">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Revenue</p>
          <p className="text-xl font-semibold text-foreground mt-1">{formatCurrency(weeklyRevenue)}/wk</p>
          <p className="text-xs text-muted-foreground">{validRevenue.length} stream{validRevenue.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="p-4 rounded-lg bg-muted/30 border">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Other Funding</p>
          <p className="text-xl font-semibold text-foreground mt-1">{formatCurrency(weeklyFunding)}/wk</p>
          <p className="text-xs text-muted-foreground">{validFunding.length} source{validFunding.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Grand total */}
      <div className="p-4 rounded-lg bg-muted/30 border">
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Weekly Weighted Total</p>
        <p className="text-2xl font-semibold text-foreground mt-1">{formatCurrency(weeklyTotal)}/wk</p>
      </div>

      {/* Item breakdown */}
      <div className="space-y-3 text-sm">
        {validRevenue.length > 0 && (
          <div>
            <p className="font-medium text-foreground mb-1">Revenue Streams</p>
            {validRevenue.map(r => (
              <div key={r._key} className="flex justify-between py-0.5">
                <span className="text-muted-foreground">{r.name} ({r.probabilityPct}%)</span>
                <span className="font-medium text-foreground">&pound;{r.amountPounds}/{freqLabel(r.frequency)}</span>
              </div>
            ))}
          </div>
        )}
        {validFunding.length > 0 && (
          <div>
            <p className="font-medium text-foreground mb-1">Other Funding</p>
            {validFunding.map(r => (
              <div key={r.key} className="flex justify-between py-0.5">
                <span className="text-muted-foreground">{r.name} ({r.probabilityPct}%)</span>
                <span className="font-medium text-foreground">&pound;{r.amountPounds}/{freqLabel(r.frequency)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {totalItems === 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No items with amounts entered. Go back to add at least one income item.
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}

// ============================================================
// Main Wizard
// ============================================================

export function CashInSetupWizard({
  open,
  onOpenChange,
  onComplete,
  existingItemCount,
}: CashInSetupWizardProps) {
  const stepper = useWizardSteps(STEPS)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [revenueRows, setRevenueRows] = useState<RevenueRow[]>(() => [
    { _key: nextRevenueKey(), name: '', amountPounds: '', frequency: 'monthly', probabilityPct: 100 },
  ])

  const [fundingRows, setFundingRows] = useState<FundingRow[]>(() =>
    FUNDING_PRESETS.map(p => ({
      key: p.key,
      enabled: false,
      name: p.defaultName,
      sourceType: p.sourceType,
      amountPounds: '',
      frequency: p.defaultFrequency,
      probabilityPct: p.defaultProbability,
    }))
  )

  // Revenue row handlers
  const addRevenueRow = useCallback(() => {
    setRevenueRows(prev => [...prev, { _key: nextRevenueKey(), name: '', amountPounds: '', frequency: 'monthly', probabilityPct: 100 }])
  }, [])

  const removeRevenueRow = useCallback((key: string) => {
    setRevenueRows(prev => prev.filter(r => r._key !== key))
  }, [])

  const updateRevenueRow = useCallback((key: string, field: keyof RevenueRow, value: string | number) => {
    setRevenueRows(prev => prev.map(r => r._key === key ? { ...r, [field]: value } : r))
  }, [])

  // Funding row handlers
  const toggleFunding = useCallback((key: string) => {
    setFundingRows(prev => prev.map(r => r.key === key ? { ...r, enabled: !r.enabled } : r))
  }, [])

  const updateFunding = useCallback((key: string, field: keyof FundingRow, value: string | number) => {
    setFundingRows(prev => prev.map(r => r.key === key ? { ...r, [field]: value } : r))
  }, [])

  const enabledItems = useMemo(() => {
    const validRevenue = revenueRows.filter(r => r.name.trim() && getAmountPence(r.amountPounds) > 0)
    const validFunding = fundingRows.filter(r => r.enabled && getAmountPence(r.amountPounds) > 0)
    return { revenue: validRevenue, funding: validFunding, total: validRevenue.length + validFunding.length }
  }, [revenueRows, fundingRows])

  const handleNext = useCallback(() => {
    setError(null)
    stepper.goNext()
  }, [stepper])

  const handleBack = useCallback(() => {
    setError(null)
    stepper.goBack()
  }, [stepper])

  const handleSubmit = useCallback(async () => {
    if (enabledItems.total === 0) {
      setError('Add at least one income item with an amount')
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      const today = new Date().toISOString().split('T')[0]
      const inputs: CreateCashInInput[] = [
        ...enabledItems.revenue.map(r => ({
          name: r.name,
          source_type: 'revenue' as CashInSourceType,
          amount: getAmountPence(r.amountPounds),
          frequency: r.frequency,
          probability_pct: r.probabilityPct,
          effective_from: today,
        })),
        ...enabledItems.funding.map(r => ({
          name: r.name,
          source_type: r.sourceType,
          amount: getAmountPence(r.amountPounds),
          frequency: r.frequency,
          probability_pct: r.probabilityPct,
          effective_from: today,
        })),
      ]

      const { batchCreateCashInItems } = await import('@/actions/cash-burn-batch')
      const result = await batchCreateCashInItems(inputs)

      if (result.error) {
        setError(result.error)
      } else if (result.data) {
        onComplete(result.data)
        onOpenChange(false)
        // Reset for next use
        setRevenueRows([{ _key: nextRevenueKey(), name: '', amountPounds: '', frequency: 'monthly', probabilityPct: 100 }])
        setFundingRows(FUNDING_PRESETS.map(p => ({
          key: p.key,
          enabled: false,
          name: p.defaultName,
          sourceType: p.sourceType,
          amountPounds: '',
          frequency: p.defaultFrequency,
          probabilityPct: p.defaultProbability,
        })))
        stepper.reset()
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to save'
      setError(message)
    } finally {
      setIsSaving(false)
    }
  }, [enabledItems, onComplete, onOpenChange, stepper])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Quick Setup: Cash In</DialogTitle>
        </DialogHeader>

        <WizardStepper
          steps={STEPS}
          currentStep={stepper.currentStep}
          completedSteps={stepper.completedSteps}
        />

        <ScrollArea className="max-h-[55vh] pr-2">
          {existingItemCount > 0 && stepper.currentStep === 'revenue' && (
            <Alert className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                You already have {existingItemCount} income item{existingItemCount !== 1 ? 's' : ''} — this will add more.
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {stepper.currentStep === 'revenue' && (
            <StepRevenue
              rows={revenueRows}
              onAdd={addRevenueRow}
              onRemove={removeRevenueRow}
              onUpdate={updateRevenueRow}
            />
          )}

          {stepper.currentStep === 'funding' && (
            <StepFunding
              rows={fundingRows}
              onToggle={toggleFunding}
              onUpdate={updateFunding}
            />
          )}

          {stepper.currentStep === 'review' && (
            <StepReview revenueRows={revenueRows} fundingRows={fundingRows} />
          )}
        </ScrollArea>

        <DialogFooter>
          <div className="flex w-full items-center justify-between">
            <Button
              variant="secondary"
              onClick={stepper.isFirstStep ? () => onOpenChange(false) : handleBack}
            >
              {stepper.isFirstStep ? 'Cancel' : (
                <>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </>
              )}
            </Button>

            {stepper.isLastStep ? (
              <Button onClick={handleSubmit} disabled={isSaving || enabledItems.total === 0}>
                {isSaving ? (
                  <>
                    <Loader2 className="animate-spin h-4 w-4 mr-2" />
                    Creating...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Create {enabledItems.total} Income Item{enabledItems.total !== 1 ? 's' : ''}
                  </>
                )}
              </Button>
            ) : (
              <Button onClick={handleNext}>
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
