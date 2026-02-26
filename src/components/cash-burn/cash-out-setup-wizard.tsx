'use client'

/**
 * CashOutSetupWizard — Quick setup wizard for bulk-adding cost items.
 *
 * @description 3-step wizard:
 * 1. Fixed Costs — pre-defined categories, all pre-checked
 * 2. Variable Costs — pre-defined categories, all unchecked
 * 3. Review — summary with totals, submit
 *
 * Amounts entered in pounds, converted to pence for the server action.
 */

import { useState, useCallback, useMemo, useEffect } from 'react'
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
  Lock,
  TrendingDown,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { typography } from '@/lib/design-system'
import { WizardStepper, useWizardSteps } from '@/components/ui/wizard-stepper'
import type { WizardStep } from '@/components/ui/wizard-stepper'
import { formatCurrency } from '@/types/payments'
import type { CashOutItem, CreateCashOutInput, Frequency, CostType } from '@/types/cash-burn'
import type { WizardProfile, WizardCompanyContext } from '@/actions/cash-burn-out'

// ============================================================
// Number formatting helpers
// ============================================================

function formatWithCommas(value: string): string {
  const stripped = value.replace(/,/g, '')
  const parts = stripped.split('.')
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return parts.length > 1 ? `${intPart}.${parts[1]}` : intPart
}

function stripCommas(value: string): string {
  return value.replace(/,/g, '')
}

// ============================================================
// Employer's NI calculation (UK 2025/26)
// ============================================================

const EMPLOYER_NI_RATE = 0.15
const EMPLOYER_NI_SECONDARY_THRESHOLD = 5000 // £5,000/year

function annualiseAmount(amountPounds: string, frequency: Frequency): number {
  const parsed = parseFloat(amountPounds)
  if (isNaN(parsed) || parsed < 0) return 0
  switch (frequency) {
    case 'weekly': return parsed * 52
    case 'monthly': return parsed * 12
    case 'annual': return parsed
    case 'one_time': return parsed
  }
}

function computeEmployerNI(annualGross: number): number {
  return Math.max(0, annualGross - EMPLOYER_NI_SECONDARY_THRESHOLD) * EMPLOYER_NI_RATE
}

// ============================================================
// Smart defaults — scales with team size
// ============================================================

function computeSmartDefaults(teamSize: number): Record<string, string> {
  const n = Math.max(teamSize, 1)
  return {
    rent: String(500 * n),
    benefits_insurance: String(100 * n),
    phone_internet: String(50 * n),
    ai_llm: String(100 * n),
    saas_subscriptions: String(50 * n),
    insurance: String(300 * n),
    accounting: String(125 * n),
    legal_retainer: String(75 * n),
    bank_fees: String(Math.round(12.5 * n)),
  }
}

// ============================================================
// Variable cost smart defaults — category selection by business model
// ============================================================

// INTENT: Maps business_model → which variable categories to pre-check.
// Categories not listed here default to unchecked.
const VARIABLE_CATEGORY_BY_MODEL: Record<string, Set<string>> = {
  hardware:     new Set(['contractors', 'hardware_components', 'prototyping', 'manufacturing', 'shipping', 'marketing', 'r_and_d', 'equipment_purchase']),
  saas:         new Set(['contractors', 'marketing', 'cloud_infrastructure', 'r_and_d']),
  marketplace:  new Set(['contractors', 'marketing', 'cloud_infrastructure', 'r_and_d']),
  services:     new Set(['contractors', 'marketing', 'travel']),
  hybrid:       new Set(['contractors', 'hardware_components', 'marketing', 'cloud_infrastructure', 'r_and_d']),
}

// INTENT: Certain sectors add categories regardless of business model
const SECTOR_CATEGORY_ADDITIONS: Record<string, string[]> = {
  robotics:             ['hardware_components', 'prototyping', 'r_and_d', 'equipment_purchase'],
  aerospace:            ['hardware_components', 'prototyping', 'r_and_d', 'equipment_purchase'],
  defence:              ['hardware_components', 'prototyping', 'r_and_d', 'equipment_purchase'],
  automotive:           ['hardware_components', 'prototyping', 'manufacturing'],
  consumer_electronics: ['hardware_components', 'prototyping', 'manufacturing', 'shipping'],
  medical:              ['prototyping', 'r_and_d', 'equipment_purchase'],
  energy:               ['hardware_components', 'r_and_d', 'equipment_purchase'],
  marine:               ['hardware_components', 'prototyping', 'r_and_d'],
}

