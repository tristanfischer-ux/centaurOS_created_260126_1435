'use client'

/**
 * @file generate-sequences-dialog.tsx — Batch AI email generation dialog.
 */

import { useState, useTransition } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, Wand2, CheckCircle2, XCircle } from 'lucide-react'
import { generateSequencesForBatch } from '@/actions/outreach'
import { AskSpecialistButton } from '@/components/specialists/ask-specialist-button'
import type { Campaign } from '@/types/outreach'
import { toast } from 'sonner'

interface GenerateSequencesDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    campaignId: string
    contactIds: string[]
    campaign: Campaign
    onGenerated: () => Promise<void>
}

export function GenerateSequencesDialog({
    open,
    onOpenChange,
    campaignId,
    contactIds,
    campaign,
    onGenerated,
}: GenerateSequencesDialogProps) {
    const [isPending, startTransition] = useTransition()
    const [result, setResult] = useState<{
        generated: number
        errors: number
    } | null>(null)

    const handleGenerate = () => {
        setResult(null)
        startTransition(async () => {
            const res = await generateSequencesForBatch(campaignId, contactIds)
            if (res.error) {
                toast.error(res.error)
            } else {
                setResult({
                    generated: res.generated ?? 0,
                    errors: res.errors ?? 0,
                })
                if (res.generated && res.generated > 0) {
                    toast.success(`Generated sequences for ${res.generated} contact(s)`)
                }
                await onGenerated()
            }
        })
    }

    const handleClose = (isOpen: boolean) => {
        if (!isOpen) setResult(null)
        onOpenChange(isOpen)
    }

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent size="sm" aria-describedby={undefined}>
                <DialogHeader>
                    <DialogTitle>Generate Email Sequences</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {!result && !isPending && (
                        <>
                            <p className="text-sm text-muted-foreground">
                                Sal will generate a {campaign.sequence_length}-email sequence for each selected contact using your campaign context and their details.
                            </p>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between py-2 border-b border-border">
                                    <span className="text-muted-foreground">Contacts</span>
                                    <span className="font-medium text-foreground">{contactIds.length}</span>
                                </div>
                                <div className="flex justify-between py-2 border-b border-border">
                                    <span className="text-muted-foreground">Emails per contact</span>
                                    <span className="font-medium text-foreground">{campaign.sequence_length}</span>
                                </div>
                                <div className="flex justify-between py-2 border-b border-border">
                                    <span className="text-muted-foreground">Tone</span>
                                    <span className="font-medium text-foreground capitalize">{campaign.tone}</span>
                                </div>
                                <div className="flex justify-between py-2">
                                    <span className="text-muted-foreground">Total emails</span>
                                    <span className="font-medium text-foreground">{contactIds.length * campaign.sequence_length}</span>
                                </div>
                            </div>
                            <AskSpecialistButton
                                context={{
                                    type: 'general',
                                    title: campaign.name,
                                    description: `Outreach campaign: ${campaign.icp_description || ''}`,
                                    metadata: {
                                        status: campaign.status,
                                        notes: `Tone: ${campaign.tone}, ${contactIds.length} contacts selected, ${campaign.sequence_length} emails per contact`,
                                    },
                                }}
                                specialistId="sales-lead"
                                specialistName="Sal"
                                variant="button"
                                label="Review context with Sal first"
                            />
                        </>
                    )}

                    {isPending && (
                        <div className="flex flex-col items-center gap-3 py-8">
                            <Loader2 className="h-8 w-8 animate-spin text-international-orange" />
                            <p className="text-sm text-muted-foreground">
                                Generating sequences... This may take a moment.
                            </p>
                        </div>
                    )}

                    {result && (
                        <div className="space-y-3 py-4">
                            {result.generated > 0 && (
                                <div className="flex items-center gap-2 text-sm text-success">
                                    <CheckCircle2 className="h-5 w-5" />
                                    <span>{result.generated} sequence(s) generated successfully</span>
                                </div>
                            )}
                            {result.errors > 0 && (
                                <div className="flex items-center gap-2 text-sm text-destructive">
                                    <XCircle className="h-5 w-5" />
                                    <span>{result.errors} failed — you can retry these individually</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    {!result ? (
                        <>
                            <Button variant="outline" onClick={() => handleClose(false)} disabled={isPending}>
                                Cancel
                            </Button>
                            <Button onClick={handleGenerate} disabled={isPending}>
                                {isPending ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                    <Wand2 className="h-4 w-4 mr-2" />
                                )}
                                Generate
                            </Button>
                        </>
                    ) : (
                        <Button onClick={() => handleClose(false)}>
                            Done
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
