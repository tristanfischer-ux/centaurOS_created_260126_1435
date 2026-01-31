"use client"

/**
 * Dispute Timeline Component
 * Displays timeline of dispute events with status indicator
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  AlertTriangle,
  MessageSquare,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  User,
  Scale,
  ArrowRight,
  Gavel,
} from "lucide-react"
import { formatDistanceToNow, differenceInDays } from "date-fns"
import { cn } from "@/lib/utils"

type DisputeStatus =
  | "open"
  | "under_review"
  | "mediation"
  | "arbitration"
  | "resolved"
  | "escalated"
  | "cancelled"

interface DisputeEvent {
  id: string
  event_type: string
  description: string
  actor_name: string | null
  created_at: string
  metadata?: Record<string, unknown>
}

interface DisputeTimelineProps {
  status: DisputeStatus
  events: DisputeEvent[]
  resolution?: string | null
  resolutionAmount?: number | null
  createdAt: string
  resolvedAt?: string | null
  className?: string
}

export function DisputeTimeline({
  status,
  events,
  resolution,
  resolutionAmount,
  createdAt,
  resolvedAt,
  className,
}: DisputeTimelineProps) {
  const getStatusBadge = () => {
    const variants: Record<DisputeStatus, { variant: "default" | "secondary" | "destructive" | "secondary"; label: string }> = {
      open: { variant: "destructive", label: "Open" },
      under_review: { variant: "default", label: "Under Review" },
      mediation: { variant: "secondary", label: "In Mediation" },
      arbitration: { variant: "secondary", label: "In Arbitration" },
      resolved: { variant: "secondary", label: "Resolved" },
      escalated: { variant: "destructive", label: "Escalated" },
      cancelled: { variant: "secondary", label: "Cancelled" },
    }

    const { variant, label } = variants[status]
    return <Badge variant={variant}>{label}</Badge>
  }

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case "dispute_created":
        return <AlertTriangle className="h-4 w-4" />
      case "evidence_added":
        return <FileText className="h-4 w-4" />
      case "status_changed":
        return <ArrowRight className="h-4 w-4" />
      case "assigned":
        return <User className="h-4 w-4" />
      case "message":
        return <MessageSquare className="h-4 w-4" />
      case "mediation_started":
        return <Scale className="h-4 w-4" />
      case "arbitration_started":
        return <Gavel className="h-4 w-4" />
      case "resolved":
        return <CheckCircle className="h-4 w-4" />
      case "cancelled":
        return <XCircle className="h-4 w-4" />
      default:
        return <Clock className="h-4 w-4" />
    }
  }

  const getEventIconColor = (eventType: string) => {
    switch (eventType) {
      case "dispute_created":
        return "text-status-warning bg-status-warning-light dark:bg-amber-950/20"
      case "resolved":
        return "text-status-success bg-status-success-light dark:bg-emerald-950/20"
      case "cancelled":
        return "text-muted-foreground bg-muted"
      case "evidence_added":
        return "text-status-info bg-status-info-light dark:bg-blue-950/20"
      case "escalated":
        return "text-destructive bg-status-error-light dark:bg-red-950/20"
      default:
        return "text-muted-foreground bg-muted"
    }
  }

  // Calculate duration
  const createdDate = new Date(createdAt)
  const durationText = resolvedAt
    ? `Resolved in ${differenceInDays(new Date(resolvedAt), createdDate)} days`
    : `Open for ${differenceInDays(new Date(), createdDate)} days`

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Dispute Timeline
              {getStatusBadge()}
            </CardTitle>
            <CardDescription>{durationText}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Resolution Summary (if resolved) */}
        {status === "resolved" && resolution && (
          <div className="mb-6 p-4 rounded-lg bg-status-success-light dark:bg-emerald-950/20 border border-status-success dark:border-emerald-800">
            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-status-success mt-0.5" />
              <div>
                <h4 className="font-medium text-status-success-dark dark:text-emerald-400">
                  Resolution
                </h4>
                <p className="text-sm text-status-success dark:text-emerald-500 mt-1">
                  {resolution}
                </p>
                {resolutionAmount !== undefined && resolutionAmount !== null && (
                  <p className="text-sm font-medium text-status-success-dark dark:text-emerald-400 mt-2">
                    Amount: £{resolutionAmount.toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Cancelled Banner */}
        {status === "cancelled" && (
          <div className="mb-6 p-4 rounded-lg bg-muted border">
            <div className="flex items-start gap-3">
              <XCircle className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <h4 className="font-medium">Dispute Cancelled</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  This dispute was cancelled and no further action is required.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Timeline */}
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[15px] top-2 bottom-2 w-[2px] bg-border" />

          {/* Events */}
          <div className="space-y-4">
            {events.map((event) => (
              <div key={event.id} className="relative flex gap-4">
                {/* Icon */}
                <div
                  className={cn(
                    "relative z-10 flex h-8 w-8 items-center justify-center rounded-full",
                    getEventIconColor(event.event_type)
                  )}
                >
                  {getEventIcon(event.event_type)}
                </div>

                {/* Content */}
                <div className="flex-1 pb-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm">{event.description}</p>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(event.created_at), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                  {event.actor_name && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      by {event.actor_name}
                    </p>
                  )}
                  {event.metadata && Object.keys(event.metadata).length > 0 && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      {(event.metadata as Record<string, unknown>).from && (event.metadata as Record<string, unknown>).to && (
                        <span>
                          Status: {String((event.metadata as Record<string, unknown>).from)} → {String((event.metadata as Record<string, unknown>).to)}
                        </span>
                      )}
                      {(event.metadata as Record<string, unknown>).new_files && (
                        <span>
                          {((event.metadata as Record<string, unknown>).new_files as string[]).length} file(s) added
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* No events message */}
        {events.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="h-8 w-8 mx-auto mb-2" />
            <p>No timeline events yet</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Status progress indicator
 */
interface DisputeStatusProgressProps {
  status: DisputeStatus
  className?: string
}

export function DisputeStatusProgress({
  status,
  className,
}: DisputeStatusProgressProps) {
  const steps = [
    { key: "open", label: "Open" },
    { key: "under_review", label: "Under Review" },
    { key: "mediation", label: "Mediation" },
    { key: "resolved", label: "Resolved" },
  ]

  const getCurrentStep = () => {
    if (status === "cancelled") return -1
    if (status === "escalated") return 3
    if (status === "arbitration") return 2.5
    return steps.findIndex((s) => s.key === status)
  }

  const currentStep = getCurrentStep()

  if (status === "cancelled") {
    return (
      <div className={cn("p-4 rounded-lg bg-muted", className)}>
        <p className="text-sm text-muted-foreground text-center">
          Dispute cancelled
        </p>
      </div>
    )
  }

  return (
    <div className={cn("relative", className)}>
      {/* Progress bar */}
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isActive = index <= currentStep
          const isCurrent = index === Math.floor(currentStep)

          return (
            <div
              key={step.key}
              className="flex flex-col items-center flex-1"
            >
              {/* Connector line */}
              {index > 0 && (
                <div
                  className={cn(
                    "absolute h-1 top-4",
                    isActive ? "bg-primary" : "bg-muted"
                  )}
                  style={{
                    left: `${(index - 1) * 33.33 + 16.66}%`,
                    width: "33.33%",
                  }}
                />
              )}

              {/* Step indicator */}
              <div
                className={cn(
                  "relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                  isCurrent && "ring-2 ring-primary ring-offset-2"
                )}
              >
                {index + 1}
              </div>

              {/* Label */}
              <span
                className={cn(
                  "mt-2 text-xs text-center",
                  isActive ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {step.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default DisputeTimeline
