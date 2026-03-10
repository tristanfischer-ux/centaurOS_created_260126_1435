'use client'

import { useState, useEffect } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Loader2, Bookmark } from 'lucide-react'
import { toast } from 'sonner'
import { saveSearchQuery } from '@/actions/search'

interface SaveSearchDialogProps {
    open: boolean
    onClose: () => void
    /** Current search query to save */
    searchQuery: string
    /** Current applied filters to save */
    filters: Record<string, unknown>
}

/**
 * Dialog for saving a marketplace search with optional alert frequency.
 *
 * @description Lets users name and save their current search/filter combo.
 * Optionally enables alerts at a chosen frequency. Uses existing
 * `saveSearchQuery()` server action and `saved_searches` table.
 */
export function SaveSearchDialog({ open, onClose, searchQuery, filters }: SaveSearchDialogProps) {
    const [name, setName] = useState('')
    const [alertFrequency, setAlertFrequency] = useState<'daily' | 'weekly' | 'instant'>('daily')
    const [enableAlert, setEnableAlert] = useState(false)
    const [isSaving, setIsSaving] = useState(false)

    // Reset form state when dialog opens
    useEffect(() => {
        if (open) {
            setName('')
            setEnableAlert(false)
            setAlertFrequency('daily')
        }
    }, [open])

    const handleSave = async () => {
        if (!name.trim()) {
            toast.error('Please enter a name for this search')
            return
        }
        setIsSaving(true)
        try {
            const result = await saveSearchQuery(
                name.trim(),
                searchQuery,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                filters as any,
                enableAlert,
                alertFrequency,
            )
            if (result.success) {
                toast.success('Search saved')
                setName('')
                onClose()
            } else {
                toast.error(result.error || 'Failed to save search')
            }
        } catch {
            toast.error('Failed to save search')
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={() => onClose()}>
            <DialogContent size="sm" className="space-y-4">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Bookmark className="w-5 h-5 text-international-orange" />
                        Save Search
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <label htmlFor="search-name" className="text-sm font-medium text-foreground">
                            Name
                        </label>
                        <Input
                            id="search-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. CTO search, Quality engineers..."
                            maxLength={100}
                            aria-required
                        />
                    </div>

                    <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                                type="checkbox"
                                checked={enableAlert}
                                onChange={(e) => setEnableAlert(e.target.checked)}
                                className="rounded border-input"
                            />
                            <span className="text-foreground">Alert me about new matches</span>
                        </label>
                    </div>

                    {enableAlert && (
                        <div className="space-y-2">
                            <label htmlFor="alert-freq" className="text-sm font-medium text-foreground">
                                Alert frequency
                            </label>
                            <Select value={alertFrequency} onValueChange={(v) => setAlertFrequency(v as 'daily' | 'weekly' | 'instant')}>
                                <SelectTrigger id="alert-freq">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="instant">Instant</SelectItem>
                                    <SelectItem value="daily">Daily digest</SelectItem>
                                    <SelectItem value="weekly">Weekly digest</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {searchQuery && (
                        <p className="text-xs text-muted-foreground">
                            Saving search: &quot;{searchQuery}&quot;
                        </p>
                    )}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="ghost" onClick={onClose} disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={isSaving || !name.trim()}>
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        Save Search
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
