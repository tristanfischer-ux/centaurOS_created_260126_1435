'use client'

/**
 * @file add-contact-dialog.tsx — Manual contact entry form.
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
import { Loader2 } from 'lucide-react'
import { addContact } from '@/actions/outreach'
import { toast } from 'sonner'

interface AddContactDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    campaignId: string
    onAdded: () => Promise<void>
}

export function AddContactDialog({ open, onOpenChange, campaignId, onAdded }: AddContactDialogProps) {
    const [isPending, startTransition] = useTransition()
    const [form, setForm] = useState({
        first_name: '',
        last_name: '',
        email: '',
        company_name: '',
        job_title: '',
        linkedin_url: '',
        company_domain: '',
        industry: '',
        company_size: '',
    })

    const update = (field: string, value: string) => {
        setForm(prev => ({ ...prev, [field]: value }))
    }

    const handleSubmit = () => {
        if (!form.first_name.trim()) {
            toast.error('First name is required')
            return
        }
        if (!form.company_name.trim()) {
            toast.error('Company name is required')
            return
        }

        startTransition(async () => {
            const result = await addContact(campaignId, form)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Contact added')
                setForm({
                    first_name: '', last_name: '', email: '', company_name: '',
                    job_title: '', linkedin_url: '', company_domain: '', industry: '', company_size: '',
                })
                onOpenChange(false)
                await onAdded()
            }
        })
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent size="md" aria-describedby={undefined}>
                <DialogHeader>
                    <DialogTitle>Add Contact</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="first-name">First Name *</Label>
                            <Input
                                id="first-name"
                                placeholder="Jane"
                                value={form.first_name}
                                onChange={(e) => update('first_name', e.target.value)}
                                aria-required
                                autoFocus
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="last-name">Last Name</Label>
                            <Input
                                id="last-name"
                                placeholder="Smith"
                                value={form.last_name}
                                onChange={(e) => update('last_name', e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            placeholder="jane@acme.com"
                            value={form.email}
                            onChange={(e) => update('email', e.target.value)}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="company">Company *</Label>
                        <Input
                            id="company"
                            placeholder="Acme Corp"
                            value={form.company_name}
                            onChange={(e) => update('company_name', e.target.value)}
                            aria-required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="title">Job Title</Label>
                            <Input
                                id="title"
                                placeholder="VP Engineering"
                                value={form.job_title}
                                onChange={(e) => update('job_title', e.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="industry">Industry</Label>
                            <Input
                                id="industry"
                                placeholder="Fintech"
                                value={form.industry}
                                onChange={(e) => update('industry', e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="domain">Company Domain</Label>
                            <Input
                                id="domain"
                                placeholder="acme.com"
                                value={form.company_domain}
                                onChange={(e) => update('company_domain', e.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="size">Company Size</Label>
                            <Input
                                id="size"
                                placeholder="51-200"
                                value={form.company_size}
                                onChange={(e) => update('company_size', e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="linkedin">LinkedIn URL</Label>
                        <Input
                            id="linkedin"
                            placeholder="https://linkedin.com/in/janesmith"
                            value={form.linkedin_url}
                            onChange={(e) => update('linkedin_url', e.target.value)}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={isPending}>
                        {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Add Contact
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
