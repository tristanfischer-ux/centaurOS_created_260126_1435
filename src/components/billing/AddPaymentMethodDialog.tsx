'use client'

/**
 * Add Payment Method Dialog
 * Uses Stripe Elements to securely add a new card
 */

import { useState, useEffect } from 'react'
import { Loader2, CreditCard, Lock } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { SavedPaymentMethod } from '@/types/billing'
import { createSetupIntent, savePaymentMethod } from '@/actions/billing'
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'

// Initialize Stripe
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

interface AddPaymentMethodDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: (method: SavedPaymentMethod) => void
}

export function AddPaymentMethodDialog({
  open,
  onOpenChange,
  onSuccess,
}: AddPaymentMethodDialogProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open && !clientSecret) {
      loadSetupIntent()
    }
  }, [open])

  const loadSetupIntent = async () => {
    setIsLoading(true)
    setError(null)
    const { clientSecret: secret, error: err } = await createSetupIntent()
    if (err) {
      setError(err)
    } else {
      setClientSecret(secret)
    }
    setIsLoading(false)
  }

  const handleClose = () => {
    setClientSecret(null)
    setError(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Add Payment Method
          </DialogTitle>
          <DialogDescription>
            Add a new card to use for future payments
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="text-center py-8">
              <p className="text-destructive mb-4">{error}</p>
              <Button onClick={loadSetupIntent}>Try Again</Button>
            </div>
          )}

          {clientSecret && !isLoading && !error && (
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret,
                appearance: {
                  theme: 'stripe',
                  variables: {
                    colorPrimary: '#ff4500',
                    colorBackground: '#ffffff',
                    colorText: '#1a1a1a',
                    borderRadius: '8px',
                    fontFamily: 'system-ui, sans-serif',
                  },
                },
              }}
            >
              <AddCardForm onSuccess={onSuccess} onCancel={handleClose} />
            </Elements>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface AddCardFormProps {
  onSuccess: (method: SavedPaymentMethod) => void
  onCancel: () => void
}

function AddCardForm({ onSuccess, onCancel }: AddCardFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [setAsDefault, setSetAsDefault] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!stripe || !elements) {
      return
    }

    setIsSubmitting(true)
    setError(null)

    // Confirm the setup intent
    const { error: submitError, setupIntent } = await stripe.confirmSetup({
      elements,
      redirect: 'if_required',
    })

    if (submitError) {
      setError(submitError.message || 'Failed to add card')
      setIsSubmitting(false)
      return
    }

    if (setupIntent?.status === 'succeeded' && setupIntent.payment_method) {
      // Save the payment method to our database
      const paymentMethodId = typeof setupIntent.payment_method === 'string'
        ? setupIntent.payment_method
        : setupIntent.payment_method.id

      const { method, error: saveError } = await savePaymentMethod(
        paymentMethodId,
        setAsDefault
      )

      if (saveError || !method) {
        setError(saveError || 'Failed to save payment method')
        setIsSubmitting(false)
        return
      }

      onSuccess(method)
    } else {
      setError('Setup was not completed. Please try again.')
    }

    setIsSubmitting(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement
        options={{
          layout: 'tabs',
        }}
      />

      <div className="flex items-center space-x-2">
        <Checkbox
          id="setAsDefault"
          checked={setAsDefault}
          onCheckedChange={checked => setSetAsDefault(checked === true)}
        />
        <Label htmlFor="setAsDefault" className="text-sm text-muted-foreground">
          Set as default payment method
        </Label>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Lock className="h-3 w-3" />
          Secured by Stripe
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!stripe || isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Adding...
              </>
            ) : (
              'Add Card'
            )}
          </Button>
        </div>
      </div>
    </form>
  )
}
