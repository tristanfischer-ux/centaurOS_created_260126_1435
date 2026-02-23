/**
 * @file quick-invoice-form.tsx — Multi-step invoice creation wizard
 *
 * @description Wizard for creating standalone invoices with line items,
 * VAT calculation, and optional payment link generation.
 */

'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Send, Link } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createStandaloneInvoice } from '@/actions/finance-invoices'
import type { InvoiceLineItem, RecurrenceInterval } from '@/types/finance'

const DEFAULT_VAT_RATE = 0.20

interface QuickInvoiceFormProps {
  className?: string
}

function emptyLineItem(): InvoiceLineItem {
  return { description: '', quantity: 1, unitPrice: 0, amount: 0 }
}

export function QuickInvoiceForm({ className }: QuickInvoiceFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [recipientName, setRecipientName] = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 30)
    return d.toISOString().split('T')[0]
  })
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([emptyLineItem()])
  const [notes, setNotes] = useState('')
  const [generateLink, setGenerateLink] = useState(true)
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurrenceInterval, setRecurrenceInterval] = useState<RecurrenceInterval>('monthly')

  // Computed totals
  const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0)
  const vatAmount = Math.round(subtotal * DEFAULT_VAT_RATE)
  const total = subtotal + vatAmount

  const updateLineItem = (index: number, field: keyof InvoiceLineItem, value: string | number) => {
    setLineItems(prev => {
      const updated = [...prev]
      const item = { ...updated[index] }

      if (field === 'description') {
        item.description = value as string
      } else if (field === 'quantity') {
        item.quantity = Math.max(1, Number(value) || 1)
        item.amount = item.quantity * item.unitPrice
      } else if (field === 'unitPrice') {
        item.unitPrice = Math.round((Number(value) || 0) * 100) // convert pounds to pence
        item.amount = item.quantity * item.unitPrice
      }

      updated[index] = item
      return updated
    })
  }

  const addLineItem = () => setLineItems(prev => [...prev, emptyLineItem()])

  const removeLineItem = (index: number) => {
    if (lineItems.length <= 1) return
    setLineItems(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = () => {
    setError(null)

    if (!recipientName.trim()) { setError('Recipient name is required'); return }
    if (!recipientEmail.trim()) { setError('Recipient email is required'); return }
    if (!dueDate) { setError('Due date is required'); return }
    if (lineItems.some(item => !item.description.trim())) { setError('All line items need a description'); return }
    if (subtotal <= 0) { setError('Invoice total must be greater than zero'); return }

    startTransition(async () => {
      const result = await createStandaloneInvoice({
        recipientName: recipientName.trim(),
        recipientEmail: recipientEmail.trim(),
        lineItems,
        dueDate,
        notes: notes.trim() || undefined,
        generatePaymentLink: generateLink,
        isRecurring,
        recurrenceInterval: isRecurring ? recurrenceInterval : undefined,
      })

      if (result.error) {
        setError(result.error)
      } else if (result.data) {
        router.push(`/finance/invoices/${result.data.id}`)
      }
    })
  }

  return (
    <div className={className}>
      {/* Recipient */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Recipient</CardTitle>
          <CardDescription>Who is this invoice for?</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="recipient-name">Name</Label>
              <Input
                id="recipient-name"
                placeholder="Acme Ltd"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recipient-email">Email</Label>
              <Input
                id="recipient-email"
                type="email"
                placeholder="accounts@acme.co.uk"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="due-date">Due date</Label>
            <Input
              id="due-date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Line Items */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Line Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {lineItems.map((item, index) => (
            <div key={index} className="flex items-start gap-3">
              <div className="flex-1 space-y-2">
                <Input
                  placeholder="Description"
                  value={item.description}
                  onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                />
              </div>
              <div className="w-20 space-y-2">
                <Input
                  type="number"
                  min={1}
                  placeholder="Qty"
                  value={item.quantity}
                  onChange={(e) => updateLineItem(index, 'quantity', e.target.value)}
                />
              </div>
              <div className="w-28 space-y-2">
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="Price (£)"
                  value={item.unitPrice ? (item.unitPrice / 100).toFixed(2) : ''}
                  onChange={(e) => updateLineItem(index, 'unitPrice', e.target.value)}
                />
              </div>
              <div className="w-24 pt-2 text-sm text-right text-muted-foreground">
                £{(item.amount / 100).toFixed(2)}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="mt-0.5"
                onClick={() => removeLineItem(index)}
                disabled={lineItems.length <= 1}
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addLineItem}>
            <Plus className="h-4 w-4 mr-2" />
            Add line item
          </Button>

          {/* Totals */}
          <div className="border-t border-border pt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>£{(subtotal / 100).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">VAT (20%)</span>
              <span>£{(vatAmount / 100).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <span>Total</span>
              <span>£{(total / 100).toFixed(2)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Payment terms, bank details, or additional notes..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </CardContent>
      </Card>

      {/* Options */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Options</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Generate payment link</Label>
              <p className="text-xs text-muted-foreground">Create a shareable link so the recipient can pay online.</p>
            </div>
            <Switch checked={generateLink} onCheckedChange={setGenerateLink} />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Recurring invoice</Label>
              <p className="text-xs text-muted-foreground">Automatically re-generate this invoice on a schedule.</p>
            </div>
            <Switch checked={isRecurring} onCheckedChange={setIsRecurring} />
          </div>
          {isRecurring && (
            <div className="space-y-2 pl-0.5">
              <Label>Frequency</Label>
              <Select
                value={recurrenceInterval}
                onValueChange={(val) => setRecurrenceInterval(val as RecurrenceInterval)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="fortnightly">Fortnightly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="mt-6 flex items-center gap-3">
        <Button
          onClick={handleSubmit}
          disabled={isPending}
          className="bg-international-orange hover:bg-international-orange/90"
        >
          {generateLink ? (
            <>
              <Link className="h-4 w-4 mr-2" />
              {isPending ? 'Creating...' : 'Create Invoice & Link'}
            </>
          ) : (
            <>
              <Send className="h-4 w-4 mr-2" />
              {isPending ? 'Creating...' : 'Create Invoice'}
            </>
          )}
        </Button>
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
      </div>
    </div>
  )
}
