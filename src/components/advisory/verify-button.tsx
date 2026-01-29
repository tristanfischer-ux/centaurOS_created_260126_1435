"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { CheckCircle2, Shield, Loader2, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { VerificationStatus } from "./question-card"

interface VerifyButtonProps {
    answerId: string
    currentStatus: VerificationStatus
    userRole?: string
    onVerify?: (answerId: string, status: VerificationStatus, note?: string) => Promise<{ error?: string }>
    className?: string
}

const statusConfig = {
    unverified: {
        label: "Verify Answer",
        description: "This answer has not been verified yet.",
        icon: Shield,
        buttonVariant: "secondary" as const,
    },
    endorsed: {
        label: "Endorse to Verify",
        description: "This answer has been endorsed. Promote to verified?",
        icon: Shield,
        buttonVariant: "secondary" as const,
    },
    verified: {
        label: "Verified",
        description: "This answer has been verified by an expert.",
        icon: ShieldCheck,
        buttonVariant: "default" as const,
    },
}

export function VerifyButton({ 
    answerId, 
    currentStatus, 
    userRole, 
    onVerify,
    className 
}: VerifyButtonProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [verificationNote, setVerificationNote] = useState("")
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [selectedAction, setSelectedAction] = useState<"endorse" | "verify">("verify")

    // Only show for Executive role users
    const isExecutive = userRole === "Executive" || userRole === "Founder"
    
    if (!isExecutive) {
        // Show status indicator for non-executives
        if (currentStatus === "verified") {
            return (
                <div className={cn("flex items-center gap-1.5 text-emerald-600 text-sm font-medium", className)}>
                    <ShieldCheck className="h-4 w-4" />
                    <span>Verified</span>
                </div>
            )
        }
        if (currentStatus === "endorsed") {
            return (
                <div className={cn("flex items-center gap-1.5 text-amber-600 text-sm font-medium", className)}>
                    <Shield className="h-4 w-4" />
                    <span>Endorsed</span>
                </div>
            )
        }
        return null
    }

    const config = statusConfig[currentStatus]
    const StatusIcon = config.icon

    const handleVerify = async () => {
        if (!onVerify) return

        setIsSubmitting(true)
        try {
            const newStatus: VerificationStatus = selectedAction === "verify" ? "verified" : "endorsed"
            const result = await onVerify(answerId, newStatus, verificationNote || undefined)
            
            if (result?.error) {
                toast.error(result.error)
            } else {
                toast.success(
                    selectedAction === "verify" 
                        ? "Answer verified successfully" 
                        : "Answer endorsed successfully"
                )
                setIsOpen(false)
                setVerificationNote("")
            }
        } catch {
            toast.error("Failed to verify answer")
        } finally {
            setIsSubmitting(false)
        }
    }

    // Already verified - show success state
    if (currentStatus === "verified") {
        return (
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700 text-sm font-medium",
                    className
                )}
            >
                <ShieldCheck className="h-4 w-4" />
                <span>Verified</span>
            </motion.div>
        )
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button 
                    variant={config.buttonVariant}
                    size="sm"
                    className={cn(
                        "gap-1.5",
                        currentStatus === "endorsed" && "border-amber-300 text-amber-700 hover:bg-amber-50",
                        className
                    )}
                >
                    <StatusIcon className="h-4 w-4" />
                    {config.label}
                </Button>
            </DialogTrigger>
            <DialogContent size="sm">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        Verify Answer
                    </DialogTitle>
                    <DialogDescription>
                        {config.description}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Action selection */}
                    {currentStatus === "unverified" && (
                        <div className="flex gap-2">
                            <Button
                                variant={selectedAction === "endorse" ? "default" : "secondary"}
                                size="sm"
                                onClick={() => setSelectedAction("endorse")}
                                className={cn(
                                    "flex-1",
                                    selectedAction === "endorse" && "bg-amber-600 hover:bg-amber-700"
                                )}
                            >
                                <Shield className="h-4 w-4 mr-1.5" />
                                Endorse
                            </Button>
                            <Button
                                variant={selectedAction === "verify" ? "default" : "secondary"}
                                size="sm"
                                onClick={() => setSelectedAction("verify")}
                                className={cn(
                                    "flex-1",
                                    selectedAction === "verify" && "bg-emerald-600 hover:bg-emerald-700"
                                )}
                            >
                                <CheckCircle2 className="h-4 w-4 mr-1.5" />
                                Verify
                            </Button>
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                            Verification Note (optional)
                        </label>
                        <Textarea
                            value={verificationNote}
                            onChange={(e) => setVerificationNote(e.target.value)}
                            placeholder="Add context or notes about your verification..."
                            className="min-h-[80px] resize-none"
                        />
                    </div>

                    <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
                        <p className="font-medium mb-1">Democratic Workflow</p>
                        <p className="text-blue-600 text-xs">
                            {selectedAction === "verify" 
                                ? "Verifying confirms this AI answer is accurate and can be trusted by others."
                                : "Endorsing indicates this answer looks good but may need additional review."}
                        </p>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => setIsOpen(false)} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={isSubmitting ? "loading" : "idle"}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                        >
                            <Button 
                                onClick={handleVerify} 
                                disabled={isSubmitting}
                                className={cn(
                                    selectedAction === "verify" 
                                        ? "bg-emerald-600 hover:bg-emerald-700" 
                                        : "bg-amber-600 hover:bg-amber-700"
                                )}
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                                        Processing...
                                    </>
                                ) : (
                                    <>
                                        {selectedAction === "verify" ? (
                                            <CheckCircle2 className="h-4 w-4 mr-1.5" />
                                        ) : (
                                            <Shield className="h-4 w-4 mr-1.5" />
                                        )}
                                        {selectedAction === "verify" ? "Confirm Verification" : "Confirm Endorsement"}
                                    </>
                                )}
                            </Button>
                        </motion.div>
                    </AnimatePresence>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