// INTENT: Conservative base monthly amounts in GBP per category
const VARIABLE_BASE_AMOUNTS: Record<string, number> = {
  contractors: 2000,
  hardware_components: 500,
  prototyping: 1000,
  manufacturing: 2000,
  shipping: 300,
  marketing: 500,
  travel: 300,
  events: 2000,            // annual — will be adjusted by frequency
  cloud_infrastructure: 200,
  r_and_d: 1000,
  equipment_purchase: 3000, // one-time
}

// INTENT: Stage multiplier derived from revenue range (primary) → funding status (fallback)
function getStageMultiplier(ctx: WizardCompanyContext | null): number {
  if (!ctx) return 1

  // Revenue range is the strongest signal
  if (ctx.revenueRange) {
    switch (ctx.revenueRange) {
      case 'pre_revenue': return 1
      case 'under_100k': return 1.5
      case '100k_500k': return 2.5
      case '500k_1m': return 3.5
      case '1m_5m': return 5
      case '5m_plus': return 8
    }
  }

  // Funding status as fallback
  if (ctx.fundingStatus) {
    switch (ctx.fundingStatus) {
      case 'bootstrapped': return 1
      case 'pre_seed': return 1
      case 'seed': return 2
      case 'series_a': return 4
      case 'series_b_plus': return 6
      case 'profitable': return 3
    }
  }

  return 1
}

function getVariableDefaults(
  ctx: WizardCompanyContext | null,
  teamSize: number,
): { enabledKeys: Set<string>; amounts: Record<string, string> } {
  if (!ctx?.businessModel) return { enabledKeys: new Set(), amounts: {} }

  // Build enabled set from business model
  const enabledKeys = new Set(VARIABLE_CATEGORY_BY_MODEL[ctx.businessModel] ?? [])

  // Layer on sector additions
  if (ctx.sector) {
    const additions = SECTOR_CATEGORY_ADDITIONS[ctx.sector]
    if (additions) additions.forEach(k => enabledKeys.add(k))
  }

  // Compute amounts for enabled categories only
  const multiplier = getStageMultiplier(ctx)
  // INTENT: Team size gives a small bump (sqrt) so costs don't scale linearly with headcount
  const teamFactor = Math.max(1, Math.sqrt(teamSize))
  const amounts: Record<string, string> = {}

  for (const key of enabledKeys) {
    const base = VARIABLE_BASE_AMOUNTS[key]
    if (base !== undefined) {
      amounts[key] = String(Math.round(base * multiplier * teamFactor))
    }
  }

  return { enabledKeys, amounts }
}

// ============================================================
// Step definitions
// ============================================================

const STEPS: WizardStep[] = [
  { id: 'fixed', title: 'Fixed Costs', icon: Lock },
  { id: 'variable', title: 'Variable Costs', icon: TrendingDown },
  { id: 'review', title: 'Review', icon: CheckCircle2 },
]

// ============================================================
// Category presets
// ============================================================

interface CategoryPreset {
  key: string
  category: string
  defaultName: string
  costType: CostType
  defaultFrequency: Frequency
}

const FIXED_COST_PRESETS: CategoryPreset[] = [
  { key: 'rent', category: 'rent', defaultName: 'Office Rent', costType: 'fixed', defaultFrequency: 'monthly' },
  // INTENT: Individual salary rows are generated per team member — see buildFixedRows()
  { key: 'benefits_insurance', category: 'benefits_insurance', defaultName: 'Benefits & Insurance', costType: 'fixed', defaultFrequency: 'monthly' },
  { key: 'phone_internet', category: 'phone_internet', defaultName: 'Phone & Internet', costType: 'fixed', defaultFrequency: 'monthly' },
  { key: 'ai_llm', category: 'ai_llm', defaultName: 'AI / LLM', costType: 'fixed', defaultFrequency: 'monthly' },
  { key: 'saas_subscriptions', category: 'saas_subscriptions', defaultName: 'SaaS Subscriptions', costType: 'fixed', defaultFrequency: 'monthly' },
  { key: 'insurance', category: 'insurance', defaultName: 'Insurance', costType: 'fixed', defaultFrequency: 'annual' },
  { key: 'accounting', category: 'accounting', defaultName: 'Accounting', costType: 'fixed', defaultFrequency: 'monthly' },
  { key: 'legal_retainer', category: 'legal_retainer', defaultName: 'Legal Retainer', costType: 'fixed', defaultFrequency: 'monthly' },
  { key: 'bank_fees', category: 'bank_fees', defaultName: 'Bank Fees', costType: 'fixed', defaultFrequency: 'monthly' },
]

