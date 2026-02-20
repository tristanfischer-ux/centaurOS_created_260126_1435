'use client'

/**
 * @file strategy-dashboard.tsx
 *
 * @description Strategic dashboard — the top of the cascade.
 * Shows company purpose, strategic pillars with progress rollup,
 * and optional Strategy River / Link Objectives visualization views.
 */

import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { typography } from '@/lib/design-system'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StatusBadge } from '@/components/ui/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { CompanyPurposeWrapper } from '@/components/objectives/company-purpose-wrapper'
import StrategyRiver, { computeRiverStats } from '@/components/canvas/StrategyRiver'
import { goalBundlesToRiverData } from '@/lib/canvas/strategy-river-adapter'
import { StrategyLinkView } from '../canvas/strategy-link-view'
import { NodeDetailsDialog } from '@/components/canvas/node-details-dialog'
import { AddToRiverDialog } from '@/components/canvas/add-to-river-dialog'
import {
  LayoutDashboard, Waypoints, Link2, Flag, Target, CheckCircle2,
  AlertTriangle, TrendingUp, ArrowRight, Plus, XCircle, ChevronRight,
  MessageSquare, FileText, Copy, Sparkles,
} from 'lucide-react'
import { CreateStrategicGoalDialog } from '@/components/strategy/create-strategic-goal-dialog'
import { TranscriptImportDialog } from '@/components/strategy/transcript-import-dialog'
import { ExportStrategyDialog } from '@/components/strategy/export-strategy-dialog'
import { AutoGenerateMilestonesDialog } from '@/components/strategy/auto-generate-milestones-dialog'
import { AskSpecialistButton } from '@/components/specialists/ask-specialist-button'
import { StrategyHealthReview } from '@/components/specialists/strategy-health-review'
import { useRelevantSpecialist } from '@/hooks/use-relevant-specialist'
import { useRegisterScreenContext } from '@/contexts/screen-context'
import type { SpecialistContext } from '@/components/specialists/types'
import { updateTaskDates } from '@/actions/tasks'
import { updateCanvasItem } from '@/actions/canvas'
import { toast } from 'sonner'
import { getStrategyColor } from '../new-objectives/strategy-colors'
import type { GoalBundle, MilestoneOption } from '@/types/canvas'
import type { StrategicObjective } from '../new-objectives/types'
import type { FoundryPurposeData } from '@/types/foundry'
import type { RegularObjective } from '../canvas/canvas-shell'

// ============================================================================
// TYPES
// ============================================================================

export interface StrategyPillar {
  id: string
  title: string
  description: string | null
  objectiveCount: number
  totalTasks: number
  completedTasks: number
  overdueTasks: number
  progress: number
  health: 'on-track' | 'at-risk' | 'off-track' | 'completed' | 'not-started'
  /** Elapsed time percentage for timeline-aware health (0-100) */
  elapsedPercent?: number
}

type ViewMode = 'dashboard' | 'river' | 'link'

interface StrategyDashboardProps {
  pillars: StrategyPillar[]
  unlinkedObjectiveCount: number
  totalObjectives: number
  purposeData: FoundryPurposeData | null
  isFounder: boolean
  foundryId: string
  userId: string
  /** For Strategy River view */
  initialBundles: GoalBundle[]
  strategicObjectives: StrategicObjective[]
  regularObjectives: RegularObjective[]
}

// ============================================================================
// CONSTANTS
// ============================================================================

const HEALTH_CONFIG = {
  'on-track': { label: 'On Track', status: 'success' as const, icon: TrendingUp },
  'at-risk': { label: 'At Risk', status: 'warning' as const, icon: AlertTriangle },
  'off-track': { label: 'Off Track', status: 'error' as const, icon: XCircle },
  'completed': { label: 'Completed', status: 'success' as const, icon: CheckCircle2 },
  'not-started': { label: 'Not Started', status: 'pending' as const, icon: Target },
} as const

// ============================================================================
// COMPONENT
// ============================================================================

