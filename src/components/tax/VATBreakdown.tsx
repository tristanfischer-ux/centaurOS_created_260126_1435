"use client"

/**
 * VAT Breakdown Component
 * Displays VAT breakdown for orders with net, VAT, and gross amounts
 */

import { Info, AlertCircle } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Separator } from "@/components/ui/separator"
import {
  VATBreakdown as VATBreakdownType,
  TaxTreatment,
  TAX_TREATMENT_LABELS,
} from "@/types/invoices"

interface VATBreakdownProps {
  breakdown: VATBreakdownType
  currency?: string
  showCard?: boolean
  showTitle?: boolean
  compact?: boolean
}

// Format currency
function formatCurrency(amount: number, currency: string = "GBP"): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

// Format percentage
function formatPercentage(rate: number): string {
  return `${(rate * 100).toFixed(0)}%`
}

// Tax treatment badge colors
function getTaxTreatmentVariant(
  treatment: TaxTreatment
): "default" | "secondary" | "secondary" | "destructive" {
  switch (treatment) {
    case "standard":
      return "default"
    case "reverse_charge":
      return "secondary"
    case "zero_rated":
      return "secondary"
    case "exempt":
      return "secondary"
    default:
      return "default"
  }
}

// Tax treatment explanations
const taxTreatmentExplanations: Record<TaxTreatment, string> = {
  standard:
    "Standard UK VAT rate of 20% applies to this transaction.",
  reverse_charge:
    "Reverse charge: The buyer is responsible for accounting for VAT to their local tax authority.",
  zero_rated:
    "Zero-rated for VAT purposes as this is an export of services.",
  exempt:
    "This transaction is exempt from VAT.",
}

export function VATBreakdown({
  breakdown,
  currency = "GBP",
  showCard = true,
  showTitle = true,
  compact = false,
}: VATBreakdownProps) {
  const content = (
    <div className={compact ? "space-y-2" : "space-y-4"}>
      {/* Tax Treatment Badge */}
      <div className="flex items-center gap-2">
        <Badge variant={getTaxTreatmentVariant(breakdown.taxTreatment)}>
          {breakdown.taxTreatmentLabel || TAX_TREATMENT_LABELS[breakdown.taxTreatment]}
        </Badge>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Info className="h-4 w-4 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p>{taxTreatmentExplanations[breakdown.taxTreatment]}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Amounts Table */}
      <div className={`space-y-${compact ? "1" : "2"}`}>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Subtotal (excl. VAT)</span>
          <span>{formatCurrency(breakdown.netAmount, currency)}</span>
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">
            VAT @ {formatPercentage(breakdown.vatRate)}
          </span>
          <span>
            {breakdown.vatAmount > 0
              ? formatCurrency(breakdown.vatAmount, currency)
              : "-"}
          </span>
        </div>

        <Separator className={compact ? "my-1" : "my-2"} />

        <div className="flex justify-between font-medium">
          <span>Total</span>
          <span>{formatCurrency(breakdown.grossAmount, currency)}</span>
        </div>
      </div>

      {/* Reverse Charge Notice */}
      {breakdown.taxTreatment === "reverse_charge" && (
        <div className="flex items-start gap-2 p-2 rounded bg-status-warning-light border border-status-warning text-sm">
          <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <p className="text-amber-800">
            Reverse charge applies: You must account for VAT at the
            applicable rate in your country.
          </p>
        </div>
      )}

      {/* Zero-Rated Notice */}
      {breakdown.taxTreatment === "zero_rated" && (
        <div className="flex items-start gap-2 p-2 rounded bg-status-info-light border border-status-info text-sm">
          <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <p className="text-blue-800">
            Zero-rated export: No VAT is charged on this transaction.
          </p>
        </div>
      )}
    </div>
  )

  if (!showCard) {
    return content
  }

  return (
    <Card>
      {showTitle && (
        <CardHeader className={compact ? "pb-2" : undefined}>
          <CardTitle className={compact ? "text-base" : undefined}>
            VAT Summary
          </CardTitle>
          <CardDescription>Tax breakdown for this order</CardDescription>
        </CardHeader>
      )}
      <CardContent className={!showTitle && compact ? "pt-4" : undefined}>
        {content}
      </CardContent>
    </Card>
  )
}

/**
 * Inline VAT breakdown for order summaries
 */
interface InlineVATBreakdownProps {
  netAmount: number
  vatRate: number
  vatAmount: number
  grossAmount: number
  currency?: string
}

export function InlineVATBreakdown({
  netAmount,
  vatRate,
  vatAmount,
  grossAmount,
  currency = "GBP",
}: InlineVATBreakdownProps) {
  return (
    <div className="text-sm space-y-1">
      <div className="flex justify-between">
        <span className="text-muted-foreground">Net</span>
        <span>{formatCurrency(netAmount, currency)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">
          VAT ({formatPercentage(vatRate)})
        </span>
        <span>{formatCurrency(vatAmount, currency)}</span>
      </div>
      <div className="flex justify-between font-medium pt-1 border-t">
        <span>Total</span>
        <span>{formatCurrency(grossAmount, currency)}</span>
      </div>
    </div>
  )
}

/**
 * Simple VAT line for compact displays
 */
interface VATLineProps {
  total: number
  vatRate: number
  currency?: string
}

export function VATLine({ total, vatRate, currency = "GBP" }: VATLineProps) {
  const net = total / (1 + vatRate)
  const vat = total - net

  return (
    <span className="text-sm text-muted-foreground">
      {formatCurrency(total, currency)}
      {vatRate > 0 && (
        <> (incl. {formatCurrency(vat, currency)} VAT)</>
      )}
    </span>
  )
}

export default VATBreakdown
