'use client'

/**
 * @file generate-sequences-dialog.tsx — Batch AI email generation with progress.
 *
 * @description Client-side loop calling generateSequenceForContact per contact
 * with a progress bar, counter, current contact name, and cancel button.
 */

import { useState, useRef, useCallback } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Loader2, Wand2, CheckCircle2, XCircle } from 'lucide-react'
import { generateSequenceForContact } from '@/actions/outreach'
import { AskSpecialistButton } from '@/components/specialists/ask-specialist-button'
import type { Campaign, Contact } from '@/types/outreach'
import { toast } from 'sonner'

interface GenerateSequencesDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    campaignId: string
    contactIds: string[]
    contacts: Contact[]
    campaign: Campaign
    onGenerated: () => Promise<void>
}

export function GenerateSequencesDialog({
    open,
    onOpenChange,
    campaignId,
    contactIds,
    contacts,
    campaign,
    onGenerated,
}: GenerateSequencesDialogProps) {
    const [isRunning, setIsRunning] = useState(false)
    const [currentIndex, setCurrentIndex] = useState(0)
    const [currentName, setCurrentName] = useState('')
    const [succeeded, setSucceeded] = useState(0)
    const [failed, setFailed] = useState(0)
    const [isDone, setIsDone] = useState(false)
    const cancelRef = useRef(false)

    const total = contactIds.length
    const progress = total > 0 ? (currentIndex / total) * 100 : 0

    // FLOW: Build a lookup for contact names from the contacts array
    const getContactName = useCallback((contactId: string) => {
        const c = contacts.find(ct => ct.id === contactId)
        return c ? `${c.first_name} ${c.last_name}` : 'Contact'
    }, [contacts])

    const handleGenerate = useCallback(async () => {
        setIsRunning(true)
        setIsDone(false)
        setCurrentIndex(0)
        setSucceeded(0)
        setFailed(0)
        cancelRef.current = false

        let ok = 0
        let err = 0

        for (let i = 0; i < contactIds.length; i++) {
            if (cancelRef.current) break

            const contactId = contactIds[i]
            setCurrentIndex(i)
            setCurrentName(getContactName(contactId))

            const result = await generateSequenceForContact(campaignId, contactId)
            if (result.success) {
                ok += 1
                setSucceeded(ok)
            } else {
                err += 1
                setFailed(err)
            }
        }

        setCurrentIndex(contactIds.length)
        setIsRunning(false)
        setIsDone(true)

        if (ok > 0) {
            toast.success(`Generated sequences for ${ok} contact(s)`)
        }
        await onGenerated()
    }, [contactIds, campaignId, getContactName, onGenerated])

    const handleCancel = () => {
        cancelRef.current = true
    }

    const handleClose = (isOpen: boolean) => {
        if (!isOpen) {
            setIsDone(false)
            setCurrentIndex(0)
        }
        onOpenChange(isOpen)
    }

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent size="sm" aria-describedby={undefined}>
                <DialogHeader>
                    <DialogTitle>Generate Email Sequences</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {!isRunning && !isDone && (
                        <>
                            <p className="text-sm text-muted-foreground">
                                Sal will generate a {campaign.sequence_length}-email sequence for each selected contact using your campaign context and their details.
                            </p>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between py-2 border-b border-border">
                                    <span className="text-muted-foreground">Contacts</span>
                                    <span className="font-medium text-foreground">{total}</span>
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
                                    <span className="font-medium text-foreground">{total * campaign.sequence_length}</span>
                                </div>
                            </div>
                            <AskSpecialistButton
                                context={{
                                    type: 'general',
                                    title: campaign.name,
                                    description: `Outreach campaign: ${campaign.icp_description || ''}`,
                                    metadata: {
                                        status: campaign.status,
                                        notes: `Tone: ${campaign.tone}, ${total} contacts selected, ${campaign.sequence_length} emails per contact`,
                                    },
                                }}
                                specialistId="sales-lead"
                                specialistName="Sal"
                                variant="button"
                                label="Review context with Sal first"
                            />
                        </>
                    )}

                    {isRunning && (
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">
                                        Generating {currentIndex + 1} of {total}...
                                    </span>
                                    <span className="text-muted-foreground">
                                        {Math.round(progress)}%
                                    </span>
                                </div>
                                <Progress value={progress} />
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin text-international-orange" />
                                <span className="truncate">{currentName}</span>
                            </div>
                            {(succeeded > 0 || failed > 0) && (
                                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                    {succeeded > 0 && <span className="text-success">{succeeded} done</span>}
                                    {failed > 0 && <span className="text-destructive">{failed} failed</span>}
                                </div>
                            )}
                        </div>
                    )}

                    {isDone && (
                        <div className="space-y-3 py-4">
                            {succeeded > 0 && (
                                <div className="flex items-center gap-2 text-sm text-success">
                                    <CheckCircle2 className="h-5 w-5" />
                                    <span>{succeeded} sequence(s) generated successfully</span>
                                </div>
                            )}
                            {failed > 0 && (
                                <div className="flex items-center gap-2 text-sm text-destructive">
                                    <XCircle className="h-5 w-5" />
                                    <span>{failed} failed — you can retry these individually</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    {!isRunning && !isDone && (
                        <>
                            <Button variant="outline" onClick={() => handleClose(false)}>
                                Cancel
                            </Button>
                            <Button onClick={handleGenerate}>
                                <Wand2 className="h-4 w-4 mr-2" />
                                Generate
                            </Button>
                        </>
                    )}
                    {isRunning && (
                        <Button variant="outline" onClick={handleCancel}>
                            Stop
                        </Button>
                    )}
                    {isDone && (
                        <Button onClick={() => handleClose(false)}>
                            Done
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