export function StrategyDashboard({
  pillars,
  unlinkedObjectiveCount,
  totalObjectives,
  purposeData,
  isFounder,
  foundryId,
  userId,
  initialBundles,
  strategicObjectives,
  regularObjectives,
}: StrategyDashboardProps) {
  const router = useRouter()

  // ── Strategy River state ──
  const riverData = useMemo(() => goalBundlesToRiverData(initialBundles), [initialBundles])

  // Default to River when river data exists, otherwise Dashboard shows pillar cards
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (riverData.length > 0) return 'river'
    if (pillars.length > 0) return 'dashboard'
    return 'dashboard'
  })

  // ── Create Strategic Goal dialog ──
  const [isCreateGoalOpen, setIsCreateGoalOpen] = useState(false)
  // ── Transcript Import dialog ──
  const [isTranscriptImportOpen, setIsTranscriptImportOpen] = useState(false)
  const [isExportOpen, setIsExportOpen] = useState(false)
  // ── Auto-generate milestones dialog (for existing goals) ──
  const [autoGenGoal, setAutoGenGoal] = useState<{
    id: string
    title: string
    deadline: string
    description: string | null
  } | null>(null)
  const [expandedObjectiveIds, setExpandedObjectiveIds] = useState<Set<string>>(() => {
    if (riverData.length > 0) {
      return new Set(riverData[0].objectives.map((o) => o.id))
    }
    return new Set()
  })

  // ── Node details dialog ──
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogNodeType, setDialogNodeType] = useState<'goal' | 'milestone' | 'objective' | 'task'>('task')
  const [dialogNodeId, setDialogNodeId] = useState('')
  const [addToRiverGoalId, setAddToRiverGoalId] = useState<string | null>(null)

  const milestoneOptions: MilestoneOption[] = useMemo(() =>
    initialBundles.flatMap((bundle) =>
      bundle.milestones.map((ms) => ({
        id: ms.id,
        title: ms.title,
        goalTitle: bundle.goal.title,
        milestone_date: ms.milestone_date,
      }))
    ), [initialBundles])

  const handleExpandToggle = useCallback((id: string): void => {
    const so = riverData.find((s) => s.id === id)
    if (so) {
      const msIds = so.objectives.map((o) => o.id)
      setExpandedObjectiveIds((prev) => {
        const next = new Set(prev)
        const anyExpanded = msIds.some((mid) => next.has(mid))
        if (anyExpanded) {
          msIds.forEach((mid) => next.delete(mid))
        } else {
          msIds.forEach((mid) => next.add(mid))
        }
        return next
      })
    } else {
      setExpandedObjectiveIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id); else next.add(id)
        return next
      })
    }
  }, [riverData])

  const handleExpandAll = useCallback((): void => {
    setExpandedObjectiveIds(new Set(riverData.flatMap((so) => so.objectives.map((o) => o.id))))
  }, [riverData])

  const handleCollapseAll = useCallback((): void => {
    setExpandedObjectiveIds(new Set())
  }, [])

  const handleNodeClick = useCallback((type: 'goal' | 'milestone' | 'objective' | 'task', id: string): void => {
    setDialogNodeType(type)
    setDialogNodeId(id)
    setDialogOpen(true)
  }, [])

  /**
   * Handles task drag-to-reschedule on the Strategy River.
   * Persists new start/end dates via server action and refreshes.
   */
  const handleTaskDateChange = useCallback(async (taskId: string, newStart: string, newEnd: string): Promise<void> => {
    const result = await updateTaskDates(taskId, newStart, newEnd)
    if (result?.error) {
      toast.error('Failed to reschedule task', { description: typeof result.error === 'string' ? result.error : 'Unknown error' })
    } else {
      toast.success('Task rescheduled', {
        description: `${new Date(newStart).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} → ${new Date(newEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
      })
      router.refresh()
    }
  }, [router])

  /**
   * Handles milestone drag-to-reschedule on the Strategy River.
   * Updates the milestone's due date (stored as milestone_date on the objective).
   */
  const handleMilestoneDateChange = useCallback(async (milestoneId: string, newDueDate: string): Promise<void> => {
    // Milestones in the river are objectives with is_milestone=true.
    // Their date is stored as `milestone_date` on the objectives table.
    const result = await updateCanvasItem('objective', milestoneId, { milestone_date: newDueDate })
    if ('error' in result) {
      toast.error('Failed to reschedule milestone', { description: result.error })
    } else {
      toast.success('Milestone rescheduled', {
        description: `New date: ${new Date(newDueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`,
      })
      router.refresh()
    }
  }, [router])

  const handleDialogUpdate = useCallback((): void => {
    router.refresh()
  }, [router])

  // ── Aggregate stats ──
  const stats = useMemo(() => {
    const onTrack = pillars.filter((p) => p.health === 'on-track').length
    const atRisk = pillars.filter((p) => p.health === 'at-risk').length
    const offTrack = pillars.filter((p) => p.health === 'off-track').length
    const completed = pillars.filter((p) => p.health === 'completed').length
    const notStarted = pillars.filter((p) => p.health === 'not-started').length
    const totalProgress = pillars.length > 0
      ? Math.round(pillars.reduce((sum, p) => sum + p.progress, 0) / pillars.length)
      : 0
    return { onTrack, atRisk, offTrack, completed, notStarted, totalProgress }
  }, [pillars])

  // Register screen context so specialists know what the user is viewing
  const purpose = purposeData?.purpose
  useRegisterScreenContext(useMemo(() => ({
    pageTitle: 'Strategy Dashboard',
    summary: `Viewing company strategy with ${pillars.length} strategic pillars. ${stats.totalProgress}% average progress. ${stats.onTrack} on track, ${stats.atRisk} at risk, ${stats.offTrack} off track, ${stats.completed} completed.${purpose ? ` Company purpose: "${purpose}"` : ''}`,
    entities: pillars.map(p => ({
      type: 'pillar',
      title: p.title,
      status: p.health,
      progress: p.progress,
    })),
  }), [pillars, stats, purpose]))

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="space-y-4 pb-4 border-b border-slate-100">
        {/* Row 1: Title + primary CTA */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
              <Link href="/plan" className="hover:text-foreground transition-colors">Plan</Link>
              <ChevronRight className="h-3 w-3" />
              <span className="text-foreground font-medium">Strategy</span>
            </nav>
            <div className={typography.pageHeader}>
              <div className={typography.pageHeaderAccent} />
              <h1 className={typography.h1}>Strategy</h1>
            </div>
            <p className={typography.pageSubtitle}>
              Where you're going and how you'll get there
            </p>
          </div>
          <Button
            onClick={() => setIsCreateGoalOpen(true)}
            className="bg-international-orange hover:bg-international-orange-hover shrink-0"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            New Goal
          </Button>
        </div>

        {/* Row 2: Toolbar — view tabs + secondary actions */}
        <div className="flex flex-wrap items-center gap-2">
          <AskSpecialistButton
            context={{
              type: 'strategy',
              title: 'Overall Strategy',
              description: purposeData?.purpose ?? 'Company strategic direction',
              metadata: {
                purposeSummary: purposeData?.purpose,
                objectives: pillars.map((p) => ({
                  title: p.title,
                  health: p.health,
                  progress: p.progress,
                })),
                notes: `${pillars.length} strategic pillars. ${stats.totalProgress}% average progress. ${stats.atRisk} at risk, ${stats.offTrack} off track.`,
              },
            }}
            specialistId="strategist"
            specialistName="Sage"
            label="Discuss Strategy"
          />
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <TabsList className="h-9">
              <TabsTrigger value="dashboard" className="text-xs gap-1.5 px-3">
                <LayoutDashboard className="h-3.5 w-3.5" />
                Dashboard
              </TabsTrigger>
              <TabsTrigger value="river" className="text-xs gap-1.5 px-3">
                <Waypoints className="h-3.5 w-3.5" />
                River
              </TabsTrigger>
              <TabsTrigger value="link" className="text-xs gap-1.5 px-3">
                <Link2 className="h-3.5 w-3.5" />
                Link
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            variant="outline"
            onClick={() => setIsExportOpen(true)}
          >
            <Copy className="h-4 w-4 mr-1.5" />
            Copy for Email
          </Button>
          <Button
            variant="outline"
            onClick={() => setIsTranscriptImportOpen(true)}
          >
            <FileText className="h-4 w-4 mr-1.5" />
            Import Transcript
          </Button>
        </div>
      </div>

      {/* ── Dashboard View ── */}
      {viewMode === 'dashboard' && (
        <div className="space-y-8">
          {/* Company Purpose Hero */}
          <CompanyPurposeWrapper
            purposeData={purposeData}
            isFounder={isFounder}
            foundryId={foundryId}
            userId={userId}
            variant="card"
          />

          {/* Strategy Health Summary */}
          {pillars.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <SummaryPill
                label="Overall"
                value={`${stats.totalProgress}%`}
                sublabel="avg progress"
                className="bg-muted/50"
              />
              <SummaryPill
                label="On Track"
                value={stats.onTrack}
                className="bg-status-success/5"
                valueColor="text-status-success"
              />
              <SummaryPill
                label="At Risk"
                value={stats.atRisk}
                className="bg-status-warning/5"
                valueColor="text-status-warning"
              />
              <SummaryPill
                label="Off Track"
                value={stats.offTrack}
                className="bg-status-error/5"
                valueColor="text-status-error"
              />
              <SummaryPill
                label="Completed"
                value={stats.completed}
                className="bg-status-success/5"
                valueColor="text-status-success"
              />
              <SummaryPill
                label="Unaligned"
                value={unlinkedObjectiveCount}
                sublabel={`of ${totalObjectives}`}
                className="bg-muted/50"
                valueColor="text-muted-foreground"
              />
            </div>
          )}

          {/* Sage's Strategy Health Review */}
          <StrategyHealthReview
            pillars={pillars.map(p => ({
              title: p.title,
              health: p.health,
              progress: p.progress,
              overdueTasks: p.overdueTasks,
            }))}
            purposeSummary={purposeData?.purpose}
          />

          {/* Strategic Pillars */}
          {pillars.length === 0 ? (
            <EmptyState
              icon={<Waypoints className="h-10 w-10" />}
              title="Your strategic direction starts here"
              description="Define what matters most. Strategic goals become the pillars that everything else aligns to — objectives, tasks, and progress all cascade from here."
              action={
                <Button
                  onClick={() => setIsCreateGoalOpen(true)}
                  className="bg-international-orange hover:bg-international-orange-hover"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Strategy
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {pillars.map((pillar, index) => (
                <PillarCard
                  key={pillar.id}
                  pillar={pillar}
                  colorIndex={index}
                  onGeneratePlan={(id, title, description) => {
                    // Find the goal bundle to get the deadline
                    const bundle = initialBundles.find((b) => b.goal.id === id)
                    const deadline = bundle?.goal.milestone_date || ''
                    setAutoGenGoal({ id, title, deadline, description })
                  }}
                />
              ))}
            </div>
          )}

          {/* Unlinked Objectives Warning */}
          {unlinkedObjectiveCount > 0 && (
            <Card className="rounded-xl border-dashed border-2 border-status-warning/30 bg-status-warning/5">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-full bg-status-warning/10 p-2">
                      <AlertTriangle className="h-5 w-5 text-status-warning" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {unlinkedObjectiveCount} objective{unlinkedObjectiveCount !== 1 ? 's' : ''} not aligned to any strategy
                      </p>
                      <p className="text-xs text-muted-foreground">
                        These objectives exist but aren't connected to a strategic pillar
                      </p>
                    </div>
                  </div>
                  <Link href="/new-objectives">
                    <Button variant="outline" size="sm">
                      Review
                      <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Strategy River View ── */}
      {viewMode === 'river' && (
        <div className="-mx-4 sm:-mx-6 lg:-mx-8">
          {riverData.length === 0 ? (
            <div className="px-4 sm:px-6 lg:px-8">
              <EmptyState
                icon={<Waypoints className="h-10 w-10" />}
                title="Your strategy, visualized as a river"
                description="Create a strategic goal with milestones and tasks to watch them flow through time. Goals become rivers, milestones become confluences, and tasks become tributaries — all on a single, living timeline."
                action={
                  <Button
                    onClick={() => setIsCreateGoalOpen(true)}
                    className="bg-international-orange hover:bg-international-orange-hover"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create Strategic Goal
                  </Button>
                }
              />
            </div>
          ) : (
            <StrategyRiver
              strategicObjectives={riverData}
              onTaskClick={(id) => handleNodeClick('task', id)}
              onMilestoneClick={(id) => handleNodeClick('milestone', id)}
              onGoalClick={(id) => handleNodeClick('goal', id)}
              onAddToRiver={(id) => setAddToRiverGoalId(id)}
              expandedObjectiveIds={expandedObjectiveIds}
              onExpandToggle={handleExpandToggle}
              onExpandAll={handleExpandAll}
              onCollapseAll={handleCollapseAll}
              onTaskDateChange={handleTaskDateChange}
              onMilestoneDateChange={handleMilestoneDateChange}
            />
          )}
        </div>
      )}

      {/* ── Link Objectives View ── */}
      {viewMode === 'link' && (
        <div className="-mx-4 sm:-mx-6 lg:-mx-8">
          <StrategyLinkView
            strategicObjectives={strategicObjectives}
            regularObjectives={regularObjectives}
          />
        </div>
      )}

      {/* Node details dialog */}
      {dialogNodeId && (
        <NodeDetailsDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          nodeType={dialogNodeType}
          nodeId={dialogNodeId}
          isUnlinked={false}
          milestones={milestoneOptions}
          onUpdate={handleDialogUpdate}
        />
      )}

      {/* Add-to-river dialog (supports creating milestones AND objectives) */}
      <AddToRiverDialog
        open={!!addToRiverGoalId}
        onOpenChange={(open) => { if (!open) setAddToRiverGoalId(null) }}
        strategicObjectiveId={addToRiverGoalId ?? ''}
        strategicObjectiveTitle={
          strategicObjectives.find((so) => so.id === addToRiverGoalId)?.title ?? ''
        }
        milestones={milestoneOptions}
        onCreated={handleDialogUpdate}
      />

      {/* Create Strategic Goal dialog */}
      <CreateStrategicGoalDialog
        open={isCreateGoalOpen}
        onOpenChange={setIsCreateGoalOpen}
      />

      {/* Transcript Import dialog */}
      <TranscriptImportDialog
        open={isTranscriptImportOpen}
        onOpenChange={setIsTranscriptImportOpen}
        onComplete={handleDialogUpdate}
      />

      {/* Export Strategy for Email dialog */}
      <ExportStrategyDialog
        open={isExportOpen}
        onOpenChange={setIsExportOpen}
        bundles={initialBundles}
        pillars={pillars}
      />

      {/* Auto-generate milestones dialog (for existing goals) */}
      {autoGenGoal && (
        <AutoGenerateMilestonesDialog
          open={!!autoGenGoal}
          onOpenChange={(isOpen) => {
            if (!isOpen) setAutoGenGoal(null)
          }}
          goalId={autoGenGoal.id}
          goalTitle={autoGenGoal.title}
          goalDeadline={autoGenGoal.deadline}
          goalDescription={autoGenGoal.description}
          onComplete={handleDialogUpdate}
        />
      )}
    </div>
  )
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function SummaryPill({
  label,
  value,
  sublabel,
  className,
  valueColor,
}: {
  label: string
  value: string | number
  sublabel?: string
  className?: string
  valueColor?: string
}) {
  return (
    <div className={cn('rounded-xl border px-4 py-3 text-center', className)}>
      <div className={cn('text-2xl font-semibold tabular-nums', valueColor || 'text-foreground')}>
        {value}
      </div>
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      {sublabel && (
        <div className="text-[10px] text-muted-foreground/70">{sublabel}</div>
      )}
    </div>
  )
}

function PillarCard({
  pillar,
  colorIndex,
  onGeneratePlan,
}: {
  pillar: StrategyPillar
  colorIndex: number
  onGeneratePlan: (id: string, title: string, description: string | null) => void
}) {
  const color = getStrategyColor(colorIndex)
  const healthConfig = HEALTH_CONFIG[pillar.health]
  const { specialistId, specialistName } = useRelevantSpecialist(
    pillar.title,
    pillar.description,
  )

  const pillarContext: SpecialistContext = {
    type: 'pillar',
    title: pillar.title,
    description: pillar.description ?? undefined,
    metadata: {
      health: pillar.health,
      progress: pillar.progress,
      notes: `${pillar.objectiveCount} objectives, ${pillar.completedTasks}/${pillar.totalTasks} tasks completed, ${pillar.overdueTasks} overdue`,
    },
  }

  return (
    <Card className={cn(
      'rounded-xl border-l-4 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200',
      color.border,
    )}>
      <Link href={`/new-objectives?strategy=${pillar.id}`}>
        <CardContent className="pt-6 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Flag className={cn('h-4 w-4 flex-shrink-0', color.icon)} />
              <h3 className="text-base font-semibold text-foreground truncate">
                {pillar.title}
              </h3>
            </div>
            <StatusBadge status={healthConfig.status} size="sm">
              {healthConfig.label}
            </StatusBadge>
          </div>

          {/* Description */}
          {pillar.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {pillar.description}
            </p>
          )}

          {/* Progress Bar (timeline-aware) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Progress</span>
              <div className="flex items-center gap-2">
                {pillar.elapsedPercent != null && pillar.elapsedPercent > 0 && pillar.progress < 100 && (
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {pillar.elapsedPercent}% time elapsed
                  </span>
                )}
                <span className="font-semibold tabular-nums text-foreground">{pillar.progress}%</span>
              </div>
            </div>
            <div className="relative h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  pillar.progress === 100 ? 'bg-status-success' :
                  pillar.progress >= 50 ? 'bg-international-orange' :
                  pillar.progress >= 20 ? 'bg-status-warning' :
                  'bg-status-error'
                )}
                style={{ width: `${pillar.progress}%` }}
              />
              {/* Timeline marker: shows where elapsed time is relative to progress */}
              {pillar.elapsedPercent != null && pillar.elapsedPercent > 0 && pillar.elapsedPercent < 100 && pillar.progress < 100 && (
                <div
                  className="absolute top-0 h-full w-0.5 bg-foreground/30"
                  style={{ left: `${pillar.elapsedPercent}%` }}
                  title={`${pillar.elapsedPercent}% of timeline elapsed`}
                />
              )}
            </div>
          </div>

          {/* Stats Row */}
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
            <div className="flex items-center gap-1">
              <Target className="h-3.5 w-3.5" />
              <span>{pillar.objectiveCount} objective{pillar.objectiveCount !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="tabular-nums">
                {pillar.completedTasks}/{pillar.totalTasks} tasks
              </span>
              {pillar.overdueTasks > 0 && (
                <span className="text-status-error font-medium">
                  {pillar.overdueTasks} overdue
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Link>

      {/* Actions area -- outside the Link to prevent navigation on click */}
      <div className="px-6 pb-4 pt-0 space-y-2">
        {/* Generate Plan button for empty pillars */}
        {pillar.objectiveCount === 0 && (
          <div
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation() }}
            role="presentation"
          >
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5 text-international-orange border-international-orange/30 hover:bg-international-orange/5"
              onClick={(e) => {
                e.preventDefault()
                onGeneratePlan(pillar.id, pillar.title, pillar.description)
              }}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Generate Plan
            </Button>
          </div>
        )}
        <div
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation() }}
          role="presentation"
        >
          <AskSpecialistButton
            context={pillarContext}
            specialistId={specialistId}
            specialistName={specialistName}
            variant="chip"
          />
        </div>
      </div>
    </Card>
  )
}
