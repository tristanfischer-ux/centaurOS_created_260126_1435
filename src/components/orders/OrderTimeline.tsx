"use client"

import { OrderEvent, OrderEventType } from "@/types/orders"
import { cn } from "@/lib/utils"
import { formatDistanceToNow, format } from "date-fns"
import {
  PlusCircle,
  CheckCircle,
  XCircle,
  Play,
  Upload,
  Check,
  X,
  AlertTriangle,
  CheckSquare,
  CreditCard,
  Banknote,
  RotateCcw,
  Circle,
} from "lucide-react"

interface OrderTimelineProps {
  events: OrderEvent[]
  className?: string
}

const eventConfig: Record<
  OrderEventType,
  {
    label: string
    icon: React.ComponentType<{ className?: string }>
    color: string
    bgColor: string
  }
> = {
  created: {
    label: "Order Created",
    icon: PlusCircle,
    color: "text-status-info",
    bgColor: "bg-status-info-light",
  },
  accepted: {
    label: "Order Accepted",
    icon: CheckCircle,
    color: "text-status-success",
    bgColor: "bg-status-success-light",
  },
  declined: {
    label: "Order Declined",
    icon: XCircle,
    color: "text-destructive",
    bgColor: "bg-status-error-light",
  },
  started: {
    label: "Work Started",
    icon: Play,
    color: "text-status-info",
    bgColor: "bg-status-info-light",
  },
  milestone_submitted: {
    label: "Milestone Submitted",
    icon: Upload,
    color: "text-status-warning",
    bgColor: "bg-status-warning-light",
  },
  milestone_approved: {
    label: "Milestone Approved",
    icon: Check,
    color: "text-status-success",
    bgColor: "bg-status-success-light",
  },
  milestone_rejected: {
    label: "Milestone Rejected",
    icon: X,
    color: "text-destructive",
    bgColor: "bg-status-error-light",
  },
  disputed: {
    label: "Dispute Opened",
    icon: AlertTriangle,
    color: "text-status-warning",
    bgColor: "bg-status-warning-light",
  },
  dispute_resolved: {
    label: "Dispute Resolved",
    icon: CheckSquare,
    color: "text-status-success",
    bgColor: "bg-status-success-light",
  },
  completed: {
    label: "Order Completed",
    icon: CheckCircle,
    color: "text-status-success",
    bgColor: "bg-status-success-light",
  },
  cancelled: {
    label: "Order Cancelled",
    icon: XCircle,
    color: "text-muted-foreground",
    bgColor: "bg-muted",
  },
  payment_received: {
    label: "Payment Received",
    icon: CreditCard,
    color: "text-status-success",
    bgColor: "bg-status-success-light",
  },
  payment_released: {
    label: "Payment Released",
    icon: Banknote,
    color: "text-status-success",
    bgColor: "bg-status-success-light",
  },
  refunded: {
    label: "Refund Issued",
    icon: RotateCcw,
    color: "text-status-warning",
    bgColor: "bg-status-warning-light",
  },
}

function getEventConfig(eventType: OrderEventType) {
  return (
    eventConfig[eventType] ?? {
      label: eventType,
      icon: Circle,
      color: "text-muted-foreground",
      bgColor: "bg-muted",
    }
  )
}

export function OrderTimeline({ events, className }: OrderTimelineProps) {
  if (!events || events.length === 0) {
    return (
      <div className={cn("text-center py-8 text-muted-foreground", className)}>
        <p className="text-sm">No events recorded yet</p>
      </div>
    )
  }

  return (
    <div className={cn("relative", className)}>
      {/* Timeline line */}
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />

      <div className="space-y-4">
        {events.map((event) => {
          const config = getEventConfig(event.event_type)
          const Icon = config.icon

          return (
            <div
              key={event.id}
              className="relative flex items-start gap-4 pl-10"
            >
              {/* Icon */}
              <div
                className={cn(
                  "absolute left-1 flex h-6 w-6 items-center justify-center rounded-full",
                  config.bgColor
                )}
              >
                <Icon className={cn("h-3.5 w-3.5", config.color)} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium text-sm text-foreground">
                    {config.label}
                  </span>
                  {event.actor_name && (
                    <span className="text-xs text-muted-foreground">
                      by {event.actor_name}
                    </span>
                  )}
                </div>

                {/* Details */}
                {event.details && Object.keys(event.details).length > 0 && (
                  <EventDetails details={event.details} />
                )}

                {/* Timestamp */}
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(event.created_at), {
                    addSuffix: true,
                  })}
                  <span className="mx-1">·</span>
                  {format(new Date(event.created_at), "MMM d, yyyy 'at' h:mm a")}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function EventDetails({
  details,
}: {
  details: Record<string, unknown>
}) {
  // Format based on event type
  const renderDetail = (key: string, value: unknown): string | null => {
    if (value === null || value === undefined) return null

    // Skip internal fields
    if (["actor_id", "from_status", "to_status"].includes(key)) return null

    // Format specific keys
    if (key === "reason") return `Reason: ${value}`
    if (key === "total_amount" && typeof value === "number") {
      return `Amount: £${value.toFixed(2)}`
    }
    if (key === "milestone_title") return `Milestone: ${value}`
    if (key === "cancelled_by") return null // Already shown as actor
    if (key === "completed_by") return null
    if (key === "approved_by") return null

    return null
  }

  const detailStrings = Object.entries(details)
    .map(([key, value]) => renderDetail(key, value))
    .filter(Boolean)

  if (detailStrings.length === 0) return null

  return (
    <div className="mt-1 text-xs text-muted-foreground">
      {detailStrings.map((detail, idx) => (
        <p key={idx}>{detail}</p>
      ))}
    </div>
  )
}

// Compact timeline for card view
export function OrderTimelineCompact({
  events,
  maxItems = 3,
  className,
}: {
  events: OrderEvent[]
  maxItems?: number
  className?: string
}) {
  const displayEvents = events.slice(-maxItems)

  if (!events || events.length === 0) {
    return null
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {displayEvents.map((event) => {
        const config = getEventConfig(event.event_type)
        const Icon = config.icon

        return (
          <div
            key={event.id}
            className={cn(
              "flex items-center gap-1 text-xs px-2 py-0.5 rounded-full",
              config.bgColor
            )}
            title={`${config.label} - ${formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}`}
          >
            <Icon className={cn("h-3 w-3", config.color)} />
            <span className={config.color}>{config.label}</span>
          </div>
        )
      })}
      {events.length > maxItems && (
        <span className="text-xs text-muted-foreground">
          +{events.length - maxItems} more
        </span>
      )}
    </div>
  )
}
