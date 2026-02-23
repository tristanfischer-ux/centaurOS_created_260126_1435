'use client'

/**
 * @file research-contacts-dialog.tsx — Client-side loop with progress bar
 * that calls researchContact per contact.
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
import { Loader2, Search, CheckCircle2, XCircle } from 'lucide-react'
import { researchContact } from '@/actions/outreach'
import type { Contact } from '@/types/outreach'
import { toast } from 'sonner'

interface ResearchContactsDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    campaignId: string
    contacts: Contact[]
    onResearched: () => Promise<void>
}

export function ResearchContactsDialog({
    open,
    onOpenChange,
    campaignId,
    contacts,
    onResearched,
}: ResearchContactsDialogProps) {
    const [isRunning, setIsRunning] = useState(false)
    const [currentIndex, setCurrentIndex] = useState(0)
    const [currentName, setCurrentName] = useState('')
    const [succeeded, setSucceeded] = useState(0)
    const [failed, setFailed] = useState(0)
    const [isDone, setIsDone] = useState(false)
    const cancelRef = useRef(false)

    const total = contacts.length
    const progress = total > 0 ? ((currentIndex) / total) * 100 : 0

    const handleStart = useCallback(async () => {
        setIsRunning(true)
        setIsDone(false)
        setCurrentIndex(0)
        setSucceeded(0)
        setFailed(0)
        cancelRef.current = false

        let ok = 0
        let err = 0

        for (let i = 0; i < contacts.length; i++) {
            if (cancelRef.current) break

            const contact = contacts[i]
            setCurrentIndex(i)
            setCurrentName(`${contact.first_name} ${contact.last_name}`)

            const result = await researchContact(campaignId, contact.id)
            if (result.success) {
                ok += 1
                setSucceeded(ok)
            } else {
                err += 1
                setFailed(err)
            }
        }

        setCurrentIndex(contacts.length)
        setIsRunning(false)
        setIsDone(true)

        if (ok > 0) {
            toast.success(`Researched ${ok} contact(s)`)
        }
        await onResearched()
    }, [contacts, campaignId, onResearched])

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
                    <DialogTitle>Research Contacts</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {!isRunning && !isDone && (
                        <>
                            <p className="text-sm text-muted-foreground">
                                Sal will research each contact to find pain points, buying signals, and the best approach angle. This enrichment data improves email personalization.
                            </p>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between py-2 border-b border-border">
                                    <span className="text-muted-foreground">Contacts to research</span>
                                    <span className="font-medium text-foreground">{total}</span>
                                </div>
                            </div>
                        </>
                    )}

                    {isRunning && (
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">
                                        Researching {currentIndex + 1} of {total}...
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
                        </div>
                    )}

                    {isDone && (
                        <div className="space-y-3 py-4">
                            {succeeded > 0 && (
                                <div className="flex items-center gap-2 text-sm text-success">
                                    <CheckCircle2 className="h-5 w-5" />
                                    <span>{succeeded} contact(s) researched successfully</span>
                                </div>
                            )}
                            {failed > 0 && (
                                <div className="flex items-center gap-2 text-sm text-destructive">
                                    <XCircle className="h-5 w-5" />
                                    <span>{failed} failed — you can retry individually</span>
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
                            <Button onClick={handleStart}>
                                <Search className="h-4 w-4 mr-2" />
                                Research {total} Contact{total !== 1 ? 's' : ''}
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
