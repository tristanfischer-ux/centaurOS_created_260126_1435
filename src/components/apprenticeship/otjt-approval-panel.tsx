// @ts-nocheck
'use client'

import { useState, useEffect, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { UserAvatar } from '@/components/ui/user-avatar'
import { Textarea } from '@/components/ui/textarea'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { 
  Clock, 
  CheckCircle2, 
  XCircle,
  MessageSquare,
  Calendar,
  FileText,
  BookOpen,
  Users,
  Briefcase,
  GraduationCap,
  Eye,
  AlertCircle,
  Loader2
} from 'lucide-react'
import { 
  getPendingOTJTApprovals, 
  approveOTJTLog, 
  rejectOTJTLog, 
  queryOTJTLog,
  bulkApproveOTJTLogs
} from '@/actions/otjt-tracking'
import { ACTIVITY_TYPE_LABELS, type ActivityType } from '@/types/apprenticeship'

interface PendingLog {
  id: string
  enrollment_id: string
  log_date: string
  hours: number
  activity_type: ActivityType
  description: string | null
  learning_outcomes: string | null
  status: string
  evidence_url: string | null
  created_at: string
  enrollment?: {
    apprentice?: {
      full_name: string
      avatar_url: string | null
    }
    programme?: {
      title: string
    }
  }
  module?: {
    title: string
  }
  task?: {
    title: string
  }
}

interface OTJTApprovalPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const activityIcons: Record<ActivityType, typeof Clock> = {
  learning_module: BookOpen,
  mentoring: Users,
  workshop: GraduationCap,
  self_study: FileText,
  project_training: Briefcase,
  assessment: FileText,
  shadowing: Eye,
  external_training: GraduationCap,
  other: FileText
}

export function OTJTApprovalPanel({ open, onOpenChange }: OTJTApprovalPanelProps) {
  const [logs, setLogs] = useState<PendingLog[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedLogs, setSelectedLogs] = useState<Set<string>>(new Set())
  const [actionLog, setActionLog] = useState<PendingLog | null>(null)
  const [actionType, setActionType] = useState<'reject' | 'query' | null>(null)
  const [actionReason, setActionReason] = useState('')
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (open) {
      loadPendingApprovals()
    }
  }, [open])

  async function loadPendingApprovals() {
    setLoading(true)
    const result = await getPendingOTJTApprovals()
    if (result.logs) {
      setLogs(result.logs as PendingLog[])
    }
    setSelectedLogs(new Set())
    setLoading(false)
  }

  function toggleLogSelection(logId: string) {
    const newSelected = new Set(selectedLogs)
    if (newSelected.has(logId)) {
      newSelected.delete(logId)
    } else {
      newSelected.add(logId)
    }
    setSelectedLogs(newSelected)
  }

  function selectAll() {
    if (selectedLogs.size === logs.length) {
      setSelectedLogs(new Set())
    } else {
      setSelectedLogs(new Set(logs.map(l => l.id)))
    }
  }

  async function handleApprove(logId: string) {
    startTransition(async () => {
      const result = await approveOTJTLog(logId)
      if (result.success) {
        setLogs(logs.filter(l => l.id !== logId))
        setSelectedLogs(prev => {
          const newSet = new Set(prev)
          newSet.delete(logId)
          return newSet
        })
      }
    })
  }

  async function handleBulkApprove() {
    if (selectedLogs.size === 0) return
    
    startTransition(async () => {
      const result = await bulkApproveOTJTLogs(Array.from(selectedLogs))
      if (result.success) {
        setLogs(logs.filter(l => !selectedLogs.has(l.id)))
        setSelectedLogs(new Set())
      }
    })
  }

  async function handleReject() {
    if (!actionLog || !actionReason.trim()) return
    
    startTransition(async () => {
      const result = await rejectOTJTLog(actionLog.id, actionReason)
      if (result.success) {
        setLogs(logs.filter(l => l.id !== actionLog.id))
        setActionLog(null)
        setActionType(null)
        setActionReason('')
      }
    })
  }

  async function handleQuery() {
    if (!actionLog || !actionReason.trim()) return
    
    startTransition(async () => {
      const result = await queryOTJTLog(actionLog.id, actionReason)
      if (result.success) {
        setLogs(logs.filter(l => l.id !== actionLog.id))
        setActionLog(null)
        setActionType(null)
        setActionReason('')
      }
    })
  }

  function openRejectDialog(log: PendingLog) {
    setActionLog(log)
    setActionType('reject')
    setActionReason('')
  }

  function openQueryDialog(log: PendingLog) {
    setActionLog(log)
    setActionType('query')
    setActionReason('')
  }

  // Group logs by apprentice
  const logsByApprentice = logs.reduce((acc, log) => {
    const name = log.enrollment?.apprentice?.full_name || 'Unknown'
    if (!acc[name]) {
      acc[name] = {
        apprentice: log.enrollment?.apprentice,
        programme: log.enrollment?.programme?.title,
        logs: []
      }
    }
    acc[name].logs.push(log)
    return acc
  }, {} as Record<string, { apprentice?: { full_name: string; avatar_url: string | null }; programme?: string; logs: PendingLog[] }>)

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:w-[600px] sm:max-w-full overflow-y-auto">
          <SheetHeader className="pb-4 border-b">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-1 w-8 bg-international-orange rounded-full" />
            </div>
            <SheetTitle className="text-xl">OTJT Hours Approval</SheetTitle>
            <p className="text-sm text-muted-foreground">
              Review and approve off-the-job training hours logged by your apprentices
            </p>
          </SheetHeader>

          <div className="py-6 space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle2 className="h-12 w-12 mx-auto text-status-success mb-4" />
                <h3 className="text-lg font-semibold mb-2">All caught up!</h3>
                <p className="text-muted-foreground">
                  No pending OTJT hours to review.
                </p>
              </div>
            ) : (
              <>
                {/* Bulk Actions */}
                <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    <Checkbox 
                      checked={selectedLogs.size === logs.length && logs.length > 0}
                      onCheckedChange={selectAll}
                      aria-label="Select all logs"
                    />
                    <span className="text-sm text-muted-foreground">
                      {selectedLogs.size > 0 
                        ? `${selectedLogs.size} selected` 
                        : `${logs.length} pending`}
                    </span>
                  </div>
                  {selectedLogs.size > 0 && (
                    <Button 
                      size="sm" 
                      onClick={handleBulkApprove}
                      disabled={isPending}
                    >
                      {isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                      )}
                      Approve Selected
                    </Button>
                  )}
                </div>

                {/* Grouped by Apprentice */}
                <div className="space-y-6">
                  {Object.entries(logsByApprentice).map(([name, { apprentice, programme, logs: apprenticeLogs }]) => (
                    <Card key={name}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center gap-3">
                          <UserAvatar 
                            name={name} 
                            avatarUrl={apprentice?.avatar_url}
                            role="Apprentice"
                            size="md"
                          />
                          <div>
                            <CardTitle className="text-base">{name}</CardTitle>
                            <p className="text-sm text-muted-foreground">{programme}</p>
                          </div>
                          <Badge variant="warning" className="ml-auto">
                            {apprenticeLogs.length} pending
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {apprenticeLogs.map((log) => {
                          const ActivityIcon = activityIcons[log.activity_type] || FileText
                          const activityInfo = ACTIVITY_TYPE_LABELS[log.activity_type]
                          
                          return (
                            <div 
                              key={log.id} 
                              className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg"
                            >
                              <Checkbox 
                                checked={selectedLogs.has(log.id)}
                                onCheckedChange={() => toggleLogSelection(log.id)}
                                aria-label={`Select log from ${log.log_date}`}
                              />
                              
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge variant="secondary" className="text-xs">
                                    <ActivityIcon className="h-3 w-3 mr-1" />
                                    {activityInfo?.label || log.activity_type}
                                  </Badge>
                                  <span className="text-sm font-medium">
                                    {log.hours} {log.hours === 1 ? 'hour' : 'hours'}
                                  </span>
                                </div>
                                
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                                  <Calendar className="h-3 w-3" />
                                  {new Date(log.log_date).toLocaleDateString('en-GB', {
                                    weekday: 'short',
                                    day: 'numeric',
                                    month: 'short'
                                  })}
                                  {log.module && (
                                    <>
                                      <span>•</span>
                                      <BookOpen className="h-3 w-3" />
                                      {log.module.title}
                                    </>
                                  )}
                                </div>
                                
                                {log.description && (
                                  <p className="text-sm text-foreground mb-2 line-clamp-2">
                                    {log.description}
                                  </p>
                                )}
                                
                                {log.learning_outcomes && (
                                  <p className="text-xs text-muted-foreground italic line-clamp-1">
                                    Outcomes: {log.learning_outcomes}
                                  </p>
                                )}
                              </div>
                              
                              <div className="flex flex-col gap-1">
                                <Button 
                                  size="sm" 
                                  variant="ghost"
                                  className="h-8 text-status-success hover:text-status-success hover:bg-status-success-light"
                                  onClick={() => handleApprove(log.id)}
                                  disabled={isPending}
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="ghost"
                                  className="h-8 text-status-warning hover:text-status-warning hover:bg-status-warning-light"
                                  onClick={() => openQueryDialog(log)}
                                >
                                  <MessageSquare className="h-4 w-4" />
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="ghost"
                                  className="h-8 text-destructive hover:text-destructive hover:bg-status-error-light"
                                  onClick={() => openRejectDialog(log)}
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          )
                        })}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Reject/Query Dialog */}
      <Dialog open={actionType !== null} onOpenChange={() => {
        setActionType(null)
        setActionLog(null)
        setActionReason('')
      }}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {actionType === 'reject' ? (
                <>
                  <XCircle className="h-5 w-5 text-destructive" />
                  Reject OTJT Log
                </>
              ) : (
                <>
                  <MessageSquare className="h-5 w-5 text-status-warning" />
                  Request More Information
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          
          {actionLog && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="secondary" className="text-xs">
                    {ACTIVITY_TYPE_LABELS[actionLog.activity_type]?.label || actionLog.activity_type}
                  </Badge>
                  <span className="text-sm font-medium">
                    {actionLog.hours} hours on {new Date(actionLog.log_date).toLocaleDateString('en-GB')}
                  </span>
                </div>
                {actionLog.description && (
                  <p className="text-sm text-muted-foreground">
                    {actionLog.description}
                  </p>
                )}
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {actionType === 'reject' 
                    ? 'Reason for rejection (required)' 
                    : 'Question or request (required)'}
                </label>
                <Textarea
                  placeholder={actionType === 'reject' 
                    ? "Please explain why this entry is being rejected..."
                    : "What additional information do you need?"
                  }
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  rows={3}
                />
                {actionType === 'reject' && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    The apprentice will be notified and can resubmit corrected hours.
                  </p>
                )}
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button 
              variant="secondary" 
              onClick={() => {
                setActionType(null)
                setActionLog(null)
                setActionReason('')
              }}
            >
              Cancel
            </Button>
            <Button 
              variant={actionType === 'reject' ? 'destructive' : 'default'}
              onClick={actionType === 'reject' ? handleReject : handleQuery}
              disabled={!actionReason.trim() || isPending}
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {actionType === 'reject' ? 'Reject' : 'Send Query'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
