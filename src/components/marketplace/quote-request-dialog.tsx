'use client'

/**
 * @file quote-request-dialog.tsx
 *
 * @description Dialog for sending a quote request to a supplier.
 * Used on the detail page (single supplier) and the bulk flow (multiple suppliers).
 * Simple single-form: subject, message, quantity, deadline.
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Loader2, Send, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { sendSupplierQuoteRequest, sendBulkQuoteRequests } from '@/actions/marketplace-rfq'
import type { MarketplaceListing } from '@/actions/marketplace'

interface QuoteRequestDialogProps {
    /** Single listing for detail page, or array for bulk */
    listings: MarketplaceListing | MarketplaceListing[]
    /** Dialog trigger element */
    trigger: React.ReactNode
    /** Called after successful send */
    onComplete?: () => void
}

export function QuoteRequestDialog({ listings, trigger, onComplete }: QuoteRequestDialogProps) {
    const [open, setOpen] = useState(false)
    const [sending, setSending] = useState(false)
    const [subject, setSubject] = useState('')
    const [message, setMessage] = useState('')
    const [quantity, setQuantity] = useState('')
    const [deadline, setDeadline] = useState('')

    const isBulk = Array.isArray(listings)
    const listingArray = isBulk ? listings : [listings]
    const withEmail = listingArray.filter(l => l.contact_email)
    const withoutEmail = listingArray.filter(l => !l.contact_email)

    // Pre-fill subject from listing title for single supplier
    const defaultSubject = !isBulk ? `Quote request for ${(listings as MarketplaceListing).title}` : ''

    async function handleSubmit() {
        const sub = subject.trim() || defaultSubject
        if (!sub) { toast.error('Subject is required'); return }
        if (!message.trim()) { toast.error('Please describe what you need'); return }

        setSending(true)
        try {
            if (isBulk) {
                const result = await sendBulkQuoteRequests(
                    withEmail.map(l => l.id),
                    { subject: sub, message: message.trim(), quantity: quantity.trim() || undefined, deadline: deadline || undefined }
                )
                if (result.sentCount > 0) {
                    toast.success(`Sent to ${result.sentCount} supplier${result.sentCount > 1 ? 's' : ''}. They'll reply to your email.`)
                }
                if (result.failedCount > 0) {
                    toast.error(`${result.failedCount} failed to send`)
                }
            } else {
                const result = await sendSupplierQuoteRequest({
                    listingId: (listings as MarketplaceListing).id,
                    subject: sub,
                    message: message.trim(),
                    quantity: quantity.trim() || undefined,
                    deadline: deadline || undefined,
                })
                if (result.success) {
                    toast.success("Quote request sent. They'll reply to your email.")
                } else {
                    toast.error(result.error || 'Failed to send')
                }
            }
            setOpen(false)
            onComplete?.()
        } catch {
            toast.error('Something went wrong')
        } finally {
            setSending(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger}
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>
                        {isBulk
                            ? `Request Quotes from ${withEmail.length} Supplier${withEmail.length > 1 ? 's' : ''}`
                            : `Request Quote — ${(listings as MarketplaceListing).title}`
                        }
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Warning for suppliers without email */}
                    {withoutEmail.length > 0 && (
                        <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 text-warning text-sm">
                            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                            <span>
                                {withoutEmail.length} supplier{withoutEmail.length > 1 ? 's have' : ' has'} no contact email and will be skipped:
                                {' '}{withoutEmail.map(l => l.title).join(', ')}
                            </span>
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="quote-subject">Subject</Label>
                        <Input
                            id="quote-subject"
                            placeholder={defaultSubject || "What do you need?"}
                            value={subject}
                            onChange={e => setSubject(e.target.value)}
                            maxLength={500}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="quote-message">Message</Label>
                        <Textarea
                            id="quote-message"
                            placeholder="Describe what you need manufactured or provided. Include specifications, materials, tolerances, or any other relevant details."
                            value={message}
                            onChange={e => setMessage(e.target.value)}
                            maxLength={5000}
                            rows={5}
                        />
                        <p className="text-xs text-muted-foreground text-right">{message.length}/5000</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="quote-quantity">Quantity</Label>
                            <Input
                                id="quote-quantity"
                                placeholder="e.g., 100 units"
                                value={quantity}
                                onChange={e => setQuantity(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="quote-deadline">Required by</Label>
                            <Input
                                id="quote-deadline"
                                type="date"
                                value={deadline}
                                onChange={e => setDeadline(e.target.value)}
                                min={new Date().toISOString().split('T')[0]}
                            />
                        </div>
                    </div>

                    {/* Recipients list for bulk */}
                    {isBulk && withEmail.length > 0 && (
                        <div className="text-xs text-muted-foreground">
                            Sending to: {withEmail.map(l => l.title).join(', ')}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => setOpen(false)} disabled={sending}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={sending || withEmail.length === 0}
                        className="bg-international-orange hover:bg-international-orange-hover"
                    >
                        {sending ? (
                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending...</>
                        ) : (
                            <><Send className="h-4 w-4 mr-2" />Send{isBulk && withEmail.length > 1 ? ` to ${withEmail.length}` : ''}</>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
