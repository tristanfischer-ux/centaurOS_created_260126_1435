'use client'

/**
 * MoneyMapInputPanel — Inline input panel for revenue streams and cost items.
 *
 * @description Displays editable lists of revenue streams and cost items,
 * grouped by type (Direct, Shared, Overhead). Every item is editable inline:
 * click the pencil icon to change name/amount, delete to remove.
 * "Add" buttons are always visible so users can enter their own data
 * even while sample data is displayed.
 *
 * @component
 * @example
 * <MoneyMapInputPanel
 *   data={moneyMapData}
 *   isDemo={false}
 *   onAddRevenue={handleAddRevenue}
 *   onUpdateRevenue={handleUpdateRevenue}
 *   onDeleteRevenue={handleDeleteRevenue}
 *   onAddCost={handleAddCost}
 *   onUpdateCost={handleUpdateCost}
 *   onDeleteCost={handleDeleteCost}
 * />
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import {
  DollarSign,
  Receipt,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  Share2,
  Landmark,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { normaliseToMonthly } from '@/lib/money-map/allocation'

import type {
  MoneyMapData,
  RevenueStreamInput,
  CostItemInput,
  RevenueCategory,
  CostCategory,
  CostType,
} from '@/types/money-map'

// ============================================================
// Types
// ============================================================

interface MoneyMapInputPanelProps {
  /** Current money map data */
  data: MoneyMapData
  /** Whether showing sample/demo data */
  isDemo: boolean
  /** Callbacks for revenue stream CRUD */
  onAddRevenue: (input: RevenueStreamInput) => Promise<void>
  onUpdateRevenue: (id: string, input: RevenueStreamInput) => Promise<void>
  onDeleteRevenue: (id: string) => Promise<void>
  /** Callbacks for cost item CRUD */
  onAddCost: (input: CostItemInput) => Promise<void>
  onUpdateCost: (id: string, input: CostItemInput) => Promise<void>
  onDeleteCost: (id: string) => Promise<void>
  /** Additional CSS classes */
  className?: string
}

/** Shared shape for items displayed in the panel */
interface DisplayItem {
  id: string
  name: string
  amount: number
  period: string
  category: string
}

// ============================================================
// Constants
// ============================================================

const REVENUE_CATEGORIES: { value: RevenueCategory; label: string }[] = [
  { value: 'service', label: 'Service' },
  { value: 'product', label: 'Product' },
  { value: 'subscription', label: 'Subscription' },
  { value: 'marketplace', label: 'Marketplace' },
  { value: 'other', label: 'Other' },
]

const COST_CATEGORIES: { value: CostCategory; label: string }[] = [
  { value: 'personnel', label: 'Personnel' },
  { value: 'infrastructure', label: 'Infra' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'operations', label: 'Operations' },
  { value: 'other', label: 'Other' },
]

const COST_SECTIONS: { type: CostType; label: string; icon: typeof Receipt }[] = [
  { type: 'direct', label: 'Direct Costs', icon: Receipt },
  { type: 'indirect', label: 'Shared Costs', icon: Share2 },
  { type: 'overhead', label: 'Overhead', icon: Landmark },
]

// ============================================================
// Formatting
// ============================================================

/**
 * Format a monthly amount for compact display.
 *
 * @param value - Monthly amount
 * @returns Formatted string like "£12k"
 */
