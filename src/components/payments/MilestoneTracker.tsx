'use client'

/**
 * MilestoneTracker Component
 * Displays milestone progress with actions based on user role
 */

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  CheckCircle2,
  Clock,
  Send,
  AlertTriangle,
  DollarSign,
  Flag,
  Loader2,
  CalendarDays,
  Target,
  CircleDashed,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/types/payments'
import type { MilestoneTrackerProps, Milestone, MilestoneStatus } from '@/types/payments'
import {
  submitMilestoneDelivery,
  approveMilestoneDelivery,
  disputeMilestoneDelivery,
} from '@/actions/milestones'
import { toast } from 'sonner'

const STATUS_CONFIG: Record<
  MilestoneStatus,
  { label: string; color: string; icon: React.ReactNode; bgColor: string }
> = {
  pending: {
    label: 'Pending',
    color: 'text-slate-500',
    icon: <CircleDashed className="h-4 w-4" />,
    bgColor: 'bg-slate-100',
  },
  submitted: {
    label: 'Submitted',
    color: 'text-amber-600',
    icon: <Clock className="h-4 w-4" />,
    bgColor: 'bg-amber-100',
  },
  approved: {
    label: 'Approved',
    color: 'text-blue-600',
    icon: <CheckCircle2 className="h-4 w-4" />,
    bgColor: 'bg-blue-100',
  },
  rejected: {
    label: 'Disputed',
    color: 'text-red-600',
    icon: <XCircle className="h-4 w-4" />,
    bgColor: 'bg-red-100',
  },
  paid: {
    label: 'Paid',
    color: 'text-green-600',
    icon: <DollarSign className="h-4 w-4" />,
    bgColor: 'bg-green-100',
  },
}

interface MilestoneItemProps {
  milestone: Milestone
  userRole: 'buyer' | 'seller'
  currency: string
  onSubmit?: (milestoneId: string, notes?: string) => Promise<void>
  onApprove?: (milestoneId: string) => Promise<void>
  onDispute?: (milestoneId: string, reason: string) => Promise<void>
}

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return 'No date set'
  return new Date(dateString).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * Individual Milestone Item
 */
function MilestoneItem({
  milestone,
  userRole,
  currency,
  onSubmit,
  onApprove,
  onDispute,
}: MilestoneItemProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [showSubmitDialog, setShowSubmitDialog] = useState(false)
  const [showDisputeDialog, setShowDisputeDialog] = useState(false)
  const [submitNotes, setSubmitNotes] = useState('')
  const [disputeReason, setDisputeReason] = useState('')

  const statusConfig = STATUS_CONFIG[milestone.status]

  const handleSubmit = async () => {
    if (!onSubmit) return
    setIsLoading(true)
    try {
      await onSubmit(milestone.id, submitNotes || undefined)
      setShowSubmitDialog(false)
      setSubmitNotes('')
      toast.success('Milestone submitted for review')
    } catch {
      toast.error('Failed to submit milestone')
    } finally {
      setIsLoading(false)
    }
  }

  const handleApprove = async () => {
    if (!onApprove) return
    setIsLoading(true)
    try {
      await onApprove(milestone.id)
      toast.success('Milestone approved and payment released')
    } catch {
      toast.error('Failed to approve milestone')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDispute = async () => {
    if (!onDispute || !disputeReason.trim()) return
    setIsLoading(true)
    try {
      await onDispute(milestone.id, disputeReason)
      setShowDisputeDialog(false)
      setDisputeReason('')
      toast.success('Dispute submitted')
    } catch {
      toast.error('Failed to submit dispute')
    } finally {
      setIsLoading(false)
    }
  }

  const canSubmit = userRole === 'seller' && milestone.status === 'pending'
  const canApprove = userRole === 'buyer' && milestone.status === 'submitted'
  const canDispute =
    milestone.status !== 'paid' && milestone.status !== 'rejected'

  return (
    <>
      <div className="border rounded-lg p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h4 className="font-medium truncate">{milestone.title}</h4>
            {milestone.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {milestone.description}
              </p>
            )}
          </div>
          <Badge className={cn('ml-2 flex items-center gap-1', statusConfig.bgColor, statusConfig.color)}>
            {statusConfig.icon}
            {statusConfig.label}
          </Badge>
        </div>

        {/* Details */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1 text-muted-foreground">
            <DollarSign className="h-4 w-4" />
            <span className="font-medium">{formatCurrency(milestone.amount, currency)}</span>
          </div>
          {milestone.dueDate && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <CalendarDays className="h-4 w-4" />
              <span>{formatDate(milestone.dueDate)}</span>
            </div>
          )}
        </div>

        {/* Timestamps */}
        {(milestone.submittedAt || milestone.approvedAt) && (
          <div className="text-xs text-muted-foreground space-y-1">
            {milestone.submittedAt && (
              <p>Submitted: {formatDate(milestone.submittedAt)}</p>
            )}
            {milestone.approvedAt && (
              <p>Approved: {formatDate(milestone.approvedAt)}</p>
            )}
          </div>
        )}

        {/* Actions */}
        {(canSubmit || canApprove || canDispute) && (
          <div className="flex gap-2 pt-2">
            {canSubmit && (
              <Button
                size="sm"
                onClick={() => setShowSubmitDialog(true)}
                disabled={isLoading}
              >
                <Send className="h-4 w-4 mr-1" />
                Submit
              </Button>
            )}
            {canApprove && (
              <Button
                size="sm"
                onClick={handleApprove}
                disabled={isLoading}
                className="bg-green-600 hover:bg-green-700"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                )}
                Approve & Pay
              </Button>
            )}
            {canDispute && milestone.status === 'submitted' && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setShowDisputeDialog(true)}
                disabled={isLoading}
              >
                <Flag className="h-4 w-4 mr-1" />
                Dispute
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Submit Dialog */}
      <Dialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Milestone</DialogTitle>
            <DialogDescription>
              Submit &quot;{milestone.title}&quot; for buyer review. You can add notes about your delivery.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Add notes about your delivery (optional)..."
            value={submitNotes}
            onChange={(e) => setSubmitNotes(e.target.value)}
            rows={4}
          />
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowSubmitDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-1" />
              )}
              Submit for Review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dispute Dialog */}
      <Dialog open={showDisputeDialog} onOpenChange={setShowDisputeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dispute Milestone</DialogTitle>
            <DialogDescription>
              Please provide a reason for disputing &quot;{milestone.title}&quot;. This will pause payment until resolved.
            </DialogDescription>
          </DialogHeader>
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Disputes should be raised only for legitimate issues. Frivolous disputes may affect your account standing.
            </AlertDescription>
          </Alert>
          <Textarea
            placeholder="Describe the issue with this milestone..."
            value={disputeReason}
            onChange={(e) => setDisputeReason(e.target.value)}
            rows={4}
          />
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowDisputeDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDispute}
              disabled={isLoading || disputeReason.trim().length < 10}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Flag className="h-4 w-4 mr-1" />
              )}
              Submit Dispute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * Main MilestoneTracker Component
 */
