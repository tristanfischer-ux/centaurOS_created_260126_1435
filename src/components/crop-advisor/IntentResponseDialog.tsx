"use client"

import { useState } from "react"
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
import { respondToIntent, type BuyerIntent } from "@/actions/crop-advisor"

interface IntentResponseDialogProps {
  intent: BuyerIntent
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmitted?: () => void
}

/**
 * Modal for a grower to respond to a buyer's demand signal with an offer.
 */
export function IntentResponseDialog({
  intent,
  open,
  onOpenChange,
  onSubmitted,
}: IntentResponseDialogProps) {
  const [price, setPrice] = useState(
    intent.target_price_per_kg ? String(intent.target_price_per_kg) : ""
  )
  const [quantity, setQuantity] = useState(String(intent.weekly_quantity_kg))
  const [availableFrom, setAvailableFrom] = useState(intent.desired_start_date)
  const [message, setMessage] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    const result = await respondToIntent({
      intentId: intent.id,
      offeredPricePerKg: parseFloat(price),
      offeredQuantityKg: parseFloat(quantity),
      availableFrom,
      message: message || undefined,
    })

    setIsSubmitting(false)

    if (result.error) {
      setError(result.error)
      return
    }

    onSubmitted?.()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Respond to Demand Signal</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            <p className="font-medium text-foreground">
              {intent.product_name}
            </p>
            <p className="text-muted-foreground">
              {intent.weekly_quantity_kg} kg/week ·{" "}
              {intent.target_price_per_kg
                ? `Target: £${Number(intent.target_price_per_kg).toFixed(2)}/kg`
                : "No target price"}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="resp-price">Offered Price (£/kg)</Label>
              <Input
                id="resp-price"
                type="number"
                step="0.01"
                min="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="e.g. 12.50"
                required
                aria-required="true"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="resp-qty">Offered Quantity (kg/wk)</Label>
              <Input
                id="resp-qty"
                type="number"
                step="0.1"
                min="0.1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
                aria-required="true"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="resp-date">Available From</Label>
            <Input
              id="resp-date"
              type="date"
              value={availableFrom}
              onChange={(e) => setAvailableFrom(e.target.value)}
              required
              aria-required="true"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="resp-message">Message (optional)</Label>
            <Textarea
              id="resp-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add any details about your growing method, quality, or delivery..."
              maxLength={2000}
              rows={3}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Submit Offer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
