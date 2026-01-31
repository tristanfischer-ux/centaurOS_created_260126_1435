"use client"

/**
 * Data Request Status Component
 * Displays the status of a data request with progress indicator and actions
 */

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  cancelDataRequest,
  downloadDataExport,
} from "@/actions/gdpr"
import { DataRequest, DataRequestStatus, DataRequestType } from "@/types/gdpr"
import {
  Download,
  Eye,
  Trash2,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  X,
  RefreshCw,
  AlertTriangle,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"

interface DataRequestStatusProps {
  request: DataRequest
  onStatusChange?: () => void
}

const TYPE_CONFIG: Record<
  DataRequestType,
  { label: string; icon: typeof Eye; color: string }
> = {
  access: {
    label: "Data Access",
    icon: Eye,
    color: "text-status-info",
  },
  export: {
    label: "Data Export",
    icon: Download,
    color: "text-status-success",
  },
  deletion: {
    label: "Account Deletion",
    icon: Trash2,
    color: "text-status-warning",
  },
}

const STATUS_CONFIG: Record<
  DataRequestStatus,
  { label: string; variant: "default" | "warning" | "success" | "destructive"; icon: typeof Clock }
> = {
  pending: {
    label: "Pending Review",
    variant: "warning",
    icon: Clock,
  },
  processing: {
    label: "In Progress",
    variant: "default",
    icon: RefreshCw,
  },
  completed: {
    label: "Completed",
    variant: "success",
    icon: CheckCircle,
  },
  denied: {
    label: "Denied",
    variant: "destructive",
    icon: XCircle,
  },
}

export function DataRequestStatusCard({
  request,
  onStatusChange,
}: DataRequestStatusProps) {
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const typeConfig = TYPE_CONFIG[request.request_type]
  const statusConfig = STATUS_CONFIG[request.status]
  const TypeIcon = typeConfig.icon
  const StatusIcon = statusConfig.icon

  const handleCancel = async () => {
    if (!confirm("Are you sure you want to cancel this request?")) return

    setLoading(true)
    setError(null)

    try {
      const result = await cancelDataRequest(request.id)
      if (result.error) {
        setError(result.error)
      } else {
        onStatusChange?.()
      }
    } catch {
      setError("Failed to cancel request")
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = async () => {
    setDownloading(true)
    setError(null)

    try {
      const result = await downloadDataExport(request.id)
      if (result.error) {
        setError(result.error)
      } else if (result.url) {
        // Open download URL in new tab
        window.open(result.url, "_blank")
      }
    } catch {
      setError("Failed to download export")
    } finally {
      setDownloading(false)
    }
  }

  // Calculate progress percentage for visual indicator
  const getProgressPercentage = () => {
    switch (request.status) {
      case "pending":
        return 25
      case "processing":
        return 60
      case "completed":
        return 100
      case "denied":
        return 100
      default:
        return 0
    }
  }

  return (
    <Card className="overflow-hidden">
      {/* Progress bar */}
      <div className="h-1 bg-muted">
        <div
          className={`h-full transition-all duration-500 ${
            request.status === "denied"
              ? "bg-destructive"
              : request.status === "completed"
              ? "bg-status-success"
              : "bg-primary"
          }`}
          style={{ width: `${getProgressPercentage()}%` }}
        />
      </div>

      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TypeIcon className={`h-5 w-5 ${typeConfig.color}`} />
            <CardTitle className="text-lg">{typeConfig.label} Request</CardTitle>
          </div>
          <Badge variant={statusConfig.variant}>
            <StatusIcon className="h-3 w-3 mr-1" />
            {statusConfig.label}
          </Badge>
        </div>
        <CardDescription>
          Submitted{" "}
          {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Timeline/Status Details */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <div
              className={`h-2 w-2 rounded-full ${
                request.status === "pending"
                  ? "bg-status-warning animate-pulse"
                  : "bg-status-success"
              }`}
            />
            <span className="text-muted-foreground">Request received</span>
            <span className="text-xs text-muted-foreground ml-auto">
              {new Date(request.created_at).toLocaleDateString()}
            </span>
          </div>

          {(request.status === "processing" ||
            request.status === "completed" ||
            request.status === "denied") && (
            <div className="flex items-center gap-2 text-sm">
              <div
                className={`h-2 w-2 rounded-full ${
                  request.status === "processing"
                    ? "bg-status-info animate-pulse"
                    : "bg-status-success"
                }`}
              />
              <span className="text-muted-foreground">Processing started</span>
            </div>
          )}

          {request.status === "completed" && (
            <div className="flex items-center gap-2 text-sm">
              <div className="h-2 w-2 rounded-full bg-status-success" />
              <span className="text-muted-foreground">Request completed</span>
              {request.completed_at && (
                <span className="text-xs text-muted-foreground ml-auto">
                  {new Date(request.completed_at).toLocaleDateString()}
                </span>
              )}
            </div>
          )}

          {request.status === "denied" && (
            <div className="flex items-center gap-2 text-sm">
              <div className="h-2 w-2 rounded-full bg-destructive" />
              <span className="text-muted-foreground">Request denied</span>
              {request.completed_at && (
                <span className="text-xs text-muted-foreground ml-auto">
                  {new Date(request.completed_at).toLocaleDateString()}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Reason display (for denied or deletion requests) */}
        {request.reason && (
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium">
                {request.status === "denied" ? "Denial reason" : "Request reason"}:{" "}
              </span>
              {request.reason}
            </p>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        )}

        {/* Information based on status */}
        {request.status === "pending" && (
          <p className="text-sm text-muted-foreground">
            Your request is in the queue and will be processed within 30 days
            (usually much sooner).
          </p>
        )}

        {request.status === "processing" && (
          <p className="text-sm text-muted-foreground">
            Your request is currently being processed. This may take a few hours
            depending on the amount of data.
          </p>
        )}

        {request.status === "completed" &&
          (request.request_type === "access" ||
            request.request_type === "export") && (
            <p className="text-sm text-muted-foreground">
              Your data export is ready for download. The download link is valid
              for 7 days.
            </p>
          )}

        {request.status === "completed" &&
          request.request_type === "deletion" && (
            <p className="text-sm text-muted-foreground">
              Your deletion request has been processed. Personal data has been
              removed or anonymized where legally permitted.
            </p>
          )}
      </CardContent>

      <CardFooter className="flex justify-end gap-2 bg-muted/20">
        {/* Cancel button for pending requests */}
        {request.status === "pending" && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCancel}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <X className="h-4 w-4 mr-2" />
            )}
            Cancel Request
          </Button>
        )}

        {/* Download button for completed export/access requests */}
        {request.status === "completed" &&
          (request.request_type === "export" ||
            request.request_type === "access") &&
          request.export_url && (
            <Button
              variant="default"
              size="sm"
              onClick={handleDownload}
              disabled={downloading}
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Download Data
            </Button>
          )}
      </CardFooter>
    </Card>
  )
}

/**
 * Compact status badge for request lists
 */
export function DataRequestStatusBadge({ request }: { request: DataRequest }) {
  const statusConfig = STATUS_CONFIG[request.status]
  const StatusIcon = statusConfig.icon

  return (
    <Badge variant={statusConfig.variant} className="gap-1">
      <StatusIcon className="h-3 w-3" />
      {statusConfig.label}
    </Badge>
  )
}

/**
 * List view of multiple data requests
 */
export function DataRequestList({
  requests,
  onStatusChange,
}: {
  requests: DataRequest[]
  onStatusChange?: () => void
}) {
  if (requests.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">No data requests yet</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {requests.map((request) => (
        <DataRequestStatusCard
          key={request.id}
          request={request}
          onStatusChange={onStatusChange}
        />
      ))}
    </div>
  )
}

export default DataRequestStatusCard
