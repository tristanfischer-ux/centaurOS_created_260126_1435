/**
 * ObjectivesProgress — Active objectives with progress bars.
 *
 * @description Displays the user's top active objectives with visual progress
 * indicators. Progress is computed from task completion percentage. Color-coded
 * by health: green (on track), amber (at risk), red (overdue or behind).
 *
 * @component
 */

'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Target, ArrowRight, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ObjectivesProgressProps {
  /** Top objectives with computed progress */
  objectives: Array<{
    id: string
    title: string
    progress: number
    dueDate: string | null
    totalTasks: number
    completedTasks: number
  }>
}

/**
 * Returns progress bar color classes based on completion percentage and due date.
 *
 * @param {number} progress - 0-100 completion percentage
 * @param {string | null} dueDate - ISO date string or null
 * @returns {string} Tailwind classes for the progress bar fill
 */
function getProgressColor(progress: number, dueDate: string | null): string {
  // Check if overdue
  if (dueDate) {
    const due = new Date(dueDate)
    const now = new Date()
    if (due < now && progress < 100) {
      return 'bg-destructive'
    }
  }
  if (progress >= 75) return 'bg-status-success'
  if (progress >= 40) return 'bg-status-warning'
  return 'bg-international-orange'
}

/**
 * Formats a due date relative to now.
 *
 * @param {string | null} dueDate - ISO date string
 * @returns {string} Human-readable due date
 */
function formatDueDate(dueDate: string | null): string {
  if (!dueDate) return 'No due date'
  const due = new Date(dueDate)
  const now = new Date()
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`
  if (diffDays === 0) return 'Due today'
  if (diffDays === 1) return 'Due tomorrow'
  if (diffDays <= 7) return `${diffDays}d left`
  if (diffDays <= 30) return `${Math.ceil(diffDays / 7)}w left`
  return due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function ObjectivesProgress({ objectives }: ObjectivesProgressProps): React.ReactElement {
  const hasObjectives = objectives.length > 0

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-1 h-6 bg-electric-blue rounded-full" />
            <CardTitle className="text-base">Objectives</CardTitle>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/new-objectives" className="text-muted-foreground hover:text-foreground">
              View all
              <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {hasObjectives ? (
          <div className="space-y-4">
            {objectives.map((obj) => (
              <Link
                key={obj.id}
                href={`/new-objectives?objective=${obj.id}`}
                className="block group"
              >
                <div className="space-y-2">
                  {/* Title row */}
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-foreground group-hover:text-international-orange transition-colors line-clamp-1 min-w-0">
                      {obj.title}
                    </p>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {obj.progress}%
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-500',
                        getProgressColor(obj.progress, obj.dueDate),
                      )}
                      style={{ width: `${Math.min(obj.progress, 100)}%` }}
                    />
                  </div>

                  {/* Metadata */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      {obj.completedTasks}/{obj.totalTasks} tasks
                    </span>
                    <span className={cn(
                      obj.dueDate && new Date(obj.dueDate) < new Date() && obj.progress < 100
                        ? 'text-destructive'
                        : 'text-muted-foreground',
                    )}>
                      {formatDueDate(obj.dueDate)}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-6">
            <div className="w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center mb-3">
              <Target className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">
              No active objectives
            </p>
            <p className="text-xs text-muted-foreground mb-4 text-center">
              Set objectives to track what matters most
            </p>
            <Button variant="outline" size="sm" asChild>
              <Link href="/new-objectives">
                Create an objective
                <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
