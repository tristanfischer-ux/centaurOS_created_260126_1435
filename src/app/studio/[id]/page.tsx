import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getProjectById, signedBriefUrl } from '@/lib/dossier-pipeline/queries'
import {
  setProjectStatus,
  uploadDossier,
  saveInternalNotes,
  setNdaStatus,
  deleteProject,
} from '@/actions/dossier-projects'
import { STATUS_LABELS, type DossierStatus } from '@/lib/dossier-pipeline/types'

export const dynamic = 'force-dynamic'

/**
 * @file /studio/[id] — per-project admin actions (§6.5)
 *
 * @description Validate, set side states, download the brief (+attachments)
 * to run Anvil locally, upload the finished Dossier (auto-advances to ready
 * and emails the customer), and keep internal notes. Plain server-action
 * forms — no client JS needed.
 */

const NEXT_ACTIONS: Partial<Record<DossierStatus, { to: DossierStatus; label: string }[]>> = {
  submitted: [
    { to: 'validated', label: 'Validate' },
    { to: 'needs_info', label: 'Needs info' },
    { to: 'declined', label: 'Decline' },
  ],
  validated: [
    { to: 'needs_info', label: 'Needs info' },
    { to: 'on_hold', label: 'Put on hold' },
    { to: 'in_progress', label: 'Run Anvil myself (skip the auto-runner)' },
  ],
  in_progress: [
    { to: 'in_review', label: 'Mark ready for review (if you ran it yourself)' },
    { to: 'on_hold', label: 'Put on hold' },
  ],
  in_review: [{ to: 'on_hold', label: 'Put on hold' }],
  ready: [{ to: 'delivered', label: 'Mark delivered' }],
  needs_info: [
    { to: 'validated', label: 'Info received — validate' },
    { to: 'declined', label: 'Decline' },
  ],
  on_hold: [
    { to: 'validated', label: 'Resume → re-validate (runner picks up)' },
    { to: 'in_progress', label: 'Resume (skip runner)' },
    { to: 'declined', label: 'Decline' },
  ],
}

