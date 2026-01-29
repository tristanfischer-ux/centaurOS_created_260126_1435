"use client"

/**
 * Dispute Form Component
 * Form for creating and submitting disputes
 */

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AlertTriangle, Upload, X, Loader2, FileText } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface DisputeFormProps {
  orderId: string
  orderNumber: string
  orderAmount: number
  onSubmit: (data: {
    orderId: string
    reason: string
    description: string
    evidenceUrls: string[]
  }) => Promise<{ success: boolean; error?: string }>
  onCancel?: () => void
}

const DISPUTE_REASONS = [
  { value: "not_as_described", label: "Service not as described" },
  { value: "quality_issues", label: "Quality issues" },
  { value: "incomplete_delivery", label: "Incomplete delivery" },
  { value: "late_delivery", label: "Late delivery" },
  { value: "communication_issues", label: "Communication issues" },
  { value: "unauthorized_charges", label: "Unauthorized charges" },
  { value: "no_delivery", label: "No delivery/service" },
  { value: "other", label: "Other" },
]

export function DisputeForm({
  orderId,
  orderNumber,
  orderAmount,
  onSubmit,
  onCancel,
}: DisputeFormProps) {
  const [reason, setReason] = useState("")
  const [description, setDescription] = useState("")
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [dragActive, setDragActive] = useState(false)

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    // In a real implementation, this would upload files to storage
    // For now, we'll just show a message
    toast.info("File upload would be processed here")
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      // In a real implementation, this would upload files to storage
      toast.info("File upload would be processed here")
    }
  }

  const addEvidenceUrl = (url: string) => {
    if (url && !evidenceUrls.includes(url)) {
      setEvidenceUrls([...evidenceUrls, url])
    }
  }

  const removeEvidenceUrl = (url: string) => {
    setEvidenceUrls(evidenceUrls.filter((u) => u !== url))
  }

  const handleSubmit = async () => {
    if (!reason) {
      toast.error("Please select a reason for the dispute")
      return
    }

    if (description.length < 50) {
      toast.error("Please provide a more detailed description (at least 50 characters)")
      return
    }

    setIsSubmitting(true)

    try {
      const result = await onSubmit({
        orderId,
        reason,
        description: description.trim(),
        evidenceUrls,
      })

      if (result.success) {
        toast.success("Dispute submitted successfully")
      } else {
        toast.error(result.error || "Failed to submit dispute")
      }
    } catch {
      toast.error("An error occurred while submitting the dispute")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-950/20">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <CardTitle>Open a Dispute</CardTitle>
            <CardDescription>
              Order #{orderNumber} - £{orderAmount.toLocaleString()}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Warning Banner */}
        <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
          <p className="text-sm text-amber-700 dark:text-amber-400">
            <strong>Before opening a dispute:</strong> We recommend first
            contacting the seller to resolve the issue directly. Disputes can take
            time to resolve and may affect your relationship with the seller.
          </p>
        </div>

        {/* Reason Selection */}
        <div className="space-y-2">
          <Label htmlFor="reason">Reason for Dispute *</Label>
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger id="reason">
              <SelectValue placeholder="Select a reason" />
            </SelectTrigger>
            <SelectContent>
              {DISPUTE_REASONS.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor="description">Detailed Description *</Label>
          <Textarea
            id="description"
            placeholder="Please describe the issue in detail. Include specific examples, dates, and any relevant context..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            maxLength={2000}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Minimum 50 characters</span>
            <span>{description.length}/2000 characters</span>
          </div>
        </div>

        {/* Evidence Upload */}
        <div className="space-y-2">
          <Label>Supporting Evidence (Optional)</Label>
          <p className="text-sm text-muted-foreground">
            Upload screenshots, documents, or other evidence to support your claim.
          </p>

          {/* Drag and Drop Zone */}
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-6 text-center transition-colors",
              dragActive
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-muted-foreground/50"
            )}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground mb-2">
              Drag and drop files here, or
            </p>
            <label htmlFor="file-upload">
              <Button variant="secondary" size="sm" asChild>
                <span>Browse Files</span>
              </Button>
              <input
                id="file-upload"
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx"
                className="hidden"
                onChange={handleFileInput}
              />
            </label>
            <p className="text-xs text-muted-foreground mt-2">
              Max 10MB per file. Supported: Images, PDF, Word documents
            </p>
          </div>

          {/* Manual URL Input */}
          <div className="flex gap-2">
            <Input
              placeholder="Or paste a URL to evidence..."
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  const input = e.target as HTMLInputElement
                  addEvidenceUrl(input.value)
                  input.value = ""
                }
              }}
            />
            <Button
              variant="secondary"
              onClick={(e) => {
                const input = (e.target as HTMLElement)
                  .parentElement?.querySelector("input") as HTMLInputElement
                if (input) {
                  addEvidenceUrl(input.value)
                  input.value = ""
                }
              }}
            >
              Add URL
            </Button>
          </div>

          {/* Evidence List */}
          {evidenceUrls.length > 0 && (
            <div className="space-y-2 mt-3">
              {evidenceUrls.map((url, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 p-2 rounded bg-muted/50"
                >
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm flex-1 truncate">{url}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeEvidenceUrl(url)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          {onCancel && (
            <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
              Cancel
            </Button>
          )}
          <Button
            onClick={handleSubmit}
            disabled={!reason || description.length < 50 || isSubmitting}
            variant="destructive"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <AlertTriangle className="h-4 w-4 mr-2" />
                Submit Dispute
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default DisputeForm