const VARIABLE_COST_PRESETS: CategoryPreset[] = [
  { key: 'contractors', category: 'contractors', defaultName: 'Contractors', costType: 'variable', defaultFrequency: 'monthly' },
  { key: 'hardware_components', category: 'hardware_components', defaultName: 'Hardware Components', costType: 'variable', defaultFrequency: 'monthly' },
  { key: 'prototyping', category: 'prototyping', defaultName: 'Prototyping', costType: 'variable', defaultFrequency: 'monthly' },
  { key: 'manufacturing', category: 'manufacturing', defaultName: 'Manufacturing', costType: 'variable', defaultFrequency: 'monthly' },
  { key: 'shipping', category: 'shipping', defaultName: 'Shipping', costType: 'variable', defaultFrequency: 'monthly' },
  { key: 'marketing', category: 'marketing', defaultName: 'Marketing', costType: 'variable', defaultFrequency: 'monthly' },
  { key: 'travel', category: 'travel', defaultName: 'Travel', costType: 'variable', defaultFrequency: 'monthly' },
  { key: 'events', category: 'events', defaultName: 'Events', costType: 'variable', defaultFrequency: 'annual' },
  { key: 'cloud_infrastructure', category: 'cloud_infrastructure', defaultName: 'Cloud Infrastructure', costType: 'variable', defaultFrequency: 'monthly' },
  { key: 'r_and_d', category: 'r_and_d', defaultName: 'R&D', costType: 'variable', defaultFrequency: 'monthly' },
  { key: 'equipment_purchase', category: 'equipment_purchase', defaultName: 'Equipment Purchase', costType: 'variable', defaultFrequency: 'one_time' },
  { key: 'other', category: 'other', defaultName: 'Other', costType: 'variable', defaultFrequency: 'monthly' },
]

const FREQUENCY_OPTIONS: { value: Frequency; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'annual', label: 'Annual' },
  { value: 'one_time', label: 'One-time' },
]

// ============================================================
// Row state
// ============================================================

interface WizardRow {
  key: string
  enabled: boolean
  name: string
  category: string
  costType: CostType
  amountPounds: string // string for input binding
  frequency: Frequency
}

function createRow(preset: CategoryPreset, enabled: boolean, defaultAmount?: string): WizardRow {
  return {
    key: preset.key,
    enabled,
    name: preset.defaultName,
    category: preset.category,
    costType: preset.costType,
    amountPounds: defaultAmount ?? '',
    frequency: preset.defaultFrequency,
  }
}

function buildFixedRows(profiles: WizardProfile[], defaults: Record<string, string>): WizardRow[] {
  const rows: WizardRow[] = []

  // Office Rent (first preset)
  rows.push(createRow(FIXED_COST_PRESETS[0], true, defaults[FIXED_COST_PRESETS[0].key]))

  // Individual salary rows per human team member
  for (const profile of profiles) {
    rows.push({
      key: `salary_${profile.id}`,
      enabled: true,
      name: `${profile.fullName} — Gross Salary`,
      category: 'salaries',
      costType: 'fixed',
      amountPounds: '',
      frequency: 'monthly',
    })
  }

  // Employer's NI — auto-calculated from salary rows, submitted as a real cost item
  if (profiles.length > 0) {
    rows.push({
      key: 'employer_ni',
      enabled: true,
      name: "Employer's National Insurance",
      category: 'employer_ni',
      costType: 'fixed',
      amountPounds: '0',
      frequency: 'monthly',
    })
  }

  // Remaining presets (everything after rent)
  for (let i = 1; i < FIXED_COST_PRESETS.length; i++) {
    const preset = FIXED_COST_PRESETS[i]
    rows.push(createRow(preset, true, defaults[preset.key]))
  }

  return rows
}

