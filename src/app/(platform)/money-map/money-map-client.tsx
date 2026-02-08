'use client'

/**
 * MoneyMapClient — Main client component for the Money Map page.
 *
 * @description Orchestrates the full Money Map experience: data loading,
 * setup wizard for first-time users, Sankey diagram, summary cards,
 * profitability table, cost breakdown, and snapshot management.
 */

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Plus,
  Camera,
  RefreshCw,
  Loader2,
  DollarSign,
  Receipt,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { typography, spacing } from '@/lib/design-system'

// Money Map components
import { MoneyMapSankey } from '@/components/money-map/sankey-chart'
import { MoneyMapSummaryCards } from '@/components/money-map/summary-cards'
import { ProfitabilityTable } from '@/components/money-map/profitability-table'
import { CostBreakdownChart } from '@/components/money-map/cost-breakdown-chart'
import { MoneyMapSetupWizard } from '@/components/money-map/setup-wizard'
import { RevenueStreamDialog } from '@/components/money-map/revenue-stream-dialog'
import { CostItemDialog } from '@/components/money-map/cost-item-dialog'
import { SnapshotDialog } from '@/components/money-map/snapshot-dialog'

// Actions
import {
  getMoneyMapData,
  getSnapshots,
  createRevenueStream,
  createCostItem,
  updateRevenueStream,
  createSnapshot,
} from '@/actions/money-map'

import type {
  MoneyMapData,
  MoneyMapSnapshot,
  RevenueStreamInput,
  CostItemInput,
  RevenueStream,
} from '@/types/money-map'

