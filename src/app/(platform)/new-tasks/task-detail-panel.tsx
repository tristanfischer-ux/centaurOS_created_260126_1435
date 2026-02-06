'use client'

import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { getStatusBadgeClass } from '@/lib/status-colors'
import {
  X, Calendar, Clock, User, Target, FileText, AlertTriangle,
  MessageSquare, Paperclip, Shield, Eye,
} from 'lucide-react'
import type { TaskWithData } from './types'

interface TaskDetailPanelProps {
  task: TaskWithData
  onClose: () => void
}

function DetailRow({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
          {label}
        </div>
        <div className="text-sm text-foreground break-words">
          {children}
        </div>
      </div>
    </div>
  )
}

export function TaskDetailPanel({ task, onClose }: TaskDetailPanelProps) {
  const isOverdue = task.end_date && task.status !== 'Completed' && task.status !== 'Rejected' && new Date(task.end_date) < new Date()
  const statusBadge = getStatusBadgeClass(task.status)

  return (
    <div className="h-full flex flex-col bg-white border-l border-slate-100 overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={cn('text-[10px]', statusBadge)}>
              {task.status.replace(/_/g, ' ')}
            </Badge>
            {task.risk_level && task.risk_level !== 'Low' && (
              <Badge variant="outline" className={cn(
                'text-[10px]',
                task.risk_level === 'High' ? 'border-status-error/30 text-status-error' : 'border-status-warning/30 text-status-warning'
              )}>
                {task.risk_level} Risk
              </Badge>
            )}
            {task.task_number && (
              <span className="text-[10px] font-mono text-muted-foreground">
                #{task.task_number}
              </span>
            )}
          </div>
          <h2 className="text-base font-semibold text-foreground leading-snug break-words">
            {task.title}
          </h2>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="flex-shrink-0 h-8 w-8">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 w-full">
        <div className="p-5 space-y-4 overflow-hidden">
          {/* Description */}
          {task.description && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                <FileText className="h-3.5 w-3.5" />
                Description
              </div>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">
                {task.description}
              </p>
            </div>
          )}

          <Separator />

          {/* Metadata */}
          <div className="space-y-1">
            {/* Assignee */}
            <DetailRow icon={User} label="Assignee">
              {task.assignees && task.assignees.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {task.assignees.map(a => (
                    <span key={a.id} className="inline-flex items-center gap-1 text-sm">
                      <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[8px] font-semibold text-muted-foreground">
                        {(a.full_name || '?')[0].toUpperCase()}
                      </div>
                      {a.full_name}
                    </span>
                  ))}
                </div>
              ) : task.assignee?.full_name ? (
                <span className="inline-flex items-center gap-1.5">
                  <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[8px] font-semibold text-muted-foreground">
                    {task.assignee.full_name[0].toUpperCase()}
                  </div>
                  {task.assignee.full_name}
                </span>
              ) : (
                <span className="text-muted-foreground">Unassigned</span>
              )}
            </DetailRow>

            {/* Creator */}
            {task.creator?.full_name && (
              <DetailRow icon={User} label="Created by">
                {task.creator.full_name}
              </DetailRow>
            )}

            {/* Objective */}
            {task.objective && (
              <DetailRow icon={Target} label="Objective">
                {task.objective.title}
              </DetailRow>
            )}

            {/* Due date */}
            {task.end_date && (
              <DetailRow icon={Calendar} label="Due Date">
                <span className={cn(isOverdue && 'text-status-error font-medium')}>
                  {isOverdue && (
                    <AlertTriangle className="h-3.5 w-3.5 inline mr-1" />
                  )}
                  {new Date(task.end_date).toLocaleDateString('en-GB', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                  {isOverdue && ' (Overdue)'}
                </span>
              </DetailRow>
            )}

            {/* Start date */}
            {task.start_date && (
              <DetailRow icon={Clock} label="Start Date">
                {new Date(task.start_date).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </DetailRow>
            )}

            {/* Risk level */}
            {task.risk_level && (
              <DetailRow icon={Shield} label="Risk Level">
                <Badge variant="outline" className={cn(
                  'text-[10px]',
                  task.risk_level === 'High'
                    ? 'border-status-error/30 text-status-error'
                    : task.risk_level === 'Medium'
                    ? 'border-status-warning/30 text-status-warning'
                    : 'border-muted-foreground/30 text-muted-foreground'
                )}>
                  {task.risk_level}
                </Badge>
              </DetailRow>
            )}

            {/* Visibility */}
            {task.client_visible && (
              <DetailRow icon={Eye} label="Visibility">
                <Badge variant="outline" className="text-[10px] border-status-info/30 text-status-info">
                  Client Visible
                </Badge>
              </DetailRow>
            )}
          </div>

          {/* Attachments */}
          {task.task_files.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  <Paperclip className="h-3.5 w-3.5" />
                  Attachments ({task.task_files.length})
                </div>
                <div className="space-y-1">
                  {task.task_files.map(file => (
                    <div key={file.id} className="flex items-center gap-2 py-1.5 px-2 rounded-md bg-muted/30 text-sm">
                      <Paperclip className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="truncate text-foreground">{file.file_name}</span>
                      {file.file_size && (
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">
                          {(file.file_size / 1024).toFixed(0)} KB
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Messages indicator */}
          {task.message_count > 0 && (
            <>
              <Separator />
              <div className="flex items-center gap-2 py-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {task.message_count} message{task.message_count !== 1 ? 's' : ''} in thread
                </span>
              </div>
            </>
          )}

          {/* Rejection reason */}
          {task.status === 'Rejected' && task.rejection_reason && (
            <>
              <Separator />
              <div className="space-y-1.5 bg-status-error/5 rounded-lg p-3 border border-status-error/20">
                <div className="text-[11px] font-medium text-status-error uppercase tracking-wider">
                  Rejection Reason
                </div>
                <p className="text-sm text-foreground">
                  {task.rejection_reason}
                </p>
              </div>
            </>
          )}

          {/* Amendment notes */}
          {task.amendment_notes && (
            <>
              <Separator />
              <div className="space-y-1.5 bg-status-warning/5 rounded-lg p-3 border border-status-warning/20">
                <div className="text-[11px] font-medium text-status-warning uppercase tracking-wider">
                  Amendment Notes
                </div>
                <p className="text-sm text-foreground">
                  {task.amendment_notes}
                </p>
              </div>
            </>
          )}

          {/* Created/Updated timestamps */}
          <Separator />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              Created {new Date(task.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            <span>
              Updated {new Date(task.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
