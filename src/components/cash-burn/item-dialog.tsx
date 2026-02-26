'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { generateWeekOptions } from '@/lib/cash-burn/weekly-projection'
import type {
  Frequency,
  CostType,
  PnlCategory,
  CashInSourceType,
  CreateCashOutInput,
  CreateCashInInput,
} from '@/types/cash-burn'

// ============================================================
// Category / Source options
// ============================================================

const CASH_OUT_CATEGORIES = [
  { value: 'rent', label: 'Rent', group: 'fixed' },
  { value: 'salaries', label: 'Salaries', group: 'fixed' },
  { value: 'benefits_insurance', label: 'Benefits & Insurance', group: 'fixed' },
  { value: 'phone_internet', label: 'Phone & Internet', group: 'fixed' },
  { value: 'ai_llm', label: 'AI / LLM', group: 'fixed' },
  { value: 'saas_subscriptions', label: 'SaaS Subscriptions', group: 'fixed' },
  { value: 'insurance', label: 'Insurance', group: 'fixed' },
  { value: 'accounting', label: 'Accounting', group: 'fixed' },
  { value: 'legal_retainer', label: 'Legal Retainer', group: 'fixed' },
  { value: 'bank_fees', label: 'Bank Fees', group: 'fixed' },
  { value: 'contractors', label: 'Contractors', group: 'variable' },
  { value: 'hardware_components', label: 'Hardware Components', group: 'variable' },
  { value: 'prototyping', label: 'Prototyping', group: 'variable' },
  { value: 'manufacturing', label: 'Manufacturing', group: 'variable' },
  { value: 'shipping', label: 'Shipping', group: 'variable' },
  { value: 'marketing', label: 'Marketing', group: 'variable' },
  { value: 'travel', label: 'Travel', group: 'variable' },
  { value: 'events', label: 'Events', group: 'variable' },
  { value: 'cloud_infrastructure', label: 'Cloud Infrastructure', group: 'variable' },
  { value: 'r_and_d', label: 'R&D', group: 'variable' },
  { value: 'equipment_purchase', label: 'Equipment Purchase', group: 'variable' },
  { value: 'other', label: 'Other', group: 'variable' },
] as const

const SOURCE_TYPES: { value: CashInSourceType; label: string }[] = [
  { value: 'revenue', label: 'Revenue' },
  { value: 'loan', label: 'Loan' },
  { value: 'equity', label: 'Equity Investment' },
  { value: 'government_grant', label: 'Government Grant' },
  { value: 'other', label: 'Other' },
]

const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'annual', label: 'Annual' },
  { value: 'one_time', label: 'One-time' },
]

const PNL_CATEGORIES: { value: PnlCategory; label: string }[] = [
  { value: 'cogs', label: 'COGS' },
  { value: 'opex', label: 'OpEx' },
  { value: 'rnd', label: 'R&D' },
  { value: 'capex', label: 'CapEx' },
  { value: 'excluded', label: 'Excluded' },
]

// ============================================================
// Types
// ============================================================

interface ItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'cash-out' | 'cash-in'
  initialData?: Partial<CreateCashOutInput & CreateCashInInput>
  onSave: (data: CreateCashOutInput | CreateCashInInput) => void
}

// ============================================================
// Component
// ============================================================

