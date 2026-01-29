"use client"

/**
 * Invoice Preview Component
 * Preview invoice before generation or view existing invoice
 */

import { useState, useEffect } from "react"
import { FileText, Download, RefreshCw, X, Maximize2, Minimize2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Invoice, InvoiceDocumentType } from "@/types/invoices"
import { previewInvoice, downloadInvoice } from "@/actions/invoices"

interface InvoicePreviewProps {
  orderId?: string
  invoiceId?: string
  documentType?: InvoiceDocumentType
  html?: string
  onClose?: () => void
}

export function InvoicePreview({
  orderId,
  invoiceId,
  documentType = "invoice",
  html: initialHtml,
  onClose,
}: InvoicePreviewProps) {
  const [html, setHtml] = useState<string | null>(initialHtml || null)
  const [loading, setLoading] = useState(!initialHtml && !!orderId)
  const [error, setError] = useState<string | null>(null)
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    if (orderId && !initialHtml) {
      loadPreview()
    }
  }, [orderId, documentType, initialHtml])

  async function loadPreview() {
    if (!orderId) return

    setLoading(true)
    setError(null)

    try {
      const result = await previewInvoice(orderId, documentType)

      if (result.error) {
        setError(result.error)
      } else {
        setHtml(result.html)
      }
    } catch (err) {
      setError("Failed to load invoice preview")
    } finally {
      setLoading(false)
    }
  }

  async function handleDownload() {
    if (!invoiceId) return

    try {
      const result = await downloadInvoice(invoiceId)
      if (result.url) {
        window.open(result.url, "_blank")
      }
    } catch (err) {
      setError("Failed to download invoice")
    }
  }

  if (loading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Invoice Preview</CardTitle>
          <CardDescription>Loading preview...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32" />
            <div className="h-[400px] bg-muted rounded animate-pulse" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Invoice Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-destructive mb-4">{error}</p>
            {orderId && (
              <Button variant="secondary" onClick={loadPreview}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!html) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Invoice Preview</CardTitle>
          <CardDescription>No preview available</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Preview not available</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const PreviewContent = () => (
    <div className="relative">
      <div className="absolute top-2 right-2 z-10 flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setFullscreen(!fullscreen)}
        >
          {fullscreen ? (
            <Minimize2 className="h-4 w-4" />
          ) : (
            <Maximize2 className="h-4 w-4" />
          )}
        </Button>
        {invoiceId && (
          <Button variant="secondary" size="sm" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
        )}
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div
        className={`bg-white rounded-lg shadow-inner overflow-auto ${
          fullscreen ? "h-[90vh]" : "h-[600px]"
        }`}
      >
        <iframe
          srcDoc={html}
          className="w-full h-full border-0"
          title="Invoice Preview"
          sandbox="allow-same-origin"
        />
      </div>
    </div>
  )

  if (fullscreen) {
    return (
      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent className="max-w-4xl h-[95vh]">
          <DialogHeader className="sr-only">
            <DialogTitle>Invoice Preview</DialogTitle>
            <DialogDescription>Full screen invoice preview</DialogDescription>
          </DialogHeader>
          <PreviewContent />
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Invoice Preview</CardTitle>
            <CardDescription>
              Preview before downloading or sharing
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <PreviewContent />
      </CardContent>
    </Card>
  )
}

/**
 * Invoice Preview Modal
 * Opens preview in a modal dialog
 */
interface InvoicePreviewModalProps {
  orderId: string
  documentType?: InvoiceDocumentType
  trigger?: React.ReactNode
  children?: React.ReactNode
}

export function InvoicePreviewModal({
  orderId,
  documentType = "invoice",
  trigger,
  children,
}: InvoicePreviewModalProps) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="secondary" size="sm">
            <FileText className="h-4 w-4 mr-2" />
            Preview Invoice
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Invoice Preview</DialogTitle>
          <DialogDescription>
            Preview the invoice before it&apos;s generated
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-auto">
          <InvoicePreview
            orderId={orderId}
            documentType={documentType}
            onClose={() => setOpen(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default InvoicePreview
