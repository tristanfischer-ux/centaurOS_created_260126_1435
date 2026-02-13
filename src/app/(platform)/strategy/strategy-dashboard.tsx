"use client"

/**
 * @file strategy-dashboard.tsx — Client-side strategy dashboard shell.
 *
 * @description Renders the strategic dashboard with pillar rollups,
 * strategy river visualization, and purpose overview.
 */

import type { GoalBundle } from "@/types/canvas"
import type { FoundryPurposeData } from "@/types/foundry"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Target, TrendingUp, AlertTriangle, CheckCircle2, Clock } from "lucide-react"

interface PillarRollup {
  id: string
  title: string
  createdAt: string
  objectiveCount: number
  totalTasks: number
  completedTasks: number
  overdueTasks: number
  progress: number
  health: "on-track" | "at-risk" | "off-track" | "completed" | "not-started"
}

interface StrategyDashboardProps {
  /** Progress rollup data for each strategic pillar */
  pillarRollups: PillarRollup[]
  /** Count of objectives not linked to any strategic pillar */
  unalignedObjectiveCount: number
  /** Total count of regular (non-strategic) objectives */
  totalObjectiveCount: number
  /** Pre-fetched goal bundles for Strategy River */
  initialBundles: GoalBundle[]
  /** Strategic objectives (pillars) */
  strategicObjectives: Array<{ id: string; title: string; created_at: string }>
  /** Regular objectives for linking */
  regularObjectives: Array<{
    id: string
    title: string
    parent_objective_id: string | null
    status: string | null
    progress: number
  }>
  /** Foundry purpose data */
  purposeData: FoundryPurposeData | null
  /** Whether the current user is a Founder */
  isFounder: boolean
  /** Current foundry ID */
  foundryId: string
  /** Current user ID */
  userId: string
}

const HEALTH_CONFIG: Record<
  PillarRollup["health"],
  { label: string; color: string; icon: React.ComponentType<{ className?: string }> }
> = {
  "on-track": { label: "On Track", color: "text-status-success", icon: TrendingUp },
  "at-risk": { label: "At Risk", color: "text-status-warning", icon: AlertTriangle },
  "off-track": { label: "Off Track", color: "text-destructive", icon: AlertTriangle },
  completed: { label: "Completed", color: "text-status-success", icon: CheckCircle2 },
  "not-started": { label: "Not Started", color: "text-muted-foreground", icon: Clock },
}

/**
 * StrategyDashboard — Client shell for the strategy page.
 *
 * @description Displays strategic pillars with progress rollups,
 * health indicators, and key metrics.
 */
export function StrategyDashboard({
  pillarRollups,
  unalignedObjectiveCount,
  totalObjectiveCount,
  purposeData,
}: StrategyDashboardProps): React.ReactNode {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="pb-4 border-b border-muted">
        <div className="flex items-center gap-3">
          <div className="h-8 w-1 rounded-full bg-international-orange" />
          <h1 className="text-2xl font-bold text-foreground">Strategy</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          {purposeData?.whyExists
            ? purposeData.whyExists
            : "Define your company purpose and strategic pillars to see progress here."}
        </p>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Strategic Pillars</p>
            <p className="text-2xl font-bold text-foreground">{pillarRollups.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Objectives</p>
            <p className="text-2xl font-bold text-foreground">{totalObjectiveCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Unaligned</p>
            <p className="text-2xl font-bold text-foreground">{unalignedObjectiveCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Overall Progress</p>
            <p className="text-2xl font-bold text-foreground">
              {pillarRollups.length > 0
                ? Math.round(
                    pillarRollups.reduce((sum, p) => sum + p.progress, 0) / pillarRollups.length
                  )
                : 0}
              %
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Pillar cards */}
      {pillarRollups.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Strategic Pillars</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pillarRollups.map((pillar) => {
              const health = HEALTH_CONFIG[pillar.health]
              const HealthIcon = health.icon
              return (
                <Card key={pillar.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Target className="h-4 w-4 text-international-orange" />
                        {pillar.title}
                      </CardTitle>
                      <span className={`text-xs font-medium flex items-center gap-1 ${health.color}`}>
                        <HealthIcon className="h-3 w-3" />
                        {health.label}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Progress bar */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{pillar.completedTasks} / {pillar.totalTasks} tasks</span>
                        <span>{pillar.progress}%</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-international-orange rounded-full transition-all"
                          style={{ width: `${pillar.progress}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{pillar.objectiveCount} objectives</span>
                      {pillar.overdueTasks > 0 && (
                        <span className="text-destructive">{pillar.overdueTasks} overdue</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No strategic pillars defined yet. Create strategic objectives to see your strategy dashboard.
          </CardContent>
        </Card>
      )}
    </div>
  )
}
