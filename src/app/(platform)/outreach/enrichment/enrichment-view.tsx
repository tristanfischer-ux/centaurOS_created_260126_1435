'use client'

/**
 * @file enrichment-view.tsx — Contact enrichment table with inline editing,
 * CSV export/import, bulk actions, and filtering.
 *
 * @description Main UI for the enrichment workflow. Users filter listings by
 * category/subcategory, edit contact fields inline, bulk-update statuses,
 * and export/import CSV for external research.
 */

import { useState, useEffect, useCallback, useTransition, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
    ArrowLeft,
    Search,
    Download,
    Upload,
    ChevronLeft,
    ChevronRight,
    Building,
    ExternalLink,
    CheckCircle2,
    XCircle,
    Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    getListingsForEnrichment,
    getSubcategories,
    getEnrichmentStats,
    updateListingContact,
    updateListingOutreachStatus,
    exportListingsForResearch,
    bulkUpdateListingContacts,
} from '@/actions/listing-enrichment'
import type { EnrichmentListing, EnrichmentFilters, EnrichmentStats } from '@/actions/listing-enrichment'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { ImportEnrichmentDialog } from './import-enrichment-dialog'

// ─── Status display config ──────────────────────────────────────────────────

const OUTREACH_STATUS_MAP: Record<string, { label: string; variant: 'pending' | 'info' | 'active' | 'warning' | 'success' | 'error' }> = {
    not_started: { label: 'Not Started', variant: 'pending' },
    enriching: { label: 'Enriching', variant: 'info' },
    ready: { label: 'Ready', variant: 'active' },
    imported: { label: 'Imported', variant: 'info' },
    contacted: { label: 'Contacted', variant: 'warning' },
    replied: { label: 'Replied', variant: 'success' },
    claimed: { label: 'Claimed', variant: 'success' },
    onboarded: { label: 'Onboarded', variant: 'success' },
    not_relevant: { label: 'Not Relevant', variant: 'error' },
}

// ─── Inline edit cell ────────────────────────────────────────────────────────

function InlineEditCell({
    value,
    placeholder,
    onSave,
    className,
}: {
    value: string | null
    placeholder: string
    onSave: (val: string) => void
    className?: string
}) {
    const [isEditing, setIsEditing] = useState(false)
    const [draft, setDraft] = useState(value || '')
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus()
            inputRef.current.select()
        }
    }, [isEditing])

    const handleSave = () => {
        setIsEditing(false)
        if (draft !== (value || '')) {
            onSave(draft)
        }
    }

    if (isEditing) {
        return (
            <Input
                ref={inputRef}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onBlur={handleSave}
                onKeyDown={e => {
                    if (e.key === 'Enter') handleSave()
                    if (e.key === 'Escape') { setDraft(value || ''); setIsEditing(false) }
                }}
                className={cn('h-7 text-xs px-1.5', className)}
                placeholder={placeholder}
            />
        )
    }

    return (
        <button
            type="button"
            onClick={() => { setDraft(value || ''); setIsEditing(true) }}
            className={cn(
                'text-left text-xs px-1.5 py-1 rounded hover:bg-muted/50 transition-colors w-full truncate',
                value ? 'text-foreground' : 'text-muted-foreground italic',
                className
            )}
        >
            {value || placeholder}
        </button>
    )
}

// ─── Main component ──────────────────────────────────────────────────────────

interface EnrichmentViewProps {
    foundryId: string
}

