'use client'

import React, { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ShieldAlert, Stamp } from 'lucide-react'
import { approveTask } from '@/actions/tasks'
import { toast } from 'sonner'

interface RubberStampModalProps {
    taskId: string
    isOpen: boolean
    onClose: () => void
}

export function RubberStampModal({ taskId, isOpen, onClose }: RubberStampModalProps) {
    const [checks, setChecks] = useState({
        pricing: false,
        accreditation: false,
        liability: false
    })
    const [isSubmitting, setIsSubmitting] = useState(false)

    const allChecked = checks.pricing && checks.accreditation && checks.liability

    const handleApprove = async () => {
        if (!allChecked) return
        setIsSubmitting(true)

        const result = await approveTask(taskId)

        setIsSubmitting(false)
        if (result.error) {
            toast.error(result.error)
        } else {
            toast.success("Task Certified & Released")
            onClose()
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md bg-zinc-950 border-red-900/50 text-zinc-100">
                <DialogHeader>
                    <div className="flex items-center gap-2 text-red-500 mb-2">
                        <ShieldAlert className="w-6 h-6" />
                        <span className="text-sm font-mono uppercase tracking-widest">Executive Airlock</span>
                    </div>
                    <DialogTitle className="text-xl font-serif text-white">Certification Required</DialogTitle>
                    <DialogDescription className="text-zinc-400">
                        This is a High Risk operation. You must verify the following before releasing to client.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-4 py-4">
                    <div className="flex items-start space-x-3 p-3 rounded-lg border border-red-900/20 bg-red-950/10 hover:bg-red-950/20 transition-colors">
                        <Checkbox
                            id="pricing"
                            checked={checks.pricing}
                            onCheckedChange={(c) => setChecks(prev => ({ ...prev, pricing: !!c }))}
                            className="border-red-500/50 data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
                        />
                        <div className="grid gap-1.5 leading-none">
                            <label htmlFor="pricing" className="text-sm font-medium leading-none text-red-200 cursor-pointer">
                                I have checked the pricing
                            </label>
                            <p className="text-xs text-red-400/60">
                                Margins and quote accuracy verified.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-start space-x-3 p-3 rounded-lg border border-red-900/20 bg-red-950/10 hover:bg-red-950/20 transition-colors">
                        <Checkbox
                            id="accreditation"
                            checked={checks.accreditation}
                            onCheckedChange={(c) => setChecks(prev => ({ ...prev, accreditation: !!c }))}
                            className="border-red-500/50 data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
                        />
                        <div className="grid gap-1.5 leading-none">
                            <label htmlFor="accreditation" className="text-sm font-medium leading-none text-red-200 cursor-pointer">
                                I have verified supplier accreditation
                            </label>
                            <p className="text-xs text-red-400/60">
                                Vendor is cleared for this risk level.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-start space-x-3 p-3 rounded-lg border border-red-900/20 bg-red-950/10 hover:bg-red-950/20 transition-colors">
                        <Checkbox
                            id="liability"
                            checked={checks.liability}
                            onCheckedChange={(c) => setChecks(prev => ({ ...prev, liability: !!c }))}
                            className="border-red-500/50 data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
                        />
                        <div className="grid gap-1.5 leading-none">
                            <label htmlFor="liability" className="text-sm font-medium leading-none text-red-200 cursor-pointer">
                                I accept liability for this output
                            </label>
                            <p className="text-xs text-red-400/60">
                                Personal executive sign-off.
                            </p>
                        </div>
                    </div>
                </div>

                <DialogFooter className="sm:justify-between">
                    <Button variant="ghost" onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
                        Cancel
                    </Button>
                    <Button
                        onClick={handleApprove}
                        disabled={!allChecked || isSubmitting}
                        className="bg-red-600 hover:bg-red-700 text-white gap-2 font-mono uppercase tracking-wide"
                    >
                        {isSubmitting ? 'Stamping...' : (
                            <>
                                <Stamp className="w-4 h-4" />
                                Certify & Release
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
