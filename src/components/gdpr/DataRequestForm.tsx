"use client"

/**
 * Data Request Form Component
 * Allows users to submit GDPR data access, export, or deletion requests
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  requestDataAccess,
  requestDataExport,
  requestDataDeletion,
} from "@/actions/gdpr"
import { DataRequestType } from "@/types/gdpr"
import {
  Download,
  Eye,
  Trash2,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Info,
} from "lucide-react"

interface DataRequestFormProps {
  pendingTypes?: DataRequestType[]
  onRequestCreated?: () => void
}

const REQUEST_TYPES = [
  {
    type: "access" as DataRequestType,
    title: "Access My Data",
    description:
      "Get a copy of all personal data we hold about you (GDPR Article 15)",
    icon: Eye,
    variant: "info" as const,
    processingTime: "Usually within 24-48 hours",
  },
  {
    type: "export" as DataRequestType,
    title: "Export My Data",
    description:
      "Download your data in a machine-readable format (GDPR Article 20)",
    icon: Download,
    variant: "info" as const,
    processingTime: "Usually within 24-48 hours",
  },
  {
    type: "deletion" as DataRequestType,
    title: "Delete My Data",
    description:
      "Request deletion of your personal data (GDPR Article 17 - Right to be Forgotten)",
    icon: Trash2,
    variant: "warning" as const,
    processingTime: "Reviewed within 5 business days",
  },
]

export function DataRequestForm({
  pendingTypes = [],
  onRequestCreated,
}: DataRequestFormProps) {
  const [selectedType, setSelectedType] = useState<DataRequestType | null>(null)
  const [reason, setReason] = useState("")
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [deletionInfo, setDeletionInfo] = useState<{
    canDeleteNow: boolean
    canAnonymize: boolean
    retentionEndDate: string | null
    blockers: string[]
  } | null>(null)

  const handleSubmit = async () => {
    if (!selectedType || !termsAccepted) return

    if (selectedType === "deletion" && reason.length < 10) {
      setError("Please provide a reason for your deletion request")
      return
    }

    setLoading(true)
    setError(null)

    try {
      let result

      switch (selectedType) {
        case "access":
          result = await requestDataAccess()
          break
        case "export":
          result = await requestDataExport()
          break
        case "deletion":
          const deletionResult = await requestDataDeletion(reason)
          result = deletionResult
          if (deletionResult.deletionInfo) {
            setDeletionInfo(deletionResult.deletionInfo)
          }
          break
      }

      if (result?.error) {
        setError(result.error)
      } else {
        setSuccess(true)
        onRequestCreated?.()
      }
    } catch {
      setError("An unexpected error occurred. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setSelectedType(null)
    setReason("")
    setTermsAccepted(false)
    setSuccess(false)
    setError(null)
    setDeletionInfo(null)
  }

  if (success) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <CardTitle>Request Submitted</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Your {selectedType} request has been submitted successfully. We will
            process it as soon as possible.
          </p>

          {deletionInfo && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Deletion Request Information</AlertTitle>
              <AlertDescription>
                {deletionInfo.canDeleteNow ? (
                  <p>Your data can be deleted immediately upon review.</p>
                ) : deletionInfo.canAnonymize ? (
                  <p>
                    Some data must be retained for legal reasons. Your account
                    will be anonymized and personal data removed where possible.
                  </p>
                ) : (
                  <div>
                    <p>
                      Some data must be retained due to legal requirements:
                    </p>
                    <ul className="list-disc list-inside mt-2 text-sm">
                      {deletionInfo.blockers.map((blocker, i) => (
                        <li key={i}>{blocker}</li>
                      ))}
                    </ul>
                    {deletionInfo.retentionEndDate && (
                      <p className="mt-2 text-sm">
                        Full deletion available after:{" "}
                        {new Date(
                          deletionInfo.retentionEndDate
                        ).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          <p className="text-sm text-muted-foreground">
            You can track the status of your request in the Privacy Settings
            page.
          </p>
        </CardContent>
        <CardFooter>
          <Button onClick={resetForm} variant="secondary">
            Submit Another Request
          </Button>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Submit a Data Request</CardTitle>
        <CardDescription>
          Exercise your GDPR rights by submitting a data request. All requests
          are processed in accordance with UK GDPR regulations.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Request Type Selection */}
        <div className="space-y-3">
          <label className="text-sm font-medium">Select Request Type</label>
          <div className="grid gap-3">
            {REQUEST_TYPES.map((reqType) => {
              const isPending = pendingTypes.includes(reqType.type)
              const Icon = reqType.icon

              return (
                <button
                  key={reqType.type}
                  onClick={() => !isPending && setSelectedType(reqType.type)}
                  disabled={isPending}
                  className={`flex items-start gap-4 p-4 border rounded-lg text-left transition-all ${
                    selectedType === reqType.type
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : isPending
                      ? "border-muted bg-muted/50 opacity-60 cursor-not-allowed"
                      : "border-border hover:border-primary/50 hover:bg-muted/20"
                  }`}
                >
                  <div
                    className={`p-2 rounded-lg ${
                      reqType.variant === "warning"
                        ? "bg-orange-100 text-international-orange dark:bg-orange-950"
                        : "bg-blue-100 text-electric-blue dark:bg-blue-950"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{reqType.title}</span>
                      {isPending && (
                        <Badge variant="warning">Request Pending</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {reqType.description}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {reqType.processingTime}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Reason Input (for deletion) */}
        {selectedType === "deletion" && (
          <div className="space-y-2">
            <Alert variant="destructive" className="bg-orange-50 dark:bg-orange-950/20 border-international-orange/50">
              <AlertTriangle className="h-4 w-4 text-international-orange" />
              <AlertTitle className="text-international-orange">Important: Account Deletion</AlertTitle>
              <AlertDescription className="text-international-orange/80">
                <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                  <li>
                    This action cannot be undone once processed
                  </li>
                  <li>
                    Some data may be retained for legal/tax compliance (up to 7
                    years)
                  </li>
                  <li>
                    Any pending orders must be completed or cancelled first
                  </li>
                  <li>
                    Reviews you&apos;ve left will be anonymized but content kept
                  </li>
                </ul>
              </AlertDescription>
            </Alert>

            <label htmlFor="reason" className="text-sm font-medium">
              Reason for Deletion <span className="text-red-500">*</span>
            </label>
            <textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Please tell us why you want to delete your account..."
              className="w-full min-h-[100px] p-3 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary bg-background"
              required
            />
            <p className="text-xs text-muted-foreground">
              Minimum 10 characters required
            </p>
          </div>
        )}

        {/* Terms Acknowledgment */}
        {selectedType && (
          <div className="flex items-start gap-3 p-4 border rounded-lg bg-muted/20">
            <input
              type="checkbox"
              id="terms"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <label htmlFor="terms" className="text-sm">
              I understand that this request will be processed in accordance
              with UK GDPR regulations. Requests are typically processed within
              30 days, though we aim to respond much sooner.
              {selectedType === "deletion" &&
                " I acknowledge that account deletion is irreversible."}
            </label>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>

      <CardFooter className="flex justify-between">
        <Button variant="secondary" onClick={resetForm} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={
            !selectedType ||
            !termsAccepted ||
            loading ||
            (selectedType === "deletion" && reason.length < 10)
          }
          variant={selectedType === "deletion" ? "destructive" : "default"}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Submitting...
            </>
          ) : (
            "Submit Request"
          )}
        </Button>
      </CardFooter>
    </Card>
  )
}

export default DataRequestForm
