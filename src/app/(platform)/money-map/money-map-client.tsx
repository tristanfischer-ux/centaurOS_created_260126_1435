'use client'

/**
 * MoneyMapClient — Main client component for the Money Map page.
 *
 * @description Orchestrates the full Money Map experience with a two-column
 * layout: inline input panel on the left (like Cost of Delay), visualisations
 * on the right (Sankey, summary cards, profitability, cost breakdown).
 */

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Camera,
  RefreshCw,
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
import { MoneyMapInputPanel } from '@/components/money-map/input-panel'
import { RevenueStreamDialog } from '@/components/money-map/revenue-stream-dialog'
import { SnapshotDialog } from '@/components/money-map/snapshot-dialog'
import { SAMPLE_MONEY_MAP_DATA } from '@/components/money-map/sample-data'

// Actions
import {
  getMoneyMapData,
  getSnapshots,
  createRevenueStream,
  createCostItem,
  updateRevenueStream,
  deleteRevenueStream,
  deleteCostItem,
  updateCostItem,
  createSnapshot,
} from '@/actions/money-map'

import type {
  MoneyMapData,
  MoneyMapSnapshot,
  RevenueStreamInput,
  CostItemInput,
  RevenueStream,
} from '@/types/money-map'
import { parseSnapshotData } from '@/types/money-map'

interface MoneyMapClientProps {
  /** When true, hides the page header (used when embedded in Financial Tools tab) */
  hideHeader?: boolean
}

