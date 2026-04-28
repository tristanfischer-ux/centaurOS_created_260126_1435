'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { confirmPlanCsvImport, parsePlanCsv, type PlanCsvParseResult } from '@/actions/money-plan'
import { toast } from 'sonner'

const SAMPLE_CSV = `name,direction,category,amount,frequency,effective_from,probability_pct,notes
Senior engineer salary,out,people,5500,monthly,2026-04-01,,Includes NI + pension
AWS hosting,out,tools,180,monthly,2026-04-01,,
Pilot revenue — ACME,in,revenue,12000,monthly,2026-05-01,70,Pending sign-off`

export function ImportPlanView() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [csvText, setCsvText] = useState('')
  const [preview, setPreview] = useState<PlanCsvParseResult | null>(null)

  const onParse = () => {
    if (!csvText.trim()) {
      toast.error('Paste CSV content first')
      return
    }
    startTransition(async () => {
      const result = await parsePlanCsv(csvText)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      setPreview(result)
      toast.success(`Parsed ${result.rows.length} rows (${result.validCount} valid, ${result.errorCount} errors)`)
    })
  }

  const onImport = () => {
    if (!preview) return
    const validRows = preview.rows
      .map((r) => r.values)
      .filter((v): v is NonNullable<typeof v> => v !== null)
    if (validRows.length === 0) {
      toast.error('No valid rows to import')
      return
    }
    startTransition(async () => {
      const result = await confirmPlanCsvImport(validRows)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success(`Imported ${result.inserted} lines`)
      router.push('/money/plan')
    })
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Import CSV</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Paste CSV with columns: name, direction, category, amount, frequency, effective_from, probability_pct (optional), notes (optional).
          </p>
        </div>
        <Link href="/money/plan">
          <Button variant="secondary" size="sm">Back to plan</Button>
        </Link>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">CSV input</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="csv">Paste your CSV</Label>
            <Textarea
              id="csv"
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              disabled={pending}
              rows={10}
              className="font-mono text-xs"
              placeholder={SAMPLE_CSV}
            />
            <p className="text-xs text-muted-foreground">
              direction: <code>out</code> or <code>in</code> · category: people / premises / tools / materials / growth / other / revenue / grants / equity / loans · frequency: one_off / weekly / monthly / quarterly / annual / variable
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setCsvText(SAMPLE_CSV)} disabled={pending}>
              Load sample
            </Button>
            <Button onClick={onParse} disabled={pending}>
              {pending ? 'Parsing...' : 'Parse CSV'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              Preview
              <Badge variant="success">{preview.validCount} valid</Badge>
              {preview.errorCount > 0 && (
                <Badge variant="destructive">{preview.errorCount} errors</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-2">#</th>
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Direction</th>
                    <th className="py-2 pr-4">Category</th>
                    <th className="py-2 pr-4 text-right">Amount</th>
                    <th className="py-2 pr-4">Frequency</th>
                    <th className="py-2 pr-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.rowNumber} className="border-b border-border/50">
                      <td className="py-1.5 pr-2 text-muted-foreground">{r.rowNumber}</td>
                      <td className="py-1.5 pr-4">{r.values?.name ?? '—'}</td>
                      <td className="py-1.5 pr-4">{r.values?.direction ?? '—'}</td>
                      <td className="py-1.5 pr-4">{r.values?.category ?? '—'}</td>
                      <td className="py-1.5 pr-4 text-right tabular-nums">
                        {r.values ? `£${(r.values.amount_cents / 100).toFixed(2)}` : '—'}
                      </td>
                      <td className="py-1.5 pr-4">{r.values?.frequency ?? '—'}</td>
                      <td className="py-1.5 pr-2">
                        {r.errors.length === 0 ? (
                          <Badge variant="success" size="sm">OK</Badge>
                        ) : (
                          <span className="text-destructive">{r.errors.join('; ')}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {preview.validCount > 0 && (
              <div className="flex justify-end pt-4">
                <Button onClick={onImport} disabled={pending}>
                  {pending ? 'Importing...' : `Import ${preview.validCount} lines`}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
