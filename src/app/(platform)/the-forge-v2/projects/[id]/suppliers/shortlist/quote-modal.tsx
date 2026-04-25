/**
 * @file quote-modal.tsx — Modal for logging a received supplier quote.
 *
 * @description Structured fields: price, volume, lead time, valid-until date,
 * terms, received date, and free-text notes. All fields optional except
 * supplierId and projectId — founders can log a partial quote.
 *
 * Uses Dialog (not Sheet) per CLAUDE.md component rules.
 * British spelling. No em dashes. No emojis.
 */

"use client"

import { useState, useTransition } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Loader2 } from "lucide-react"
import { logSupplierQuote } from "@/actions/project-supplier-shortlists"
import type { Database } from "@/types/database.types"

type RawQuoteRow =
  Database["public"]["Tables"]["supplier_quotes"]["Row"]

interface Props {
  projectId: string
  supplierId: string
  supplierName: string
  onClose: () => void
  onQuoteLogged: (row: RawQuoteRow) => void
}

export function QuoteModal({
  projectId,
  supplierId,
  supplierName,
  onClose,
  onQuoteLogged,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Form fields
  const [poundsStr, setPoundsStr] = useState("")
  const [currency, setCurrency] = useState("GBP")
  const [volumeStr, setVolumeStr] = useState("")
  const [leadDaysStr, setLeadDaysStr] = useState("")
  const [validUntil, setValidUntil] = useState("")
  const [receivedAt, setReceivedAt] = useState("")
  const [terms, setTerms] = useState("")
  const [notes, setNotes] = useState("")

  function handleSubmit() {
    setErrorMessage(null)

    const pounds = parseFloat(poundsStr)
    const pence = !isNaN(pounds) && poundsStr.trim() !== "" ? Math.round(pounds * 100) : null
    const volume = volumeStr.trim() ? parseInt(volumeStr, 10) : null
    const leadDays = leadDaysStr.trim() ? parseInt(leadDaysStr, 10) : null

    startTransition(async () => {
      const result = await logSupplierQuote({
        projectId,
        supplierId,
        quoteAmountPence: pence,
        currency,
        volume: !isNaN(volume as number) ? volume : null,
        leadTimeDays: !isNaN(leadDays as number) ? leadDays : null,
        validUntil: validUntil || null,
        receivedAt: receivedAt || null,
        terms: terms.trim() || null,
        notes: notes.trim() || null,
      })

      if (!result.success || !result.row) {
        setErrorMessage(result.error ?? "Could not save the quote. Please try again.")
        return
      }

      // Convert the returned ProjectShortlistRow-style row back to raw shape for the parent
      const r = result.row
      const rawRow: RawQuoteRow = {
        id: r.id,
        project_id: r.projectId,
        supplier_id: r.supplierId,
        quote_amount_pence: r.quoteAmountPence,
        currency: r.currency,
        volume: r.volume,
        lead_time_days: r.leadTimeDays,
        valid_until: r.validUntil,
        terms: r.terms,
        received_at: r.receivedAt,
        notes: r.notes,
        created_at: r.createdAt,
        created_by_user_id: r.createdByUserId,
      }
      onQuoteLogged(rawRow)
    })
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log a quote from {supplierName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <p className="text-xs text-muted-foreground">
            All fields are optional. Log what you have now and add the rest when it arrives.
          </p>

          {/* Price + currency */}
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div className="space-y-1">
              <Label htmlFor="quote-price">Quote value ({currency})</Label>
              <Input
                id="quote-price"
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 12500"
                value={poundsStr}
                onChange={(e) => setPoundsStr(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="quote-currency">Currency</Label>
              <select
                id="quote-currency"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                <option value="GBP">GBP</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>

          {/* Volume */}
          <div className="space-y-1">
            <Label htmlFor="quote-volume">
              Volume (units)
            </Label>
            <Input
              id="quote-volume"
              type="number"
              min="1"
              placeholder="e.g. 500"
              value={volumeStr}
              onChange={(e) => setVolumeStr(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              The minimum order quantity or batch size this price applies to.
            </p>
          </div>

          {/* Lead time */}
          <div className="space-y-1">
            <Label htmlFor="quote-lead">Lead time (days)</Label>
            <Input
              id="quote-lead"
              type="number"
              min="1"
              placeholder="e.g. 21"
              value={leadDaysStr}
              onChange={(e) => setLeadDaysStr(e.target.value)}
            />
          </div>

          {/* Dates row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="quote-received">Date received</Label>
              <Input
                id="quote-received"
                type="date"
                value={receivedAt}
                onChange={(e) => setReceivedAt(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="quote-valid">Valid until</Label>
              <Input
                id="quote-valid"
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </div>
          </div>

          {/* Terms */}
          <div className="space-y-1">
            <Label htmlFor="quote-terms">Payment terms</Label>
            <Input
              id="quote-terms"
              placeholder="e.g. 30 days net, 50% deposit"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
            />
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label htmlFor="quote-notes">Notes</Label>
            <Textarea
              id="quote-notes"
              placeholder="Any caveats, tooling costs not included, revision charges, etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {errorMessage && (
            <p className="text-xs text-destructive" role="alert">
              {errorMessage}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
            Save quote
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
