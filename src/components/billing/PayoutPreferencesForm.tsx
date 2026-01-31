'use client'

/**
 * Payout Preferences Form
 * Allows providers to configure their payout schedule and preferences
 */

import { useState, useEffect } from 'react'
import { Loader2, Banknote, Calendar, Settings, Check } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { PayoutPreferences, PayoutSchedule, formatAmount } from '@/types/billing'
import { getPayoutPreferences, updatePayoutPreferences, requestPayout } from '@/actions/billing'
import { toast } from 'sonner'

interface PayoutPreferencesFormProps {
  className?: string
  availableBalance?: number
}

export function PayoutPreferencesForm({
  className,
  availableBalance = 0,
}: PayoutPreferencesFormProps) {
  const { toast } = useToast()
  const [preferences, setPreferences] = useState<PayoutPreferences | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isRequestingPayout, setIsRequestingPayout] = useState(false)
  const [payoutAmount, setPayoutAmount] = useState('')

  // Form state
  const [schedule, setSchedule] = useState<PayoutSchedule>('automatic')
  const [minimumAmount, setMinimumAmount] = useState('50')
  const [preferredDay, setPreferredDay] = useState<string | undefined>()

  useEffect(() => {
    loadPreferences()
  }, [])

  const loadPreferences = async () => {
    setIsLoading(true)
    const { preferences: prefs, error } = await getPayoutPreferences()
    
    if (prefs) {
      setPreferences(prefs)
      setSchedule(prefs.payoutSchedule)
      setMinimumAmount((prefs.minimumPayoutAmount / 100).toString())
      setPreferredDay(prefs.preferredPayoutDay?.toString())
    }
    
    if (error && error !== 'Not a provider') {
      toast.error('Error', {
        description: error,
      })
    }
    
    setIsLoading(false)
  }

  const handleSave = async () => {
    setIsSaving(true)
    
    const { success, error } = await updatePayoutPreferences({
      payoutSchedule: schedule,
      minimumPayoutAmount: Math.round(parseFloat(minimumAmount) * 100),
      preferredPayoutDay: preferredDay ? parseInt(preferredDay) : undefined,
    })
    
    if (success) {
      toast.success('Preferences Saved', {
        description: 'Your payout preferences have been updated.',
      })
    } else {
      toast.error('Error', {
        description: error || 'Failed to save preferences',
      })
    }
    
    setIsSaving(false)
  }

  const handleRequestPayout = async () => {
    const amount = Math.round(parseFloat(payoutAmount) * 100)
    
    if (isNaN(amount) || amount <= 0) {
      toast.error('Invalid Amount', {
        description: 'Please enter a valid amount',
      })
      return
    }
    
    if (amount > availableBalance) {
      toast.error('Insufficient Balance', {
        description: `You only have ${formatAmount(availableBalance, 'GBP')} available`,
      })
      return
    }
    
    setIsRequestingPayout(true)
    
    const { request, error } = await requestPayout(amount)
    
    if (request) {
      toast.success('Payout Requested', {
        description: `${formatAmount(amount, 'GBP')} payout has been initiated`,
      })
      setPayoutAmount('')
    } else {
      toast.error('Error', {
        description: error || 'Failed to request payout',
      })
    }
    
    setIsRequestingPayout(false)
  }

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className={className}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Payout Settings
          </CardTitle>
          <CardDescription>
            Configure when and how you receive your earnings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Payout Schedule */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Payout Schedule</Label>
            <RadioGroup
              value={schedule}
              onValueChange={(value: PayoutSchedule) => setSchedule(value)}
            >
              <div className="flex items-start space-x-3 rounded-lg border p-4">
                <RadioGroupItem value="automatic" id="automatic" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="automatic" className="font-medium cursor-pointer">
                    Automatic (Recommended)
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Stripe automatically pays out to your bank account on their schedule (typically 2-5 business days after funds are available)
                  </p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3 rounded-lg border p-4">
                <RadioGroupItem value="manual" id="manual" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="manual" className="font-medium cursor-pointer">
                    Manual
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Request payouts manually when you want them. Funds stay in your Stripe balance until you request a payout.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3 rounded-lg border p-4">
                <RadioGroupItem value="weekly" id="weekly" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="weekly" className="font-medium cursor-pointer">
                    Weekly
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Receive payouts once per week on your preferred day
                  </p>
                  {schedule === 'weekly' && (
                    <div className="mt-3">
                      <Label className="text-sm">Preferred Day</Label>
                      <Select value={preferredDay} onValueChange={setPreferredDay}>
                        <SelectTrigger className="w-48 mt-1">
                          <SelectValue placeholder="Select day" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Monday</SelectItem>
                          <SelectItem value="2">Tuesday</SelectItem>
                          <SelectItem value="3">Wednesday</SelectItem>
                          <SelectItem value="4">Thursday</SelectItem>
                          <SelectItem value="5">Friday</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex items-start space-x-3 rounded-lg border p-4">
                <RadioGroupItem value="monthly" id="monthly" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="monthly" className="font-medium cursor-pointer">
                    Monthly
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Receive payouts once per month on your preferred date
                  </p>
                  {schedule === 'monthly' && (
                    <div className="mt-3">
                      <Label className="text-sm">Preferred Day of Month</Label>
                      <Select value={preferredDay} onValueChange={setPreferredDay}>
                        <SelectTrigger className="w-48 mt-1">
                          <SelectValue placeholder="Select day" />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 28 }, (_, i) => i + 1).map(day => (
                            <SelectItem key={day} value={day.toString()}>
                              {day}{getDaySuffix(day)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </div>
            </RadioGroup>
          </div>

          {/* Minimum Amount */}
          <div className="space-y-2">
            <Label htmlFor="minimumAmount">Minimum Payout Amount</Label>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">£</span>
              <Input
                id="minimumAmount"
                type="number"
                min="1"
                step="1"
                value={minimumAmount}
                onChange={e => setMinimumAmount(e.target.value)}
                className="w-32"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Payouts will only be triggered when your balance exceeds this amount
            </p>
          </div>

          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Save Preferences
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Manual Payout Request */}
      {(schedule === 'manual' || availableBalance > 0) && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5" />
              Request Payout
            </CardTitle>
            <CardDescription>
              Withdraw available funds to your bank account
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Available Balance</span>
                <span className="font-medium">{formatAmount(availableBalance, 'GBP')}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <Label htmlFor="payoutAmount" className="sr-only">Amount</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    £
                  </span>
                  <Input
                    id="payoutAmount"
                    type="number"
                    min="1"
                    step="0.01"
                    placeholder="0.00"
                    value={payoutAmount}
                    onChange={e => setPayoutAmount(e.target.value)}
                    className="pl-7"
                  />
                </div>
              </div>
              <Button
                onClick={handleRequestPayout}
                disabled={isRequestingPayout || availableBalance === 0}
              >
                {isRequestingPayout ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Processing...
                  </>
                ) : (
                  'Request Payout'
                )}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Payouts typically arrive in your bank account within 2-5 business days
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function getDaySuffix(day: number): string {
  if (day >= 11 && day <= 13) return 'th'
  switch (day % 10) {
    case 1: return 'st'
    case 2: return 'nd'
    case 3: return 'rd'
    default: return 'th'
  }
}
