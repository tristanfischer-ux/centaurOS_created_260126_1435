'use client'

/**
 * RevenueStreamDialog — Dialog for adding or editing a single revenue stream.
 *
 * @component
 * @example
 * <RevenueStreamDialog open={isOpen} onOpenChange={setOpen} onSave={handleSave} />
 * <RevenueStreamDialog open={isOpen} onOpenChange={setOpen} onSave={handleSave} initial={existingStream} />
 */

import { useState, useEffect } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle, Loader2 } from 'lucide-react'

import type { RevenueStreamInput, RevenueCategory, Period, RevenueStream } from '@/types/money-map'
import { REVENUE_CATEGORY_LABELS, PERIOD_LABELS } from '@/types/money-map'

interface RevenueStreamDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (input: RevenueStreamInput) => Promise<void>
  /** Pre-fill with existing data for edit mode */
  initial?: RevenueStream | null
}

export function RevenueStreamDialog({
  open,
  onOpenChange,
  onSave,
  initial,
}: RevenueStreamDialogProps): React.ReactElement {
  const isEditing = !!initial

  const [name, setName] = useState('')
  const [category, setCategory] = useState<RevenueCategory>('other')
  const [amount, setAmount] = useState('')
  const [period, setPeriod] = useState<Period>('monthly')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (open && initial) {
      setName(initial.name)
      setCategory(initial.category)
      setAmount(String(initial.amount))
      setPeriod(initial.period)
      setDescription(initial.description ?? '')
    } else if (open) {
      setName('')
      setCategory('other')
      setAmount('')
      setPeriod('monthly')
      setDescription('')
    }
    setError(null)
  }, [open, initial])

  const handleSubmit = async (): Promise<void> => {
    setError(null)

    if (!name.trim()) {
      setError('Name is required')
      return
    }

    const parsedAmount = parseFloat(amount)
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      setError('Please enter a valid amount')
      return
    }

    setIsSaving(true)
    try {
      await onSave({
        name: name.trim(),
        category,
        amount: parsedAmount,
        period,
        description: description.trim() || undefined,
      })
      onOpenChange(false)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to save'
      setError(message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Revenue Stream' : 'Add Revenue Stream'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="rs-name">
              Name <span className="text-destructive" aria-label="required">*</span>
            </Label>
            <Input
              id="rs-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Product Sales, Consulting, Marketplace Fees"
              aria-required
              aria-invalid={!!error && !name.trim()}
              maxLength={200}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="rs-category">Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as RevenueCategory)}>
                <SelectTrigger id="rs-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(REVENUE_CATEGORY_LABELS) as [RevenueCategory, string][]).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rs-period">Period</Label>
              <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
                <SelectTrigger id="rs-period">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(PERIOD_LABELS) as [Period, string][]).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rs-amount">
              Amount (GBP) <span className="text-destructive" aria-label="required">*</span>
            </Label>
            <Input
              id="rs-amount"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              aria-required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rs-description">Description</Label>
            <Textarea
              id="rs-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes about this revenue stream"
              maxLength={500}
              rows={2}
            />
            <p className="text-xs text-muted-foreground">{description.length} / 500 characters</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="animate-spin mr-2 h-4 w-4" />
                Saving...
              </>
            ) : (
              isEditing ? 'Update' : 'Add'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
