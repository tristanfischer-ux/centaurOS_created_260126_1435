'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { CalendarDays, UserSearch, Briefcase, GraduationCap, Clock, Pencil, Check, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { updateHiringRequirementDate, updateHiringRequirementStatus } from '@/actions/business-plan'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { SavedHiringRequirement } from '@/lib/business-plan-types'

interface HiringTimelineProps {
  requirements: SavedHiringRequirement[]
}

const ROLE_TYPE_CONFIG = {
  full_time: {
    label: 'Full-time',
    icon: Briefcase,
    color: 'bg-status-info-light text-status-info',
  },
  fractional: {
    label: 'Fractional',
    icon: Clock,
    color: 'bg-status-warning-light text-status-warning',
  },
  apprentice: {
    label: 'Apprentice',
    icon: GraduationCap,
    color: 'bg-status-success-light text-status-success',
  },
} as const

const STATUS_CONFIG = {
  planned: { label: 'Planned', color: 'bg-muted text-muted-foreground' },
  recruiting: { label: 'Recruiting', color: 'bg-status-info-light text-status-info' },
  hired: { label: 'Hired', color: 'bg-status-success-light text-status-success' },
  cancelled: { label: 'Cancelled', color: 'bg-muted text-muted-foreground opacity-50' },
} satisfies Record<string, { label: string; color: string }>

const HIRING_STATUSES = ['planned', 'recruiting', 'hired'] as const

/**
 * @description Hiring timeline grouped by role type (Full-time, Fractional, Apprentice).
 * Each hire card shows role, reason, linked objective, AI-suggested date (user-editable),
 * status progression (planned → recruiting → hired), and a deep-link to /recruits for
 * fractional roles.
 */
export function HiringTimeline({ requirements }: HiringTimelineProps) {
  const router = useRouter()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDate, setEditDate] = useState('')
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  if (requirements.length === 0) {
    return (
      <EmptyState
        title="No hiring plan yet"
        description="Upload your business plan on the Strategy page to automatically generate a hiring timeline"
        action={
          <Button variant="outline" asChild>
            <a href="/strategy">Go to Strategy</a>
          </Button>
        }
      />
    )
  }

  const grouped = {
    full_time: requirements.filter(r => r.role_type === 'full_time'),
    fractional: requirements.filter(r => r.role_type === 'fractional'),
    apprentice: requirements.filter(r => r.role_type === 'apprentice'),
  }

  async function handleSaveDate(id: string): Promise<void> {
    const result = await updateHiringRequirementDate(id, editDate || null)
    if (result.error) {
      toast.error('Failed to update date')
      return
    }
    setEditingId(null)
    router.refresh()
  }

  async function handleStatusChange(
    id: string,
    status: SavedHiringRequirement['status']
  ): Promise<void> {
    setUpdatingId(id)
    const result = await updateHiringRequirementStatus(id, status)
    setUpdatingId(null)
    if (result.error) {
      toast.error('Failed to update status')
      return
    }
    router.refresh()
  }

  function getDisplayDate(req: SavedHiringRequirement): string | null {
    const date = req.user_override_date || req.ai_suggested_date
    if (!date) return null
    try {
      return format(parseISO(date), 'MMM d, yyyy')
    } catch {
      return null
    }
  }

  return (
    <div className="space-y-6">
      {/* Legend */}
      <div className="flex items-center gap-6 text-sm">
        <span className="text-muted-foreground font-medium">Role types:</span>
        {(Object.keys(ROLE_TYPE_CONFIG) as Array<keyof typeof ROLE_TYPE_CONFIG>).map((type) => {
          const config = ROLE_TYPE_CONFIG[type]
          const Icon = config.icon
          return (
            <div key={type} className="flex items-center gap-1.5">
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-foreground font-medium">{config.label}</span>
            </div>
          )
        })}
      </div>

      {(Object.keys(grouped) as Array<keyof typeof grouped>).map((type) => {
        const items = grouped[type]
        if (items.length === 0) return null
        const config = ROLE_TYPE_CONFIG[type]
        const Icon = config.icon

        return (
          <div key={type}>
            <div className="flex items-center gap-2 mb-3">
              <Icon className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-medium text-foreground">{config.label} Hires</h3>
              <Badge variant="secondary">{items.length}</Badge>
            </div>
            <div className="space-y-3">
              {items.map((req) => {
                const displayDate = getDisplayDate(req)
                const isEditing = editingId === req.id

                return (
                  <Card key={req.id} className={cn('border', req.status === 'cancelled' && 'opacity-50')}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-foreground text-sm">{req.role_title}</p>
                            <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', config.color)}>
                              {config.label}
                            </span>
                          </div>
                          {req.reason && (
                            <p className="text-xs text-muted-foreground mt-1">{req.reason}</p>
                          )}
                          {req.linked_objective_title && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Needed for: <span className="text-foreground">{req.linked_objective_title}</span>
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          {/* Date editing */}
                          {isEditing ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="date"
                                value={editDate}
                                onChange={(e) => setEditDate(e.target.value)}
                                className="text-xs border rounded px-2 py-1 bg-background"
                              />
                              <button
                                onClick={() => handleSaveDate(req.id)}
                                className="p-1 rounded text-status-success hover:bg-status-success-light"
                                aria-label="Save date"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="p-1 rounded text-muted-foreground hover:text-foreground"
                                aria-label="Cancel editing"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <CalendarDays className="h-3.5 w-3.5" />
                              <span>{displayDate ?? 'No date set'}</span>
                              {req.user_override_date && (
                                <span className="text-xs text-status-info">(edited)</span>
                              )}
                              <button
                                onClick={() => {
                                  setEditingId(req.id)
                                  setEditDate(req.user_override_date || req.ai_suggested_date || '')
                                }}
                                className="p-1 rounded text-muted-foreground hover:text-foreground"
                                aria-label="Edit date"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            </div>
                          )}

                          {/* Status progression */}
                          <div className="flex items-center gap-1">
                            {HIRING_STATUSES.map((status) => (
                              <button
                                key={status}
                                disabled={req.status === status || updatingId === req.id}
                                onClick={() => handleStatusChange(req.id, status)}
                                className={cn(
                                  'px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors border',
                                  req.status === status
                                    ? STATUS_CONFIG[status].color + ' border-transparent'
                                    : 'bg-transparent text-muted-foreground border-transparent hover:border-border hover:text-foreground'
                                )}
                              >
                                {STATUS_CONFIG[status].label}
                              </button>
                            ))}
                          </div>

                          {type === 'fractional' && (
                            <Button variant="ghost" size="sm" className="text-xs gap-1" asChild>
                              <a href="/recruits">
                                <UserSearch className="h-3.5 w-3.5" />
                                Find
                              </a>
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
