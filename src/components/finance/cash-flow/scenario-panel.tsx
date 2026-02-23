/**
 * @file scenario-panel.tsx — "What if" scenario adjustment panel
 *
 * @description Allows users to model cash flow scenarios by adding/removing
 * clients, hires, or price changes. Adjustments are client-side only.
 */

'use client'

import { useState } from 'react'
import { Plus, Minus, UserPlus, UserMinus, PoundSterling } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ScenarioAdjustment } from '@/lib/finance/forecast'

interface ScenarioPanelProps {
  onAdjustmentsChange: (adjustments: ScenarioAdjustment[]) => void
  className?: string
}

type AdjustmentType = ScenarioAdjustment['type']

const ADJUSTMENT_LABELS: Record<AdjustmentType, { label: string; icon: typeof Plus; description: string }> = {
  add_client: { label: 'Add client', icon: UserPlus, description: 'New recurring revenue' },
  lose_client: { label: 'Lose client', icon: UserMinus, description: 'Lost recurring revenue' },
  add_hire: { label: 'New hire', icon: Plus, description: 'Additional monthly cost' },
  price_change: { label: 'Price change', icon: PoundSterling, description: 'Adjust pricing' },
}

interface ScenarioRow {
  id: string
  type: AdjustmentType
  amount: number // in pounds (user input)
}

export function ScenarioPanel({ onAdjustmentsChange, className }: ScenarioPanelProps) {
  const [rows, setRows] = useState<ScenarioRow[]>([])

  const addRow = () => {
    const newRow: ScenarioRow = {
      id: crypto.randomUUID(),
      type: 'add_client',
      amount: 0,
    }
    setRows(prev => [...prev, newRow])
  }

  const removeRow = (id: string) => {
    const updated = rows.filter(r => r.id !== id)
    setRows(updated)
    emitAdjustments(updated)
  }

  const updateRow = (id: string, field: 'type' | 'amount', value: string | number) => {
    const updated = rows.map(r => {
      if (r.id !== id) return r
      if (field === 'type') return { ...r, type: value as AdjustmentType }
      return { ...r, amount: Number(value) || 0 }
    })
    setRows(updated)
    emitAdjustments(updated)
  }

  const emitAdjustments = (currentRows: ScenarioRow[]) => {
    const adjustments: ScenarioAdjustment[] = currentRows
      .filter(r => r.amount > 0)
      .map(r => ({
        type: r.type,
        amount: Math.round(r.amount * 100), // convert pounds to pence
      }))
    onAdjustmentsChange(adjustments)
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base font-semibold">What If?</CardTitle>
        <CardDescription>Model scenarios to see how changes affect your forecast.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map((row) => {
          const config = ADJUSTMENT_LABELS[row.type]
          return (
            <div key={row.id} className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">{config.description}</Label>
                <Select
                  value={row.type}
                  onValueChange={(val) => updateRow(row.id, 'type', val)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ADJUSTMENT_LABELS) as AdjustmentType[]).map((type) => (
                      <SelectItem key={type} value={type}>
                        {ADJUSTMENT_LABELS[type].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-28 space-y-1">
                <Label className="text-xs">£/month</Label>
                <Input
                  type="number"
                  min={0}
                  placeholder="0"
                  value={row.amount || ''}
                  onChange={(e) => updateRow(row.id, 'amount', e.target.value)}
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeRow(row.id)}
              >
                <Minus className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          )
        })}

        <Button variant="outline" size="sm" onClick={addRow} className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          Add scenario
        </Button>

        {rows.length === 0 && (
          <p className="text-xs text-muted-foreground text-center">
            Add scenarios to see how they affect your cash flow projection.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
