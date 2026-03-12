"use client"

import { useState, useEffect } from "react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createBuyerIntent } from "@/actions/crop-advisor"
import { createClient } from "@/lib/supabase/client"

interface CreateIntentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: () => void
}

interface Product {
  id: string
  name: string
  category: string
}

/**
 * Form dialog for buyers to post a new demand signal.
 */
export function CreateIntentDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateIntentDialogProps) {
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProductId, setSelectedProductId] = useState("")
  const [quantity, setQuantity] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [targetPrice, setTargetPrice] = useState("")
  const [maxPrice, setMaxPrice] = useState("")
  const [qualityGrade, setQualityGrade] = useState("B")
  const [notes, setNotes] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const loadProducts = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from("products")
        .select("id, name, category")
        .order("name")
      setProducts(data || [])
    }
    loadProducts()
  }, [open])

  const selectedProduct = products.find((p) => p.id === selectedProductId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedProduct) return

    setIsSubmitting(true)
    setError(null)

    const result = await createBuyerIntent({
      productId: selectedProductId,
      category: selectedProduct.category,
      qualityGrade,
      weeklyQuantityKg: parseFloat(quantity),
      desiredStartDate: startDate,
      desiredEndDate: endDate || undefined,
      targetPricePerKg: targetPrice ? parseFloat(targetPrice) : undefined,
      maxPricePerKg: maxPrice ? parseFloat(maxPrice) : undefined,
      notes: notes || undefined,
    })

    setIsSubmitting(false)

    if (result.error) {
      setError(result.error)
      return
    }

    // Reset form
    setSelectedProductId("")
    setQuantity("")
    setStartDate("")
    setEndDate("")
    setTargetPrice("")
    setMaxPrice("")
    setQualityGrade("B")
    setNotes("")
    onOpenChange(false)
    onCreated?.()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Post Demand Signal</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="intent-product">Product</Label>
            <Select value={selectedProductId} onValueChange={setSelectedProductId}>
              <SelectTrigger id="intent-product">
                <SelectValue placeholder="Select a product..." />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.category})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="intent-qty">Weekly Quantity (kg)</Label>
              <Input
                id="intent-qty"
                type="number"
                step="0.1"
                min="0.1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="e.g. 50"
                required
                aria-required="true"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="intent-grade">Quality Grade</Label>
              <Select value={qualityGrade} onValueChange={setQualityGrade}>
                <SelectTrigger id="intent-grade">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">Grade A</SelectItem>
                  <SelectItem value="B">Grade B</SelectItem>
                  <SelectItem value="C">Grade C</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="intent-start">Start Date</Label>
              <Input
                id="intent-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                aria-required="true"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="intent-end">End Date (optional)</Label>
              <Input
                id="intent-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="intent-target">Target Price (£/kg)</Label>
              <Input
                id="intent-target"
                type="number"
                step="0.01"
                min="0"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                placeholder="Ideal price"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="intent-max">Max Price (£/kg)</Label>
              <Input
                id="intent-max"
                type="number"
                step="0.01"
                min="0"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder="Hard ceiling"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="intent-notes">Notes (optional)</Label>
            <Textarea
              id="intent-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any specific requirements, delivery preferences, etc."
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
            <Button type="submit" disabled={isSubmitting || !selectedProductId}>
              {isSubmitting ? "Posting..." : "Post Signal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
