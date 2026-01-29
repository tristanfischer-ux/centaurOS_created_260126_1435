'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  CheckCircle2,
  HelpCircle,
  XCircle,
  Loader2,
  AlertCircle,
  Award,
  Clock,
} from 'lucide-react'
import { respondToRFQ } from '@/actions/rfq'
import { RFQWithDetails, RFQType } from '@/types/rfq'

interface RFQResponseFormProps {
  rfq: RFQWithDetails
  onSuccess?: () => void
  onCancel?: () => void
  className?: string
}

type ResponseMode = 'select' | 'accept' | 'info_request' | 'decline'

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
  const [showSuccessDialog, setShowSuccessDialog] = useState(false)
  const [responseResult, setResponseResult] = useState<{
    awarded?: boolean
    priority_hold?: boolean
  }>({})

  const handleSubmit = (responseType: 'accept' | 'info_request' | 'decline') => {
    setError(null)

    // Validate
    if (responseType === 'info_request' && !message.trim()) {
      setError('Please provide your questions')
      return
    }

    startTransition(async () => {
      const result = await respondToRFQ(rfq.id, {
        type: responseType,
        quoted_price: quotedPrice ? parseFloat(quotedPrice) : undefined,
        message: message.trim() || undefined,
      })

      if (result.error) {
        setError(result.error)
        return
      }

      setResponseResult({
        awarded: result.awarded,
        priority_hold: result.priority_hold,
      })
      setShowSuccessDialog(true)
    })
  }

  const handleSuccessClose = () => {
    setShowSuccessDialog(false)
    if (onSuccess) {
      onSuccess()
    }
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

  // Selection mode
  if (mode === 'select') {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Respond to RFQ</CardTitle>
          <CardDescription>
            {getTypeMessage(rfq.rfq_type)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <button
            onClick={() => setMode('accept')}
            className={cn(
              'w-full flex items-center gap-4 p-4 rounded-lg border-2 transition-colors hover:border-emerald-500 hover:bg-emerald-50'
            )}
            disabled={isPending}
          >
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
            </div>
            <div className="text-left">
              <div className="font-semibold">Accept</div>
              <div className="text-sm text-muted-foreground">
                I can fulfill this request
              </div>
            </div>
          </button>

          <button
            onClick={() => setMode('info_request')}
            className={cn(
              'w-full flex items-center gap-4 p-4 rounded-lg border-2 transition-colors hover:border-blue-500 hover:bg-blue-50'
            )}
            disabled={isPending}
          >
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
              <HelpCircle className="w-6 h-6 text-blue-600" />
            </div>
            <div className="text-left">
              <div className="font-semibold">Request More Info</div>
              <div className="text-sm text-muted-foreground">
                I need clarification before responding
              </div>
            </div>
          </button>

          <button
            onClick={() => setMode('decline')}
            className={cn(
              'w-full flex items-center gap-4 p-4 rounded-lg border-2 transition-colors hover:border-red-500 hover:bg-red-50'
            )}
            disabled={isPending}
          >
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
              <XCircle className="w-6 h-6 text-red-600" />
            </div>
            <div className="text-left">
              <div className="font-semibold">Decline</div>
              <div className="text-sm text-muted-foreground">
                I cannot fulfill this request
              </div>
            </div>
          </button>
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

  // Accept mode
  if (mode === 'accept') {
    return (
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
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
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">{error}</span>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex gap-3">
          <Button
            variant="secondary"
            onClick={() => setMode('select')}
            disabled={isPending}
            className="flex-1"
          >
            Back
          </Button>
          <Button
            onClick={() => handleSubmit('accept')}
            disabled={isPending}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700"
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

  // Info request mode
  if (mode === 'info_request') {
    return (
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <HelpCircle className="w-5 h-5 text-blue-600" />
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
        <CardFooter className="flex gap-3">
          <Button
            variant="secondary"
            onClick={() => setMode('select')}
            disabled={isPending}
            className="flex-1"
          >
            Back
          </Button>
          <Button
            onClick={() => handleSubmit('info_request')}
            disabled={isPending || !message.trim()}
            className="flex-1"
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

  // Decline mode
  if (mode === 'decline') {
    return (
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
              <XCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <CardTitle>Decline RFQ</CardTitle>
              <CardDescription>Let the buyer know you cannot fulfill this</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="declineMessage">Reason (Optional)</Label>
            <Textarea
              id="declineMessage"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Why are you declining? (optional)"
              rows={3}
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
        <CardFooter className="flex gap-3">
          <Button
            variant="secondary"
            onClick={() => setMode('select')}
            disabled={isPending}
            className="flex-1"
          >
            Back
          </Button>
          <Button
            variant="destructive"
            onClick={() => handleSubmit('decline')}
            disabled={isPending}
            className="flex-1"
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

  // Success dialog
  return (
    <>
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {responseResult.awarded ? (
                <>
                  <Award className="w-5 h-5 text-violet-600" />
                  Congratulations!
                </>
              ) : responseResult.priority_hold ? (
                <>
                  <Clock className="w-5 h-5 text-amber-600" />
                  Priority Hold Granted
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  Response Submitted
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {responseResult.awarded
                ? 'You have been awarded this RFQ! The buyer will contact you shortly.'
                : responseResult.priority_hold
                ? 'You have a 2-hour priority hold. The buyer will review and confirm.'
                : 'Your response has been submitted successfully.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={handleSuccessClose}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