export default async function StudioProjectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const view = await getProjectById(id)
  if (!view) notFound()
  const { project, events, files, dossierDownloadUrl } = view

  const briefFiles = files.filter((f) => f.kind === 'brief_attachment')
  const briefUrls = await Promise.all(briefFiles.map((f) => signedBriefUrl(f)))
  const actions = NEXT_ACTIONS[project.status] ?? []

  // Plain-English "what happens now" per status, so the operator knows whether
  // to act or wait (the auto-runner owns the validated → in_review leg).
  const STATUS_HELP: Partial<Record<DossierStatus, string>> = {
    submitted: 'New brief. Read it, then Validate to send it to Anvil (or ask for more info / decline).',
    validated: 'Validated. The Anvil runner picks this up automatically within ~10 minutes, runs the first pass, and emails you when it’s ready to review — you don’t need to do anything. The buttons below are only for corrections or running Anvil yourself.',
    in_progress: 'Anvil is running (or you’re running it yourself). When it finishes it moves to engineering review automatically and emails you. Nothing to do unless you ran it manually.',
    in_review: 'First pass is done and waiting for your review. Check the staged DOSSIER.xlsx and Quotation.pdf in the queue review folder, then upload the final workbook in “Deliver the Dossier” below to send it to the customer.',
    ready: 'Delivered to the customer — they’ve been emailed their download link. Mark delivered once they’ve collected it.',
    needs_info: 'Waiting on the customer. They’ve been emailed your note; validate once they reply.',
    on_hold: 'Paused. Resume when you’re ready.',
  }
  const help = STATUS_HELP[project.status]

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/studio" className="text-sm text-muted-foreground hover:underline">
            ← Board
          </Link>
          <h1 className="mt-1 text-2xl font-bold">
            {project.customer_name}
            {project.company ? ` · ${project.company}` : ''}
          </h1>
          <p className="text-sm text-muted-foreground">
            {project.customer_email}
            {project.sector ? ` · ${project.sector}` : ''} · submitted{' '}
            {new Date(project.created_at).toLocaleString('en-GB')}
            {project.nda_requested ? ' · NDA REQUESTED' : ''}
          </p>
        </div>
        <span className="rounded-full bg-muted px-3 py-1.5 text-sm font-bold">
          {STATUS_LABELS[project.status]}
        </span>
      </div>

      {/* What happens now — orient the operator before the buttons */}
      {help && (
        <p className="rounded-xl border border-international-orange/30 bg-international-orange/5 px-4 py-3 text-sm text-foreground">
          {help}
        </p>
      )}

      {/* Transitions — each with an optional note that lands in the event trail
          and (for needs_info / on_hold / declined) in the customer email */}
      {actions.length > 0 && (
        <div className="space-y-2">
          {actions.map((a) => (
            <form key={a.to} action={setProjectStatus} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="to" value={a.to} />
              <button
                type="submit"
                className="rounded-full border border-foreground/20 px-4 py-2 text-sm font-semibold hover:bg-muted"
              >
                {a.label}
              </button>
              <input
                type="text"
                name="note"
                placeholder="Optional note (goes in the history; customer sees it on needs-info / hold / decline)"
                className="min-w-[280px] flex-1 rounded-lg border bg-muted/30 px-3 py-2 text-sm"
              />
            </form>
          ))}
        </div>
      )}

      {/* NDA flow */}
      {(project.nda_requested || project.nda_status) && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-5">
          <h2 className="mb-2 font-bold">NDA — {project.nda_status ?? 'requested'}</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            The customer asked for an NDA. Send it by email, then record it here — marking
            &lsquo;sent&rsquo; emails the customer a confirmation.
          </p>
          <div className="flex flex-wrap gap-3">
            {(['sent', 'signed'] as const).map((s) => (
              <form key={s} action={setNdaStatus}>
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="nda" value={s} />
                <button
                  type="submit"
                  disabled={project.nda_status === s}
                  className="rounded-full border border-foreground/20 px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-40"
                >
                  Mark NDA {s}
                </button>
              </form>
            ))}
          </div>
        </section>
      )}

      {/* The brief */}
      <section className="rounded-xl border p-5">
        <h2 className="mb-2 font-bold">Brief</h2>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{project.brief_text}</p>
        {briefFiles.length > 0 && (
          <ul className="mt-4 space-y-1 text-sm">
            {briefFiles.map((f, i) => (
              <li key={f.id}>
                {briefUrls[i] ? (
                  <a
                    href={briefUrls[i]!}
                    className="font-semibold text-international-orange hover:underline"
                  >
                    ↓ {f.original_name ?? f.storage_path}
                  </a>
                ) : (
                  <span className="text-muted-foreground">{f.original_name} (link failed)</span>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Customer status page:{' '}
          <a
            className="underline"
            href={`/project/${project.access_token}`}
            target="_blank"
            rel="noopener"
          >
            /project/{project.access_token.slice(0, 8)}…
          </a>
        </p>
      </section>

      {/* Upload the finished Dossier */}
      <section className="rounded-xl border p-5">
        <h2 className="mb-2 font-bold">Deliver the Dossier</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Upload the finished workbook — the project auto-advances to Ready and the customer is
          emailed their download link.
        </p>
        <form action={uploadDossier} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="projectId" value={project.id} />
          <input
            type="file"
            name="dossier"
            required
            className="text-sm file:mr-3 file:rounded-full file:border-0 file:bg-muted file:px-4 file:py-2 file:text-sm file:font-semibold"
          />
          <button
            type="submit"
            className="rounded-full bg-international-orange px-5 py-2 text-sm font-bold text-white hover:bg-international-orange-hover"
          >
            Upload → Ready
          </button>
        </form>
        {dossierDownloadUrl && (
          <p className="mt-3 text-sm">
            Current dossier:{' '}
            <a href={dossierDownloadUrl} className="font-semibold text-international-orange hover:underline">
              download ↓
            </a>
          </p>
        )}
      </section>

      {/* Internal notes */}
      <section className="rounded-xl border p-5">
        <h2 className="mb-2 font-bold">Internal notes</h2>
        <form action={saveInternalNotes} className="space-y-3">
          <input type="hidden" name="projectId" value={project.id} />
          <textarea
            name="notes"
            defaultValue={project.internal_notes ?? ''}
            rows={4}
            className="w-full rounded-lg border bg-muted/30 p-3 text-sm"
            placeholder="Only visible here."
          />
          <button
            type="submit"
            className="rounded-full border border-foreground/20 px-4 py-2 text-sm font-semibold hover:bg-muted"
          >
            Save notes
          </button>
        </form>
      </section>

      {/* Event trail */}
      <section className="rounded-xl border p-5">
        <h2 className="mb-3 font-bold">History</h2>
        <ul className="space-y-2 text-sm">
          {events.map((e) => (
            <li key={e.id} className="flex gap-3">
              <span className="w-40 shrink-0 text-muted-foreground">
                {new Date(e.created_at).toLocaleString('en-GB')}
              </span>
              <span>
                {e.from_status ? `${STATUS_LABELS[e.from_status]} → ` : ''}
                <b>{STATUS_LABELS[e.to_status]}</b>
                {e.note ? ` — ${e.note}` : ''}{' '}
                <span className="text-muted-foreground">({e.actor})</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Danger zone — GDPR erasure (council #6) */}
      <section className="rounded-xl border border-red-200 p-5">
        <h2 className="mb-2 font-bold text-red-700">Delete this project</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Permanently removes the brief, all attachments and the dossier from storage, plus the
          project row and its history. Use for erasure requests. This cannot be undone.
        </p>
        <form action={deleteProject}>
          <input type="hidden" name="projectId" value={project.id} />
          <button
            type="submit"
            className="rounded-full border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
          >
            Delete project and all data
          </button>
        </form>
      </section>
    </div>
  )
}
