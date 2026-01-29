"use client"

/**
 * Invoice List Component
 * Displays a list of invoices with download and status indicators
 */

import { useState, useEffect } from "react"
import { FileText, Download, Eye, RefreshCw, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { InvoiceSummary, InvoiceDocumentType } from "@/types/invoices"
import { getInvoicesForOrder, downloadInvoice } from "@/actions/invoices"

interface InvoiceListProps {
  orderId?: string
  invoices?: InvoiceSummary[]
  showHeader?: boolean
  compact?: boolean
}

// Document type labels and colors
const documentTypeConfig: Record<InvoiceDocumentType, { label: string; variant: "default" | "secondary" | "outline" }> = {
  invoice: { label: "Invoice", variant: "default" },
  receipt: { label: "Receipt", variant: "secondary" },
  statement: { label: "Statement", variant: "outline" },
  credit_note: { label: "Credit Note", variant: "secondary" },
  self_bill: { label: "Self-Bill", variant: "outline" },
  platform_fee: { label: "Platform Fee", variant: "outline" },
}

// Format currency
function formatCurrency(amount: number, currency: string = "GBP"): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
  }).format(amount)
}

// Format date
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

export function InvoiceList({
  orderId,
  invoices: initialInvoices,
  showHeader = true,
  compact = false,
}: InvoiceListProps) {
  const [invoices, setInvoices] = useState<InvoiceSummary[]>(initialInvoices || [])
  const [loading, setLoading] = useState(!initialInvoices && !!orderId)
  const [error, setError] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  useEffect(() => {
    if (orderId && !initialInvoices) {
      loadInvoices()
    }
  }, [orderId, initialInvoices])

  async function loadInvoices() {
    if (!orderId) return
    
    setLoading(true)
    setError(null)

    try {
      const result = await getInvoicesForOrder(orderId)
      
      if (result.error) {
        setError(result.error)
      } else {
        // Map to InvoiceSummary format
        const mappedInvoices: InvoiceSummary[] = result.data.map(doc => ({
          id: doc.id,
          orderId: orderId,
          invoiceNumber: `INV-${doc.id.slice(0, 8).toUpperCase()}`,
          documentType: doc.documentType as InvoiceDocumentType,
          status: "generated",
          total: 0, // Would need to join with order
          currency: "GBP",
          issueDate: doc.generatedAt,
          fileUrl: doc.fileUrl,
        }))
        setInvoices(mappedInvoices)
      }
    } catch (err) {
      setError("Failed to load invoices")
    } finally {
      setLoading(false)
    }
  }

  async function handleDownload(invoiceId: string) {
    setDownloadingId(invoiceId)
    
    try {
      const result = await downloadInvoice(invoiceId)
      
      if (result.url) {
        // Open in new tab or trigger download
        window.open(result.url, "_blank")
      } else {
        setError(result.error || "Failed to download invoice")
      }
    } catch (err) {
      setError("Failed to download invoice")
    } finally {
      setDownloadingId(null)
    }
  }

  if (loading) {
    return (
      <Card>
        {showHeader && (
          <CardHeader>
            <CardTitle>Invoices</CardTitle>
            <CardDescription>Loading invoices...</CardDescription>
          </CardHeader>
        )}
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-10 w-10 rounded" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-9 w-24" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        {showHeader && (
          <CardHeader>
            <CardTitle>Invoices</CardTitle>
          </CardHeader>
        )}
        <CardContent>
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
          {orderId && (
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={loadInvoices}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          )}
        </CardContent>
      </Card>
    )
  }

  if (invoices.length === 0) {
    return (
      <Card>
        {showHeader && (
          <CardHeader>
            <CardTitle>Invoices</CardTitle>
            <CardDescription>No invoices generated yet</CardDescription>
          </CardHeader>
        )}
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No invoices available</p>
            <p className="text-sm mt-1">
              Invoices will be generated when the order is completed
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (compact) {
    return (
      <div className="space-y-2">
        {invoices.map((invoice) => (
          <div
            key={invoice.id}
            className="flex items-center justify-between p-3 border rounded-lg"
          >
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium text-sm">{invoice.invoiceNumber}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(invoice.issueDate)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={documentTypeConfig[invoice.documentType]?.variant || "default"}>
                {documentTypeConfig[invoice.documentType]?.label || invoice.documentType}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDownload(invoice.id)}
                disabled={downloadingId === invoice.id}
              >
                {downloadingId === invoice.id ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <Card>
      {showHeader && (
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
          <CardDescription>
            {invoices.length} invoice{invoices.length !== 1 ? "s" : ""} available
          </CardDescription>
        </CardHeader>
      )}
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{invoice.invoiceNumber}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={documentTypeConfig[invoice.documentType]?.variant || "default"}>
                    {documentTypeConfig[invoice.documentType]?.label || invoice.documentType}
                  </Badge>
                </TableCell>
                <TableCell>{formatDate(invoice.issueDate)}</TableCell>
                <TableCell className="text-right">
                  {invoice.total > 0 ? formatCurrency(invoice.total, invoice.currency) : "-"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {invoice.fileUrl && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open(invoice.fileUrl, "_blank")}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownload(invoice.id)}
                      disabled={downloadingId === invoice.id}
                    >
                      {downloadingId === invoice.id ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

export default InvoiceList
