/**
 * @file payment-page-view.tsx — Client component for the public payment checkout
 *
 * @description Renders the payment amount and description for unauthenticated
 * users. Payment processing will use Stripe Checkout or Payment Element
 * when integrated with the Stripe webhook flow.
 */

'use client'

import { CheckCircle2, AlertCircle, Shield } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { PaymentLink } from '@/types/finance'

interface PaymentPageViewProps {
  paymentLink: PaymentLink | null
  error: string | null
}

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(amount / 100)
}

export function PaymentPageView({ paymentLink, error }: PaymentPageViewProps) {
  if (error || !paymentLink) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <h1 className="text-xl font-display font-bold text-foreground">
              Payment link unavailable
            </h1>
            <p className="text-sm text-muted-foreground">
              {error || 'This payment link may have expired or been cancelled.'}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (paymentLink.status === 'paid') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
              <CheckCircle2 className="h-6 w-6 text-status-success" />
            </div>
            <h1 className="text-xl font-display font-bold text-foreground">
              Payment received
            </h1>
            <p className="text-sm text-muted-foreground">
              This payment of {formatAmount(paymentLink.amount, paymentLink.currency)} has already been processed. Thank you.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="py-8 space-y-6">
          {/* Logo */}
          <div className="text-center">
            <h2 className="text-sm font-medium text-muted-foreground">Payment to</h2>
            <h1 className="text-lg font-display font-bold text-foreground mt-1">
              Fractional Forge
            </h1>
          </div>

          {/* Amount */}
          <div className="text-center py-6 border-y border-border">
            <p className="text-4xl font-display font-bold text-foreground">
              {formatAmount(paymentLink.amount, paymentLink.currency)}
            </p>
            {paymentLink.description && (
              <p className="text-sm text-muted-foreground mt-2">
                {paymentLink.description}
              </p>
            )}
          </div>

          {/* Payment Button */}
          <Button
            className="w-full bg-international-orange hover:bg-international-orange/90 h-12 text-base"
            onClick={() => {
              // INTENT: In production, this would initiate Stripe Checkout or
              // mount a Stripe Payment Element. For now, show a placeholder.
              // The payment flow will be connected when Stripe Checkout sessions
              // are configured for standalone payment links.
              alert('Stripe Checkout integration coming soon. This is a preview of the payment page.')
            }}
          >
            Pay {formatAmount(paymentLink.amount, paymentLink.currency)}
          </Button>

          {/* Security note */}
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Shield className="h-3 w-3" />
            <span>Payments processed securely via Stripe</span>
          </div>

          {paymentLink.expiresAt && (
            <p className="text-xs text-muted-foreground text-center">
              This link expires on {new Date(paymentLink.expiresAt).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
