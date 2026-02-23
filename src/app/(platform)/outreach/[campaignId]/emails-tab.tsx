'use client'

/**
 * @file emails-tab.tsx — Email review, editing, and copy interface.
 *
 * @description Emails grouped by contact with collapsible sections.
 * Prominent copy buttons, inline editing, bulk approve.
 */

import { useState, useMemo, useTransition } from 'react'
import {
    ChevronDown,
    ChevronRight,
    Copy,
    CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { EmailCard } from './email-card'
import { approveEmails } from '@/actions/outreach'
import type { Campaign, Contact, OutreachEmail, ContactWithEmails } from '@/types/outreach'
import { toast } from 'sonner'

interface EmailsTabProps {
    campaign: Campaign
    contacts: Contact[]
    emails: OutreachEmail[]
    onRefresh: () => Promise<void>
}

export function EmailsTab({ campaign, contacts, emails, onRefresh }: EmailsTabProps) {
    const [expandedContacts, setExpandedContacts] = useState<Set<string>>(new Set())
    const [isPending, startTransition] = useTransition()

    // Group emails by contact
    const groupedEmails: ContactWithEmails[] = useMemo(() => {
        const contactMap = new Map(contacts.map(c => [c.id, c]))
        const groups = new Map<string, OutreachEmail[]>()

        for (const email of emails) {
            if (!groups.has(email.contact_id)) {
                groups.set(email.contact_id, [])
            }
            groups.get(email.contact_id)!.push(email)
        }

        return Array.from(groups.entries())
            .map(([contactId, contactEmails]) => ({
                contact: contactMap.get(contactId)!,
                emails: contactEmails.sort((a, b) => a.sequence_position - b.sequence_position),
            }))
            .filter(g => g.contact)
    }, [contacts, emails])

    const toggleContact = (contactId: string) => {
        setExpandedContacts(prev => {
            const next = new Set(prev)
            if (next.has(contactId)) next.delete(contactId)
            else next.add(contactId)
            return next
        })
    }

    const expandAll = () => {
        setExpandedContacts(new Set(groupedEmails.map(g => g.contact.id)))
    }

    const collapseAll = () => {
        setExpandedContacts(new Set())
    }

    const copyAllForContact = async (contactEmails: OutreachEmail[], contactName: string) => {
        const text = contactEmails.map(e => (
            `--- Email ${e.sequence_position}: ${e.sequence_label} ---\nSubject: ${e.subject}\n\n${e.body}`
        )).join('\n\n')

        await navigator.clipboard.writeText(text)
        toast.success(`Copied ${contactEmails.length} emails for ${contactName}`)
    }

    const handleBulkApprove = () => {
        const draftIds = emails.filter(e => e.status === 'draft').map(e => e.id)
        if (draftIds.length === 0) {
            toast.error('No draft emails to approve')
            return
        }
        startTransition(async () => {
            const result = await approveEmails(draftIds)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success(`${draftIds.length} emails approved`)
                await onRefresh()
            }
        })
    }

    const draftCount = emails.filter(e => e.status === 'draft').length

    if (emails.length === 0) {
        return (
            <div className="mt-4">
                <EmptyState
                    icon={<Copy className="h-12 w-12" />}
                    title="No emails yet"
                    description="Generate email sequences from the Contacts tab, then review and copy them here."
                />
            </div>
        )
    }

    return (
        <div className="space-y-4 mt-4">
            {/* Toolbar */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={expandAll}>Expand All</Button>
                    <Button variant="ghost" size="sm" onClick={collapseAll}>Collapse All</Button>
                </div>
                {draftCount > 0 && (
                    <Button
                        size="sm"
                        onClick={handleBulkApprove}
                        disabled={isPending}
                    >
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        Approve All Drafts ({draftCount})
                    </Button>
                )}
            </div>

            {/* Email groups */}
            <div className="space-y-3">
                {groupedEmails.map(({ contact, emails: contactEmails }) => {
                    const isExpanded = expandedContacts.has(contact.id)
                    const contactName = `${contact.first_name} ${contact.last_name}`.trim()

                    return (
                        <div key={contact.id} className="border border-border rounded-lg overflow-hidden">
                            {/* Contact header */}
                            <button
                                onClick={() => toggleContact(contact.id)}
                                className="flex items-center justify-between w-full px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                            >
                                <div className="flex items-center gap-3">
                                    {isExpanded ? (
                                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                    ) : (
                                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                    )}
                                    <div>
                                        <span className="font-medium text-foreground">{contactName}</span>
                                        <span className="ml-2 text-sm text-muted-foreground">
                                            {contact.company_name} · {contactEmails.length} emails
                                        </span>
                                    </div>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        copyAllForContact(contactEmails, contactName)
                                    }}
                                >
                                    <Copy className="h-3.5 w-3.5 mr-1" />
                                    Copy All
                                </Button>
                            </button>

                            {/* Email cards */}
                            {isExpanded && (
                                <div className="divide-y divide-border">
                                    {contactEmails.map(email => (
                                        <EmailCard
                                            key={email.id}
                                            email={email}
                                            onRefresh={onRefresh}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
