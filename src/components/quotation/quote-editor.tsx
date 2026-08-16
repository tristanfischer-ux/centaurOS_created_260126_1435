'use client'

import { useMemo, useState, useTransition } from 'react'
import { saveCustomerQuote } from '@/actions/quotation'

type QuoteSource = {
  schema?: string
  quote?: {
    number?: string
    revision?: string
    date?: string
    valid_until?: string
    customer?: string
    project?: string
    incoterm?: string
    estimate_class?: string
    currency?: string
  }
  issuer?: { name?: string; email?: string; web?: string; sign?: string }
  totals?: {
    bom_ledger_gbp?: number
    civils_excluded_gbp?: number
    supply_ex_works_gbp?: number
    checksum?: string
  }
  engine_totals?: { supply_ex_works_gbp?: number }
  price_groups?: Array<{
    letter?: string
    title?: string
    n_lines?: number
    line_gbp?: number
    principal_names?: string[]
  }>
  exclusions_commercial?: string[]
  notes_for_renderer?: Record<string, unknown>
}

function gbp(n: unknown): string {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return `£${v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function QuoteEditor({
  token,
  initial,
  docxUrl,
}: {
  token: string
  initial: QuoteSource
  docxUrl: string | null
}) {
  const [source, setSource] = useState<QuoteSource>(initial)
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const q = source.quote ?? {}
  const totals = source.totals ?? {}
  const engineSupply = source.engine_totals?.supply_ex_works_gbp ?? totals.supply_ex_works_gbp
  const groups = source.price_groups ?? []

  const frozen = useMemo(() => Number(engineSupply), [engineSupply])

  function patchQuote(partial: Partial<NonNullable<QuoteSource['quote']>>) {
    setSource((s) => ({ ...s, quote: { ...(s.quote ?? {}), ...partial } }))
  }

  function printPdf() {
    window.print()
  }

  function save() {
    setMsg(null)
    const payload: QuoteSource = {
      ...source,
      engine_totals: { supply_ex_works_gbp: frozen },
    }
    const fd = new FormData()
    fd.set('token', token)
    fd.set('source', JSON.stringify(payload))
    start(async () => {
      try {
        await saveCustomerQuote(fd)
        setMsg('Saved. Download PDF from the print dialog, or Word below.')
      } catch (err) {
        setMsg(err instanceof Error ? err.message : 'Save failed')
      }
    })
  }

  return (
    <section className="rounded-xl border border-international-orange/40 bg-white p-6 space-y-5 print:border-0 print:p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-international-orange">
            Quotation
          </p>
          <h2 className="text-xl font-bold">Edit on the web, then download as PDF</h2>
          <p className="text-sm text-muted-foreground">
            Change the commercial wording. The engine first-pass figure stays on record
            ({gbp(frozen)}). Saving bumps the revision.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-full bg-international-orange px-4 py-2 text-sm font-bold text-white hover:bg-international-orange-hover disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={printPdf}
            className="rounded-full border border-foreground/20 px-4 py-2 text-sm font-semibold hover:bg-muted"
          >
            Download PDF
          </button>
          {docxUrl && (
            <a
              href={docxUrl}
              className="rounded-full border border-foreground/20 px-4 py-2 text-sm font-semibold hover:bg-muted"
            >
              Download Word
            </a>
          )}
        </div>
      </div>
      {msg && <p className="text-sm print:hidden">{msg}</p>}

      <article id="anvil-quote" className="space-y-4 text-foreground">
        <p className="text-xs font-mono uppercase tracking-widest text-international-orange">
          Quotation · {q.number} · Rev {q.revision || 'A'}
        </p>
        <h3 className="text-2xl font-bold">{q.project || 'Project'}</h3>
        <label className="block text-sm">
          <span className="text-muted-foreground">Customer</span>
          <input
            className="mt-1 w-full rounded-lg border bg-background px-3 py-2"
            value={q.customer ?? ''}
            onChange={(e) => patchQuote({ customer: e.target.value })}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-muted-foreground">Valid until</span>
            <input
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2"
              value={q.valid_until ?? ''}
              onChange={(e) => patchQuote({ valid_until: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted-foreground">Incoterm</span>
            <input
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2"
              value={q.incoterm ?? ''}
              onChange={(e) => patchQuote({ incoterm: e.target.value })}
            />
          </label>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Supply (ex-works)</p>
          <p className="text-4xl font-bold">{gbp(totals.supply_ex_works_gbp)}</p>
          <p className="text-xs text-muted-foreground">
            Engine first-pass {gbp(frozen)} · {totals.checksum || 'ledger Σ, civils excluded'}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-2"> </th>
                <th className="py-2 pr-2">Group</th>
                <th className="py-2 pr-2">Lines</th>
                <th className="py-2 text-right">Supply</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g, i) => (
                <tr key={`${g.letter}-${i}`} className="border-b border-muted">
                  <td className="py-2 pr-2 font-mono">{g.letter}</td>
                  <td className="py-2 pr-2">
                    <div>{g.title}</div>
                    {g.principal_names && g.principal_names.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        {g.principal_names.join(', ')}
                      </div>
                    )}
                  </td>
                  <td className="py-2 pr-2">{g.n_lines}</td>
                  <td className="py-2 text-right">{gbp(g.line_gbp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <p className="font-semibold">Exclusions</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
            {(source.exclusions_commercial ?? []).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      </article>
    </section>
  )
}
