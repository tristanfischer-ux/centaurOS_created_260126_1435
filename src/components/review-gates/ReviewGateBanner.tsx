'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { UserAvatar } from '@/components/ui/user-avatar'
import {
  UserCheck,
  Users,
  ShieldCheck,
  ShieldAlert,
  Factory,
  FileCheck,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
} from 'lucide-react'
import { submitReview } from '@/actions/review-gates'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import type { ReviewGate, ReviewGateType, ReviewGateStatus } from '@/types/review-gates'
import { REVIEW_GATE_STATUS_LABELS } from '@/types/review-gates'

const GATE_ICONS: Record<ReviewGateType, React.ElementType> = {
  expert_review: UserCheck,
  peer_review: Users,
  quality_gate: ShieldCheck,
  safety_review: ShieldAlert,
  manufacturing_review: Factory,
  compliance_review: FileCheck,
}

const GATE_COLORS: Record<ReviewGateType, string> = {
  expert_review: 'border-chart-5/30 bg-chart-5/5',
  peer_review: 'border-status-info/30 bg-status-info-light',
  quality_gate: 'border-status-success/30 bg-status-success-light',
  safety_review: 'border-destructive/30 bg-status-error-light',
  manufacturing_review: 'border-status-warning/30 bg-status-warning-light',
  compliance_review: 'border-chart-2/30 bg-chart-2/5',
}

interface ReviewGateBannerProps {
  gates: ReviewGate[]
  currentUserId?: string
  onUpdate?: () => void
}

export function ReviewGateBanner({ gates, currentUserId, onUpdate }: ReviewGateBannerProps) {
  const [expandedGateId, setExpandedGateId] = useState<string | null>(null)
  const [reviewNotes, setReviewNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const pendingGates = gates.filter(
    (g) => g.status === 'pending' || g.status === 'in_review'
  )
  const completedGates = gates.filter(
    (g) => g.status === 'approved' || g.status === 'rejected' || g.status === 'waived'
  )

  if (gates.length === 0) return null

  const handleSubmitReview = async (
    gateId: string,
    status: 'approved' | 'rejected' | 'waived'
  ) => {
    setIsSubmitting(true)
    const { error } = await submitReview({
      gate_id: gateId,
      status,
      review_notes: reviewNotes || undefined,
    })
    setIsSubmitting(false)

    if (error) {
      toast.error('Failed to submit review', { description: error })
    } else {
      toast.success(
        status === 'approved'
          ? 'Review gate approved'
          : status === 'rejected'
          ? 'Review gate rejected'
          : 'Review gate waived'
      )
      setReviewNotes('')
      setExpandedGateId(null)
      onUpdate?.()
    }
  }

  const renderGate = (gate: ReviewGate) => {
    const Icon = GATE_ICONS[gate.gate_type]
    const colorClass = GATE_COLORS[gate.gate_type]
    const statusConfig = REVIEW_GATE_STATUS_LABELS[gate.status as ReviewGateStatus]
    const isExpanded = expandedGateId === gate.id
    const canReview =
      currentUserId &&
      (gate.reviewer_id === currentUserId || !gate.reviewer_id) &&
      (gate.status === 'pending' || gate.status === 'in_review')

    return (
      <div
        key={gate.id}
        className={cn('rounded-lg border p-3', colorClass)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <Icon className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium leading-tight">{gate.title}</p>
              {gate.description && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  {gate.description}
                </p>
              )}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {statusConfig.label}
                </Badge>
                {gate.required_skills.length > 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    Skills: {gate.required_skills.slice(0, 3).join(', ')}
                    {gate.required_skills.length > 3 && ` +${gate.required_skills.length - 3}`}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {gate.reviewer_id && gate.reviewer && (
              <UserAvatar
                name={gate.reviewer.full_name || 'Reviewer'}
                size="xs"
              />
            )}
            {!gate.reviewer_id && gate.status === 'pending' && (
              <Link href="/marketplace?tab=People">
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                  <ExternalLink className="h-3 w-3" />
                  Find Expert
                </Button>
              </Link>
            )}
            {canReview && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() =>
                  setExpandedGateId(isExpanded ? null : gate.id)
                }
              >
                {isExpanded ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </Button>
            )}
            {gate.status === 'approved' && (
              <CheckCircle2 className="h-4 w-4 text-status-success" />
            )}
            {gate.status === 'rejected' && (
              <XCircle className="h-4 w-4 text-destructive" />
            )}
          </div>
        </div>

        {/* Review action area */}
        {isExpanded && canReview && (
          <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
            <Textarea
              placeholder="Review notes (optional)..."
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              className="text-sm min-h-[60px]"
            />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={() => handleSubmitReview(gate.id, 'approved')}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                )}
                Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="h-7 text-xs"
                onClick={() => handleSubmitReview(gate.id, 'rejected')}
                disabled={isSubmitting}
              >
                <XCircle className="h-3 w-3 mr-1" />
                Reject
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => handleSubmitReview(gate.id, 'waived')}
                disabled={isSubmitting}
              >
                Waive
              </Button>
            </div>
          </div>
        )}

        {/* Show review notes for completed gates */}
        {gate.review_notes && (gate.status === 'approved' || gate.status === 'rejected') && (
          <div className="mt-2 pt-2 border-t border-border/50">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">Review notes:</span> {gate.review_notes}
            </p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {pendingGates.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Pending Review Gates ({pendingGates.length})
          </p>
          {pendingGates.map(renderGate)}
        </div>
      )}
      {completedGates.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Completed ({completedGates.length})
          </p>
          {completedGates.map(renderGate)}
        </div>
      )}
    </div>
  )
}
