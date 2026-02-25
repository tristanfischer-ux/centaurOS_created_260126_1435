'use client'

/**
 * @file import-enrichment-dialog.tsx — CSV paste import for enrichment data.
 *
 * @description Users export listings, research contacts externally, then paste
 * the enriched CSV back. Matches by company name (title) and updates contact fields.
 */

import { useState, useMemo, useTransition } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { bulkUpdateListingContacts } from '@/actions/listing-enrichment'
import { toast } from 'sonner'

interface ImportEnrichmentDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onImported: () => Promise<void>
}

// INTENT: Map common CSV header names to our enrichment fields
const HEADER_MAP: Record<string, string> = {
    'company name': 'title',
    'company': 'title',
    'title': 'title',
    'name': 'title',
    'contact name': 'contact_name',
    'contact_name': 'contact_name',
    'contact': 'contact_name',
    'full name': 'contact_name',
    'contact email': 'contact_email',
    'contact_email': 'contact_email',
    'email': 'contact_email',
    'email address': 'contact_email',
    'contact title': 'contact_title',
    'contact_title': 'contact_title',
    'job title': 'contact_title',
    'position': 'contact_title',
    'role': 'contact_title',
    'contact linkedin': 'contact_linkedin',
    'contact_linkedin': 'contact_linkedin',
    'linkedin': 'contact_linkedin',
    'linkedin url': 'contact_linkedin',
    'linkedin_url': 'contact_linkedin',
    'contact phone': 'contact_phone',
    'contact_phone': 'contact_phone',
    'phone': 'contact_phone',
    'phone number': 'contact_phone',
}

interface ParsedEnrichmentRow {
    title: string
    contact_name?: string
    contact_email?: string
    contact_title?: string
    contact_linkedin?: string
    contact_phone?: string
}

