'use client'

/**
 * @file add-knowledge-dialog.tsx — Form dialog for adding/editing KB entries.
 */

import { useState, useTransition, useEffect } from 'react'
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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import { addKnowledgeEntry, updateKnowledgeEntry } from '@/actions/outreach'
import type { OutreachKBEntry } from '@/types/outreach'
import { toast } from 'sonner'

const KB_CATEGORIES = [
    { value: 'product', label: 'Product' },
    { value: 'case_study', label: 'Case Study' },
    { value: 'value_prop', label: 'Value Prop' },
    { value: 'competitor_intel', label: 'Competitor Intel' },
    { value: 'icp_definition', label: 'ICP Definition' },
]

interface AddKnowledgeDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSaved: () => Promise<void>
    /** If provided, dialog is in edit mode */
    entry?: OutreachKBEntry | null
}

export function AddKnowledgeDialog({ open, onOpenChange, onSaved, entry }: AddKnowledgeDialogProps) {
    const [isPending, startTransition] = useTransition()
    const [title, setTitle] = useState('')
    const [category, setCategory] = useState('product')
    const [content, setContent] = useState('')

    const isEditing = !!entry

    useEffect(() => {
        if (entry) {
            setTitle(entry.title)
            setCategory(entry.category)
            setContent(entry.content)
        } else {
            setTitle('')
            setCategory('product')
            setContent('')
        }
    }, [entry, open])

    const handleSubmit = () => {
        if (!title.trim() || !content.trim()) return

        startTransition(async () => {
            if (isEditing && entry) {
                const result = await updateKnowledgeEntry(entry.id, {
                    title: title.trim(),
                    category,
                    content: content.trim(),
                })
                if (result.error) {
                    toast.error(result.error)
                    return
                }
                toast.success('Entry updated')
            } else {
                const result = await addKnowledgeEntry({
                    title: title.trim(),
                    category,
                    content: content.trim(),
                })
                if (result.error) {
                    toast.error(result.error)
                    return
                }
                toast.success('Entry added')
            }
            await onSaved()
            onOpenChange(false)
        })
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent size="md" aria-describedby={undefined}>
                <DialogHeader>
                    <DialogTitle>{isEditing ? 'Edit Entry' : 'Add Knowledge Entry'}</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label htmlFor="kb-title">Title</Label>
                        <Input
                            id="kb-title"
                            placeholder="e.g., Customer Success Story — Acme Corp"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            aria-required
                            autoFocus
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="kb-category">Category</Label>
                        <Select value={category} onValueChange={setCategory}>
                            <SelectTrigger id="kb-category">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {KB_CATEGORIES.map(cat => (
                                    <SelectItem key={cat.value} value={cat.value}>
                                        {cat.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="kb-content">Content</Label>
                        <Textarea
                            id="kb-content"
                            placeholder="Paste product details, case study text, competitor analysis, or any context Sal should use when generating emails..."
                            rows={8}
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            aria-required
                        />
                        <p className="text-xs text-muted-foreground text-right">
                            {content.length}/5000
                        </p>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={isPending || !title.trim() || !content.trim()}
                    >
                        {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        {isEditing ? 'Save Changes' : 'Add Entry'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
