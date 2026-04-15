'use client'

import { useState, useTransition, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Download } from 'lucide-react'
import { toast } from 'sonner'
import { parseImportFile, commitImport, type ImportKind, type ImportParseResult } from '@/actions/cash-burn-import'

interface ImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: ImportKind
  onImported?: () => void
}

export function ImportDialog({ open, onOpenChange, kind, onImported }: ImportDialogProps) {
  const [parsed, setParsed] = useState<ImportParseResult | null>(null)
  const [pending, startTransition] = useTransition()
  const [committing, startCommit] = useTransition()
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const title = kind === 'out' ? 'Import costs from spreadsheet' : 'Import cash-in from spreadsheet'

  const reset = () => {
    setParsed(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleClose = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const handleFile = (file: File) => {
    startTransition(async () => {
      const fd = new FormData()
      fd.set('file', file)
      fd.set('kind', kind)
      const res = await parseImportFile(fd)
      if (res.error || !res.data) {
        toast.error(res.error ?? 'Failed to parse file')
        return
      }
      setParsed(res.data)
    })
  }

  const handleCommit = () => {
    if (!parsed) return
    const validRows = parsed.rows
      .filter(r => r.errors.length === 0)
      .map(r => r.values)
    if (validRows.length === 0) {
      toast.error('No valid rows to import — fix the errors and try again.')
      return
    }
    startCommit(async () => {
      try {
        const res = await commitImport(kind, validRows)
        if (res.error || !res.data) {
          toast.error(res.error ?? 'Import failed')
          return
        }
        toast.success(`Imported ${res.data.inserted} row${res.data.inserted === 1 ? '' : 's'}.`)
        reset()
        onOpenChange(false)
        onImported?.()
      } catch (err) {
        toast.error(`Import failed: ${err instanceof Error ? err.message : String(err)}`)
      }
    })
  }

  const headers = kind === 'out'
    ? ['Row', 'Name', 'Category', 'Type', 'Amount', 'Frequency', 'From', 'Notes']
    : ['Row', 'Name', 'Source', 'Amount', 'Frequency', 'From', 'Probability %', 'Notes']

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {!parsed && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload a CSV or Excel file. The header row must match the template columns.
            </p>

            <div className="flex items-center gap-3">
              <Button asChild variant="secondary" size="sm">
                <a href={`/api/cash-burn/import-template?kind=${kind}`} download>
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Download template
                </a>
              </Button>
              <span className="text-xs text-muted-foreground">
                CSV or XLSX, up to 2 MB, max 1,000 rows
              </span>
            </div>

            <label
              htmlFor="cash-burn-import-file"
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                const f = e.dataTransfer.files?.[0]
                if (f) handleFile(f)
              }}
              className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-10 cursor-pointer transition-colors ${
                dragOver ? 'border-international-orange bg-international-orange/5' : 'border-border hover:border-international-orange/50'
              }`}
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <div className="text-sm font-medium text-foreground">
                {pending ? 'Parsing file…' : 'Drop your file here or click to browse'}
              </div>
              <div className="text-xs text-muted-foreground">.csv or .xlsx</div>
              <input
                id="cash-burn-import-file"
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                disabled={pending}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleFile(f)
                }}
              />
            </label>
          </div>
        )}

        {parsed && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/30">
              <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1.5 text-success">
                  <CheckCircle2 className="h-4 w-4" />
                  {parsed.validCount} valid
                </span>
                {parsed.errorCount > 0 && (
                  <span className="flex items-center gap-1.5 text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    {parsed.errorCount} with errors
                  </span>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={reset} className="ml-auto">
                Choose a different file
              </Button>
            </div>

            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 border-b">
                  <tr>
                    {headers.map(h => (
                      <th key={h} className="text-left font-medium text-muted-foreground px-2 py-2">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 100).map((row) => {
                    const hasError = row.errors.length > 0
                    const v = row.values
                    return (
                      <tr
                        key={row.rowNumber}
                        className={`border-b last:border-b-0 ${hasError ? 'bg-destructive/5' : ''}`}
                        title={hasError ? row.errors.join('; ') : ''}
                      >
                        <td className="px-2 py-1.5 text-muted-foreground tabular-nums">{row.rowNumber}</td>
                        <td className="px-2 py-1.5">{String(v.name ?? '')}</td>
                        {kind === 'out' ? (
                          <>
                            <td className="px-2 py-1.5">{String(v.category ?? '')}</td>
                            <td className="px-2 py-1.5">{String(v.cost_type ?? '')}</td>
                          </>
                        ) : (
                          <td className="px-2 py-1.5">{String(v.source_type ?? '')}</td>
                        )}
                        <td className="px-2 py-1.5 tabular-nums">{v.amount != null ? String(v.amount) : ''}</td>
                        <td className="px-2 py-1.5">{String(v.frequency ?? '')}</td>
                        <td className="px-2 py-1.5">{String(v.effective_from ?? '')}</td>
                        {kind === 'in' && (
                          <td className="px-2 py-1.5 tabular-nums">
                            {v.probability_pct != null ? String(v.probability_pct) : ''}
                          </td>
                        )}
                        <td className="px-2 py-1.5 text-muted-foreground">
                          {hasError ? row.errors[0] : String(v.notes ?? '')}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {parsed.rows.length > 100 && (
                <div className="text-xs text-muted-foreground text-center py-2 border-t">
                  Showing first 100 of {parsed.rows.length} rows
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={() => handleClose(false)} disabled={committing}>
            Cancel
          </Button>
          {parsed && (
            <Button
              onClick={handleCommit}
              disabled={committing || parsed.validCount === 0}
            >
              {committing ? 'Importing…' : `Import ${parsed.validCount} row${parsed.validCount === 1 ? '' : 's'}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
