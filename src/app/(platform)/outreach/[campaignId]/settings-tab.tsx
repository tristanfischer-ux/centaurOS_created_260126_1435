'use client'

/**
 * @file settings-tab.tsx — Campaign settings editor.
 */

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Save } from 'lucide-react'
import { updateCampaign } from '@/actions/outreach'
import { TONE_OPTIONS } from '@/types/outreach'
import type { Campaign, CampaignTone } from '@/types/outreach'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface SettingsTabProps {
    campaign: Campaign
    onUpdate: (updates: Partial<Campaign>) => void
}

export function SettingsTab({ campaign, onUpdate }: SettingsTabProps) {
    const [isPending, startTransition] = useTransition()
    const [form, setForm] = useState({
        product_context: campaign.product_context,
        icp_description: campaign.icp_description,
        tone: campaign.tone,
        sequence_length: campaign.sequence_length,
        value_props: campaign.value_props.length > 0 ? campaign.value_props : [''],
    })

    const handleSave = () => {
        startTransition(async () => {
            const result = await updateCampaign(campaign.id, {
                product_context: form.product_context,
                icp_description: form.icp_description,
                tone: form.tone,
                sequence_length: form.sequence_length,
                value_props: form.value_props.filter(v => v.trim()),
            })

            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Settings saved')
                onUpdate({
                    product_context: form.product_context,
                    icp_description: form.icp_description,
                    tone: form.tone,
                    sequence_length: form.sequence_length,
                    value_props: form.value_props.filter(v => v.trim()),
                })
            }
        })
    }

    const updateValueProp = (index: number, value: string) => {
        setForm(prev => ({
            ...prev,
            value_props: prev.value_props.map((v, i) => i === index ? value : v),
        }))
    }

    return (
        <div className="max-w-3xl space-y-8 mt-4">
            {/* Tone */}
            <div className="space-y-3">
                <Label>Tone</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {TONE_OPTIONS.map(opt => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => setForm(prev => ({ ...prev, tone: opt.value }))}
                            className={cn(
                                "flex flex-col items-start p-3 rounded-lg border text-left transition-colors",
                                form.tone === opt.value
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

            {/* Sequence length */}
            <div className="space-y-3">
                <Label>Emails per Sequence</Label>
                <div className="flex gap-2">
                    {[3, 4, 5].map(n => (
                        <button
                            key={n}
                            type="button"
                            onClick={() => setForm(prev => ({ ...prev, sequence_length: n }))}
                            className={cn(
                                "px-4 py-2 rounded-md border text-sm font-medium transition-colors",
                                form.sequence_length === n
                                    ? "border-international-orange bg-international-orange/5 text-international-orange"
                                    : "border-border text-muted-foreground hover:border-muted-foreground/30"
                            )}
                        >
                            {n}
                        </button>
                    ))}
                </div>
            </div>

            {/* Product context */}
            <div className="space-y-2">
                <Label htmlFor="settings-product">Product Context</Label>
                <Textarea
                    id="settings-product"
                    placeholder="What are you selling? Help Sal understand your product..."
                    rows={5}
                    value={form.product_context ?? ''}
                    onChange={(e) => setForm(prev => ({ ...prev, product_context: e.target.value }))}
                />
            </div>

            {/* ICP */}
            <div className="space-y-2">
                <Label htmlFor="settings-icp">Ideal Customer Profile</Label>
                <Textarea
                    id="settings-icp"
                    placeholder="Who are you targeting? Role, company size, industry..."
                    rows={5}
                    value={form.icp_description ?? ''}
                    onChange={(e) => setForm(prev => ({ ...prev, icp_description: e.target.value }))}
                />
            </div>

            {/* Value props */}
            <div className="space-y-3">
                <Label>Value Propositions</Label>
                <div className="space-y-2">
                    {form.value_props.map((vp, i) => (
                        <div key={i} className="flex gap-2">
                            <Input
                                placeholder={`Value prop ${i + 1}...`}
                                value={vp}
                                onChange={(e) => updateValueProp(i, e.target.value)}
                            />
                            {form.value_props.length > 1 && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setForm(prev => ({
                                        ...prev,
                                        value_props: prev.value_props.filter((_, idx) => idx !== i),
                                    }))}
                                >
                                    Remove
                                </Button>
                            )}
                        </div>
                    ))}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setForm(prev => ({
                            ...prev,
                            value_props: [...prev.value_props, ''],
                        }))}
                    >
                        + Add Value Prop
                    </Button>
                </div>
            </div>

            {/* Save button */}
            <div className="flex justify-end pt-4 border-t border-border">
                <Button onClick={handleSave} disabled={isPending}>
                    {isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                        <Save className="h-4 w-4 mr-2" />
                    )}
                    Save Settings
                </Button>
            </div>
        </div>
    )
}
