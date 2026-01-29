"use client"

/**
 * Admin GDPR Page
 * Admin view for managing GDPR data requests
 */

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  getPendingDataRequestsAction,
  getAllDataRequestsAction,
  processDataRequest,
  denyDataRequest,
  getDataRequestDetail,
  getGDPRDashboardStats,
  startProcessingRequest,
} from "@/actions/admin-gdpr"
import {
  DataRequestWithUser,
  DataRequestStatus,
  DataRequestType,
  GDPRDashboardStats,
} from "@/types/gdpr"
import {
  Shield,
  Download,
  Eye,
  Trash2,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  AlertTriangle,
  FileText,
  Activity,
  Users,
  Calendar,
  ChevronRight,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"

const TYPE_CONFIG: Record<DataRequestType, { label: string; icon: typeof Eye; color: string }> = {
  access: { label: "Data Access", icon: Eye, color: "text-blue-500" },
  export: { label: "Data Export", icon: Download, color: "text-green-500" },
  deletion: { label: "Account Deletion", icon: Trash2, color: "text-orange-500" },
}

const STATUS_CONFIG: Record<DataRequestStatus, { label: string; variant: "default" | "warning" | "success" | "destructive" }> = {
  pending: { label: "Pending", variant: "warning" },
  processing: { label: "Processing", variant: "default" },
  completed: { label: "Completed", variant: "success" },
  denied: { label: "Denied", variant: "destructive" },
}

export default function AdminGDPRPage() {
  const [stats, setStats] = useState<GDPRDashboardStats | null>(null)
  const [pendingRequests, setPendingRequests] = useState<DataRequestWithUser[]>([])
  const [selectedRequest, setSelectedRequest] = useState<DataRequestWithUser | null>(null)
  const [selectedTab, setSelectedTab] = useState<"pending" | "all">("pending")
  const [allRequests, setAllRequests] = useState<DataRequestWithUser[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [denyReason, setDenyReason] = useState("")
  const [showDenyDialog, setShowDenyDialog] = useState(false)
  const [deletionEligibility, setDeletionEligibility] = useState<{
    canDelete: boolean
    canAnonymize: boolean
    retentionEndDate: string | null
    blockers: string[]
  } | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [statsResult, pendingResult, allResult] = await Promise.all([
        getGDPRDashboardStats(),
        getPendingDataRequestsAction(),
        getAllDataRequestsAction({ limit: 50 }),
      ])

      if (statsResult.stats) setStats(statsResult.stats)
      if (!pendingResult.error) setPendingRequests(pendingResult.data)
      if (!allResult.error) setAllRequests(allResult.data)
    } catch (err) {
      setError("Failed to load GDPR data")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleSelectRequest = async (request: DataRequestWithUser) => {
    setSelectedRequest(request)
    setDeletionEligibility(null)

    if (request.request_type === "deletion") {
      const detail = await getDataRequestDetail(request.id)
      if (detail.deletionEligibility) {
        setDeletionEligibility(detail.deletionEligibility)
      }
    }
  }

  const handleProcess = async (requestId: string) => {
    setProcessing(requestId)
    setError(null)

    try {
      const result = await processDataRequest(requestId)
      if (result.error) {
        setError(result.error)
      } else {
        await fetchData()
        setSelectedRequest(null)
      }
    } catch {
      setError("Failed to process request")
    } finally {
      setProcessing(null)
    }
  }

  const handleDeny = async () => {
    if (!selectedRequest || denyReason.length < 10) return

    setProcessing(selectedRequest.id)
    setError(null)

    try {
      const result = await denyDataRequest(selectedRequest.id, denyReason)
      if (result.error) {
        setError(result.error)
      } else {
        await fetchData()
        setSelectedRequest(null)
        setShowDenyDialog(false)
        setDenyReason("")
      }
    } catch {
      setError("Failed to deny request")
    } finally {
      setProcessing(null)
    }
  }

  const handleStartProcessing = async (requestId: string) => {
    setProcessing(requestId)
    try {
      await startProcessingRequest(requestId)
      await fetchData()
    } finally {
      setProcessing(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="container max-w-7xl py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            GDPR Compliance
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage data requests and ensure compliance
          </p>
        </div>
        <Button variant="outline" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Pending Requests</CardDescription>
              <CardTitle className="text-3xl flex items-center gap-2">
                {stats.pendingRequests}
                {stats.pendingRequests > 0 && (
                  <Badge variant="warning" className="text-xs">Action Needed</Badge>
                )}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Processing</CardDescription>
              <CardTitle className="text-3xl">{stats.processingRequests}</CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Completed (This Month)</CardDescription>
              <CardTitle className="text-3xl text-green-600">{stats.completedThisMonth}</CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Avg. Processing Time</CardDescription>
              <CardTitle className="text-3xl">{stats.averageProcessingTime}h</CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Request List */}
        <div className="lg:col-span-2 space-y-4">
          {/* Tabs */}
          <div className="flex gap-2">
            <Button
              variant={selectedTab === "pending" ? "default" : "outline"}
              onClick={() => setSelectedTab("pending")}
            >
              Pending
              {stats && stats.pendingRequests > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {stats.pendingRequests}
                </Badge>
              )}
            </Button>
            <Button
              variant={selectedTab === "all" ? "default" : "outline"}
              onClick={() => setSelectedTab("all")}
            >
              All Requests
            </Button>
          </div>

          {/* Request List */}
          <Card>
            <CardContent className="p-0">
              {(selectedTab === "pending" ? pendingRequests : allRequests).length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No {selectedTab === "pending" ? "pending " : ""}requests found</p>
                </div>
              ) : (
                <div className="divide-y">
                  {(selectedTab === "pending" ? pendingRequests : allRequests).map((request) => {
                    const TypeIcon = TYPE_CONFIG[request.request_type].icon
                    const statusConfig = STATUS_CONFIG[request.status]

                    return (
                      <button
                        key={request.id}
                        onClick={() => handleSelectRequest(request)}
                        className={`w-full p-4 text-left hover:bg-muted/50 transition-colors ${
                          selectedRequest?.id === request.id ? "bg-muted" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <TypeIcon className={`h-5 w-5 ${TYPE_CONFIG[request.request_type].color}`} />
                            <div>
                              <p className="font-medium">
                                {TYPE_CONFIG[request.request_type].label}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {request.user?.full_name || request.user?.email || "Unknown User"}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={statusConfig.variant}>
                              {statusConfig.label}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(request.created_at), {
                                addSuffix: true,
                              })}
                            </span>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Request Detail Panel */}
        <div>
          {selectedRequest ? (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  {(() => {
                    const Icon = TYPE_CONFIG[selectedRequest.request_type].icon
                    return <Icon className={`h-5 w-5 ${TYPE_CONFIG[selectedRequest.request_type].color}`} />
                  })()}
                  <CardTitle className="text-lg">
                    {TYPE_CONFIG[selectedRequest.request_type].label}
                  </CardTitle>
                </div>
                <Badge variant={STATUS_CONFIG[selectedRequest.status].variant}>
                  {STATUS_CONFIG[selectedRequest.status].label}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* User Info */}
                <div>
                  <p className="text-sm font-medium text-muted-foreground">User</p>
                  <p className="font-medium">{selectedRequest.user?.full_name || "Unknown"}</p>
                  <p className="text-sm text-muted-foreground">{selectedRequest.user?.email}</p>
                </div>

                {/* Request Details */}
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Submitted</p>
                  <p className="text-sm">
                    {new Date(selectedRequest.created_at).toLocaleString()}
                  </p>
                </div>

                {selectedRequest.reason && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Reason</p>
                    <p className="text-sm bg-muted/50 p-2 rounded">{selectedRequest.reason}</p>
                  </div>
                )}

                {/* Deletion Eligibility (for deletion requests) */}
                {selectedRequest.request_type === "deletion" && deletionEligibility && (
                  <Alert className={deletionEligibility.canDelete ? "" : "border-orange-200 bg-orange-50"}>
                    <AlertTriangle className={`h-4 w-4 ${deletionEligibility.canDelete ? "" : "text-orange-500"}`} />
                    <AlertTitle>
                      {deletionEligibility.canDelete
                        ? "Immediate Deletion Allowed"
                        : deletionEligibility.canAnonymize
                        ? "Partial Deletion Allowed"
                        : "Deletion Blocked"}
                    </AlertTitle>
                    <AlertDescription>
                      {deletionEligibility.blockers.length > 0 && (
                        <ul className="list-disc list-inside mt-2 text-sm">
                          {deletionEligibility.blockers.map((b, i) => (
                            <li key={i}>{b}</li>
                          ))}
                        </ul>
                      )}
                      {deletionEligibility.retentionEndDate && (
                        <p className="mt-2 text-sm">
                          Full deletion after:{" "}
                          {new Date(deletionEligibility.retentionEndDate).toLocaleDateString()}
                        </p>
                      )}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Error Display */}
                {error && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {/* Deny Dialog */}
                {showDenyDialog && (
                  <div className="space-y-3 p-3 border rounded-lg bg-destructive/5">
                    <p className="font-medium text-sm">Reason for Denial</p>
                    <textarea
                      value={denyReason}
                      onChange={(e) => setDenyReason(e.target.value)}
                      placeholder="Provide a detailed reason..."
                      className="w-full min-h-[80px] p-2 border rounded text-sm bg-background"
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleDeny}
                        disabled={denyReason.length < 10 || !!processing}
                      >
                        {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Denial"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setShowDenyDialog(false)
                          setDenyReason("")
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* Actions */}
                {selectedRequest.status === "pending" && !showDenyDialog && (
                  <div className="flex gap-2 pt-4">
                    <Button
                      onClick={() => handleProcess(selectedRequest.id)}
                      disabled={!!processing}
                      className="flex-1"
                    >
                      {processing === selectedRequest.id ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <CheckCircle className="h-4 w-4 mr-2" />
                      )}
                      Process
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowDenyDialog(true)}
                      disabled={!!processing}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Deny
                    </Button>
                  </div>
                )}

                {selectedRequest.status === "processing" && (
                  <div className="pt-4">
                    <Button
                      onClick={() => handleProcess(selectedRequest.id)}
                      disabled={!!processing}
                      className="w-full"
                    >
                      {processing === selectedRequest.id ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <CheckCircle className="h-4 w-4 mr-2" />
                      )}
                      Complete Processing
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Select a request to view details</p>
              </CardContent>
            </Card>
          )}

          {/* Quick Stats by Type */}
          {stats && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-sm">Pending by Type</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm flex items-center gap-2">
                    <Eye className="h-4 w-4 text-blue-500" />
                    Access Requests
                  </span>
                  <Badge variant="outline">{stats.requestsByType.access}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm flex items-center gap-2">
                    <Download className="h-4 w-4 text-green-500" />
                    Export Requests
                  </span>
                  <Badge variant="outline">{stats.requestsByType.export}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm flex items-center gap-2">
                    <Trash2 className="h-4 w-4 text-orange-500" />
                    Deletion Requests
                  </span>
                  <Badge variant="outline">{stats.requestsByType.deletion}</Badge>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
