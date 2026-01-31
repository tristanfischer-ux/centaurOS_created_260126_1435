'use client'

import React, { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ShieldAlert, Stamp } from 'lucide-react'
import { approveTask } from '@/actions/tasks'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'

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
    const [isStamped, setIsStamped] = useState(false)

    const allChecked = checks.pricing && checks.accreditation && checks.liability

    const handleApprove = async () => {
        if (!allChecked) return
        setIsSubmitting(true)

        const result = await approveTask(taskId)

        if (result.error) {
            toast.error(result.error)
            setIsSubmitting(false)
        } else {
            // Trigger Animation
            setIsStamped(true)

            // Wait for animation to finish before closing
            setTimeout(() => {
                toast.success("Task Certified & Released")
                onClose()
                // Reset state after close
                setTimeout(() => {
                    setIsStamped(false)
                    setIsSubmitting(false)
                    setChecks({ pricing: false, accreditation: false, liability: false })
                }, 300)
            }, 1000)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={() => !isSubmitting && onClose()}>
            <DialogContent className="sm:max-w-md bg-background border-destructive text-foreground overflow-hidden relative shadow-brand-lg">

                {/* STAMP ANIMATION OVERLAY */}
                <AnimatePresence>
                    {isStamped && (
                        <motion.div
                            initial={{ scale: 3, opacity: 0, rotate: -20 }}
                            animate={{ scale: 1, opacity: 1, rotate: -10 }}
                            exit={{ opacity: 0 }}
                            transition={{
                                type: "spring",
                                stiffness: 300,
                                damping: 15,
                                mass: 1.5
                            }}
                            className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none"
                        >
                            <div className="border-8 border-destructive rounded px-8 py-2 text-destructive font-black text-6xl tracking-widest uppercase opacity-90 mix-blend-multiply shadow-[0_0_50px_rgba(220,38,38,0.2)] transform -rotate-12 bg-background/10 backdrop-blur-[2px]">
                                CERTIFIED
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <DialogHeader>
                    <div className="flex items-center gap-2 text-red-600 mb-2">
                        <ShieldAlert className="w-6 h-6" />
                        <span className="text-sm font-mono uppercase tracking-widest font-bold">Executive Airlock</span>
                    </div>
                    <DialogTitle className="text-2xl font-serif text-foreground font-bold">Certification Required</DialogTitle>
                    <DialogDescription className="text-muted-foreground font-medium">
                        This is a High Risk operation. You must verify the following before releasing to client.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-4 py-4 relative">
                    <div className="flex items-start space-x-3 p-3 rounded-lg border border-red-100 bg-red-50/50 hover:bg-red-50 transition-colors">
                        <Checkbox
                            id="pricing"
                            checked={checks.pricing}
                            onCheckedChange={(c) => setChecks(prev => ({ ...prev, pricing: !!c }))}
                            disabled={isSubmitting}
                            className="border-red-300 data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
                        />
                        <div className="grid gap-1.5 leading-none">
                            <label htmlFor="pricing" className="text-sm font-semibold leading-none text-red-900 cursor-pointer">
                                I have checked the pricing
                            </label>
                            <p className="text-xs text-red-700/80">
                                Margins and quote accuracy verified.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-start space-x-3 p-3 rounded-lg border border-red-100 bg-red-50/50 hover:bg-red-50 transition-colors">
                        <Checkbox
                            id="accreditation"
                            checked={checks.accreditation}
                            onCheckedChange={(c) => setChecks(prev => ({ ...prev, accreditation: !!c }))}
                            disabled={isSubmitting}
                            className="border-red-300 data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
                        />
                        <div className="grid gap-1.5 leading-none">
                            <label htmlFor="accreditation" className="text-sm font-semibold leading-none text-red-900 cursor-pointer">
                                I have verified supplier accreditation
                            </label>
                            <p className="text-xs text-red-700/80">
                                Vendor is cleared for this risk level.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-start space-x-3 p-3 rounded-lg border border-red-100 bg-red-50/50 hover:bg-red-50 transition-colors">
                        <Checkbox
                            id="liability"
                            checked={checks.liability}
                            onCheckedChange={(c) => setChecks(prev => ({ ...prev, liability: !!c }))}
                            disabled={isSubmitting}
                            className="border-red-300 data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
                        />
                        <div className="grid gap-1.5 leading-none">
                            <label htmlFor="liability" className="text-sm font-semibold leading-none text-red-900 cursor-pointer">
                                I accept liability for this output
                            </label>
                            <p className="text-xs text-red-700/80">
                                Personal executive sign-off.
                            </p>
                        </div>
                    </div>
                </div>

                <DialogFooter className="sm:justify-between">
                    <Button variant="ghost" onClick={onClose} disabled={isSubmitting} className="text-zinc-500 hover:text-zinc-300">
                        Cancel
                    </Button>
                    <Button
                        onClick={handleApprove}
                        disabled={!allChecked || isSubmitting}
                        className={`gap-2 font-mono uppercase tracking-wide transition-all duration-300 ${isStamped ? "bg-destructive/90 text-destructive-foreground scale-105" : "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                            }`}
                    >
                        {isStamped ? (
                            <>
                                <Stamp className="w-4 h-4 mr-2" />
                                CERTIFIED
                            </>
                        ) : isSubmitting ? 'Stamping...' : (
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