export function MilestoneTracker({
  milestones,
  userRole,
  onSubmit,
  onApprove,
  onDispute,
  currency = 'GBP',
}: Omit<MilestoneTrackerProps, 'orderId'> & { currency?: string }) {
  // Calculate progress
  const totalMilestones = milestones.length
  const completedMilestones = milestones.filter(
    (m) => m.status === 'paid' || m.status === 'approved'
  ).length
  const progressPercent = totalMilestones > 0
    ? Math.round((completedMilestones / totalMilestones) * 100)
    : 0

  const totalAmount = milestones.reduce((sum, m) => sum + m.amount, 0)
  const paidAmount = milestones
    .filter((m) => m.status === 'paid')
    .reduce((sum, m) => sum + m.amount, 0)

  // Default handlers that use server actions
  const handleSubmit = onSubmit || (async (milestoneId: string, notes?: string) => {
    const result = await submitMilestoneDelivery(milestoneId, notes)
    if (result.error) throw new Error(result.error)
  })

  const handleApprove = onApprove || (async (milestoneId: string) => {
    const result = await approveMilestoneDelivery(milestoneId)
    if (result.error) throw new Error(result.error)
  })

  const handleDispute = onDispute || (async (milestoneId: string, reason: string) => {
    const result = await disputeMilestoneDelivery(milestoneId, reason)
    if (result.error) throw new Error(result.error)
  })

  if (milestones.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">
            <Target className="h-8 w-8 mx-auto mb-2 text-slate-400" />
            <p>No milestones defined for this order</p>
            <p className="text-sm mt-1">
              Payment will be released in full upon completion
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Target className="h-5 w-5" />
            Milestones
          </CardTitle>
          <Badge variant="secondary">
            {completedMilestones}/{totalMilestones} complete
          </Badge>
        </div>
        <CardDescription>
          {userRole === 'seller'
            ? 'Submit deliverables for each milestone to receive payment'
            : 'Approve deliverables to release payment to the seller'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Progress Overview */}
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Overall Progress</span>
            <span className="font-medium">{progressPercent}%</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{formatCurrency(paidAmount, currency)} paid</span>
            <span>{formatCurrency(totalAmount, currency)} total</span>
          </div>
        </div>

        <Separator />

        {/* Milestone List */}
        <div className="space-y-3">
          {milestones.map((milestone) => (
            <MilestoneItem
              key={milestone.id}
              milestone={milestone}
              userRole={userRole}
              currency={currency}
              onSubmit={handleSubmit}
              onApprove={handleApprove}
              onDispute={handleDispute}
            />
          ))}
        </div>

        {/* Status Legend */}
        <div className="pt-4 border-t">
          <p className="text-xs text-muted-foreground mb-2">Status Legend</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(STATUS_CONFIG).map(([key, config]) => (
              <Badge
                key={key}
                variant="secondary"
                className={cn('text-xs', config.color)}
              >
                {config.icon}
                <span className="ml-1">{config.label}</span>
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Compact version for sidebars/summaries
 */
export function MilestoneProgress({
  milestones,
}: {
  milestones: Milestone[]
  currency?: string
}) {
  const total = milestones.length
  const completed = milestones.filter((m) => m.status === 'paid').length
  const pending = milestones.filter((m) => m.status === 'submitted').length

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-sm text-muted-foreground">Milestones</span>
        <span className="text-sm font-medium">
          {completed}/{total}
        </span>
      </div>
      <Progress value={(completed / total) * 100} className="h-1.5" />
      {pending > 0 && (
        <p className="text-xs text-amber-600">
          {pending} awaiting approval
        </p>
      )}
    </div>
  )
}

export default MilestoneTracker
