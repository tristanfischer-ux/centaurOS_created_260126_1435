'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Clock,
  Calculator,
  CheckCircle,
  Loader2,
  AlertCircle,
  User,
  Star,
  TrendingDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import {
  createRetainerAgreement,
  calculateRetainerPricingOptions,
  getProviderForRetainer,
} from '@/actions/retainers'
import {
  WeeklyHoursCommitment,
  RetainerPricing,
  CANCELLATION_NOTICE_DAYS,
} from '@/types/retainers'

// ==========================================
// PROPS
// ==========================================

interface RetainerSetupProps {
  providerId: string
  listingId?: string
  onCancel?: () => void
  onSuccess?: (retainerId: string) => void
}

// ==========================================
// COMPONENT
// ==========================================

export function RetainerSetup({
  providerId,
  listingId: _listingId,
  onCancel,
  onSuccess,
}: RetainerSetupProps) {
  // listingId may be used for future enhancement to link retainer to listing
  void _listingId
  const router = useRouter()
  
  // State
  const [provider, setProvider] = useState<{
    id: string
    userId: string
    name: string
    avatarUrl?: string
    headline?: string
    hourlyRate?: number
    currency: string
    rating?: number
    totalReviews: number
  } | null>(null)
  const [pricingOptions, setPricingOptions] = useState<RetainerPricing[]>([])
  const [selectedHours, setSelectedHours] = useState<WeeklyHoursCommitment>(20)
  const [message, setMessage] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load provider and pricing options
  useEffect(() => {
    async function loadData() {
      setIsLoading(true)
      setError(null)

      try {
        const [providerResult, pricingResult] = await Promise.all([
          getProviderForRetainer(providerId),
          calculateRetainerPricingOptions(providerId),
        ])

        if (providerResult.error) {
          setError(providerResult.error)
          return
        }

        if (pricingResult.error) {
          setError(pricingResult.error)
          return
        }

        setProvider(providerResult.data)
        setPricingOptions(pricingResult.data || [])
      } catch {
        setError('Failed to load provider information')
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [providerId])

  // Get selected pricing
  const selectedPricing = pricingOptions.find(p => p.weeklyHours === selectedHours)

  // Handle submit
  const handleSubmit = async () => {
    if (!selectedPricing) return

    setIsSubmitting(true)
    setError(null)

    try {
      const { data, error } = await createRetainerAgreement({
        sellerId: providerId,
        weeklyHours: selectedHours,
        hourlyRate: selectedPricing.baseHourlyRate,
        currency: selectedPricing.currency,
      })

      if (error || !data) {
        setError(error || 'Failed to create retainer')
        return
      }

      if (onSuccess) {
        onSuccess(data.retainerId)
      } else {
        router.push(`/retainers/${data.retainerId}`)
      }
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-muted-foreground">Loading...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Error state
  if (error && !provider) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      {/* Provider Info */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={provider?.avatarUrl} alt={provider?.name} />
              <AvatarFallback>
                <User className="h-8 w-8" />
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h3 className="text-lg font-semibold">{provider?.name}</h3>
              {provider?.headline && (
                <p className="text-muted-foreground">{provider.headline}</p>
              )}
              <div className="flex items-center gap-2 mt-1">
                {provider?.rating && (
                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                    <span className="text-sm font-medium">
                      {provider.rating.toFixed(1)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      ({provider.totalReviews} reviews)
                    </span>
                  </div>
                )}
              </div>
            </div>
            {provider?.hourlyRate && (
              <div className="text-right">
                <div className="text-2xl font-bold">
                  {provider.currency} {provider.hourlyRate.toFixed(2)}
                </div>
                <p className="text-sm text-muted-foreground">per hour</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Hours Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Weekly Hours Commitment
          </CardTitle>
          <CardDescription>
            Choose your weekly hours commitment. Higher commitments get better rates.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={selectedHours.toString()}
            onValueChange={(v) => setSelectedHours(parseInt(v) as WeeklyHoursCommitment)}
            className="grid grid-cols-1 md:grid-cols-3 gap-4"
          >
            {pricingOptions.map((option) => {
              const isSelected = selectedHours === option.weeklyHours
              const hasDiscount = option.discountPercent > 0

              return (
                <Label
                  key={option.weeklyHours}
                  className={cn(
                    'flex flex-col items-center justify-center p-4 rounded-lg border-2 cursor-pointer transition-all',
                    isSelected
                      ? 'border-primary bg-primary/5'
                      : 'border-muted hover:border-primary/50'
                  )}
                >
                  <RadioGroupItem
                    value={option.weeklyHours.toString()}
                    className="sr-only"
                  />
                  <div className="text-2xl font-bold">{option.weeklyHours}</div>
                  <div className="text-sm text-muted-foreground">hours/week</div>
                  {hasDiscount && (
                    <Badge variant="secondary" className="mt-2">
                      <TrendingDown className="h-3 w-3 mr-1" />
                      {option.discountPercent}% off
                    </Badge>
                  )}
                  <div className="mt-3 text-center">
                    <div className="text-lg font-semibold">
                      {option.currency} {option.discountedRate.toFixed(2)}/hr
                    </div>
                    {hasDiscount && (
                      <div className="text-xs text-muted-foreground line-through">
                        {option.currency} {option.baseHourlyRate.toFixed(2)}/hr
                      </div>
                    )}
                  </div>
                </Label>
              )
            })}
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Pricing Summary */}
      {selectedPricing && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Pricing Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Weekly Hours</p>
                <p className="text-lg font-semibold">{selectedPricing.weeklyHours} hours</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Hourly Rate</p>
                <p className="text-lg font-semibold">
                  {selectedPricing.currency} {selectedPricing.discountedRate.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Weekly Total</p>
                <p className="text-lg font-semibold">
                  {selectedPricing.currency} {selectedPricing.weeklyTotal.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Monthly Estimate</p>
                <p className="text-lg font-semibold">
                  ~{selectedPricing.currency} {selectedPricing.monthlyEstimate.toFixed(2)}
                </p>
              </div>
            </div>

            {selectedPricing.discountPercent > 0 && (
              <div className="p-3 bg-emerald-50 rounded-lg">
                <div className="flex items-center gap-2 text-emerald-700">
                  <TrendingDown className="h-4 w-4" />
                  <span className="font-medium">
                    You save {selectedPricing.discountPercent}% with this commitment
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Message */}
      <Card>
        <CardHeader>
          <CardTitle>Message (Optional)</CardTitle>
          <CardDescription>
            Add any notes or context for the provider
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Describe your project, expected work, or any questions..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
          />
        </CardContent>
      </Card>

      {/* Terms */}
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-amber-800">
              <p className="font-medium">Retainer Terms</p>
              <ul className="mt-2 space-y-1 list-disc list-inside">
                <li>Weekly billing in arrears (charged after the week ends)</li>
                <li>Provider submits timesheet for approval each week</li>
                <li>Minimum {CANCELLATION_NOTICE_DAYS}-day notice period for cancellation</li>
                <li>Either party can pause or cancel with proper notice</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-4">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={isSubmitting || !selectedPricing}>
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <CheckCircle className="h-4 w-4 mr-2" />
              Create Retainer Agreement
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

export default RetainerSetup