function buildVariableRows(
  ctx: WizardCompanyContext | null,
  teamSize: number,
): WizardRow[] {
  const { enabledKeys, amounts } = getVariableDefaults(ctx, teamSize)
  return VARIABLE_COST_PRESETS.map(p =>
    createRow(p, enabledKeys.has(p.key), amounts[p.key])
  )
}

function getAmountPence(row: WizardRow): number {
  const parsed = parseFloat(row.amountPounds)
  if (isNaN(parsed) || parsed < 0) return 0
  return Math.round(parsed * 100)
}

function weeklyFromRow(row: WizardRow): number {
  const pence = getAmountPence(row)
  if (pence === 0) return 0
  switch (row.frequency) {
    case 'weekly': return pence
    case 'monthly': return Math.round(pence * 12 / 52)
    case 'annual': return Math.round(pence / 52)
    case 'one_time': return pence
  }
}

// ============================================================
// Types
// ============================================================

interface CashOutSetupWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete: (items: CashOutItem[]) => void
  existingItemCount: number
  humanProfiles: WizardProfile[]
  companyContext: WizardCompanyContext | null
}

// ============================================================
// Step Components
// ============================================================

interface StepCategoriesProps {
  title: string
  description: string
  rows: WizardRow[]
  onToggle: (key: string) => void
  onUpdate: (key: string, field: keyof WizardRow, value: string) => void
}

function StepCategories({ title, description, rows, onToggle, onUpdate }: StepCategoriesProps) {
  const enabledRows = rows.filter(r => r.enabled)
  const weeklyTotal = enabledRows.reduce((sum, r) => sum + weeklyFromRow(r), 0)

  return (
    <div className="space-y-4">
      <div>
        <h3 className={typography.wizardStepTitle}>{title}</h3>
        <p className={cn(typography.wizardStepDescription, 'mt-1')}>{description}</p>
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
                type="text"
                inputMode="decimal"
                value={row.amountPounds ? formatWithCommas(row.amountPounds) : ''}
                onChange={(e) => {
                  const raw = stripCommas(e.target.value)
                  if (raw === '' || /^\d*\.?\d{0,2}$/.test(raw)) {
                    onUpdate(row.key, 'amountPounds', raw)
                  }
                }}
                disabled={!row.enabled || row.key === 'employer_ni'}
                placeholder="0"
                className="w-28 h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {row.key === 'employer_ni' && (
                <span className="text-xs text-muted-foreground">(auto)</span>
              )}
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
          </div>
        ))}
      </div>

      {rows.some(r => r.key.startsWith('salary_')) && (
        <p className="text-xs text-muted-foreground">
          Employee&apos;s NI is deducted from gross salary — it doesn&apos;t increase your costs.
        </p>
      )}

      {/* Running total */}
      <div className="flex justify-between items-center pt-2 border-t border-border">
        <span className="text-sm text-muted-foreground">
          {enabledRows.length} item{enabledRows.length !== 1 ? 's' : ''} selected
        </span>
        <span className="text-sm font-medium text-foreground">
          {formatCurrency(weeklyTotal)}/wk
        </span>
      </div>
    </div>
  )
}

interface StepReviewProps {
  fixedRows: WizardRow[]
  variableRows: WizardRow[]
}

