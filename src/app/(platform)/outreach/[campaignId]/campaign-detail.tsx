'use client'

/**
 * @file campaign-detail.tsx — Campaign detail view with 3 tabs.
 *
 * @description Header with inline-editable name, status dropdown, and stats.
 * Three tabs: Contacts (default), Emails, Settings.
 */

import { useState, useCallback, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Users, Mail, Settings, BookOpen } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { updateCampaign, getContacts, getEmails } from '@/actions/outreach'
import { ContactsTab } from './contacts-tab'
import { EmailsTab } from './emails-tab'
import { SettingsTab } from './settings-tab'
import { KnowledgeTab } from './knowledge-tab'
import { CAMPAIGN_STATUS_MAP } from '@/types/outreach'
import type { Campaign, CampaignStatus, Contact, OutreachEmail, OutreachKBEntry } from '@/types/outreach'
import { toast } from 'sonner'
import { useRegisterScreenContext } from '@/contexts/screen-context'
import { AskSpecialistButton } from '@/components/specialists/ask-specialist-button'

interface CampaignDetailProps {
    campaign: Campaign
    initialContacts: Contact[]
    initialEmails: OutreachEmail[]
    initialKnowledgeBase: OutreachKBEntry[]
    foundryId: string
    userId: string
}

export function CampaignDetail({
    campaign: initialCampaign,
    initialContacts,
    initialEmails,
    initialKnowledgeBase,
    foundryId,
    userId,
}: CampaignDetailProps) {
    const router = useRouter()
    const [campaign, setCampaign] = useState(initialCampaign)
    const [contacts, setContacts] = useState(initialContacts)
    const [emails, setEmails] = useState(initialEmails)
    const [isEditingName, setIsEditingName] = useState(false)
    const [editName, setEditName] = useState(campaign.name)
    const [isPending, startTransition] = useTransition()
    const [activeTab, setActiveTab] = useState('contacts')

    useRegisterScreenContext(useMemo(() => ({
        pageTitle: `Campaign: ${campaign.name}`,
        summary: `Managing outreach campaign "${campaign.name}" with ${contacts.length} contacts and ${emails.length} emails. Status: ${campaign.status}. Tone: ${campaign.tone}.`,
        entities: contacts.slice(0, 10).map(c => ({
            type: 'contact' as const,
            title: `${c.first_name} ${c.last_name}`,
            status: c.status,
        })),
    }), [campaign, contacts, emails]))

    const refreshContacts = useCallback(async () => {
        const result = await getContacts(campaign.id)
        if (result.data) setContacts(result.data)
    }, [campaign.id])

    const refreshEmails = useCallback(async () => {
        const result = await getEmails(campaign.id)
        if (result.data) setEmails(result.data)
    }, [campaign.id])

    const refreshAll = useCallback(async () => {
        await Promise.all([refreshContacts(), refreshEmails()])
    }, [refreshContacts, refreshEmails])

    const handleNameSave = async () => {
        if (editName.trim() && editName.trim() !== campaign.name) {
            const result = await updateCampaign(campaign.id, { name: editName.trim() })
            if (result.success) {
                setCampaign(prev => ({ ...prev, name: editName.trim() }))
                toast.success('Campaign name updated')
            }
        }
        setIsEditingName(false)
    }

    const handleStatusChange = async (status: string) => {
        const result = await updateCampaign(campaign.id, { status: status as CampaignStatus })
        if (result.success) {
            setCampaign(prev => ({ ...prev, status: status as CampaignStatus }))
            toast.success('Status updated')
        }
    }

    const statusMeta = CAMPAIGN_STATUS_MAP[campaign.status]
    const contactCount = contacts.length
    const sequencedCount = contacts.filter(c => ['sequenced', 'contacted', 'replied'].includes(c.status)).length
    const emailCount = emails.length

    return (
        <div className="space-y-6">
            {/* Back link */}
            <Link
                href="/outreach"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
                <ChevronLeft className="h-4 w-4" />
                All Campaigns
            </Link>

            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div className="space-y-2 min-w-0 flex-1">
                    {isEditingName ? (
                        <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onBlur={handleNameSave}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleNameSave()
                                if (e.key === 'Escape') {
                                    setEditName(campaign.name)
                                    setIsEditingName(false)
                                }
                            }}
                            className="text-2xl font-display font-bold text-foreground bg-transparent border-b-2 border-international-orange outline-none w-full"
                            autoFocus
                        />
                    ) : (
                        <h1
                            className="text-2xl font-display font-bold text-foreground cursor-pointer hover:text-international-orange transition-colors"
                            onClick={() => setIsEditingName(true)}
                            title="Click to edit"
                        >
                            {campaign.name}
                        </h1>
                    )}
                    <div className="flex items-center gap-3 flex-wrap">
                        <Select value={campaign.status} onValueChange={handleStatusChange}>
                            <SelectTrigger className="w-[140px] h-8">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.entries(CAMPAIGN_STATUS_MAP).map(([key, meta]) => (
                                    <SelectItem key={key} value={key}>
                                        {meta.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <span className="text-sm text-muted-foreground">
                            {contactCount} contacts
                        </span>
                        <span className="text-sm text-muted-foreground">
                            {sequencedCount} sequenced
                        </span>
                        <span className="text-sm text-muted-foreground">
                            {emailCount} emails
                        </span>
                        <AskSpecialistButton
                            context={{
                                type: 'general',
                                title: campaign.name,
                                description: `Outreach campaign: ${campaign.icp_description || ''}`,
                                metadata: {
                                    status: campaign.status,
                                    notes: `Tone: ${campaign.tone}, Contacts: ${contacts.length}, Emails: ${emails.length}`,
                                },
                            }}
                            specialistId="sales-lead"
                            specialistName="Sal"
                            variant="chip"
                            label="Ask Sal"
                        />
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                    <TabsTrigger value="contacts" className="gap-2">
                        <Users className="h-4 w-4" />
                        Contacts
                    </TabsTrigger>
                    <TabsTrigger value="emails" className="gap-2">
                        <Mail className="h-4 w-4" />
                        Emails
                    </TabsTrigger>
                    <TabsTrigger value="knowledge" className="gap-2">
                        <BookOpen className="h-4 w-4" />
                        Knowledge
                    </TabsTrigger>
                    <TabsTrigger value="settings" className="gap-2">
                        <Settings className="h-4 w-4" />
                        Settings
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="contacts">
                    <ContactsTab
                        campaign={campaign}
                        contacts={contacts}
                        onRefresh={refreshAll}
                        onSwitchToEmails={() => setActiveTab('emails')}
                    />
                </TabsContent>

                <TabsContent value="emails">
                    <EmailsTab
                        campaign={campaign}
                        contacts={contacts}
                        emails={emails}
                        onRefresh={refreshEmails}
                    />
                </TabsContent>

                <TabsContent value="knowledge">
                    <KnowledgeTab initialKnowledgeBase={initialKnowledgeBase} />
                </TabsContent>

                <TabsContent value="settings">
                    <SettingsTab
                        campaign={campaign}
                        onUpdate={(updates) => {
                            setCampaign(prev => ({ ...prev, ...updates }))
                        }}
                    />
                </TabsContent>
            </Tabs>
        </div>
    )
}
