"use client"

/**
 * Admin Fraud Signals List Component
 * Displays and manages fraud signals
 */

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/ui/empty-state"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  ShieldAlert,
  AlertTriangle,
  Shield,
  CheckCircle,
  Clock,
  User,
  Search,
  X,
  ChevronRight,
  Loader2,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { toast } from "sonner"

type FraudSeverity = "low" | "medium" | "high" | "critical"
type FraudSignalType =
  | "velocity_violation"
  | "payment_failure"
  | "dispute_frequency"
  | "account_age_mismatch"
  | "ip_pattern"
  | "device_pattern"
  | "suspicious_activity"
  | "manual_report"

interface FraudSignal {
  id: string
  user_id: string
  signal_type: FraudSignalType
  severity: FraudSeverity
  details: Record<string, unknown>
  action_taken: string | null
  reviewed_by: string | null
  created_at: string
  user?: {
    full_name: string | null
    email: string
  }
}

interface FraudSignalsListProps {
  signals: FraudSignal[]
  onClearFlag: (
    signalId: string,
    reason: string
  ) => Promise<{ success: boolean; error?: string }>
  onViewUser: (userId: string) => void
}

export function FraudSignalsList({
  signals,
  onClearFlag,
  onViewUser,
}: FraudSignalsListProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedSignal, setSelectedSignal] = useState<FraudSignal | null>(null)
  const [clearReason, setClearReason] = useState("")
  const [isClearing, setIsClearing] = useState(false)

  const filteredSignals = signals.filter((signal) => {
    if (!searchQuery) return true
    const search = searchQuery.toLowerCase()
    return (
      signal.user?.full_name?.toLowerCase().includes(search) ||
      signal.user?.email?.toLowerCase().includes(search) ||
      signal.signal_type.toLowerCase().includes(search)
    )
  })

  const handleClearFlag = async () => {
    if (!selectedSignal || !clearReason.trim()) {
      toast.error("Please provide a reason for clearing the flag")
      return
    }

    setIsClearing(true)
    try {
      const result = await onClearFlag(selectedSignal.id, clearReason.trim())
      if (result.success) {
        toast.success("Fraud flag cleared")
        setSelectedSignal(null)
        setClearReason("")
      } else {
        toast.error(result.error || "Failed to clear flag")
      }
    } finally {
      setIsClearing(false)
    }
  }

  const getSeverityBadge = (severity: FraudSeverity) => {
    const config: Record<FraudSeverity, { variant: "default" | "secondary" | "destructive" | "secondary"; icon: React.ReactNode }> = {
      critical: { variant: "destructive", icon: <ShieldAlert className="h-3 w-3" /> },
      high: { variant: "destructive", icon: <AlertTriangle className="h-3 w-3" /> },
      medium: { variant: "secondary", icon: <Shield className="h-3 w-3" /> },
      low: { variant: "secondary", icon: null },
    }

    const { variant, icon } = config[severity]
    return (
      <Badge variant={variant} className="gap-1 capitalize">
        {icon}
        {severity}
      </Badge>
    )
  }

  const formatSignalType = (type: FraudSignalType) => {
    return type
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  }

  const getSignalTypeIcon = (type: FraudSignalType) => {
    switch (type) {
      case "velocity_violation":
        return <AlertTriangle className="h-4 w-4 text-amber-500" />
      case "payment_failure":
        return <X className="h-4 w-4 text-red-500" />
      case "dispute_frequency":
        return <AlertTriangle className="h-4 w-4 text-orange-500" />
      case "manual_report":
        return <User className="h-4 w-4 text-blue-500" />
      default:
        return <Shield className="h-4 w-4 text-muted-foreground" />
    }
  }

  // Group signals by user for summary
  const signalsByUser = signals.reduce(
    (acc, signal) => {
      const userId = signal.user_id
      if (!acc[userId]) {
        acc[userId] = {
          userId,
          user: signal.user,
          signals: [],
          highestSeverity: "low" as FraudSeverity,
        }
      }
      acc[userId].signals.push(signal)

      // Track highest severity
      const severityOrder = ["low", "medium", "high", "critical"]
      if (
        severityOrder.indexOf(signal.severity) >
        severityOrder.indexOf(acc[userId].highestSeverity)
      ) {
        acc[userId].highestSeverity = signal.severity
      }

      return acc
    },
    {} as Record<
      string,
      {
        userId: string
        user?: { full_name: string | null; email: string }
        signals: FraudSignal[]
        highestSeverity: FraudSeverity
      }
    >
  )

  const sortedUsers = Object.values(signalsByUser).sort((a, b) => {
    const order = ["critical", "high", "medium", "low"]
    return (
      order.indexOf(a.highestSeverity) - order.indexOf(b.highestSeverity)
    )
  })

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Fraud Signals</CardTitle>
              <Badge variant="secondary">{signals.length}</Badge>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users or types..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <CardDescription>
            Users with active fraud signals requiring review
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredSignals.length === 0 ? (
            <EmptyState
              icon={<CheckCircle className="h-8 w-8" />}
              title="No active fraud signals"
              description="No suspicious activity has been detected."
            />
          ) : (
            <div className="space-y-4">
              {/* Summary by User */}
              <div className="space-y-2">
                {sortedUsers.slice(0, 10).map(({ userId, user, signals: userSignals, highestSeverity }) => (
                  <div
                    key={userId}
                    className="p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => onViewUser(userId)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-full bg-muted">
                          <User className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {user?.full_name || "Unknown User"}
                            </span>
                            {getSeverityBadge(highestSeverity)}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {user?.email || userId}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="secondary">
                          {userSignals.length} signal{userSignals.length !== 1 ? "s" : ""}
                        </Badge>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Individual Signals */}
              <div className="border-t pt-4">
                <h4 className="text-sm font-medium mb-3">Recent Signals</h4>
                <div className="space-y-2">
                  {filteredSignals.slice(0, 10).map((signal) => (
                    <div
                      key={signal.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        {getSignalTypeIcon(signal.signal_type)}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                              {formatSignalType(signal.signal_type)}
                            </span>
                            {getSeverityBadge(signal.severity)}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{signal.user?.email || signal.user_id}</span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDistanceToNow(new Date(signal.created_at), {
                                addSuffix: true,
                              })}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {signal.action_taken ? (
                          <Badge variant="secondary" className="gap-1">
                            <CheckCircle className="h-3 w-3" />
                            Resolved
                          </Badge>
                        ) : (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedSignal(signal)
                            }}
                          >
                            Clear Flag
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Clear Flag Dialog */}
      <Dialog
        open={!!selectedSignal}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedSignal(null)
            setClearReason("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear Fraud Flag</DialogTitle>
            <DialogDescription>
              Provide a reason for clearing this fraud signal. This action will
              be logged for audit purposes.
            </DialogDescription>
          </DialogHeader>

          {selectedSignal && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-medium">
                    {formatSignalType(selectedSignal.signal_type)}
                  </span>
                  {getSeverityBadge(selectedSignal.severity)}
                </div>
                <p className="text-sm text-muted-foreground">
                  User: {selectedSignal.user?.email || selectedSignal.user_id}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="clear-reason">Reason for Clearing *</Label>
                <Textarea
                  id="clear-reason"
                  placeholder="Explain why this flag is being cleared..."
                  value={clearReason}
                  onChange={(e) => setClearReason(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setSelectedSignal(null)
                setClearReason("")
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleClearFlag}
              disabled={!clearReason.trim() || isClearing}
            >
              {isClearing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Clearing...
                </>
              ) : (
                "Clear Flag"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default FraudSignalsList