function fmtAmount(value: number): string {
  if (value >= 1_000_000) return `£${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `£${(value / 1_000).toFixed(0)}k`
  return `£${value.toFixed(0)}`
}

// ============================================================
// Sub-components
// ============================================================

/**
 * Inline add form for a new revenue stream or cost item.
 */
function InlineAddForm({
  type,
  onAdd,
  onCancel,
}: {
  type: 'revenue' | CostType
  onAdd: (name: string, category: string, amount: number) => void
  onCancel: () => void
}): React.ReactElement {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(
    type === 'revenue' ? 'service' : 'operations'
  )

  const categories = type === 'revenue' ? REVENUE_CATEGORIES : COST_CATEGORIES

  const handleSubmit = (): void => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast.error('Please enter a name')
      return
    }
    const parsedAmount = parseFloat(amount)
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      toast.error('Please enter a valid amount')
      return
    }
    onAdd(trimmedName, category, parsedAmount)
    setName('')
    setAmount('')
  }

  return (
    <div className="space-y-2 pt-2 pb-1 border-t border-dashed">
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="flex-1 h-8 text-sm"
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        />
        <div className="relative w-24">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">£</span>
          <Input
            type="number"
            min={0}
            step={100}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="h-8 text-sm pl-5 w-full"
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
        </div>
      </div>
      <div className="flex gap-2 items-center">
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-7 text-xs flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="default" className="h-7 text-xs px-3" onClick={handleSubmit}>
          Add
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

/**
 * A single item row with inline editing support.
 *
 * @description Displays name + amount in read mode. Pencil icon (on hover)
 * switches to edit mode with name/amount inputs. Save commits changes,
 * cancel reverts. Delete icon removes the item.
 */
function ItemRow({
  name,
  amount,
  period,
  onUpdate,
  onDelete,
}: {
  name: string
  amount: number
  period: string
  onUpdate: (newName: string, newAmount: number) => void
  onDelete: () => void
}): React.ReactElement {
  const monthly = normaliseToMonthly(amount, period as 'monthly' | 'quarterly' | 'annual')

  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(name)
  const [editAmount, setEditAmount] = useState(String(amount))
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Focus the name input when entering edit mode
  useEffect(() => {
    if (isEditing && nameInputRef.current) {
      nameInputRef.current.focus()
      nameInputRef.current.select()
    }
  }, [isEditing])

  const handleStartEdit = (): void => {
    setEditName(name)
    setEditAmount(String(amount))
    setIsEditing(true)
  }

  const handleSave = (): void => {
    const trimmedName = editName.trim()
    if (!trimmedName) {
      toast.error('Name cannot be empty')
      return
    }
    const parsedAmount = parseFloat(editAmount)
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      toast.error('Please enter a valid amount')
      return
    }
    onUpdate(trimmedName, parsedAmount)
    setIsEditing(false)
  }

  const handleCancel = (): void => {
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') handleCancel()
  }

  // ---- Edit mode ----
  if (isEditing) {
    return (
      <div className="flex items-center gap-1.5 py-1 px-1">
        <Input
          ref={nameInputRef}
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 h-7 text-sm"
        />
        <div className="relative w-20">
          <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">£</span>
          <Input
            type="number"
            min={0}
            step={100}
            value={editAmount}
            onChange={(e) => setEditAmount(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-7 text-sm pl-4 w-full"
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={handleSave}
          aria-label="Save"
        >
          <Check className="h-3.5 w-3.5 text-status-success" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={handleCancel}
          aria-label="Cancel"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </div>
    )
  }

  // ---- Read mode ----
  return (
    <div className="group flex items-center justify-between py-1.5 px-1 rounded hover:bg-muted/50 transition-colors">
      <span className="text-sm text-foreground truncate flex-1 min-w-0">
        {name}
      </span>
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-sm font-medium tabular-nums text-foreground">
          {fmtAmount(monthly)}
        </span>
        <span className="text-xs text-muted-foreground">/mo</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={handleStartEdit}
          aria-label={`Edit ${name}`}
        >
          <Pencil className="h-3 w-3 text-muted-foreground" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={onDelete}
          aria-label={`Delete ${name}`}
        >
          <Trash2 className="h-3 w-3 text-destructive" />
        </Button>
      </div>
    </div>
  )
}

/**
 * Collapsible section for a group of items (e.g., Direct Costs).
 */
function ItemSection({
  label,
  icon: Icon,
  items,
  total,
  isExpanded,
  onToggle,
  onUpdate,
  onDelete,
  addForm,
}: {
  label: string
  icon: typeof Receipt
  items: DisplayItem[]
  total: number
  isExpanded: boolean
  onToggle: () => void
  onUpdate: (id: string, name: string, amount: number) => void
  onDelete: (id: string) => void
  addForm: React.ReactNode | null
}): React.ReactElement {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center justify-between w-full py-2 group"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">{label}</span>
          <span className="text-xs text-muted-foreground ml-1">({items.length})</span>
        </div>
        <span className="text-sm font-medium tabular-nums text-destructive">
          {fmtAmount(total)}
        </span>
      </button>

      {isExpanded && (
        <div className="ml-6 space-y-0.5">
          {items.length === 0 && !addForm && (
            <p className="text-xs text-muted-foreground italic py-1">No items yet</p>
          )}
          {items.map((item) => (
            <ItemRow
              key={item.id}
              name={item.name}
              amount={item.amount}
              period={item.period}
              onUpdate={(newName, newAmount) => onUpdate(item.id, newName, newAmount)}
              onDelete={() => onDelete(item.id)}
            />
          ))}
          {addForm}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Main Component
// ============================================================

export function MoneyMapInputPanel({
  data,
  isDemo,
  onAddRevenue,
  onUpdateRevenue,
  onDeleteRevenue,
  onAddCost,
  onUpdateCost,
  onDeleteCost,
  className,
}: MoneyMapInputPanelProps): React.ReactElement {
  // Which section's inline add form is open
  const [addingTo, setAddingTo] = useState<'revenue' | CostType | null>(null)
  // Which cost sections are expanded
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    revenue: true,
    direct: true,
    indirect: true,
    overhead: true,
  })

  const toggleSection = useCallback((key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  // ---- Revenue streams ----
  const revenueItems: DisplayItem[] = data.revenue_streams.map((rs) => ({
    id: rs.id,
    name: rs.name,
    amount: rs.amount,
    period: rs.period,
    category: rs.category,
  }))

  const totalRevenue = data.revenue_streams.reduce(
    (sum, rs) => sum + normaliseToMonthly(rs.amount, rs.period),
    0
  )

  /**
   * Handle adding a new revenue stream.
   * Works in both demo and real mode — creates a real DB record.
   */
  const handleAddRevenue = async (name: string, category: string, amount: number): Promise<void> => {
    try {
      await onAddRevenue({
        name,
        category: category as RevenueCategory,
        amount,
        period: 'monthly',
      })
      setAddingTo(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add'
      toast.error(message)
    }
  }

  /**
   * Handle updating or "saving" a revenue stream.
   * In demo mode, the item doesn't exist in the DB so we create it instead.
   * In real mode, we update the existing record.
   */
  const handleUpdateRevenue = async (id: string, newName: string, newAmount: number): Promise<void> => {
    // Find the original item to preserve its category
    const original = data.revenue_streams.find((rs) => rs.id === id)
    const category = (original?.category ?? 'service') as RevenueCategory

    try {
      if (isDemo) {
        // Demo items don't exist in DB — create as a new real record
        await onAddRevenue({
          name: newName,
          category,
          amount: newAmount,
          period: 'monthly',
        })
      } else {
        await onUpdateRevenue(id, {
          name: newName,
          category,
          amount: newAmount,
          period: original?.period ?? 'monthly',
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update'
      toast.error(message)
    }
  }

  const handleDeleteRevenue = async (id: string): Promise<void> => {
    // In demo mode, deleting sample items is a no-op (they don't exist in DB)
    if (isDemo) {
      toast.info('Add your own items to replace the sample data')
      return
    }
    try {
      await onDeleteRevenue(id)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete'
      toast.error(message)
    }
  }

  // ---- Cost items grouped by type ----
  const costsByType = (type: CostType): DisplayItem[] =>
    data.cost_items
      .filter((ci) => ci.cost_type === type)
      .map((ci) => ({
        id: ci.id,
        name: ci.name,
        amount: ci.amount,
        period: ci.period,
        category: ci.category,
      }))

  const costTotal = (type: CostType): number =>
    data.cost_items
      .filter((ci) => ci.cost_type === type)
      .reduce((sum, ci) => sum + normaliseToMonthly(ci.amount, ci.period), 0)

  /**
   * Handle adding a new cost item.
   */
  const handleAddCost = async (
    costType: CostType,
    name: string,
    category: string,
    amount: number
  ): Promise<void> => {
    try {
      await onAddCost({
        name,
        category: category as CostCategory,
        amount,
        cost_type: costType,
        period: 'monthly',
      })
      setAddingTo(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add'
      toast.error(message)
    }
  }

  /**
   * Handle updating or "saving" a cost item.
   * In demo mode, creates a new real record. In real mode, updates existing.
   */
  const handleUpdateCost = async (
    costType: CostType,
    id: string,
    newName: string,
    newAmount: number
  ): Promise<void> => {
    const original = data.cost_items.find((ci) => ci.id === id)
    const category = (original?.category ?? 'operations') as CostCategory

    try {
      if (isDemo) {
        await onAddCost({
          name: newName,
          category,
          amount: newAmount,
          cost_type: costType,
          period: 'monthly',
        })
      } else {
        await onUpdateCost(id, {
          name: newName,
          category,
          amount: newAmount,
          cost_type: original?.cost_type ?? costType,
          period: original?.period ?? 'monthly',
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update'
      toast.error(message)
    }
  }

  const handleDeleteCost = async (id: string): Promise<void> => {
    if (isDemo) {
      toast.info('Add your own items to replace the sample data')
      return
    }
    try {
      await onDeleteCost(id)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete'
      toast.error(message)
    }
  }

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-international-orange/10">
            <DollarSign className="h-4 w-4 text-international-orange" />
          </div>
          Your Numbers
        </CardTitle>
        {isDemo && (
          <p className="text-xs text-muted-foreground mt-1">
            Edit any value or add your own to replace the sample data.
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        {/* ---- Revenue Streams ---- */}
        <div>
          <button
            type="button"
            onClick={() => toggleSection('revenue')}
            className="flex items-center justify-between w-full py-2 group"
          >
            <div className="flex items-center gap-2">
              {expanded.revenue ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <TrendingUp className="h-3.5 w-3.5 text-status-success" />
              <span className="text-sm font-medium text-foreground">Revenue Streams</span>
              <span className="text-xs text-muted-foreground ml-1">({revenueItems.length})</span>
            </div>
            <span className="text-sm font-medium tabular-nums text-status-success">
              {fmtAmount(totalRevenue)}
            </span>
          </button>

          {expanded.revenue && (
            <div className="ml-6 space-y-0.5">
              {revenueItems.length === 0 && addingTo !== 'revenue' && (
                <p className="text-xs text-muted-foreground italic py-1">No revenue streams yet</p>
              )}
              {revenueItems.map((item) => (
                <ItemRow
                  key={item.id}
                  name={item.name}
                  amount={item.amount}
                  period={item.period}
                  onUpdate={(newName, newAmount) => handleUpdateRevenue(item.id, newName, newAmount)}
                  onDelete={() => handleDeleteRevenue(item.id)}
                />
              ))}
              {addingTo === 'revenue' ? (
                <InlineAddForm
                  type="revenue"
                  onAdd={(name, cat, amt) => handleAddRevenue(name, cat, amt)}
                  onCancel={() => setAddingTo(null)}
                />
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground mt-1"
                  onClick={() => setAddingTo('revenue')}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Stream
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="border-t" />

        {/* ---- Cost Sections ---- */}
        {COST_SECTIONS.map((section) => {
          const items = costsByType(section.type)
          const total = costTotal(section.type)

          return (
            <ItemSection
              key={section.type}
              label={section.label}
              icon={section.icon}
              items={items}
              total={total}
              isExpanded={expanded[section.type] ?? true}
              onToggle={() => toggleSection(section.type)}
              onUpdate={(id, newName, newAmount) =>
                handleUpdateCost(section.type, id, newName, newAmount)
              }
              onDelete={handleDeleteCost}
              addForm={
                addingTo === section.type ? (
                  <InlineAddForm
                    type={section.type}
                    onAdd={(name, cat, amt) => handleAddCost(section.type, name, cat, amt)}
                    onCancel={() => setAddingTo(null)}
                  />
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground mt-1"
                    onClick={() => setAddingTo(section.type)}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add {section.label.replace(' Costs', '')}
                  </Button>
                )
              }
            />
          )
        })}

        {/* ---- Summary ---- */}
        <div className="border-t pt-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total Revenue</span>
            <span className="text-sm font-semibold tabular-nums text-status-success">
              {fmtAmount(totalRevenue)}/mo
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total Costs</span>
            <span className="text-sm font-semibold tabular-nums text-destructive">
              {fmtAmount(data.summary.total_costs)}/mo
            </span>
          </div>
          <div className="flex items-center justify-between pt-1 border-t">
            <span className="text-sm font-semibold text-foreground">Net Margin</span>
            <span className={cn(
              'text-sm font-bold tabular-nums',
              data.summary.net_margin >= 0 ? 'text-status-success' : 'text-destructive'
            )}>
              {fmtAmount(Math.abs(data.summary.net_margin))}/mo
              <span className="text-xs font-normal text-muted-foreground ml-1">
                ({data.summary.net_margin_pct.toFixed(1)}%)
              </span>
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
