"use client"

/**
 * Privacy Settings Component
 * Main privacy settings interface with data request options and history
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
import { DataRequestForm } from "./DataRequestForm"
import { DataRequestList } from "./DataRequestStatus"
import {
  getMyDataRequests,
  hasPendingRequests,
  getMyExportSummary,
  getDeletionEligibility,
} from "@/actions/gdpr"
import { DataRequest, DataRequestType } from "@/types/gdpr"
import {
  Shield,
  Download,
  Trash2,
  Eye,
  FileText,
  Info,
  Loader2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react"

interface PrivacySettingsProps {
  initialRequests?: DataRequest[]
}

export function PrivacySettings({ initialRequests = [] }: PrivacySettingsProps) {
  const [requests, setRequests] = useState<DataRequest[]>(initialRequests)
  const [pendingTypes, setPendingTypes] = useState<DataRequestType[]>([])
  const [loading, setLoading] = useState(!initialRequests.length)
  const [showForm, setShowForm] = useState(false)
  const [exportSummary, setExportSummary] = useState<
    { category: string; itemCount: number; description: string }[] | null
  >(null)
  const [deletionEligibility, setDeletionEligibility] = useState<{
    canDeleteNow: boolean
    canAnonymize: boolean
    retentionEndDate: string | null
    reason: string | null
    blockers: { dataType: string; reason: string; releaseDate: string | null }[]
  } | null>(null)
  const [loadingEligibility, setLoadingEligibility] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [requestsResult, pendingResult] = await Promise.all([
        getMyDataRequests(),
        hasPendingRequests(),
      ])

      if (requestsResult.data) {
        setRequests(requestsResult.data)
      }

      if (!pendingResult.error) {
        setPendingTypes(pendingResult.pendingTypes)
      }
    } catch (err) {
      console.error("Error fetching data:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!initialRequests.length) {
      fetchData()
    }
  }, [initialRequests.length, fetchData])

  const handleLoadExportSummary = async () => {
    try {
      const result = await getMyExportSummary()
      if (!result.error) {
        setExportSummary(result.summary)
      }
    } catch (err) {
      console.error("Error loading export summary:", err)
    }
  }

  const handleCheckDeletionEligibility = async () => {
    setLoadingEligibility(true)
    try {
      const result = await getDeletionEligibility()
      if (!result.error) {
        setDeletionEligibility(result)
      }
    } catch (err) {
      console.error("Error checking eligibility:", err)
    } finally {
      setLoadingEligibility(false)
    }
  }

  const handleRequestCreated = () => {
    setShowForm(false)
    fetchData()
  }

  const activeRequests = requests.filter((r) =>
    ["pending", "processing"].includes(r.status)
  )
  const completedRequests = requests.filter((r) =>
    ["completed", "denied"].includes(r.status)
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Privacy Settings
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your data and exercise your privacy rights
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchData}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setShowForm(true)}>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-blue-100 text-electric-blue dark:bg-blue-950">
                <Eye className="h-5 w-5" />
              </div>
              <CardTitle className="text-base">Access My Data</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Request a copy of all personal data we hold about you
            </p>
            {pendingTypes.includes("access") && (
              <Badge variant="warning" className="mt-2">Request Pending</Badge>
            )}
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setShowForm(true)}>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-green-100 text-green-600 dark:bg-green-950">
                <Download className="h-5 w-5" />
              </div>
              <CardTitle className="text-base">Export My Data</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Download your data in a machine-readable format
            </p>
            {pendingTypes.includes("export") && (
              <Badge variant="warning" className="mt-2">Request Pending</Badge>
            )}
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setShowForm(true)}>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-orange-100 text-international-orange dark:bg-orange-950">
                <Trash2 className="h-5 w-5" />
              </div>
              <CardTitle className="text-base">Delete My Account</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Request deletion of your personal data and account
            </p>
            {pendingTypes.includes("deletion") && (
              <Badge variant="warning" className="mt-2">Request Pending</Badge>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Request Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <DataRequestForm
              pendingTypes={pendingTypes}
              onRequestCreated={handleRequestCreated}
            />
            <Button
              variant="ghost"
              className="absolute top-4 right-4"
              onClick={() => setShowForm(false)}
            >
              Close
            </Button>
          </div>
        </div>
      )}

      {/* Active Requests */}
      {activeRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Active Requests
              <Badge variant="warning" className="ml-2">
                {activeRequests.length}
              </Badge>
            </CardTitle>
            <CardDescription>
              Requests that are currently being processed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataRequestList
              requests={activeRequests}
              onStatusChange={fetchData}
            />
          </CardContent>
        </Card>
      )}

      {/* Data Overview Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            Your Data Overview
          </CardTitle>
          <CardDescription>
            See what data we hold about you and your deletion eligibility
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Export Summary */}
          {!exportSummary ? (
            <Button variant="outline" onClick={handleLoadExportSummary}>
              <Eye className="h-4 w-4 mr-2" />
              View Data Summary
            </Button>
          ) : (
            <div className="space-y-3">
              <h4 className="font-medium">Data Categories</h4>
              <div className="grid gap-2">
                {exportSummary.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-sm">{item.category}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.description}
                      </p>
                    </div>
                    <Badge variant="outline">{item.itemCount} items</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          <hr />

          {/* Deletion Eligibility */}
          {!deletionEligibility ? (
            <Button
              variant="outline"
              onClick={handleCheckDeletionEligibility}
              disabled={loadingEligibility}
            >
              {loadingEligibility ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Check Deletion Eligibility
            </Button>
          ) : (
            <div className="space-y-3">
              <h4 className="font-medium">Account Deletion Status</h4>
              {deletionEligibility.canDeleteNow ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Immediate Deletion Available</AlertTitle>
                  <AlertDescription>
                    Your account can be deleted immediately upon request.
                  </AlertDescription>
                </Alert>
              ) : deletionEligibility.canAnonymize ? (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Partial Deletion Available</AlertTitle>
                  <AlertDescription>
                    <p>
                      Your account can be anonymized. Some data must be retained
                      for legal reasons.
                    </p>
                    {deletionEligibility.retentionEndDate && (
                      <p className="mt-2">
                        Full deletion available after:{" "}
                        <strong>
                          {new Date(
                            deletionEligibility.retentionEndDate
                          ).toLocaleDateString()}
                        </strong>
                      </p>
                    )}
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Deletion Not Currently Available</AlertTitle>
                  <AlertDescription>
                    <p>Your account cannot be deleted at this time due to:</p>
                    <ul className="list-disc list-inside mt-2 space-y-1">
                      {deletionEligibility.blockers.map((blocker, i) => (
                        <li key={i} className="text-sm">
                          {blocker.reason}
                          {blocker.releaseDate && (
                            <span className="text-xs ml-1">
                              (available after{" "}
                              {new Date(blocker.releaseDate).toLocaleDateString()})
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Request History */}
      {completedRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Request History
            </CardTitle>
            <CardDescription>
              Previously completed or denied requests
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataRequestList
              requests={completedRequests}
              onStatusChange={fetchData}
            />
          </CardContent>
        </Card>
      )}

      {/* UK GDPR Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Your Privacy Rights
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Under UK GDPR, you have the following rights regarding your personal
            data:
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            {[
              {
                title: "Right of Access (Article 15)",
                description: "Request a copy of all personal data we hold about you",
              },
              {
                title: "Right to Rectification (Article 16)",
                description: "Request correction of inaccurate personal data",
              },
              {
                title: "Right to Erasure (Article 17)",
                description: 'Request deletion of your data ("Right to be Forgotten")',
              },
              {
                title: "Right to Data Portability (Article 20)",
                description: "Receive your data in a machine-readable format",
              },
            ].map((right, i) => (
              <div key={i} className="p-3 border rounded-lg">
                <p className="font-medium text-sm">{right.title}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {right.description}
                </p>
              </div>
            ))}
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              We aim to respond to all data requests within 30 days. Some
              financial data must be retained for 7 years in accordance with UK
              tax law.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  )
}

export default PrivacySettings
