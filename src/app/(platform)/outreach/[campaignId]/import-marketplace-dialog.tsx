'use client'

/**
 * @file import-marketplace-dialog.tsx — Import enriched marketplace listings
 * as outreach contacts for a campaign.
 *
 * @description Shows a filterable table of marketplace listings that have
 * contact emails and haven't been imported yet. Users select which ones
 * to import into the current campaign.
 */

import { useState, useEffect, useTransition, useCallback } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { StatusBadge } from '@/components/ui/status-badge'
import { Loader2, Search, Building } from 'lucide-react'
import { getListingsForEnrichment } from '@/actions/listing-enrichment'
import { importListingsAsContacts } from '@/actions/outreach'
import type { EnrichmentListing } from '@/actions/listing-enrichment'
import { toast } from 'sonner'

interface ImportMarketplaceDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    campaignId: string
    onImported: () => Promise<void>
}

export function ImportMarketplaceDialog({ open, onOpenChange, campaignId, onImported }: ImportMarketplaceDialogProps) {
    const [isPending, startTransition] = useTransition()
    const [listings, setListings] = useState<EnrichmentListing[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

    const loadListings = useCallback(async () => {
        setIsLoading(true)
        // INTENT: Only show listings that have email and are 'ready' (not yet imported)
        const result = await getListingsForEnrichment({
            hasEmail: true,
            outreachStatus: 'ready',
            search: search || undefined,
            limit: 200,
        })
        if (result.data) {
            setListings(result.data.listings)
        }
        setIsLoading(false)
    }, [search])

    useEffect(() => {
        if (open) {
            loadListings()
            setSelectedIds(new Set())
        }
    }, [open, loadListings])

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const toggleAll = () => {
        if (selectedIds.size === listings.length) {
            setSelectedIds(new Set())
        } else {
            setSelectedIds(new Set(listings.map(l => l.id)))
        }
    }

    const handleImport = () => {
        if (selectedIds.size === 0) return

        startTransition(async () => {
            const result = await importListingsAsContacts(campaignId, Array.from(selectedIds))
            if (result.error) {
                toast.error(result.error)
            } else {
                const { imported, skipped } = result.data!
                toast.success(`${imported} contacts imported`)
                if (skipped > 0) {
                    toast.info(`${skipped} contacts skipped (already in campaign)`)
                }
                setSelectedIds(new Set())
                onOpenChange(false)
                await onImported()
            }
        })
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent size="lg" aria-describedby={undefined}>
                <DialogHeader>
                    <DialogTitle>Import from Marketplace</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        Select enriched marketplace listings to import as campaign contacts.
                        Only listings with emails and &quot;Ready&quot; status are shown.
                    </p>

                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search companies..."
                            className="pl-9 h-9"
                        />
                    </div>

                    <div className="border border-border rounded-lg overflow-hidden max-h-[400px] overflow-y-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-muted/50 border-b border-border sticky top-0">
                                    <th className="px-3 py-2 text-left w-10">
                                        <Checkbox
                                            checked={listings.length > 0 && selectedIds.size === listings.length}
                                            onCheckedChange={toggleAll}
                                            aria-label="Select all"
                                        />
                                    </th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Company</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Contact</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Email</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Title</th>
                                </tr>
                            </thead>
                            <tbody>
                                {isLoading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <tr key={i} className="border-b border-border">
                                            <td colSpan={5} className="px-3 py-3">
                                                <div className="h-4 bg-muted animate-pulse rounded" />
                                            </td>
                                        </tr>
                                    ))
                                ) : listings.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-3 py-8 text-center text-sm text-muted-foreground">
                                            No ready listings with emails found.
                                            <br />
                                            <span className="text-xs">Enrich contacts first at /outreach/enrichment</span>
                                        </td>
                                    </tr>
                                ) : (
                                    listings.map(listing => (
                                        <tr
                                            key={listing.id}
                                            className="border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer"
                                            onClick={() => toggleSelect(listing.id)}
                                        >
                                            <td className="px-3 py-2">
                                                <Checkbox
                                                    checked={selectedIds.has(listing.id)}
                                                    onCheckedChange={() => toggleSelect(listing.id)}
                                                    aria-label={`Select ${listing.title}`}
                                                />
                                            </td>
                                            <td className="px-3 py-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="flex items-center justify-center h-6 w-6 rounded bg-muted shrink-0">
                                                        <Building className="h-3 w-3 text-muted-foreground" />
                                                    </div>
                                                    <span className="text-sm font-medium text-foreground truncate max-w-[180px]" title={listing.title}>
                                                        {listing.title}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-3 py-2 text-sm text-foreground">
                                                {listing.contact_name || '—'}
                                            </td>
                                            <td className="px-3 py-2 text-sm text-muted-foreground">
                                                {listing.contact_email}
                                            </td>
                                            <td className="px-3 py-2 text-sm text-muted-foreground">
                                                {listing.contact_title || '—'}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {selectedIds.size > 0 && (
                        <p className="text-sm text-success font-medium">
                            {selectedIds.size} listing{selectedIds.size > 1 ? 's' : ''} selected for import
                        </p>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                        Cancel
                    </Button>
                    <Button onClick={handleImport} disabled={isPending || selectedIds.size === 0}>
                        {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Import {selectedIds.size} Contact{selectedIds.size !== 1 ? 's' : ''}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
