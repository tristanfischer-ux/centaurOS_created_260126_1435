'use client'

import { useState, useEffect } from 'react'
import { Pencil, Trash2, Plus } from 'lucide-react'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { FrequencyBadge } from '@/components/cash-burn/frequency-badge'
import { formatCurrency } from '@/types/payments'
import type { Frequency } from '@/types/cash-burn'

// ============================================================
// Types
// ============================================================

interface ItemRow {
  id: string
  name: string
  category?: string
  sourceType?: string
  weeklyAmount: number
  frequency: Frequency
  amount: number
  probabilityPct?: number
}

interface ItemsSectionProps {
  title: string
  items: ItemRow[]
  weeklySubtotal: number
  onAdd: () => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  emptyMessage: string
}

// ============================================================
// Component
// ============================================================

export function ItemsSection({
  title,
  items,
  weeklySubtotal,
  onAdd,
  onEdit,
  onDelete,
  emptyMessage,
}: ItemsSectionProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Auto-dismiss confirm state after 3 seconds
  useEffect(() => {
    if (!confirmDeleteId) return
    const timer = setTimeout(() => setConfirmDeleteId(null), 3000)
    return () => clearTimeout(timer)
  }, [confirmDeleteId])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground">
            Weekly subtotal: <span className="font-medium text-foreground">{formatCurrency(weeklySubtotal)}</span>
          </p>
        </div>
        <Button size="sm" onClick={onAdd}>
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </CardHeader>

      <CardContent>
        {items.length === 0 ? (
          <div className="flex items-center justify-center gap-3 py-4 text-sm text-muted-foreground">
            <span>{emptyMessage}</span>
            <Button variant="secondary" size="sm" onClick={onAdd}>
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
        ) : (
          <div className="space-y-1">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between py-2.5 px-2 rounded-md hover:bg-muted/50 transition-colors"
              >
                {/* Left: name + badges */}
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium text-foreground truncate">
                    {item.name}
                  </span>
                  {item.category && (
                    <Badge variant="secondary" size="sm">
                      {item.category}
                    </Badge>
                  )}
                  {item.sourceType && (
                    <Badge variant="info" size="sm">
                      {item.sourceType}
                    </Badge>
                  )}
                  <FrequencyBadge frequency={item.frequency} />
                  {item.probabilityPct != null && item.probabilityPct < 100 && (
                    <Badge variant="warning" size="sm">
                      {item.probabilityPct}%
                    </Badge>
                  )}
                </div>

                {/* Right: amount + actions */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-sm font-medium text-foreground tabular-nums">
                    {formatCurrency(item.weeklyAmount)}
                    <span className="text-muted-foreground font-normal">/wk</span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(item.id)}
                    aria-label={`Edit ${item.name}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {confirmDeleteId === item.id ? (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        onDelete(item.id)
                        setConfirmDeleteId(null)
                      }}
                      aria-label={`Confirm delete ${item.name}`}
                    >
                      Confirm
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setConfirmDeleteId(item.id)}
                      aria-label={`Delete ${item.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
