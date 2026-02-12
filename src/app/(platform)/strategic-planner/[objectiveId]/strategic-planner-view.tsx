"use client"

/**
 * @description Main client component for the Strategic Timeline Planner.
 * Fetches plan overview and renders the strategic canvas with controls.
 */

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  Calendar,
  Clock,
  Target,
  LayoutGrid,
  Users,
  AlertTriangle,
  Sparkles,
  ShoppingBag,
  BarChart3,
  Loader2,
} from "lucide-react"
import { differenceInDays, format } from "date-fns"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { typography } from "@/lib/design-system"
import { cn } from "@/lib/utils"

import { getStrategicPlanOverview } from "@/actions/strategic-planner"
import type { StrategicPlanOverview, CanvasGrouping, CanvasViewMode } from "@/types/strategic-planner"
import { StrategicCanvas } from "./components/strategic-canvas"
import { StrategicGantt } from "./components/strategic-gantt"
import { ResourcesPanel } from "./components/resources-panel"
import { RisksPanel } from "./components/risks-panel"
import { AISuggestionsPanel } from "./components/ai-suggestions-panel"

interface StrategicPlannerViewProps {
  objectiveId: string
}

export function StrategicPlannerView({ objectiveId }: StrategicPlannerViewProps) {
  const router = useRouter()
  const [planData, setPlanData] = useState<StrategicPlanOverview | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<CanvasViewMode>('canvas')
  const [grouping, setGrouping] = useState<CanvasGrouping>('phase')
  const [activePanel, setActivePanel] = useState<string | null>(null)

  const loadPlanData = useCallback(async () => {
    setIsLoading(true)
    const result = await getStrategicPlanOverview(objectiveId)
    if (result.error) {
      setError(result.error)
    } else if (result.data) {
      setPlanData(result.data)
    }
    setIsLoading(false)
  }, [objectiveId])

  useEffect(() => {
    loadPlanData()
  }, [loadPlanData])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-international-orange" />
          <p className="text-muted-foreground text-sm">Loading strategic plan...</p>
        </div>
      </div>
    )
  }

  if (error || !planData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertTriangle className="h-12 w-12 text-status-warning" />
        <p className="text-foreground font-medium">{error || 'Plan not found'}</p>
        <Button variant="secondary" onClick={() => router.push('/new-objectives')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Objectives
        </Button>
      </div>
    )
  }

  const { goal, phases } = planData
  const daysRemaining = goal.milestone_date
    ? differenceInDays(new Date(goal.milestone_date), new Date())
    : null

  const totalTasks = phases.reduce((sum, p) => sum + p.tasks.length, 0)
  const completedTasks = phases.reduce(
    (sum, p) => sum + p.tasks.filter((t) => t.status === 'Completed').length,
    0
  )
  const overallProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

  const resourceGapCount = goal.resource_suggestions?.length || 0
  const riskCount = goal.strategic_risks?.length || 0
  const suggestionCount = goal.ai_suggestions?.filter((s) => !s.dismissed)?.length || 0

  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/new-objectives')}
              className="h-8 px-2"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className={typography.pageHeader}>
              <div className={typography.pageHeaderAccent} />
              <h1 className={cn(typography.h1, "text-xl sm:text-2xl")}>
                {goal.title}
              </h1>
            </div>
          </div>

          {/* Goal metadata */}
          <div className="flex flex-wrap items-center gap-4 ml-12">
            {goal.milestone_date && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                <span>Target: {format(new Date(goal.milestone_date), 'MMM d, yyyy')}</span>
              </div>
            )}
            {daysRemaining !== null && (
              <div className={cn(
                "flex items-center gap-1.5 text-sm font-medium",
                daysRemaining < 0 ? "text-destructive" :
                daysRemaining < 30 ? "text-status-warning-dark" :
                "text-status-success-dark"
              )}>
                <Clock className="h-3.5 w-3.5" />
                <span>
                  {daysRemaining < 0
                    ? `${Math.abs(daysRemaining)} days overdue`
                    : `${daysRemaining} days remaining`
                  }
                </span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <BarChart3 className="h-3.5 w-3.5" />
              <span>{overallProgress}% complete</span>
              <span className="text-xs">({completedTasks}/{totalTasks} tasks)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 py-3 border-b border-slate-100">
        <div className="flex items-center gap-3">
          {/* View mode toggle */}
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as CanvasViewMode)}>
            <TabsList className="h-9">
              <TabsTrigger value="canvas" className="text-xs gap-1.5 px-3">
                <LayoutGrid className="h-3.5 w-3.5" />
                Canvas
              </TabsTrigger>
              <TabsTrigger value="gantt" className="text-xs gap-1.5 px-3">
                <BarChart3 className="h-3.5 w-3.5" />
                Gantt
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Grouping toggle */}
          <Tabs value={grouping} onValueChange={(v) => setGrouping(v as CanvasGrouping)}>
            <TabsList className="h-9">
              <TabsTrigger value="phase" className="text-xs gap-1.5 px-3">
                <Target className="h-3.5 w-3.5" />
                By Phase
              </TabsTrigger>
              <TabsTrigger value="person" className="text-xs gap-1.5 px-3">
                <Users className="h-3.5 w-3.5" />
                By Person
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Info panels toggle */}
        <div className="flex items-center gap-2">
          {resourceGapCount > 0 && (
            <Button
              variant={activePanel === 'resources' ? 'default' : 'outline'}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setActivePanel(activePanel === 'resources' ? null : 'resources')}
            >
              <ShoppingBag className="h-3.5 w-3.5 mr-1.5" />
              Resources
              <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">{resourceGapCount}</Badge>
            </Button>
          )}
          {riskCount > 0 && (
            <Button
              variant={activePanel === 'risks' ? 'default' : 'outline'}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setActivePanel(activePanel === 'risks' ? null : 'risks')}
            >
              <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
              Risks
              <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">{riskCount}</Badge>
            </Button>
          )}
          {suggestionCount > 0 && (
            <Button
              variant={activePanel === 'suggestions' ? 'default' : 'outline'}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setActivePanel(activePanel === 'suggestions' ? null : 'suggestions')}
            >
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              AI
              <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">{suggestionCount}</Badge>
            </Button>
          )}
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 relative min-h-[500px]">
        {viewMode === 'canvas' ? (
          <StrategicCanvas
            planData={planData}
            grouping={grouping}
            onRefresh={loadPlanData}
          />
        ) : (
          <StrategicGantt
            planData={planData}
            grouping={grouping}
          />
        )}
      </div>

      {/* Collapsible bottom panel */}
      {activePanel && (
        <div className="border-t border-slate-100 max-h-[300px] overflow-y-auto">
          {activePanel === 'resources' && (
            <ResourcesPanel
              suggestions={goal.resource_suggestions || []}
              onClose={() => setActivePanel(null)}
            />
          )}
          {activePanel === 'risks' && (
            <RisksPanel
              risks={goal.strategic_risks || []}
              criticalPathTaskIds={planData.criticalPathTaskIds}
              onClose={() => setActivePanel(null)}
            />
          )}
          {activePanel === 'suggestions' && (
            <AISuggestionsPanel
              suggestions={goal.ai_suggestions || []}
              objectiveId={objectiveId}
              onRefresh={loadPlanData}
              onClose={() => setActivePanel(null)}
            />
          )}
        </div>
      )}
    </div>
  )
}