function parseCSV(text: string): { headers: string[]; rows: ParsedEnrichmentRow[]; errors: string[] } {
    const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length < 2) return { headers: [], rows: [], errors: ['Need at least a header row and one data row'] }

    const separator = lines[0].includes('\t') ? '\t' : ','

    const rawHeaders = lines[0].split(separator).map(h => h.trim().replace(/^["']|["']$/g, ''))
    const mappedHeaders = rawHeaders.map(h => HEADER_MAP[h.toLowerCase()] || null)

    const errors: string[] = []
    if (!mappedHeaders.includes('title')) {
        errors.push('Missing "Company Name" or "Company" column')
    }

    const hasAnyContact = mappedHeaders.some(h => h && h !== 'title')
    if (!hasAnyContact) {
        errors.push('Need at least one contact column (Email, Contact Name, LinkedIn, etc.)')
    }

    if (errors.length > 0) {
        return { headers: rawHeaders, rows: [], errors }
    }

    const rows: ParsedEnrichmentRow[] = []
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(separator).map(v => v.trim().replace(/^["']|["']$/g, ''))
        const row: Record<string, string> = {}

        for (let j = 0; j < mappedHeaders.length; j++) {
            const field = mappedHeaders[j]
            if (field && values[j]) {
                row[field] = values[j]
            }
        }

        if (row.title) {
            rows.push(row as unknown as ParsedEnrichmentRow)
        }
    }

    return { headers: rawHeaders, rows, errors: [] }
}

export function ImportEnrichmentDialog({ open, onOpenChange, onImported }: ImportEnrichmentDialogProps) {
    const [isPending, startTransition] = useTransition()
    const [rawText, setRawText] = useState('')
    const [step, setStep] = useState<'paste' | 'preview'>('paste')

    const parsed = useMemo(() => {
        if (!rawText.trim()) return null
        return parseCSV(rawText)
    }, [rawText])

    const handlePreview = () => {
        if (parsed && parsed.rows.length > 0 && parsed.errors.length === 0) {
            setStep('preview')
        }
    }

    const handleImport = () => {
        if (!parsed || parsed.rows.length === 0) return

        startTransition(async () => {
            const result = await bulkUpdateListingContacts(parsed.rows)
            if (result.error) {
                toast.error(result.error)
            } else {
                const { updated, notFound } = result.data!
                toast.success(`${updated} contacts updated`)
                if (notFound.length > 0) {
                    toast.warning(`${notFound.length} companies not found: ${notFound.slice(0, 3).join(', ')}${notFound.length > 3 ? '...' : ''}`)
                }
                setRawText('')
                setStep('paste')
                onOpenChange(false)
                await onImported()
            }
        })
    }

    const handleClose = (isOpen: boolean) => {
        if (!isOpen) {
            setRawText('')
            setStep('paste')
        }
        onOpenChange(isOpen)
    }

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent size="lg" aria-describedby={undefined}>
                <DialogHeader>
                    <DialogTitle>Import Enriched Contacts</DialogTitle>
                </DialogHeader>

                {step === 'paste' && (
                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Paste a CSV or TSV with enriched contact data. Must include a &quot;Company Name&quot; column to match, plus contact columns like &quot;Email&quot;, &quot;Contact Name&quot;, &quot;LinkedIn&quot;, etc.
                        </p>
                        <div className="space-y-2">
                            <Label htmlFor="enrichment-csv">CSV Data</Label>
                            <Textarea
                                id="enrichment-csv"
                                placeholder={`Company Name\tContact Name\tEmail\tJob Title\tLinkedIn\nAcme Manufacturing\tJane Smith\tjane@acme.com\tCEO\thttps://linkedin.com/in/janesmith`}
                                rows={10}
                                value={rawText}
                                onChange={e => setRawText(e.target.value)}
                                className="font-mono text-xs"
                                autoFocus
                            />
                        </div>

                        {parsed && parsed.errors.length > 0 && (
                            <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                                <div>
                                    {parsed.errors.map((err, i) => (
                                        <p key={i}>{err}</p>
                                    ))}
                                    <p className="mt-1 text-xs">
                                        Detected columns: {parsed.headers.join(', ')}
                                    </p>
                                </div>
                            </div>
                        )}

                        {parsed && parsed.rows.length > 0 && parsed.errors.length === 0 && (
                            <div className="flex items-center gap-2 text-sm text-success">
                                <CheckCircle2 className="h-4 w-4" />
                                {parsed.rows.length} rows detected with contact data
                            </div>
                        )}
                    </div>
                )}

                {step === 'preview' && parsed && (
                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Preview of {parsed.rows.length} contacts to update:
                        </p>
                        <div className="border border-border rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="bg-muted/50 border-b border-border">
                                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Company</th>
                                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Contact</th>
                                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Email</th>
                                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Title</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {parsed.rows.slice(0, 20).map((row, i) => (
                                        <tr key={i} className="border-b border-border last:border-b-0">
                                            <td className="px-3 py-2 text-foreground">{row.title}</td>
                                            <td className="px-3 py-2 text-foreground">{row.contact_name || '—'}</td>
                                            <td className="px-3 py-2 text-muted-foreground">{row.contact_email || '—'}</td>
                                            <td className="px-3 py-2 text-muted-foreground">{row.contact_title || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {parsed.rows.length > 20 && (
                            <p className="text-xs text-muted-foreground">
                                ...and {parsed.rows.length - 20} more
                            </p>
                        )}
                    </div>
                )}

                <DialogFooter>
                    {step === 'preview' && (
                        <Button variant="ghost" onClick={() => setStep('paste')} disabled={isPending}>
                            Back
                        </Button>
                    )}
                    <Button variant="outline" onClick={() => handleClose(false)} disabled={isPending}>
                        Cancel
                    </Button>
                    {step === 'paste' ? (
                        <Button
                            onClick={handlePreview}
                            disabled={!parsed || parsed.rows.length === 0 || parsed.errors.length > 0}
                        >
                            Preview ({parsed?.rows.length ?? 0})
                        </Button>
                    ) : (
                        <Button onClick={handleImport} disabled={isPending}>
                            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Update {parsed?.rows.length} Contacts
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