export function ItemDialog({
  open,
  onOpenChange,
  mode,
  initialData,
  onSave,
}: ItemDialogProps) {
  // Shared fields
  const [name, setName] = useState('')
  const [amountPounds, setAmountPounds] = useState('')
  const [frequency, setFrequency] = useState<Frequency>('monthly')
  const [effectiveFrom, setEffectiveFrom] = useState('')
  const [effectiveTo, setEffectiveTo] = useState('')
  const [notes, setNotes] = useState('')

  // Cash-out specific
  const [category, setCategory] = useState('salaries')
  const [costType, setCostType] = useState<CostType>('fixed')
  const [pnlCategory, setPnlCategory] = useState<PnlCategory | ''>('')

  // Cash-in specific
  const [sourceType, setSourceType] = useState<CashInSourceType>('revenue')
  const [probabilityPct, setProbabilityPct] = useState(100)

  // Week picker state for non-revenue cash-in items
  const [useWeekPicker, setUseWeekPicker] = useState(false)
  const [selectedWeek, setSelectedWeek] = useState(1)
  const startDateRef = useRef(new Date())
  const weekOptions = useMemo(() => generateWeekOptions(startDateRef.current), [])

  // INTENT: Track whether category was changed by the user (not initial data load)
  const userChangedCategoryRef = useRef(false)

  // Reset form when dialog opens or initialData changes
  useEffect(() => {
    if (open) {
      userChangedCategoryRef.current = false
      setName(initialData?.name ?? '')
      // INTENT: initialData.amount is in pence — convert to pounds for display
      setAmountPounds(initialData?.amount != null ? String(initialData.amount / 100) : '')
      setFrequency(initialData?.frequency ?? 'monthly')
      setEffectiveFrom(initialData?.effective_from ?? '')
      setEffectiveTo(initialData?.effective_to ?? '')
      setNotes(initialData?.notes ?? '')

      if (mode === 'cash-out') {
        setCategory(initialData?.category ?? 'salaries')
        setCostType(initialData?.cost_type ?? 'fixed')
        setPnlCategory(initialData?.pnl_category ?? '')
      } else {
        const st = initialData?.source_type ?? 'revenue'
        setSourceType(st)
        setProbabilityPct(initialData?.probability_pct ?? 100)

        // INTENT: For non-revenue items, reverse-lookup effective_from to a week number
        if (st !== 'revenue' && initialData?.effective_from) {
          const matchedWeek = weekOptions.find(w => w.dateISO === initialData.effective_from)
          if (matchedWeek) {
            setUseWeekPicker(true)
            setSelectedWeek(matchedWeek.weekNumber)
          } else {
            setUseWeekPicker(false)
            setSelectedWeek(1)
          }
        } else {
          setUseWeekPicker(false)
          setSelectedWeek(1)
        }
      }
    }
  }, [open, initialData, mode, weekOptions])

  // Auto-set cost type based on category group — only when user changes category
  useEffect(() => {
    if (mode === 'cash-out' && userChangedCategoryRef.current) {
      const cat = CASH_OUT_CATEGORIES.find((c) => c.value === category)
      if (cat) {
        setCostType(cat.group as CostType)
      }
    }
  }, [category, mode])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    // Guard against NaN from empty or invalid input
    const parsed = parseFloat(amountPounds)
    if (isNaN(parsed) || parsed < 0) return

    // Validate date range when both dates are set
    if (effectiveTo && effectiveTo < effectiveFrom) return

    // Convert pounds to pence
    const amountPence = Math.round(parsed * 100)

    if (mode === 'cash-out') {
      const data: CreateCashOutInput = {
        name,
        category,
        cost_type: costType,
        amount: amountPence,
        frequency,
        effective_from: effectiveFrom,
        ...(pnlCategory && { pnl_category: pnlCategory as PnlCategory }),
        ...(effectiveTo && { effective_to: effectiveTo }),
        ...(notes && { notes }),
      }
      onSave(data)
    } else {
      const data: CreateCashInInput = {
        name,
        source_type: sourceType,
        amount: amountPence,
        frequency,
        probability_pct: probabilityPct,
        effective_from: effectiveFrom,
        ...(effectiveTo && { effective_to: effectiveTo }),
        ...(notes && { notes }),
      }
      onSave(data)
    }
  }

  const isEditing = !!initialData
  const title = isEditing
    ? `Edit ${mode === 'cash-out' ? 'Cost' : 'Revenue'} Item`
    : `Add ${mode === 'cash-out' ? 'Cost' : 'Revenue'} Item`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <label htmlFor="item-name" className="text-sm font-medium text-foreground">
              Name
            </label>
            <input
              id="item-name"
              type="text"
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={mode === 'cash-out' ? 'e.g. AWS Hosting' : 'e.g. Consulting Revenue'}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Mode-specific fields */}
          {mode === 'cash-out' ? (
            <>
              {/* Category */}
              <div className="space-y-1.5">
                <label htmlFor="item-category" className="text-sm font-medium text-foreground">
                  Category
                </label>
                <select
                  id="item-category"
                  value={category}
                  onChange={(e) => { userChangedCategoryRef.current = true; setCategory(e.target.value) }}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <optgroup label="Fixed Costs">
                    {CASH_OUT_CATEGORIES.filter((c) => c.group === 'fixed').map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Variable Costs">
                    {CASH_OUT_CATEGORIES.filter((c) => c.group === 'variable').map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* Cost type */}
              <div className="space-y-1.5">
                <label htmlFor="item-cost-type" className="text-sm font-medium text-foreground">
                  Cost Type
                </label>
                <select
                  id="item-cost-type"
                  value={costType}
                  onChange={(e) => setCostType(e.target.value as CostType)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="fixed">Fixed</option>
                  <option value="variable">Variable</option>
                </select>
              </div>

              {/* P&L category override */}
              <div className="space-y-1.5">
                <label htmlFor="item-pnl-category" className="text-sm font-medium text-foreground">
                  P&L Category <span className="text-muted-foreground font-normal">(optional override)</span>
                </label>
                <select
                  id="item-pnl-category"
                  value={pnlCategory}
                  onChange={(e) => setPnlCategory(e.target.value as PnlCategory | '')}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Auto (based on category)</option>
                  {PNL_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <>
              {/* Source type */}
              <div className="space-y-1.5">
                <label htmlFor="item-source-type" className="text-sm font-medium text-foreground">
                  Source Type
                </label>
                <select
                  id="item-source-type"
                  value={sourceType}
                  onChange={(e) => setSourceType(e.target.value as CashInSourceType)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {SOURCE_TYPES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              {/* Probability */}
              <div className="space-y-1.5">
                <label htmlFor="item-probability" className="text-sm font-medium text-foreground">
                  Probability: {probabilityPct}%
                </label>
                <input
                  id="item-probability"
                  type="range"
                  aria-label="Probability percentage"
                  min={0}
                  max={100}
                  step={5}
                  value={probabilityPct}
                  onChange={(e) => setProbabilityPct(Number(e.target.value))}
                  className="w-full accent-international-orange"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>0%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>
            </>
          )}

          {/* Amount */}
          <div className="space-y-1.5">
            <label htmlFor="item-amount" className="text-sm font-medium text-foreground">
              Amount
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                &pound;
              </span>
              <input
                id="item-amount"
                type="number"
                required
                min={0}
                step={0.01}
                value={amountPounds}
                onChange={(e) => setAmountPounds(e.target.value)}
                placeholder="0.00"
                className="w-full h-10 rounded-md border border-input bg-background pl-7 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* Frequency */}
          <div className="space-y-1.5">
            <label htmlFor="item-frequency" className="text-sm font-medium text-foreground">
              Frequency
            </label>
            <select
              id="item-frequency"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as Frequency)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {FREQUENCIES.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>

          {/* Effective dates */}
          <div className="space-y-2">
            {/* Toggle between week picker and date picker for non-revenue cash-in */}
            {mode === 'cash-in' && sourceType !== 'revenue' && (
              <button
                type="button"
                onClick={() => {
                  const next = !useWeekPicker
                  setUseWeekPicker(next)
                  if (next) {
                    // Switching to week picker — set effectiveFrom from selected week
                    const weekOpt = weekOptions.find(w => w.weekNumber === selectedWeek)
                    if (weekOpt) setEffectiveFrom(weekOpt.dateISO)
                  }
                }}
                className="text-xs text-international-orange hover:underline"
              >
                {useWeekPicker ? 'Use exact date' : 'Use week picker'}
              </button>
            )}

            {useWeekPicker && mode === 'cash-in' && sourceType !== 'revenue' ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="item-arrival-week" className="text-sm font-medium text-foreground">
                    Arrival week
                  </label>
                  <select
                    id="item-arrival-week"
                    value={selectedWeek}
                    onChange={(e) => {
                      const wk = Number(e.target.value)
                      setSelectedWeek(wk)
                      const weekOpt = weekOptions.find(w => w.weekNumber === wk)
                      if (weekOpt) setEffectiveFrom(weekOpt.dateISO)
                    }}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {weekOptions.map(w => (
                      <option key={w.weekNumber} value={w.weekNumber}>{w.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="item-effective-to" className="text-sm font-medium text-foreground">
                    Effective to <span className="text-muted-foreground font-normal">(optional)</span>
                  </label>
                  <input
                    id="item-effective-to"
                    type="date"
                    value={effectiveTo}
                    onChange={(e) => setEffectiveTo(e.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="item-effective-from" className="text-sm font-medium text-foreground">
                    Effective from
                  </label>
                  <input
                    id="item-effective-from"
                    type="date"
                    required
                    value={effectiveFrom}
                    onChange={(e) => setEffectiveFrom(e.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="item-effective-to" className="text-sm font-medium text-foreground">
                    Effective to <span className="text-muted-foreground font-normal">(optional)</span>
                  </label>
                  <input
                    id="item-effective-to"
                    type="date"
                    value={effectiveTo}
                    onChange={(e) => setEffectiveTo(e.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label htmlFor="item-notes" className="text-sm font-medium text-foreground">
              Notes <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <textarea
              id="item-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Any additional context..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">
              {isEditing ? 'Save Changes' : 'Add Item'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