export function MoneyMapClient(): React.ReactElement {
  // Data state
  const [data, setData] = useState<MoneyMapData | null>(null)
  const [snapshots, setSnapshots] = useState<MoneyMapSnapshot[]>([])
  const [selectedSnapshot, setSelectedSnapshot] = useState<MoneyMapSnapshot | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Dialog state
  const [isWizardOpen, setIsWizardOpen] = useState(false)
  const [isRevenueDialogOpen, setIsRevenueDialogOpen] = useState(false)
  const [isCostDialogOpen, setIsCostDialogOpen] = useState(false)
  const [isSnapshotDialogOpen, setIsSnapshotDialogOpen] = useState(false)
  const [editingStream, setEditingStream] = useState<RevenueStream | null>(null)

  // -------------------------------------------------------
  // Data loading
  // -------------------------------------------------------

  const loadData = useCallback(async (): Promise<void> => {
    try {
      const [mapResult, snapshotResult] = await Promise.all([
        getMoneyMapData(),
        getSnapshots(),
      ])

      if (mapResult.data) {
        setData(mapResult.data)

        // Show wizard if no revenue streams exist (first-time user)
        if (mapResult.data.revenue_streams.length === 0) {
          setIsWizardOpen(true)
        }
      }

      if (snapshotResult.data) {
        setSnapshots(snapshotResult.data)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load data'
      console.error('[MoneyMap] Load error:', message)
      toast.error('Failed to load Money Map data')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // -------------------------------------------------------
  // Handlers
  // -------------------------------------------------------

  const handleWizardComplete = async (wizardData: {
    revenueStreams: RevenueStreamInput[]
    costItems: CostItemInput[]
  }): Promise<void> => {
    // Create all items sequentially to maintain order
    for (const rs of wizardData.revenueStreams) {
      const result = await createRevenueStream(rs)
      if (result.error) {
        toast.error(`Failed to create "${rs.name}": ${result.error}`)
        throw new Error(result.error)
      }
    }

    for (const ci of wizardData.costItems) {
      const result = await createCostItem(ci)
      if (result.error) {
        toast.error(`Failed to create "${ci.name}": ${result.error}`)
        throw new Error(result.error)
      }
    }

    toast.success('Money Map created successfully')
    await loadData()
  }

  const handleAddRevenueStream = async (input: RevenueStreamInput): Promise<void> => {
    const result = await createRevenueStream(input)
    if (result.error) {
      throw new Error(result.error)
    }
    toast.success('Revenue stream added')
    await loadData()
  }

  const handleEditStream = (streamId: string): void => {
    const stream = data?.revenue_streams.find((rs) => rs.id === streamId)
    if (stream) {
      setEditingStream(stream)
      setIsRevenueDialogOpen(true)
    }
  }

  const handleUpdateRevenueStream = async (input: RevenueStreamInput): Promise<void> => {
    if (!editingStream) return
    const result = await updateRevenueStream(editingStream.id, input)
    if (result.error) {
      throw new Error(result.error)
    }
    setEditingStream(null)
    toast.success('Revenue stream updated')
    await loadData()
  }

  const handleAddCostItem = async (input: CostItemInput): Promise<void> => {
    const result = await createCostItem(input)
    if (result.error) {
      throw new Error(result.error)
    }
    toast.success('Cost item added')
    await loadData()
  }

  const handleCreateSnapshot = async (name: string, periodLabel: string): Promise<void> => {
    const result = await createSnapshot(name, periodLabel)
    if (result.error) {
      throw new Error(result.error)
    }
    toast.success('Snapshot captured')
    const snapshotResult = await getSnapshots()
    if (snapshotResult.data) {
      setSnapshots(snapshotResult.data)
    }
  }

  const handleSelectSnapshot = (snapshot: MoneyMapSnapshot): void => {
    setSelectedSnapshot(snapshot)
    setIsSnapshotDialogOpen(false)
    toast.success(`Comparing with "${snapshot.name}"`)
  }

  const handleRefresh = async (): Promise<void> => {
    setIsLoading(true)
    await loadData()
    toast.success('Data refreshed')
  }

  // -------------------------------------------------------
  // Loading state
  // -------------------------------------------------------

  if (isLoading) {
    return (
      <div className={spacing.section}>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-5 w-96 mt-2" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-8">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-[400px] mt-8" />
      </div>
    )
  }

  // -------------------------------------------------------
  // Empty state (no data, wizard not open)
  // -------------------------------------------------------

  const isEmpty = !data || data.revenue_streams.length === 0

  // -------------------------------------------------------
  // Render
  // -------------------------------------------------------
  return (
    <div className={spacing.section}>
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="min-w-0 flex-1">
          <div className={typography.pageHeader}>
            <div className={typography.pageHeaderAccent} />
            <h1 className={typography.h1}>Money Map</h1>
          </div>
          <p className={typography.pageSubtitle}>
            How you make money, where you spend it, and true profitability by stream
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!isEmpty && (
            <>
              <Button variant="ghost" size="sm" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4 mr-1.5" />
                Refresh
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setIsSnapshotDialogOpen(true)}>
                <Camera className="h-4 w-4 mr-1.5" />
                Snapshot
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setEditingStream(null)
                  setIsRevenueDialogOpen(true)
                }}
              >
                <DollarSign className="h-4 w-4 mr-1.5" />
                Add Revenue
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsCostDialogOpen(true)}
              >
                <Receipt className="h-4 w-4 mr-1.5" />
                Add Cost
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Comparison banner */}
      {selectedSnapshot && (
        <div className="flex items-center justify-between px-4 py-2 rounded-lg bg-electric-blue/5 border border-electric-blue/20">
          <p className="text-sm text-foreground">
            Comparing with <span className="font-semibold">{selectedSnapshot.name}</span>
            <span className="text-muted-foreground ml-1">({selectedSnapshot.period_label})</span>
          </p>
          <Button variant="ghost" size="sm" onClick={() => setSelectedSnapshot(null)}>
            Clear
          </Button>
        </div>
      )}

      {isEmpty ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center py-20 bg-muted/30 rounded-xl">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-6">
            <DollarSign className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-display font-semibold text-foreground mb-2">
            See where your money flows
          </h2>
          <p className="text-muted-foreground text-sm text-center max-w-md mb-8">
            Set up your revenue streams and costs to visualise how your company
            makes money and where it goes. Get a clear picture of true profitability
            per revenue stream.
          </p>
          <Button onClick={() => setIsWizardOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Set Up Money Map
          </Button>
        </div>
      ) : data && (
        /* Dashboard */
        <div className={spacing.section}>
          {/* Summary Cards */}
          <MoneyMapSummaryCards
            summary={data.summary}
            previousSummary={selectedSnapshot?.snapshot_data?.summary ?? null}
          />

          {/* Sankey Flow Diagram */}
          <div>
            <h2 className="text-lg font-display font-semibold text-foreground mb-4">
              Money Flow
            </h2>
            <MoneyMapSankey data={data} className="border rounded-xl p-4 bg-background" />
          </div>

          {/* Bottom Row: Table + Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <ProfitabilityTable
                profitability={data.profitability}
                onEditStream={handleEditStream}
              />
            </div>
            <div>
              <CostBreakdownChart costItems={data.cost_items} />
            </div>
          </div>
        </div>
      )}

      {/* Dialogs */}
      <MoneyMapSetupWizard
        open={isWizardOpen}
        onOpenChange={setIsWizardOpen}
        onComplete={handleWizardComplete}
      />

      <RevenueStreamDialog
        open={isRevenueDialogOpen}
        onOpenChange={(open) => {
          setIsRevenueDialogOpen(open)
          if (!open) setEditingStream(null)
        }}
        onSave={editingStream ? handleUpdateRevenueStream : handleAddRevenueStream}
        initial={editingStream}
      />

      <CostItemDialog
        open={isCostDialogOpen}
        onOpenChange={setIsCostDialogOpen}
        onSave={handleAddCostItem}
      />

      <SnapshotDialog
        open={isSnapshotDialogOpen}
        onOpenChange={setIsSnapshotDialogOpen}
        onSave={handleCreateSnapshot}
        onSelect={handleSelectSnapshot}
        snapshots={snapshots}
      />
    </div>
  )
}
