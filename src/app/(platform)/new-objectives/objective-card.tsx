'use client'

import { useTransition } from 'react'
import { cn } from '@/lib/utils'
import { ProgressRing, getHealthVariant } from '@/components/ui/progress-ring'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { AlertTriangle, ListChecks, Trash, Pencil, Flag, Link2, Loader2 } from 'lucide-react'
import { UserAvatar } from '@/components/ui/user-avatar'
import { linkObjectiveToStrategic } from '@/actions/objectives'
import { toast } from 'sonner'
import type { ObjectiveWithTasks, StrategicObjective } from './types'

interface ObjectiveCardProps {
  objective: ObjectiveWithTasks
  /** Available strategic objectives for linking */
  strategicObjectives?: StrategicObjective[]
  isSelected: boolean
  onSelect: (id: string) => void
  onEdit?: (objective: ObjectiveWithTasks) => void
  onDelete?: (objectiveId: string) => void
}

const HEALTH_BORDER: Record<string, string> = {
  'on-track': 'border-l-status-success',
  'at-risk': 'border-l-status-warning',
  'off-track': 'border-l-status-error',
  'completed': 'border-l-status-success',
  'not-started': 'border-l-muted-foreground/30',
}

const HEALTH_LABEL: Record<string, { text: string; className: string }> = {
  'on-track': { text: 'On Track', className: 'bg-status-success/10 text-status-success border-status-success/20' },
  'at-risk': { text: 'At Risk', className: 'bg-status-warning/10 text-status-warning border-status-warning/20' },
  'off-track': { text: 'Off Track', className: 'bg-status-error/10 text-status-error border-status-error/20' },
  'completed': { text: 'Completed', className: 'bg-status-success/10 text-status-success border-status-success/20' },
  'not-started': { text: 'Not Started', className: 'bg-muted text-muted-foreground border-muted-foreground/20' },
}

export function ObjectiveCard({ objective, strategicObjectives = [], isSelected, onSelect, onEdit, onDelete }: ObjectiveCardProps) {
  const { title, description, progress, health, totalTasks, completedTasks, overdueTasks, tasks, parent_objective_id } = objective
  const variant = getHealthVariant(progress)
  const [isLinking, startLinking] = useTransition()

  // Find linked strategic objective
  const linkedStrategic = strategicObjectives.find(s => s.id === parent_objective_id) || null

  /** Handle linking/unlinking to a strategic objective */
  const handleLink = (strategicId: string | null) => {
    startLinking(async () => {
      const result = await linkObjectiveToStrategic(objective.id, strategicId)
      if (result.error) {
        toast.error(result.error)
      }
    })
  }

  // Get unique assignees across all tasks
  const uniqueAssignees = new Map<string, { id: string; full_name: string | null }>()
  tasks.forEach(t => {
    if (t.assignee?.id) uniqueAssignees.set(t.assignee.id, t.assignee)
    t.assignees?.forEach(a => { if (a?.id) uniqueAssignees.set(a.id, a) })
  })
  const assigneeList = Array.from(uniqueAssignees.values()).slice(0, 3)
  const extraAssignees = uniqueAssignees.size - 3

  const healthInfo = HEALTH_LABEL[health] || HEALTH_LABEL['not-started']

  return (
    <div
      className={cn(
        'w-full text-left rounded-xl border-l-4 border bg-card group relative',
        'transition-all duration-200 hover:shadow-md hover:-translate-y-0.5',
        HEALTH_BORDER[health] || 'border-l-muted',
        isSelected
          ? 'ring-2 ring-international-orange/30 shadow-md'
          : 'hover:border-foreground/10'
      )}
    >
      {/* Action buttons - visible on hover */}
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        {onEdit && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 bg-background hover:bg-muted"
            onClick={(e) => {
              e.stopPropagation()
              onEdit(objective)
            }}
            aria-label="Edit objective"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
        {onDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 bg-background hover:bg-destructive/10 hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(objective.id)
            }}
            aria-label="Delete objective"
          >
            <Trash className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Using div+role instead of <button> to avoid invalid nested <button> 
           from the Popover trigger inside this clickable area */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(objective.id)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(objective.id) } }}
        className="w-full p-4 space-y-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl cursor-pointer"
      >
        {/* Header: Title + Health Badge */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">
              {title}
            </h3>
            {objective.is_demo && (
              <span className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground bg-muted rounded px-1.5 py-0 shrink-0 font-medium">
                Demo
              </span>
            )}
          </div>
          <Badge variant="outline" className={cn('text-[10px] flex-shrink-0 border', healthInfo.className)}>
            {healthInfo.text}
          </Badge>
        </div>

        {/* Strategic Objective Link */}
        {strategicObjectives.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  'flex items-center gap-1.5 text-[11px] rounded-md px-2 py-0.5 transition-colors max-w-full overflow-hidden',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  linkedStrategic
                    ? 'bg-international-orange/5 text-international-orange hover:bg-international-orange/10'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                )}
                onClick={(e) => e.stopPropagation()}
              >
                {isLinking ? (
                  <Loader2 className="h-3 w-3 flex-shrink-0 animate-spin" />
                ) : linkedStrategic ? (
                  <Flag className="h-3 w-3 flex-shrink-0" />
                ) : (
                  <Link2 className="h-3 w-3 flex-shrink-0" />
                )}
                <span className="truncate min-w-0">
                  {linkedStrategic ? linkedStrategic.title : 'Link to strategy'}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="w-56 p-1"
              align="start"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-xs font-medium text-muted-foreground px-2 py-1.5">
                Link to strategic objective
              </div>
              {/* Unlink option */}
              {linkedStrategic && (
                <button
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-muted transition-colors text-muted-foreground"
                  onClick={() => handleLink(null)}
                >
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                  Unlink
                </button>
              )}
              {/* Strategic objective options */}
              {strategicObjectives.map((s) => (
                <button
                  key={s.id}
                  className={cn(
                    'w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-muted transition-colors',
                    s.id === parent_objective_id
                      ? 'text-international-orange font-medium'
                      : 'text-foreground'
                  )}
                  onClick={() => handleLink(s.id === parent_objective_id ? null : s.id)}
                >
                  <span
                    className={cn(
                      'h-2 w-2 rounded-full',
                      s.id === parent_objective_id ? 'bg-international-orange' : 'bg-muted-foreground/30'
                    )}
                  />
                  <span className="truncate">{s.title}</span>
                </button>
              ))}
            </PopoverContent>
          </Popover>
        )}

        {/* Description */}
        {description && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {description}
          </p>
        )}

        {/* Progress + Stats Row */}
        <div className="flex items-center gap-4">
          <ProgressRing progress={progress} size={40} strokeWidth={3} variant={variant} />

          <div className="flex-1 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <ListChecks className="h-3.5 w-3.5" />
              <span className="tabular-nums">{completedTasks}/{totalTasks}</span>
            </span>
            {overdueTasks > 0 && (
              <span className="inline-flex items-center gap-1 text-status-error">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span className="tabular-nums">{overdueTasks}</span>
              </span>
            )}
          </div>

          {/* Assignee avatars */}
          {assigneeList.length > 0 && (
            <div className="flex -space-x-1.5">
              {assigneeList.map((a) => (
                <UserAvatar key={a.id} name={a.full_name} size="xs" />
              ))}
              {extraAssignees > 0 && (
                <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-[9px] font-medium text-muted-foreground">
                  +{extraAssignees}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
