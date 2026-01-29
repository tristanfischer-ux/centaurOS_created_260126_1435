"use client"

/**
 * Admin Dispute Queue Component
 * Displays pending disputes with actions
 */

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertTriangle,
  Clock,
  User,
  MoreVertical,
  ArrowRight,
  CheckCircle,
  Scale,
  Gavel,
  ExternalLink,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { toast } from "sonner"

type DisputeStatus =
  | "open"
  | "under_review"
  | "mediation"
  | "arbitration"
  | "resolved"
  | "escalated"
  | "cancelled"

interface DisputeWithDetails {
  id: string
  order_id: string
  reason: string
  status: DisputeStatus
  created_at: string
  assigned_to: string | null
  order?: {
    order_number: string
    total_amount: number
  }
  raiser?: {
    full_name: string | null
    email: string
  }
  assignee?: {
    full_name: string | null
  }
}

interface DisputeQueueProps {
  disputes: DisputeWithDetails[]
  onAssign: (disputeId: string, adminId?: string) => Promise<{ success: boolean; error?: string }>
  onUpdateStatus: (
    disputeId: string,
    status: DisputeStatus
  ) => Promise<{ success: boolean; error?: string }>
  currentUserId: string
}

export function DisputeQueue({
  disputes,
  onAssign,
  onUpdateStatus,
  currentUserId,
}: DisputeQueueProps) {
  const [filter, setFilter] = useState<"all" | "unassigned" | "mine">("all")
  const [isLoading, setIsLoading] = useState<string | null>(null)

  const filteredDisputes = disputes.filter((d) => {
    if (filter === "unassigned") return !d.assigned_to
    if (filter === "mine") return d.assigned_to === currentUserId
    return true
  })

  const handleAssign = async (disputeId: string) => {
    setIsLoading(disputeId)
    try {
      const result = await onAssign(disputeId, currentUserId)
      if (result.success) {
        toast.success("Dispute assigned to you")
      } else {
        toast.error(result.error || "Failed to assign dispute")
      }
    } finally {
      setIsLoading(null)
    }
  }

  const handleStatusUpdate = async (disputeId: string, status: DisputeStatus) => {
    setIsLoading(disputeId)
    try {
      const result = await onUpdateStatus(disputeId, status)
      if (result.success) {
        toast.success(`Dispute status updated to ${status.replace("_", " ")}`)
      } else {
        toast.error(result.error || "Failed to update status")
      }
    } finally {
      setIsLoading(null)
    }
  }

  const getStatusBadge = (status: DisputeStatus) => {
    const config: Record<DisputeStatus, { variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
      open: { variant: "destructive", icon: <AlertTriangle className="h-3 w-3" /> },
      under_review: { variant: "default", icon: <Clock className="h-3 w-3" /> },
      mediation: { variant: "secondary", icon: <Scale className="h-3 w-3" /> },
      arbitration: { variant: "secondary", icon: <Gavel className="h-3 w-3" /> },
      resolved: { variant: "outline", icon: <CheckCircle className="h-3 w-3" /> },
      escalated: { variant: "destructive", icon: <AlertTriangle className="h-3 w-3" /> },
      cancelled: { variant: "outline", icon: null },
    }

    const { variant, icon } = config[status]
    return (
      <Badge variant={variant} className="gap-1">
        {icon}
        {status.replace("_", " ")}
      </Badge>
    )
  }

  const getPriorityIndicator = (dispute: DisputeWithDetails) => {
    const hoursSinceCreated =
      (Date.now() - new Date(dispute.created_at).getTime()) / (1000 * 60 * 60)

    if (hoursSinceCreated > 72 && dispute.status === "open") {
      return (
        <Badge variant="destructive" className="text-xs">
          Urgent
        </Badge>
      )
    }
    if (hoursSinceCreated > 48 && !dispute.assigned_to) {
      return (
        <Badge variant="secondary" className="text-xs">
          Needs attention
        </Badge>
      )
    }
    return null
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Dispute Queue</CardTitle>
            <Badge variant="outline">{filteredDisputes.length}</Badge>
          </div>
          <Select
            value={filter}
            onValueChange={(v) => setFilter(v as typeof filter)}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Disputes</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              <SelectItem value="mine">My Disputes</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <CardDescription>
          Active disputes requiring review or action
        </CardDescription>
      </CardHeader>
      <CardContent>
        {filteredDisputes.length === 0 ? (
          <EmptyState
            icon={<CheckCircle className="h-8 w-8" />}
            title={
              filter === "unassigned"
                ? "No unassigned disputes"
                : filter === "mine"
                  ? "No disputes assigned to you"
                  : "No active disputes"
            }
            description="All disputes have been handled."
          />
        ) : (
          <div className="space-y-3">
            {filteredDisputes.map((dispute) => (
              <div
                key={dispute.id}
                className="p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Main Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-medium">
                        Order #{dispute.order?.order_number || "Unknown"}
                      </span>
                      {getStatusBadge(dispute.status)}
                      {getPriorityIndicator(dispute)}
                    </div>

                    <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                      {dispute.reason}
                    </p>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {dispute.raiser?.full_name || dispute.raiser?.email || "Unknown"}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(dispute.created_at), {
                          addSuffix: true,
                        })}
                      </span>
                      {dispute.order?.total_amount && (
                        <span>
                          £{dispute.order.total_amount.toLocaleString()}
                        </span>
                      )}
                    </div>

                    {dispute.assigned_to && dispute.assignee && (
                      <div className="mt-2 text-xs">
                        <Badge variant="outline" className="gap-1">
                          <User className="h-3 w-3" />
                          Assigned to {dispute.assignee.full_name}
                        </Badge>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {!dispute.assigned_to && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAssign(dispute.id)}
                        disabled={isLoading === dispute.id}
                      >
                        Assign to me
                      </Button>
                    )}

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <a
                            href={`/admin/disputes/${dispute.id}`}
                            className="flex items-center"
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            View Details
                          </a>
                        </DropdownMenuItem>
                        {dispute.status === "open" && (
                          <DropdownMenuItem
                            onClick={() =>
                              handleStatusUpdate(dispute.id, "under_review")
                            }
                          >
                            <ArrowRight className="h-4 w-4 mr-2" />
                            Start Review
                          </DropdownMenuItem>
                        )}
                        {dispute.status === "under_review" && (
                          <DropdownMenuItem
                            onClick={() =>
                              handleStatusUpdate(dispute.id, "mediation")
                            }
                          >
                            <Scale className="h-4 w-4 mr-2" />
                            Start Mediation
                          </DropdownMenuItem>
                        )}
                        {(dispute.status === "mediation" ||
                          dispute.status === "under_review") && (
                          <DropdownMenuItem
                            onClick={() =>
                              handleStatusUpdate(dispute.id, "arbitration")
                            }
                          >
                            <Gavel className="h-4 w-4 mr-2" />
                            Escalate to Arbitration
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default DisputeQueue
