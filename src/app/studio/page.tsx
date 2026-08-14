import Link from 'next/link'
import { listProjects } from '@/lib/dossier-pipeline/queries'
import { STATUS_LABELS, PIPELINE_ORDER, type DossierStatus } from '@/lib/dossier-pipeline/types'

/**
 * @file /studio board — all pipeline projects, newest first (§6.5)
 */

const STATUS_BADGE: Record<DossierStatus, string> = {
  submitted: 'bg-blue-100 text-blue-800',
  validated: 'bg-indigo-100 text-indigo-800',
  in_progress: 'bg-amber-100 text-amber-800',
  in_review: 'bg-purple-100 text-purple-800',
  ready: 'bg-green-100 text-green-800',
  delivered: 'bg-emerald-100 text-emerald-800',
  needs_info: 'bg-orange-100 text-orange-800',
  on_hold: 'bg-slate-200 text-slate-700',
  declined: 'bg-red-100 text-red-800',
}

export default async function StudioBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status: filter } = await searchParams
  const all = await listProjects()
  const projects = filter ? all.filter((p) => p.status === filter) : all

  const counts = new Map<string, number>()
  for (const p of all) counts.set(p.status, (counts.get(p.status) ?? 0) + 1)

  const filterStatuses: DossierStatus[] = [
    ...PIPELINE_ORDER,
    'needs_info',
    'on_hold',
    'declined',
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/studio"
          className={`rounded-full px-3 py-1 text-sm font-semibold ${
            !filter ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'
          }`}
        >
          All ({all.length})
        </Link>
        {filterStatuses.map((s) => (
          <Link
            key={s}
            href={`/studio?status=${s}`}
            className={`rounded-full px-3 py-1 text-sm font-semibold ${
              filter === s ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'
            }`}
          >
            {STATUS_LABELS[s]} ({counts.get(s) ?? 0})
          </Link>
        ))}
      </div>

      {projects.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">
          No projects{filter ? ` in ${STATUS_LABELS[filter as DossierStatus] ?? filter}` : ' yet'}.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Company / sector</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">NDA</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="border-t hover:bg-muted/30">
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {new Date(p.created_at).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-semibold">{p.customer_name}</span>
                    <br />
                    <span className="text-xs text-muted-foreground">{p.customer_email}</span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {[p.company, p.sector].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_BADGE[p.status]}`}
                    >
                      {STATUS_LABELS[p.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">{p.nda_requested ? 'Yes' : '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/studio/${p.id}`}
                      className="font-semibold text-international-orange hover:underline"
                    >
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
