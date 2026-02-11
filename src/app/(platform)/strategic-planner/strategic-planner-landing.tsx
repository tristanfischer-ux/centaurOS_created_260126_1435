"use client"

/**
 * @description Landing page for the Strategic Planner.
 * Lists existing strategic goals and provides a CTA to create new ones.
 */

import Link from "next/link"
import { format, differenceInDays } from "date-fns"
import {
  Map,
  Plus,
  Calendar,
  Clock,
  BarChart3,
  ArrowRight,
  Target,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { StatusBadge } from "@/components/ui/status-badge"
import { typography } from "@/lib/design-system"
import { cn } from "@/lib/utils"

interface StrategicGoal {
  id: string
  title: string
  description: string | null
  status: string | null
  progress: number | null
  milestone_date: string | null
  created_at: string | null
}

interface StrategicPlannerLandingProps {
  goals: StrategicGoal[]
}

export function StrategicPlannerLanding({ goals }: StrategicPlannerLandingProps) {
  return (
    <div>
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100 mb-8">
        <div className="min-w-0 flex-1">
          <div className={typography.pageHeader}>
            <div className={typography.pageHeaderAccent} />
            <h1 className={typography.h1}>Strategic Planner</h1>
          </div>
          <p className={typography.pageSubtitle}>
            Set big goals with deadlines. AI builds the full plan.
          </p>
        </div>
        <Link href="/new-objectives?mode=strategic">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Strategic Goal
          </Button>
        </Link>
      </div>

      {goals.length === 0 ? (
        <EmptyState
          title="No strategic goals yet"
          description="Create a strategic goal with a deadline to get started. AI will build a full plan with phases, tasks, and resource recommendations."
          action={
            <Link href="/new-objectives?mode=strategic">
              <Button>
                <Map className="h-4 w-4 mr-2" />
                Create Your First Strategic Goal
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {goals.map((goal) => {
            const daysRemaining = goal.milestone_date
              ? differenceInDays(new Date(goal.milestone_date), new Date())
              : null

            return (
              <Link key={goal.id} href={`/strategic-planner/${goal.id}`}>
                <Card className="border hover:shadow-md transition-shadow cursor-pointer group">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-international-orange/10 flex items-center justify-center flex-shrink-0">
                          <Target className="w-4 h-4 text-international-orange" />
                        </div>
                        <CardTitle className="text-base font-semibold line-clamp-2 group-hover:text-international-orange transition-colors">
                          {goal.title}
                        </CardTitle>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-international-orange transition-colors flex-shrink-0 mt-1" />
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {goal.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                        {goal.description}
                      </p>
                    )}

                    {/* Progress bar */}
                    <div className="mb-3">
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-medium text-foreground">{goal.progress || 0}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-international-orange transition-all"
                          style={{ width: `${Math.min(100, goal.progress || 0)}%` }}
                        />
                      </div>
                    </div>

                    {/* Metadata */}
                    <div className="flex items-center flex-wrap gap-3">
                      {goal.milestone_date && (
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          <span>{format(new Date(goal.milestone_date), 'MMM d, yyyy')}</span>
                        </div>
                      )}
                      {daysRemaining !== null && (
                        <div className={cn(
                          "flex items-center gap-1 text-[11px] font-medium",
                          daysRemaining < 0 ? "text-destructive" :
                          daysRemaining < 30 ? "text-status-warning-dark" :
                          "text-status-success-dark"
                        )}>
                          <Clock className="h-3 w-3" />
                          <span>
                            {daysRemaining < 0
                              ? `${Math.abs(daysRemaining)}d overdue`
                              : `${daysRemaining}d left`
                            }
                          </span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
