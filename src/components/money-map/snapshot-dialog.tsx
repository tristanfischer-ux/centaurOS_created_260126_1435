'use client'

/**
 * SnapshotDialog — Dialog for creating a point-in-time snapshot and
 * viewing historical snapshots.
 *
 * @component
 * @example
 * <SnapshotDialog open={isOpen} onOpenChange={setOpen} onSave={handleSave} snapshots={snapshots} />
 */

import { useState } from 'react'
import { format } from 'date-fns'
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
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AlertCircle, Camera, Loader2, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

import type { MoneyMapSnapshot } from '@/types/money-map'

interface SnapshotDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (name: string, periodLabel: string) => Promise<void>
  onSelect?: (snapshot: MoneyMapSnapshot) => void
  snapshots: MoneyMapSnapshot[]
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(value)
}

export function SnapshotDialog({
  open,
  onOpenChange,
  onSave,
  onSelect,
  snapshots,
}: SnapshotDialogProps): React.ReactElement {
  const [name, setName] = useState('')
  const [periodLabel, setPeriodLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async (): Promise<void> => {
    setError(null)
    if (!name.trim()) {
      setError('Snapshot name is required')
      return
    }
    if (!periodLabel.trim()) {
      setError('Period label is required')
      return
    }

    setIsSaving(true)
    try {
      await onSave(name.trim(), periodLabel.trim())
      setName('')
      setPeriodLabel('')
      onOpenChange(false)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to save snapshot'
      setError(message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Money Map Snapshots</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue={snapshots.length > 0 ? 'history' : 'create'}>
          <TabsList className="w-full">
            <TabsTrigger value="create" className="flex-1">Create Snapshot</TabsTrigger>
            <TabsTrigger value="history" className="flex-1">History ({snapshots.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="create" className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">
              Capture the current state of your Money Map for historical comparison.
            </p>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="snap-name">
                Snapshot Name <span className="text-destructive" aria-label="required">*</span>
              </Label>
              <Input
                id="snap-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder='e.g., "Q1 2026 Review"'
                aria-required
                maxLength={200}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="snap-period">
                Period Label <span className="text-destructive" aria-label="required">*</span>
              </Label>
              <Input
                id="snap-period"
                value={periodLabel}
                onChange={(e) => setPeriodLabel(e.target.value)}
                placeholder='e.g., "Q1 2026"'
                aria-required
                maxLength={100}
              />
            </div>

            <DialogFooter>
              <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="animate-spin h-4 w-4 mr-2" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Camera className="h-4 w-4 mr-2" />
                    Capture Snapshot
                  </>
                )}
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            {snapshots.length === 0 ? (
              <div className="py-8 text-center">
                <Clock className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">No snapshots yet.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Create your first snapshot to start tracking changes over time.
                </p>
              </div>
            ) : (
              <ScrollArea className="max-h-[300px]">
                <div className="space-y-2">
                  {snapshots.map((snap) => (
                    <button
                      key={snap.id}
                      className="w-full text-left p-3 rounded-lg border hover:bg-muted/30 transition-colors"
                      onClick={() => onSelect?.(snap)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-foreground">{snap.name}</p>
                          <p className="text-xs text-muted-foreground">{snap.period_label}</p>
                        </div>
                        <div className="text-right">
                          <p className={cn(
                            'text-sm font-medium',
                            snap.net_margin_pct >= 0 ? 'text-status-success' : 'text-destructive'
                          )}>
                            {snap.net_margin_pct.toFixed(1)}% margin
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(snap.created_at), 'dd MMM yyyy')}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                        <span>Revenue: {formatCurrency(snap.total_revenue)}</span>
                        <span>Costs: {formatCurrency(snap.total_costs)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
