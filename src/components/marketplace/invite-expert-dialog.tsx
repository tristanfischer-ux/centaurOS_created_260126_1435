'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import {
    UserPlus,
    Copy,
    Check,
    Loader2,
    Link2,
    Mail,
    Send,
} from 'lucide-react'
import { toast } from 'sonner'
import { createExpertReferral, getReferralStats } from '@/actions/expert-referrals'
import type { ReferralStats } from '@/actions/expert-referrals'

/**
 * InviteExpertDialog - Invite experts to join the ForgeOS network.
 *
 * @description Provides a dialog for users to generate referral links or send
 * email invitations to experts. Shows referral stats and shareable links.
 * Builds the supply side virally.
 *
 * @component
 */

interface InviteExpertDialogProps {
    /** Whether the dialog is open */
    open: boolean
    /** Callback to close the dialog */
    onOpenChange: (open: boolean) => void
}

export function InviteExpertDialog({ open, onOpenChange }: InviteExpertDialogProps) {
    const [mode, setMode] = useState<'link' | 'email'>('link')
    const [email, setEmail] = useState('')
    const [note, setNote] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [generatedLink, setGeneratedLink] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)
    const [stats, setStats] = useState<ReferralStats | null>(null)

    // Load stats when dialog opens
    const loadStats = useCallback(async () => {
        try {
            const s = await getReferralStats()
            setStats(s)
        } catch {
            // Non-critical
        }
    }, [])

    // Generate a referral link
    const handleGenerateLink = useCallback(async () => {
        setIsSubmitting(true)
        try {
            const result = await createExpertReferral(undefined, note || undefined)
            if (result.success && result.data) {
                const appUrl = window.location.origin
                const link = `${appUrl}/join/expert?ref=${result.data.referral_code}`
                setGeneratedLink(link)
                toast.success('Referral link generated!')
                loadStats()
            } else {
                toast.error(result.error || 'Failed to generate link')
            }
        } catch {
            toast.error('Failed to generate link')
        } finally {
            setIsSubmitting(false)
        }
    }, [note, loadStats])

    // Send email invitation
    const handleSendEmail = useCallback(async () => {
        if (!email || !email.includes('@')) {
            toast.error('Please enter a valid email address')
            return
        }

        setIsSubmitting(true)
        try {
            const result = await createExpertReferral(email, note || undefined)
            if (result.success && result.data) {
                const appUrl = window.location.origin
                const link = `${appUrl}/join/expert?ref=${result.data.referral_code}`

                // Open email client with pre-filled content
                const subject = encodeURIComponent('Join me on ForgeOS - Connect with Hardware Startups')
                const body = encodeURIComponent(
                    `Hi,\n\nI wanted to invite you to join ForgeOS, a platform connecting hardware startups with expert talent.\n\n${note ? `${note}\n\n` : ''}Join here: ${link}\n\nBest regards`
                )
                window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_self')

                toast.success('Email invitation created!')
                setEmail('')
                setNote('')
                loadStats()
            } else {
                toast.error(result.error || 'Failed to create invitation')
            }
        } catch {
            toast.error('Failed to create invitation')
        } finally {
            setIsSubmitting(false)
        }
    }, [email, note, loadStats])

    const handleCopyLink = useCallback(async () => {
        if (!generatedLink) return
        try {
            await navigator.clipboard.writeText(generatedLink)
            setCopied(true)
            toast.success('Link copied!')
            setTimeout(() => setCopied(false), 2000)
        } catch {
            toast.error('Failed to copy link')
        }
    }, [generatedLink])

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent size="md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <UserPlus className="h-5 w-5 text-international-orange" />
                        Invite an Expert
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Stats banner */}
                    {stats && stats.total > 0 && (
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                            <div className="text-center">
                                <p className="text-lg font-bold text-foreground">{stats.total}</p>
                                <p className="text-[10px] text-muted-foreground">Invited</p>
                            </div>
                            <div className="text-center">
                                <p className="text-lg font-bold text-status-success">{stats.signedUp + stats.profileCreated}</p>
                                <p className="text-[10px] text-muted-foreground">Joined</p>
                            </div>
                            <div className="text-center">
                                <p className="text-lg font-bold text-muted-foreground">{stats.pending}</p>
                                <p className="text-[10px] text-muted-foreground">Pending</p>
                            </div>
                        </div>
                    )}

                    {/* Mode toggle */}
                    <div className="flex gap-2">
                        <Button
                            variant={mode === 'link' ? 'default' : 'outline'}
                            size="sm"
                            className="flex-1 gap-1.5"
                            onClick={() => setMode('link')}
                        >
                            <Link2 className="w-4 h-4" />
                            Share Link
                        </Button>
                        <Button
                            variant={mode === 'email' ? 'default' : 'outline'}
                            size="sm"
                            className="flex-1 gap-1.5"
                            onClick={() => setMode('email')}
                        >
                            <Mail className="w-4 h-4" />
                            Send Email
                        </Button>
                    </div>

                    {/* Email input (email mode only) */}
                    {mode === 'email' && (
                        <div className="space-y-2">
                            <Label htmlFor="referral-email">
                                Expert&apos;s email <span className="text-destructive" aria-label="required">*</span>
                            </Label>
                            <Input
                                id="referral-email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="expert@company.com"
                                aria-required
                            />
                        </div>
                    )}

                    {/* Optional note */}
                    <div className="space-y-2">
                        <Label htmlFor="referral-note">Personal note (optional)</Label>
                        <Textarea
                            id="referral-note"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="e.g., I think you'd be a great addition to the ForgeOS network..."
                            maxLength={500}
                            className="min-h-[80px]"
                        />
                        <p className="text-xs text-muted-foreground">{note.length} / 500</p>
                    </div>

                    {/* Generated link display */}
                    {generatedLink && mode === 'link' && (
                        <div className="space-y-2">
                            <Label>Your referral link</Label>
                            <div className="flex gap-2">
                                <Input
                                    value={generatedLink}
                                    readOnly
                                    className="text-xs"
                                />
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={handleCopyLink}
                                    aria-label="Copy link"
                                >
                                    {copied ? (
                                        <Check className="w-4 h-4 text-status-success" />
                                    ) : (
                                        <Copy className="w-4 h-4" />
                                    )}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="secondary" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        onClick={mode === 'link' ? handleGenerateLink : handleSendEmail}
                        disabled={isSubmitting || (mode === 'email' && !email)}
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                {mode === 'link' ? 'Generating...' : 'Creating...'}
                            </>
                        ) : mode === 'link' ? (
                            <>
                                <Link2 className="w-4 h-4 mr-2" />
                                Generate Link
                            </>
                        ) : (
                            <>
                                <Send className="w-4 h-4 mr-2" />
                                Send Invitation
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
