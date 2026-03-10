'use client'

import { useState, useTransition, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  CheckCircle2,
  HelpCircle,
  XCircle,
  Loader2,
  AlertCircle,
  Award,
  Clock,
  ChevronDown,
  ThumbsUp,
} from 'lucide-react'
import { respondToRFQ } from '@/actions/rfq'
import { RFQWithDetails, RFQType } from '@/types/rfq'

interface RFQResponseFormProps {
  rfq: RFQWithDetails
  onSuccess?: () => void
  onCancel?: () => void
  className?: string
}

type ResponseMode = 'select' | 'accept' | 'info_request' | 'decline' | 'interest' | 'success'

const DECLINE_REASONS = [
  'Tolerance too tight',
  'MOQ too low',
  'Material unavailable',
  'Lead time unrealistic',
  'At capacity',
  'Outside capability',
] as const

export function RFQResponseForm({
  rfq,
  onSuccess,
  onCancel,
  className,
}: RFQResponseFormProps) {
  const [isPending, startTransition] = useTransition()
  const [mode, setMode] = useState<ResponseMode>('select')
  const [quotedPrice, setQuotedPrice] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [responseResult, setResponseResult] = useState<{
    awarded?: boolean
    priority_hold?: boolean
  }>({})

  // Rich proposal fields (Feature 13)
  const [showProposalDetails, setShowProposalDetails] = useState(false)
  const [scopeOfWork, setScopeOfWork] = useState('')
  const [timelineWeeks, setTimelineWeeks] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [pricingMaterial, setPricingMaterial] = useState('')
  const [pricingLabour, setPricingLabour] = useState('')
  const [pricingTooling, setPricingTooling] = useState('')
  const [pricingMarkup, setPricingMarkup] = useState('')

  // Decline feedback (Feature 15)
  const [declineReasons, setDeclineReasons] = useState<Set<string>>(new Set())

  // Interest / indicative pricing (Feature 17)
  const [indicativeMin, setIndicativeMin] = useState('')
  const [indicativeMax, setIndicativeMax] = useState('')

  // Computed pricing total
  const pricingTotal = useMemo(() => {
    const m = parseFloat(pricingMaterial) || 0
    const l = parseFloat(pricingLabour) || 0
    const t = parseFloat(pricingTooling) || 0
    const mk = parseFloat(pricingMarkup) || 0
    return Math.round((m + l + t + mk) * 100) / 100
  }, [pricingMaterial, pricingLabour, pricingTooling, pricingMarkup])

  const handleSubmit = (responseType: 'accept' | 'info_request' | 'decline' | 'interest') => {
    setError(null)

    if (responseType === 'accept' && quotedPrice === '') {
      setError('Please provide a quoted price')
      return
    }

    if (responseType === 'info_request' && !message.trim()) {
      setError('Please provide your questions')
      return
    }

    if (responseType === 'interest' && indicativeMin && indicativeMax) {
      if (parseFloat(indicativeMin) > parseFloat(indicativeMax)) {
        setError('Minimum estimate cannot exceed maximum estimate')
        return
      }
    }

    // Build decline message from checkboxes (Feature 15)
    let finalMessage = message
    if (responseType === 'decline' && declineReasons.size > 0) {
      const reasons = Array.from(declineReasons).join(', ')
      finalMessage = message.trim()
        ? `${reasons}. ${message.trim()}`
        : reasons
    }

    startTransition(async () => {
      const payload: Parameters<typeof respondToRFQ>[1] = {
        type: responseType,
        quoted_price: quotedPrice !== '' ? parseFloat(quotedPrice) : undefined,
        message: finalMessage?.trim() || undefined,
      }

      // Add proposal details for accept (Feature 13)
      if (responseType === 'accept') {
        if (scopeOfWork) payload.scope_of_work = scopeOfWork
        const parsedWeeks = parseInt(timelineWeeks, 10)
        if (!isNaN(parsedWeeks)) payload.timeline_weeks = parsedWeeks
        if (validUntil) payload.valid_until = validUntil
        if (pricingTotal > 0) {
          payload.pricing_breakdown = {
            material: parseFloat(pricingMaterial) || 0,
            labour: parseFloat(pricingLabour) || 0,
            tooling: parseFloat(pricingTooling) || 0,
            markup: parseFloat(pricingMarkup) || 0,
            total: pricingTotal,
          }
        }
      }

      // Add indicative pricing for interest (Feature 17)
      if (responseType === 'interest') {
        if (indicativeMin !== '') payload.indicative_min = parseFloat(indicativeMin)
        if (indicativeMax !== '') payload.indicative_max = parseFloat(indicativeMax)
      }

      const result = await respondToRFQ(rfq.id, payload)

      if (result.error) {
        setError(result.error)
        return
      }

      setResponseResult({
        awarded: result.awarded,
        priority_hold: result.priority_hold,
      })
      setMode('success')
    })
  }

  const handleSuccessClose = () => {
    onSuccess?.()
  }

  const switchMode = (newMode: ResponseMode) => {
    setMode(newMode)
    setMessage('')
    setError(null)
    setQuotedPrice('')
    setDeclineReasons(new Set())
    setIndicativeMin('')
    setIndicativeMax('')
    setScopeOfWork('')
    setTimelineWeeks('')
    setValidUntil('')
    setPricingMaterial('')
    setPricingLabour('')
    setPricingTooling('')
    setPricingMarkup('')
    setShowProposalDetails(false)
  }

  const getTypeMessage = (type: RFQType) => {
    switch (type) {
      case 'commodity':
        return 'First supplier to accept wins automatically'
      case 'custom':
        return 'First supplier gets 2-hour priority hold for buyer confirmation'
      case 'service':
        return 'Buyer will review all responses and select a winner'
    }
  }

  const toggleDeclineReason = (reason: string) => {
    setDeclineReasons((prev) => {
      const next = new Set(prev)
      if (next.has(reason)) {
        next.delete(reason)
      } else {
        next.add(reason)
      }
      return next
    })
  }

  // Selection mode (Feature 20: mobile scroll)
  if (mode === 'select') {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Respond to RFQ</CardTitle>
          <CardDescription>
            {getTypeMessage(rfq.rfq_type)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Mobile: horizontal scroll, Desktop: vertical stack */}
          <div className="flex gap-3 overflow-x-auto snap-x sm:flex-col sm:overflow-visible pb-2 sm:pb-0">
            <button
              onClick={() => switchMode('accept')}
              className={cn(
                'min-w-[200px] sm:min-w-0 sm:w-full flex items-center gap-4 p-4 rounded-lg border-2 transition-colors',
                'hover:border-status-success hover:bg-status-success-light snap-start'
              )}
              disabled={isPending}
            >
              <div className="w-12 h-12 rounded-full bg-status-success-light flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6 text-status-success" />
              </div>
              <div className="text-left">
                <div className="font-semibold">Accept</div>
                <div className="text-sm text-muted-foreground">
                  I can fulfill this request
                </div>
              </div>
            </button>

            <button
              onClick={() => switchMode('interest')}
              className={cn(
                'min-w-[200px] sm:min-w-0 sm:w-full flex items-center gap-4 p-4 rounded-lg border-2 transition-colors',
                'hover:border-status-warning hover:bg-status-warning-light snap-start'
              )}
              disabled={isPending}
            >
              <div className="w-12 h-12 rounded-full bg-status-warning-light flex items-center justify-center shrink-0">
                <ThumbsUp className="w-6 h-6 text-status-warning" />
              </div>
              <div className="text-left">
                <div className="font-semibold">Indicate Interest</div>
                <div className="text-sm text-muted-foreground">
                  Interested, with indicative pricing
                </div>
              </div>
            </button>

            <button
              onClick={() => switchMode('info_request')}
              className={cn(
                'min-w-[200px] sm:min-w-0 sm:w-full flex items-center gap-4 p-4 rounded-lg border-2 transition-colors',
                'hover:border-status-info hover:bg-status-info-light snap-start'
              )}
              disabled={isPending}
            >
              <div className="w-12 h-12 rounded-full bg-status-info-light flex items-center justify-center shrink-0">
                <HelpCircle className="w-6 h-6 text-status-info" />
              </div>
              <div className="text-left">
                <div className="font-semibold">Request More Info</div>
                <div className="text-sm text-muted-foreground">
                  I need clarification before responding
                </div>
              </div>
            </button>

            <button
              onClick={() => switchMode('decline')}
              className={cn(
                'min-w-[200px] sm:min-w-0 sm:w-full flex items-center gap-4 p-4 rounded-lg border-2 transition-colors',
                'hover:border-destructive hover:bg-status-error-light snap-start'
              )}
              disabled={isPending}
            >
              <div className="w-12 h-12 rounded-full bg-status-error-light flex items-center justify-center shrink-0">
                <XCircle className="w-6 h-6 text-destructive" />
              </div>
              <div className="text-left">
                <div className="font-semibold">Decline</div>
                <div className="text-sm text-muted-foreground">
                  I cannot fulfill this request
                </div>
              </div>
            </button>
          </div>
        </CardContent>
        {onCancel && (
          <CardFooter>
            <Button variant="secondary" onClick={onCancel} className="w-full">
              Cancel
            </Button>
          </CardFooter>
        )}
      </Card>
    )
  }

  // Accept mode (Feature 13: Rich Proposal)
  if (mode === 'accept') {
    return (
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-status-success-light flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-status-success" />
            </div>
            <div>
              <CardTitle>Accept RFQ</CardTitle>
              <CardDescription>Submit your quote to fulfill this request</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="quotedPrice">Your Quote (GBP)</Label>
            <Input
              id="quotedPrice"
              type="number"
              value={quotedPrice}
              onChange={(e) => setQuotedPrice(e.target.value)}
              placeholder="Enter your price"
              min={0}
              step={0.01}
              disabled={isPending}
              className="min-h-[44px]"
            />
            {rfq.budget_max && (
              <p className="text-xs text-muted-foreground">
                Budget: up to £{rfq.budget_max.toLocaleString()}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="acceptMessage">Additional Notes (Optional)</Label>
            <Textarea
              id="acceptMessage"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Any additional information..."
              rows={3}
              disabled={isPending}
              className="min-h-[44px]"
            />
          </div>

          {/* Collapsible proposal details (Feature 13) */}
          <Collapsible open={showProposalDetails} onOpenChange={setShowProposalDetails}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="text-xs w-full justify-between">
                Add Proposal Details
                <ChevronDown className={cn(
                  'w-4 h-4 transition-transform',
                  showProposalDetails && 'rotate-180'
                )} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-3">
              {/* Scope of work */}
              <div className="space-y-2">
                <Label htmlFor="scopeOfWork">Scope of Work</Label>
                <Textarea
                  id="scopeOfWork"
                  value={scopeOfWork}
                  onChange={(e) => setScopeOfWork(e.target.value)}
                  placeholder="Describe what's included in your quote..."
                  rows={3}
                  disabled={isPending}
                />
              </div>

              {/* Timeline */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="timelineWeeks">Timeline (weeks)</Label>
                  <Input
                    id="timelineWeeks"
                    type="number"
                    value={timelineWeeks}
                    onChange={(e) => setTimelineWeeks(e.target.value)}
                    placeholder="e.g., 4"
                    min={1}
                    disabled={isPending}
                    className="min-h-[44px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="validUntil">Quote Valid Until</Label>
                  <Input
                    id="validUntil"
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    disabled={isPending}
                    className="min-h-[44px]"
                  />
                </div>
              </div>

              {/* Pricing breakdown */}
              <div className="space-y-2">
                <Label>Pricing Breakdown (GBP)</Label>
                {/* Desktop: table, Mobile: stacked (Feature 20) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Material</Label>
                    <Input
                      type="number"
                      value={pricingMaterial}
                      onChange={(e) => setPricingMaterial(e.target.value)}
                      placeholder="0"
                      min={0}
                      step={0.01}
                      disabled={isPending}
                      className="min-h-[44px]"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Labour</Label>
                    <Input
                      type="number"
                      value={pricingLabour}
                      onChange={(e) => setPricingLabour(e.target.value)}
                      placeholder="0"
                      min={0}
                      step={0.01}
                      disabled={isPending}
                      className="min-h-[44px]"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Tooling</Label>
                    <Input
                      type="number"
                      value={pricingTooling}
                      onChange={(e) => setPricingTooling(e.target.value)}
                      placeholder="0"
                      min={0}
                      step={0.01}
                      disabled={isPending}
                      className="min-h-[44px]"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Markup</Label>
                    <Input
                      type="number"
                      value={pricingMarkup}
                      onChange={(e) => setPricingMarkup(e.target.value)}
                      placeholder="0"
                      min={0}
                      step={0.01}
                      disabled={isPending}
                      className="min-h-[44px]"
                    />
                  </div>
                </div>
                {pricingTotal > 0 && (
                  <div className="flex items-center justify-between text-sm pt-1 border-t">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-semibold">£{pricingTotal.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">{error}</span>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row gap-3">
          <Button
            variant="secondary"
            onClick={() => setMode('select')}
            disabled={isPending}
            className="w-full sm:flex-1 min-h-[44px]"
          >
            Back
          </Button>
          <Button
            onClick={() => handleSubmit('accept')}
            disabled={isPending}
            variant="success"
            className="w-full sm:flex-1 min-h-[44px]"
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4 mr-2" />
            )}
            Accept
          </Button>
        </CardFooter>
      </Card>
    )
  }

  // Interest mode (Feature 17)
  if (mode === 'interest') {
    return (
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-status-warning-light flex items-center justify-center">
              <ThumbsUp className="w-5 h-5 text-status-warning" />
            </div>
            <div>
              <CardTitle>Indicate Interest</CardTitle>
              <CardDescription>Express interest with an indicative price range</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Indicative Price Range (GBP)</Label>
            <div className="grid grid-cols-2 gap-3">
              <Input
                type="number"
                value={indicativeMin}
                onChange={(e) => setIndicativeMin(e.target.value)}
                placeholder="Min estimate"
                min={0}
                step={0.01}
                disabled={isPending}
                className="min-h-[44px]"
              />
              <Input
                type="number"
                value={indicativeMax}
                onChange={(e) => setIndicativeMax(e.target.value)}
                placeholder="Max estimate"
                min={0}
                step={0.01}
                disabled={isPending}
                className="min-h-[44px]"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="interestMessage">Notes (Optional)</Label>
            <Textarea
              id="interestMessage"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Any conditions or additional context..."
              rows={3}
              disabled={isPending}
            />
          </div>

          <p className="text-xs text-muted-foreground italic">
            This is a non-binding expression of interest. You can submit a formal quote later.
          </p>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">{error}</span>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row gap-3">
          <Button
            variant="secondary"
            onClick={() => setMode('select')}
            disabled={isPending}
            className="w-full sm:flex-1 min-h-[44px]"
          >
            Back
          </Button>
          <Button
            onClick={() => handleSubmit('interest')}
            disabled={isPending}
            className="w-full sm:flex-1 min-h-[44px]"
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <ThumbsUp className="w-4 h-4 mr-2" />
            )}
            Express Interest
          </Button>
        </CardFooter>
      </Card>
    )
  }

  // Info request mode
  if (mode === 'info_request') {
    return (
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-status-info-light flex items-center justify-center">
              <HelpCircle className="w-5 h-5 text-status-info" />
            </div>
            <div>
              <CardTitle>Request More Info</CardTitle>
              <CardDescription>Ask questions before deciding</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="infoMessage">Your Questions *</Label>
            <Textarea
              id="infoMessage"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What information do you need?"
              rows={4}
              disabled={isPending}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">{error}</span>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row gap-3">
          <Button
            variant="secondary"
            onClick={() => setMode('select')}
            disabled={isPending}
            className="w-full sm:flex-1 min-h-[44px]"
          >
            Back
          </Button>
          <Button
            onClick={() => handleSubmit('info_request')}
            disabled={isPending || !message.trim()}
            className="w-full sm:flex-1 min-h-[44px]"
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <HelpCircle className="w-4 h-4 mr-2" />
            )}
            Send Questions
          </Button>
        </CardFooter>
      </Card>
    )
  }

  // Decline mode (Feature 15: Structured feedback)
  if (mode === 'decline') {
    return (
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-status-error-light flex items-center justify-center">
              <XCircle className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <CardTitle>Decline RFQ</CardTitle>
              <CardDescription>Let the buyer know you cannot fulfill this</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Structured decline reasons (Feature 15) */}
          <div className="space-y-2">
            <Label>Reason (select all that apply)</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {DECLINE_REASONS.map((reason) => (
                <label
                  key={reason}
                  className={cn(
                    'flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors text-sm',
                    declineReasons.has(reason) && 'border-destructive/40 bg-status-error-light'
                  )}
                >
                  <Checkbox
                    checked={declineReasons.has(reason)}
                    onCheckedChange={() => toggleDeclineReason(reason)}
                    disabled={isPending}
                  />
                  {reason}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="declineMessage">Additional Notes (Optional)</Label>
            <Textarea
              id="declineMessage"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Any additional context?"
              rows={2}
              disabled={isPending}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">{error}</span>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row gap-3">
          <Button
            variant="secondary"
            onClick={() => setMode('select')}
            disabled={isPending}
            className="w-full sm:flex-1 min-h-[44px]"
          >
            Back
          </Button>
          <Button
            variant="destructive"
            onClick={() => handleSubmit('decline')}
            disabled={isPending}
            className="w-full sm:flex-1 min-h-[44px]"
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <XCircle className="w-4 h-4 mr-2" />
            )}
            Decline
          </Button>
        </CardFooter>
      </Card>
    )
  }

  // Success view
  if (mode === 'success') {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center space-y-4">
          {responseResult.awarded ? (
            <>
              <Award className="w-12 h-12 text-international-orange mx-auto" />
              <div>
                <h3 className="text-lg font-semibold">Congratulations!</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  You have been awarded this RFQ! The buyer will contact you shortly.
                </p>
              </div>
            </>
          ) : responseResult.priority_hold ? (
            <>
              <Clock className="w-12 h-12 text-status-warning mx-auto" />
              <div>
                <h3 className="text-lg font-semibold">Priority Hold Granted</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  You have a 2-hour priority hold. The buyer will review and confirm.
                </p>
              </div>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-12 h-12 text-status-success mx-auto" />
              <div>
                <h3 className="text-lg font-semibold">Response Submitted</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Your response has been submitted successfully.
                </p>
              </div>
            </>
          )}
          <Button onClick={handleSuccessClose} className="min-h-[44px]">
            Close
          </Button>
        </CardContent>
      </Card>
    )
  }

  return null
}
