'use client'

/**
 * @file create-campaign-dialog.tsx — Multi-step wizard for creating a campaign.
 *
 * @description Steps: Name + Tone > Product Context > ICP Description >
 * Value Props > Review. Follows the wizard pattern from company-purpose-dialog.
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
import { Textarea } from '@/components/ui/textarea'
import {
    ChevronLeft,
    ChevronRight,
    Loader2,
    Send,
    Megaphone,
    UserSearch,
    Lightbulb,
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

type Step = 'basics' | 'product' | 'icp' | 'value' | 'review'

const STEPS: { id: Step; title: string; icon: React.ElementType }[] = [
    { id: 'basics', title: 'Basics', icon: Megaphone },
    { id: 'product', title: 'Product', icon: Send },
    { id: 'icp', title: 'ICP', icon: UserSearch },
    { id: 'value', title: 'Value Props', icon: Lightbulb },
    { id: 'review', title: 'Review', icon: CheckCircle2 },
]

export function CreateCampaignDialog({ open, onOpenChange, onCreated }: CreateCampaignDialogProps) {
    const [isPending, startTransition] = useTransition()
    const [currentStep, setCurrentStep] = useState<Step>('basics')
    const [error, setError] = useState<string | null>(null)

    const [formData, setFormData] = useState({
        name: '',
        tone: 'professional' as CampaignTone,
        product_context: '',
        icp_description: '',
        value_props: [''],
        sequence_length: 4,
    })

    const stepIndex = STEPS.findIndex(s => s.id === currentStep)

    const canProceed = () => {
        switch (currentStep) {
            case 'basics': return formData.name.trim().length > 0
            case 'product': return true // optional
            case 'icp': return true // optional
            case 'value': return true // optional
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
                product_context: formData.product_context.trim(),
                icp_description: formData.icp_description.trim(),
                value_props: formData.value_props.filter(v => v.trim()),
                sequence_length: formData.sequence_length,
            })

            if (result.error) {
                setError(result.error)
                toast.error(result.error)
            } else if (result.data) {
                toast.success('Campaign created')
                onCreated(result.data.id)
                // Reset form
                setFormData({ name: '', tone: 'professional', product_context: '', icp_description: '', value_props: [''], sequence_length: 4 })
                setCurrentStep('basics')
            }
        })
    }

    const addValueProp = () => {
        setFormData(prev => ({ ...prev, value_props: [...prev.value_props, ''] }))
    }

    const updateValueProp = (index: number, value: string) => {
        setFormData(prev => ({
            ...prev,
            value_props: prev.value_props.map((v, i) => i === index ? value : v),
        }))
    }

    const removeValueProp = (index: number) => {
        setFormData(prev => ({
            ...prev,
            value_props: prev.value_props.filter((_, i) => i !== index),
        }))
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

                    {currentStep === 'product' && (
                        <div className="space-y-4">
                            <p className="text-sm text-muted-foreground">
                                What are you selling? Help Sal understand your product so emails are specific and compelling.
                            </p>
                            <div className="space-y-2">
                                <Label htmlFor="product-context">Product Context</Label>
                                <Textarea
                                    id="product-context"
                                    placeholder="e.g., We build automated compliance monitoring for fintech startups. We catch regulatory violations before auditors do, saving 40+ hours/month of manual review..."
                                    rows={6}
                                    value={formData.product_context}
                                    onChange={(e) => setFormData(prev => ({ ...prev, product_context: e.target.value }))}
                                />
                                <p className="text-xs text-muted-foreground text-right">
                                    {formData.product_context.length}/1000
                                </p>
                            </div>
                        </div>
                    )}

                    {currentStep === 'icp' && (
                        <div className="space-y-4">
                            <p className="text-sm text-muted-foreground">
                                Who are you targeting? The more specific, the better Sal can personalize.
                            </p>
                            <div className="space-y-2">
                                <Label htmlFor="icp-description">Ideal Customer Profile</Label>
                                <Textarea
                                    id="icp-description"
                                    placeholder="e.g., VP of Engineering or CTO at Series A-C fintech companies (50-200 employees). They're dealing with SOC2/PCI compliance and spending too much time on manual audits..."
                                    rows={6}
                                    value={formData.icp_description}
                                    onChange={(e) => setFormData(prev => ({ ...prev, icp_description: e.target.value }))}
                                />
                                <p className="text-xs text-muted-foreground text-right">
                                    {formData.icp_description.length}/1000
                                </p>
                            </div>
                        </div>
                    )}

                    {currentStep === 'value' && (
                        <div className="space-y-4">
                            <p className="text-sm text-muted-foreground">
                                Key value propositions Sal should weave into emails. Add your strongest proof points.
                            </p>
                            <div className="space-y-2">
                                {formData.value_props.map((vp, i) => (
                                    <div key={i} className="flex gap-2">
                                        <Input
                                            placeholder={`Value prop ${i + 1}...`}
                                            value={vp}
                                            onChange={(e) => updateValueProp(i, e.target.value)}
                                        />
                                        {formData.value_props.length > 1 && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => removeValueProp(i)}
                                                className="shrink-0"
                                            >
                                                Remove
                                            </Button>
                                        )}
                                    </div>
                                ))}
                                <Button variant="outline" size="sm" onClick={addValueProp}>
                                    + Add Value Prop
                                </Button>
                            </div>
                        </div>
                    )}

                    {currentStep === 'review' && (
                        <div className="space-y-4">
                            <p className="text-sm text-muted-foreground">
                                Review your campaign settings. You can always edit these later.
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
                                <div className="flex justify-between py-2 border-b border-border">
                                    <span className="text-muted-foreground">Sequence Length</span>
                                    <span className="font-medium text-foreground">{formData.sequence_length} emails</span>
                                </div>
                                <div className="flex justify-between py-2 border-b border-border">
                                    <span className="text-muted-foreground">Product Context</span>
                                    <span className="font-medium text-foreground">{formData.product_context ? 'Provided' : 'Skipped'}</span>
                                </div>
                                <div className="flex justify-between py-2 border-b border-border">
                                    <span className="text-muted-foreground">ICP</span>
                                    <span className="font-medium text-foreground">{formData.icp_description ? 'Provided' : 'Skipped'}</span>
                                </div>
                                <div className="flex justify-between py-2">
                                    <span className="text-muted-foreground">Value Props</span>
                                    <span className="font-medium text-foreground">{formData.value_props.filter(v => v.trim()).length}</span>
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
