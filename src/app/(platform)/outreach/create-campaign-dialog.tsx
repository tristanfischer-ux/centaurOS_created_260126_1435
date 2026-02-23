'use client'

/**
 * @file create-campaign-dialog.tsx — 2-step wizard for creating a campaign.
 *
 * @description Steps: (1) Name + Tone + Sequence Length, (2) Review & Create.
 * Product context, ICP, and value props are editable in the Settings tab after creation.
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    ChevronLeft,
    ChevronRight,
    Loader2,
    Megaphone,
    CheckCircle2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createCampaign } from '@/actions/outreach'
import { TONE_OPTIONS } from '@/types/outreach'
import type { CampaignTone } from '@/types/outreach'
import { toast } from 'sonner'

interface CreateCampaignDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onCreated: (campaignId: string) => void
}

type Step = 'basics' | 'review'

const STEPS: { id: Step; title: string; icon: React.ElementType }[] = [
    { id: 'basics', title: 'Basics', icon: Megaphone },
    { id: 'review', title: 'Review', icon: CheckCircle2 },
]

export function CreateCampaignDialog({ open, onOpenChange, onCreated }: CreateCampaignDialogProps) {
    const [isPending, startTransition] = useTransition()
    const [currentStep, setCurrentStep] = useState<Step>('basics')
    const [error, setError] = useState<string | null>(null)

    const [formData, setFormData] = useState({
        name: '',
        tone: 'professional' as CampaignTone,
        sequence_length: 4,
    })

    const stepIndex = STEPS.findIndex(s => s.id === currentStep)

    const canProceed = () => {
        switch (currentStep) {
            case 'basics': return formData.name.trim().length > 0
            case 'review': return true
        }
    }

    const goNext = () => {
        const next = STEPS[stepIndex + 1]
        if (next) setCurrentStep(next.id)
    }

    const goBack = () => {
        const prev = STEPS[stepIndex - 1]
        if (prev) setCurrentStep(prev.id)
    }

    const handleSubmit = () => {
        setError(null)
        startTransition(async () => {
            const result = await createCampaign({
                name: formData.name.trim(),
                tone: formData.tone,
                sequence_length: formData.sequence_length,
            })

            if (result.error) {
                setError(result.error)
                toast.error(result.error)
            } else if (result.data) {
                toast.success('Campaign created')
                onCreated(result.data.id)
                // Reset form
                setFormData({ name: '', tone: 'professional', sequence_length: 4 })
                setCurrentStep('basics')
            }
        })
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent size="md" aria-describedby={undefined}>
                <DialogHeader>
                    <DialogTitle>Create Campaign</DialogTitle>
                </DialogHeader>

                {/* Step indicator */}
                <div className="flex items-center gap-1 px-1">
                    {STEPS.map((step, i) => (
                        <div key={step.id} className="flex items-center flex-1">
                            <div
                                className={cn(
                                    "flex items-center justify-center h-7 w-7 rounded-full text-xs font-medium transition-colors",
                                    i <= stepIndex
                                        ? "bg-international-orange text-background"
                                        : "bg-muted text-muted-foreground"
                                )}
                            >
                                {i + 1}
                            </div>
                            {i < STEPS.length - 1 && (
                                <div className={cn(
                                    "flex-1 h-0.5 mx-1 rounded-full transition-colors",
                                    i < stepIndex ? "bg-international-orange" : "bg-muted"
                                )} />
                            )}
                        </div>
                    ))}
                </div>

                {/* Step content */}
                <div className="min-h-[240px] space-y-4 py-2">
                    {currentStep === 'basics' && (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="campaign-name">Campaign Name</Label>
                                <Input
                                    id="campaign-name"
                                    placeholder="e.g., Q1 SaaS Founders Outreach"
                                    value={formData.name}
                                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                    aria-required
                                    autoFocus
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Tone</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    {TONE_OPTIONS.map(opt => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => setFormData(prev => ({ ...prev, tone: opt.value }))}
                                            className={cn(
                                                "flex flex-col items-start p-3 rounded-lg border text-left transition-colors",
                                                formData.tone === opt.value
                                                    ? "border-international-orange bg-international-orange/5"
                                                    : "border-border hover:border-muted-foreground/30"
                                            )}
                                        >
                                            <span className="text-sm font-medium text-foreground">{opt.label}</span>
                                            <span className="text-xs text-muted-foreground">{opt.description}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="sequence-length">Emails per Sequence</Label>
                                <div className="flex gap-2">
                                    {[3, 4, 5].map(n => (
                                        <button
                                            key={n}
                                            type="button"
                                            onClick={() => setFormData(prev => ({ ...prev, sequence_length: n }))}
                                            className={cn(
                                                "px-4 py-2 rounded-md border text-sm font-medium transition-colors",
                                                formData.sequence_length === n
                                                    ? "border-international-orange bg-international-orange/5 text-international-orange"
                                                    : "border-border text-muted-foreground hover:border-muted-foreground/30"
                                            )}
                                        >
                                            {n}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {currentStep === 'review' && (
                        <div className="space-y-4">
                            <p className="text-sm text-muted-foreground">
                                Review your campaign settings. You can add product context, ICP, and value props in the Settings tab after creation.
                            </p>
                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between py-2 border-b border-border">
                                    <span className="text-muted-foreground">Name</span>
                                    <span className="font-medium text-foreground">{formData.name}</span>
                                </div>
                                <div className="flex justify-between py-2 border-b border-border">
                                    <span className="text-muted-foreground">Tone</span>
                                    <span className="font-medium text-foreground capitalize">{formData.tone}</span>
                                </div>
                                <div className="flex justify-between py-2">
                                    <span className="text-muted-foreground">Sequence Length</span>
                                    <span className="font-medium text-foreground">{formData.sequence_length} emails</span>
                                </div>
                            </div>
                            {error && (
                                <p className="text-sm text-destructive" role="alert">{error}</p>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <DialogFooter className="flex items-center justify-between sm:justify-between">
                    <div>
                        {stepIndex > 0 && (
                            <Button variant="ghost" onClick={goBack} disabled={isPending}>
                                <ChevronLeft className="h-4 w-4 mr-1" />
                                Back
                            </Button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                            Cancel
                        </Button>
                        {currentStep === 'review' ? (
                            <Button onClick={handleSubmit} disabled={isPending}>
                                {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                Create Campaign
                            </Button>
                        ) : (
                            <Button onClick={goNext} disabled={!canProceed()}>
                                Next
                                <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                        )}
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
