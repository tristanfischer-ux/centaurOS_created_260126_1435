'use client'

/**
 * @file contact-detail-dialog.tsx — Full detail view for a single contact.
 *
 * @description Shows header info, score with reasoning, recommended angle,
 * research brief, enrichment chips, email sequence preview, and action buttons.
 */

import { useTransition, useMemo } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/ui/status-badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
    Search,
    Wand2,
    Trash2,
    Loader2,
    ExternalLink,
    Mail,
} from 'lucide-react'
import { deleteContacts, generateSequenceForContact, researchContact } from '@/actions/outreach'
import { CONTACT_STATUS_MAP } from '@/types/outreach'
import type { Contact, OutreachEmail } from '@/types/outreach'
import { toast } from 'sonner'

interface ContactDetailDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    contact: Contact | null
    emails: OutreachEmail[]
    campaignId: string
    onRefresh: () => Promise<void>
}

function getScoreColor(score: number): string {
    if (score >= 7) return 'text-success'
    if (score >= 4) return 'text-warning'
    return 'text-destructive'
}

export function ContactDetailDialog({
    open,
    onOpenChange,
    contact,
    emails,
    campaignId,
    onRefresh,
}: ContactDetailDialogProps) {
    const [isPending, startTransition] = useTransition()

    const contactEmails = useMemo(() => {
        if (!contact) return []
        return emails
            .filter(e => e.contact_id === contact.id)
            .sort((a, b) => a.sequence_position - b.sequence_position)
    }, [contact, emails])

    if (!contact) return null

    const statusMeta = CONTACT_STATUS_MAP[contact.status] ?? { label: contact.status, variant: 'pending' as const }
    const fullName = `${contact.first_name} ${contact.last_name}`

    const handleResearch = () => {
        startTransition(async () => {
            const result = await researchContact(campaignId, contact.id)
            if (result.error) toast.error(result.error)
            else {
                toast.success('Contact researched')
                await onRefresh()
            }
        })
    }

    const handleGenerate = () => {
        startTransition(async () => {
            const result = await generateSequenceForContact(campaignId, contact.id)
            if (result.error) toast.error(result.error)
            else {
                toast.success(`Generated ${result.emailCount} emails`)
                await onRefresh()
            }
        })
    }

    const handleDelete = () => {
        startTransition(async () => {
            const result = await deleteContacts([contact.id], campaignId)
            if (result.error) toast.error(result.error)
            else {
                toast.success('Contact deleted')
                onOpenChange(false)
                await onRefresh()
            }
        })
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent size="lg" aria-describedby={undefined}>
                <DialogHeader>
                    <DialogTitle>{fullName}</DialogTitle>
                </DialogHeader>

                <ScrollArea className="max-h-[70vh]">
                    <div className="space-y-6 pr-4">
                        {/* Header info */}
                        <div className="space-y-2">
                            <div className="flex items-center gap-3 flex-wrap">
                                {contact.job_title && (
                                    <span className="text-sm text-muted-foreground">{contact.job_title}</span>
                                )}
                                {contact.company_name && (
                                    <span className="text-sm font-medium text-foreground">{contact.company_name}</span>
                                )}
                                <StatusBadge status={statusMeta.variant}>
                                    {statusMeta.label}
                                </StatusBadge>
                            </div>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                                {contact.email && (
                                    <span className="flex items-center gap-1">
                                        <Mail className="h-3.5 w-3.5" />
                                        {contact.email}
                                    </span>
                                )}
                                {contact.linkedin_url && (
                                    <a
                                        href={contact.linkedin_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1 text-international-orange hover:underline"
                                    >
                                        <ExternalLink className="h-3.5 w-3.5" />
                                        LinkedIn
                                    </a>
                                )}
                                {contact.industry && <span>{contact.industry}</span>}
                                {contact.company_size && <span>{contact.company_size}</span>}
                            </div>
                        </div>

                        {/* Score */}
                        {contact.score != null && contact.score > 0 && (
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-foreground">Fit Score</span>
                                    <span className={`text-lg font-bold ${getScoreColor(contact.score)}`}>
                                        {contact.score}/10
                                    </span>
                                </div>
                                {contact.score_reasoning && (
                                    <p className="text-sm text-muted-foreground">{contact.score_reasoning}</p>
                                )}
                            </div>
                        )}

                        {/* Recommended angle */}
                        {contact.recommended_angle && (
                            <div className="space-y-1">
                                <span className="text-sm font-medium text-foreground">Recommended Angle</span>
                                <p className="text-sm text-muted-foreground">{contact.recommended_angle}</p>
                            </div>
                        )}

                        {/* Research brief */}
                        {contact.research_brief && (
                            <div className="space-y-1">
                                <span className="text-sm font-medium text-foreground">Research Brief</span>
                                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{contact.research_brief}</p>
                            </div>
                        )}

                        {/* Enrichment chips */}
                        {(contact.pain_points?.length > 0 || contact.signals?.length > 0 || contact.tech_stack?.length > 0) && (
                            <div className="space-y-3">
                                {contact.pain_points?.length > 0 && (
                                    <div className="space-y-1">
                                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pain Points</span>
                                        <div className="flex flex-wrap gap-1.5">
                                            {contact.pain_points.map((pp, i) => (
                                                <Badge key={i} variant="destructive">{pp}</Badge>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {contact.signals?.length > 0 && (
                                    <div className="space-y-1">
                                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Buying Signals</span>
                                        <div className="flex flex-wrap gap-1.5">
                                            {contact.signals.map((s, i) => (
                                                <Badge key={i} variant="success">{s}</Badge>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {contact.tech_stack?.length > 0 && (
                                    <div className="space-y-1">
                                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tech Stack</span>
                                        <div className="flex flex-wrap gap-1.5">
                                            {contact.tech_stack.map((t, i) => (
                                                <Badge key={i} variant="secondary">{t}</Badge>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Email sequence preview */}
                        {contactEmails.length > 0 && (
                            <div className="space-y-3">
                                <span className="text-sm font-medium text-foreground">
                                    Email Sequence ({contactEmails.length} emails)
                                </span>
                                <div className="space-y-3">
                                    {contactEmails.map(email => (
                                        <div key={email.id} className="border border-border rounded-lg p-3 space-y-1">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-medium text-muted-foreground">
                                                    #{email.sequence_position} {email.sequence_label}
                                                </span>
                                                {email.send_delay_days > 0 && (
                                                    <span className="text-xs text-muted-foreground">
                                                        +{email.send_delay_days}d
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-sm font-medium text-foreground">{email.subject}</p>
                                            <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                                                {email.body}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 pt-2 border-t border-border">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleResearch}
                                disabled={isPending}
                            >
                                {isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Search className="h-4 w-4 mr-1" />}
                                Research
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleGenerate}
                                disabled={isPending}
                            >
                                {isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Wand2 className="h-4 w-4 mr-1" />}
                                Generate
                            </Button>
                            <div className="flex-1" />
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={handleDelete}
                                disabled={isPending}
                            >
                                <Trash2 className="h-4 w-4 mr-1" />
                                Delete
                            </Button>
                        </div>
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    )
}
