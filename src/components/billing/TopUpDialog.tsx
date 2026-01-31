'use client'

/**
 * Top-Up Dialog
 * Allows users to add funds to their account balance
 */

import { useState, useEffect } from 'react'
import { Loader2, Wallet, CreditCard, Check } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import { SavedPaymentMethod, formatAmount, formatCardDisplay } from '@/types/billing'
import {
  getSavedPaymentMethods,
  createBalanceTopUpIntent,
  confirmBalanceTopUp,
} from '@/actions/billing'
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

const PRESET_AMOUNTS = [
  { value: 5000, label: '£50' },
  { value: 10000, label: '£100' },
  { value: 25000, label: '£250' },
  { value: 50000, label: '£500' },
]

interface TopUpDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: (newBalance: number) => void
  currentBalance: number
}

export function TopUpDialog({
  open,
  onOpenChange,
  onSuccess,
  currentBalance,
}: TopUpDialogProps) {
  const [step, setStep] = useState<'amount' | 'payment' | 'success'>('amount')
  const [amount, setAmount] = useState<number>(5000) // £50 default
  const [customAmount, setCustomAmount] = useState<string>('')
  const [savedMethods, setSavedMethods] = useState<SavedPaymentMethod[]>([])
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newBalance, setNewBalance] = useState<number | null>(null)

  useEffect(() => {
    if (open) {
      loadSavedMethods()
    }
  }, [open])

  const loadSavedMethods = async () => {
    const { methods } = await getSavedPaymentMethods()
    setSavedMethods(methods)
    // Pre-select default method
    const defaultMethod = methods.find(m => m.isDefault)
    if (defaultMethod) {
      setSelectedMethodId(defaultMethod.id)
    }
  }

  const handleAmountSelect = (value: number) => {
    setAmount(value)
    setCustomAmount('')
  }

  const handleCustomAmountChange = (value: string) => {
    setCustomAmount(value)
    const parsed = parseFloat(value)
    if (!isNaN(parsed) && parsed > 0) {
      setAmount(Math.round(parsed * 100)) // Convert to pence
    }
  }

  const handleProceedToPayment = async () => {
    if (amount < 500) {
      setError('Minimum top-up amount is £5')
      return
    }

    setIsLoading(true)
    setError(null)

    // Get selected payment method's Stripe ID if using saved method
    const selectedMethod = savedMethods.find(m => m.id === selectedMethodId)
    const stripeMethodId = selectedMethod?.stripePaymentMethodId

    const { clientSecret: secret, paymentIntentId: piId, error: err } =
      await createBalanceTopUpIntent(amount, stripeMethodId || undefined)

    if (err) {
      setError(err)
      setIsLoading(false)
      return
    }

    setClientSecret(secret)
    setPaymentIntentId(piId)
    setStep('payment')
    setIsLoading(false)
  }

  const handlePaymentSuccess = async () => {
    if (!paymentIntentId) return

    setIsLoading(true)
    const { success, newBalance: balance, error: err } =
      await confirmBalanceTopUp(paymentIntentId)

    if (err || !success) {
      setError(err || 'Failed to confirm top-up')
      setIsLoading(false)
      return
    }

    setNewBalance(balance)
    setStep('success')
    setIsLoading(false)
  }

  const handleClose = () => {
    if (step === 'success' && newBalance !== null) {
      onSuccess(newBalance)
    }
    // Reset state
    setStep('amount')
    setAmount(5000)
    setCustomAmount('')
    setClientSecret(null)
    setPaymentIntentId(null)
    setError(null)
    setNewBalance(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            {step === 'success' ? 'Top-Up Complete' : 'Add Funds'}
          </DialogTitle>
          <DialogDescription>
            {step === 'amount' && 'Choose how much to add to your balance'}
            {step === 'payment' && 'Complete your payment'}
            {step === 'success' && 'Your balance has been updated'}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          {step === 'amount' && (
            <div className="space-y-6">
              {/* Preset amounts */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {PRESET_AMOUNTS.map(preset => (
                  <Button
                    key={preset.value}
                    variant={amount === preset.value && !customAmount ? 'default' : 'outline'}
                    onClick={() => handleAmountSelect(preset.value)}
                    className="h-12"
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>

              {/* Custom amount */}
              <div className="space-y-2">
                <Label htmlFor="customAmount">Or enter custom amount</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    £
                  </span>
                  <Input
                    id="customAmount"
                    type="number"
                    min="5"
                    step="0.01"
                    placeholder="0.00"
                    value={customAmount}
                    onChange={e => handleCustomAmountChange(e.target.value)}
                    className="pl-7"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Minimum £5, maximum £100,000
                </p>
              </div>

              {/* Payment method selection */}
              {savedMethods.length > 0 && (
                <div className="space-y-3">
                  <Label>Payment Method</Label>
                  <RadioGroup
                    value={selectedMethodId || 'new'}
                    onValueChange={setSelectedMethodId}
                  >
                    {savedMethods.map(method => (
                      <div
                        key={method.id}
                        className={cn(
                          'flex items-center space-x-3 rounded-lg border p-3',
                          selectedMethodId === method.id && 'border-primary'
                        )}
                      >
                        <RadioGroupItem value={method.id} id={method.id} />
                        <Label htmlFor={method.id} className="flex-1 cursor-pointer">
                          <div className="flex items-center gap-2">
                            <CreditCard className="h-4 w-4" />
                            <span>{formatCardDisplay(method)}</span>
                            {method.isDefault && (
                              <span className="text-xs text-muted-foreground">
                                (Default)
                              </span>
                            )}
                          </div>
                        </Label>
                      </div>
                    ))}
                    <div
                      className={cn(
                        'flex items-center space-x-3 rounded-lg border p-3',
                        selectedMethodId === null && 'border-primary'
                      )}
                    >
                      <RadioGroupItem value="new" id="new-card" />
                      <Label htmlFor="new-card" className="flex-1 cursor-pointer">
                        Use a different card
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              )}

              {/* Summary */}
              <div className="bg-muted/50 rounded-lg p-4">
                <div className="flex justify-between text-sm">
                  <span>Current balance</span>
                  <span>{formatAmount(currentBalance, 'GBP')}</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span>Top-up amount</span>
                  <span className="text-status-success">+{formatAmount(amount, 'GBP')}</span>
                </div>
                <div className="border-t mt-2 pt-2 flex justify-between font-medium">
                  <span>New balance</span>
                  <span>{formatAmount(currentBalance + amount, 'GBP')}</span>
                </div>
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button onClick={handleProceedToPayment} disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Processing...
                    </>
                  ) : (
                    <>Continue to Payment</>
                  )}
                </Button>
              </div>
            </div>
          )}

          {step === 'payment' && clientSecret && (
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret,
                appearance: {
                  theme: 'stripe',
                  variables: {
                    colorPrimary: '#ff4500',
                  },
                },
              }}
            >
              <PaymentForm
                amount={amount}
                selectedMethodId={selectedMethodId}
                savedMethods={savedMethods}
                onSuccess={handlePaymentSuccess}
                onCancel={() => setStep('amount')}
                isLoading={isLoading}
                error={error}
              />
            </Elements>
          )}

          {step === 'success' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-status-success-light rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="h-8 w-8 text-status-success" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Payment Successful</h3>
              <p className="text-muted-foreground mb-4">
                {formatAmount(amount, 'GBP')} has been added to your account
              </p>
              <p className="text-2xl font-bold mb-6">
                New Balance: {formatAmount(newBalance || 0, 'GBP')}
              </p>
              <Button onClick={handleClose}>Done</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface PaymentFormProps {
  amount: number
  selectedMethodId: string | null
  savedMethods: SavedPaymentMethod[]
  onSuccess: () => void
  onCancel: () => void
  isLoading: boolean
  error: string | null
}

function PaymentForm({
  amount,
  selectedMethodId,
  savedMethods,
  onSuccess,
  onCancel,
  isLoading: parentLoading,
  error: parentError,
}: PaymentFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(parentError)

  const selectedMethod = savedMethods.find(m => m.id === selectedMethodId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!stripe) return

    setIsSubmitting(true)
    setError(null)

    let result

    if (selectedMethod) {
      // Use saved payment method
      result = await stripe.confirmPayment({
        clientSecret: (elements as unknown as { _commonOptions: { clientSecret: string } })._commonOptions.clientSecret,
        confirmParams: {
          payment_method: selectedMethod.stripePaymentMethodId,
          return_url: `${window.location.origin}/buyer?topup=success`,
        },
        redirect: 'if_required',
      })
    } else if (elements) {
      // Use new card from PaymentElement
      result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/buyer?topup=success`,
        },
        redirect: 'if_required',
      })
    } else {
      setError('Payment form not ready')
      setIsSubmitting(false)
      return
    }

    if (result.error) {
      setError(result.error.message || 'Payment failed')
      setIsSubmitting(false)
      return
    }

    if (result.paymentIntent?.status === 'succeeded') {
      onSuccess()
    } else {
      setError('Payment requires additional action')
    }

    setIsSubmitting(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {selectedMethod ? (
        <div className="bg-muted/50 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <CreditCard className="h-5 w-5" />
            <div>
              <p className="font-medium">{formatCardDisplay(selectedMethod)}</p>
              <p className="text-sm text-muted-foreground">
                Expires {selectedMethod.cardExpMonth}/{selectedMethod.cardExpYear}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <PaymentElement />
      )}

      <div className="bg-muted/50 rounded-lg p-4">
        <div className="flex justify-between font-medium">
          <span>Amount to charge</span>
          <span>{formatAmount(amount, 'GBP')}</span>
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Back
        </Button>
        <Button
          type="submit"
          disabled={!stripe || isSubmitting || parentLoading}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Processing...
            </>
          ) : (
            <>Pay {formatAmount(amount, 'GBP')}</>
          )}
        </Button>
      </div>
    </form>
  )
}
