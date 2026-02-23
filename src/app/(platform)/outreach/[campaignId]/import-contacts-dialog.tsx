'use client'

/**
 * @file import-contacts-dialog.tsx — CSV/TSV paste import for contacts.
 *
 * @description Key productivity feature: paste a LinkedIn Sales Nav export
 * into a textarea, auto-detect columns from header row, preview, and import.
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
import { Loader2, Upload, CheckCircle2, AlertCircle } from 'lucide-react'
import { importContacts } from '@/actions/outreach'
import { toast } from 'sonner'

interface ImportContactsDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    campaignId: string
    onImported: () => Promise<void>
}

// INTENT: Map common CSV header names to our contact fields
const HEADER_MAP: Record<string, string> = {
    'first name': 'first_name',
    'first_name': 'first_name',
    'firstname': 'first_name',
    'last name': 'last_name',
    'last_name': 'last_name',
    'lastname': 'last_name',
    'email': 'email',
    'email address': 'email',
    'company': 'company_name',
    'company name': 'company_name',
    'company_name': 'company_name',
    'organization': 'company_name',
    'title': 'job_title',
    'job title': 'job_title',
    'job_title': 'job_title',
    'position': 'job_title',
    'linkedin': 'linkedin_url',
    'linkedin url': 'linkedin_url',
    'linkedin_url': 'linkedin_url',
    'profile url': 'linkedin_url',
    'website': 'company_domain',
    'domain': 'company_domain',
    'company domain': 'company_domain',
    'industry': 'industry',
    'company size': 'company_size',
    'company_size': 'company_size',
    'employees': 'company_size',
    '# employees': 'company_size',
}

interface ParsedRow {
    first_name: string
    last_name?: string
    email?: string
    company_name: string
    job_title?: string
    linkedin_url?: string
    company_domain?: string
    industry?: string
    company_size?: string
}

function parseCSV(text: string): { headers: string[]; rows: ParsedRow[]; errors: string[] } {
    const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length < 2) return { headers: [], rows: [], errors: ['Need at least a header row and one data row'] }

    // Detect separator (tab or comma)
    const separator = lines[0].includes('\t') ? '\t' : ','

    const rawHeaders = lines[0].split(separator).map(h => h.trim().replace(/^["']|["']$/g, ''))
    const mappedHeaders = rawHeaders.map(h => HEADER_MAP[h.toLowerCase()] || null)

    // Check for required columns
    const errors: string[] = []
    const hasFirstName = mappedHeaders.includes('first_name')
    const hasCompany = mappedHeaders.includes('company_name')

    if (!hasFirstName) errors.push('Missing "First Name" column')
    if (!hasCompany) errors.push('Missing "Company" or "Company Name" column')

    if (errors.length > 0) {
        return { headers: rawHeaders, rows: [], errors }
    }

    const rows: ParsedRow[] = []
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(separator).map(v => v.trim().replace(/^["']|["']$/g, ''))
        const row: Record<string, string> = {}

        for (let j = 0; j < mappedHeaders.length; j++) {
            const field = mappedHeaders[j]
            if (field && values[j]) {
                row[field] = values[j]
            }
        }

        if (row.first_name && row.company_name) {
            rows.push(row as unknown as ParsedRow)
        }
    }

    return { headers: rawHeaders, rows, errors: [] }
}

export function ImportContactsDialog({ open, onOpenChange, campaignId, onImported }: ImportContactsDialogProps) {
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
            const result = await importContacts(campaignId, parsed.rows)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success(`${result.data?.imported} contacts imported`)
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
                    <DialogTitle>Import Contacts</DialogTitle>
                </DialogHeader>

                {step === 'paste' && (
                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Paste a CSV or TSV (e.g., from LinkedIn Sales Navigator). Include a header row with column names like &quot;First Name&quot;, &quot;Company&quot;, &quot;Email&quot;, &quot;Title&quot;, etc.
                        </p>
                        <div className="space-y-2">
                            <Label htmlFor="csv-paste">CSV Data</Label>
                            <Textarea
                                id="csv-paste"
                                placeholder={`First Name\tLast Name\tCompany\tTitle\tEmail\nJane\tSmith\tAcme Corp\tVP Engineering\tjane@acme.com`}
                                rows={10}
                                value={rawText}
                                onChange={(e) => setRawText(e.target.value)}
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
                                {parsed.rows.length} contacts detected
                            </div>
                        )}
                    </div>
                )}

                {step === 'preview' && parsed && (
                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Preview of {parsed.rows.length} contacts to import:
                        </p>
                        <div className="border border-border rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="bg-muted/50 border-b border-border">
                                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Name</th>
                                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Company</th>
                                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Title</th>
                                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Email</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {parsed.rows.slice(0, 20).map((row, i) => (
                                        <tr key={i} className="border-b border-border last:border-b-0">
                                            <td className="px-3 py-2 text-foreground">{row.first_name} {row.last_name || ''}</td>
                                            <td className="px-3 py-2 text-foreground">{row.company_name}</td>
                                            <td className="px-3 py-2 text-muted-foreground">{row.job_title || '-'}</td>
                                            <td className="px-3 py-2 text-muted-foreground">{row.email || '-'}</td>
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
                            Import {parsed?.rows.length} Contacts
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
