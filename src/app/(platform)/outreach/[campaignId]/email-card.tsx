'use client'

/**
 * @file email-card.tsx — Single email display with copy buttons and inline editing.
 */

import { useState, useTransition } from 'react'
import { Copy, Check, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { updateEmail } from '@/actions/outreach'
import { EMAIL_STATUS_MAP, SEQUENCE_LABELS } from '@/types/outreach'
import type { OutreachEmail } from '@/types/outreach'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface EmailCardProps {
    email: OutreachEmail
    onRefresh: () => Promise<void>
}

export function EmailCard({ email, onRefresh }: EmailCardProps) {
    const [isEditingSubject, setIsEditingSubject] = useState(false)
    const [isEditingBody, setIsEditingBody] = useState(false)
    const [editSubject, setEditSubject] = useState(email.subject)
    const [editBody, setEditBody] = useState(email.body)
    const [copiedField, setCopiedField] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    const statusMeta = EMAIL_STATUS_MAP[email.status]
    const label = email.sequence_label || SEQUENCE_LABELS[email.sequence_position] || `Email ${email.sequence_position}`

    const copyToClipboard = async (text: string, field: string) => {
        await navigator.clipboard.writeText(text)
        setCopiedField(field)
        setTimeout(() => setCopiedField(null), 2000)
        toast.success('Copied to clipboard')
    }

    const handleSaveSubject = () => {
        if (editSubject.trim() !== email.subject) {
            startTransition(async () => {
                const result = await updateEmail(email.id, { subject: editSubject.trim() })
                if (result.error) toast.error(result.error)
                else await onRefresh()
            })
        }
        setIsEditingSubject(false)
    }

    const handleSaveBody = () => {
        if (editBody.trim() !== email.body) {
            startTransition(async () => {
                const result = await updateEmail(email.id, { body: editBody.trim() })
                if (result.error) toast.error(result.error)
                else await onRefresh()
            })
        }
        setIsEditingBody(false)
    }

    // Highlight personalization tokens
    const highlightTokens = (text: string) => {
        return text.replace(
            /\{(\w+)\}/g,
            '<span class="px-1 py-0.5 rounded bg-international-orange/10 text-international-orange text-xs font-mono">{$1}</span>'
        )
    }

    return (
        <div className="px-4 py-3 space-y-3">
            {/* Header row */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-medium text-international-orange bg-international-orange/10 px-2 py-0.5 rounded">
                        {label}
                    </span>
                    <StatusBadge status={statusMeta.variant}>
                        {statusMeta.label}
                    </StatusBadge>
                    {email.send_delay_days > 0 && (
                        <span className="text-xs text-muted-foreground">
                            +{email.send_delay_days}d
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => copyToClipboard(email.subject, 'subject')}
                    >
                        {copiedField === 'subject' ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                        Subject
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => copyToClipboard(email.body, 'body')}
                    >
                        {copiedField === 'body' ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                        Body
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => copyToClipboard(`Subject: ${email.subject}\n\n${email.body}`, 'all')}
                    >
                        {copiedField === 'all' ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                        Copy All
                    </Button>
                </div>
            </div>

            {/* Subject line */}
            <div className="space-y-1">
                <div className="flex items-center gap-1">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Subject</span>
                    {!isEditingSubject && (
                        <button
                            onClick={() => setIsEditingSubject(true)}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            aria-label="Edit subject"
                        >
                            <Pencil className="h-3 w-3" />
                        </button>
                    )}
                </div>
                {isEditingSubject ? (
                    <Input
                        value={editSubject}
                        onChange={(e) => setEditSubject(e.target.value)}
                        onBlur={handleSaveSubject}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveSubject()
                            if (e.key === 'Escape') {
                                setEditSubject(email.subject)
                                setIsEditingSubject(false)
                            }
                        }}
                        autoFocus
                        className="font-medium"
                    />
                ) : (
                    <p className="font-medium text-foreground cursor-pointer hover:text-international-orange transition-colors"
                        onClick={() => setIsEditingSubject(true)}
                    >
                        {email.subject}
                    </p>
                )}
            </div>

            {/* Subject variants */}
            {email.subject_variants && email.subject_variants.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-xs text-muted-foreground">Variants:</span>
                    {email.subject_variants.map((variant, i) => (
                        <button
                            key={i}
                            onClick={() => copyToClipboard(variant, `variant-${i}`)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-xs text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
                        >
                            {copiedField === `variant-${i}` ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
                            {variant}
                        </button>
                    ))}
                </div>
            )}

            {/* Body */}
            <div className="space-y-1">
                <div className="flex items-center gap-1">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Body</span>
                    {!isEditingBody && (
                        <button
                            onClick={() => setIsEditingBody(true)}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            aria-label="Edit body"
                        >
                            <Pencil className="h-3 w-3" />
                        </button>
                    )}
                </div>
                {isEditingBody ? (
                    <div className="space-y-2">
                        <Textarea
                            value={editBody}
                            onChange={(e) => setEditBody(e.target.value)}
                            rows={6}
                            autoFocus
                        />
                        <div className="flex gap-2 justify-end">
                            <Button variant="ghost" size="sm" onClick={() => {
                                setEditBody(email.body)
                                setIsEditingBody(false)
                            }}>
                                Cancel
                            </Button>
                            <Button size="sm" onClick={handleSaveBody} disabled={isPending}>
                                Save
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div
                        className="text-sm text-foreground whitespace-pre-wrap cursor-pointer hover:bg-muted/30 rounded-md p-2 -m-2 transition-colors"
                        onClick={() => setIsEditingBody(true)}
                        dangerouslySetInnerHTML={{ __html: highlightTokens(email.body) }}
                    />
                )}
            </div>
        </div>
    )
}
