'use client'

/**
 * Failed Payments Alert
 * Shows pending failed payments that need attention
 */

import { useState, useEffect } from 'react'
import { AlertCircle, CreditCard, Loader2, RefreshCw, X } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { FailedPayment, SavedPaymentMethod, formatAmount, formatCardDisplay } from '@/types/billing'
import { getFailedPayments, getSavedPaymentMethods, retryFailedPayment } from '@/actions/billing'
import { format } from 'date-fns'

interface FailedPaymentsAlertProps {
  className?: string
}

export function FailedPaymentsAlert({ className }: FailedPaymentsAlertProps) {
  const [failedPayments, setFailedPayments] = useState<FailedPayment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedPayment, setSelectedPayment] = useState<FailedPayment | null>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadFailedPayments()
  }, [])

  const loadFailedPayments = async () => {
    setIsLoading(true)
    const { payments } = await getFailedPayments()
    setFailedPayments(payments)
    setIsLoading(false)
  }

  const handleDismiss = (paymentId: string) => {
    setDismissed(prev => new Set([...prev, paymentId]))
  }

  const handleRetrySuccess = (paymentId: string) => {
    setFailedPayments(prev => prev.filter(p => p.id !== paymentId))
    setSelectedPayment(null)
  }

  const visiblePayments = failedPayments.filter(p => !dismissed.has(p.id))

  if (isLoading || visiblePayments.length === 0) {
    return null
  }

  return (
    <>
      <div className={className}>
        {visiblePayments.map(payment => (
          <Alert key={payment.id} variant="destructive" className="mb-3">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle className="flex items-center justify-between">
              Payment Failed
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDismiss(payment.id)}
                className="h-6 w-6 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </AlertTitle>
            <AlertDescription className="mt-2">
              <p className="mb-2">
                A payment of {formatAmount(payment.amount, 'GBP')} failed.
                {payment.failureMessage && ` Reason: ${payment.failureMessage}`}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedPayment(payment)}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry Payment
                </Button>
                {payment.nextRetryAt && (
                  <span className="text-xs text-muted-foreground">
                    Auto-retry: {format(new Date(payment.nextRetryAt), 'MMM d, h:mm a')}
                  </span>
                )}
              </div>
            </AlertDescription>
          </Alert>
        ))}
      </div>

      {selectedPayment && (
        <RetryPaymentDialog
          payment={selectedPayment}
          open={true}
          onOpenChange={open => !open && setSelectedPayment(null)}
          onSuccess={() => handleRetrySuccess(selectedPayment.id)}
        />
      )}
    </>
  )
}

interface RetryPaymentDialogProps {
  payment: FailedPayment
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

function RetryPaymentDialog({
  payment,
  open,
  onOpenChange,
  onSuccess,
}: RetryPaymentDialogProps) {
  const [savedMethods, setSavedMethods] = useState<SavedPaymentMethod[]>([])
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      loadMethods()
    }
  }, [open])

  const loadMethods = async () => {
    setIsLoading(true)
    const { methods } = await getSavedPaymentMethods()
    setSavedMethods(methods)
    // Pre-select default
    const defaultMethod = methods.find(m => m.isDefault)
    if (defaultMethod) {
      setSelectedMethodId(defaultMethod.id)
    }
    setIsLoading(false)
  }

  const handleRetry = async () => {
    if (!selectedMethodId) {
      setError('Please select a payment method')
      return
    }

    const selectedMethod = savedMethods.find(m => m.id === selectedMethodId)
    if (!selectedMethod) {
      setError('Payment method not found')
      return
    }

    setIsSubmitting(true)
    setError(null)

    const { success, error: err } = await retryFailedPayment(
      payment.id,
      selectedMethod.stripePaymentMethodId
    )

    if (err || !success) {
      setError(err || 'Failed to retry payment')
      setIsSubmitting(false)
      return
    }

    onSuccess()
    setIsSubmitting(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Retry Payment
          </DialogTitle>
          <DialogDescription>
            Choose a payment method to retry this charge
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          <div className="bg-muted/50 rounded-lg p-4">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Amount</span>
              <span className="font-medium">{formatAmount(payment.amount, 'GBP')}</span>
            </div>
            {payment.failureMessage && (
              <div className="flex justify-between mt-2">
                <span className="text-sm text-muted-foreground">Previous Error</span>
                <span className="text-sm text-destructive">{payment.failureMessage}</span>
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : savedMethods.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-muted-foreground mb-2">
                No saved payment methods found
              </p>
              <p className="text-sm text-muted-foreground">
                Please add a payment method first
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Payment Method</label>
              {savedMethods.map(method => (
                <div
                  key={method.id}
                  className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedMethodId === method.id
                      ? 'border-primary bg-primary/5'
                      : 'hover:bg-muted/50'
                  }`}
                  onClick={() => setSelectedMethodId(method.id)}
                >
                  <div className="flex items-center gap-3">
                    <CreditCard className="h-4 w-4" />
                    <span>{formatCardDisplay(method)}</span>
                  </div>
                  {method.isDefault && (
                    <span className="text-xs text-muted-foreground">Default</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRetry}
              disabled={isSubmitting || !selectedMethodId || savedMethods.length === 0}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Processing...
                </>
              ) : (
                'Retry Payment'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
