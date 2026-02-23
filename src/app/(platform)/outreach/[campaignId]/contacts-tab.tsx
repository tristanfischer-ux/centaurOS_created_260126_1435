'use client'

/**
 * @file contacts-tab.tsx — Contact management table with bulk actions.
 */

import { useState, useMemo, useTransition } from 'react'
import {
    Plus,
    Upload,
    Wand2,
    Trash2,
    Search,
    ArrowUpDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { StatusBadge } from '@/components/ui/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { AddContactDialog } from './add-contact-dialog'
import { ImportContactsDialog } from './import-contacts-dialog'
import { GenerateSequencesDialog } from './generate-sequences-dialog'
import { deleteContacts, updateContactStatus } from '@/actions/outreach'
import { CONTACT_STATUS_MAP } from '@/types/outreach'
import type { Campaign, Contact, ContactStatus } from '@/types/outreach'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface ContactsTabProps {
    campaign: Campaign
    contacts: Contact[]
    onRefresh: () => Promise<void>
}

type SortKey = 'score' | 'name' | 'company' | 'status'
type SortDir = 'asc' | 'desc'

function getScoreColor(score: number): string {
    if (score >= 7) return 'text-success font-bold'
    if (score >= 4) return 'text-warning font-bold'
    return 'text-destructive font-bold'
}

export function ContactsTab({ campaign, contacts, onRefresh }: ContactsTabProps) {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [search, setSearch] = useState('')
    const [sortKey, setSortKey] = useState<SortKey>('score')
    const [sortDir, setSortDir] = useState<SortDir>('desc')
    const [isAddOpen, setIsAddOpen] = useState(false)
    const [isImportOpen, setIsImportOpen] = useState(false)
    const [isGenerateOpen, setIsGenerateOpen] = useState(false)
    const [isPending, startTransition] = useTransition()

    // Filter and sort contacts
    const filteredContacts = useMemo(() => {
        let result = contacts

        if (search) {
            const q = search.toLowerCase()
            result = result.filter(c =>
                `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) ||
                c.company_name.toLowerCase().includes(q) ||
                (c.email || '').toLowerCase().includes(q) ||
                (c.job_title || '').toLowerCase().includes(q)
            )
        }

        result = [...result].sort((a, b) => {
            let cmp = 0
            switch (sortKey) {
                case 'score': cmp = (a.score ?? 0) - (b.score ?? 0); break
                case 'name': cmp = `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`); break
                case 'company': cmp = a.company_name.localeCompare(b.company_name); break
                case 'status': cmp = a.status.localeCompare(b.status); break
            }
            return sortDir === 'asc' ? cmp : -cmp
        })

        return result
    }, [contacts, search, sortKey, sortDir])

    const allSelected = filteredContacts.length > 0 && selectedIds.size === filteredContacts.length
    const someSelected = selectedIds.size > 0

    const toggleAll = () => {
        if (allSelected) {
            setSelectedIds(new Set())
        } else {
            setSelectedIds(new Set(filteredContacts.map(c => c.id)))
        }
    }

    const toggleOne = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const toggleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
        } else {
            setSortKey(key)
            setSortDir('desc')
        }
    }

    const handleBulkDelete = async () => {
        if (!someSelected) return
        startTransition(async () => {
            const result = await deleteContacts(Array.from(selectedIds), campaign.id)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success(`${selectedIds.size} contact(s) deleted`)
                setSelectedIds(new Set())
                await onRefresh()
            }
        })
    }

    const handleGenerate = () => {
        if (someSelected) {
            setIsGenerateOpen(true)
        } else {
            // Select all new/approved contacts
            const eligible = contacts.filter(c => ['new', 'researched', 'scored', 'approved'].includes(c.status))
            if (eligible.length === 0) {
                toast.error('No eligible contacts to generate sequences for')
                return
            }
            setSelectedIds(new Set(eligible.map(c => c.id)))
            setIsGenerateOpen(true)
        }
    }

    return (
        <div className="space-y-4 mt-4">
            {/* Toolbar */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-sm">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search contacts..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9"
                        />
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {someSelected && (
                        <>
                            <Button
                                variant="default"
                                size="sm"
                                onClick={handleGenerate}
                                disabled={isPending}
                            >
                                <Wand2 className="h-4 w-4 mr-1" />
                                Generate Sequences ({selectedIds.size})
                            </Button>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={handleBulkDelete}
                                disabled={isPending}
                            >
                                <Trash2 className="h-4 w-4 mr-1" />
                                Delete ({selectedIds.size})
                            </Button>
                        </>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setIsImportOpen(true)}>
                        <Upload className="h-4 w-4 mr-1" />
                        Import CSV
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setIsAddOpen(true)}>
                        <Plus className="h-4 w-4 mr-1" />
                        Add
                    </Button>
                    {!someSelected && contacts.length > 0 && (
                        <Button
                            variant="default"
                            size="sm"
                            onClick={handleGenerate}
                        >
                            <Wand2 className="h-4 w-4 mr-1" />
                            Generate All
                        </Button>
                    )}
                </div>
            </div>

            {/* Contact table */}
            {contacts.length === 0 ? (
                <EmptyState
                    icon={<Plus className="h-12 w-12" />}
                    title="No contacts yet"
                    description="Add contacts manually or paste a CSV from LinkedIn Sales Navigator."
                    action={
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setIsImportOpen(true)}>
                                <Upload className="h-4 w-4 mr-2" />
                                Import CSV
                            </Button>
                            <Button onClick={() => setIsAddOpen(true)}>
                                <Plus className="h-4 w-4 mr-2" />
                                Add Contact
                            </Button>
                        </div>
                    }
                />
            ) : (
                <div className="border border-border rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-muted/50 border-b border-border">
                                    <th className="w-10 px-3 py-3">
                                        <Checkbox
                                            checked={allSelected}
                                            onCheckedChange={toggleAll}
                                            aria-label="Select all"
                                        />
                                    </th>
                                    <th className="text-left px-3 py-3 font-medium text-muted-foreground cursor-pointer" onClick={() => toggleSort('name')}>
                                        <span className="flex items-center gap-1">Name <ArrowUpDown className="h-3 w-3" /></span>
                                    </th>
                                    <th className="text-left px-3 py-3 font-medium text-muted-foreground cursor-pointer" onClick={() => toggleSort('company')}>
                                        <span className="flex items-center gap-1">Company <ArrowUpDown className="h-3 w-3" /></span>
                                    </th>
                                    <th className="text-left px-3 py-3 font-medium text-muted-foreground">Title</th>
                                    <th className="text-center px-3 py-3 font-medium text-muted-foreground cursor-pointer" onClick={() => toggleSort('score')}>
                                        <span className="flex items-center justify-center gap-1">Score <ArrowUpDown className="h-3 w-3" /></span>
                                    </th>
                                    <th className="text-left px-3 py-3 font-medium text-muted-foreground cursor-pointer" onClick={() => toggleSort('status')}>
                                        <span className="flex items-center gap-1">Status <ArrowUpDown className="h-3 w-3" /></span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredContacts.map(contact => {
                                    const statusMeta = CONTACT_STATUS_MAP[contact.status]
                                    return (
                                        <tr
                                            key={contact.id}
                                            className={cn(
                                                "border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors",
                                                selectedIds.has(contact.id) && "bg-international-orange/5"
                                            )}
                                        >
                                            <td className="px-3 py-3">
                                                <Checkbox
                                                    checked={selectedIds.has(contact.id)}
                                                    onCheckedChange={() => toggleOne(contact.id)}
                                                    aria-label={`Select ${contact.first_name}`}
                                                />
                                            </td>
                                            <td className="px-3 py-3">
                                                <div className="font-medium text-foreground">
                                                    {contact.first_name} {contact.last_name}
                                                </div>
                                                {contact.email && (
                                                    <div className="text-xs text-muted-foreground">{contact.email}</div>
                                                )}
                                            </td>
                                            <td className="px-3 py-3 text-foreground">{contact.company_name}</td>
                                            <td className="px-3 py-3 text-muted-foreground">{contact.job_title}</td>
                                            <td className="px-3 py-3 text-center">
                                                <span className={getScoreColor(contact.score ?? 0)}>
                                                    {contact.score ?? 0}
                                                </span>
                                            </td>
                                            <td className="px-3 py-3">
                                                <StatusBadge status={statusMeta.variant}>
                                                    {statusMeta.label}
                                                </StatusBadge>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Dialogs */}
            <AddContactDialog
                open={isAddOpen}
                onOpenChange={setIsAddOpen}
                campaignId={campaign.id}
                onAdded={onRefresh}
            />
            <ImportContactsDialog
                open={isImportOpen}
                onOpenChange={setIsImportOpen}
                campaignId={campaign.id}
                onImported={onRefresh}
            />
            <GenerateSequencesDialog
                open={isGenerateOpen}
                onOpenChange={setIsGenerateOpen}
                campaignId={campaign.id}
                contactIds={Array.from(selectedIds)}
                campaign={campaign}
                onGenerated={async () => {
                    setSelectedIds(new Set())
                    await onRefresh()
                }}
            />
        </div>
    )
}
