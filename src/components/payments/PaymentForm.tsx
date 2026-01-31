'use client'

/**
 * PaymentForm Component
 * Stripe Elements integration for card input and payment processing
 */

import { useState, useEffect } from 'react'
import { loadStripe, StripeElementsOptions } from '@stripe/stripe-js'
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  CreditCard,
  Shield,
  Lock,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'
import { formatCurrency, calculateFeeBreakdown, DEFAULT_PLATFORM_FEE_PERCENT } from '@/types/payments'
import type { PaymentFormProps } from '@/types/payments'

// Initialize Stripe with public key
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '')

interface PaymentFormInnerProps {
  amount: number
  currency: string
  onSuccess: (paymentIntentId: string) => void
  onError: (error: string) => void
}

/**
 * Inner form component that uses Stripe hooks
 */
function PaymentFormInner({ amount, currency, onSuccess, onError }: PaymentFormInnerProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!stripe || !elements) {
      return
    }

    setIsProcessing(true)
    setErrorMessage(null)

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/marketplace/orders?payment=success`,
        },
        redirect: 'if_required',
      })

      if (error) {
        setErrorMessage(error.message || 'Payment failed')
        onError(error.message || 'Payment failed')
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        onSuccess(paymentIntent.id)
      } else if (paymentIntent) {
        // Handle other statuses
        setErrorMessage(`Payment status: ${paymentIntent.status}`)
        onError(`Unexpected payment status: ${paymentIntent.status}`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Payment failed'
      setErrorMessage(message)
      onError(message)
    } finally {
      setIsProcessing(false)
    }
  }

  // Calculate fee breakdown for display
  const feeBreakdown = calculateFeeBreakdown(amount, DEFAULT_PLATFORM_FEE_PERCENT, 0.2, currency)

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Amount Display */}
      <div className="p-4 rounded-lg bg-muted">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-muted-foreground">Subtotal</span>
          <span className="text-sm">{formatCurrency(feeBreakdown.subtotal, currency)}</span>
        </div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-muted-foreground">VAT (20%)</span>
          <span className="text-sm">{formatCurrency(feeBreakdown.vat, currency)}</span>
        </div>
        <Separator className="my-2" />
        <div className="flex justify-between items-center">
          <span className="font-semibold">Total</span>
          <span className="text-xl font-bold">{formatCurrency(feeBreakdown.total, currency)}</span>
        </div>
      </div>

      {/* Payment Element */}
      <div className="space-y-2">
        <label className="text-sm font-medium flex items-center gap-2">
          <CreditCard className="h-4 w-4" />
          Payment Details
        </label>
        <div className="border rounded-lg p-4">
          <PaymentElement
            options={{
              layout: 'tabs',
              wallets: {
                applePay: 'auto',
                googlePay: 'auto',
              },
            }}
          />
        </div>
      </div>

      {/* Error Message */}
      {errorMessage && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {/* Security Notice */}
      <div className="flex items-start gap-2 text-xs text-muted-foreground">
        <Lock className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <p>
          Your payment is processed securely by Stripe. Your card details are never stored on our servers.
        </p>
      </div>

      {/* Submit Button */}
      <Button
        type="submit"
        className="w-full"
        size="lg"
        disabled={!stripe || isProcessing}
      >
        {isProcessing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <Lock className="mr-2 h-4 w-4" />
            Pay {formatCurrency(feeBreakdown.total, currency)}
          </>
        )}
      </Button>
    </form>
  )
}

/**
 * Main PaymentForm component with Stripe Elements wrapper
 */
export function PaymentForm({
  orderId,
  amount,
  currency = 'GBP',
  onSuccess,
  onError,
  clientSecret,
}: PaymentFormProps & { clientSecret?: string }) {
  const [isLoading, setIsLoading] = useState(true)
  const [currentClientSecret, setCurrentClientSecret] = useState<string | null>(clientSecret || null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // If clientSecret is provided, use it directly
    if (clientSecret) {
      setCurrentClientSecret(clientSecret)
      setIsLoading(false)
      return
    }

    // Otherwise, fetch from server
    async function createPaymentIntent() {
      try {
        const response = await fetch('/api/payments/create-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, amount, currency }),
        })

        const data = await response.json()

        if (data.error) {
          setError(data.error)
          onError?.(data.error)
        } else if (data.clientSecret) {
          setCurrentClientSecret(data.clientSecret)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to initialize payment'
        setError(message)
        onError?.(message)
      } finally {
        setIsLoading(false)
      }
    }

    createPaymentIntent()
  }, [orderId, amount, currency, clientSecret, onError])

  const handleSuccess = (paymentIntentId: string) => {
    onSuccess?.(paymentIntentId)
  }

  const handleError = (errorMessage: string) => {
    setError(errorMessage)
    onError?.(errorMessage)
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48 mt-1" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (error && !currentClientSecret) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  if (!currentClientSecret) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">
            Unable to initialize payment. Please try again.
          </p>
        </CardContent>
      </Card>
    )
  }

  const options: StripeElementsOptions = {
    clientSecret: currentClientSecret,
    appearance: {
      theme: 'stripe',
      variables: {
        colorPrimary: '#FF5A00', // International Orange
        colorBackground: '#ffffff',
        colorText: '#1e293b',
        colorDanger: '#ef4444',
        fontFamily: 'system-ui, sans-serif',
        spacingUnit: '4px',
        borderRadius: '8px',
      },
    },
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <CreditCard className="h-5 w-5" />
          Secure Payment
        </CardTitle>
        <CardDescription className="flex items-center gap-1">
          <Shield className="h-3 w-3" />
          Protected by Stripe escrow
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Elements stripe={stripePromise} options={options}>
          <PaymentFormInner
            amount={amount}
            currency={currency}
            onSuccess={handleSuccess}
            onError={handleError}
          />
        </Elements>
      </CardContent>
    </Card>
  )
}

/**
 * Payment Success Display
 */
export function PaymentSuccess({ amount, currency }: { amount: number; currency: string }) {
  return (
    <Card className="border-status-success bg-status-success-light">
      <CardContent className="pt-6">
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="h-12 w-12 rounded-full bg-status-success-light flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-status-success" />
            </div>
          </div>
          <h3 className="text-lg font-semibold text-status-success-dark">Payment Successful</h3>
          <p className="text-status-success">
            Your payment of {formatCurrency(amount, currency)} has been processed and is now held securely in escrow.
          </p>
          <Badge variant="success">Funds Protected</Badge>
        </div>
      </CardContent>
    </Card>
  )
}

export default PaymentForm
