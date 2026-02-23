'use client'

/**
 * @file knowledge-tab.tsx — Card grid of KB entries with add/edit/delete.
 */

import { useState, useCallback, useTransition } from 'react'
import { Plus, Pencil, Trash2, BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { AddKnowledgeDialog } from './add-knowledge-dialog'
import { deleteKnowledgeEntry, getKnowledgeBase } from '@/actions/outreach'
import type { OutreachKBEntry } from '@/types/outreach'
import { toast } from 'sonner'

const CATEGORY_LABELS: Record<string, string> = {
    product: 'Product',
    case_study: 'Case Study',
    value_prop: 'Value Prop',
    competitor_intel: 'Competitor Intel',
    icp_definition: 'ICP Definition',
}

interface KnowledgeTabProps {
    initialKnowledgeBase: OutreachKBEntry[]
}

export function KnowledgeTab({ initialKnowledgeBase }: KnowledgeTabProps) {
    const [entries, setEntries] = useState(initialKnowledgeBase)
    const [isAddOpen, setIsAddOpen] = useState(false)
    const [editEntry, setEditEntry] = useState<OutreachKBEntry | null>(null)
    const [isPending, startTransition] = useTransition()

    const refresh = useCallback(async () => {
        const result = await getKnowledgeBase()
        if (result.data) setEntries(result.data)
    }, [])

    const handleDelete = (entryId: string) => {
        startTransition(async () => {
            const result = await deleteKnowledgeEntry(entryId)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Entry deleted')
                await refresh()
            }
        })
    }

    const handleEdit = (entry: OutreachKBEntry) => {
        setEditEntry(entry)
        setIsAddOpen(true)
    }

    const handleAddNew = () => {
        setEditEntry(null)
        setIsAddOpen(true)
    }

    return (
        <div className="space-y-4 mt-4">
            {/* Toolbar */}
            <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                    {entries.length} {entries.length === 1 ? 'entry' : 'entries'} — Sal uses these when generating emails.
                </p>
                <Button size="sm" onClick={handleAddNew}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Entry
                </Button>
            </div>

            {/* Grid or empty state */}
            {entries.length === 0 ? (
                <EmptyState
                    icon={<BookOpen className="h-12 w-12" />}
                    title="No knowledge base entries"
                    description="Add product details, case studies, competitor intel, and more. Sal will use these to write better emails."
                    action={
                        <Button onClick={handleAddNew}>
                            <Plus className="h-4 w-4 mr-2" />
                            Add First Entry
                        </Button>
                    }
                />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {entries.map(entry => (
                        <Card key={entry.id}>
                            <CardHeader className="pb-2">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="space-y-1 min-w-0">
                                        <h3 className="text-sm font-medium text-foreground truncate">
                                            {entry.title}
                                        </h3>
                                        <Badge variant="secondary">
                                            {CATEGORY_LABELS[entry.category] ?? entry.category}
                                        </Badge>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 w-7 p-0"
                                            onClick={() => handleEdit(entry)}
                                        >
                                            <Pencil className="h-3.5 w-3.5" />
                                            <span className="sr-only">Edit</span>
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                            onClick={() => handleDelete(entry.id)}
                                            disabled={isPending}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                            <span className="sr-only">Delete</span>
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <p className="text-xs text-muted-foreground line-clamp-4 whitespace-pre-wrap">
                                    {entry.content}
                                </p>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Dialog */}
            <AddKnowledgeDialog
                open={isAddOpen}
                onOpenChange={(open) => {
                    setIsAddOpen(open)
                    if (!open) setEditEntry(null)
                }}
                onSaved={refresh}
                entry={editEntry}
            />
        </div>
    )
}