export function EnrichmentView({ foundryId }: EnrichmentViewProps) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()

    // Data
    const [listings, setListings] = useState<EnrichmentListing[]>([])
    const [totalCount, setTotalCount] = useState(0)
    const [stats, setStats] = useState<EnrichmentStats | null>(null)
    const [subcategories, setSubcategories] = useState<string[]>([])
    const [isLoading, setIsLoading] = useState(true)

    // Filters
    const [search, setSearch] = useState('')
    const [category, setCategory] = useState<string>('all')
    const [subcategory, setSubcategory] = useState<string>('all')
    const [emailFilter, setEmailFilter] = useState<string>('all')
    const [statusFilter, setStatusFilter] = useState<string>('all')
    const [page, setPage] = useState(0)
    const PAGE_SIZE = 50

    // Selection
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

    // Dialogs
    const [isImportOpen, setIsImportOpen] = useState(false)

    // INTENT: Build filter object from UI state
    const filters: EnrichmentFilters = useMemo(() => ({
        category: category !== 'all' ? category as EnrichmentFilters['category'] : undefined,
        subcategory: subcategory !== 'all' ? subcategory : undefined,
        hasEmail: emailFilter === 'has_email' ? true : emailFilter === 'no_email' ? false : undefined,
        outreachStatus: statusFilter !== 'all' ? statusFilter : undefined,
        search: search || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
    }), [category, subcategory, emailFilter, statusFilter, search, page])

    // ─── Data loading ────────────────────────────────────────────────────────

    const loadListings = useCallback(async () => {
        startTransition(async () => {
            const result = await getListingsForEnrichment(filters)
            if (result.data) {
                setListings(result.data.listings)
                setTotalCount(result.data.total)
            }
            setIsLoading(false)
        })
    }, [filters])

    const loadStats = useCallback(async () => {
        const result = await getEnrichmentStats()
        if (result.data) setStats(result.data)
    }, [])

    const loadSubcategories = useCallback(async () => {
        const cat = category !== 'all' ? category as EnrichmentFilters['category'] : undefined
        const result = await getSubcategories(cat)
        if (result.data) setSubcategories(result.data)
    }, [category])

    useEffect(() => {
        loadListings()
    }, [loadListings])

    useEffect(() => {
        loadStats()
    }, [loadStats])

    useEffect(() => {
        loadSubcategories()
    }, [loadSubcategories])

    // Reset page when filters change
    useEffect(() => {
        setPage(0)
        setSelectedIds(new Set())
    }, [category, subcategory, emailFilter, statusFilter, search])

    // ─── Handlers ────────────────────────────────────────────────────────────

    const handleContactUpdate = async (listingId: string, field: string, value: string) => {
        const result = await updateListingContact(listingId, { [field]: value || null })
        if (result.error) {
            toast.error(result.error)
        } else {
            // INTENT: Update local state optimistically for snappy UX
            setListings(prev => prev.map(l =>
                l.id === listingId
                    ? {
                        ...l,
                        [field]: value || null,
                        ...(field === 'contact_email' && value && (!l.outreach_status || l.outreach_status === 'not_started' || l.outreach_status === 'enriching')
                            ? { outreach_status: 'ready' }
                            : {}),
                    }
                    : l
            ))
            loadStats()
        }
    }

    const handleBulkStatusUpdate = async (status: string) => {
        if (selectedIds.size === 0) return
        const result = await updateListingOutreachStatus(Array.from(selectedIds), status)
        if (result.error) {
            toast.error(result.error)
        } else {
            toast.success(`${selectedIds.size} listings updated to ${OUTREACH_STATUS_MAP[status]?.label || status}`)
            setSelectedIds(new Set())
            loadListings()
            loadStats()
        }
    }

    const handleExport = async () => {
        const result = await exportListingsForResearch(filters)
        if (result.error) {
            toast.error(result.error)
            return
        }
        if (!result.data) return

        const blob = new Blob([result.data], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `enrichment-export-${new Date().toISOString().split('T')[0]}.csv`
        a.click()
        URL.revokeObjectURL(url)
        toast.success('CSV exported')
    }

    const handleImportComplete = async () => {
        loadListings()
        loadStats()
    }

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const toggleSelectAll = () => {
        if (selectedIds.size === listings.length) {
            setSelectedIds(new Set())
        } else {
            setSelectedIds(new Set(listings.map(l => l.id)))
        }
    }

    const totalPages = Math.ceil(totalCount / PAGE_SIZE)

    const getWebsiteUrl = (listing: EnrichmentListing): string | null => {
        const attrs = listing.attributes as Record<string, unknown> | null
        return (attrs?.website_url as string) || null
    }

    // ─── Render ──────────────────────────────────────────────────────────────

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push('/outreach')}
                        className="h-8 w-8 p-0"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-display font-bold text-foreground">Contact Enrichment</h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            Add contact details to marketplace listings for outreach
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleExport}>
                        <Download className="h-4 w-4 mr-1.5" />
                        Export CSV
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setIsImportOpen(true)}>
                        <Upload className="h-4 w-4 mr-1.5" />
                        Import CSV
                    </Button>
                </div>
            </div>

            {/* Stats bar */}
            {stats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                    {[
                        { label: 'Total', value: stats.total, color: 'text-foreground' },
                        { label: 'Enriched', value: stats.enriched, color: 'text-info' },
                        { label: 'Ready', value: stats.ready, color: 'text-success' },
                        { label: 'Imported', value: stats.imported, color: 'text-info' },
                        { label: 'Contacted', value: stats.contacted, color: 'text-warning' },
                        { label: 'Replied', value: stats.replied, color: 'text-success' },
                        { label: 'Claimed', value: stats.claimed, color: 'text-success' },
                        { label: 'Not Relevant', value: stats.notRelevant, color: 'text-muted-foreground' },
                    ].map(stat => (
                        <Card key={stat.label}>
                            <CardContent className="p-3 text-center">
                                <p className={cn('text-lg font-bold', stat.color)}>{stat.value}</p>
                                <p className="text-xs text-muted-foreground">{stat.label}</p>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search companies..."
                        className="pl-9 h-9"
                    />
                </div>

                <Select value={category} onValueChange={v => { setCategory(v); setSubcategory('all') }}>
                    <SelectTrigger className="w-[140px] h-9">
                        <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        <SelectItem value="Products">Products</SelectItem>
                        <SelectItem value="People">People</SelectItem>
                        <SelectItem value="Services">Services</SelectItem>
                        <SelectItem value="AI">AI</SelectItem>
                        <SelectItem value="Finance">Finance</SelectItem>
                    </SelectContent>
                </Select>

                {subcategories.length > 0 && (
                    <Select value={subcategory} onValueChange={setSubcategory}>
                        <SelectTrigger className="w-[160px] h-9">
                            <SelectValue placeholder="Subcategory" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Subcategories</SelectItem>
                            {subcategories.map(sc => (
                                <SelectItem key={sc} value={sc}>{sc}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}

                <Select value={emailFilter} onValueChange={setEmailFilter}>
                    <SelectTrigger className="w-[130px] h-9">
                        <SelectValue placeholder="Email" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Emails</SelectItem>
                        <SelectItem value="has_email">Has Email</SelectItem>
                        <SelectItem value="no_email">No Email</SelectItem>
                    </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[150px] h-9">
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        {Object.entries(OUTREACH_STATUS_MAP).map(([key, { label }]) => (
                            <SelectItem key={key} value={key}>{label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Bulk actions */}
            {selectedIds.size > 0 && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                    <span className="text-sm font-medium text-foreground">
                        {selectedIds.size} selected
                    </span>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm">
                                Change Status
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                            {Object.entries(OUTREACH_STATUS_MAP).map(([key, { label }]) => (
                                <DropdownMenuItem key={key} onClick={() => handleBulkStatusUpdate(key)}>
                                    {label}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedIds(new Set())}
                    >
                        Clear
                    </Button>
                </div>
            )}

            {/* Table */}
            <div className="border border-border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-muted/50 border-b border-border">
                                <th className="px-3 py-2.5 text-left w-10">
                                    <Checkbox
                                        checked={listings.length > 0 && selectedIds.size === listings.length}
                                        onCheckedChange={toggleSelectAll}
                                        aria-label="Select all"
                                    />
                                </th>
                                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground min-w-[200px]">Company</th>
                                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground w-[80px]">Website</th>
                                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground min-w-[140px]">Contact Name</th>
                                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground min-w-[180px]">Email</th>
                                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground min-w-[130px]">Title</th>
                                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground min-w-[140px]">LinkedIn</th>
                                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground w-[100px]">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                Array.from({ length: 10 }).map((_, i) => (
                                    <tr key={i} className="border-b border-border">
                                        <td colSpan={8} className="px-3 py-3">
                                            <div className="h-5 bg-muted animate-pulse rounded" />
                                        </td>
                                    </tr>
                                ))
                            ) : listings.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-3 py-12 text-center text-sm text-muted-foreground">
                                        No listings found matching your filters
                                    </td>
                                </tr>
                            ) : (
                                listings.map(listing => {
                                    const websiteUrl = getWebsiteUrl(listing)
                                    const status = OUTREACH_STATUS_MAP[listing.outreach_status || 'not_started'] || OUTREACH_STATUS_MAP.not_started

                                    return (
                                        <tr
                                            key={listing.id}
                                            className={cn(
                                                'border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors',
                                                selectedIds.has(listing.id) && 'bg-muted/50'
                                            )}
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
                                                    <div className="flex items-center justify-center h-7 w-7 rounded bg-muted shrink-0">
                                                        <Building className="h-3.5 w-3.5 text-muted-foreground" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-medium text-foreground truncate" title={listing.title}>
                                                            {listing.title}
                                                        </p>
                                                        <p className="text-xs text-muted-foreground">
                                                            {listing.subcategory}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-3 py-2">
                                                {websiteUrl ? (
                                                    <a
                                                        href={websiteUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1 text-xs text-international-orange hover:underline"
                                                    >
                                                        <ExternalLink className="h-3 w-3" />
                                                        Visit
                                                    </a>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">—</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2">
                                                <InlineEditCell
                                                    value={listing.contact_name}
                                                    placeholder="Add name..."
                                                    onSave={val => handleContactUpdate(listing.id, 'contact_name', val)}
                                                />
                                            </td>
                                            <td className="px-3 py-2">
                                                <InlineEditCell
                                                    value={listing.contact_email}
                                                    placeholder="Add email..."
                                                    onSave={val => handleContactUpdate(listing.id, 'contact_email', val)}
                                                />
                                            </td>
                                            <td className="px-3 py-2">
                                                <InlineEditCell
                                                    value={listing.contact_title}
                                                    placeholder="Add title..."
                                                    onSave={val => handleContactUpdate(listing.id, 'contact_title', val)}
                                                />
                                            </td>
                                            <td className="px-3 py-2">
                                                <InlineEditCell
                                                    value={listing.contact_linkedin}
                                                    placeholder="Add LinkedIn..."
                                                    onSave={val => handleContactUpdate(listing.id, 'contact_linkedin', val)}
                                                />
                                            </td>
                                            <td className="px-3 py-2">
                                                <StatusBadge status={status.variant}>
                                                    {status.label}
                                                </StatusBadge>
                                            </td>
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                        Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}
                    </p>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => Math.max(0, p - 1))}
                            disabled={page === 0}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-sm text-muted-foreground">
                            Page {page + 1} of {totalPages}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                            disabled={page >= totalPages - 1}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}

            {/* Import dialog */}
            <ImportEnrichmentDialog
                open={isImportOpen}
                onOpenChange={setIsImportOpen}
                onImported={handleImportComplete}
            />
        </div>
    )
}