function StepReview({ fixedRows, variableRows }: StepReviewProps) {
  const enabledFixed = fixedRows.filter(r => r.enabled && getAmountPence(r) > 0)
  const enabledVariable = variableRows.filter(r => r.enabled && getAmountPence(r) > 0)

  const weeklyFixed = enabledFixed.reduce((sum, r) => sum + weeklyFromRow(r), 0)
  const weeklyVariable = enabledVariable.reduce((sum, r) => sum + weeklyFromRow(r), 0)
  const weeklyTotal = weeklyFixed + weeklyVariable
  const monthlyTotal = Math.round(weeklyTotal * 52 / 12)
  const annualTotal = weeklyTotal * 52

  const totalItems = enabledFixed.length + enabledVariable.length

  return (
    <div className="space-y-6">
      <div>
        <h3 className={typography.wizardStepTitle}>Review your cost items</h3>
        <p className={cn(typography.wizardStepDescription, 'mt-1')}>
          Here&apos;s a summary of what you&apos;re about to create. You can always edit individual items later.
        </p>
      </div>

      {/* Two-column summary */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 rounded-lg bg-muted/30 border">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Fixed Costs</p>
          <p className="text-xl font-semibold text-foreground mt-1">{formatCurrency(weeklyFixed)}/wk</p>
          <p className="text-xs text-muted-foreground">{enabledFixed.length} item{enabledFixed.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="p-4 rounded-lg bg-muted/30 border">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Variable Costs</p>
          <p className="text-xl font-semibold text-foreground mt-1">{formatCurrency(weeklyVariable)}/wk</p>
          <p className="text-xs text-muted-foreground">{enabledVariable.length} item{enabledVariable.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Grand totals */}
      <div className="p-4 rounded-lg bg-muted/30 border space-y-2">
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Grand Total</p>
        <div className="flex items-baseline gap-4">
          <span className="text-2xl font-semibold text-foreground">{formatCurrency(monthlyTotal)}/mo</span>
          <span className="text-sm text-muted-foreground">{formatCurrency(weeklyTotal)}/wk</span>
          <span className="text-sm text-muted-foreground">{formatCurrency(annualTotal)}/yr</span>
        </div>
      </div>

      {/* Item breakdown */}
      <div className="space-y-3 text-sm">
        {enabledFixed.length > 0 && (
          <div>
            <p className="font-medium text-foreground mb-1">Fixed Costs</p>
            {enabledFixed.map(r => (
              <div key={r.key} className="flex justify-between py-0.5">
                <span className="text-muted-foreground">{r.name}</span>
                <span className="font-medium text-foreground">&pound;{formatWithCommas(r.amountPounds)}/{r.frequency === 'weekly' ? 'wk' : r.frequency === 'monthly' ? 'mo' : r.frequency === 'annual' ? 'yr' : 'once'}</span>
              </div>
            ))}
          </div>
        )}
        {enabledVariable.length > 0 && (
          <div>
            <p className="font-medium text-foreground mb-1">Variable Costs</p>
            {enabledVariable.map(r => (
              <div key={r.key} className="flex justify-between py-0.5">
                <span className="text-muted-foreground">{r.name}</span>
                <span className="font-medium text-foreground">&pound;{formatWithCommas(r.amountPounds)}/{r.frequency === 'weekly' ? 'wk' : r.frequency === 'monthly' ? 'mo' : r.frequency === 'annual' ? 'yr' : 'once'}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {totalItems === 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No items with amounts entered. Go back to add at least one cost item.
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}

// ============================================================
// Main Wizard
// ============================================================

export function CashOutSetupWizard({
  open,
  onOpenChange,
  onComplete,
  existingItemCount,
  humanProfiles,
  companyContext,
}: CashOutSetupWizardProps) {
  const stepper = useWizardSteps(STEPS)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const defaults = useMemo(() => computeSmartDefaults(humanProfiles.length), [humanProfiles.length])

  // INTENT: Fixed costs pre-checked with smart defaults + salary rows; variable costs unchecked
  const [fixedRows, setFixedRows] = useState<WizardRow[]>(() =>
    buildFixedRows(humanProfiles, defaults)
  )
  const [variableRows, setVariableRows] = useState<WizardRow[]>(() =>
    buildVariableRows(companyContext, humanProfiles.length)
  )

  // INTENT: Auto-recalculate Employer's NI whenever salary amounts/frequencies change
  useEffect(() => {
    const salaryRows = fixedRows.filter(r => r.key.startsWith('salary_'))
    if (salaryRows.length === 0) return

    const totalAnnualNI = salaryRows.reduce((sum, r) => {
      if (!r.enabled) return sum
      const annual = annualiseAmount(r.amountPounds, r.frequency)
      return sum + computeEmployerNI(annual)
    }, 0)

    const monthlyNI = (totalAnnualNI / 12).toFixed(2)

    setFixedRows(prev => {
      const niRow = prev.find(r => r.key === 'employer_ni')
      if (!niRow || niRow.amountPounds === monthlyNI) return prev
      return prev.map(r => r.key === 'employer_ni' ? { ...r, amountPounds: monthlyNI } : r)
    })
  }, [fixedRows])

  const toggleRow = useCallback((rows: WizardRow[], setRows: React.Dispatch<React.SetStateAction<WizardRow[]>>, key: string) => {
    setRows(rows.map(r => r.key === key ? { ...r, enabled: !r.enabled } : r))
  }, [])

  const updateRow = useCallback((setRows: React.Dispatch<React.SetStateAction<WizardRow[]>>, key: string, field: keyof WizardRow, value: string) => {
    setRows(prev => prev.map(r => r.key === key ? { ...r, [field]: value } : r))
  }, [])

  const enabledItems = useMemo(() => {
    const fixed = fixedRows.filter(r => r.enabled && getAmountPence(r) > 0)
    const variable = variableRows.filter(r => r.enabled && getAmountPence(r) > 0)
    return [...fixed, ...variable]
  }, [fixedRows, variableRows])

  const handleNext = useCallback(() => {
    setError(null)
    stepper.goNext()
  }, [stepper])

  const handleBack = useCallback(() => {
    setError(null)
    stepper.goBack()
  }, [stepper])

  const handleSubmit = useCallback(async () => {
    if (enabledItems.length === 0) {
      setError('Add at least one cost item with an amount')
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      const today = new Date().toISOString().split('T')[0]
      const inputs: CreateCashOutInput[] = enabledItems.map(row => ({
        name: row.name,
        category: row.category,
        cost_type: row.costType,
        amount: getAmountPence(row),
        frequency: row.frequency,
        effective_from: today,
      }))

      const { batchCreateCashOutItems } = await import('@/actions/cash-burn-batch')
      const result = await batchCreateCashOutItems(inputs)

      if (result.error) {
        setError(result.error)
      } else if (result.data) {
        onComplete(result.data)
        onOpenChange(false)
        // Reset for next use
        setFixedRows(buildFixedRows(humanProfiles, defaults))
        setVariableRows(buildVariableRows(companyContext, humanProfiles.length))
        stepper.reset()
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to save'
      setError(message)
    } finally {
      setIsSaving(false)
    }
  }, [enabledItems, onComplete, onOpenChange, stepper, humanProfiles, defaults, companyContext])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Quick Setup: Cash Out</DialogTitle>
        </DialogHeader>

        <WizardStepper
          steps={STEPS}
          currentStep={stepper.currentStep}
          completedSteps={stepper.completedSteps}
        />

        <ScrollArea className="max-h-[55vh] pr-2">
          {existingItemCount > 0 && stepper.currentStep === 'fixed' && (
            <Alert className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                You already have {existingItemCount} cost item{existingItemCount !== 1 ? 's' : ''} — this will add more.
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {stepper.currentStep === 'fixed' && (
            <StepCategories
              title="What are your recurring fixed costs?"
              description="These are costs you pay regularly regardless of activity. Check the ones that apply and enter amounts."
              rows={fixedRows}
              onToggle={(key) => toggleRow(fixedRows, setFixedRows, key)}
              onUpdate={(key, field, value) => updateRow(setFixedRows, key, field, value)}
            />
          )}

          {stepper.currentStep === 'variable' && (
            <StepCategories
              title="What about variable or project-based costs?"
              description="These costs fluctuate with activity. Check only the ones relevant to your business."
              rows={variableRows}
              onToggle={(key) => toggleRow(variableRows, setVariableRows, key)}
              onUpdate={(key, field, value) => updateRow(setVariableRows, key, field, value)}
            />
          )}

          {stepper.currentStep === 'review' && (
            <StepReview fixedRows={fixedRows} variableRows={variableRows} />
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
              <Button onClick={handleSubmit} disabled={isSaving || enabledItems.length === 0}>
                {isSaving ? (
                  <>
                    <Loader2 className="animate-spin h-4 w-4 mr-2" />
                    Creating...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Create {enabledItems.length} Cost Item{enabledItems.length !== 1 ? 's' : ''}
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