export function MoneyMapClient({ hideHeader = false }: MoneyMapClientProps): React.ReactElement {
  // Data state
  const [data, setData] = useState<MoneyMapData | null>(null)
  const [snapshots, setSnapshots] = useState<MoneyMapSnapshot[]>([])
  const [selectedSnapshot, setSelectedSnapshot] = useState<MoneyMapSnapshot | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Dialog state (only for editing streams and snapshots)
  const [isRevenueDialogOpen, setIsRevenueDialogOpen] = useState(false)
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
  // Revenue stream handlers
  // -------------------------------------------------------

  const handleAddRevenueStream = async (input: RevenueStreamInput): Promise<void> => {
    const result = await createRevenueStream(input)
    if (result.error) {
      throw new Error(result.error)
    }
    toast.success('Revenue stream added')
    await loadData()
  }

  const handleUpdateRevenueStream = async (id: string, input: RevenueStreamInput): Promise<void> => {
    const result = await updateRevenueStream(id, input)
    if (result.error) {
      throw new Error(result.error)
    }
    toast.success('Revenue stream updated')
    await loadData()
  }

  const handleEditStreamDialog = async (input: RevenueStreamInput): Promise<void> => {
    if (!editingStream) return
    await handleUpdateRevenueStream(editingStream.id, input)
    setEditingStream(null)
  }

  const handleDeleteRevenueStream = async (id: string): Promise<void> => {
    const result = await deleteRevenueStream(id)
    if (result.error) {
      throw new Error(result.error)
    }
    toast.success('Revenue stream removed')
    await loadData()
  }

  // -------------------------------------------------------
  // Cost item handlers
  // -------------------------------------------------------

  const handleAddCostItem = async (input: CostItemInput): Promise<void> => {
    const result = await createCostItem(input)
    if (result.error) {
      throw new Error(result.error)
    }
    toast.success('Cost item added')
    await loadData()
  }

  const handleUpdateCostItem = async (id: string, input: CostItemInput): Promise<void> => {
    const result = await updateCostItem(id, input)
    if (result.error) {
      throw new Error(result.error)
    }
    toast.success('Cost item updated')
    await loadData()
  }

  const handleDeleteCostItem = async (id: string): Promise<void> => {
    const result = await deleteCostItem(id)
    if (result.error) {
      throw new Error(result.error)
    }
    toast.success('Cost item removed')
    await loadData()
  }

  // -------------------------------------------------------
  // Snapshot handlers
  // -------------------------------------------------------

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

  const handleEditStream = (streamId: string): void => {
    const stream = data?.revenue_streams.find((rs) => rs.id === streamId)
    if (stream) {
      setEditingStream(stream)
      setIsRevenueDialogOpen(true)
    }
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
  // Data resolution
  // -------------------------------------------------------

  const isEmpty = !data || data.revenue_streams.length === 0
  const displayData = isEmpty ? SAMPLE_MONEY_MAP_DATA : data!
  const isDemo = isEmpty

  // -------------------------------------------------------
  // Render
  // -------------------------------------------------------
  return (
    <div className={spacing.section}>
      {/* Page Header -- hidden when embedded in Financial Tools tab */}
      {!hideHeader && (
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
            {!isDemo && (
              <>
                <Button variant="ghost" size="sm" onClick={handleRefresh}>
                  <RefreshCw className="h-4 w-4 mr-1.5" />
                  Refresh
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setIsSnapshotDialogOpen(true)}>
                  <Camera className="h-4 w-4 mr-1.5" />
                  Snapshot
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Action buttons when header is hidden (embedded mode) */}
      {hideHeader && !isDemo && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Refresh
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setIsSnapshotDialogOpen(true)}>
            <Camera className="h-4 w-4 mr-1.5" />
            Snapshot
          </Button>
        </div>
      )}

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

      {/* Demo mode banner */}
      {isDemo && (
        <div className="px-5 py-4 rounded-xl bg-electric-blue/5 border border-electric-blue/20">
          <p className="text-sm font-medium text-foreground">
            Viewing sample data for a typical consultancy
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Use the <strong className="text-foreground">+ Add</strong> buttons in the panel on the left to enter your own numbers. The sample data will be replaced with yours.
          </p>
        </div>
      )}

      {/* Summary Cards */}
      <MoneyMapSummaryCards
        summary={displayData.summary}
        previousSummary={!isDemo ? (selectedSnapshot ? parseSnapshotData(selectedSnapshot.snapshot_data)?.summary ?? null : null) : null}
      />

      {/* Main Content: Input Panel + Sankey */}
      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
        {/* Left: Input Panel */}
        <div>
          <MoneyMapInputPanel
            data={displayData}
            isDemo={isDemo}
            onAddRevenue={handleAddRevenueStream}
            onUpdateRevenue={handleUpdateRevenueStream}
            onDeleteRevenue={handleDeleteRevenueStream}
            onAddCost={handleAddCostItem}
            onUpdateCost={handleUpdateCostItem}
            onDeleteCost={handleDeleteCostItem}
          />
        </div>

        {/* Right: Sankey Flow Diagram */}
        <div>
          <MoneyMapSankey data={displayData} className="border rounded-xl p-4 bg-background" />
        </div>
      </div>

      {/* Bottom Row: Table + Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ProfitabilityTable
            profitability={displayData.profitability}
            onEditStream={isDemo ? undefined : handleEditStream}
          />
        </div>
        <div>
          <CostBreakdownChart costItems={displayData.cost_items} />
        </div>
      </div>

      {/* Insight callout */}
      <div className="rounded-xl border bg-muted/30 p-6">
        <h3 className="text-sm font-semibold text-foreground mb-2">How to read your Money Map</h3>
        <div className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong className="text-foreground">Your Numbers panel</strong> shows all your revenue streams
            and costs. Add, edit, or remove items to update the visualisations instantly.
          </p>
          <p>
            <strong className="text-foreground">The flow diagram</strong> traces how money moves from
            revenue streams through cost categories to your bottom line.
          </p>
          <p>
            <strong className="text-foreground">The profitability table</strong> reveals your true margin
            per revenue stream after allocating shared costs — so you know which streams actually make money.
          </p>
        </div>
      </div>

      {/* Dialogs (only for editing individual streams and managing snapshots) */}
      <RevenueStreamDialog
        open={isRevenueDialogOpen}
        onOpenChange={(open) => {
          setIsRevenueDialogOpen(open)
          if (!open) setEditingStream(null)
        }}
        onSave={handleEditStreamDialog}
        initial={editingStream}
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
