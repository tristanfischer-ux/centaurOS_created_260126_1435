'use client'

import { useState, useTransition } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { requestWarmIntro } from '@/actions/warm-intros'

interface WarmIntroDialogProps {
  open: boolean
  onOpenChange: (o: boolean) => void
  listingId: string
  firmName: string
}

export function WarmIntroDialog({ open, onOpenChange, listingId, firmName }: WarmIntroDialogProps) {
  const [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition()

  const handleSubmit = () => {
    if (message.trim().length < 20) {
      toast.error('Please write at least 20 characters about why this is a good fit.')
      return
    }
    startTransition(async () => {
      const result = await requestWarmIntro({ listingId, message: message.trim() })
      if ('success' in result && result.success) {
        toast.success("Request submitted — we'll reach out if we find a path.")
        setMessage('')
        onOpenChange(false)
      } else {
        toast.error('error' in result ? result.error : 'Failed to submit')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Request warm intro — {firmName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Fractional Forge will review this request and reach out if we find a credible path to an introduction. Tell us why this firm is a strong fit.
          </p>
          <div className="space-y-2">
            <Label htmlFor="warm-intro-message">Why is this a fit?</Label>
            <Textarea
              id="warm-intro-message"
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={6}
              placeholder="We're building X. Their recent investment in Y suggests…"
              maxLength={2000}
            />
            <p className="text-xs text-muted-foreground text-right">{message.length}/2000</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={pending || message.trim().length < 20}>
              {pending ? 'Submitting…' : 'Submit request'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
